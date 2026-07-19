/**
 * Push Subscription Helper — wraps PushManager.subscribe() with VAPID key.
 */

import { getVapidPublicKey, subscribePush } from '../../services/pushApi'

/**
 * Detect if running on iOS in a non-Safari browser (Chrome, Brave, Firefox, etc.)
 * All iOS browsers use WebKit but only Safari supports Web Push (as PWA).
 */
function isIOSNonSafari() {
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  if (!isIOS) return false
  // Safari on iOS doesn't have "CriOS", "FxiOS", "OPiOS", "EdgiOS" in the UA
  // Brave on iOS shows as Safari but doesn't support push either
  // The key check: if it's iOS and NOT running as standalone PWA and the push API isn't fully supported
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Brave/.test(ua)
  // Even "Safari" on iOS Brave reports as Safari — detect via navigator.brave
  if (typeof navigator.brave !== 'undefined') return true
  return !isSafari
}

/**
 * Detect if running on iOS Safari but NOT installed as PWA (standalone mode).
 * Push only works when installed to Home Screen on iOS.
 */
function isIOSNonPWA() {
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  if (!isIOS) return false
  // Check if running in standalone mode (installed PWA)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  return !isStandalone
}

/**
 * Convert a base64url-encoded string to Uint8Array for applicationServerKey.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Request notification permission and subscribe to Web Push.
 * Returns the subscription data on success, throws on failure.
 */
export async function requestPushSubscription(token) {
  // Check browser support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // Detect iOS non-Safari browsers
    if (isIOSNonSafari()) {
      throw new Error(
        'iOS_NON_SAFARI: Push notifications on iPhone only work in Safari. ' +
        'Open attend75.xyz in Safari → tap Share → "Add to Home Screen" → open from there.'
      )
    }
    throw new Error('Push notifications are not supported in this browser')
  }

  // Even if PushManager exists, iOS non-PWA Safari won't work
  if (isIOSNonPWA()) {
    throw new Error(
      'iOS_NOT_INSTALLED: To get notifications on iPhone, install the app first: ' +
      'tap Share (box with arrow) → "Add to Home Screen" → then enable notifications.'
    )
  }

  // Request permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(`Notification permission ${permission}. Please allow notifications in your browser settings.`)
  }

  // Get VAPID public key from backend
  const { publicKey } = await getVapidPublicKey()
  if (!publicKey) {
    throw new Error('VAPID public key not configured on the server')
  }

  // Get the active service worker registration
  const registration = await navigator.serviceWorker.ready

  // Check for existing subscription — if it exists with a different applicationServerKey,
  // we must unsubscribe it first (browser rejects subscribe with a different key)
  const existingSub = await registration.pushManager.getSubscription()
  if (existingSub) {
    try {
      await existingSub.unsubscribe()
    } catch {
      // If unsubscribe fails, continue anyway — subscribe() might still work
    }
  }

  // Subscribe to push with the VAPID key
  const applicationServerKey = urlBase64ToUint8Array(publicKey)
  let subscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  } catch (subErr) {
    // "Registration failed - push service error" can happen when:
    // 1. The browser has a stale push registration with a different VAPID key
    // 2. The push service (FCM/APNs) is temporarily unavailable
    // 3. iOS Safari (not running as installed PWA)
    //
    // Attempt recovery: unregister SW, re-register, try again
    const swState = registration.active ? registration.active.state : 'none'
    const errMsg = subErr.message || String(subErr)

    if (errMsg.includes('push service') || errMsg.includes('Registration failed')) {
      // Try recovery: unregister the SW completely and re-register
      try {
        await registration.unregister()
        // Wait for the new SW to be ready
        const newReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        await navigator.serviceWorker.ready

        subscription = await newReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      } catch (retryErr) {
        // Detect platform for specific instructions
        const ua = navigator.userAgent
        const isIOS = /iPhone|iPad|iPod/.test(ua)
        const isMac = /Macintosh|Mac OS X/.test(ua)

        if (isIOS) {
          throw new Error(
            'iOS_NOT_INSTALLED: Notifications on iPhone require the app to be installed. ' +
            'Open attend75.xyz in Safari → tap the Share button (⬆) → tap "Add to Home Screen" → open the app from your home screen → then enable notifications.'
          )
        } else if (isMac) {
          throw new Error(
            'MAC_CACHE_ISSUE: Your browser has a stale notification cache. To fix:\n\n' +
            '1. Open browser Settings → Privacy / Site Settings\n' +
            '2. Search for "attend75.xyz"\n' +
            '3. Click "Clear data" or "Reset permissions"\n' +
            '4. Come back and tap Enable again\n\n' +
            'Or try: Install Attend75 as an app (click ⋮ menu → "Install Attend75") and enable from there.'
          )
        } else {
          throw new Error(
            'PUSH_ERROR: Could not connect to notification service. To fix:\n\n' +
            '1. Go to browser Settings → Site Settings → Notifications\n' +
            '2. Remove attend75.xyz from the list\n' +
            '3. Come back and tap Enable again\n\n' +
            'Or install as app: tap ⋮ menu → "Install app" and enable from there.'
          )
        }
      }
    } else {
      throw new Error(`${errMsg} [SW: ${swState}]`)
    }
  }

  // Extract keys
  const subJson = subscription.toJSON()
  const endpoint = subJson.endpoint
  const keys = {
    p256dh: subJson.keys.p256dh,
    auth: subJson.keys.auth,
  }

  // Detect device info
  const ua = navigator.userAgent
  let deviceInfo = 'Unknown'
  if (/Android/i.test(ua)) deviceInfo = 'Android'
  else if (/iPhone|iPad/i.test(ua)) deviceInfo = 'iOS'
  else if (/Mac/i.test(ua)) deviceInfo = 'macOS'
  else if (/Windows/i.test(ua)) deviceInfo = 'Windows'
  else if (/Linux/i.test(ua)) deviceInfo = 'Linux'

  // Register with backend
  const result = await subscribePush({ token, endpoint, keys, deviceInfo })
  return result
}

/**
 * Check if push notifications are currently active.
 */
export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

/**
 * Get the current notification permission state.
 * Returns 'granted' | 'denied' | 'default'
 */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}
