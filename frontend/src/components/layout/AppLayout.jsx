import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import GuestBanner from '../common/GuestBanner'
import Sidebar from './Sidebar'

function AppLayout() {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(true)
  const sidebarPadding = isSidebarCollapsed ? 'md:pl-16 lg:pl-56' : 'md:pl-56'

  return (
    <div className="min-h-dvh w-full bg-[#5B5878] text-[#F7F4FF]">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((current) => !current)} />
      <div className={`${sidebarPadding} transition-[padding]`}>
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-3 sm:px-5 sm:pb-32 sm:pt-4 md:px-6 md:pb-6 md:pt-0 lg:px-8">
          <GuestBanner />
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

export default AppLayout
