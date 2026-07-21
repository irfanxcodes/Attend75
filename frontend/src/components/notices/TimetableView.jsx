import { useEffect, useState } from 'react'
import { Calendar, Clock, MapPin, User, X, ChevronRight, AlertCircle, RefreshCw, Search } from 'lucide-react'
import { fetchTimetable, fetchTimetableCandidates, selectTimetable, refreshNotices, uploadTimetablePdf } from '../../services/noticesApi'
import useAppStore from '../../hooks/useAppStore'

const DAY_COLORS = {
  Monday: '#FF916C',
  Tuesday: '#6CB4FF',
  Wednesday: '#4EF0A0',
  Thursday: '#A78BFA',
  Friday: '#FFB23E',
  Saturday: '#F472B6',
}

// ── Timetable Picker Modal ──────────────────────────────────────────────────
function TimetablePicker({ token, semesterId, onSelect, onDismiss }) {
  const [candidates, setCandidates] = useState([])
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(true)
  const [selecting, setSelecting] = useState(null)
  const [error, setError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Fetch candidates when modal opens
  useEffect(() => {
    setIsFetchingCandidates(true)
    fetchTimetableCandidates({ token })
      .then((data) => setCandidates(data?.candidates || []))
      .catch(() => setCandidates([]))
      .finally(() => setIsFetchingCandidates(false))
  }, [token])

  const handleSelect = async (noticeId) => {
    setSelecting(noticeId)
    setError(null)
    try {
      const data = await selectTimetable({ token, noticeId, semesterId })
      if (data && data.schedule) {
        onSelect(data)
      } else {
        setError("Couldn't match your subjects to this timetable. Try another one.")
        setSelecting(null)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSelecting(null)
    }
  }

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setError(null)
    try {
      await refreshNotices({ token })
      // Re-fetch candidates after refresh
      setIsFetchingCandidates(true)
      const data = await fetchTimetableCandidates({ token })
      setCandidates(data?.candidates || [])
    } catch {
      setError('Refresh failed. Please try again.')
    } finally {
      setIsRefreshing(false)
      setIsFetchingCandidates(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10MB)')
      return
    }
    setIsUploading(true)
    setError(null)
    try {
      const data = await uploadTimetablePdf({ token, file })
      if (data && data.schedule) {
        onSelect(data)
      } else {
        setError("Couldn't find timetable data in this PDF. Make sure it's your class timetable.")
      }
    } catch (err) {
      setError(err?.message || 'Failed to process the PDF. Please try a different file.')
    } finally {
      setIsUploading(false)
      e.target.value = '' // Reset file input
    }
  }

  const isEmpty = !isFetchingCandidates && candidates.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-[28px] bg-[#1E1B2E] shadow-2xl">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FF916C]/15">
                <Calendar className="h-3.5 w-3.5 text-[#FF916C]" />
              </div>
              <h3 className="text-[15px] font-bold text-[#F7F4FF]">Pick Your Timetable</h3>
            </div>
            <p className="mt-1.5 pl-9 text-[11px] leading-relaxed text-[#9F9AB5]">
              Select the notice that matches your semester
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-[#9F9AB5] transition hover:bg-white/15"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-white/[0.07]" />

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-2xl bg-red-500/10 px-3.5 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="text-[11px] leading-relaxed text-red-300">{error}</p>
          </div>
        )}

        {/* Body */}
        <div className="px-4 pt-3 pb-6">
          {isFetchingCandidates ? (
            /* Loading state */
            <div className="flex flex-col items-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
              <p className="mt-3 text-[11px] text-[#9F9AB5]">Looking for timetable notices…</p>
            </div>
          ) : isEmpty ? (
            /* Empty state — no timetable notices found */
            <div className="flex flex-col items-center py-5 text-center">
              <div className="relative mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF916C]/10">
                  <Search className="h-6 w-6 text-[#FF916C]/60" />
                </div>
              </div>

              <p className="text-[14px] font-bold text-[#F7F4FF]">No timetable in your notices</p>
              <p className="mt-1.5 max-w-[250px] text-[11px] leading-relaxed text-[#9F9AB5]">
                Your college may share timetables via email or WhatsApp instead.
                Upload your timetable PDF below.
              </p>

              {/* Upload CTA */}
              <label className="mt-5 cursor-pointer">
                <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                <div className="flex items-center gap-2 rounded-full bg-[#FF916C] px-5 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-[#FF916C]/20 transition hover:bg-[#ff7a50] active:scale-95">
                  {isUploading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  )}
                  {isUploading ? 'Processing...' : 'Upload Timetable PDF'}
                </div>
              </label>

              {/* Refresh option */}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="mt-3 flex items-center gap-1.5 text-[11px] text-[#9F9AB5] transition hover:text-[#F7F4FF]"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Checking...' : 'Or check notices again'}
              </button>
            </div>
          ) : (
            /* Candidates list */
            <div className="space-y-2 max-h-72 overflow-y-auto -mx-1 px-1">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#9F9AB5]/60">
                {candidates.length} notice{candidates.length !== 1 ? 's' : ''} found
              </p>
              {candidates.map((c, idx) => (
                <button
                  key={c.noticeId}
                  type="button"
                  disabled={!!selecting}
                  onClick={() => handleSelect(c.noticeId)}
                  className="group w-full overflow-hidden rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.07] text-left transition hover:bg-white/[0.09] hover:ring-white/15 disabled:opacity-60 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3.5 px-4 py-3.5">
                    {/* Index badge */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/10">
                      <span className="text-[11px] font-bold text-[#FF916C]">{idx + 1}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold leading-snug text-[#F7F4FF] line-clamp-2">
                        {c.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {c.date && (
                          <span className="text-[9px] text-[#9F9AB5]/70">
                            {new Date(c.date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                        {c.semesters?.length > 0 && (
                          <span className="rounded-full bg-[#A78BFA]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#A78BFA]">
                            Sem {c.semesters.join(', ')}
                          </span>
                        )}
                        {!c.semesters?.length && c.sections?.length > 0 && (
                          <span className="rounded-full bg-[#6CB4FF]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#6CB4FF]">
                            Sec {c.sections.slice(0, 5).join(', ')}{c.sections.length > 5 ? '…' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Spinner / arrow */}
                    {selecting === c.noticeId ? (
                      <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/20 transition group-hover:text-white/50 group-hover:translate-x-0.5" />
                    )}
                  </div>
                </button>
              ))}

              {/* Feedback footer + Upload option */}
              <div className="mt-3 pt-3 border-t border-white/[0.05]">
                <p className="text-center text-[10px] text-[#9F9AB5]/70 mb-2">
                  Can't find yours? Upload your timetable PDF:
                </p>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/[0.05] ring-1 ring-white/[0.07] px-4 py-3 text-[11px] font-semibold text-[#F7F4FF] transition hover:bg-white/[0.09] active:scale-[0.98]">
                  <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                  {isUploading ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  )}
                  {isUploading ? 'Processing PDF...' : 'Upload Timetable PDF'}
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main TimetableView ──────────────────────────────────────────────────────
function TimetableView({ token }) {
  const {
    state: { session },
  } = useAppStore()
  const [timetable, setTimetable] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeDay, setActiveDay] = useState(null)
  const [showPicker, setShowPicker] = useState(false)

  // Main timetable fetch
  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    fetchTimetable({ token, semesterId: session.selectedSemester })
      .then((data) => {
        if (data && data.schedule) {
          setTimetable(data)
          const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
          const days = Object.keys(data.schedule)
          setActiveDay(data.schedule[today] ? today : days[0] || null)
        } else {
          setTimetable(null)
        }
      })
      .catch(() => setTimetable(null))
      .finally(() => setIsLoading(false))
  }, [token, session.selectedSemester])

  // Pre-fetch candidates in background — removed, now done lazily inside picker

  const handlePickerSelect = (data) => {
    setShowPicker(false)
    setTimetable(data)
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const days = Object.keys(data.schedule)
    setActiveDay(data.schedule[today] ? today : days[0] || null)
  }

  if (isLoading) {
    return (
      <div className="mt-6 rounded-2xl bg-[#2E2A3A] p-6 text-center ring-1 ring-white/5">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
        <p className="mt-2 text-[11px] text-[#9F9AB5]">Loading timetable...</p>
      </div>
    )
  }

  // No timetable found — show fallback
  if (!timetable || !timetable.schedule) {
    return (
      <>
        <div className="mt-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-[#F7F4FF]">My Timetable</h2>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl bg-[#2E2A3A] ring-1 ring-white/5">
            <div className="h-1 bg-gradient-to-r from-[#FF916C] to-[#A78BFA]" />
            <div className="px-5 py-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF916C]/10">
                <Calendar className="h-6 w-6 text-[#FF916C]" />
              </div>
              <p className="text-[15px] font-bold text-[#F7F4FF]">Timetable not set up yet</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#9F9AB5]">
                We couldn&apos;t automatically match your timetable.
                <br />
                Pick it manually from recent college notices.
              </p>
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FF916C] px-5 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-[#FF916C]/20 transition hover:bg-[#ff7a50] active:scale-95"
              >
                <Calendar className="h-4 w-4" />
                Find My Timetable
              </button>
            </div>
          </div>
        </div>

        {showPicker && (
          <TimetablePicker
            token={token}
            semesterId={session.selectedSemester}
            onSelect={handlePickerSelect}
            onDismiss={() => setShowPicker(false)}
          />
        )}
      </>
    )
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
          <p className="mt-0.5 text-[10px] text-[#9F9AB5]">
            {timetable.noticeTitle?.slice(0, 50)}
            {timetable.noticeTitle?.length > 50 ? '...' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-[#FF916C]/15 px-2.5 py-1 text-[9px] font-bold text-[#FF916C]">
            {timetable.totalClasses} classes/week
          </span>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="text-[11px] font-medium text-[#9F9AB5] underline underline-offset-2 transition hover:text-[#F7F4FF]"
          >
            Wrong?
          </button>
        </div>
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
                isActive ? 'text-[#1D183E] shadow-lg' : 'bg-white/5 text-[#9F9AB5] hover:bg-white/10'
              }`}
              style={isActive ? { backgroundColor: color } : undefined}
            >
              {isToday && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              {day.slice(0, 3)}
              <span className="text-[9px] opacity-70">
                ({timetable.schedule[day]?.length || 0})
              </span>
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
                <div className="h-1" style={{ backgroundColor: color }} />
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-bold text-[#F7F4FF]">{cls.course}</h3>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-[#9F9AB5]">
                      Sec {cls.section}
                    </span>
                  </div>
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

      {/* Picker modal */}
      {showPicker && (
        <TimetablePicker
          token={token}
          semesterId={session.selectedSemester}
          onSelect={handlePickerSelect}
          onDismiss={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

export default TimetableView
