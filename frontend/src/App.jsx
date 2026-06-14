import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/AppRoutes'
import OfflineIndicator from './components/common/OfflineIndicator'
import UpdateNotification from './components/common/UpdateNotification'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-dvh bg-[#5B5878] text-[#F7F4FF]">
        <OfflineIndicator />
        <AppRoutes />
        <UpdateNotification />
      </div>
    </BrowserRouter>
  )
}

export default App
