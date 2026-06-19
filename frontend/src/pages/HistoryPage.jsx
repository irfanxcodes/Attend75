import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AnimatedDetailSection from '../components/history/AnimatedDetailSection'
import CalendarGrid from '../components/history/CalendarGrid'
import CalendarHeader from '../components/history/CalendarHeader'
import DayDetailCard from '../components/history/DayDetailCard'
import HistorySidebar from '../components/history/HistorySidebar'
import GuestLoginPrompt, { useGuestPrompt } from '../components/common/GuestLoginPrompt'
import useAppStore from '../hooks/useAppStore'
import { fetchAttendanceHistory, fetchAttendanceStreak, fetchFacultyContacts, isSessionExpiredError, trackFeatureUsageEvent } from '../services/attendanceApi'
import { DEMO_HISTORY } from '../constants/demoData'

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
  const location = useLocation()
  const {
    state: { user, session, attendance },
    actions,
  } = useAppStore()

  const isDemo = user.authProvider === 'demo'
  const guestPrompt = useGuestPrompt()

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

    // Demo mode: use demo history data
    if (isDemo) {
      const demoEntries = DEMO_HISTORY[dateKey] || []
      setHistoryBySemesterDate((current) => ({
        ...current,
        [semesterCacheKey]: { ...current[semesterCacheKey], [dateKey]: demoEntries },
      }))
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

  // Auto-mail: when navigated from Dashboard with autoMailSubjectCode
  const autoMailHandledRef = useRef(false)
  useEffect(() => {
    if (autoMailHandledRef.current) return
    const autoMailCode = location.state?.autoMailSubjectCode
    if (!autoMailCode || !session.token || isDemo) return

    autoMailHandledRef.current = true

    // Clear the location state so refresh doesn't re-trigger
    window.history.replaceState({}, '')

    // Scroll to top so the modal isn't mispositioned
    window.scrollTo(0, 0)

    const normalizedTarget = normalizeCode(autoMailCode)

    ;(async () => {
      // Fetch history for today — backend caches entire semester history on first call
      const today = new Date()
      const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate())

      try {
        setIsLoadingHistory(true)
        const result = await fetchAttendanceHistory({
          token: session.token,
          semesterId: session.selectedSemester,
          date: todayKey,
        })

        const normalizedEntries = (result.entries || []).map((entry) => {
          const codeKey = normalizeCode(entry?.code)
          const abbreviation = subjectAbbreviationByCode[codeKey]
          return { ...entry, subject: abbreviation || entry.subject }
        })

        setHistoryBySemesterDate((current) => ({
          ...current,
          [semesterCacheKey]: { ...current[semesterCacheKey], [todayKey]: normalizedEntries },
        }))

        // Now search backwards from today for the last absent date for this subject
        // First check today's data
        let foundEntry = normalizedEntries.find(
          (e) => normalizeCode(e.code) === normalizedTarget && !e.attended
        )
        let foundDateKey = todayKey

        if (!foundEntry) {
          // Search previous days (up to 30 days back)
          for (let daysBack = 1; daysBack <= 30; daysBack++) {
            const pastDate = new Date(today)
            pastDate.setDate(pastDate.getDate() - daysBack)
            const pastKey = formatDateKey(pastDate.getFullYear(), pastDate.getMonth(), pastDate.getDate())

            try {
              const pastResult = await fetchAttendanceHistory({
                token: session.token,
                semesterId: session.selectedSemester,
                date: pastKey,
              })

              const pastEntries = (pastResult.entries || []).map((entry) => {
                const codeKey = normalizeCode(entry?.code)
                const abbreviation = subjectAbbreviationByCode[codeKey]
                return { ...entry, subject: abbreviation || entry.subject }
              })

              setHistoryBySemesterDate((current) => ({
                ...current,
                [semesterCacheKey]: { ...current[semesterCacheKey], [pastKey]: pastEntries },
              }))

              foundEntry = pastEntries.find(
                (e) => normalizeCode(e.code) === normalizedTarget && !e.attended
              )
              if (foundEntry) {
                foundDateKey = pastKey
                break
              }
            } catch {
              // Skip dates that fail to load
            }
          }
        }

        if (foundEntry) {
          // Set calendar to the correct month/date
          const [year, month, day] = foundDateKey.split('-').map(Number)
          setCurrentDate(new Date(year, month - 1, 1))
          setSelectedDate(day)

          // Trigger mail modal for this entry
          const selectedEntry = { ...foundEntry, date: foundDateKey }
          setSelectedAbsentEntry(selectedEntry)
          setShowMailModal(true)
          setReasonType(REASON_OPTIONS[0])
          setAdditionalDetails('')
          setIsSubjectEdited(false)
          setIsBodyEdited(false)
          setComposeError('')
          setFacultyLoadError('')

          // Load faculty email
          const code = normalizeCode(selectedEntry.code)
          if (code) {
            const loadedMap = await loadFacultyContactsForSemester(false)
            const loadedContact = loadedMap[code]
            setFacultyEmail(loadedContact?.facultyEmail || '')
            setFacultyName(loadedContact?.facultyName || '')
          }
        }
      } catch (error) {
        if (isSessionExpiredError(error)) {
          actions.logout()
          window.localStorage.removeItem('attend75.selectedSemester')
          navigate('/login', { replace: true })
        }
      } finally {
        setIsLoadingHistory(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build day status map for calendar dot indicators
  const calendarDayStatus = useMemo(() => {
    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const statusMap = {}

    Object.entries(semesterHistory).forEach(([dateKey, entries]) => {
      if (!Array.isArray(entries) || entries.length === 0) return
      // Check if date belongs to current displayed month
      const [y, m, d] = dateKey.split('-').map(Number)
      if (y !== year || m !== month + 1) return

      const allPresent = entries.every((e) => e.attended || e.status === 'Present')
      const allAbsent = entries.every((e) => !e.attended && e.status !== 'Present')

      if (allPresent) statusMap[d] = 'all_present'
      else if (allAbsent) statusMap[d] = 'all_absent'
      else statusMap[d] = 'some_absent'
    })

    return statusMap
  }, [currentDate, historyBySemesterDate, semesterCacheKey])

  // Compute current streak via backend endpoint (loads full history cache as side effect)
  const [currentStreak, setCurrentStreak] = useState(null)
  const [isStreakLoading, setIsStreakLoading] = useState(true)
  const streakFetchedRef = useRef(false)

  useEffect(() => {
    if (!session.token || streakFetchedRef.current) {
      setIsStreakLoading(false)
      return
    }

    // Demo mode: set a fake streak, no API call
    if (isDemo) {
      setCurrentStreak(6)
      setIsStreakLoading(false)
      streakFetchedRef.current = true
      return
    }

    // Check localStorage cache (valid for today only)
    const cacheKey = `attend75.streak.${session.selectedSemester || 'default'}.${new Date().toISOString().slice(0, 10)}`
    const cached = window.localStorage.getItem(cacheKey)
    if (cached !== null) {
      setCurrentStreak(Number(cached) || 0)
      setIsStreakLoading(false)
      streakFetchedRef.current = true
      return
    }

    streakFetchedRef.current = true
    void (async () => {
      try {
        const streak = await fetchAttendanceStreak({ token: session.token, semesterId: session.selectedSemester })
        setCurrentStreak(streak)
        // Cache for today
        try { window.localStorage.setItem(cacheKey, String(streak)) } catch { /* ignore */ }
      } catch {
        setCurrentStreak(0)
      } finally {
        setIsStreakLoading(false)
      }
    })()
  }, [session.selectedSemester, session.token])

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

    if (isDemo) {
      guestPrompt.showPrompt('mail your faculty about attendance')
      return
    }

    const selectedEntry = {
      ...entry,
      date: entry.date || selectedDateKey || '',
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

  // Compute present/absent counts from subjects
  const presentCount = useMemo(() => {
    const subjects = Array.isArray(attendance?.subjects) ? attendance.subjects : []
    return subjects.reduce((sum, s) => sum + (Number(s.attendedClasses) || 0), 0)
  }, [attendance?.subjects])

  const absentCount = useMemo(() => {
    const subjects = Array.isArray(attendance?.subjects) ? attendance.subjects : []
    const total = subjects.reduce((sum, s) => sum + (Number(s.totalClasses) || 0), 0)
    return Math.max(0, total - presentCount)
  }, [attendance?.subjects, presentCount])

  // Count unmailed absences for current month from history data
  const unmailedAbsencesCount = useMemo(() => {
    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    let count = 0

    Object.entries(semesterHistory).forEach(([dateKey, entries]) => {
      if (!Array.isArray(entries)) return
      const [y, m] = dateKey.split('-').map(Number)
      if (y !== year || m !== month + 1) return

      entries.forEach((entry) => {
        if (entry.attended || entry.status === 'Present') return
        const key = buildMailSendConfirmedStorageKey({ date: dateKey, code: entry.code, subject: entry.subject })
        if (!key || !mailSendConfirmedKeys.has(key)) count++
      })
    })
    return count
  }, [currentDate, historyBySemesterDate, mailSendConfirmedKeys, semesterCacheKey])

  const unmailedAbsencesList = useMemo(() => {
    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const list = []

    Object.entries(semesterHistory).forEach(([dateKey, entries]) => {
      if (!Array.isArray(entries)) return
      const [y, m] = dateKey.split('-').map(Number)
      if (y !== year || m !== month + 1) return

      entries.forEach((entry) => {
        if (entry.attended || entry.status === 'Present') return
        const key = buildMailSendConfirmedStorageKey({ date: dateKey, code: entry.code, subject: entry.subject })
        if (!key || !mailSendConfirmedKeys.has(key)) {
          list.push({ ...entry, date: dateKey })
        }
      })
    })

    // Sort by date descending (most recent first)
    list.sort((a, b) => b.date.localeCompare(a.date))
    return list
  }, [currentDate, historyBySemesterDate, mailSendConfirmedKeys, semesterCacheKey])

  // Mobile view mode state
  const [mobileViewMode, setMobileViewMode] = useState('calendar') // 'calendar' | 'timeline'
  const [unmailedExpanded, setUnmailedExpanded] = useState(false)

  // Timeline view: recent days (last 7 days going back)
  const recentDays = useMemo(() => {
    const days = []
    const today = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      days.push({
        date: d,
        day: d.getDate(),
        month: d.getMonth(),
        year: d.getFullYear(),
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        dateKey: formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()),
      })
    }
    return days
  }, [])

  // Timeline selected date
  const [timelineSelectedKey, setTimelineSelectedKey] = useState(() => {
    const today = new Date()
    return formatDateKey(today.getFullYear(), today.getMonth(), today.getDate())
  })

  const handleTimelineDateSelect = async (dateInfo) => {
    setTimelineSelectedKey(dateInfo.dateKey)
    // Also update the calendar selection to stay in sync
    setCurrentDate(new Date(dateInfo.year, dateInfo.month, 1))
    setSelectedDate(dateInfo.day)
    // Fetch history for this date if needed
    await handleSelectDate(dateInfo.day, dateInfo.date)
  }

  // Timeline items for selected date
  const timelineItems = useMemo(() => {
    const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}
    return semesterHistory[timelineSelectedKey] || []
  }, [historyBySemesterDate, semesterCacheKey, timelineSelectedKey])

  const timelineAttendedCount = timelineItems.filter((e) => e.attended || e.status === 'Present').length
  const timelinePercentage = timelineItems.length > 0 ? Math.round((timelineAttendedCount / timelineItems.length) * 100) : 0

  const timelineDisplayDate = useMemo(() => {
    const [y, m, d] = timelineSelectedKey.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return {
      weekday: date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      day: d,
    }
  }, [timelineSelectedKey])

  return (
    <section className="pb-2">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="space-y-2.5 md:hidden">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#F7F4FF]">History</h1>
            <p className="text-[10px] text-[#9F9AB5]">Synced 8:42 AM</p>
          </div>
          {/* Month pill */}
          <span className="rounded-full border border-white/15 bg-[#3D3660] px-2.5 py-1 text-[10px] font-bold text-[#D8D4E7]">
            {currentDate.toLocaleString('en-US', { month: 'short' }).toUpperCase()} {currentDate.getFullYear()}
          </span>
        </div>

        {/* Summary stats - flat row with dividers */}
        <div className="flex items-center rounded-xl bg-[#4A466A] ring-1 ring-white/5">
          <div className="flex-1 py-3 text-center">
            <p className="text-2xl font-extrabold text-[#4EF0A0]">{presentCount}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[#9F9AB5]">Present</p>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="flex-1 py-3 text-center">
            <p className="text-2xl font-extrabold text-[#FF5B5B]">{absentCount}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[#9F9AB5]">Absent</p>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="flex-1 py-3 text-center">
            {isStreakLoading ? (
              <p className="text-2xl font-extrabold text-[#FFB23E]"><span className="inline-block h-7 w-10 animate-pulse rounded bg-[#FFB23E]/20" /></p>
            ) : (
              <p className="text-2xl font-extrabold text-[#FFB23E]">{currentStreak ?? 0} <span className="text-base">days</span></p>
            )}
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[#9F9AB5]">Streak</p>
          </div>
        </div>

        {/* View toggle - premium pill switch */}
        <div className="flex items-center justify-center">
          <div className="relative flex rounded-full bg-[#2D2845] p-1 ring-1 ring-white/10">
            <div
              className="absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-full bg-[#FF916C] shadow-[0_0_12px_rgba(255,145,108,0.4)] transition-all duration-300 ease-out"
              style={{ left: mobileViewMode === 'calendar' ? '4px' : 'calc(50%)' }}
            />
            <button
              type="button"
              onClick={() => setMobileViewMode('calendar')}
              className={`relative z-10 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold transition-colors duration-200 ${
                mobileViewMode === 'calendar' ? 'text-[#1D183E]' : 'text-[#9F9AB5]'
              }`}
            >
              📅 Calendar
            </button>
            <button
              type="button"
              onClick={() => setMobileViewMode('timeline')}
              className={`relative z-10 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold transition-colors duration-200 ${
                mobileViewMode === 'timeline' ? 'text-[#1D183E]' : 'text-[#9F9AB5]'
              }`}
            >
              ⚡ Timeline
            </button>
          </div>
        </div>

        {/* Unmailed absences banner */}
        {unmailedAbsencesCount > 0 ? (
          <div className="rounded-xl bg-[#3D3660] ring-1 ring-white/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setUnmailedExpanded((c) => !c)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/5"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span className="flex-1 text-xs font-medium text-[#D8D4E7]">
                <span className="font-bold text-[#F7F4FF]">{unmailedAbsencesCount}</span> absences not mailed
              </span>
              <span className={`text-[10px] font-semibold text-[#FF916C] transition-transform duration-200 ${unmailedExpanded ? 'rotate-90' : ''}`}>›</span>
            </button>

            {unmailedExpanded ? (
              <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-1.5 animate-fadeIn">
                {unmailedAbsencesList.map((entry, idx) => {
                  const displayDate = (() => {
                    try {
                      const [y, m, d] = entry.date.split('-').map(Number)
                      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    } catch { return entry.date }
                  })()

                  return (
                    <div
                      key={`${entry.code || entry.subject}-${entry.date}-${idx}`}
                      className="flex items-center gap-3 rounded-lg bg-[#4A466A]/60 px-3 py-2"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF5B5B]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-[#F7F4FF] truncate">{entry.subject || entry.code}</p>
                        <p className="text-[9px] text-[#9F9AB5]">{displayDate}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMailFaculty({ ...entry, status: 'Absent', attended: false })
                        }}
                        className="flex items-center gap-1 rounded-full border border-[#FF916C]/30 bg-[#FF916C]/10 px-2.5 py-1 text-[10px] font-semibold text-[#FF916C] transition active:scale-95"
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                        Mail
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Calendar View */}
        {mobileViewMode === 'calendar' ? (
          <div className="space-y-2.5">
            {/* Calendar */}
            <div className="rounded-2xl bg-[#4A466A] p-3 ring-1 ring-white/5">
              <CalendarHeader
                currentDate={currentDate}
                onPreviousMonth={handlePreviousMonth}
                onNextMonth={handleNextMonth}
                onResetToToday={handleResetToToday}
              />
              <div className="mt-3">
                <CalendarGrid
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                  dayStatusMap={calendarDayStatus}
                />
              </div>
            </div>

            {/* Day detail */}
            <AnimatedDetailSection contentKey={selectedDateKey || ''} isLoading={isLoadingHistory && !!selectedDateKey}>
              {selectedDateKey ? (
                historyError ? (
                  <div className="rounded-xl border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-3 py-2 text-xs text-[#FFD4D4]">{historyError}</div>
                ) : (
                  <DayDetailCard
                    displayDate={selectedDisplayDate}
                    attendanceItems={selectedItems}
                    emptyMessage={isFutureSelectedDate ? 'Yet to attend' : 'No classes on this day 🎉'}
                    onMailFaculty={handleMailFaculty}
                    getMailFacultyStatus={getMailFacultyStatus}
                    onConfirmMailSent={handleConfirmMailSentFromCard}
                    onMarkMailNotYet={handleMarkMailNotYet}
                  />
                )
              ) : null}
            </AnimatedDetailSection>
          </div>
        ) : null}

        {/* Timeline View */}
        {mobileViewMode === 'timeline' ? (
          <div className="space-y-3">
            {/* Horizontal date selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentDays.map((dayInfo) => {
                const isActive = timelineSelectedKey === dayInfo.dateKey
                const semesterHistory = historyBySemesterDate[semesterCacheKey] || {}
                const dayEntries = semesterHistory[dayInfo.dateKey] || []
                const hasAbsent = dayEntries.some((e) => !e.attended && e.status !== 'Present')
                const hasPresent = dayEntries.some((e) => e.attended || e.status === 'Present')
                const indicatorColor = dayEntries.length === 0 ? '#9F9AB5' : hasAbsent ? '#FFB23E' : '#4EF0A0'

                return (
                  <button
                    key={dayInfo.dateKey}
                    type="button"
                    onClick={() => handleTimelineDateSelect(dayInfo)}
                    className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 transition-all duration-200 ${
                      isActive
                        ? 'bg-[#FF916C] shadow-md'
                        : 'bg-[#3D3660] ring-1 ring-white/5'
                    }`}
                    style={{ minWidth: '56px' }}
                  >
                    <span className={`text-[9px] font-bold ${isActive ? 'text-[#1D183E]' : 'text-[#9F9AB5]'}`}>{dayInfo.weekday}</span>
                    <span className={`mt-0.5 text-lg font-extrabold ${isActive ? 'text-[#1D183E]' : 'text-[#F7F4FF]'}`}>{dayInfo.day}</span>
                    <span className="mt-1 h-1 w-4 rounded-full" style={{ backgroundColor: isActive ? '#1D183E' : indicatorColor }} />
                  </button>
                )
              })}
            </div>

            {/* Day summary */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">{timelineDisplayDate.weekday}</p>
                <p className="text-3xl font-extrabold text-[#F7F4FF]">{timelineDisplayDate.month} {timelineDisplayDate.day}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-extrabold text-[#FFB23E]">{isStreakLoading ? '...' : `${currentStreak ?? 0} days`}</p>
                <p className="text-[10px] text-[#9F9AB5]">{timelineAttendedCount}/{timelineItems.length} attended</p>
              </div>
            </div>

            {/* Subject cards */}
            {isLoadingHistory ? (
              <div className="rounded-xl bg-[#3D3660] px-3 py-3 text-xs text-[#9F9AB5]">Loading...</div>
            ) : timelineItems.length === 0 ? (
              <div className="rounded-xl bg-[#3D3660] px-4 py-4 text-center text-sm text-[#9F9AB5]">No classes on this day</div>
            ) : (
              <div className="space-y-2">
                {timelineItems.map((entry, index) => {
                  const isPresent = entry.attended || entry.status === 'Present'
                  const borderColor = isPresent ? '#4EF0A0' : '#FF5B5B'
                  const mailStatus = !isPresent && typeof getMailFacultyStatus === 'function' ? getMailFacultyStatus(entry) : 'default'
                  const isAlreadySent = mailStatus === 'send_confirmed'

                  return (
                    <div
                      key={`${entry.code || entry.subject}-${index}`}
                      className="flex items-center gap-3 rounded-xl bg-[#3D3660] px-4 py-3 ring-1 ring-white/5"
                      style={{ borderLeft: `3px solid ${borderColor}` }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: borderColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#F7F4FF]">{entry.subject || entry.code || 'Subject'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPresent ? (
                          <span className="text-xs font-semibold text-[#4EF0A0]">PRESENT</span>
                        ) : (
                          <>
                            <span className="text-xs font-semibold text-[#FF5B5B]">ABSENT</span>
                            {!isAlreadySent ? (
                              <button
                                type="button"
                                onClick={() => handleMailFaculty(entry)}
                                className="flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-[#D8D4E7] transition active:scale-95"
                              >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                </svg>
                                Mail
                              </button>
                            ) : (
                              <span className="text-[10px] font-semibold text-[#9F9AB5]">✓ Mailed</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ===== DESKTOP LAYOUT (unchanged) ===== */}
      <div className="hidden space-y-3 md:block">
        {/* Page header */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#F7F4FF] sm:text-3xl">History</h1>
            <p className="mt-0.5 text-[11px] text-[#9F9AB5]">Synced today, 8:42 AM</p>
          </div>
          {session.semesters.length > 0 ? (
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#4A466A] px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#FFB23E]" />
              <select
                value={session.selectedSemester || ''}
                onChange={(event) => {
                  const semesterId = event.target.value
                  actions.setSelectedSemester(semesterId)
                  window.localStorage.setItem('attend75.selectedSemester', semesterId)
                }}
                className="bg-transparent text-xs font-semibold text-[#F7F4FF] outline-none"
              >
                {session.semesters.map((sem) => (
                  <option key={sem.id} value={sem.id}>{sem.label}</option>
                ))}
              </select>
            </div>
          ) : null}
        </header>

        {/* Main layout: sidebar + calendar/detail */}
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <div className="hidden lg:block">
            <HistorySidebar
              subjects={attendance?.subjects || []}
              overallPercentage={attendance?.overallPercentage || 0}
              currentStreak={currentStreak ?? 0}
            />
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-[#4A466A] p-4 ring-1 ring-white/5 sm:p-5">
              <CalendarHeader
                currentDate={currentDate}
                onPreviousMonth={handlePreviousMonth}
                onNextMonth={handleNextMonth}
                onResetToToday={handleResetToToday}
              />
              <div className="mt-4">
                <CalendarGrid
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                  dayStatusMap={calendarDayStatus}
                />
              </div>
            </div>

            {historyError ? (
              <div className="rounded-xl border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-3 py-2 text-xs text-[#FFD4D4]">{historyError}</div>
            ) : null}

            <AnimatedDetailSection contentKey={selectedDateKey || ''} isLoading={isLoadingHistory && !!selectedDateKey}>
              {selectedDateKey ? (
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
            </AnimatedDetailSection>
          </div>
        </div>
      </div>

      {showMailModal && selectedAbsentEntry ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => { setShowMailModal(false); setComposeError('') }}
        >
          <div
            className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#2D2845] p-5 shadow-2xl sm:max-h-[92dvh] sm:p-6"
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
                onClick={() => { setShowMailModal(false); setComposeError('') }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9F9AB5] transition hover:bg-white/10 hover:text-[#F7F4FF]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Top section: class info card + class details */}
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr]">
              {/* Subject/Date card - solid orange */}
              <div className="flex items-center gap-3 rounded-xl bg-[#E8875C] px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/15">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Subject: {selectedAbsentEntry.subject || ''}</p>
                  <p className="text-xs text-white/80">Date: {selectedAbsentEntry.date || selectedDateKey || ''}</p>
                </div>
              </div>

              {/* Class details */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Class Details</p>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#9F9AB5]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <input
                    value={facultyEmail}
                    onChange={(event) => setFacultyEmail(event.target.value)}
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
                    onChange={(event) => setReasonType(event.target.value)}
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
                  onChange={(event) => {
                    setComposeSubject(event.target.value)
                    setIsSubjectEdited(true)
                  }}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#3D3660] px-3 py-2 text-sm text-[#F7F4FF] outline-none focus:border-[#FF916C]/50"
                />
              </label>
            </div>

            {/* Email body editor */}
            <div className="mt-3 rounded-xl border border-white/10 bg-[#3D3660]">
              <textarea
                value={composeBody}
                onChange={(event) => {
                  setComposeBody(event.target.value)
                  setIsBodyEdited(true)
                }}
                rows={10}
                className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-sm leading-relaxed text-[#F7F4FF] placeholder:text-[#6E6A88] outline-none"
              />
            </div>

            {composeError ? (
              <p className="mt-3 rounded-lg border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-3 py-2 text-xs text-[#FFD4D4]">{composeError}</p>
            ) : null}

            {/* Footer actions */}
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
                className="rounded-full px-6 py-2.5 text-sm font-bold text-[#1D183E] shadow-[0_0_20px_rgba(255,145,108,0.3)] transition hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #FF916C 0%, #FFAA8D 100%)' }}
              >
                Compose Email
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCollegeEmailPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#4A466A] p-5 shadow-xl ring-1 ring-white/10">
            <h3 className="text-lg font-semibold text-white">College Email Required</h3>
            <p className="mt-2 text-sm text-[#D8D4E7]">
              Please log in with your college email to compose and send emails to faculty.
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

      <GuestLoginPrompt isOpen={guestPrompt.isOpen} onClose={guestPrompt.closePrompt} featureName={guestPrompt.feature} />
    </section>
  )
}

export default HistoryPage
