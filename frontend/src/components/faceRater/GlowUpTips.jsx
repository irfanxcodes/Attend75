const ICONS = { Skincare: '🧴', Grooming: '✂️', Posture: '📐', Lighting: '💡', Hair: '💇' }

const PRIORITY = {
  high:   { label: 'Do this first', color: 'text-orange-300', dot: 'bg-orange-400' },
  medium: { label: 'Worth trying',  color: 'text-purple-300', dot: 'bg-purple-400' },
  low:    { label: 'Nice to have',  color: 'text-[#9F9AB5]',  dot: 'bg-[#9F9AB5]' },
}

export default function GlowUpTips({ tips }) {
  return (
    <section aria-labelledby="tips-heading" className="space-y-3">
      <h3 id="tips-heading" className="text-sm font-bold uppercase tracking-widest text-[#9F9AB5]">
        Glow-Up Tips
      </h3>

      {tips.length === 0 ? (
        <div className="rounded-2xl bg-[#302A52]/70 px-4 py-5 text-center ring-1 ring-white/5">
          <span className="text-2xl">✅</span>
          <p className="mt-2 text-sm font-semibold text-[#F7F4FF]">Looking solid</p>
          <p className="mt-0.5 text-xs text-[#9F9AB5]">Keep up your current routine</p>
        </div>
      ) : (
        <ul className="space-y-2.5" role="list">
          {tips.map((tip, i) => {
            const p = PRIORITY[tip.priority] ?? PRIORITY.low
            return (
              <li key={i} className="rounded-2xl bg-[#302A52]/70 px-4 py-3.5 ring-1 ring-white/5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg" aria-hidden="true">
                    {ICONS[tip.category] ?? '💡'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#F7F4FF]">{tip.category}</span>
                      <span className={`flex items-center gap-1 text-[10px] font-semibold ${p.color}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${p.dot}`} aria-hidden="true" />
                        {p.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-[#D8D4E7]">{tip.tip}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
