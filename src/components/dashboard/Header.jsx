function Header({ userName }) {
  return (
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Attend75</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Hi, {userName}</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Here is your attendance snapshot for today.</p>
    </header>
  )
}

export default Header
