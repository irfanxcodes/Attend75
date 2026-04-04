const targets = [60, 65, 75, 80]

function PredictionCard({ selectedTarget, currentAttendance, prediction, feasibility, onChangeTarget }) {
  const isTargetAchievable = feasibility?.isTargetAchievable ?? true
  const maxPossiblePercentage = feasibility?.maxPossiblePercentage
  const fallbackTarget = Math.max(50, Math.min(100, Math.round(currentAttendance || 75)))
  const sliderValue = Number.isFinite(selectedTarget) ? selectedTarget : fallbackTarget

  function handleSliderChange(event) {
    onChangeTarget(Number(event.target.value))
  }

  return (
    <section className="rounded-2xl border border-white/20 bg-[#312051] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#E7DEDE]">Prediction</h2>
        <p className="text-xs text-[#D1D1D1]">Target: {selectedTarget}%</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
        <div className={["rounded-xl p-3", isTargetAchievable ? "bg-[#22C55E]/15" : "bg-[#22C55E]/10"].join(' ')}>
          <p className="text-xs uppercase tracking-wide text-[#D1D1D1]">To Attend</p>
          <p className={["mt-1 text-xl font-bold sm:text-2xl", isTargetAchievable ? "text-[#22C55E]" : "text-[#86EFAC]"] .join(' ')}>
            {prediction.toAttend}
          </p>
        </div>

        <div className="rounded-xl bg-[#F59E0B]/15 p-3">
          <p className="text-xs uppercase tracking-wide text-[#D1D1D1]">Can Miss</p>
          <p className="mt-1 text-xl font-bold text-[#F59E0B] sm:text-2xl">{prediction.canMiss}</p>
        </div>
      </div>

      {!isTargetAchievable && maxPossiblePercentage !== null ? (
        <div className="mt-3 rounded-lg border border-[#F87171]/35 bg-[#7F1D1D]/20 px-3 py-2.5 text-sm text-[#FECACA]">
          You can attain a maximum of {maxPossiblePercentage.toFixed(2)}% if you attend all remaining classes.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5 sm:gap-2">
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onChangeTarget(target)}
            className={[
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm',
              sliderValue === target
                ? 'bg-[#E8A08C] text-[#312051]'
                : 'bg-white/10 text-[#D1D1D1] hover:bg-white/20',
            ].join(' ')}
          >
            {target}%
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/15 bg-[#3A315D] p-3">
        <div className="flex items-center justify-between text-xs text-[#D1D1D1]">
          <span>Custom target</span>
          <span className="font-semibold text-[#E7DEDE]">{sliderValue}%</span>
        </div>
        <input
          type="range"
          min={50}
          max={100}
          step={1}
          value={sliderValue}
          onChange={handleSliderChange}
          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-[#E8A08C]"
          aria-label="Select target percentage"
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-[#BDBDC7]">
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
    </section>
  )
}

export default PredictionCard
