/**
 * Service Worker registration for Attend75 PWA.
 *
 * Uses the virtual module provided by vite-plugin-pwa.
 * The plugin auto-generates the service worker during build and
 * handles registration + update lifecycle.
 *
 * In development mode, the service worker is not active.
 * In production, it precaches static assets and handles
 * runtime caching for fonts.
 */

import { registerSW } from 'virtual:pwa-register'

let updateSW = null

/**
 * Initialize service worker registration.
 * Call once at app startup (main.jsx).
 */
export function initServiceWorker() {
  if (typeof window === 'undefined') return

  updateSW = registerSW({
    immediate: true,

    onRegisteredSW(swUrl, registration) {
      if (import.meta.env.DEV) {
        console.log('[PWA] Service worker registered (dev mode):', swUrl)
      }

      // Check for updates every hour in production
      if (registration && !import.meta.env.DEV) {
        setInterval(() => {
          registration.update()
        }, 60 * 60 * 1000)
      }
    },

    onOfflineReady() {
      if (import.meta.env.DEV) {
        console.log('[PWA] App is ready to work offline')
      }
    },

    onNeedRefresh() {
      // Dispatch a custom event that UI components can listen to
      // for showing an "Update available" toast
      window.dispatchEvent(new CustomEvent('attend75:sw-update-available'))
    },

    onRegisterError(error) {
      console.error('[PWA] Service worker registration failed:', error)
    },
  })
}

/**
 * Trigger the pending service worker update.
 * Call this when the user confirms they want to refresh.
 */
export function applyServiceWorkerUpdate() {
  if (updateSW) {
    updateSW(true)
  }
}
