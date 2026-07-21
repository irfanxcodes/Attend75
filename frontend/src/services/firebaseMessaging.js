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
    if (Notification.permission !== 'granted') return 'NO_PERMISSION'
    const messaging = getFirebaseMessaging()
    // Register Firebase's own messaging SW at its expected scope
    let swRegistration
    try {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
      })
      // Wait for activation
      if (swRegistration.installing) {
        await new Promise(r => {
          swRegistration.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') r()
          })
          setTimeout(r, 3000) // timeout fallback
        })
      }
    } catch (swErr) {
      return 'SW_REG_FAIL:' + (swErr.message || '').substring(0, 30)
    }

    let token
    try {
      token = await getToken(messaging, {
        vapidKey: FCM_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      })
    } catch (tokenErr) {
      return 'TOKEN_ERR:' + (tokenErr.code || tokenErr.message || '').substring(0, 40)
    }

    if (!token) return null
    return token
  } catch (err) {
    return 'OUTER_ERR:' + (err.code || err.message || String(err)).substring(0, 40)
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
