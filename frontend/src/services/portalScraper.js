/**
 * Client-side portal scraper using a hidden HTTP iframe.
 *
 * The portal is HTTP. Our site is HTTPS. Browsers block HTTP requests
 * from HTTPS (mixed content). But we can load a hidden iframe pointing
 * to our own backend served over HTTP, and from that HTTP context the
 * browser can freely talk to the HTTP portal.
 *
 * Flow:
 *   1. Load hidden iframe: http://api.attend75.xyz/portal-helper
 *   2. Send postMessage {type:'DO_LOGIN', rollNumber, password}
 *   3. iframe does portal login on student's residential IP
 *   4. iframe sends back {type:'LOGIN_SUCCESS', attendanceHtml, coursesHtml}
 *   5. We POST the HTML to /parse/login and get a token back
 */

const HELPER_URL = 'http://api.attend75.xyz/portal-helper'
const TIMEOUT_MS = 45000

let helperFrame = null
let helperReady = false
const pendingCallbacks = []

function getOrCreateFrame() {
  if (helperFrame && document.body.contains(helperFrame)) {
    return helperFrame
  }

  helperFrame = document.createElement('iframe')
  helperFrame.src = HELPER_URL
  helperFrame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;'
  helperFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
  document.body.appendChild(helperFrame)
  helperReady = false

  return helperFrame
}

function setupMessageListener() {
  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.type === 'HELPER_READY') {
      helperReady = true
      // Flush any pending callbacks
      pendingCallbacks.forEach((cb) => cb())
      pendingCallbacks.length = 0
    }

    if (data.type === 'LOGIN_SUCCESS' || data.type === 'LOGIN_ERROR') {
      // Dispatch to whoever is waiting
      window.dispatchEvent(new CustomEvent('portal-helper-response', { detail: data }))
    }
  })
}

setupMessageListener()

/**
 * Login via hidden iframe on student's residential IP.
 * Returns { attendanceHtml, coursesHtml, selectedSemester }
 */
export async function portalLoginViaFrame(rollNumber, password) {
  return new Promise((resolve, reject) => {
    const frame = getOrCreateFrame()
    const timer = setTimeout(() => {
      cleanup()
      reject(Object.assign(new Error('Portal login timed out'), { portalCode: 'PORTAL_TIMEOUT' }))
    }, TIMEOUT_MS)

    function onResponse(event) {
      const data = event.detail
      if (data.type === 'LOGIN_SUCCESS') {
        cleanup()
        resolve(data)
      } else if (data.type === 'LOGIN_ERROR') {
        cleanup()
        reject(Object.assign(new Error(data.message || 'Login failed'), { portalCode: data.code || 'LOGIN_FAILED' }))
      }
    }

    function cleanup() {
      clearTimeout(timer)
      window.removeEventListener('portal-helper-response', onResponse)
    }

    function sendLogin() {
      window.addEventListener('portal-helper-response', onResponse)
      frame.contentWindow.postMessage({ type: 'DO_LOGIN', rollNumber, password }, '*')
    }

    if (helperReady) {
      sendLogin()
    } else {
      // Wait for helper to signal ready
      const readyTimer = setTimeout(() => {
        pendingCallbacks.splice(pendingCallbacks.indexOf(sendLogin), 1)
        cleanup()
        reject(Object.assign(new Error('Portal helper failed to load'), { portalCode: 'PORTAL_UNREACHABLE' }))
      }, 10000)

      pendingCallbacks.push(() => {
        clearTimeout(readyTimer)
        sendLogin()
      })
    }
  })
}
// cache bust 1789704361
