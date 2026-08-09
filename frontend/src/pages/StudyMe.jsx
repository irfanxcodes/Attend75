import { useEffect, useRef, useState } from 'react'
import { LogIn, Sparkles } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { fireAndForgetStudyMeEvent, requestStudyMeSubject, fetchSubjectRequestCounts } from '../services/studyMeAnalytics'
import { getAvailableChapters } from '../services/lessonApi'

const DOT_COLORS = ['#6CB4FF', '#FF916C', '#FF6B6B', '#4EF0A0', '#C77DFF', '#FFB23E']

function getSubjectAbbreviation(title) {
  if (!title) return '?'
  const words = title.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 5)
}

// Derive a URL-safe subject_id from portal subject
function toSubjectId(subject) {
  const abbr = (subject.shortName || subject.id || '').trim().toLowerCase()
  if (abbr.length <= 6) return abbr
  return abbr.replace(/[^a-z]/g, '') || abbr
}

function StudyMe() {
  const navigate = useNavigate()
  const location = useLocation()
  const hasTrackedOpenRef = useRef(false)
  const {
    state: { user, session, attendance },
  } = useAppStore()

  const basePath = location.pathname.startsWith('/app/') ? '/app/study' : '/study'
  const isAuthenticated = user.isAuthenticated

  // All enrolled subjects from portal attendance (already semester-filtered)
  const enrolledSubjects = attendance?.subjects || []

  // Track which subjects have AI lessons ready: subjectId → chapters[]
  const [aiLessons, setAiLessons] = useState({}) // { subjectId: [] }
  const [aiLoading, setAiLoading] = useState(true)

  useEffect(() => {
    if (!session.token || enrolledSubjects.length === 0) {
      setAiLoading(false)
      return
    }
    // Fetch available chapters for all subjects in parallel
    const fetches = enrolledSubjects.map(subject => {
      const subjectId = toSubjectId(subject)
      return getAvailableChapters({ token: session.token, subjectId })
        .then(chapters => ({ subjectId, chapters }))
        .catch(() => ({ subjectId, chapters: [] }))
    })
    Promise.all(fetches).then(results => {
      const map = {}
      results.forEach(({ subjectId, chapters }) => {
        map[subjectId] = chapters || []
      })
      setAiLessons(map)
      setAiLoading(false)
    })
  }, [session.token, enrolledSubjects.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track subject requests (prevent duplicate clicks)
  const [requestedCodes, setRequestedCodes] = useState(() => {
    try {
      const saved = window.localStorage.getItem('attend75.studyme.requestedSubjects')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // Live request counts from backend
  const [liveCounts, setLiveCounts] = useState({})

  useEffect(() => {
    fetchSubjectRequestCounts(session.token).then(setLiveCounts)
  }, [session.token])

  useEffect(() => {
    if (!hasTrackedOpenRef.current) {
      hasTrackedOpenRef.current = true
      fireAndForgetStudyMeEvent({
        eventType: 'studyme_opened',
        token: session.token,
        userName: user.portalName || user.name || user.rollNumber || user.id,
        subjectName: null,
      })
    }
  }, [session.token, user.id, user.name, user.portalName, user.rollNumber])

  const handleRequestSubject = async (subject) => {
    const code = subject.shortName || toSubjectId(subject)
    if (requestedCodes.includes(code)) return
    try {
      await requestStudyMeSubject({
        token: session.token,
        subjectCode: subject.id || code,
        subjectName: subject.name,
        abbreviation: subject.shortName || code,
      })
      const updated = [...requestedCodes, code]
      setRequestedCodes(updated)
      try { window.localStorage.setItem('attend75.studyme.requestedSubjects', JSON.stringify(updated)) } catch { /* */ }
      setLiveCounts((prev) => ({ ...prev, [code]: (prev[code] || 0) + 1 }))
    } catch { /* silent */ }
  }

  const totalCount = enrolledSubjects.length
  const allUnavailable = !aiLoading && isAuthenticated && enrolledSubjects.length > 0 &&
    Object.values(aiLessons).every(ch => ch.length === 0)

  return (
    <section className="space-y-4 pb-4">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-extrabold italic text-[#F7F4FF]">StudyMe</h1>
        <p className="mt-0.5 text-[11px] text-[#9F9AB5]">Lessons & formulas for every subject</p>
      </header>

      {/* Guest CTA */}
      {!isAuthenticated ? (
        <div className="rounded-2xl border border-[#6CB4FF]/20 bg-[#6CB4FF]/5 p-4">
          <p className="text-sm font-semibold text-[#F7F4FF]">See your semester subjects</p>
          <p className="mt-1 text-xs text-[#9F9AB5]">Log in to view StudyMe content tailored to your actual subjects.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-3 flex items-center gap-2 rounded-full bg-[#6CB4FF] px-4 py-2 text-xs font-semibold text-[#1D183E] transition active:scale-[0.98]"
          >
            <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
            Log in
          </button>
        </div>
      ) : null}

      {/* All unavailable empty state */}
      {allUnavailable ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#4A466A]/50 p-6 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#FFB23E]" strokeWidth={1.5} />
          <h3 className="mt-3 text-base font-bold text-[#F7F4FF]">StudyMe is coming for your semester</h3>
          <p className="mt-2 text-xs leading-relaxed text-[#9F9AB5]">
            We're preparing content for your subjects. Request the ones you need most and we'll prioritize them.
          </p>
        </div>
      ) : null}

      {/* All subjects - list style */}
      {isAuthenticated && enrolledSubjects.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F7F4FF]">All subjects</h2>
            <span className="text-xs text-[#9F9AB5]">{totalCount}</span>
          </div>

          <div className="space-y-1.5">
            {enrolledSubjects.map((subject, index) => {
              const subjectId = toSubjectId(subject)
              const color = DOT_COLORS[index % DOT_COLORS.length]
              const abbreviation = getSubjectAbbreviation(subject.name)
              const chapters = aiLessons[subjectId] || []
              const hasLessons = chapters.length > 0
              const code = subject.shortName || subjectId
              const isRequested = requestedCodes.includes(code)
              const reqCount = liveCounts[code] || 0

              if (hasLessons) {
                // Subject has AI lessons — show as clickable with "Start" button
                return (
                  <div
                    key={subject.id || subjectId}
                    className="flex items-center gap-3 rounded-xl bg-[#4A466A] px-3 py-3.5 ring-1 ring-white/5"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      {abbreviation}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#F7F4FF]">{subject.name}</p>
                      <p className="text-[10px] text-[#9F9AB5]">
                        {chapters.length} AI lesson{chapters.length !== 1 ? 's' : ''} ready
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/study/${subjectId}`)}
                      className="shrink-0 rounded-full border border-[#6CB4FF]/30 bg-[#6CB4FF]/10 px-3 py-1 text-[10px] font-semibold text-[#6CB4FF] transition active:scale-95"
                    >
                      Open
                    </button>
                  </div>
                )
              }

              // Coming soon — show Request button, but row is tappable to open subject detail
              return (
                <button
                  key={subject.id || subjectId}
                  type="button"
                  onClick={() => navigate(`/app/study/${subjectId}`)}
                  className="flex items-center gap-3 rounded-xl bg-[#4A466A]/60 px-3 py-3.5 ring-1 ring-white/5 w-full text-left active:scale-[0.99] transition-transform"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] font-bold text-[#9F9AB5]">
                    {abbreviation}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#D8D4E7]">{subject.name}</p>
                    <p className="text-[10px] text-[#9F9AB5]">
                      Coming soon{reqCount > 0 ? ` · ${reqCount} requested` : ''}
                    </p>
                  </div>
                  {!isRequested ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRequestSubject(subject) }}
                      disabled={!session.token}
                      className="shrink-0 rounded-full border border-[#FF916C]/30 bg-[#FF916C]/10 px-3 py-1 text-[10px] font-semibold text-[#FF916C] transition active:scale-95 disabled:opacity-50"
                    >
                      Request
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full border border-[#4EF0A0]/30 bg-[#4EF0A0]/10 px-3 py-1 text-[10px] font-semibold text-[#4EF0A0]">
                      Requested ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default StudyMe
