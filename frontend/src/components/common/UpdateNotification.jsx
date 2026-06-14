import { useEffect, useState } from 'react'
import { applyServiceWorkerUpdate } from '../../pwa/registerSW'

/**
 * Shows a toast notification when a new service worker update is available.
 * User can tap "Update" to apply or dismiss.
 */
function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    function handleUpdateAvailable() {
      setShowUpdate(true)
    }

    window.addEventListener('attend75:sw-update-available', handleUpdateAvailable)
    return () => {
      window.removeEventListener('attend75:sw-update-available', handleUpdateAvailable)
    }
  }, [])

  if (!showUpdate) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-20 z-[9998] mx-auto max-w-sm rounded-xl border border-white/10 bg-[#4A466A] p-3 shadow-lg sm:bottom-6"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-[#F7F4FF]">A new version is available.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowUpdate(false)}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#9F9AB5] transition-colors hover:text-[#F7F4FF]"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => applyServiceWorkerUpdate()}
            className="rounded-lg bg-[#4EF0A0] px-3 py-1 text-xs font-bold text-[#1C2030] transition-colors hover:bg-[#3DD88E]"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  )
}

export default UpdateNotification
