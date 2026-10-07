import { useEffect, useState } from 'react'

function ProxyMonitorPage({ sessionToken }) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchProxyStatus = async () => {
    try {
      setError('')
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'https://api.attend75.xyz'}/admin/proxy-monitor`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch proxy status')
      }

      const result = await response.json()
      setData(result.data)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load proxy monitor data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProxyStatus()
  }, [sessionToken])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchProxyStatus, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [autoRefresh, sessionToken])

  const formatTime = (isoString) => {
    if (!isoString) return 'Never'
    const date = new Date(isoString)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const formatCooldown = (isoString) => {
    if (!isoString) return null
    const date = new Date(isoString)
    const now = new Date()
    const diff = Math.floor((date - now) / 1000)
    
    if (diff <= 0) return 'Expired'
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    return `${Math.floor(diff / 3600)}h`
  }

  const getSuccessRateColor = (successCount, failureCount) => {
    const total = successCount + failureCount
    if (total === 0) return 'text-[#6E6A88]'
    
    const rate = (successCount / total) * 100
    if (rate >= 95) return 'text-green-400'
    if (rate >= 90) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getStatusBadge = (item) => {
    if (item.cooldown_until) {
      const remaining = formatCooldown(item.cooldown_until)
      if (remaining === 'Expired') {
        return <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">Cooldown Expired</span>
      }
      return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">Blocked ({remaining})</span>
    }
    
    const total = item.success_count + item.failure_count
    if (total === 0) {
      return <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] font-medium text-gray-400">Unused</span>
    }
    
    const rate = (item.success_count / total) * 100
    if (rate >= 95) {
      return <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">Healthy</span>
    }
    if (rate >= 90) {
      return <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">Degraded</span>
    }
    return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">Failing</span>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-[#9F9AB5]">Loading proxy monitor...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-sm font-medium text-red-400">Error: {error}</p>
        <button
          onClick={fetchProxyStatus}
          className="mt-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
        >
          Retry
        </button>
      </div>
    )
  }

  const stats = data?.statistics || {}
  const activeWorkers = data?.active_workers || []
  const activeProxies = data?.active_proxies || []
  const blocked = data?.blocked || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#F4F1FF]">Proxy & Worker Monitor</h2>
          <p className="mt-0.5 text-xs text-[#6E6A88]">
            Real-time status of all Cloudflare Workers and HTTP proxies
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#9F9AB5]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/10 bg-white/5 text-[#FF916C] focus:ring-[#FF916C] focus:ring-offset-0"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchProxyStatus}
            className="rounded-lg bg-[#FF916C]/10 px-3 py-1.5 text-xs font-medium text-[#FF916C] transition hover:bg-[#FF916C]/20"
          >
            Refresh Now
          </button>
          {lastUpdated && (
            <span className="text-[10px] text-[#6E6A88]">
              Updated {formatTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/5 bg-[#2A2440] p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">Success Rate</p>
          <p className={`mt-1 text-2xl font-bold ${stats.success_rate_percent >= 95 ? 'text-green-400' : stats.success_rate_percent >= 90 ? 'text-yellow-400' : 'text-red-400'}`}>
            {stats.success_rate_percent}%
          </p>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">
            {stats.total_success} / {stats.total_requests} requests
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#2A2440] p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">Workers</p>
          <p className="mt-1 text-2xl font-bold text-[#F4F1FF]">
            {stats.active_workers} / {stats.total_workers}
          </p>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">
            {stats.blocked_workers} blocked
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#2A2440] p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">Proxies</p>
          <p className="mt-1 text-2xl font-bold text-[#F4F1FF]">
            {stats.active_proxies} / {stats.total_proxies}
          </p>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">
            {stats.blocked_proxies} blocked
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-[#2A2440] p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6E6A88]">Avg Response</p>
          <p className="mt-1 text-2xl font-bold text-[#F4F1FF]">
            {stats.avg_response_time_ms}ms
          </p>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">
            Average latency
          </p>
        </div>
      </div>

      {/* Blocked Items Alert */}
      {blocked.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">
                {blocked.length} {blocked.length === 1 ? 'IP is' : 'IPs are'} currently blocked
              </p>
              <p className="mt-0.5 text-xs text-red-300/70">
                These IPs are in cooldown and won't be used until the timer expires
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Workers */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-[#F4F1FF]">
          Active Cloudflare Workers ({activeWorkers.length})
        </h3>
        <div className="space-y-2">
          {activeWorkers.map((worker, idx) => (
            <div key={idx} className="rounded-lg border border-white/5 bg-[#2A2440] p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-[#F4F1FF]">{worker.url}</code>
                    {getStatusBadge(worker)}
                  </div>
                  {worker.last_error && (
                    <p className="mt-1 text-[10px] text-red-400">Last error: {worker.last_error}</p>
                  )}
                </div>
                <div className="ml-4 flex gap-6 text-right">
                  <div>
                    <p className="text-[10px] text-[#6E6A88]">Success Rate</p>
                    <p className={`text-sm font-medium ${getSuccessRateColor(worker.success_count, worker.failure_count)}`}>
                      {worker.success_count + worker.failure_count > 0
                        ? `${Math.round((worker.success_count / (worker.success_count + worker.failure_count)) * 100)}%`
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#6E6A88]">Requests</p>
                    <p className="text-sm font-medium text-[#F4F1FF]">{worker.success_count + worker.failure_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#6E6A88]">Avg Response</p>
                    <p className="text-sm font-medium text-[#F4F1FF]">{Math.round(worker.response_time_avg_ms)}ms</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#6E6A88]">Last Success</p>
                    <p className="text-sm font-medium text-[#9F9AB5]">{formatTime(worker.last_success)}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {activeWorkers.length === 0 && (
            <p className="rounded-lg border border-white/5 bg-[#2A2440] p-4 text-center text-sm text-[#6E6A88]">
              No active workers available
            </p>
          )}
        </div>
      </div>

      {/* Blocked Items */}
      {blocked.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold text-[#F4F1FF]">
            Blocked IPs ({blocked.length})
          </h3>
          <div className="space-y-2">
            {blocked.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-400">
                        {item.type}
                      </span>
                      <code className="text-xs text-[#F4F1FF]">{item.url}</code>
                      {getStatusBadge(item)}
                    </div>
                    <p className="mt-1 text-[10px] text-red-400">
                      Error: {item.last_error || 'Unknown error'}
                    </p>
                  </div>
                  <div className="ml-4 flex gap-6 text-right">
                    <div>
                      <p className="text-[10px] text-[#6E6A88]">Failures</p>
                      <p className="text-sm font-medium text-red-400">{item.failure_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#6E6A88]">Last Failure</p>
                      <p className="text-sm font-medium text-[#9F9AB5]">{formatTime(item.last_failure)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Proxies (Paginated) */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-[#F4F1FF]">
          Active HTTP Proxies ({activeProxies.length})
        </h3>
        <div className="rounded-lg border border-white/5 bg-[#2A2440]">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-b border-white/5 bg-[#2A2440]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6E6A88]">
                  <th className="px-3 py-2">IP Address</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Success Rate</th>
                  <th className="px-3 py-2 text-right">Requests</th>
                  <th className="px-3 py-2 text-right">Avg Response</th>
                  <th className="px-3 py-2 text-right">Last Success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activeProxies.slice(0, 50).map((proxy, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      <code className="text-[#F4F1FF]">{proxy.url.split('@')[1] || proxy.url}</code>
                    </td>
                    <td className="px-3 py-2">{getStatusBadge(proxy)}</td>
                    <td className={`px-3 py-2 text-right ${getSuccessRateColor(proxy.success_count, proxy.failure_count)}`}>
                      {proxy.success_count + proxy.failure_count > 0
                        ? `${Math.round((proxy.success_count / (proxy.success_count + proxy.failure_count)) * 100)}%`
                        : 'N/A'}
                    </td>
                    <td className="px-3 py-2 text-right text-[#F4F1FF]">{proxy.success_count + proxy.failure_count}</td>
                    <td className="px-3 py-2 text-right text-[#F4F1FF]">{Math.round(proxy.response_time_avg_ms)}ms</td>
                    <td className="px-3 py-2 text-right text-[#9F9AB5]">{formatTime(proxy.last_success)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {activeProxies.length > 50 && (
            <div className="border-t border-white/5 p-3 text-center text-[10px] text-[#6E6A88]">
              Showing first 50 of {activeProxies.length} active proxies
            </div>
          )}
          {activeProxies.length === 0 && (
            <p className="p-4 text-center text-sm text-[#6E6A88]">No active proxies available</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProxyMonitorPage
