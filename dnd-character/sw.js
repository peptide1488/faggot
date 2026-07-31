// Grimoire — D&D 5e Character Keeper — offline app-shell service worker
const CACHE = 'grimoire-v120.259';
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
  // The app's own JS modules must be network-first for the SAME reason as the shell, and this was
  // the more damaging half of the bug (fixed v120.255). index.html was already network-first while
  // data/rules/net/ui/iso-renderer.js stayed cache-first, so a reload reliably paired the NEWEST
  // html with STALE JavaScript. That is the worst possible combination: APP_VERSION lives in
  // index.html, so the header showed the new version number while the behaviour was several
  // versions old, which makes "did my change deploy?" unanswerable. It cost real debugging time
  // twice on 2026-07-30 — a reported "zero effect" turned out to be a browser pinned to
  // grimoire-v120.251 while the site served v120.254.
  //
  // These are unversioned URLs, so only freshness-checking can update them. iso3d/ is deliberately
  // NOT included: those imports carry an explicit ?v= cache-buster, so a new build requests new
  // URLs and cache-first is both correct and cheaper for them.
  const isAppCode = /\/(data|rules|net|ui|iso-renderer)\.js(\?|$)/.test(req.url);
  if (isShell || isAppCode) {
    // Network-first, but never hang on it. This app gets used at a table on bad wifi, where a
    // stalled (not failed) request would otherwise block startup indefinitely — worse than the
    // staleness this is fixing. So: race the network against a short timer, and if the network
    // hasn't answered in time, serve the cached copy and let the fetch keep running to refresh
    // the cache for next load. A genuine offline error falls back the same way.
    const NET_TIMEOUT = 2500;
    // {cache:'no-cache'} is load-bearing, not belt-and-braces (v120.257). GitHub Pages serves
    // these with `Cache-Control: max-age=600`, so a plain fetch() inside the worker is answered by
    // the BROWSER's HTTP cache for ten minutes and never reaches the network — "network-first" was
    // really "http-cache-first", and v120.256 still shipped stale ui.js after a reload because of
    // it. A reloaded document revalidates automatically; its sub-resources do not.
    // 'no-cache' means revalidate, not re-download: the ETag makes it a 304 when nothing changed.
    const fromNet = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
    e.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const done = (r) => { if (!settled && r) { settled = true; resolve(r); } };
        fromNet.then(done).catch(() => { /* handled by the fallback below */ });
        const fallback = () => caches.match(req).then((cached) => {
          if (cached) done(cached);
          // No cached copy: the network is the only option, so wait for it however long it takes,
          // and surface its error rather than resolving with undefined.
          else fromNet.then(done).catch(() => done(Response.error()));
        });
        setTimeout(fallback, NET_TIMEOUT);
        fromNet.catch(fallback);
      })
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
