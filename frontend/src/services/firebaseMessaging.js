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
 * Uses the VAPID key for web push certificate validation.
 */
export async function getFCMToken(vapidKey) {
  try {
    const messaging = getFirebaseMessaging()
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
        || await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
    })
    return token
  } catch (err) {
    console.warn('[FCM] Failed to get token:', err.message)
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
