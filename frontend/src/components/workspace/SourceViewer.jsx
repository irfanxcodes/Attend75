/**
 * SourceViewer — PPT/PDF slide viewer with AI teacher audio.
 *
 * Shows each slide as a visual card (title + content layout like an actual slide).
 * Each slide has an AI "Explain" button that fetches an AI teacher explanation
 * and reads it aloud — like OpenMAIC's per-slide teaching audio.
 *
 * Highlights the slide that corresponds to the current concept's source_page.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, FileText, Layers,
  Loader, Search, ArrowLeft, Square, Volume2,
} from 'lucide-react'
import { getSourceMap, getSlideExplanation } from '../../services/lessonApi'
import { useWebSpeech } from '../../hooks/useWebSpeech'

// ── Slide visual card ─────────────────────────────────────────────────────

function SlideCard({
  slide,
  isActive,
  isHighlighted,
  onClick,
  uploadId,
  token,
}) {
  const ref = useRef(null)
  const { speak, stopSpeaking, isSpeaking } = useWebSpeech()
  const [audioState, setAudioState] = useState('idle') // idle | loading | speaking | done
  const [explanation, setExplanation] = useState(null)
  const [audioError, setAudioError] = useState(null)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  // Auto-scroll into view when highlighted
  useEffect(() => {
    if (isHighlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  // Stop speaking when this card is no longer active
  useEffect(() => {
    if (!isActive && audioState === 'speaking') {
      stopSpeaking()
      setAudioState('done')
    }
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExplain = useCallback(async (e) => {
    e.stopPropagation()

    // If already speaking, pause/stop it
    if (audioState === 'speaking') {
      stopSpeaking()
      setAudioState('done')
      return
    }

    // If we already have the explanation cached, just replay it
    if (explanation && audioState === 'done') {
      setAudioState('speaking')
      speak(explanation, {
        onEnd: () => { if (isMounted.current) setAudioState('done') },
        onError: () => { if (isMounted.current) setAudioState('done') },
      })
      return
    }

    // Fetch explanation from AI
    setAudioState('loading')
    setAudioError(null)
    try {
      const data = await getSlideExplanation({ token, uploadId, slideNo: slide.number })
      if (!isMounted.current) return
      setExplanation(data.explanation)
      setAudioState('speaking')
      speak(data.explanation, {
        onEnd: () => { if (isMounted.current) setAudioState('done') },
        onError: () => { if (isMounted.current) { setAudioState('done'); setAudioError('Audio failed') } },
      })
    } catch (err) {
      if (isMounted.current) {
        setAudioState('idle')
        setAudioError('Could not load explanation')
      }
    }
  }, [audioState, explanation, slide.number, token, uploadId, speak, stopSpeaking])

  // Split body text into bullet-like lines for visual layout
  const bodyLines = slide.body_preview
    ? slide.body_preview.split('\n').filter(Boolean).slice(0, 6)
    : []

  const isCurrentlyExplaining = audioState === 'speaking'

  return (
    <motion.div
      ref={ref}
      layout
      className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer
        ${isHighlighted
          ? 'border-[#6CB4FF]/60 shadow-lg shadow-[#6CB4FF]/15'
          : isActive
          ? 'border-white/20'
          : 'border-white/[0.07] hover:border-white/15'
        }`}
      onClick={() => onClick(slide.number)}
    >
      {/* ── Slide label row ── */}
      <div className={`flex items-center justify-between px-4 pt-3 pb-2
        ${isHighlighted ? 'bg-[#6CB4FF]/10' : isActive ? 'bg-[#2A2650]' : 'bg-[#1E1B3A]'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
            ${isHighlighted ? 'bg-[#6CB4FF]/25 text-[#6CB4FF]' : 'bg-white/8 text-[#9895B5]'}`}>
            {slide.element_type === 'slide' ? 'SLIDE' : 'PAGE'} {slide.number}
          </span>
          {isHighlighted && (
            <span className="text-[10px] text-[#6CB4FF] font-medium">← current</span>
          )}
        </div>

        {/* AI Explain button */}
        <button
          onClick={handleExplain}
          disabled={audioState === 'loading'}
          aria-label={isCurrentlyExplaining ? 'Stop explanation' : 'Explain this slide'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
            transition-all active:scale-95 border
            ${isCurrentlyExplaining
              ? 'bg-[#6CB4FF]/20 border-[#6CB4FF]/50 text-[#6CB4FF]'
              : audioState === 'loading'
              ? 'bg-white/5 border-white/10 text-[#9895B5] cursor-wait'
              : 'bg-white/5 border-white/10 text-[#9895B5] hover:border-white/25 hover:text-[#C8C5E8]'
            }`}
        >
          {audioState === 'loading' ? (
            <Loader size={10} className="animate-spin" />
          ) : isCurrentlyExplaining ? (
            <Square size={10} fill="currentColor" />
          ) : (
            <Volume2 size={10} />
          )}
          {audioState === 'loading' ? 'Loading…' : isCurrentlyExplaining ? 'Stop' : 'Explain'}
        </button>
      </div>

      {/* ── Slide visual body (white card feel) ── */}
      <div className={`px-4 pb-4 pt-3 ${isHighlighted ? 'bg-[#6CB4FF]/5' : isActive ? 'bg-[#231F44]' : 'bg-[#1A1730]'}`}>
        {/* Title */}
        <h3 className={`text-[14px] font-bold leading-snug mb-2.5
          ${isHighlighted ? 'text-white' : isActive ? 'text-white' : 'text-[#E8E5FF]'}`}>
          {slide.title}
        </h3>

        {/* Body content as bullet points */}
        {bodyLines.length > 0 && (
          <ul className="space-y-1.5">
            {bodyLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`w-1 h-1 rounded-full flex-shrink-0 mt-2
                  ${isHighlighted ? 'bg-[#6CB4FF]' : 'bg-[#6B6888]'}`} />
                <span className="text-[#8B88A8] text-[12px] leading-relaxed line-clamp-2">
                  {line}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Concepts on this slide */}
        {slide.concepts?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {slide.concepts.slice(0, 3).map((c, i) => (
              <span key={i}
                className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[#9895B5] text-[10px] border border-white/[0.05]">
                {c.title?.slice(0, 28)}
              </span>
            ))}
            {slide.concepts.length > 3 && (
              <span className="text-[#6B6888] text-[10px] px-1 self-center">
                +{slide.concepts.length - 3}
              </span>
            )}
          </div>
        )}

        {/* AI explanation text (shown while speaking or after done) */}
        <AnimatePresence>
          {explanation && (audioState === 'speaking' || audioState === 'done') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t border-white/[0.06]"
            >
              <div className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5
                  ${isCurrentlyExplaining ? 'bg-[#6CB4FF] animate-pulse' : 'bg-[#6B6888]'}`} />
                <p className="text-[#9895B5] text-[11px] leading-relaxed italic">
                  {explanation}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {audioError && (
          <p className="mt-2 text-[#FF916C] text-[10px]">{audioError}</p>
        )}
      </div>
    </motion.div>
  )
}

// ── Nav controls ──────────────────────────────────────────────────────────

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
      <span className="text-[#9895B5] text-xs tabular-nums" aria-live="polite">
        {current} / {total}
      </span>
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
          <p className="text-[#9895B5] text-sm">Loading slides…</p>
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
        <p className="text-[#9895B5] text-sm">No slides available.</p>
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
          <span className="text-[#4B4868] text-[10px]">· tap Explain for AI audio</span>
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

      {/* Slide cards */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#3D3660 transparent',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        }}
      >
        {filtered.length === 0 ? (
          <p className="text-[#9895B5] text-xs text-center py-8">No matches found.</p>
        ) : (
          filtered.map(slide => (
            <SlideCard
              key={slide.number}
              slide={slide}
              isActive={slide.number === activeSlide}
              isHighlighted={slide.number === highlightSlideNo}
              uploadId={uploadId}
              token={token}
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
