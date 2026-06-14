import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

const STUDYME_BETA_NOTICE_KEY = 'attend75.studyme.betaNotice.v2'

const navItems = [
  { label: 'Dashboard', to: '/app/dashboard', icon: '/dashboard-icon.png' },
  { label: 'History', to: '/app/history', icon: '/history-icon.svg' },
  { label: 'StudyMe', to: '/app/study', icon: '/studyme-icon.svg' },
  { label: 'Marks', to: '/app/marks', icon: '/marks.png' },
  { label: 'Profile', to: '/app/profile', icon: '/profile-icon.svg' },
]

function Sidebar({ isCollapsed, onToggleCollapse }) {
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

  const widthClass = isCollapsed ? 'md:w-16 lg:w-56' : 'md:w-56 lg:w-56'
  const labelClass = isCollapsed ? 'md:hidden lg:inline' : 'inline'
  const itemPadding = isCollapsed
    ? 'md:justify-center md:px-2 lg:justify-start lg:px-4'
    : 'md:justify-start md:px-4'

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-white/5 bg-[#4B496B] md:flex md:flex-col ${widthClass}`}
        aria-label="Primary"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <button
            type="button"
            className={`flex items-center gap-2.5 text-base font-extrabold text-[#F7F4FF] transition hover:text-[#FF916C] ${itemPadding}`}
            onClick={() => navigate('/app/dashboard')}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[#FF916C]">
              <CheckCircle2 className="h-6 w-6" strokeWidth={2.4} />
            </span>
            <span className={labelClass}>Attend<span className="text-[#FF916C]">75</span></span>
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`hidden rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold text-[#D8D4E7] transition hover:bg-white/10 md:flex lg:hidden ${isCollapsed ? 'rotate-180' : ''}`}
            aria-label="Toggle sidebar"
          >
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center">❮</span>
          </button>
        </div>

        <nav className="flex-1 px-3 pb-3 pt-3">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to} data-walkthrough={item.to.endsWith('/history') ? 'sidebar-history' : item.to.endsWith('/study') ? 'sidebar-study' : item.to.endsWith('/marks') ? 'sidebar-marks' : undefined}>
                {item.to.endsWith('/study') ? (
                  <button
                    type="button"
                    onClick={handleStudyMeClick}
                    className={`flex w-full items-center gap-3 rounded-lg border border-transparent py-2 text-sm font-semibold transition ${itemPadding} ${
                      isStudyRouteActive
                        ? 'bg-[#746177] text-[#FF916C]'
                        : 'text-[#C8C4D8] hover:bg-white/5 hover:text-[#FF916C]'
                    }`}
                  >
                    <img
                      src={item.icon}
                      alt=""
                      aria-hidden="true"
                      className={`h-4.5 w-4.5 shrink-0 rounded-sm object-cover ${
                        isStudyRouteActive ? 'brightness-125 saturate-150 drop-shadow-[0_0_8px_rgba(255,145,108,0.45)]' : 'opacity-70'
                      }`}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span className={labelClass}>{item.label}</span>
                  </button>
                ) : (
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex w-full items-center gap-3 rounded-lg border border-transparent py-2 text-sm font-semibold transition ${itemPadding} ${
                        isActive
                          ? 'bg-[#746177] text-[#FF916C]'
                          : 'text-[#C8C4D8] hover:bg-white/5 hover:text-[#FF916C]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <img
                          src={item.icon}
                          alt=""
                          aria-hidden="true"
                          className={`shrink-0 rounded-sm object-cover ${
                            isActive ? 'brightness-125 saturate-150 drop-shadow-[0_0_8px_rgba(255,145,108,0.45)]' : 'opacity-70'
                          }`}
                          style={{ width: '18px', height: '18px' }}
                        />
                        <span className={labelClass}>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className={`border-t border-white/10 px-4 py-3 text-[11px] font-medium text-[#9F9AB5] ${labelClass}`}>
          Synced Today, 8:42 AM
        </div>
      </aside>

      {showStudyMeModal ? (
        <div
          className="fixed inset-0 z-[60] hidden items-end justify-center bg-black/55 px-4 pb-4 pt-10 backdrop-blur-sm md:flex md:items-center md:py-6"
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
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#C8C4D8]">StudyMe</p>
                <h2 id="studyme-beta-title" className="mt-0.5 text-base font-semibold text-[#F7F4FF]">
                  StudyMe (Beta)
                </h2>
              </div>
              <button
                type="button"
                onClick={closeStudyMeModal}
                className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-[#F7F4FF] hover:bg-white/10"
                aria-label="Close StudyMe beta notice"
              >
                Close
              </button>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-[#D8D3E8]">
              For the best experience, we recommend using StudyMe on a <span className="font-semibold text-[#F7F4FF]">laptop or larger screen</span>.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#D8D3E8]">
              This content is designed to help you revise quickly and focus on important concepts. It is based on <span className="font-semibold text-[#F7F4FF]">course PPTs and available study materials</span>, but may not cover every possible exam question.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#D8D3E8]">
              Use it as a <span className="font-semibold text-[#F7F4FF]">guide to understand topics and prepare efficiently</span>, not as the only source of study.
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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

export default Sidebar
