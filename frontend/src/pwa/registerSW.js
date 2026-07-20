/**
 * Service Worker registration for Attend75 PWA.
 *
 * Uses the virtual module provided by vite-plugin-pwa.
 * The plugin auto-generates the service worker during build and
 * handles registration + update lifecycle.
 *
 * Key behavior: When a new SW version is detected, it auto-applies
 * immediately (no user confirmation required). This ensures users
 * always get the latest code without manual cache clearing.
 */

let updateSW = null

/**
 * Initialize service worker registration.
 * Call once at app startup (main.jsx).
 */
export async function initServiceWorker() {
  if (typeof window === 'undefined') return

  try {
    const { registerSW } = await import('virtual:pwa-register')

    updateSW = registerSW({
      immediate: true,

      onRegisteredSW(swUrl, registration) {
        if (import.meta.env.DEV) {
          console.log('[PWA] Service worker registered (dev mode):', swUrl)
        }

        // Check for updates every 5 minutes in production (was 60min — too slow)
        if (registration && !import.meta.env.DEV) {
          setInterval(() => {
            registration.update()
          }, 5 * 60 * 1000)
        }
      },

      onOfflineReady() {
        if (import.meta.env.DEV) {
          console.log('[PWA] App is ready to work offline')
        }
      },

      onNeedRefresh() {
        // Auto-apply the update immediately — no user confirmation needed.
        // The new SW has skipWaiting() so it activates right away.
        // This ensures push notification code is always current.
        if (updateSW) {
          updateSW(true)
        }
      },

      onRegisterError(error) {
        console.error('[PWA] Service worker registration failed:', error)
      },
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.log('[PWA] Service worker not available in dev mode')
    } else {
      console.error('[PWA] Failed to initialize service worker:', error)
    }
  }
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
