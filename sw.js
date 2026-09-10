/* Kart Masası — çevrimdışı çalışma için servis çalışanı.
   ASSETS listesindeki ?v= sürümleri index.html ile birebir aynı olmalı;
   sürüm artınca yeni önbellek oluşur ve eskisi silinir. */
const VERSION = 'v27';
const CACHE = 'kartmasasi-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=27',
  './js/rules.js?v=27',
  './js/sfx.js?v=27',
  './js/speed.js?v=27',
  './js/cards.js?v=27',
  './js/poker.js?v=27',
  './js/blackjack.js?v=27',
  './js/online.js?v=27',
  './js/app.js?v=27',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' → tarayıcının HTTP önbelleğini atla, dosyaların tazesini al
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
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

  /* Sayfanın kendisi: ÖNCE AĞ.
     index.html sürüm etiketi taşımadığı için önce-önbellek yapılırsa uygulama
     kendi güncellemesini asla göremez — eski sürümde kilitli kalır.
     Çevrimdışıyken önbellekteki kopyaya düşer. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  /* Sürümlü dosyalar (?v=N) değişmez: önbellek yeterli.
     Sürüm artınca URL değişir, dolayısıyla yenisi ağdan çekilir. */
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => undefined);
    })
  );
});
