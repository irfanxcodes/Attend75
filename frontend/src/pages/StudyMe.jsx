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
  const subjectCards = useMemo(() => {
    return STUDYME_SUBJECTS.map((subject) => {
      const lessonIds = Array.isArray(subject.lessons) ? subject.lessons.map((lesson) => lesson.id) : []
      const progress = getSubjectProgress(subject.id, lessonIds)

      return {
        subject,
        progress,
      }
    })
  }, [])

  useEffect(() => {
    if (hasTrackedOpenRef.current) {
      return
    }

    hasTrackedOpenRef.current = true
    fireAndForgetStudyMeEvent({
      eventType: 'studyme_opened',
      token: session.token,
      userName: user.portalName || user.name || user.rollNumber || user.id,
      subjectName: null,
    })
  }, [session.token, user.id, user.name, user.portalName, user.rollNumber])

  const openSpecificSubject = (subjectId) => {
    navigate(`/study/${subjectId}`)
  }

  const openFeedback = () => {
    navigate('/profile#feedback-details')
  }

  if (!subjectCards.length) {
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

      <div className="space-y-3">
        {subjectCards.map(({ subject, progress }) => {
          const isComingSoon = subject.status === 'coming-soon'

          return (
            <article
              key={subject.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!isComingSoon) {
                  openSpecificSubject(subject.id)
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !isComingSoon) {
                  event.preventDefault()
                  openSpecificSubject(subject.id)
                }
              }}
              className={`rounded-3xl border border-white/20 bg-[#312051] p-4 shadow-md transition ${isComingSoon ? 'opacity-95' : 'cursor-pointer hover:bg-[#3A315D]'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Subject</p>
                  <h2 className="mt-1 text-xl font-semibold text-[#F4F1FF]">{subject.title}</h2>
                  <p className="mt-2 text-sm text-[#D8D3E8]">{subject.description}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isComingSoon ? 'border-sky-300/30 bg-sky-500/15 text-sky-100' : 'border-white/20 bg-[#3A315D] text-[#E2BC8B]'}`}>
                  {isComingSoon ? 'Coming Soon' : 'V1'}
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
                  disabled={isComingSoon}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!isComingSoon) {
                      openSpecificSubject(subject.id)
                    }
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${isComingSoon ? 'cursor-not-allowed border border-white/15 bg-white/5 text-[#CFC5E8]' : 'bg-[#E2BC8B] text-[#1D183E] hover:bg-[#D9AA6F]'}`}
                >
                  {isComingSoon ? 'Available Soon' : 'Start Learning'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <aside className="rounded-3xl border border-white/15 bg-[#2A2149]/90 p-4 text-sm leading-relaxed text-[#D8D3E8] shadow-sm ring-1 ring-white/5 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E2BC8B]">Help Shape StudyMe</p>
            <p className="mt-3">
              StudyMe is expanding gradually, and your feedback helps decide what should come next.
            </p>
            <p className="mt-2">
              If you want more subjects or improvements, please share your <span className="font-semibold text-[#F4F1FF]">semester, subject name, and suggestions</span> so we can prioritize the right content.
            </p>
            <p className="mt-2">
              You can send feedback from the Profile page, and it helps us improve StudyMe faster.
            </p>
          </div>

          <button
            type="button"
            onClick={openFeedback}
            className="self-start rounded-full bg-[#E2BC8B] px-4 py-2 text-xs font-semibold text-[#1D183E] transition hover:bg-[#D9AA6F]"
          >
            Give Feedback
          </button>
        </div>
      </aside>
    </section>
  )
}

export default StudyMe
