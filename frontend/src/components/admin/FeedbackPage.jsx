import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminFeedbackLog, updateAdminFeedbackStatus, parseAdminSession } from '../../services/adminApi'

function formatNumber(num) {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return String(num)
}

function computeTimeAgo(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function getTag(message) {
  const lower = (message || '').toLowerCase()
  if (lower.includes('bug') || lower.includes('error') || lower.includes('not working') || lower.includes('failed') || lower.includes('crash'))
    return { label: 'Bug', color: 'bg-[#FF5B5B]/15 text-[#FF5B5B]' }
  if (lower.includes('add') || lower.includes('feature') || lower.includes('please') || lower.includes('option') || lower.includes('want'))
    return { label: 'Idea', color: 'bg-[#6CB4FF]/15 text-[#6CB4FF]' }
  if (lower.includes('love') || lower.includes('great') || lower.includes('amazing') || lower.includes('good') || lower.includes('better') || lower.includes('awesome'))
    return { label: 'Praise', color: 'bg-[#4EF0A0]/15 text-[#4EF0A0]' }
  return null
}

function getInitials(name) {
  const parts = (name || 'AN').trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const avatarColors = ['#FF5B5B', '#FF916C', '#6CB4FF', '#4EF0A0', '#A78BFA', '#FFB23E', '#F472B6', '#34D399']

function FeedbackPage({ feedback: initialFeedback, onRefresh, isLoading }) {
  const [items, setItems] = useState(initialFeedback || [])
  const [filter, setFilter] = useState('all')
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    setItems(initialFeedback || [])
  }, [initialFeedback])

  const session = parseAdminSession()
  const sessionToken = session?.sessionToken

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true
    if (filter === 'unread') return item.status === 'new'
    if (filter === 'bugs') return getTag(item.message)?.label === 'Bug'
    if (filter === 'ideas') return getTag(item.message)?.label === 'Idea'
    if (filter === 'praise') return getTag(item.message)?.label === 'Praise'
    return true
  })

  const unreadCount = items.filter(i => i.status === 'new').length
  const bugsCount = items.filter(i => getTag(i.message)?.label === 'Bug').length
  const todayCount = items.filter(i => {
    if (!i.timestamp) return false
    const d = new Date(i.timestamp)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length

  const handleStatusUpdate = useCallback(async (feedbackId, newStatus) => {
    if (!sessionToken) return
    setUpdatingId(feedbackId)
    try {
      await updateAdminFeedbackStatus(sessionToken, feedbackId, newStatus)
      setItems(prev => prev.map(item =>
        item.id === feedbackId ? { ...item, status: newStatus } : item
      ))
    } catch {
      // Silent fail
    } finally {
      setUpdatingId(null)
    }
  }, [sessionToken])

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'bugs', label: 'Bugs' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'praise', label: 'Praise' },
    { id: 'unread', label: 'Unread' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Feedback Management</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : '12s ago'}
            </span>
            <span>Incoming user feedback · triage, reply, archive</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition ${
                filter === f.id
                  ? 'border-[#FF916C]/40 bg-[#FF916C]/10 text-[#FF916C]'
                  : 'border-white/10 bg-white/[0.03] text-[#9F9AB5] hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10">
            ↓ Export
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Today</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{todayCount}</span>
          <p className="mt-1 text-[10px] text-[#4EF0A0]">▲ 9%</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Unread</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{unreadCount}</span>
          <p className="mt-1 text-[10px] text-[#7a6f94]">— needs triage</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Avg Response</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">—</span>
          <p className="mt-1 text-[10px] text-[#7a6f94]">Reply feature coming soon</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Bug Ratio</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{items.length > 0 ? Math.round((bugsCount / items.length) * 100) : 0}<span className="text-sm text-[#7a6f94]">%</span></span>
          <p className="mt-1 text-[10px] text-[#FF5B5B]">▼ 3%</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between rounded-xl bg-[#2a2440] px-4 py-2.5 border border-white/[0.06]">
        <p className="text-[11px] text-[#9F9AB5]">
          ■ {filteredItems.length} items · {unreadCount} unread
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRefresh} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#9F9AB5] transition hover:bg-white/5">
            ✓ Mark read
          </button>
          <button type="button" disabled className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#7a6f94] opacity-50 cursor-not-allowed" title="Requires push notifications (coming soon)">
            ↩ Reply
          </button>
          <button type="button" className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#9F9AB5] transition hover:bg-white/5">
            ⊘ Archive
          </button>
        </div>
      </div>

      {/* Feedback list */}
      <div className="space-y-2">
        {filteredItems.map((item, i) => {
          const tag = getTag(item.message)
          const isUpdating = updatingId === item.id
          return (
            <div key={item.id || i} className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#2a2440] p-4">
              {/* Avatar */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#1e1932]" style={{ backgroundColor: avatarColors[i % avatarColors.length] }}>
                {getInitials(item.user_name)}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#d8d4e7]">{item.user_name || 'Anonymous'}</span>
                  {/* Stars placeholder */}
                  <span className="text-[10px] text-[#FFB23E]">★★★★★</span>
                  {tag ? <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${tag.color}`}>{tag.label}</span> : null}
                  <span className="text-[9px] text-[#7a6f94]">· {computeTimeAgo(item.timestamp)}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#9F9AB5]">{item.message}</p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                {/* Reply (disabled) */}
                <button type="button" disabled className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-[#7a6f94] opacity-50 cursor-not-allowed" title="Reply requires push notifications">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
                </button>
                {/* Mark reviewed */}
                <button
                  type="button"
                  disabled={isUpdating || item.status === 'reviewed'}
                  onClick={() => handleStatusUpdate(item.id, 'reviewed')}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${item.status === 'reviewed' || item.status === 'resolved' ? 'border-[#4EF0A0]/30 bg-[#4EF0A0]/10 text-[#4EF0A0]' : 'border-white/10 text-[#9F9AB5] hover:bg-white/5'}`}
                  title="Mark as reviewed"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                {/* Archive/resolve */}
                <button
                  type="button"
                  disabled={isUpdating || item.status === 'resolved'}
                  onClick={() => handleStatusUpdate(item.id, 'resolved')}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-[#9F9AB5] transition hover:bg-white/5 disabled:opacity-50"
                  title="Resolve/archive"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            </div>
          )
        })}

        {!filteredItems.length ? (
          <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-8 text-center">
            <p className="text-sm text-[#7a6f94]">{filter === 'all' ? 'No feedback yet' : `No ${filter} feedback`}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default FeedbackPage
