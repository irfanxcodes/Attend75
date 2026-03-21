import AttendanceTrendChart from '../components/history/AttendanceTrendChart'
import HeatmapGrid from '../components/history/HeatmapGrid'
import useAppStore from '../hooks/useAppStore'

function History() {
  const {
    state: {
      attendance: { history },
    },
  } = useAppStore()

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">History</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Your trends and analytics will appear here.</p>
      </header>

      {history.length ? (
        <>
          <HeatmapGrid history={history} />
          <AttendanceTrendChart history={history} />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-950">
          <p className="text-sm text-slate-500 dark:text-slate-400">No history data available yet.</p>
        </div>
      )}
    </section>
  )
}

export default History
