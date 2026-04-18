import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CalendarGrid from '../components/history/CalendarGrid'
import CalendarHeader from '../components/history/CalendarHeader'
import DayDetailCard from '../components/history/DayDetailCard'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendanceHistory, fetchFacultyContacts, isSessionExpiredError, trackFeatureUsageEvent } from '../services/attendanceApi'

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

function isFutureDateKey(dateKey) {
  const today = new Date()
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate())
  return dateKey > todayKey
}

function normalizeCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

function isCollegeEmailEligible(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  if (!email || user?.authProvider !== 'firebase') {
    return false
  }

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

  return {
    emailSubject,
    emailBody,
  }
}

function buildMailtoUrl(facultyEmail, subject, body) {
  const to = encodeURIComponent(String(facultyEmail || '').trim())
  const encodedSubject = encodeURIComponent(String(subject || '').trim())
  const encodedBody = encodeURIComponent(String(body || '').trim())
  return `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`
}

function normalizeSubjectKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function buildMailComposeOpenedStorageKey({ date, code, subject }) {
  const dateKey = String(date || '').trim()
  const subjectKey = normalizeSubjectKey(code) || normalizeSubjectKey(subject)
  if (!dateKey || !subjectKey) {
    return null
  }
  return `mail_compose_opened_${dateKey}_${subjectKey}`
}

function buildMailSendConfirmedStorageKey({ date, code, subject }) {
  const dateKey = String(date || '').trim()
  const subjectKey = normalizeSubjectKey(code) || normalizeSubjectKey(subject)
  if (!dateKey || !subjectKey) {
    return null
  }
  return `mail_send_confirmed_${dateKey}_${subjectKey}`
}

function HistoryPage() {
  const navigate = useNavigate()
  const {
    state: { user, session, attendance },
    actions,
  } = useAppStore()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [historyBySemesterDate, setHistoryBySemesterDate] = useState({})
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [facultyBySemesterCode, setFacultyBySemesterCode] = useState({})
  const [isFacultyLoading, setIsFacultyLoading] = useState(false)
  const [showMailModal, setShowMailModal] = useState(false)
  const [showCollegeEmailPrompt, setShowCollegeEmailPrompt] = useState(false)
  const [selectedAbsentEntry, setSelectedAbsentEntry] = useState(null)
  const [reasonType, setReasonType] = useState(REASON_OPTIONS[0])
  const [additionalDetails, setAdditionalDetails] = useState('')
  const [facultyEmail, setFacultyEmail] = useState('')
  const [facultyName, setFacultyName] = useState('')
  const [facultyLoadError, setFacultyLoadError] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [isSubjectEdited, setIsSubjectEdited] = useState(false)
  const [isBodyEdited, setIsBodyEdited] = useState(false)
  const [composeError, setComposeError] = useState('')
  const [mailComposeOpenedKeys, setMailComposeOpenedKeys] = useState(() => new Set())
  const [mailSendConfirmedKeys, setMailSendConfirmedKeys] = useState(() => new Set())
  const semesterCacheKey = String(session.selectedSemester || 'default')
  const userName = String(user.portalName || user.name || user.rollNumber || user.id || 'Student').trim()
  const rollNumber = String(user.rollNumber || user.id || '').trim()
  const canComposeWithCollegeEmail = isCollegeEmailEligible(user)

  const currentSemesterFacultyMap = useMemo(() => {
    return facultyBySemesterCode[semesterCacheKey] || {}
  }, [facultyBySemesterCode, semesterCacheKey])

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

  useEffect(() => {
    const nextComposeOpenedKeys = new Set()
    const nextConfirmedKeys = new Set()
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index)
        if (key && key.startsWith('mail_compose_opened_')) {
          nextComposeOpenedKeys.add(key)
        }
        // Backward compatibility: old compose-opened keys were stored under mail_sent_.
        if (key && key.startsWith('mail_sent_')) {
          const migratedKey = key.replace('mail_sent_', 'mail_compose_opened_')
          nextComposeOpenedKeys.add(migratedKey)
        }
        if (key && key.startsWith('mail_send_confirmed_')) {
          nextConfirmedKeys.add(key)
        }
      }
    } catch {
      // Ignore localStorage read errors and keep in-memory state empty.
    }
    setMailComposeOpenedKeys(nextComposeOpenedKeys)
    setMailSendConfirmedKeys(nextConfirmedKeys)
  }, [])

  const handlePreviousMonth = () => {
    setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))
  }

  const handleResetToToday = async () => {
    const today = new Date()
    const todayDay = today.getDate()

    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(todayDay)
    await handleSelectDate(todayDay, today)
  }

  const handleSelectDate = async (day, overrideDate = null) => {
    setSelectedDate(day)
    setHistoryError('')

    const sourceDate = overrideDate || currentDate
    const year = sourceDate.getFullYear()
    const month = sourceDate.getMonth()
    const dateKey = formatDateKey(year, month, day)
    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}

    if (semesterHistory[dateKey]) {
      return
    }

    if (!session.token) {
      actions.logout()
      window.localStorage.removeItem('attend75.selectedSemester')
      navigate('/login', { replace: true })
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

      setHistoryBySemesterDate((current) => {
        const currentSemesterHistory = current[semesterCacheKey] || {}
        return {
          ...current,
          [semesterCacheKey]: {
            ...currentSemesterHistory,
            [dateKey]: normalizedEntries,
          },
        }
      })
    } catch (error) {
      if (isSessionExpiredError(error)) {
        actions.logout()
        window.localStorage.removeItem('attend75.selectedSemester')
        navigate('/login', { replace: true })
        return
      }
      setHistoryError(error.message)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const { selectedDateKey, selectedItems, selectedDisplayDate, isFutureSelectedDate } = useMemo(() => {
    if (!selectedDate) {
      return {
        selectedDateKey: null,
        selectedItems: [],
        selectedDisplayDate: '',
        isFutureSelectedDate: false,
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
        isFutureSelectedDate: false,
      }
    }

    const dateKey = formatDateKey(year, month, selectedDate)

    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}

    return {
      selectedDateKey: dateKey,
      selectedItems: semesterHistory[dateKey] || [],
      selectedDisplayDate: formatDisplayDate(year, month, selectedDate),
      isFutureSelectedDate: isFutureDateKey(dateKey),
    }
  }, [currentDate, historyBySemesterDate, selectedDate, semesterCacheKey])

  const emailDraft = useMemo(() => {
    if (!selectedAbsentEntry) {
      return { emailSubject: '', emailBody: '' }
    }

    return buildEmailDraft({
      subjectName: selectedAbsentEntry.subject || 'Subject',
      classDate: selectedAbsentEntry.date || selectedDateKey || '',
      reasonType,
      additionalDetails,
      userName,
      rollNumber,
    })
  }, [additionalDetails, reasonType, rollNumber, selectedAbsentEntry, selectedDateKey, userName])

  useEffect(() => {
    if (!showMailModal) {
      return
    }

    if (!isSubjectEdited) {
      setComposeSubject(emailDraft.emailSubject)
    }

    if (!isBodyEdited) {
      setComposeBody(emailDraft.emailBody)
    }
  }, [emailDraft, isBodyEdited, isSubjectEdited, showMailModal])

  const loadFacultyContactsForSemester = async (forceRefresh = false) => {
    if (!session.token) {
      actions.logout()
      window.localStorage.removeItem('attend75.selectedSemester')
      navigate('/login', { replace: true })
      return {}
    }

    if (!forceRefresh && facultyBySemesterCode[semesterCacheKey]) {
      return facultyBySemesterCode[semesterCacheKey]
    }

    try {
      setIsFacultyLoading(true)
      setFacultyLoadError('')

      const result = await fetchFacultyContacts({
        token: session.token,
        semesterId: session.selectedSemester,
      })

      const contacts = Array.isArray(result.contacts) ? result.contacts : []
      const nextMap = {}
      contacts.forEach((contact) => {
        const code = normalizeCode(contact?.subject_code)
        if (!code) {
          return
        }
        nextMap[code] = {
          subjectCode: code,
          facultyName: String(contact?.faculty_name || '').trim(),
          facultyEmail: String(contact?.faculty_email || '').trim(),
        }
      })

      setFacultyBySemesterCode((current) => ({
        ...current,
        [semesterCacheKey]: nextMap,
      }))

      return nextMap
    } catch (error) {
      if (isSessionExpiredError(error)) {
        actions.logout()
        window.localStorage.removeItem('attend75.selectedSemester')
        navigate('/login', { replace: true })
        return {}
      }
      setFacultyLoadError(error.message || 'Unable to load faculty email right now. Please try again.')
      return {}
    } finally {
      setIsFacultyLoading(false)
    }
  }

  const handleMailFaculty = async (entry) => {
    if (!entry || entry.status !== 'Absent') {
      return
    }

    const selectedEntry = {
      ...entry,
      date: selectedDateKey || entry.date || '',
    }

    setSelectedAbsentEntry(selectedEntry)
    setShowMailModal(true)
    setReasonType(REASON_OPTIONS[0])
    setAdditionalDetails('')
    setIsSubjectEdited(false)
    setIsBodyEdited(false)
    setComposeError('')
    setFacultyLoadError('')

    const code = normalizeCode(selectedEntry.code)
    if (!code) {
      setFacultyEmail('')
      setFacultyName('')
      return
    }

    const existingContact = currentSemesterFacultyMap[code]
    if (existingContact) {
      setFacultyEmail(existingContact.facultyEmail || '')
      setFacultyName(existingContact.facultyName || '')
      return
    }

    setFacultyEmail('')
    setFacultyName('')
    const loadedMap = await loadFacultyContactsForSemester(false)
    const loadedContact = loadedMap[code]

    setFacultyEmail(loadedContact?.facultyEmail || '')
    setFacultyName(loadedContact?.facultyName || '')
  }

  const handleComposeEmail = async () => {
    setComposeError('')

    if (!canComposeWithCollegeEmail) {
      setShowCollegeEmailPrompt(true)
      return
    }

    const toEmail = String(facultyEmail || '').trim()
    if (!toEmail) {
      setComposeError('Faculty email is unavailable for this subject right now. Please try again after refresh.')
      return
    }

    const composeOpenedKey = buildMailComposeOpenedStorageKey({
      date: selectedAbsentEntry?.date || selectedDateKey || '',
      code: selectedAbsentEntry?.code,
      subject: selectedAbsentEntry?.subject,
    })

    if (composeOpenedKey) {
      try {
        window.localStorage.setItem(composeOpenedKey, '1')
      } catch {
        // Keep UX responsive if storage write fails.
      }
      setMailComposeOpenedKeys((current) => {
        const next = new Set(current)
        next.add(composeOpenedKey)
        return next
      })
    }

    try {
      await trackFeatureUsageEvent({
        token: session.token,
        featureName: 'mail_faculty',
        actionType: 'compose_opened',
        subjectCode: selectedAbsentEntry?.code || null,
        subjectName: selectedAbsentEntry?.subject || null,
        attendanceDate: selectedAbsentEntry?.date || selectedDateKey || null,
      })
    } catch {
      // Never block user compose flow when usage tracking fails.
    }

    setShowMailModal(false)
    const mailtoUrl = buildMailtoUrl(toEmail, composeSubject, composeBody)
    window.location.href = mailtoUrl
  }

  const handleConfirmMailSent = async (entry) => {
    const targetEntry = entry || selectedAbsentEntry
    if (!targetEntry) {
      return
    }

    const confirmedKey = buildMailSendConfirmedStorageKey({
      date: targetEntry?.date || selectedDateKey || '',
      code: targetEntry?.code,
      subject: targetEntry?.subject,
    })

    if (!confirmedKey || mailSendConfirmedKeys.has(confirmedKey)) {
      return
    }

    try {
      await trackFeatureUsageEvent({
        token: session.token,
        featureName: 'mail_faculty',
        actionType: 'send_confirmed',
        subjectCode: targetEntry?.code || null,
        subjectName: targetEntry?.subject || null,
        attendanceDate: targetEntry?.date || selectedDateKey || null,
      })
    } catch {
      setComposeError('Unable to confirm send right now. Please try again.')
      return
    }

    try {
      window.localStorage.setItem(confirmedKey, '1')
    } catch {
      // Keep UX responsive if storage write fails.
    }

    setMailSendConfirmedKeys((current) => {
      const next = new Set(current)
      next.add(confirmedKey)
      return next
    })

    const composeOpenedKey = buildMailComposeOpenedStorageKey({
      date: targetEntry?.date || selectedDateKey || '',
      code: targetEntry?.code,
      subject: targetEntry?.subject,
    })
    if (composeOpenedKey) {
      try {
        window.localStorage.removeItem(composeOpenedKey)
      } catch {
        // Ignore storage cleanup failures.
      }
      setMailComposeOpenedKeys((current) => {
        const next = new Set(current)
        next.delete(composeOpenedKey)
        return next
      })
    }
  }

  const getMailFacultyStatus = (entry) => {
    const confirmedKey = buildMailSendConfirmedStorageKey({
      date: selectedDateKey || entry?.date || '',
      code: entry?.code,
      subject: entry?.subject,
    })
    if (confirmedKey && mailSendConfirmedKeys.has(confirmedKey)) {
      return 'send_confirmed'
    }

    const composeOpenedKey = buildMailComposeOpenedStorageKey({
      date: selectedDateKey || entry?.date || '',
      code: entry?.code,
      subject: entry?.subject,
    })
    if (composeOpenedKey && mailComposeOpenedKeys.has(composeOpenedKey)) {
      return 'pending_confirmation'
    }

    return 'default'
  }

  const handleConfirmMailSentFromCard = async (entry) => {
    if (!entry || entry.status !== 'Absent') {
      return
    }

    const selectedEntry = {
      ...entry,
      date: selectedDateKey || entry.date || '',
    }

    await handleConfirmMailSent(selectedEntry)
  }

  const handleMarkMailNotYet = (entry) => {
    if (!entry || entry.status !== 'Absent') {
      return
    }
    // Keep pending state as-is so the user can confirm later after sending externally.
  }

  const handleGoToCollegeLogin = async () => {
    await actions.logout()
    navigate('/login', { replace: true })
  }

  return (
    <section className="space-y-3 pb-2 sm:space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">History</h1>
        <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">View your day-wise attendance from calendar dates.</p>
        <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">select the semster you want to check.</p>
      </header>

      <div className="space-y-3 rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
        <CalendarHeader
          currentDate={currentDate}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onResetToToday={handleResetToToday}
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
          <DayDetailCard
            displayDate={selectedDisplayDate}
            attendanceItems={selectedItems}
            emptyMessage={isFutureSelectedDate ? 'Yet to attend' : 'No classes on this day 🎉'}
            onMailFaculty={handleMailFaculty}
            getMailFacultyStatus={getMailFacultyStatus}
            onConfirmMailSent={handleConfirmMailSentFromCard}
            onMarkMailNotYet={handleMarkMailNotYet}
          />
        ) : null}
      </div>

      {showMailModal && selectedAbsentEntry ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#4F487A] p-4 shadow-xl ring-1 ring-white/10 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white sm:text-xl">Mail Faculty for Absent Class</h3>
                <p className="mt-1 text-xs text-[#D8D3E8] sm:text-sm">Create a professional request email and open your mail app instantly.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMailModal(false)
                  setComposeError('')
                }}
                className="rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-white/10"
                aria-label="Close mail faculty modal"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-[#D8D3E8]">Subject Name</span>
                <input
                  value={selectedAbsentEntry.subject || ''}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-white/20 bg-[#5B5485] px-3 py-2 text-sm text-[#F4F1FF]"
                />
              </label>

              <label className="block">
                <span className="text-xs text-[#D8D3E8]">Date of class</span>
                <input
                  value={selectedAbsentEntry.date || selectedDateKey || ''}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-white/20 bg-[#5B5485] px-3 py-2 text-sm text-[#F4F1FF]"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs text-[#D8D3E8]">Faculty Email (auto-filled)</span>
                <input
                  value={facultyEmail}
                  onChange={(event) => setFacultyEmail(event.target.value)}
                  placeholder={isFacultyLoading ? 'Loading faculty email...' : 'faculty@college.edu'}
                  className="mt-1 w-full rounded-xl border border-white/20 bg-[#5B5485] px-3 py-2 text-sm text-[#F4F1FF] placeholder:text-[#CFC5E8]"
                />
              </label>

              {facultyName ? (
                <p className="sm:col-span-2 text-xs text-[#D8D3E8]">Faculty: {facultyName}</p>
              ) : null}
              {facultyLoadError ? (
                <p className="sm:col-span-2 rounded-lg border border-[#F87171]/40 bg-[#7F1D1D]/20 px-3 py-2 text-xs text-[#FECACA]">{facultyLoadError}</p>
              ) : null}

              <label className="block">
                <span className="text-xs text-[#D8D3E8]">Reason Type</span>
                <select
                  value={reasonType}
                  onChange={(event) => setReasonType(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/20 bg-[#5B5485] px-3 py-2 text-sm text-[#F4F1FF]"
                >
                  {REASON_OPTIONS.map((reasonOption) => (
                    <option key={reasonOption} value={reasonOption}>
                      {reasonOption}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs text-[#D8D3E8]">Additional Details</span>
                <textarea
                  value={additionalDetails}
                  onChange={(event) => setAdditionalDetails(event.target.value)}
                  rows={3}
                  placeholder="Optional context for faculty"
                  className="mt-1 w-full rounded-xl border border-white/20 bg-[#5B5485] px-3 py-2 text-sm text-[#F4F1FF] placeholder:text-[#CFC5E8]"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs text-[#D8D3E8]">Email Subject</span>
                <input
                  value={composeSubject}
                  onChange={(event) => {
                    setComposeSubject(event.target.value)
                    setIsSubjectEdited(true)
                  }}
                  className="mt-1 w-full rounded-xl border border-white/20 bg-[#5B5485] px-3 py-2 text-sm text-[#F4F1FF]"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs text-[#D8D3E8]">Email Body</span>
                <textarea
                  value={composeBody}
                  onChange={(event) => {
                    setComposeBody(event.target.value)
                    setIsBodyEdited(true)
                  }}
                  rows={8}
                  className="mt-1 w-full rounded-xl border border-white/20 bg-[#5B5485] px-3 py-2 text-sm text-[#F4F1FF]"
                />
              </label>

              <div className="sm:col-span-2 rounded-xl border border-white/15 bg-[#5B5485] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#E2BC8B]">Email Preview</p>
                <p className="mt-2 text-xs text-[#D8D3E8]">Subject: {composeSubject}</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-[#F4F1FF]">{composeBody}</pre>
              </div>
            </div>

            {composeError ? (
              <p className="mt-3 rounded-lg border border-[#F87171]/40 bg-[#7F1D1D]/20 px-3 py-2 text-xs text-[#FECACA]">{composeError}</p>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMailModal(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-[#E7DEDE] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleComposeEmail}
                className="rounded-full bg-[#E2BC8B] px-4 py-2 text-sm font-semibold text-[#1D183E] hover:bg-[#D9AA6F]"
              >
                Compose Email
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCollegeEmailPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#4F487A] p-5 shadow-xl ring-1 ring-white/10">
            <h3 className="text-lg font-semibold text-white">College Email Required</h3>
            <p className="mt-2 text-sm text-[#D8D3E8]">
              Please log in with your college email ID to compose and send emails to faculty. This ensures your request is sent from an official identity.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCollegeEmailPrompt(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-[#E7DEDE] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGoToCollegeLogin}
                className="rounded-full bg-[#E2BC8B] px-4 py-2 text-sm font-semibold text-[#1D183E] hover:bg-[#D9AA6F]"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default HistoryPage
