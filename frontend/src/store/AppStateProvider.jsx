import { createContext, useContext, useMemo, useReducer } from 'react'
import { attendanceSeedData, userSeedData } from '../constants/dummyData'
import {
  calculateOverallAttendance,
  enrichSubjectsWithPercentage,
} from '../utils/calculations'

const AppStateContext = createContext(null)
const AppDispatchContext = createContext(null)

function buildAttendanceState(rawAttendance = attendanceSeedData) {
  const subjects = enrichSubjectsWithPercentage(rawAttendance.subjects || [])
  const overall = calculateOverallAttendance(subjects)

  return {
    subjects,
    overallPercentage: overall.percentage,
    feasibility: rawAttendance.feasibility || null,
  }
}

const initialState = {
  user: {
    id: userSeedData.id,
    name: userSeedData.name,
    portalName: userSeedData.name,
    email: null,
    rollNumber: userSeedData.id,
    authProvider: 'guest',
    isAuthenticated: false,
  },
  session: {
    token: null,
    semesters: [],
    selectedSemester: null,
  },
  attendance: buildAttendanceState(attendanceSeedData),
  selectedTarget: 75,
  ui: {
    isLoading: false,
    error: '',
  },
}

function appStateReducer(state, action) {
  switch (action.type) {
    case 'SET_AUTH_SESSION':
      return {
        ...state,
        user: {
          ...state.user,
          id: action.payload.id || state.user.id,
          name: action.payload.name || state.user.name,
          portalName: action.payload.portalName || action.payload.name || state.user.portalName,
          email: action.payload.email || null,
          rollNumber: action.payload.rollNumber || action.payload.id || state.user.rollNumber,
          authProvider: action.payload.authProvider || state.user.authProvider || 'guest',
          isAuthenticated: true,
        },
        session: {
          token: action.payload.token,
          semesters: action.payload.semesters || [],
          selectedSemester: action.payload.selectedSemester || null,
        },
      }

    case 'LOGOUT':
      return {
        ...state,
        user: {
          ...state.user,
          email: null,
          authProvider: 'guest',
          isAuthenticated: false,
        },
        session: {
          token: null,
          semesters: [],
          selectedSemester: null,
        },
      }

    case 'SET_SESSION_SEMESTERS':
      return {
        ...state,
        session: {
          ...state.session,
          semesters: action.payload.semesters || [],
          selectedSemester: action.payload.selectedSemester || null,
        },
      }

    case 'SET_SELECTED_SEMESTER':
      return {
        ...state,
        session: {
          ...state.session,
          selectedSemester: action.payload,
        },
      }

    case 'SET_ATTENDANCE_DATA':
      return {
        ...state,
        attendance: buildAttendanceState(action.payload),
      }

    case 'SET_SELECTED_TARGET':
      return {
        ...state,
        selectedTarget: action.payload,
      }

    case 'SET_LOADING':
      return {
        ...state,
        ui: {
          ...state.ui,
          isLoading: action.payload,
        },
      }

    case 'SET_ERROR':
      return {
        ...state,
        ui: {
          ...state.ui,
          error: action.payload,
        },
      }

    default:
      return state
  }
}

function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(appStateReducer, initialState)

  const value = useMemo(() => state, [state])

  return (
    <AppStateContext.Provider value={value}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  )
}

function useAppState() {
  const context = useContext(AppStateContext)

  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider')
  }

  return context
}

function useAppDispatch() {
  const context = useContext(AppDispatchContext)

  if (!context) {
    throw new Error('useAppDispatch must be used within AppStateProvider')
  }

  return context
}

export { AppStateProvider, useAppDispatch, useAppState }
