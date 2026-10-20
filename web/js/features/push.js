/**
 * Real notifications on this device when HUBTECH is closed.
 *  - Browsers (Chrome, Edge, Firefox, Android, iPhone with HUBTECH on the home screen): web push through the service worker.
 *  - The Android app: it checks for news in the background (needs notifications allowed and a shared server).
 * While HUBTECH is open but in the background, the system shows the notification as well (systemNotify).
 */
import { api } from '../core/api.js';
import * as droid from '../core/android.js';

const b64ToBytes = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const secure = () => window.isSecureContext;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** What this device can do: 'android' | 'ready' | 'on' | 'denied' | 'ios-home' | 'insecure' | 'unsupported'. */
export async function pushState() {
  if (droid.isAndroidApp()) return 'android';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !standalone() ? 'ios-home' : (secure() ? 'unsupported' : 'insecure');
  if (!secure()) return 'insecure';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && await reg.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === 'granted' ? 'on' : 'ready';
}

export async function enablePush() {
  if (droid.isAndroidApp()) { const ok = await droid.requestNotifications(); droid.setBackgroundNotify(true); return ok ? 'android' : 'denied'; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  let reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const { pushKey } = await api.get('/api/notify/prefs');
  let sub = await reg.pushManager.getSubscription();
  if (sub) { const k = sub.options?.applicationServerKey; if (k && btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== pushKey) { await sub.unsubscribe(); sub = null; } }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pushKey) });
  await api.post('/api/notify/push', { endpoint: sub.endpoint });
  return 'on';
}

export async function disablePush() {
  if (droid.isAndroidApp()) { droid.setBackgroundNotify(false); return; }
  const reg = await navigator.serviceWorker?.getRegistration('/');
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await api.post('/api/notify/push/remove', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
}

/** When HUBTECH is open but not in front: show it as a system notification too. */
export async function systemNotify(title, text, path) {
  if (!document.hidden) return;
  if (droid.isAndroidApp()) { droid.showNotification(title, text, path); return; }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/');
    if (reg) await reg.showNotification(title, { body: text, icon: '/assets/icons/app-192.png', tag: `ht-live-${path}`, data: { path } });
    else new Notification(title, { body: text, icon: '/assets/icons/app-192.png' });
  } catch { /* */ }
}

// the service worker asks an open window to go to a page (notification tapped)
navigator.serviceWorker?.addEventListener?.('message', (e) => { if (e.data?.type === 'open' && e.data.path) location.hash = `#${e.data.path}`; });
