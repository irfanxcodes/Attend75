import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'attend75.followCreator.dismissed'

const INSTAGRAM_URL = 'https://www.instagram.com/attend.75/'

function FollowCreatorBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED_KEY)) return
      if (localStorage.getItem(DISMISSED_KEY)) return
    } catch { /* */ }

    // Show after a short delay so it doesn't compete with other popups
    const timer = setTimeout(() => setShow(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleDismiss = () => {
    setShow(false)
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* */ }
  }

  if (!show) return null

  return (
    <div className="fixed inset-x-3 bottom-[88px] z-30 mx-auto max-w-md animate-[slideUp_0.3s_ease-out] md:hidden">
      <div className="flex items-center gap-3 rounded-2xl border border-[#FF916C]/20 bg-gradient-to-r from-[#3D2845]/95 to-[#2D2845]/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-lg">
        {/* Arrow icon on pink-purple gradient */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6B9D] to-[#C084FC]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#1D183E]" fill="currentColor" stroke="none">
            <path d="M4 20c2-4 5-8 8-10l-2-2 8-4-4 8-2-2c-2 3-6 6-10 8l2 2z" />
          </svg>
        </div>

        <span className="flex-1 text-sm font-semibold text-[#F7F4FF]">Follow the creator</span>

        {/* Instagram */}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#E1306C]/20 to-[#F56040]/20 border border-[#E1306C]/30 transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#E1306C]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1.2" />
          </svg>
        </a>

        {/* Dismiss */}
        <button
          type="button"
          onClick={handleDismiss}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#9F9AB5] transition hover:text-[#F7F4FF]"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/**
 * Static "Follow the creator" section for desktop dashboard and Profile page.
 */
function FollowCreatorSection({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-[11px] font-medium text-[#9F9AB5]">Follow the creator</span>
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3D3660] border border-white/10 text-[#D8D4E7] transition hover:border-[#E1306C]/40 hover:text-[#E1306C]"
        aria-label="Instagram"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1.2" />
        </svg>
      </a>
    </div>
  )
}

export { FollowCreatorBanner, FollowCreatorSection }
export default FollowCreatorBanner
