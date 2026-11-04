/* Parchís de Hogwarts - service worker (offline / instalable) */
const VERSION = 'hogwarts-pwa-v1';
const CACHE = `${VERSION}-core`;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './hogwarts-fx.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        CORE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {
            /* Un recurso opcional puede fallar, el resto sigue cacheándose. */
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Navegación: red primero para recibir actualizaciones, y offline desde caché. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./'))
        )
    );
    return;
  }

  if (url.origin === self.location.origin) {
    /* Assets propios: caché primero, actualizando en segundo plano. */
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => cachePut(request, response))
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  /* Tipografías de Google: se guardan para que la app se vea igual offline. */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request)
          .then((response) => cachePut(request, response))
          .catch(() => cached)
      )
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
