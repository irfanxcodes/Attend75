import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import StudyBackButton from '../components/common/StudyBackButton'
import { STUDYME_SUBJECTS } from '../constants/studyMe/content'
import useAppStore from '../hooks/useAppStore'
import { getSubjectProgress } from '../services/studyProgress'
import { fireAndForgetStudyMeEvent } from '../services/studyMeAnalytics'

function StudyMe() {
  const navigate = useNavigate()
  const hasTrackedOpenRef = useRef(false)
  const {
    state: { user, session },
  } = useAppStore()
  const subject = STUDYME_SUBJECTS[0] || null

  const progress = useMemo(() => {
    if (!subject) {
      return { completedCount: 0 }
    }

    const lessonIds = subject.lessons.map((lesson) => lesson.id)
    return getSubjectProgress(subject.id, lessonIds)
  }, [subject])

  useEffect(() => {
    if (hasTrackedOpenRef.current) {
      return
    }

    hasTrackedOpenRef.current = true
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: subject?.title || null,
    })
  }, [session.token, subject, user.id, user.name, user.portalName, user.rollNumber])

  const openSubject = () => {
    if (!subject) {
      return
    }
    navigate(`/study/${subject.id}`)
  }

  if (!subject) {
    return (
      <section className="space-y-3 pb-2 sm:space-y-4">
        <header>
          <div className="flex items-center gap-3">
            <StudyBackButton fallbackTo="/app/dashboard" label="Go back" iconOnly />
            <h1 className="text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">StudyMe</h1>
          </div>
          <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">Exam-focused lesson roadmap and revision support.</p>
        </header>

        <div className="rounded-2xl border border-white/20 bg-[#312051] p-4 text-sm text-[#D8D3E8]">
          No StudyMe subjects are configured yet.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3 pb-2 sm:space-y-4">
      <header>
        <div className="flex items-center gap-3">
          <StudyBackButton fallbackTo="/app/dashboard" label="Go back" iconOnly />
          <h1 className="text-3xl font-bold tracking-tight text-[#E7DEDE] sm:text-4xl">StudyMe</h1>
        </div>
        <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">Exam-focused lesson roadmap + revision support.</p>
      </header>

      <article
        role="button"
        tabIndex={0}
        onClick={openSubject}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openSubject()
          }
        }}
        className="cursor-pointer rounded-3xl border border-white/20 bg-[#312051] p-4 shadow-md transition hover:bg-[#3A315D]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Subject</p>
            <h2 className="mt-1 text-xl font-semibold text-[#F4F1FF]">{subject.title}</h2>
            <p className="mt-2 text-sm text-[#D8D3E8]">{subject.description}</p>
          </div>
          <span className="rounded-full border border-white/20 bg-[#3A315D] px-3 py-1 text-xs font-semibold text-[#E2BC8B]">
            V1
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
          <div className="rounded-xl border border-white/10 bg-[#3A315D] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-[#CFC5E8]">Total Lessons</p>
            <p className="mt-1 text-lg font-semibold text-[#F4F1FF]">{subject.lessons.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#3A315D] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-[#CFC5E8]">Completed</p>
            <p className="mt-1 text-lg font-semibold text-[#A8F5C5]">{progress.completedCount}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              openSubject()
            }}
            className="rounded-full bg-[#E2BC8B] px-4 py-2 text-sm font-semibold text-[#1D183E] hover:bg-[#D9AA6F]"
          >
            Start Learning
          </button>
        </div>
      </article>
    </section>
  )
}

export default StudyMe
