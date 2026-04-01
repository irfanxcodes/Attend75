import { useMemo } from 'react'
import { signOutFirebaseUser } from '../services/firebaseAuth'
import { useAppDispatch, useAppState } from '../store/AppStateProvider'

function useAppStore() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const actions = useMemo(
    () => ({
      setAuthSession: (session) => dispatch({ type: 'SET_AUTH_SESSION', payload: session }),
      setSessionSemesters: (semesters, selectedSemester) =>
        dispatch({
          type: 'SET_SESSION_SEMESTERS',
          payload: { semesters, selectedSemester },
        }),
      setSelectedSemester: (semesterId) => dispatch({ type: 'SET_SELECTED_SEMESTER', payload: semesterId }),
      logout: async () => {
        try {
          if (state.user.authProvider === 'firebase') {
            await signOutFirebaseUser()
          }
        } catch {
          // Ensure local logout still proceeds if Firebase sign-out fails.
        } finally {
          window.localStorage.removeItem('attend75.selectedSemester')
          window.localStorage.setItem(
            'attend75.authEvent',
            JSON.stringify({ type: 'logout', ts: Date.now() }),
          )
          dispatch({ type: 'LOGOUT' })
        }
      },
      setAttendanceData: (attendanceData) => dispatch({ type: 'SET_ATTENDANCE_DATA', payload: attendanceData }),
      setSelectedTarget: (target) => dispatch({ type: 'SET_SELECTED_TARGET', payload: target }),
      setLoading: (isLoading) => dispatch({ type: 'SET_LOADING', payload: isLoading }),
      setError: (errorMessage) => dispatch({ type: 'SET_ERROR', payload: errorMessage }),
    }),
    [dispatch, state.user.authProvider],
  )

  return {
    state,
    actions,
  }
}

export default useAppStore
