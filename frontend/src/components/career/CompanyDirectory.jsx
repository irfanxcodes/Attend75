/**
 * CompanyDirectory — Filterable list of companies that hire for the student's profile.
 * Groups by sector. Filters update based on selected career track from PathExplorer.
 */

import { useState, useMemo } from 'react'
import { Building2, ExternalLink, Search } from 'lucide-react'

const TIER_CONFIG = {
  tier1: { label: 'Tier 1', color: '#4EF0A0', bg: 'bg-[#4EF0A0]/10 border-[#4EF0A0]/30' },
  tier2: { label: 'Tier 2', color: '#6CB4FF', bg: 'bg-[#6CB4FF]/10 border-[#6CB4FF]/30' },
  tier3: { label: 'Tier 3', color: '#9F9AB5', bg: 'bg-white/8 border-white/15' },
}

function CompanyCard({ company }) {
  const tier = TIER_CONFIG[company.tier] || TIER_CONFIG.tier3

  return (
    <div className="rounded-xl bg-[#302A52] p-3.5 ring-1 ring-white/8">
      {/* Name + tier */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4A466A]">
            <Building2 className="h-3.5 w-3.5 text-[#9F9AB5]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#F7F4FF] truncate">{company.name}</p>
            <p className="text-[10px] text-[#9F9AB5]">{company.sector}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${tier.bg}`} style={{ color: tier.color }}>
          {tier.label}
        </span>
      </div>

      {/* Roles */}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {company.roles.map((role) => (
          <span
            key={role}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-[#C8C4DD]"
          >
            {role}
          </span>
        ))}
      </div>

      {/* Package + process */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9F9AB5]">Package</p>
          <p className="mt-0.5 text-[11px] font-bold text-[#4EF0A0]">{company.package_range_inr}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9F9AB5]">Selection</p>
          <p className="mt-0.5 text-[11px] text-[#C8C4DD] leading-tight">{company.selection_process}</p>
        </div>
      </div>

      {/* Website link */}
      {company.website ? (
        <a
          href={company.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 flex items-center gap-1 text-[10px] font-semibold text-[#6CB4FF]"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={2} />
          View careers page
        </a>
      ) : null}
    </div>
  )
}

function CompanyDirectory({ companies = [], isLoading, selectedTrack }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.sector.toLowerCase().includes(q) ||
        c.roles.some((r) => r.toLowerCase().includes(q)),
    )
  }, [companies, search])

  // Group by sector
  const bySector = useMemo(() => {
    const map = {}
    filtered.forEach((c) => {
      if (!map[c.sector]) map[c.sector] = []
      map[c.sector].push(c)
    })
    return map
  }, [filtered])

  const sectorNames = Object.keys(bySector)

  if (isLoading) {
    return (
      <div className="rounded-xl bg-[#302A52] p-8 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C]/30 border-t-[#FF916C]" />
        <p className="mt-2 text-xs text-[#9F9AB5]">Loading companies…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#F7F4FF]">
            {selectedTrack ? 'Companies for Your Selected Track' : 'All Companies Hiring Your Profile'}
          </h2>
          <p className="mt-0.5 text-[11px] text-[#9F9AB5]">{companies.length} companies across {sectorNames.length} sectors</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9F9AB5]" strokeWidth={2} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company or role…"
          className="w-full rounded-xl border border-white/10 bg-[#302A52] py-2.5 pl-8 pr-3 text-sm text-[#F7F4FF] placeholder-[#9F9AB5] outline-none focus:border-[#FF916C]/50 focus:ring-1 focus:ring-[#FF916C]/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-[#302A52] p-6 text-center text-sm text-[#9F9AB5]">
          No companies match your search.
        </div>
      ) : (
        sectorNames.map((sector) => (
          <div key={sector}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9F9AB5]">{sector}</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {bySector[sector].map((company) => (
                <CompanyCard key={company.name} company={company} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default CompanyDirectory
