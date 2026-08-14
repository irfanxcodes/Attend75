/**
 * ConceptCanvas — document-style, student-controlled learning canvas.
 *
 * Renders all concepts as a continuous readable document.
 * Inspired by clean note-taking apps — white paper feel on dark bg.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Loader } from 'lucide-react'
import { CanvasSectionRenderer } from './CanvasSectionRenderer'

// ── Legacy block → document-style rendering ───────────────────────────────

function LegacyBlockStatic({ block }) {
  switch (block.block_type) {
    case 'narration':
      return (
        <p className="text-[#1a1a2e] text-[15px] leading-[1.9] mb-3">
          {block.content}
        </p>
      )
    case 'keyword_highlight': {
      let keywords = []
      try { keywords = JSON.parse(block.content) } catch {
        keywords = block.content.split(',').map(k => k.trim()).filter(Boolean)
      }
      return (
        <div className="mb-4">
          <p className="text-[10px] text-[#6b6888] uppercase tracking-widest font-semibold mb-2">Key Terms</p>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-[13px] font-medium
                bg-[#EEF2FF] text-[#4338ca] border border-[#c7d2fe]">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )
    }
    case 'definition':
      return (
        <div className="border-l-[3px] border-[#6366f1] pl-4 py-0.5 mb-4">
          <p className="text-[10px] text-[#6366f1] uppercase tracking-widest font-semibold mb-1.5">Definition</p>
          <p className="text-[#1a1a2e] text-[15px] leading-relaxed italic">"{block.content}"</p>
        </div>
      )
    case 'example':
      return (
        <div className="mb-4">
          <p className="text-[10px] text-[#d97706] uppercase tracking-widest font-semibold mb-1.5">Example</p>
          <p className="text-[#1a1a2e] text-[15px] leading-relaxed">{block.content}</p>
        </div>
      )
    case 'quiz':
      return (
        <div className="mb-4 border-l-[3px] border-[#a78bfa] pl-4">
          <p className="text-[10px] text-[#7c3aed] uppercase tracking-widest font-semibold mb-1.5">Practice Question</p>
          <p className="text-[#1a1a2e] text-[15px] leading-relaxed">{block.content}</p>
          <p className="text-[#9895b5] text-[12px] mt-1 italic">Ask the Tutor to walk you through this</p>
        </div>
      )
    case 'recap': {
      const lines = (block.content || '').split('\n').filter(Boolean)
      return (
        <div className="mb-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-4 py-3">
          <p className="text-[10px] text-[#166534] uppercase tracking-widest font-semibold mb-2">Recap</p>
          {lines.map((l, i) => <p key={i} className="text-[#14532d] text-[14px] leading-relaxed">{l}</p>)}
        </div>
      )
    }
    default:
      return <p className="text-[#6b7280] text-[14px] leading-relaxed mb-3">{block.content}</p>
  }
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function ConceptSectionSkeleton() {
  return (
    <div className="mb-6 bg-white rounded-2xl px-6 py-5 shadow-sm animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-2.5 h-2.5 rounded-full bg-slate-200 flex-shrink-0" />
        <div className="h-5 w-56 bg-slate-200 rounded" />
      </div>
      <div className="space-y-2.5">
        <div className="h-3.5 w-full bg-slate-100 rounded" />
        <div className="h-3.5 w-[88%] bg-slate-100 rounded" />
        <div className="h-3.5 w-[72%] bg-slate-100 rounded" />
        <div className="h-16 w-full bg-slate-50 rounded-xl mt-3" />
      </div>
    </div>
  )
}

// ── Concept section ───────────────────────────────────────────────────────

function ConceptSection({ concept, sections, legacyBlocks, onViewSource, isLegacy }) {
  const [isExpanded, setIsExpanded] = useState(true)

  const hasBadge = concept.content_type === 'numerical' || concept.content_type === 'mixed'

  return (
    <div className="mb-5">
      {/* White document card */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

        {/* Header row — always visible, click to collapse */}
        <div
          id={`concept-${concept.id}`}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(v => !v)}
          onKeyDown={e => e.key === 'Enter' && setIsExpanded(v => !v)}
          className="flex items-start gap-3 px-6 pt-5 pb-4 cursor-pointer select-none group"
        >
          {/* Colored status bullet */}
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ring-2 ring-offset-2 ring-offset-white"
            style={{
              backgroundColor: concept.statusColor || '#d1d5db',
              ringColor: concept.statusColor || '#d1d5db',
            }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-[#0f0e1a] text-[17px] font-bold leading-snug tracking-tight">
                {concept.title}
              </h2>
              {concept.content_type === 'numerical' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">
                  Numerical
                </span>
              )}
              {concept.content_type === 'mixed' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 uppercase tracking-wide">
                  Mixed
                </span>
              )}
            </div>
            {concept.source_heading && concept.source_heading !== concept.title && (
              <p className="text-[#9b97b2] text-[11px] mt-0.5">
                From {concept.source_heading}
              </p>
            )}
          </div>

          <span className="flex-shrink-0 text-[#c4c0d8] group-hover:text-[#9895B5] transition-colors mt-1">
            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </span>
        </div>

        {/* Content area */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="px-6 pb-6 border-t border-slate-100">
                <div className="pt-4">
                  {isLegacy ? (
                    legacyBlocks.map(block => (
                      <LegacyBlockStatic key={block.id} block={block} />
                    ))
                  ) : (
                    sections.map(section => (
                      <CanvasSectionRenderer
                        key={section.id}
                        section={section}
                        onViewSource={onViewSource}
                      />
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Main ConceptCanvas ────────────────────────────────────────────────────

export function ConceptCanvas({
  concepts,
  legacyBlocksByConcept,
  script,
  activeConceptId,
  onConceptVisible,
  onViewSource,
  loading,
}) {
  const canvasRef = useRef(null)
  const conceptRefs = useRef({})

  // Scroll to active concept when nav is clicked
  useEffect(() => {
    if (!activeConceptId) return
    const el = document.getElementById(`concept-${activeConceptId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeConceptId])

  // Track which concept is most visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const best = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (best) {
          const id = best.target.getAttribute('data-concept-id')
          if (id) onConceptVisible(id)
        }
      },
      { root: null, rootMargin: '-15% 0px -55% 0px', threshold: 0.1 }
    )
    Object.values(conceptRefs.current).forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [concepts, onConceptVisible])

  // Narration — removed (replaced by slide AI explanations in SourceViewer)

  // ── Loading / empty states ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader size={20} className="text-[#6CB4FF] animate-spin mx-auto mb-2" />
          <p className="text-[#9895B5] text-sm">Loading chapter…</p>
        </div>
      </div>
    )
  }

  if (!concepts?.length) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-[#9895B5] text-sm text-center">No content available yet.</p>
      </div>
    )
  }

  const STATUS_COLORS = {
    unseen:     '#d1d5db',
    learning:   '#6CB4FF',
    understood: '#4EF0A0',
    struggling: '#FF916C',
    review_due: '#F5C26B',
    mastered:   '#4EF0A0',
  }

  const done = concepts.filter(c => ['understood', 'mastered'].includes(c.status)).length
  const pct  = concepts.length > 0 ? Math.round((done / concepts.length) * 100) : 0

  return (
    <div className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0 bg-[#1D183E]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-[#9895B5] text-[12px]">
              {concepts.length} concepts
            </span>
            {script?.estimated_duration_seconds && (
              <span className="text-[#6B6888] text-[12px]">
                ~{Math.round(script.estimated_duration_seconds / 60)} min read
              </span>
            )}
            {pct > 0 && (
              <span className="text-[#4EF0A0] text-[12px] font-medium">{pct}% done</span>
            )}
          </div>
          {/* Thin progress bar */}
          {pct > 0 && (
            <div className="mt-1.5 h-0.5 bg-white/[0.06] rounded-full overflow-hidden w-40">
              <motion.div
                className="h-full bg-[#4EF0A0] rounded-full"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>

        
      </div>

      {/* ── Scrollable document area ── */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-y-auto bg-[#16133A]"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#3D3660 transparent',
          paddingBottom: 'max(env(safe-area-inset-bottom), 80px)',
        }}
      >
        <div className="max-w-[720px] mx-auto px-4 pt-5">
          {concepts.map(concept => {
            const isLegacy = !concept.sections?.length
            const legacyBlocks = legacyBlocksByConcept?.[concept.id] || []
            const isEmpty = isLegacy && legacyBlocks.length === 0
            return (
              <div
                key={concept.id}
                ref={el => { conceptRefs.current[concept.id] = el }}
                data-concept-id={concept.id}
              >
                {isEmpty ? (
                  <ConceptSectionSkeleton />
                ) : (
                  <ConceptSection
                    concept={{
                      ...concept,
                      statusColor: STATUS_COLORS[concept.status] || STATUS_COLORS.unseen,
                    }}
                    sections={concept.sections || []}
                    legacyBlocks={legacyBlocks}
                    onViewSource={onViewSource}
                    isLegacy={isLegacy}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
