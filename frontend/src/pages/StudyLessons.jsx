import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getStudySubjectById } from '../constants/studyMe/content'
import useAppStore from '../hooks/useAppStore'
import { getSubjectProgress } from '../services/studyProgress'
import { fireAndForgetStudyMeEvent } from '../services/studyMeAnalytics'
import { fetchStudyMeImportance } from '../services/studyMeImportance'

function StudyLessons() {
  const navigate = useNavigate()
  const location = useLocation()
  const { subjectId } = useParams()
  const hasTrackedSubjectOpenRef = useRef(false)
  const {
    state: { user, session },
  } = useAppStore()
  const subject = getStudySubjectById(subjectId)

  // Determine path prefix based on current route
  const basePath = location.pathname.startsWith('/app/') ? '/app/study' : '/study'

  const progress = useMemo(() => {
    if (!subject) return { progressByLessonId: {}, completedCount: 0 }
    const lessonIds = subject.lessons.map((l) => l.id)
    return getSubjectProgress(subject.id, lessonIds)
  }, [subject])

  const [lessonImportanceById, setLessonImportanceById] = useState({})

  useEffect(() => {
    if (!subject?.id || !session.token) return
    let cancelled = false
    fetchStudyMeImportance({
      token: session.token,
      subjectId: subject.id,
      lessonIds: subject.lessons.map((l) => l.id),
      topicIds: [],
    }).then((data) => {
      if (!cancelled) setLessonImportanceById(data?.lessons || {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [session.token, subject])

  useEffect(() => {
    if (!subject || hasTrackedSubjectOpenRef.current) return
    hasTrackedSubjectOpenRef.current = true
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_subject_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
    })
  }, [session.token, subject, user.id, user.name, user.portalName, user.rollNumber])

  if (!subject) {
    return (
      <section className="space-y-3 pb-4">
        <div className="flex items-center gap-3 rounded-2xl bg-[#4A466A] px-4 py-3 ring-1 ring-white/5">
          <button type="button" onClick={() => navigate(basePath)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-[#D8D4E7] hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#9F9AB5]">StudyMe</span>
        </div>
        <p className="text-sm text-[#9F9AB5]">Subject not found.</p>
      </section>
    )
  }

  const totalLessons = subject.lessons.length
  const completedLessons = progress.completedCount
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  return (
    <section className="space-y-4 pb-4">
      {/* Back nav */}
      <div className="flex items-center gap-3 rounded-2xl bg-[#4A466A] px-4 py-3 ring-1 ring-white/5">
        <button type="button" onClick={() => navigate(basePath)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-[#D8D4E7] transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#9F9AB5]">StudyMe</span>
      </div>

      {/* Subject header */}
      <header>
        <h1 className="text-2xl font-extrabold text-[#F7F4FF] sm:text-3xl">{subject.title}</h1>
        <div className="mt-1.5 flex items-center gap-3">
          <span className="text-xs text-[#9F9AB5]">{completedLessons}/{totalLessons} lessons completed</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#302A52]">
            <div className="h-full rounded-full bg-[#F7F4FF] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      {/* Lesson list */}
      <div className="space-y-3">
        {subject.lessons.map((lesson) => {
          const lessonState = progress.progressByLessonId[lesson.id] || { status: 'not_started' }
          const isCompleted = lessonState.status === 'completed'
          const tags = Array.isArray(lesson.tags) ? lesson.tags : []

          return (
            <article
              key={lesson.id}
              className="group rounded-2xl border border-white/10 bg-[#3D3660] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_6px_24px_rgba(20,16,44,0.35)] sm:p-5"
            >
              <div className="flex items-start gap-4">
                {/* Lesson number badge */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4A466A] text-sm font-bold text-[#D8D4E7]">
                  {lesson.lessonNumber}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9F9AB5]">Lesson {lesson.lessonNumber}</p>
                  <h2 className="mt-0.5 text-base font-bold text-[#F7F4FF] sm:text-lg">{lesson.title}</h2>

                  {/* Tags */}
                  {tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-[#4A466A] px-2.5 py-0.5 text-[10px] font-medium text-[#9F9AB5]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={() => navigate(`${basePath}/${subject.id}/${lesson.id}`)}
                  className={[
                    'shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200',
                    isCompleted
                      ? 'border border-[#4EF0A0]/40 bg-[#4EF0A0]/10 text-[#4EF0A0]'
                      : 'bg-[#6CB4FF]/15 text-[#6CB4FF] hover:bg-[#6CB4FF]/25',
                  ].join(' ')}
                >
                  {isCompleted ? 'Review' : 'Start'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default StudyLessons
