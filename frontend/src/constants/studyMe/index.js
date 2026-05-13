import { CCFA_SUBJECT } from './subjects/ccfa'
import { FINANCIAL_MANAGEMENT_SUBJECT } from './subjects/fm'
import { ORGANIZATIONAL_BEHAVIOR_SUBJECT } from './subjects/ob'
import { QBM_SUBJECT } from './subjects/qbm'

export const STUDYME_SUBJECTS = [
  FINANCIAL_MANAGEMENT_SUBJECT,
  QBM_SUBJECT,
  CCFA_SUBJECT,
  ORGANIZATIONAL_BEHAVIOR_SUBJECT,
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
