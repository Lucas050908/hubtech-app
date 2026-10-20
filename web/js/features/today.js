/** "I dag" on the home screen: today's appointments and deadlines plus what needs attention across the apps. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { getState } from '../core/services.js';
import { isDue, isNew } from './srs.js';
import { invoiceState, isoDate, totals, kr } from './invoice.js';
import { isAndroidApp, updateWidget } from '../core/android.js';

const hm = (t) => new Date(t).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m} min`; };

/** Pure: build the agenda and the attention tiles from the apps' states (exported for tests). */
export function buildToday({ calendar, tasks, flashcards, inventory, timesheet, customers }, now = Date.now()) {
  const today = isoDate(now), tomorrow = isoDate(now + 86400e3);
  const agenda = [];
  for (const e of calendar?.events || []) {
    if (e.date <= today && (e.endDate || e.date) >= today) agenda.push({ kind: 'event', time: e.allDay || !e.start ? '' : e.start, title: e.title, sub: [e.allDay || !e.start ? 'Hele dagen' : e.end ? `${e.start}–${e.end}` : e.start, e.location].filter(Boolean).join(' · '), href: '#/apps/calendar', color: e.color });
  }
  const open = (tasks?.tasks || []).filter(t => t.status !== 'done' && t.due);
  for (const t of open) {
    if (t.due < today) agenda.push({ kind: 'overdue', time: '', title: t.title, sub: 'Overskredet deadline', href: '#/apps/tasks' });
    else if (t.due === today) agenda.push({ kind: 'task', time: t.dueTime || '', title: t.title, sub: t.dueTime ? `Deadline kl. ${t.dueTime}` : 'Deadline i dag', href: '#/apps/tasks' });
  }
  const order = { overdue: 0, event: 1, task: 1 };
  agenda.sort((a, b) => (order[a.kind] - order[b.kind]) || (a.time || '99').localeCompare(b.time || '99'));

  const tiles = [];
  const r = timesheet?.running;
  if (r) tiles.push({ id: 'timer', icon: 'stopwatch', value: dur(now - r.start), label: `Uret kører${r.project ? ` · ${r.project}` : ''}`, href: '#/apps/timesheet', hot: true });
  const todayMs = (timesheet?.entries || []).filter(e => e.end && isoDate(e.start) === today).reduce((a, e) => a + (e.end - e.start), 0);
  if (todayMs) tiles.push({ id: 'hours', icon: 'clock', value: dur(todayMs), label: 'Registreret i dag', href: '#/apps/timesheet' });
  const cards = Array.isArray(flashcards?.cards) ? flashcards.cards : [];
  const fc = cards.filter(c => !isNew(c) && isDue(c, now)).length + Math.min(20, cards.filter(isNew).length);
  if (fc) tiles.push({ id: 'cards', icon: 'layers', value: String(fc), label: 'Huskekort klar', href: '#/learn/flashcards/study/all' });
  const low = (inventory?.items || []).filter(it => (it.min || 0) > 0 && (it.qty || 0) <= it.min).length;
  if (low) tiles.push({ id: 'stock', icon: 'box', value: String(low), label: 'Lav lagerbeholdning', href: '#/apps/inventory', warn: true });
  const overdue = (customers?.invoices || []).filter(i => invoiceState(i, today).key === 'overdue');
  if (overdue.length) tiles.push({ id: 'invoices', icon: 'file', value: kr(overdue.reduce((a, i) => a + totals(i.lines, i.vat).gross, 0)), label: `${overdue.length} forfalden${overdue.length === 1 ? '' : 'e'} faktura${overdue.length === 1 ? '' : 'er'}`, href: '#/apps/customers', warn: true });
  const tomorrowCount = (calendar?.events || []).filter(e => e.date <= tomorrow && (e.endDate || e.date) >= tomorrow).length + open.filter(t => t.due === tomorrow).length;
  return { agenda, tiles, tomorrowCount };
}

/** Pure: what the Android home screen widget shows (title, a sub line and up to five lines). */
export function widgetData(t, now = new Date()) {
  const lines = t.agenda.map(a => `${a.kind === 'overdue' ? '⚠ ' : a.time ? a.time + '  ' : '• '}${a.title}`);
  for (const x of t.tiles) if (x.id !== 'hours') lines.push(`${x.value} – ${x.label}`);
  const n = t.agenda.length;
  return {
    title: `I dag · ${now.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' })}`,
    sub: n ? `${n} ting på programmet · opdateret ${now.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}` : `Intet på programmet · opdateret ${now.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`,
    lines: lines.slice(0, 5),
  };
}

export function todayPanel() {
  const date = new Date().toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
  const body = h('div', { class: 'today-body' }, h('div', { class: 'skel', style: { height: '86px', borderRadius: '14px' } }));
  const el = h('section', { class: 'glass panel today-panel', 'aria-labelledby': 'today-title' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title', id: 'today-title' }, icon('calendar'), 'I dag', h('span', { class: 'today-date' }, date))),
    body);
  let timer = 0, loaded = false;
  // first load fetches fresh data (other devices and Servicehjælp save on their own); the minute ticks reuse it
  const load = () => Promise.all(['calendar', 'tasks', 'flashcards', 'inventory', 'timesheet', 'customers'].map(k => getState(k, { force: !loaded }).catch(() => null))).then(([calendar, tasks, flashcards, inventory, timesheet, customers]) => {
    loaded = true;
    if (!el.isConnected && timer) { clearInterval(timer); return; }
    const t = buildToday({ calendar, tasks, flashcards, inventory, timesheet, customers });
    if (isAndroidApp()) updateWidget(widgetData(t));
    clear(body);
    if (t.tiles.length) body.append(h('div', { class: 'today-tiles' }, t.tiles.map(x => h('a', { class: ['today-tile', x.hot && 'is-hot', x.warn && 'is-warn'], href: x.href, dataset: { tile: x.id } },
      h('span', { class: 'today-tile-ic' }, icon(x.icon)), h('span', { class: 'today-tile-txt' }, h('b', null, x.value), h('span', null, x.label))))));
    if (t.agenda.length) body.append(h('ul', { class: 'today-agenda' }, t.agenda.map(a => h('li', null, h('a', { href: a.href, class: `is-${a.kind}`, style: a.color ? { '--dot': a.color } : null },
      h('span', { class: 'today-time' }, a.kind === 'overdue' ? icon('alert') : a.time || '·'), h('span', { class: 'today-what' }, h('b', null, a.title), h('span', null, a.sub)))))));
    if (!t.tiles.length && !t.agenda.length) body.append(h('div', { class: 'today-empty' }, icon('sparkles'), h('div', null, h('b', null, 'Ingen aftaler eller deadlines i dag.'), h('span', null, ' Et godt tidspunkt at lære noget nyt – '), h('a', { href: '#/learn' }, 'gå til Guides & Læring'), '.')));
    if (t.tomorrowCount) body.append(h('p', { class: 'faint today-tomorrow' }, `I morgen: ${t.tomorrowCount} ${t.tomorrowCount === 1 ? 'aftale eller deadline' : 'aftaler og deadlines'}.`));
  });
  load();
  timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); return; } load(); }, 60e3);   // keeps a running timer's minutes current
  return el;
}
