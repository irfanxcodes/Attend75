import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { parseAdminSession } from '../services/adminApi'
import { fetchSessionStatus, loginWithFirebase } from '../services/attendanceApi'
import { subscribeToFirebaseAuthState } from '../services/firebaseAuth'
import {
  clearPersistedSession,
  loadAttendanceSnapshot,
  loadPersistedSession,
} from '../services/sessionPersistence'

const AppLayout = lazy(() => import('../components/layout/AppLayout'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const History = lazy(() => import('../pages/History'))
const Loading = lazy(() => import('../pages/Loading'))
const Login = lazy(() => import('../pages/Login'))
const Marks = lazy(() => import('../pages/Marks'))
const Notices = lazy(() => import('../pages/Notices'))
const Profile = lazy(() => import('../pages/Profile'))
const Splash = lazy(() => import('../pages/Splash'))
const StudyMe = lazy(() => import('../pages/StudyMe'))
const SubjectDetail = lazy(() => import('../pages/SubjectDetail'))
const LessonPlayer = lazy(() => import('../pages/LessonPlayer'))
const WorkspacePlayer = lazy(() => import('../pages/WorkspacePlayer'))
const ChapterUpload = lazy(() => import('../pages/ChapterUpload'))
const AdminLogin = lazy(() => import('../pages/admin/AdminLogin'))
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))
const NotificationSettings = lazy(() => import('../pages/NotificationSettings'))
const NotificationHistory = lazy(() => import('../pages/NotificationHistory'))
const Premium = lazy(() => import('../pages/Premium'))
const ArcadeHome = lazy(() => import('../pages/ArcadeHome'))
const ArcadeGamePage = lazy(() => import('../pages/ArcadeGamePage'))
const FaceRater = lazy(() => import('../pages/FaceRater'))

function RouteFallback({ message = 'Loading page...' }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#5B5878] px-4 sm:px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#4A466A] p-5 text-center shadow-md">
        <p className="text-sm font-medium text-[#F7F4FF]">{message}</p>
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

// Layout-less protected wrapper for full-screen pages (WorkspacePlayer, LessonPlayer).
// These pages use fixed inset-0 and must NOT be nested inside AppLayout because
// AppLayout's transition-[padding] creates a CSS stacking context that traps fixed children.
function ProtectedFullScreen({ isAuthBootstrapComplete }) {
  const {
    state: { user },
  } = useAppStore()

  if (!isAuthBootstrapComplete) {
    return <RouteFallback message="Restoring session..." />
  }

  if (!user.isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function PublicLoginRoute({ isAuthBootstrapComplete }) {
  const {
    state: { user },
  } = useAppStore()

  if (!isAuthBootstrapComplete) {
    return <RouteFallback message="Restoring session..." />
  }

  // Allow access to login even in demo mode (demo users should be able to login for real)
  if (user.isAuthenticated && user.authProvider !== 'demo') {
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

function StudyRedirectOrPublic() {
  const {
    state: { user },
  } = useAppStore()
  const location = useLocation()

  if (user.isAuthenticated) {
    const appPath = `/app${location.pathname}${location.search}`
    return <Navigate to={appPath} replace />
  }

  return <StudyMe />
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

    // Fast path: try to restore a persisted guest session first
    const persistedSession = loadPersistedSession()
    const cleanupRef = { current: null }

    if (persistedSession && persistedSession.token) {
      // Validate the token with the server in the background
      fetchSessionStatus(persistedSession.token)
        .then((status) => {
          if (!isActive) return

          if (status === 'linked' || status === 'unknown') {
            // Token is still valid — restore session immediately
            const cachedAttendance = loadAttendanceSnapshot()

            actions.setAuthSession({
              id: persistedSession.rollNumber,
              name: persistedSession.name,
              portalName: persistedSession.portalName,
              rollNumber: persistedSession.rollNumber,
              authProvider: persistedSession.authProvider,
              token: persistedSession.token,
              semesters: persistedSession.semesters,
              selectedSemester: persistedSession.selectedSemester,
              programs: persistedSession.programs,
              selectedProgram: persistedSession.selectedProgram,
              programFull: persistedSession.programFull || null,
              programSn: persistedSession.programSn || null,
            })

            if (cachedAttendance) {
              actions.setAttendanceData(cachedAttendance)
            }

            setAuthBootstrapComplete(true)

            // Register push subscription in background for ALL users (needed for feedback replies)
            import('../pwa/push/subscribe').then(({ ensurePushRegistered }) => {
              ensurePushRegistered(persistedSession.token)
            }).catch(() => {})

            // Register FCM token independently (for reliable Android background delivery)
            import('../services/firebaseMessaging').then(({ getFCMToken }) => {
              getFCMToken().then((fcmToken) => {
                if (fcmToken) {
                  import('../services/pushApi').then(({ registerFCMToken }) => {
                    registerFCMToken({ token: persistedSession.token, fcmToken, deviceInfo: /Android/i.test(navigator.userAgent) ? 'Android' : 'Other' })
                      .then(() => console.log('[FCM] Token registered!'))
                      .catch((e) => console.warn('[FCM] Register failed:', e.message))
                  })
                } else {
                  console.warn('[FCM] getToken returned null')
                }
              }).catch((e) => console.warn('[FCM] getToken error:', e.message || e))
            }).catch(() => {})
          } else {
            // Token expired — clear and fall through to Firebase check
            clearPersistedSession()
            startFirebaseBootstrap()
          }
        })
        .catch(() => {
          if (!isActive) return
          // Network error — still try to show cached data if available
          const cachedAttendance = loadAttendanceSnapshot()
          if (cachedAttendance && persistedSession.token) {
            actions.setAuthSession({
              id: persistedSession.rollNumber,
              name: persistedSession.name,
              portalName: persistedSession.portalName,
              rollNumber: persistedSession.rollNumber,
              authProvider: persistedSession.authProvider,
              token: persistedSession.token,
              semesters: persistedSession.semesters,
              selectedSemester: persistedSession.selectedSemester,
              programs: persistedSession.programs,
              selectedProgram: persistedSession.selectedProgram,
              programFull: persistedSession.programFull || null,
              programSn: persistedSession.programSn || null,
            })
            actions.setAttendanceData(cachedAttendance)
            setAuthBootstrapComplete(true)
          } else {
            startFirebaseBootstrap()
          }
        })
    } else {
      startFirebaseBootstrap()
    }

    function startFirebaseBootstrap() {
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

      // Store unsubscribe for cleanup
      cleanupRef.current = unsubscribe
    }

    return () => {
      isActive = false
      window.clearTimeout(bootstrapTimeoutId)
      if (cleanupRef.current) {
        cleanupRef.current()
      }
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
        <Route path="/study" element={<StudyRedirectOrPublic />} />
        <Route path="/profile" element={<Navigate to="/app/profile" replace />} />
        {/* Full-screen routes — outside AppLayout to avoid stacking context from transition-[padding] */}
        <Route element={<ProtectedFullScreen isAuthBootstrapComplete={isAuthBootstrapComplete} />}>
          <Route path="/app/study/:subjectId/:lessonId/play" element={<LessonPlayer />} />
          <Route path="/app/study/:subjectId/:lessonId/workspace" element={<WorkspacePlayer />} />
        </Route>

        {/* Standard app routes — wrapped in AppLayout with sidebar + bottom nav */}
        <Route path="/app" element={<ProtectedAppRoutes isAuthBootstrapComplete={isAuthBootstrapComplete} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="history" element={<History />} />
          <Route path="marks" element={<Marks />} />
          <Route path="notices" element={<Notices />} />
          <Route path="study" element={<StudyMe />} />
          <Route path="study/:subjectId" element={<SubjectDetail />} />
          <Route path="study/:subjectId/upload" element={<ChapterUpload />} />
          <Route path="profile" element={<Profile />} />
          <Route path="premium" element={<Premium />} />
          <Route path="arcade" element={<ArcadeHome />} />
          <Route path="arcade/:gameSlug" element={<ArcadeGamePage />} />
          <Route path="mog" element={<FaceRater />} />
          <Route path="notification-settings" element={<NotificationSettings />} />
          <Route path="notifications" element={<NotificationHistory />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes
