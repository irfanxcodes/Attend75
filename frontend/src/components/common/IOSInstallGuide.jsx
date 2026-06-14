import { useEffect, useState } from 'react'
import { useInstallPrompt } from '../../pwa/useInstallPrompt'
import { onWalkthroughDone } from '../../pwa/installCoordinator'

const DISMISS_KEY = 'attend75.iosGuide.dismissedAt'
const DISMISS_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000 // 5 days

function isSafariBrowser() {
  const ua = navigator.userAgent || ''
  return /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg/.test(ua)
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * Safari install guide with:
 * - Visual highlight arrow pointing to Share button location
 * - Benefits of installing
 * - Step-by-step instructions
 * - Adapts for iOS (home screen) vs macOS (dock)
 */
function IOSInstallGuide() {
  const { isInstalled, canInstall } = useInstallPrompt()
  const [show, setShow] = useState(false)
  const [engagementMet, setEngagementMet] = useState(false)

  const isSafari = isSafariBrowser()
  const isIOS = isIOSDevice()
  const shouldTrackEngagement = isSafari && !isInstalled && !canInstall

  useEffect(() => {
    if (!shouldTrackEngagement) return

    // Wait for walkthrough to complete before starting engagement timer
    const cleanupWalkthrough = onWalkthroughDone(() => {
      let pageViews = 0
      const timer = setTimeout(() => {
        setEngagementMet(true)
      }, 15000)

      function handleNavigation() {
        pageViews++
        if (pageViews >= 2) {
          setEngagementMet(true)
        }
      }

      window.addEventListener('popstate', handleNavigation)
      const originalPushState = history.pushState
      history.pushState = function (...args) {
        originalPushState.apply(this, args)
        handleNavigation()
      }

      innerCleanupRef.current = () => {
        clearTimeout(timer)
        window.removeEventListener('popstate', handleNavigation)
        history.pushState = originalPushState
      }
    })

    const innerCleanupRef = { current: null }

    return () => {
      cleanupWalkthrough()
      if (innerCleanupRef.current) innerCleanupRef.current()
    }
  }, [shouldTrackEngagement])

  useEffect(() => {
    if (!engagementMet || !shouldTrackEngagement) return

    try {
      const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
        return
      }
    } catch { /* */ }

    setShow(true)
  }, [engagementMet, shouldTrackEngagement])

  const handleDismiss = () => {
    setShow(false)
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* */ }
  }

  if (!show) return null

  const action = isIOS ? 'Tap' : 'Click'

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={handleDismiss}
    >
      {/* Highlight arrow pointing to Share button location */}
      {isIOS ? (
        // iOS: arrow pointing down to bottom center (Share button in Safari bottom bar)
        <div className="fixed bottom-2 left-1/2 z-[151] -translate-x-1/2 animate-bounce">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-[#FF916C]">Share button is here</span>
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
        </div>
      ) : (
        // macOS: arrow pointing up to top-right (Share button in Safari toolbar)
        <div className="fixed right-24 top-2 z-[151] animate-bounce">
          <div className="flex flex-col items-center">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            <span className="text-[10px] font-bold text-[#FF916C]">Share button is here</span>
          </div>
        </div>
      )}

      {/* Modal */}
      <div
        className="w-full max-w-sm animate-[slideUp_0.3s_ease-out] rounded-2xl border border-white/10 bg-[#2D2845] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF916C]/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-[#F7F4FF]">Install Attend75</p>
            <p className="text-[10px] text-[#9F9AB5]">Get the full app experience</p>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/5 px-2 py-2 text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p className="mt-1 text-[9px] font-semibold text-[#D8D4E7]">Notifications</p>
          </div>
          <div className="rounded-lg bg-white/5 px-2 py-2 text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4 text-[#6CB4FF]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <p className="mt-1 text-[9px] font-semibold text-[#D8D4E7]">Works Offline</p>
          </div>
          <div className="rounded-lg bg-white/5 px-2 py-2 text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="mt-1 text-[9px] font-semibold text-[#D8D4E7]">Instant Launch</p>
          </div>
        </div>

        {/* Steps */}
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/20 text-[10px] font-bold text-[#FF916C]">1</span>
            <p className="text-[11px] font-medium text-[#F7F4FF]">
              {action} the <span className="font-bold text-[#6CB4FF]">Share</span> button
              {isIOS ? ' ↓ below' : ' ↑ above'}
            </p>
            <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 shrink-0 text-[#6CB4FF]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/20 text-[10px] font-bold text-[#FF916C]">2</span>
            <p className="text-[11px] font-medium text-[#F7F4FF]">
              {action} &quot;<span className="font-bold text-[#4EF0A0]">Add to {isIOS ? 'Home Screen' : 'Dock'}</span>&quot;
            </p>
            <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 shrink-0 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/20 text-[10px] font-bold text-[#FF916C]">3</span>
            <p className="text-[11px] font-medium text-[#F7F4FF]">
              {action} &quot;<span className="font-bold text-[#4EF0A0]">Add</span>&quot; to confirm
            </p>
            <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 shrink-0 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="mt-4 w-full rounded-full bg-[#FF916C] py-2.5 text-xs font-bold text-[#1D183E] transition active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

export default IOSInstallGuide
