import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import StudyBackButton from '../components/common/StudyBackButton'
import YoutubeMethodCard from '../components/studyme/YoutubeMethodCard'
import { getStudyLessonById, getStudySubjectById } from '../constants/studyMe/content'
import { getLessonYoutubeLearning } from '../constants/studyMe/youtubeLearning'

function StudyLessonYoutube() {
  const { subjectId, lessonId } = useParams()
  const subject = getStudySubjectById(subjectId)
  const lesson = getStudyLessonById(subjectId, lessonId)
  const learningConfig = useMemo(() => getLessonYoutubeLearning(subjectId, lessonId), [lessonId, subjectId])

  if (!subject || !lesson) {
    return (
      <section className="space-y-3 pb-2 sm:space-y-4">
        <header className="rounded-3xl bg-[#4F487A] p-4 ring-1 ring-white/10 sm:p-5">
          <div className="flex items-center gap-2.5">
            <StudyBackButton fallbackTo={subjectId ? `/study/${subjectId}` : '/study'} label="Go back" iconOnly />
            <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Learn with YouTube</p>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#F4F1FF] sm:text-3xl">Lesson not found</h1>
        </header>
      </section>
    )
  }

  if (!learningConfig) {
    return (
      <section className="space-y-3 pb-2 sm:space-y-4">
        <header className="rounded-3xl bg-[#4F487A] p-4 ring-1 ring-white/10 sm:p-5">
          <div className="flex items-center gap-2.5">
            <StudyBackButton fallbackTo={`/study/${subject.id}/${lesson.id}`} label="Go back" iconOnly />
            <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Learn with YouTube</p>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#F4F1FF] sm:text-3xl">No YouTube lessons yet</h1>
          <p className="mt-1 text-xs text-[#CFC5E8]">We have not added YouTube links for this lesson.</p>
        </header>
      </section>
    )
  }

  return (
    <section className="space-y-3 pb-4 sm:space-y-4">
      <header className="rounded-3xl bg-[#4F487A] p-4 ring-1 ring-white/10 sm:p-5">
        <div className="flex items-center gap-2.5">
          <StudyBackButton fallbackTo={`/study/${subject.id}/${lesson.id}`} label="Go back" iconOnly />
          <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Learn with YouTube</p>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-[#F4F1FF] sm:text-3xl">{learningConfig.title}</h1>
        <p className="mt-1 text-xs text-[#CFC5E8]">Lesson {lesson.lessonNumber} - {lesson.title}</p>
        {learningConfig.description ? (
          <p className="mt-2 text-sm text-[#D8D3E8]">{learningConfig.description}</p>
        ) : null}
      </header>

      <section className="space-y-3 rounded-3xl bg-[#4F487A] p-3 shadow-md ring-1 ring-white/5 sm:p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {learningConfig.methods.map((method) => (
            <YoutubeMethodCard key={method.id} method={method} />
          ))}
        </div>
      </section>
    </section>
  )
}

export default StudyLessonYoutube
