/**
 * CareerHero — Landing section of the Career Compass page.
 * Shows degree/semester context and the "Generate Roadmap" CTA.
 */

import { Briefcase, Sparkles } from 'lucide-react'

function CareerHero({ program, semester, onGenerate, isLoading }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#3D3660] to-[#302A52] p-5 ring-1 ring-white/10">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF916C]/15 ring-1 ring-[#FF916C]/30">
          <Briefcase className="h-5 w-5 text-[#FF916C]" strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-lg font-extrabold text-[#F7F4FF]">Career Compass</h1>
          <p className="mt-0.5 text-[11px] text-[#9F9AB5]">
            Personalised career guidance based on your degree
          </p>
        </div>
      </div>

      {/* Profile pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {program ? (
          <span className="rounded-full border border-[#6CB4FF]/30 bg-[#6CB4FF]/10 px-2.5 py-1 text-[11px] font-semibold text-[#6CB4FF]">
            {program}
          </span>
        ) : null}
        {semester ? (
          <span className="rounded-full border border-[#4EF0A0]/30 bg-[#4EF0A0]/10 px-2.5 py-1 text-[11px] font-semibold text-[#4EF0A0]">
            {semester}
          </span>
        ) : null}
      </div>

      {/* Tagline */}
      <p className="mt-3 text-sm leading-relaxed text-[#C8C4DD]">
        Find what career paths suit your degree, which skills to learn, which companies hire for your profile, and what to put on your resume.
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isLoading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF916C] py-3 text-sm font-bold text-[#1D183E] transition active:scale-[0.98] disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1D183E]/30 border-t-[#1D183E]" />
            Generating your roadmap…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" strokeWidth={2} />
            Generate My Career Roadmap
          </>
        )}
      </button>

      {isLoading ? (
        <p className="mt-2 text-center text-[10px] text-[#9F9AB5]">
          AI is personalising your plan — usually takes 5–10 seconds
        </p>
      ) : null}
    </div>
  )
}

export default CareerHero
