const STUDY_PROGRESS_STORAGE_KEY = 'attend75.studyme.progress.v1'

const DEFAULT_LESSON_STATE = {
  status: 'not_started',
  lastOpenedAt: null,
  completedAt: null,
}

function normalizeSubjects(subjects) {
  if (!subjects || typeof subjects !== 'object') {
    return {}
  }

  return Object.entries(subjects).reduce((accumulator, [subjectId, subjectState]) => {
    if (!subjectState || typeof subjectState !== 'object') {
      return accumulator
    }

    const lessons = subjectState.lessons && typeof subjectState.lessons === 'object' ? { ...subjectState.lessons } : {}

    accumulator[subjectId] = {
      lessons,
      lastOpenedLessonId: subjectState.lastOpenedLessonId || null,
    }

    return accumulator
  }, {})
}

function readProgressState() {
  try {
    const raw = window.localStorage.getItem(STUDY_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return { subjects: {} }
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return { subjects: {} }
    }

    return {
      subjects: normalizeSubjects(parsed.subjects),
    }
  } catch {
    return { subjects: {} }
  }
}

function writeProgressState(state) {
  try {
    window.localStorage.setItem(STUDY_PROGRESS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Keep UX responsive if localStorage is not writable.
  }
}

function ensureSubjectState(state, subjectId) {
  if (!state.subjects[subjectId]) {
    state.subjects[subjectId] = {
      lessons: {},
      lastOpenedLessonId: null,
    }
  }

  return state.subjects[subjectId]
}

function ensureLessonState(subjectState, lessonId) {
  if (!subjectState.lessons[lessonId]) {
    subjectState.lessons[lessonId] = { ...DEFAULT_LESSON_STATE }
  }

  return subjectState.lessons[lessonId]
}

export function getLessonState(subjectId, lessonId) {
  const state = readProgressState()
  const subjectState = state.subjects?.[subjectId]
  if (!subjectState) {
    return { ...DEFAULT_LESSON_STATE }
  }

  const lessonState = subjectState.lessons?.[lessonId]
  if (!lessonState) {
    return { ...DEFAULT_LESSON_STATE }
  }

  return {
    status: lessonState.status || 'not_started',
    lastOpenedAt: lessonState.lastOpenedAt || null,
    completedAt: lessonState.completedAt || null,
  }
}

export function getSubjectProgress(subjectId, lessonIds = []) {
  const state = readProgressState()
  const subjectState = state.subjects?.[subjectId] || { lessons: {}, lastOpenedLessonId: null }

  const progressByLessonId = lessonIds.reduce((accumulator, lessonId) => {
    accumulator[lessonId] = getLessonState(subjectId, lessonId)
    return accumulator
  }, {})

  const completedCount = lessonIds.filter((lessonId) => progressByLessonId[lessonId]?.status === 'completed').length
  const inProgressCount = lessonIds.filter((lessonId) => progressByLessonId[lessonId]?.status === 'in_progress').length

  return {
    progressByLessonId,
    completedCount,
    inProgressCount,
    lastOpenedLessonId: subjectState.lastOpenedLessonId || null,
  }
}

export function markLessonOpened(subjectId, lessonId) {
  const state = readProgressState()
  const subjectState = ensureSubjectState(state, subjectId)
  const lessonState = ensureLessonState(subjectState, lessonId)

  if (lessonState.status === 'not_started') {
    lessonState.status = 'in_progress'
  }
  lessonState.lastOpenedAt = Date.now()
  subjectState.lastOpenedLessonId = lessonId

  writeProgressState(state)
  return getLessonState(subjectId, lessonId)
}

export function setLessonStatus(subjectId, lessonId, status) {
  const normalizedStatus = ['not_started', 'in_progress', 'completed'].includes(status) ? status : 'not_started'

  const state = readProgressState()
  const subjectState = ensureSubjectState(state, subjectId)
  const lessonState = ensureLessonState(subjectState, lessonId)

  lessonState.status = normalizedStatus
  if (normalizedStatus === 'completed') {
    lessonState.completedAt = Date.now()
  } else {
    lessonState.completedAt = null
  }
  lessonState.lastOpenedAt = Date.now()
  subjectState.lastOpenedLessonId = lessonId

  writeProgressState(state)
  return getLessonState(subjectId, lessonId)
}
