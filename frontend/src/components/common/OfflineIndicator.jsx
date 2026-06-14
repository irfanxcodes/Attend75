import { usePWAStatus } from '../../pwa/usePWAStatus'

/**
 * Displays a subtle top bar when the user is offline.
 * Renders nothing when online.
 */
function OfflineIndicator() {
  const { isOnline } = usePWAStatus()

  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center bg-[#FF5B5B]/90 px-4 py-1.5 text-center backdrop-blur-sm"
    >
      <svg viewBox="0 0 24 24" className="mr-1.5 h-3.5 w-3.5 shrink-0 text-white" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"
        />
      </svg>
      <span className="text-xs font-semibold text-white">You&apos;re offline — showing cached data</span>
    </div>
  )
}

export default OfflineIndicator
