/** HUBTECH as a desktop program: service worker, "install" prompt, app-window mode, shutdown. */
import { api } from './api.js';

const mq = (q) => { try { return matchMedia(q).matches; } catch { return false; } };

/** True when HUBTECH runs in its own window (installed PWA or the HUBTECH launcher's app window). */
export const isAppWindow = () =>
  mq('(display-mode: standalone)') || mq('(display-mode: window-controls-overlay)') || mq('(display-mode: minimal-ui)')
  || new URLSearchParams(location.search).get('source') === 'app' || sessionStorage.getItem('hubtech.app') === '1';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* */ } });

export const canInstall = () => !!deferredPrompt;
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const p = deferredPrompt;
  deferredPrompt = null;
  notify();
  p.prompt();
  try { return (await p.userChoice).outcome; } catch { return 'dismissed'; }
}

export async function systemInfo() {
  try { return await api.get('/api/system'); } catch { return null; }
}

/**
 * "Luk HUBTECH". In the program window started by HUBTECH.pyw, closing the window is enough –
 * the launcher then stops the server with its own one-time key. Otherwise the owner asks the
 * server directly (only allowed from the computer it runs on). Resolves 'closed' | 'stopped' | 'close-manually'.
 */
export async function shutdown(info) {
  if (info?.launcher && isAppWindow()) {
    try { fetch('/api/health?app=0', { keepalive: true }); } catch { /* */ }
    window.close();
    await new Promise(r => setTimeout(r, 400));
    return window.closed ? 'closed' : 'close-manually';
  }
  await api.post('/api/system/shutdown', {});
  setTimeout(() => { try { window.close(); } catch { /* */ } }, 300);
  return 'stopped';
}

export function initDesktop() {
  const root = document.documentElement;
  const sync = () => {
    const app = isAppWindow();
    if (app) { try { sessionStorage.setItem('hubtech.app', '1'); } catch { /* */ } }
    root.classList.toggle('is-app', app);
    root.classList.toggle('is-wco', !!navigator.windowControlsOverlay?.visible);
  };
  sync();
  // drop ?source=app from the address so links/bookmarks stay clean (the flag lives on in sessionStorage)
  if (new URLSearchParams(location.search).has('source')) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* */ }
  }
  try { matchMedia('(display-mode: standalone)').addEventListener('change', sync); } catch { /* */ }
  navigator.windowControlsOverlay?.addEventListener?.('geometrychange', sync);

  // heartbeat for the desktop launcher: it only stops the server once the window has stopped pinging
  if (isAppWindow()) {
    const ping = (v) => fetch(`/api/health?app=${v}`, { cache: 'no-store', keepalive: true, credentials: 'same-origin' }).catch(() => {});
    ping(1);
    setInterval(() => ping(1), 10000);
    addEventListener('pagehide', () => ping(0));
  }

  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; notify(); });
  addEventListener('appinstalled', () => { deferredPrompt = null; notify(); });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname))) {
    addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* optional */ }); }, { once: true });
  }
}
