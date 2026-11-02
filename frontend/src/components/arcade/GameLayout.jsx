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
  const selfManaged = game?.selfManaged ?? false  // game handles its own UI

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
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 10, background: '#0a0e1a' }}
    >
      {/* ── Top bar (hidden for self-managed games) ── */}
      {!selfManaged && (
        <div
          className="flex-shrink-0 flex items-center gap-3 px-3"
          style={{
            height: 52,
            background: 'rgba(10,14,26,0.95)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}
        >
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate('/app/arcade')}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-xs text-black active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(180deg, #B8F77D 0%, #7BE056 100%)',
              boxShadow: '0 2px 0 rgba(0,0,0,0.25), 0 4px 10px rgba(0,0,0,0.25)',
            }}
            aria-label="Back to Arcade"
          >
            <span className="text-sm">←</span>
            <span>BACK</span>
          </button>

          {/* Game title — centered */}
          <h1 className="flex-1 text-center text-sm font-bold text-white truncate">
            {gameTitle}
          </h1>

          {/* Score pill — right side, same width as back btn for balance */}
          <div className="flex-shrink-0 min-w-[64px] flex justify-end">
            {!isGameOver && currentScore > 0 && (
              <div className="px-3 py-1.5 rounded-full text-xs font-bold text-[#4EF0A0]"
                style={{ background: 'rgba(78,240,160,0.12)', border: '1px solid rgba(78,240,160,0.25)' }}>
                {currentScore}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Game area — fills ALL remaining space ── */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        <div className="absolute inset-0">
          {typeof children === 'function'
            ? children({
                onGameEnd: handleGameEnd,
                onScoreUpdate: handleScoreUpdate,
                onRestart: handleRestart,
                isActive: !isGameOver,
                initialScore: resumeScore,
              })
            : children}
        </div>

        {/* Game-over overlay — hidden for self-managed games */}
        {isGameOver && !selfManaged && (
          <div className="absolute inset-0 z-10 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
            <div className="flex w-[88%] max-w-sm flex-col items-center gap-4 rounded-2xl p-6 shadow-2xl"
              style={{ background: '#1a1836', border: '1px solid rgba(255,255,255,0.1)' }}>

              <h2 className="text-xl font-bold text-white tracking-wide">Game Over</h2>

              {/* Score row */}
              <div className="flex gap-8 w-full justify-center">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-1">Score</span>
                  <span className="text-4xl font-black text-white">{currentScore}</span>
                </div>
                {submissionResult && (
                  <>
                    <div className="w-px bg-white/10" />
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-1">Best</span>
                      <span className="text-4xl font-black text-[#FF916C]">{submissionResult.personal_best}</span>
                    </div>
                    <div className="w-px bg-white/10" />
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-1">Rank</span>
                      <span className="text-4xl font-black text-[#4EF0A0]">#{submissionResult.rank}</span>
                    </div>
                  </>
                )}
              </div>

              {currentCoins > 0 && (
                <div className="flex items-center gap-2 rounded-full px-4 py-1.5"
                  style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.2)' }}>
                  <span>🪙</span>
                  <span className="text-sm font-bold text-[#ffd700]">
                    {currentCoins} coin{currentCoins !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {isSubmitting && (
                <p className="text-xs text-white/40">Saving score…</p>
              )}

              {/* Buttons */}
              <div className="flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleRestart(0)}
                  className="w-full rounded-full py-3.5 text-sm font-black text-[#1a1836] transition active:scale-[0.97]"
                  style={{ background: 'linear-gradient(135deg, #FF916C, #e0603a)',
                    boxShadow: '0 4px 16px rgba(255,100,60,0.35)' }}
                >
                  Play Again
                </button>
                <button
                  type="button"
                  onClick={handleViewLeaderboard}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-sm font-semibold text-white/70 transition active:scale-[0.97]"
                  style={{ border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <Trophy size={15} />
                  Leaderboard
                </button>
              </div>

              {/* Watch ad */}
              {adLoaded && gameOverAd && !adWatched && !adAlreadyUsed && (
                <button
                  type="button"
                  onClick={handleWatchAd}
                  className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-semibold transition active:scale-[0.97]"
                  style={{ border: '1px solid rgba(167,139,250,0.35)',
                    background: 'rgba(167,139,250,0.08)', color: '#A78BFA' }}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  Watch ad to continue
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ad modal */}
      {showAdModal && gameOverAd && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95">
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {adWatched ? (
              <button type="button" onClick={handleAdClose}
                className="rounded-full bg-[#4EF0A0] px-4 py-1.5 text-[11px] font-bold text-[#0f2018] active:scale-95">
                ✓ Continue
              </button>
            ) : (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/70">
                {adCountdown}s
              </span>
            )}
          </div>
          <div className="flex w-full max-w-md flex-col items-center px-4">
            {gameOverAd.media_type === 'video' ? (
              <video ref={videoRef}
                src={`${import.meta.env.DEV ? 'http://127.0.0.1:8000' : (String(import.meta.env.VITE_API_BASE_URL || '').trim() || 'https://api.attend75.xyz')}/uploads/ads/${gameOverAd.file_path}`}
                className="w-full rounded-2xl object-contain" style={{ maxHeight: '65dvh' }}
                autoPlay playsInline controls={false} muted={false} onEnded={() => setAdWatched(true)} />
            ) : (
              <img src={`${import.meta.env.DEV ? 'http://127.0.0.1:8000' : (String(import.meta.env.VITE_API_BASE_URL || '').trim() || 'https://api.attend75.xyz')}/uploads/ads/${gameOverAd.file_path}`}
                alt="Advertisement" className="w-full rounded-2xl object-contain" style={{ maxHeight: '65dvh' }} />
            )}
            {gameOverAd.advertiser_name && (
              <p className="mt-3 text-[11px] font-semibold text-white/60">{gameOverAd.advertiser_name}</p>
            )}
            {gameOverAd.link_url && (
              <a href={gameOverAd.link_url} target="_blank" rel="noopener noreferrer"
                className="mt-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/20">
                Visit →
              </a>
            )}
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
