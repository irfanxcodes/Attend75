/**
 * Push Notification API client — subscribe, preferences, history.
 */

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  if (configuredApiBaseUrl) return configuredApiBaseUrl
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return '/api'
  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.status === 'error') {
    const err = new Error(data.message || 'Request failed')
    err.status = response.status
    err.data = data
    throw err
  }
  return data.data || data
}

export async function getVapidPublicKey() {
  return request(`${API_BASE_URL}/push/vapid-public-key`)
}

export async function subscribePush({ token, endpoint, keys, deviceInfo }) {
  return request(`${API_BASE_URL}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, endpoint, keys, device_info: deviceInfo }),
  })
}

export async function unsubscribePush({ token, endpoint }) {
  return request(`${API_BASE_URL}/push/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, endpoint }),
  })
}

export async function getPreferences({ token }) {
  const params = new URLSearchParams({ token })
  return request(`${API_BASE_URL}/push/preferences?${params}`)
}

export async function updatePreferences({ token, ...prefs }) {
  // Convert camelCase keys to snake_case for the backend
  const snakePrefs = {}
  for (const [key, value] of Object.entries(prefs)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
    snakePrefs[snakeKey] = value
  }
  return request(`${API_BASE_URL}/push/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...snakePrefs }),
  })
}

export async function getHistory({ token }) {
  const params = new URLSearchParams({ token })
  return request(`${API_BASE_URL}/push/history?${params}`)
}

export async function markHistoryRead({ token, id }) {
  return request(`${API_BASE_URL}/push/history/${id}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function registerFCMToken({ token, fcmToken, deviceInfo }) {
  return request(`${API_BASE_URL}/push/fcm-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, fcm_token: fcmToken, device_info: deviceInfo }),
  })
}
