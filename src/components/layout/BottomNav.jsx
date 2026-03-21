import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'History', to: '/history' },
  { label: 'Profile', to: '/profile' },
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
                  'flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-[#312051] text-[#E8A08C]'
                    : 'text-[#D1D1D1] hover:bg-[#312051]/70 hover:text-[#E8A08C]',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default BottomNav
