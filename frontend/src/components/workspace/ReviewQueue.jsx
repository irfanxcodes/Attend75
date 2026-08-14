/**
 * ReviewQueue — Phase 8 review system.
 *
 * Shows concepts due for review (struggling or review_due status).
 * Scoped to the current chapter (upload_id).
 * Student taps "Review" to open a review session for that concept.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Loader, RefreshCw, RotateCcw } from 'lucide-react'
import { getReviewQueue } from '../../services/lessonApi'

const STATUS_CONFIG = {
  struggling:  { color: '#FF916C', icon: '!', label: 'Struggling' },
  review_due:  { color: '#F5C26B', icon: '↺', label: 'Review due' },
}

// ── Single concept row ────────────────────────────────────────────────────

function ReviewItem({ item, onReview }) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.review_due
  const accuracy = item.attempts > 0
    ? Math.round((item.correct_attempts / item.attempts) * 100)
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1E1B3A] border border-white/[0.06]"
    >
      {/* Status dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: cfg.color }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white leading-snug truncate">
          {item.concept_title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-semibold" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          {accuracy !== null && (
            <span className="text-[10px] text-[#6B6888]">
              {accuracy}% accuracy
            </span>
          )}
        </div>
      </div>

      {/* Review button */}
      <button
        onClick={() => onReview(item.concept_id, item.concept_title)}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full
                   bg-[#2E2B4A] border border-white/10 text-[#E8E5FF] text-[11px] font-medium
                   hover:bg-[#3A3760] hover:border-white/20 active:scale-95 transition-all"
      >
        <RotateCcw size={11} />
        Review
      </button>
    </motion.div>
  )
}

// ── Main ReviewQueue ──────────────────────────────────────────────────────

/**
 * @param {string}   token            — auth token
 * @param {string}   uploadId         — chapter upload UUID
 * @param {Function} onReviewConcept  — (conceptId, conceptTitle) => void
 */
export function ReviewQueue({ token, uploadId, onReviewConcept }) {
  const [status, setStatus]   = useState('loading')  // loading | loaded | error
  const [items, setItems]     = useState([])

  const load = useCallback(() => {
    if (!token || !uploadId) return
    setStatus('loading')
    getReviewQueue({ token, uploadId })
      .then(data => {
        setItems(data || [])
        setStatus('loaded')
      })
      .catch(() => setStatus('error'))
  }, [token, uploadId])

  useEffect(() => { load() }, [load])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="px-4 pt-4 pb-2">

      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RotateCcw size={13} className="text-[#F5C26B]" />
          <p className="text-[12px] font-semibold text-white">Review Queue</p>
          {status === 'loaded' && items.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#F5C26B]/20 text-[#F5C26B] text-[9px] font-bold">
              {items.length}
            </span>
          )}
        </div>
        {status === 'loaded' && (
          <button
            onClick={load}
            aria-label="Refresh review queue"
            className="text-[#6B6888] hover:text-[#9895B5] transition-colors"
          >
            <RefreshCw size={11} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Loading */}
      {status === 'loading' && (
        <div className="flex items-center gap-2 py-3">
          <Loader size={13} className="text-[#9895B5] animate-spin" />
          <p className="text-[#9895B5] text-xs">Checking review queue…</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-center gap-2 py-2">
          <p className="text-[#9895B5] text-xs flex-1">Couldn't load review queue.</p>
          <button
            onClick={load}
            className="text-[#FF916C] text-xs hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty — all caught up */}
      {status === 'loaded' && items.length === 0 && (
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 size={14} className="text-[#4EF0A0] flex-shrink-0" />
          <p className="text-[#9895B5] text-xs">All caught up — no concepts due for review.</p>
        </div>
      )}

      {/* Items */}
      {status === 'loaded' && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <ReviewItem
              key={item.concept_id}
              item={item}
              onReview={onReviewConcept}
            />
          ))}
        </div>
      )}
    </div>
  )
}
