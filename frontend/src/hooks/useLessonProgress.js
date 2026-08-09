/**
 * useLessonProgress — Auto-saves student progress to backend
 *
 * - Saves every 30 seconds while lesson is active
 * - Saves immediately on pause and on completion
 * - Restores progress on mount
 */

import { useCallback, useEffect, useRef } from 'react'
import { saveProgress, getProgress } from '../services/lessonApi'

const AUTOSAVE_INTERVAL_MS = 30_000

export function useLessonProgress({ token, lessonId, enabled = true }) {
  const intervalRef = useRef(null)
  const lastSavedRef = useRef(null)

  const save = useCallback(
    async ({ lastBlockIndex, completed, conceptsSeen, quizResults, doubtsAsked }) => {
      if (!token || !lessonId || !enabled) return
      try {
        await saveProgress({
          token,
          lessonId,
          lastBlockIndex,
          completed,
          conceptsSeen,
          quizResults,
          doubtsAsked,
        })
        lastSavedRef.current = Date.now()
      } catch (err) {
        // Progress save is best-effort — never crash the lesson
        console.warn('[useLessonProgress] Save failed:', err.message)
      }
    },
    [token, lessonId, enabled]
  )

  const restore = useCallback(async () => {
    if (!token || !lessonId || !enabled) return null
    try {
      return await getProgress({ token, lessonId })
    } catch {
      return null
    }
  }, [token, lessonId, enabled])

  const startAutosave = useCallback(
    (getState) => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        const state = getState()
        if (state) save(state)
      }, AUTOSAVE_INTERVAL_MS)
    },
    [save]
  )

  const stopAutosave = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAutosave()
  }, [stopAutosave])

  return { save, restore, startAutosave, stopAutosave }
}
