/**
 * Reminders for Opgaver and Kalender: a task with a deadline can remind you (at the deadline, 15 min / 1 hour
 * before, or the day before at 9:00). Runs on every page while you are logged in; shows a toast
 * and – when allowed – a system notification (works best when HUBTECH runs as a program).
 */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { store } from '../core/store.js';
import { getState, saveState } from '../core/services.js';
import { navigate } from '../core/router.js';
import { isAndroidApp, scheduleReminders } from '../core/android.js';

export const REMIND = {
  none: { label: 'Ingen påmindelse', short: '' },
  at: { label: 'Påmind ved deadline', short: 'Ved deadline' },
  m15: { label: 'Påmind 15 min før', short: '15 min før' },
  h1: { label: 'Påmind 1 time før', short: '1 time før' },
  d1: { label: 'Påmind dagen før kl. 9', short: 'Dagen før' },
};

/** When (ms) the reminder for a task fires, or null. Without a time the deadline counts as 9:00. */
export function remindAt(t) {
  if (!t.due || !t.remind || t.remind === 'none') return null;
  const [y, m, d] = t.due.split('-').map(Number);
  const [hh, mm] = (t.dueTime || '09:00').split(':').map(Number);
  const due = new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
  switch (t.remind) {
    case 'm15': return due - 15 * 60000;
    case 'h1': return due - 3600000;
    case 'd1': return new Date(y, m - 1, d - 1, 9, 0).getTime();
    default: return due;
  }
}

const canNotify = () => 'Notification' in window;
/** "Slå notifikationer til" – only shown while the browser hasn't been asked yet. */
export function notifyPermissionButton() {
  if (!canNotify() || Notification.permission !== 'default') return null;
  const b = h('button', { type: 'button', class: 'btn btn-sm', style: { justifySelf: 'start' } }, icon('bell'), 'Slå notifikationer til');
  b.addEventListener('click', async () => {
    const r = await Notification.requestPermission().catch(() => 'denied');
    b.remove();
    toast(r === 'granted' ? 'Notifikationer er slået til' : 'Notifikationer er ikke slået til', { type: r === 'granted' ? 'ok' : 'warn', text: r === 'granted' ? 'Påmindelser vises også, når HUBTECH ligger i baggrunden.' : 'Påmindelser vises stadig inde i HUBTECH.' });
  });
  return b;
}

function fire(t) {
  const when = t.due ? new Date(`${t.due}T${t.dueTime || '09:00'}`).toLocaleString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  toast('Påmindelse', { type: 'warn', text: `${t.title}${when ? ` – deadline ${when}` : ''}`, ms: 12000, action: { label: 'Åbn Opgaver', onClick: () => navigate('/apps/tasks') } });
  if (canNotify() && Notification.permission === 'granted') {
    try {
      const n = new Notification('HUBTECH – påmindelse', { body: `${t.title}${when ? `\nDeadline: ${when}` : ''}`, icon: '/assets/icons/app-192.png', tag: `task-${t.id}` });
      n.onclick = () => { window.focus(); navigate('/apps/tasks'); n.close(); };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }
}

let timer = 0, lastFetch = 0, running = false;
// reminders already shown on this device – overlapping checks, a reload or an older copy of the list saved from
// another page (which loses the `reminded` flag) must never show the same reminder twice
const FIRED_KEY = 'hubtech.reminded';
const fired = new Set((() => { try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '[]'); } catch { return []; } })());
const once = (key) => {
  if (fired.has(key)) return false;
  fired.add(key);
  try { localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-300))); } catch { /* private mode */ }
  return true;
};
async function check() {
  if (!store.get('user') || running) return;
  running = true;
  try { await checkNow(); } finally { running = false; }
}
async function checkNow() {
  let st;
  const force = Date.now() - lastFetch > 10 * 60000;   // pick up changes from other devices now and then
  try { st = await getState('tasks', { force }); } catch { return; }
  if (force) lastFetch = Date.now();
  if (!st || !Array.isArray(st.tasks)) return;
  const now = Date.now();
  let changed = false;
  for (const t of st.tasks) {
    if (t.status === 'done' || t.reminded || !t.remind || t.remind === 'none') continue;
    const at = t.remindAt ?? remindAt(t);
    if (!at || at > now) continue;
    t.reminded = true; changed = true;
    if (now - at < 24 * 3600000 && once(`task-${t.id}-${at}`)) fire(t);   // don't nag about reminders that are more than a day old
  }
  if (changed) saveState('tasks', st);
  // Kalender: same rules, the event's date + start time is the "deadline"
  let cal;
  try { cal = await getState('calendar', { force }); } catch { return; }
  if (!cal || !Array.isArray(cal.events)) return;
  let calChanged = false;
  for (const e of cal.events) {
    if (e.reminded || !e.remind || e.remind === 'none') continue;
    const at = e.remindAt ?? remindAt({ due: e.date, dueTime: e.allDay ? '09:00' : (e.start || '09:00'), remind: e.remind });
    if (!at || at > now) continue;
    e.reminded = true; calChanged = true;
    if (now - at < 24 * 3600000 && once(`event-${e.id}-${at}`)) fireEvent(e);
  }
  if (calChanged) saveState('calendar', cal);
  // the Android app shows the coming reminders as real notifications – also when HUBTECH is closed
  if (isAndroidApp()) scheduleReminders(upcoming(st.tasks, cal.events, now));
}

/** Pure: the next reminders (tasks + calendar) in the format the Android app schedules. */
export function upcoming(tasks = [], events = [], now = Date.now()) {
  const out = [];
  const fmt = (t) => new Date(t).toLocaleString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  for (const t of tasks) {
    if (t.status === 'done' || t.reminded || !t.remind || t.remind === 'none') continue;
    const at = t.remindAt ?? remindAt(t);
    if (!at || at <= now || at - now > 60 * 86400e3) continue;
    const due = t.due ? new Date(`${t.due}T${t.dueTime || '09:00'}`).getTime() : at;
    out.push({ id: `task-${t.id}`, at, title: t.title || 'Opgave', text: `Deadline ${fmt(due)}`, path: '/apps/tasks' });
  }
  for (const e of events) {
    if (e.reminded || !e.remind || e.remind === 'none') continue;
    const at = e.remindAt ?? remindAt({ due: e.date, dueTime: e.allDay ? '09:00' : (e.start || '09:00'), remind: e.remind });
    if (!at || at <= now || at - now > 60 * 86400e3) continue;
    const when = `${new Date(`${e.date}T00:00`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${e.allDay ? '' : ` kl. ${e.start || ''}`}`;
    out.push({ id: `event-${e.id}`, at, title: e.title || 'Aftale', text: `${when}${e.location ? ` · ${e.location}` : ''}`, path: '/apps/calendar' });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}

function fireEvent(e) {
  const when = `${new Date(`${e.date}T00:00`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${e.allDay ? '' : ` kl. ${e.start || ''}`}`;
  toast('Aftale', { type: 'info', icon: 'calendar', text: `${e.title} – ${when}${e.location ? ` · ${e.location}` : ''}`, ms: 12000, action: { label: 'Åbn Kalender', onClick: () => navigate('/apps/calendar') } });
  if (canNotify() && Notification.permission === 'granted') {
    try {
      const n = new Notification(`HUBTECH – ${e.title}`, { body: `${when}${e.location ? `\n${e.location}` : ''}`, icon: '/assets/icons/app-192.png', tag: `event-${e.id}` });
      n.onclick = () => { window.focus(); navigate('/apps/calendar'); n.close(); };
    } catch { /* */ }
  }
}

export function startReminders() {
  clearInterval(timer); clearTimeout(startT);
  timer = setInterval(check, 30000);
  startT = setTimeout(check, 4000);
}
let startT = 0;
export function stopReminders() { clearInterval(timer); timer = 0; lastFetch = 0; }
