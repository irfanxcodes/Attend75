/**
 * Offline Action Queue
 *
 * When the user is offline, queues actions (feedback, ratings, feature tracking)
 * and automatically sends them when connectivity returns.
 *
 * Uses localStorage as persistence since we need it to survive app restarts.
 * Each queued item has: { id, type, payload, queuedAt }
 */

const QUEUE_KEY = 'attend75.offlineQueue'

/**
 * Add an action to the offline queue.
 */
export function enqueueOfflineAction(type, payload) {
  try {
    const queue = getQueue()
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      queuedAt: Date.now(),
    }
    queue.push(item)
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    return item.id
  } catch {
    return null
  }
}

/**
 * Get all queued actions.
 */
export function getQueue() {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Remove a specific item from the queue (after successful send).
 */
export function dequeueAction(id) {
  try {
    const queue = getQueue().filter((item) => item.id !== id)
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Ignore
  }
}

/**
 * Clear the entire queue.
 */
export function clearQueue() {
  try {
    window.localStorage.removeItem(QUEUE_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Get the number of pending actions in the queue.
 */
export function getQueueLength() {
  return getQueue().length
}

/**
 * Process all queued actions by sending them to the API.
 * Calls the provided sender function for each item.
 * Items that succeed are removed; items that fail remain in queue.
 *
 * @param {Function} sender - async function(type, payload) that sends to API
 * @returns {Object} { sent: number, failed: number }
 */
export async function flushQueue(sender) {
  const queue = getQueue()
  if (!queue.length) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0

  for (const item of queue) {
    try {
      await sender(item.type, item.payload)
      dequeueAction(item.id)
      sent++
    } catch {
      failed++
    }
  }

  return { sent, failed }
}

/**
 * Initialize the online listener that flushes the queue when connectivity returns.
 * Call once at app startup.
 */
export function initOfflineQueueSync(sender) {
  if (typeof window === 'undefined') return

  async function handleOnline() {
    const queue = getQueue()
    if (queue.length > 0) {
      await flushQueue(sender)
    }
  }

  window.addEventListener('online', handleOnline)

  // Also try to flush on startup if we're online and have items
  if (navigator.onLine && getQueue().length > 0) {
    // Small delay to let the app settle
    setTimeout(handleOnline, 3000)
  }
}
