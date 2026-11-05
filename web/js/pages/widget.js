/**
 * "I dag" as a widget: a small, self-updating view of today – appointments (also repeating ones), deadlines you can tick
 * off, today's habits and a quick-add line. Opens at /widget, so it can be installed as its own little app on a phone
 * (Føj til hjemmeskærm) or on Windows (Edge/Chrome "Installér", or the "HUBTECH I dag" shortcut), and also lives in the
 * Android app's home screen widget.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { getState, saveState, flushState } from '../core/services.js';
import { buildToday, widgetData } from '../features/today.js';
import { isAndroidApp, updateWidget } from '../core/android.js';
import { parseQuick, nextStart, iso, parseIso } from '../features/calrecur.js';
import { canInstall, promptInstall, onInstallChange, isAppWindow } from '../core/desktop.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayKey = () => iso(new Date());
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/** What the quick-add line makes of a text (pure, exported for tests). */
export function quickKind(text) {
  const t = String(text || '').trim();
  if (/^(ny\s+)?opgave:?\s+|^husk:?\s+/i.test(t)) return ['task', t.replace(/^(ny\s+)?opgave:?\s+|^husk:?\s+/i, '')];
  if (/^(ny\s+)?note:?\s+/i.test(t)) return ['note', t.replace(/^(ny\s+)?note:?\s+/i, '')];
  if (/^(ny\s+)?aftale:?\s+/i.test(t)) return ['event', t.replace(/^(ny\s+)?aftale:?\s+/i, '')];
  return [parseQuick(t).found.some(f => f === 'tid' || f === 'dato' || f === 'gentag') ? 'event' : 'task', t];
}

export async function renderWidget() {
  if (!store.get('user')) { navigate('/login?next=/widget', { replace: true }); return h('div'); }
  document.documentElement.classList.add('is-widget');
  const clock = h('span', { class: 'wg-clock' });
  const dateEl = h('span', { class: 'wg-date' });
  const body = h('div', { class: 'wg-body', 'aria-live': 'polite' }, h('div', { class: 'skel', style: { height: '120px', borderRadius: '14px' } }));
  const input = h('input', { class: 'input', placeholder: 'Tilføj – fx “Tandlæge i morgen kl 10”', 'aria-label': 'Tilføj aftale eller opgave', maxlength: 200, enterkeyhint: 'done' });
  const hint = h('div', { class: 'wg-hint faint' });
  const installBtn = h('button', { type: 'button', class: 'btn btn-sm', hidden: true }, icon('download'), 'Installér');
  const smallBtn = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', title: 'Åbn I dag i et lille vindue' }, icon('external'), 'Lille vindue');
  const openBtn = h('a', { class: 'btn btn-sm btn-ghost', href: '/#/', target: isAppWindow() ? '_blank' : null }, icon('home'), 'Åbn HUBTECH');

  let data = {};
  function tick() {
    const n = new Date();
    clock.textContent = n.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    const ds = n.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
    dateEl.textContent = ds.charAt(0).toUpperCase() + ds.slice(1);
  }
  async function load(force = true) {
    const keys = ['calendar', 'tasks', 'habits', 'timesheet'];
    const vals = await Promise.all(keys.map(k => getState(k, { force }).catch(() => null)));
    keys.forEach((k, i) => { data[k] = vals[i] || {}; });
    draw();
  }
  function completeTask(t) {
    const st = data.tasks; const now = Date.now();
    t.status = 'done'; t.doneAt = now; t.updated = now;
    let next = null;
    if (t.repeat?.freq && t.due) {
      const d = parseIso(t.due > todayKey() ? t.due : todayKey()); d.setDate(d.getDate() + 1);
      next = nextStart({ date: t.due, repeat: t.repeat }, iso(d));
      if (next) { st.tasks.unshift({ ...t, id: uid(), status: 'todo', due: next, doneAt: null, reminded: false, created: now, updated: now, series: t.series || t.id }); delete t.repeat; }
    }
    saveState('tasks', st); flushState('tasks'); draw();
    toast('Færdig ✔', { type: 'ok', ms: 2200, text: next ? `${t.title} – næste gang ${parseIso(next).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' })}` : t.title,
      action: next ? null : { label: 'Fortryd', onClick: () => { t.status = 'todo'; t.doneAt = null; saveState('tasks', st); flushState('tasks'); draw(); } } });
  }
  function toggleHabit(x) {
    const k = todayKey();
    x.days = x.days.includes(k) ? x.days.filter(d => d !== k) : [...x.days, k].sort();
    saveState('habits', data.habits); flushState('habits'); draw();
  }
  function draw() {
    const t = buildToday({ calendar: data.calendar, tasks: data.tasks, timesheet: data.timesheet });
    if (isAndroidApp()) updateWidget(widgetData(t));   // keep the phone's home screen widget in step
    const tk = todayKey();
    const open = (data.tasks?.tasks || []).filter(x => x.status !== 'done' && x.due && x.due <= tk)
      .sort((a, b) => a.due.localeCompare(b.due) || String(a.dueTime || '99').localeCompare(String(b.dueTime || '99')));
    const events = t.agenda.filter(a => a.kind === 'event');
    const habits = data.habits?.habits || [];
    const timer = t.tiles.find(x => x.id === 'timer');
    h(clear(body), null,
      timer ? h('a', { class: 'wg-timer', href: '/#/apps/timesheet', target: '_blank' }, icon('stopwatch'), h('b', null, timer.value), h('span', null, timer.label)) : null,
      h('section', { class: 'wg-sec' }, h('h2', null, icon('calendar'), 'Aftaler', h('small', null, String(events.length || ''))),
        events.length ? h('ul', { class: 'wg-list' }, events.map(a => h('li', { style: a.color ? { '--dot': a.color } : null },
          h('span', { class: 'wg-time' }, a.time || 'Hele dagen'), h('span', { class: 'wg-what' }, h('b', null, a.title), a.sub && a.time ? h('span', null, a.sub) : null))))
          : h('p', { class: 'faint wg-none' }, 'Ingen aftaler i dag.')),
      h('section', { class: 'wg-sec' }, h('h2', null, icon('checkCircle'), 'Opgaver', h('small', null, String(open.length || ''))),
        open.length ? h('ul', { class: 'wg-list' }, open.slice(0, 8).map(x => h('li', { class: x.due < tk ? 'is-late' : null },
          h('button', { type: 'button', class: 'wg-check', 'aria-label': `Færdig: ${x.title}`, onclick: () => completeTask(x) }),
          h('span', { class: 'wg-what' }, h('b', null, x.title), h('span', null, x.due < tk ? 'Overskredet' : x.dueTime ? `Kl. ${x.dueTime}` : 'I dag')))))
          : h('p', { class: 'faint wg-none' }, 'Ingen deadlines i dag. 🎉')),
      habits.length ? h('section', { class: 'wg-sec' }, h('h2', null, icon('flame'), 'Vaner', h('small', null, `${habits.filter(x => x.days.includes(tk)).length}/${habits.length}`)),
        h('div', { class: 'wg-habits' }, habits.map(x => h('button', { type: 'button', class: ['wg-habit', x.days.includes(tk) && 'is-on'], 'aria-pressed': String(x.days.includes(tk)), onclick: () => toggleHabit(x) }, h('span', { 'aria-hidden': 'true' }, x.emoji || '⭐'), x.name)))) : null,
      t.tomorrowCount ? h('p', { class: 'faint wg-tomorrow' }, `I morgen: ${t.tomorrowCount} ${t.tomorrowCount === 1 ? 'aftale eller deadline' : 'aftaler og deadlines'}.`) : null);
  }
  async function add() {
    const raw = input.value.trim(); if (!raw) return;
    const [kind, text] = quickKind(raw);
    const now = Date.now();
    if (kind === 'event') {
      const r = parseQuick(text);
      const st = data.calendar; st.events = Array.isArray(st.events) ? st.events : [];
      st.events.push({ id: uid(), title: r.title || text, date: r.date, endDate: null, allDay: r.allDay, start: r.start, end: r.end, location: r.location, notes: '', color: '#38bdf8', remind: r.allDay ? 'none' : 'm15', ...(r.repeat ? { repeat: r.repeat } : {}) });
      saveState('calendar', st); flushState('calendar');
      toast('Lagt i kalenderen', { type: 'ok', ms: 2000, text: `${r.title} – ${parseIso(r.date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${r.start ? ` kl. ${r.start}` : ''}` });
    } else if (kind === 'task') {
      const r = parseQuick(text), dated = r.found.includes('dato') || r.found.includes('tid');
      const st = data.tasks; st.tasks = Array.isArray(st.tasks) ? st.tasks : [];
      st.tasks.unshift({ id: uid(), title: (dated ? r.title : text).slice(0, 200), notes: '', status: 'todo', prio: 'med', due: dated ? r.date : todayKey(), dueTime: r.start, project: null, remind: 'none', created: now, updated: now });
      saveState('tasks', st); flushState('tasks');
      toast('Opgave tilføjet', { type: 'ok', ms: 1800, text: text });
    } else {
      const st = (await getState('notes', { force: true }).catch(() => null)) || { notes: [] };
      st.notes = Array.isArray(st.notes) ? st.notes : [];
      st.notes.unshift({ id: uid(), title: text.slice(0, 160), body: '', pinned: false, color: '', created: now, updated: now });
      saveState('notes', st); flushState('notes');
      toast('Note gemt', { type: 'ok', ms: 1800, text });
    }
    input.value = ''; hint.textContent = ''; draw();
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  input.addEventListener('input', () => {
    const v = input.value.trim(); if (!v) { hint.textContent = ''; return; }
    const [kind, text] = quickKind(v), r = parseQuick(text);
    hint.textContent = kind === 'event' ? `Aftale: ${r.title} – ${parseIso(r.date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${r.start ? ` kl. ${r.start}` : ''}` : kind === 'task' ? `Opgave: ${text}` : `Note: ${text}`;
  });

  const syncInstall = () => { installBtn.hidden = !canInstall(); };
  const offInstall = onInstallChange(syncInstall); syncInstall();
  installBtn.addEventListener('click', () => promptInstall());
  smallBtn.hidden = isAppWindow() || innerWidth < 700;
  smallBtn.addEventListener('click', () => { window.open('/widget', 'hubtech-i-dag', 'popup,width=400,height=680'); });
  const iosTip = isIos() && !isAppWindow() ? h('p', { class: 'faint wg-tip' }, icon('info'), 'Læg “I dag” på hjemmeskærmen: tryk ', h('b', null, 'Del'), ' og så ', h('b', null, 'Føj til hjemmeskærm'), '.') : null;

  tick(); load(true);
  const t1 = setInterval(tick, 15000);
  const t2 = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 60000);
  const onVis = () => { if (document.visibilityState === 'visible') { tick(); load(true); } };
  document.addEventListener('visibilitychange', onVis);
  const root = h('main', { class: 'wg', 'aria-label': 'I dag' },
    h('header', { class: 'wg-head' }, h('div', null, clock, dateEl), h('div', { class: 'wg-head-btns' }, installBtn, smallBtn, openBtn)),
    h('div', { class: 'wg-add' }, icon('plus'), input), hint,
    body, iosTip);
  // stop when the page is left
  const mo = new MutationObserver(() => { if (!root.isConnected) { clearInterval(t1); clearInterval(t2); document.removeEventListener('visibilitychange', onVis); offInstall(); document.documentElement.classList.remove('is-widget'); mo.disconnect(); } });
  setTimeout(() => mo.observe(document.body, { childList: true, subtree: true }), 0);
  return root;
}
