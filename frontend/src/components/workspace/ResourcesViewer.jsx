/**
 * ResourcesViewer — Phase 7 contextual resources for the current concept.
 *
 * Lazy-loaded: only fetches resources when the tab is opened.
 * Shows YouTube search links and source document references.
 *
 * IMPORTANT: YouTube links open as search queries, NOT direct video URLs.
 * This avoids hallucinated/dead video URLs per the spec rule.
 */
import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react'
import { getConceptResources } from '../../services/lessonApi'

// ── YouTube icon (inline SVG, no external dependency) ─────────────────────

function YouTubeIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="5" fill="#FF0000" />
      <polygon points="10,8 10,16 17,12" fill="white" />
    </svg>
  )
}

// ── YouTube search card ────────────────────────────────────────────────────

function YouTubeCard({ resource }) {
  return (
    <a
      href={resource.search_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-[#1E1B3A] border border-white/[0.06]
                 hover:bg-[#252241] hover:border-white/[0.12] transition-all duration-150 group"
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        <YouTubeIcon size={18} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white leading-snug">
          {resource.title}
        </p>
        <p className="text-[12px] text-[#9895B5] mt-0.5 leading-snug line-clamp-2">
          "{resource.query}"
        </p>
        <p className="text-[11px] text-[#6B6890] mt-1">Opens YouTube search</p>
      </div>

      {/* Arrow */}
      <div className="flex-shrink-0 mt-0.5 text-[#6B6890] group-hover:text-[#9895B5] transition-colors">
        <ExternalLink size={14} />
      </div>
    </a>
  )
}

// ── Source reference card ─────────────────────────────────────────────────

function SourceRefCard({ sourceRef, onViewSource }) {
  const handleClick = () => {
    if (onViewSource && sourceRef.slide_or_page) {
      onViewSource(sourceRef.slide_or_page)
    }
  }

  return (
    <button
      onClick={handleClick}
      aria-label={`View source — slide ${sourceRef.slide_or_page || 'unknown'}`}
      className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl bg-[#1E1B3A] border border-white/[0.06]
                 hover:bg-[#252241] hover:border-white/[0.12] transition-all duration-150 group text-left"
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5 text-[#FF916C]">
        <BookOpen size={16} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white leading-snug">
          {sourceRef.title}
        </p>
        <p className="text-[12px] text-[#9895B5] mt-0.5 leading-snug">
          {sourceRef.slide_or_page ? `Slide ${sourceRef.slide_or_page}` : null}
          {sourceRef.slide_or_page && sourceRef.heading ? ' · ' : null}
          {sourceRef.heading ? `"${sourceRef.heading}"` : null}
        </p>
      </div>

      {/* Arrow */}
      <div className="flex-shrink-0 mt-0.5 text-[#6B6890] group-hover:text-[#9895B5] transition-colors">
        <ChevronRight size={14} />
      </div>
    </button>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function ResourcesSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-4" aria-label="Loading resources…">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="h-[68px] rounded-xl bg-[#1E1B3A] border border-white/[0.06] animate-pulse"
        />
      ))}
    </div>
  )
}

// ── Empty / error states ──────────────────────────────────────────────────

function EmptyState({ message }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <p className="text-[#9895B5] text-sm text-center leading-relaxed">{message}</p>
    </div>
  )
}

function ErrorState({ onRetry }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-3">
      <p className="text-[#9895B5] text-sm text-center">
        Couldn't load resources. Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10
                   text-[#9895B5] text-xs hover:bg-white/8 transition-colors"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  )
}

// ── Main ResourcesViewer ──────────────────────────────────────────────────

/**
 * @param {string|null} token         — auth token
 * @param {string|null} conceptId     — current concept UUID
 * @param {string}      conceptTitle  — current concept title
 * @param {string|null} uploadId      — chapter upload id (for source navigation)
 * @param {Function}    onViewSource  — (slideNo) → navigate to source tab
 */
export function ResourcesViewer({ token, conceptId, conceptTitle, uploadId, onViewSource }) {
  const [status, setStatus] = useState('idle')   // 'idle' | 'loading' | 'loaded' | 'error'
  const [data, setData]     = useState(null)
  const cacheRef            = useRef(new Map())   // conceptId → response data

  const fetchResources = (id) => {
    if (!id || !token) return

    // Cache hit — serve immediately
    if (cacheRef.current.has(id)) {
      setData(cacheRef.current.get(id))
      setStatus('loaded')
      return
    }

    setStatus('loading')
    setData(null)

    getConceptResources({ token, conceptId: id })
      .then(result => {
        cacheRef.current.set(id, result)
        setData(result)
        setStatus('loaded')
      })
      .catch(() => {
        setStatus('error')
      })
  }

  // Fetch when conceptId changes
  useEffect(() => {
    if (conceptId) {
      fetchResources(conceptId)
    } else {
      setStatus('idle')
      setData(null)
    }
  }, [conceptId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#1D183E]">

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <h2 className="text-[13px] font-semibold text-white">Resources</h2>
        {data?.concept_title && (
          <p className="text-[11px] text-[#9895B5] mt-0.5 truncate">
            {data.concept_title}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        {status === 'idle' && (
          <EmptyState message="Open a concept in the Canvas to see resources." />
        )}

        {status === 'loading' && <ResourcesSkeleton />}

        {status === 'error' && (
          <ErrorState onRetry={() => fetchResources(conceptId)} />
        )}

        {status === 'loaded' && data && (
          <div className="flex flex-col gap-2.5 px-4 py-4">

            {/* YouTube search cards */}
            {(data.resources || []).length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold text-[#6B6890] uppercase tracking-wider px-0.5">
                  Video Explanations
                </p>
                {data.resources.map((resource, idx) => (
                  <YouTubeCard key={idx} resource={resource} />
                ))}
              </div>
            )}

            {/* Source document reference */}
            {(data.source_references || []).length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                <p className="text-[10px] font-semibold text-[#6B6890] uppercase tracking-wider px-0.5">
                  Source Document
                </p>
                {data.source_references.map((ref, idx) => (
                  <SourceRefCard key={idx} sourceRef={ref} onViewSource={onViewSource} />
                ))}
              </div>
            )}

            {/* Empty data guard */}
            {(data.resources || []).length === 0 &&
             (data.source_references || []).length === 0 && (
              <EmptyState message="No resources found for this concept." />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
