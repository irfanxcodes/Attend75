import { useMemo } from 'react'

function HistorySidebar({ subjects, overallPercentage, currentStreak }) {
  // Calculate present/absent counts from subjects data
  const stats = useMemo(() => {
    if (!Array.isArray(subjects) || subjects.length === 0) {
      return { present: 0, absent: 0, total: 0 }
    }
    const totalAttended = subjects.reduce((sum, s) => sum + (Number(s.attendedClasses) || 0), 0)
    const totalConducted = subjects.reduce((sum, s) => sum + (Number(s.totalClasses) || 0), 0)
    const totalAbsent = totalConducted - totalAttended
    return { present: totalAttended, absent: Math.max(0, totalAbsent), total: totalConducted }
  }, [subjects])

  // Most missed subjects (top 3 by absence count)
  const mostMissed = useMemo(() => {
    if (!Array.isArray(subjects) || subjects.length === 0) return []
    return subjects
      .map((s) => ({
        name: s.shortName || s.id?.toUpperCase() || s.name?.slice(0, 5).toUpperCase() || '?',
        absents: Math.max(0, (Number(s.totalClasses) || 0) - (Number(s.attendedClasses) || 0)),
        percentage: Number(s.percentage) || 0,
      }))
      .filter((s) => s.absents > 0)
      .sort((a, b) => b.absents - a.absents)
      .slice(0, 3)
  }, [subjects])

  // SVG ring chart values
  const bounded = Math.max(0, Math.min(100, overallPercentage || 0))
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (bounded / 100) * circumference
  const ringColor = bounded > 75 ? '#4EF0A0' : bounded >= 60 ? '#FFB23E' : '#FF5B5B'

  // Bar widths for present/absent
  const maxCount = Math.max(stats.present, stats.absent, 1)
  const presentBarWidth = `${Math.round((stats.present / maxCount) * 100)}%`
  const absentBarWidth = `${Math.round((stats.absent / maxCount) * 100)}%`

  return (
    <div className="space-y-3">
      {/* Attendance overview card */}
      <div className="rounded-2xl bg-[#4A466A] p-4 ring-1 ring-white/5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">
          This Semester
        </p>

        {/* Ring chart */}
        <div className="mt-3 flex items-center gap-4">
          <div className="relative h-[90px] w-[90px] shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="40" stroke="#302A52" strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r="40"
                stroke={ringColor}
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold leading-none" style={{ color: ringColor }}>{bounded}%</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-[#D8D4E7]">attendance</p>
            <p className="mt-0.5 text-[10px] text-[#9F9AB5]">target · 75%</p>
          </div>
        </div>

        {/* Present / Absent bars */}
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-[#D8D4E7]">Present</span>
            <div className="flex flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#302A52]">
                <div className="h-full rounded-full bg-[#4EF0A0] transition-all duration-500" style={{ width: presentBarWidth }} />
              </div>
              <span className="w-7 text-right text-[11px] font-bold text-[#4EF0A0]">{stats.present}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-[#D8D4E7]">Absent</span>
            <div className="flex flex-1 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#302A52]">
                <div className="h-full rounded-full bg-[#FF5B5B] transition-all duration-500" style={{ width: absentBarWidth }} />
              </div>
              <span className="w-7 text-right text-[11px] font-bold text-[#FF5B5B]">{stats.absent}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Most missed card */}
      {mostMissed.length > 0 ? (
        <div className="rounded-2xl bg-[#4A466A] p-4 ring-1 ring-white/5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#F7F4FF]">Most missed</p>
            <span className="text-[10px] text-[#9F9AB5]">this semester</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {mostMissed.map((item) => {
              const barColor = item.percentage > 75 ? '#4EF0A0' : item.percentage >= 60 ? '#FFB23E' : '#FF5B5B'
              return (
                <div key={item.name} className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: barColor }} />
                  <span className="w-12 shrink-0 text-[11px] font-bold text-[#F7F4FF]">{item.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#302A52]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (item.absents / (maxCount || 1)) * 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-[#9F9AB5]">{item.absents} absent</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Current streak card */}
      <div className="rounded-2xl bg-[#4A466A] p-4 ring-1 ring-white/5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Current Streak</p>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold leading-none text-[#F7F4FF]">{currentStreak}</span>
          <span className="text-xs font-medium text-[#9F9AB5]">days fully attended</span>
        </div>
      </div>
    </div>
  )
}

export default HistorySidebar
