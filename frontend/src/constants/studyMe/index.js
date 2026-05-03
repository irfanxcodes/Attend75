import { CCFA_SUBJECT } from './subjects/ccfa'
import { FINANCIAL_MANAGEMENT_SUBJECT } from './subjects/fm'

export const STUDYME_SUBJECTS = [
  FINANCIAL_MANAGEMENT_SUBJECT,
  CCFA_SUBJECT,
]

export function getStudySubjectById(subjectId) {
  return STUDYME_SUBJECTS.find((subject) => subject.id === subjectId) || null
}

export function getStudyLessonById(subjectId, lessonId) {
  const subject = getStudySubjectById(subjectId)
  if (!subject) {
    return null
  }

  return subject.lessons.find((lesson) => lesson.id === lessonId) || null
}
