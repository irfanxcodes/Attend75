import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'

const AppLayout = lazy(() => import('../components/layout/AppLayout'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const History = lazy(() => import('../pages/History'))
const Loading = lazy(() => import('../pages/Loading'))
const Login = lazy(() => import('../pages/Login'))
const Profile = lazy(() => import('../pages/Profile'))
const Splash = lazy(() => import('../pages/Splash'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading page...</p>
      </div>
    </div>
  )
}

function ProtectedAppRoutes() {
  const {
    state: { user },
  } = useAppStore()

  if (!user.isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <AppLayout />
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/loading" element={<Loading />} />
        <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/app" element={<ProtectedAppRoutes />}>
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
