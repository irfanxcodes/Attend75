import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import FilterBar from '../components/notices/FilterBar'
import NoticeCard from '../components/notices/NoticeCard'
import NoticeDetail from '../components/notices/NoticeDetail'
import TimetableView from '../components/notices/TimetableView'
import {
  bookmarkNotice,
  fetchNotices,
  fetchNoticeStats,
  isSessionExpired,
  refreshNotices,
} from '../services/noticesApi'

function Notices() {
  const { state: { session } } = useAppStore()
  const token = session.token
  const [searchParams, setSearchParams] = useSearchParams()

  const [notices, setNotices] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState(null)
  const [expandedNotice, setExpandedNotice] = useState(null)
  const [stats, setStats] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [carouselKey, setCarouselKey] = useState(0)
  const carouselRef = useRef(null)
  const isScrollingProgrammatically = useRef(false)

  const LIMIT = 5

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
        const prevLength = notices.length
        setNotices((prev) => [...prev, ...(data.notices || [])])
        setOffset(newOffset + LIMIT)
        setActiveIndex(prevLength)
        // Suppress scroll listener during programmatic scroll
        isScrollingProgrammatically.current = true
        setTimeout(() => {
          const el = carouselRef.current
          if (el && prevLength > 0) {
            // Measure actual position of the target card
            const targetCard = el.children[prevLength]
            if (targetCard) {
              const scrollTarget = targetCard.offsetLeft - (el.offsetWidth - targetCard.offsetWidth) / 2
              el.scrollTo({ left: scrollTarget, behavior: 'smooth' })
            }
          }
          setTimeout(() => { isScrollingProgrammatically.current = false }, 600)
        }, 100)
      }
      setTotal(data.total || 0)
    } catch (err) {
      // If session expired, don't show spinner forever — just leave empty state
      if (isSessionExpired(err)) {
        setNotices([])
        setTotal(0)
      }
    }
    finally { setIsLoading(false) }
  }, [token, offset, activeFilter, notices.length])

  useEffect(() => {
    if (token) {
      loadNotices(true)
      fetchNoticeStats({ token }).then(setStats).catch(() => {})
    }
  }, [token, activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scrape on first load if no notices exist for this student
  const hasAutoScraped = useRef(false)
  useEffect(() => {
    if (hasAutoScraped.current || !token || isLoading || isRefreshing) return
    if (notices.length === 0 && !isLoading && total === 0) {
      hasAutoScraped.current = true
      // Don't auto-refresh — it processes PDFs and is heavy.
      // User can manually tap refresh.
    }
  }, [notices.length, isLoading, total, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle deep link: ?open=noticeId
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && token && notices.length > 0) {
      const notice = notices.find((n) => String(n.noticeId) === openId)
      if (notice) {
        setExpandedNotice(notice)
      } else {
        // Notice not in current list — open modal with minimal data
        setExpandedNotice({ noticeId: Number(openId), title: 'Loading...', category: 'General' })
      }
      // Clear the param so it doesn't re-trigger
      setSearchParams({}, { replace: true })
    }
  }, [notices.length, searchParams, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll-based active index detection
  useEffect(() => {
    const el = carouselRef.current
    if (!el) return

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return
      // Measure actual card positions instead of guessing widths
      const cards = el.children
      if (!cards.length) return
      const containerCenter = el.scrollLeft + el.offsetWidth / 2
      let closestIndex = 0
      let closestDistance = Infinity
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        const cardCenter = card.offsetLeft + card.offsetWidth / 2
        const distance = Math.abs(containerCenter - cardCenter)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = i
        }
      }
      setActiveIndex(Math.min(closestIndex, notices.length - 1))
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [notices.length, carouselKey])

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
    setCarouselKey((k) => k + 1)
  }

  const handleReadMore = (notice) => {
    setExpandedNotice(notice)
  }

  const handleCloseDetail = () => {
    setExpandedNotice(null)
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
              key={carouselKey}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 scrollbar-none"
              style={{ paddingLeft: '7.5%', paddingRight: '7.5%' }}
            >
              {notices.map((notice, index) => (
                <div
                  key={notice.noticeId}
                  className="w-[85%] flex-shrink-0 snap-center"
                  style={{ minHeight: '440px' }}
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
                <div className="flex w-[85%] flex-shrink-0 snap-center items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-[#2E2A3A]/50" style={{ minHeight: '440px' }}>
                  <button
                    type="button"
                    onClick={() => loadNotices(false)}
                    disabled={isLoading}
                    className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-[#F7F4FF] transition hover:bg-white/15 disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : `Load more (${notices.length}/${total})`}
                  </button>
                </div>
              )}
            </div>

            {/* Dot indicators */}
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {notices.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === activeIndex
                      ? 'h-2.5 w-6 bg-[#F7F4FF]'
                      : 'h-2.5 w-2.5 bg-white/20'
                  }`}
                />
              ))}
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

      {/* Timetable section */}
      <TimetableView token={token} />

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
