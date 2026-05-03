import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StudyBackButton from '../components/common/StudyBackButton'
import { getStudySubjectById } from '../constants/studyMe/content'
import useAppStore from '../hooks/useAppStore'
import { getSubjectProgress } from '../services/studyProgress'
import { fireAndForgetStudyMeEvent } from '../services/studyMeAnalytics'
import { fetchStudyMeImportance } from '../services/studyMeImportance'

const REVISION_TABS = [
  { id: 'theory', label: 'Quick Theory' },
  { id: 'application', label: 'Application' },
  { id: 'caseStudies', label: 'Case Studies' },
]

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

function ImportantRevisionPanel({ revision }) {
  const [activeTab, setActiveTab] = useState('theory')
  const [isExpanded, setExpanded] = useState(false)
  const items = Array.isArray(revision?.[activeTab]) ? revision[activeTab] : []

  return (
    <section className="rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full min-w-0 items-start justify-between gap-3 text-left sm:flex-1"
          aria-expanded={isExpanded}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E2BC8B]">Important & Quick Revision</p>
            <h2 className="mt-1 text-xl font-semibold text-[#F4F1FF]">Exam-focused revision support</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#CFC5E8]">
              Quick theory for 5-mark preparation, application-style answers, and 10-mark case study guidance.
            </p>
          </div>
          <span className="inline-flex shrink-0 rounded-full border border-white/15 bg-[#312051]/70 px-3 py-1.5 text-xs font-semibold text-[#E7DEDE]">
            {isExpanded ? 'Hide' : 'Show'}
          </span>
        </button>

        {isExpanded ? (
          <div className="inline-flex flex-wrap gap-2 rounded-2xl bg-[#312051]/70 p-1 sm:max-w-[48%] sm:justify-end">
            {REVISION_TABS.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${isActive ? 'bg-[#E2BC8B] text-[#1D183E]' : 'text-[#E7DEDE] hover:bg-white/10'}`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {isExpanded ? (
        <>
          <div className="mt-3">
            {activeTab === 'theory' ? (
              <div className="space-y-3">
                {items.map((group) => (
                  <article key={group.title} className="rounded-2xl border border-white/10 bg-[#312051] p-3">
                    <h3 className="text-sm font-semibold text-[#F4F1FF]">{group.title}</h3>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#D8D3E8]">
                      {Array.isArray(group.points) ? group.points.map((point) => <li key={point}>• {point}</li>) : null}
                    </ul>
                  </article>
                ))}
              </div>
            ) : null}

            {activeTab === 'application' ? (
              <div className="space-y-3">
                {items.map((item) => (
                  <article key={item.title} className="rounded-2xl border border-white/10 bg-[#312051] p-3">
                    <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.title}</h3>
                    <div className="mt-2 space-y-2 text-xs leading-relaxed text-[#D8D3E8]">
                      <div>
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Scenario</p>
                        <p className="mt-1">{item.scenario}</p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Recommended Answer</p>
                        <p className="mt-1">{item.answer}</p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Why</p>
                        <p className="mt-1">{item.why}</p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Key Points to Write</p>
                        <ul className="mt-1 space-y-1">
                          {Array.isArray(item.examPoints) ? item.examPoints.map((point) => <li key={point}>• {point}</li>) : null}
                        </ul>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {activeTab === 'caseStudies' ? (
              <div className="space-y-3">
                {items.map((item) => (
                  <article key={item.name} className="rounded-2xl border border-white/10 bg-[#312051] p-3">
                    <h3 className="text-sm font-semibold text-[#F4F1FF]">{item.name}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#D8D3E8]">{item.context}</p>
                    <div className="mt-3 grid gap-3 text-xs leading-relaxed text-[#D8D3E8] sm:grid-cols-3">
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Key Concepts</p>
                        <ul className="mt-2 space-y-1">
                          {Array.isArray(item.keyConcepts) ? item.keyConcepts.map((concept) => <li key={concept}>• {concept}</li>) : null}
                        </ul>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Application</p>
                        <p className="mt-2">{item.application}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#CFC5E8]">Exam Takeaways</p>
                        <ul className="mt-2 space-y-1">
                          {Array.isArray(item.takeaways) ? item.takeaways.map((point) => <li key={point}>• {point}</li>) : null}
                        </ul>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {!items.length ? (
              <div className="rounded-2xl border border-white/10 bg-[#312051] p-3 text-sm text-[#D8D3E8]">
                Revision content has not been added yet for this section.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}

function StudyLessons() {
  const navigate = useNavigate()
  const { subjectId } = useParams()
  const hasTrackedSubjectOpenRef = useRef(false)
  const {
    state: { user, session },
  } = useAppStore()
  const subject = getStudySubjectById(subjectId)
  const hasImportantRevision =
    Array.isArray(subject?.importantRevision?.theory) && subject.importantRevision.theory.length ||
    Array.isArray(subject?.importantRevision?.application) && subject.importantRevision.application.length ||
    Array.isArray(subject?.importantRevision?.caseStudies) && subject.importantRevision.caseStudies.length

  const progress = useMemo(() => {
    if (!subject) {
      return { progressByLessonId: {}, completedCount: 0 }
    }

    const lessonIds = subject.lessons.map((lesson) => lesson.id)
    return getSubjectProgress(subject.id, lessonIds)
  }, [subject])
  const [lessonImportanceById, setLessonImportanceById] = useState({})
  const [importanceStatus, setImportanceStatus] = useState('idle')

  useEffect(() => {
    if (!subject?.id || !session.token) {
      setLessonImportanceById({})
      setImportanceStatus(session.token ? 'idle' : 'unauthenticated')
      return
    }

    let isCancelled = false
    setImportanceStatus('loading')

    fetchStudyMeImportance({
      token: session.token,
      subjectId: subject.id,
      lessonIds: subject.lessons.map((lesson) => lesson.id),
      topicIds: [],
    })
      .then((data) => {
        if (isCancelled) {
          return
        }

        setLessonImportanceById(data?.lessons && typeof data.lessons === 'object' ? data.lessons : {})
        setImportanceStatus('success')
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        setLessonImportanceById({})
        setImportanceStatus('error')
      })

    return () => {
      isCancelled = true
    }
  }, [session.token, subject])

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

      {hasImportantRevision ? <ImportantRevisionPanel revision={subject.importantRevision} /> : null}

      <div className="space-y-3 rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
        {subject.lessons.map((lesson) => {
          const lessonState = progress.progressByLessonId[lesson.id] || { status: 'not_started' }
          const lessonImportance = lessonImportanceById[lesson.id] || null
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
                {lessonImportance ? (
                  <span
                    className={`rounded-full border px-2 py-1 ${
                      lessonImportance.important
                        ? 'border-[#E2BC8B]/45 bg-[#E2BC8B]/12 text-[#F2CA98]'
                        : 'border-white/20 bg-white/5 text-[#D8D3E8]'
                    }`}
                  >
                    {lessonImportance.importantCount} marked important
                  </span>
                ) : (
                  <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[#D8D3E8]">
                    {importanceStatus === 'loading'
                      ? 'Loading importance...'
                      : importanceStatus === 'unauthenticated'
                        ? 'Sign in to view community importance'
                        : 'Importance unavailable'}
                  </span>
                )}
                {lessonImportance?.importantBadge === 'hot' ? (
                  <span className="rounded-full border border-[#FF8A65]/40 bg-[#FF8A65]/12 px-2 py-1 text-[#FFD2C2]">
                    Hot topic
                  </span>
                ) : null}
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
