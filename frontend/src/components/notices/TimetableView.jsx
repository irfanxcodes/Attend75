import { useEffect, useState, useRef } from 'react'
import { Calendar, Clock, MapPin, User, X, ChevronRight, AlertCircle, RefreshCw, Search, ChevronDown } from 'lucide-react'
import { fetchTimetable, fetchTimetableCandidates, selectTimetable, refreshNotices, uploadTimetablePdf, setTimetableSection, API_BASE_URL } from '../../services/noticesApi'
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
function TimetablePicker({ token, semesterId, onSelect, onDismiss, initialSectionData = null }) {
  const [candidates, setCandidates] = useState([])
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(!initialSectionData)
  const [selecting, setSelecting] = useState(null)
  const [error, setError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  // Section picker state — shown when upload finds timetable but can't auto-match section
  const [sectionPickerData, setSectionPickerData] = useState(initialSectionData)
  const [chosenCombo, setChosenCombo] = useState(null)
  const [manualSection, setManualSection] = useState('')
  const [isSettingSection, setIsSettingSection] = useState(false)
  const sectionInputRef = useRef(null)

  // Fetch candidates when modal opens — skip if showing section picker directly
  useEffect(() => {
    if (initialSectionData) return  // already have section data, skip candidate fetch
    setIsFetchingCandidates(true)
    fetchTimetableCandidates({ token })
      .then((data) => setCandidates(data?.candidates || []))
      .catch(() => setCandidates([]))
      .finally(() => setIsFetchingCandidates(false))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Supported types: PDF, images, XLSX
  const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.xlsx,.xls'
  const MAX_SIZE_MB = 20 // images up to 20MB, others 10MB

  const validateFile = (file) => {
    const name = file.name.toLowerCase()
    const isImage = /\.(jpg|jpeg|png|webp|bmp|tiff?)$/.test(name)
    const isDoc = /\.(pdf|xlsx|xls)$/.test(name)
    if (!isImage && !isDoc) {
      return 'Unsupported file type. Please upload a PDF, image (JPG/PNG/WEBP), or spreadsheet (XLSX).'
    }
    const maxBytes = (isImage ? 20 : 10) * 1024 * 1024
    if (file.size > maxBytes) {
      return `File too large (max ${isImage ? 20 : 10}MB)`
    }
    return null
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setIsUploading(true)
    setError(null)
    try {
      const data = await uploadTimetablePdf({ token, file })
      if (data && data.needsSection) {
        // Timetable found but section unknown — show section picker
        setSectionPickerData({
          availableSections: data.availableSections || [],
          availableCombos: data.availableCombos || [],
          noticeTitle: data.noticeTitle || file.name,
        })
        setChosenCombo(null)
        setManualSection('')
      } else if (data && data.schedule) {
        onSelect(data)
      } else {
        setError("Couldn't find timetable data in this file. Make sure it's your class timetable.")
      }
    } catch (err) {
      setError(err?.message || 'Failed to process the file. Please try a different format.')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handleSectionConfirm = async () => {
    const section = chosenCombo ? chosenCombo.section : manualSection.trim()
    const year    = chosenCombo ? chosenCombo.year    : ''
    const dept    = chosenCombo ? chosenCombo.dept    : ''
    if (!section) return
    setIsSettingSection(true)
    setError(null)
    try {
      const data = await setTimetableSection({ token, section, year, dept })
      if (data && data.schedule) {
        setSectionPickerData(null)
        onSelect(data)
      } else {
        setError("Couldn't find classes for that section. Try a different one.")
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setIsSettingSection(false)
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
              <h3 className="text-[15px] font-bold text-[#F7F4FF]">
                {isFetchingCandidates ? 'Find My Timetable' : candidates.length > 0 ? 'Pick Your Timetable' : 'Upload Timetable'}
              </h3>
            </div>
            <p className="mt-1.5 pl-9 text-[11px] leading-relaxed text-[#9F9AB5]">
              {isFetchingCandidates || candidates.length > 0
                ? 'Select the notice that matches your semester'
                : 'Upload your timetable PDF to get started'}
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
          {/* ── Section picker (shown after upload finds timetable but not section) ── */}
          {sectionPickerData ? (
            <div className="flex flex-col items-center py-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#A78BFA]/10 mb-3">
                <Calendar className="h-5 w-5 text-[#A78BFA]" />
              </div>
              <p className="text-[14px] font-bold text-[#F7F4FF]">Select your section</p>
              <p className="mt-1 max-w-[270px] text-[11px] leading-relaxed text-[#9F9AB5]">
                We found your timetable. Pick your section and year/department below.
              </p>

              {/* Combo list — section + year + dept */}
              {sectionPickerData.availableCombos.length > 0 ? (
                <div className="mt-4 w-full max-h-56 overflow-y-auto space-y-1.5 -mx-1 px-1">
                  {sectionPickerData.availableCombos.map((combo, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setChosenCombo(combo); setManualSection('') }}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition active:scale-[0.98] ${
                        chosenCombo === combo
                          ? 'bg-[#A78BFA]/20 ring-1 ring-[#A78BFA]/60'
                          : 'bg-white/[0.05] ring-1 ring-white/[0.07] hover:bg-white/[0.09]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[13px] font-bold text-[#F7F4FF] shrink-0">
                            Sec {combo.section}
                          </span>
                          {combo.room && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-[#9F9AB5] shrink-0">
                              {combo.room}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {combo.year && (
                            <span className="rounded-full bg-[#A78BFA]/15 px-2 py-0.5 text-[9px] font-semibold text-[#A78BFA]">
                              Yr {combo.year}
                            </span>
                          )}
                          {combo.dept && (
                            <span className="rounded-full bg-[#6CB4FF]/15 px-2 py-0.5 text-[9px] font-semibold text-[#6CB4FF] max-w-[80px] truncate">
                              {combo.dept}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                /* Fallback: plain section chips when no combos */
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {sectionPickerData.availableSections.slice(0, 16).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => { setManualSection(sec); setChosenCombo(null) }}
                      className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition active:scale-95 ${
                        manualSection === sec
                          ? 'bg-[#A78BFA] text-white'
                          : 'bg-white/8 text-[#9F9AB5] hover:bg-white/15 hover:text-[#F7F4FF]'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              )}

              {/* Manual override input */}
              <div className="mt-3 w-full max-w-[220px]">
                <input
                  ref={sectionInputRef}
                  type="text"
                  value={chosenCombo ? `Sec ${chosenCombo.section}${chosenCombo.room ? ` (${chosenCombo.room})` : ''}` : manualSection}
                  onChange={(e) => { setManualSection(e.target.value.toUpperCase()); setChosenCombo(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSectionConfirm()}
                  placeholder="Or type section (e.g. A, BCA-B)"
                  className="w-full rounded-2xl bg-white/[0.07] px-4 py-2.5 text-[12px] text-[#F7F4FF] placeholder-[#9F9AB5]/50 outline-none ring-1 ring-white/10 focus:ring-[#A78BFA]/50 transition"
                  readOnly={!!chosenCombo}
                />
              </div>

              {/* Confirm button */}
              <button
                type="button"
                onClick={handleSectionConfirm}
                disabled={(!chosenCombo && !manualSection.trim()) || isSettingSection}
                className="mt-4 flex items-center gap-2 rounded-full bg-[#A78BFA] px-6 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-[#A78BFA]/20 transition hover:bg-[#9f7ffa] active:scale-95 disabled:opacity-40"
              >
                {isSettingSection ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {isSettingSection ? 'Loading...' : 'Load My Timetable'}
              </button>

              <button
                type="button"
                onClick={() => { setSectionPickerData(null); setChosenCombo(null); setManualSection(''); setError(null) }}
                className="mt-3 text-[10px] text-[#9F9AB5] underline underline-offset-2 transition hover:text-[#F7F4FF]"
              >
                Upload a different file
              </button>
            </div>
          ) : isFetchingCandidates ? (
            /* Loading state */
            <div className="flex flex-col items-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
              <p className="mt-3 text-[11px] text-[#9F9AB5]">Looking for timetable notices…</p>
            </div>
          ) : isEmpty ? (
            /* Empty state — no timetable notices found for this program */
            <div className="flex flex-col items-center py-5 text-center">
              <div className="relative mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF916C]/10">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#FF916C]/60" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
              </div>

              <p className="text-[14px] font-bold text-[#F7F4FF]">Upload your timetable</p>
              <p className="mt-1.5 max-w-[260px] text-[11px] leading-relaxed text-[#9F9AB5]">
                Your program's timetable is shared separately — upload it to get your personalised schedule.
              </p>

              {/* Format chips */}
              <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                {['PDF', 'JPG/PNG', 'XLSX'].map((fmt) => (
                  <span key={fmt} className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-semibold text-[#9F9AB5]">{fmt}</span>
                ))}
              </div>

              {/* Upload CTA */}
              <label className="mt-4 cursor-pointer">
                <input type="file" accept={ACCEPTED_TYPES} onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                <div className="flex items-center gap-2 rounded-full bg-[#FF916C] px-5 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-[#FF916C]/20 transition hover:bg-[#ff7a50] active:scale-95">
                  {isUploading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  )}
                  {isUploading ? 'Processing...' : 'Upload Timetable'}
                </div>
              </label>
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
                  Can't find yours? Upload PDF, image, or XLSX:
                </p>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/[0.05] ring-1 ring-white/[0.07] px-4 py-3 text-[11px] font-semibold text-[#F7F4FF] transition hover:bg-white/[0.09] active:scale-[0.98]">
                  <input type="file" accept={ACCEPTED_TYPES} onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                  {isUploading ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  )}
                  {isUploading ? 'Processing...' : 'Upload Timetable (PDF / Image / XLSX)'}
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
const TIMETABLE_STORAGE_KEY = 'attend75_timetable_cache'

function saveTimetableToStorage(data) {
  try { sessionStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(data)) } catch {}
}
function loadTimetableFromStorage() {
  try {
    const raw = sessionStorage.getItem(TIMETABLE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function clearTimetableStorage() {
  try { sessionStorage.removeItem(TIMETABLE_STORAGE_KEY) } catch {}
}

function TimetableView({ token }) {
  const {
    state: { session },
  } = useAppStore()

  // Seed state from sessionStorage so timetable survives nav away/back
  const [timetable, setTimetable] = useState(() => loadTimetableFromStorage())
  const [isLoading, setIsLoading] = useState(!loadTimetableFromStorage())
  const [activeDay, setActiveDay] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  // When Wrong? is clicked on an uploaded timetable — show section picker directly
  const [wrongPickerCombos, setWrongPickerCombos] = useState(null)

  // Main timetable fetch — use sessionStorage for instant display, but always
  // revalidate from the server in the background. This prevents stale/wrong
  // timetable data (e.g. BBA shown to BCA) persisting after a backend fix.
  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      return
    }

    const cached = loadTimetableFromStorage()

    // Show cached data immediately (instant paint) but still hit the server
    if (cached && cached.schedule) {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
      const days = Object.keys(cached.schedule)
      setActiveDay(prev => prev || (cached.schedule[today] ? today : days[0] || null))
      setIsLoading(false)
      // Fall through — still revalidate below
    } else {
      setIsLoading(true)
    }

    // Always fetch from server (background revalidation when cached, blocking when not)
    fetchTimetable({ token, semesterId: session.selectedSemester })
      .then((data) => {
        if (data && data.schedule) {
          setTimetable(data)
          saveTimetableToStorage(data)
          const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
          const days = Object.keys(data.schedule)
          setActiveDay(prev => prev || (data.schedule[today] ? today : days[0] || null))
        } else {
          // Server says no timetable — clear stale cache and show upload prompt
          setTimetable(null)
          clearTimetableStorage()
        }
      })
      .catch(() => {
        // Network error — keep cached data if available, else null
        if (!cached || !cached.schedule) setTimetable(null)
      })
      .finally(() => setIsLoading(false))
  }, [token, session.selectedSemester]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wrong? button handler — if timetable was uploaded, show section picker with combos
  const handleWrong = async () => {
    // If we have a pending schedule in session (uploaded file), show section picker
    if (timetable?.uploaded) {
      try {
        const resp = await fetch(
          `${API_BASE_URL}/notices/timetable/upload/combos?token=${token}`
        )
        const json = await resp.json().catch(() => ({}))
        if (json?.data?.availableCombos?.length > 0) {
          setWrongPickerCombos(json.data)
          return
        }
      } catch {}
    }
    // Default: open normal picker
    setShowPicker(true)
  }

  const handlePickerSelect = (data) => {
    setShowPicker(false)
    setWrongPickerCombos(null)
    setTimetable(data)
    saveTimetableToStorage(data)
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
                Pick it manually or upload your timetable PDF.
              </p>
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FF916C] px-5 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-[#FF916C]/20 transition hover:bg-[#ff7a50] active:scale-95"
              >
                <Calendar className="h-4 w-4" />
                Find / Upload Timetable
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
            {(() => {
              const title = timetable.noticeTitle || ''
              const date = timetable.noticeDate // "2026-08-02"

              // Extract semester part: "Semester-1, Semester-3 ... Time Table From 3rd August"
              // Pattern: grab everything from the first "Semester" up to end of title
              const semMatch = title.match(/Semester[- ]?\d[\w\s,–\-&andAND]*(Time\s*Table[^$]*)/i)
                ?? title.match(/(Semester.*)/i)

              let subtitle = semMatch ? semMatch[0].trim() : title

              // If no semester info found at all, fall back to short title
              if (!semMatch) {
                subtitle = title.length > 50 ? title.slice(0, 50) + '…' : title
              }

              // Append formatted date if it's not already in the subtitle and we have one
              if (date && !/\d{1,2}(st|nd|rd|th)?\s+\w+\s+\d{4}/i.test(subtitle)) {
                const d = new Date(date)
                const formatted = d.toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })
                subtitle = subtitle.replace(/from\s*$/i, '').trimEnd()
                subtitle = `${subtitle} — ${formatted}`
              }

              return subtitle
            })()}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-[#FF916C]/15 px-2.5 py-1 text-[9px] font-bold text-[#FF916C]">
            {timetable.totalClasses} classes/week
          </span>
          <button
            type="button"
            onClick={handleWrong}
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

      {/* Wrong? section re-picker for uploaded timetables */}
      {wrongPickerCombos && (
        <TimetablePicker
          token={token}
          semesterId={session.selectedSemester}
          onSelect={handlePickerSelect}
          onDismiss={() => setWrongPickerCombos(null)}
          initialSectionData={wrongPickerCombos}
        />
      )}
    </div>
  )
}

export default TimetableView
