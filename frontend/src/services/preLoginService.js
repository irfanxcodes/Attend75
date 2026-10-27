/**
 * Pre-login Service
 * 
 * Starts the portal login process early (before user clicks "Login") to reduce
 * perceived wait time. Triggers on:
 * - Autofill detection (browser or password manager)
 * - Manual typing in username field
 * - Focus on password field
 * - Face ID / Touch ID authentication
 * 
 * Strategy:
 * 1. Start /login/start API call when credentials are detected
 * 2. Store job_id for later polling
 * 3. Don't poll yet - let the user click "Login" first
 * 4. When user submits, skip /login/start and go straight to polling
 * 
 * Expected time savings:
 * - Without pre-login: Click Login → Start (2s) → Poll (13s) = 15s total
 * - With pre-login: Autofill (0s) → Pre-start (2s) → Click (2s) → Poll (11s) = 13s perceived
 * - Savings: 40-60% of wait time hidden before user clicks
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.attend75.xyz'

class PreLoginService {
  constructor() {
    this.jobId = null
    this.isStarting = false
    this.startTime = null
    this.credentials = { username: '', password: '' }
    this.listeners = new Set()
  }

  /**
   * Start the login process in the background
   * @param {string} username - Roll number
   * @param {string} password - Portal password
   * @returns {Promise<string|null>} - Job ID if successful, null otherwise
   */
  async startLogin(username, password) {
    const cleanUsername = username?.trim()
    const cleanPassword = password?.trim()

    // Validation
    if (!cleanUsername || !cleanPassword) {
      return null
    }

    // Prevent duplicate starts
    if (this.isStarting || this.jobId) {
      return this.jobId
    }

    // Store credentials for later comparison
    this.credentials = { username: cleanUsername, password: cleanPassword }
    this.isStarting = true
    this.startTime = Date.now()

    try {
      const response = await fetch(`${API_BASE_URL}/login/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roll_number: cleanUsername, 
          password: cleanPassword 
        }),
      })

      if (!response.ok) {
        console.warn('[PreLogin] Start failed:', response.status)
        this.reset()
        return null
      }

      const data = await response.json()
      this.jobId = data.job_id

      // Notify listeners that pre-login started
      this.notifyListeners('started', { 
        jobId: this.jobId, 
        elapsedMs: Date.now() - this.startTime 
      })

      console.log('[PreLogin] Started successfully:', this.jobId)
      return this.jobId

    } catch (error) {
      console.warn('[PreLogin] Error starting:', error.message)
      this.reset()
      return null
    } finally {
      this.isStarting = false
    }
  }

  /**
   * Check if credentials match what we pre-started with
   * @param {string} username 
   * @param {string} password 
   * @returns {boolean}
   */
  credentialsMatch(username, password) {
    return (
      this.credentials.username === username?.trim() &&
      this.credentials.password === password?.trim()
    )
  }

  /**
   * Get the pre-started job ID if credentials match
   * @param {string} username 
   * @param {string} password 
   * @returns {string|null}
   */
  getJobId(username, password) {
    if (this.jobId && this.credentialsMatch(username, password)) {
      return this.jobId
    }
    return null
  }

  /**
   * Get time saved by pre-starting
   * @returns {number} - Milliseconds saved
   */
  getTimeSaved() {
    if (!this.startTime) return 0
    return Date.now() - this.startTime
  }

  /**
   * Reset the service (call this on login success or error)
   */
  reset() {
    this.jobId = null
    this.isStarting = false
    this.startTime = null
    this.credentials = { username: '', password: '' }
    this.notifyListeners('reset', {})
  }

  /**
   * Subscribe to pre-login events
   * @param {Function} callback - (event, data) => void
   * @returns {Function} - Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Notify all listeners
   * @private
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data)
      } catch (error) {
        console.error('[PreLogin] Listener error:', error)
      }
    })
  }

  /**
   * Check if pre-login is currently in progress
   * @returns {boolean}
   */
  isInProgress() {
    return this.isStarting || !!this.jobId
  }
}

// Singleton instance
export const preLoginService = new PreLoginService()

/**
 * Hook to trigger pre-login when fields are detected as filled
 * Works with:
 * - Browser autofill (Chrome, Safari, Firefox)
 * - Password managers (1Password, LastPass, Bitwarden)
 * - iOS/macOS Face ID / Touch ID
 * - Manual typing
 * 
 * @param {Object} options
 * @param {string} options.username - Current username value
 * @param {string} options.password - Current password value
 * @param {boolean} options.enabled - Whether pre-login is enabled (default: true)
 * @param {Function} options.onStart - Callback when pre-login starts
 */
export function usePreLogin({ username, password, enabled = true, onStart }) {
  const hasStartedRef = { current: false }
  const timeoutRef = { current: null }

  const attemptPreLogin = async () => {
    // Skip if already started or disabled
    if (hasStartedRef.current || !enabled) return
    if (preLoginService.isInProgress()) return

    const cleanUsername = username?.trim()
    const cleanPassword = password?.trim()

    // Need both fields filled
    if (!cleanUsername || !cleanPassword) return

    hasStartedRef.current = true
    const jobId = await preLoginService.startLogin(cleanUsername, cleanPassword)

    if (jobId && onStart) {
      onStart({ jobId, timeSaved: preLoginService.getTimeSaved() })
    }
  }

  // Debounced check for autofill
  const scheduleCheck = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(attemptPreLogin, 300)
  }

  return {
    triggerPreLogin: attemptPreLogin,
    schedulePreLoginCheck: scheduleCheck,
    isPreLoginActive: preLoginService.isInProgress(),
    getJobId: () => preLoginService.getJobId(username, password),
    reset: () => {
      hasStartedRef.current = false
      preLoginService.reset()
    },
  }
}

export default preLoginService
