/**
 * Firebase Cloud Messaging — FCM token management for push notifications.
 * 
 * Uses Firebase Messaging SDK which delivers through Google Play Services
 * on Android (bypasses Chrome's battery-restricted push receiver).
 * This is significantly more reliable for background delivery.
 */

import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { initializeApp, getApps } from 'firebase/app'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: '222443696612',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Firebase Web Push certificate VAPID key (generated in Firebase Console → Cloud Messaging → Web Push certificates)
// This is DIFFERENT from our custom VAPID key used for pywebpush delivery
const FCM_VAPID_KEY = 'BIPcJq_HqbuQxq2KwQX1X44yAAgEQHWNaXeXSunpnA_guAHdd0IsJ_zr1A4y27VPHvTFiEoHCQmEqbdH3Aglz4I'

let messagingInstance = null

function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
  messagingInstance = getMessaging(app)
  return messagingInstance
}

/**
 * Get the FCM token for this device.
 * Requires notification permission to already be granted.
 * Uses Firebase's VAPID key (not our custom one).
 */
export async function getFCMToken() {
  try {
    const messaging = getFirebaseMessaging()
    // Use the main service worker registration (sw.js) — not a separate one.
    // Chrome only allows one active SW per scope; registering a second one conflicts.
    const swRegistration = await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    })
    return token
  } catch (err) {
    console.warn('[FCM] Failed to get token:', err.message || err)
    return null
  }
}

/**
 * Listen for foreground messages (when the app tab is active).
 * Background messages are handled by firebase-messaging-sw.js.
 */
export function onForegroundMessage(callback) {
  try {
    const messaging = getFirebaseMessaging()
    return onMessage(messaging, (payload) => {
      callback(payload)
    })
  } catch {
    return () => {}
  }
}
