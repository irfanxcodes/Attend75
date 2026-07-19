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
 * Returns the subscription data on success, or null if denied/unavailable.
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

  // Unsubscribe any existing subscription first (avoids stale key conflicts)
  const existingSub = await registration.pushManager.getSubscription()
  if (existingSub) {
    await existingSub.unsubscribe()
  }

  // Subscribe to push with fresh VAPID key
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

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
