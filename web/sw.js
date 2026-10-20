/*
 * HUBTECH service worker – makes the platform installable as a program and lets it open
 * when the server can't be reached (on a phone without Wi-Fi, for instance).
 *  - On install, the whole app shell (JS, CSS, fonts, icons – listed by /api/app/precache) is stored.
 *  - Network first, so updates always win; the stored copy is only used when the network fails.
 *  - API calls are never cached here: offline data is handled by js/core/offline.js (per user).
 */
const CACHE = 'hubtech-shell-v2';
const CORE = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    let files = CORE;
    try { const r = await fetch('/api/app/precache', { cache: 'no-store' }); if (r.ok) files = (await r.json()).files; } catch { /* keep core */ }
    // a few at a time, and one missing file must not break the install
    for (let i = 0; i < files.length; i += 12) await Promise.all(files.slice(i, i + 12).map(f => c.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const STATIC = /^\/(js|css|fonts|assets)\//;
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sites/') || url.pathname.startsWith('/apps/')) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (STATIC.test(url.pathname) || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.webmanifest')) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(async () => {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
    return Response.error();
  }));
});
