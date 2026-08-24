const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  if (configuredApiBaseUrl) return configuredApiBaseUrl
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return 'https://api.attend75.xyz'
  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

class AdvertisementApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'AdvertisementApiError'
    this.status = status
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.status === 'error') {
    throw new AdvertisementApiError(payload?.message || 'Request failed.', response.status)
  }
  return payload?.data || {}
}

function authHeaders(sessionToken) {
  return { Authorization: `Bearer ${sessionToken}` }
}

/**
 * Public — no auth needed. Returns the active ad for the given placement or null.
 * placement: 'dashboard' | 'arcade_game_over'
 */
export async function fetchActiveAdvertisement(placement = 'dashboard') {
  try {
    const response = await fetch(`${API_BASE_URL}/advertisement/active?placement=${encodeURIComponent(placement)}`)
    const data = await parseResponse(response)
    return data?.ad ?? null
  } catch {
    return null
  }
}

/**
 * Admin — upload a new banner image or video.
 * @param {string} sessionToken
 * @param {File} file
 * @param {{ linkUrl?: string, advertiserName?: string }} meta
 */
export async function uploadAdvertisement(sessionToken, file, { linkUrl = '', advertiserName = '', placement = 'dashboard' } = {}) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('link_url', linkUrl)
  formData.append('advertiser_name', advertiserName)
  formData.append('placement', placement)

  const response = await fetch(`${API_BASE_URL}/admin/advertisement/upload`, {
    method: 'POST',
    headers: authHeaders(sessionToken),
    body: formData,
  })
  const data = await parseResponse(response)
  return data?.ad ?? null
}

/**
 * Admin — delete an ad by id.
 */
export async function deleteAdvertisement(sessionToken, adId) {
  const response = await fetch(`${API_BASE_URL}/admin/advertisement/${adId}`, {
    method: 'DELETE',
    headers: { ...authHeaders(sessionToken), 'Content-Type': 'application/json' },
  })
  await parseResponse(response)
}

/**
 * Admin — list all ads.
 */
export async function listAdvertisements(sessionToken) {
  const response = await fetch(`${API_BASE_URL}/admin/advertisement/list`, {
    method: 'GET',
    headers: { ...authHeaders(sessionToken), 'Content-Type': 'application/json' },
  })
  const data = await parseResponse(response)
  return Array.isArray(data?.ads) ? data.ads : []
}

/**
 * Admin — re-activate a previously uploaded ad.
 */
export async function activateAdvertisement(sessionToken, adId) {
  const response = await fetch(`${API_BASE_URL}/admin/advertisement/${adId}/activate`, {
    method: 'PATCH',
    headers: { ...authHeaders(sessionToken), 'Content-Type': 'application/json' },
  })
  const data = await parseResponse(response)
  return data?.ad ?? null
}

export { AdvertisementApiError }
