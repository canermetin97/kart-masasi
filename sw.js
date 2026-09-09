/* Kart Masası — çevrimdışı çalışma için servis çalışanı.
   ASSETS listesindeki ?v= sürümleri index.html ile birebir aynı olmalı;
   sürüm artınca yeni önbellek oluşur ve eskisi silinir. */
const VERSION = 'v6';
const CACHE = 'kartmasasi-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=6',
  './js/sfx.js?v=6',
  './js/speed.js?v=6',
  './js/cards.js?v=6',
  './js/poker.js?v=6',
  './js/blackjack.js?v=6',
  './js/app.js?v=6',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});
