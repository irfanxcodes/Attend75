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

export async function trackStudyMeEvent({
  eventType,
  token = null,
  userName = null,
  subjectName = null,
  lessonName = null,
  topicName = null,
}) {
  const normalizedEventType = String(eventType || '').trim().toLowerCase()
  if (!normalizedEventType) {
    return null
  }

  const payload = {
    event_type: normalizedEventType,
    token: String(token || '').trim() || null,
    user_name: String(userName || '').trim() || null,
    subject_name: String(subjectName || '').trim() || null,
    lesson_name: String(lessonName || '').trim() || null,
    topic_name: String(topicName || '').trim() || null,
    event_date: new Date().toISOString().slice(0, 10),
  }

  const response = await fetch(`${API_BASE_URL}/studyme/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  })

  if (!response.ok) {
    throw new Error('Unable to track StudyMe event.')
  }

  return response.json().catch(() => null)
}

export function fireAndForgetStudyMeEvent(payload) {
  void trackStudyMeEvent(payload).catch(() => {})
}
