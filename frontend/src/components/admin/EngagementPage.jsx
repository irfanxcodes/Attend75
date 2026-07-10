import { useMemo } from 'react'

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

function KPICard({ label, value, subtitle, trend, trendUp, sparkData, sparkColor }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-bold leading-none text-[#f0ece4]">{value}</span>
            {subtitle ? <span className="text-[11px] text-[#7a6f94]">{subtitle}</span> : null}
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

function PeakUsageChart({ hourlySeries }) {
  const data = hourlySeries || []
  if (!data.length) return <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5"><p className="text-[11px] text-[#7a6f94]">No hourly data yet</p></div>

  const maxBar = Math.max(...data.map(d => d.events || 0), 1)

  // Find peak hour
  const peakEntry = data.reduce((best, d) => (d.events > (best?.events || 0) ? d : best), data[0])
  const peakHour = peakEntry?.hour || '00'

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Peak usage hours</p>
          <p className="text-[9px] text-[#7a6f94]">Events grouped by hour of day · last 7 days</p>
        </div>
        <span className="rounded-full bg-[#4EF0A0]/15 px-2.5 py-1 text-[9px] font-bold text-[#4EF0A0]">
          Maintenance window 02:00 – 05:00
        </span>
      </div>

      {/* Bar chart */}
      <div className="mt-6 flex h-[160px] items-end gap-[4px]">
        {data.map((bar) => {
          const heightPercent = Math.max((bar.events / maxBar) * 100, 2)
          const isPeak = bar.hour === peakHour
          return (
            <div key={bar.hour} className="flex flex-1 flex-col items-center justify-end h-full">
              <div
                className={`w-full rounded-t transition-all ${isPeak ? 'bg-[#FF916C]' : 'bg-[#FF916C]/60'}`}
                style={{ height: `${heightPercent}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* X-axis */}
      <div className="mt-2 flex justify-between text-[8px] text-[#7a6f94]">
        {data.filter((_, i) => i % 3 === 0).map((d) => (
          <span key={d.hour}>{d.hour}</span>
        ))}
      </div>
    </div>
  )
}

function EngagementPage({ data, analytics, onRefresh, isLoading }) {
  const featureUsage = data?.featureUsage || {}
  const peakHours = analytics?.peakHours || {}
  const dailyActivity = analytics?.dailyActivity || {}
  const notices = analytics?.notices || {}

  const hourlySeries = dailyActivity?.hourlySeries || peakHours?.hourlyDistribution || []
  const peakHour = peakHours?.peakHour || '00'

  // Total events per hour for sparkline
  const hourlyValues = useMemo(() => hourlySeries.map(h => h.events || 0), [hourlySeries])

  // Calculate total events across all hours
  const totalHourlyEvents = hourlyValues.reduce((s, v) => s + v, 0)
  const eventsPerHour = hourlySeries.length > 0 ? Math.round(totalHourlyEvents / hourlySeries.length) : 0

  // Real feature metrics
  const historyCount = featureUsage?.historyOpenCount || 0
  const marksCount = featureUsage?.marksOpenCount || 0
  const mailsSent = featureUsage?.mailFacultySendConfirmedCount || 0
  const studyMeUsers = data?.studyMeAnalytics?.overview?.totalStudyMeUsers || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Engagement</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : '12s ago'}
            </span>
            <span>Behavioral patterns across the day, week, and product surfaces</span>
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
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Peak Hour" value={`${peakHour}:00`} subtitle={`${formatNumber(eventsPerHour)} events/h`} sparkData={hourlyValues.slice(0, 7)} sparkColor="#FF916C" />
        <KPICard label="History Views" value={formatNumber(historyCount)} sparkData={hourlyValues.slice(4, 11)} sparkColor="#6CB4FF" />
        <KPICard label="Total Faculty Mails" value={formatNumber(mailsSent)} sparkData={hourlyValues.slice(8, 15)} sparkColor="#4EF0A0" />
        <KPICard label="Marks Views" value={formatNumber(marksCount)} sparkData={hourlyValues.slice(12, 19)} sparkColor="#A78BFA" />
      </div>

      {/* Peak Usage Chart */}
      <PeakUsageChart hourlySeries={hourlySeries} />

      {/* Notice Board Analytics */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#f0ece4]">Notice Board</p>
            <p className="text-[9px] text-[#7a6f94]">Scraped notice metrics · processing &amp; engagement</p>
          </div>
          {notices.recentNotices > 0 && (
            <span className="rounded-full bg-[#4EF0A0]/15 px-2.5 py-1 text-[9px] font-bold text-[#4EF0A0]">
              +{notices.recentNotices} this week
            </span>
          )}
        </div>

        {/* KPI grid */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#7a6f94]">Total Notices</p>
            <p className="mt-1 text-xl font-bold text-[#f0ece4]">{formatNumber(notices.totalNotices || 0)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#7a6f94]">Total Views</p>
            <p className="mt-1 text-xl font-bold text-[#f0ece4]">{formatNumber(notices.totalViews || 0)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#7a6f94]">Unique Readers</p>
            <p className="mt-1 text-xl font-bold text-[#f0ece4]">{formatNumber(notices.uniqueReaders || 0)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#7a6f94]">Bookmarks</p>
            <p className="mt-1 text-xl font-bold text-[#f0ece4]">{formatNumber(notices.totalBookmarks || 0)}</p>
          </div>
        </div>

        {/* Category breakdown + secondary stats */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          {/* Category bars */}
          <div>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#7a6f94]">By Category</p>
            <div className="space-y-1.5">
              {Object.entries(notices.categories || {})
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => {
                  const max = Math.max(...Object.values(notices.categories || {}), 1)
                  const pct = Math.round((count / max) * 100)
                  const colors = { Exam: '#FF5B5B', Fee: '#FFB23E', Academic: '#6CB4FF', Internship: '#A78BFA', Event: '#4EF0A0', 'Guest Lecture': '#D97706', General: '#7a6f94' }
                  const color = colors[cat] || '#7a6f94'
                  return (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="w-20 truncate text-[10px] text-[#9F9AB5]">{cat}</span>
                      <div className="flex-1 rounded-full bg-white/5 h-2">
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="w-8 text-right text-[10px] font-semibold text-[#d8d4e7]">{count}</span>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Secondary stats */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
              <span className="text-[10px] text-[#9F9AB5]">Important Notices</span>
              <span className="text-[13px] font-bold text-[#FF5B5B]">{notices.importantNotices || 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
              <span className="text-[10px] text-[#9F9AB5]">Failed Processing</span>
              <span className="text-[13px] font-bold text-[#FFB23E]">{notices.failedNotices || 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
              <span className="text-[10px] text-[#9F9AB5]">Dismissed</span>
              <span className="text-[13px] font-bold text-[#9F9AB5]">{notices.totalDismissals || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EngagementPage
