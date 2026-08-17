/**
 * Handout API — course handout upload and syllabus retrieval.
 */

function getBase() {
  if (import.meta.env.DEV) return 'http://127.0.0.1:8000'
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim()
  if (configured) return configured
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') return 'https://api.attend75.xyz'
  return 'http://127.0.0.1:8000'
}

export async function uploadHandout({ token, subjectId, file }) {
  const form = new FormData()
  form.append('token', token)
  form.append('subject_id', subjectId)
  form.append('file', file)
  const res = await fetch(`${getBase()}/studyme/handouts/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Upload failed (${res.status})`)
  }
  return res.json()
}

export async function getHandoutStatus({ token, subjectId }) {
  const p = new URLSearchParams({ token })
  const res = await fetch(`${getBase()}/studyme/handouts/${encodeURIComponent(subjectId)}/status?${p}`)
  if (!res.ok) throw new Error(`Status check failed (${res.status})`)
  return res.json()
}

export async function getHandout({ token, subjectId }) {
  const p = new URLSearchParams({ token })
  const res = await fetch(`${getBase()}/studyme/handouts/${encodeURIComponent(subjectId)}?${p}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch handout (${res.status})`)
  return res.json()
}

/**
 * Create a handout without uploading a file.
 * mode='syllabus_paste': AI extracts structure from pasted syllabus text (async, poll status)
 * mode='manual': chapters list → instant synthetic handout (synchronous, returns status=ready)
 */
export async function createHandoutFromText({ token, subjectId, subjectName, mode, syllabusText = null, chapters = null }) {
  const res = await fetch(`${getBase()}/studyme/handouts/create-from-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      subject_id: subjectId,
      subject_name: subjectName,
      mode,
      syllabus_text: syllabusText,
      chapters,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to create handout (${res.status})`)
  }
  return res.json()
}
