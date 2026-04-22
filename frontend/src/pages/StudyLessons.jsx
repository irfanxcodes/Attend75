import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StudyBackButton from '../components/common/StudyBackButton'
import { getStudySubjectById } from '../constants/studyMe/content'
import useAppStore from '../hooks/useAppStore'
import { getSubjectProgress } from '../services/studyProgress'
import { fireAndForgetStudyMeEvent } from '../services/studyMeAnalytics'

function statusChip(status) {
  if (status === 'completed') {
    return {
      label: 'Completed',
      classes: 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100',
      dot: 'bg-emerald-300',
    }
  }

  if (status === 'in_progress') {
    return {
      label: 'In Progress',
      classes: 'border-sky-300/30 bg-sky-500/15 text-sky-100',
      dot: 'bg-sky-300',
    }
  }

  return {
    label: 'Not Started',
    classes: 'border-white/20 bg-white/5 text-[#D8D3E8]',
    dot: 'bg-[#8EA0D2]',
  }
}

function StudyLessons() {
  const navigate = useNavigate()
  const { subjectId } = useParams()
  const hasTrackedSubjectOpenRef = useRef(false)
  const {
    state: { user, session },
  } = useAppStore()
  const subject = getStudySubjectById(subjectId)

  const progress = useMemo(() => {
    if (!subject) {
      return { progressByLessonId: {}, completedCount: 0 }
    }

    const lessonIds = subject.lessons.map((lesson) => lesson.id)
    return getSubjectProgress(subject.id, lessonIds)
  }, [subject])

  useEffect(() => {
    if (!subject || hasTrackedSubjectOpenRef.current) {
      return
    }

    hasTrackedSubjectOpenRef.current = true
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_subject_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject.title,
    })
  }, [session.token, subject, user.id, user.name, user.portalName, user.rollNumber])

  const openLesson = (lesson) => {
    navigate(`/study/${subject.id}/${lesson.id}`)
  }

  if (!subject) {
    return (
      <section className="space-y-3 pb-2 sm:space-y-4">
        <header>
          <div className="flex items-center gap-3">
            <StudyBackButton fallbackTo="/study" label="Go back" iconOnly />
            <h1 className="text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">StudyMe</h1>
          </div>
          <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">Subject not found.</p>
        </header>
      </section>
    )
  }

  return (
    <section className="space-y-3 pb-2 sm:space-y-4">
      <header>
        <div className="flex items-center gap-2.5">
          <StudyBackButton fallbackTo="/study" label="Go back" iconOnly />
          <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">StudyMe</p>
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">{subject.title}</h1>
        <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">
          {progress.completedCount}/{subject.lessons.length} lessons completed
        </p>
      </header>

      <div className="space-y-3 rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
        {subject.lessons.map((lesson) => {
          const lessonState = progress.progressByLessonId[lesson.id] || { status: 'not_started' }
          const status = statusChip(lessonState.status)

          return (
            <article
              key={lesson.id}
              role="button"
              tabIndex={0}
              onClick={() => openLesson(lesson)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openLesson(lesson)
                }
              }}
              className="cursor-pointer rounded-2xl border border-white/15 bg-[#312051] p-4 transition hover:bg-[#3A315D]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[#CFC5E8]">Lesson {lesson.lessonNumber}</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#F4F1FF]">{lesson.title}</h2>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.classes}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                  {status.label}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[#D8D3E8]">Importance: -</span>
                {Array.isArray(lesson.tags)
                  ? lesson.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-[#E2BC8B]/35 bg-[#E2BC8B]/10 px-2 py-1 text-[#F2CA98]">
                        {tag}
                      </span>
                    ))
                  : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default StudyLessons
