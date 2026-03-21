const targets = [60, 65, 75, 80]

function PredictionCard({ selectedTarget, prediction, onChangeTarget }) {

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Prediction</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Target: {selectedTarget}%</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
          <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">To Attend</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{prediction.toAttend}</p>
        </div>

        <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
          <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Can Miss</p>
          <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{prediction.canMiss}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onChangeTarget(target)}
            className={[
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              selectedTarget === target
                ? 'bg-sky-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            {target}%
          </button>
        ))}
      </div>
    </section>
  )
}

export default PredictionCard
