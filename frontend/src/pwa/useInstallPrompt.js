import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hook to manage the PWA install prompt.
 *
 * Captures the `beforeinstallprompt` event and provides:
 * - `canInstall`: whether the install prompt is available
 * - `isInstalled`: whether the app is already running as a PWA
 * - `promptInstall`: function to trigger the native install dialog
 *
 * On iOS, `canInstall` will be false (no native prompt),
 * but `isIOS` + `!isInstalled` can be used to show manual instructions.
 */
export function useInstallPrompt() {
  const deferredPromptRef = useRef(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already running as installed PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (isStandalone) {
      setIsInstalled(true)
      return
    }

    function handleBeforeInstallPrompt(event) {
      // Prevent the default mini-infobar from appearing on Chrome
      event.preventDefault()
      deferredPromptRef.current = event
      setCanInstall(true)
    }

    function handleAppInstalled() {
      setIsInstalled(true)
      setCanInstall(false)
      deferredPromptRef.current = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    const prompt = deferredPromptRef.current
    if (!prompt) return false

    prompt.prompt()

    const { outcome } = await prompt.userChoice
    deferredPromptRef.current = null
    setCanInstall(false)

    return outcome === 'accepted'
  }, [])

  return {
    canInstall,
    isInstalled,
    promptInstall,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
  }
}
