import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearAdminSession,
  fetchAdminFeedbackLog,
  fetchAdminOverview,
  logoutAdminSession,
  parseAdminSession,
} from '../../services/adminApi'

const NAV_ITEMS = [
  { id: 'homepage', label: 'Homepage' },
  { id: 'health-status', label: 'App Health & Status' },
  { id: 'user-analytics', label: 'User Analytics' },
  { id: 'scraper-performance', label: 'Scraper Performance' },
  { id: 'feature-usage', label: 'Feature Usage' },
  { id: 'feedback-management', label: 'Feedback Management' },
]

const HEALTH_METRIC_DEFINITIONS = [
  {
    name: 'Backend Status',
    type: 'Real-time',
    definition: 'Reports whether the current backend process is reachable and serving admin overview data.',
  },
  {
    name: 'API Latency',
    type: 'Derived',
    definition: 'Average request duration in milliseconds since backend process startup.',
  },
  {
    name: 'Error Rate',
    type: 'Derived',
    definition: 'Computed as 5xx server errors / total requests × 100 over the current process lifetime.',
  },
  {
    name: 'Request Failure Rate',
    type: 'Derived',
    definition: 'Computed as all failed requests (4xx + 5xx) / total requests × 100.',
  },
  {
    name: 'Last Error Timestamp',
    type: 'Real-time',
    definition: 'UTC timestamp of the most recent request that returned status code >= 400.',
  },
  {
    name: 'Uptime',
    type: 'Real-time',
    definition: 'Elapsed time since the current backend process started.',
  },
  {
    name: 'Database Connectivity',
    type: 'Real-time',
    definition: 'Live result of a direct database ping (SELECT 1) executed on admin overview fetch.',
  },
]

const SCRAPER_METRIC_DEFINITIONS = [
  {
    name: 'Success Rate',
    type: 'Derived',
    definition: 'Computed as successful scraper attempts divided by total scraper attempts since backend process startup.',
  },
  {
    name: 'Failure Rate',
    type: 'Derived',
    definition: 'Computed as failed scraper attempts divided by total scraper attempts since backend process startup.',
  },
  {
    name: 'Average Scrape Time',
    type: 'Derived',
    definition: 'Average duration across all tracked scraper attempts in milliseconds.',
  },
  {
    name: 'Last Failure',
    type: 'Real-time',
    definition: 'Timestamp and failure code of the most recent failed scraper attempt.',
  },
  {
    name: 'Portal Downtime Detection',
    type: 'Derived',
    definition: 'Heuristic flag triggered by consecutive recent network failures, not a direct external uptime probe.',
  },
]

const FEATURE_USAGE_DEFINITIONS = [
  {
    name: 'Sync Attendance Usage',
    type: 'Real-time',
    definition: 'Counts successful attendance sync requests made by users since backend process startup.',
  },
  {
    name: 'History Open Usage',
    type: 'Real-time',
    definition: 'Counts successful attendance history loads since backend process startup.',
  },
  {
    name: 'Most Viewed Semester',
    type: 'Derived',
    definition: 'Semester with the highest total interactions across sync, history, and marks usage in the current process lifetime.',
  },
  {
    name: 'Marks Usage',
    type: 'Real-time',
    definition: 'Counts successful consolidated marks fetch actions since backend process startup.',
  },
]

const NO_ACTIVITY_MESSAGE = 'No activity recorded yet. Metrics will appear once users interact with the app.'

function StatCard({ label, value, subtitle, tone = 'default' }) {
  const toneClasses = {
    default: 'text-[#F4F1FF]',
    success: 'text-[#A8F5C5]',
    warning: 'text-[#F7D58E]',
    danger: 'text-[#FFB3B3]',
  }

  return (
    <article className="rounded-2xl border border-white/15 bg-[#3A315D] p-4 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.95)]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#D8D3E8]">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClasses[tone] || toneClasses.default}`}>{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-[#CFC5E8]">{subtitle}</p> : null}
    </article>
  )
}

function SectionInfoButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/5 text-[#E6DCF7] transition hover:bg-white/15"
      aria-label={`Show ${label} metric definitions`}
      title={`About ${label} metrics`}
    >
      i
    </button>
  )
}

function MetricDefinitionsModal({ title, items, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/20 bg-[#312051] p-4 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-[#F4F1FF]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-white/10"
            aria-label="Close metric definitions"
          >
            x
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <article key={item.name} className="rounded-xl border border-white/10 bg-[#3A315D] p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-[#F4F1FF]">{item.name}</h4>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    item.type === 'Real-time'
                      ? 'bg-emerald-400/20 text-emerald-200'
                      : 'bg-amber-300/20 text-amber-100'
                  }`}
                >
                  {item.type}
                </span>
              </div>
              <p className="mt-2 text-xs text-[#D8D3E8]">{item.definition}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatMetricNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '--'
  return numeric.toLocaleString()
}

function formatMetricPercentage(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '--'
  return `${numeric.toFixed(2)}%`
}

function formatUptime(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total < 0) return '--'

  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = Math.floor(total % 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function AdminDashboard() {
  const navigate = useNavigate()
  const [adminSession, setAdminSession] = useState(null)
  const [overview, setOverview] = useState(null)
  const [feedbackItems, setFeedbackItems] = useState([])
  const [activeSection, setActiveSection] = useState('homepage')
  const [isLoading, setIsLoading] = useState(true)
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(true)
  const [feedbackError, setFeedbackError] = useState('')
  const [feedbackSort, setFeedbackSort] = useState('latest')
  const [metricInfoModal, setMetricInfoModal] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const currentSession = parseAdminSession()
    if (!currentSession?.sessionToken) {
      navigate('/admin/login', { replace: true })
      return
    }

    setAdminSession(currentSession)
  }, [navigate])

  useEffect(() => {
    if (!adminSession?.sessionToken) {
      return
    }

    let isActive = true

    void (async () => {
      try {
        setIsLoading(true)
        setError('')

        const [overviewData, feedbackLog] = await Promise.all([
          fetchAdminOverview(adminSession.sessionToken),
          fetchAdminFeedbackLog(adminSession.sessionToken, {
            limit: 200,
            sort: feedbackSort || 'latest',
          }),
        ])

        if (!isActive) return

        setOverview(overviewData)
        setFeedbackItems(feedbackLog)
        setFeedbackError('')
      } catch (requestError) {
        if (!isActive) return
        if (requestError?.status === 401) {
          clearAdminSession()
          navigate('/admin/login', { replace: true })
          return
        }
        const message = requestError.message || 'Unable to load admin dashboard data.'
        setError(message)
        setFeedbackError(message)
      } finally {
        if (isActive) {
          setIsLoading(false)
          setIsFeedbackLoading(false)
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [adminSession, navigate, feedbackSort])

  const homepageCards = useMemo(() => {
    if (!overview?.homepage) return []

    const metrics = overview.homepage

    return [
      {
        label: 'Total Users',
        value: formatMetricNumber(metrics.totalUsers),
        subtitle: `${formatMetricNumber(overview?.users?.linkedCredentials ?? 0)} linked credentials`,
        tone: 'default',
      },
      {
        label: 'Active Users Today',
        value: formatMetricNumber(metrics.activeUsersToday),
        subtitle: 'Users active in the current UTC day',
        tone: 'success',
      },
      {
        label: 'Active Sessions',
        value: formatMetricNumber(metrics.activeSessions),
        subtitle: `Session TTL ${formatMetricNumber(overview?.sessions?.session_ttl_seconds ?? 0)}s`,
        tone: 'default',
      },
      {
        label: 'Feedback Count',
        value: formatMetricNumber(metrics.feedbackCount),
        subtitle: overview.feedback?.latest?.timestamp
          ? `Latest ${new Date(overview.feedback.latest.timestamp).toLocaleString()}`
          : 'No entries yet',
        tone: 'default',
      },
      {
        label: 'Failed Request Count',
        value: formatMetricNumber(metrics.failedRequestCount),
        subtitle: 'Since backend process startup',
        tone: Number(metrics.failedRequestCount) > 0 ? 'danger' : 'success',
      },
      {
        label: 'Average Response Time',
        value: `${formatMetricNumber(metrics.averageResponseTimeMs)} ms`,
        subtitle: 'Rolling average of API request durations',
        tone: 'warning',
      },
      {
        label: 'Scraper Success Rate',
        value: formatMetricPercentage(metrics.scraperSuccessRate),
        subtitle: 'Based on login/attendance scraping requests',
        tone: 'success',
      },
    ]
  }, [overview])

  async function handleLogout() {
    await logoutAdminSession(adminSession?.sessionToken)
    clearAdminSession()
    navigate('/admin/login', { replace: true })
  }

  const sectionTitle = NAV_ITEMS.find((item) => item.id === activeSection)?.label || 'Homepage'

  const isHomepage = activeSection === 'homepage'
  const isHealthStatus = activeSection === 'health-status'
  const isUserAnalytics = activeSection === 'user-analytics'
  const isScraperPerformance = activeSection === 'scraper-performance'
  const isFeatureUsage = activeSection === 'feature-usage'
  const isFeedbackManagement = activeSection === 'feedback-management'

  const healthStatusCards = useMemo(() => {
    const healthStatus = overview?.healthStatus
    if (!healthStatus) return []

    const cards = []

    if (healthStatus.backendStatus) {
      cards.push({
        label: 'Backend Status',
        value: String(healthStatus.backendStatus).toUpperCase(),
        subtitle: 'Real-time',
        tone: String(healthStatus.backendStatus).toLowerCase() === 'up' ? 'success' : 'danger',
      })
    }

    if (Number.isFinite(Number(healthStatus.apiLatencyMs))) {
      cards.push({
        label: 'API Latency',
        value: `${formatMetricNumber(healthStatus.apiLatencyMs)} ms`,
        subtitle: 'Derived from live request timings',
        tone: 'warning',
      })
    }

    if (Number.isFinite(Number(healthStatus.errorRatePercent))) {
      cards.push({
        label: 'Error Rate',
        value: formatMetricPercentage(healthStatus.errorRatePercent),
        subtitle: '5xx server errors only',
        tone: Number(healthStatus.errorRatePercent) > 0 ? 'danger' : 'success',
      })
    }

    if (Number.isFinite(Number(healthStatus.requestFailureRatePercent))) {
      cards.push({
        label: 'Request Failure Rate',
        value: formatMetricPercentage(healthStatus.requestFailureRatePercent),
        subtitle: 'All 4xx + 5xx request outcomes',
        tone: Number(healthStatus.requestFailureRatePercent) > 0 ? 'warning' : 'success',
      })
    }

    cards.push({
      label: 'Last Error Timestamp',
      value: healthStatus.lastErrorTimestamp ? new Date(healthStatus.lastErrorTimestamp).toLocaleString() : 'No errors recorded',
      subtitle: 'Real-time event marker',
      tone: healthStatus.lastErrorTimestamp ? 'danger' : 'success',
    })

    if (Number.isFinite(Number(healthStatus.uptimeSeconds))) {
      cards.push({
        label: 'Uptime',
        value: formatUptime(healthStatus.uptimeSeconds),
        subtitle: 'Real-time process uptime',
        tone: 'default',
      })
    }

    if (healthStatus.databaseConnectivity) {
      cards.push({
        label: 'Database Connectivity',
        value: String(healthStatus.databaseConnectivity).toUpperCase(),
        subtitle: 'Real-time connectivity check',
        tone: String(healthStatus.databaseConnectivity).toLowerCase() === 'connected' ? 'success' : 'danger',
      })
    }

    return cards
  }, [overview])

  const userAnalyticsCards = useMemo(() => {
    const metrics = overview?.userAnalytics
    if (!metrics) return []

    return [
      {
        label: 'Total Users',
        value: formatMetricNumber(metrics.totalUsers),
        subtitle: 'Derived from current users table snapshot',
        tone: 'default',
      },
      {
        label: 'Active Sessions',
        value: formatMetricNumber(metrics.activeSessions),
        subtitle: 'Real-time in-memory backend session count',
        tone: 'success',
      },
    ]
  }, [overview])

  const userGrowthSeries = useMemo(() => {
    const series = overview?.userAnalytics?.userGrowth?.series
    return Array.isArray(series) ? series : []
  }, [overview])

  const maxNewUsersInGrowth = useMemo(() => {
    if (!userGrowthSeries.length) return 0
    return Math.max(...userGrowthSeries.map((item) => Number(item.newUsers) || 0), 0)
  }, [userGrowthSeries])

  const usersTableRows = useMemo(() => {
    const rows = overview?.userAnalytics?.usersTable
    return Array.isArray(rows) ? rows : []
  }, [overview])

  const unavailableUserAnalytics = useMemo(() => {
    const items = overview?.userAnalytics?.unavailableMetrics
    return Array.isArray(items) ? items : []
  }, [overview])

  const scraperPerformanceCards = useMemo(() => {
    const metrics = overview?.scraperPerformance
    if (!metrics) return []

    const lastFailureLabel = metrics.lastFailureTimestamp
      ? new Date(metrics.lastFailureTimestamp).toLocaleString()
      : 'No failures recorded'

    return [
      {
        label: 'Success Rate',
        value: formatMetricPercentage(metrics.successRatePercent),
        subtitle: 'Derived from tracked scraper attempts',
        tone: Number(metrics.successRatePercent) >= 90 ? 'success' : 'warning',
      },
      {
        label: 'Failure Rate',
        value: formatMetricPercentage(metrics.failureRatePercent),
        subtitle: 'Derived from tracked scraper attempts',
        tone: Number(metrics.failureRatePercent) > 0 ? 'danger' : 'success',
      },
      {
        label: 'Average Scrape Time',
        value: `${formatMetricNumber(metrics.averageScrapeTimeMs)} ms`,
        subtitle: 'Average duration across scraper calls',
        tone: 'warning',
      },
      {
        label: 'Last Failure',
        value: lastFailureLabel,
        subtitle: metrics.lastFailureCode ? `Failure code: ${metrics.lastFailureCode}` : 'No failure code available',
        tone: metrics.lastFailureTimestamp ? 'danger' : 'success',
      },
      {
        label: 'Portal Downtime Detection',
        value: metrics.portalDowntimeDetected ? 'DETECTED' : 'NOT DETECTED',
        subtitle: `${formatMetricNumber(metrics.consecutiveNetworkFailures)} consecutive network failures`,
        tone: metrics.portalDowntimeDetected ? 'danger' : 'success',
      },
      {
        label: 'Total Attempts',
        value: formatMetricNumber(metrics.totalAttempts),
        subtitle: 'Tracked since backend process startup',
        tone: 'default',
      },
    ]
  }, [overview])

  const hasRequestActivity = Number(overview?.instrumentation?.requestMetrics?.totalRequests || 0) > 0
  const hasScraperActivity = Number(overview?.scraperPerformance?.totalAttempts || 0) > 0
  const hasUserGrowthActivity = userGrowthSeries.some((point) => Number(point.newUsers || 0) > 0)
  const hasFeatureUsageActivity = Number(overview?.featureUsage?.totalSemesterInteractions || 0) > 0
  const failedRequestInsights = Array.isArray(overview?.homepage?.failedRequestInsights)
    ? overview.homepage.failedRequestInsights
    : []
  const nonWorkingPages = Array.isArray(overview?.featureUsage?.nonWorkingPages)
    ? overview.featureUsage.nonWorkingPages
    : []

  const featureUsageCards = useMemo(() => {
    const metrics = overview?.featureUsage
    if (!metrics) return []

    const normalizedMostViewedSemester = metrics.mostViewedSemester && metrics.mostViewedSemester !== 'default'
      ? String(metrics.mostViewedSemester)
      : 'Default semester selection'

    return [
      {
        label: 'Sync Attendance Used',
        value: formatMetricNumber(metrics.syncAttendanceCount),
        subtitle: 'Successful sync requests since startup',
        tone: 'success',
      },
      {
        label: 'History Opened',
        value: formatMetricNumber(metrics.historyOpenCount),
        subtitle: 'Successful history loads since startup',
        tone: 'default',
      },
      {
        label: 'Marks Opened',
        value: formatMetricNumber(metrics.marksOpenCount),
        subtitle: 'Successful marks loads since startup',
        tone: 'default',
      },
      {
        label: 'Most Viewed Semester',
        value: normalizedMostViewedSemester,
        subtitle: `${formatMetricNumber(metrics.mostViewedSemesterCount)} interactions across sync/history/marks`,
        tone: Number(metrics.mostViewedSemesterCount) > 0 ? 'warning' : 'default',
      },
    ]
  }, [overview])

  return (
    <section className="min-h-dvh bg-[radial-gradient(circle_at_20%_0%,#5f5690_0%,#3b335f_44%,#2b2446_100%)] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-white/15 bg-[#2A2344]/95 p-3 backdrop-blur">
          <div className="rounded-xl border border-white/10 bg-[#3C345D] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#D8D3E8]">Admin</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#F4F1FF]">{adminSession?.username || 'admin'}</p>
          </div>

          <nav className="mt-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.id === activeSection
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? 'bg-[#E2BC8B] text-[#251d3f]'
                      : 'bg-transparent text-[#D8D3E8] hover:bg-white/10'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#E2BC8B] px-4 text-sm font-semibold text-[#1D183E] transition hover:bg-[#D9AA6F]"
          >
            Sign out
          </button>
        </aside>

        <div className="space-y-4">
          <header className="rounded-2xl border border-white/20 bg-[#5B5485]/95 p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#D8D3E8]">Admin Panel</p>
            <h1 className="mt-1 text-2xl font-bold text-[#F4F1FF]">{sectionTitle}</h1>
            <p className="mt-1 text-sm text-[#D8D3E8]">
              {isHomepage
                ? 'System-level summary metrics for the Attend75 platform.'
                : isHealthStatus
                  ? 'Operational health signals sourced from live backend instrumentation.'
                  : isUserAnalytics
                    ? 'Trustworthy analytics generated only from currently measurable backend data.'
                    : isScraperPerformance
                      ? 'Live scraper telemetry for success, failures, performance, and downtime heuristics.'
                      : isFeatureUsage
                        ? 'Live usage counters for core user actions and semester interaction patterns.'
                        : isFeedbackManagement
                          ? 'Review feedback entries with streamlined latest/oldest sorting.'
                    : 'This section will be implemented next.'}
            </p>
          </header>

          {isLoading ? (
            <div className="rounded-xl border border-white/15 bg-[#3A315D] p-4 text-sm text-[#D8D3E8]">Loading admin insights...</div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-300/50 bg-rose-500/15 p-4 text-sm text-rose-100">{error}</div>
          ) : null}

          {!isLoading && !error && isHomepage ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {homepageCards.map((card) => (
                  <StatCard key={card.label} label={card.label} value={card.value} subtitle={card.subtitle} tone={card.tone} />
                ))}
              </div>

              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Failed Request Diagnostics</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Root-cause breakdown for the failed request count and practical mitigation actions.</p>

                {failedRequestInsights.length ? (
                  <div className="mt-4 space-y-3">
                    {failedRequestInsights.map((item) => (
                      <article key={`${item.path}-${item.failedCount}`} className="rounded-xl border border-white/10 bg-[#3A315D] p-3">
                        <p className="text-sm font-semibold text-[#F4F1FF]">{item.path}</p>
                        <p className="mt-1 text-xs text-[#D8D3E8]">
                          {item.failedCount} failed requests ({item.clientErrorCount} client, {item.serverErrorCount} server)
                        </p>
                        <p className="mt-2 text-xs text-[#D8D3E8]"><span className="font-semibold text-[#F4F1FF]">Cause:</span> {item.likelyCause}</p>
                        <p className="mt-1 text-xs text-[#D8D3E8]"><span className="font-semibold text-[#F4F1FF]">Fix:</span> {item.recommendedFix}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#D8D3E8]">No failed request diagnostics yet.</p>
                )}
              </section>
            </>
          ) : null}

          {!isLoading && !error && isHealthStatus ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#312051] px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#F4F1FF]">App Health</h2>
                  <p className="text-xs text-[#D8D3E8]">Server-error rate, request quality, and backend health indicators.</p>
                </div>
                <SectionInfoButton label="App Health" onClick={() => setMetricInfoModal('health')} />
              </div>

              {!hasRequestActivity ? (
                <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {NO_ACTIVITY_MESSAGE}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {healthStatusCards.map((card) => (
                  <StatCard key={card.label} label={card.label} value={card.value} subtitle={card.subtitle} tone={card.tone} />
                ))}
              </div>

              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Error Rate Analysis</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">
                  Error Rate reflects 5xx server failures only. Request Failure Rate includes all 4xx and 5xx responses and is often elevated by expired sessions or invalid client calls.
                </p>
                <p className="mt-3 text-xs text-[#D8D3E8]">
                  Current Request Failure Rate: {formatMetricPercentage(overview?.healthStatus?.requestFailureRatePercent)}
                </p>
              </section>
            </section>
          ) : null}

          {!isLoading && !error && isUserAnalytics ? (
            <section className="space-y-3">
              {!hasUserGrowthActivity ? (
                <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {NO_ACTIVITY_MESSAGE}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {userAnalyticsCards.map((card) => (
                  <StatCard key={card.label} label={card.label} value={card.value} subtitle={card.subtitle} tone={card.tone} />
                ))}
              </div>

              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">User Growth (Last 14 Days)</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Derived from user account creation timestamps.</p>

                {userGrowthSeries.length ? (
                  <div className="mt-4 overflow-x-auto pb-2">
                    <div className="flex min-w-[680px] items-end gap-2 rounded-xl border border-white/10 bg-[#3A315D] p-3">
                      {userGrowthSeries.map((point) => {
                        const newUsers = Number(point.newUsers) || 0
                        const heightPercent = maxNewUsersInGrowth > 0 ? Math.max((newUsers / maxNewUsersInGrowth) * 100, 6) : 6

                        return (
                          <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                            <div className="text-[10px] text-[#D8D3E8]">{newUsers}</div>
                            <div className="flex h-32 w-full items-end rounded-md bg-[#2F2750] px-1">
                              <div
                                className="w-full rounded-sm bg-[#E2BC8B]"
                                style={{ height: `${heightPercent}%` }}
                                title={`${point.date}: ${newUsers} new users, ${point.cumulativeUsers} cumulative`}
                              />
                            </div>
                            <div className="text-[10px] text-[#BEB5DA]">{String(point.date).slice(5)}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#D8D3E8]">No user growth records available yet.</p>
                )}
              </section>

              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Users Table</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Current user records from database snapshot.</p>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#CFC5E8]">
                        <th className="px-3 py-2">S. No.</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email ID</th>
                        <th className="px-3 py-2">Roll Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersTableRows.length ? (
                        usersTableRows.map((row) => (
                          <tr key={row.serialNo} className="rounded-lg bg-[#3A315D] text-sm text-[#F4F1FF]">
                            <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-[#D8D3E8]">{row.serialNo}</td>
                            <td className="px-3 py-2 align-top">{row.name || '--'}</td>
                            <td className="px-3 py-2 align-top">{row.emailId || '--'}</td>
                            <td className="px-3 py-2 align-top">{row.rollNumber || '--'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="rounded-lg bg-[#3A315D] px-3 py-4 text-sm text-[#D8D3E8]">
                            No users found in current database.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {unavailableUserAnalytics.length ? (
                <section className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 sm:p-5">
                  <h2 className="text-lg font-semibold text-amber-100">Currently Unavailable KPIs</h2>
                  <p className="mt-1 text-sm text-amber-50/90">
                    These were intentionally excluded from metric cards because the backend does not yet persist the required source events.
                  </p>

                  <div className="mt-3 space-y-2">
                    {unavailableUserAnalytics.map((item) => (
                      <article key={item.name} className="rounded-xl border border-amber-200/20 bg-[#3A315D]/80 p-3">
                        <p className="text-sm font-semibold text-[#F4F1FF]">{item.name}</p>
                        <p className="mt-1 text-xs text-[#D8D3E8]">{item.reason}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {!isLoading && !error && isScraperPerformance ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#312051] px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#F4F1FF]">Scraper Performance</h2>
                  <p className="text-xs text-[#D8D3E8]">Success/failure trends and root causes from scraper telemetry.</p>
                </div>
                <SectionInfoButton label="Scraper Performance" onClick={() => setMetricInfoModal('scraper')} />
              </div>

              {!hasScraperActivity ? (
                <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {NO_ACTIVITY_MESSAGE}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {scraperPerformanceCards.map((card) => (
                  <StatCard key={card.label} label={card.label} value={card.value} subtitle={card.subtitle} tone={card.tone} />
                ))}
              </div>

              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Failure Analysis & Fixes</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">
                  Success and failure rates are driven by authentication/session validity, portal responsiveness, and client retry behavior.
                </p>

                <div className="mt-3 space-y-2">
                  {Array.isArray(overview?.scraperPerformance?.topFailureCodes) && overview.scraperPerformance.topFailureCodes.length ? (
                    overview.scraperPerformance.topFailureCodes.map((item) => (
                      <div key={`${item.code}-${item.count}`} className="rounded-lg border border-white/10 bg-[#3A315D] px-3 py-2 text-xs text-[#D8D3E8]">
                        <span className="font-semibold text-[#F4F1FF]">{item.code}</span>: {item.count} failures
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[#D8D3E8]">No failure-code distribution available yet.</p>
                  )}
                </div>

                {String(overview?.scraperPerformance?.lastFailureCode || '').toUpperCase() === 'LOGIN_FAILED' ? (
                  <div className="mt-3 rounded-xl border border-rose-300/35 bg-rose-500/10 p-3 text-xs text-rose-100">
                    <p className="font-semibold">Last Failure Root Cause: LOGIN_FAILED</p>
                    <p className="mt-1">Likely cause: invalid portal credentials, portal login form changes, or stale authenticated session cookies.</p>
                    <p className="mt-1">Fixes: enforce re-login on auth failure, validate credentials before retry loops, and alert on login-form selector drift in scraper.</p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-amber-100">Downtime Heuristic Disclosure</h2>
                <p className="mt-1 text-sm text-amber-50/90">
                  {overview?.scraperPerformance?.downtimeHeuristic || 'Portal downtime is based on a backend heuristic and should be treated as an operational alert signal.'}
                </p>
              </section>
            </section>
          ) : null}

          {!isLoading && !error && isFeatureUsage ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#312051] px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#F4F1FF]">Feature Usage</h2>
                  <p className="text-xs text-[#D8D3E8]">Live adoption metrics for attendance, history, and marks flows.</p>
                </div>
                <SectionInfoButton label="Feature Usage" onClick={() => setMetricInfoModal('feature')} />
              </div>

              {!hasFeatureUsageActivity ? (
                <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {NO_ACTIVITY_MESSAGE}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {featureUsageCards.map((card) => (
                  <StatCard key={card.label} label={card.label} value={card.value} subtitle={card.subtitle} tone={card.tone} />
                ))}
              </div>

              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Most Viewed Semester Validation</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">
                  Source audited from backend feature usage counters. Semester interactions now include Sync Attendance, History, and Marks events.
                </p>
              </section>

              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Pages Not Working</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Pages with failed API patterns and likely reasons based on endpoint diagnostics.</p>

                {nonWorkingPages.length ? (
                  <div className="mt-3 space-y-2">
                    {nonWorkingPages.map((item) => (
                      <article key={`${item.page}-${item.endpoint}`} className="rounded-xl border border-white/10 bg-[#3A315D] p-3">
                        <p className="text-sm font-semibold text-[#F4F1FF]">{item.page}</p>
                        <p className="mt-1 text-xs text-[#D8D3E8]">Endpoint: {item.endpoint}</p>
                        <p className="mt-1 text-xs text-[#D8D3E8]">Failed Requests: {formatMetricNumber(item.failedCount)}</p>
                        <p className="mt-1 text-xs text-[#D8D3E8]">Reason: {item.reason}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#D8D3E8]">No problematic pages detected from current telemetry.</p>
                )}
              </section>
            </section>
          ) : null}

          {!isLoading && !error && isFeedbackManagement ? (
            <section className="space-y-3">
              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Feedback Management</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Feedback list with simple chronological sorting.</p>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1 md:max-w-xs">
                    <span className="text-xs uppercase tracking-wide text-[#CFC5E8]">Sort</span>
                    <select
                      value={feedbackSort}
                      onChange={(event) => setFeedbackSort(event.target.value)}
                      className="w-full rounded-lg border border-white/20 bg-[#3A315D] px-3 py-2 text-sm text-[#F4F1FF] focus:border-[#E2BC8B] focus:outline-none"
                    >
                      <option value="latest">Latest</option>
                      <option value="oldest">Oldest</option>
                    </select>
                  </label>
                </div>

                {feedbackError ? (
                  <div className="mt-3 rounded-lg border border-rose-300/40 bg-rose-500/10 p-3 text-sm text-rose-100">{feedbackError}</div>
                ) : null}

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#CFC5E8]">
                        <th className="px-3 py-2">User Name</th>
                        <th className="px-3 py-2">Message</th>
                        <th className="px-3 py-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isFeedbackLoading ? (
                        <tr>
                          <td colSpan={3} className="rounded-lg bg-[#3A315D] px-3 py-4 text-sm text-[#D8D3E8]">
                            Loading feedback...
                          </td>
                        </tr>
                      ) : feedbackItems.length ? (
                        feedbackItems.map((entry) => (
                          <tr key={entry.id || `${entry.timestamp}-${entry.message}`} className="rounded-lg bg-[#3A315D] text-sm text-[#F4F1FF]">
                            <td className="whitespace-nowrap px-3 py-2 align-top">{entry.user_name || 'Anonymous'}</td>
                            <td className="px-3 py-2 align-top">{entry.message}</td>
                            <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-[#D8D3E8]">
                              {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : '--'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="rounded-lg bg-[#3A315D] px-3 py-4 text-sm text-[#D8D3E8]">
                            No feedback entries available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          ) : null}

          {metricInfoModal === 'health' ? (
            <MetricDefinitionsModal
              title="App Health Metric Definitions"
              items={HEALTH_METRIC_DEFINITIONS}
              onClose={() => setMetricInfoModal('')}
            />
          ) : null}

          {metricInfoModal === 'scraper' ? (
            <MetricDefinitionsModal
              title="Scraper Performance Metric Definitions"
              items={SCRAPER_METRIC_DEFINITIONS}
              onClose={() => setMetricInfoModal('')}
            />
          ) : null}

          {metricInfoModal === 'feature' ? (
            <MetricDefinitionsModal
              title="Feature Usage Metric Definitions"
              items={FEATURE_USAGE_DEFINITIONS}
              onClose={() => setMetricInfoModal('')}
            />
          ) : null}

          {!isLoading && !error && !isHomepage && !isHealthStatus && !isUserAnalytics && !isScraperPerformance && !isFeatureUsage && !isFeedbackManagement ? (
            <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-[#F4F1FF]">{sectionTitle}</h2>
              <p className="mt-1 text-sm text-[#D8D3E8]">Coming next. We will implement this module after Homepage.</p>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default AdminDashboard
