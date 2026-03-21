const targets = [60, 65, 75, 80]

function PredictionCard({ selectedTarget, prediction, onChangeTarget }) {

  return (
    <section className="rounded-2xl border border-white/20 bg-[#312051] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#E7DEDE]">Prediction</h2>
        <p className="text-xs text-[#D1D1D1]">Target: {selectedTarget}%</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#22C55E]/15 p-3">
          <p className="text-xs uppercase tracking-wide text-[#D1D1D1]">To Attend</p>
          <p className="mt-1 text-2xl font-bold text-[#22C55E]">{prediction.toAttend}</p>
        </div>

        <div className="rounded-xl bg-[#F59E0B]/15 p-3">
          <p className="text-xs uppercase tracking-wide text-[#D1D1D1]">Can Miss</p>
          <p className="mt-1 text-2xl font-bold text-[#F59E0B]">{prediction.canMiss}</p>
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
                ? 'bg-[#E8A08C] text-[#312051]'
                : 'bg-white/10 text-[#D1D1D1] hover:bg-white/20',
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
