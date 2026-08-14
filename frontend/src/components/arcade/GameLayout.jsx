import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import gameRegistry from './gameRegistry'
import { submitScore } from '../../services/arcadeApi'
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

  const handleRestart = useCallback(() => {
    setCurrentScore(0)
    setCurrentCoins(0)
    setIsGameOver(false)
    setSubmissionResult(null)
    setIsSubmitting(false)
    hasSubmittedRef.current = false
  }, [])

  const handleViewLeaderboard = useCallback(() => {
    navigate(`/app/arcade/${gameSlug}?view=leaderboard`)
  }, [navigate, gameSlug])

  // Flush any offline-queued scores on mount
  useEffect(() => {
    flushQueue(token)
  }, [token])

  // --- Render ---
  return (
    <div
      className="fixed inset-x-0 flex flex-col bg-[#0a0e1a]"
      style={{
        top: 0,
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        zIndex: 10,
      }}
    >
      {/* Header bar */}
      <div className="flex shrink-0 items-center justify-between bg-[#2D2845]/95 px-4 py-3 backdrop-blur-sm border-b border-white/10">
        <button
          type="button"
          onClick={() => navigate('/app/arcade')}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-[#F7F4FF] transition hover:bg-white/10 active:scale-95"
          aria-label="Back to Arcade"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>

        <h1 className="text-base font-bold text-[#F7F4FF] sm:text-lg">{gameTitle}</h1>

        <div className="min-w-[60px] text-right">
          {!isGameOver && (
            <span className="text-sm font-semibold text-[#4EF0A0]">
              {currentScore > 0 ? currentScore : ''}
            </span>
          )}
        </div>
      </div>

      {/* Game canvas area — 16:9 container, full width, centered vertically */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-[#0a0e1a]">
        {/* 1:1 box matching the game's 480×480 logical world */}
        <div
          className="relative w-full"
          style={{ aspectRatio: '1/1', maxHeight: '100%' }}
        >
          {typeof children === 'function'
            ? children({
                onGameEnd: handleGameEnd,
                onScoreUpdate: handleScoreUpdate,
                onRestart: handleRestart,
                isActive: !isGameOver,
              })
            : children}

          {/* Game-over overlay */}
          {isGameOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="flex w-[88%] max-w-sm flex-col items-center gap-4 rounded-2xl bg-[#2D2845] p-6 shadow-xl ring-1 ring-white/10">
                <h2 className="text-xl font-bold text-[#F7F4FF]">Game Over</h2>

                <p className="text-4xl font-extrabold text-[#F7F4FF]">{currentScore}</p>
                <p className="text-xs text-[#F7F4FF]/50">Final Score</p>

                {currentCoins > 0 && (
                  <div className="flex items-center gap-2 rounded-full bg-[#ffd700]/15 px-4 py-1.5">
                    <span className="text-base leading-none">🪙</span>
                    <span className="text-sm font-bold text-[#ffd700]">
                      {currentCoins} coin{currentCoins !== 1 ? 's' : ''} collected
                    </span>
                  </div>
                )}

                {isSubmitting && (
                  <p className="text-sm text-[#F7F4FF]/70">Saving score…</p>
                )}

                {submissionResult && (
                  <div className="flex w-full flex-col gap-1 rounded-xl bg-white/5 px-4 py-3 text-center">
                    <p className="text-sm text-[#F7F4FF]/80">
                      Personal Best: <span className="font-bold text-[#4EF0A0]">{submissionResult.personal_best}</span>
                    </p>
                    <p className="text-sm text-[#F7F4FF]/80">
                      Rank: <span className="font-bold text-[#4EF0A0]">#{submissionResult.rank}</span>
                    </p>
                  </div>
                )}

                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="flex-1 rounded-full bg-[#FF916C] py-3 text-sm font-bold text-[#1D183E] transition active:scale-[0.97]"
                  >
                    Play Again
                  </button>
                  <button
                    type="button"
                    onClick={handleViewLeaderboard}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#F7F4FF]/20 py-3 text-sm font-semibold text-[#F7F4FF] transition hover:bg-white/5 active:scale-[0.97]"
                  >
                    <Trophy size={16} />
                    Leaderboard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GameLayout
