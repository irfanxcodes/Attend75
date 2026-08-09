/**
 * Arcade API Service
 *
 * Handles score submission, leaderboard fetching, and personal best retrieval
 * for the arcade mini-games feature.
 */

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8000'
  }

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl
  }

  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return 'https://api.attend75.xyz'
  }

  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

class ArcadeApiError extends Error {
  constructor(message, { code = 'UNKNOWN_ERROR', status = 0 } = {}) {
    super(message)
    this.name = 'ArcadeApiError'
    this.code = code
    this.status = status
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload.status === 'error') {
    const code = (payload?.error_code || '').trim() || 'UNKNOWN_ERROR'
    const message = payload?.message || 'Something went wrong. Please try again.'
    throw new ArcadeApiError(message, { code, status: response.status })
  }

  return payload.data ?? null
}

/**
 * Submit a game score.
 *
 * @param {string} token - Session token
 * @param {string} gameSlug - Game identifier (e.g. "flappy")
 * @param {number} score - The score to submit
 * @returns {Promise<{score: number, personal_best: number, rank: number}>}
 */
export async function submitScore(token, gameSlug, score) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/api/arcade/${gameSlug}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, score }),
    })
  } catch {
    throw new ArcadeApiError(
      'Unable to reach the server. Your score could not be saved.',
      { code: 'NETWORK_ERROR', status: 0 },
    )
  }

  return parseResponse(response)
}

/**
 * Get the leaderboard for a game.
 *
 * @param {string} gameSlug - Game identifier (e.g. "flappy")
 * @param {string|null} [token=null] - Optional session token to include user's entry
 * @returns {Promise<{entries: Array, user_entry?: object, metadata: object}>}
 */
export async function getLeaderboard(gameSlug, token = null) {
  const url = token
    ? `${API_BASE_URL}/api/arcade/${gameSlug}/leaderboard?token=${encodeURIComponent(token)}`
    : `${API_BASE_URL}/api/arcade/${gameSlug}/leaderboard`

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    throw new ArcadeApiError(
      'Unable to load leaderboard. Please try again.',
      { code: 'NETWORK_ERROR', status: 0 },
    )
  }

  return parseResponse(response)
}

/**
 * Get the user's personal best for a game.
 *
 * @param {string} token - Session token
 * @param {string} gameSlug - Game identifier (e.g. "flappy")
 * @returns {Promise<{score: number, rank: number}|null>}
 */
export async function getPersonalBest(token, gameSlug) {
  let response
  try {
    response = await fetch(
      `${API_BASE_URL}/api/arcade/${gameSlug}/personal-best?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch {
    throw new ArcadeApiError(
      'Unable to load personal best. Please try again.',
      { code: 'NETWORK_ERROR', status: 0 },
    )
  }

  return parseResponse(response)
}

export { ArcadeApiError }
