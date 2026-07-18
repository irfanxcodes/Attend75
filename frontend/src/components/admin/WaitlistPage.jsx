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
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function MiniBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#FF916C]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-[#9F9AB5]">{pct}%</span>
    </div>
  )
}

function WaitlistPage({ analytics, onRefresh, isLoading }) {
  const waitlist = analytics?.waitlist || {}
  const total = waitlist.total || 0
  const last7days = waitlist.last7days || 0
  const trend = waitlist.trend || []
  const recent = waitlist.recent || []

  const maxTrendCount = Math.max(...trend.map((d) => d.count || 0), 1)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Premium Waitlist</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#FF916C]" />
              Live · synced {isLoading ? '...' : 'just now'}
            </span>
            <span>Students who tapped "Join Waitlist" on the Premium page</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10 disabled:opacity-50"
        >
          ↻ Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Total on Waitlist</p>
          <span className="mt-2 block text-[32px] font-bold text-[#f0ece4]">{formatNumber(total)}</span>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">all-time signups</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Last 7 Days</p>
          <span className="mt-2 block text-[32px] font-bold text-[#FF916C]">{formatNumber(last7days)}</span>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">new additions this week</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Conversion Potential</p>
          <span className="mt-2 block text-[32px] font-bold text-[#4EF0A0]">
            {total > 0 ? `₹${formatNumber(total * 19)}` : '—'}
          </span>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">est. MRR at ₹19/mo</p>
        </div>
      </div>

      {/* 14-day trend */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Daily signups · last 14 days</p>
        <p className="mt-0.5 text-[9px] text-[#7a6f94]">Students joining waitlist per day</p>

        {trend.length > 0 ? (
          <div className="mt-4 space-y-2">
            {trend.map((item) => (
              <div key={item.date} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[10px] text-[#7a6f94]">
                  {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
                <MiniBar value={item.count} max={maxTrendCount} />
                <span className="w-6 text-right text-[10px] font-semibold text-[#f0ece4]">{item.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 py-6 text-center text-[11px] text-[#7a6f94]">No data yet</p>
        )}
      </div>

      {/* Recent signups */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Recent signups</p>
        <p className="mt-0.5 text-[9px] text-[#7a6f94]">Latest 10 students who joined the waitlist</p>

        {recent.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
                  <th className="pb-3 pr-4">Roll Number</th>
                  <th className="pb-3 text-right">Joined</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((entry, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="py-3 pr-4 font-mono font-medium text-[#d8d4e7]">{entry.rollNumber}</td>
                    <td className="py-3 text-right text-[#7a6f94]">{computeTimeAgo(entry.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 py-6 text-center text-[11px] text-[#7a6f94]">
            No waitlist signups yet — they'll appear here when students tap "Join Waitlist"
          </p>
        )}
      </div>
    </div>
  )
}

export default WaitlistPage
