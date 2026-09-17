/**
 * Client-side portal scraper.
 *
 * Runs entirely in the browser — uses the student's own residential IP,
 * which the portal never blocks. All portal requests go through the
 * Cloudflare Worker proxy (for CORS headers), but the session cookies
 * are stored in memory here and sent with each request.
 *
 * Flow:
 *   1. login()          — POST to portal login, capture cookies from response
 *   2. fetchAttendance() — GET AttendanceDashboard.aspx with session cookies
 *   3. Return raw HTML to caller for server-side parsing
 */

// The worker proxy base — all portal paths are appended after this
const WORKER_BASE = 'https://attend75-proxy.kiro-one-mail.workers.dev/sz'
const TIMEOUT_MS = 25000

// In-memory cookie jar (can't use document.cookie — different origin)
const cookieJar = {}

function buildUrl(path) {
  return `${WORKER_BASE}/${path.replace(/^\//, '')}`
}

function cookieHeader() {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return
  // Multiple Set-Cookie headers come as array or single string
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
  for (const h of headers) {
    const pair = h.split(';')[0].trim()
    const eqIdx = pair.indexOf('=')
    if (eqIdx > 0) {
      const name = pair.slice(0, eqIdx).trim()
      const value = pair.slice(eqIdx + 1).trim()
      cookieJar[name] = value
    }
  }
}

async function portalFetch(path, options = {}) {
  const url = buildUrl(path)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: cookieHeader(),
        ...(options.headers || {}),
      },
      redirect: 'manual', // handle redirects ourselves to capture cookies
    })

    // Capture all Set-Cookie headers from the response
    const setCookieValues = resp.headers.getAll
      ? resp.headers.getAll('set-cookie')
      : [resp.headers.get('set-cookie')].filter(Boolean)
    for (const v of setCookieValues) parseCookies(v)

    return resp
  } finally {
    clearTimeout(timer)
  }
}

function extractHiddenFields(html) {
  const fields = {}
  const re = /<input[^>]+type=["']hidden["'][^>]*>/gi
  let match
  while ((match = re.exec(html)) !== null) {
    const tag = match[0]
    const nameM = tag.match(/name=["']([^"']+)["']/)
    const valueM = tag.match(/value=["']([^"']*)["']/)
    if (nameM) fields[nameM[1]] = valueM ? valueM[1] : ''
  }
  return fields
}

function solveCaptchaSvg(svgText) {
  // Parse <text> elements from SVG
  const matches = [...svgText.matchAll(/<text[^>]*>\s*([^<\s][^<]*?)\s*<\/text>/gi)]
  return matches.map((m) => m[1].trim()).join('')
}

function formEncode(data) {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * Log into the college portal.
 * Returns cookies captured from the login response.
 */
export async function portalLogin(rollNumber, password) {
  // Clear previous session
  Object.keys(cookieJar).forEach((k) => delete cookieJar[k])

  // Step 1: GET login page for VIEWSTATE + captcha
  const loginResp = await portalFetch('login.aspx')
  if (!loginResp.ok && loginResp.status !== 0) {
    throw new Error(`Portal login page returned ${loginResp.status}`)
  }
  const loginHtml = await loginResp.text()

  // Step 2: Solve captcha
  const captchaMatch = loginHtml.match(/id="captchaImage"[^>]+src="([^"]+)"/)
  let captchaText = ''
  if (captchaMatch) {
    const captchaResp = await portalFetch(captchaMatch[1].replace(/^\/sz\//, ''))
    const captchaSvg = await captchaResp.text()
    captchaText = solveCaptchaSvg(captchaSvg)
  }

  // Step 3: Build login payload
  const fields = extractHiddenFields(loginHtml)
  const payload = {
    ...fields,
    txtLogin: rollNumber.trim().toUpperCase(),
    txtPassword: password,
    bl: 'Student',
    btnSubmit: 'Submit',
    ...(captchaText ? { txtCaptcha: captchaText } : {}),
  }

  // Step 4: POST login
  const postResp = await portalFetch('login.aspx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: buildUrl('login.aspx'),
      Origin: 'http://111.93.16.209',
    },
    body: formEncode(payload),
  })

  // 302 = success, 200 = wrong credentials/captcha
  if (postResp.status === 200) {
    const body = await postResp.text()
    // Check for error messages in the response
    const errMatch = body.match(/class="[^"]*(?:help-block|text-danger)[^"]*"[^>]*>([^<]+)</)
    const errMsg = errMatch ? errMatch[1].trim() : 'Invalid credentials or captcha'
    if (errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('incorrect')) {
      const code = errMsg.toLowerCase().includes('password') ? 'INCORRECT_PASSWORD' : 'INVALID_USERNAME'
      throw Object.assign(new Error(errMsg), { portalCode: code })
    }
    // If no explicit error, might be a blocked IP showing login page
    throw Object.assign(new Error('Login failed — portal returned login page'), {
      portalCode: 'LOGIN_FAILED',
    })
  }

  if (postResp.status !== 302 && postResp.status !== 301) {
    throw new Error(`Unexpected login response: ${postResp.status}`)
  }

  // Verify auth cookies were captured
  const authCookies = ['UserID', 'CurrentSession', 'Enrolno']
  const hasAuth = authCookies.some((c) => cookieJar[c])
  if (!hasAuth) {
    throw Object.assign(new Error('Login appeared to succeed but no auth cookies set'), {
      portalCode: 'LOGIN_FAILED',
    })
  }

  return { ...cookieJar }
}

/**
 * Fetch the attendance dashboard HTML.
 * Must be called after portalLogin().
 */
export async function fetchAttendanceHtml() {
  const resp = await portalFetch('AttendanceDashboard.aspx', {
    headers: { Referer: buildUrl('Index.aspx') },
  })

  // Handle redirects back to login (session expired)
  if (resp.status === 302) {
    const location = resp.headers.get('location') || ''
    if (location.toLowerCase().includes('login')) {
      throw Object.assign(new Error('Session expired'), { portalCode: 'SESSION_EXPIRED' })
    }
  }

  const html = await resp.text()

  // Check if we got ad-cards (new portal) or need fallback
  if (!html.includes('ad-card')) {
    // Try old portal URL
    const fallback = await portalFetch('CommonS.aspx?qs=ap', {
      headers: { Referer: buildUrl('Index.aspx') },
    })
    const fallbackHtml = await fallback.text()
    if (fallbackHtml.includes('ad-card') || fallbackHtml.includes('<table')) {
      return fallbackHtml
    }
  }

  return html
}

/**
 * Fetch the courses page HTML (for short abbreviations like BE, HRM).
 */
export async function fetchCoursesHtml(semesterId) {
  const resp = await portalFetch('rc/cr.aspx', {
    headers: { Referer: buildUrl('Index.aspx') },
  })
  const html = await resp.text()

  if (!semesterId) return html

  // POST to switch to the correct semester
  const fields = extractHiddenFields(html)
  const semSelect = html.match(/<select[^>]+name="ddlSem"[^>]*>[\s\S]*?<\/select>/i)
  if (!semSelect) return html

  const onchange = html.match(/ddlSem[^>]*onchange="([^"]+)"/)
  const evtMatch = onchange && onchange[1].match(/__doPostBack\('([^']+)'/)
  const evtTarget = evtMatch ? evtMatch[1] : 'ddlSem'

  const postResp = await portalFetch('rc/cr.aspx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: buildUrl('rc/cr.aspx'),
    },
    body: formEncode({
      ...fields,
      __EVENTTARGET: evtTarget,
      __EVENTARGUMENT: '',
      ddlSem: semesterId,
    }),
  })
  return postResp.text()
}

/**
 * Get student name and program info from cookies captured during login.
 */
export function getStudentInfoFromCookies() {
  return {
    studentName: cookieJar['Name']
      ? decodeURIComponent(cookieJar['Name'].replace(/\+/g, ' '))
      : null,
    programSn: cookieJar['ProgramSN'] || null,
    programFull: cookieJar['Program']
      ? decodeURIComponent(cookieJar['Program'].replace(/\+/g, ' '))
      : null,
  }
}
