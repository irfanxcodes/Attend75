const targets = [60, 65, 70, 75, 80, 85, 90]

function calculateMaxPossiblePercentage(totalAttended, totalClasses, totalClassesLeft) {
  const attended = Number(totalAttended) || 0
  const conducted = Number(totalClasses) || 0
  const left = Number(totalClassesLeft) || 0
  const finalConducted = conducted + left

  if (finalConducted <= 0) {
    return 100
  }

  return ((attended + left) / finalConducted) * 100
}

function PredictionCard({ selectedTarget, prediction, totals, onChangeTarget }) {
  const maxPossiblePercentage = calculateMaxPossiblePercentage(
    totals.totalAttended,
    totals.totalClasses,
    totals.totalClassesLeft,
  )
  const isTargetAchievable = selectedTarget <= maxPossiblePercentage
  const fallbackTarget = Math.max(50, Math.min(100, Math.round(selectedTarget || 75)))
  const sliderValue = Number.isFinite(selectedTarget) ? selectedTarget : fallbackTarget

  function handleSliderChange(event) {
    onChangeTarget(Number(event.target.value))
  }

  return (
    <section className="rounded-2xl bg-[#4A466A] p-3 shadow-[0_8px_20px_rgba(40,36,62,0.18)] ring-1 ring-black/5 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-[#F7F4FF]">Prediction</h2>
          <p className="text-[10px] font-medium text-[#9F9AB5]">Pick your target %</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold text-[#C8C4D8]">Target {selectedTarget}%</p>
          <p className="text-[10px] font-semibold text-[#9F9AB5]">Max {maxPossiblePercentage.toFixed(1)}%</p>
        </div>
      </div>

      {!isTargetAchievable ? (
        <div className="mt-2 rounded-lg border border-[#FF5B5B]/35 bg-[#FF5B5B]/15 px-2.5 py-1.5 text-[10px] font-medium text-[#FFD4D4]">
          Max attainable: {maxPossiblePercentage.toFixed(1)}% if you attend all remaining classes.
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {targets.map((target) => {
          const isImpossible = target > maxPossiblePercentage
          return (
            <button
              key={target}
              type="button"
              onClick={() => {
                if (!isImpossible) {
                  onChangeTarget(target)
                }
              }}
              disabled={isImpossible}
              aria-disabled={isImpossible}
              title={isImpossible ? `Maximum possible is ${maxPossiblePercentage.toFixed(1)}%` : undefined}
              className={[
                'rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-colors',
                sliderValue === target && !isImpossible
                  ? 'bg-[#FF916C] text-[#201C31]'
                  : isImpossible
                    ? 'cursor-not-allowed bg-transparent text-[#8F8AA5] line-through opacity-65 ring-1 ring-white/10'
                    : 'bg-transparent text-[#D8D4E7] ring-1 ring-white/15 hover:bg-white/10',
              ].join(' ')}
            >
              {target}%
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-[#C8C4D8]">
          <span>Custom</span>
          <span className="text-sm text-[#F7F4FF]">{sliderValue}%</span>
        </div>
        <input
          type="range"
          min={50}
          max={100}
          step={1}
          value={sliderValue}
          onChange={handleSliderChange}
          className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-lg bg-[#302A52] accent-[#FF916C]"
          aria-label="Select target percentage"
        />
        <div className="mt-1 flex justify-between text-[10px] font-medium text-[#9F9AB5]">
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[#565275] px-2.5 py-2">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#BDB8CC]">To Attend</p>
          <p className={["mt-1 text-xl font-extrabold leading-none", isTargetAchievable ? "text-[#FFB23E]" : "text-[#FF5B5B]"].join(' ')}>
            {prediction.toAttend}
          </p>
        </div>
        <div className="rounded-lg bg-[#565275] px-2.5 py-2">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#BDB8CC]">Can Miss</p>
          <p className="mt-1 text-xl font-extrabold leading-none text-[#4EF0A0]">{prediction.canMiss}</p>
        </div>
      </div>
    </section>
  )
}

export default PredictionCard
