import { useEffect, useState } from 'react'

/**
 * Hook to detect PWA installation status and platform.
 *
 * Returns:
 * - `isStandalone`: whether the app is running in standalone (installed) mode
 * - `isOnline`: current network connectivity status
 * - `platform`: 'ios' | 'android' | 'desktop'
 */
export function usePWAStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true)

  const platform = detectPlatform()

  return {
    isStandalone,
    isOnline,
    platform,
  }
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop'

  const ua = navigator.userAgent || ''

  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}
