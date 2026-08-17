import { useMemo } from 'react'
import { signOutFirebaseUser } from '../services/firebaseAuth'
import { useAppDispatch, useAppState } from '../store/AppStateProvider'
import {
  clearAllCachedData,
  clearPersistedSession,
  persistAttendanceSnapshot,
  persistSession,
} from '../services/sessionPersistence'

function useAppStore() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const actions = useMemo(
    () => ({
      setAuthSession: (session) => {
        dispatch({ type: 'SET_AUTH_SESSION', payload: session })

        // Clear saved semester/program on fresh login so the portal's current selection takes priority
        // This prevents stale semester overrides when the college advances to a new semester
        window.localStorage.removeItem('attend75.selectedSemester')
        window.localStorage.removeItem('attend75.selectedProgram')

        // Persist guest session token for PWA session recovery
        persistSession(session)
      },
      setSessionSemesters: (semesters, selectedSemester, programs, selectedProgram) => {
        dispatch({
          type: 'SET_SESSION_SEMESTERS',
          payload: { semesters, selectedSemester, programs, selectedProgram },
        })
        // Re-persist so programs list survives page reload
        // Only update programs in persistence if we actually got some back
        const persistedPrograms = programs?.length > 0 ? programs : state.session.programs
        persistSession({
          token: state.session.token,
          rollNumber: state.user.rollNumber,
          name: state.user.name,
          portalName: state.user.portalName,
          authProvider: state.user.authProvider,
          semesters: semesters || [],
          selectedSemester: selectedSemester || null,
          programs: persistedPrograms || [],
          selectedProgram: selectedProgram !== undefined ? selectedProgram : (state.session.selectedProgram || null),
          programFull: state.session.programFull || null,
          programSn: state.session.programSn || null,
        })
      },
      setSelectedSemester: (semesterId) => dispatch({ type: 'SET_SELECTED_SEMESTER', payload: semesterId }),
      setSelectedProgram: (programId) => dispatch({ type: 'SET_SELECTED_PROGRAM', payload: programId }),
      logout: async () => {
        try {
          if (state.user.authProvider === 'firebase') {
            await signOutFirebaseUser()
          }
        } catch {
          // Ensure local logout still proceeds if Firebase sign-out fails.
        }

        // Unsubscribe push notifications for this device before clearing session.
        // This removes the device endpoint from the backend so this roll number
        // stops receiving push notifications after logout.
        try {
          const token = state.session?.token
          if (token && 'serviceWorker' in navigator && 'PushManager' in window) {
            // Use a timeout so a missing/unregistered service worker doesn't
            // block logout indefinitely (serviceWorker.ready never resolves in dev).
            const swReady = await Promise.race([
              navigator.serviceWorker.ready,
              new Promise((resolve) => setTimeout(resolve, 2000)),
            ])
            if (swReady) {
              const subscription = await swReady.pushManager.getSubscription()
              if (subscription) {
                const { unsubscribePush } = await import('../services/pushApi')
                await unsubscribePush({ token, endpoint: subscription.endpoint })
              }
            }
          }
        } catch {
          // Non-critical — local logout still proceeds even if push unsubscribe fails.
        }

        window.localStorage.removeItem('attend75.selectedSemester')
        window.localStorage.setItem(
          'attend75.authEvent',
          JSON.stringify({ type: 'logout', ts: Date.now() }),
        )

        // Clear persisted PWA session and cached data
        clearPersistedSession()
        clearAllCachedData()

        dispatch({ type: 'LOGOUT' })
      },
      setAttendanceData: (attendanceData) => {
        dispatch({ type: 'SET_ATTENDANCE_DATA', payload: attendanceData })

        // Cache attendance snapshot for instant display on next PWA open
        persistAttendanceSnapshot(attendanceData)
      },
      setSelectedTarget: (target) => dispatch({ type: 'SET_SELECTED_TARGET', payload: target }),
      setLoading: (isLoading) => dispatch({ type: 'SET_LOADING', payload: isLoading }),
      setError: (errorMessage) => dispatch({ type: 'SET_ERROR', payload: errorMessage }),
    }),
    [dispatch, state.user.authProvider, state.session],
  )

  return {
    state,
    actions,
  }
}

export default useAppStore
