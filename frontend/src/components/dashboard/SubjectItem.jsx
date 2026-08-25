import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../../hooks/useAppStore'
import {
  fetchAttendanceHistory,
  fetchFacultyContacts,
  isSessionExpiredError,
  trackFeatureUsageEvent,
} from '../../services/attendanceApi'

const REASON_OPTIONS = [
  'Sick / Medical Reason',
  'Medical Appointment',
  'Family Emergency',
  'Transport Issue',
  'Official College Event',
  'Personal Reason',
  'Missed Attendance (was present but not marked)',
  'Other',
]

const IBS_COLLEGE_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@(ibsindia|ifheindia)\.org$/i

function isCollegeEmailEligible(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  if (!email || user?.authProvider !== 'firebase') return false
  return IBS_COLLEGE_EMAIL_REGEX.test(email)
}

function buildReasonParagraph(reasonType) {
  switch (reasonType) {
    case 'Sick / Medical Reason':
      return 'I was unwell on that day and could not attend the class.'
    case 'Medical Appointment':
      return 'I had a medical appointment during class hours and could not attend the session.'
    case 'Family Emergency':
      return 'I had a family emergency due to which I could not attend the class.'
    case 'Transport Issue':
      return 'I faced an unexpected transport issue and was unable to reach class on time.'
    case 'Official College Event':
      return 'I was attending an official college event during that class period.'
    case 'Personal Reason':
      return 'I was unable to attend the class due to a personal reason.'
    case 'Missed Attendance (was present but not marked)':
      return 'I attended the class, however my attendance was not recorded. I kindly request you to verify and update it if possible.'
    case 'Other':
      return 'I was unable to attend the class due to an unavoidable reason.'
    default:
      return 'I was unable to attend the class due to an unavoidable reason.'
  }
}

function buildEmailDraft({ subjectName, classDate, reasonType, additionalDetails, userName, rollNumber }) {
  const reasonParagraph = buildReasonParagraph(reasonType)
  const details = String(additionalDetails || '').trim()
  const detailLine = details ? ` ${details}` : ''
  const emailSubject = `Request for attendance consideration for class on ${classDate}`
  const emailBody = [
    'Dear Sir/Madam,',
    '',
    `I hope you are doing well. I was marked absent for ${subjectName} on ${classDate}. ${reasonParagraph}${detailLine} I kindly request you to consider my attendance if possible.`,
    '',
    'Thank you for your time and understanding.',
    '',
    'Regards,',
    userName,
    `Roll No: ${rollNumber}`,
  ].join('\n')
  return { emailSubject, emailBody }
}

function buildMailtoUrl(facultyEmail, subject, body) {
  const to = encodeURIComponent(String(facultyEmail || '').trim())
  const encodedSubject = encodeURIComponent(String(subject || '').trim())
  const encodedBody = encodeURIComponent(String(body || '').trim())
  return `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '')
}

function getAdvisoryText({ percentage, canMiss, toAttend, leftClasses, maxPossible, targetRatio }) {
  const targetPercent = Math.round(targetRatio * 100)
  if (maxPossible !== null && maxPossible < targetPercent) {
    return `${targetPercent}% is unreachable. Best case is ${maxPossible.toFixed(1)}% — mail faculty to recover absences.`
  }
  if (percentage > 75 && canMiss > 0) {
    return `Comfortable — you can skip up to ${canMiss} of the ${leftClasses} remaining and stay above ${targetPercent}%.`
  }
  if (percentage > 75 && canMiss === 0) {
    return `Right at the edge — attend all remaining classes to stay above ${targetPercent}%.`
  }
  if (toAttend > 0 && toAttend >= leftClasses) {
    return `No slack. Attend all ${leftClasses} remaining classes to finish at ${targetPercent}%.`
  }
  if (toAttend > 0) {
    return `Attend at least ${toAttend} more classes to reach ${targetPercent}%.`
  }
  return `On track for ${targetPercent}%.`
}

function SubjectItem({ subject }) {
  const navigate = useNavigate()
  const {
    state: { user, session },
    actions,
  } = useAppStore()

  const [isExpanded, setExpanded] = useState(false)
  const [showMailModal, setShowMailModal] = useState(false)
  const [showCollegeEmailPrompt, setShowCollegeEmailPrompt] = useState(false)
  const [reasonType, setReasonType] = useState(REASON_OPTIONS[0])
  const [additionalDetails, setAdditionalDetails] = useState('')
  const [facultyEmail, setFacultyEmail] = useState('')
  const [facultyName, setFacultyName] = useState('')
  const [isFacultyLoading, setIsFacultyLoading] = useState(false)
  const [facultyLoadError, setFacultyLoadError] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [isSubjectEdited, setIsSubjectEdited] = useState(false)
  const [isBodyEdited, setIsBodyEdited] = useState(false)
  const [composeError, setComposeError] = useState('')
  const [latestAbsenceDate, setLatestAbsenceDate] = useState('')
  const [isLoadingAbsence, setIsLoadingAbsence] = useState(false)

  const percentageColor =
    subject.percentage > 75 ? '#4EF0A0' : subject.percentage >= 60 ? '#FFB23E' : '#FF5B5B'
  const statusLabel = subject.percentage > 75 ? 'Safe' : subject.percentage >= 65 ? 'Tight' : 'At Risk'
  const statusClass =
    subject.percentage > 75
      ? 'border-[#4EF0A0]/50 bg-[#4EF0A0]/12 text-[#4EF0A0]'
      : subject.percentage >= 65
        ? 'border-[#FFB23E]/50 bg-[#FFB23E]/12 text-[#FFB23E]'
        : 'border-[#FF5B5B]/50 bg-[#FF5B5B]/12 text-[#FF5B5B]'
  const leftClasses = Number(subject.classesLeft) || 0
  const attendedClasses = Number(subject.attendedClasses) || 0
  const conductedClasses = Number(subject.totalClasses) || 0
  const totalSessions = conductedClasses + leftClasses
  const targetRatio = 0.75
  const canMiss = Math.max(0, Math.floor(attendedClasses + leftClasses - targetRatio * totalSessions))
  const toAttend = Math.min(leftClasses, Math.max(0, Math.ceil(targetRatio * totalSessions - attendedClasses)))
  const shortName = subject.shortName || subject.id?.toUpperCase?.() || subject.name.slice(0, 4).toUpperCase()
  const maxPossible = subject.maxPossiblePercentage
  const isUnreachable = maxPossible !== null && maxPossible !== undefined && maxPossible < 75
  const canComposeWithCollegeEmail = isCollegeEmailEligible(user)
  const userName = String(user.portalName || user.name || user.rollNumber || user.id || 'Student').trim()
  const rollNumber = String(user.rollNumber || user.id || '').trim()

  const advisory = getAdvisoryText({ percentage: subject.percentage, canMiss, toAttend, leftClasses, maxPossible, targetRatio })

  let fourthLabel, fourthValue, fourthColor
  if (isUnreachable) {
    fourthLabel = 'Max'
    fourthValue = `${maxPossible.toFixed(1)}%`
    fourthColor = '#FF5B5B'
  } else if (subject.percentage > 75) {
    fourthLabel = 'Can Miss'
    fourthValue = canMiss
    fourthColor = '#4EF0A0'
  } else {
    fourthLabel = 'To Attend'
    fourthValue = toAttend
    fourthColor = '#FFB23E'
  }

  const emailDraft = useMemo(() => {
    return buildEmailDraft({
      subjectName: subject.name || shortName,
      classDate: latestAbsenceDate || new Date().toISOString().slice(0, 10),
      reasonType,
      additionalDetails,
      userName,
      rollNumber,
    })
  }, [additionalDetails, latestAbsenceDate, reasonType, rollNumber, shortName, subject.name, userName])

  useEffect(() => {
    if (!showMailModal) return
    if (!isSubjectEdited) setComposeSubject(emailDraft.emailSubject)
    if (!isBodyEdited) setComposeBody(emailDraft.emailBody)
  }, [emailDraft, isBodyEdited, isSubjectEdited, showMailModal])

  const loadFacultyEmail = useCallback(async () => {
    if (!session.token) return
    const code = normalizeCode(subject.id)
    if (!code) return

    try {
      setIsFacultyLoading(true)
      setFacultyLoadError('')
      const result = await fetchFacultyContacts({ token: session.token, semesterId: session.selectedSemester })
      const contacts = Array.isArray(result.contacts) ? result.contacts : []
      const match = contacts.find((c) => normalizeCode(c?.subject_code) === code)
      setFacultyEmail(String(match?.faculty_email || '').trim())
      setFacultyName(String(match?.faculty_name || '').trim())
    } catch (error) {
      if (isSessionExpiredError(error)) {
        actions.logout()
        navigate('/login', { replace: true })
        return
      }
      setFacultyLoadError('Unable to load faculty email. Please try again.')
    } finally {
      setIsFacultyLoading(false)
    }
  }, [actions, navigate, session.selectedSemester, session.token, subject.id])

  const findLatestAbsence = useCallback(async () => {
    if (!session.token) return
    try {
      setIsLoadingAbsence(true)
      // Fetch recent days to find the most recent absence for this subject
      const today = new Date()
      const code = normalizeCode(subject.id)
      let foundDate = ''

      for (let daysBack = 0; daysBack <= 14; daysBack++) {
        const checkDate = new Date(today)
        checkDate.setDate(today.getDate() - daysBack)
        const dateKey = checkDate.toISOString().slice(0, 10)

        try {
          const result = await fetchAttendanceHistory({
            token: session.token,
            semesterId: session.selectedSemester,
            date: dateKey,
          })
          const entries = Array.isArray(result.entries) ? result.entries : []
          const absence = entries.find(
            (e) => normalizeCode(e?.code) === code && !e?.attended,
          )
          if (absence) {
            foundDate = dateKey
            break
          }
        } catch {
          // Skip dates that fail
        }
      }

      setLatestAbsenceDate(foundDate || today.toISOString().slice(0, 10))
    } catch {
      setLatestAbsenceDate(new Date().toISOString().slice(0, 10))
    } finally {
      setIsLoadingAbsence(false)
    }
  }, [session.selectedSemester, session.token, subject.id])

  const handleMailFaculty = async () => {
    if (user.authProvider === 'demo') {
      setShowCollegeEmailPrompt(true)
      return
    }

    if (!canComposeWithCollegeEmail) {
      setShowCollegeEmailPrompt(true)
      return
    }

    setShowMailModal(true)
    setReasonType(REASON_OPTIONS[0])
    setAdditionalDetails('')
    setIsSubjectEdited(false)
    setIsBodyEdited(false)
    setComposeError('')
    setFacultyLoadError('')

    await Promise.all([loadFacultyEmail(), findLatestAbsence()])
  }

  const handleComposeEmail = async () => {
    setComposeError('')
    const toEmail = String(facultyEmail || '').trim()
    if (!toEmail) {
      setComposeError('Faculty email is unavailable for this subject right now.')
      return
    }

    try {
      await trackFeatureUsageEvent({
        token: session.token,
        featureName: 'mail_faculty',
        actionType: 'compose_opened',
        subjectCode: subject.id || null,
        subjectName: subject.name || null,
        attendanceDate: latestAbsenceDate || null,
      })
    } catch {
      // Never block compose flow
    }

    setShowMailModal(false)
    window.location.href = buildMailtoUrl(toEmail, composeSubject, composeBody)

    // Track send confirmed after opening mailto
    try {
      await trackFeatureUsageEvent({
        token: session.token,
        featureName: 'mail_faculty',
        actionType: 'send_confirmed',
        subjectCode: subject.id || null,
        subjectName: subject.name || null,
        attendanceDate: latestAbsenceDate || null,
      })
    } catch {
      // Best effort
    }
  }

  const handleGoToCollegeLogin = async () => {
    await actions.logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <article
        className="group overflow-hidden rounded-xl border border-white/10 bg-[#565275] transition-all duration-300 ease-out hover:border-white/20 hover:shadow-[0_4px_20px_rgba(40,36,62,0.3)]"
        style={{ animationFillMode: 'both' }}
      >
        {/* Header row */}
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={isExpanded}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-300 group-hover:scale-125"
            style={{ backgroundColor: percentageColor }}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold leading-tight text-[#F7F4FF]">{shortName}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide transition-opacity duration-200 ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
            {subject.name && subject.name !== shortName ? (
              <p className="mt-0.5 truncate text-[11px] font-medium text-[#9F9AB5]">{subject.name}</p>
            ) : null}
          </div>

          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            <span className="text-[11px] font-semibold text-[#C8C4D8]">
              {attendedClasses}/{conductedClasses}
            </span>
            <div className="relative h-2 w-24 overflow-hidden rounded-full bg-[#302A52]">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, subject.percentage))}%`, backgroundColor: percentageColor }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-[#F7F4FF]/80"
                style={{ left: `${Math.max(0, Math.min(99, subject.percentage))}%` }}
              />
            </div>
            <span className="w-10 text-right text-[13px] font-extrabold transition-colors duration-300" style={{ color: percentageColor }}>
              {subject.percentage}%
            </span>
          </div>

          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#9F9AB5] transition-transform duration-300 ease-out ${isExpanded ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </button>

        {/* Mobile progress bar */}
        <div className="flex items-center gap-2 px-4 pb-2 sm:hidden">
          <span className="text-[10px] font-semibold text-[#C8C4D8]">
            {attendedClasses}/{conductedClasses}
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#302A52]">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, subject.percentage))}%`, backgroundColor: percentageColor }}
            />
          </div>
          <span className="text-[11px] font-extrabold" style={{ color: percentageColor }}>
            {subject.percentage}%
          </span>
        </div>

        {/* Expanded detail */}
        <div
          className={[
            'grid transition-[grid-template-rows] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          ].join(' ')}
        >
          <div className="overflow-hidden">
            <div
              className={`border-t border-white/10 px-4 pb-4 pt-3 transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}
            >
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
                {[
                  ['Attended', attendedClasses, '#F7F4FF'],
                  ['Conducted', conductedClasses, '#F7F4FF'],
                  ['Left', leftClasses, '#F7F4FF'],
                  [fourthLabel, fourthValue, fourthColor],
                ].map(([label, value, color]) => (
                  <div key={label}>
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#BDB8CC]">{label}</p>
                    <p className="mt-1 text-2xl font-extrabold leading-none" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Advisory text */}
              <p className="mt-3 text-[12px] font-medium leading-relaxed text-[#D8D4E7]">
                {advisory}
              </p>

              {/* Mail faculty button */}
              {(isUnreachable || subject.percentage < 75) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMailFaculty()
                  }}
                  className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-[#FF916C]/30 px-4 py-2.5 transition-all duration-300 hover:border-[#FF916C]/60 hover:shadow-[0_0_16px_rgba(255,145,108,0.15)]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,145,108,0.08) 0%, rgba(255,145,108,0.02) 100%)',
                  }}
                >
                  <Mail className="h-4 w-4 text-[#FF916C]" strokeWidth={1.8} />
                  <span className="text-[13px] font-semibold text-[#FF916C]">Mail faculty</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </article>

      {/* Mail compose modal */}
      {showMailModal ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setShowMailModal(false)}
        >
          <div
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#2D2845] p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#F7F4FF]">Mail Faculty</h3>
                <p className="mt-0.5 text-xs text-[#9F9AB5]">Compose a professional attendance request email.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMailModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9F9AB5] transition hover:bg-white/10 hover:text-[#F7F4FF]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {isLoadingAbsence ? (
              <p className="mt-3 text-xs text-[#9F9AB5]">Finding most recent absence...</p>
            ) : null}

            {/* Top section: class info card + details */}
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr]">
              {/* Subject/Date card - solid orange */}
              <div className="flex items-center gap-3 rounded-xl bg-[#E8875C] px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/15">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Subject: {shortName}</p>
                  <p className="text-xs text-white/80">Date: {latestAbsenceDate || '...'}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Class Details</p>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#9F9AB5]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <input
                    value={facultyEmail}
                    onChange={(e) => setFacultyEmail(e.target.value)}
                    placeholder={isFacultyLoading ? 'Loading...' : 'faculty@college.edu'}
                    className="w-full rounded-lg border border-white/10 bg-[#3D3660] px-3 py-1.5 text-sm text-[#F7F4FF] placeholder:text-[#6E6A88] outline-none focus:border-[#FF916C]/50"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#9F9AB5]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <select
                    value={reasonType}
                    onChange={(e) => setReasonType(e.target.value)}
                    className="w-full rounded-lg border border-[#FF916C]/60 bg-[#3D3660] px-3 py-1.5 text-sm text-[#F7F4FF] outline-none ring-1 ring-[#FF916C]/30 focus:ring-[#FF916C]/60"
                  >
                    {REASON_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#9F9AB5]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <input
                    value={userName}
                    readOnly
                    className="w-full rounded-lg border border-white/10 bg-[#3D3660] px-3 py-1.5 text-sm text-[#F7F4FF]"
                  />
                </div>
              </div>
            </div>

            {facultyName ? (
              <p className="mt-2 text-[11px] text-[#9F9AB5]">Faculty: {facultyName}</p>
            ) : null}
            {facultyLoadError ? (
              <p className="mt-2 rounded-lg border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-3 py-2 text-xs text-[#FFD4D4]">{facultyLoadError}</p>
            ) : null}

            {/* Email subject */}
            <div className="mt-4">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Subject</span>
                <input
                  value={composeSubject}
                  onChange={(e) => { setComposeSubject(e.target.value); setIsSubjectEdited(true) }}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#3D3660] px-3 py-2 text-sm text-[#F7F4FF] outline-none focus:border-[#FF916C]/50"
                />
              </label>
            </div>

            {/* Email body */}
            <div className="mt-3 rounded-xl border border-white/10 bg-[#3D3660]">
              <textarea
                value={composeBody}
                onChange={(e) => { setComposeBody(e.target.value); setIsBodyEdited(true) }}
                rows={10}
                className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-sm leading-relaxed text-[#F7F4FF] outline-none"
              />
            </div>

            {composeError ? (
              <p className="mt-3 rounded-lg border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-3 py-2 text-xs text-[#FFD4D4]">{composeError}</p>
            ) : null}

            {/* Footer */}
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowMailModal(false)}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-[#D8D4E7] transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleComposeEmail}
                disabled={isFacultyLoading || isLoadingAbsence}
                className="rounded-full px-6 py-2.5 text-sm font-bold text-[#1D183E] shadow-[0_0_20px_rgba(255,145,108,0.3)] transition hover:brightness-110 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #FF916C 0%, #FFAA8D 100%)' }}
              >
                Compose Email
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* College email prompt */}
      {showCollegeEmailPrompt ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
          onClick={() => setShowCollegeEmailPrompt(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#4A466A] p-5 shadow-xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">{user.authProvider === 'demo' ? 'Login Required' : 'College Email Required'}</h3>
            <p className="mt-2 text-sm text-[#D8D4E7]">
              {user.authProvider === 'demo'
                ? "You're viewing demo data. Login with your portal credentials to mail faculty about your attendance."
                : 'Please log in with your college email to compose and send emails to faculty. This ensures your request is sent from an official identity.'
              }
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCollegeEmailPrompt(false)}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-[#D8D4E7] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGoToCollegeLogin}
                className="rounded-full px-4 py-2 text-sm font-semibold text-[#1D183E]"
                style={{ background: 'linear-gradient(135deg, #FF916C 0%, #FFAA8D 100%)' }}
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default SubjectItem
