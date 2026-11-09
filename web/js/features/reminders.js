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
import { nextStart, iso, parseIso } from './calrecur.js';
import { remindSettings, remindersBetween, eventReminders, eventOver } from './calremind.js';

/** The next few reminder times of a repeating event, from yesterday on: [{ at, date }] */
export function seriesReminders(e, now = Date.now(), n = 3) {
  const out = [];
  const y = new Date(now); y.setHours(0, 0, 0, 0); y.setDate(y.getDate() - 1);
  let d = nextStart(e, iso(y));
  while (d && out.length < n) {
    const at = remindAt({ due: d, dueTime: e.allDay ? '09:00' : (e.start || '09:00'), remind: e.remind });
    if (at) out.push({ at, date: d });
    const nx = parseIso(d); nx.setDate(nx.getDate() + 1);
    d = nextStart(e, iso(nx));
  }
  return out;
}

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
  const now = Date.now();
  let changed = false;
  const tasks = Array.isArray(st?.tasks) ? st.tasks : [];   // no tasks yet must not stop the calendar's reminders
  for (const t of tasks) {
    if (t.status === 'done' || t.reminded || !t.remind || t.remind === 'none') continue;
    const at = t.remindAt ?? remindAt(t);
    if (!at || at > now) continue;
    t.reminded = true; changed = true;
    if (now - at < 24 * 3600000 && once(`task-${t.id}-${at}`)) fire(t);   // don't nag about reminders that are more than a day old
  }
  if (changed && st) saveState('tasks', st);
  // Kalender: every reminder of every appointment (several each, any time before, quiet hours) – and my own
  // reminders for appointments in shared calendars. A reminder fires once on all my devices (firedReminders).
  let cal;
  try { cal = await getState('calendar', { force }); } catch { return; }
  if (!cal || !Array.isArray(cal.events)) return;
  let calChanged = false;
  const set = remindSettings(cal);
  const done = new Set(cal.firedReminders || []);
  for (const e of calendarSources(cal)) {
    if (!Array.isArray(e.reminders) && !e.repeat?.freq && e.reminded) continue;   // an old-style reminder that was already shown
    for (const x of remindersBetween(e, now - 24 * 3600e3, now, set)) {
      if (done.has(x.key) || (!Array.isArray(e.reminders) && x.at <= (e.lastRemind || 0))) continue;
      done.add(x.key); calChanged = true;
      if (eventOver(e, x.date, now)) continue;   // missed while HUBTECH was closed, and the appointment is over: no use now
      if (once(x.key)) fireEvent({ ...e, date: x.date }, x.key, set.how);
    }
  }
  // snoozed (Udsæt) and “bliv ved” reminders on this device
  const sz = snoozed();
  for (const [key, v] of Object.entries(sz)) if (v.at <= now) { delete sz[key]; saveSnoozed(sz); fireEvent(v.e, key, set.how, v.count || 0); }
  if (calChanged) cal.firedReminders = [...done].slice(-400);
  if (calChanged) saveState('calendar', cal);
  // the Android app shows the coming reminders as real notifications – also when HUBTECH is closed
  if (isAndroidApp()) scheduleReminders(upcoming(tasks, calendarSources(cal), now, remindSettings(cal)));
}

/** Pure: the next reminders (tasks + calendar) in the format the Android app schedules. */
export function upcoming(tasks = [], events = [], now = Date.now(), settings = remindSettings({})) {
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
    for (const x of remindersBetween(e, now + 1, now + 60 * 86400e3, settings)) {
      const when = `${new Date(`${x.date}T00:00`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${e.allDay ? '' : ` kl. ${e.start || ''}`}`;
      out.push({ id: x.key, at: x.at, title: e.title || 'Aftale', text: `${when}${e.location ? ` · ${e.location}` : ''}`, path: '/apps/calendar' });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}

/** My appointments and my own reminders for appointments in shared calendars. */
export function calendarSources(cal) {
  return [...(cal.events || []), ...Object.values(cal.personal || {}).filter(x => x && Array.isArray(x.reminders))];
}
const SNOOZE_KEY = 'hubtech.snoozed';
function snoozed() { try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; } }
function saveSnoozed(v) { try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(v)); } catch { /* */ } }
function snooze(key, e, ms, count = 0) { const v = snoozed(); v[key] = { at: Date.now() + ms, e: { id: e.id, title: e.title, date: e.date, start: e.start, allDay: e.allDay, location: e.location }, count }; saveSnoozed(v); }
function beep() {
  if (document.documentElement.classList.contains('work-calm')) return;   // Arbejdstilstand: no sounds
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22].forEach((t, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = i ? 880 : 660; g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22); });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* no sound */ }
}
let cardsEl = null;
function fireEvent(e, key = `event-${e.id}`, how = { system: true }, count = 0) {
  const when = `${new Date(`${e.date}T00:00`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${e.allDay ? '' : ` kl. ${e.start || ''}`}`;
  if (!cardsEl || !cardsEl.isConnected) { cardsEl = h('div', { class: 'rm-cards', role: 'region', 'aria-label': 'Påmindelser' }); document.body.appendChild(cardsEl); }
  cardsEl.querySelector(`[data-key="${CSS.escape(key)}"]`)?.remove();
  let nagT = 0;
  const close = () => { clearTimeout(nagT); card.remove(); };
  const later = (ms) => { snooze(key, e, ms); close(); toast('Påmindelsen er udsat', { ms: 1800 }); };
  const card = h('div', { class: 'rm-card', role: 'alert', dataset: { key } },
    h('div', { class: 'rm-card-h' }, icon('bell'), h('b', null, e.title || 'Aftale'), h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Luk', onclick: close }, icon('x'))),
    h('p', null, `${when}${e.location ? ` · ${e.location}` : ''}`),
    h('div', { class: 'rm-card-a' },
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: close }, 'Set'),
      ...[['5 min', 5 * 60e3], ['15 min', 15 * 60e3], ['1 time', 3600e3]].map(([l, ms]) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => later(ms) }, l)),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0); later(t - Date.now()); } }, 'I morgen'),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { close(); navigate('/apps/calendar'); } }, 'Åbn')));
  cardsEl.prepend(card);
  if (how.nag && count < 6) nagT = setTimeout(() => { if (card.isConnected) { snooze(key, e, 0, count + 1); card.remove(); } }, 5 * 60e3);
  if (how.sound) beep();
  if (how.system !== false && canNotify() && Notification.permission === 'granted') {
    try {
      const n = new Notification(`HUBTECH – ${e.title}`, { body: `${when}${e.location ? `\n${e.location}` : ''}`, icon: '/assets/icons/app-192.png', tag: key, renotify: count > 0 });
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
