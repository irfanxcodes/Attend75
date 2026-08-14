import { useEffect, useRef, useState } from 'react'
import { LogIn, Sparkles, BookMarked } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { fireAndForgetStudyMeEvent, requestStudyMeSubject, fetchSubjectRequestCounts } from '../services/studyMeAnalytics'
import { getAvailableChapters, getProgress } from '../services/lessonApi'

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

/** Read the last-opened lesson written by WorkspacePlayer / LessonPlayer. */
function readLastLesson() {
  try {
    const raw = window.localStorage.getItem('attend75.studyme.lastLesson')
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.subjectId || !data?.lessonId) return null
    return data // { subjectId, lessonId, title, openedAt }
  } catch {
    return null
  }
}

// ── Continue Card ────────────────────────────────────────────────────────────

function ContinueLessonCard({ lastLesson, allAiLessons, token, onNavigate }) {
  const [progress, setProgress] = useState(null)

  const chapters = allAiLessons[lastLesson.subjectId] || []
  const chapterIndex = chapters.findIndex(ch => ch.script_id === lastLesson.lessonId)
  const chapter = chapters[chapterIndex] ?? null
  const lessonNumber = chapterIndex >= 0 ? chapterIndex + 1 : null
  const totalLessons = chapters.length

  useEffect(() => {
    if (!token || !lastLesson.lessonId) return
    getProgress({ token, lessonId: lastLesson.lessonId })
      .then(p => setProgress(p))
      .catch(() => setProgress(null))
  }, [token, lastLesson.lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalBlocks = chapter?.block_count || 0
  const doneBlocks = Math.min(progress?.last_block_index ?? 0, totalBlocks)
  const isCompleted = progress?.completed ?? false
  const pct = totalBlocks > 0 ? Math.round((doneBlocks / totalBlocks) * 100) : 0
  const hasStarted = doneBlocks > 0 || isCompleted
  const subjectAbbr = lastLesson.subjectId.toUpperCase()
  const title = lastLesson.title || chapter?.chapter_title || lastLesson.lessonId

  const badgeLabel = isCompleted ? 'REVIEW' : hasStarted ? 'CONTINUE' : 'START HERE'
  const ctaLabel = isCompleted ? 'Review lesson' : hasStarted ? 'Continue lesson' : 'Start lesson'

  return (
    <div
      className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.985] transition-transform select-none"
      style={{
        // Mid-tone blue-indigo — left edge slightly lighter, fades right
        background: 'linear-gradient(to right, #3E3C6E 0%, #393760 50%, #343260 100%)',
        border: '1px solid rgba(120, 140, 255, 0.22)',
        boxShadow: '0 0 0 1px rgba(80,100,220,0.10) inset, 0 6px 32px rgba(15,12,50,0.45)',
      }}
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onNavigate()}
      aria-label={`${ctaLabel}: ${title}`}
    >
      {/* Top-edge inner highlight — the subtle light shimmer on the border */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(to right, rgba(160,180,255,0.35) 0%, rgba(160,180,255,0.10) 60%, transparent 100%)' }}
      />

      {/* Ghost circle — top right, exactly as in reference */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          right: '-20px', top: '-20px',
          width: '110px', height: '110px',
          border: '1.5px solid rgba(140,160,255,0.13)',
        }}
      />
      {/* Smaller inner circle */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          right: '18px', top: '10px',
          width: '52px', height: '52px',
          border: '1.5px solid rgba(140,160,255,0.08)',
        }}
      />

      {/* Content */}
      <div className="relative px-5 py-4">

        {/* Top row: icon + badge + title */}
        <div className="flex items-start gap-4">

          {/* Icon box — frosted glass style matching reference */}
          <div
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-xl"
            style={{
              background: 'rgba(100,140,210,0.25)',
              border: '1px solid rgba(140,190,255,0.25)',
            }}
          >
            <BookMarked size={24} stroke="#A8E0FF" strokeWidth={1.8} fill="none" />
          </div>

          {/* Text block */}
          <div className="min-w-0 flex-1 pt-0.5">
            {/* Badge */}
            <span
              className="inline-flex items-center rounded-full px-3 py-[4px] text-[11px] font-bold tracking-[0.10em] uppercase"
              style={{ background: '#3B5FA0', color: '#C8DEFF' }}
            >
              {badgeLabel}
            </span>

            {/* Title */}
            <p className="mt-2 text-[17px] font-bold leading-[1.25] text-white">
              {title}
            </p>

            {/* Meta */}
            <div className="mt-1.5 flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: '#5B9EF0' }} />
              <p className="text-[13px]" style={{ color: '#9AAFD0' }}>
                {subjectAbbr}{lessonNumber && totalLessons ? ` · Lesson ${lessonNumber} of ${totalLessons}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div
            className="h-[5px] w-full overflow-hidden rounded-full"
            style={{ background: '#1C1A42' }}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #4A8AE8 0%, #6DB4FF 100%)',
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-[12px]" style={{ color: '#7080A8' }}>
              {totalBlocks > 0
                ? `${doneBlocks}/${totalBlocks} blocks done`
                : progress === null ? 'Loading…' : '0 blocks done'}
            </p>
            <p className="text-[12px] font-bold" style={{ color: '#5B9EF0' }}>{pct}%</p>
          </div>
        </div>

        {/* CTA */}
        <p className="mt-4 text-[15px] font-semibold" style={{ color: '#FF8C55' }}>
          {ctaLabel} →
        </p>
      </div>
    </div>
  )
}

function StudyMe() {
  const navigate = useNavigate()
  const location = useLocation()
  const hasTrackedOpenRef = useRef(false)
  const {
    state: { user, session, attendance },
  } = useAppStore()

  const basePath = location.pathname.startsWith('/app/') ? '/app/study' : '/study' // used by potential non-/app routes
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

  // Read the last-opened lesson from localStorage (written by WorkspacePlayer / LessonPlayer)
  const [lastLesson] = useState(() => isAuthenticated ? readLastLesson() : null)

  return (
    <section className="space-y-4 pb-4">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-extrabold italic text-[#F7F4FF]">StudyMe</h1>
        <p className="mt-0.5 text-[11px] text-[#9F9AB5]">Lessons & formulas for every subject</p>
      </header>

      {/* Guest CTA */}
      {!isAuthenticated ? (
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
      ) : null}

      {/* Continue Your Lesson card */}
      {lastLesson && !aiLoading ? (
        <ContinueLessonCard
          lastLesson={lastLesson}
          allAiLessons={aiLessons}
          token={session.token}
          onNavigate={() => navigate(`/app/study/${lastLesson.subjectId}/${lastLesson.lessonId}/workspace`)}
        />
      ) : null}

      {/* Upload prompt — shown when no subject has lessons yet */}
      {allUnavailable ? (
        <div className="rounded-2xl border border-white/10 bg-[#4A466A]/50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/15">
              <Sparkles className="h-4 w-4 text-[#FFB23E]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#F7F4FF]">Upload your first chapter</p>
              <p className="mt-1 text-xs leading-relaxed text-[#9F9AB5]">
                Open any subject below and upload your lecture slides or notes — StudyMe will turn them into interactive lessons instantly.
              </p>
            </div>
          </div>
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
                      className="shrink-0 rounded-full border border-[#FF916C]/30 bg-[#FF916C]/10 px-3 py-1 text-[10px] font-semibold text-[#FF916C] transition active:scale-95"
                    >
                      Open
                    </button>
                  </div>
                )
              }

              // No lessons yet — still looks live, tap opens subject detail to upload
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
                      Tap to upload &amp; create lessons
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
      ) : null}
    </section>
  )
}

export default StudyMe
