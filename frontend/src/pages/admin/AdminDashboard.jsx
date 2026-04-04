import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAdminSession, fetchAdminFeedbackLog, fetchAdminOverview, logoutAdminSession, parseAdminSession } from '../../services/adminApi'

function StatCard({ label, value, subtitle }) {
  return (
    <article className="rounded-xl border border-white/15 bg-[#3A315D] p-4">
      <p className="text-xs uppercase tracking-wide text-[#D8D3E8]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#F4F1FF]">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-[#CFC5E8]">{subtitle}</p> : null}
    </article>
  )
}

function AdminDashboard() {
  const navigate = useNavigate()
  const [adminSession, setAdminSession] = useState(null)
  const [overview, setOverview] = useState(null)
  const [feedbackItems, setFeedbackItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
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
          fetchAdminFeedbackLog(adminSession.sessionToken, 50),
        ])

        if (!isActive) return

        setOverview(overviewData)
        setFeedbackItems(feedbackLog)
      } catch (requestError) {
        if (!isActive) return
        if (requestError?.status === 401) {
          clearAdminSession()
          navigate('/admin/login', { replace: true })
          return
        }
        setError(requestError.message || 'Unable to load admin dashboard data.')
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [adminSession, navigate])

  const cards = useMemo(() => {
    if (!overview) return []

    return [
      {
        label: 'Total Users',
        value: overview.users?.total ?? 0,
        subtitle: `${overview.users?.linkedCredentials ?? 0} linked credentials`,
      },
      {
        label: 'Active Sessions',
        value: overview.sessions?.active_sessions ?? 0,
        subtitle: `TTL ${overview.sessions?.session_ttl_seconds ?? 0}s`,
      },
      {
        label: 'Recent Feedback',
        value: overview.feedback?.totalRecent ?? 0,
        subtitle: overview.feedback?.latest?.timestamp ? `Latest ${new Date(overview.feedback.latest.timestamp).toLocaleString()}` : 'No entries yet',
      },
      {
        label: 'API Health',
        value: overview.health?.api || 'unknown',
        subtitle: 'Live backend status snapshot',
      },
    ]
  }, [overview])

  async function handleLogout() {
    await logoutAdminSession(adminSession?.sessionToken)
    clearAdminSession()
    navigate('/admin/login', { replace: true })
  }

  return (
    <section className="min-h-dvh bg-[#48426D] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-white/20 bg-[#5B5485] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#F4F1FF]">Admin Dashboard</h1>
            <p className="mt-1 truncate text-sm text-[#D8D3E8]">Signed in as {adminSession?.username || 'admin'}</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#E2BC8B] px-4 text-sm font-semibold text-[#1D183E] transition hover:bg-[#D9AA6F]"
          >
            Sign out
          </button>
        </header>

        {isLoading ? (
          <div className="rounded-xl border border-white/15 bg-[#3A315D] p-4 text-sm text-[#D8D3E8]">Loading admin insights...</div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-300/50 bg-rose-500/15 p-4 text-sm text-rose-100">{error}</div>
        ) : null}

        {!isLoading && !error ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => (
                <StatCard key={card.label} label={card.label} value={card.value} subtitle={card.subtitle} />
              ))}
            </div>

            <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-[#F4F1FF]">Feedback Log</h2>
              <p className="mt-1 text-sm text-[#D8D3E8]">Most recent user feedback submitted through the app.</p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#CFC5E8]">
                      <th className="px-3 py-2">Message</th>
                      <th className="px-3 py-2">Timestamp</th>
                      <th className="px-3 py-2">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackItems.length ? (
                      feedbackItems.map((entry) => (
                        <tr key={entry.id || `${entry.timestamp}-${entry.message}`} className="rounded-lg bg-[#3A315D] text-sm text-[#F4F1FF]">
                          <td className="px-3 py-2 align-top">{entry.message}</td>
                          <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-[#D8D3E8]">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '--'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-[#D8D3E8]">{entry.id || '--'}</td>
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
          </>
        ) : null}
      </div>
    </section>
  )
}

export default AdminDashboard
