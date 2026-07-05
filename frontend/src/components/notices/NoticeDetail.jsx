import { useEffect, useState } from 'react'
import { X, FileText } from 'lucide-react'
import { fetchNoticeDetail, getNoticePdfUrl } from '../../services/noticesApi'
import PdfViewerModal from './PdfViewerModal'

const CATEGORY_COLORS = {
  'Exam': '#FF5B5B',
  'Fee': '#FFB23E',
  'Academic': '#6CB4FF',
  'Internship': '#A78BFA',
  'Event': '#4EF0A0',
  'Guest Lecture': '#D97706',
  'General': '#7a6f94',
}

function NoticeDetail({ notice, token, onClose }) {
  const [detail, setDetail] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showPdf, setShowPdf] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    let active = true
    setIsLoading(true)

    fetchNoticeDetail({ token, noticeId: notice.noticeId })
      .then((data) => { if (active) setDetail(data) })
      .catch(() => {})
      .finally(() => { if (active) setIsLoading(false) })

    return () => { active = false }
  }, [notice.noticeId, token])

  const categoryColor = CATEGORY_COLORS[notice.category] || '#7a6f94'
  const pdfUrl = getNoticePdfUrl(notice.noticeId, token)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
        {/* Modal */}
        <div
          className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[#3D3660] shadow-2xl ring-1 ring-white/10 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ backgroundColor: `${categoryColor}20`, color: categoryColor }}>
                {notice.category}
              </span>
              {notice.isImportant && <span className="text-sm">🔥</span>}
            </div>
            <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[#F7F4FF] transition hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Title */}
            <h2 className="text-base font-bold leading-snug text-[#F7F4FF]">{notice.title}</h2>

            {/* Date */}
            <p className="text-[10px] text-[#9F9AB5]">
              {notice.portalDate && new Date(notice.portalDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>

            {/* Loading */}
            {isLoading && (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
              </div>
            )}

            {/* Full extracted text */}
            {detail?.cleanedText && (
              <div className="rounded-xl bg-[#2D2845] p-4 ring-1 ring-white/5">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#9F9AB5]">Full extracted text</p>
                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[#D8D4E7]">
                  {detail.cleanedText}
                </pre>
              </div>
            )}

            {!isLoading && !detail?.cleanedText && (
              <p className="text-xs text-[#9F9AB5]">No text content could be extracted from this notice.</p>
            )}
          </div>

          {/* Footer — View PDF button */}
          <div className="border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowPdf(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF916C] py-3 text-sm font-bold text-[#1D183E] shadow-[0_4px_16px_rgba(255,145,108,0.3)] transition active:scale-[0.98]"
            >
              <FileText className="h-4 w-4" />
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
