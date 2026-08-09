const TIERS = {
  'Gigachad':         { grad: 'from-yellow-400 to-amber-500',  glow: 'shadow-yellow-500/40',  text: 'text-yellow-300',  emoji: '👑', vibe: 'Absolute peak' },
  'Halo Tier':        { grad: 'from-yellow-300 to-yellow-500', glow: 'shadow-yellow-400/35',  text: 'text-yellow-300',  emoji: '✨', vibe: 'Elite looks' },
  'Looksmaxxed':      { grad: 'from-emerald-400 to-green-500', glow: 'shadow-emerald-500/35', text: 'text-emerald-300', emoji: '🔥', vibe: 'Locked in' },
  'Above Average':    { grad: 'from-green-400 to-teal-500',    glow: 'shadow-green-500/30',   text: 'text-green-300',   emoji: '💪', vibe: 'Looking good' },
  'High Tier Normie': { grad: 'from-violet-400 to-purple-500', glow: 'shadow-violet-500/30',  text: 'text-violet-300',  emoji: '⚡', vibe: 'Solid foundation' },
  'Normie':           { grad: 'from-purple-400 to-indigo-500', glow: 'shadow-purple-500/25',  text: 'text-purple-300',  emoji: '🌀', vibe: 'Average enjoyer' },
  'Lookspilled':      { grad: 'from-orange-400 to-red-500',    glow: 'shadow-orange-500/30',  text: 'text-orange-300',  emoji: '📈', vibe: 'Room to grow' },
  'Needs the Grind':  { grad: 'from-red-500 to-rose-600',      glow: 'shadow-red-500/30',     text: 'text-red-300',     emoji: '🛠️', vibe: 'The grind starts now' },
}
const DEFAULT = { grad: 'from-slate-400 to-slate-600', glow: 'shadow-slate-500/20', text: 'text-slate-300', emoji: '⭐', vibe: 'Unknown' }

export default function TierBadge({ tier, score }) {
  const t = TIERS[tier] ?? DEFAULT
  const pct = (score / 10) * 100

  return (
    <div
      className={`w-full rounded-3xl bg-gradient-to-br ${t.grad} p-px shadow-2xl ${t.glow}`}
      aria-label={`Glow-Up Score: ${score} out of 10. Tier: ${tier}`}
      role="status"
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#1C1830]/80 px-6 py-6 backdrop-blur-sm">
        {/* Emoji */}
        <span className="text-4xl" aria-hidden="true">{t.emoji}</span>

        {/* Score */}
        <div className="flex items-baseline gap-1">
          <span className={`text-6xl font-black tabular-nums ${t.text}`}>
            {score.toFixed(1)}
          </span>
          <span className="text-lg font-semibold text-[#9F9AB5]">/ 10</span>
        </div>

        {/* Progress bar */}
        <div className="w-full overflow-hidden rounded-full bg-white/10" style={{ height: 6 }}>
          <div
            className={`h-full rounded-full bg-gradient-to-r ${t.grad} transition-all duration-1000`}
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Tier name + vibe */}
        <div className="text-center">
          <p className={`text-xl font-extrabold tracking-wide ${t.text}`}>{tier}</p>
          <p className="mt-0.5 text-xs text-[#9F9AB5]">{t.vibe}</p>
        </div>
      </div>
    </div>
  )
}
