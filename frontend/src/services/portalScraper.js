/**
 * Client-side portal scraper.
 *
 * Uses the browser's native cookie jar with credentials: 'include'.
 * All requests go through the Cloudflare Worker (same origin for cookies).
 * The browser handles cookies automatically — no manual jar needed.
 */

const WORKER_BASE = 'https://attend75-proxy.kiro-one-mail.workers.dev/sz'
const TIMEOUT_MS = 25000

function buildUrl(path) {
  return `${WORKER_BASE}/${path.replace(/^\//, '')}`
}

async function portalFetch(path, options = {}) {
  const url = buildUrl(path)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: 'include', // let browser manage cookies automatically
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {}),
      },
      redirect: 'follow', // browser follows redirects automatically
    })
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
 * Browser manages cookies automatically via credentials: 'include'.
 */
export async function portalLogin(rollNumber, password) {
  // Step 1: GET login page for VIEWSTATE + captcha
  const loginResp = await portalFetch('login.aspx')
  const loginHtml = await loginResp.text()

  // Step 2: Solve captcha
  const captchaMatch = loginHtml.match(/id="captchaImage"[^>]+src="([^"]+)"/)
  let captchaText = ''
  if (captchaMatch) {
    try {
      // The captcha src is relative like "captchimage.ashx" or "/sz/captchimage.ashx"
      const captchaPath = captchaMatch[1].replace(/^\/sz\//, '').replace(/^\//, '')
      const captchaResp = await portalFetch(captchaPath)
      const captchaSvg = await captchaResp.text()
      captchaText = solveCaptchaSvg(captchaSvg)
      console.log('[portalScraper] Captcha solved:', captchaText)
    } catch (e) {
      console.warn('[portalScraper] Captcha solve failed:', e)
    }
  }

  // Step 3: POST login
  const fields = extractHiddenFields(loginHtml)
  const payload = formEncode({
    ...fields,
    txtLogin: rollNumber.trim().toUpperCase(),
    txtPassword: password,
    bl: 'Student',
    btnSubmit: 'Submit',
    ...(captchaText ? { txtCaptcha: captchaText } : {}),
  })

  const postResp = await portalFetch('login.aspx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: buildUrl('login.aspx'),
    },
    body: payload,
  })

  const postHtml = await postResp.text()
  console.log('[portalScraper] Login POST status:', postResp.status, 'url:', postResp.url)

  // After following redirects, check if we're on Index.aspx (success) or still on login
  const finalUrl = postResp.url || ''
  if (finalUrl.includes('login') || finalUrl.includes('Login')) {
    // Still on login page — check error message
    const errMatch = postHtml.match(/class="[^"]*(?:help-block|text-danger)[^"]*"[^>]*>\s*([^<]+?)\s*</)
    const errMsg = errMatch ? errMatch[1].trim() : ''
    if (errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('incorrect')) {
      throw Object.assign(new Error(errMsg || 'Incorrect password'), { portalCode: 'INCORRECT_PASSWORD' })
    }
    if (errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('username') || errMsg.toLowerCase().includes('roll')) {
      throw Object.assign(new Error(errMsg || 'Invalid username'), { portalCode: 'INVALID_USERNAME' })
    }
    if (errMsg) {
      throw Object.assign(new Error(errMsg), { portalCode: 'LOGIN_FAILED' })
    }
    // No explicit error but still on login page — captcha probably failed, retry
    throw Object.assign(new Error('Login failed — possibly captcha error, please retry'), { portalCode: 'LOGIN_FAILED' })
  }

  // Successfully redirected away from login page
  return postHtml
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
 * Get student name from the post-login page HTML.
 */
export function getStudentInfoFromHtml(html) {
  const nameMatch = html.match(/id="lblName"[^>]*>([^<]+)</)
  const studentName = nameMatch ? nameMatch[1].trim() : null
  return { studentName, programSn: null, programFull: null }
}
