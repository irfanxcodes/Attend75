import { Check, Mail } from 'lucide-react'

function DayDetailCard({
  displayDate,
  attendanceItems,
  emptyMessage = 'No classes on this day',
  onMailFaculty,
  getMailFacultyStatus,
  onConfirmMailSent,
  onMarkMailNotYet,
}) {
  const totalClasses = attendanceItems.length
  const attendedClasses = attendanceItems.filter((entry) => entry.status === 'Present').length

  // Get day of week
  const dayOfWeek = (() => {
    try {
      const currentYear = new Date().getFullYear()
      const parsed = new Date(`${displayDate} ${currentYear}`)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-US', { weekday: 'long' })
      }
    } catch {
      // fallback
    }
    return ''
  })()

  if (!totalClasses) {
    return (
      <div className="rounded-2xl bg-[#4A466A] p-4 text-center text-sm font-medium text-[#D8D4E7] ring-1 ring-white/5">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[#4A466A] p-4 ring-1 ring-white/5 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-lg font-bold text-[#F7F4FF]">{dayOfWeek}</h3>
          <span className="text-sm font-medium text-[#9F9AB5]">{displayDate}</span>
        </div>
        <span className="rounded-full bg-[#4EF0A0]/15 px-2.5 py-1 text-[11px] font-bold text-[#4EF0A0]">
          {attendedClasses} PRESENT
        </span>
      </div>

      {/* Timeline list */}
      <div className="mt-4 space-y-2">
        {attendanceItems.map((entry, index) => {
          const isPresent = entry.status === 'Present'
          const mailStatus = !isPresent && typeof getMailFacultyStatus === 'function'
            ? getMailFacultyStatus(entry)
            : 'default'
          const isAlreadySent = mailStatus === 'send_confirmed'
          const isPendingConfirmation = mailStatus === 'pending_confirmation'

          const borderColor = isPresent ? 'border-l-[#4EF0A0]' : 'border-l-[#FF5B5B]'

          return (
            <article
              key={`${entry.code || entry.subject}-${index}`}
              className={`flex items-center gap-4 rounded-xl border-l-[3px] ${borderColor} bg-[#565275] px-4 py-3 transition-all duration-200 hover:bg-[#5D5880]`}
            >
              {/* Subject info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#F7F4FF]">
                    {entry.subject || entry.code || 'Subject'}
                  </span>
                </div>
              </div>

              {/* Status + Action */}
              <div className="flex shrink-0 items-center gap-2">
                {isPresent ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-[#4EF0A0]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4EF0A0]" />
                    Present
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-1 text-xs font-semibold text-[#FF5B5B]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#FF5B5B]" />
                      Absent
                    </span>

                    {isPendingConfirmation ? (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => onConfirmMailSent?.(entry)}
                          className="flex items-center gap-1 rounded-full border border-[#4EF0A0]/40 bg-[#4EF0A0]/10 px-2 py-0.5 text-[10px] font-semibold text-[#4EF0A0] transition hover:bg-[#4EF0A0]/20"
                        >
                          <Check className="h-3 w-3" strokeWidth={2.5} />
                          Sent
                        </button>
                        <button
                          type="button"
                          onClick={() => onMarkMailNotYet?.(entry)}
                          className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-[#9F9AB5] transition hover:bg-white/10"
                        >
                          Not yet
                        </button>
                      </div>
                    ) : isAlreadySent ? (
                      <span className="ml-2 flex items-center gap-1 text-[11px] font-semibold text-[#9F9AB5]">
                        <Check className="h-3 w-3 text-[#4EF0A0]" strokeWidth={2.5} />
                        Mailed
                      </span>
                    ) : onMailFaculty ? (
                      <button
                        type="button"
                        onClick={() => onMailFaculty(entry)}
                        className="ml-2 flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#D8D4E7] transition hover:border-[#FF916C]/40 hover:bg-[#FF916C]/10 hover:text-[#FF916C]"
                      >
                        <Mail className="h-3 w-3" strokeWidth={2} />
                        Mail
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default DayDetailCard
