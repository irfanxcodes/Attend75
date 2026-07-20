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

// Listen for NOTIFICATION_CLICK messages from the service worker
// Uses window.location for navigation (works with React Router's BrowserRouter)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.url) {
      const targetPath = new URL(event.data.url, window.location.origin).pathname + new URL(event.data.url, window.location.origin).search
      // Use pushState + dispatchEvent for SPA navigation without full reload
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
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
