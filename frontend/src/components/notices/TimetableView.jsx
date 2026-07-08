import { useEffect, useState } from 'react'
import { Calendar, Clock, MapPin, User } from 'lucide-react'
import { fetchTimetable } from '../../services/noticesApi'

const DAY_COLORS = {
  Monday: '#FF916C',
  Tuesday: '#6CB4FF',
  Wednesday: '#4EF0A0',
  Thursday: '#A78BFA',
  Friday: '#FFB23E',
  Saturday: '#F472B6',
}

function TimetableView({ token }) {
  const [timetable, setTimetable] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeDay, setActiveDay] = useState(null)

  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    fetchTimetable({ token })
      .then((data) => {
        if (data && data.schedule) {
          setTimetable(data)
          // Default to today's day
          const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
          if (data.schedule[today]) {
            setActiveDay(today)
          } else {
            const days = Object.keys(data.schedule)
            setActiveDay(days[0] || null)
          }
        } else {
          setTimetable(null)
        }
      })
      .catch(() => setTimetable(null))
      .finally(() => setIsLoading(false))
  }, [token])

  if (isLoading) {
    return (
      <div className="mt-6 rounded-2xl bg-[#2E2A3A] p-6 text-center ring-1 ring-white/5">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
        <p className="mt-2 text-[11px] text-[#9F9AB5]">Loading timetable...</p>
      </div>
    )
  }

  if (!timetable || !timetable.schedule) {
    return null // No timetable available — don't show anything
  }

  const days = Object.keys(timetable.schedule)
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const classes = activeDay ? timetable.schedule[activeDay] || [] : []

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-lg font-bold text-[#F7F4FF]">My Timetable</h2>
          <p className="mt-0.5 text-[10px] text-[#9F9AB5]">{timetable.noticeTitle?.slice(0, 50)}{timetable.noticeTitle?.length > 50 ? '...' : ''}</p>
        </div>
        <span className="rounded-full bg-[#FF916C]/15 px-2.5 py-1 text-[9px] font-bold text-[#FF916C]">
          {timetable.totalClasses} classes/week
        </span>
      </div>

      {/* Day selector pills */}
      <div className="mt-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {days.map((day) => {
          const isActive = day === activeDay
          const isToday = day === todayName
          const color = DAY_COLORS[day] || '#9F9AB5'
          return (
            <button
              key={day}
              type="button"
              onClick={() => setActiveDay(day)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-semibold transition ${
                isActive
                  ? 'text-[#1D183E] shadow-lg'
                  : 'bg-white/5 text-[#9F9AB5] hover:bg-white/10'
              }`}
              style={isActive ? { backgroundColor: color } : undefined}
            >
              {isToday && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              {day.slice(0, 3)}
              <span className="text-[9px] opacity-70">({timetable.schedule[day]?.length || 0})</span>
            </button>
          )
        })}
      </div>

      {/* Classes for selected day */}
      <div className="mt-3 space-y-2.5 px-1">
        {classes.length > 0 ? (
          classes.map((cls, i) => {
            const color = DAY_COLORS[activeDay] || '#9F9AB5'
            return (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#2E2A3A] ring-1 ring-white/5"
              >
                {/* Color accent bar */}
                <div className="h-1" style={{ backgroundColor: color }} />
                <div className="p-4">
                  {/* Subject + Section */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-bold text-[#F7F4FF]">{cls.course}</h3>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-[#9F9AB5]">
                      Sec {cls.section}
                    </span>
                  </div>

                  {/* Details grid */}
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {cls.time && (
                      <div className="flex items-center gap-2 text-[11px] text-[#9F9AB5]">
                        <Clock className="h-3.5 w-3.5 text-white/30" />
                        <span>{cls.time}</span>
                      </div>
                    )}
                    {cls.room && (
                      <div className="flex items-center gap-2 text-[11px] text-[#9F9AB5]">
                        <MapPin className="h-3.5 w-3.5 text-white/30" />
                        <span>{cls.room}</span>
                      </div>
                    )}
                    {cls.faculty && (
                      <div className="col-span-2 flex items-center gap-2 text-[11px] text-[#9F9AB5]">
                        <User className="h-3.5 w-3.5 text-white/30" />
                        <span>{cls.faculty}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-2xl bg-[#2E2A3A] py-8 text-center ring-1 ring-white/5">
            <p className="text-sm text-[#9F9AB5]">No classes on {activeDay}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default TimetableView
