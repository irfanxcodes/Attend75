const NAV_SECTIONS = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
      { id: 'system-health', label: 'System Health', icon: 'activity' },
    ],
  },
  {
    label: 'USERS',
    items: [
      { id: 'users-analytics', label: 'Users & Analytics', icon: 'users' },
      { id: 'growth', label: 'Growth (DAU/WAU/MAU)', icon: 'trending-up' },
      { id: 'retention', label: 'Retention & Cohorts', icon: 'repeat' },
    ],
  },
  {
    label: 'PRODUCT',
    items: [
      { id: 'studyme-analytics', label: 'StudyMe Analytics', icon: 'book' },
      { id: 'engagement', label: 'Engagement', icon: 'zap' },
      { id: 'app-ratings', label: 'App Ratings', icon: 'star' },
      { id: 'feedback', label: 'Feedback', icon: 'message-square', badge: null },
    ],
  },
  {
    label: 'ROADMAP',
    items: [
      { id: 'subject-requests', label: 'Subject Requests', icon: 'git-pull-request' },
      { id: 'college-interest', label: 'College Interest', icon: 'building' },
    ],
  },
]

function NavIcon({ name, className = 'h-4 w-4' }) {
  const icons = {
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    'trending-up': <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>,
    repeat: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>,
    'message-square': <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
    'git-pull-request': <><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></>,
    building: <><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="9" y1="6" x2="9" y2="6.01" /><line x1="15" y1="6" x2="15" y2="6.01" /><line x1="9" y1="10" x2="9" y2="10.01" /><line x1="15" y1="10" x2="15" y2="10.01" /><line x1="9" y1="14" x2="9" y2="14.01" /><line x1="15" y1="14" x2="15" y2="14.01" /><line x1="9" y1="18" x2="15" y2="18" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || null}
    </svg>
  )
}

function AdminSidebar({ activeSection, onNavigate, feedbackCount = 0, onLogout }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-white/5 bg-[#1a1625]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF916C]/15 text-sm font-bold text-[#FF916C]">A</div>
        <div>
          <p className="text-sm font-bold text-[#F4F1FF]">Attend75</p>
          <p className="text-[9px] uppercase tracking-wider text-[#6E6A88]">Admin Console</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mt-5 first:mt-0">
            <p className="mb-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.15em] text-[#6E6A88]">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = activeSection === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition ${
                        isActive
                          ? 'bg-[#FF916C]/10 text-[#FF916C]'
                          : 'text-[#9F9AB5] hover:bg-white/5 hover:text-[#D8D4E7]'
                      }`}
                    >
                      <NavIcon name={item.icon} className={`h-4 w-4 ${isActive ? 'text-[#FF916C]' : ''}`} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.id === 'feedback' && feedbackCount > 0 ? (
                        <span className="rounded-full bg-[#FF916C]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#FF916C]">{feedbackCount}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/5 px-4 py-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-medium text-[#9F9AB5] transition hover:bg-white/5 hover:text-[#FF5B5B]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  )
}

export default AdminSidebar
