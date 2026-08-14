import { useEffect, useRef, useState } from 'react'
import { LogIn, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { fireAndForgetStudyMeEvent, fetchSubjectRequestCounts } from '../services/studyMeAnalytics'
import { getAvailableChapters } from '../services/lessonApi'

const DOT_COLORS = ['#6CB4FF', '#FF916C', '#FF6B6B', '#4EF0A0', '#C77DFF', '#FFB23E']

function getSubjectAbbreviation(title) {
  if (!title) return '?'
  const words = title.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 5)
}

function toSubjectId(subject) {
  const abbr = (subject.shortName || subject.id || '').trim().toLowerCase()
  if (abbr.length <= 6) return abbr
  return abbr.replace(/[^a-z]/g, '') || abbr
}

function StudyMe() {
  const navigate = useNavigate()
  const hasTrackedOpenRef = useRef(false)
  const {
    state: { user, session, attendance },
  } = useAppStore()

  const isAuthenticated = user.isAuthenticated
  const enrolledSubjects = attendance?.subjects || []

  const [aiLessons, setAiLessons] = useState({})
  const [aiLoading, setAiLoading] = useState(true)
  const [liveCounts, setLiveCounts] = useState({})

  // Fetch available chapters for all subjects
  useEffect(() => {
    if (!session.token || enrolledSubjects.length === 0) {
      setAiLoading(false)
      return
    }
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
    }).catch(() => setAiLoading(false))
  }, [session.token, enrolledSubjects.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch request counts — only when authenticated
  useEffect(() => {
    if (!session.token) return
    fetchSubjectRequestCounts(session.token)
      .then(counts => setLiveCounts(counts || {}))
      .catch(() => {})
  }, [session.token])

  // Track page open event
  useEffect(() => {
    if (hasTrackedOpenRef.current || !session.token) return
    hasTrackedOpenRef.current = true
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: null,
    })
  }, [session.token, user.id, user.name, user.portalName, user.rollNumber])

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
      {!isAuthenticated && (
        <div className="rounded-2xl border border-[#FF916C]/20 bg-[#FF916C]/5 p-4">
          <p className="text-sm font-semibold text-[#F7F4FF]">See your semester subjects</p>
          <p className="mt-1 text-xs text-[#9F9AB5]">Log in to view StudyMe content tailored to your actual subjects.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-3 flex items-center gap-2 rounded-full bg-[#FF916C] px-4 py-2 text-xs font-semibold text-white transition active:scale-[0.98]"
          >
            <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
            Log in
          </button>
        </div>
      )}

      {/* Upload prompt — shown when authenticated but no lessons yet */}
      {allUnavailable && (
        <div className="rounded-2xl border border-white/10 bg-[#4A466A]/50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/15">
              <Sparkles className="h-4 w-4 text-[#FFB23E]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#F7F4FF]">Upload your first chapter</p>
              <p className="mt-1 text-xs leading-relaxed text-[#9F9AB5]">
                Open any subject below and upload your lecture slides or notes — StudyMe will turn them into interactive AI lessons instantly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All subjects */}
      {isAuthenticated && enrolledSubjects.length > 0 && (
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
              const reqCount = liveCounts[subjectId] || liveCounts[subject.shortName] || 0

              if (hasLessons) {
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
                      className="shrink-0 rounded-full border border-[#FF916C]/30 bg-[#FF916C]/10 px-3 py-1 text-[10px] font-semibold text-[#FF916C] transition active:scale-95"
                    >
                      Open
                    </button>
                  </div>
                )
              }

              return (
                <button
                  key={subject.id || subjectId}
                  type="button"
                  onClick={() => navigate(`/app/study/${subjectId}`)}
                  className="flex items-center gap-3 rounded-xl bg-[#4A466A]/60 px-3 py-3.5 ring-1 ring-white/5 w-full text-left active:scale-[0.99] transition-transform"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {abbreviation}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#D8D4E7]">{subject.name}</p>
                    <p className="text-[10px] text-[#9F9AB5]">
                      {reqCount > 0 ? `${reqCount} students interested` : 'Tap to upload & create lessons'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#FF916C]/30 bg-[#FF916C]/10 px-3 py-1 text-[10px] font-semibold text-[#FF916C]">
                    Open
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export default StudyMe
