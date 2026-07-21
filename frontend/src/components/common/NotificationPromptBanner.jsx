import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { ensurePushRegistered, getNotificationPermission } from '../../pwa/push/subscribe'
import useAppStore from '../../hooks/useAppStore'

const DISMISS_KEY = 'attend75.notifBanner.dismissed'
const SHOWN_KEY = 'attend75.notifBanner.shown'

/**
 * One-time notification permission banner.
 * Shows once after the user has used the app for a bit (2nd session or after 30s).
 * Dismissed permanently after user interacts (allow or dismiss).
 */
function NotificationPromptBanner() {
  const { state: { session } } = useAppStore()
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Don't show if: no session, already dismissed, already granted, not supported
    if (!session.token) return
    if (localStorage.getItem(DISMISS_KEY)) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission === 'granted') return
    if (Notification.permission === 'denied') return

    // Show after 15 seconds (don't overwhelm on first load)
    const timer = setTimeout(() => {
      // Double-check permission hasn't changed
      if (Notification.permission !== 'default') return
      if (localStorage.getItem(DISMISS_KEY)) return
      setShow(true)
      localStorage.setItem(SHOWN_KEY, '1')
    }, 15000)

    return () => clearTimeout(timer)
  }, [session.token])

  const handleAllow = async () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted' && session.token) {
        // Register push subscription
        await ensurePushRegistered(session.token)
      }
    } catch { /* silent */ }
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 animate-slide-up">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-[#2E2A3A] shadow-2xl shadow-black/40 ring-1 ring-white/10">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/15">
            <Bell className="h-5 w-5 text-[#FF916C]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-[#F7F4FF]">Stay in the loop</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#9F9AB5]">
              Get notified about new notices, attendance alerts, and replies to your feedback.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 p-1 text-[#9F9AB5] hover:text-[#F7F4FF]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-2.5">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[#9F9AB5] transition hover:bg-white/5"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleAllow}
            className="rounded-lg bg-[#FF916C] px-4 py-1.5 text-[11px] font-bold text-[#1D183E] transition active:scale-95"
          >
            Allow notifications
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotificationPromptBanner
