import { useMemo, useState } from 'react'
import CalendarGrid from '../components/history/CalendarGrid'
import CalendarHeader from '../components/history/CalendarHeader'
import DayDetailCard from '../components/history/DayDetailCard'

const SAMPLE_ATTENDANCE_DATA = {
  '2026-03-12': [
    { subject: 'eng', status: 'Present' },
    { subject: 'sci', status: 'Present' },
    { subject: 'math', status: 'Present' },
    { subject: 'soc', status: 'Present' },
    { subject: 'hindi', status: 'Present' },
    { subject: 'yoga', status: 'Absent' },
  ],
  '2026-03-10': [{ subject: 'math', status: 'Absent' }],
}

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

function HistoryPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1))
  const [selectedDate, setSelectedDate] = useState(null)
  const [attendanceData] = useState(SAMPLE_ATTENDANCE_DATA)

  const handlePreviousMonth = () => {
    setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))
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
      selectedItems: attendanceData[dateKey] || [],
      selectedDisplayDate: formatDisplayDate(year, month, selectedDate),
    }
  }, [attendanceData, currentDate, selectedDate])

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
          onSelectDate={setSelectedDate}
        />

        {selectedDateKey ? <DayDetailCard displayDate={selectedDisplayDate} attendanceItems={selectedItems} /> : null}
      </div>
    </section>
  )
}

export default HistoryPage
