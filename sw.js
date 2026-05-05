/**
 * Service worker for EM 360 Image Viewer (PWA shell cache).
 * Caches local app files for offline / installed use.
 * CDN resources (PSV, Three.js, exifr) rely on the browser's HTTP cache.
 *
 * Bump CACHE_VERSION when deploying updated app files so stale caches are purged.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME    = `em-360-viewer-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './tour-loader.js',
  './tour-model.js',
  './renderer.js',
  './nav-controller.js',
  './thumb-strip.js',
  './manifest.json',
  './icon.svg',
  './guide.html',
];

// Pre-cache shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Remove old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('em-360-viewer-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Cache-first for same-origin GET requests; pass through everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
