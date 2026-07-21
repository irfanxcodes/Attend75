/**
 * Firebase Cloud Messaging Service Worker
 * 
 * This runs SEPARATELY from the main Workbox SW (sw.js).
 * It handles background FCM messages delivered via Google Play Services.
 * This is the key to reliable Android background notifications.
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyC1DU3v_ftnC0ZvW2cR8MQSue7ns5KxNvo',
  authDomain: 'attend75-534c2.firebaseapp.com',
  projectId: 'attend75-534c2',
  messagingSenderId: '222443696612',
  appId: '1:222443696612:web:0c969f294953e107aa17f1',
})

const messaging = firebase.messaging()

// Handle background messages (when app is closed or in background)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon, badge, deepLink, category, priority } = payload.data || {}

  if (!title) return

  const vibrate = priority === 'high' ? [200, 100, 200, 100, 200] : [100, 50, 100]

  const categoryActions = {
    notice: [{ action: 'open', title: '📄 View Notice' }],
    attendance: [{ action: 'open', title: '📊 View Dashboard' }],
    broadcast: [{ action: 'open', title: '🔔 Open App' }],
    timetable: [{ action: 'open', title: '📅 View Timetable' }],
    weekly_summary: [{ action: 'open', title: '📈 View Summary' }],
  }

  const options = {
    body: body || '',
    icon: icon || '/icons/icon-192.png',
    badge: badge || '/icons/badge-72.png',
    data: { deepLink: deepLink || '/app/dashboard', category: category || 'broadcast' },
    vibrate,
    requireInteraction: priority === 'high',
    actions: categoryActions[category] || [{ action: 'open', title: 'View' }],
    tag: `attend75-${category || 'broadcast'}-${Date.now()}`,
    renotify: true,
  }

  return self.registration.showNotification(title, options)
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const deepLink = event.notification.data?.deepLink || '/app/dashboard'
  const urlToOpen = new URL(deepLink, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus().then(() => {
            client.postMessage({ type: 'NOTIFICATION_CLICK', url: urlToOpen })
            return client
          })
        }
      }
      return self.clients.openWindow(urlToOpen)
    })
  )
})
