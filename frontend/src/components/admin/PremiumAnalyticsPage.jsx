import { useEffect, useState } from 'react'
import { parseAdminSession } from '../../services/adminApi'

const API_BASE = '/api'

async function fetchPremiumAnalytics(token) {
  const res = await fetch(`${API_BASE}/admin/premium/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed')
  return data.data
}

async function sendBroadcast(token, { title, body, audience, program, priority, deep_link }) {
  const res = await fetch(`${API_BASE}/admin/broadcast`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, audience, program, priority, deep_link }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed')
  return data.data
}

function KPI({ label, value, sub, color = '#FF916C' }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
      <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{value}</span>
      {sub && <p className="mt-1 text-[10px]" style={{ color }}>{sub}</p>}
    </div>
  )
}

function PremiumAnalyticsPage() {
  const session = parseAdminSession()
  const token = session?.sessionToken
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Broadcast form
  const [bcTitle, setBcTitle] = useState('')
  const [bcBody, setBcBody] = useState('')
  const [bcAudience, setBcAudience] = useState('all')
  const [bcProgram, setBcProgram] = useState('')
  const [bcPriority, setBcPriority] = useState('standard')
  const [bcDeepLink, setBcDeepLink] = useState('')
  const [bcSending, setBcSending] = useState(false)
  const [bcResult, setBcResult] = useState(null)

  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    fetchPremiumAnalytics(token)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false))
  }, [token])

  const handleBroadcast = async (e) => {
    e.preventDefault()
    if (!bcTitle.trim() || !bcBody.trim()) return
    setBcSending(true)
    setBcResult(null)
    try {
      const result = await sendBroadcast(token, {
        title: bcTitle.trim(),
        body: bcBody.trim(),
        audience: bcAudience,
        program: bcProgram || undefined,
        priority: bcPriority,
        deep_link: bcDeepLink || undefined,
      })
      setBcResult({ success: true, count: result.queued_count })
      setBcTitle('')
      setBcBody('')
    } catch (err) {
      setBcResult({ success: false, message: err.message })
    } finally {
      setBcSending(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return <div className="rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-xs text-[#FF5B5B]">{error}</div>
  }

  const { subscriptions, pushSubscriptions, queue, history, preferences, recentBroadcasts, students } = data || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f0ece4]">Premium & Notifications</h1>
        <p className="mt-1 text-[11px] text-[#7a6f94]">
          Subscription metrics, push delivery health, and broadcast management
        </p>
      </div>

      {/* KPI Row - Subscriptions */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#7a6f94]">Subscriptions</p>
        <div className="grid grid-cols-5 gap-3">
          <KPI label="Active" value={subscriptions?.active || 0} sub={`${subscriptions?.conversionRate || 0}% conversion`} color="#4EF0A0" />
          <KPI label="Grace" value={subscriptions?.grace || 0} sub="3-day window" color="#FFB23E" />
          <KPI label="Expired" value={subscriptions?.expired || 0} color="#FF5B5B" />
          <KPI label="Cancelled" value={subscriptions?.cancelled || 0} color="#9F9AB5" />
          <KPI label="Total Students" value={data?.totalStudents || 0} sub={`${subscriptions?.total || 0} ever subscribed`} color="#6CB4FF" />
        </div>
      </div>

      {/* KPI Row - Push & Queue */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#7a6f94]">Push Devices</p>
          <div className="grid grid-cols-2 gap-3">
            <KPI label="Total Devices" value={pushSubscriptions?.totalDevices || 0} color="#6CB4FF" />
            <KPI label="Unique Students" value={pushSubscriptions?.uniqueStudents || 0} color="#A78BFA" />
          </div>
          {pushSubscriptions?.devices && Object.keys(pushSubscriptions.devices).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(pushSubscriptions.devices).map(([device, count]) => (
                <span key={device} className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-[#9F9AB5]">
                  {device}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#7a6f94]">Notification Queue</p>
          <div className="grid grid-cols-2 gap-3">
            <KPI label="Pending" value={queue?.pending || 0} color="#FFB23E" />
            <KPI label="Failed (24h)" value={queue?.failedLast24h || 0} sub={`${queue?.failed || 0} total`} color="#FF5B5B" />
          </div>
        </div>
      </div>

      {/* Notification History */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#7a6f94]">Delivery History</p>
        <div className="grid grid-cols-4 gap-3">
          <KPI label="Total Sent" value={history?.totalSent || 0} color="#6CB4FF" />
          <KPI label="Opened" value={history?.totalRead || 0} sub={`${history?.openRate || 0}% open rate`} color="#4EF0A0" />
          <KPI label="Sent (24h)" value={history?.sentLast24h || 0} color="#FF916C" />
          <KPI label="Prefs Configured" value={preferences?.totalConfigured || 0} sub={`${preferences?.noticesDisabled || 0} notices off`} color="#A78BFA" />
        </div>
        {history?.byCategory?.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#2a2440] p-4">
            <p className="mb-2 text-[10px] font-semibold text-[#9F9AB5]">By Category</p>
            <div className="space-y-1.5">
              {history.byCategory.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between text-[11px]">
                  <span className="text-[#d8d4e7] capitalize">{cat.category}</span>
                  <span className="text-[#9F9AB5]">{cat.sent} sent · {cat.openRate}% opened</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Broadcast Form */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-bold text-[#f0ece4]">Send Broadcast</p>
        <p className="mt-0.5 text-[10px] text-[#7a6f94]">Push notification to all subscribed premium students</p>
        <form onSubmit={handleBroadcast} className="mt-4 space-y-3">
          <input
            type="text"
            value={bcTitle}
            onChange={(e) => setBcTitle(e.target.value)}
            placeholder="Notification title"
            className="w-full rounded-lg border border-white/10 bg-[#1e1932] px-3 py-2.5 text-sm text-[#f0ece4] placeholder:text-[#6E6A88] outline-none focus:border-[#FF916C]/40"
          />
          <textarea
            value={bcBody}
            onChange={(e) => setBcBody(e.target.value)}
            placeholder="Notification body"
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-[#1e1932] px-3 py-2.5 text-sm text-[#f0ece4] placeholder:text-[#6E6A88] outline-none focus:border-[#FF916C]/40"
          />
          <div className="flex gap-3">
            <select
              value={bcAudience}
              onChange={(e) => setBcAudience(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#1e1932] px-3 py-2 text-[11px] text-[#d8d4e7] outline-none"
            >
              <option value="all">All premium</option>
              <option value="program">By program</option>
            </select>
            {bcAudience === 'program' && (
              <input
                type="text"
                value={bcProgram}
                onChange={(e) => setBcProgram(e.target.value)}
                placeholder="Program name"
                className="flex-1 rounded-lg border border-white/10 bg-[#1e1932] px-3 py-2 text-[11px] text-[#d8d4e7] placeholder:text-[#6E6A88] outline-none"
              />
            )}
            <select
              value={bcPriority}
              onChange={(e) => setBcPriority(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#1e1932] px-3 py-2 text-[11px] text-[#d8d4e7] outline-none"
            >
              <option value="standard">Standard</option>
              <option value="high">High Priority</option>
            </select>
          </div>
          <input
            type="text"
            value={bcDeepLink}
            onChange={(e) => setBcDeepLink(e.target.value)}
            placeholder="Deep link (optional, e.g. /app/notices)"
            className="w-full rounded-lg border border-white/10 bg-[#1e1932] px-3 py-2 text-[11px] text-[#d8d4e7] placeholder:text-[#6E6A88] outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={bcSending || !bcTitle.trim() || !bcBody.trim()}
              className="rounded-lg bg-[#FF916C] px-5 py-2 text-[12px] font-bold text-[#1D183E] transition active:scale-95 disabled:opacity-50"
            >
              {bcSending ? 'Sending...' : 'Send Broadcast'}
            </button>
            {bcResult && (
              <span className={`text-[11px] font-semibold ${bcResult.success ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
                {bcResult.success ? `✓ Queued for ${bcResult.count} student${bcResult.count !== 1 ? 's' : ''}` : bcResult.message}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Recent Broadcasts */}
      {recentBroadcasts?.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#7a6f94]">Recent Broadcasts</p>
          <div className="space-y-2">
            {recentBroadcasts.map((bc, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#2a2440] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[#d8d4e7] truncate">{bc.title}</p>
                  <p className="text-[10px] text-[#7a6f94]">
                    {bc.sentAt ? new Date(bc.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-[#f0ece4]">{bc.sentCount} sent</p>
                  <p className="text-[10px] text-[#4EF0A0]">{bc.openRate}% opened</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Premium Students List */}
      {students?.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#7a6f94]">Premium Students</p>
          <div className="rounded-xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06] text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Expires</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="text-[11px] font-semibold text-[#d8d4e7]">{s.name || s.rollNumber}</p>
                      <p className="text-[9px] text-[#7a6f94]">{s.rollNumber}</p>
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-[#9F9AB5]">{s.plan}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        s.status === 'active' ? 'bg-[#4EF0A0]/15 text-[#4EF0A0]' :
                        s.status === 'grace' ? 'bg-[#FFB23E]/15 text-[#FFB23E]' :
                        'bg-[#FF5B5B]/15 text-[#FF5B5B]'
                      }`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-[#9F9AB5]">
                      {s.expiryDate ? new Date(s.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default PremiumAnalyticsPage
