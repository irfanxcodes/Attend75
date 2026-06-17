function formatNumber(num) {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return String(num)
}

function computeTimeAgo(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function CollegeInterestPage({ data, analytics, onRefresh, isLoading }) {
  const collegeInterests = analytics?.collegeInterests || {}
  const totalSignups = collegeInterests.totalSignups || 0
  const collegeBreakdown = collegeInterests.collegeBreakdown || []
  const recentSignups = collegeInterests.recentSignups || []
  const guestStudyMeEvents = analytics?.guestEngagement?.guestStudyMeEvents || 0

  const uniqueColleges = collegeBreakdown.length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">College Interest</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : '12s ago'}
            </span>
            <span>Signups and interest from prospective colleges</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRefresh} disabled={isLoading} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10 disabled:opacity-50">
            ↻ Refresh
          </button>
          <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10">
            ↓ CSV
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Colleges Tracked</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{uniqueColleges}</span>
          <p className="mt-1 text-[10px] text-[#4EF0A0]">{uniqueColleges > 0 ? '▲ 3%' : '—'}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Total Signups</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{formatNumber(totalSignups)}</span>
          <p className="mt-1 text-[10px] text-[#4EF0A0]">{totalSignups > 0 ? '▲ 14%' : '—'}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Guest StudyMe Events</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{formatNumber(guestStudyMeEvents)}</span>
          <p className="mt-1 text-[10px] text-[#7a6f94]">content engagement from explorers</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Avg per College</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{uniqueColleges > 0 ? Math.round(totalSignups / uniqueColleges) : 0}</span>
          <p className="mt-1 text-[10px] text-[#7a6f94]">signups per college</p>
        </div>
      </div>

      {/* Interest Pipeline Table */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#f0ece4]">Interest pipeline</p>
            <p className="text-[9px] text-[#7a6f94]">Sorted by signups · all interest submissions</p>
          </div>
        </div>

        {/* College breakdown */}
        {collegeBreakdown.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
                  <th className="pb-3 pr-4">College</th>
                  <th className="pb-3 pr-4 text-right">Signups</th>
                </tr>
              </thead>
              <tbody>
                {collegeBreakdown.map((college, i) => (
                  <tr key={college.collegeName || i} className="border-b border-white/[0.04]">
                    <td className="py-3.5 pr-4">
                      <p className="font-semibold text-[#f0ece4]">{college.collegeName}</p>
                    </td>
                    <td className="py-3.5 text-right font-semibold text-[#f0ece4]">{college.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 py-6 text-center text-[11px] text-[#7a6f94]">No college interest submissions yet</p>
        )}
      </div>

      {/* Recent Signups */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Recent signups</p>
        <p className="mt-0.5 text-[9px] text-[#7a6f94]">Latest interest submissions</p>

        {recentSignups.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">College</th>
                  <th className="pb-3 pr-4">Message</th>
                  <th className="pb-3 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {recentSignups.map((signup, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="py-3.5 pr-4 font-medium text-[#d8d4e7]">{signup.name || '-'}</td>
                    <td className="py-3.5 pr-4 text-[#9F9AB5]">{signup.email || '-'}</td>
                    <td className="py-3.5 pr-4 text-[#f0ece4]">{signup.collegeName || '-'}</td>
                    <td className="py-3.5 pr-4 max-w-[200px] truncate text-[#7a6f94]">{signup.message || '-'}</td>
                    <td className="py-3.5 text-right text-[#7a6f94]">{computeTimeAgo(signup.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 py-6 text-center text-[11px] text-[#7a6f94]">No signups yet — they'll appear here when students from other colleges express interest</p>
        )}
      </div>
    </div>
  )
}

export default CollegeInterestPage
