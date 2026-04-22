import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { parseAdminSession } from '../services/adminApi'
import { loginWithFirebase } from '../services/attendanceApi'
import { subscribeToFirebaseAuthState } from '../services/firebaseAuth'

const AppLayout = lazy(() => import('../components/layout/AppLayout'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const History = lazy(() => import('../pages/History'))
const Loading = lazy(() => import('../pages/Loading'))
const Login = lazy(() => import('../pages/Login'))
const Marks = lazy(() => import('../pages/Marks'))
const Profile = lazy(() => import('../pages/Profile'))
const Splash = lazy(() => import('../pages/Splash'))
const StudyMe = lazy(() => import('../pages/StudyMe'))
const StudyLessons = lazy(() => import('../pages/StudyLessons'))
const StudyLessonDetail = lazy(() => import('../pages/StudyLessonDetail'))
const StudyPdfViewer = lazy(() => import('../pages/StudyPdfViewer'))
const StudyTopicPractice = lazy(() => import('../pages/StudyTopicPractice'))
const AdminLogin = lazy(() => import('../pages/admin/AdminLogin'))
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))

function RouteFallback({ message = 'Loading page...' }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#48426D] px-4 sm:px-6">
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

function AdminProtectedRoute() {
  const session = parseAdminSession()
  if (!session?.sessionToken) {
    return <Navigate to="/admin/login" replace />
  }

  return <AdminDashboard />
}

function AdminPublicRoute() {
  const session = parseAdminSession()
  if (session?.sessionToken) {
    return <Navigate to="/admin" replace />
  }

  return <AdminLogin />
}

function AppRoutes() {
  const {
    state: { user },
    actions,
  } = useAppStore()
  const [isAuthBootstrapComplete, setAuthBootstrapComplete] = useState(false)

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== 'attend75.authEvent' || !event.newValue) {
        return
      }

      try {
        const payload = JSON.parse(event.newValue)
        if (payload?.type === 'logout') {
          actions.logout()
          setAuthBootstrapComplete(true)
        }
      } catch {
        // Ignore invalid payloads from local storage.
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [actions])

  useEffect(() => {
    if (isAuthBootstrapComplete) {
      return () => {}
    }

    let isActive = true
    const bootstrapTimeoutId = window.setTimeout(() => {
      if (isActive) {
        setAuthBootstrapComplete(true)
      }
    }, 10000)

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
        const result = await Promise.race([
          (async () => {
            const idToken = await firebaseUser.getIdToken(true)
            return loginWithFirebase(idToken)
          })(),
          new Promise((_, reject) => {
            window.setTimeout(() => {
              reject(new Error('Firebase bootstrap timed out'))
            }, 7000)
          }),
        ])

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
      window.clearTimeout(bootstrapTimeoutId)
      unsubscribe()
    }
  }, [actions, isAuthBootstrapComplete, user.isAuthenticated])

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<PublicLoginRoute isAuthBootstrapComplete={isAuthBootstrapComplete} />} />
        <Route path="/admin/login" element={<AdminPublicRoute />} />
        <Route path="/admin" element={<AdminProtectedRoute />} />
        <Route path="/loading" element={<Loading />} />
        <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/history" element={<Navigate to="/app/history" replace />} />
        <Route path="/marks" element={<Navigate to="/app/marks" replace />} />
        <Route path="/study" element={<StudyMe />} />
        <Route path="/study/:subjectId" element={<StudyLessons />} />
        <Route path="/study/:subjectId/:lessonId" element={<StudyLessonDetail />} />
        <Route path="/study/:subjectId/:lessonId/pdf" element={<StudyPdfViewer />} />
        <Route path="/study/:subjectId/:lessonId/practice/:topicId" element={<StudyTopicPractice />} />
        <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
        <Route path="/app" element={<ProtectedAppRoutes isAuthBootstrapComplete={isAuthBootstrapComplete} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="history" element={<History />} />
          <Route path="marks" element={<Marks />} />
          <Route path="study" element={<StudyMe />} />
          <Route path="study/:subjectId" element={<StudyLessons />} />
          <Route path="study/:subjectId/:lessonId" element={<StudyLessonDetail />} />
          <Route path="study/:subjectId/:lessonId/pdf" element={<StudyPdfViewer />} />
          <Route path="study/:subjectId/:lessonId/practice/:topicId" element={<StudyTopicPractice />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes
