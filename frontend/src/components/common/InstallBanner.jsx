import { useEffect, useState } from 'react'
import { useInstallPrompt } from '../../pwa/useInstallPrompt'
import { onWalkthroughDone } from '../../pwa/installCoordinator'

const DISMISS_KEY = 'attend75.installBanner.dismissed'

/**
 * Smart install banner for Android/Desktop (Chrome, Edge, Firefox).
 * Shows benefits + one-tap install button.
 * Dismissed per session only — reappears on every new app open.
 */
function InstallBanner() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt()
  const [show, setShow] = useState(false)
  const [engagementMet, setEngagementMet] = useState(false)

  useEffect(() => {
    if (isInstalled || !canInstall) return

    // Wait for walkthrough to complete before starting engagement timer
    const innerCleanupRef = { current: null }

    const cleanupWalkthrough = onWalkthroughDone(() => {
      let pageViews = 0
      const timer = setTimeout(() => {
        setEngagementMet(true)
      }, 9000)

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

    return () => {
      cleanupWalkthrough()
      if (innerCleanupRef.current) innerCleanupRef.current()
    }
  }, [canInstall, isInstalled])

  useEffect(() => {
    if (!engagementMet || !canInstall || isInstalled) return

    try {
      if (window.sessionStorage.getItem(DISMISS_KEY)) {
        return
      }
    } catch { /* */ }

    setShow(true)
  }, [engagementMet, canInstall, isInstalled])

  const handleInstall = async () => {
    const accepted = await promptInstall()
    if (accepted) {
      // User accepted — hide banner
      setShow(false)
    }
    // If user cancelled the browser dialog, keep our banner visible.
    // They might want to try again. Don't set any cooldown.
  }

  const handleDismiss = () => {
    setShow(false)
    try { window.sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* */ }
  }

  if (!show) return null

  return (
    <div className="fixed inset-x-3 bottom-[88px] z-[100] mx-auto max-w-md animate-[slideUp_0.3s_ease-out] rounded-2xl border border-[#FF916C]/30 bg-[#2D2845]/95 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-lg md:bottom-6 md:left-auto md:right-6 md:inset-x-auto md:w-96">
      {/* Header */}
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
          <p className="mt-0.5 text-[11px] text-[#9F9AB5]">Get the full app experience</p>
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

      {/* Actions */}
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
          className="rounded-full bg-[#FF916C] px-5 py-2 text-[11px] font-bold text-[#1D183E] transition active:scale-95 hover:bg-[#FFAA8D]"
        >
          Install
        </button>
      </div>
    </div>
  )
}

export default InstallBanner
