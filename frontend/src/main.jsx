import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.jsx'
import { AppStateProvider } from './store/AppStateProvider'
import { initServiceWorker } from './pwa/registerSW'

// Initialize PWA service worker (no-op in development)
initServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </StrictMode>,
)
