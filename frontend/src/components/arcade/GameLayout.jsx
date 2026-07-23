import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import gameRegistry from './gameRegistry'
import { submitScore } from '../../services/arcadeApi'
import useAppStore from '../../hooks/useAppStore'

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
  const { state, actions } = useAppStore()
  const token = state.session.token

  const game = gameRegistry[gameSlug]
  const gameTitle = game?.title ?? 'Game'

  // --- State ---
  const [currentScore, setCurrentScore] = useState(0)
  const [isGameOver, setIsGameOver] = useState(false)
  const [submissionResult, setSubmissionResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Track whether we've already submitted for the current session
  const hasSubmittedRef = useRef(false)

  // --- Callbacks ---
  const handleScoreUpdate = useCallback((score) => {
    setCurrentScore(score)
  }, [])

  const handleGameEnd = useCallback(async (finalScore) => {
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true

    setCurrentScore(finalScore)
    setIsGameOver(true)
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await submitScore(token, gameSlug, finalScore)
      setSubmissionResult(result)
    } catch (err) {
      if (err.status === 401) {
        // Session expired — redirect to login
        actions.logout()
        navigate('/login', { replace: true })
        return
      }

      if (err.status === 429) {
        // Rate limited — silently ignore
        setSubmissionResult(null)
      } else {
        // Network failure or other error
        setError("Score couldn't be saved")
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [token, gameSlug, navigate, actions])

  const handleRestart = useCallback(() => {
    setCurrentScore(0)
    setIsGameOver(false)
    setSubmissionResult(null)
    setIsSubmitting(false)
    setError(null)
    hasSubmittedRef.current = false
  }, [])

  const handleViewLeaderboard = useCallback(() => {
    navigate(`/app/arcade/${gameSlug}?view=leaderboard`)
  }, [navigate, gameSlug])

  // --- Render ---
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 pb-4">
      {/* Header: Back button + Title + Score */}
      <div className="flex w-full items-center justify-between rounded-xl bg-[#4A466A] px-4 py-3">
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
            <span className="text-sm font-semibold text-[#F7F4FF]/80">
              Score: {currentScore}
            </span>
          )}
        </div>
      </div>

      {/* Game area */}
      <div className="relative w-full">
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
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
            <div className="flex w-[90%] max-w-sm flex-col items-center gap-4 rounded-2xl bg-[#4A466A] p-6 shadow-xl">
              <h2 className="text-xl font-bold text-[#F7F4FF]">Game Over</h2>

              {/* Final score */}
              <p className="text-3xl font-extrabold text-[#F7F4FF]">{currentScore}</p>
              <p className="text-xs text-[#F7F4FF]/60">Final Score</p>

              {/* Submission result */}
              {isSubmitting && (
                <p className="text-sm text-[#F7F4FF]/70">Saving score...</p>
              )}

              {submissionResult && (
                <div className="flex w-full flex-col gap-1 rounded-lg bg-white/5 px-4 py-3 text-center">
                  <p className="text-sm text-[#F7F4FF]/80">
                    Personal Best: <span className="font-bold text-[#F7F4FF]">{submissionResult.personal_best}</span>
                  </p>
                  <p className="text-sm text-[#F7F4FF]/80">
                    Rank: <span className="font-bold text-[#F7F4FF]">#{submissionResult.rank}</span>
                  </p>
                </div>
              )}

              {/* Error message */}
              {error && (
                <p className="text-sm font-medium text-red-300">{error}</p>
              )}

              {/* Actions */}
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="flex-1 rounded-full bg-[#FF916C] py-2.5 text-sm font-bold text-[#1D183E] transition active:scale-[0.97]"
                >
                  Play Again
                </button>
                <button
                  type="button"
                  onClick={handleViewLeaderboard}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#F7F4FF]/20 py-2.5 text-sm font-semibold text-[#F7F4FF] transition hover:bg-white/5 active:scale-[0.97]"
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
  )
}

export default GameLayout
