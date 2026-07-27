import { useEffect, useState } from 'react'
import { parseAdminSession, fetchPushNotificationHealth } from '../../services/adminApi'

function StatusBadge({ status }) {
  const colors = {
    configured: 'bg-[#4EF0A0]/15 text-[#4EF0A0] border-[#4EF0A0]/20',
    missing: 'bg-[#FF5B5B]/15 text-[#FF5B5B] border-[#FF5B5B]/20',
    partial: 'bg-[#FFB23E]/15 text-[#FFB23E] border-[#FFB23E]/20',
  }
  const labels = {
    configured: '✅ Configured',
    missing: '❌ Missing',
    partial: '⚠️ Partial',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-bold ${colors[status] || colors.missing}`}>
      {labels[status] || status}
    </span>
  )
}

function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function StatCard({ label, value, sub, icon, color = '#FF916C', trend }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5 transition hover:border-white/[0.10]">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">{label}</p>
          <p className="mt-2 text-[26px] font-bold leading-none text-[#f0ece4]" style={{ color: trend === 'up' ? '#4EF0A0' : trend === 'down' ? '#FF5B5B' : undefined }}>
            {typeof value === 'number' ? formatNumber(value) : value ?? '—'}
          </p>
          {sub && <p className="mt-1.5 text-[10px] text-[#7a6f94] truncate">{sub}</p>}
        </div>
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}15` }}>
            <span className="text-base">{icon}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfigCard({ title, status, items, warnings }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-[#f0ece4]">{title}</p>
        <StatusBadge status={status} />
      </div>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span className="text-[#9F9AB5]">{item.label}</span>
            <span className={`font-semibold ${item.ok ? 'text-[#4EF0A0]' : 'text-[#FF5B5B]'}`}>
              {item.ok ? '✓' : '✗'} {item.value}
            </span>
          </div>
        ))}
      </div>
      {warnings?.length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-xl bg-[#FFB23E]/10 border border-[#FFB23E]/20 p-3">
          {warnings.map((w, i) => (
            <p key={i} className="text-[10px] text-[#FFB23E] flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function QueueHealthCard({ queue }) {
  if (!queue) return null
  const total = queue.total || 1
  const pending = queue.pending || 0
  const processing = queue.processing || 0
  const done = queue.done || 0
  const failed = queue.failed || 0
  const cancelled = queue.cancelled || 0

  const segments = [
    { label: 'Pending', value: pending, color: '#FFB23E' },
    { label: 'Processing', value: processing, color: '#6CB4FF' },
    { label: 'Done', value: done, color: '#4EF0A0' },
    { label: 'Failed', value: failed, color: '#FF5B5B' },
    { label: 'Cancelled', value: cancelled, color: '#7a6f94' },
  ]

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Queue Health</p>
          <p className="text-[9px] text-[#7a6f94]">Notification job queue — {formatNumber(total)} total jobs</p>
        </div>
        {failed > 0 && (
          <span className="rounded-full bg-[#FF5B5B]/15 px-2.5 py-1 text-[9px] font-bold text-[#FF5B5B]">
            {failed} failed
          </span>
        )}
      </div>

      {/* Stacked bar */}
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-[#1e1932]">
        {segments.filter(s => s.value > 0).map((s) => (
          <div
            key={s.label}
            className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor: s.color,
              opacity: s.label === 'Pending' || s.label === 'Processing' ? 0.8 : 0.6,
            }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[10px]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[#9F9AB5]">{s.label}</span>
            <span className="font-semibold text-[#d8d4e7] ml-auto">{formatNumber(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FailedJobsTable({ failedJobs }) {
  if (!failedJobs || failedJobs.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-6 text-center">
        <p className="text-sm">✅ No failed jobs in the last 48 hours</p>
        <p className="mt-1 text-[10px] text-[#7a6f94]">All push notifications are delivering successfully</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Recent Failed Jobs</p>
          <p className="text-[9px] text-[#7a6f94]">Last 48 hours · up to 20 entries</p>
        </div>
        <span className="rounded-full bg-[#FF5B5B]/15 px-2.5 py-1 text-[9px] font-bold text-[#FF5B5B]">
          {failedJobs.length} failed
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Target</th>
              <th className="px-5 py-3">Attempts</th>
              <th className="px-5 py-3">Error</th>
              <th className="px-5 py-3 text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {failedJobs.map((j) => (
              <tr key={j.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                <td className="px-5 py-3 font-mono text-[#7a6f94]">#{j.id}</td>
                <td className="px-5 py-3 font-mono text-[#d8d4e7]">{j.target_roll || '—'}</td>
                <td className="px-5 py-3 text-[#9F9AB5]">{j.attempts}/{j.max_attempts}</td>
                <td className="px-5 py-3 max-w-[300px]">
                  <p className="truncate text-[#FF5B5B]" title={j.last_error || ''}>{j.last_error || 'Unknown error'}</p>
                </td>
                <td className="px-5 py-3 text-right text-[#7a6f94] whitespace-nowrap">{j.created_at || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UpcomingJobsTable({ pendingJobs }) {
  if (!pendingJobs || pendingJobs.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-6 text-center">
        <p className="text-sm text-[#7a6f94]">No upcoming pending jobs</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-sm font-semibold text-[#f0ece4]">Upcoming Scheduled Jobs</p>
          <p className="text-[9px] text-[#7a6f94]">Next 10 pending push jobs</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Target</th>
              <th className="px-5 py-3">Scheduled (IST)</th>
              <th className="px-5 py-3 text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {pendingJobs.map((j) => (
              <tr key={j.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                <td className="px-5 py-3 font-mono text-[#7a6f94]">#{j.id}</td>
                <td className="px-5 py-3 font-mono text-[#d8d4e7]">{j.target_roll || '—'}</td>
                <td className="px-5 py-3">
                  <span className="rounded bg-[#FFB23E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFB23E]">{j.scheduled_at_ist || '—'}</span>
                </td>
                <td className="px-5 py-3 text-right text-[#7a6f94]">{j.created_at || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WorkerStatusCard({ worker }) {
  if (!worker) return null
  const alive = worker.alive
  const lastDelivery = worker.last_successful_delivery
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-[#f0ece4]">Push Worker</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold border ${
          alive ? 'bg-[#4EF0A0]/15 text-[#4EF0A0] border-[#4EF0A0]/20' : 'bg-[#FF5B5B]/15 text-[#FF5B5B] border-[#FF5B5B]/20'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${alive ? 'bg-[#4EF0A0] animate-pulse' : 'bg-[#FF5B5B]'}`} />
          {alive ? 'Running' : 'Stopped'}
        </span>
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#9F9AB5]">Thread pool</span>
          <span className="font-semibold text-[#d8d4e7]">{worker.thread_pool_size} threads</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#9F9AB5]">Jobs last hour</span>
          <span className="font-semibold text-[#d8d4e7]">{formatNumber(worker.jobs_processed_last_hour)}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#9F9AB5]">Last delivery</span>
          <span className="font-semibold text-[#d8d4e7]">{lastDelivery ? new Date(lastDelivery).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}</span>
        </div>
      </div>
      {worker.warning && (
        <div className="mt-3 rounded-xl bg-[#FFB23E]/10 border border-[#FFB23E]/20 p-3">
          <p className="text-[10px] text-[#FFB23E] flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <span>{worker.warning}</span>
          </p>
        </div>
      )}
    </div>
  )
}

function SubscriptionCard({ subs }) {
  if (!subs) return null
  const deviceBreakdown = subs.device_breakdown || {}

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
      <p className="text-sm font-semibold text-[#f0ece4] mb-4">Push Subscriptions</p>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Devices" value={subs.total_subscriptions} color="#6CB4FF" icon="📱" />
        <StatCard label="Unique Students" value={subs.unique_students} color="#4EF0A0" icon="👥" />
        <StatCard label="Timetable Enabled" value={subs.with_timetable} sub={`${subs.eligible_for_reminders} eligible for reminders`} color="#FFB23E" icon="📅" />
        <StatCard label="Cached Subjects" value={subs.with_cached_subjects} sub="Can receive class reminders" color="#A78BFA" icon="📚" />
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.06]">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94] mb-2">Device Breakdown</p>
        <div className="flex gap-4 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
            Android: {deviceBreakdown.android || 0}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#6CB4FF]" />
            iOS: {deviceBreakdown.ios || 0}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#A78BFA]" />
            Web: {deviceBreakdown.web || 0}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#FF916C]" />
            FCM: {deviceBreakdown.fcm_enabled || 0}
          </span>
        </div>
      </div>
    </div>
  )
}

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
  const hasWarnings = config?.vapid?.warnings?.length > 0 || config?.fcm?.warnings?.length > 0
  const failureRate = delivery?.failure_rate_24h || 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#f0ece4]">Push Notification Health</h1>
            {hasWarnings && (
              <span className="rounded-full bg-[#FFB23E]/15 px-2.5 py-0.5 text-[9px] font-bold text-[#FFB23E] border border-[#FFB23E]/20">
                ⚠️ Warnings
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className={`flex items-center gap-1.5`}>
              <span className={`h-2 w-2 rounded-full ${worker?.alive ? 'bg-[#4EF0A0] animate-pulse' : 'bg-[#FF5B5B]'}`} />
              Push worker {worker?.alive ? 'running' : 'stopped'} · {queue?.total || 0} total jobs · {delivery?.done_last_24h || 0} delivered today
            </span>
            {lastRefreshed && (
              <span>Updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#d8d4e7] transition hover:bg-white/10 active:scale-[0.97] disabled:opacity-50"
        >
          {isLoading ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d8d4e7] border-t-transparent" />
          ) : '↻'}
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 px-4 py-2.5 text-xs text-[#FF5B5B]">
          {error}
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Queue Pending"
          value={queue?.pending || 0}
          icon="🔄"
          color="#FFB23E"
          trend={queue?.pending > 10 ? 'down' : undefined}
          sub={queue?.pending > 0 ? `${queue.pending} jobs waiting` : 'All clear'}
        />
        <StatCard
          label="Sent (24h)"
          value={delivery?.done_last_24h || 0}
          icon="📤"
          color="#4EF0A0"
        />
        <StatCard
          label="Failed (24h)"
          value={delivery?.failed_last_24h || 0}
          icon="❌"
          color="#FF5B5B"
          trend={delivery?.failed_last_24h > 0 ? 'down' : undefined}
          sub={`${failureRate}% failure rate`}
        />
        <StatCard
          label="Subscribers"
          value={subscriptions?.unique_students || 0}
          sub={`${subscriptions?.total_subscriptions || 0} total devices`}
          icon="👥"
          color="#6CB4FF"
        />
      </div>

      {/* Config + Worker + Queue row */}
      <div className="grid grid-cols-3 gap-4">
        <ConfigCard
          title="VAPID Configuration"
          status={config?.vapid?.public_key_present && config?.vapid?.private_key_present ? 'configured' : config?.vapid?.public_key_present || config?.vapid?.private_key_present ? 'partial' : 'missing'}
          items={[
            { label: 'Public Key', value: config?.vapid?.public_key_present ? 'Set ✓' : 'Missing ✗', ok: config?.vapid?.public_key_present },
            { label: 'Private Key', value: config?.vapid?.private_key_present ? 'Set ✓' : 'Missing ✗', ok: config?.vapid?.private_key_present },
            { label: 'Contact Email', value: config?.vapid?.contact_email || 'Not set', ok: !!config?.vapid?.contact_email },
          ]}
          warnings={config?.vapid?.warnings}
        />
        <ConfigCard
          title="FCM / Firebase"
          status={config?.fcm?.status || 'missing'}
          items={[
            { label: 'Service Account', value: config?.fcm?.service_account_path ? config.fcm.service_account_path.split('/').pop() : 'Not set ✗', ok: !!config?.fcm?.service_account_path },
            { label: 'FCM Enabled Devices', value: subscriptions?.device_breakdown?.fcm_enabled ? `${subscriptions.device_breakdown.fcm_enabled} devices` : 'None', ok: (subscriptions?.device_breakdown?.fcm_enabled || 0) > 0 },
          ]}
          warnings={config?.fcm?.warnings}
        />
        <QueueHealthCard queue={queue} />
      </div>

      {/* Worker + Subscription row */}
      <div className="grid grid-cols-2 gap-4">
        <WorkerStatusCard worker={worker} />
        <SubscriptionCard subs={subscriptions} />
      </div>

      {/* Failed + Upcoming tables row */}
      <div className="grid grid-cols-2 gap-4">
        <FailedJobsTable failedJobs={delivery?.recent_failures_48h} />
        <UpcomingJobsTable pendingJobs={delivery?.upcoming_pending_jobs} />
      </div>

      {/* History by category */}
      {historyData?.by_category?.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-sm font-semibold text-[#f0ece4] mb-4">7-Day Delivery by Category</p>
          <div className="space-y-2.5">
            {historyData.by_category.map((cat) => (
              <div key={cat.category} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-3 flex-1">
                  <span className="w-28 capitalize text-[#d8d4e7] font-medium">{cat.category}</span>
                  <div className="flex-1 h-4 bg-[#1e1932] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#4EF0A0] to-[#6CB4FF] transition-all"
                      style={{ width: `${cat.sent > 0 ? Math.min((cat.sent / (cat.sent + cat.failed || 1)) * 100, 100) : 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <span className="text-[#4EF0A0] font-semibold w-10 text-right">{cat.sent}</span>
                  <span className="text-[#FF5B5B] w-8 text-right">{cat.failed > 0 ? cat.failed : '—'}</span>
                  {cat.high_priority > 0 && (
                    <span className="rounded bg-[#FF5B5B]/15 px-1.5 py-0.5 text-[8px] font-bold text-[#FF5B5B]">HP:{cat.high_priority}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[9px] text-[#7a6f94] pt-2 border-t border-white/[0.06]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#4EF0A0]" /> Sent</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#FF5B5B]" /> Failed</span>
            <span>HP = High Priority</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default PushNotificationHealthPage
