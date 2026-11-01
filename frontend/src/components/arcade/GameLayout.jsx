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
      className="fixed inset-0 flex flex-col bg-[#0a0a0f]"
      style={{ zIndex: 10 }}
    >
      {/* Minimal Top Bar with just stats */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-[#12121a]/80 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Score</span>
            <span className="text-xl font-bold text-yellow-400">{currentScore}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Best</span>
            <span className="text-xl font-bold text-white">{submissionResult?.personal_best || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Level</span>
            <span className="text-xl font-bold text-white">1</span>
          </div>
        </div>
        
        <button
          type="button"
          onClick={() => navigate('/app/arcade')}
          className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Large Game Canvas - takes all available space */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-4">
        <div className="relative w-full h-full max-w-[600px] max-h-[600px] aspect-square">
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
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/90 backdrop-blur-sm">
              <div className="flex w-[88%] max-w-sm flex-col items-center gap-4 rounded-xl bg-[#12121a] border border-gray-800 p-6">
                <h2 className="text-3xl font-bold text-yellow-400 uppercase tracking-wide">Game Over</h2>

                <p className="text-sm text-gray-400">Score: {currentScore} • Best: {submissionResult?.personal_best || 0}</p>

                {currentCoins > 0 && (
                  <div className="flex items-center gap-2 rounded-full bg-yellow-400/10 px-4 py-1.5">
                    <span className="text-base">🪙</span>
                    <span className="text-sm font-bold text-yellow-400">
                      {currentCoins} coin{currentCoins !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {isSubmitting && (
                  <p className="text-sm text-gray-400">Saving score…</p>
                )}

                {submissionResult && (
                  <div className="flex w-full flex-col gap-1 rounded-lg bg-gray-800/50 px-4 py-3 text-center">
                    <p className="text-sm text-gray-300">
                      Rank: <span className="font-bold text-green-400">#{submissionResult.rank}</span>
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleRestart(0)}
                  className="w-full rounded-lg bg-yellow-400 py-3 text-base font-bold text-black transition hover:bg-yellow-300 active:scale-[0.98]"
                >
                  PLAY AGAIN
                </button>

                <button
                  type="button"
                  onClick={handleViewLeaderboard}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 active:scale-[0.98]"
                >
                  <Trophy size={16} />
                  Leaderboard
                </button>

                {adLoaded && gameOverAd && !adWatched && !adAlreadyUsed && (
                  <button
                    type="button"
                    onClick={handleWatchAd}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/10 py-2.5 text-xs font-semibold text-purple-400 transition hover:bg-purple-500/20 active:scale-[0.98]"
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

      {/* Arrow Pad Controls - Simple and Clean */}
      <div className="shrink-0 flex flex-col items-center gap-1 pb-safe pb-6">
        {/* Up */}
        <button
          type="button"
          className="w-16 h-16 rounded-lg bg-gray-800/80 backdrop-blur-sm flex items-center justify-center text-white hover:bg-gray-700 transition active:scale-95"
          aria-label="Up"
        >
          <span className="text-3xl">▲</span>
        </button>
        
        {/* Left, Down, Right */}
        <div className="flex gap-1">
          <button
            type="button"
            className="w-16 h-16 rounded-lg bg-gray-800/80 backdrop-blur-sm flex items-center justify-center text-white hover:bg-gray-700 transition active:scale-95"
            aria-label="Left"
          >
            <span className="text-3xl">◀</span>
          </button>
          <button
            type="button"
            className="w-16 h-16 rounded-lg bg-gray-800/80 backdrop-blur-sm flex items-center justify-center text-white hover:bg-gray-700 transition active:scale-95"
            aria-label="Down"
          >
            <span className="text-3xl">▼</span>
          </button>
          <button
            type="button"
            className="w-16 h-16 rounded-lg bg-gray-800/80 backdrop-blur-sm flex items-center justify-center text-white hover:bg-gray-700 transition active:scale-95"
            aria-label="Right"
          >
            <span className="text-3xl">▶</span>
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
