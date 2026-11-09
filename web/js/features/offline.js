/**
 * The Android app works on its own: when the computer with HUBTECH is off, the app uses the HUBTECH inside the
 * phone meanwhile. This says so – and offers to switch back as soon as the computer answers again.
 */
import { api } from '../core/api.js';
import { toast } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { isAndroidApp, offlineState, backToRemote } from '../core/android.js';

let shown = false;
export async function initOffline() {
  if (!isAndroidApp() || shown) return;
  const st = offlineState();
  window.hubtechServerBack = () => toast('Computeren er tændt igen', { type: 'ok', icon: 'monitor', ms: 30000,
    text: 'Skift tilbage for at skrive og ringe med dine venner. Dine noter og opgaver synkroniseres.',
    action: { label: 'Skift tilbage', onClick: () => backToRemote() } });
  if (!st.offline) return;
  shown = true;
  let synced = false;
  try { synced = !!(await api.get('/api/sync/auto')).enabled; } catch { /* not logged in yet */ }
  toast('Du bruger HUBTECH på telefonen', { type: 'info', icon: 'smartphone', ms: 16000,
    text: synced ? 'Computeren er slukket. Dine ting synkroniseres med den, når den er tændt igen. Chat og opkald med venner kræver computeren.'
      : 'Computeren er slukket. Slå automatisk synkronisering til, så dine noter, opgaver og dokumenter følger med mellem telefon og computer.',
    action: synced ? null : { label: 'Slå synkronisering til', onClick: () => navigate('/settings/data') } });
}
