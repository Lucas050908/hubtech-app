/**
 * The Android app keeps itself up to date: once a day it asks whether a newer version is out and offers to
 * install it (on top of the old one – the data stays). The Windows app is updated by Microsoft Store.
 */
import { api } from '../core/api.js';
import { toast } from '../core/ui.js';
import { isAndroidApp, appInfo, installUpdate } from '../core/android.js';

const KEY = 'hubtech.updateCheck';

export async function checkAppUpdate({ force = false } = {}) {
  if (!isAndroidApp()) return;
  try {
    if (!force && Date.now() - Number(localStorage.getItem(KEY) || 0) < 20 * 3600e3) return;
    localStorage.setItem(KEY, String(Date.now()));
  } catch { /* private mode: check anyway */ }
  let r;
  try { r = await api.get('/api/system/android-update'); } catch { return; }
  if (!r?.ok || !(r.versionCode > (appInfo().versionCode || 0))) return;
  toast(`HUBTECH ${r.version} er klar`, { type: 'info', icon: 'download', ms: 20000,
    text: 'En nyere version af appen. Den installeres oven på den gamle – dine data bliver.',
    action: { label: 'Opdatér nu', onClick: () => installUpdate(r.apkUrl) } });
}
