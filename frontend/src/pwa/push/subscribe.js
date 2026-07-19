/**
 * Push Subscription Helper — wraps PushManager.subscribe() with VAPID key.
 */

import { getVapidPublicKey, subscribePush } from '../../services/pushApi'

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
    throw new Error('Push notifications are not supported in this browser')
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
        // Final fallback: tell user to clear site data
        throw new Error(
          `Push service error. This is usually a browser cache issue. ` +
          `Please clear site data: Settings → Privacy → Site Settings → attend75.xyz → Clear data, then try again. ` +
          `[${retryErr.message}]`
        )
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
