import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

const STUDYME_BETA_NOTICE_KEY = 'attend75.studyme.betaNotice.v2'

const navItems = [
  { label: 'Home', to: '/app/dashboard', icon: '/dashboard-icon.png' },
  { label: 'History', to: '/app/history', icon: '/history-icon.svg' },
  { label: 'Study', to: '/app/study', icon: null, useInlineSvg: 'study' },
  { label: 'Notices', to: '/app/notices', icon: '/notices-icon.svg' },
  { label: 'Marks', to: '/app/marks', icon: '/marks.png' },
  { label: 'Me', to: '/app/profile', icon: '/profile-icon.svg' },
]

function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showStudyMeModal, setShowStudyMeModal] = useState(false)

  const isStudyRouteActive = useMemo(() => {
    return (
      location.pathname === '/study' ||
      location.pathname.startsWith('/study/') ||
      location.pathname === '/app/study' ||
      location.pathname.startsWith('/app/study/')
    )
  }, [location.pathname])

  const [hasSeenStudyMeNotice, setHasSeenStudyMeNotice] = useState(() => {
    try {
      return window.localStorage.getItem(STUDYME_BETA_NOTICE_KEY) === 'seen'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!showStudyMeModal) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showStudyMeModal])

  const markStudyMeNoticeSeen = () => {
    try {
      window.localStorage.setItem(STUDYME_BETA_NOTICE_KEY, 'seen')
    } catch {
      // Ignore storage failures and keep navigation usable.
    }
    setHasSeenStudyMeNotice(true)
  }

  const closeStudyMeModal = () => {
    setShowStudyMeModal(false)
    markStudyMeNoticeSeen()
  }

  const continueToStudyMe = () => {
    closeStudyMeModal()
    navigate(location.pathname.startsWith('/app') ? '/app/study' : '/study')
  }

  const handleStudyMeClick = () => {
    if (hasSeenStudyMeNotice) {
      navigate(location.pathname.startsWith('/app') ? '/app/study' : '/study')
      return
    }

    setShowStudyMeModal(true)
  }

  return (
    <>
      {/* Floating nav bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[calc(8px+env(safe-area-inset-bottom))] pt-1 md:hidden">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#2D2845]/95 px-2 py-1.5 shadow-[0_-4px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <ul className="grid grid-cols-6">
            {navItems.map((item) => (
              <li key={item.to} data-walkthrough={item.to.endsWith('/history') ? 'nav-history' : item.to.endsWith('/study') ? 'nav-study' : item.to.endsWith('/notices') ? 'nav-notices' : item.to.endsWith('/marks') ? 'nav-marks' : undefined}>
                {item.to.endsWith('/study') ? (
                  <button
                    type="button"
                    onClick={handleStudyMeClick}
                    className={[
                      'flex w-full flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold leading-none transition-colors',
                      isStudyRouteActive
                        ? 'text-[#FF916C]'
                        : 'text-[#9F9AB5] active:text-[#FF916C]',
                    ].join(' ')}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${isStudyRouteActive ? 'bg-[#FF916C]/20' : ''}`}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    </span>
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold leading-none transition-colors',
                        isActive
                          ? 'text-[#FF916C]'
                          : 'text-[#9F9AB5] active:text-[#FF916C]',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-[#FF916C]/20' : ''}`}>
                          <img
                            src={item.icon}
                            alt=""
                            aria-hidden="true"
                            className={[
                              'h-5 w-5 rounded-sm object-cover transition-all',
                              isActive ? 'brightness-125 saturate-150' : 'opacity-60',
                            ].join(' ')}
                          />
                        </span>
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {showStudyMeModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:py-6"
          role="presentation"
          onClick={closeStudyMeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="studyme-beta-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#4A466A] p-4 shadow-2xl ring-1 ring-white/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#9F9AB5]">StudyMe</p>
                <h2 id="studyme-beta-title" className="mt-0.5 text-base font-semibold text-[#F7F4FF]">
                  StudyMe (Beta)
                </h2>
              </div>
              <button
                type="button"
                onClick={closeStudyMeModal}
                className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-[#F7F4FF] hover:bg-white/10"
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-[#D8D4E7]">
              For the best experience, we recommend using StudyMe on a <span className="font-semibold text-[#F7F4FF]">laptop or larger screen</span>.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#D8D4E7]">
              Use it as a <span className="font-semibold text-[#F7F4FF]">guide to understand topics and prepare efficiently</span>, not as the only source of study.
            </p>

            <div className="mt-3">
              <button
                type="button"
                onClick={continueToStudyMe}
                className="inline-flex items-center justify-center rounded-full bg-[#FF916C] px-4 py-1.5 text-xs font-semibold text-[#201C31] transition hover:bg-[#FFAA8D]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default BottomNav
