import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/AppRoutes'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-slate-100 to-white">
        <AppRoutes />
      </div>
    </BrowserRouter>
  )
}

export default App
