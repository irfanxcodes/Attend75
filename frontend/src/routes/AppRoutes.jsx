import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { loginWithFirebase } from '../services/attendanceApi'
import { subscribeToFirebaseAuthState } from '../services/firebaseAuth'

const AppLayout = lazy(() => import('../components/layout/AppLayout'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const History = lazy(() => import('../pages/History'))
const Loading = lazy(() => import('../pages/Loading'))
const Login = lazy(() => import('../pages/Login'))
const Profile = lazy(() => import('../pages/Profile'))
const Splash = lazy(() => import('../pages/Splash'))

function RouteFallback({ message = 'Loading page...' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#48426D] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-[#5B5485] p-5 text-center shadow-md">
        <p className="text-sm font-medium text-[#F4F1FF]">{message}</p>
      </div>
    </div>
  )
}

function ProtectedAppRoutes({ isAuthBootstrapComplete }) {
  const {
    state: { user },
  } = useAppStore()

  if (!isAuthBootstrapComplete) {
    return <RouteFallback message="Restoring session..." />
  }

  if (!user.isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <AppLayout />
}

function PublicLoginRoute({ isAuthBootstrapComplete }) {
  const {
    state: { user },
  } = useAppStore()

  if (!isAuthBootstrapComplete) {
    return <RouteFallback message="Restoring session..." />
  }

  if (user.isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />
  }

  return <Login />
}

function AppRoutes() {
  const {
    state: { user },
    actions,
  } = useAppStore()
  const [isAuthBootstrapComplete, setAuthBootstrapComplete] = useState(false)

  useEffect(() => {
    if (isAuthBootstrapComplete) {
      return () => {}
    }

    let isActive = true

    const unsubscribe = subscribeToFirebaseAuthState(async (firebaseUser) => {
      if (!isActive) {
        return
      }

      if (!firebaseUser) {
        setAuthBootstrapComplete(true)
        return
      }

      if (user.isAuthenticated) {
        setAuthBootstrapComplete(true)
        return
      }

      try {
        const idToken = await firebaseUser.getIdToken()
        const result = await loginWithFirebase(idToken)

        if (result.linked && result.session) {
          actions.setAuthSession(result.session)
          actions.setAttendanceData(result.session.attendanceData)
        }
      } catch {
        // Keep guest path unaffected when Firebase auto-login fails.
      } finally {
        if (isActive) {
          setAuthBootstrapComplete(true)
        }
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [actions, isAuthBootstrapComplete, user.isAuthenticated])

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<PublicLoginRoute isAuthBootstrapComplete={isAuthBootstrapComplete} />} />
        <Route path="/loading" element={<Loading />} />
        <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/history" element={<Navigate to="/app/history" replace />} />
        <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
        <Route path="/app" element={<ProtectedAppRoutes isAuthBootstrapComplete={isAuthBootstrapComplete} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="history" element={<History />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes
