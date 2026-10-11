/**
 * NeuroWare Service Worker
 * Version: 2.3.0
 * Resilient Offline Storage, OS Push Notifications & Auto-Updating Engine
 */

const CACHE_NAME = 'neuroware-v2.3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/storage.js',
  './js/auth.js',
  './js/inventory.js',
  './js/notifications.js',
  './js/app.js',
  './data.json',
  './manifest.webmanifest',
  './assets/icon.svg'
];

// Install: Cache all core assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Instantly activate new service worker
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('PWA caching note:', err));
    })
  );
});

// Activate: Clean old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Message listener to trigger immediate skipWaiting, notifications, or background checks
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'SHOW_NOTIFICATION') {
    const payload = event.data.payload || {};
    self.registration.showNotification(payload.title || 'NeuroWare Alert', {
      body: payload.message || payload.body || 'Neurosurgical inventory update',
      icon: './assets/icon.svg',
      badge: './assets/icon.svg',
      vibrate: [250, 100, 250],
      tag: payload.id || 'notif-' + Date.now(),
      renotify: true,
      data: { url: './', timestamp: Date.now() }
    });
  } else if (event.data.type === 'CHECK_BACKGROUND_NOTIFICATIONS') {
    event.waitUntil(checkBackgroundNotifications());
  }
});

// --- Push Notification Event Handler (OS-level alerts when app is closed) ---
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'NeuroWare Alert',
      message: event.data ? event.data.text() : 'Neurosurgical storage alert'
    };
  }

  const title = data.title || 'NeuroWare Alert';
  const options = {
    body: data.message || data.body || 'New storage or clinical update recorded.',
    icon: './assets/icon.svg',
    badge: './assets/icon.svg',
    vibrate: [250, 100, 250],
    tag: data.id || 'neuroware-push-' + Date.now(),
    renotify: true,
    data: {
      url: './',
      timestamp: Date.now()
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// --- Notification Click Handler (Brings app to foreground when user taps alert) ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});

// Periodic background sync if supported by browser
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'neuroware-check-notifications') {
    event.waitUntil(checkBackgroundNotifications());
  }
});

// Check for new notifications in background
async function checkBackgroundNotifications() {
  try {
    const res = await fetch('./data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const db = await res.json();
    if (!db || !db.notifications || db.notifications.length === 0) return;

    const latestNotif = db.notifications[0];
    const cache = await caches.open(CACHE_NAME);
    const lastSeenRes = await cache.match('/last_seen_notif_id');
    const lastSeenId = lastSeenRes ? await lastSeenRes.text() : null;

    if (latestNotif && latestNotif.id !== lastSeenId) {
      await cache.put('/last_seen_notif_id', new Response(latestNotif.id));
      await self.registration.showNotification(latestNotif.title, {
        body: latestNotif.message,
        icon: './assets/icon.svg',
        badge: './assets/icon.svg',
        vibrate: [250, 100, 250],
        tag: latestNotif.id,
        data: { url: './' }
      });
    }
  } catch (e) {
    // Offline or network error
  }
}

// Fetch: Stale-while-revalidate for local assets, network-first for remote GitHub sync
self.addEventListener('fetch', (event) => {
  // Always fetch live GitHub API calls directly from network
  if (event.request.url.includes('api.github.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Fetch fresh copy in background to update cache
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

