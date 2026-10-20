/**
 * Offline support: when the HUBTECH server can't be reached, reads come from the last copy
 * this device saw, and changes to Opgaver, Noter, other app data, settings and Office files are
 * queued and sent when the server answers again.
 *
 * Storage is IndexedDB (database "hubtech-offline"), one bucket per user, so another account on
 * the same computer never sees your cached data. Logging out clears the bucket.
 */
const DB = 'hubtech-offline', STORE = 'kv';
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!('indexedDB' in self)) { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch((e) => { dbp = null; throw e; });
  return dbp;
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(st)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = {
  get: (k) => tx('readonly', (st) => req(st.get(k))).catch(() => undefined),
  set: (k, v) => tx('readwrite', (st) => { st.put(v, k); }).catch(() => {}),
  del: (k) => tx('readwrite', (st) => { st.delete(k); }).catch(() => {}),
  keys: () => tx('readonly', (st) => req(st.getAllKeys())).catch(() => []),
};

// ── which requests take part ──
const CACHE_GET = [/^\/api\/auth\/status$/, /^\/api\/me$/, /^\/api\/me\/prefs$/, /^\/api\/me\/summary$/, /^\/api\/favorites$/,
  /^\/api\/state\/[a-z0-9-]+$/, /^\/api\/states\/[a-z0-9-]+$/, /^\/api\/office\/docs$/, /^\/api\/office\/docs\/[A-Za-z0-9_-]+$/];
const QUEUE_WRITE = [/^\/api\/state\/[a-z0-9-]+$/, /^\/api\/me\/prefs$/, /^\/api\/office\/docs\/[A-Za-z0-9_-]+$/];
export const cacheable = (method, path) => method === 'GET' && CACHE_GET.some(r => r.test(path));
export const queueable = (method, path) => method === 'PUT' && QUEUE_WRITE.some(r => r.test(path));

let uid = null;   // bucket = the logged-in user
try { uid = localStorage.getItem('hubtech.offline.uid'); } catch { /* */ }
export function setOfflineUser(user) {
  const next = user ? String(user.id) : null;
  if (next === uid) return;
  uid = next;
  try { next ? localStorage.setItem('hubtech.offline.uid', next) : localStorage.removeItem('hubtech.offline.uid'); } catch { /* */ }
}
const ck = (path) => `u${uid}:get:${path}`;
const qk = (path) => `u${uid}:q:${path}`;

export async function remember(path, data) {
  if (!uid && path !== '/api/auth/status') return;
  if (path === '/api/auth/status') { try { localStorage.setItem('hubtech.offline.status', JSON.stringify(data)); } catch { /* */ } return; }
  await kv.set(ck(path), { data, at: Date.now() });
}
export async function recall(path) {
  if (path === '/api/auth/status') { try { return JSON.parse(localStorage.getItem('hubtech.offline.status') || 'null'); } catch { return null; } }
  if (!uid) return null;
  const hit = await kv.get(ck(path));
  if (hit) return hit.data;
  // a queued change is newer than anything cached
  const q = await kv.get(qk(path));
  return q ? q.echo : null;
}

// ── status (online / offline / syncing) ──
const listeners = new Set();
let status = { offline: false, pending: 0 };
export const offlineStatus = () => status;
export function onOfflineChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(patch) {
  const next = { ...status, ...patch };
  if (next.offline === status.offline && next.pending === status.pending) return;
  status = next;
  listeners.forEach(fn => { try { fn(status); } catch { /* */ } });
}
export const markOnline = () => { if (status.offline) { setStatus({ offline: false }); scheduleReplay(50); } };
export const markOffline = () => { setStatus({ offline: true }); scheduleReplay(); };

/** What a successful PUT would have answered, so the page keeps working while offline. */
async function echoFor(path, body) {
  const t = Math.floor(Date.now() / 1000);
  if (path.startsWith('/api/office/docs/')) {
    const cur = (await recall(path))?.doc || { id: path.split('/').pop() };
    const doc = { ...cur, ...body, updatedAt: t };
    await kv.set(ck(path), { data: { doc }, at: Date.now() });   // reopen offline → see the latest text
    const list = await recall('/api/office/docs');
    if (list?.docs) {
      const docs = list.docs.map(d => d.id === doc.id ? { ...d, title: doc.title ?? d.title, preview: doc.preview ?? d.preview, updatedAt: t, starred: doc.starred ?? d.starred, trashed: doc.trashed ?? d.trashed } : d);
      await kv.set(ck('/api/office/docs'), { data: { docs }, at: Date.now() });
    }
    return { doc, queued: true };
  }
  if (path.startsWith('/api/state/')) {
    await kv.set(ck(path), { data: { state: body.state, updatedAt: t }, at: Date.now() });
    return { ok: true, updatedAt: t, queued: true };
  }
  if (path === '/api/me/prefs') {
    const cur = (await recall(path))?.prefs || {};
    const prefs = { ...cur, ...body };
    await kv.set(ck(path), { data: { prefs }, at: Date.now() });
    return { prefs, queued: true };
  }
  return { ok: true, queued: true };
}

/** Store a write for later. Several writes to the same address keep only the newest (office docs merge fields). */
export async function enqueue(method, path, body) {
  if (!uid) throw new Error('not logged in');
  const old = await kv.get(qk(path));
  const merged = old && path.startsWith('/api/office/docs/') ? { ...old.body, ...body } : (old && path === '/api/me/prefs' ? { ...old.body, ...body } : body);
  const echo = await echoFor(path, body);
  await kv.set(qk(path), { method, path, body: merged, at: Date.now(), echo });
  await countPending();
  markOffline();
  return echo;
}
async function queued() {
  const prefix = `u${uid}:q:`;
  const keys = (await kv.keys()).filter(k => typeof k === 'string' && k.startsWith(prefix));
  const items = [];
  for (const k of keys) { const v = await kv.get(k); if (v) items.push(v); }
  return items.sort((a, b) => a.at - b.at);
}
async function countPending() { setStatus({ pending: uid ? (await queued()).length : 0 }); }

// ── replay ──
let timer = 0, running = false;
function scheduleReplay(ms = 15000) { clearTimeout(timer); timer = setTimeout(replay, ms); }
export async function replay() {
  if (running || !uid) return;
  running = true;
  try {
    const items = await queued();
    if (!items.length) { setStatus({ offline: false, pending: 0 }); return; }
    let ok = true;
    try { const r = await fetch('/api/health', { cache: 'no-store' }); ok = r.ok; } catch { ok = false; }
    if (!ok) { setStatus({ offline: true }); scheduleReplay(); return; }
    setStatus({ offline: false });
    const dropped = [];
    for (const it of items) {
      let res;
      try {
        res = await fetch(it.path, { method: it.method, credentials: 'same-origin', headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(it.body) });
      } catch { setStatus({ offline: true }); scheduleReplay(); return; }
      if (res.status === 401) { scheduleReplay(); return; }               // log in again, then we continue
      if (!res.ok) dropped.push({ path: it.path, status: res.status });     // e.g. deleted meanwhile – give up on this one
      else { try { const data = await res.json(); if (cacheable('GET', it.path)) await remember(it.path, it.path.startsWith('/api/state/') ? { state: it.body.state, updatedAt: data.updatedAt } : data); } catch { /* */ } }
      await kv.del(qk(it.path));
    }
    await countPending();
    listeners.forEach(fn => { try { fn({ ...status, synced: items.length - dropped.length, dropped }); } catch { /* */ } });
  } finally { running = false; }
}

/** Forget everything cached for the current user (on logout). */
export async function clearOffline() {
  if (!uid) return;
  const prefix = `u${uid}:`;
  for (const k of await kv.keys()) if (typeof k === 'string' && k.startsWith(prefix)) await kv.del(k);
  try { localStorage.removeItem('hubtech.offline.status'); } catch { /* */ }
  setOfflineUser(null);
  setStatus({ offline: false, pending: 0 });
}

addEventListener('online', () => scheduleReplay(300));
setTimeout(() => { countPending().then(() => { if (status.pending) scheduleReplay(500); }); }, 1500);
