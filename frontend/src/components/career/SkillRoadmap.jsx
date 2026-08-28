/**
 * SkillRoadmap — Shows the top 3 personalised career tracks with:
 *   - Skill gaps (start now vs before graduation)
 *   - Best certification to start with
 *   - This week's action
 *   - Quick wins (global, shown once)
 */

import { useState } from 'react'
import { CheckCircle2, Circle, BookOpen, Zap, Target, ChevronDown } from 'lucide-react'

const LEVEL_CONFIG = {
  start_now: { label: 'Start Now', color: '#4EF0A0', bg: 'bg-[#4EF0A0]/10 border-[#4EF0A0]/30' },
  before_graduation: { label: 'Before Graduation', color: '#FFB23E', bg: 'bg-[#FFB23E]/10 border-[#FFB23E]/30' },
  optional: { label: 'Optional', color: '#9F9AB5', bg: 'bg-white/5 border-white/10' },
}

const DEMAND_COLORS = { rising: '#4EF0A0', stable: '#FFB23E', saturated: '#FF5B5B' }

function TrackRoadmap({ track, isOpen, onToggle }) {
  const demandColor = DEMAND_COLORS[track.demand_trend] || '#FFB23E'

  return (
    <div className="overflow-hidden rounded-xl bg-[#302A52] ring-1 ring-white/8">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        {/* Rank badge */}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/15 text-xs font-extrabold text-[#FF916C]">
          #{track._rank}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#F7F4FF]">{track.label}</p>
          <p className="mt-0.5 text-[10px] text-[#9F9AB5]">
            {track.entry_role} · {track.salary_range_inr}
          </p>
        </div>

        {/* Fit score */}
        <span className="text-sm font-extrabold" style={{ color: demandColor }}>
          {track.fit_score}%
        </span>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9F9AB5] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {/* Expandable detail */}
      {isOpen ? (
        <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-4">

          {/* Realism note */}
          {track.realism_note ? (
            <div className="rounded-lg border border-[#6CB4FF]/20 bg-[#6CB4FF]/8 px-3 py-2">
              <p className="text-[11px] leading-relaxed text-[#C8C4DD]">💡 {track.realism_note}</p>
            </div>
          ) : null}

          {/* Relevant subjects */}
          {track.relevant_subjects?.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9F9AB5]">
                Your Relevant Subjects
              </p>
              <div className="flex flex-wrap gap-1.5">
                {track.relevant_subjects.map((subj) => (
                  <span
                    key={subj}
                    className="rounded-full border border-[#4EF0A0]/25 bg-[#4EF0A0]/8 px-2 py-0.5 text-[10px] font-semibold text-[#4EF0A0]"
                  >
                    {subj}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Skills */}
          {track.skills?.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9F9AB5]">
                Skills to Build
              </p>
              <div className="space-y-1.5">
                {track.skills.map((skill) => {
                  const lvl = LEVEL_CONFIG[skill.level] || LEVEL_CONFIG.optional
                  return (
                    <div key={skill.name} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${lvl.bg}`}>
                      <Circle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: lvl.color }} strokeWidth={2.5} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#F7F4FF]">{skill.name}</p>
                        <p className="text-[10px] text-[#9F9AB5]">{skill.why}</p>
                      </div>
                      <span
                        className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide"
                        style={{ background: `${lvl.color}20`, color: lvl.color }}
                      >
                        {lvl.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Best cert */}
          {track.certifications?.[0] ? (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9F9AB5]">
                Best Cert to Start With
              </p>
              <div className="rounded-lg border border-[#6CB4FF]/25 bg-[#6CB4FF]/8 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#6CB4FF]" strokeWidth={1.8} />
                  <div>
                    <p className="text-[11px] font-bold text-[#F7F4FF]">{track.certifications[0].name}</p>
                    <p className="text-[10px] text-[#9F9AB5]">
                      {track.certifications[0].provider} ·{' '}
                      {track.certifications[0].free ? (
                        <span className="text-[#4EF0A0]">Free</span>
                      ) : (
                        <span className="text-[#FFB23E]">Paid</span>
                      )}{' '}
                      · ~{track.certifications[0].timeline_weeks}w
                    </p>
                    {track.certifications[0].url ? (
                      <a
                        href={track.certifications[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-[10px] font-semibold text-[#6CB4FF] underline"
                      >
                        Open course →
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* This week action */}
          {track.this_week_action ? (
            <div className="rounded-lg border border-[#FF916C]/25 bg-[#FF916C]/8 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[#FF916C]" strokeWidth={2} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF916C]">Do this week</p>
                  <p className="mt-0.5 text-[11px] text-[#F7F4FF]">{track.this_week_action}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SkillRoadmap({ roadmap }) {
  const [openTrack, setOpenTrack] = useState(0)  // index of open track (0 = first open by default)

  if (!roadmap) return null

  const { top_tracks = [], quick_wins = [] } = roadmap

  return (
    <div className="space-y-4">
      {/* Quick wins */}
      {quick_wins.length > 0 ? (
        <div className="rounded-xl bg-[#302A52] p-4 ring-1 ring-white/8">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-[#4EF0A0]" strokeWidth={2} />
            <p className="text-sm font-bold text-[#F7F4FF]">Quick Wins — Do This Week</p>
          </div>
          <div className="space-y-2">
            {quick_wins.map((win, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4EF0A0]" strokeWidth={2} />
                <p className="text-[12px] text-[#D8D4E7]">{win}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Top 3 tracks */}
      <div>
        <h2 className="mb-2.5 text-sm font-bold text-[#F7F4FF]">Your Top 3 Career Paths</h2>
        <p className="mb-3 text-[11px] text-[#9F9AB5]">
          AI-personalised based on your degree and subjects. Tap each to see your skill roadmap.
        </p>
        <div className="space-y-2.5">
          {top_tracks.map((track, i) => (
            <TrackRoadmap
              key={track.slug}
              track={{ ...track, _rank: i + 1 }}
              isOpen={openTrack === i}
              onToggle={() => setOpenTrack(openTrack === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default SkillRoadmap
