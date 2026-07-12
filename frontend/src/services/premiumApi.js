/**
 * Premium Subscription API client.
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

export async function getPremiumStatus({ token }) {
  const params = new URLSearchParams({ token })
  return request(`${API_BASE_URL}/premium/status?${params}`)
}

export async function initiatePremiumSubscription({ token }) {
  return request(`${API_BASE_URL}/premium/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function cancelPremiumSubscription({ token }) {
  return request(`${API_BASE_URL}/premium/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function getTransactions({ token }) {
  const params = new URLSearchParams({ token })
  return request(`${API_BASE_URL}/premium/transactions?${params}`)
}
