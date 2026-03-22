import { useMemo } from 'react'
import { useAppDispatch, useAppState } from '../store/AppStateProvider'

function useAppStore() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const actions = useMemo(
    () => ({
      setAuthSession: (session) => dispatch({ type: 'SET_AUTH_SESSION', payload: session }),
      logout: () => dispatch({ type: 'LOGOUT' }),
      setAttendanceData: (attendanceData) => dispatch({ type: 'SET_ATTENDANCE_DATA', payload: attendanceData }),
      setSelectedTarget: (target) => dispatch({ type: 'SET_SELECTED_TARGET', payload: target }),
      setLoading: (isLoading) => dispatch({ type: 'SET_LOADING', payload: isLoading }),
      setError: (errorMessage) => dispatch({ type: 'SET_ERROR', payload: errorMessage }),
    }),
    [dispatch],
  )

  return {
    state,
    actions,
  }
}

export default useAppStore
