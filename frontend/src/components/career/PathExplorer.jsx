/**
 * PathExplorer — Grid of all career tracks available for the student's degree.
 * Each card shows: title, salary, demand trend, timeline, top skills preview.
 * Clicking a card selects it as the active track filter.
 */

import { TrendingUp, Minus, TrendingDown, Clock, ChevronRight } from 'lucide-react'

const DEMAND_CONFIG = {
  rising: { icon: TrendingUp, color: '#4EF0A0', label: 'Rising demand' },
  stable: { icon: Minus, color: '#FFB23E', label: 'Stable demand' },
  saturated: { icon: TrendingDown, color: '#FF5B5B', label: 'Saturating' },
}

const TRACK_COLORS = {
  finance: '#6CB4FF',
  digital_marketing: '#FF916C',
  hr: '#C084FC',
  business_analyst: '#4EF0A0',
  sales_bdm: '#FFB23E',
  operations: '#F472B6',
  data_analyst: '#38BDF8',
  consulting: '#FB923C',
}

function TrackCard({ track, isSelected, onSelect }) {
  const demand = DEMAND_CONFIG[track.demand_trend] || DEMAND_CONFIG.stable
  const DemandIcon = demand.icon
  const accentColor = TRACK_COLORS[track.slug] || '#FF916C'

  return (
    <button
      type="button"
      onClick={() => onSelect(track.slug === isSelected ? null : track.slug)}
      className={[
        'w-full rounded-xl p-3.5 text-left transition-all duration-200 ring-1',
        isSelected
          ? 'bg-[#3D3660] ring-[#FF916C]/60 shadow-lg'
          : 'bg-[#302A52] ring-white/8 active:bg-[#3D3660]',
      ].join(' ')}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#F7F4FF]">{track.label}</p>
          <p className="mt-0.5 text-[10px] text-[#9F9AB5]">{track.entry_role}</p>
        </div>
        {/* Fit score badge */}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold"
          style={{ background: `${accentColor}20`, color: accentColor }}
        >
          {track.fit_score}%
        </span>
      </div>

      {/* Salary + demand */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-xs font-bold" style={{ color: accentColor }}>
          {track.salary_range_inr}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] font-medium" style={{ color: demand.color }}>
          <DemandIcon className="h-3 w-3" strokeWidth={2.5} />
          {demand.label}
        </span>
      </div>

      {/* Timeline */}
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[#9F9AB5]">
        <Clock className="h-3 w-3" strokeWidth={2} />
        Placement-ready in ~{track.timeline_months} months
      </div>

      {/* Skills preview */}
      {track.top_skills_preview?.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {track.top_skills_preview.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-medium text-[#C8C4DD]"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      {/* Selected indicator */}
      {isSelected ? (
        <div className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-[#FF916C]">
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          Showing companies for this track
        </div>
      ) : null}
    </button>
  )
}

function PathExplorer({ tracks = [], selectedTrack, onSelectTrack }) {
  if (!tracks.length) {
    return (
      <div className="rounded-xl bg-[#302A52] p-4 text-center text-sm text-[#9F9AB5]">
        No career tracks loaded yet. Generate your roadmap above.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#F7F4FF]">Career Paths for Your Degree</h2>
        <span className="text-[11px] text-[#9F9AB5]">{tracks.length} options</span>
      </div>

      {/* Select a track hint */}
      <p className="mb-3 text-[11px] text-[#9F9AB5]">
        Tap a card to filter companies. Fit % shows how well it matches your profile.
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {tracks.map((track) => (
          <TrackCard
            key={track.slug}
            track={track}
            isSelected={selectedTrack === track.slug}
            onSelect={onSelectTrack}
          />
        ))}
      </div>
    </div>
  )
}

export default PathExplorer
