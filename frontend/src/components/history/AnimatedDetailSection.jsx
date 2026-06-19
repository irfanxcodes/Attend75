import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Smoothly animates height changes and crossfades content when switching dates.
 * - Shows skeleton immediately when loading
 * - Measures content height and transitions smoothly
 * - Crossfades from skeleton → real content, or from old content → new content
 */
function AnimatedDetailSection({ contentKey, isLoading, children }) {
  const contentRef = useRef(null)
  const [measuredHeight, setMeasuredHeight] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | fadeOut | fadeIn
  const [renderedChildren, setRenderedChildren] = useState(children)
  const [renderedLoading, setRenderedLoading] = useState(isLoading)
  const prevKeyRef = useRef(contentKey)
  const fadeOutTimer = useRef(null)

  // Determine what to actually display right now
  const showSkeleton = renderedLoading
  const showContent = !renderedLoading && renderedChildren

  // Handle contentKey or isLoading changes
  useEffect(() => {
    const keyChanged = prevKeyRef.current !== contentKey

    if (keyChanged) {
      prevKeyRef.current = contentKey

      // If we had content before, fade it out first
      if (measuredHeight > 0 && !isLoading) {
        // Switching between two cached dates — crossfade
        setPhase('fadeOut')
        clearTimeout(fadeOutTimer.current)
        fadeOutTimer.current = setTimeout(() => {
          setRenderedChildren(children)
          setRenderedLoading(isLoading)
          setPhase('fadeIn')
        }, 150)
      } else {
        // First load or switching to a loading state — show immediately
        setRenderedChildren(children)
        setRenderedLoading(isLoading)
        setPhase('fadeIn')
      }
    } else {
      // Same key — loading state changed (fetch completed) or children updated
      if (renderedLoading && !isLoading) {
        // Fetch just finished: crossfade from skeleton to content
        setPhase('fadeOut')
        clearTimeout(fadeOutTimer.current)
        fadeOutTimer.current = setTimeout(() => {
          setRenderedChildren(children)
          setRenderedLoading(false)
          setPhase('fadeIn')
        }, 150)
      } else {
        // Direct update (children changed without loading toggle)
        setRenderedChildren(children)
        setRenderedLoading(isLoading)
        if (phase === 'idle') {
          setPhase('fadeIn')
        }
      }
    }

    return () => clearTimeout(fadeOutTimer.current)
  }, [contentKey, isLoading, children]) // eslint-disable-line react-hooks/exhaustive-deps

  // After fadeIn starts, mark it complete
  useEffect(() => {
    if (phase === 'fadeIn') {
      const timer = setTimeout(() => setPhase('idle'), 250)
      return () => clearTimeout(timer)
    }
  }, [phase])

  // Measure height with ResizeObserver
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    const measure = () => {
      const h = el.scrollHeight
      if (h > 0) setMeasuredHeight(h)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [renderedChildren, renderedLoading, showSkeleton, showContent])

  const hasContent = showSkeleton || showContent
  const targetHeight = hasContent ? measuredHeight : 0

  // Opacity/transform classes based on phase
  const contentClasses =
    phase === 'fadeOut'
      ? 'opacity-0 translate-y-1'
      : phase === 'fadeIn'
        ? 'opacity-100 translate-y-0'
        : 'opacity-100 translate-y-0'

  return (
    <div
      className="overflow-hidden transition-[height] duration-300 ease-in-out"
      style={{ height: `${targetHeight}px` }}
    >
      <div ref={contentRef}>
        <div className={`transition-[opacity,transform] duration-200 ease-out ${contentClasses}`}>
          {showSkeleton ? <DetailSkeleton /> : renderedChildren}
        </div>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="rounded-2xl bg-[#4A466A] p-4 ring-1 ring-white/5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <div className="h-5 w-20 rounded bg-[#565275]" />
          <div className="h-4 w-16 rounded bg-[#565275]" />
        </div>
        <div className="h-6 w-20 rounded-full bg-[#565275]" />
      </div>
      {/* Card skeletons */}
      <div className="mt-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border-l-[3px] border-l-[#565275] bg-[#565275]/60 px-4 py-3"
          >
            <div className="h-4 flex-1 rounded bg-[#4A466A]" />
            <div className="h-4 w-14 rounded bg-[#4A466A]" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default AnimatedDetailSection
