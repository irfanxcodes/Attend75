import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendanceHistory, isSessionExpiredError } from '../services/attendanceApi'

function formatDateKey(year, monthIndex, day) {
  const paddedMonth = String(monthIndex + 1).padStart(2, '0')
  const paddedDay = String(day).padStart(2, '0')
  return `${year}-${paddedMonth}-${paddedDay}`
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function isFutureDateKey(dateKey) {
  const today = new Date()
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate())
  return dateKey > todayKey
}

function normalizeCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function buildCalendarCells(currentDate) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const leadingEmpty = Array.from({ length: firstWeekday }, (_, index) => ({
    id: `empty-${index}`,
    day: null,
  }))

  const monthDays = Array.from({ length: daysInMonth }, (_, index) => ({
    id: `day-${index + 1}`,
    day: index + 1,
  }))

  return [...leadingEmpty, ...monthDays]
}

function HistoryPage() {
  const navigate = useNavigate()
  const {
    state: { session, attendance },
    actions,
  } = useAppStore()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [historyBySemesterDate, setHistoryBySemesterDate] = useState({})
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')
  
  const effectiveSemesterId = useMemo(() => {
    const savedSemester = window.localStorage.getItem('attend75.selectedSemester')
    const isValidSaved = savedSemester && session.semesters.some((s) => s.id === savedSemester)
    return isValidSaved ? savedSemester : session.selectedSemester || 'default'
  }, [session.selectedSemester, session.semesters])
  
  const semesterCacheKey = String(effectiveSemesterId)

  useEffect(() => {
    setHistoryBySemesterDate({})
    setSelectedDate(null)
  }, [session.selectedSemester])

  const subjectAbbreviationByCode = useMemo(() => {
    const map = {}
    const subjects = Array.isArray(attendance?.subjects) ? attendance.subjects : []

    subjects.forEach((subject) => {
      const codeKey = normalizeCode(subject?.id)
      const shortName = String(subject?.shortName || '').trim()
      if (codeKey && shortName) {
        map[codeKey] = shortName
      }
    })

    return map
  }, [attendance?.subjects])

  const handlePreviousMonth = () => {
    setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))
  }

  const handleResetToToday = async () => {
    const today = new Date()
    const todayDay = today.getDate()

    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(todayDay)
    await handleSelectDate(todayDay, today)
  }

  const handleSelectDate = async (day, overrideDate = null) => {
    setSelectedDate(day)
    setHistoryError('')

    const sourceDate = overrideDate || currentDate
    const year = sourceDate.getFullYear()
    const month = sourceDate.getMonth()
    const dateKey = formatDateKey(year, month, day)
    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}

    if (semesterHistory[dateKey]) {
      return
    }

    try {
      setIsLoadingHistory(true)
      const result = await fetchAttendanceHistory({
        token: session.token,
        semesterId: effectiveSemesterId,
        date: dateKey,
      })

      const normalizedEntries = (result.entries || []).map((entry) => {
        const codeKey = normalizeCode(entry?.code)
        const abbreviation = subjectAbbreviationByCode[codeKey]

        return {
          ...entry,
          subject: abbreviation || entry.subject,
        }
      })

      setHistoryBySemesterDate((current) => {
        const currentSemesterHistory = current[semesterCacheKey] || {}
        return {
          ...current,
          [semesterCacheKey]: {
            ...currentSemesterHistory,
            [dateKey]: normalizedEntries,
          },
        }
      })
    } catch (error) {
      if (isSessionExpiredError(error)) {
        actions.logout()
        window.localStorage.removeItem('attend75.selectedSemester')
        navigate('/login', { replace: true })
        return
      }
      setHistoryError(error.message)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const { selectedDateKey, selectedItems, selectedDayInfo, isFutureSelectedDate } = useMemo(() => {
    if (!selectedDate) {
      return {
        selectedDateKey: null,
        selectedItems: [],
        selectedDayInfo: null,
        isFutureSelectedDate: false,
      }
    }

    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const hasDateInCurrentMonth = selectedDate <= daysInMonth

    if (!hasDateInCurrentMonth) {
      return {
        selectedDateKey: null,
        selectedItems: [],
        selectedDayInfo: null,
        isFutureSelectedDate: false,
      }
    }

    const dateKey = formatDateKey(year, month, selectedDate)
    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}
    const dateObj = new Date(year, month, selectedDate)
    
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' })
    const displayDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

    return {
      selectedDateKey: dateKey,
      selectedItems: semesterHistory[dateKey] || [],
      selectedDayInfo: { dayOfWeek, displayDate, dateObj },
      isFutureSelectedDate: isFutureDateKey(dateKey),
    }
  }, [currentDate, historyBySemesterDate, selectedDate, semesterCacheKey])

  const monthLabel = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  const cells = buildCalendarCells(currentDate)
  const today = new Date()
  const isCurrentMonth = currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth()
  const todayDay = isCurrentMonth ? today.getDate() : null

  // Calculate stats for selected date
  const dayStats = useMemo(() => {
    if (!selectedItems.length) return null
    const present = selectedItems.filter(i => i.status === 'Present').length
    const absent = selectedItems.length - present
    return { present, absent, total: selectedItems.length }
  }, [selectedItems])

  return (
    <section className="space-y-4 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#F7F4FF]">History</h1>
        <p className="mt-1 text-sm text-[#9F9AB5]">Track your daily attendance from the calendar</p>
      </div>

      {/* Calendar Card */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#4A466A] to-[#3D3660] p-4 shadow-lg ring-1 ring-white/10">
        {/* Month Navigation */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreviousMonth}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#D8D4E7] transition-all hover:bg-white/10 active:scale-95"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#FF916C]" strokeWidth={2} />
              <h2 className="text-base font-bold text-[#F7F4FF]">{monthLabel}</h2>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#D8D4E7] transition-all hover:bg-white/10 active:scale-95"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetToToday}
            className="rounded-full bg-[#FF916C]/15 px-3 py-1.5 text-xs font-semibold text-[#FF916C] transition-all hover:bg-[#FF916C]/25 active:scale-95"
          >
            Today
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((day) => (
            <div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-[#9F9AB5]">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            if (!cell.day) {
              return <div key={cell.id} className="h-10" aria-hidden="true" />
            }

            const isSelected = selectedDate === cell.day
            const isToday = todayDay === cell.day

            return (
              <button
                key={cell.id}
                type="button"
                onClick={() => handleSelectDate(cell.day)}
                className={`relative h-10 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#FF916C] text-[#1D183E] shadow-lg shadow-[#FF916C]/25 scale-105'
                    : isToday
                      ? 'bg-[#4EF0A0]/15 text-[#4EF0A0] ring-1 ring-[#4EF0A0]/30'
                      : 'text-[#D8D4E7] hover:bg-white/5 active:scale-95'
                }`}
              >
                {cell.day}
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#4EF0A0]" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Error State */}
      {historyError && (
        <div className="rounded-xl border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 px-4 py-3 text-sm text-[#FF5B5B]">
          {historyError}
        </div>
      )}

      {/* Loading State */}
      {isLoadingHistory && selectedDateKey && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-[#3D3660] px-4 py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
          <span className="text-sm text-[#9F9AB5]">Loading attendance...</span>
        </div>
      )}

      {/* Day Detail */}
      {selectedDateKey && !isLoadingHistory && selectedDayInfo && (
        <div className="space-y-3">
          {/* Day Header with Stats */}
          {selectedItems.length > 0 ? (
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#4A466A] to-[#3D3660] p-4 shadow-lg ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-[#F7F4FF]">{selectedDayInfo.dayOfWeek}</h3>
                  <p className="mt-0.5 text-sm text-[#9F9AB5]">{selectedDayInfo.displayDate}</p>
                </div>
                {dayStats && (
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 rounded-full bg-[#4EF0A0]/15 px-3 py-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-[#4EF0A0]" strokeWidth={2.5} />
                      <span className="text-xs font-bold text-[#4EF0A0]">{dayStats.present}</span>
                    </div>
                    {dayStats.absent > 0 && (
                      <div className="flex items-center gap-1.5 rounded-full bg-[#FF5B5B]/15 px-3 py-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-[#FF5B5B]" strokeWidth={2.5} />
                        <span className="text-xs font-bold text-[#FF5B5B]">{dayStats.absent}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Classes List */}
              <div className="mt-4 space-y-2">
                {selectedItems.map((entry, index) => {
                  const isPresent = entry.status === 'Present'
                  const statusColor = isPresent ? '#4EF0A0' : '#FF5B5B'
                  
                  return (
                    <div
                      key={`${entry.code || entry.subject}-${index}`}
                      className="flex items-center gap-3 rounded-xl bg-[#302A52]/60 px-4 py-3 transition-all hover:bg-[#302A52]"
                    >
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: statusColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#F7F4FF]">
                          {entry.subject || entry.code || 'Subject'}
                        </p>
                      </div>
                      <div
                        className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
                        style={{
                          backgroundColor: `${statusColor}15`,
                          color: statusColor,
                        }}
                      >
                        {isPresent ? 'Present' : 'Absent'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#3D3660] px-4 py-12">
              <div className="rounded-full bg-[#4EF0A0]/15 p-4">
                <Calendar className="h-8 w-8 text-[#4EF0A0]" strokeWidth={2} />
              </div>
              <p className="text-sm font-medium text-[#9F9AB5]">
                {isFutureSelectedDate ? 'Yet to attend' : 'No classes on this day 🎉'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default HistoryPage
