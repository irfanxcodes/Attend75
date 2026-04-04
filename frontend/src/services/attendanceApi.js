const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

class ApiError extends Error {
  constructor(message, { code = 'UNKNOWN_ERROR', status = 0, endpoint = 'generic' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.endpoint = endpoint
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function buildFriendlyMessage(endpoint, code, fallbackMessage) {
  const normalizedCode = (code || '').trim().toUpperCase()

  if (endpoint === 'login') {
    if (normalizedCode === 'INVALID_USERNAME') {
      return 'Invalid username or roll number. Please check and try again.'
    }
    if (normalizedCode === 'INCORRECT_PASSWORD') {
      return 'Incorrect password. Please try again.'
    }
    return 'Login failed. Please verify your credentials and try again.'
  }

  if (endpoint === 'attendance' || endpoint === 'attendance-history' || endpoint === 'session-status') {
    if (normalizedCode === 'SESSION_EXPIRED') {
      return 'Your session has expired. Please log in again.'
    }
    return 'Unable to load your data. Please try again later.'
  }

  if (endpoint === 'firebase-login') {
    if (normalizedCode === 'PORTAL_CREDENTIALS_INVALID') {
      return 'Your linked portal credentials need to be updated.'
    }
    if (normalizedCode === 'PORTAL_DATA_FETCH_FAILED') {
      return 'Unable to load your data. Please try again later.'
    }
    return 'Unable to sign in with Google. Please try again.'
  }

  if (endpoint === 'firebase-link') {
    if (normalizedCode === 'PORTAL_CREDENTIALS_INVALID') {
      return 'Invalid portal credentials. Please check and try again.'
    }
    if (normalizedCode === 'PORTAL_DATA_FETCH_FAILED') {
      return 'Unable to load your data. Please try again later.'
    }
    return 'Authentication failed. Please try again.'
  }

  if (endpoint === 'feedback') {
    if (normalizedCode === 'FEEDBACK_SAVE_FAILED') {
      return 'Unable to save feedback right now. Please try again shortly.'
    }
    return 'Unable to submit feedback right now. Please try again.'
  }

  return fallbackMessage || 'Something went wrong during sign-in.'
}

function normalizeAttendancePayload(data) {
  const rows = Array.isArray(data?.attendance) ? data.attendance : []

  const subjects = rows
    .map((item, index) => {
      const totalClasses = Number(item.sessions) || 0
      const attendedClasses = Number(item.attended) || 0
      const displayName = (item.subject || '').trim() || (item.code || '').trim()
      const shortName = (item.course_abbr || '').trim() || null

      if (!displayName) {
        return null
      }

      return {
        id: (item.code || `subject-${index}`).toLowerCase(),
        name: displayName,
        shortName,
        totalClasses,
        attendedClasses,
        totalSessions: Number(item.total_sessions) || null,
        remainingClasses: Number(item.remaining_classes) || null,
        maxPossiblePercentage:
          item.max_possible_percentage === null || item.max_possible_percentage === undefined
            ? null
            : Number(item.max_possible_percentage),
      }
    })
    .filter(Boolean)

  return {
    subjects,
    history: [],
    semesters: Array.isArray(data?.semesters) ? data.semesters : [],
    selectedSemester: data?.selected_semester || null,
    feasibility: data?.feasibility || null,
  }
}

async function parseApiResponse(response, endpoint = 'generic') {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload.status === 'error') {
    const endpointKey = String(endpoint || '').toLowerCase()
    const fallbackCode = endpointKey.startsWith('firebase')
      ? 'FIREBASE_AUTH_FAILED'
      : (response.status === 401 ? 'SESSION_EXPIRED' : 'UNKNOWN_ERROR')
    const errorCode = (payload?.error_code || '').trim() || fallbackCode
    const message = buildFriendlyMessage(endpoint, errorCode, payload?.message)
    throw new ApiError(message, {
      code: errorCode,
      status: response.status,
      endpoint,
    })
  }

  return payload.data || {}
}

export function isSessionExpiredError(error) {
  return (error?.code || '').toUpperCase() === 'SESSION_EXPIRED'
}

export function isFirebaseAuthError(error) {
  if (!error) return false
  const endpoint = (error.endpoint || '').toLowerCase()
  return error.status === 401 && (endpoint === 'firebase-login' || endpoint === 'firebase-link')
}

export function isPortalCredentialError(error) {
  return (error?.code || '').toUpperCase() === 'PORTAL_CREDENTIALS_INVALID'
}

export async function login(credentials) {
  const username = credentials?.username?.trim()
  const password = credentials?.password?.trim()

  if (!username || !password) {
    throw new Error('Enter both username and password to continue.')
  }

  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_number: username, password }),
  })

  const data = await parseApiResponse(response, 'login')
  const normalized = normalizeAttendancePayload(data)
  const rollNumber = (data.roll_number || username || '').toUpperCase()
  const studentName = (data.student_name || '').trim() || rollNumber

  return {
    id: rollNumber,
    name: studentName,
    portalName: studentName,
    rollNumber,
    authProvider: 'guest',
    token: data.token,
    semesters: normalized.semesters,
    selectedSemester: normalized.selectedSemester,
    attendanceData: {
      subjects: normalized.subjects,
      history: normalized.history,
      feasibility: normalized.feasibility,
    },
  }
}

export async function fetchSessionStatus(token) {
  const cleanedToken = (token || '').trim()
  if (!cleanedToken) {
    return 'expired'
  }

  const response = await fetch(`${API_BASE_URL}/session/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cleanedToken }),
  })

  const data = await parseApiResponse(response, 'session-status')
  return data?.session_status || 'unknown'
}

export async function fetchAttendance({ token, semesterId }) {
  if (!token) {
    throw new ApiError('Your session has expired. Please log in again.', {
      code: 'SESSION_EXPIRED',
      endpoint: 'attendance',
    })
  }

  const response = await fetch(`${API_BASE_URL}/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, semester_id: semesterId || null }),
  })

  const data = await parseApiResponse(response, 'attendance')
  const normalized = normalizeAttendancePayload(data)

  return {
    attendanceData: {
      subjects: normalized.subjects,
      history: normalized.history,
      feasibility: normalized.feasibility,
    },
    semesters: normalized.semesters,
    selectedSemester: normalized.selectedSemester,
  }
}

export async function fetchAttendanceHistory({ token, semesterId, date }) {
  if (!token) {
    throw new ApiError('Your session has expired. Please log in again.', {
      code: 'SESSION_EXPIRED',
      endpoint: 'attendance-history',
    })
  }

  if (!date) {
    return { entries: [] }
  }

  const response = await fetch(`${API_BASE_URL}/attendance/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, semester_id: semesterId || null, date }),
  })

  const data = await parseApiResponse(response, 'attendance-history')
  const entries = Array.isArray(data?.entries) ? data.entries : []

  return {
    date: data?.date || date,
    selectedSemester: data?.selected_semester || semesterId || null,
    entries: entries.map((entry) => ({
      date: entry?.date,
      subject: entry?.subject_abbr || entry?.subject || entry?.code || 'Subject',
      code: entry?.code || null,
      status: entry?.attended ? 'Present' : 'Absent',
      attended: Boolean(entry?.attended),
    })),
  }
}

export async function submitFeedback(message) {
  const cleanedMessage = (message || '').trim()

  if (!cleanedMessage) {
    throw new Error('Feedback cannot be empty.')
  }

  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: cleanedMessage }),
  })

  const data = await parseApiResponse(response, 'feedback')
  return {
    status: 'success',
    feedbackId: data?.feedback_id || null,
    timestamp: data?.timestamp || null,
  }
}

function buildSessionFromAuthPayload(data, fallbackRollNumber = '') {
  const normalized = normalizeAttendancePayload(data)
  const rollNumber = (data?.roll_number || fallbackRollNumber || '').trim().toUpperCase()
  const firebaseDisplayName = (data?.display_name || '').trim()
  const studentName = (data?.student_name || '').trim()

  return {
    id: rollNumber,
    name: firebaseDisplayName || studentName || rollNumber,
    portalName: studentName || rollNumber,
    rollNumber,
    authProvider: 'firebase',
    token: data?.token || null,
    semesters: normalized.semesters,
    selectedSemester: normalized.selectedSemester,
    attendanceData: {
      subjects: normalized.subjects,
      history: normalized.history,
      feasibility: normalized.feasibility,
    },
  }
}

export async function loginWithFirebase(idToken) {
  const token = (idToken || '').trim()
  if (!token) {
    throw new Error('Missing Firebase ID token.')
  }

  let data
  try {
    const response = await fetch(`${API_BASE_URL}/auth/firebase/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: token }),
    })
    data = await parseApiResponse(response, 'firebase-login')
  } catch (error) {
    const shouldRetry =
      error instanceof TypeError ||
      (error instanceof ApiError && (error.status >= 500 || (error.status === 401 && error.code === 'FIREBASE_AUTH_FAILED')))

    if (!shouldRetry) {
      throw error
    }

    await delay(300)

    const retryResponse = await fetch(`${API_BASE_URL}/auth/firebase/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: token }),
    })
    data = await parseApiResponse(retryResponse, 'firebase-login')
  }

  const linked = Boolean(data?.linked || data?.linked_credentials || data?.credentials_linked)
  const hasSessionPayload = Boolean(data?.token)

  return {
    linked,
    session: hasSessionPayload ? buildSessionFromAuthPayload(data) : null,
    data,
  }
}

export async function linkFirebaseCredentials({ idToken, rollNumber, password }) {
  const token = (idToken || '').trim()
  const roll = (rollNumber || '').trim().toUpperCase()
  const pass = (password || '').trim()

  if (!token) {
    throw new Error('Missing Firebase ID token.')
  }
  if (!roll || !pass) {
    throw new Error('Roll number and password are required.')
  }

  const response = await fetch(`${API_BASE_URL}/auth/firebase/link-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: token, roll_number: roll, password: pass }),
  })

  const data = await parseApiResponse(response, 'firebase-link')
  const linked = Boolean(data?.linked || data?.linked_credentials || data?.credentials_linked || data?.token)

  return {
    linked,
    session: linked ? buildSessionFromAuthPayload(data, roll) : null,
    data,
  }
}
