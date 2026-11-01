import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import gameRegistry from './gameRegistry'
import { submitScore } from '../../services/arcadeApi'
import { fetchActiveAdvertisement } from '../../services/advertisementApi'
import useAppStore from '../../hooks/useAppStore'

// --- Offline score queue (localStorage) ---
const QUEUE_KEY = 'attend75.arcade.scoreQueue'

function getScoreQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch { return [] }
}

function saveToQueue(gameSlug, score) {
  try {
    const queue = getScoreQueue()
    queue.push({ gameSlug, score, timestamp: Date.now() })
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch { /* ignore storage errors */ }
}

function clearQueue() {
  try { localStorage.removeItem(QUEUE_KEY) } catch { /* ignore */ }
}

async function flushQueue(token) {
  if (!token) return
  const queue = getScoreQueue()
  if (!queue.length) return

  const remaining = []
  for (const item of queue) {
    try {
      await submitScore(token, item.gameSlug, item.score)
    } catch {
      remaining.push(item)
    }
  }

  if (remaining.length) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining)) } catch { /* ignore */ }
  } else {
    clearQueue()
  }
}

/**
 * GameLayout — shared wrapper for all arcade games.
 *
 * Provides: back navigation, game title, live score display,
 * game-over overlay with score submission, and leaderboard access.
 *
 * Props:
 *  - gameSlug (string): identifier from gameRegistry
 *  - children: a render function (props) => ReactElement | ReactElement
 */
function GameLayout({ gameSlug, children }) {
  const navigate = useNavigate()
  const { state } = useAppStore()
  const token = state.session.token

  const game = gameRegistry[gameSlug]
  const gameTitle = game?.title ?? 'Game'

  // --- State ---
  const [currentScore, setCurrentScore] = useState(0)
  const [currentCoins, setCurrentCoins] = useState(0)
  const [isGameOver, setIsGameOver] = useState(false)
  const [submissionResult, setSubmissionResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Ad state
  const [gameOverAd, setGameOverAd] = useState(null)
  const [adLoaded, setAdLoaded] = useState(false)
  const [showAdModal, setShowAdModal] = useState(false)
  const [adCountdown, setAdCountdown] = useState(7)
  const [adWatched, setAdWatched] = useState(false)
  const [resumeScore, setResumeScore] = useState(0)
  // Whether the ad has already been used in this 24-hour window for this game
  const [adAlreadyUsed, setAdAlreadyUsed] = useState(() => {
    try {
      const ts = localStorage.getItem(`attend75.adUsed.${gameSlug}`)
      if (!ts) return false
      return Date.now() - Number(ts) < 24 * 60 * 60 * 1000
    } catch { return false }
  })
  const adCountdownRef = useRef(null)
  const videoRef = useRef(null)

  // Track whether we've already submitted for the current session
  const hasSubmittedRef = useRef(false)

  // --- Callbacks ---
  const handleScoreUpdate = useCallback((score, coins = 0) => {
    setCurrentScore(score)
    setCurrentCoins(coins)
  }, [])

  const handleGameEnd = useCallback(async (finalScore, finalCoins = 0) => {
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true

    setCurrentScore(finalScore)
    setCurrentCoins(finalCoins)
    setIsGameOver(true)

    // Don't attempt score submission for zero or invalid scores
    if (!finalScore || finalScore <= 0) {
      setIsSubmitting(false)
      return
    }

    // Don't attempt score submission if not authenticated
    if (!token) {
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(true)

    try {
      const result = await submitScore(token, gameSlug, finalScore)
      setSubmissionResult(result)
    } catch (err) {
      // On 401: session expired — queue for retry once the user logs back in.
      if (err.status === 401) {
        saveToQueue(gameSlug, finalScore)
        setSubmissionResult(null)
        setIsSubmitting(false)
        return
      }

      // 422 = validation error (score rejected by server rules) — queuing is pointless,
      // it will be rejected again on retry. Just silently drop it and show nothing.
      if (err.status === 422) {
        setSubmissionResult(null)
        setIsSubmitting(false)
        return
      }

      // Network/server error — queue for offline retry so the score is not lost.
      saveToQueue(gameSlug, finalScore)
      setSubmissionResult(null)
    } finally {
      setIsSubmitting(false)
    }
  }, [token, gameSlug])

  const handleRestart = useCallback((startScore = 0) => {
    const score = typeof startScore === 'number' ? startScore : 0
    setCurrentScore(score)
    setCurrentCoins(0)
    setIsGameOver(false)
    setSubmissionResult(null)
    setIsSubmitting(false)
    setAdWatched(false)
    setResumeScore(score)
    hasSubmittedRef.current = false
  }, [])

  const handleViewLeaderboard = useCallback(() => {
    navigate(`/app/arcade/${gameSlug}?view=leaderboard`)
  }, [navigate, gameSlug])

  // Fetch game-over ad once on mount
  useEffect(() => {
    fetchActiveAdvertisement('arcade_game_over').then(ad => {
      setGameOverAd(ad)
      setAdLoaded(true)
    })
  }, [])

  // Countdown timer while ad modal is open
  useEffect(() => {
    if (!showAdModal) return
    setAdCountdown(7)
    adCountdownRef.current = setInterval(() => {
      setAdCountdown(prev => {
        if (prev <= 1) {
          clearInterval(adCountdownRef.current)
          setAdWatched(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(adCountdownRef.current)
  }, [showAdModal])

  const handleWatchAd = useCallback(() => {
    setResumeScore(currentScore)
    setShowAdModal(true)
    setAdCountdown(7)
    setAdWatched(false)
  }, [currentScore])

  const handleAdClose = useCallback(() => {
    clearInterval(adCountdownRef.current)
    setShowAdModal(false)
    if (adWatched) {
      // Stamp usage so the button is hidden for 24h
      try { localStorage.setItem(`attend75.adUsed.${gameSlug}`, String(Date.now())) } catch {}
      setAdAlreadyUsed(true)
      handleRestart(resumeScore)
    }
  }, [adWatched, handleRestart, resumeScore, gameSlug])

  // Flush any offline-queued scores on mount
  useEffect(() => {
    flushQueue(token)
  }, [token])

  // --- Render ---
  return (
    <div
      className="fixed inset-x-0 flex flex-col bg-gradient-to-b from-[#0a0e1a] to-[#1a1d3a]"
      style={{
        top: 0,
        bottom: 0,
        zIndex: 10,
      }}
    >
      {/* Top Stats Bar - Rounded Container */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 bg-[#1e2139] rounded-2xl px-5 py-4 border border-[#2d3152]">
          {/* Score */}
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Score</span>
            <span className="text-2xl font-black text-[#fbbf24]">{currentScore}</span>
          </div>
          
          {/* Best */}
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Best</span>
            <span className="text-2xl font-black text-white">{submissionResult?.personal_best || 0}</span>
          </div>
          
          {/* Level */}
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Level</span>
            <span className="text-2xl font-black text-white">1</span>
          </div>
          
          {/* Control Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/app/arcade')}
              className="w-10 h-10 rounded-xl bg-[#2d3152] border border-[#3d4162] flex items-center justify-center text-white/70 hover:text-white hover:bg-[#3d4162] transition active:scale-95"
              aria-label="Back to Arcade"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              type="button"
              className="w-10 h-10 rounded-xl bg-[#2d3152] border border-[#3d4162] flex items-center justify-center text-white/70 hover:text-white hover:bg-[#3d4162] transition active:scale-95"
              aria-label="Pause"
            >
              <span className="text-lg">❚❚</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lives & Power Bar */}
      <div className="shrink-0 flex items-center justify-between px-6 pb-3">
        {/* Lives - Pac-Man icons */}
        <div className="flex gap-2">
          <span className="text-2xl">🟡</span>
          <span className="text-2xl">🟡</span>
          <span className="text-2xl">🟡</span>
        </div>
        
        {/* Power Bar */}
        <div className="flex items-center gap-2">
          <div className="w-48 h-2 bg-[#1e2139] rounded-full overflow-hidden border border-[#2d3152]">
            <div className="h-full bg-gradient-to-r from-[#60a5fa] to-[#3b82f6] w-0 transition-all duration-300" />
          </div>
          <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Power</span>
        </div>
      </div>

      {/* Game canvas area */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 pb-4">
        <div
          className="relative w-full rounded-2xl overflow-hidden border-2 border-[#3b82f6]/30 shadow-2xl shadow-[#3b82f6]/10"
          style={{ aspectRatio: '1/1', maxHeight: '100%' }}
        >
          {typeof children === 'function'
            ? children({
                onGameEnd: handleGameEnd,
                onScoreUpdate: handleScoreUpdate,
                onRestart: handleRestart,
                isActive: !isGameOver,
                initialScore: resumeScore,
              })
            : children}

          {/* Game-over overlay */}
          {isGameOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-md">
              <div className="flex w-[88%] max-w-sm flex-col items-center gap-4 rounded-2xl bg-[#1e2139] border border-[#2d3152] p-6 shadow-xl">
                <h2 className="text-3xl font-black text-[#fbbf24] uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Game Over</h2>

                <p className="text-sm text-[#9ca3af]">Score {currentScore}. Best {submissionResult?.personal_best || 0}.</p>

                {currentCoins > 0 && (
                  <div className="flex items-center gap-2 rounded-full bg-[#ffd700]/15 px-4 py-1.5">
                    <span className="text-base leading-none">🪙</span>
                    <span className="text-sm font-bold text-[#ffd700]">
                      {currentCoins} coin{currentCoins !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {isSubmitting && (
                  <p className="text-sm text-[#9ca3af]">Saving score…</p>
                )}

                {submissionResult && (
                  <div className="flex w-full flex-col gap-1 rounded-xl bg-[#2d3152] px-4 py-3 text-center border border-[#3d4162]">
                    <p className="text-sm text-[#9ca3af]">
                      Rank: <span className="font-bold text-[#4EF0A0]">#{submissionResult.rank}</span>
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleRestart(0)}
                  className="w-full rounded-xl bg-[#fbbf24] py-3 text-base font-black text-black transition active:scale-[0.97] uppercase tracking-wide"
                  style={{ fontFamily: 'monospace' }}
                >
                  Play again
                </button>

                <button
                  type="button"
                  onClick={handleViewLeaderboard}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#3d4162] bg-[#2d3152] py-3 text-sm font-semibold text-white transition hover:bg-[#3d4162] active:scale-[0.97]"
                >
                  <Trophy size={16} />
                  Leaderboard
                </button>

                {adLoaded && gameOverAd && !adWatched && !adAlreadyUsed && (
                  <button
                    type="button"
                    onClick={handleWatchAd}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-[#A78BFA]/40 bg-[#A78BFA]/10 py-2.5 text-xs font-semibold text-[#A78BFA] transition hover:bg-[#A78BFA]/20 active:scale-[0.97]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    Watch ad to continue
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arrow Pad Controls */}
      <div className="shrink-0 flex flex-col items-center gap-2 pb-safe pb-6">
        {/* Up */}
        <button
          type="button"
          className="w-14 h-14 rounded-xl bg-[#2d3152] border border-[#3d4162] flex items-center justify-center text-white/90 hover:bg-[#3d4162] hover:text-white transition active:scale-95 active:bg-[#4d5172]"
          aria-label="Up"
        >
          <span className="text-2xl">▲</span>
        </button>
        
        {/* Left, Down, Right */}
        <div className="flex gap-2">
          <button
            type="button"
            className="w-14 h-14 rounded-xl bg-[#2d3152] border border-[#3d4162] flex items-center justify-center text-white/90 hover:bg-[#3d4162] hover:text-white transition active:scale-95 active:bg-[#4d5172]"
            aria-label="Left"
          >
            <span className="text-2xl">◀</span>
          </button>
          <button
            type="button"
            className="w-14 h-14 rounded-xl bg-[#2d3152] border border-[#3d4162] flex items-center justify-center text-white/90 hover:bg-[#3d4162] hover:text-white transition active:scale-95 active:bg-[#4d5172]"
            aria-label="Down"
          >
            <span className="text-2xl">▼</span>
          </button>
          <button
            type="button"
            className="w-14 h-14 rounded-xl bg-[#2d3152] border border-[#3d4162] flex items-center justify-center text-white/90 hover:bg-[#3d4162] hover:text-white transition active:scale-95 active:bg-[#4d5172]"
            aria-label="Right"
          >
            <span className="text-2xl">▶</span>
          </button>
        </div>
      </div>

      {/* Ad modal — full-screen overlay shown when student clicks "Watch ad" */}
      {showAdModal && gameOverAd && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95">
          {/* Countdown + skip area */}
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {adWatched ? (
              <button
                type="button"
                onClick={handleAdClose}
                className="rounded-full bg-[#4EF0A0] px-4 py-1.5 text-[11px] font-bold text-[#0f2018] transition active:scale-95"
              >
                ✓ Continue
              </button>
            ) : (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/70">
                {adCountdown}s
              </span>
            )}
          </div>

          {/* Ad media */}
          <div className="flex w-full max-w-md flex-col items-center px-4">
            {gameOverAd.media_type === 'video' ? (
              <video
                ref={videoRef}
                src={`${import.meta.env.DEV ? 'http://127.0.0.1:8000' : (String(import.meta.env.VITE_API_BASE_URL || '').trim() || 'https://api.attend75.xyz')}/uploads/ads/${gameOverAd.file_path}`}
                className="w-full rounded-2xl object-contain"
                style={{ maxHeight: '65dvh' }}
                autoPlay
                playsInline
                controls={false}
                muted={false}
                onEnded={() => setAdWatched(true)}
              />
            ) : (
              <img
                src={`${import.meta.env.DEV ? 'http://127.0.0.1:8000' : (String(import.meta.env.VITE_API_BASE_URL || '').trim() || 'https://api.attend75.xyz')}/uploads/ads/${gameOverAd.file_path}`}
                alt="Advertisement"
                className="w-full rounded-2xl object-contain"
                style={{ maxHeight: '65dvh' }}
              />
            )}

            {/* Advertiser info + link */}
            {gameOverAd.advertiser_name && (
              <p className="mt-3 text-[11px] font-semibold text-white/60">{gameOverAd.advertiser_name}</p>
            )}
            {gameOverAd.link_url && (
              <a
                href={gameOverAd.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/20"
              >
                Visit →
              </a>
            )}

            {/* Bottom message */}
            <p className="mt-4 text-center text-[10px] text-white/30">
              {adWatched ? 'Ad complete — tap Continue to play again' : `Watch for ${adCountdown}s to unlock Continue`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default GameLayout
