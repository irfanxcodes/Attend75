import { useMemo, useState } from 'react'
import CalendarGrid from '../components/history/CalendarGrid'
import CalendarHeader from '../components/history/CalendarHeader'
import DayDetailCard from '../components/history/DayDetailCard'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendanceHistory } from '../services/attendanceApi'

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

function normalizeCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

function HistoryPage() {
  const {
    state: { session, attendance },
  } = useAppStore()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [historyByDate, setHistoryByDate] = useState({})
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')

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

  const handleSelectDate = async (day) => {
    setSelectedDate(day)
    setHistoryError('')

    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const dateKey = formatDateKey(year, month, day)

    if (historyByDate[dateKey]) {
      return
    }

    if (!session.token) {
      setHistoryError('Session expired. Please login again.')
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

      setHistoryByDate((current) => ({
        ...current,
        [dateKey]: normalizedEntries,
      }))
    } catch (error) {
      setHistoryError(error.message)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const { selectedDateKey, selectedItems, selectedDisplayDate } = useMemo(() => {
    if (!selectedDate) {
      return {
        selectedDateKey: null,
        selectedItems: [],
        selectedDisplayDate: '',
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
      }
    }

    const dateKey = formatDateKey(year, month, selectedDate)

    return {
      selectedDateKey: dateKey,
      selectedItems: historyByDate[dateKey] || [],
      selectedDisplayDate: formatDisplayDate(year, month, selectedDate),
    }
  }, [currentDate, historyByDate, selectedDate])

  return (
    <section className="space-y-4 pb-2">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-[#E7DEDE]">History</h1>
        <p className="mt-1 text-sm text-[#CFC5E8]">View your day-wise attendance from calendar dates.</p>
      </header>

      <div className="space-y-3 rounded-3xl bg-[#4F487A] p-4 shadow-md ring-1 ring-white/5">
        <CalendarHeader
          currentDate={currentDate}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
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
          <DayDetailCard displayDate={selectedDisplayDate} attendanceItems={selectedItems} />
        ) : null}
      </div>
    </section>
  )
}

export default HistoryPage
