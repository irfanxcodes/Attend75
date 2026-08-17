const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  if (configuredApiBaseUrl) return configuredApiBaseUrl
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return 'https://api.attend75.xyz'
  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

export { API_BASE_URL }

class NoticesApiError extends Error {
  constructor(message, { code, status } = {}) {
    super(message)
    this.code = code || 'UNKNOWN'
    this.status = status || 0
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))

  if (!response.ok || data.status === 'error') {
    const message = data.message || 'Request failed'
    throw new NoticesApiError(message, { code: data.error_code, status: response.status })
  }

  return data.data || data
}

export async function fetchNotices({ token, limit = 10, offset = 0, category = null, includeDismissed = false }) {
  const params = new URLSearchParams({ token, limit: String(limit), offset: String(offset) })
  if (category && category !== 'All') params.set('category', category)
  if (includeDismissed) params.set('include_dismissed', 'true')

  return request(`${API_BASE_URL}/notices?${params.toString()}`)
}

export async function fetchNoticeDetail({ token, noticeId }) {
  const params = new URLSearchParams({ token })
  return request(`${API_BASE_URL}/notices/${noticeId}?${params.toString()}`)
}

export async function fetchNoticeStats({ token }) {
  const params = new URLSearchParams({ token })
  return request(`${API_BASE_URL}/notices/stats?${params.toString()}`)
}

export async function bookmarkNotice({ token, noticeId }) {
  return request(`${API_BASE_URL}/notices/${noticeId}/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function dismissNotice({ token, noticeId }) {
  return request(`${API_BASE_URL}/notices/${noticeId}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function refreshNotices({ token }) {
  return request(`${API_BASE_URL}/notices/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export function getNoticePdfUrl(noticeId, token) {
  const params = new URLSearchParams({ token })
  return `${API_BASE_URL}/notices/${noticeId}/pdf?${params.toString()}`
}

export function isSessionExpired(error) {
  return error?.status === 401
}


export async function fetchTimetable({ token, semesterId = null }) {
  const params = new URLSearchParams({ token })
  if (semesterId) params.set('semester_id', semesterId)
  return request(`${API_BASE_URL}/notices/timetable?${params.toString()}`)
}

export async function fetchTimetableCandidates({ token }) {
  const params = new URLSearchParams({ token })
  return request(`${API_BASE_URL}/notices/timetable/candidates?${params.toString()}`)
}

export async function selectTimetable({ token, noticeId, semesterId = null }) {
  return request(`${API_BASE_URL}/notices/timetable/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, notice_id: noticeId, semester_id: semesterId }),
  })
}

export async function uploadTimetablePdf({ token, file }) {
  const formData = new FormData()
  formData.append('token', token)
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/notices/timetable/upload`, {
    method: 'POST',
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.status === 'error') {
    const err = new Error(data.message || 'Upload failed')
    err.status = response.status
    throw err
  }
  // Return the raw response — caller handles needsSection
  if (data.status === 'needs_section') {
    return { needsSection: true, ...(data.data || {}) }
  }
  return data.data || data
}

export async function setTimetableSection({ token, section, year = null, dept = null }) {
  return request(`${API_BASE_URL}/notices/timetable/upload/set-section`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, section, year, dept }),
  })
}
