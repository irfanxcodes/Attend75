const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl
  }

  // In local Vite dev, always use the local backend unless explicitly overridden.
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8000'
  }

  // In deployed environments, use same-origin API rewrites to avoid CORS and mixed-content failures.
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return '/api'
  }

  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

class AdminApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

function buildAdminErrorMessage(status, payload) {
  const apiMessage = payload?.message

  if (status === 401 || status === 403) {
    return apiMessage || 'You are not authorized for admin access.'
  }

  if (status === 404) {
    return 'Admin API is not available on the current backend deployment.'
  }

  if (status >= 500) {
    return 'Admin service is temporarily unavailable. Please try again.'
  }

  return apiMessage || 'Admin request failed.'
}

const ADMIN_STORAGE_KEY = 'attend75.adminSession'

function parseAdminSession() {
  try {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.sessionToken || !parsed?.username) return null
    return parsed
  } catch {
    return null
  }
}

function saveAdminSession(session) {
  window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session))
}

function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_STORAGE_KEY)
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload?.status === 'error') {
    const message = buildAdminErrorMessage(response.status, payload)
    throw new AdminApiError(message, response.status)
  }

  return payload?.data || {}
}

async function requestAdminJson(url, options) {
  try {
    const response = await fetch(url, options)
    return parseResponse(response)
  } catch (error) {
    if (error instanceof AdminApiError) {
      throw error
    }

    throw new AdminApiError(`Unable to reach admin backend at ${url}. Check API base URL and backend status.`)
  }
}

function authHeaders(sessionToken) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionToken}`,
  }
}

export async function loginAdminWithPassword(username, password) {
  const normalizedUsername = String(username || '').trim()
  const normalizedPassword = String(password || '').trim()

  if (!normalizedUsername || !normalizedPassword) {
    throw new AdminApiError('Enter both username and password.')
  }

  const data = await requestAdminJson(`${API_BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: normalizedUsername, password: normalizedPassword }),
  })

  const session = {
    sessionToken: data?.session_token,
    username: data?.username || normalizedUsername,
    signedInAt: Date.now(),
    sessionTtlSeconds: data?.session_ttl_seconds || null,
  }

  if (!session.sessionToken) {
    throw new AdminApiError('Admin login succeeded but no session token was returned.')
  }

  saveAdminSession(session)
  return session
}

export async function fetchAdminOverview(sessionToken) {
  return requestAdminJson(`${API_BASE_URL}/admin/overview`, {
    method: 'GET',
    headers: authHeaders(sessionToken),
  })
}

export async function fetchAdminFeedbackLog(sessionToken, limit = 50) {
  const data = await requestAdminJson(`${API_BASE_URL}/admin/feedback?limit=${encodeURIComponent(limit)}`, {
    method: 'GET',
    headers: authHeaders(sessionToken),
  })
  return Array.isArray(data?.items) ? data.items : []
}

export async function logoutAdminSession(sessionToken) {
  if (!sessionToken) return

  try {
    await requestAdminJson(`${API_BASE_URL}/admin/auth/logout`, {
      method: 'POST',
      headers: authHeaders(sessionToken),
    })
  } catch {
    // Keep local logout behavior even if backend logout fails.
  }
}

export {
  ADMIN_STORAGE_KEY,
  AdminApiError,
  parseAdminSession,
  saveAdminSession,
  clearAdminSession,
}
