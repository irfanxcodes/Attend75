/**
 * Career Compass — API service
 *
 * Mirrors the pattern of attendanceApi.js:
 *   - Single module, one function per endpoint
 *   - Consistent error handling
 *   - Uses the same API_BASE_URL resolution
 */

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  if (configuredApiBaseUrl) return configuredApiBaseUrl
  return 'https://api.attend75.xyz'
}

const API_BASE_URL = resolveApiBaseUrl()

async function _post(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.status === 'error') {
    throw new Error(payload.detail || payload.message || 'Career API request failed')
  }
  return payload.data ?? payload
}

/**
 * Generate a personalised career roadmap.
 * Makes one LLM call — typically 3–8 seconds.
 *
 * @param {string} token - Session token
 * @param {object} opts
 * @param {string} [opts.program] - Override programme (optional)
 * @param {string} [opts.semester] - Override semester (optional)
 * @param {string[]} [opts.subjects] - Subject short-names from attendance data
 */
export async function fetchCareerRoadmap(token, { program, semester, subjects = [] } = {}) {
  return _post('/career/roadmap', { token, program, semester, subjects })
}

/**
 * Fetch all career tracks for a degree (no LLM — instant).
 *
 * @param {string} token
 * @param {object} opts
 * @param {string} [opts.program]
 * @param {string} [opts.semester]
 */
export async function fetchCareerTracks(token, { program, semester } = {}) {
  return _post('/career/explore', { token, program, semester })
}

/**
 * Fetch the company directory, optionally filtered by track slug.
 *
 * @param {string} token
 * @param {string|null} [trackSlug] - e.g. 'finance', 'digital_marketing', null for all
 */
export async function fetchCompanies(token, trackSlug = null) {
  return _post('/career/companies', { token, track: trackSlug })
}

/**
 * Save the student's chosen career track.
 *
 * @param {string} token
 * @param {string} trackSlug
 * @param {string} trackLabel
 */
export async function saveCareerTrack(token, trackSlug, trackLabel) {
  return _post('/career/profile/track', { token, track_slug: trackSlug, track_label: trackLabel })
}
