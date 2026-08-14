/**
 * Lesson API — AI Lesson Player
 * All API calls for the lesson player feature.
 */

// Match the same base URL resolution as attendanceApi.js
function getBase() {
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8000'
  }
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim()
  if (configured) return configured
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return 'https://api.attend75.xyz'
  }
  return 'http://127.0.0.1:8000'
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadChapterPdf({ token, subjectId, chapterKey, chapterTitle, file, skipFilenameCheck = false }) {
  const formData = new FormData()
  formData.append('token', token)
  formData.append('subject_id', subjectId)
  formData.append('chapter_key', chapterKey)
  formData.append('chapter_title', chapterTitle || '')
  if (skipFilenameCheck) formData.append('skip_filename_check', 'true')
  formData.append('file', file)

  const res = await fetch(`${getBase()}/studyme/chapters/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Upload failed (${res.status})`)
  }
  return res.json()
}

// ── Status Polling ─────────────────────────────────────────────────────────

export async function getChapterStatus({ token, subjectId, chapterKey }) {
  const params = new URLSearchParams({ token, subject_id: subjectId })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(chapterKey)}/status?${params}`
  )
  if (!res.ok) throw new Error(`Status check failed (${res.status})`)
  return res.json()
}

// ── Available Chapters ─────────────────────────────────────────────────────

export async function getAvailableChapters({ token, subjectId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(subjectId)}/available?${params}`
  )
  if (!res.ok) throw new Error(`Failed to fetch available chapters (${res.status})`)
  return res.json()
}

// ── Delete / Restore Chapter ───────────────────────────────────────────────

export async function deleteChapter({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}?${params}`,
    { method: 'DELETE' }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Delete failed (${res.status})`)
  }
  return res.json()
}

export async function restoreChapter({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}/restore?${params}`,
    { method: 'POST' }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Restore failed (${res.status})`)
  }
  return res.json()
}

// ── Lesson Script ──────────────────────────────────────────────────────────

export async function getLessonScript({ token, lessonId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/lessons/${encodeURIComponent(lessonId)}/script?${params}`
  )
  if (!res.ok) throw new Error(`Failed to fetch lesson script (${res.status})`)
  return res.json()
}

// ── Doubt ──────────────────────────────────────────────────────────────────

export async function askDoubt({ token, lessonId, question, currentBlockIndex = 0 }) {
  const res = await fetch(
    `${getBase()}/studyme/lessons/${encodeURIComponent(lessonId)}/doubt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        question,
        current_block_index: currentBlockIndex,
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Doubt request failed (${res.status})`)
  }
  return res.json()
}

// ── Progress ───────────────────────────────────────────────────────────────

export async function saveProgress({
  token,
  lessonId,
  lastBlockIndex,
  completed = false,
  conceptsSeen = [],
  quizResults = {},
  doubtsAsked = 0,
}) {
  const res = await fetch(
    `${getBase()}/studyme/lessons/${encodeURIComponent(lessonId)}/progress`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        last_block_index: lastBlockIndex,
        completed,
        concepts_seen: conceptsSeen,
        quiz_results: quizResults,
        doubts_asked: doubtsAsked,
      }),
    }
  )
  if (!res.ok) throw new Error(`Save progress failed (${res.status})`)
  return res.json()
}

export async function getProgress({ token, lessonId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/lessons/${encodeURIComponent(lessonId)}/progress?${params}`
  )
  if (!res.ok) throw new Error(`Get progress failed (${res.status})`)
  return res.json()
}

// ── TTS Audio ──────────────────────────────────────────────────────────────

export function getBlockAudioUrl(blockId, token) {
  const base = getBase()
  return `${base}/studyme/blocks/${encodeURIComponent(blockId)}/audio?token=${encodeURIComponent(token)}`
}

export async function getLessonAudioStatus({ token, lessonId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/lessons/${encodeURIComponent(lessonId)}/audio-status?${params}`
  )
  if (!res.ok) return { audio_ready: false, ready_block_ids: [] }
  return res.json()
}

// ── StudyMe 2.0 Workspace APIs ─────────────────────────────────────────────

/**
 * Get ordered curriculum (concept list) for a chapter.
 * Includes student mastery status per concept.
 * @param {string} uploadId - chapter_uploads UUID
 */
export async function getChapterCurriculum({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}/curriculum?${params}`
  )
  if (!res.ok) throw new Error(`Failed to fetch curriculum (${res.status})`)
  return res.json()
}

/**
 * Get full concept data including Canvas sections.
 * @param {string} conceptId - ai_concepts UUID
 */
export async function getConcept({ token, conceptId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/concepts/${encodeURIComponent(conceptId)}?${params}`
  )
  if (!res.ok) throw new Error(`Failed to fetch concept (${res.status})`)
  return res.json()
}

/**
 * Update student's mastery state for a concept.
 */
export async function updateConceptProgress({ token, conceptId, status, attempts = 0, correctAttempts = 0 }) {
  const res = await fetch(
    `${getBase()}/studyme/concepts/${encodeURIComponent(conceptId)}/progress`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        status,
        attempts,
        correct_attempts: correctAttempts,
      }),
    }
  )
  if (!res.ok) throw new Error(`Concept progress update failed (${res.status})`)
  return res.json()
}

/**
 * Ask the persistent AI tutor.
 * Superset of askDoubt — supports conversation history and tutor modes.
 * @param {string} mode - 'answer' | 'socratic' | 'hint' | 'quiz'
 */
export async function askTutor({
  token,
  question,
  scriptId = null,
  conceptId = null,
  uploadId = null,
  currentBlockIndex = 0,
  conversation = [],
  mode = 'answer',
}) {
  const res = await fetch(`${getBase()}/studyme/tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      question,
      script_id: scriptId,
      concept_id: conceptId,
      upload_id: uploadId,
      current_block_index: currentBlockIndex,
      conversation,
      mode,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Tutor request failed (${res.status})`)
  }
  return res.json()
}

/**
 * Get workspace context for a lesson (upload_id + chapter metadata).
 * Used by WorkspacePlayer to resolve upload_id needed for /curriculum.
 */
export async function getWorkspaceContext({ token, lessonId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/lessons/${encodeURIComponent(lessonId)}/workspace-context?${params}`
  )
  if (!res.ok) throw new Error(`Workspace context failed (${res.status})`)
  return res.json()
}

/**
 * Get the slide/page source map for a chapter.
 * Used by the Source viewer in WorkspacePlayer.
 */
export async function getSourceMap({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}/source-map?${params}`
  )
  if (!res.ok) throw new Error(`Source map failed (${res.status})`)
  return res.json()
}

// ── Adaptive Quiz APIs (Phase 5) ───────────────────────────────────────────

/**
 * Generate a fresh quiz question for a concept.
 */
export async function generateQuizQuestion({ token, conceptId, existingQuestions = [] }) {
  const res = await fetch(`${getBase()}/studyme/quiz/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      concept_id: conceptId,
      existing_questions: existingQuestions,
    }),
  })
  if (!res.ok) throw new Error(`Quiz generation failed (${res.status})`)
  return res.json()
}

/**
 * Evaluate a student's answer.
 * Returns {verdict, is_correct, feedback, hint, model_used}
 */
export async function evaluateQuizAnswer({ token, conceptId, question, studentAnswer, expectedAnswer = '' }) {
  const res = await fetch(`${getBase()}/studyme/quiz/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      concept_id: conceptId,
      question,
      student_answer: studentAnswer,
      expected_answer: expectedAnswer,
    }),
  })
  if (!res.ok) throw new Error(`Quiz evaluation failed (${res.status})`)
  return res.json()
}

/**
 * Get contextual resources for a concept (Phase 7).
 * Returns YouTube search queries and source document references.
 * Lazy — only called when student opens the Resources tab.
 */
export async function getConceptResources({ token, conceptId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/concepts/${encodeURIComponent(conceptId)}/resources?${params}`
  )
  if (!res.ok) throw new Error(`Failed to fetch resources (${res.status})`)
  return res.json()
}

/**
 * Get the base URL for local slide images (dev) or use the URL from the slides list (prod/R2).
 * In dev, images are served from the FastAPI static mount at /slide-images/{upload_id}/{n}
 * In prod (R2), the image_url in the slides list is already a full https:// URL.
 */
export function resolveSlideImageUrl(imageUrl, token) {
  if (!imageUrl) return ''
  // Already a full URL (R2 production)
  if (imageUrl.startsWith('http')) {
    // In dev mode, remap production R2 slide URLs to the local static mount
    if (import.meta.env.DEV && imageUrl.includes('slides.attend75.xyz')) {
      // https://slides.attend75.xyz/slides/{upload_id}/slide_NNN.webp
      // → http://127.0.0.1:8000/slide-images/{upload_id}/slide_NNN.webp
      const match = imageUrl.match(/slides\/([^/]+\/slide_\d+\.webp)/)
      if (match) return `${getBase()}/slide-images/${match[1]}`
    }
    return imageUrl
  }
  // Local dev path — prepend API base and append token for auth via query param
  return `${getBase()}${imageUrl}?token=${encodeURIComponent(token)}`
}

/**
 * Get all slides for a chapter with image URLs and text previews.
 * Returns {total, slides_ready, slides: [{slide_number, image_url, title, body_preview, concepts}]}
 */
export async function getSlidesList({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}/slides?${params}`
  )
  if (!res.ok) throw new Error(`Slides list failed (${res.status})`)
  return res.json()
}

/**
 * Get the AI teaching action sequence for a slide.
 * Generated once on first access, then cached in DB — zero LLM cost after that.
 * Returns {actions: [{type, text?, coords?, fallback_region?, duration?}], cached}
 */
export async function getTeachingScript({ token, uploadId, slideNo }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}/slides/${slideNo}/teaching-script?${params}`
  )
  if (!res.ok) throw new Error(`Teaching script failed (${res.status})`)
  return res.json()
}

/**
 * Submit thumbs up / thumbs down feedback on an AI teaching script.
 * Fire-and-forget — never throws, failure is silently swallowed.
 *
 * @param {string}      uploadId
 * @param {number}      slideNo
 * @param {1|-1}        rating   1 = thumbs up, -1 = thumbs down
 * @param {string|null} reason   "too_fast" | "wrong_content" | "unclear" | "off_topic" | "other"
 */
export async function submitSlideFeedback({ token, uploadId, slideNo, rating, reason = null }) {
  try {
    await fetch(
      `${getBase()}/studyme/slides/${encodeURIComponent(uploadId)}/${slideNo}/feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, reason }),
      },
    )
  } catch {
    // Feedback is optional — never break the player on network errors
  }
}

/**
 * Get storage usage stats (monitoring).
 */
export async function getSlideStats({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}/slides/stats?${params}`
  )
  if (!res.ok) return null
  return res.json()
}

// ── Review System APIs (Phase 8) ───────────────────────────────────────────

/**
 * Get concepts due for review in a chapter.
 * Returns [] if nothing is due — never throws 404.
 */
export async function getReviewQueue({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/chapters/${encodeURIComponent(uploadId)}/review-queue?${params}`
  )
  if (!res.ok) throw new Error(`Review queue fetch failed (${res.status})`)
  return res.json()
}

/**
 * Mark a concept review session as complete.
 * score = correct_answers / total_answers (0.0 to 1.0)
 * Returns {saved, status, next_review_at}
 */
export async function completeReview({ token, conceptId, score }) {
  const res = await fetch(
    `${getBase()}/studyme/concepts/${encodeURIComponent(conceptId)}/review-complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, score }),
    }
  )
  if (!res.ok) throw new Error(`Review complete failed (${res.status})`)
  return res.json()
}

// ── Notes Solver APIs ──────────────────────────────────────────────────────

export async function uploadNotes({ token, subjectId, chapterKey, title, file }) {
  const formData = new FormData()
  formData.append('token', token)
  formData.append('subject_id', subjectId)
  formData.append('chapter_key', chapterKey || '')
  formData.append('title', title || '')
  formData.append('file', file)
  const res = await fetch(`${getBase()}/studyme/notes/upload`, { method: 'POST', body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Upload failed (${res.status})`)
  }
  return res.json()
}

export async function getNotesStatus({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(`${getBase()}/studyme/notes/${encodeURIComponent(uploadId)}/status?${params}`)
  if (!res.ok) throw new Error(`Notes status check failed (${res.status})`)
  return res.json()
}

export async function getNotesForSubject({ token, subjectId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(`${getBase()}/studyme/notes/${encodeURIComponent(subjectId)}/available?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch notes (${res.status})`)
  return res.json()
}

export async function getNotesProblemList({ token, problemSetId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(`${getBase()}/studyme/notes/problem-sets/${encodeURIComponent(problemSetId)}/problems?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch problems (${res.status})`)
  return res.json()
}

export async function getNotesProblem({ token, problemId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(`${getBase()}/studyme/notes/problems/${encodeURIComponent(problemId)}/steps?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch problem (${res.status})`)
  return res.json()
}

export async function deleteNotes({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/notes/${encodeURIComponent(uploadId)}?${params}`,
    { method: 'DELETE' }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Delete failed (${res.status})`)
  }
  return res.json()
}

export async function restoreNotes({ token, uploadId }) {
  const params = new URLSearchParams({ token })
  const res = await fetch(
    `${getBase()}/studyme/notes/${encodeURIComponent(uploadId)}/restore?${params}`,
    { method: 'POST' }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Restore failed (${res.status})`)
  }
  return res.json()
}
