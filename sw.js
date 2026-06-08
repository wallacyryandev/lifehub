// LifeHub Service Worker
const CACHE_NAME = 'lifehub-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first — não cacheia nada, só passa a requisição
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase')) return;
  // Deixa o browser lidar normalmente
});

// Notificações push
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag } = e.data.payload;
    self.registration.showNotification(title, {
      body,
      icon: icon || '/public/icons/icon-192x192.png',
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: false
    });
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});