const URL_BASE64_KEY = 'urlBase64ToUint8Array';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let datos = { title: 'sfbathroom · BI', body: '', url: '/' };
  try {
    datos = { ...datos, ...event.data?.json?.() };
  } catch {
    /* mensaje plano */
  }
  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: datos.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if (cliente.url.includes(self.location.origin)) {
          return cliente.navigate(url).then(() => cliente.focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});