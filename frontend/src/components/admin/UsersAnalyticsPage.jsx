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

function KPICard({ label, value, suffix, trend, trendUp, sparkData, sparkColor }) {
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
              <span>{trendUp ? '▲' : '▼'}</span><span>{trend}</span>
            </div>
          ) : null}
        </div>
        {sparkData?.length ? <div className="w-16"><MiniSparkline data={sparkData} color={sparkColor || '#FF916C'} /></div> : null}
      </div>
    </div>
  )
}

function NewUsersChart({ growthSeries }) {
  const values = growthSeries.map(d => d.newUsers || 0)
  const maxY = Math.max(...values, 1)
  const w = 500
  const h = 180
  const padLeft = 35
  const padBottom = 20
  const chartW = w - padLeft
  const chartH = h - padBottom

  const points = values.map((v, i) => ({
    x: padLeft + (i / Math.max(values.length - 1, 1)) * chartW,
    y: chartH - (v / maxY) * chartH * 0.9 - chartH * 0.05,
  }))

  let pathD = ''
  if (points.length > 1) {
    pathD = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx1 = prev.x + (curr.x - prev.x) * 0.35
      const cpx2 = curr.x - (curr.x - prev.x) * 0.35
      pathD += ` C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`
    }
  }

  const areaPath = pathD ? `${pathD} L ${points[points.length - 1].x},${chartH} L ${points[0].x},${chartH} Z` : ''

  // Calculate streak (consecutive days with signups)
  let streak = 0
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] > 0) streak++
    else break
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">New users · 60-day trend</p>
          <p className="text-[9px] text-[#7a6f94]">Daily signups</p>
        </div>
        {streak > 0 ? (
          <span className="rounded-full bg-[#4EF0A0]/15 px-2.5 py-1 text-[9px] font-bold text-[#4EF0A0]">
            ✓ {streak} day streak
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: '180px' }}>
          {/* Grid */}
          {[0, Math.round(maxY * 0.5), maxY].map((val) => {
            const y = chartH - (val / maxY) * chartH * 0.9 - chartH * 0.05
            return (
              <g key={val}>
                <line x1={padLeft} y1={y} x2={w} y2={y} stroke="#3d3558" strokeWidth="0.5" />
                <text x={padLeft - 4} y={y + 3} textAnchor="end" fill="#7a6f94" fontSize="7">{val}</text>
              </g>
            )
          })}
          {/* Area fill */}
          {areaPath ? <path d={areaPath} fill="#FF916C" opacity="0.12" /> : null}
          {/* Line */}
          {pathD ? <path d={pathD} fill="none" stroke="#FF916C" strokeWidth="1.8" strokeLinecap="round" /> : null}
          {/* X labels */}
          {growthSeries.filter((_, i) => i % 14 === 0 || i === growthSeries.length - 1).map((d, idx) => {
            const i = growthSeries.indexOf(d)
            const x = padLeft + (i / Math.max(growthSeries.length - 1, 1)) * chartW
            return <text key={idx} x={x} y={h - 4} textAnchor="middle" fill="#7a6f94" fontSize="7">{d.date?.slice(5) || ''}</text>
          })}
        </svg>
      </div>
    </div>
  )
}

function AuthBreakdownCard({ authBreakdown }) {
  const total = authBreakdown?.totalRegisteredUsers || 0
  const firebase = authBreakdown?.firebaseLinkedUsers || 0
  const guest = authBreakdown?.unlinkedUsers || 0
  const firebasePercent = total > 0 ? ((firebase / total) * 100).toFixed(1) : 0
  const guestPercent = total > 0 ? ((guest / total) * 100).toFixed(1) : 0
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const firebaseArc = (firebase / (total || 1)) * circumference
  const guestArc = (guest / (total || 1)) * circumference

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-sm font-semibold text-[#f0ece4]">Auth provider breakdown</p>
      <p className="text-[9px] text-[#7a6f94]">Firebase vs Guest split</p>
      <div className="mt-6 flex items-center justify-center gap-8">
        <div className="relative h-[150px] w-[150px] shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={radius} stroke="#3d3558" strokeWidth="12" fill="none" />
            <circle cx="50" cy="50" r={radius} stroke="#FF916C" strokeWidth="12" fill="none" strokeDasharray={`${firebaseArc} ${circumference}`} strokeLinecap="round" />
            <circle cx="50" cy="50" r={radius} stroke="#6CB4FF" strokeWidth="12" fill="none" strokeDasharray={`${guestArc} ${circumference}`} strokeDashoffset={-firebaseArc} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] text-[#7a6f94]">Registered</span>
            <span className="text-xl font-bold text-[#f0ece4]">{formatNumber(total)}</span>
          </div>
        </div>
        <div className="space-y-3.5 text-[11px]">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-sm bg-[#FF916C]" />
            <span className="w-12 text-[#d8d4e7]">Google</span>
            <span className="w-14 font-bold text-[#f0ece4]">{formatNumber(firebase)}</span>
            <span className="text-[#7a6f94]">{firebasePercent}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-sm bg-[#6CB4FF]" />
            <span className="w-12 text-[#d8d4e7]">Guest</span>
            <span className="w-14 font-bold text-[#f0ece4]">{formatNumber(guest)}</span>
            <span className="text-[#7a6f94]">{guestPercent}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActiveSessionsTable({ activeSessions, activeSessionsList }) {
  const avatarColors = ['#FF5B5B', '#FF916C', '#6CB4FF', '#4EF0A0', '#A78BFA', '#FFB23E', '#F472B6', '#34D399']
  const [lightboxPhoto, setLightboxPhoto] = useState(null)

  function getInitials(name) {
    const parts = (name || 'AN').trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  function formatTimeAgo(seconds) {
    if (!seconds && seconds !== 0) return '-'
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    return `${Math.floor(seconds / 3600)}h ago`
  }

  function parseDevice(ua) {
    if (!ua) return '-'
    if (/iPhone/.test(ua)) return 'iOS ' + ((ua.match(/OS (\d+[_.]\d+)/) || [])[1] || '').replace('_', '.')
    if (/Android/.test(ua)) return 'Android ' + ((ua.match(/Android (\d+)/) || [])[1] || '')
    if (/Mac OS/.test(ua)) return 'macOS'
    if (/Windows/.test(ua)) return 'Windows'
    if (/Linux/.test(ua)) return 'Linux'
    return 'Web'
  }

  const displaySessions = (activeSessionsList || []).slice(0, 8)

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Active sessions · live feed</p>
          <p className="text-[9px] text-[#7a6f94]">In-memory session store · all active sessions</p>
        </div>
        <span className="rounded-full bg-[#4EF0A0]/15 px-3 py-1 text-[10px] font-bold text-[#4EF0A0]">
          ● {formatNumber(activeSessions)} active
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
              <th className="pb-3 pr-4">User</th>
              <th className="pb-3 pr-4">Email</th>
              <th className="pb-3 pr-4">Attendance</th>
              <th className="pb-3 pr-4">Started</th>
              <th className="pb-3 pr-4">Device</th>
              <th className="pb-3 text-right">Events</th>
            </tr>
          </thead>
          <tbody>
            {displaySessions.map((session, i) => {
              const percent = session.attendancePercent
              const percentColor = percent > 75 ? '#4EF0A0' : percent >= 60 ? '#FFB23E' : '#FF5B5B'
              return (
                <tr key={session.rollNumber || i} className="border-b border-white/[0.04]">
                  <td className="py-3.5 pr-4">
                    <div className="flex items-center gap-2.5">
                      {session.photoUrl ? (
                        <img src={session.photoUrl} alt="" className="h-8 w-8 cursor-pointer rounded-full object-cover ring-1 ring-white/10 transition hover:ring-[#FF916C]/50" onClick={() => setLightboxPhoto({ src: session.photoUrl, name: session.userName })} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                      ) : null}
                      <div className={`h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#1e1932] ${session.photoUrl ? 'hidden' : 'flex'}`} style={{ backgroundColor: avatarColors[i % avatarColors.length] }}>
                        {getInitials(session.userName)}
                      </div>
                      <div>
                        <p className="font-medium text-[#d8d4e7]">{session.userName || 'Unknown'}</p>
                        <p className="text-[9px] text-[#7a6f94]">{session.rollNumber || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 pr-4 text-[#9F9AB5]">{session.email || 'Anonymous'}</td>
                  <td className="py-3.5 pr-4">
                    {percent !== null && percent !== undefined ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${percentColor}20`, color: percentColor }}>
                        {percent.toFixed(1)}%
                      </span>
                    ) : <span className="text-[#7a6f94]">-</span>}
                  </td>
                  <td className="py-3.5 pr-4 text-[#9F9AB5]">{formatTimeAgo(session.startedSecondsAgo)}</td>
                  <td className="py-3.5 pr-4 text-[#d8d4e7]">{parseDevice(session.userAgent)}</td>
                  <td className="py-3.5 text-right font-semibold text-[#f0ece4]">{session.eventCount}</td>
                </tr>
              )
            })}
            {!displaySessions.length ? (
              <tr><td colSpan={6} className="py-8 text-center text-[#7a6f94]">No active sessions</td></tr>
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

function UsersAnalyticsPage({ data, analytics, onRefresh, isLoading }) {
  const userAnalytics = data?.userAnalytics || {}
  const homepage = data?.homepage || {}
  const authBreakdown = analytics?.authBreakdown || {}
  const studentMetrics = analytics?.studentMetrics || {}
  const dataIntegrity = studentMetrics?.dataIntegrity || {}

  const growthSeries = useMemo(() => {
    return userAnalytics?.userGrowth?.series || []
  }, [userAnalytics])

  const growthSparkData = useMemo(() => {
    return growthSeries.slice(-7).map(d => d.newUsers || 0)
  }, [growthSeries])

  const activeSessions = homepage.activeSessions || data?.sessions?.active_sessions || 0
  const totalStudents = studentMetrics?.totalStudents || 0
  const newToday = studentMetrics?.newToday || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Users & Analytics</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : '12s ago'}
            </span>
            <span>Registration funnel, demographics, and live session counts</span>
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
        <KPICard label="Total Students" value={formatNumber(totalStudents)} trend={`+${newToday} today`} trendUp={newToday > 0} sparkData={growthSparkData} sparkColor="#FF916C" />
        <KPICard label="Google Linked" value={formatNumber(studentMetrics?.googleLinked || 0)} trend={`${totalStudents > 0 ? ((studentMetrics?.googleLinked || 0) / totalStudents * 100).toFixed(0) : 0}%`} trendUp sparkData={growthSparkData} sparkColor="#4EF0A0" />
        <KPICard label="Active Sessions" value={formatNumber(activeSessions)} suffix="/live" sparkData={growthSparkData.slice(-5)} sparkColor="#6CB4FF" />
        <KPICard label="Guest Only" value={formatNumber(studentMetrics?.guestOnly || 0)} trend={`${totalStudents > 0 ? ((studentMetrics?.guestOnly || 0) / totalStudents * 100).toFixed(0) : 0}%`} trendUp={false} sparkData={growthSparkData} sparkColor="#FFB23E" />
      </div>

      {/* Chart Row */}
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <NewUsersChart growthSeries={growthSeries} />
        <AuthBreakdownCard authBreakdown={authBreakdown} />
      </div>

      {/* Data Integrity */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Data Integrity</p>
        <p className="mt-0.5 text-[9px] text-[#7a6f94]">Backend database quality indicators</p>
        <div className="mt-4 grid grid-cols-3 gap-6">
          <div>
            <p className="text-2xl font-bold text-[#f0ece4]">{dataIntegrity.totalUserRows || 0}</p>
            <p className="mt-1 text-[10px] text-[#7a6f94]">Total user records in DB</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#f0ece4]">{dataIntegrity.uniqueEmails || 0}</p>
            <p className="mt-1 text-[10px] text-[#7a6f94]">Unique emails (distinct humans)</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${(dataIntegrity.duplicateRowsDetected || 0) > 0 ? 'text-[#FFB23E]' : 'text-[#4EF0A0]'}`}>{dataIntegrity.duplicateRowsDetected || 0}</p>
            <p className="mt-1 text-[10px] text-[#7a6f94]">Duplicate records detected</p>
          </div>
        </div>
      </div>

      {/* Active Sessions Table */}
      <ActiveSessionsTable activeSessions={activeSessions} activeSessionsList={data?.activeSessions || []} />
    </div>
  )
}

export default UsersAnalyticsPage
