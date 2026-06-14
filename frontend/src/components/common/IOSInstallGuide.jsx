import { useEffect, useState } from 'react'
import { useInstallPrompt } from '../../pwa/useInstallPrompt'

const DISMISS_KEY = 'attend75.iosGuide.dismissedAt'
const DISMISS_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000 // 5 days

/**
 * Detect if this is a Safari browser (iOS or macOS) that doesn't support
 * the native install prompt (beforeinstallprompt).
 */
function isSafariBrowser() {
  const ua = navigator.userAgent || ''
  // Safari on iOS or macOS — but NOT Chrome/Firefox/Edge on those platforms
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg/.test(ua)
  return isSafari
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * Safari install guide (iOS + macOS).
 *
 * Shows when:
 * - Browser is Safari (no native install prompt available)
 * - App is NOT already installed (not standalone)
 * - User has spent 15+ seconds or navigated 2+ pages
 * - Not dismissed in last 5 days
 */
function IOSInstallGuide() {
  const { isInstalled, canInstall } = useInstallPrompt()
  const [show, setShow] = useState(false)
  const [engagementMet, setEngagementMet] = useState(false)

  const isSafari = isSafariBrowser()
  const isIOS = isIOSDevice()

  // Don't show if: already installed, has native prompt (Chrome/Edge), or not Safari
  const shouldTrackEngagement = isSafari && !isInstalled && !canInstall

  useEffect(() => {
    if (!shouldTrackEngagement) return

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

    return () => {
      clearTimeout(timer)
      window.removeEventListener('popstate', handleNavigation)
      history.pushState = originalPushState
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
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch { /* */ }
  }

  if (!show) return null

  // Adapt instructions for iOS vs macOS Safari
  const shareDescription = isIOS
    ? 'The square with an arrow at the bottom of Safari'
    : 'In the menu bar or the share icon in the address bar'

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm sm:items-center"
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-sm animate-[slideUp_0.3s_ease-out] rounded-2xl border border-white/10 bg-[#2D2845] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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
            <p className="text-[10px] text-[#9F9AB5]">Add to your {isIOS ? 'home screen' : 'dock'}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {/* Step 1 */}
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/20 text-xs font-bold text-[#FF916C]">1</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#F7F4FF]">{isIOS ? 'Tap' : 'Click'} the Share button</p>
              <p className="mt-0.5 text-[10px] text-[#9F9AB5]">{shareDescription}</p>
            </div>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#6CB4FF]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </div>

          {/* Step 2 */}
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/20 text-xs font-bold text-[#FF916C]">2</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#F7F4FF]">{isIOS ? 'Scroll down and tap' : 'Click'} &quot;Add to {isIOS ? 'Home Screen' : 'Dock'}&quot;</p>
              <p className="mt-0.5 text-[10px] text-[#9F9AB5]">It has a + icon next to it</p>
            </div>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>

          {/* Step 3 */}
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/20 text-xs font-bold text-[#FF916C]">3</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#F7F4FF]">{isIOS ? 'Tap' : 'Click'} &quot;Add&quot; to confirm</p>
              <p className="mt-0.5 text-[10px] text-[#9F9AB5]">Attend75 will appear on your {isIOS ? 'home screen' : 'dock'}</p>
            </div>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
