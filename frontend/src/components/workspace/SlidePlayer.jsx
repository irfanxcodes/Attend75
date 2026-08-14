/**
 * SlidePlayer — OpenMAIC-style AI teaching player.
 *
 * Shows actual rendered PPT/PDF slide images.
 * Plays an AI-generated action sequence per slide:
 *   - spotlight: dims the slide, glowing border on focused region
 *   - speech:    AI teacher explains (not reads) the slide
 *   - pause:     brief moment to absorb
 *
 * Teaching scripts: generated once per slide, cached in DB.
 * Every student reuses the same script — zero LLM cost after first access.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Play, Pause,
  Loader, AlertCircle, Layers, Volume2,
  ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { getSlidesList, getTeachingScript, resolveSlideImageUrl, submitSlideFeedback } from '../../services/lessonApi'
import { useWebSpeech } from '../../hooks/useWebSpeech'

// ── Semantic region fallbacks (normalized 0–1) ────────────────────────────────
// Used when AI doesn't return explicit coordinates.
// These cover the actual slide content area, not the full container.
const FALLBACK_REGIONS = {
  title:  { x: 0.03, y: 0.02, w: 0.94, h: 0.22 },
  body:   { x: 0.03, y: 0.26, w: 0.94, h: 0.60 },
  table:  { x: 0.03, y: 0.30, w: 0.94, h: 0.58 },
  image:  { x: 0.05, y: 0.20, w: 0.90, h: 0.65 },
  full:   { x: 0.01, y: 0.01, w: 0.98, h: 0.98 },
}

// ── Spotlight overlay ─────────────────────────────────────────────────────────
// Dims everything except the focused region.
// coords are normalized (0–1) relative to the RENDERED IMAGE size, not the container.

function SpotlightOverlay({ action, imgRect }) {
  if (!action || !imgRect || imgRect.w <= 0 || imgRect.h <= 0) return null

  const raw = action.coords || FALLBACK_REGIONS[action.fallback_region] || FALLBACK_REGIONS.full
  const pad = 8

  // Convert normalized coords to pixels relative to image position within container
  const x = imgRect.x + raw.x * imgRect.w - pad
  const y = imgRect.y + raw.y * imgRect.h - pad
  const w = raw.w * imgRect.w + pad * 2
  const h = raw.h * imgRect.h + pad * 2

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Dark overlay with SVG cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="sp-mask">
            <rect width="100%" height="100%" fill="white" />
            <motion.rect
              key={`${x.toFixed(0)}-${y.toFixed(0)}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              x={Math.max(0, x)} y={Math.max(0, y)}
              width={w} height={h}
              rx={6} fill="black"
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.50)" mask="url(#sp-mask)" />
      </svg>

      {/* Highlight border */}
      <motion.div
        key={`b-${x.toFixed(0)}-${y.toFixed(0)}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="absolute rounded-xl"
        style={{
          left:   Math.max(0, x),
          top:    Math.max(0, y),
          width:  w,
          height: h,
          border: '2px solid rgba(108,180,255,0.85)',
          boxShadow: '0 0 18px 3px rgba(108,180,255,0.30)',
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  )
}

// ── Teacher bubble ────────────────────────────────────────────────────────────
// Words reveal in exact sync with TTS via boundary events.
// currentWordIdx is driven by onBoundary events from the speech action executor.

function TeacherBubble({ text, isActive, currentWordIdx }) {
  const words = text ? text.split(' ') : []

  if (!text) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-0 left-0 right-0 px-4 pb-3 pointer-events-none z-30"
    >
      <div className="max-w-2xl mx-auto w-full">
        <div className="bg-[#0D0B1F] border border-[#FF916C]/20
                        rounded-2xl px-4 py-3 shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <motion.div
              className="w-2 h-2 rounded-full bg-[#FF916C] flex-shrink-0"
              animate={isActive ? { opacity: [1, 0.3, 1] } : { opacity: 0.3 }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <span className="text-[#FF916C] text-[10px] font-bold uppercase tracking-wider">
              AI Teacher
            </span>
          </div>
          <p className="text-white text-[13px] leading-relaxed break-words whitespace-normal">
            {words.map((word, i) => (
              <span
                key={i}
                className={`mr-1 transition-opacity duration-100 inline
                  ${i <= currentWordIdx ? 'opacity-100' : 'opacity-20'}`}
              >
                {word}
              </span>
            ))}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

// ── Slide feedback (thumbs up / down) ────────────────────────────────────────
// Shown for ~5 s after the final speech action of a slide completes.
// Dismiss on rating or automatically after timeout.

const REASON_OPTIONS = [
  { value: 'too_fast',      label: 'Too fast' },
  { value: 'wrong_content', label: 'Wrong content' },
  { value: 'unclear',       label: 'Unclear' },
  { value: 'off_topic',     label: 'Off topic' },
]

function SlideFeedback({ token, uploadId, slideNo, onDismiss }) {
  const [voted, setVoted]             = useState(null)   // 1 | -1 | null
  const [showReasons, setShowReasons] = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const dismissTimer = useRef(null)

  // Auto-dismiss after 5 s if student ignores it
  useEffect(() => {
    dismissTimer.current = setTimeout(onDismiss, 5000)
    return () => clearTimeout(dismissTimer.current)
  }, [onDismiss])

  const handleVote = (rating) => {
    clearTimeout(dismissTimer.current)
    setVoted(rating)
    if (rating === 1) {
      // Thumbs up — submit immediately, no reason needed
      submitSlideFeedback({ token, uploadId, slideNo, rating: 1 })
      setSubmitted(true)
      setTimeout(onDismiss, 1200)
    } else {
      // Thumbs down — ask for a reason
      setShowReasons(true)
    }
  }

  const handleReason = (reason) => {
    submitSlideFeedback({ token, uploadId, slideNo, rating: -1, reason })
    setSubmitted(true)
    setTimeout(onDismiss, 1000)
  }

  const skipReason = () => {
    submitSlideFeedback({ token, uploadId, slideNo, rating: -1, reason: null })
    setSubmitted(true)
    setTimeout(onDismiss, 800)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-0 left-0 right-0 px-4 pb-3 pointer-events-auto z-30"
    >
      <div className="max-w-2xl mx-auto w-full">
        <div className="bg-[#0D0B1F] border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
          {submitted ? (
            <p className="text-[#FF916C] text-[12px] text-center py-1">Thanks for the feedback!</p>
          ) : showReasons ? (
            <div>
              <p className="text-[#9895B5] text-[11px] mb-2">What was the issue?</p>
              <div className="flex flex-wrap gap-1.5">
                {REASON_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleReason(opt.value)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-white/10
                               bg-white/5 text-[#C8C5E8] hover:bg-white/10 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={skipReason}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-white/5
                             text-[#6B6888] hover:text-[#9895B5] transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-[#9895B5] text-[12px]">Was this explanation helpful?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleVote(1)}
                  aria-label="Thumbs up"
                  className="w-8 h-8 rounded-full flex items-center justify-center
                             border border-white/10 bg-white/5 text-[#9895B5]
                             hover:bg-emerald-500/15 hover:border-emerald-500/40
                             hover:text-emerald-400 transition-all active:scale-95"
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  onClick={() => handleVote(-1)}
                  aria-label="Thumbs down"
                  className="w-8 h-8 rounded-full flex items-center justify-center
                             border border-white/10 bg-white/5 text-[#9895B5]
                             hover:bg-rose-500/15 hover:border-rose-500/40
                             hover:text-rose-400 transition-all active:scale-95"
                >
                  <ThumbsDown size={14} />
                </button>
                <button
                  onClick={onDismiss}
                  aria-label="Dismiss feedback"
                  className="text-[#5C5878] text-[11px] hover:text-[#9895B5] px-1 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Slide image with spotlight overlay ───────────────────────────────────────

function SlideView({ imageUrl, slideNo, currentAction, isPlaying, unitLabel = 'Slide' }) {
  const containerRef = useRef(null)
  const imgRef       = useRef(null)
  const [loaded, setLoaded]   = useState(false)
  const [error, setError]     = useState(false)
  const [imgRect, setImgRect] = useState(null)
  // Track all URLs that have already loaded so we skip the spinner on revisit
  const loadedUrls = useRef(new Set())

  // Compute the exact rendered image rect using object-contain math.
  const computeImgRect = useCallback(() => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container || !img.naturalWidth || !img.naturalHeight) return

    // Use the actual rendered bounding boxes — most reliable approach.
    // We call this inside rAF so layout is always complete.
    const cRect = container.getBoundingClientRect()
    const iRect = img.getBoundingClientRect()

    setImgRect({
      x: iRect.left - cRect.left,
      y: iRect.top  - cRect.top,
      w: iRect.width,
      h: iRect.height,
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    computeImgRect()
    const obs = new ResizeObserver(() => {
      requestAnimationFrame(computeImgRect)
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [loaded, computeImgRect])

  const handleLoad = useCallback(() => {
    if (imageUrl) loadedUrls.current.add(imageUrl)
    setLoaded(true)
    setError(false)
    requestAnimationFrame(() => requestAnimationFrame(computeImgRect))
  }, [computeImgRect, imageUrl])

  // When imageUrl changes: reset imgRect + error.
  // Only show spinner if this URL hasn't been loaded before —
  // if it has, the browser cache serves it instantly (no flash).
  useEffect(() => {
    setImgRect(null)
    setError(false)
    const alreadyLoaded = imageUrl && loadedUrls.current.has(imageUrl)
    setLoaded(alreadyLoaded)
    if (alreadyLoaded) {
      // Image is cached — measure immediately
      requestAnimationFrame(() => requestAnimationFrame(computeImgRect))
    }
  }, [imageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      {/* Slide / Page number badge */}
      <div className="absolute top-3 right-3 z-20 bg-black/60 text-white/70
                      text-[11px] font-bold px-2.5 py-1 rounded-lg pointer-events-none">
        {unitLabel} {slideNo}
      </div>

      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1A1730]">
          <Loader size={18} className="text-[#FF916C] animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-3 text-[#9895B5]">
          <AlertCircle size={26} className="text-[#6B6888]" />
          <p className="text-sm">{unitLabel} image not available</p>
        </div>
      )}

      {!error && (
        <img
          ref={imgRef}
          key={imageUrl}
          src={imageUrl}
          alt={`${unitLabel} ${slideNo}`}
          onLoad={handleLoad}
          onError={() => { setError(true); setLoaded(false) }}
          className={`max-w-full max-h-full object-contain rounded-xl shadow-2xl select-none
                      transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
        />
      )}

      {/* Spotlight — only shown when playing a spotlight action AND image is measured */}
      <AnimatePresence>
        {isPlaying && currentAction?.type === 'spotlight' && loaded && imgRect && imgRect.w > 0 && (
          <SpotlightOverlay
            key={`sp-${currentAction.fallback_region}-${JSON.stringify(currentAction.coords)}`}
            action={currentAction}
            imgRect={imgRect}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Thumbnail strip ───────────────────────────────────────────────────────────

function ThumbnailStrip({ slides, currentSlide, token, unitLabel = 'Slide', onSelect }) {
  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [currentSlide])

  return (
    <div
      className="flex gap-2 px-4 py-2 overflow-x-auto flex-shrink-0
                 border-t border-white/[0.05] bg-[#0C0A1E]"
      style={{ scrollbarWidth: 'none' }}
    >
      {slides.map(slide => {
        const isActive = slide.slide_number === currentSlide
        const url = resolveSlideImageUrl(slide.image_url, token)
        return (
          <button
            key={slide.slide_number}
            ref={isActive ? activeRef : null}
            onClick={() => onSelect(slide.slide_number)}
            aria-label={`${unitLabel} ${slide.slide_number}: ${slide.title}`}
            className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-150
              ${isActive
                ? 'border-[#FF916C] shadow-md shadow-[#FF916C]/25 opacity-100'
                : 'border-white/[0.08] opacity-50 hover:opacity-80 hover:border-white/20'
              }`}
            style={{ width: 80, height: 52 }}
          >
            {url ? (
              <img src={url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#1A1730] flex items-center justify-center
                              text-[#6B6888] text-[11px] font-medium">
                {slide.slide_number}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Control bar ───────────────────────────────────────────────────────────────

function ControlBar({ current, total, isPlaying, isLoading, speed, onSpeedChange,
                      onPrev, onNext, onPlayPause, slideTitle, unitLabel = 'Slide' }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#0D0B1F]
                    border-t border-white/[0.06] flex-shrink-0">
      {/* Counter */}
      <div
        className="flex items-center gap-1.5 text-[#9895B5] text-xs min-w-[48px]"
        title={`${unitLabel} ${current} of ${total}`}
      >
        <Layers size={11} />
        <span className="tabular-nums">{current}/{total}</span>
      </div>

      {/* Prev / Play / Next */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={current <= 1}
          aria-label="Previous slide"
          className="w-8 h-8 rounded-full bg-white/5 border border-white/8 flex items-center justify-center
                     text-[#9895B5] hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
        >
          <ChevronLeft size={15} />
        </button>

        <button
          onClick={onPlayPause}
          disabled={isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={`w-11 h-11 rounded-full flex items-center justify-center
                      transition-all active:scale-95 font-medium
            ${isPlaying
              ? 'bg-[#FF916C] text-white shadow-lg shadow-[#FF916C]/35'
              : isLoading
              ? 'bg-white/8 text-[#9895B5] cursor-wait'
              : 'bg-white/8 border border-white/12 text-[#C8C5E8] hover:bg-white/15'
            }`}
        >
          {isLoading
            ? <Loader size={16} className="animate-spin" />
            : isPlaying
            ? <Pause size={16} fill="currentColor" />
            : <Play  size={16} fill="currentColor" className="ml-0.5" />
          }
        </button>

        <button
          onClick={onNext}
          disabled={current >= total}
          aria-label="Next slide"
          className="w-8 h-8 rounded-full bg-white/5 border border-white/8 flex items-center justify-center
                     text-[#9895B5] hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Slide title */}
      <div className="flex-1 min-w-0 px-1">
        <p className="text-[#9895B5] text-[11px] truncate">{slideTitle}</p>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-1.5">
        <Volume2 size={11} className="text-[#5C5878]" />
        <select
          value={speed}
          onChange={e => onSpeedChange(parseFloat(e.target.value))}
          aria-label="Playback speed"
          className="bg-white/5 border border-white/8 rounded-lg text-[#9895B5] text-[11px]
                     px-2 py-1 focus:outline-none cursor-pointer"
        >
          <option value={0.75}>0.75×</option>
          <option value={1.0}>1×</option>
          <option value={1.25}>1.25×</option>
          <option value={1.5}>1.5×</option>
        </select>
      </div>
    </div>
  )
}

// ── Main SlidePlayer ──────────────────────────────────────────────────────────

export function SlidePlayer({ token, uploadId, highlightSlideNo, onSlideClick }) {
  const { speak, stopSpeaking } = useWebSpeech()

  const [slides, setSlides]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  // "slide" for PPTX/PPT, "page" for PDF/DOCX/DOC — drives all UI labels
  const [elementType, setElementType] = useState('slide')

  const [currentSlide, setCurrentSlide]         = useState(highlightSlideNo || 1)
  const [isPlaying, setIsPlaying]               = useState(false)
  const [isLoadingScript, setIsLoadingScript]   = useState(false)
  const [speed, setSpeed]                       = useState(1.0)
  const [currentAction, setCurrentAction]       = useState(null)
  const [speechText, setSpeechText]             = useState(null)
  const [speechWordIdx, setSpeechWordIdx]       = useState(-1)  // driven by boundary events
  const [scriptCache, setScriptCache]           = useState({})
  const [showFeedback, setShowFeedback]         = useState(false)
  // Track which slide just finished so feedback targets the right slide
  const feedbackSlideRef = useRef(null)

  const isMounted    = useRef(true)
  const playingRef   = useRef(false)
  const actionIdxRef = useRef(0)
  const actionsRef   = useRef([])
  const slidesRef    = useRef([])       // always-current slides list
  const currentSlideRef = useRef(currentSlide) // always-current slide number
  const speedRef     = useRef(speed)    // always-current speed
  const timerRef     = useRef(null)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      stopSpeaking()
      clearTimeout(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs in sync with state
  useEffect(() => { slidesRef.current = slides }, [slides])
  useEffect(() => { currentSlideRef.current = currentSlide }, [currentSlide])
  useEffect(() => { speedRef.current = speed }, [speed])

  // ── Load slides ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !uploadId) return
    console.log('[SlidePlayer] Loading slides for uploadId:', uploadId)
    setLoading(true)
    setError(null)
    getSlidesList({ token, uploadId })
      .then(data => {
        if (!isMounted.current) return
        setSlides(data.slides || [])
        // Use element_type from API — "slide" for PPTX, "page" for PDF/DOCX
        setElementType(data.element_type || data.slides?.[0]?.element_type || 'slide')
        const start = highlightSlideNo || data.slides?.[0]?.slide_number || 1
        setCurrentSlide(start)
      })
      .catch(err => {
        console.error('[SlidePlayer] Error:', err)
        if (isMounted.current) setError(err.message)
      })
      .finally(() => { if (isMounted.current) setLoading(false) })
  }, [token, uploadId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to highlighted slide (from Canvas "View source →")
  useEffect(() => {
    if (highlightSlideNo && highlightSlideNo !== currentSlide) {
      stopAll()
      setCurrentSlide(highlightSlideNo)
    }
  }, [highlightSlideNo]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop everything ────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    playingRef.current = false
    stopSpeaking()
    clearTimeout(timerRef.current)
    setIsPlaying(false)
    setCurrentAction(null)
    setSpeechText(null)
    setSpeechWordIdx(-1)
    setShowFeedback(false)
  }, [stopSpeaking])

  // ── Navigate ───────────────────────────────────────────────────────────
  const goToSlide = useCallback((n) => {
    stopAll()
    setCurrentSlide(n)
    onSlideClick?.(n)
  }, [stopAll, onSlideClick])

  // ── Action executor ────────────────────────────────────────────────────
  // Uses refs for currentSlide and slides so closure is never stale
  const runNextAction = useCallback(() => {
    if (!playingRef.current || !isMounted.current) return

    const actions = actionsRef.current
    const idx     = actionIdxRef.current

    if (idx >= actions.length) {
      // All done — show feedback prompt, then auto-advance
      setCurrentAction(null)
      setSpeechText(null)
      setIsPlaying(false)
      playingRef.current = false

      // Show feedback widget; it will auto-dismiss after 5 s
      feedbackSlideRef.current = currentSlideRef.current
      setShowFeedback(true)

      const allSlides = slidesRef.current
      const cur = currentSlideRef.current
      const last = allSlides[allSlides.length - 1]?.slide_number ?? cur

      if (cur < last) {
        // Auto-advance fires after feedback widget timeout (5 s) + small buffer
        timerRef.current = setTimeout(() => {
          if (isMounted.current) {
            setShowFeedback(false)
            const next = cur + 1
            setCurrentSlide(next)
            currentSlideRef.current = next
            onSlideClick?.(next)
          }
        }, 5400)
      }
      return
    }

    const action = actions[idx]
    actionIdxRef.current = idx + 1

    if (action.type === 'spotlight') {
      setCurrentAction(action)
      setSpeechText(null)
      const holdMs = Math.max((action.duration || 0.6) * 1000, 300)
      timerRef.current = setTimeout(runNextAction, holdMs)

    } else if (action.type === 'speech') {
      setSpeechText(action.text)
      setSpeechWordIdx(-1)
      setCurrentAction(null)

      // Build a char-offset → word-index map so boundary events
      // can reveal exactly the right word as it's spoken
      const words = action.text.split(' ')
      const charOffsets = []
      let offset = 0
      for (const w of words) {
        charOffsets.push(offset)
        offset += w.length + 1  // +1 for the space
      }

      speak(action.text, {
        rate: speedRef.current,
        onBoundary: (charIndex) => {
          if (!isMounted.current || !playingRef.current) return
          // Find which word this character offset belongs to
          let wordIdx = 0
          for (let j = charOffsets.length - 1; j >= 0; j--) {
            if (charOffsets[j] <= charIndex) { wordIdx = j; break }
          }
          setSpeechWordIdx(wordIdx)
        },
        onEnd: () => {
          if (isMounted.current && playingRef.current) {
            // Reveal all words on completion (handles browsers without boundary events)
            setSpeechWordIdx(words.length - 1)
            setSpeechText(null)
            timerRef.current = setTimeout(runNextAction, 300)
          }
        },
        onError: () => {
          if (isMounted.current && playingRef.current) {
            setSpeechText(null)
            timerRef.current = setTimeout(runNextAction, 300)
          }
        },
      })

    } else if (action.type === 'pause') {
      setCurrentAction(null)
      setSpeechText(null)
      const pauseMs = Math.min((action.duration || 1.0) * 1000, 4000)
      timerRef.current = setTimeout(runNextAction, pauseMs)

    } else {
      runNextAction()
    }
  }, [speak, onSlideClick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Play / pause ───────────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (isPlaying) {
      stopAll()
      return
    }

    const slideNo = currentSlideRef.current

    // Use cached script if available
    if (scriptCache[slideNo]) {
      actionIdxRef.current = 0
      actionsRef.current   = scriptCache[slideNo]
      playingRef.current   = true
      setIsPlaying(true)
      runNextAction()
      return
    }

    // Fetch from backend (generate once, cached forever in DB)
    setIsLoadingScript(true)
    try {
      const data = await getTeachingScript({ token, uploadId, slideNo })
      if (!isMounted.current) return

      setScriptCache(prev => ({ ...prev, [slideNo]: data.actions }))
      actionIdxRef.current = 0
      actionsRef.current   = data.actions
      playingRef.current   = true
      setIsPlaying(true)
      runNextAction()
    } catch (err) {
      // Minimal fallback
      if (isMounted.current) {
        const fallback = [
          { type: 'spotlight', fallback_region: 'title', duration: 0.7 },
          { type: 'speech',    text: 'Let\'s study this slide carefully.' },
          { type: 'spotlight', fallback_region: 'body',  duration: 0.5 },
        ]
        actionsRef.current   = fallback
        actionIdxRef.current = 0
        playingRef.current   = true
        setIsPlaying(true)
        runNextAction()
      }
    } finally {
      if (isMounted.current) setIsLoadingScript(false)
    }
  }, [isPlaying, scriptCache, token, uploadId, stopAll, runNextAction])

  // Speed change — restart current slide with new speed if playing
  const handleSpeedChange = useCallback((newSpeed) => {
    setSpeed(newSpeed)
    speedRef.current = newSpeed
    if (isPlaying) {
      // Stop and restart from beginning of this slide's script
      stopAll()
    }
  }, [isPlaying, stopAll])

  // ── Derived ────────────────────────────────────────────────────────────
  const currentSlideData = slides.find(s => s.slide_number === currentSlide)
  const imageUrl    = currentSlideData ? resolveSlideImageUrl(currentSlideData.image_url, token) : null
  const totalSlides = slides.length
  // Use capitalised label everywhere — "Slide N" or "Page N"
  const unitLabel   = elementType === 'page' ? 'Page' : 'Slide'
  const slideTitle  = currentSlideData?.title || `${unitLabel} ${currentSlide}`

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader size={20} className="text-[#FF916C] animate-spin mx-auto mb-2" />
          <p className="text-[#9895B5] text-sm">Loading {elementType === 'page' ? 'pages' : 'slides'}…</p>
        </div>
      </div>
    )
  }

  if (error || slides.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
        <AlertCircle size={28} className="text-[#6B6888]" />
        <p className="text-[#9895B5] text-sm font-medium">
          {unitLabel}s not available
        </p>
        <p className="text-[#6B6888] text-xs max-w-xs leading-relaxed">
          {error || `${unitLabel} images are generated when a PPT or PDF is uploaded. Re-upload the file to generate them.`}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0F0D26]">

      {/* ── Main slide area ── */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden">
        {imageUrl && (
          <SlideView
            imageUrl={imageUrl}
            slideNo={currentSlide}
            currentAction={isPlaying ? currentAction : null}
            isPlaying={isPlaying}
            unitLabel={unitLabel}
          />
        )}

        {/* Teacher bubble — shown while playing; feedback widget shown after slide finishes */}
        <AnimatePresence mode="wait">
          {isPlaying && speechText && (
            <TeacherBubble
              key="teacher-bubble"
              text={speechText}
              isActive={isPlaying}
              currentWordIdx={speechWordIdx}
            />
          )}
          {!isPlaying && showFeedback && feedbackSlideRef.current && (
            <SlideFeedback
              key={`feedback-${feedbackSlideRef.current}`}
              token={token}
              uploadId={uploadId}
              slideNo={feedbackSlideRef.current}
              onDismiss={() => {
                clearTimeout(timerRef.current)
                setShowFeedback(false)
                // Advance to next slide (same logic as auto-advance above)
                const cur = feedbackSlideRef.current
                const allSlides = slidesRef.current
                const last = allSlides[allSlides.length - 1]?.slide_number ?? cur
                if (cur < last && isMounted.current) {
                  const next = cur + 1
                  setCurrentSlide(next)
                  currentSlideRef.current = next
                  onSlideClick?.(next)
                }
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Thumbnails ── */}
      {slides.length > 1 && (
        <ThumbnailStrip
          slides={slides}
          currentSlide={currentSlide}
          token={token}
          unitLabel={unitLabel}
          onSelect={goToSlide}
        />
      )}

      {/* ── Controls ── */}
      <ControlBar
        current={currentSlide}
        total={totalSlides}
        isPlaying={isPlaying}
        isLoading={isLoadingScript}
        speed={speed}
        unitLabel={unitLabel}
        onSpeedChange={handleSpeedChange}
        onPrev={() => { if (currentSlide > 1) goToSlide(currentSlide - 1) }}
        onNext={() => { if (currentSlide < totalSlides) goToSlide(currentSlide + 1) }}
        onPlayPause={handlePlayPause}
        slideTitle={slideTitle}
      />
    </div>
  )
}
