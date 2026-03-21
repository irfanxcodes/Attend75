function RefreshButton({ isLoading, onRefresh }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isLoading}
      className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    >
      {isLoading ? 'Refreshing...' : 'Refresh Attendance'}
    </button>
  )
}

export default RefreshButton
