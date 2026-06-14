/**
 * Install Prompt Coordinator
 *
 * Ensures install prompts don't overlap with the onboarding walkthrough.
 * Flow:
 *   1. Walkthrough starts → install prompts are blocked
 *   2. Walkthrough finishes → fires 'attend75:walkthrough-done' event
 *   3. Install banner waits 15s after walkthrough completes
 *   4. Install banner shows → user taps "Got it" or "Install"
 *   5. If Safari: iOS guide shows AFTER install banner is dismissed
 *
 * If the walkthrough was already completed (returning user), install prompts
 * start their 15s timer immediately.
 */

const WALKTHROUGH_STORAGE_KEY = 'attend75.walkthrough.completed'

let walkthroughDone = false

/**
 * Check if the walkthrough has already been completed in a previous session.
 */
export function isWalkthroughAlreadyCompleted() {
  try {
    return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Mark the walkthrough as done and notify listeners.
 * Called by the Walkthrough component when it finishes.
 */
export function notifyWalkthroughDone() {
  walkthroughDone = true
  window.dispatchEvent(new CustomEvent('attend75:walkthrough-done'))
}

/**
 * Check if the walkthrough is done (either just completed or was done previously).
 */
export function isWalkthroughDone() {
  return walkthroughDone || isWalkthroughAlreadyCompleted()
}

/**
 * Wait for the walkthrough to be done before resolving.
 * Resolves immediately if already completed.
 * Returns a cleanup function.
 */
export function onWalkthroughDone(callback) {
  if (isWalkthroughDone()) {
    callback()
    return () => {}
  }

  function handler() {
    window.removeEventListener('attend75:walkthrough-done', handler)
    callback()
  }

  window.addEventListener('attend75:walkthrough-done', handler)
  return () => window.removeEventListener('attend75:walkthrough-done', handler)
}
