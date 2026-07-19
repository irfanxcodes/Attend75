import { useEffect, useState } from 'react'
import { parseAdminSession } from '../../services/adminApi'

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  if (configuredApiBaseUrl) return configuredApiBaseUrl
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return '/api'
  return 'http://127.0.0.1:8000'
}
const API_BASE = resolveApiBaseUrl()

async function fetchPremiumAnalytics(token) {
  const res = await fetch(`${API_BASE}/admin/premium/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.detail || `HTTP ${res.status}`)
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

async function togglePremium(token, rollNumber, action) {
  const res = await fetch(`${API_BASE}/admin/premium/${rollNumber}/toggle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed')
  return data.data
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

const avatarColors = ['#FF916C', '#6CB4FF', '#4EF0A0', '#A78BFA', '#FFB23E', '#F472B6', '#34D399', '#FF5B5B']

// ─── Shared Components ───────────────────────────────────────────────────────

function StatCard({ label, value, icon, color = '#FF916C', subtitle }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5 transition hover:border-white/[0.1]">
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-[0.07]" style={{ background: color }} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
          <p className="mt-2 text-[28px] font-bold leading-none text-[#f0ece4]">{value}</p>
          {subtitle && <p className="mt-1.5 text-[10px] text-[#9F9AB5]">{subtitle}</p>}
        </div>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}15` }}>
            <span className="text-base">{icon}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h2 className="text-sm font-bold text-[#f0ece4]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[10px] text-[#7a6f94]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function Badge({ children, variant = 'default' }) {
  const styles = {
    active: 'bg-[#4EF0A0]/10 text-[#4EF0A0] border-[#4EF0A0]/20',
    grace: 'bg-[#FFB23E]/10 text-[#FFB23E] border-[#FFB23E]/20',
    expired: 'bg-[#FF5B5B]/10 text-[#FF5B5B] border-[#FF5B5B]/20',
    cancelled: 'bg-white/5 text-[#7a6f94] border-white/10',
    default: 'bg-white/5 text-[#9F9AB5] border-white/10',
    google: 'bg-[#6CB4FF]/10 text-[#6CB4FF] border-[#6CB4FF]/20',
    push: 'bg-[#4EF0A0]/10 text-[#4EF0A0] border-[#4EF0A0]/20',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-semibold ${styles[variant] || styles.default}`}>
      {children}
    </span>
  )
}

function ProgressBar({ value, max, color = '#FF916C', label }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-3">
      {label && <span className="w-20 text-[10px] text-[#9F9AB5] capitalize truncate">{label}</span>}
      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: color }} />
      </div>
      <span className="text-[10px] font-semibold text-[#d8d4e7] w-8 text-right">{value}</span>
    </div>
  )
}

// ─── Student Table Row ───────────────────────────────────────────────────────

function StudentRow({ student: s, token, onStatusChange }) {
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState('')
  const isActive = s.status === 'active' || s.status === 'grace'
  const colorIdx = (s.rollNumber || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length

  const handleToggle = async () => {
    setToggling(true)
    setToggleError('')
    try {
      const result = await togglePremium(token, s.rollNumber, isActive ? 'expire' : 'activate')
      onStatusChange(result.status || (isActive ? 'expired' : 'active'))
    } catch (err) {
      setToggleError(err?.message || 'Failed')
      // If activate failed, still try to update UI with latest known state
    }
    finally { setToggling(false) }
  }

  return (
    <tr className="border-b border-white/[0.03] last:border-0 transition hover:bg-white/[0.02]">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-[#1e1932]"
            style={{ backgroundColor: avatarColors[colorIdx] }}
          >
            {getInitials(s.name)}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#d8d4e7] truncate">{s.name || '—'}</p>
            <p className="text-[9px] text-[#7a6f94] font-mono mt-0.5">{s.rollNumber}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className="text-[10px] text-[#9F9AB5]">{s.program || '—'}</span>
      </td>
      <td className="px-4 py-3.5">
        <Badge variant={s.hasGoogle ? 'google' : 'default'}>{s.hasGoogle ? '● Google' : '○ Guest'}</Badge>
      </td>
      <td className="px-4 py-3.5">
        {s.pushDevices > 0 ? (
          <Badge variant="push">📱 {s.pushDevices}</Badge>
        ) : (
          <span className="text-[10px] text-[#5a5570]">—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <span className="text-[10px] text-[#d8d4e7] font-medium capitalize">{s.plan}</span>
      </td>
      <td className="px-4 py-3.5">
        <Badge variant={s.status}>{s.status}</Badge>
      </td>
      <td className="px-4 py-3.5 text-[10px] text-[#9F9AB5]">
        {s.expiryDate ? new Date(s.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className={`relative h-[22px] w-10 rounded-full transition-colors duration-200 disabled:opacity-40 ${isActive ? 'bg-[#4EF0A0]/80' : 'bg-white/10 hover:bg-white/20'}`}
            title={isActive ? 'Expire subscription' : 'Activate subscription'}
          >
            <div className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200 ${isActive ? 'left-[21px]' : 'left-[3px]'}`} />
          </button>
          {toggleError && <span className="text-[9px] text-[#FF5B5B]" title={toggleError}>✗</span>}
        </div>
      </td>
    </tr>
  )
}

// ─── Broadcast Form ──────────────────────────────────────────────────────────

function BroadcastForm({ token }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [program, setProgram] = useState('')
  const [priority, setPriority] = useState('standard')
  const [deepLink, setDeepLink] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSending(true)
    setResult(null)
    try {
      const res = await sendBroadcast(token, {
        title: title.trim(),
        body: body.trim(),
        audience,
        program: program || undefined,
        priority,
        deep_link: deepLink || undefined,
      })
      setResult({ success: true, count: res.queued_count })
      setTitle('')
      setBody('')
      setDeepLink('')
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
      {/* Form Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.04] px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF916C]/10">
          <span className="text-base">📣</span>
        </div>
        <div>
          <p className="text-sm font-bold text-[#f0ece4]">Send Broadcast</p>
          <p className="text-[10px] text-[#7a6f94]">Push to all subscribed premium students</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Title + Priority row */}
        <div className="flex gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
            className="flex-1 rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[12px] text-[#f0ece4] placeholder:text-[#5a5570] outline-none transition focus:border-[#FF916C]/30 focus:ring-1 focus:ring-[#FF916C]/10"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] outline-none w-36"
          >
            <option value="standard">⚡ Standard</option>
            <option value="high">🔴 High Priority</option>
          </select>
        </div>

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Notification body — what should students see?"
          rows={3}
          className="w-full rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[12px] text-[#f0ece4] placeholder:text-[#5a5570] outline-none transition focus:border-[#FF916C]/30 focus:ring-1 focus:ring-[#FF916C]/10 resize-none"
        />

        {/* Audience + Deep Link */}
        <div className="flex gap-3">
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] outline-none w-40"
          >
            <option value="all">👥 All Premium</option>
            <option value="program">🎓 By Program</option>
          </select>
          {audience === 'program' && (
            <input
              type="text"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              placeholder="Program name (e.g. BCA)"
              className="flex-1 rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] placeholder:text-[#5a5570] outline-none"
            />
          )}
          <input
            type="text"
            value={deepLink}
            onChange={(e) => setDeepLink(e.target.value)}
            placeholder="Deep link (e.g. /app/notices)"
            className="flex-1 rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] placeholder:text-[#5a5570] outline-none"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {result && (
              <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
                result.success ? 'bg-[#4EF0A0]/10 text-[#4EF0A0]' : 'bg-[#FF5B5B]/10 text-[#FF5B5B]'
              }`}>
                {result.success ? `✓ Queued for ${result.count} student${result.count !== 1 ? 's' : ''}` : `✗ ${result.message}`}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={sending || !title.trim() || !body.trim()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF916C] to-[#FF6B3D] px-6 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-[#FF916C]/20 transition active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
          >
            {sending ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
            {sending ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function PremiumAnalyticsPage() {
  const session = parseAdminSession()
  const token = session?.sessionToken
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    fetchPremiumAnalytics(token)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false))
  }, [token])

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#FF916C]/30 border-t-[#FF916C]" />
          <p className="text-[11px] text-[#7a6f94]">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="rounded-xl border border-[#FF5B5B]/20 bg-[#FF5B5B]/5 px-6 py-4 text-center">
          <p className="text-xs text-[#FF5B5B]">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-2 text-[10px] text-[#FF916C] underline">Retry</button>
        </div>
      </div>
    )
  }

  const { subscriptions, pushSubscriptions, queue, history, preferences, recentBroadcasts, students } = data || {}

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'students', label: `Students (${students?.length || 0})` },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#f0ece4]">Premium & Notifications</h1>
          <p className="mt-1 text-[11px] text-[#7a6f94]">Subscription metrics, push delivery health, and broadcast management</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#2a2440] px-1 py-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-1.5 text-[11px] font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-[#FF916C]/15 text-[#FF916C]'
                  : 'text-[#7a6f94] hover:text-[#d8d4e7]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab subscriptions={subscriptions} pushSubscriptions={pushSubscriptions} data={data} />
      )}
      {activeTab === 'notifications' && (
        <NotificationsTab queue={queue} history={history} preferences={preferences} />
      )}
      {activeTab === 'broadcast' && (
        <BroadcastTab token={token} recentBroadcasts={recentBroadcasts} />
      )}
      {activeTab === 'students' && (
        <StudentsTab students={students} token={token} setData={setData} />
      )}
    </div>
  )
}

// ─── Tab: Overview ───────────────────────────────────────────────────────────

function OverviewTab({ subscriptions, pushSubscriptions, data }) {
  const convRate = subscriptions?.conversionRate || 0
  return (
    <div className="space-y-6">
      {/* Subscription Stats */}
      <div>
        <SectionHeader title="Subscription Metrics" subtitle="Premium subscription breakdown" />
        <div className="mt-4 grid grid-cols-5 gap-3">
          <StatCard label="Active" value={subscriptions?.active || 0} icon="✦" color="#4EF0A0" subtitle={`${convRate}% conversion`} />
          <StatCard label="Grace Period" value={subscriptions?.grace || 0} icon="⏳" color="#FFB23E" subtitle="3-day window" />
          <StatCard label="Expired" value={subscriptions?.expired || 0} icon="✗" color="#FF5B5B" />
          <StatCard label="Cancelled" value={subscriptions?.cancelled || 0} icon="↩" color="#9F9AB5" />
          <StatCard label="Total Students" value={data?.totalStudents || 0} icon="👥" color="#6CB4FF" subtitle={`${subscriptions?.total || 0} ever subscribed`} />
        </div>
      </div>

      {/* Push Devices */}
      <div>
        <SectionHeader title="Push Subscriptions" subtitle="Devices registered for notifications" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatCard label="Total Devices" value={pushSubscriptions?.totalDevices || 0} icon="📱" color="#6CB4FF" />
          <StatCard label="Unique Students" value={pushSubscriptions?.uniqueStudents || 0} icon="👤" color="#A78BFA" />
          <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Device Breakdown</p>
            <div className="mt-3 space-y-2">
              {pushSubscriptions?.devices && Object.keys(pushSubscriptions.devices).length > 0 ? (
                Object.entries(pushSubscriptions.devices).map(([device, count]) => (
                  <ProgressBar key={device} label={device} value={count} max={pushSubscriptions.totalDevices || 1} color="#6CB4FF" />
                ))
              ) : (
                <p className="text-[10px] text-[#5a5570]">No devices registered yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Notifications ──────────────────────────────────────────────────────

function NotificationsTab({ queue, history, preferences }) {
  return (
    <div className="space-y-6">
      {/* Queue Health */}
      <div>
        <SectionHeader title="Queue Health" subtitle="Notification delivery pipeline" />
        <div className="mt-4 grid grid-cols-4 gap-3">
          <StatCard label="Pending" value={queue?.pending || 0} icon="🔄" color="#FFB23E" />
          <StatCard label="Processing" value={queue?.processing || 0} icon="⚙️" color="#6CB4FF" />
          <StatCard label="Failed (24h)" value={queue?.failedLast24h || 0} icon="⚠️" color="#FF5B5B" subtitle={`${queue?.failed || 0} total failed`} />
          <StatCard label="Completed" value={queue?.done || 0} icon="✓" color="#4EF0A0" />
        </div>
      </div>

      {/* Delivery History */}
      <div>
        <SectionHeader title="Delivery History" subtitle="Notification send and open metrics" />
        <div className="mt-4 grid grid-cols-4 gap-3">
          <StatCard label="Total Sent" value={history?.totalSent || 0} icon="📤" color="#6CB4FF" />
          <StatCard label="Opened" value={history?.totalRead || 0} icon="👁" color="#4EF0A0" subtitle={`${history?.openRate || 0}% open rate`} />
          <StatCard label="Sent (24h)" value={history?.sentLast24h || 0} icon="📊" color="#FF916C" />
          <StatCard label="Prefs Configured" value={preferences?.totalConfigured || 0} icon="⚙️" color="#A78BFA" subtitle={`${preferences?.noticesDisabled || 0} notices off`} />
        </div>
      </div>

      {/* Category Breakdown */}
      {history?.byCategory?.length > 0 && (
        <div>
          <SectionHeader title="By Category" subtitle="Notification volume per type" />
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
            <div className="space-y-3">
              {history.byCategory.map((cat) => (
                <div key={cat.category} className="flex items-center gap-4">
                  <span className="w-24 text-[11px] font-medium text-[#d8d4e7] capitalize">{cat.category}</span>
                  <div className="flex-1">
                    <ProgressBar value={cat.sent} max={history.totalSent || 1} color="#FF916C" />
                  </div>
                  <span className="text-[10px] text-[#4EF0A0] w-16 text-right">{cat.openRate}% open</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Broadcast ──────────────────────────────────────────────────────────

function BroadcastTab({ token, recentBroadcasts }) {
  return (
    <div className="space-y-6">
      <BroadcastForm token={token} />

      {/* Recent Broadcasts */}
      {recentBroadcasts?.length > 0 && (
        <div>
          <SectionHeader title="Recent Broadcasts" subtitle="Last sent push notifications" />
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Title</th>
                  <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Sent</th>
                  <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Opened</th>
                  <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Open Rate</th>
                  <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentBroadcasts.map((bc, i) => (
                  <tr key={i} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3.5">
                      <p className="text-[11px] font-semibold text-[#d8d4e7] max-w-[200px] truncate">{bc.title}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] font-medium text-[#f0ece4]">{bc.sentCount}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] text-[#9F9AB5]">{bc.openedCount || 0}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold ${(bc.openRate || 0) > 50 ? 'text-[#4EF0A0]' : 'text-[#FFB23E]'}`}>
                        {bc.openRate || 0}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[10px] text-[#7a6f94]">
                      {bc.sentAt ? new Date(bc.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!recentBroadcasts || recentBroadcasts.length === 0) && (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#2a2440]">
          <div className="text-center">
            <p className="text-2xl">📭</p>
            <p className="mt-2 text-[11px] text-[#7a6f94]">No broadcasts sent yet</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Students ───────────────────────────────────────────────────────────

function StudentsTab({ students, token, setData }) {
  const [search, setSearch] = useState('')

  const filtered = (students || []).filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.rollNumber || '').toLowerCase().includes(q) ||
      (s.program || '').toLowerCase().includes(q)
    )
  })

  const activeCount = (students || []).filter((s) => s.status === 'active').length
  const graceCount = (students || []).filter((s) => s.status === 'grace').length
  const withPush = (students || []).filter((s) => s.pushDevices > 0).length

  return (
    <div className="space-y-5">
      {/* Quick stats bar */}
      <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-[#2a2440] px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
          <span className="text-[10px] text-[#9F9AB5]">{activeCount} active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#FFB23E]" />
          <span className="text-[10px] text-[#9F9AB5]">{graceCount} grace</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#6CB4FF]" />
          <span className="text-[10px] text-[#9F9AB5]">{withPush} with push</span>
        </div>
        <div className="ml-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students..."
            className="w-56 rounded-lg border border-white/[0.08] bg-[#1e1932] px-3 py-1.5 text-[11px] text-[#d8d4e7] placeholder:text-[#5a5570] outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Student</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Program</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Auth</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Push</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Plan</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Status</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Expires</th>
              <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((s) => (
                <StudentRow
                  key={s.rollNumber}
                  student={s}
                  token={token}
                  onStatusChange={(newStatus) => {
                    setData((prev) => ({
                      ...prev,
                      students: prev.students.map((st) =>
                        st.rollNumber === s.rollNumber ? { ...st, status: newStatus } : st
                      ),
                    }))
                  }}
                />
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-[11px] text-[#7a6f94]">
                    {search ? 'No students match your search' : 'No premium students yet'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PremiumAnalyticsPage
