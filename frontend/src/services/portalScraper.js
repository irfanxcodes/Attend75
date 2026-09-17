/**
 * Client-side portal scraper — Oracle backend as CORS proxy.
 *
 * Oracle's IP works for portal login (only authenticated pages after login
 * are blocked). So we use our own backend as a simple CORS proxy:
 *
 *   Browser → api.attend75.xyz/portal-proxy/login  → portal login page
 *   Browser → api.attend75.xyz/portal-proxy/attendance (with cookies) → attendance HTML
 *   Browser → api.attend75.xyz/parse/login (with HTML) → structured data + token
 *
 * No Cloudflare Worker needed for this flow.
 */

function resolveProxyBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://127.0.0.1:8000'
  }
  return 'https://api.attend75.xyz'
}

const PROXY_BASE = resolveProxyBase()

/**
 * Login to the portal via Oracle backend proxy.
 * Returns { cookies, studentName, programSn, programFull }
 */
export async function portalLogin(rollNumber, password) {
  const resp = await fetch(`${PROXY_BASE}/portal-proxy/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_number: rollNumber, password }),
  })

  const data = await resp.json()

  if (!data.success) {
    const code = data.error_code || 'LOGIN_FAILED'
    throw Object.assign(new Error(data.error || 'Login failed'), { portalCode: code })
  }

  return {
    cookies: data.cookies || {},
    studentName: data.student_name || rollNumber,
    programSn: data.program_sn || null,
    programFull: data.program_full || null,
  }
}

/**
 * Fetch attendance HTML using session cookies from login.
 */
export async function fetchAttendanceHtml(cookies) {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

  const resp = await fetch(`${PROXY_BASE}/portal-proxy/attendance`, {
    headers: { 'X-Portal-Cookies': cookieHeader },
  })

  const data = await resp.json()
  if (data.error) {
    throw Object.assign(new Error(data.error), { portalCode: data.error_code || 'PORTAL_UNREACHABLE' })
  }
  return data.html || ''
}

/**
 * Fetch courses HTML for short abbreviations.
 */
export async function fetchCoursesHtml(cookies, semesterId) {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

  const url = new URL(`${PROXY_BASE}/portal-proxy/courses`)
  if (semesterId) url.searchParams.set('semester_id', semesterId)

  const resp = await fetch(url.toString(), {
    headers: { 'X-Portal-Cookies': cookieHeader },
  })

  const data = await resp.json()
  return data.html || ''
}
