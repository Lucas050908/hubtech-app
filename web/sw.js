/*
 * HUBTECH service worker – makes the platform installable as a program and lets it open
 * when the server can't be reached (on a phone without Wi-Fi, for instance).
 *  - On install, the whole app shell (JS, CSS, fonts, icons – listed by /api/app/precache) is stored.
 *  - Network first, so updates always win; the stored copy is only used when the network fails.
 *  - API calls are never cached here: offline data is handled by js/core/offline.js (per user).
 */
const CACHE = 'hubtech-shell-v3';
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

// ── notifications when HUBTECH is closed (web push) ──
// The server sends an empty push (no payload to encrypt); the text is fetched from the inbox. Each device has its
// own place in the inbox, found from a hash of its push address, so the same thing never shows twice.
async function subHash() {
  const s = await self.registration.pushManager.getSubscription();
  if (!s) return '';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.endpoint));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const r = await fetch(`/api/notify/inbox?sub=${await subHash()}`, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Requested-With': 'hubtech' } });
      if (r.ok) items = (await r.json()).items || [];
    } catch { /* offline – show a general notice */ }
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!items.length) {
      if (open.some(c => c.visibilityState === 'visible')) return;     // nothing new and the app is in front
      items = [{ id: 0, title: 'HUBTECH', text: 'Der er noget nyt til dig.', path: '/apps/community' }];
    }
    for (const n of items.slice(-4)) {
      await self.registration.showNotification(n.title, {
        body: n.text, tag: n.kind === 'dm' ? `ht-${n.path}` : `ht-${n.id}`, renotify: true,
        icon: '/assets/icons/app-192.png', data: { path: n.path || '/' },
        requireInteraction: n.kind === 'call', vibrate: n.kind === 'call' ? [400, 200, 400, 200, 400] : [80],
      });
    }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const path = (e.notification.data && e.notification.data.path) || '/';
  const url = new URL(`/#${path}`, self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(c => new URL(c.url).origin === self.location.origin);
    if (w) { await w.focus(); try { await w.navigate(url); } catch { w.postMessage({ type: 'open', path }); } return; }
    await self.clients.openWindow(url);
  })());
});
