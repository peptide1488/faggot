// Grimoire — D&D 5e Character Keeper — offline app-shell service worker
const CACHE = 'grimoire-v108';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // The app shell (HTML) must be network-first: cache-first here meant every update
  // showed the *previous* version instantly on reload (an old cached response wins
  // immediately, only updating the cache in the background for *next* time) — so a
  // user had to reload twice to ever see new code. Navigations + index.html always
  // try the network first now and only fall back to cache when offline.
  const isShell = req.mode === 'navigate' || req.url.endsWith('/') || req.url.endsWith('index.html');
  if (isShell) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  // Everything else (images, sprites, manifest, icons) rarely changes — cache-first
  // is the right tradeoff there, with a background refresh for next time.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
