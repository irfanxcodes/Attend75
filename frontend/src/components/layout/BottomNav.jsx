import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: '/dashboard-icon.png' },
  { label: 'History', to: '/history', icon: '/history-icon.svg' },
  { label: 'Marks', to: '/marks', icon: '/marks.png' },
  { label: 'Profile', to: '/profile', icon: '/profile-icon.svg' },
]

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/20 bg-[#3E3760] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <ul className="mx-auto grid w-full max-w-md grid-cols-4 gap-2">
        {navItems.map((item) => (
          <li key={item.to}>
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
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default BottomNav
