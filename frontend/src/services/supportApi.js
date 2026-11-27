/**
 * Support Contribution API client.
 */
const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  if (configuredApiBaseUrl) return configuredApiBaseUrl
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return 'https://api.attend75.xyz'
  return 'http://127.0.0.1:8000'
}
const API_BASE_URL = resolveApiBaseUrl()

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.status === 'error') {
    const err = new Error(data.message || 'Request failed')
    err.status = response.status
    throw err
  }
  return data.data || data
}

export async function getSupportStats() {
  return request(`${API_BASE_URL}/support/stats`).catch(() => ({ contributors_this_month: 0 }))
}

export async function trackSupportEvent({ token, card_style, action_type, amount }) {
  return request(`${API_BASE_URL}/support/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, card_style, action_type, amount }),
  }).catch(() => null) // fire-and-forget, never block UI
}

export async function markThanked({ token }) {
  return request(`${API_BASE_URL}/support/thanked`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => null)
}
