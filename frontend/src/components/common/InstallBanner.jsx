import { useEffect, useState } from 'react'
import { useInstallPrompt } from '../../pwa/useInstallPrompt'

const DISMISS_KEY = 'attend75.installBanner.dismissedAt'
const DISMISS_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000 // 5 days

/**
 * Smart install banner for Android/Desktop.
 *
 * Shows when:
 * - The browser supports install (canInstall === true)
 * - User has spent 45+ seconds in the app OR navigated 2+ pages
 * - Banner wasn't dismissed in the last 5 days
 *
 * "Not now" hides for 5 days (not permanently).
 */
function InstallBanner() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt()
  const [show, setShow] = useState(false)
  const [engagementMet, setEngagementMet] = useState(false)

  // Track engagement: 45 seconds on page OR 2+ route changes
  useEffect(() => {
    if (isInstalled || !canInstall) return

    let pageViews = 0
    const timer = setTimeout(() => {
      setEngagementMet(true)
    }, 45000)

    // Count route changes via popstate
    function handleNavigation() {
      pageViews++
      if (pageViews >= 2) {
        setEngagementMet(true)
      }
    }

    window.addEventListener('popstate', handleNavigation)

    // Also listen to pushState (React Router uses this)
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
  }, [canInstall, isInstalled])

  // Show banner when engagement is met and not recently dismissed
  useEffect(() => {
    if (!engagementMet || !canInstall || isInstalled) return

    try {
      const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
        return // Still in cooldown
      }
    } catch {
      // Ignore storage errors
    }

    setShow(true)
  }, [engagementMet, canInstall, isInstalled])

  const handleInstall = async () => {
    const accepted = await promptInstall()
    setShow(false)
    if (!accepted) {
      // User dismissed the native prompt — still set the cooldown
      try {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch { /* */ }
    }
  }

  const handleDismiss = () => {
    setShow(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch { /* */ }
  }

  if (!show) return null

  return (
    <div className="fixed inset-x-3 bottom-[88px] z-[100] mx-auto max-w-md animate-[slideUp_0.3s_ease-out] rounded-2xl border border-[#FF916C]/30 bg-[#2D2845]/95 p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-lg md:bottom-6 md:left-auto md:right-6 md:inset-x-auto md:w-80">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF916C]/15">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#F7F4FF]">Install Attend75</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#9F9AB5]">Add to home screen for quick access. Works offline too.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-[#9F9AB5] transition hover:text-[#F7F4FF]"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={handleInstall}
          className="rounded-full bg-[#FF916C] px-4 py-1.5 text-[11px] font-bold text-[#1D183E] transition active:scale-95 hover:bg-[#FFAA8D]"
        >
          Install
        </button>
      </div>
    </div>
  )
}

export default InstallBanner
