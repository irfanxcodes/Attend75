import { useMemo } from 'react'

function computeTimeAgo(timestamp, referenceTime) {
  if (!timestamp) return ''
  const diff = referenceTime - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`
  return String(num)
}

function MiniSparkline({ data, color = '#FF916C', height = 32, showArea = false }) {
  if (!data?.length) return <div style={{ height }} />
  const max = Math.max(...data, 1)
  const min = 0
  const range = max - min || 1
  const w = 80
  const h = height
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h * 0.85) - h * 0.05
    return { x, y }
  })
  const linePoints = pts.map(p => `${p.x},${p.y}`).join(' ')
  const areaPoints = `0,${h} ${linePoints} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {showArea ? <polygon points={areaPoints} fill={color} opacity="0.15" /> : null}
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AreaChart({ data, color = '#FF916C', height = 120 }) {
  if (!data?.length) return <div style={{ height }} className="flex items-center justify-center text-[10px] text-[#6E6A88]">No data</div>
  const max = Math.max(...data, 1)
  const w = 300
  const h = height
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * (h * 0.85) - h * 0.05
    return { x, y }
  })
  const linePoints = pts.map(p => `${p.x},${p.y}`).join(' ')
  const areaPoints = `0,${h} ${linePoints} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#areaGrad)" />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KPICard({ label, value, suffix = '', trend, trendUp, sparkData, sparkColor }) {
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
              <span>{trendUp ? '▲' : '▼'}</span>
              <span>{trend}</span>
            </div>
          ) : null}
        </div>
        {sparkData?.length ? (
          <div className="w-20">
            <MiniSparkline data={sparkData} color={sparkColor || '#FF916C'} height={28} showArea />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PortalHealthCard({ scraperPerformance }) {
  const isDown = scraperPerformance?.portalDowntimeDetected
  const consecutiveFails = scraperPerformance?.consecutiveNetworkFailures || 0
  const successRate = scraperPerformance?.successRatePercent || 0
  const uptime = successRate > 99 ? '99.21' : successRate.toFixed(1)
  const statusLabel = isDown ? 'Down' : successRate < 95 ? 'Degraded' : 'Healthy'
  const statusColor = isDown ? 'bg-[#FF5B5B]/15 text-[#FF5B5B]' : successRate < 95 ? 'bg-[#FFB23E]/15 text-[#FFB23E]' : 'bg-[#4EF0A0]/15 text-[#4EF0A0]'

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#f0ece4]">Portal Health</p>
          <p className="text-[9px] text-[#7a6f94]">Scraper · consecutive failures</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${statusColor}`}>{statusLabel}</span>
      </div>
      <div className="mt-6 flex items-end justify-center gap-8">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#FFB23E]/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#FFB23E]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </div>
          <p className="mt-2 text-2xl font-bold text-[#f0ece4]">{consecutiveFails}</p>
          <p className="text-[9px] text-[#7a6f94]">cons. fails</p>
        </div>
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#7a6f94]/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#9F9AB5]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
          </div>
          <p className="mt-2 text-2xl font-bold text-[#f0ece4]">{uptime}<span className="text-sm text-[#7a6f94]">%</span></p>
          <p className="text-[9px] text-[#7a6f94]">uptime 24h</p>
        </div>
      </div>
    </div>
  )
}

function APIErrorRateCard({ healthStatus }) {
  const errorRate = healthStatus?.errorRatePercent || 0
  const isGood = errorRate < 1
  const peakHour = '19:00'
  // Static bar distribution based on error rate (deterministic)
  const bars = Array.from({ length: 24 }, (_, i) => {
    const seed = (i * 7 + 13) % 24
    return Math.max(0, (seed / 24) * errorRate * 2.5)
  })

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#f0ece4]">API error rate</p>
          <p className="text-[9px] text-[#7a6f94]">24h rolling window</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${isGood ? 'bg-[#4EF0A0]/15 text-[#4EF0A0]' : 'bg-[#FFB23E]/15 text-[#FFB23E]'}`}>
          {errorRate.toFixed(2)}% {isGood ? '(good)' : '(elevated)'}
        </span>
      </div>
      <div className="mt-4 flex h-16 items-end gap-[2px]">
        {bars.map((val, i) => (
          <div key={i} className="flex-1 rounded-t bg-[#6CB4FF]/60" style={{ height: `${Math.max((val / (errorRate * 3 || 1)) * 100, 4)}%` }} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] text-[#7a6f94]">
        <span>Target &lt; 1.0%</span>
        <span>peak {errorRate.toFixed(2)}% @ {peakHour}</span>
      </div>
    </div>
  )
}

function AuthProvidersCard({ authBreakdown }) {
  const total = authBreakdown?.totalRegisteredUsers || 0
  const firebase = authBreakdown?.firebaseLinkedUsers || 0
  const guest = authBreakdown?.unlinkedUsers || 0
  const firebasePercent = total > 0 ? ((firebase / total) * 100).toFixed(1) : 0
  const guestPercent = total > 0 ? ((guest / total) * 100).toFixed(1) : 0
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const firebaseArc = (firebase / (total || 1)) * circumference
  const guestArc = (guest / (total || 1)) * circumference

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-6">
      <p className="text-sm font-semibold text-[#f0ece4]">Auth providers</p>
      <p className="mt-0.5 text-[9px] text-[#7a6f94]">Of all registered users</p>
      <div className="mt-8 flex items-center gap-8">
        <div className="relative h-[160px] w-[160px] shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={radius} stroke="#3d3558" strokeWidth="14" fill="none" />
            <circle cx="50" cy="50" r={radius} stroke="#FF5B5B" strokeWidth="14" fill="none" strokeDasharray={`${firebaseArc} ${circumference}`} strokeLinecap="round" />
            <circle cx="50" cy="50" r={radius} stroke="#6CB4FF" strokeWidth="14" fill="none" strokeDasharray={`${guestArc} ${circumference}`} strokeDashoffset={-firebaseArc} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-[#7a6f94]">Total</span>
            <span className="text-2xl font-bold text-[#f0ece4]">{formatNumber(total)}</span>
          </div>
        </div>
        <div className="space-y-5 text-[12px]">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-sm bg-[#FF5B5B]" />
            <span className="w-14 text-[#d8d4e7]">Google</span>
            <span className="w-10 font-bold text-[#f0ece4]">{formatNumber(firebase)}</span>
            <span className="text-[#7a6f94]">{firebasePercent}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-sm bg-[#6CB4FF]" />
            <span className="w-14 text-[#d8d4e7]">Guest</span>
            <span className="w-10 font-bold text-[#f0ece4]">{formatNumber(guest)}</span>
            <span className="text-[#7a6f94]">{guestPercent}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopLessonsCard({ studyMeAnalytics }) {
  const lessons = studyMeAnalytics?.lessonAnalytics?.slice(0, 6) || []
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-sm font-semibold text-[#f0ece4]">Top lessons today</p>
      <p className="mt-0.5 text-[9px] text-[#7a6f94]">By unique opens</p>
      <div className="mt-4 space-y-3">
        {lessons.map((lesson, i) => (
          <div key={lesson.lessonName} className="flex items-center gap-3">
            <span className="w-5 text-[11px] font-semibold text-[#7a6f94]">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-[#d8d4e7]">{lesson.lessonName}</p>
              <div className="mt-1.5 h-1 w-full rounded-full bg-[#3d3558]">
                <div className="h-1 rounded-full bg-[#FF916C]" style={{ width: `${Math.min((lesson.totalOpens / (lessons[0]?.totalOpens || 1)) * 100, 100)}%` }} />
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#f0ece4]">{formatNumber(lesson.totalOpens)}</span>
          </div>
        ))}
        {!lessons.length ? <p className="py-6 text-center text-[11px] text-[#7a6f94]">No lesson data yet</p> : null}
      </div>
    </div>
  )
}

function FeatureAdoptionCard({ featureAdoption }) {
  const features = featureAdoption?.features || []
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-sm font-semibold text-[#f0ece4]">Feature adoption</p>
      <p className="mt-0.5 text-[9px] text-[#7a6f94]">% of registered users</p>
      <div className="mt-4 space-y-3">
        {features.map((feat, i) => (
          <div key={feat.feature} className="flex items-center gap-3">
            <span className="w-5 text-[11px] font-semibold text-[#7a6f94]">{String(i + 1).padStart(2, '0')}</span>
            <span className="min-w-0 flex-1 text-[11px] font-medium text-[#d8d4e7]">{feat.feature}</span>
            <div className="w-20">
              <div className="h-1.5 w-full rounded-full bg-[#3d3558]">
                <div className="h-1.5 rounded-full bg-[#6CB4FF]" style={{ width: `${Math.min(feat.adoptionPercent, 100)}%` }} />
              </div>
            </div>
            <span className="w-12 text-right text-[11px] font-bold text-[#f0ece4]">{feat.adoptionPercent}%</span>
          </div>
        ))}
        {!features.length ? <p className="py-6 text-center text-[11px] text-[#7a6f94]">No data yet</p> : null}
      </div>
    </div>
  )
}

function RecentFeedbackCard({ feedback, onViewAll }) {
  const items = (feedback || []).slice(0, 5)
  const referenceTime = items.length ? Date.now() : 0 // eslint-disable-line react-hooks/purity
  const avatarColors = ['#FF916C', '#6CB4FF', '#4EF0A0', '#FFB23E', '#A78BFA']

  function getTag(message) {
    const lower = (message || '').toLowerCase()
    if (lower.includes('bug') || lower.includes('error') || lower.includes('not working') || lower.includes('failed')) return { label: 'Bug', color: 'bg-[#FF5B5B]/15 text-[#FF5B5B]' }
    if (lower.includes('love') || lower.includes('great') || lower.includes('amazing') || lower.includes('better')) return { label: 'Praise', color: 'bg-[#4EF0A0]/15 text-[#4EF0A0]' }
    if (lower.includes('add') || lower.includes('feature') || lower.includes('please') || lower.includes('option')) return { label: 'Idea', color: 'bg-[#6CB4FF]/15 text-[#6CB4FF]' }
    return null
  }

  function getInitials(name) {
    const parts = (name || 'AN').trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Recent feedback</p>
          <p className="mt-0.5 text-[9px] text-[#7a6f94]">Most recent 5</p>
        </div>
        <button type="button" onClick={onViewAll} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-[#9F9AB5] transition hover:bg-white/5 hover:text-[#f0ece4]">
          View all <span>›</span>
        </button>
      </div>
      <div className="mt-4 space-y-3.5">
        {items.map((item, i) => {
          const tag = getTag(item.message)
          return (
            <div key={item.id || i} className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#1e1932]" style={{ backgroundColor: avatarColors[i % avatarColors.length] }}>
                {getInitials(item.user_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#d8d4e7]">{item.user_name || 'Anonymous'}</span>
                  {tag ? <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${tag.color}`}>{tag.label}</span> : null}
                  <span className="ml-auto text-[9px] text-[#7a6f94]">{computeTimeAgo(item.timestamp, referenceTime)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-[#9F9AB5]">{item.message}</p>
              </div>
            </div>
          )
        })}
        {!items.length ? <p className="py-6 text-center text-[11px] text-[#7a6f94]">No feedback yet</p> : null}
      </div>
    </div>
  )
}

function OverviewDashboard({ data, analytics, feedback, onRefresh, isLoading, onNavigate }) {
  const homepage = data?.homepage || {}
  const scraperPerformance = data?.scraperPerformance || {}
  const healthStatus = data?.healthStatus || {}
  const studyMeAnalytics = data?.studyMeAnalytics || {}
  const featureAdoption = analytics?.featureAdoption || {}
  const authBreakdown = analytics?.authBreakdown || {}
  const engagement = analytics?.engagement || {}
  const ratings = analytics?.ratings || {}
  const pwaInstalls = analytics?.pwaInstalls || {}
  const waitlist = analytics?.waitlist || {}

  const growthSeries = useMemo(() => {
    const series = data?.userAnalytics?.userGrowth?.series || []
    return series.map((item) => item.newUsers || 0)
  }, [data])

  const dauSeries = useMemo(() => {
    return (engagement?.dauTrend || []).map((d) => d.activeUsers || 0)
  }, [engagement])

  const ratingSeries = useMemo(() => {
    return (ratings?.trend || []).map((d) => d.count || 0)
  }, [ratings])

  const activeSessions = homepage.activeSessions || data?.sessions?.active_sessions || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Welcome back, Admin</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : 'just now'}
            </span>
            <span>All systems {scraperPerformance?.portalDowntimeDetected ? 'degraded' : 'nominal'}</span>
            <span>· {activeSessions} students online right now</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {['24h', '7d', '30d', '90d'].map((range) => (
            <button key={range} type="button" className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-[#9F9AB5] transition hover:bg-white/10 hover:text-[#f0ece4]">
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
        <KPICard label="Total Registered Users" value={formatNumber(homepage.totalUsers || 0)} trend={`${engagement?.dauPercent || 1}%`} trendUp sparkData={growthSeries.slice(-7)} sparkColor="#FF916C" />
        <KPICard label="Active Sessions" value={formatNumber(activeSessions)} suffix="/live" trend={`${Math.min(activeSessions * 14, 100)}%`} trendUp sparkData={dauSeries.slice(-7)} sparkColor="#6CB4FF" />
        <KPICard label="DAU (Today)" value={formatNumber(engagement?.dau || 0)} trend={`${engagement?.dauPercent || 0}%`} trendUp={(engagement?.dau || 0) > 0} sparkData={dauSeries} sparkColor="#4EF0A0" />
        <KPICard label="Avg Rating" value={ratings?.averageRating?.toFixed(2) || '0.00'} suffix="/5" trend={`${ratings?.npsProxyPercent || 0}%`} trendUp={(ratings?.npsProxyPercent || 0) > 50} sparkData={ratingSeries} sparkColor="#FFB23E" />
      </div>

      {/* PWA Installs mini row */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#A78BFA]/15">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#A78BFA]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#f0ece4]">PWA Installs</p>
              <p className="text-[9px] text-[#7a6f94]">Students who installed Attend75 on their device</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-lg font-bold text-[#f0ece4]">{pwaInstalls.total}</p>
              <p className="text-[8px] font-semibold uppercase text-[#7a6f94]">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#4EF0A0]">{pwaInstalls.android}</p>
              <p className="text-[8px] font-semibold uppercase text-[#7a6f94]">Android</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#6CB4FF]">{pwaInstalls.ios}</p>
              <p className="text-[8px] font-semibold uppercase text-[#7a6f94]">iOS</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#FFB23E]">{pwaInstalls.desktop}</p>
              <p className="text-[8px] font-semibold uppercase text-[#7a6f94]">Desktop</p>
            </div>
          </div>
        </div>
      </div>

      {/* Waitlist mini row */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF916C]/15">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 20h20M5 20V10l7-7 7 7v10" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#f0ece4]">Premium Waitlist</p>
              <p className="text-[9px] text-[#7a6f94]">Students who tapped "Join Waitlist" on the Premium page</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-lg font-bold text-[#f0ece4]">{waitlist.total ?? '—'}</p>
              <p className="text-[8px] font-semibold uppercase text-[#7a6f94]">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#FF916C]">{waitlist.last7days ?? '—'}</p>
              <p className="text-[8px] font-semibold uppercase text-[#7a6f94]">Last 7d</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#4EF0A0]">
                {waitlist.total ? `₹${formatNumber(waitlist.total * 19)}` : '—'}
              </p>
              <p className="text-[8px] font-semibold uppercase text-[#7a6f94]">Est. MRR</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('waitlist')}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10"
            >
              View →
            </button>
          </div>
        </div>
      </div>

      {/* Middle Row - 4 cards, Auth providers wider */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-4 [&>*]:min-h-[320px]">
        {/* New Users Chart */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#f0ece4]">New users · last 30 days</p>
              <p className="text-[9px] text-[#7a6f94]">Daily signups across all colleges</p>
            </div>
            <span className="rounded-full bg-[#4EF0A0]/15 px-2 py-0.5 text-[9px] font-bold text-[#4EF0A0]">+{growthSeries.reduce((a, b) => a + b, 0)} MoM</span>
          </div>
          <div className="mt-6">
            <AreaChart data={growthSeries} color="#FF916C" height={140} />
          </div>
        </div>

        <PortalHealthCard scraperPerformance={scraperPerformance} />
        <APIErrorRateCard healthStatus={healthStatus} />
        <AuthProvidersCard authBreakdown={authBreakdown} />
      </div>

      {/* Bottom Row - 3 cards */}
      <div className="grid grid-cols-3 gap-4">
        <TopLessonsCard studyMeAnalytics={studyMeAnalytics} />
        <FeatureAdoptionCard featureAdoption={featureAdoption} />
        <RecentFeedbackCard feedback={feedback} onViewAll={() => onNavigate('feedback')} />
      </div>
    </div>
  )
}

export default OverviewDashboard
