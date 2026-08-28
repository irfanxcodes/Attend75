/**
 * CareerCompass — Main page for the Career Compass feature.
 *
 * Tab layout:
 *   Explore   — all career tracks for the student's degree (instant, from KB)
 *   Roadmap   — personalised skill plan (LLM-powered, on demand)
 *   Companies — company directory filtered by selected track
 *
 * Student profile (degree, semester, subjects) is read from global app state —
 * no extra API call needed.
 */

import { useState, useEffect, useCallback } from 'react'
import { Map, Target, Building2 } from 'lucide-react'
import useAppStore from '../hooks/useAppStore'
import CareerHero from '../components/career/CareerHero'
import PathExplorer from '../components/career/PathExplorer'
import SkillRoadmap from '../components/career/SkillRoadmap'
import CompanyDirectory from '../components/career/CompanyDirectory'
import { fetchCareerRoadmap, fetchCareerTracks, fetchCompanies } from '../services/careerApi'

const TABS = [
  { id: 'explore', label: 'Explore', icon: Map },
  { id: 'roadmap', label: 'Roadmap', icon: Target },
  { id: 'companies', label: 'Companies', icon: Building2 },
]

function CareerCompass() {
  const {
    state: { session, attendance, user },
  } = useAppStore()

  const token = session.token
  const program = session.programFull || session.programSn || ''
  // Derive semester label from selected semester (semesters array has {id, label})
  const semesterLabel =
    session.semesters.find((s) => s.id === session.selectedSemester)?.label || ''
  // Subject short names from attendance data
  const subjectShortNames = (attendance.subjects || []).map((s) => s.shortName || s.name || '')

  const [activeTab, setActiveTab] = useState('explore')
  const [selectedTrack, setSelectedTrack] = useState(null)

  // Explore tab state
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(true)
  const [tracksError, setTracksError] = useState('')

  // Roadmap tab state
  const [roadmap, setRoadmap] = useState(null)
  const [roadmapLoading, setRoadmapLoading] = useState(false)
  const [roadmapError, setRoadmapError] = useState('')

  // Companies tab state
  const [companies, setCompanies] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [companiesError, setCompaniesError] = useState('')

  // Load tracks on mount (no LLM — fast)
  useEffect(() => {
    if (!token) return
    setTracksLoading(true)
    fetchCareerTracks(token, { program, semester: semesterLabel })
      .then((data) => {
        setTracks(data.tracks || [])
        setTracksError('')
      })
      .catch((err) => setTracksError(err.message || 'Failed to load career tracks'))
      .finally(() => setTracksLoading(false))
  }, [token, program, semesterLabel])

  // Load companies whenever selected track changes
  useEffect(() => {
    if (!token) return
    setCompaniesLoading(true)
    fetchCompanies(token, selectedTrack)
      .then((data) => {
        setCompanies(data.companies || [])
        setCompaniesError('')
      })
      .catch((err) => setCompaniesError(err.message || 'Failed to load companies'))
      .finally(() => setCompaniesLoading(false))
  }, [token, selectedTrack])

  const handleGenerateRoadmap = useCallback(async () => {
    if (!token || roadmapLoading) return
    setRoadmapLoading(true)
    setRoadmapError('')
    setActiveTab('roadmap')
    try {
      const data = await fetchCareerRoadmap(token, {
        program,
        semester: semesterLabel,
        subjects: subjectShortNames.filter(Boolean),
      })
      setRoadmap(data)
    } catch (err) {
      setRoadmapError(err.message || 'Failed to generate roadmap. Please try again.')
    } finally {
      setRoadmapLoading(false)
    }
  }, [token, program, semesterLabel, subjectShortNames, roadmapLoading])

  // When user selects a track in Explore tab → switch to Companies tab
  const handleSelectTrack = useCallback((slug) => {
    setSelectedTrack(slug)
    if (slug) setActiveTab('companies')
  }, [])

  return (
    <div className="min-h-dvh bg-[#5B5878] pb-28 md:pb-6">
      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">

        {/* Hero — always visible */}
        <CareerHero
          program={program || 'Your Degree'}
          semester={semesterLabel || 'Current Semester'}
          onGenerate={handleGenerateRoadmap}
          isLoading={roadmapLoading}
        />

        {/* Tab bar */}
        <div className="rounded-xl bg-[#302A52] p-1 ring-1 ring-white/8">
          <div className="grid grid-cols-3 gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={[
                  'flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition-all',
                  activeTab === id
                    ? 'bg-[#FF916C] text-[#1D183E] shadow'
                    : 'text-[#9F9AB5] hover:text-[#F7F4FF]',
                ].join(' ')}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {label}
                {id === 'roadmap' && roadmapLoading ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div>
          {/* Explore tab */}
          {activeTab === 'explore' ? (
            <>
              {tracksError ? (
                <div className="rounded-xl border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-sm text-[#FFD4D4]">
                  {tracksError}
                </div>
              ) : tracksLoading ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-28 animate-pulse rounded-xl bg-[#302A52]" />
                  ))}
                </div>
              ) : (
                <PathExplorer
                  tracks={tracks}
                  selectedTrack={selectedTrack}
                  onSelectTrack={handleSelectTrack}
                />
              )}
            </>
          ) : null}

          {/* Roadmap tab */}
          {activeTab === 'roadmap' ? (
            <>
              {roadmapError ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-sm text-[#FFD4D4]">
                    {roadmapError}
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRoadmap}
                    className="w-full rounded-xl bg-[#FF916C] py-3 text-sm font-bold text-[#1D183E]"
                  >
                    Try Again
                  </button>
                </div>
              ) : roadmapLoading ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[#302A52] p-6 text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#FF916C]/30 border-t-[#FF916C]" />
                    <p className="mt-3 text-sm font-semibold text-[#F7F4FF]">Building your roadmap…</p>
                    <p className="mt-1 text-[11px] text-[#9F9AB5]">
                      AI is personalising your skill plan based on your degree and subjects
                    </p>
                  </div>
                </div>
              ) : roadmap ? (
                <SkillRoadmap roadmap={roadmap} />
              ) : (
                /* Not generated yet */
                <div className="rounded-xl bg-[#302A52] p-6 text-center ring-1 ring-white/8">
                  <Target className="mx-auto h-8 w-8 text-[#FF916C]/50" strokeWidth={1.5} />
                  <p className="mt-3 text-sm font-semibold text-[#F7F4FF]">No roadmap yet</p>
                  <p className="mt-1 text-[11px] text-[#9F9AB5]">
                    Click "Generate My Career Roadmap" above to get your personalised plan
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateRoadmap}
                    className="mt-4 rounded-xl bg-[#FF916C] px-6 py-2.5 text-sm font-bold text-[#1D183E]"
                  >
                    Generate Now
                  </button>
                </div>
              )}
            </>
          ) : null}

          {/* Companies tab */}
          {activeTab === 'companies' ? (
            <>
              {companiesError ? (
                <div className="rounded-xl border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-sm text-[#FFD4D4]">
                  {companiesError}
                </div>
              ) : (
                <CompanyDirectory
                  companies={companies}
                  isLoading={companiesLoading}
                  selectedTrack={selectedTrack}
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default CareerCompass
