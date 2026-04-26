import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

const STUDYME_BETA_NOTICE_KEY = 'attend75.studyme.betaNotice.v2'

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: '/dashboard-icon.png' },
  { label: 'History', to: '/history', icon: '/history-icon.svg' },
  { label: 'StudyMe', to: '/study', icon: '/studyme-icon.svg' },
  { label: 'Marks', to: '/marks', icon: '/marks.png' },
  { label: 'Profile', to: '/profile', icon: '/profile-icon.svg' },
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

  const hasSeenStudyMeNotice = useMemo(() => {
    try {
      return window.localStorage.getItem(STUDYME_BETA_NOTICE_KEY) === 'seen'
    } catch {
      return false
    }
  }, [])

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
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/20 bg-[#3E3760] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <ul className="mx-auto grid w-full max-w-md grid-cols-5 gap-2">
        {navItems.map((item) => (
          <li key={item.to}>
            {item.to === '/study' ? (
              <button
                type="button"
                onClick={handleStudyMeClick}
                className={[
                  'flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-semibold leading-none transition-colors sm:h-[68px] sm:text-xs',
                  isStudyRouteActive
                    ? 'bg-[#271D43] text-[#F2CA98] ring-1 ring-[#E8A08C]/45'
                    : 'text-[#D1D1D1] hover:bg-[#312051]/70 hover:text-[#E8A08C]',
                ].join(' ')}
              >
                <img
                  src={item.icon}
                  alt=""
                  aria-hidden="true"
                  className={[
                    'h-5 w-5 rounded-sm object-cover transition-all sm:h-6 sm:w-6',
                    isStudyRouteActive ? 'brightness-125 saturate-150 drop-shadow-[0_0_8px_rgba(232,160,140,0.5)]' : 'opacity-90',
                  ].join(' ')}
                />
                <span>{item.label}</span>
              </button>
            ) : (
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex h-16 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-semibold leading-none transition-colors sm:h-[68px] sm:text-xs',
                    isActive
                      ? 'bg-[#271D43] text-[#F2CA98] ring-1 ring-[#E8A08C]/45'
                      : 'text-[#D1D1D1] hover:bg-[#312051]/70 hover:text-[#E8A08C]',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <img
                      src={item.icon}
                      alt=""
                      aria-hidden="true"
                      className={[
                        'h-5 w-5 rounded-sm object-cover transition-all sm:h-6 sm:w-6',
                        isActive ? 'brightness-125 saturate-150 drop-shadow-[0_0_8px_rgba(232,160,140,0.5)]' : 'opacity-90',
                      ].join(' ')}
                    />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            )}
          </li>
        ))}
        </ul>
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
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#4F487A] p-4 shadow-2xl ring-1 ring-white/10 sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">StudyMe</p>
                <h2 id="studyme-beta-title" className="mt-1 text-lg font-semibold text-[#F4F1FF]">
                  StudyMe (Beta)
                </h2>
              </div>
              <button
                type="button"
                onClick={closeStudyMeModal}
                className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#E7DEDE] hover:bg-white/10"
                aria-label="Close StudyMe beta notice"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#D8D3E8]">
              For the best experience, we recommend using StudyMe on a <span className="font-semibold text-[#F4F1FF]">laptop or larger screen</span>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#D8D3E8]">
              This content is designed to help you revise quickly and focus on important concepts. It is based on <span className="font-semibold text-[#F4F1FF]">course PPTs and available study materials</span>, but may not cover every possible exam question.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#D8D3E8]">
              Use it as a <span className="font-semibold text-[#F4F1FF]">guide to understand topics and prepare efficiently</span>, not as the only source of study.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={continueToStudyMe}
                className="inline-flex items-center justify-center rounded-full bg-[#E2BC8B] px-4 py-2 text-sm font-semibold text-[#1D183E] transition hover:bg-[#D9AA6F]"
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
