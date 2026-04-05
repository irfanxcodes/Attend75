import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearAdminSession,
  fetchAdminFeedbackLog,
  fetchAdminOverview,
  logoutAdminSession,
  parseAdminSession,
  updateAdminFeedbackStatus,
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
    definition: 'Computed as failedRequests / totalRequests × 100 over the current process lifetime.',
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
    definition: 'Semester with the highest total interactions across sync and history usage in the current process lifetime.',
  },
]

const NO_ACTIVITY_MESSAGE = 'No activity recorded yet. Metrics will appear once users interact with the app.'
const FEEDBACK_STATUS_OPTIONS = ['new', 'reviewed', 'resolved']

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
  const [isUpdatingFeedbackId, setIsUpdatingFeedbackId] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const [feedbackFilters, setFeedbackFilters] = useState({
    query: '',
    startDate: '',
    endDate: '',
    status: '',
    sort: 'latest',
  })
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
            query: feedbackFilters.query || undefined,
            startDate: feedbackFilters.startDate || undefined,
            endDate: feedbackFilters.endDate || undefined,
            status: feedbackFilters.status || undefined,
            sort: feedbackFilters.sort || 'latest',
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
  }, [adminSession, navigate, feedbackFilters])

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
        subtitle: 'Derived from live request outcomes',
        tone: Number(healthStatus.errorRatePercent) > 0 ? 'danger' : 'success',
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
        label: 'Most Viewed Semester',
        value: normalizedMostViewedSemester,
        subtitle: `${formatMetricNumber(metrics.mostViewedSemesterCount)} interactions`,
        tone: Number(metrics.mostViewedSemesterCount) > 0 ? 'warning' : 'default',
      },
    ]
  }, [overview])

  async function handleFeedbackStatusChange(feedbackId, status) {
    if (!adminSession?.sessionToken || !feedbackId) return

    try {
      setFeedbackError('')
      setIsUpdatingFeedbackId(feedbackId)
      const updatedItem = await updateAdminFeedbackStatus(adminSession.sessionToken, feedbackId, status)
      if (!updatedItem) return

      setFeedbackItems((current) => current.map((entry) => (entry.id === feedbackId ? updatedItem : entry)))
    } catch (statusError) {
      setFeedbackError(statusError.message || 'Unable to update feedback status.')
    } finally {
      setIsUpdatingFeedbackId('')
    }
  }

  function handleFeedbackFilterChange(field, value) {
    setFeedbackFilters((current) => ({ ...current, [field]: value }))
  }

  function normalizeFeedbackStatus(status) {
    const normalized = String(status || 'new').toLowerCase()
    return FEEDBACK_STATUS_OPTIONS.includes(normalized) ? normalized : 'new'
  }

  function feedbackStatusClasses(status) {
    if (status === 'resolved') return 'bg-emerald-400/20 text-emerald-100'
    if (status === 'reviewed') return 'bg-amber-300/20 text-amber-100'
    return 'bg-sky-300/20 text-sky-100'
  }

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
                  {!isActive && item.id !== 'homepage' && item.id !== 'scraper-performance' && item.id !== 'feature-usage' && item.id !== 'feedback-management' ? <span className="text-[10px] uppercase tracking-wide opacity-70">Soon</span> : null}
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
                          ? 'Manage feedback lifecycle with status updates, search, date filters, and latest-first sorting.'
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
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Recent Feedback Preview</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Quick snapshot from feedback management queue.</p>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[#CFC5E8]">
                        <th className="px-3 py-2">Message</th>
                        <th className="px-3 py-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedbackItems.length ? (
                        feedbackItems.slice(0, 5).map((entry) => (
                          <tr key={entry.id || `${entry.timestamp}-${entry.message}`} className="rounded-lg bg-[#3A315D] text-sm text-[#F4F1FF]">
                            <td className="px-3 py-2 align-top">{entry.message}</td>
                            <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-[#D8D3E8]">
                              {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '--'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="rounded-lg bg-[#3A315D] px-3 py-4 text-sm text-[#D8D3E8]">
                            No feedback entries available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {!isLoading && !error && isHealthStatus ? (
            <section className="space-y-3">
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
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Metric Definitions</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Measurement logic used in this panel.</p>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {HEALTH_METRIC_DEFINITIONS.map((item) => (
                    <article key={item.name} className="rounded-xl border border-white/10 bg-[#3A315D] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.name}</h3>
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
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Scraper Metric Definitions</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Measurement logic used in this panel.</p>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {SCRAPER_METRIC_DEFINITIONS.map((item) => (
                    <article key={item.name} className="rounded-xl border border-white/10 bg-[#3A315D] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.name}</h3>
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
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Feature Usage Metric Definitions</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Measurement logic used in this panel.</p>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {FEATURE_USAGE_DEFINITIONS.map((item) => (
                    <article key={item.name} className="rounded-xl border border-white/10 bg-[#3A315D] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.name}</h3>
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
              </section>
            </section>
          ) : null}

          {!isLoading && !error && isFeedbackManagement ? (
            <section className="space-y-3">
              <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-[#F4F1FF]">Feedback Management</h2>
                <p className="mt-1 text-sm text-[#D8D3E8]">Track and triage feedback by status, date range, and search query.</p>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[#CFC5E8]">Search Feedback</span>
                    <input
                      type="text"
                      value={feedbackFilters.query}
                      onChange={(event) => handleFeedbackFilterChange('query', event.target.value)}
                      placeholder="Message, user, status"
                      className="w-full rounded-lg border border-white/20 bg-[#3A315D] px-3 py-2 text-sm text-[#F4F1FF] placeholder:text-[#BEB5DA] focus:border-[#E2BC8B] focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[#CFC5E8]">Start Date</span>
                    <input
                      type="date"
                      value={feedbackFilters.startDate}
                      onChange={(event) => handleFeedbackFilterChange('startDate', event.target.value)}
                      className="w-full rounded-lg border border-white/20 bg-[#3A315D] px-3 py-2 text-sm text-[#F4F1FF] focus:border-[#E2BC8B] focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[#CFC5E8]">End Date</span>
                    <input
                      type="date"
                      value={feedbackFilters.endDate}
                      onChange={(event) => handleFeedbackFilterChange('endDate', event.target.value)}
                      className="w-full rounded-lg border border-white/20 bg-[#3A315D] px-3 py-2 text-sm text-[#F4F1FF] focus:border-[#E2BC8B] focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[#CFC5E8]">Status</span>
                    <select
                      value={feedbackFilters.status}
                      onChange={(event) => handleFeedbackFilterChange('status', event.target.value)}
                      className="w-full rounded-lg border border-white/20 bg-[#3A315D] px-3 py-2 text-sm text-[#F4F1FF] focus:border-[#E2BC8B] focus:outline-none"
                    >
                      <option value="">All</option>
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[#CFC5E8]">Sort</span>
                    <select
                      value={feedbackFilters.sort}
                      onChange={(event) => handleFeedbackFilterChange('sort', event.target.value)}
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
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Mark As</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isFeedbackLoading ? (
                        <tr>
                          <td colSpan={5} className="rounded-lg bg-[#3A315D] px-3 py-4 text-sm text-[#D8D3E8]">
                            Loading feedback...
                          </td>
                        </tr>
                      ) : feedbackItems.length ? (
                        feedbackItems.map((entry) => {
                          const status = normalizeFeedbackStatus(entry.status)

                          return (
                            <tr key={entry.id || `${entry.timestamp}-${entry.message}`} className="rounded-lg bg-[#3A315D] text-sm text-[#F4F1FF]">
                              <td className="whitespace-nowrap px-3 py-2 align-top">{entry.user_name || 'Anonymous'}</td>
                              <td className="px-3 py-2 align-top">{entry.message}</td>
                              <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-[#D8D3E8]">
                                {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '--'}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${feedbackStatusClasses(status)}`}>
                                  {status}
                                </span>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="flex flex-wrap gap-2">
                                  {FEEDBACK_STATUS_OPTIONS.map((option) => (
                                    <button
                                      key={`${entry.id}-${option}`}
                                      type="button"
                                      onClick={() => handleFeedbackStatusChange(entry.id, option)}
                                      disabled={!entry.id || isUpdatingFeedbackId === entry.id || status === option}
                                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                        status === option
                                          ? 'bg-[#E2BC8B] text-[#1D183E]'
                                          : 'bg-white/10 text-[#F4F1FF] hover:bg-white/20'
                                      } disabled:cursor-not-allowed disabled:opacity-70`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="rounded-lg bg-[#3A315D] px-3 py-4 text-sm text-[#D8D3E8]">
                            No feedback entries match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
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
