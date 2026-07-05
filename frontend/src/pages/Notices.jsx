import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import useAppStore from '../hooks/useAppStore'
import FilterBar from '../components/notices/FilterBar'
import NoticeCard from '../components/notices/NoticeCard'
import NoticeDetail from '../components/notices/NoticeDetail'
import {
  bookmarkNotice,
  dismissNotice,
  fetchNotices,
  fetchNoticeStats,
  refreshNotices,
} from '../services/noticesApi'

function Notices() {
  const { state: { session } } = useAppStore()
  const token = session.token

  const [notices, setNotices] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState(null)
  const [expandedNotice, setExpandedNotice] = useState(null)
  const [stats, setStats] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef(null)

  const LIMIT = 10

  const loadNotices = useCallback(async (resetOffset = false) => {
    if (!token) return
    setIsLoading(true)
    try {
      const newOffset = resetOffset ? 0 : offset
      const data = await fetchNotices({
        token,
        limit: LIMIT,
        offset: newOffset,
        category: activeFilter,
        includeDismissed: false,
      })
      if (resetOffset) {
        setNotices(data.notices || [])
        setOffset(LIMIT)
        setActiveIndex(0)
      } else {
        setNotices((prev) => [...prev, ...(data.notices || [])])
        setOffset(newOffset + LIMIT)
      }
      setTotal(data.total || 0)
    } catch { /* silent */ }
    finally { setIsLoading(false) }
  }, [token, offset, activeFilter])

  useEffect(() => {
    if (token) {
      loadNotices(true)
      fetchNoticeStats({ token }).then(setStats).catch(() => {})
    }
  }, [token, activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    if (!token || isRefreshing) return
    setIsRefreshing(true)
    try {
      await refreshNotices({ token })
      await loadNotices(true)
      const s = await fetchNoticeStats({ token })
      setStats(s)
    } catch { /* silent */ }
    finally { setIsRefreshing(false) }
  }

  const handleBookmark = async (noticeId) => {
    try {
      const result = await bookmarkNotice({ token, noticeId })
      setNotices((prev) =>
        prev.map((n) => n.noticeId === noticeId ? { ...n, bookmarked: result.bookmarked } : n)
      )
    } catch { /* silent */ }
  }

  const handleFilterChange = (category) => {
    setActiveFilter(category)
    setOffset(0)
    setActiveIndex(0)
  }

  const handleReadMore = (notice) => {
    setExpandedNotice(notice)
  }

  const handleCloseDetail = () => {
    setExpandedNotice(null)
  }

  // Carousel scroll handler — detect which card is active
  const handleScroll = () => {
    const el = carouselRef.current
    if (!el) return
    const scrollLeft = el.scrollLeft
    const cardWidth = el.offsetWidth * 0.85 + 16 // 85% width + gap
    const index = Math.round(scrollLeft / cardWidth)
    setActiveIndex(Math.max(0, Math.min(index, notices.length - 1)))

    // Load more when near the end
    if (index >= notices.length - 3 && notices.length < total && !isLoading) {
      loadNotices(false)
    }
  }

  const hasMore = notices.length < total

  return (
    <section className="flex min-h-[calc(100dvh-120px)] flex-col pb-4">
      {/* Header */}
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F7F4FF]">Notices</h1>
          <p className="mt-0.5 text-[11px] text-[#9F9AB5]">College notice board</p>
        </div>
        <div className="flex items-center gap-2">
          {stats && stats.unread > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[#4EF0A0]/15 px-2.5 py-1 text-[10px] font-bold text-[#4EF0A0]">
              {stats.unread} new
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[#9F9AB5] transition hover:bg-white/15 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="mt-3 px-1">
        <FilterBar active={activeFilter} onChange={handleFilterChange} />
      </div>

      {/* Carousel */}
      <div className="relative mt-4 flex-1">
        {notices.length > 0 ? (
          <>
            <div
              ref={carouselRef}
              onScroll={handleScroll}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-[7.5%] pb-4 scrollbar-none"
              style={{ scrollBehavior: 'smooth' }}
            >
              {notices.map((notice, index) => (
                <div
                  key={notice.noticeId}
                  className="w-[85%] flex-shrink-0 snap-center"
                  style={{ minHeight: '420px' }}
                >
                  <NoticeCard
                    notice={notice}
                    isActive={index === activeIndex}
                    onReadMore={handleReadMore}
                    onBookmark={handleBookmark}
                  />
                </div>
              ))}

              {/* Load more card */}
              {hasMore && (
                <div className="flex w-[85%] flex-shrink-0 snap-center items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-[#2E2A3A]/50" style={{ minHeight: '420px' }}>
                  <button
                    type="button"
                    onClick={() => loadNotices(false)}
                    disabled={isLoading}
                    className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-[#F7F4FF] transition hover:bg-white/15 disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>

            {/* Dot indicators */}
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {notices.slice(0, Math.min(notices.length, 10)).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === activeIndex
                      ? 'h-2.5 w-6 bg-[#F7F4FF]'
                      : 'h-2.5 w-2.5 bg-white/20'
                  }`}
                />
              ))}
              {notices.length > 10 && (
                <span className="ml-1 text-[9px] text-white/30">+{notices.length - 10}</span>
              )}
            </div>
          </>
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <Bell className="h-12 w-12 text-[#9F9AB5]" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-[#F7F4FF]">No notices yet</p>
            <p className="text-xs text-[#9F9AB5]">Tap refresh to check for new notices</p>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {expandedNotice && (
        <NoticeDetail
          notice={expandedNotice}
          token={token}
          onClose={handleCloseDetail}
        />
      )}
    </section>
  )
}

export default Notices
