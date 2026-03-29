const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

function normalizeAttendancePayload(data) {
  const rows = Array.isArray(data?.attendance) ? data.attendance : []

  const subjects = rows
    .map((item, index) => {
      const totalClasses = Number(item.sessions) || 0
      const attendedClasses = Number(item.attended) || 0
      const displayName = (item.subject || '').trim() || (item.code || '').trim()

      if (!displayName) {
        return null
      }

      return {
        id: (item.code || `subject-${index}`).toLowerCase(),
        name: displayName,
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

async function parseApiResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.status === 'error') {
    throw new Error(payload.message || 'Request failed. Please try again.')
  }
  return payload.data || {}
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

  const data = await parseApiResponse(response)
  const normalized = normalizeAttendancePayload(data)

  return {
    id: data.roll_number || username,
    name: data.roll_number || username,
    portalName: data.roll_number || username,
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

export async function fetchAttendance({ token, semesterId }) {
  if (!token) {
    throw new Error('Session expired. Please login again.')
  }

  const response = await fetch(`${API_BASE_URL}/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, semester_id: semesterId || null }),
  })

  const data = await parseApiResponse(response)
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
