import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CalendarGrid from '../components/history/CalendarGrid'
import CalendarHeader from '../components/history/CalendarHeader'
import DayDetailCard from '../components/history/DayDetailCard'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendanceHistory, isSessionExpiredError } from '../services/attendanceApi'

function formatDateKey(year, monthIndex, day) {
  const paddedMonth = String(monthIndex + 1).padStart(2, '0')
  const paddedDay = String(day).padStart(2, '0')
  return `${year}-${paddedMonth}-${paddedDay}`
}

function formatDisplayDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day).toLocaleDateString('default', {
    month: 'long',
    day: 'numeric',
  })
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
  const semesterCacheKey = String(session.selectedSemester || 'default')

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

    if (!session.token) {
      actions.logout()
      window.localStorage.removeItem('attend75.selectedSemester')
      navigate('/login', { replace: true })
      return
    }

    try {
      setIsLoadingHistory(true)
      const result = await fetchAttendanceHistory({
        token: session.token,
        semesterId: session.selectedSemester,
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

  const { selectedDateKey, selectedItems, selectedDisplayDate, isFutureSelectedDate } = useMemo(() => {
    if (!selectedDate) {
      return {
        selectedDateKey: null,
        selectedItems: [],
        selectedDisplayDate: '',
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
        selectedDisplayDate: '',
        isFutureSelectedDate: false,
      }
    }

    const dateKey = formatDateKey(year, month, selectedDate)

    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}

    return {
      selectedDateKey: dateKey,
      selectedItems: semesterHistory[dateKey] || [],
      selectedDisplayDate: formatDisplayDate(year, month, selectedDate),
      isFutureSelectedDate: isFutureDateKey(dateKey),
    }
  }, [currentDate, historyBySemesterDate, selectedDate, semesterCacheKey])

  return (
    <section className="space-y-3 pb-2 sm:space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">History</h1>
        <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">View your day-wise attendance from calendar dates.</p>
        <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">select the semster you want to check.</p>
      </header>

      <div className="space-y-3 rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
        <CalendarHeader
          currentDate={currentDate}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onResetToToday={handleResetToToday}
        />

        <CalendarGrid
          currentDate={currentDate}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />

        {historyError ? (
          <div className="rounded-lg border border-[#F87171]/40 bg-[#7F1D1D]/20 px-3 py-2 text-sm text-[#FECACA]">
            {historyError}
          </div>
        ) : null}

        {isLoadingHistory && selectedDateKey ? (
          <div className="rounded-lg bg-[#5B5485] px-3 py-2 text-sm text-[#D8D3E8]">Loading attendance history...</div>
        ) : null}

        {selectedDateKey && !isLoadingHistory ? (
          <DayDetailCard
            displayDate={selectedDisplayDate}
            attendanceItems={selectedItems}
            emptyMessage={isFutureSelectedDate ? 'Yet to attend' : 'No classes on this day 🎉'}
          />
        ) : null}
      </div>
    </section>
  )
}

export default HistoryPage
