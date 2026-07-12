import { useEffect, useState } from 'react'
import { Bell, ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { getHistory, markHistoryRead } from '../services/pushApi'

const CATEGORY_COLORS = {
  notice: '#FF916C',
  attendance: '#FF5B5B',
  timetable: '#6CB4FF',
  digest: '#4EF0A0',
  weekly_summary: '#A78BFA',
  nudge: '#FFB23E',
  broadcast: '#D97706',
}

function NotificationHistory() {
  const { state: { session } } = useAppStore()
  const token = session.token
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    getHistory({ token })
      .then((data) => {
        setItems(data.items || [])
        setUnreadCount(data.unreadCount || 0)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [token])

  const handleItemClick = async (item) => {
    if (!item.isRead) {
      try {
        await markHistoryRead({ token, id: item.id })
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, isRead: true } : i))
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch { /* silent */ }
    }
    if (item.deepLink) {
      navigate(item.deepLink)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
      </div>
    )
  }

  return (
    <section className="pb-24">
      <header className="flex items-center gap-3 px-1 pb-4">
        <button type="button" onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <ChevronLeft className="h-4 w-4 text-[#F7F4FF]" />
        </button>
        <h1 className="text-xl font-bold text-[#F7F4FF]">Notifications</h1>
        {unreadCount > 0 && (
          <span className="rounded-full bg-[#FF5B5B]/20 px-2 py-0.5 text-[9px] font-bold text-[#FF5B5B]">
            {unreadCount} unread
          </span>
        )}
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Bell className="h-10 w-10 text-[#9F9AB5]" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-[#F7F4FF]">No notifications yet</p>
          <p className="text-xs text-[#9F9AB5]">Notifications will appear here as they arrive</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const color = CATEGORY_COLORS[item.category] || '#9F9AB5'
            const timeStr = item.createdAt
              ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
              : ''
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                className={`w-full rounded-xl p-3 text-left ring-1 transition ${item.isRead ? 'bg-[#2E2A3A]/50 ring-white/5' : 'bg-[#2E2A3A] ring-white/10'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.isRead ? '#555' : color }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${item.isRead ? 'text-[#9F9AB5]' : 'text-[#F7F4FF]'}`}>
                      {item.title}
                    </p>
                    {item.body && (
                      <p className="mt-0.5 text-[11px] text-[#9F9AB5] line-clamp-2">{item.body}</p>
                    )}
                    <p className="mt-1 text-[9px] text-[#7a6f94]">{timeStr}</p>
                  </div>
                  {item.priority === 'high' && (
                    <span className="shrink-0 rounded bg-[#FF5B5B]/20 px-1.5 py-0.5 text-[8px] font-bold text-[#FF5B5B]">!</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default NotificationHistory
