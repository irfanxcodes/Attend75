import { useEffect, useState } from 'react'
import { parseAdminSession, fetchPushNotificationHealth } from '../../services/adminApi'

function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n ?? 0)
}

function timeAgo(iso) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── System Status Banner ────────────────────────────────────────────────────
function SystemStatusBanner({ worker, config, delivery, queue }) {
  const workerDown = !worker?.alive
  const configBroken = !config?.vapid?.public_key_present || !config?.vapid?.private_key_present
  const highFailRate = (delivery?.failure_rate_24h || 0) > 5
  const queueStuck = (queue?.pending || 0) > 100

  const issues = []
  if (workerDown) issues.push('Push worker is stopped')
  if (configBroken) issues.push('VAPID keys not configured')
  if (highFailRate) issues.push(`High failure rate: ${delivery?.failure_rate_24h}%`)
  if (queueStuck) issues.push(`${queue?.pending} jobs stuck in queue`)

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[#4EF0A0]/20 bg-[#4EF0A0]/5 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4EF0A0]/15">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#4EF0A0]">All systems normal</p>
          <p className="text-[10px] text-[#7a6f94]">Worker running · config valid · delivery healthy</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#FF5B5B]/25 bg-[#FF5B5B]/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF5B5B]/15 mt-0.5">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#FF5B5B]" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-[#FF5B5B]">{issues.length} issue{issues.length > 1 ? 's' : ''} need attention</p>
          <ul className="mt-1.5 space-y-1">
            {issues.map((issue, i) => (
              <li key={i} className="text-[11px] text-[#d8d4e7] flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[#FF5B5B] shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Quick Metrics Row ───────────────────────────────────────────────────────
function MetricTile({ label, value, sub, color = '#f0ece4', alert = false }) {
  return (
    <div className={`rounded-2xl border bg-[#2a2440] p-5 ${alert ? 'border-[#FF5B5B]/30' : 'border-white/[0.06]'}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none" style={{ color }}>{value}</p>
      {sub && <p className="mt-1.5 text-[10px] text-[#7a6f94]">{sub}</p>}
    </div>
  )
}

// ─── Worker + Config status side by side ─────────────────────────────────────
function StatusRow({ worker, config, subscriptions }) {
  const vapidOk = config?.vapid?.public_key_present && config?.vapid?.private_key_present
  const fcmOk = !!config?.fcm?.service_account_path

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Worker */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#f0ece4]">Push Worker</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold ${
            worker?.alive ? 'bg-[#4EF0A0]/10 text-[#4EF0A0]' : 'bg-[#FF5B5B]/10 text-[#FF5B5B]'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${worker?.alive ? 'bg-[#4EF0A0] animate-pulse' : 'bg-[#FF5B5B]'}`} />
            {worker?.alive ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="mt-5 space-y-3">
          <div className="flex justify-between text-[11px]">
            <span className="text-[#7a6f94]">Thread pool</span>
            <span className="font-semibold text-[#d8d4e7]">{worker?.thread_pool_size ?? '—'} threads</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#7a6f94]">Jobs last hour</span>
            <span className="font-semibold text-[#d8d4e7]">{formatNumber(worker?.jobs_processed_last_hour)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#7a6f94]">Last delivery</span>
            <span className="font-semibold text-[#d8d4e7]">{timeAgo(worker?.last_successful_delivery)}</span>
          </div>
        </div>
        {worker?.warning && (
          <div className="mt-4 rounded-xl border border-[#FFB23E]/20 bg-[#FFB23E]/8 p-3 text-[10px] text-[#FFB23E]">
            ⚠ {worker.warning}
          </div>
        )}
      </div>

      {/* Config */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Configuration</p>
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">VAPID Public Key</span>
            <span className={`font-semibold ${config?.vapid?.public_key_present ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
              {config?.vapid?.public_key_present ? '✓ Set' : '✗ Missing'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">VAPID Private Key</span>
            <span className={`font-semibold ${config?.vapid?.private_key_present ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
              {config?.vapid?.private_key_present ? '✓ Set' : '✗ Missing'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">Firebase / FCM</span>
            <span className={`font-semibold ${fcmOk ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
              {fcmOk ? '✓ Configured' : '✗ Missing'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">Contact Email</span>
            <span className="max-w-[140px] truncate text-right font-semibold text-[#d8d4e7]">
              {config?.vapid?.contact_email || '—'}
            </span>
          </div>
        </div>
        {(!vapidOk || !fcmOk) && (
          <div className="mt-4 rounded-xl border border-[#FF5B5B]/20 bg-[#FF5B5B]/8 p-3 text-[10px] text-[#FF5B5B]">
            ✗ Fix missing keys — push will not work
          </div>
        )}
      </div>

      {/* Subscribers */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Subscribers</p>
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">Unique students</span>
            <span className="font-bold text-[#f0ece4] text-base">{formatNumber(subscriptions?.unique_students)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">Total devices</span>
            <span className="font-semibold text-[#d8d4e7]">{formatNumber(subscriptions?.total_subscriptions)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">Timetable enabled</span>
            <span className="font-semibold text-[#d8d4e7]">{formatNumber(subscriptions?.with_timetable)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#7a6f94]">Eligible for class reminders</span>
            <span className="font-semibold text-[#4EF0A0]">{formatNumber(subscriptions?.with_cached_subjects)}</span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex gap-3 text-[10px] text-[#7a6f94]">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#4EF0A0]" /> Android {subscriptions?.device_breakdown?.android || 0}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#6CB4FF]" /> iOS {subscriptions?.device_breakdown?.ios || 0}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#A78BFA]" /> Web {subscriptions?.device_breakdown?.web || 0}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Failed Jobs — only if there are any ─────────────────────────────────────
function FailedJobsSection({ failedJobs }) {
  const [expanded, setExpanded] = useState(false)
  if (!failedJobs || failedJobs.length === 0) return null

  const shown = expanded ? failedJobs : failedJobs.slice(0, 5)

  return (
    <div className="rounded-2xl border border-[#FF5B5B]/20 bg-[#2a2440] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Failed Jobs</p>
          <p className="text-[9px] text-[#7a6f94]">Last 48h · these students didn't receive their notification</p>
        </div>
        <span className="rounded-full bg-[#FF5B5B]/15 px-3 py-1 text-[9px] font-bold text-[#FF5B5B]">
          {failedJobs.length} failed
        </span>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
            <th className="px-5 py-2.5 text-left">Student</th>
            <th className="px-5 py-2.5 text-left">Error</th>
            <th className="px-5 py-2.5 text-left">Attempts</th>
            <th className="px-5 py-2.5 text-right">When</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((j) => (
            <tr key={j.id} className="border-b border-white/[0.03] last:border-0">
              <td className="px-5 py-3 font-mono text-[#d8d4e7]">{j.target_roll || '—'}</td>
              <td className="px-5 py-3 max-w-[280px]">
                <span className="truncate block text-[#FF5B5B]">{j.last_error || 'Unknown error'}</span>
              </td>
              <td className="px-5 py-3 text-[#9F9AB5]">{j.attempts}/{j.max_attempts}</td>
              <td className="px-5 py-3 text-right text-[#7a6f94]">{timeAgo(j.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {failedJobs.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-white/[0.06] py-2.5 text-center text-[10px] font-semibold text-[#9F9AB5] hover:text-[#f0ece4] hover:bg-white/[0.02] transition"
        >
          {expanded ? 'Show less ↑' : `Show ${failedJobs.length - 5} more ↓`}
        </button>
      )}
    </div>
  )
}

// ─── Category breakdown ───────────────────────────────────────────────────────
function CategoryBreakdown({ history }) {
  const cats = history?.by_category || []
  if (!cats.length) return null

  const maxSent = Math.max(...cats.map((c) => c.sent || 0), 1)

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Delivery by Category</p>
          <p className="text-[9px] text-[#7a6f94]">Last 7 days — sent vs failed</p>
        </div>
      </div>
      <div className="space-y-3.5">
        {cats.map((cat) => {
          const successRate = cat.sent > 0 ? Math.round(((cat.sent - cat.failed) / cat.sent) * 100) : 0
          const isUnhealthy = cat.failed > 0 && successRate < 90
          return (
            <div key={cat.category} className="flex items-center gap-4">
              <span className="w-28 shrink-0 capitalize text-[11px] font-medium text-[#d8d4e7]">{cat.category}</span>
              <div className="flex-1 h-2 rounded-full bg-[#1e1932] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((cat.sent / maxSent) * 100, 100)}%`,
                    background: isUnhealthy
                      ? 'linear-gradient(90deg, #FF5B5B, #FFB23E)'
                      : 'linear-gradient(90deg, #4EF0A0, #6CB4FF)',
                  }}
                />
              </div>
              <div className="flex items-center gap-3 text-[10px] shrink-0">
                <span className="w-10 text-right font-semibold text-[#f0ece4]">{formatNumber(cat.sent)}</span>
                {cat.failed > 0 ? (
                  <span className="rounded bg-[#FF5B5B]/15 px-1.5 py-0.5 text-[#FF5B5B] font-bold">{cat.failed} fail</span>
                ) : (
                  <span className="rounded bg-[#4EF0A0]/10 px-1.5 py-0.5 text-[#4EF0A0] text-[9px]">✓</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function PushNotificationHealthPage() {
  const session = parseAdminSession()
  const token = session?.sessionToken
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const loadData = async () => {
    if (!token) return
    setIsLoading(true)
    setError('')
    try {
      const result = await fetchPushNotificationHealth(token)
      setData(result)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load push notification health data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#FF916C]/30 border-t-[#FF916C]" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-xs text-[#FF5B5B]">
        {error}
        <button type="button" onClick={loadData} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  const { config, worker, queue, delivery, subscriptions, history: historyData } = data || {}
  const failureRate = delivery?.failure_rate_24h || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#f0ece4]">Push Notification Health</h1>
          <p className="mt-0.5 text-[11px] text-[#7a6f94]">
            {lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading...'}
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#d8d4e7] transition hover:bg-white/10 disabled:opacity-50"
        >
          {isLoading
            ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d8d4e7]/30 border-t-[#d8d4e7]" />
            : <span>↻</span>
          }
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* 1. System status banner — most important thing */}
      <SystemStatusBanner worker={worker} config={config} delivery={delivery} queue={queue} />

      {/* 2. Four quick numbers */}
      <div className="grid grid-cols-4 gap-3">
        <MetricTile
          label="Delivered today"
          value={formatNumber(delivery?.done_last_24h || 0)}
          sub="notifications sent successfully"
          color="#4EF0A0"
        />
        <MetricTile
          label="Failed today"
          value={formatNumber(delivery?.failed_last_24h || 0)}
          sub={`${failureRate}% failure rate`}
          color={delivery?.failed_last_24h > 0 ? '#FF5B5B' : '#f0ece4'}
          alert={delivery?.failed_last_24h > 0}
        />
        <MetricTile
          label="Queue pending"
          value={formatNumber(queue?.pending || 0)}
          sub={queue?.pending > 0 ? 'waiting to be sent' : 'queue clear'}
          color={queue?.pending > 50 ? '#FFB23E' : '#f0ece4'}
          alert={queue?.pending > 100}
        />
        <MetricTile
          label="Subscribers"
          value={formatNumber(subscriptions?.unique_students || 0)}
          sub={`${formatNumber(subscriptions?.total_subscriptions || 0)} total devices`}
          color="#6CB4FF"
        />
      </div>

      {/* 3. Worker · Config · Subscribers status */}
      <StatusRow worker={worker} config={config} subscriptions={subscriptions} />

      {/* 4. Failed jobs — only visible if there are failures */}
      {error && (
        <div className="rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 px-4 py-2.5 text-xs text-[#FF5B5B]">{error}</div>
      )}
      <FailedJobsSection failedJobs={delivery?.recent_failures_48h} />

      {/* 5. Category breakdown */}
      <CategoryBreakdown history={historyData} />
    </div>
  )
}

export default PushNotificationHealthPage
