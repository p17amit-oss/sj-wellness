/* SJ Wellness coach app – service worker. Keeps the app shell on the phone so it opens without signal.
   Data is cached by the app itself (last copy from the server); the server API is never cached here. */
const CACHE = 'sjw-coach-v2';
const SHELL = ['/coach/', '/coach/app.js', '/coach/manifest.webmanifest', '/coach/icon-192.png', '/assets/common.js', '/coach/coach.css', '/config.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (sameOrigin && (url.pathname.startsWith('/coach/') || url.pathname.startsWith('/assets/') || url.pathname === '/config.js')) {
    // Network first, so updates arrive at once; the saved copy is used when offline.
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((m) => m || caches.match('/coach/'))));
  } else if (firebaseSdk || fonts) {
    // Versioned files: the saved copy is fine.
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
