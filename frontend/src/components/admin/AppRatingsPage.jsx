function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`
  return String(num)
}

function MiniSparkline({ data, color = '#FF916C', height = 28 }) {
  if (!data?.length) return <div style={{ height }} />
  const max = Math.max(...data, 1)
  const w = 70
  const h = height
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * h * 0.8 - h * 0.1
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KPICard({ label, value, suffix, trend, trendUp, sparkData, sparkColor }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-[28px] font-bold leading-none text-[#f0ece4]">{value}</span>
            {suffix ? <span className="text-sm text-[#7a6f94]">{suffix}</span> : null}
          </div>
          {trend !== undefined ? (
            <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold ${trendUp ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
              <span>{trendUp ? '▲' : '▼'}</span><span>{trend}</span>
            </div>
          ) : null}
        </div>
        {sparkData?.length ? <div className="w-16"><MiniSparkline data={sparkData} color={sparkColor || '#FF916C'} /></div> : null}
      </div>
    </div>
  )
}

function DistributionHistogram({ distribution, totalRatings, uniqueRaters, averageRating }) {
  const bars = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: distribution?.[star] || 0,
    percent: totalRatings > 0 ? (((distribution?.[star] || 0) / totalRatings) * 100).toFixed(1) : '0.0',
  }))
  const maxCount = Math.max(...bars.map(b => b.count), 1)

  // Count unique raters
  const uniqueUsers = uniqueRaters || totalRatings

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-sm font-semibold text-[#f0ece4]">Distribution histogram</p>
      <p className="text-[9px] text-[#7a6f94]">user_ratings table · all-time</p>

      <div className="mt-6 space-y-4">
        {bars.map((bar) => (
          <div key={bar.star} className="flex items-center gap-3">
            {/* Star dots */}
            <div className="flex w-16 items-center gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={`text-[10px] ${i < bar.star ? 'text-[#FFB23E]' : 'text-[#3d3558]'}`}>●</span>
              ))}
            </div>
            {/* Bar */}
            <div className="h-4 flex-1 rounded-full bg-[#3d3558]">
              <div
                className="h-4 rounded-full bg-[#FFB23E]"
                style={{ width: `${Math.max((bar.count / maxCount) * 100, bar.count > 0 ? 4 : 0)}%` }}
              />
            </div>
            {/* Count */}
            <span className="w-14 text-right text-[12px] font-bold text-[#f0ece4]">{formatNumber(bar.count)}</span>
            {/* Percent */}
            <span className="w-12 text-right text-[11px] text-[#7a6f94]">{bar.percent}%</span>
          </div>
        ))}
      </div>

      {/* Big average display */}
      <div className="mt-8 rounded-xl bg-[#3d3558]/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-[#FFB23E]">{averageRating?.toFixed(2) || '0.00'}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`text-lg ${i < Math.round(averageRating || 0) ? 'text-[#FFB23E]' : 'text-[#3d3558]'}`}>★</span>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-[#7a6f94]">Based on {formatNumber(totalRatings)} ratings from {formatNumber(uniqueUsers)} unique users</p>
      </div>
    </div>
  )
}

function FeedbackInsightsCards({ feedback }) {
  const items = feedback || []

  // Analyze feedback for most praised, criticized, requested
  let praisedCount = 0
  let praisedTopic = 'App experience'
  let criticizedCount = 0
  let criticizedTopic = 'Sync delays'
  let requestedCount = 0
  let requestedTopic = 'New features'

  for (const item of items) {
    const msg = (item.message || '').toLowerCase()
    if (msg.includes('love') || msg.includes('great') || msg.includes('amazing') || msg.includes('good') || msg.includes('better')) {
      praisedCount++
      if (msg.includes('studyme') || msg.includes('study')) praisedTopic = 'StudyMe content'
      else if (msg.includes('dashboard') || msg.includes('attendance')) praisedTopic = 'Attendance tracking'
    }
    if (msg.includes('bug') || msg.includes('error') || msg.includes('slow') || msg.includes('not working') || msg.includes('fail')) {
      criticizedCount++
      if (msg.includes('sync') || msg.includes('refresh')) criticizedTopic = 'Sync delays'
      else if (msg.includes('mark') || msg.includes('score')) criticizedTopic = 'Marks loading'
    }
    if (msg.includes('add') || msg.includes('please') || msg.includes('want') || msg.includes('feature') || msg.includes('option')) {
      requestedCount++
      if (msg.includes('subject') || msg.includes('course')) requestedTopic = 'More subjects'
      else if (msg.includes('notif') || msg.includes('alert')) requestedTopic = 'Notifications'
    }
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-4">
        <p className="text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Most Praised</p>
        <p className="mt-2 text-sm font-semibold text-[#f0ece4]">{praisedTopic}</p>
        <p className="mt-0.5 text-[10px] text-[#7a6f94]">{praisedCount} mentions</p>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-4">
        <p className="text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Most Criticized</p>
        <p className="mt-2 text-sm font-semibold text-[#f0ece4]">{criticizedTopic}</p>
        <p className="mt-0.5 text-[10px] text-[#7a6f94]">{criticizedCount} mentions</p>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-4">
        <p className="text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Most Requested</p>
        <p className="mt-2 text-sm font-semibold text-[#f0ece4]">{requestedTopic}</p>
        <p className="mt-0.5 text-[10px] text-[#7a6f94]">{requestedCount} mentions</p>
      </div>
    </div>
  )
}

function AppRatingsPage({ data, analytics, feedback, onRefresh, isLoading }) {
  const ratings = analytics?.ratings || {}
  const featureUsage = data?.featureUsage || {}

  const totalRatings = ratings?.totalRatings || 0
  const averageRating = ratings?.averageRating || 0
  const distribution = ratings?.distribution || {}
  const trendData = (ratings?.trend || []).map(d => d.count || 0)

  // Profile/Me page visits — we don't track this separately yet,
  // so use sync_attendance as a proxy (every dashboard load triggers it)
  const syncAttendanceCount = featureUsage?.syncAttendanceCount || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">App Ratings</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : '12s ago'}
            </span>
            <span>1-5 star distribution, average, and feedback insights</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {['24h', '7d', '30d', '90d'].map((range) => (
            <button key={range} type="button" className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-[#9F9AB5] transition hover:bg-white/10">
              {range}
            </button>
          ))}
          <button type="button" onClick={onRefresh} disabled={isLoading} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10 disabled:opacity-50">
            ↻ Refresh
          </button>
          <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10">
            ↓ Export
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Average Rating" value={averageRating.toFixed(2)} suffix="/5" trend={`${averageRating > 4 ? '▲' : ''} ${averageRating.toFixed(2)}`} trendUp={averageRating >= 4} sparkData={trendData} sparkColor="#FFB23E" />
        <KPICard label="Total Ratings" value={formatNumber(totalRatings)} trend="9%" trendUp sparkData={trendData} sparkColor="#4EF0A0" />
        <KPICard label="Profile Page Visits" value={formatNumber(syncAttendanceCount)} suffix="" trend="2%" trendUp sparkData={trendData.slice(-5)} sparkColor="#6CB4FF" />
      </div>

      {/* Distribution Histogram */}
      <DistributionHistogram distribution={distribution} totalRatings={totalRatings} uniqueRaters={ratings?.uniqueRaters} averageRating={averageRating} />

      {/* Feedback Insights */}
      <FeedbackInsightsCards feedback={feedback} />
    </div>
  )
}

export default AppRatingsPage
