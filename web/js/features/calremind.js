/**
 * Calendar reminders you decide over: several per appointment, any time before (minutes, hours, days, weeks – with a
 * time of day for days and weeks) or on a set date and time, your own time for all-day events, how they reach you
 * (pop-up, notification, sound, keep reminding until you press Set), quiet hours, and standard reminders for new
 * appointments in each calendar. The pure parts are tested in tests/apps.test.mjs.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { nextStart, iso, parseIso } from './calrecur.js';

export const UNITS = [['min', 'minutter'], ['hour', 'timer'], ['day', 'dage'], ['week', 'uger'], ['abs', 'på dato']];
const MS = { min: 60e3, hour: 3600e3 };
let n = 0;
const rid = () => `r${Date.now().toString(36)}${(n++).toString(36)}`;

/** The settings, with defaults. */
export function remindSettings(st = {}) {
  const s = st.remindSettings || {};
  return {
    defaults: Array.isArray(s.defaults) ? s.defaults : [{ id: 'd1', n: 15, unit: 'min' }],
    allDayDefaults: Array.isArray(s.allDayDefaults) ? s.allDayDefaults : [{ id: 'd2', n: 1, unit: 'day', time: '18:00' }],
    allDayTime: /^\d\d:\d\d$/.test(s.allDayTime || '') ? s.allDayTime : '09:00',
    perCal: s.perCal && typeof s.perCal === 'object' ? s.perCal : {},
    how: { system: true, sound: false, nag: false, ...(s.how || {}) },
    quiet: { on: false, from: '22:00', to: '07:00', weekend: false, ...(s.quiet || {}) },
  };
}

/** The reminders of an appointment – new style, or the old single choice. */
export function eventReminders(e) {
  if (Array.isArray(e?.reminders)) return e.reminders;
  return ({ at: [{ id: 'l', n: 0, unit: 'min' }], m15: [{ id: 'l', n: 15, unit: 'min' }], h1: [{ id: 'l', n: 1, unit: 'hour' }], d1: [{ id: 'l', n: 1, unit: 'day', time: '09:00' }] })[e?.remind] || [];
}

/** Standard reminders for a new appointment in a calendar ('' = my own). */
export function defaultsFor(settings, calId = '', allDay = false) {
  const list = allDay ? settings.allDayDefaults : (settings.perCal[calId || 'mine'] || settings.defaults);
  return list.map(r => ({ ...r, id: rid() }));
}

/** When (ms) one reminder fires for the appointment on `date`. */
export function reminderAt(r, { date, start, allDay }, allDayTime = '09:00') {
  if (r.unit === 'abs') { const t = r.abs ? new Date(r.abs).getTime() : NaN; return Number.isFinite(t) ? t : null; }
  const d = parseIso(date);
  const [hh, mm] = (allDay ? allDayTime : (start || allDayTime)).split(':').map(Number);
  const begin = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0).getTime();
  const k = Math.max(0, Number(r.n) || 0);
  if (r.unit === 'min' || r.unit === 'hour') return begin - k * MS[r.unit];
  const days = r.unit === 'week' ? k * 7 : k;
  if (r.time && /^\d\d:\d\d$/.test(r.time)) {
    const [th, tm] = r.time.split(':').map(Number);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days, th, tm).getTime();
  }
  return begin - days * 86400e3;
}

/** "15 min før", "2 dage før kl. 18:00", "Når den starter", "Den 12. nov. kl. 08:00" */
export function reminderLabel(r) {
  if (r.unit === 'abs') return r.abs ? `Den ${new Date(r.abs).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'På en dato';
  const k = Number(r.n) || 0;
  if (!k && (r.unit === 'min' || r.unit === 'hour')) return 'Når den starter';
  const unit = { min: 'min', hour: k === 1 ? 'time' : 'timer', day: k === 1 ? 'dag' : 'dage', week: k === 1 ? 'uge' : 'uger' }[r.unit] || '';
  const when = r.unit === 'day' && k === 1 ? 'Dagen før' : r.unit === 'day' && k === 0 ? 'Samme dag' : `${k} ${unit} før`;
  return `${when}${(r.unit === 'day' || r.unit === 'week') && r.time ? ` kl. ${r.time}` : ''}`;
}

/** A reminder that falls in quiet time comes when the quiet time ends (it isn't lost). */
export function afterQuiet(ms, q) {
  if (!q?.on && !q?.weekend) return ms;
  let t = new Date(ms);
  for (let guard = 0; guard < 4; guard++) {
    const day = t.getDay();
    if (q.weekend && (day === 0 || day === 6)) {   // to Monday at the end of the night's quiet time (or 8:00)
      const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() + (day === 6 ? 2 : 1));
      const [h2, m2] = (q.on ? q.to : '08:00').split(':').map(Number);
      t = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate(), h2, m2); continue;
    }
    if (q.on) {
      const [fh, fm] = q.from.split(':').map(Number), [th, tm] = q.to.split(':').map(Number);
      const mins = t.getHours() * 60 + t.getMinutes(), from = fh * 60 + fm, to = th * 60 + tm;
      const inside = from > to ? (mins >= from || mins < to) : (mins >= from && mins < to);
      if (inside) {
        const end = new Date(t.getFullYear(), t.getMonth(), t.getDate() + (from > to && mins >= from ? 1 : 0), th, tm);
        t = end; continue;
      }
    }
    break;
  }
  return t.getTime();
}

/** Is the appointment on `date` already over? (Then a reminder that was missed is no use any more.) */
export function eventOver(e, date, now = Date.now()) {
  const d = parseIso(date);
  if (!d || Number.isNaN(d.getTime())) return false;
  if (e.allDay || !e.start) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() <= now;
  const [sh, sm] = String(e.start).split(':').map(Number);
  let [eh, em] = e.end && /^\d\d:\d\d$/.test(e.end) ? e.end.split(':').map(Number) : [sh + 1, sm];
  if (eh * 60 + em <= sh * 60 + sm) eh += 24;   // over midnight
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em).getTime() <= now;
}

/** Every reminder of an appointment between `from` and `to` (ms): [{ key, at, date, r }]. Repeating ones per time. */
export function remindersBetween(e, from, to, settings) {
  const list = eventReminders(e);
  if (!list.length) return [];
  const dates = [];
  if (e.repeat?.freq) {
    const y = new Date(from - 8 * 86400e3);
    let d = nextStart(e, iso(y));
    for (let i = 0; d && i < 40; i++) {
      if (parseIso(d).getTime() - 70 * 86400e3 > to) break;
      dates.push(d);
      const nx = parseIso(d); nx.setDate(nx.getDate() + 1);
      d = nextStart(e, iso(nx));
    }
  } else dates.push(e.date);
  const out = [];
  for (const date of dates) for (const r of list) {
    const raw = reminderAt(r, { date, start: e.start, allDay: e.allDay }, settings.allDayTime);
    if (raw == null) continue;
    const at = afterQuiet(raw, settings.quiet);
    if (at >= from && at <= to) out.push({ key: `ev-${e.id}-${date}-${r.id}`, at, date, r });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The editor: a list of reminders you can add to and change. Returns { el, get() }. */
export function reminderEditor(initial = [], { allDay = () => false } = {}) {
  let list = initial.map(r => ({ ...r, id: r.id || rid() }));
  const box = h('div', { class: 'rm-list' });
  const draw = () => {
    h(clear(box), null, list.map((r, i) => {
      const num = h('input', { class: 'input rm-n', type: 'number', min: 0, max: 999, value: r.unit === 'abs' ? '' : String(r.n ?? 0), 'aria-label': 'Hvor længe før', hidden: r.unit === 'abs', oninput: (e) => { r.n = Math.max(0, Math.min(999, Number(e.target.value) || 0)); } });
      const unit = h('select', { class: 'select rm-u', 'aria-label': 'Enhed', onchange: (e) => { r.unit = e.target.value; if (r.unit === 'abs' && !r.abs) r.abs = ''; if ((r.unit === 'day' || r.unit === 'week') && !r.time) r.time = '09:00'; draw(); } },
        UNITS.map(([v, l]) => h('option', { value: v, selected: r.unit === v }, l)));
      const time = h('input', { class: 'input rm-t', type: 'time', value: r.time || '', 'aria-label': 'Klokken', hidden: !(r.unit === 'day' || r.unit === 'week'), oninput: (e) => { r.time = e.target.value; } });
      const abs = h('input', { class: 'input rm-a', type: 'datetime-local', value: r.abs || '', 'aria-label': 'Dato og tid', hidden: r.unit !== 'abs', oninput: (e) => { r.abs = e.target.value; } });
      return h('div', { class: 'rm-row' }, icon('bell'), num, unit, (r.unit === 'day' || r.unit === 'week') ? h('span', { class: 'faint rm-kl' }, 'før kl.') : null, time, abs,
        h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Fjern påmindelse ${i + 1}`, onclick: () => { list.splice(i, 1); draw(); } }, icon('x')));
    }),
    h('div', { class: 'rm-add' },
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { list.push(allDay() ? { id: rid(), n: 1, unit: 'day', time: '18:00' } : { id: rid(), n: 15, unit: 'min' }); draw(); } }, icon('plus'), 'Tilføj påmindelse'),
      ...[['15 min', { n: 15, unit: 'min' }], ['1 time', { n: 1, unit: 'hour' }], ['Dagen før', { n: 1, unit: 'day', time: '09:00' }], ['1 uge', { n: 1, unit: 'week', time: '09:00' }]]
        .map(([l, r]) => h('button', { type: 'button', class: 'chip rm-quick', onclick: () => { list.push({ id: rid(), ...r }); draw(); } }, l))));
  };
  draw();
  return { el: box, get: () => list.filter(r => r.unit !== 'abs' || r.abs).map(r => ({ id: r.id, unit: r.unit, ...(r.unit === 'abs' ? { abs: r.abs } : { n: Number(r.n) || 0 }), ...((r.unit === 'day' || r.unit === 'week') && r.time ? { time: r.time } : {}) })), set: (l) => { list = l.map(r => ({ ...r, id: r.id || rid() })); draw(); } };
}
