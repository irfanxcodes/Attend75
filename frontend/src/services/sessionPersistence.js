/**
 * Session Persistence Service
 *
 * Persists the opaque session token and minimal user metadata
 * so that guest users remain logged in when the PWA is reopened.
 *
 * Security notes:
 * - We NEVER store passwords or credentials locally.
 * - Only the opaque session token is stored (expires server-side in 12h).
 * - Token validation is always done server-side via POST /session/status.
 * - Firebase users don't need this — Firebase SDK handles its own persistence.
 */

const SESSION_KEY = 'attend75.persistedSession'
const ATTENDANCE_CACHE_KEY = 'attend75.cachedAttendance'
const MARKS_CACHE_KEY = 'attend75.cachedMarks'

// Session expires client-side after 12 hours (matches server TTL)
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * Persist a guest session after successful login.
 * Only stores the token + non-sensitive user info.
 */
export function persistSession({ token, rollNumber, name, portalName, authProvider, semesters, selectedSemester, programs, selectedProgram, programFull, programSn }) {
  if (!token || authProvider === 'firebase') {
    // Firebase sessions are handled by Firebase SDK — no need to persist here.
    return
  }

  const payload = {
    token,
    rollNumber: rollNumber || '',
    name: name || '',
    portalName: portalName || '',
    authProvider: authProvider || 'guest',
    semesters: semesters || [],
    selectedSemester: selectedSemester || null,
    programs: programs || [],
    selectedProgram: selectedProgram || null,
    programFull: programFull || null,
    programSn: programSn || null,
    savedAt: Date.now(),
  }

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  } catch {
    // Storage full or disabled — silent fail, user just won't have persistence
  }
}

/**
 * Load a previously persisted guest session.
 * Returns null if no session exists or if it has expired client-side.
 */
export function loadPersistedSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const payload = JSON.parse(raw)
    if (!payload?.token || !payload?.savedAt) return null

    // Check client-side expiry
    const elapsed = Date.now() - payload.savedAt
    if (elapsed > SESSION_MAX_AGE_MS) {
      clearPersistedSession()
      return null
    }

    return {
      token: payload.token,
      rollNumber: payload.rollNumber || '',
      name: payload.name || '',
      portalName: payload.portalName || '',
      authProvider: payload.authProvider || 'guest',
      semesters: payload.semesters || [],
      selectedSemester: payload.selectedSemester || null,
      programs: payload.programs || [],
      selectedProgram: payload.selectedProgram || null,
      programFull: payload.programFull || null,
      programSn: payload.programSn || null,
    }
  } catch {
    clearPersistedSession()
    return null
  }
}

/**
 * Clear persisted session data.
 * Called on logout or when session is confirmed expired by server.
 */
export function clearPersistedSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Cache attendance data snapshot for instant display on next app open.
 * This is non-sensitive aggregate data (subject names, percentages).
 */
export function persistAttendanceSnapshot(attendanceData) {
  if (!attendanceData) return

  try {
    const payload = {
      subjects: attendanceData.subjects || [],
      feasibility: attendanceData.feasibility || null,
      cachedAt: Date.now(),
    }
    window.localStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Storage full — silent fail
  }
}

/**
 * Load cached attendance snapshot.
 * Returns null if no cache exists.
 * Includes `cachedAt` timestamp for UI to show "last updated" info.
 */
export function loadAttendanceSnapshot() {
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_CACHE_KEY)
    if (!raw) return null

    const payload = JSON.parse(raw)
    if (!payload?.subjects) return null

    return {
      subjects: payload.subjects,
      feasibility: payload.feasibility || null,
      cachedAt: payload.cachedAt || null,
    }
  } catch {
    return null
  }
}

/**
 * Clear cached attendance data.
 * Called on logout.
 */
export function clearAttendanceSnapshot() {
  try {
    window.localStorage.removeItem(ATTENDANCE_CACHE_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Cache marks data snapshot for offline viewing.
 */
export function persistMarksSnapshot(marksData) {
  if (!marksData) return

  try {
    const payload = {
      subjects: marksData.subjects || [],
      semesters: marksData.semesters || [],
      selectedSemester: marksData.selected_semester || marksData.selectedSemester || null,
      cachedAt: Date.now(),
    }
    window.localStorage.setItem(MARKS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Storage full — silent fail
  }
}

/**
 * Load cached marks snapshot.
 * Returns null if no cache exists.
 */
export function loadMarksSnapshot() {
  try {
    const raw = window.localStorage.getItem(MARKS_CACHE_KEY)
    if (!raw) return null

    const payload = JSON.parse(raw)
    if (!payload?.subjects) return null

    return {
      subjects: payload.subjects,
      semesters: payload.semesters || [],
      selectedSemester: payload.selectedSemester || null,
      cachedAt: payload.cachedAt || null,
    }
  } catch {
    return null
  }
}

/**
 * Clear all cached data (attendance + marks + timetable).
 * Called on logout.
 */
export function clearAllCachedData() {
  clearAttendanceSnapshot()
  try {
    window.localStorage.removeItem(MARKS_CACHE_KEY)
  } catch {
    // Ignore
  }
  // Clear timetable from sessionStorage — prevents next user on same browser
  // from seeing the previous user's timetable
  try {
    sessionStorage.removeItem('attend75_timetable_cache')
  } catch {
    // Ignore
  }
}

/**
 * Get a human-readable "time ago" string from a timestamp.
 * Used for "Last updated X ago" display.
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return null

  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 30) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
