import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearAdminSession,
  fetchAdminAnalytics,
  fetchAdminFeedbackLog,
  fetchAdminOverview,
  logoutAdminSession,
  parseAdminSession,
} from '../../services/adminApi'
import AdminSidebar from '../../components/admin/AdminSidebar'
import OverviewDashboard from '../../components/admin/OverviewDashboard'
import SystemHealthPage from '../../components/admin/SystemHealthPage'
import UsersAnalyticsPage from '../../components/admin/UsersAnalyticsPage'
import GrowthMetricsPage from '../../components/admin/GrowthMetricsPage'
import EngagementPage from '../../components/admin/EngagementPage'
import AppRatingsPage from '../../components/admin/AppRatingsPage'
import FeedbackPage from '../../components/admin/FeedbackPage'
import PremiumAnalyticsPage from '../../components/admin/PremiumAnalyticsPage'
import SubjectRequestsPage from '../../components/admin/SubjectRequestsPage'
import CollegeInterestPage from '../../components/admin/CollegeInterestPage'
import ArcadePage from '../../components/admin/ArcadePage'
import PushNotificationHealthPage from '../../components/admin/PushNotificationHealthPage'
import AdvertisementsPage from '../../components/admin/AdvertisementsPage'

function AdminDashboard() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('dashboard')
  const [data, setData] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [feedback, setFeedback] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const session = parseAdminSession()
  const sessionToken = session?.sessionToken

  const fetchAllData = useCallback(async () => {
    if (!sessionToken) return

    setIsLoading(true)
    setError('')

    try {
      const [overviewResult, analyticsResult, feedbackResult] = await Promise.allSettled([
        fetchAdminOverview(sessionToken),
        fetchAdminAnalytics(sessionToken),
        fetchAdminFeedbackLog(sessionToken, { limit: 50, sort: 'latest' }),
      ])

      if (overviewResult.status === 'fulfilled') setData(overviewResult.value)
      if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value)
      if (feedbackResult.status === 'fulfilled') setFeedback(feedbackResult.value)

      if (overviewResult.status === 'rejected') {
        setError('Failed to load overview data')
      }
    } catch (err) {
      setError(err?.message || 'Failed to load admin data')
    } finally {
      setIsLoading(false)
    }
  }, [sessionToken])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  const handleLogout = async () => {
    try {
      await logoutAdminSession(sessionToken)
    } catch {
      // Proceed with local logout regardless
    }
    clearAdminSession()
    navigate('/admin/login', { replace: true })
  }

  const handleNavigate = (sectionId) => {
    setActiveSection(sectionId)
  }

  const feedbackCount = feedback?.length || 0

  return (
    <div className="min-h-dvh bg-[#1e1932]">
      <AdminSidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        feedbackCount={feedbackCount}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <main className="pl-56">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-[#1e1932]/80 px-6 py-3 backdrop-blur-lg">
          <div className="flex items-center gap-2 text-[11px] text-[#6E6A88]">
            <span>Admin</span>
            <span>/</span>
            <span className="text-[#D8D4E7]">Overview</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#6E6A88]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="text-[10px] text-[#6E6A88]">Search users, lessons, colleges...</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="px-6 py-5">
          {error ? (
            <div className="mb-4 rounded-lg border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 px-4 py-2.5 text-xs text-[#FF5B5B]">
              {error}
            </div>
          ) : null}

          {activeSection === 'dashboard' ? (
            <OverviewDashboard
              data={data}
              analytics={analytics}
              feedback={feedback}
              onRefresh={fetchAllData}
              isLoading={isLoading}
              onNavigate={handleNavigate}
            />
          ) : activeSection === 'system-health' ? (
            <SystemHealthPage
              data={data}
              analytics={analytics}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'users-analytics' ? (
            <UsersAnalyticsPage
              data={data}
              analytics={analytics}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'growth' ? (
            <GrowthMetricsPage
              data={data}
              analytics={analytics}
              onRefresh={fetchAllData}
              isLoading={isLoading}
              sessionToken={sessionToken}
            />
          ) : activeSection === 'engagement' ? (
            <EngagementPage
              data={data}
              analytics={analytics}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'app-ratings' ? (
            <AppRatingsPage
              data={data}
              analytics={analytics}
              feedback={feedback}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'feedback' ? (
            <FeedbackPage
              feedback={feedback}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'premium-analytics' ? (
            <PremiumAnalyticsPage />
          ) : activeSection === 'subject-requests' ? (
            <SubjectRequestsPage
              analytics={analytics}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'college-interest' ? (
            <CollegeInterestPage
              data={data}
              analytics={analytics}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'push-health' ? (
            <PushNotificationHealthPage />
          ) : activeSection === 'arcade' ? (
            <ArcadePage
              analytics={analytics}
              onRefresh={fetchAllData}
              isLoading={isLoading}
            />
          ) : activeSection === 'advertisements' ? (
            <AdvertisementsPage sessionToken={sessionToken} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-white/5 bg-[#252136]">
              <div className="text-center">
                <p className="text-lg font-semibold text-[#F4F1FF]">{activeSection.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                <p className="mt-1 text-xs text-[#6E6A88]">This section is coming soon</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default AdminDashboard
