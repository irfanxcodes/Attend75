import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', to: '/app/dashboard' },
  { label: 'History', to: '/app/history' },
  { label: 'Profile', to: '/app/profile' },
]

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_20px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-none">
      <ul className="mx-auto grid w-full max-w-md grid-cols-3 gap-2">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
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
