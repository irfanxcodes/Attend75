import { useMemo, useState } from 'react'
import PhotoLightbox from './PhotoLightbox'

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

function KPICard({ label, value, trend, trendUp, sparkData, sparkColor }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <span className="text-[28px] font-bold leading-none text-[#f0ece4]">{value}</span>
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

function DAUWAUMAUChart({ dauTrend }) {
  const data = dauTrend || []
  if (!data.length) return <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5"><p className="text-[11px] text-[#7a6f94]">No engagement data yet</p></div>

  // Calculate WAU and MAU as rolling windows over the DAU data
  const enriched = data.map((day, idx) => {
    // WAU: sum of unique users in the 7-day window ending at this day
    const wauWindow = data.slice(Math.max(0, idx - 6), idx + 1)
    const wau = wauWindow.reduce((sum, d) => sum + (d.activeUsers || 0), 0)
    // MAU: sum of unique users in the 30-day window ending at this day
    const mauWindow = data.slice(Math.max(0, idx - 29), idx + 1)
    const mau = mauWindow.reduce((sum, d) => sum + (d.activeUsers || 0), 0)
    return { ...day, wau, mau }
  })

  const maxY = Math.max(...enriched.map(d => Math.max(d.activeUsers || 0, d.wau || 0, d.mau || 0)), 1)
  const w = 600
  const h = 220
  const padLeft = 50
  const padBottom = 25
  const chartW = w - padLeft
  const chartH = h - padBottom

  function buildSmoothPath(values) {
    const points = values.map((v, i) => ({
      x: padLeft + (i / Math.max(values.length - 1, 1)) * chartW,
      y: chartH - (v / maxY) * chartH * 0.9 - chartH * 0.05,
    }))
    if (points.length < 2) return ''
    let d = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx1 = prev.x + (curr.x - prev.x) * 0.35
      const cpx2 = curr.x - (curr.x - prev.x) * 0.35
      d += ` C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`
    }
    return d
  }

  const dauPath = buildSmoothPath(enriched.map(d => d.activeUsers || 0))
  const wauPath = buildSmoothPath(enriched.map(d => d.wau || 0))
  const mauPath = buildSmoothPath(enriched.map(d => d.mau || 0))

  // Y-axis labels
  const yLabels = [0, Math.round(maxY * 0.25), Math.round(maxY * 0.5), Math.round(maxY * 0.75), maxY]

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">DAU vs WAU vs MAU · last 60 days</p>
          <p className="text-[9px] text-[#7a6f94]">Distinct users by window</p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FF916C]" />DAU</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6CB4FF]" />WAU</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#A78BFA]" />MAU</span>
        </div>
      </div>

      <div className="mt-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: '220px' }}>
          {/* Grid */}
          {yLabels.map((val) => {
            const y = chartH - (val / maxY) * chartH * 0.9 - chartH * 0.05
            return (
              <g key={val}>
                <line x1={padLeft} y1={y} x2={w} y2={y} stroke="#3d3558" strokeWidth="0.5" />
                <text x={padLeft - 5} y={y + 3} textAnchor="end" fill="#7a6f94" fontSize="8">{formatNumber(val)}</text>
              </g>
            )
          })}

          {/* MAU line (back) */}
          {mauPath ? <path d={mauPath} fill="none" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" /> : null}
          {/* WAU line (middle) */}
          {wauPath ? <path d={wauPath} fill="none" stroke="#6CB4FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" /> : null}
          {/* DAU line (front) */}
          {dauPath ? <path d={dauPath} fill="none" stroke="#FF916C" strokeWidth="2" strokeLinecap="round" /> : null}

          {/* X-axis date labels */}
          {enriched.filter((_, i) => i % 10 === 0 || i === enriched.length - 1).map((d, idx) => {
            const i = enriched.indexOf(d)
            const x = padLeft + (i / Math.max(enriched.length - 1, 1)) * chartW
            return <text key={idx} x={x} y={h - 5} textAnchor="middle" fill="#7a6f94" fontSize="7">{d.date?.slice(5) || ''}</text>
          })}
        </svg>
      </div>
    </div>
  )
}

function UsersTable({ usersTable, sessionToken, onRefresh }) {
  const avatarColors = ['#FF5B5B', '#FF916C', '#6CB4FF', '#4EF0A0', '#A78BFA', '#FFB23E', '#F472B6', '#34D399']
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('recent') // 'recent' | 'az' | 'za'

  function getInitials(name) {
    const parts = (name || 'AN').trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const handleDelete = async (user) => {
    if (!user.id) return
    const confirmed = window.confirm(`Delete user "${user.name || user.emailId}"? This will remove their account and linked credentials.`)
    if (!confirmed) return

    setDeletingId(user.id)
    try {
      const { deleteAdminUser } = await import('../../services/adminApi')
      await deleteAdminUser(sessionToken, user.id)
      if (onRefresh) onRefresh()
    } catch (err) {
      alert(err.message || 'Failed to delete user')
    } finally {
      setDeletingId(null)
    }
  }

  const allUsers = usersTable || []

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = q
      ? allUsers.filter(u =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.rollNumber || '').toLowerCase().includes(q) ||
          (u.emailId || '').toLowerCase().includes(q)
        )
      : [...allUsers]

    if (sortBy === 'az') result.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'za') result.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    // 'recent' keeps original order (already sorted by last_seen desc from backend)

    return result
  }, [allUsers, search, sortBy])

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Registered Users</p>
          <p className="text-[9px] text-[#7a6f94]">One row per unique student (by roll number)</p>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-[#9F9AB5]">
          {filteredUsers.length}{search ? ` of ${allUsers.length}` : ''} users
        </span>
      </div>

      {/* Search + sort controls */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7a6f94]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or roll number…"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 pl-8 pr-4
                       text-[11px] text-[#d8d4e7] placeholder:text-[#7a6f94]
                       focus:border-white/20 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {[
            { key: 'recent', label: 'Recent' },
            { key: 'az', label: 'A→Z' },
            { key: 'za', label: 'Z→A' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                sortBy === opt.key
                  ? 'bg-[#FF916C] text-white'
                  : 'text-[#9F9AB5] hover:text-[#d8d4e7]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
              <th className="pb-3 pr-4">#</th>
              <th className="pb-3 pr-4">Student</th>
              <th className="pb-3 pr-4">Email</th>
              <th className="pb-3 pr-4">Program</th>
              <th className="pb-3 pr-4">Attendance</th>
              <th className="pb-3 pr-4">Device</th>
              <th className="pb-3 pr-4">Method</th>
              <th className="pb-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user, i) => {
              const program = user.program || null
              return (
              <tr key={user.rollNumber || i} className="border-b border-white/[0.04]">
                <td className="py-3 pr-4 text-[#7a6f94]">{user.serialNo || i + 1}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt="" className="h-8 w-8 cursor-pointer rounded-full object-cover ring-1 ring-white/10 transition hover:ring-[#FF916C]/50" onClick={() => setLightboxPhoto({ src: user.photoUrl, name: user.name })} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                    ) : null}
                    <div className={`h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#1e1932] ${user.photoUrl ? 'hidden' : 'flex'}`} style={{ backgroundColor: avatarColors[i % avatarColors.length] }}>
                      {getInitials(user.name)}
                    </div>
                    <div>
                      <p className="font-medium text-[#d8d4e7]">{user.name || 'Unknown'}</p>
                      <p className="text-[9px] text-[#7a6f94]">{user.rollNumber || '-'}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4 text-[#9F9AB5]">{user.emailId || '-'}</td>
                <td className="py-3 pr-4">
                  {program ? (
                    <span className="rounded-full bg-[#6CB4FF]/10 px-2 py-0.5 text-[9px] font-bold text-[#6CB4FF]">{program}</span>
                  ) : <span className="text-[#7a6f94]">-</span>}
                </td>
                <td className="py-3 pr-4">
                  {user.attendancePercent != null ? (
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${user.attendancePercent > 75 ? 'bg-[#4EF0A0]/15 text-[#4EF0A0]' : user.attendancePercent >= 60 ? 'bg-[#FFB23E]/15 text-[#FFB23E]' : 'bg-[#FF5B5B]/15 text-[#FF5B5B]'}`}>
                      {user.attendancePercent.toFixed(1)}%
                    </span>
                  ) : <span className="text-[#7a6f94]">-</span>}
                </td>
                <td className="py-3 pr-4 text-[#9F9AB5]">{user.device || '-'}</td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${user.authMethod === 'google' ? 'bg-[#4EF0A0]/15 text-[#4EF0A0]' : 'bg-[#6CB4FF]/15 text-[#6CB4FF]'}`}>
                    {user.authMethod === 'google' ? 'Google' : 'Guest'}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(user)}
                    disabled={deletingId === user.id}
                    className="rounded-md border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 px-2 py-1 text-[9px] font-semibold text-[#FF5B5B] transition hover:bg-[#FF5B5B]/20 disabled:opacity-40"
                  >
                    {deletingId === user.id ? '...' : 'Delete'}
                  </button>
                </td>
              </tr>
              )
            })}
            {!filteredUsers.length ? (
              <tr><td colSpan={8} className="py-8 text-center text-[#7a6f94]">
                {search ? `No users matching "${search}"` : 'No registered users yet'}
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {lightboxPhoto ? (
        <PhotoLightbox src={lightboxPhoto.src} name={lightboxPhoto.name} onClose={() => setLightboxPhoto(null)} />
      ) : null}
    </div>
  )
}

function ProgramBreakdownCard({ programBreakdown, totalStudents }) {
  const programs = programBreakdown || []
  if (!programs.length) return null

  const PROG_COLORS = ['#FF916C', '#6CB4FF', '#4EF0A0', '#A78BFA', '#FFB23E', '#F472B6', '#34D399', '#FF5B5B']
  const maxCount = Math.max(...programs.map(p => p.count), 1)

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-sm font-semibold text-[#f0ece4]">Users by program</p>
      <p className="mt-0.5 text-[9px] text-[#7a6f94]">Students per academic program (from portal login)</p>

      <div className="mt-4 space-y-3">
        {programs.map((p, i) => {
          const pct = totalStudents > 0 ? ((p.count / totalStudents) * 100).toFixed(1) : 0
          const barPct = (p.count / maxCount) * 100
          const color = PROG_COLORS[i % PROG_COLORS.length]
          // Shorten long program names for display
          const label = p.program.length > 40 ? p.program.slice(0, 38) + '…' : p.program
          return (
            <div key={p.program}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#d8d4e7] truncate max-w-[60%]" title={p.program}>{label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold text-[#f0ece4]">{p.count}</span>
                  <span className="text-[9px] text-[#7a6f94]">{pct}%</span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barPct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Donut summary */}
      <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-3 flex-wrap">
        {programs.slice(0, 5).map((p, i) => (
          <div key={p.program} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PROG_COLORS[i % PROG_COLORS.length] }} />
            <span className="text-[9px] text-[#9F9AB5] truncate max-w-[100px]" title={p.program}>
              {p.program.replace('Bachelor of ', 'B. ').replace('Faculty of ', '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GrowthMetricsPage({ data, analytics, onRefresh, isLoading, sessionToken }) {
  const engagement = analytics?.engagement || {}
  const userAnalytics = data?.userAnalytics || {}
  const studentMetrics = analytics?.studentMetrics || {}
  const usersTable = userAnalytics?.usersTable || []
  const programBreakdown = studentMetrics?.programBreakdown || []
  const totalStudents = studentMetrics?.totalStudents || usersTable.length

  const dauTrend = useMemo(() => {
    return engagement?.dauTrend || []
  }, [engagement])

  const dauSparkData = useMemo(() => dauTrend.slice(-7).map(d => d.activeUsers || 0), [dauTrend])
  const wauSparkData = useMemo(() => {
    return dauTrend.slice(-7).map((_, idx) => {
      const endIdx = dauTrend.length - 7 + idx + 1
      const window = dauTrend.slice(Math.max(0, endIdx - 7), endIdx)
      return window.reduce((s, d) => s + (d.activeUsers || 0), 0)
    })
  }, [dauTrend])
  const mauSparkData = useMemo(() => {
    return dauTrend.slice(-7).map((_, idx) => {
      const endIdx = dauTrend.length - 7 + idx + 1
      const window = dauTrend.slice(Math.max(0, endIdx - 30), endIdx)
      return window.reduce((s, d) => s + (d.activeUsers || 0), 0)
    })
  }, [dauTrend])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Growth Metrics</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : '12s ago'}
            </span>
            <span>Distinct user identifiers per day across event tables</span>
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

      {/* KPI Row - 3 cards */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="DAU · Daily Active" value={formatNumber(engagement?.dau || 0)} trend={`${engagement?.dauPercent || 0}%`} trendUp={(engagement?.dau || 0) > 0} sparkData={dauSparkData} sparkColor="#FF916C" />
        <KPICard label="WAU · Weekly Active" value={formatNumber(engagement?.wau || 0)} trend={`${engagement?.wauPercent || 0}%`} trendUp={(engagement?.wau || 0) > 0} sparkData={wauSparkData} sparkColor="#6CB4FF" />
        <KPICard label="MAU · Monthly Active" value={formatNumber(engagement?.mau || 0)} trend={`${engagement?.mauPercent || 0}%`} trendUp={(engagement?.mau || 0) > 0} sparkData={mauSparkData} sparkColor="#A78BFA" />
      </div>

      {/* DAU vs WAU vs MAU Chart */}
      <DAUWAUMAUChart dauTrend={dauTrend} />

      {/* Program breakdown + Users Table side-by-side when breakdown has data */}
      {programBreakdown.length > 0 ? (
        <div className="grid grid-cols-[1fr_2fr] gap-4 items-start">
          <ProgramBreakdownCard programBreakdown={programBreakdown} totalStudents={totalStudents} />
          <UsersTable usersTable={usersTable} sessionToken={sessionToken} onRefresh={onRefresh} />
        </div>
      ) : (
        <UsersTable usersTable={usersTable} sessionToken={sessionToken} onRefresh={onRefresh} />
      )}
    </div>
  )
}

export default GrowthMetricsPage
