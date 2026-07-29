// Grimoire — D&D 5e Character Keeper — offline app-shell service worker
const CACHE = 'grimoire-v120.247';
const ASSETS = [
  './',
  './index.html',
  './data.js',
  './rules.js',
  './net.js',
  './ui.js',
  './iso-renderer.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  // The iso3d/ WebGL battle map. Until v120.232 these were absent, so the 3D view was only
  // cached opportunistically and silently degraded to the 2D renderer offline until it had been
  // loaded online once (syncIso3DHost returns false when window.Iso3D is missing).
  //
  // These MUST carry the exact query strings the browser requests, because the fetch handler
  // below matches with caches.match(req), which is query-sensitive: a bare
  // './iso3d/src/host.js' entry would precache a URL nothing ever asks for. The list is only
  // the 12 modules actually reachable from boot.js; src/{combat,game,main,movement,turn,
  // units}.js belong to the standalone demo and are deliberately not shipped to the cache.
  //
  // If the iso3d ?v= is ever bumped, these must be updated in lockstep. rules-test.js derives
  // the list from the real import graph and fails on drift, so this cannot rot silently.
  './iso3d/boot.js?v=0.6.16&t=115',
  './iso3d/src/adapter.js?v=0.6.16',
  './iso3d/src/fx.js?v=0.6.16',
  './iso3d/src/host.js?v=0.6.16',
  './iso3d/src/lighting.js?v=0.6.16',
  './iso3d/src/map.js?v=0.6.16',
  './iso3d/src/math.js?v=0.6.16',
  './iso3d/src/pathfinding.js?v=0.6.16',
  './iso3d/src/renderer.js?v=0.6.16',
  './iso3d/src/sprites.js?v=0.6.16',
  './iso3d/src/terrainTextures.js?v=0.6.16',
  './iso3d/src/version.js?v=0.6.16'
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
