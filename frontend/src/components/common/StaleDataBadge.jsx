import { useEffect, useState } from 'react'
import { formatTimeAgo } from '../../services/sessionPersistence'

/**
 * Displays a subtle "Last updated X ago" indicator.
 * Automatically refreshes the relative time every 30 seconds.
 * Renders nothing if no timestamp is provided.
 */
function StaleDataBadge({ cachedAt, isRefreshing = false }) {
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(cachedAt))

  useEffect(() => {
    if (!cachedAt) return

    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(cachedAt))
    }, 30000)

    return () => clearInterval(interval)
  }, [cachedAt])

  if (!cachedAt && !isRefreshing) return null

  if (isRefreshing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4EF0A0]" />
        <span className="text-[10px] font-medium text-[#4EF0A0]">Syncing...</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-[#9F9AB5]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span className="text-[10px] text-[#9F9AB5]">Updated {timeAgo}</span>
    </span>
  )
}

export default StaleDataBadge
