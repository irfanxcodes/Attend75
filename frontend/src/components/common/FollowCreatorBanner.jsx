import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'attend75.followCreator.dismissed'

const INSTAGRAM_URL = 'https://www.instagram.com/attend.75/'
const LINKEDIN_URL = 'https://www.linkedin.com/in/irfanxcodes/'

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
        {/* Heart icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6B9D] to-[#C084FC]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#1D183E]" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
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

        {/* LinkedIn */}
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A66C2]/20 to-[#0A66C2]/10 border border-[#0A66C2]/30 transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#0A66C2]" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
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
    <div className={`flex items-center gap-3 rounded-xl border border-white/10 bg-[#4A466A] px-4 py-3 ${className}`}>
      <span className="text-xs font-medium text-[#9F9AB5]">Follow the creator</span>
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3D3660] border border-white/10 text-[#D8D4E7] transition hover:border-[#E1306C]/40 hover:text-[#E1306C]"
        aria-label="Instagram"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1.2" />
        </svg>
      </a>
      <a
        href={LINKEDIN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3D3660] border border-white/10 text-[#D8D4E7] transition hover:border-[#0A66C2]/40 hover:text-[#0A66C2]"
        aria-label="LinkedIn"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>
    </div>
  )
}

export { FollowCreatorBanner, FollowCreatorSection }
export default FollowCreatorBanner
