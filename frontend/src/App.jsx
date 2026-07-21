import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/AppRoutes'
import OfflineIndicator from './components/common/OfflineIndicator'
import UpdateNotification from './components/common/UpdateNotification'
import InstallBanner from './components/common/InstallBanner'
import IOSInstallGuide from './components/common/IOSInstallGuide'
import CollegeInterestWidget from './components/common/CollegeInterestWidget'
import NotificationPromptBanner from './components/common/NotificationPromptBanner'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-dvh bg-[#5B5878] text-[#F7F4FF]">
        <OfflineIndicator />
        <AppRoutes />
        <CollegeInterestWidget />
        <InstallBanner />
        <IOSInstallGuide />
        <NotificationPromptBanner />
        <UpdateNotification />
      </div>
    </BrowserRouter>
  )
}

export default App
