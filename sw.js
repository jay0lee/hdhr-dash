const CACHE_NAME = 'hdhr-dash-v40';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css?v=2.0.37',
  './app.js?v=2.0.37',
  './manifest.json',
  './icon.svg',
  './favicon.ico',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept HDHomeRun LAN API calls, external APIs, or non-origin requests
  if (
    !url.protocol.startsWith('http') ||
    url.hostname !== self.location.hostname ||
    url.pathname.endsWith('.json')
  ) {
    return;
  }

  // Network-first strategy for app shell assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
