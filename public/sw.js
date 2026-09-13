/* CareWell — Progressive Web App Service Worker with Background Reminders */
const CACHE_NAME = 'carewell-cache-v6';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './carewell-icon-192.png',
  './carewell-icon-512.png',
  './favicon.png',
  './favicon.ico',
  './brand-banner.png'
];

/* Install Event — Cache static assets & skip waiting */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache asset warning:', err);
      });
    })
  );
  self.skipWaiting();
});

/* Activate Event — Clean previous cache versions & claim clients */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* Fetch Event — Offline resilient network-first caching for static assets */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Bypass backend /api/ endpoints to prevent caching dynamic data
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('./') || caches.match('./index.html');
          }
        })
      )
  );
});

/* ── Push Event Listener (Requirement 1) ── */
self.addEventListener('push', (event) => {
  let payload = {
    title: '⏰ Medicine Reminder',
    message: 'Time to take your scheduled dose.'
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = {
        title: '⏰ Medicine Reminder',
        message: event.data.text()
      };
    }
  }

  const title = payload.title || '⏰ Medicine Reminder';
  const message = payload.message || payload.body || 'Time to take your scheduled dose.';
  const options = {
    body: message,
    icon: payload.icon || './carewell-icon-192.png',
    badge: payload.badge || './carewell-icon-192.png',
    vibrate: [300, 100, 300, 100, 500],
    requireInteraction: true,
    tag: payload.tag || `carewell-push-${Date.now()}`,
    data: payload.data || { url: self.registration.scope || './' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Message / Background Reminder Event Listener (Requirement 1 & 2) ── */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  const { type, title, message, body, data, icon, tag } = event.data;

  if (type === 'TRIGGER_REMINDER' || type === 'SHOW_NOTIFICATION') {
    const notifTitle = title || '⏰ Medicine Reminder';
    const notifBody = message || body || 'Time to take your scheduled dose.';
    const options = {
      body: notifBody,
      icon: icon || './carewell-icon-192.png',
      badge: './carewell-icon-192.png',
      vibrate: [300, 100, 300, 100, 500],
      requireInteraction: true,
      tag: tag || `carewell-reminder-${Date.now()}`,
      data: data || { url: self.registration.scope || './' }
    };

    event.waitUntil(self.registration.showNotification(notifTitle, options));
  } else if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── Notification Click Handler (Requirement 1) ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing CareWell window if open
      for (const client of clients) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window to the web app
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
