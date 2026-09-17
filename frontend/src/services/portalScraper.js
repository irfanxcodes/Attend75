/**
 * Client-side portal scraper.
 *
 * The browser makes portal requests through the Cloudflare Worker (for CORS).
 * The Worker uses redirect:"manual" and returns 302 responses as JSON so we
 * capture cookies without ever asking Cloudflare's IP to load Index.aspx
 * (which is blocked). Subsequent requests carry cookies in the Cookie header.
 */

const WORKER_BASE = 'https://attend75-proxy.kiro-one-mail.workers.dev/sz'
const TIMEOUT_MS = 25000

// Manual cookie jar — Worker strips HttpOnly so we can manage cookies in JS
const cookieJar = {}

function buildUrl(path) {
  return `${WORKER_BASE}/${path.replace(/^\//, '')}`
}

function cookieHeader() {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function portalFetch(path, options = {}) {
  const url = buildUrl(path)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: cookieHeader(),
        ...(options.headers || {}),
      },
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }
}

function extractHiddenFields(html) {
  const fields = {}
  const re = /<input[^>]+type=["']hidden["'][^>]*>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const n = tag.match(/name=["']([^"']+)["']/)
    const v = tag.match(/value=["']([^"']*)["']/)
    if (n) fields[n[1]] = v ? v[1] : ''
  }
  return fields
}

function solveCaptchaSvg(svgText) {
  const matches = [...svgText.matchAll(/<text[^>]*>\s*([^<\s][^<]*?)\s*<\/text>/gi)]
  return matches.map((m) => m[1].trim()).join('')
}

function formEncode(data) {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * Login to the portal.
 * The Worker intercepts the 302 and returns JSON with cookies.
 * Returns synthetic HTML with student name for compatibility.
 */
export async function portalLogin(rollNumber, password) {
  // Clear previous session
  Object.keys(cookieJar).forEach((k) => delete cookieJar[k])

  // Step 1: GET login page
  const loginResp = await portalFetch('login.aspx')
  const loginHtml = await loginResp.text()

  // Step 2: Solve captcha
  const captchaMatch = loginHtml.match(/id="captchaImage"[^>]+src="([^"]+)"/)
  let captchaText = ''
  if (captchaMatch) {
    try {
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
  const postResp = await portalFetch('login.aspx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: buildUrl('login.aspx'),
    },
    body: formEncode({
      ...fields,
      txtLogin: rollNumber.trim().toUpperCase(),
      txtPassword: password,
      bl: 'Student',
      btnSubmit: 'Submit',
      ...(captchaText ? { txtCaptcha: captchaText } : {}),
    }),
  })

  // Step 4: Handle response
  // Worker returns JSON {__portalRedirect, cookies} when portal sends 302
  const ct = postResp.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    let json
    try { json = await postResp.json() } catch { json = null }

    if (json?.__portalRedirect && json.cookies) {
      Object.assign(cookieJar, json.cookies)
      const hasAuth = ['UserID', 'CurrentSession', 'Enrolno'].some((k) => cookieJar[k])
      if (!hasAuth) {
        throw Object.assign(
          new Error('Login failed — no auth cookies. Check credentials.'),
          { portalCode: 'LOGIN_FAILED' }
        )
      }
      console.log('[portalScraper] Login OK. Cookies:', Object.keys(cookieJar))
      const name = cookieJar['Name'] ? decodeURIComponent(cookieJar['Name'].replace(/\+/g, ' ')) : ''
      return `<span id="lblName">${name}</span>`
    }
  }

  // Fallback: read as HTML (Worker followed redirect to Index.aspx)
  const postHtml = await postResp.text()
  const finalUrl = postResp.url || ''
  console.log('[portalScraper] Login POST final url:', finalUrl, 'status:', postResp.status)

  if (finalUrl.includes('login') || finalUrl.includes('Login')) {
    const errMatch = postHtml.match(/class="[^"]*(?:help-block|text-danger)[^"]*"[^>]*>\s*([^<]+?)\s*</)
    const errMsg = (errMatch ? errMatch[1].trim() : '').toLowerCase()
    if (errMsg.includes('password') || errMsg.includes('incorrect')) {
      throw Object.assign(new Error('Incorrect password'), { portalCode: 'INCORRECT_PASSWORD' })
    }
    if (errMsg.includes('invalid') || errMsg.includes('username') || errMsg.includes('roll')) {
      throw Object.assign(new Error('Invalid username or roll number'), { portalCode: 'INVALID_USERNAME' })
    }
    throw Object.assign(new Error('Login failed — please retry'), { portalCode: 'LOGIN_FAILED' })
  }

  // Login redirected successfully — extract name
  return postHtml
}

/**
 * Fetch attendance dashboard HTML. Call after portalLogin().
 */
export async function fetchAttendanceHtml() {
  const resp = await portalFetch('AttendanceDashboard.aspx', {
    headers: { Referer: buildUrl('Index.aspx') },
  })
  const html = await resp.text()

  if (!html.includes('ad-card') && !html.includes('<table')) {
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
 * Fetch courses page HTML for short abbreviations.
 */
export async function fetchCoursesHtml(semesterId) {
  const resp = await portalFetch('rc/cr.aspx', {
    headers: { Referer: buildUrl('Index.aspx') },
  })
  const html = await resp.text()
  if (!semesterId) return html

  const fields = extractHiddenFields(html)
  const selMatch = html.match(/name="ddlSem"[^>]*onchange="([^"]+)"/)
  const evtMatch = selMatch && selMatch[1].match(/__doPostBack\('([^']+)'/)
  const evtTarget = evtMatch ? evtMatch[1] : 'ddlSem'

  const postResp = await portalFetch('rc/cr.aspx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: buildUrl('rc/cr.aspx'),
    },
    body: formEncode({ ...fields, __EVENTTARGET: evtTarget, __EVENTARGUMENT: '', ddlSem: semesterId }),
  })
  return postResp.text()
}

/**
 * Extract student name from post-login HTML.
 */
export function getStudentInfoFromHtml(html) {
  const nameMatch = html.match(/id="lblName"[^>]*>([^<]+)</)
  return {
    studentName: nameMatch ? nameMatch[1].trim() : null,
    programSn: null,
    programFull: null,
  }
}
