import useAppStore from '../hooks/useAppStore'

function Profile() {
  const {
    state: { ui },
    actions,
  } = useAppStore()

  const isDark = ui.theme === 'dark'

  function handleThemeToggle() {
    actions.setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Profile</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage your preferences and learn how Attend75 works.</p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</p>
        <button
          type="button"
          onClick={handleThemeToggle}
          className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Switch to {isDark ? 'Light' : 'Dark'} Mode
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          onClick={actions.logout}
          className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
        >
          Logout
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">How to use Attend75</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
          Review your overall attendance, adjust your target percentage, and check each subject card to decide whether you should attend or can safely skip upcoming classes.
        </p>
      </div>
    </section>
  )
}

export default Profile
