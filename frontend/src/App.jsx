import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/AppRoutes'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#48426D] text-[#E7DEDE]">
        <AppRoutes />
      </div>
    </BrowserRouter>
  )
}

export default App
