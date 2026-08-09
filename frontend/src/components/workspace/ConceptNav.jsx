/**
 * ConceptNav — chapter structure navigator.
 *
 * Shows all concepts in order with mastery state indicators.
 * Student taps a concept to jump to it in the Canvas.
 * Can be a sidebar (desktop) or a bottom drawer (mobile).
 *
 * Fixes applied:
 * - Titles show full text in a `title` tooltip on hover
 * - Active item uses high-contrast bg + left accent bar
 * - Sidebar has proper flex + overflow constraints (no bleed)
 */
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, X } from 'lucide-react'

const STATUS_CONFIG = {
  unseen:     { color: '#4a4869', label: '',  ring: '#4a4869' },
  learning:   { color: '#6CB4FF', label: '·', ring: '#6CB4FF' },
  understood: { color: '#4EF0A0', label: '✓', ring: '#4EF0A0' },
  struggling: { color: '#FF916C', label: '!', ring: '#FF916C' },
  review_due: { color: '#F5C26B', label: '↺', ring: '#F5C26B' },
  mastered:   { color: '#4EF0A0', label: '★', ring: '#4EF0A0' },
}

const TYPE_BADGE = {
  numerical: { label: '#',  bg: 'bg-amber-500/15',  text: 'text-amber-400' },
  mixed:     { label: '⊕', bg: 'bg-violet-500/15', text: 'text-violet-400' },
}

// ── Single concept row ────────────────────────────────────────────────────

function ConceptItem({ concept, isActive, onClick }) {
  const status  = STATUS_CONFIG[concept.student_status] || STATUS_CONFIG.unseen
  const badge   = TYPE_BADGE[concept.content_type]

  return (
    <button
      onClick={() => onClick(concept.id)}
      title={concept.title}            /* tooltip so truncated titles are still readable */
      aria-current={isActive ? 'true' : undefined}
      className={`
        relative w-full flex items-center gap-2.5 px-3 py-2.5 text-left
        transition-colors duration-100 rounded-lg
        ${isActive
          ? 'bg-[#35315A] text-white'
          : 'text-[#B8B5D4] hover:bg-white/[0.05] hover:text-white'
        }
      `}
    >
      {/* Active accent bar */}
      {isActive && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#6CB4FF]" />
      )}

      {/* Status dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: status.color }}
      />

      {/* Text */}
      <span className="flex-1 min-w-0">
        <span className={`block text-[12px] leading-snug font-medium truncate ${isActive ? 'text-white' : ''}`}>
          {concept.title}
        </span>
        {concept.source_heading && concept.source_heading !== concept.title && (
          <span className="block text-[10px] text-[#6B6888] truncate mt-0.5">
            {concept.source_heading}
          </span>
        )}
      </span>

      {/* Badges */}
      <span className="flex items-center gap-1 flex-shrink-0">
        {badge && (
          <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        )}
        {status.label && (
          <span className="text-[11px] font-semibold" style={{ color: status.color }}>
            {status.label}
          </span>
        )}
      </span>
    </button>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────

function ProgressBar({ concepts }) {
  const total      = concepts.length
  const done       = concepts.filter(c => ['understood', 'mastered'].includes(c.student_status)).length
  const struggling = concepts.filter(c => ['struggling', 'review_due'].includes(c.student_status)).length
  const pct        = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[#9895B5] text-[11px] font-medium">Progress</span>
        <div className="flex items-center gap-2">
          <span className="text-[#9895B5] text-[11px]">{done}/{total}</span>
          {struggling > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#F5C26B]/15 text-[#F5C26B] text-[9px] font-bold">
              {struggling} due
            </span>
          )}
        </div>
      </div>
      <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#4EF0A0] rounded-full"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// ── Sidebar (desktop) ─────────────────────────────────────────────────────

export function ConceptNavSidebar({ concepts, activeConceptId, onConceptClick, title }) {
  return (
    <div className="flex flex-col h-full w-full bg-[#221F42] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/[0.06] flex-shrink-0">
        <BookOpen size={13} className="text-[#6CB4FF] flex-shrink-0" />
        <p className="text-white text-[13px] font-semibold truncate" title={title}>
          {title || 'Chapter'}
        </p>
      </div>

      <ProgressBar concepts={concepts} />

      {/* Scrollable list */}
      <nav
        className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#3D3660 transparent' }}
        aria-label="Chapter concepts"
      >
        {concepts.map(concept => (
          <ConceptItem
            key={concept.id}
            concept={concept}
            isActive={concept.id === activeConceptId}
            onClick={onConceptClick}
          />
        ))}
      </nav>
    </div>
  )
}

// ── Bottom sheet (mobile) ─────────────────────────────────────────────────

export function ConceptNavSheet({ concepts, activeConceptId, onConceptClick, title, isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#221F42] border-t border-white/10
                       rounded-t-2xl max-h-[75dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen size={13} className="text-[#6CB4FF]" />
                <p className="text-white text-[13px] font-semibold truncate max-w-[220px]" title={title}>
                  {title || 'Chapter'}
                </p>
              </div>
              <button onClick={onClose} className="text-[#9895B5] hover:text-white transition-colors p-1">
                <X size={16} />
              </button>
            </div>

            <div className="flex-shrink-0">
              <ProgressBar concepts={concepts} />
            </div>

            <nav
              className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            >
              {concepts.map(concept => (
                <ConceptItem
                  key={concept.id}
                  concept={concept}
                  isActive={concept.id === activeConceptId}
                  onClick={(id) => { onConceptClick(id); onClose() }}
                />
              ))}
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
