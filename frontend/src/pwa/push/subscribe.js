/**
 * Push Subscription Helper — wraps PushManager.subscribe() with VAPID key.
 * Also registers FCM token for reliable Android background delivery.
 */

import { getVapidPublicKey, subscribePush, registerFCMToken } from '../../services/pushApi'
import { getFCMToken, onForegroundMessage } from '../../services/firebaseMessaging'

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

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function isStandalonePWA() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

/**
 * Request notification permission and subscribe to Web Push.
 * Returns the subscription data on success, throws with a user-friendly code on failure.
 *
 * Error codes:
 * - UNSUPPORTED: browser doesn't support push
 * - IOS_INSTALL_REQUIRED: iOS user needs to install to home screen
 * - PERMISSION_DENIED: user blocked notifications
 * - SUBSCRIBE_FAILED: pushManager.subscribe failed (stale key, network, etc)
 * - BACKEND_ERROR: backend rejected the registration (402 = not premium)
 */
export async function requestPushSubscription(token) {
  // 1. Check browser support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (isIOS()) {
      throw { code: 'IOS_INSTALL_REQUIRED' }
    }
    throw { code: 'UNSUPPORTED' }
  }

  // 2. iOS requires installed PWA for push
  if (isIOS() && !isStandalonePWA()) {
    throw { code: 'IOS_INSTALL_REQUIRED' }
  }

  // 3. Request permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw { code: 'PERMISSION_DENIED' }
  }

  // 4. Get VAPID public key
  const { publicKey } = await getVapidPublicKey()
  if (!publicKey) {
    throw { code: 'UNSUPPORTED', detail: 'Server VAPID key not configured' }
  }

  // 5. Get service worker
  const registration = await navigator.serviceWorker.ready
  const applicationServerKey = urlBase64ToUint8Array(publicKey)

  // 6. Clear any existing subscription (different VAPID key causes errors)
  try {
    const existing = await registration.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()
  } catch { /* ignore */ }

  // 7. Subscribe
  let subscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  } catch {
    // First attempt failed — try full SW reset
    try {
      await registration.unregister()
      const newReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await new Promise(r => setTimeout(r, 1000)) // give it a second to activate
      await navigator.serviceWorker.ready
      subscription = await newReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
    } catch {
      throw { code: 'SUBSCRIBE_FAILED' }
    }
  }

  // 8. Send to backend (Web Push subscription)
  const subJson = subscription.toJSON()
  const ua = navigator.userAgent
  let deviceInfo = 'Unknown'
  if (/Android/i.test(ua)) deviceInfo = 'Android'
  else if (/iPhone|iPad/i.test(ua)) deviceInfo = 'iOS'
  else if (/Mac/i.test(ua)) deviceInfo = 'macOS'
  else if (/Windows/i.test(ua)) deviceInfo = 'Windows'
  else if (/Linux/i.test(ua)) deviceInfo = 'Linux'

  try {
    const result = await subscribePush({
      token,
      endpoint: subJson.endpoint,
      keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
      deviceInfo,
    })

    // 9. Also register FCM token for reliable Android background delivery
    // This runs in parallel — doesn't block the subscribe flow
    registerFCMTokenInBackground(token, publicKey, deviceInfo)

    return result
  } catch (err) {
    if (err?.status === 401) {
      throw { code: 'SESSION_EXPIRED', status: 401 }
    }
    throw { code: 'BACKEND_ERROR', detail: err?.message }
  }
}

/**
 * Register FCM token with the backend (non-blocking).
 * FCM delivers through Google Play Services which is more reliable on Android.
 */
async function registerFCMTokenInBackground(sessionToken, vapidKey, deviceInfo) {
  try {
    const fcmToken = await getFCMToken(vapidKey)
    if (fcmToken) {
      await registerFCMToken({ token: sessionToken, fcmToken, deviceInfo })
    }
  } catch (err) {
    console.warn('[FCM] Background token registration failed:', err.message || err)
  }
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
 * Ensure the current browser push subscription is registered on the backend.
 * Call this on app load / notification settings page to sync state.
 * If the browser has a subscription but the backend doesn't know about it,
 * this will register it. If the subscription was made with a different VAPID key,
 * it will re-subscribe with the correct one.
 * Silently fails if not subscribed or not premium.
 */
export async function ensurePushRegistered(token) {
  if (!token) return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    // If there's an existing subscription, verify it uses our current VAPID key
    // by checking if we can get the server's VAPID key and comparing
    const { publicKey } = await getVapidPublicKey()
    if (!publicKey) return false

    const applicationServerKey = urlBase64ToUint8Array(publicKey)

    if (subscription) {
      // Compare applicationServerKey — if different, unsubscribe and re-subscribe
      const existingKey = subscription.options?.applicationServerKey
      if (existingKey) {
        const existingKeyArray = new Uint8Array(existingKey)
        const keysMatch = existingKeyArray.length === applicationServerKey.length &&
          existingKeyArray.every((v, i) => v === applicationServerKey[i])
        if (!keysMatch) {
          // VAPID key mismatch — unsubscribe old and create new
          await subscription.unsubscribe()
          subscription = null
        }
      }
    }

    // If no subscription (or we just unsubscribed the old one), create a new one
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
    }

    const subJson = subscription.toJSON()
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return false

    const ua = navigator.userAgent
    let deviceInfo = 'Unknown'
    if (/Android/i.test(ua)) deviceInfo = 'Android'
    else if (/iPhone|iPad/i.test(ua)) deviceInfo = 'iOS'
    else if (/Mac/i.test(ua)) deviceInfo = 'macOS'
    else if (/Windows/i.test(ua)) deviceInfo = 'Windows'
    else if (/Linux/i.test(ua)) deviceInfo = 'Linux'

    await subscribePush({
      token,
      endpoint: subJson.endpoint,
      keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
      deviceInfo,
    })

    // Also register FCM token for reliable background delivery on Android
    registerFCMTokenInBackground(token, publicKey, deviceInfo)

    return true
  } catch (err) {
    // Log the error for debugging — don't silently swallow premium/auth failures
    if (err?.status === 402) {
      console.warn('[Push] ensurePushRegistered: not premium, skipping')
    } else if (err?.status === 401) {
      console.warn('[Push] ensurePushRegistered: session expired')
    } else {
      console.warn('[Push] ensurePushRegistered failed:', err?.message || err)
    }
    return false
  }
}

/**
 * Get the current notification permission state.
 */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}
