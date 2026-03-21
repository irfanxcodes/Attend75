import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

function AppLayout() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-[#48426D] text-[#E7DEDE]">
      <main className="px-4 pb-28 pt-5 md:px-5">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

export default AppLayout
