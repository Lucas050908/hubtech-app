/** Small wrapper around the Android app's native bridge (window.HubtechAndroid). Everything is a no-op in a browser. */
const B = () => window.HubtechAndroid || null;
export const isAndroidApp = () => !!B();
const call = (name, ...args) => { const b = B(); if (!b || typeof b[name] !== 'function') return undefined; try { return b[name](...args); } catch { return undefined; } };

export function appInfo() { try { return JSON.parse(call('appInfo') || '{}'); } catch { return {}; } }

// reminders → Android notifications (survive closing the app and restarting the phone)
let lastReminders = '';
export function scheduleReminders(list) {
  if (!isAndroidApp()) return;
  const json = JSON.stringify(list);
  if (json === lastReminders) return;
  lastReminders = json;
  call('scheduleReminders', json);
}
export const notificationState = () => call('notificationState') || 'unsupported';
export function requestNotifications() {
  return new Promise((resolve) => {
    if (!isAndroidApp()) return resolve(false);
    const on = (e) => { removeEventListener('hubtech-notify', on); resolve(!!e.detail); };
    addEventListener('hubtech-notify', on);
    call('requestNotifications');
    setTimeout(() => resolve(notificationState() === 'granted'), 30000);
  });
}

// home screen widget
let lastWidget = '';
export function updateWidget(data) {
  if (!isAndroidApp()) return;
  const json = JSON.stringify(data);
  if (json === lastWidget) return;
  lastWidget = json;
  call('updateWidget', json);
}

// app lock
export const lockAvailable = () => !!call('lockAvailable');
export const lockEnabled = () => !!call('lockEnabled');
export const setLock = (on) => call('setLock', !!on);

// updates
export const installUpdate = (url) => call('installUpdate', url);
/** HUBTECH's page in the phone's settings (permissions: microphone, camera, notifications). */
export const openAppSettings = () => call('openAppSettings');

// which HUBTECH server the app shows: "" = the server inside the app, otherwise https://…
export const serverUrl = () => call('serverUrl') || '';
/** Switch to another HUBTECH server (checked first). Resolves with "ok" or a Danish error message. */
export const setServerUrl = (url) => new Promise((resolve) => setTimeout(() => resolve(call('setServerUrl', url) || 'Det virker ikke i denne version af appen.'), 0));
export const useLocalServer = () => call('useLocalServer');

// notifications from the shared server while the app is closed (checked in the background)
export const showNotification = (title, text, path) => call('showNotification', String(title || ''), String(text || ''), String(path || '/'));
export const backgroundNotify = () => !!call('backgroundNotify');
export const setBackgroundNotify = (on) => call('setBackgroundNotify', !!on);
