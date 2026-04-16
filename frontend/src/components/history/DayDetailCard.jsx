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

      <div className="mt-4 grid grid-cols-1 items-start gap-2 min-[360px]:grid-cols-2 sm:mt-5 sm:gap-3 md:grid-cols-3">
        {attendanceItems.map((entry, index) => {
          const isPresent = entry.status === 'Present'
          const mailStatus = !isPresent && typeof getMailFacultyStatus === 'function'
            ? getMailFacultyStatus(entry)
            : 'default'
          const isAlreadySent = mailStatus === 'send_confirmed'
          const isPendingConfirmation = mailStatus === 'pending_confirmation'
          const cardClassName = isPresent
            ? 'self-start rounded-2xl px-3 py-3 text-xs font-semibold sm:text-sm'
            : 'self-start rounded-2xl px-3 py-3 text-xs font-semibold sm:text-sm min-h-[104px] sm:min-h-[112px] flex flex-col justify-between'

          return (
            <article
              key={`${entry.subject}-${index}`}
              className={`${cardClassName} ${
                isPresent ? 'bg-[#38A169] text-[#FFFFFF]' : 'bg-[#C53030] text-[#FFFFFF]'
              }`}
            >
              <p className="text-center capitalize">{entry.subject}</p>

              {!isPresent && isPendingConfirmation ? (
                <div className="mt-2 rounded-xl border border-white/30 bg-white/10 p-2">
                  <p className="text-[11px] text-white">Did you send the email?</p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onConfirmMailSent?.(entry)}
                      className="flex-1 rounded-full border border-white/40 bg-white/20 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-white/30"
                    >
                      Yes, Mark as Sent
                    </button>
                    <button
                      type="button"
                      onClick={() => onMarkMailNotYet?.(entry)}
                      className="rounded-full border border-white/35 px-2 py-1 text-[10px] font-semibold text-white/90 transition hover:bg-white/10"
                    >
                      Not Yet
                    </button>
                  </div>
                </div>
              ) : null}

              {!isPresent && onMailFaculty && !isPendingConfirmation ? (
                <button
                  type="button"
                  disabled={isAlreadySent}
                  onClick={() => onMailFaculty(entry)}
                  className={`mt-2 w-full rounded-full border border-white/40 px-2 py-1 text-[11px] font-semibold text-white transition ${
                    isAlreadySent
                      ? 'cursor-not-allowed bg-white/15 opacity-65'
                      : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  {isAlreadySent ? 'Mail Sent' : 'Mail Faculty'}
                </button>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default DayDetailCard
