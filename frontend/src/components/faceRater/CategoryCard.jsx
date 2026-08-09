/**
 * CategoryCard — user-friendly measurement display.
 * Shows a human-readable label, plain-English meaning, and a visual bar.
 * No jargon numbers — values are translated to friendly language where possible.
 */

export default function CategoryCard({ label, description, value, barValue, icon }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#302A52]/70 px-4 py-3.5 ring-1 ring-white/5">
      {icon && (
        <span className="text-xl shrink-0" aria-hidden="true">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-sm font-semibold text-[#F7F4FF]">{label}</dt>
          <dd className="shrink-0 text-sm font-bold text-[#F7F4FF] tabular-nums">{value}</dd>
        </div>
        {description && (
          <p className="mt-0.5 text-[11px] text-[#9F9AB5] leading-relaxed">{description}</p>
        )}
        {barValue !== null && barValue !== undefined && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#9F9AB5]/60 to-[#FF916C]/70 transition-all duration-700"
              style={{ width: `${Math.max(2, Math.min(100, barValue * 100))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
