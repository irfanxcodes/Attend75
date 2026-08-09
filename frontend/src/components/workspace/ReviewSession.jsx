/**
 * ReviewSession — Phase 8 review session overlay.
 *
 * Wraps AdaptiveQuiz in a review-mode session.
 * When the quiz completes, calls POST /review-complete with the score,
 * then notifies the parent so it can refresh the review queue.
 */
import { useCallback, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AdaptiveQuiz } from './AdaptiveQuiz'
import { completeReview } from '../../services/lessonApi'

/**
 * @param {string}   token          — auth token
 * @param {string}   conceptId      — concept UUID
 * @param {string}   conceptTitle   — concept title
 * @param {Function} onComplete     — (score: float) => void
 * @param {Function} onClose        — () => void — dismiss without completing
 */
export function ReviewSession({ token, conceptId, conceptTitle, onComplete, onClose }) {
  // Track score from AdaptiveQuiz via onProgressUpdate callbacks
  const scoreRef = useRef({ correct: 0, total: 0 })

  const handleProgressUpdate = useCallback((status) => {
    // AdaptiveQuiz calls this with 'understood' (correct) or 'struggling' (wrong)
    scoreRef.current.total += 1
    if (status === 'understood') {
      scoreRef.current.correct += 1
    }
  }, [])

  const handleQuizClose = useCallback(() => {
    const { correct, total } = scoreRef.current
    const score = total > 0 ? correct / total : 0

    // Fire-and-forget the review-complete call
    completeReview({ token, conceptId, score }).catch(() => {})

    // Notify parent with the score so it can refresh the queue
    onComplete(score)
  }, [token, conceptId, onComplete])

  return (
    <div className="flex flex-col h-full bg-[#211E40]">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button
          onClick={onClose}
          aria-label="Exit review session"
          className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[#9895B5]
                     hover:bg-white/10 active:scale-95 transition-all flex-shrink-0"
        >
          <ArrowLeft size={13} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold">Review Session</p>
          {conceptTitle && (
            <p className="text-[#6B6888] text-[10px] truncate">{conceptTitle}</p>
          )}
        </div>
      </div>

      {/* Quiz */}
      <div className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#2E2B4A transparent', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <AdaptiveQuiz
          token={token}
          conceptId={conceptId}
          conceptTitle={conceptTitle}
          onClose={handleQuizClose}
          onProgressUpdate={handleProgressUpdate}
        />
      </div>
    </div>
  )
}
