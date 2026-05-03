const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()

function resolveApiBaseUrl() {
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8000'
  }

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl
  }

  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return '/api'
  }

  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

export class StudyMeImportanceError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'StudyMeImportanceError'
    this.status = status
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload?.status === 'error') {
    throw new StudyMeImportanceError(payload?.message || 'StudyMe importance request failed.', response.status)
  }

  return payload?.data || {}
}

async function requestStudyMeImportance(url, body) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    return parseResponse(response)
  } catch (error) {
    if (error instanceof StudyMeImportanceError) {
      throw error
    }

    throw new StudyMeImportanceError(`Unable to reach StudyMe importance service at ${url}.`)
  }
}

export async function fetchStudyMeImportance({ token, subjectId, lessonIds = [], topicIds = [] }) {
  return requestStudyMeImportance(`${API_BASE_URL}/studyme/importance/query`, {
    token: String(token || '').trim(),
    subject_id: String(subjectId || '').trim(),
    lesson_ids: Array.isArray(lessonIds) ? lessonIds : [],
    topic_ids: Array.isArray(topicIds) ? topicIds : [],
  })
}

export async function toggleStudyMeLessonImportant({ token, subjectId, subjectName, lessonId, lessonName }) {
  return requestStudyMeImportance(`${API_BASE_URL}/studyme/importance/lesson/toggle`, {
    token: String(token || '').trim(),
    subject_id: String(subjectId || '').trim(),
    subject_name: String(subjectName || '').trim() || null,
    lesson_id: String(lessonId || '').trim(),
    lesson_name: String(lessonName || '').trim() || null,
  })
}

export async function toggleStudyMeTopicImportant({ token, subjectId, subjectName, lessonId, lessonName, topicId, topicName }) {
  return requestStudyMeImportance(`${API_BASE_URL}/studyme/importance/topic/toggle`, {
    token: String(token || '').trim(),
    subject_id: String(subjectId || '').trim(),
    subject_name: String(subjectName || '').trim() || null,
    lesson_id: String(lessonId || '').trim(),
    lesson_name: String(lessonName || '').trim() || null,
    topic_id: String(topicId || '').trim(),
    topic_name: String(topicName || '').trim() || null,
  })
}
