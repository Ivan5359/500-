const CACHE = 'revenuesprint-clean-20260616';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    '/',
    '/presentation.html',
    '/guide.html',
    '/icon.svg',
    '/manifest.webmanifest'
  ]).catch(() => undefined)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isPage = event.request.mode === 'navigate' || new URL(event.request.url).pathname.endsWith('.html');
  if (isPage) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
