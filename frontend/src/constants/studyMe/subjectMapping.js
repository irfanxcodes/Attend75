/**
 * StudyMe Subject Mapping Configuration
 *
 * Maps portal subject codes and abbreviations to StudyMe content.
 * Supports dual-key lookup: primary by portal code, fallback by abbreviation.
 *
 * To add a new subject:
 * 1. Add the portal code entry to SUBJECT_REGISTRY with status
 * 2. Add the abbreviation to ABBREVIATION_FALLBACK_MAP
 * 3. If content exists, create the subject file in constants/studyMe/subjects/
 *
 * Status values:
 * - 'available'    → Full StudyMe content exists
 * - 'coming_soon'  → Content is being prepared
 * - 'beta'         → Content exists but is in testing
 */

// Primary registry: portal code → StudyMe metadata
export const SUBJECT_REGISTRY = {
  // Financial Management
  'SHFI468': { studymeId: 'financial-management', status: 'available', requestCount: 0 },
  // Quantitative Business Methods
  'SHOM455': { studymeId: 'qbm', status: 'available', requestCount: 0 },
  // Cloud Computing Foundations and Applications
  'SHIS458': { studymeId: 'ccfa', status: 'available', requestCount: 0 },
  // Organizational Behavior
  'SHHR431': { studymeId: 'ob', status: 'available', requestCount: 0 },
  // Subjects without StudyMe content yet
  'SHIB460': { studymeId: null, status: 'coming_soon', requestCount: 12 },  // Business Laws
  'SHIS459': { studymeId: null, status: 'coming_soon', requestCount: 8 },   // Info Security & Monitoring
  'SHIS464': { studymeId: null, status: 'coming_soon', requestCount: 15 },  // Machine Learning
  'SHAE407': { studymeId: null, status: 'coming_soon', requestCount: 5 },   // IMIL (SWAYAM)
  'SHIS455': { studymeId: null, status: 'coming_soon', requestCount: 18 },  // Data Science with Python
  'SHOI421': { studymeId: null, status: 'coming_soon', requestCount: 10 },  // Database Management
  'SHOM456': { studymeId: null, status: 'coming_soon', requestCount: 6 },   // Business Process Re-Engineering
}

// Fallback: abbreviation → StudyMe ID (for when portal code isn't in registry)
export const ABBREVIATION_MAP = {
  'FM': 'financial-management',
  'QBM': 'qbm',
  'CCFA': 'ccfa',
  'OB': 'ob',
}

// Popular subjects shown to guests (not logged in)
export const POPULAR_SUBJECT_IDS = ['financial-management', 'qbm', 'ccfa', 'ob']

/**
 * Resolves which StudyMe subjects a student should see based on their portal attendance data.
 *
 * @param {Array} portalSubjects - subjects from attendance.subjects state
 * @param {boolean} isAuthenticated - whether user is logged in
 * @returns {{ available: string[], comingSoon: Array, allUnavailable: boolean }}
 */
export function resolveStudentSubjects(portalSubjects, isAuthenticated = false) {
  // Guest experience: show popular subjects
  if (!isAuthenticated) {
    return {
      available: POPULAR_SUBJECT_IDS,
      comingSoon: [],
      allUnavailable: false,
      isGuest: true,
    }
  }

  // Authenticated user with no subjects yet (still loading or error)
  if (!Array.isArray(portalSubjects) || portalSubjects.length === 0) {
    return {
      available: [],
      comingSoon: [],
      allUnavailable: true,
      isGuest: false,
    }
  }

  const available = []
  const comingSoon = []

  portalSubjects.forEach((subject) => {
    const code = String(subject?.id || '').trim().toUpperCase()
    const abbr = String(subject?.shortName || '').trim().toUpperCase()
    const name = String(subject?.name || '').trim()

    // Try primary lookup by code
    let entry = SUBJECT_REGISTRY[code]

    // Fallback: try abbreviation map
    if (!entry && abbr) {
      const studymeId = ABBREVIATION_MAP[abbr]
      if (studymeId) {
        entry = { studymeId, status: 'available', requestCount: 0 }
      }
    }

    if (entry && entry.studymeId && (entry.status === 'available' || entry.status === 'beta')) {
      available.push(entry.studymeId)
    } else {
      comingSoon.push({
        code,
        shortName: abbr,
        name,
        status: entry?.status || 'coming_soon',
        requestCount: entry?.requestCount || 0,
      })
    }
  })

  return {
    available: [...new Set(available)],
    comingSoon,
    allUnavailable: available.length === 0,
    isGuest: false,
  }
}
