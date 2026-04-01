import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'

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

export async function signInWithGoogleAndGetIdToken() {
  const { firebaseAuth } = ensureFirebaseInitialized()
  const provider = new GoogleAuthProvider()

  const result = await signInWithPopup(firebaseAuth, provider)
  const idToken = await result.user.getIdToken(true)

  return {
    idToken,
    email: result.user.email,
    displayName: result.user.displayName,
  }
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
