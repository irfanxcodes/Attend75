function DayDetailCard({ displayDate, attendanceItems, emptyMessage = 'No classes on this day' }) {
  const totalClasses = attendanceItems.length
  const attendedClasses = attendanceItems.filter((entry) => entry.status === 'Present').length
  const percentage = totalClasses ? Math.round((attendedClasses / totalClasses) * 100) : 0

  if (!totalClasses) {
    return (
      <div className="rounded-2xl bg-[#5B5485] p-4 text-center text-sm font-medium text-[#D8D3E8] shadow-sm sm:p-5">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[#5B5485] p-4 text-[#F4F1FF] shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white sm:text-xl">{displayDate}</h3>
          <p className="mt-1 text-xs text-[#D8D3E8] sm:text-sm">
            {attendedClasses} of {totalClasses} classes attended
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:mt-5 sm:gap-3 md:grid-cols-3">
        {attendanceItems.map((entry, index) => {
          const isPresent = entry.status === 'Present'

          return (
            <span
              key={`${entry.subject}-${index}`}
              className={`rounded-full px-3 py-2 text-center text-xs font-semibold capitalize sm:text-sm ${
                isPresent ? 'bg-[#38A169] text-[#FFFFFF]': 'bg-[#C53030] text-[#FFFFFF]'
              }`}
            >
              {entry.subject}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default DayDetailCard
