/**
 * Live updates from the server (chat, typing, music, shared calendars, notifications).
 * One long-poll loop per tab: GET /api/live?since=N waits up to 25 s for something new.
 *   onLive('msg', fn)   – fn(event); returns an unsubscribe function
 *   onLive('*', fn)     – every event
 */
import { store } from './store.js';
import { toast } from './ui.js';
import { navigate } from './router.js';
import { getNotify, pling } from '../features/appsettings.js';
import { api } from './api.js';
import { isAndroidApp, showNotification } from './android.js';

const subs = new Map();
let running = false, seq = 0, primed = false, ctrl = null, clockOffset = 0, failures = 0;

export function onLive(type, fn) {
  if (!subs.has(type)) subs.set(type, new Set());
  subs.get(type).add(fn);
  startLive();
  return () => subs.get(type)?.delete(fn);
}

/** server time in ms (for synced music) */
export function serverNow() { return Date.now() + clockOffset; }
export function noteServerTime(now) { if (typeof now === 'number') clockOffset = now - Date.now(); }

function emit(ev) {
  for (const key of [ev.type, '*']) for (const fn of subs.get(key) || []) { try { fn(ev); } catch (e) { console.error('live', e); } }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(path, signal) {
  const r = await fetch(path, { credentials: 'same-origin', signal, headers: { 'Accept': 'application/json', 'X-Requested-With': 'hubtech' } });
  if (r.status === 401) throw Object.assign(new Error('401'), { status: 401 });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export function startLive() {
  if (running || !store.get('user')) return;
  running = true;
  (async () => {
    while (running && store.get('user')) {
      ctrl = new AbortController();
      try {
        const t0 = Date.now();
        const d = await get(`/api/live?since=${seq}&wait=${document.hidden ? 25 : 20}`, ctrl.signal);
        if (d.now) clockOffset = d.now - (t0 + Date.now()) / 2;
        const first = !primed;   // the first answer only tells where we are (seq can be 0 right after the server started)
        if (d.reset && !first) emit({ type: 'reset' });
        seq = d.seq || seq; primed = true;
        failures = 0;
        if (!first) for (const ev of d.events || []) emit(ev);
      } catch (e) {
        if (e.name === 'AbortError') continue;
        if (e.status === 401) break;
        failures++;
        await sleep(Math.min(30000, 1500 * failures));
        if (failures > 1) { seq = 0; primed = false; }   // the server may have restarted: start over (pages reload on 'reset')
        if (failures === 2) emit({ type: 'reset' });
      }
    }
    running = false;
  })();
}

export function stopLive() { running = false; seq = 0; primed = false; try { ctrl?.abort(); } catch { /* */ } }

// ── notifications (friend requests, snaps, invitations, mentions …) ──
let lastPing = 0;
function notify(title, text, path) {
  if (document.hidden && isAndroidApp()) { showNotification(title, text, path); return; }
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { const n = new Notification(title, { body: text, icon: '/assets/icons/app-192.png', tag: path || title }); n.onclick = () => { window.focus(); if (path) navigate(path); n.close(); }; return; } catch { /* */ }
  }
  toast(title, { text, icon: 'bell', action: path ? { label: 'Åbn', onClick: () => navigate(path) } : undefined, ms: 6000 });
  if (Date.now() - lastPing > 4000) { lastPing = Date.now(); try { navigator.vibrate?.(40); } catch { /* */ } }
}
const KIND = { friend: 'friend', snap: 'snap', 'cal-invite': 'calendar', report: 'report' };
// the owner changed my access (fx to Admin) – fetch my profile again so menus update
onLive('me-changed', () => { api.get('/api/me').then(r => store.set('user', r.user)).catch(() => {}); });
onLive('notify', (ev) => { const k = KIND[ev.kind]; if (k && getNotify()[k] === false) return; pling(); notify(ev.title, ev.text, ev.path); });
onLive('msg', (ev) => {
  const me = store.get('user');
  if (!me || ev.message?.user?.id === me.id) return;
  const here = location.hash.includes(ev.channel);
  if (here && !document.hidden) return;
  const dm = ev.channel.startsWith('dm-');
  const mentioned = (ev.mentions || []).includes(me.id);
  if (!dm && !mentioned) return;
  const pref = getNotify();
  if ((dm && !pref.dm) || (!dm && !pref.mention)) return;
  pling();
  const body = ev.message.body || (ev.message.file ? 'Sendte en fil' : 'Delte noget');
  const path = dm ? `/apps/community/dm/${ev.channel}` : `/apps/community/c/${ev.channel}`;
  notify(dm ? ev.message.user.name : `${ev.message.user.name} nævnte dig`, body.slice(0, 140), path);
});
store.on('user', (u) => { if (u) startLive(); else stopLive(); });
