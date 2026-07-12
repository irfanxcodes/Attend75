/**
 * Service Worker Push Handlers — handles incoming push messages and notification clicks.
 *
 * This file is imported into the service worker via importScripts or injectManifest.
 * It registers 'push' and 'notificationclick' event listeners.
 */

// Category-specific icons (relative to public/)
const CATEGORY_ICONS = {
  notice: '/icons/icon-192.png',
  attendance: '/icons/icon-192.png',
  timetable: '/icons/icon-192.png',
  digest: '/icons/icon-192.png',
  weekly_summary: '/icons/icon-192.png',
  nudge: '/icons/icon-192.png',
  broadcast: '/icons/icon-192.png',
}

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    // Malformed payload — show generic fallback (Req 9.4)
    event.waitUntil(
      self.registration.showNotification('Attend75', {
        body: 'You have a new update — open Attend75',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
      })
    )
    return
  }

  const {
    category = 'notice',
    title = 'Attend75',
    body = '',
    deepLink,
    priority,
    icon,
    badge,
    actions = [],
  } = payload

  const options = {
    body,
    icon: icon || CATEGORY_ICONS[category] || '/icons/icon-192.png',
    badge: badge || '/icons/badge-72.png',
    data: { deepLink, category },
    requireInteraction: priority === 'high',
    actions: actions.length > 0 ? actions : [{ action: 'open', title: 'View' }],
    tag: `attend75-${category}-${Date.now()}`,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const deepLink = event.notification.data?.deepLink || '/app/dashboard'
  const urlToOpen = new URL(deepLink, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If the app is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.focus()
          client.navigate(urlToOpen)
          return
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen)
    })
  )
})
