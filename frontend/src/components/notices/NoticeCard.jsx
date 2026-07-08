import { Bookmark, Calendar, Building2, FileText, Share } from 'lucide-react'

const CATEGORY_COLORS = {
  'Exam': '#FF5B5B',
  'Fee': '#FFB23E',
  'Academic': '#6CB4FF',
  'Internship': '#A78BFA',
  'Event': '#4EF0A0',
  'Guest Lecture': '#D97706',
  'General': '#7a6f94',
}

const CATEGORY_GRADIENTS = {
  'Exam': 'linear-gradient(135deg, rgba(255,91,91,0.25) 0%, rgba(255,91,91,0.05) 100%)',
  'Fee': 'linear-gradient(135deg, rgba(255,178,62,0.25) 0%, rgba(255,178,62,0.05) 100%)',
  'Academic': 'linear-gradient(135deg, rgba(108,180,255,0.25) 0%, rgba(108,180,255,0.05) 100%)',
  'Internship': 'linear-gradient(135deg, rgba(167,139,250,0.25) 0%, rgba(167,139,250,0.05) 100%)',
  'Event': 'linear-gradient(135deg, rgba(78,240,160,0.25) 0%, rgba(78,240,160,0.05) 100%)',
  'Guest Lecture': 'linear-gradient(135deg, rgba(217,119,6,0.25) 0%, rgba(217,119,6,0.05) 100%)',
  'General': 'linear-gradient(135deg, rgba(122,111,148,0.25) 0%, rgba(122,111,148,0.05) 100%)',
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now - d
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

function formatDeadline(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Expired'
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return `Due in ${diffDays}d`
}

function NoticeCard({ notice, isActive, onReadMore, onBookmark }) {
  const categoryColor = CATEGORY_COLORS[notice.category] || '#7a6f94'
  const gradient = CATEGORY_GRADIENTS[notice.category] || CATEGORY_GRADIENTS['General']
  const relativeDate = formatRelativeDate(notice.portalDate)
  const deadlineText = formatDeadline(notice.deadline)
  const actualDate = notice.portalDate
    ? new Date(notice.portalDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#2E2A3A] transition-all duration-[450ms] ${
        isActive ? 'scale-100 opacity-100 shadow-2xl' : 'scale-[0.95] opacity-50'
      }`}
      style={{ willChange: 'transform, opacity' }}
    >
      {/* Top gradient header zone */}
      <div className="relative px-5 pt-5 pb-4" style={{ background: gradient }}>
        {/* Decorative blobs */}
        <div className="absolute top-3 right-3 h-16 w-16 rounded-full opacity-20" style={{ backgroundColor: categoryColor, filter: 'blur(20px)' }} />
        <div className="absolute top-8 right-10 h-8 w-8 rounded-full opacity-15" style={{ backgroundColor: categoryColor, filter: 'blur(10px)' }} />

        {/* Meta header row */}
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-semibold" style={{ color: categoryColor }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor }} />
            {notice.category}
          </span>
          <div className="flex items-center gap-2">
            {notice.isRead && (
              <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold text-[#4EF0A0]" style={{ background: 'linear-gradient(135deg, rgba(78,240,160,0.2) 0%, rgba(78,240,160,0.08) 100%)' }}>✓ seen</span>
            )}
            <span className="text-[11px] text-white/50">{relativeDate}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="relative mt-4 text-[18px] font-bold leading-[1.25] text-white">
          {notice.title}
        </h3>
      </div>

      {/* Content zone */}
      <div className="flex flex-1 flex-col px-5 pt-3 pb-4">
        {/* Summary as subtitle */}
        {notice.summary && (
          <p className="text-[13px] leading-relaxed text-white/60">{notice.summary}</p>
        )}

        {/* Deadline banner */}
        {deadlineText && (
          <div className="mt-3 rounded-lg bg-[#FFB23E]/10 px-3 py-2">
            <span className="text-[12px] font-semibold text-[#FFB23E]">{deadlineText}</span>
          </div>
        )}

        {/* Divider line */}
        <div className="mt-4 h-px w-full bg-white/10" />

        {/* Metadata section */}
        <div className="mt-4 space-y-2.5">
          {actualDate && (
            <div className="flex items-center gap-2.5 text-[12px] text-white/50">
              <Calendar className="h-3.5 w-3.5 text-white/40" />
              <span>{actualDate}</span>
            </div>
          )}
          {notice.isImportant && (
            <div className="flex items-center gap-2.5 text-[12px] text-white/50">
              <Building2 className="h-3.5 w-3.5 text-white/40" />
              <span>Important notice</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 text-[12px] text-[#FF916C]">
            <FileText className="h-3.5 w-3.5" />
            <span>PDF attached</span>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action footer */}
        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReadMore?.(notice) }}
            className="flex flex-1 items-center justify-center rounded-2xl bg-[#ECA384] py-3.5 text-[14px] font-bold text-[#1D183E] transition active:scale-[0.97]"
          >
            Read More
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBookmark?.(notice.noticeId) }}
            className={`flex h-[50px] w-[50px] items-center justify-center rounded-2xl border border-white/10 bg-[#2E2A3A] transition active:scale-95 ${
              notice.bookmarked ? 'border-[#6CB4FF]/40 bg-[#6CB4FF]/10' : ''
            }`}
          >
            <Bookmark className={`h-5 w-5 ${notice.bookmarked ? 'fill-[#6CB4FF] text-[#6CB4FF]' : 'text-white/50'}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              const appUrl = `https://attend75.xyz/app/notices?open=${notice.noticeId}`
              const text = `📢 *College Notice*\n\n*${notice.title}*\n${notice.summary || ''}\n\n📅 ${actualDate}${deadlineText ? `\n⚠️ ${deadlineText}` : ''}\n\n— via Attend75\n${appUrl}`
              const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
              window.open(whatsappUrl, '_blank')
            }}
            className="flex h-[50px] w-[50px] items-center justify-center rounded-2xl border border-white/10 bg-[#2E2A3A] transition active:scale-95"
          >
            <Share className="h-5 w-5 text-white/50" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default NoticeCard
