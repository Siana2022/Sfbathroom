const VERSION = 'sfb-bi-v1';

const CACHE_STATICO = `${VERSION}-estaticos`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATICO).then((cache) =>
      cache.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_STATICO).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE_STATICO).then((cache) => cache.put(request, copia));
          return resp;
        })
        .catch(() =>
          caches.match('/').then((desdeCache) => desdeCache ?? Response.error())
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((desdeCache) => {
      if (desdeCache) return desdeCache;
      return fetch(request).then((resp) => {
        if (resp.ok && url.origin === self.location.origin) {
          const copia = resp.clone();
          caches.open(CACHE_STATICO).then((cache) => cache.put(request, copia));
        }
        return resp;
      });
    })
  );
});