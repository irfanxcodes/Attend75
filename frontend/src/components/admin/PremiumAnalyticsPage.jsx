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

async function fetchAnalytics(token) {
  const res = await fetch(`${API_BASE}/admin/premium/analytics`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data.data
}

async function sendBroadcast(token, { title, body, audience, targetRoll, priority, deep_link }) {
  const res = await fetch(`${API_BASE}/admin/broadcast`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, audience, target_roll: targetRoll, priority, deep_link }),
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

function StatCard({ label, value, icon, color = '#FF916C' }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
          <p className="mt-2 text-[28px] font-bold leading-none text-[#f0ece4]">{value}</p>
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

function PremiumAnalyticsPage() {
  const session = parseAdminSession()
  const token = session?.sessionToken
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  // Broadcast form state
  const [bcTitle, setBcTitle] = useState('')
  const [bcBody, setBcBody] = useState('')
  const [bcAudience, setBcAudience] = useState('all')
  const [bcTargetRoll, setBcTargetRoll] = useState('')
  const [bcPriority, setBcPriority] = useState('standard')
  const [bcDeepLink, setBcDeepLink] = useState('')
  const [bcSending, setBcSending] = useState(false)
  const [bcResult, setBcResult] = useState(null)

  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    fetchAnalytics(token).then(setData).catch((e) => setError(e.message)).finally(() => setIsLoading(false))
  }, [token])

  const handleBroadcast = async (e) => {
    e.preventDefault()
    if (!bcTitle.trim() || !bcBody.trim()) return
    setBcSending(true)
    setBcResult(null)
    try {
      const result = await sendBroadcast(token, {
        title: bcTitle.trim(), body: bcBody.trim(), audience: bcAudience,
        targetRoll: bcAudience === 'individual' ? bcTargetRoll.trim() : undefined,
        priority: bcPriority, deep_link: bcDeepLink || undefined,
      })
      setBcResult({ success: true, count: result.queued_count })
      setBcTitle(''); setBcBody('')
    } catch (err) { setBcResult({ success: false, message: err.message }) }
    finally { setBcSending(false) }
  }

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#FF916C]/30 border-t-[#FF916C]" />
    </div>
  )
  if (error) return <div className="rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-xs text-[#FF5B5B]">{error}</div>

  const { pushSubscriptions, queue, history, students } = data || {}
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'subscribers', label: `Subscribers (${pushSubscriptions?.uniqueStudents || 0})` },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#f0ece4]">Notifications</h1>
          <p className="mt-1 text-[11px] text-[#7a6f94]">Push delivery, broadcasts, and subscriber management</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[#2a2440] p-1">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-1.5 text-[11px] font-semibold transition ${activeTab === tab.id ? 'bg-[#FF916C]/15 text-[#FF916C]' : 'text-[#7a6f94] hover:text-[#d8d4e7]'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Subscribers" value={pushSubscriptions?.uniqueStudents || 0} icon="👥" color="#6CB4FF" />
            <StatCard label="Total Devices" value={pushSubscriptions?.totalDevices || 0} icon="📱" color="#4EF0A0" />
            <StatCard label="Sent (24h)" value={history?.sentLast24h || 0} icon="📤" color="#FF916C" />
            <StatCard label="Queue Pending" value={queue?.pending || 0} icon="🔄" color="#FFB23E" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total Sent" value={history?.totalSent || 0} icon="📊" color="#A78BFA" />
            <StatCard label="Opened" value={history?.totalRead || 0} icon="👁" color="#4EF0A0" />
            <StatCard label="Failed" value={queue?.failed || 0} icon="⚠️" color="#FF5B5B" />
          </div>
          {history?.byCategory?.length > 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#7a6f94]">By Category</p>
              <div className="space-y-2">
                {history.byCategory.map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between text-[11px]">
                    <span className="text-[#d8d4e7] capitalize">{cat.category}</span>
                    <span className="text-[#9F9AB5]">{cat.sent} sent · {cat.openRate || 0}% opened</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Broadcast Tab */}
      {activeTab === 'broadcast' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
            <div className="flex items-center gap-3 border-b border-white/[0.04] px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF916C]/10"><span className="text-base">📣</span></div>
              <div>
                <p className="text-sm font-bold text-[#f0ece4]">Send Notification</p>
                <p className="text-[10px] text-[#7a6f94]">Send to all subscribers or a specific student</p>
              </div>
            </div>
            <form onSubmit={handleBroadcast} className="p-6 space-y-4">
              <div className="flex gap-3">
                <input type="text" value={bcTitle} onChange={(e) => setBcTitle(e.target.value)} placeholder="Notification title"
                  className="flex-1 rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[12px] text-[#f0ece4] placeholder:text-[#5a5570] outline-none focus:border-[#FF916C]/30" />
                <select value={bcPriority} onChange={(e) => setBcPriority(e.target.value)}
                  className="rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] outline-none w-36">
                  <option value="standard">⚡ Standard</option>
                  <option value="high">🔴 High Priority</option>
                </select>
              </div>
              <textarea value={bcBody} onChange={(e) => setBcBody(e.target.value)} placeholder="Notification body" rows={3}
                className="w-full rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[12px] text-[#f0ece4] placeholder:text-[#5a5570] outline-none resize-none focus:border-[#FF916C]/30" />
              <div className="flex gap-3">
                <select value={bcAudience} onChange={(e) => setBcAudience(e.target.value)}
                  className="rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] outline-none w-44">
                  <option value="all">👥 All Subscribers</option>
                  <option value="individual">👤 Specific Student</option>
                </select>
                {bcAudience === 'individual' && (
                  <input type="text" value={bcTargetRoll} onChange={(e) => setBcTargetRoll(e.target.value)}
                    placeholder="Roll number (e.g. 24FMUCHH014059)" className="flex-1 rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] placeholder:text-[#5a5570] outline-none" />
                )}
                <input type="text" value={bcDeepLink} onChange={(e) => setBcDeepLink(e.target.value)}
                  placeholder="Deep link (optional)" className="flex-1 rounded-xl border border-white/[0.08] bg-[#1e1932] px-4 py-3 text-[11px] text-[#d8d4e7] placeholder:text-[#5a5570] outline-none" />
              </div>
              <div className="flex items-center justify-between pt-1">
                {bcResult && (
                  <span className={`text-[11px] font-semibold ${bcResult.success ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
                    {bcResult.success ? `✓ Queued for ${bcResult.count} student${bcResult.count !== 1 ? 's' : ''}` : bcResult.message}
                  </span>
                )}
                {!bcResult && <span />}
                <button type="submit" disabled={bcSending || !bcTitle.trim() || !bcBody.trim()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF916C] to-[#FF6B3D] px-6 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-[#FF916C]/20 transition active:scale-[0.97] disabled:opacity-40">
                  {bcSending ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : '📨'}
                  {bcSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscribers Tab */}
      {activeTab === 'subscribers' && (
        <div className="space-y-4">
          {students?.length > 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Student</th>
                    <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Program</th>
                    <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Devices</th>
                    <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Registered</th>
                    <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const colorIdx = (s.rollNumber || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length
                    return (
                      <tr key={s.rollNumber} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-[#1e1932]"
                              style={{ backgroundColor: avatarColors[colorIdx] }}>
                              {getInitials(s.name || s.rollNumber)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-[#d8d4e7] truncate">
                                {s.name || <span className="text-[#7a6f94] italic">No name on record</span>}
                              </p>
                              <p className="text-[9px] text-[#7a6f94] font-mono">{s.rollNumber}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[10px] text-[#9F9AB5] max-w-[140px] truncate">
                          {s.program || <span className="text-[#5a5570]">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[10px] font-semibold text-[#4EF0A0]">{s.pushDevices || 1}</span>
                        </td>
                        <td className="px-5 py-3.5 text-[10px] text-[#9F9AB5]">
                          {s.registeredAt ? new Date(s.registeredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-[10px] text-[#9F9AB5]">
                          {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#2a2440]">
              <div className="text-center">
                <p className="text-2xl">📭</p>
                <p className="mt-2 text-[11px] text-[#7a6f94]">No subscribers yet</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PremiumAnalyticsPage
