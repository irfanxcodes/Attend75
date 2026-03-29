function DayDetailCard({ displayDate, attendanceItems, emptyMessage = 'No classes on this day' }) {
  const totalClasses = attendanceItems.length
  const attendedClasses = attendanceItems.filter((entry) => entry.status === 'Present').length
  const percentage = totalClasses ? Math.round((attendedClasses / totalClasses) * 100) : 0

  if (!totalClasses) {
    return (
      <div className="rounded-2xl bg-[#5B5485] p-5 text-center text-sm font-medium text-[#D8D3E8] shadow-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[#5B5485] p-5 text-[#F4F1FF] shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-white">{displayDate}</h3>
          <p className="mt-1 text-sm text-[#D8D3E8]">
            {attendedClasses} of {totalClasses} classes attended
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {attendanceItems.map((entry, index) => {
          const isPresent = entry.status === 'Present'

          return (
            <span
              key={`${entry.subject}-${index}`}
              className={`rounded-full px-3 py-2 text-center text-sm font-semibold capitalize ${
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
