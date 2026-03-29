import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: '/dashboard-icon.png' },
  { label: 'History', to: '/history', icon: '/history-icon.svg' },
  { label: 'Profile', to: '/profile', icon: '/profile-icon.svg' },
]

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/20 bg-[#3E3760] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <ul className="mx-auto grid w-full max-w-md grid-cols-3 gap-2">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex h-16 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-semibold leading-none transition-colors sm:h-[68px] sm:text-xs',
                  isActive
                    ? 'bg-[#312051] text-[#E8A08C]'
                    : 'text-[#D1D1D1] hover:bg-[#312051]/70 hover:text-[#E8A08C]',
                ].join(' ')
              }
            >
              <img
                src={item.icon}
                alt=""
                aria-hidden="true"
                className="h-5 w-5 rounded-sm object-cover sm:h-6 sm:w-6"
              />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default BottomNav
