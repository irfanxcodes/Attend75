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

function KPICard({ label, value, suffix = '', trend, trendUp }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6A88]">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-[#F4F1FF]">{value}</span>
        {suffix ? <span className="text-sm text-[#6E6A88]">{suffix}</span> : null}
      </div>
      {trend !== undefined ? (
        <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold ${trendUp ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
          <span>{trendUp ? '▲' : '▼'}</span>
          <span>{trend}</span>
        </div>
      ) : null}
    </div>
  )
}

function MiniSparkline({ data, color = '#FF916C', height = 40 }) {
  if (!data?.length) return <div style={{ height }} />
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 200
  const h = height

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h * 0.8) - h * 0.1
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PortalHealthCard({ scraperPerformance }) {
  const isDown = scraperPerformance?.portalDowntimeDetected
  const consecutiveFails = scraperPerformance?.consecutiveNetworkFailures || 0
  const successRate = scraperPerformance?.successRatePercent || 0
  const uptime = successRate > 99 ? '99.9' : successRate > 95 ? successRate.toFixed(1) : successRate.toFixed(0)

  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6A88]">Portal Health</p>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${isDown ? 'bg-[#FF5B5B]/15 text-[#FF5B5B]' : successRate < 95 ? 'bg-[#FFB23E]/15 text-[#FFB23E]' : 'bg-[#4EF0A0]/15 text-[#4EF0A0]'}`}>
          {isDown ? 'Down' : successRate < 95 ? 'Degraded' : 'Healthy'}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-6">
        <div className="text-center">
          <span className="text-2xl font-bold text-[#FFB23E]">{consecutiveFails}</span>
          <p className="mt-0.5 text-[9px] text-[#6E6A88]">cons. fails</p>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-[#F4F1FF]">{uptime}<span className="text-sm text-[#6E6A88]">%</span></span>
          <p className="mt-0.5 text-[9px] text-[#6E6A88]">uptime 24h</p>
        </div>
      </div>
    </div>
  )
}

function APIErrorRateCard({ healthStatus }) {
  const errorRate = healthStatus?.errorRatePercent || 0
  const isGood = errorRate < 1
  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6A88]">API Error Rate</p>
        <span className="text-[10px] text-[#6E6A88]">24h rolling window</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-[#F4F1FF]">{errorRate.toFixed(2)}%</span>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${isGood ? 'bg-[#4EF0A0]/15 text-[#4EF0A0]' : 'bg-[#FFB23E]/15 text-[#FFB23E]'}`}>
          {isGood ? 'good' : 'elevated'}
        </span>
      </div>
      <div className="mt-2">
        <p className="text-[9px] text-[#6E6A88]">Target &lt; 1.0% &nbsp; peak {errorRate.toFixed(2)}%</p>
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

  // Donut chart values
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const firebaseArc = (firebase / (total || 1)) * circumference
  const guestArc = (guest / (total || 1)) * circumference

  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6A88]">Auth Providers</p>
      <p className="text-[9px] text-[#6E6A88]">Of all registered users</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={radius} stroke="#302A52" strokeWidth="10" fill="none" />
            <circle cx="50" cy="50" r={radius} stroke="#FF5B5B" strokeWidth="10" fill="none" strokeDasharray={`${firebaseArc} ${circumference}`} strokeLinecap="round" />
            <circle cx="50" cy="50" r={radius} stroke="#6E6A88" strokeWidth="10" fill="none" strokeDasharray={`${guestArc} ${circumference}`} strokeDashoffset={-firebaseArc} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] text-[#6E6A88]">Total</span>
            <span className="text-sm font-bold text-[#F4F1FF]">{formatNumber(total)}</span>
          </div>
        </div>
        <div className="space-y-2 text-[10px]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#FF5B5B]" />
            <span className="text-[#D8D4E7]">Google</span>
            <span className="ml-auto font-semibold text-[#F4F1FF]">{formatNumber(firebase)}</span>
            <span className="text-[#6E6A88]">{firebasePercent}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#6E6A88]" />
            <span className="text-[#D8D4E7]">Guest</span>
            <span className="ml-auto font-semibold text-[#F4F1FF]">{formatNumber(guest)}</span>
            <span className="text-[#6E6A88]">{guestPercent}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopLessonsCard({ studyMeAnalytics }) {
  const lessons = studyMeAnalytics?.lessonAnalytics?.slice(0, 6) || []
  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <p className="text-sm font-semibold text-[#F4F1FF]">Top lessons today</p>
      <p className="text-[9px] text-[#6E6A88]">By unique opens</p>
      <div className="mt-3 space-y-2.5">
        {lessons.map((lesson, i) => (
          <div key={lesson.lessonName} className="flex items-center gap-3">
            <span className="w-5 text-[10px] font-semibold text-[#6E6A88]">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-[#D8D4E7]">{lesson.lessonName}</p>
              <div className="mt-1 h-1 w-full rounded-full bg-[#302A52]">
                <div className="h-1 rounded-full bg-[#FF916C]" style={{ width: `${Math.min((lesson.totalOpens / (lessons[0]?.totalOpens || 1)) * 100, 100)}%` }} />
              </div>
            </div>
            <span className="text-[11px] font-semibold text-[#F4F1FF]">{formatNumber(lesson.totalOpens)}</span>
          </div>
        ))}
        {!lessons.length ? <p className="text-[11px] text-[#6E6A88]">No lesson data yet</p> : null}
      </div>
    </div>
  )
}

function FeatureAdoptionCard({ featureAdoption }) {
  const features = featureAdoption?.features || []
  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <p className="text-sm font-semibold text-[#F4F1FF]">Feature adoption</p>
      <p className="text-[9px] text-[#6E6A88]">% of registered users</p>
      <div className="mt-3 space-y-2.5">
        {features.map((feat, i) => (
          <div key={feat.feature} className="flex items-center gap-3">
            <span className="w-5 text-[10px] font-semibold text-[#6E6A88]">{String(i + 1).padStart(2, '0')}</span>
            <span className="min-w-0 flex-1 text-[11px] font-medium text-[#D8D4E7]">{feat.feature}</span>
            <div className="w-16">
              <div className="h-1.5 w-full rounded-full bg-[#302A52]">
                <div className="h-1.5 rounded-full bg-[#6CB4FF]" style={{ width: `${Math.min(feat.adoptionPercent, 100)}%` }} />
              </div>
            </div>
            <span className="w-12 text-right text-[11px] font-semibold text-[#F4F1FF]">{feat.adoptionPercent}%</span>
          </div>
        ))}
        {!features.length ? <p className="text-[11px] text-[#6E6A88]">No data yet</p> : null}
      </div>
    </div>
  )
}

function RecentFeedbackCard({ feedback, onViewAll }) {
  const items = (feedback || []).slice(0, 5)

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

  const referenceTime = Date.now() // eslint-disable-line react-hooks/purity

  const avatarColors = ['#FF916C', '#6CB4FF', '#4EF0A0', '#FFB23E', '#A78BFA']

  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#F4F1FF]">Recent feedback</p>
          <p className="text-[9px] text-[#6E6A88]">Most recent 5</p>
        </div>
        <button type="button" onClick={onViewAll} className="flex items-center gap-1 text-[10px] font-semibold text-[#9F9AB5] hover:text-[#F4F1FF]">
          View all <span>›</span>
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {items.map((item, i) => {
          const tag = getTag(item.message)
          return (
            <div key={item.id || i} className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#1a1625]" style={{ backgroundColor: avatarColors[i % avatarColors.length] }}>
                {getInitials(item.user_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#D8D4E7]">{item.user_name || 'Anonymous'}</span>
                  {tag ? <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${tag.color}`}>{tag.label}</span> : null}
                  <span className="ml-auto text-[9px] text-[#6E6A88]">{computeTimeAgo(item.timestamp, referenceTime)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-[#9F9AB5]">{item.message}</p>
              </div>
            </div>
          )
        })}
        {!items.length ? <p className="text-[11px] text-[#6E6A88]">No feedback yet</p> : null}
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

  const growthSeries = useMemo(() => {
    const series = data?.userAnalytics?.userGrowth?.series || []
    return series.map((item) => item.newUsers || 0)
  }, [data])

  const activeSessions = homepage.activeSessions || data?.sessions?.active_sessions || 0
  const sessionMax = data?.sessions?.max_sessions || 5000
  const sessionPercent = ((activeSessions / sessionMax) * 100).toFixed(0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F4F1FF]">Welcome back, Admin</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#6E6A88]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : 'just now'}
            </span>
            <span>All systems {scraperPerformance?.portalDowntimeDetected ? 'degraded' : 'nominal'}</span>
            <span>{activeSessions} students online right now</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRefresh} disabled={isLoading} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[#D8D4E7] transition hover:bg-white/10 disabled:opacity-50">
            {isLoading ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard label="Total Registered Users" value={formatNumber(homepage.totalUsers || 0)} trend={`${engagement?.dauPercent || 0}%`} trendUp />
        <KPICard label="Active Sessions" value={formatNumber(activeSessions)} suffix={`/${formatNumber(sessionMax)}`} trend={`${sessionPercent}%`} trendUp={Number(sessionPercent) > 0} />
        <KPICard label="DAU (Today)" value={formatNumber(engagement?.dau || 0)} trend={`${engagement?.dauPercent || 0}%`} trendUp={(engagement?.dau || 0) > 0} />
        <KPICard label="Avg Rating" value={ratings?.averageRating?.toFixed(2) || '0.00'} suffix="/5" trend={`${ratings?.npsProxyPercent || 0}%`} trendUp={(ratings?.npsProxyPercent || 0) > 50} />
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-4 gap-3">
        {/* New Users Chart */}
        <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6A88]">New users · last 30 days</p>
          </div>
          <div className="mt-3">
            <MiniSparkline data={growthSeries} color="#FF916C" height={60} />
          </div>
          <p className="mt-2 text-[9px] text-[#6E6A88]">Daily signups across all colleges</p>
        </div>

        <PortalHealthCard scraperPerformance={scraperPerformance} />
        <APIErrorRateCard healthStatus={healthStatus} />
        <AuthProvidersCard authBreakdown={authBreakdown} />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-3">
        <TopLessonsCard studyMeAnalytics={studyMeAnalytics} />
        <FeatureAdoptionCard featureAdoption={featureAdoption} />
        <RecentFeedbackCard feedback={feedback} onViewAll={() => onNavigate('feedback')} />
      </div>
    </div>
  )
}

export default OverviewDashboard
