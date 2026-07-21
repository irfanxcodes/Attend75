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
    if (Notification.permission !== 'granted') return null
    const messaging = getFirebaseMessaging()
    // Register Firebase's own messaging SW at its expected scope
    // This doesn't conflict with our main sw.js because it's a different scope
    let swRegistration = await navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope')
    if (!swRegistration) {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
      })
      // Wait for it to be ready
      await new Promise(r => setTimeout(r, 1000))
    }
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    })
    if (token) {
      console.log('[FCM] Token obtained:', token.substring(0, 20) + '...')
    } else {
      console.warn('[FCM] getToken returned empty')
    }
    return token
  } catch (err) {
    console.error('[FCM] getToken failed:', err.code || err.name, err.message)
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
