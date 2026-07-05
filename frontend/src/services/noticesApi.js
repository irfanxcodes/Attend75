const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  if (configuredApiBaseUrl) return configuredApiBaseUrl
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return '/api'
  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

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
