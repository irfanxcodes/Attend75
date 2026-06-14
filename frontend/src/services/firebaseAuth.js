import { initializeApp } from 'firebase/app'
import { getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'

let firebaseApp = null
let firebaseAuth = null

function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
}

function ensureFirebaseInitialized() {
  if (firebaseApp && firebaseAuth) {
    return { firebaseApp, firebaseAuth }
  }

  const config = getFirebaseConfig()
  const hasMissingConfig = Object.values(config).some((value) => !String(value || '').trim())

  if (hasMissingConfig) {
    throw new Error('Firebase is not configured. Missing VITE_FIREBASE_* variables.')
  }

  firebaseApp = initializeApp(config)
  firebaseAuth = getAuth(firebaseApp)

  return { firebaseApp, firebaseAuth }
}

/**
 * Detect if the app is running in iOS standalone (installed PWA) mode.
 * In this mode, signInWithPopup() fails because Safari standalone blocks popups.
 * We use signInWithRedirect() instead.
 */
function isIOSStandaloneMode() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  return isIOS && isStandalone
}

export async function signInWithGoogleAndGetIdToken() {
  const { firebaseAuth } = ensureFirebaseInitialized()
  const provider = new GoogleAuthProvider()

  if (isIOSStandaloneMode()) {
    // iOS PWA standalone mode: use redirect flow
    // The result will be captured on the next page load via getRedirectResult()
    await signInWithRedirect(firebaseAuth, provider)
    // This line won't be reached — the page redirects
    return null
  }

  const result = await signInWithPopup(firebaseAuth, provider)
  const idToken = await result.user.getIdToken(true)

  return {
    idToken,
    email: result.user.email,
    displayName: result.user.displayName,
  }
}

/**
 * Check for a pending redirect result (used after signInWithRedirect on iOS PWA).
 * Call this once on app initialization.
 */
export async function checkRedirectResult() {
  try {
    const { firebaseAuth } = ensureFirebaseInitialized()
    const result = await getRedirectResult(firebaseAuth)
    if (result && result.user) {
      const idToken = await result.user.getIdToken(true)
      return {
        idToken,
        email: result.user.email,
        displayName: result.user.displayName,
      }
    }
  } catch {
    // No redirect result or error — this is normal on most page loads
  }
  return null
}

export async function signOutFirebaseUser() {
  const { firebaseAuth } = ensureFirebaseInitialized()
  await signOut(firebaseAuth)
}

export function subscribeToFirebaseAuthState(callback) {
  try {
    const { firebaseAuth } = ensureFirebaseInitialized()
    return onAuthStateChanged(firebaseAuth, callback)
  } catch {
    callback(null)
    return () => {}
  }
}
