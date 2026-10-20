/** Starts a sync when HUBTECH is opened or comes back to the foreground, and tells the user when the
 *  background sync (server side, see server/autosync.py) has brought in changes from the other device. */
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { clearCaches } from '../core/services.js';
import { toast } from '../core/ui.js';

let enabled = null, lastRun = 0, lastSeen = 0, started = false;

function announce(r) {
  if (!r?.ok || !r.pulled || (r.at && r.at <= lastSeen)) return;
  lastSeen = r.at || Math.floor(Date.now() / 1000);
  clearCaches();
  toast('Nye ændringer fra den anden HUBTECH', { text: `${r.pulled} ændring${r.pulled === 1 ? '' : 'er'} hentet.`, ms: 9000, action: { label: 'Opdatér', onClick: () => location.reload() } });
}

async function runNow() {
  if (!enabled || document.hidden || Date.now() - lastRun < 60e3 || !store.get('user')) return;
  lastRun = Date.now();
  try { announce(await api.post('/api/sync/auto/run', { wait: true })); } catch { /* the status page shows errors */ }
}

async function check() {
  if (!store.get('user')) return;
  try {
    const st = await api.get('/api/sync/auto');
    const was = enabled;
    enabled = !!st.enabled;
    if (st.last?.at && !lastSeen) lastSeen = st.last.at;    // don't announce what happened before we opened
    else announce(st.last);
    if (enabled && !was) runNow();
  } catch { /* offline */ }
}

export function initAutoSync() {
  if (started) return;
  started = true;
  check();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); runNow(); } });
  setInterval(check, 60e3);
}
