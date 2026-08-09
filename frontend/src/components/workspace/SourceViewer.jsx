/**
 * SourceViewer — Phase 3 PPT/PDF source document viewer.
 *
 * Shows the original slide/page structure extracted from the uploaded file.
 * Highlights the slide that corresponds to the current concept's source_page.
 * "View source" links in Canvas navigate here with a specific slide number.
 *
 * Works with both PDF (shows pages) and PPTX (shows slides).
 * Gracefully handles missing files by using concept metadata reconstruction.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, ChevronLeft, ChevronRight, FileText, Layers, Loader, Search, ArrowLeft } from 'lucide-react'
import { getSourceMap } from '../../services/lessonApi'

// ── Single slide/page card ────────────────────────────────────────────────

function SlideCard({ slide, isActive, isHighlighted, onClick }) {
  const ref = useRef(null)

  // Auto-scroll into view when highlighted
  useEffect(() => {
    if (isHighlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  return (
    <motion.button
      ref={ref}
      onClick={() => onClick(slide.number)}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left rounded-2xl border transition-all duration-150 overflow-hidden
        ${isHighlighted
          ? 'border-[#6CB4FF]/50 bg-[#6CB4FF]/8 shadow-lg shadow-[#6CB4FF]/10'
          : isActive
          ? 'border-white/20 bg-[#2E2B4A]'
          : 'border-white/[0.06] bg-[#1E1B3A] hover:bg-[#252240] hover:border-white/12'
        }`}
    >
      {/* Slide number + type badge */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
            ${isHighlighted
              ? 'bg-[#6CB4FF]/20 text-[#6CB4FF]'
              : 'bg-white/8 text-[#9895B5]'
            }`}>
            {slide.element_type === 'slide' ? 'SLIDE' : 'PAGE'} {slide.number}
          </span>
          {isHighlighted && (
            <span className="text-[10px] text-[#6CB4FF] font-medium">← current concept</span>
          )}
        </div>
      </div>

      {/* Slide title */}
      <div className="px-3.5 pb-2">
        <p className={`text-[13px] font-semibold leading-snug
          ${isHighlighted ? 'text-white' : isActive ? 'text-white' : 'text-[#C8C5E8]'}`}>
          {slide.title}
        </p>
      </div>

      {/* Body preview */}
      {slide.body_preview && (
        <div className="px-3.5 pb-3">
          <p className="text-[#6B6888] text-[11px] leading-relaxed line-clamp-3">
            {slide.body_preview}
          </p>
        </div>
      )}

      {/* Concept pills */}
      {slide.concepts?.length > 0 && (
        <div className="px-3.5 pb-3 flex flex-wrap gap-1">
          {slide.concepts.slice(0, 3).map((c, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-white/5 text-[#9895B5] text-[10px]">
              {c.title?.slice(0, 30)}
            </span>
          ))}
          {slide.concepts.length > 3 && (
            <span className="text-[#6B6888] text-[10px] px-1">+{slide.concepts.length - 3} more</span>
          )}
        </div>
      )}
    </motion.button>
  )
}

// ── Navigation controls ───────────────────────────────────────────────────

function NavControls({ current, total, onPrev, onNext }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onPrev}
        disabled={current <= 1}
        aria-label="Previous slide"
        className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[#9895B5]
                   hover:bg-white/10 disabled:opacity-30 active:scale-95 transition-all"
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <span className="text-[#9895B5] text-xs tabular-nums" aria-live="polite">{current} / {total}</span>
      <button
        onClick={onNext}
        disabled={current >= total}
        aria-label="Next slide"
        className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[#9895B5]
                   hover:bg-white/10 disabled:opacity-30 active:scale-95 transition-all"
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

// ── Main SourceViewer ─────────────────────────────────────────────────────

export function SourceViewer({
  token,
  uploadId,
  highlightSlideNo,   // from "View source →" link in Canvas
  onSlideClick,       // optional: navigate back to Canvas for this concept
}) {
  const [sourceMap, setSourceMap] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [activeSlide, setActiveSlide] = useState(highlightSlideNo || 1)
  const [search, setSearch]       = useState('')

  // Load source map
  useEffect(() => {
    if (!token || !uploadId) return
    setLoading(true)
    getSourceMap({ token, uploadId })
      .then(data => {
        setSourceMap(data)
        // Jump to highlighted slide if provided
        if (highlightSlideNo) setActiveSlide(highlightSlideNo)
        else if (data.slides?.length > 0) setActiveSlide(data.slides[0].number)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token, uploadId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update active slide when parent changes highlight
  useEffect(() => {
    if (highlightSlideNo) setActiveSlide(highlightSlideNo)
  }, [highlightSlideNo])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader size={20} className="text-[#6CB4FF] animate-spin mx-auto mb-2" />
          <p className="text-[#9895B5] text-sm">Loading source…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-16">
        <FileText size={28} className="text-[#6B6888] mb-3" />
        <p className="text-[#9895B5] text-sm font-medium mb-1">Source unavailable</p>
        <p className="text-[#6B6888] text-xs max-w-xs leading-relaxed">
          The original file was removed after processing. Concept references are shown in the Canvas.
        </p>
      </div>
    )
  }

  if (!sourceMap?.slides?.length) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <p className="text-[#9895B5] text-sm">No source content available.</p>
      </div>
    )
  }

  const { slides, total, element_type } = sourceMap
  const typeLabel = element_type === 'slide' ? 'Slides' : 'Pages'

  // Filter by search
  const filtered = search.trim()
    ? slides.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.body_preview?.toLowerCase().includes(search.toLowerCase()) ||
        s.concepts?.some(c => c.title?.toLowerCase().includes(search.toLowerCase()))
      )
    : slides

  // Find active slide index for prev/next
  const activeIdx = filtered.findIndex(s => s.number === activeSlide)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[#9895B5]" />
          <span className="text-[#9895B5] text-xs">{total} {typeLabel}</span>
        </div>

        {/* Back to Canvas button — shown only when arrived via "View source" */}
        {highlightSlideNo && onSlideClick && (
          <button
            onClick={() => onSlideClick(highlightSlideNo)}
            className="flex items-center gap-1.5 text-[#6CB4FF] text-[11px] hover:text-[#6CB4FF]/80 transition-colors"
          >
            <ArrowLeft size={11} />
            Back to Canvas
          </button>
        )}

        {/* Navigation controls */}
        <NavControls
          current={activeIdx >= 0 ? activeIdx + 1 : 1}
          total={filtered.length}
          onPrev={() => {
            if (activeIdx > 0) setActiveSlide(filtered[activeIdx - 1].number)
          }}
          onNext={() => {
            if (activeIdx < filtered.length - 1) setActiveSlide(filtered[activeIdx + 1].number)
          }}
        />
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
          <Search size={12} className="text-[#9895B5] flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${typeLabel.toLowerCase()}…`}
            className="flex-1 bg-transparent text-[#E8E5FF] text-xs placeholder:text-[#5C5878]
                       focus:outline-none min-w-0"
          />
        </div>
      </div>

      {/* Slide list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#3D3660 transparent', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        {filtered.length === 0 ? (
          <p className="text-[#9895B5] text-xs text-center py-8">No matches found.</p>
        ) : (
          filtered.map(slide => (
            <SlideCard
              key={slide.number}
              slide={slide}
              isActive={slide.number === activeSlide}
              isHighlighted={slide.number === highlightSlideNo}
              onClick={(num) => {
                setActiveSlide(num)
                onSlideClick?.(num)
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
