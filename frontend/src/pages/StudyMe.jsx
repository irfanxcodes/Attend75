import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, LogIn, MessageSquare, Sparkles } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { STUDYME_SUBJECTS } from '../constants/studyMe/content'
import { resolveStudentSubjects } from '../constants/studyMe/subjectMapping'
import useAppStore from '../hooks/useAppStore'
import { getSubjectProgress, getLessonState } from '../services/studyProgress'
import { fireAndForgetStudyMeEvent, requestStudyMeSubject, fetchSubjectRequestCounts } from '../services/studyMeAnalytics'

const DOT_COLORS = ['#6CB4FF', '#FF916C', '#FF6B6B', '#4EF0A0', '#C77DFF', '#FFB23E']

function getSubjectAbbreviation(title) {
  if (!title) return '?'
  const words = title.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 5)
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

  // Resolve subjects for this student
  const { available: availableIds, comingSoon, allUnavailable, isGuest } = useMemo(() => {
    return resolveStudentSubjects(attendance?.subjects, isAuthenticated)
  }, [attendance?.subjects, isAuthenticated])

  // Filter StudyMe subjects to available ones
  const subjectCards = useMemo(() => {
    const relevantSubjects = STUDYME_SUBJECTS.filter((s) => availableIds.includes(s.id))
    return relevantSubjects.map((subject, index) => {
      const lessonIds = Array.isArray(subject.lessons) ? subject.lessons.map((l) => l.id) : []
      const progress = getSubjectProgress(subject.id, lessonIds)
      return { subject, progress, color: DOT_COLORS[index % DOT_COLORS.length] }
    })
  }, [availableIds])

  // "Pick up where you left off" card
  const continueData = useMemo(() => {
    for (const { subject, progress, color } of subjectCards) {
      if (subject.status === 'coming-soon') continue
      const lastLessonId = progress.lastOpenedLessonId
      if (!lastLessonId) continue
      const lesson = subject.lessons.find((l) => l.id === lastLessonId)
      if (!lesson) continue
      const lessonState = getLessonState(subject.id, lastLessonId)
      if (lessonState.status === 'completed') continue
      const totalTopics = Array.isArray(lesson.topics) ? lesson.topics.length : 0
      return {
        subject, lesson, color,
        abbreviation: getSubjectAbbreviation(subject.title),
        totalLessons: subject.lessons.length,
        lessonNumber: lesson.lessonNumber,
        totalTopics,
      }
    }
    return null
  }, [subjectCards])

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

  const openSubject = (subjectId) => navigate(`${basePath}/${subjectId}`)
  const openLesson = (subjectId, lessonId) => navigate(`${basePath}/${subjectId}/${lessonId}`)

  const handleRequestSubject = async (item) => {
    if (requestedCodes.includes(item.code)) return
    try {
      await requestStudyMeSubject({
        token: session.token,
        subjectCode: item.code,
        subjectName: item.name,
        abbreviation: item.shortName,
      })
      const updated = [...requestedCodes, item.code]
      setRequestedCodes(updated)
      try { window.localStorage.setItem('attend75.studyme.requestedSubjects', JSON.stringify(updated)) } catch { /* */ }
      // Refresh live counts
      setLiveCounts((prev) => ({ ...prev, [item.code]: (prev[item.code] || 0) + 1 }))
    } catch { /* silent */ }
  }

  return (
    <section className="space-y-4 pb-4">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-extrabold italic text-[#F7F4FF]">StudyMe</h1>
        <p className="mt-0.5 text-[11px] text-[#9F9AB5]">Lessons & formulas for every subject</p>
      </header>

      {/* Guest CTA */}
      {isGuest ? (
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

      {/* Pick up where you left off */}
      {continueData ? (
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#9F9AB5]">Pick up where you left off</p>
          <div
            className="overflow-hidden rounded-2xl p-5 ring-1 ring-white/8"
            style={{ background: 'linear-gradient(180deg, rgba(108,180,255,0.12) 0%, rgba(108,180,255,0) 35%), linear-gradient(145deg, #4A466A 0%, #3D3660 60%, #352F55 100%)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: continueData.color }} />
                <span className="text-sm font-bold text-[#F7F4FF]">{continueData.abbreviation}</span>
                <span className="text-xs text-[#9F9AB5]">· Lesson {continueData.lessonNumber} of {continueData.totalLessons}</span>
              </div>
            </div>
            <h2 className="mt-3 text-xl font-bold text-[#F7F4FF]">{continueData.lesson.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9F9AB5]">{continueData.lesson.covers}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#9F9AB5]">Lesson Progress</span>
              {continueData.totalTopics > 0 ? (
                <span className="text-xs font-semibold text-[#4EF0A0]">{continueData.totalTopics} topics</span>
              ) : null}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#302A52]">
              <div className="h-full rounded-full bg-[#4EF0A0] transition-all duration-500" style={{ width: '40%' }} />
            </div>
            <button
              type="button"
              onClick={() => openLesson(continueData.subject.id, continueData.lesson.id)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#FFAA8D] py-3 text-sm font-bold text-[#1D183E] shadow-[0_4px_16px_rgba(255,170,141,0.3)] transition active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 3 14 9-14 9V3Z" /></svg>
              Continue lesson
            </button>
          </div>
        </div>
      ) : null}

      {/* All unavailable empty state */}
      {allUnavailable && !isGuest ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#4A466A]/50 p-6 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#FFB23E]" strokeWidth={1.5} />
          <h3 className="mt-3 text-base font-bold text-[#F7F4FF]">StudyMe is coming for your semester</h3>
          <p className="mt-2 text-xs leading-relaxed text-[#9F9AB5]">
            We're preparing content for your subjects. Request the ones you need most and we'll prioritize them.
          </p>
        </div>
      ) : null}

      {/* All subjects - list style */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#F7F4FF]">{isGuest ? 'Popular subjects' : 'All subjects'}</h2>
          <span className="text-xs text-[#9F9AB5]">{subjectCards.length + comingSoon.length}</span>
        </div>

        <div className="space-y-1.5">
          {/* Available subjects */}
          {subjectCards.map(({ subject, progress, color }) => {
            const abbreviation = getSubjectAbbreviation(subject.title)
            const totalLessons = subject.lessons?.length || 0
            const completedLessons = progress.completedCount || 0
            const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => openSubject(subject.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-[#4A466A] px-3 py-3.5 text-left ring-1 ring-white/5 transition active:scale-[0.99]"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {abbreviation}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#F7F4FF]">{subject.title}</p>
                  <p className="text-[10px] text-[#9F9AB5]">{totalLessons} lessons</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-bold" style={{ color }}>{progressPercent}%</span>
                  <svg viewBox="0 0 24 24" className="h-6 w-6">
                    <circle cx="12" cy="12" r="10" stroke="#302A52" strokeWidth="3" fill="none" />
                    <circle
                      cx="12" cy="12" r="10"
                      stroke={color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 10}
                      strokeDashoffset={2 * Math.PI * 10 - (progressPercent / 100) * 2 * Math.PI * 10}
                      className="-rotate-90 origin-center"
                    />
                  </svg>
                </div>
              </button>
            )
          })}

          {/* Coming soon subjects in same list */}
          {comingSoon.map((item) => {
            const isRequested = requestedCodes.includes(item.code)
            return (
              <div
                key={item.code || item.shortName}
                className="flex items-center gap-3 rounded-xl bg-[#4A466A]/60 px-3 py-3.5 ring-1 ring-white/5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] font-bold text-[#9F9AB5]">
                  {item.shortName || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#D8D4E7]">{item.name || item.shortName}</p>
                  <p className="text-[10px] text-[#9F9AB5]">Coming soon{(liveCounts[item.code] || 0) > 0 ? ` · ${liveCounts[item.code]} requested` : ''}</p>
                </div>
                {!isRequested ? (
                  <button
                    type="button"
                    onClick={() => handleRequestSubject(item)}
                    disabled={!session.token}
                    className="shrink-0 rounded-full border border-[#FF916C]/30 bg-[#FF916C]/10 px-3 py-1 text-[10px] font-semibold text-[#FF916C] transition active:scale-95 disabled:opacity-50"
                  >
                    Request
                  </button>
                ) : (
                  <span className="shrink-0 rounded-full border border-[#4EF0A0]/30 bg-[#4EF0A0]/10 px-3 py-1 text-[10px] font-semibold text-[#4EF0A0]">Requested ✓</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default StudyMe
