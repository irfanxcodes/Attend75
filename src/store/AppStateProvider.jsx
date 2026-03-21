import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { attendanceSeedData, userSeedData } from '../constants/dummyData'
import {
  calculateOverallAttendance,
  enrichSubjectsWithPercentage,
  mapHistoryTrend,
} from '../utils/calculations'

const AppStateContext = createContext(null)
const AppDispatchContext = createContext(null)

function getInitialTheme() {
  const savedTheme = localStorage.getItem('attend75-theme')

  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function buildAttendanceState(rawAttendance = attendanceSeedData) {
  const subjects = enrichSubjectsWithPercentage(rawAttendance.subjects || [])
  const overall = calculateOverallAttendance(subjects)

  return {
    subjects,
    history: mapHistoryTrend(rawAttendance.history || []),
    overallPercentage: overall.percentage,
  }
}

const initialState = {
  user: {
    id: userSeedData.id,
    name: userSeedData.name,
    isAuthenticated: false,
  },
  session: {
    token: null,
  },
  attendance: buildAttendanceState(attendanceSeedData),
  selectedTarget: 75,
  ui: {
    theme: getInitialTheme(),
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
          isAuthenticated: true,
        },
        session: {
          token: action.payload.token,
        },
      }

    case 'LOGOUT':
      return {
        ...state,
        user: {
          ...state.user,
          isAuthenticated: false,
        },
        session: {
          token: null,
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

    case 'SET_THEME':
      return {
        ...state,
        ui: {
          ...state.ui,
          theme: action.payload,
        },
      }

    default:
      return state
  }
}

function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(appStateReducer, initialState)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.ui.theme === 'dark')
    localStorage.setItem('attend75-theme', state.ui.theme)
  }, [state.ui.theme])

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
