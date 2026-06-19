import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Flag, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AttendanceCircle from '../components/dashboard/AttendanceCircle'
import Header from '../components/dashboard/Header'
import PredictionCard from '../components/dashboard/PredictionCard'
import SubjectList from '../components/dashboard/SubjectList'
import InstagramButton from '../components/common/InstagramButton'
import GuestLoginPrompt from '../components/common/GuestLoginPrompt'
import Walkthrough, { hasCompletedWalkthrough } from '../components/common/Walkthrough'
import DemoWalkthrough, { hasDemoWalkthroughCompleted } from '../components/common/DemoWalkthrough'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendance, fetchMailsSentCount, isSessionExpiredError } from '../services/attendanceApi'
import { calculatePrediction } from '../utils/calculations'
import { calculateTotalAbsents } from '../utils/dashboardMetrics'
import { loadAttendanceSnapshot } from '../services/sessionPersistence'
import StaleDataBadge from '../components/common/StaleDataBadge'

function formatPercentage(value) {
  const num = Number(value) || 0
  const rounded = Math.round(num * 100) / 100
  if (rounded === Math.floor(rounded)) return `${Math.floor(rounded)}%`
  return `${rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

function MobileSubjectRow({ subject, selectedTarget, isDemo }) {
  const [isExpanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const [showGuestPrompt, setShowGuestPrompt] = useState(false)
  const percentageColor =
    subject.percentage > 75 ? '#4EF0A0' : subject.percentage >= 60 ? '#FFB23E' : '#FF5B5B'
  const statusLabel = subject.percentage > 75 ? 'Safe' : subject.percentage >= 65 ? 'Tight' : 'At Risk'
  const statusClass =
    subject.percentage > 75
      ? 'border-[#4EF0A0]/50 bg-[#4EF0A0]/12 text-[#4EF0A0]'
      : subject.percentage >= 65
        ? 'border-[#FFB23E]/50 bg-[#FFB23E]/12 text-[#FFB23E]'
        : 'border-[#FF5B5B]/50 bg-[#FF5B5B]/12 text-[#FF5B5B]'
  const shortName = subject.shortName || subject.id?.toUpperCase?.() || subject.name.slice(0, 4).toUpperCase()
  const attendedClasses = Number(subject.attendedClasses) || 0
  const conductedClasses = Number(subject.totalClasses) || 0
  const leftClasses = Number(subject.classesLeft) || 0
  const targetRatio = (selectedTarget || 75) / 100
  const canMiss = Math.max(0, Math.floor(attendedClasses / targetRatio - conductedClasses))
  const toAttend = Math.max(0, Math.ceil((targetRatio * conductedClasses - attendedClasses) / (1 - targetRatio)))
  const maxPossible = subject.maxPossiblePercentage
  const isBelowTarget = subject.percentage < (selectedTarget || 75)

  return (
    <div className="rounded-xl bg-[#3D3660] px-3 py-2.5 transition-all duration-200">
      <button
        type="button"
        onClick={() => setExpanded((c) => !c)}
        className="flex w-full items-center gap-2.5 text-left active:scale-[0.99]"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: percentageColor }} />
        <span className="text-sm font-bold text-[#F7F4FF]">{shortName}</span>
        <span className={`rounded-full border px-1.5 py-px text-[8px] font-bold uppercase ${statusClass}`}>
          {statusLabel}
        </span>
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="text-[10px] text-[#9F9AB5]">{attendedClasses}/{conductedClasses}</span>
          <div className="relative h-1.5 w-14 overflow-hidden rounded-full bg-[#302A52]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, subject.percentage))}%`, backgroundColor: percentageColor }}
            />
            <div
              className="absolute top-0 h-full w-px bg-[#F7F4FF]/70"
              style={{ left: `${Math.max(0, Math.min(99, subject.percentage))}%` }}
            />
          </div>
          <span className="w-9 text-right text-[11px] font-bold" style={{ color: percentageColor }}>
            {formatPercentage(subject.percentage)}
          </span>
          <ChevronDown
            className={`h-3 w-3 text-[#9F9AB5] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            strokeWidth={2.5}
          />
        </div>
      </button>

      {isExpanded ? (
        <div className="mt-2 border-t border-white/10 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-[#9F9AB5]">Attended</p>
              <p className="mt-0.5 text-base font-extrabold text-[#F7F4FF]">{attendedClasses}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-[#9F9AB5]">Left</p>
              <p className="mt-0.5 text-base font-extrabold text-[#F7F4FF]">{leftClasses}</p>
            </div>
            <div>
              {maxPossible !== null && maxPossible !== undefined && maxPossible < (selectedTarget || 75) ? (
                <>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-[#9F9AB5]">Max</p>
                  <p className="mt-0.5 text-base font-extrabold text-[#FF5B5B]">{maxPossible.toFixed(1)}%</p>
                </>
              ) : canMiss > 0 ? (
                <>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-[#9F9AB5]">Can Miss</p>
                  <p className="mt-0.5 text-base font-extrabold text-[#4EF0A0]">{canMiss}</p>
                </>
              ) : (
                <>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-[#9F9AB5]">To Attend</p>
                  <p className="mt-0.5 text-base font-extrabold text-[#FFB23E]">{toAttend}</p>
                </>
              )}
            </div>
          </div>

          {/* Mail Faculty action — only for subjects below target */}
          {isBelowTarget ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (isDemo) { setShowGuestPrompt(true); return }
                navigate('/app/history', { state: { autoMailSubjectCode: subject.id, autoMailSubjectName: shortName } })
              }}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-[#FF916C]/25 py-2 transition active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, rgba(255,145,108,0.08) 0%, rgba(255,145,108,0.02) 100%)' }}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span className="text-[11px] font-semibold text-[#FF916C]">Mail faculty</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <GuestLoginPrompt isOpen={showGuestPrompt} onClose={() => setShowGuestPrompt(false)} featureName="mail your faculty about attendance" />
    </div>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const {
    state: {
      attendance: { overallPercentage, subjects },
      session,
      selectedTarget,
      ui,
      user,
    },
    actions,
  } = useAppStore()

  const isDemo = user.authProvider === 'demo'
  const [showWalkthrough, setShowWalkthrough] = useState(() => {
    // Show walkthrough for first-time real users (not demo, not completed before)
    return !hasCompletedWalkthrough() && user.authProvider !== 'demo'
  })
  const [showDemoWalkthrough, setShowDemoWalkthrough] = useState(() => {
    return isDemo && !hasDemoWalkthroughCompleted()
  })

  const prediction = useMemo(() => calculatePrediction(subjects, selectedTarget), [subjects, selectedTarget])
  const hasSyncedSavedSemester = useRef(false)
  const [mailsSent, setMailsSent] = useState(0)
  const [mobileTargetExpanded, setMobileTargetExpanded] = useState(false)
  const totals = useMemo(
    () =>
      subjects.reduce(
        (acc, s) => ({
          totalClasses: acc.totalClasses + s.totalClasses,
          totalAttended: acc.totalAttended + s.attendedClasses,
          totalClassesLeft: acc.totalClassesLeft + (s.classesLeft || 0),
        }),
        { totalClasses: 0, totalAttended: 0, totalClassesLeft: 0 },
      ),
    [subjects],
  )
  const totalAbsents = useMemo(() => calculateTotalAbsents(subjects), [subjects])
  const subjectsBelowTarget = useMemo(
    () => subjects.filter((s) => Number(s.percentage) < selectedTarget).length,
    [subjects, selectedTarget],
  )

  useEffect(() => {
    if (!session.token || isDemo) { setMailsSent(0); return }
    fetchMailsSentCount(session.token).then(setMailsSent)
  }, [session.token, subjects, isDemo])

  const status = useMemo(() => {
    if (overallPercentage > 75) return 'safe'
    if (overallPercentage >= 60) return 'borderline'
    return 'danger'
  }, [overallPercentage])

  const handleRefresh = useCallback(async () => {
    if (isDemo) return
    try {
      actions.setLoading(true); actions.setError('')
      const result = await fetchAttendance({ token: session.token, semesterId: session.selectedSemester, forceRefresh: true })
      actions.setAttendanceData(result.attendanceData)
      actions.setSessionSemesters(result.semesters, result.selectedSemester)
      if (result.selectedSemester) window.localStorage.setItem('attend75.selectedSemester', result.selectedSemester)
    } catch (error) {
      if (isSessionExpiredError(error)) { actions.logout(); window.localStorage.removeItem('attend75.selectedSemester'); navigate('/login', { replace: true }); return }
      actions.setError(error.message)
    } finally { actions.setLoading(false) }
  }, [actions, navigate, session.selectedSemester, session.token])

  const handleSemesterChange = useCallback(async (event) => {
    const semesterId = event.target.value
    actions.setSelectedSemester(semesterId)
    window.localStorage.setItem('attend75.selectedSemester', semesterId)
    try {
      actions.setLoading(true); actions.setError('')
      const result = await fetchAttendance({ token: session.token, semesterId })
      actions.setAttendanceData(result.attendanceData)
      actions.setSessionSemesters(result.semesters, result.selectedSemester || semesterId)
    } catch (error) {
      if (isSessionExpiredError(error)) { actions.logout(); window.localStorage.removeItem('attend75.selectedSemester'); navigate('/login', { replace: true }); return }
      actions.setError(error.message)
    } finally { actions.setLoading(false) }
  }, [actions, navigate, session.token])

  useEffect(() => {
    if (hasSyncedSavedSemester.current) return
    if (!session.token || !session.semesters.length || isDemo) return
    hasSyncedSavedSemester.current = true
    const saved = window.localStorage.getItem('attend75.selectedSemester')
    const isValid = session.semesters.some((s) => s.id === saved)
    if (!isValid || !saved || saved === session.selectedSemester) {
      if (session.selectedSemester) window.localStorage.setItem('attend75.selectedSemester', session.selectedSemester)
      return
    }
    actions.setSelectedSemester(saved)
    void (async () => {
      try {
        actions.setLoading(true); actions.setError('')
        const result = await fetchAttendance({ token: session.token, semesterId: saved })
        actions.setAttendanceData(result.attendanceData)
        actions.setSessionSemesters(result.semesters, result.selectedSemester || saved)
      } catch (error) {
        if (isSessionExpiredError(error)) { actions.logout(); window.localStorage.removeItem('attend75.selectedSemester'); navigate('/login', { replace: true }); return }
        actions.setError(error.message)
      } finally { actions.setLoading(false) }
    })()
  }, [actions, navigate, session.selectedSemester, session.semesters, session.token])

  // Mobile attendance card gradient - mesh style (top-left corner glow)
  const bounded = Math.max(0, Math.min(100, overallPercentage))
  const percentageColor = bounded > 75 ? '#4EF0A0' : bounded >= 60 ? '#FFB23E' : '#FF5B5B'
  const meshGradient = bounded > 75
    ? 'radial-gradient(ellipse at 15% 20%, rgba(78,240,160,0.18) 0%, transparent 55%), linear-gradient(135deg, #4A466A 0%, #3D3660 100%)'
    : bounded >= 60
      ? 'radial-gradient(ellipse at 15% 20%, rgba(255,178,62,0.18) 0%, transparent 55%), linear-gradient(135deg, #4A466A 0%, #3D3660 100%)'
      : 'radial-gradient(ellipse at 15% 20%, rgba(255,91,91,0.18) 0%, transparent 55%), linear-gradient(135deg, #4A466A 0%, #3D3660 100%)'
  const borderGradient = bounded > 75 ? 'border-[#4EF0A0]/40' : bounded >= 60 ? 'border-[#FFB23E]/40' : 'border-[#FF5B5B]/40'
  const circumference = 2 * Math.PI * 44
  const offset = circumference - (bounded / 100) * circumference
  const headline =
    status === 'safe'
      ? "You're clear of the 75% line with room to spare."
      : status === 'borderline'
        ? "Close to the 75% line."
        : 'Need more classes for 75%.'

  // Mobile stats: Target first, then Attended, then canMiss/toAttend based on values
  const mobileStats = []
  mobileStats.push({ label: 'Target', value: `${selectedTarget}%`, color: '#6CB4FF' })
  mobileStats.push({ label: 'Attended', value: totals.totalAttended, color: '#4EF0A0' })
  mobileStats.push({ label: 'Classes Left', value: totals.totalClassesLeft, color: '#F7F4FF' })
  if (prediction.canMiss > 0) mobileStats.push({ label: 'Can Miss', value: prediction.canMiss, color: '#4EF0A0' })
  if (prediction.toAttend > 0) mobileStats.push({ label: 'To Attend', value: prediction.toAttend, color: '#FFB23E' })
  if (prediction.canMiss <= 0 && prediction.toAttend <= 0) mobileStats.push({ label: 'Can Miss', value: 0, color: '#4EF0A0' })

  const mobileTargetPresets = [65, 70, 75, 80, 85]

  // Calculate max possible percentage for disabling unreachable targets
  const maxPossiblePercentage = useMemo(() => {
    const attended = totals.totalAttended
    const conducted = totals.totalClasses
    const left = totals.totalClassesLeft
    const finalConducted = conducted + left
    if (finalConducted <= 0) return 100
    return ((attended + left) / finalConducted) * 100
  }, [totals])

  return (
    <section className="md:py-0">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="space-y-2.5 md:hidden">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#F7F4FF]">Dashboard</h1>
            <p className="text-[10px] text-[#9F9AB5]"><StaleDataBadge cachedAt={loadAttendanceSnapshot()?.cachedAt} isRefreshing={ui.isLoading} /></p>
          </div>
          {session.semesters.length > 0 ? (
            <div data-walkthrough="semester-selector" className="flex items-center gap-1.5 rounded-full border border-[#FF916C]/30 bg-[#FF916C]/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF916C]" />
              <select
                value={session.selectedSemester || ''}
                onChange={handleSemesterChange}
                disabled={ui.isLoading}
                className="bg-transparent text-[10px] font-semibold text-[#FF916C] outline-none disabled:opacity-60"
              >
                {session.semesters.map((sem) => (
                  <option key={sem.id} value={sem.id}>{sem.label}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {ui.error ? (
          <div className="rounded-lg border border-[#FF5B5B]/40 bg-[#FF5B5B]/15 px-3 py-1.5 text-[11px] text-[#F7F4FF]">{ui.error}</div>
        ) : null}

        {/* Quick stats banner */}
        <div data-walkthrough="quick-stats" className="flex items-center gap-3 rounded-xl bg-[#4A466A] px-3 py-2.5 ring-1 ring-white/5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#49706D]">
            <Check className="h-4 w-4 text-[#4EF0A0]" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#F7F4FF]">
              {prediction.canMiss > 0 ? `${prediction.canMiss}-day buffer` : `${prediction.toAttend} to attend`}
            </p>
            <p className="text-[10px] text-[#9F9AB5]">{subjectsBelowTarget} below target · {mailsSent} mails sent</p>
          </div>
        </div>

        {/* Attendance card with mesh gradient glow */}
        <div
          data-walkthrough="attendance-ring"
          className={`overflow-hidden rounded-2xl border ${borderGradient} p-4 ring-1 ring-white/5`}
          style={{ background: meshGradient }}
        >
          <div className="flex items-center gap-4">
            {/* Larger ring */}
            <div className="relative h-[110px] w-[110px] shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="44" stroke="#302A52" strokeWidth="9" fill="none" />
                <circle
                  cx="50" cy="50" r="44"
                  stroke={percentageColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  className="transition-all duration-700"
                />
                {/* End-cap dot */}
                <circle cx="50" cy="6" r="3" fill="#F7F4FF" opacity="0.7" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold leading-none" style={{ color: percentageColor }}>{formatPercentage(bounded)}</span>
                <span className="mt-0.5 text-[9px] text-[#9F9AB5]">of {selectedTarget}%</span>
              </div>
            </div>

            {/* Status + headline */}
            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-full bg-[#4EF0A0] px-2.5 py-1 text-[10px] font-extrabold uppercase text-[#1C2030]">
                {status}
              </span>
              <p className="mt-2 text-sm font-bold leading-snug text-[#F7F4FF]">{headline}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/10 pt-3">
            {mobileStats.slice(0, 4).map((stat) => (
              <div key={stat.label}>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#9F9AB5]">{stat.label}</p>
                <p className="mt-0.5 text-lg font-extrabold" style={{ color: stat.color }}>{stat.value}</p>
              </div>
            ))}
          </div>
          {mobileStats.length > 4 ? (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {mobileStats.slice(4).map((stat) => (
                <div key={stat.label}>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[#9F9AB5]">{stat.label}</p>
                  <p className="mt-0.5 text-lg font-extrabold" style={{ color: stat.color }}>{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Target card - expandable */}
        <div data-walkthrough="target-card" className="rounded-xl bg-[#4A466A] ring-1 ring-white/5">
          <button
            type="button"
            onClick={() => setMobileTargetExpanded((c) => !c)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4A5C78]">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6CB4FF]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#F7F4FF]">Target {selectedTarget}%</p>
              <p className="text-[10px] text-[#9F9AB5]">
                {prediction.canMiss > 0 ? `Can miss ${prediction.canMiss} more` : ''}{prediction.canMiss > 0 && prediction.toAttend > 0 ? ' · ' : ''}{prediction.toAttend > 0 ? `${prediction.toAttend} required attendances` : ''}
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 text-[#9F9AB5] transition-transform duration-200 ${mobileTargetExpanded ? 'rotate-180' : ''}`} strokeWidth={2} />
          </button>

          {mobileTargetExpanded ? (
            <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
              {selectedTarget > maxPossiblePercentage ? (
                <p className="mb-2 rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 px-2.5 py-1.5 text-[10px] font-medium text-[#FFD4D4]">
                  Max attainable is {maxPossiblePercentage.toFixed(1)}% even if you attend all remaining classes.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {mobileTargetPresets.map((t) => {
                  const isImpossible = t > maxPossiblePercentage
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { if (!isImpossible) actions.setSelectedTarget(t) }}
                      disabled={isImpossible}
                      className={[
                        'rounded-full px-3 py-1 text-[11px] font-bold transition',
                        selectedTarget === t && !isImpossible
                          ? 'bg-[#FF916C] text-[#1D183E]'
                          : isImpossible
                            ? 'cursor-not-allowed text-[#6E6A88] line-through opacity-50 ring-1 ring-white/10'
                            : 'bg-white/5 text-[#D8D4E7] ring-1 ring-white/15 active:bg-white/10',
                      ].join(' ')}
                    >
                      {t}%
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] text-[#9F9AB5]">Custom</span>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={1}
                  value={selectedTarget}
                  onChange={(e) => actions.setSelectedTarget(Number(e.target.value))}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-[#302A52] accent-[#FF916C]"
                />
                <span className="w-8 text-right text-xs font-bold text-[#F7F4FF]">{selectedTarget}%</span>
              </div>
              {selectedTarget > maxPossiblePercentage && selectedTarget !== mobileTargetPresets.find((t) => t === selectedTarget) ? (
                <p className="mt-2 text-[10px] text-[#FF5B5B]">
                  This target exceeds your max possible ({maxPossiblePercentage.toFixed(1)}%).
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Subjects - mobile compact */}
        <div data-walkthrough="subjects-list" className="rounded-2xl bg-[#4A466A] p-3 ring-1 ring-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-[#F7F4FF]">Subjects</h2>
              <p className="text-[9px] text-[#9F9AB5]">Ranked by risk</p>
            </div>
            <span className="text-[11px] font-bold text-[#9F9AB5]">{subjects.length}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {subjects.map((subject) => (
              <MobileSubjectRow key={subject.id} subject={subject} selectedTarget={selectedTarget} isDemo={isDemo} />
            ))}
          </div>
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT (unchanged) ===== */}
      <div className="hidden space-y-3 md:block">
        <Header />

        {ui.error ? (
          <div className="rounded-xl border border-[#FF5B5B]/40 bg-[#FF5B5B]/15 px-3 py-2 text-xs text-[#F7F4FF]">{ui.error}</div>
        ) : null}

        <div className="flex items-center gap-3">
          <div data-walkthrough="desktop-semester-selector" className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#4A466A] px-3 py-2 shadow-sm">
            <label htmlFor="semester-select-desktop" className="text-[11px] font-semibold text-[#9F9AB5]">Semester</label>
            <select
              id="semester-select-desktop"
              value={session.selectedSemester || ''}
              onChange={handleSemesterChange}
              disabled={ui.isLoading || !session.semesters.length}
              className="min-w-[130px] rounded-lg border border-white/15 bg-[#565275] px-2.5 py-1 text-[11px] font-semibold text-[#F7F4FF] outline-none transition-colors focus:border-[#FF916C] disabled:opacity-60"
            >
              {!session.semesters.length ? <option value="">No semesters</option> : null}
              {session.semesters.map((sem) => (<option key={sem.id} value={sem.id}>{sem.label}</option>))}
            </select>
          </div>

          <div data-walkthrough="desktop-quick-stats" className="grid flex-1 grid-cols-3 gap-2.5">
            <div className="flex items-center gap-2.5 rounded-xl bg-[#4A466A] px-3 py-2 shadow-sm ring-1 ring-black/5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6B4A4A] text-[#FF9E6C]"><AlertTriangle className="h-4 w-4" strokeWidth={2.4} /></span>
              <div className="min-w-0"><p className="text-lg font-extrabold leading-tight text-[#F7F4FF]">{subjectsBelowTarget}</p><p className="truncate text-[10px] font-medium text-[#9F9AB5]">below target</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#4A466A] px-3 py-2 shadow-sm ring-1 ring-black/5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7E4A68] text-[#FF695E]"><Flag className="h-4 w-4" strokeWidth={2.2} /></span>
              <div className="min-w-0"><p className="text-lg font-extrabold leading-tight text-[#F7F4FF]">{totalAbsents}</p><p className="truncate text-[10px] font-medium text-[#9F9AB5]">total absents</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#4A466A] px-3 py-2 shadow-sm ring-1 ring-black/5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4A5C78] text-[#6CB4FF]"><Send className="h-4 w-4" strokeWidth={2.2} /></span>
              <div className="min-w-0"><p className="text-lg font-extrabold leading-tight text-[#F7F4FF]">{mailsSent}</p><p className="truncate text-[10px] font-medium text-[#9F9AB5]">emails sent</p></div>
            </div>
          </div>
        </div>

        <div data-walkthrough="desktop-attendance-ring" className="grid gap-2.5 xl:grid-cols-[1fr_340px]">
          <AttendanceCircle
            percentage={overallPercentage}
            totalClasses={totals.totalClasses}
            totalAttended={totals.totalAttended}
            classesLeft={totals.totalClassesLeft}
            canMiss={prediction.canMiss}
            toAttend={prediction.toAttend}
            status={status}
            onRefresh={handleRefresh}
            isRefreshing={ui.isLoading}
          />
          <PredictionCard
            selectedTarget={selectedTarget}
            prediction={prediction}
            totals={totals}
            onChangeTarget={actions.setSelectedTarget}
          />
        </div>

        <div data-walkthrough="desktop-subjects-list">
          <SubjectList subjects={subjects} />
        </div>

        <div className="flex items-center justify-end gap-2 px-1 pb-0.5">
          <span className="text-[10px] text-[#9F9AB5]">Follow us</span>
          <InstagramButton className="h-6 w-6 bg-[#4A466A]" iconClassName="h-3 w-3" />
        </div>
      </div>

      {/* Interactive walkthrough for first-time users */}
      {showWalkthrough ? (
        <Walkthrough onComplete={() => setShowWalkthrough(false)} />
      ) : null}

      {/* Demo walkthrough for guest explorers */}
      {showDemoWalkthrough ? (
        <DemoWalkthrough onComplete={() => {
          setShowDemoWalkthrough(false)
        }} />
      ) : null}
    </section>
  )
}

export default Dashboard
