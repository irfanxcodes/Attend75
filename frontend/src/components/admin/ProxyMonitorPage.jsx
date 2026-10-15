import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.attend75.xyz'

// ── helpers ────────────────────────────────────────────────────────────────

function formatTimeAgo(isoString) {
  if (!isoString) return 'Never'
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatCooldownRemaining(isoString) {
  if (!isoString) return null
  const diff = Math.floor((new Date(isoString) - Date.now()) / 1000)
  if (diff <= 0) return 'Expired'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

function shortUrl(url) {
  if (!url) return '—'
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    return u.hostname + (parts[0] ? `/${parts[0]}` : '')
  } catch {
    return url
  }
}

function regionFromUrl(url) {
  if (!url) return null
  const m = url.match(/execute-api\.([\w-]+)\.amazonaws\.com/)
  if (!m) return null
  const code = m[1]
  // Map AWS region codes to friendly names
  const regionNames = {
    'ap-south-1': 'Mumbai',
    'ap-south-2': 'Hyderabad',  // Not used (unavailable as public region)
    'ap-southeast-1': 'Singapore',
    'us-east-1': 'Virginia',
  }
  return regionNames[code] || code
}

function successRateColor(ok, fail) {
  const total = ok + fail
  if (total === 0) return 'text-[#6E6A88]'
  const rate = (ok / total) * 100
  if (rate >= 95) return 'text-[#4EF0A0]'
  if (rate >= 80) return 'text-[#FFB23E]'
  return 'text-[#FF5B5B]'
}

function tierLabel(type) {
  if (type === 'lambda') return { num: 1, label: 'Tier 1', color: 'text-[#A78BFA] bg-[#A78BFA]/10' }
  if (type === 'api_gateway') return { num: 2, label: 'Tier 2', color: 'text-[#6CB4FF] bg-[#6CB4FF]/10' }
  if (type === 'proxy') return { num: 3, label: 'Tier 3', color: 'text-[#FFB23E] bg-[#FFB23E]/10' }
  return { num: '?', label: 'Tier ?', color: 'text-[#6E6A88] bg-white/5' }
}

function StatusBadge({ item }) {
  if (item.blocked || item.blocked_until) {
    const rem = item.blocked_until ? formatCooldownRemaining(item.blocked_until) : null
    if (!rem || rem === 'Expired') return <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">Cooldown expired</span>
    return <span className="rounded-full bg-[#FF5B5B]/10 px-2 py-0.5 text-[10px] font-medium text-[#FF5B5B]">Blocked · {rem}</span>
  }
  const total = (item.success_count || 0) + (item.failure_count || 0)
  if (total === 0) return <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[#6E6A88]">Unused</span>
  const rate = (item.success_count / total) * 100
  if (rate >= 95) return <span className="rounded-full bg-[#4EF0A0]/10 px-2 py-0.5 text-[10px] font-medium text-[#4EF0A0]">Healthy</span>
  if (rate >= 80) return <span className="rounded-full bg-[#FFB23E]/10 px-2 py-0.5 text-[10px] font-medium text-[#FFB23E]">Degraded</span>
  return <span className="rounded-full bg-[#FF5B5B]/10 px-2 py-0.5 text-[10px] font-medium text-[#FF5B5B]">Failing</span>
}

function MetricCell({ label, value, valueClass = 'text-[#f0ece4]' }) {
  return (
    <div className="text-right">
      <p className="text-[9px] uppercase tracking-wider text-[#6E6A88]">{label}</p>
      <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

// ── Active tier banner ──────────────────────────────────────────────────────

function ActiveTierBanner({ activeTier }) {
  if (!activeTier || !activeTier.url) return null

  const typeColors = {
    lambda:      'text-[#A78BFA] bg-[#A78BFA]/10',
    api_gateway: 'text-[#6CB4FF] bg-[#6CB4FF]/10',
    worker:      'text-[#4EF0A0] bg-[#4EF0A0]/10',
    proxy:       'text-[#FFB23E] bg-[#FFB23E]/10',
  }
  const cls = typeColors[activeTier.type] || 'text-[#4EF0A0] bg-[#4EF0A0]/10'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#4EF0A0]/20 bg-[#4EF0A0]/5 p-4">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4EF0A0]/10">
        <span className="absolute h-9 w-9 animate-ping rounded-full bg-[#4EF0A0]/20" />
        <svg className="relative z-10 h-4 w-4 text-[#4EF0A0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4EF0A0]">Currently active tier</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
            {activeTier.tier}
          </span>
          <code className="truncate text-[11px] text-[#d8d4e7]">{shortUrl(activeTier.url)}</code>
          {activeTier.response_time_avg_ms > 0 && (
            <span className="text-[10px] text-[#6E6A88]">avg {activeTier.response_time_avg_ms}ms</span>
          )}
          {activeTier.last_success && (
            <span className="text-[10px] text-[#6E6A88]">· last used {formatTimeAgo(activeTier.last_success)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stat cards ──────────────────────────────────────────────────────────────

function StatCards({ stats, gwStatus, lambdaStatus, activeTierType }) {
  const totalReqs = stats.total_requests || 0
  const successRate = totalReqs > 0 ? stats.success_rate_percent : null
  const rateColor = successRate === null ? 'text-[#6E6A88]'
    : successRate >= 95 ? 'text-[#4EF0A0]'
    : successRate >= 80 ? 'text-[#FFB23E]'
    : 'text-[#FF5B5B]'

  const lambdaAvailable = lambdaStatus?.available_endpoints ?? 0
  const lambdaTotal     = lambdaStatus?.total_endpoints ?? 0

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* Success rate */}
      <div className="rounded-xl border border-white/5 bg-[#2a2440] p-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">Success Rate</p>
        <p className={`mt-1 text-2xl font-bold ${rateColor}`}>
          {successRate !== null ? `${successRate}%` : '—'}
        </p>
        <p className="mt-0.5 text-[10px] text-[#9F9AB5]">{stats.total_success ?? 0} / {totalReqs} requests</p>
      </div>

      {/* Lambda — highlight when active */}
      <div className={`rounded-xl border p-4 transition-colors ${
        activeTierType === 'lambda'
          ? 'border-[#A78BFA]/30 bg-[#A78BFA]/5'
          : 'border-white/5 bg-[#2a2440]'
      }`}>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">
          AWS Lambda
          {activeTierType === 'lambda' && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[#A78BFA]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#A78BFA]" />
              Active
            </span>
          )}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#f0ece4]">
          {lambdaAvailable}
          <span className="text-base font-normal text-[#6E6A88]"> / {lambdaTotal || 1}</span>
        </p>
        <p className="mt-0.5 text-[10px] text-[#9F9AB5]">{(lambdaTotal || 1) - lambdaAvailable} blocked</p>
      </div>

      {/* API Gateway — highlight when active */}
      <div className={`rounded-xl border p-4 transition-colors ${
        activeTierType === 'api_gateway'
          ? 'border-[#6CB4FF]/30 bg-[#6CB4FF]/5'
          : 'border-white/5 bg-[#2a2440]'
      }`}>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">
          API Gateway
          {activeTierType === 'api_gateway' && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[#6CB4FF]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6CB4FF]" />
              Active
            </span>
          )}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#f0ece4]">
          {(gwStatus?.total_endpoints ?? 0) - (gwStatus?.blocked_count ?? 0)}
          <span className="text-base font-normal text-[#6E6A88]"> / {gwStatus?.total_endpoints ?? 0}</span>
        </p>
        <p className="mt-0.5 text-[10px] text-[#9F9AB5]">{gwStatus?.blocked_count ?? 0} blocked</p>
      </div>

      {/* Avg response */}
      <div className="rounded-xl border border-white/5 bg-[#2a2440] p-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">Avg Response</p>
        <p className="mt-1 text-2xl font-bold text-[#f0ece4]">
          {stats.avg_response_time_ms > 0 ? `${Math.round(stats.avg_response_time_ms)}ms` : '—'}
        </p>
        <p className="mt-0.5 text-[10px] text-[#9F9AB5]">across all tiers</p>
      </div>
    </div>
  )
}

// ── Lambda section (Tier 1) ─────────────────────────────────────────────────

function LambdaSection({ lambda, isActiveTier }) {
  const { status, endpoints = [], disabled } = lambda || {}
  if (!endpoints.length) return null

  const t = tierLabel('lambda')
  const isActive = isActiveTier && !disabled

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#f0ece4]">
          AWS Lambda
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.color}`}>
            {t.label} — {isActive ? 'Active' : disabled ? 'Disabled' : 'Standby'}
          </span>
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#A78BFA] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#A78BFA]" />
            </span>
          )}
        </h3>
        {status && (
          <span className="text-[10px] text-[#6E6A88]">
            {status.monthly_usage ?? 0} / {status.monthly_cap ?? '900000'} this month ({status.usage_percent ?? 0}%)
          </span>
        )}
      </div>

      <div className="mb-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-[11px] text-[#9FC5E8]">
        <div className="flex items-start gap-2">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="font-medium">Active Regions: Mumbai (primary) + Singapore (fallback)</p>
            <p className="mt-1 text-[10px] text-[#6E6A88]">
              Hyderabad (ap-south-2) was considered but is not available as a public AWS region. 
              Mumbai chosen as primary due to lower latency to portal server (111.93.16.209).
              Lambda v5 uses intercept mode to ensure IP consistency across full login flow.
            </p>
          </div>
        </div>
      </div>

      {disabled && (
        <p className="mb-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-[#6E6A88]">
          Lambda is configured but currently on cooldown — will activate automatically once the cooldown expires.
        </p>
      )}

      <div className="space-y-2">
        {endpoints.map((ep, i) => {
          const region = regionFromUrl(ep.url)
          const total = (ep.success_count || 0) + (ep.failure_count || 0)
          return (
            <div
              key={i}
              className={`rounded-xl border p-3.5 transition-colors ${
                isActive
                  ? 'border-[#A78BFA]/30 bg-[#A78BFA]/5'
                  : 'border-white/5 bg-[#2a2440]'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isActive && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#A78BFA] opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#A78BFA]" />
                      </span>
                    )}
                    <code className="truncate text-[11px] text-[#d8d4e7]">{shortUrl(ep.url)}</code>
                    {region && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-[#9F9AB5]">{region}</span>}
                    <StatusBadge item={ep} />
                    {isActive && (
                      <span className="rounded-full bg-[#A78BFA]/20 px-2 py-0.5 text-[9px] font-bold uppercase text-[#A78BFA]">in use</span>
                    )}
                  </div>
                  {ep.last_error && <p className="mt-1 truncate text-[10px] text-[#FF5B5B]">{ep.last_error}</p>}
                </div>
                <div className="flex shrink-0 gap-5">
                  <MetricCell
                    label="Success"
                    value={total > 0 ? `${Math.round((ep.success_count / total) * 100)}%` : '—'}
                    valueClass={successRateColor(ep.success_count || 0, ep.failure_count || 0)}
                  />
                  <MetricCell label="Requests" value={total} />
                  <MetricCell label="Avg" value={ep.response_time_avg_ms > 0 ? `${ep.response_time_avg_ms}ms` : '—'} />
                  <MetricCell label="Last ok" value={formatTimeAgo(ep.last_success)} valueClass="text-[#9F9AB5]" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── API Gateway section (Tier 2) ────────────────────────────────────────────

function ApiGatewaySection({ gateway, isActiveTier }) {
  const { status, endpoints = [] } = gateway || {}
  if (!status?.configured) return null

  const t = tierLabel('api_gateway')
  const isActive = isActiveTier

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#f0ece4]">
          API Gateway · Fireprox
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.color}`}>
            {t.label} — {isActive ? 'Active' : 'Standby'}
          </span>
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6CB4FF] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#6CB4FF]" />
            </span>
          )}
        </h3>
        <span className="text-[10px] text-[#6E6A88]">
          rotates every {status.rotate_every} req · {endpoints.length} regions
        </span>
      </div>
      <div className="space-y-2">
        {endpoints.map((ep, i) => {
          const region = regionFromUrl(ep.url)
          const total = (ep.success_count || 0) + (ep.failure_count || 0)
          const isEndpointActive = ep.active && isActive
          return (
            <div
              key={i}
              className={`rounded-xl border p-3.5 transition-colors ${
                isEndpointActive ? 'border-[#6CB4FF]/30 bg-[#6CB4FF]/5' : 'border-white/5 bg-[#2a2440]'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isEndpointActive && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6CB4FF] opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#6CB4FF]" />
                      </span>
                    )}
                    <code className="truncate text-[11px] text-[#d8d4e7]">{shortUrl(ep.url)}</code>
                    {region && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-[#9F9AB5]">{region}</span>}
                    <StatusBadge item={ep} />
                    {isEndpointActive && (
                      <span className="rounded-full bg-[#6CB4FF]/20 px-2 py-0.5 text-[9px] font-bold uppercase text-[#6CB4FF]">in use</span>
                    )}
                  </div>
                  {ep.last_error && <p className="mt-1 truncate text-[10px] text-[#FF5B5B]">{ep.last_error}</p>}
                </div>
                <div className="flex shrink-0 gap-5">
                  <MetricCell
                    label="Success"
                    value={total > 0 ? `${Math.round((ep.success_count / total) * 100)}%` : '—'}
                    valueClass={successRateColor(ep.success_count || 0, ep.failure_count || 0)}
                  />
                  <MetricCell label="Requests" value={total} />
                  <MetricCell label="Avg" value={ep.response_time_avg_ms > 0 ? `${ep.response_time_avg_ms}ms` : '—'} />
                  <MetricCell label="Last ok" value={formatTimeAgo(ep.last_success)} valueClass="text-[#9F9AB5]" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Blocked alert ───────────────────────────────────────────────────────────

function BlockedSection({ blocked }) {
  if (!blocked?.length) return null
  return (
    <div className="rounded-xl border border-[#FF5B5B]/20 bg-[#FF5B5B]/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-[#FF5B5B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm font-semibold text-[#FF5B5B]">{blocked.length} endpoint{blocked.length > 1 ? 's' : ''} in cooldown</p>
      </div>
      <div className="space-y-2">
        {blocked.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4 rounded-lg border border-[#FF5B5B]/10 bg-[#FF5B5B]/5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#FF5B5B]/20 px-1.5 py-0.5 text-[9px] font-medium uppercase text-[#FF5B5B]">{item.type}</span>
                <code className="truncate text-[11px] text-[#d8d4e7]">{shortUrl(item.url)}</code>
                <StatusBadge item={item} />
              </div>
              {item.last_error && <p className="mt-0.5 truncate text-[10px] text-[#FF5B5B]/70">{item.last_error}</p>}
            </div>
            <div className="flex shrink-0 gap-5">
              <MetricCell label="Failures" value={item.failure_count} valueClass="text-[#FF5B5B]" />
              <MetricCell label="Last fail" value={formatTimeAgo(item.last_failure)} valueClass="text-[#9F9AB5]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── HTTP Proxy section (Tier 3) ─────────────────────────────────────────────

function HttpProxiesSection({ activeProxies, isActiveTier }) {
  const [page, setPage] = useState(0)
  const PAGE = 30
  const usedProxies   = activeProxies.filter(p => (p.success_count + p.failure_count) > 0)
  const unusedProxies = activeProxies.filter(p => (p.success_count + p.failure_count) === 0)
  const paginated = unusedProxies.slice(page * PAGE, (page + 1) * PAGE)

  const t = tierLabel('proxy')

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#f0ece4]">
        HTTP Proxy Pool
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isActiveTier ? t.color : 'bg-white/5 text-[#6E6A88]'}`}>
          Tier 3 — {isActiveTier ? 'Active' : 'Fallback'}
        </span>
        <span className="text-[11px] font-normal text-[#6E6A88]">({activeProxies.length} configured)</span>
      </h3>

      {usedProxies.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6A88]">Ever used ({usedProxies.length})</p>
          {usedProxies.map((proxy, i) => {
            const total = proxy.success_count + proxy.failure_count
            return (
              <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-[#2a2440] px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-[11px] text-[#d8d4e7]">{proxy.url.split('@')[1] || proxy.url}</code>
                    <StatusBadge item={proxy} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-5">
                  <MetricCell
                    label="Success"
                    value={`${Math.round((proxy.success_count / total) * 100)}%`}
                    valueClass={successRateColor(proxy.success_count, proxy.failure_count)}
                  />
                  <MetricCell label="Requests" value={total} />
                  <MetricCell label="Avg" value={proxy.response_time_avg_ms > 0 ? `${Math.round(proxy.response_time_avg_ms)}ms` : '—'} />
                  <MetricCell label="Last ok" value={formatTimeAgo(proxy.last_success)} valueClass="text-[#9F9AB5]" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border border-white/5 bg-[#2a2440]">
        <div className="border-b border-white/5 px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6A88]">
            Standby / unused ({unusedProxies.length})
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/5 text-left text-[9px] uppercase tracking-wider text-[#6E6A88]">
                <th className="px-4 py-2">IP : Port</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Requests</th>
                <th className="px-4 py-2 text-right">Last ok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {paginated.map((proxy, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <code className="text-[#9F9AB5]">{proxy.url.split('@')[1] || proxy.url}</code>
                  </td>
                  <td className="px-4 py-2"><StatusBadge item={proxy} /></td>
                  <td className="px-4 py-2 text-right text-[#6E6A88]">0</td>
                  <td className="px-4 py-2 text-right text-[#6E6A88]">Never</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unusedProxies.length > PAGE && (
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-2.5 text-[10px] text-[#6E6A88]">
            <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, unusedProxies.length)} of {unusedProxies.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="rounded bg-white/5 px-2 py-1 disabled:opacity-30 hover:bg-white/10">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE >= unusedProxies.length} className="rounded bg-white/5 px-2 py-1 disabled:opacity-30 hover:bg-white/10">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

function ProxyMonitorPage({ sessionToken }) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [clearingBlocks, setClearingBlocks] = useState(false)

  const fetchProxyStatus = async () => {
    try {
      setError('')
      const res = await fetch(`${API_BASE}/admin/proxy-monitor`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json.data)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load proxy monitor')
    } finally {
      setIsLoading(false)
    }
  }

  const clearAllBlocks = async () => {
    setClearingBlocks(true)
    try {
      const res = await fetch(`${API_BASE}/admin/proxy/clear-blocks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchProxyStatus()
    } catch (err) {
      setError(err.message || 'Failed to clear blocks')
    } finally {
      setClearingBlocks(false)
    }
  }

  useEffect(() => { fetchProxyStatus() }, [sessionToken])
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchProxyStatus, 30000)
    return () => clearInterval(id)
  }, [autoRefresh, sessionToken])

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-[#9F9AB5]">Loading proxy monitor…</p>
    </div>
  )

  if (error) return (
    <div className="rounded-xl border border-[#FF5B5B]/20 bg-[#FF5B5B]/5 p-5">
      <p className="text-sm font-medium text-[#FF5B5B]">Error: {error}</p>
      <button onClick={fetchProxyStatus} className="mt-3 rounded-lg bg-[#FF5B5B]/10 px-3 py-1.5 text-xs font-medium text-[#FF5B5B] hover:bg-[#FF5B5B]/20">
        Retry
      </button>
    </div>
  )

  const stats        = data?.statistics || {}
  const activeTier   = data?.active_tier || null
  const activeTierType = activeTier?.type || null
  const gateway      = data?.api_gateway || {}
  const lambda       = data?.lambda || {}
  const activeProxies = data?.active_proxies || []
  const blocked      = data?.blocked || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#f0ece4]">Proxy &amp; IP Monitor</h2>
          <p className="mt-0.5 text-[11px] text-[#6E6A88]">
            Live view of all egress tiers — Lambda · API Gateway · HTTP Proxies
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-[#9F9AB5]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/10 bg-white/5"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchProxyStatus}
            className="rounded-lg bg-[#FF916C]/10 px-3 py-1.5 text-[11px] font-medium text-[#FF916C] hover:bg-[#FF916C]/20"
          >
            Refresh Now
          </button>
          <button
            onClick={clearAllBlocks}
            disabled={clearingBlocks}
            className="rounded-lg bg-[#4EF0A0]/10 px-3 py-1.5 text-[11px] font-medium text-[#4EF0A0] hover:bg-[#4EF0A0]/20 disabled:opacity-50"
          >
            {clearingBlocks ? 'Clearing…' : 'Clear Blocks'}
          </button>
          {lastUpdated && (
            <span className="text-[10px] text-[#6E6A88]">Updated {formatTimeAgo(lastUpdated.toISOString())}</span>
          )}
        </div>
      </div>

      {/* Active tier banner */}
      <ActiveTierBanner activeTier={activeTier} />

      {/* Stat cards */}
      <StatCards
        stats={stats}
        gwStatus={gateway.status}
        lambdaStatus={lambda.status}
        activeTierType={activeTierType}
      />

      {/* Blocked alert */}
      <BlockedSection blocked={blocked} />

      {/* Tier 1 — Lambda */}
      <LambdaSection lambda={lambda} isActiveTier={activeTierType === 'lambda'} />

      {/* Tier 2 — API Gateway */}
      <ApiGatewaySection gateway={gateway} isActiveTier={activeTierType === 'api_gateway'} />

      {/* Tier 3 — HTTP Proxies */}
      <HttpProxiesSection activeProxies={activeProxies} isActiveTier={activeTierType === 'proxy'} />
    </div>
  )
}

export default ProxyMonitorPage
