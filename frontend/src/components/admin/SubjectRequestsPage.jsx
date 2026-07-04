function formatNumber(num) {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return String(num)
}

function SubjectRequestsPage({ analytics, onRefresh, isLoading }) {
  const subjectRequests = analytics?.subjectRequests || {}
  const totalRequests = subjectRequests.totalRequests || 0
  const uniqueRequesters = subjectRequests.uniqueRequesters || 0
  const demandBoard = subjectRequests.demandBoard || []

  // Calculate avg votes per request
  const avgVotes = demandBoard.length > 0
    ? Math.round(demandBoard.reduce((s, d) => s + d.requestCount, 0) / demandBoard.length)
    : 0

  // Group by semester (derived from subject code - first digit of last 3 chars)
  function getSemester(code) {
    if (!code) return 'Unknown'
    const match = code.match(/(\d)\d{2}$/)
    if (match) return `Semester ${match[1]}`
    return 'Unknown'
  }

  // Group by semester, also track program per semester column
  const semesterGroups = {}
  for (const subject of demandBoard) {
    const sem = getSemester(subject.subjectCode)
    if (!semesterGroups[sem]) semesterGroups[sem] = { subjects: [], programs: [] }
    semesterGroups[sem].subjects.push(subject)
    if (subject.program && !semesterGroups[sem].programs.includes(subject.program)) {
      semesterGroups[sem].programs.push(subject.program)
    }
  }

  const sortedSemesters = Object.keys(semesterGroups).sort()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Subject Request Board</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : '12s ago'}
            </span>
            <span>Roadmap prioritization for user-requested StudyMe content</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRefresh} disabled={isLoading} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10 disabled:opacity-50">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Open Requests</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{totalRequests}</span>
          <p className="mt-1 text-[10px] text-[#4EF0A0]">▲ {totalRequests > 0 ? '12' : '0'}%</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Unique Requesters</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{uniqueRequesters}</span>
          <p className="mt-1 text-[10px] text-[#7a6f94]">students asking for content</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Avg Votes / Subject</p>
          <span className="mt-2 block text-[28px] font-bold text-[#f0ece4]">{avgVotes}</span>
          <p className="mt-1 text-[10px] text-[#7a6f94]">demand signal per subject</p>
        </div>
      </div>

      {/* Kanban columns by semester */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {sortedSemesters.map((sem) => {
          const { subjects, programs } = semesterGroups[sem]
          const semColors = {
            'Semester 1': '#6CB4FF',
            'Semester 2': '#FF916C',
            'Semester 3': '#FFB23E',
            'Semester 4': '#4EF0A0',
            'Semester 5': '#A78BFA',
            'Semester 6': '#F472B6',
            'Unknown': '#7a6f94',
          }
          const color = semColors[sem] || '#7a6f94'

          return (
            <div key={sem} className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-4">
              {/* Column header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#d8d4e7]">{sem}</span>
                </div>
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[10px] font-semibold text-[#7a6f94]">{subjects.length}</span>
              </div>
              {/* Program tags under semester heading */}
              {programs.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {programs.map((prog) => (
                    <span key={prog} className="rounded-full bg-[#6CB4FF]/10 px-2 py-0.5 text-[8px] font-semibold text-[#6CB4FF]">{prog}</span>
                  ))}
                </div>
              ) : null}

              {/* Subject cards */}
              <div className="mt-4 space-y-3">
                {subjects.map((subject) => {
                  // subjectName in DB currently stores the abbreviation; subjectCode is the portal code
                  const displayTitle = subject.subjectName || subject.abbreviation || subject.subjectCode
                  const displayCode = subject.subjectCode
                  return (
                    <div key={subject.subjectCode} className="rounded-xl border border-white/[0.06] bg-[#1e1932] p-3.5">
                      <div className="flex items-start justify-between">
                        <p className="text-[13px] font-semibold text-[#f0ece4]">{displayTitle}</p>
                        <button type="button" className="text-[#7a6f94] hover:text-[#d8d4e7]">···</button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[12px] text-[#FFB23E]">★</span>
                        <span className="text-[12px] font-semibold text-[#FFB23E]">{subject.requestCount}</span>
                        <span className="text-[10px] text-[#7a6f94]">·</span>
                        <span className="text-[10px] text-[#7a6f94]">{displayCode}</span>
                      </div>
                      {/* Requesters: name above roll number */}
                      {subject.requesters?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {subject.requesters.map((r, idx) => (
                            <div key={idx} className="rounded bg-white/5 px-1.5 py-1">
                              {r.name ? (
                                <p className="text-[8px] font-semibold text-[#d8d4e7] leading-tight">{r.name}</p>
                              ) : null}
                              <p className="text-[7px] text-[#7a6f94] leading-tight">{r.roll || r}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {!sortedSemesters.length ? (
          <div className="col-span-full rounded-2xl border border-white/[0.06] bg-[#2a2440] p-8 text-center">
            <p className="text-[11px] text-[#7a6f94]">No subject requests yet</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default SubjectRequestsPage
