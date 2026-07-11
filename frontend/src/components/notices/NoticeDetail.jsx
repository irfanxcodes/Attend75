import { useEffect, useState } from 'react'
import { X, FileText } from 'lucide-react'
import { fetchNoticeDetail, getNoticePdfUrl } from '../../services/noticesApi'
import useAppStore from '../../hooks/useAppStore'
import PdfViewerModal from './PdfViewerModal'

function highlightLine(line, terms) {
  if (!terms.length) return line.trim()
  // Build regex matching any of the terms (case-insensitive)
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = line.trim().split(regex)
  if (parts.length === 1) return line.trim()
  return parts.map((part, i) => {
    if (regex.test(part)) {
      return <mark key={i} className="rounded bg-[#4EF0A0]/25 px-0.5 text-[#4EF0A0] font-semibold">{part}</mark>
    }
    // Reset regex lastIndex since we use 'g' flag
    regex.lastIndex = 0
    return part
  })
}

const CATEGORY_COLORS = {
  'Exam': '#FF5B5B',
  'Fee': '#FFB23E',
  'Academic': '#6CB4FF',
  'Internship': '#A78BFA',
  'Event': '#4EF0A0',
  'Guest Lecture': '#D97706',
  'General': '#7a6f94',
}

/**
 * Detect ASCII table blocks (lines starting with + or |) and render them
 * in a scrollable monospace <pre>, while rendering normal text as <p> lines.
 */
function renderExtractedText(text, highlightTerms) {
  const lines = text.split('\n')
  const blocks = []
  let currentBlock = { type: 'text', lines: [] }

  for (const line of lines) {
    const trimmed = line.trim()
    const isTableLine = trimmed.startsWith('+') && trimmed.endsWith('+') || trimmed.startsWith('|') && trimmed.endsWith('|')

    if (isTableLine) {
      if (currentBlock.type !== 'table') {
        if (currentBlock.lines.length > 0) blocks.push(currentBlock)
        currentBlock = { type: 'table', lines: [] }
      }
      currentBlock.lines.push(line)
    } else {
      if (currentBlock.type !== 'text') {
        if (currentBlock.lines.length > 0) blocks.push(currentBlock)
        currentBlock = { type: 'text', lines: [] }
      }
      if (trimmed) currentBlock.lines.push(line)
    }
  }
  if (currentBlock.lines.length > 0) blocks.push(currentBlock)

  return blocks.map((block, blockIdx) => {
    if (block.type === 'table') {
      const hasHighlight = highlightTerms.length > 0 && block.lines.some(l => {
        const upper = l.toUpperCase()
        return highlightTerms.some(t => upper.includes(t.toUpperCase()))
      })

      if (hasHighlight) {
        // Render line-by-line so we can highlight matching lines
        return (
          <div key={blockIdx} className="-mx-2 overflow-x-auto rounded-lg bg-[#2E2A3A]/60 p-2">
            <pre className="text-[11px] leading-snug text-[#D8D4E7] font-mono whitespace-pre">
              {block.lines.map((line, i) => {
                const upper = line.toUpperCase()
                const isMatch = highlightTerms.some(t => upper.includes(t.toUpperCase()))
                if (isMatch) {
                  return <span key={i} className="bg-[#4EF0A0]/20 text-[#4EF0A0] font-semibold block">{line}{'\n'}</span>
                }
                return <span key={i}>{line}{'\n'}</span>
              })}
            </pre>
          </div>
        )
      }

      return (
        <div key={blockIdx} className="-mx-2 overflow-x-auto rounded-lg bg-[#2E2A3A]/60 p-2">
          <pre className="text-[11px] leading-snug text-[#D8D4E7] font-mono whitespace-pre">
            {block.lines.join('\n')}
          </pre>
        </div>
      )
    }
    return block.lines.map((line, i) => (
      <p key={`${blockIdx}-${i}`}>{highlightLine(line, highlightTerms)}</p>
    ))
  })
}

function NoticeDetail({ notice, token, onClose }) {
  const { state: { user } } = useAppStore()
  const [detail, setDetail] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showPdf, setShowPdf] = useState(false)

  // Build highlight terms from the logged-in user
  const highlightTerms = []
  const rollNumber = (user.rollNumber || '').trim().toUpperCase()
  const userName = (user.portalName || user.name || '').trim().toUpperCase()
  if (rollNumber) highlightTerms.push(rollNumber)
  if (userName && userName.length > 3) highlightTerms.push(userName)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const loadDetail = () => {
    setIsLoading(true)
    setLoadError(false)
    fetchNoticeDetail({ token, noticeId: notice.noticeId })
      .then((data) => { setDetail(data) })
      .catch(() => { setLoadError(true) })
      .finally(() => { setIsLoading(false) })
  }

  useEffect(() => {
    loadDetail()
  }, [notice.noticeId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const categoryColor = CATEGORY_COLORS[notice.category] || '#7a6f94'
  const pdfUrl = getNoticePdfUrl(notice.noticeId, token)
  const actualDate = notice.portalDate
    ? new Date(notice.portalDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
        {/* Modal */}
        <div
          className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-[#2E2A3A] shadow-2xl ring-1 ring-white/10 sm:rounded-[28px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-semibold" style={{ color: categoryColor }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor }} />
              {notice.category}
            </span>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[#F7F4FF] transition hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            {/* Title */}
            <h2 className="mt-2 text-xl font-bold leading-tight text-[#F7F4FF]">{notice.title}</h2>

            {/* Date */}
            <p className="mt-2 text-[12px] italic text-[#9F9AB5]">{actualDate}</p>

            {/* Loading */}
            {isLoading && (
              <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl bg-[#3D3660] py-10 ring-1 ring-white/5">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
                <p className="text-[11px] text-[#9F9AB5]">Loading notice content...</p>
              </div>
            )}

            {/* Error — retry */}
            {!isLoading && loadError && (
              <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-[#3D3660] py-8 ring-1 ring-white/5">
                <p className="text-[12px] text-[#9F9AB5]">Couldn't load content right now</p>
                <button
                  type="button"
                  onClick={loadDetail}
                  className="rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold text-[#F7F4FF] transition hover:bg-white/15"
                >
                  Try again
                </button>
              </div>
            )}

            {/* AI Overview — extracted text */}
            {!isLoading && !loadError && detail?.cleanedText && (
              <div className="mt-5 rounded-2xl bg-[#3D3660] p-5 ring-1 ring-white/5">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F9AB5]">AI Overview</p>
                <div className="space-y-3 text-[13px] leading-relaxed text-[#D8D4E7]">
                  {renderExtractedText(detail.cleanedText, highlightTerms)}
                </div>
              </div>
            )}

            {!isLoading && !loadError && !detail?.cleanedText && (
              <div className="mt-5 rounded-2xl bg-[#3D3660] p-5 ring-1 ring-white/5">
                <p className="text-[13px] text-[#9F9AB5]">This notice contains an image-based PDF. Tap "View Original PDF" below to read it.</p>
              </div>
            )}
          </div>

          {/* Footer — View PDF button */}
          <div className="border-t border-white/5 px-5 py-4">
            <button
              type="button"
              onClick={() => setShowPdf(true)}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#ECA384] py-4 text-[15px] font-bold text-[#1D183E] shadow-[0_4px_20px_rgba(236,163,132,0.3)] transition active:scale-[0.97]"
            >
              <FileText className="h-5 w-5" />
              View Original PDF
            </button>
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      {showPdf && <PdfViewerModal url={pdfUrl} onClose={() => setShowPdf(false)} />}
    </>
  )
}

export default NoticeDetail
