import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.jsx'
import { AppStateProvider } from './store/AppStateProvider'
import { initServiceWorker } from './pwa/registerSW'
import { initOfflineQueueSync } from './services/offlineQueue'
import { submitFeedback, submitRating, trackFeatureUsageEvent } from './services/attendanceApi'

// Initialize PWA service worker (no-op in development)
initServiceWorker()

// Force service worker update check on every page load (ensures new code propagates quickly)
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.update()
  })
}

// Listen for NOTIFICATION_CLICK messages from the service worker (fallback for
// browsers where WindowClient.navigate() is not supported)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.url) {
      window.location.href = event.data.url
    }
  })
}

// Initialize offline queue — sends queued actions when connectivity returns
initOfflineQueueSync(async (type, payload) => {
  switch (type) {
    case 'feedback':
      await submitFeedback(payload.message, payload.userName)
      break
    case 'rating':
      await submitRating(payload.token, payload.rating)
      break
    case 'feature-usage':
      await trackFeatureUsageEvent(payload)
      break
    default:
      break
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </StrictMode>,
)
