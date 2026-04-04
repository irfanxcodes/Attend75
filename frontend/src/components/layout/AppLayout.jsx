import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

function AppLayout() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl bg-[#48426D] text-[#E7DEDE]">
      <main className="px-3 pb-28 pt-4 sm:px-4 sm:pb-32 sm:pt-5 md:px-6 lg:px-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

export default AppLayout
