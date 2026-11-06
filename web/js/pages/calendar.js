/** Kalender — month view and agenda, with reminders, Danish holidays, task deadlines and .ics import/export. */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, modal, confirmDialog, stateBlock, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { REMIND, remindAt } from '../features/reminders.js';
import { saveBlob } from '../core/files.js';
import { api } from '../core/api.js';
import { onLive } from '../core/live.js';
import { store } from '../core/store.js';
import { REPEAT, repeatShort, occurrenceOn, nextStart, expand, parseQuick, toRrule, fromRrule } from '../features/calrecur.js';

const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const COLORS = [['#38bdf8', 'Blå'], ['#34d399', 'Grøn'], ['#f59e0b', 'Rav'], ['#ff4f8b', 'Pink'], ['#a78bfa', 'Violet'], ['#94a3b8', 'Grå']];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7); };

/** Danish public holidays (+ a few well-known days) for a year → Map(iso → name) */
const holidayCache = new Map();
export function holidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  // Easter Sunday (Anonymous Gregorian algorithm)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  const map = new Map([
    [`${year}-01-01`, 'Nytårsdag'], [iso(addDays(easter, -7)), 'Palmesøndag'], [iso(addDays(easter, -3)), 'Skærtorsdag'], [iso(addDays(easter, -2)), 'Langfredag'],
    [iso(easter), 'Påskedag'], [iso(addDays(easter, 1)), '2. påskedag'], [iso(addDays(easter, 39)), 'Kristi himmelfartsdag'], [iso(addDays(easter, 49)), 'Pinsedag'],
    [iso(addDays(easter, 50)), '2. pinsedag'], [`${year}-06-05`, 'Grundlovsdag'], [`${year}-12-24`, 'Juleaften'], [`${year}-12-25`, 'Juledag'], [`${year}-12-26`, '2. juledag'], [`${year}-12-31`, 'Nytårsaften'],
  ]);
  holidayCache.set(year, map);
  return map;
}

// ── iCalendar (.ics) ──
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
const icsDate = (dateStr, time) => time ? `${dateStr.replace(/-/g, '')}T${time.replace(':', '')}00` : dateStr.replace(/-/g, '');
export function toIcs(events) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HUBTECH//Kalender//DA', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@hubtech`, `DTSTAMP:${now}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(iso(addDays(parseIso(e.endDate || e.date), 1)))}`);
    } else {
      lines.push(`DTSTART:${icsDate(e.date, e.start || '09:00')}`, `DTEND:${icsDate(e.endDate || e.date, e.end || e.start || '10:00')}`);
    }
    const rr = toRrule(e.repeat);
    if (rr) lines.push(`RRULE:${rr}`);
    for (const x of e.repeat?.skip || []) lines.push(e.allDay ? `EXDATE;VALUE=DATE:${icsDate(x)}` : `EXDATE:${icsDate(x, e.start || '09:00')}`);
    lines.push(`SUMMARY:${icsEsc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsEsc(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsEsc(e.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
export function fromIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const get = (k) => { const m = new RegExp(`^${k}(;[^:\\n]*)?:(.*)$`, 'm').exec(block); return m ? { params: m[1] || '', v: m[2].trim() } : null; };
    const un = (s) => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    const s = get('DTSTART'); if (!s) continue;
    const e = get('DTEND');
    const dt = (x) => { const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(x.v); return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null } : null; };
    const a = dt(s), b = e ? dt(e) : null;
    if (!a) continue;
    const allDay = !a.time;
    const ev = { id: uid(), title: un(get('SUMMARY')?.v) || 'Aftale', date: a.date, allDay, start: a.time, end: b?.time || null, location: un(get('LOCATION')?.v), notes: un(get('DESCRIPTION')?.v), color: COLORS[0][0], remind: 'none' };
    const rep = fromRrule(get('RRULE')?.v);
    if (rep) ev.repeat = rep;
    if (allDay && b) { const last = iso(addDays(parseIso(b.date), -1)); if (last > a.date) ev.endDate = last; }
    else if (b && b.date !== a.date) ev.endDate = b.date;
    out.push(ev);
  }
  return out;
}

let st = null;
let unsub = [];
const HIDDEN_KEY = 'hubtech.cal.hidden';
const readHidden = () => { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); } };
const writeHidden = (set) => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch { /* */ } };
const ROLE_DA = { owner: 'Ejer', editor: 'Kan redigere', viewer: 'Kan se' };

export default {
  title: 'Kalender',
  destroy() { flushState('calendar'); unsub.forEach(f => f()); unsub = []; },
  async render() {
    const app = appById('calendar');
    try { st = (await getState('calendar', { force: true })) || { events: [] }; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Kalenderen kunne ikke hentes', text: e.message })); }
    if (!Array.isArray(st.events)) st.events = [];
    let tasks = [];
    getState('tasks', { force: true }).then(t => { tasks = (t?.tasks || []).filter(x => x.due && x.status !== 'done'); draw(); }).catch(() => {});
    // birthdays from Fødselsdage show up every year (read-only here)
    let bdays = [];
    getState('birthdays', { force: true }).then(b => {
      bdays = (b?.people || []).filter(p => /^(\d{4}|--)-?\d{2}-\d{2}$/.test(p.date || '')).map(p => {
        const md = p.date.slice(-5), born = /^\d{4}/.test(p.date) ? Number(p.date.slice(0, 4)) : null;
        const first = born ? p.date : `2000-${md}`;
        return { id: `bday-${p.id}`, bday: true, born, title: `🎂 ${p.name}`, date: first, allDay: true, color: '#f472b6', notes: p.note || '', repeat: { freq: 'year' } };
      });
      draw();
    }).catch(() => {});
    const ageOn = (e, d) => (e.born ? ` (${Number(d.slice(0, 4)) - e.born} år)` : '');

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    let selected = iso(today);
    let view = 'month';
    const persist = () => { saveState('calendar', st, { onError: () => toast('Kalenderen kunne ikke gemmes', { type: 'bad' }) }); stats(); };

    // ── shared calendars (other HUBTECH users) ──
    const shared = { calendars: [], events: [], loaded: false };
    const hidden = readHidden();
    const calById = (id) => shared.calendars.find(c => c.id === id);
    const accepted = () => shared.calendars.filter(c => c.status === 'accepted');
    const editable = () => accepted().filter(c => c.role === 'owner' || c.role === 'editor');
    async function loadShared() {
      try {
        const [c, e] = await Promise.all([api.get('/api/calendars'), api.get('/api/calendars/events')]);
        shared.calendars = c.calendars || []; shared.events = e.events || []; shared.loaded = true;
      } catch { /* offline: only my own calendar */ }
      drawCals(); draw();
    }
    const allEvents = () => [
      ...(hidden.has('mine') ? [] : st.events),
      ...shared.events.filter(e => !hidden.has(e.cal) && calById(e.cal)).map(e => ({ ...e, color: e.color || calById(e.cal)?.color })),
      ...(hidden.has('mine') ? [] : bdays),
    ];

    // events on a day (multi-day events span their range)
    const onDay = (d) => allEvents().map(e => occurrenceOn(e, d)).filter(Boolean).map(e => (e.bday ? { ...e, title: e.title + ageOn(e, e.date) } : e)).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || String(a.start || '').localeCompare(String(b.start || '')));
    const tasksOn = (d) => tasks.filter(t => t.due === d);

    const v = { today: h('span'), week: h('span'), next: h('span'), dl: h('span') };
    function stats() {
      const t = iso(today), wEnd = iso(addDays(today, 7));
      v.today.textContent = String(onDay(t).length);
      v.week.textContent = String(expand(allEvents(), t, iso(addDays(today, 6))).length);
      const now = new Date();
      const up = allEvents().map(e => { const d = nextStart(e, t); return d && { e: { ...e, date: d }, at: new Date(`${d}T${e.allDay ? '00:00' : (e.start || '00:00')}`) }; }).filter(x => x && (x.at >= now || x.e.date === t)).sort((a, b) => a.at - b.at)[0];
      v.next.textContent = up ? `${up.e.date === t ? 'I dag' : up.at.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}${up.e.allDay ? '' : ' ' + (up.e.start || '')}` : '—';
      v.dl.textContent = String(tasks.filter(x => x.due >= t && x.due < wEnd).length);
    }

    // ── editor ──
    function edit(ev, date, preset) {
      if (ev?.bday) { location.hash = '#/apps/birthdays'; return; }
      if (ev?.cal) { const c = calById(ev.cal); if (!c || c.role === 'viewer') return viewOnly(ev, c); }
      const occ = ev?.series ? ev.occ : null;                    // clicked one day of a repeating event: edit the series
      if (ev?.series) ev = allEvents().find(x => x.id === ev.series && (x.cal || null) === (ev.cal || null)) || ev;
      const isNew = !ev;
      const fromCal = ev?.cal || null;
      const e = ev ? { ...ev } : { id: uid(), title: '', date: date || selected, allDay: false, start: '09:00', end: '10:00', location: '', notes: '', color: COLORS[0][0], remind: 'm15', ...(preset || {}) };
      const ti = h('input', { class: 'input', value: e.title, maxlength: 160, placeholder: 'Fx Service hos Jensen A/S', 'aria-label': 'Titel' });
      const da = h('input', { class: 'input', type: 'date', value: e.date, 'aria-label': 'Dato' });
      const de = h('input', { class: 'input', type: 'date', value: e.endDate || '', 'aria-label': 'Slutdato (valgfri)' });
      const ad = h('input', { type: 'checkbox', checked: !!e.allDay, id: 'cal-allday' });
      const s1 = h('input', { class: 'input', type: 'time', value: e.start || '', 'aria-label': 'Start' });
      const s2 = h('input', { class: 'input', type: 'time', value: e.end || '', 'aria-label': 'Slut' });
      const lo = h('input', { class: 'input', value: e.location || '', maxlength: 200, placeholder: 'Adresse eller sted', 'aria-label': 'Sted' });
      const rm = h('select', { class: 'select', 'aria-label': 'Påmindelse' }, Object.entries(REMIND).map(([k, r]) => h('option', { value: k, selected: (e.remind || 'none') === k }, r.label)));
      const no = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Noter', 'aria-label': 'Noter' }); no.value = e.notes || '';
      const rp = h('select', { class: 'select', 'aria-label': 'Gentag' }, Object.entries(REPEAT).map(([k, l]) => h('option', { value: k, selected: (e.repeat?.freq || 'none') === k }, l)));
      const ru = h('input', { class: 'input', type: 'date', value: e.repeat?.until || '', 'aria-label': 'Gentag indtil (valgfri)' });
      const untilField = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Indtil (valgfri)'), ru);
      const syncRep = () => { untilField.hidden = rp.value === 'none'; };
      rp.addEventListener('change', syncRep); syncRep();
      const repeatRow = h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Gentag'), rp), untilField);
      let color = e.color || COLORS[0][0];
      const sw = h('div', { class: 'cal-swatches', role: 'group', 'aria-label': 'Farve' });
      const drawSw = () => h(clear(sw), null, COLORS.map(([c, l]) => h('button', { type: 'button', class: 'cal-swatch', style: { '--sw': c }, 'aria-label': l, 'aria-pressed': String(c === color), onclick: () => { color = c; drawSw(); } })));
      drawSw();
      const times = h('div', { class: 'grid-2', hidden: !!e.allDay },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Start'), s1),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Slut'), s2));
      ad.addEventListener('change', () => { times.hidden = ad.checked; checkClash(); });
      // moving the start keeps the length, like in other calendars
      let lastStart = s1.value;
      s1.addEventListener('change', () => {
        if (lastStart && s1.value && s2.value) { const len = toMin(s2.value) - toMin(lastStart); if (len > 0) s2.value = toHm(Math.min(23 * 60 + 59, toMin(s1.value) + len)); }
        lastStart = s1.value; checkClash();
      });
      // a gentle warning when it overlaps something else that day
      const clash = h('div', { class: 'cal-clash', 'aria-live': 'polite' });
      function checkClash() {
        clear(clash);
        if (ad.checked || !s1.value || !da.value) return;
        const a = toMin(s1.value), b = s2.value ? toMin(s2.value) : a + 60;
        const hits = onDay(da.value).filter(x => !x.allDay && x.start && x.id !== e.id && x.series !== e.id && !x.bday && toMin(x.start) < b && (x.end ? toMin(x.end) : toMin(x.start) + 60) > a);
        if (hits.length) clash.append(icon('alert'), h('span', null, `Overlapper med ${hits.slice(0, 2).map(x => `“${x.title}” (${x.start}${x.end ? '–' + x.end : ''})`).join(' og ')}${hits.length > 2 ? ` og ${hits.length - 2} mere` : ''}.`));
      }
      s2.addEventListener('change', checkClash); da.addEventListener('change', checkClash);
      checkClash();
      const err = h('div', { class: 'field-error' });
      const cals = editable();
      const calSel = cals.length ? h('select', { class: 'select', 'aria-label': 'Kalender' },
        h('option', { value: '' }, 'Min kalender'),
        cals.map(c => h('option', { value: c.id, selected: c.id === (fromCal || (isNew && !hidden.has('mine') ? '' : fromCal)) }, `${c.name} (delt)`))) : null;
      const remindField = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Påmindelse'), rm);
      const syncCal = () => { remindField.hidden = !!calSel?.value; };
      calSel?.addEventListener('change', syncCal);
      let m;
      const saveShared = async (target) => {
        const data = { title: e.title, date: e.date, endDate: e.endDate, allDay: e.allDay, start: e.start, end: e.end, location: e.location, notes: e.notes, color, ...(e.repeat ? { repeat: e.repeat } : {}) };
        try {
          if (fromCal && fromCal === target) await api.put(`/api/calendars/${target}/events/${e.id}`, { event: data });
          else {
            await api.post(`/api/calendars/${target}/events`, { event: data });
            if (fromCal) await api.del(`/api/calendars/${fromCal}/events/${e.id}`);
            else if (!isNew) { st.events = st.events.filter(x => x.id !== e.id); persist(); }
          }
          toast('Gemt i den delte kalender', { type: 'ok', text: calById(target)?.name });
        } catch (x) { toast('Aftalen kunne ikke gemmes', { type: 'bad', text: x.message }); return false; }
        await loadShared();
        return true;
      };
      const save = async () => {
        const title = ti.value.trim();
        if (!title) { err.textContent = 'Skriv en titel.'; ti.focus(); return; }
        if (!da.value) { err.textContent = 'Vælg en dato.'; return; }
        if (de.value && de.value < da.value) { err.textContent = 'Slutdatoen er før startdatoen.'; return; }
        if (!ad.checked && s1.value && s2.value && !de.value && s2.value < s1.value) { err.textContent = 'Sluttidspunktet er før start.'; return; }
        if (rp.value !== 'none' && ru.value && ru.value < da.value) { err.textContent = '“Indtil” er før den første gang.'; return; }
        e.repeat = rp.value === 'none' ? null : { freq: rp.value, ...(ru.value ? { until: ru.value } : {}), ...(e.repeat?.skip?.length && e.repeat.freq === rp.value ? { skip: e.repeat.skip } : {}) };
        if (!e.repeat) delete e.repeat;
        Object.assign(e, { title, date: da.value, endDate: de.value && de.value !== da.value ? de.value : null, allDay: ad.checked, start: ad.checked ? null : (s1.value || null), end: ad.checked ? null : (s2.value || null), location: lo.value.trim(), notes: no.value.trim(), color, remind: rm.value });
        const target = calSel?.value || '';
        if (target) {
          if (!await saveShared(target)) return;
          selected = e.date; const d0 = parseIso(e.date); cursor = new Date(d0.getFullYear(), d0.getMonth(), 1);
          m.close(); draw(); return;
        }
        if (fromCal) {   // moved from a shared calendar to my own
          try { await api.del(`/api/calendars/${fromCal}/events/${e.id}`); } catch (x) { toast('Kunne ikke flytte aftalen', { type: 'bad', text: x.message }); return; }
          for (const k of ['cal', 'by', 'updatedBy', 'updatedAt']) delete e[k];
          e.id = uid();
          loadShared();
        }
        const at = e.repeat ? null : remindAt({ due: e.date, dueTime: e.allDay ? '09:00' : (e.start || '09:00'), remind: e.remind });
        if (at !== e.remindAt) { e.remindAt = at; e.reminded = false; }
        if (isNew || fromCal) { st.events.push(e); logActivity('calendar', 'new', e.title, 'Aftale oprettet'); }
        else { const cur = st.events.find(x => x.id === e.id); if (!e.repeat) delete cur.repeat; Object.assign(cur, e); }
        selected = occ && e.repeat ? occ : e.date;
        const d = parseIso(e.date); cursor = new Date(d.getFullYear(), d.getMonth(), 1);
        persist(); m.close(); draw();
      };
      const actions = [];
      if (!isNew) actions.push(h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: async () => {
        if (e.repeat) { m.close(); return deleteSeries(ev, occ); }
        if (!await confirmDialog({ title: 'Slet aftale?', text: fromCal ? `“${e.title}” slettes for alle i “${calById(fromCal)?.name}”.` : `“${e.title}” slettes.`, confirmLabel: 'Slet', danger: true })) return;
        if (fromCal) {
          try { await api.del(`/api/calendars/${fromCal}/events/${e.id}`); } catch (x) { toast('Kunne ikke slette', { type: 'bad', text: x.message }); return; }
          m.close(); await loadShared(); toast('Aftale slettet', { text: e.title }); return;
        }
        st.events = st.events.filter(x => x.id !== e.id); persist(); m.close(); draw();
        toast('Aftale slettet', { text: e.title, action: { label: 'Fortryd', onClick: () => { st.events.push(ev); persist(); draw(); } } });
      } }, icon('trash'), 'Slet'));
      if (!isNew) actions.push(h('button', { class: 'btn btn-ghost', title: 'Del aftalen i en chat', onclick: () => shareEvent(e) }, icon('share'), 'Del'));
      if (!isNew) actions.push(h('button', { class: 'btn btn-ghost', title: 'Lav en ny aftale magen til', onclick: () => { m.close(); edit(null, occ || e.date, { title: e.title, allDay: !!e.allDay, start: e.start || null, end: e.end || null, location: e.location || '', notes: e.notes || '', color: e.color || COLORS[0][0], remind: e.remind || 'none' }); } }, icon('copy'), 'Kopiér'));
      actions.push(h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: save }, 'Gem'));
      m = modal({
        title: isNew ? 'Ny aftale' : 'Redigér aftale', label: 'Kalender', size: 560,
        body: h('div', { class: 'stack cal-form', style: { gap: '12px' } },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), ti),
          calSel ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Kalender'), calSel) : null,
          fromCal && ev.by ? h('p', { class: 'faint', style: { margin: 0 } }, `Oprettet af ${ev.by}${ev.updatedBy && ev.updatedBy !== ev.by ? ` · sidst rettet af ${ev.updatedBy}` : ''}`) : null,
          h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Dato'), da), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Til og med (valgfri)'), de)),
          e.repeat && occ ? h('div', { class: 'cal-series-note' }, icon('refresh'), `${repeatShort(e.repeat)} – ændringer gælder alle gange.`) : null,
          h('label', { class: 'cal-check' }, ad, 'Hele dagen'),
          times, clash,
          repeatRow,
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Sted'), lo),
          h('div', { class: 'grid-2' }, remindField, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Farve'), sw)),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Noter'), no), err),
        actions,
      });
      syncCal();
      ti.addEventListener('keydown', (k) => { if (k.key === 'Enter') save(); });
      setTimeout(() => { if (!document.activeElement?.matches?.('.modal input, .modal textarea, .modal select') || document.activeElement === ti) ti.focus(); }, 50);
    }

    const when = (e) => `${parseIso(e.date).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })}${e.endDate ? ' – ' + parseIso(e.endDate).toLocaleDateString('da-DK', { day: 'numeric', month: 'long' }) : ''}${e.allDay ? ' · hele dagen' : e.start ? ` · ${e.start}${e.end ? '–' + e.end : ''}` : ''}`;
    function viewOnly(e, c) {
      const m = modal({ title: e.title, label: c ? `Delt kalender: ${c.name}` : 'Kalender', size: 480,
        body: h('div', { class: 'stack', style: { gap: '10px' } },
          h('p', { style: { margin: 0 } }, icon('calendar'), ' ', when(e)),
          e.location ? h('p', { style: { margin: 0 } }, icon('mapPin'), ' ', e.location) : null,
          e.notes ? h('p', { class: 'cal-notes' }, e.notes) : null,
          h('p', { class: 'faint', style: { margin: 0 } }, `${e.by ? `Oprettet af ${e.by}. ` : ''}Du kan se denne kalender, men ikke rette i den.`)),
        actions: [
          h('button', { class: 'btn btn-ghost', onclick: () => shareEvent(e) }, icon('share'), 'Del'),
          h('button', { class: 'btn', onclick: () => {
            const copy = { id: uid(), title: e.title, date: e.date, endDate: e.endDate || null, allDay: !!e.allDay, start: e.start || null, end: e.end || null, location: e.location || '', notes: e.notes || '', color: e.color || COLORS[0][0], remind: 'none' };
            st.events.push(copy); persist(); draw(); m.close(); toast('Kopieret til din egen kalender', { type: 'ok' });
          } }, icon('copy'), 'Kopiér til min kalender'),
          h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Luk')] });
    }
    function deleteSeries(ev, occ) {
      const cal = ev.cal || null;
      const base = cal ? shared.events.find(x => x.id === ev.id && x.cal === cal) : st.events.find(x => x.id === ev.id);
      if (!base) return;
      const backup = JSON.parse(JSON.stringify(base));
      const fields = (x) => ({ title: x.title, date: x.date, endDate: x.endDate || null, allDay: !!x.allDay, start: x.start || null, end: x.end || null, location: x.location || '', notes: x.notes || '', color: x.color, ...(x.repeat ? { repeat: x.repeat } : {}) });
      const done = async (text, removed) => {
        if (cal) {   // a shared calendar: tell the server, then reload
          try { removed ? await api.del(`/api/calendars/${cal}/events/${base.id}`) : await api.put(`/api/calendars/${cal}/events/${base.id}`, { event: fields(base) }); }
          catch (x) { toast('Det mislykkedes', { type: 'bad', text: x.message }); return; }
          await loadShared(); toast(text, { text: base.title });
          return;
        }
        persist(); draw();
        toast(text, { text: base.title, action: { label: 'Fortryd', onClick: () => { const i = st.events.findIndex(x => x.id === backup.id); if (i >= 0) st.events[i] = backup; else st.events.push(backup); persist(); draw(); } } });
      };
      const day = occ || base.date;
      const m = modal({ title: 'Slet en gentaget aftale', label: 'Kalender', size: 460,
        body: h('p', { style: { margin: 0 } }, `“${base.title}” gentages ${repeatShort(base.repeat).toLowerCase()}. Hvad vil du slette?`),
        actions: [
          h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'),
          h('button', { class: 'btn', onclick: () => { base.repeat = { ...base.repeat, skip: [...new Set([...(base.repeat.skip || []), day])] }; m.close(); done('Kun denne gang er slettet'); } }, 'Kun denne gang'),
          day > base.date ? h('button', { class: 'btn', onclick: () => { base.repeat = { ...base.repeat, until: iso(addDays(parseIso(day), -1)) }; m.close(); done('Denne og de næste gange er slettet'); } }, 'Denne og fremover') : null,
          h('button', { class: 'btn btn-danger', onclick: () => { if (!cal) st.events = st.events.filter(x => x.id !== base.id); m.close(); done('Hele serien er slettet', true); } }, 'Hele serien')] });
    }
    function shareEvent(e) {
      import('../features/sharechat.js').then(x => x.shareToChat({ kind: 'event', title: e.title, date: e.date, endDate: e.endDate || '', start: e.allDay ? '' : (e.start || ''), end: e.allDay ? '' : (e.end || ''), allDay: !!e.allDay, location: e.location || '', body: e.notes || '' }));
    }

    // ── the calendars bar: my own + shared, invitations, sharing ──
    const calsBox = h('div', { class: 'cal-cals glass panel', 'aria-label': 'Kalendere' });
    const toggle = (id) => { hidden.has(id) ? hidden.delete(id) : hidden.add(id); writeHidden(hidden); drawCals(); draw(); };
    function drawCals() {
      const pend = shared.calendars.filter(c => c.status === 'pending');
      const chip = (id, name, color, extra) => h('div', { class: ['cal-chip', hidden.has(id) && 'is-off'], style: { '--c': color } },
        h('button', { type: 'button', class: 'cal-chip-t', 'aria-pressed': String(!hidden.has(id)), title: hidden.has(id) ? 'Vis' : 'Skjul', onclick: () => toggle(id) }, h('span', { class: 'cal-dot' }), name),
        extra || null);
      h(clear(calsBox), null,
        h('div', { class: 'cal-cals-row' },
          h('span', { class: 'cal-cals-label' }, icon('users'), 'Kalendere'),
          chip('mine', 'Min kalender', 'var(--app)'),
          accepted().map(c => chip(c.id, c.name, c.color, h('button', { type: 'button', class: 'cal-chip-gear', 'aria-label': `Deling og indstillinger for ${c.name}`, title: 'Deling', onclick: () => manage(c) }, icon(c.role === 'owner' ? 'settings' : 'users')))),
          h('button', { class: 'btn btn-sm', onclick: newShared }, icon('plus'), 'Ny delt kalender')),
        pend.map(c => h('div', { class: 'cal-invite', role: 'status' }, icon('mail'),
          h('span', null, h('b', null, (c.members.find(m => m.role === 'owner') || {}).name || 'En bruger'), ` har inviteret dig til kalenderen “${c.name}”.`),
          h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { try { await api.post(`/api/calendars/${c.id}/accept`); toast('Kalenderen er tilføjet', { type: 'ok', text: c.name }); loadShared(); } catch (x) { toast('Det mislykkedes', { type: 'bad', text: x.message }); } } }, 'Accepter'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { try { await api.del(`/api/calendars/${c.id}`); loadShared(); } catch (x) { toast('Det mislykkedes', { type: 'bad', text: x.message }); } } }, 'Afvis'))));
    }
    function newShared() {
      const name = h('input', { class: 'input', maxlength: 60, placeholder: 'Fx Familie, Firmaet eller Fodboldholdet', 'aria-label': 'Navn' });
      let color = '#22c55e';
      const palette = ['#22c55e', '#38bdf8', '#f59e0b', '#ff4f8b', '#a78bfa', '#f97316', '#14b8a6', '#64748b'];
      const sw = h('div', { class: 'cal-swatches', role: 'group', 'aria-label': 'Farve' });
      const drawSw = () => h(clear(sw), null, palette.map(c => h('button', { type: 'button', class: 'cal-swatch', style: { '--sw': c }, 'aria-label': c, 'aria-pressed': String(c === color), onclick: () => { color = c; drawSw(); } })));
      drawSw();
      const err = h('div', { class: 'field-error' });
      const go = async () => {
        if (!name.value.trim()) { err.textContent = 'Giv kalenderen et navn.'; name.focus(); return; }
        try { const r = await api.post('/api/calendars', { name: name.value.trim(), color }); m.close(); await loadShared(); manage(r.calendar); }
        catch (x) { err.textContent = x.message; }
      };
      name.addEventListener('keydown', (k) => { if (k.key === 'Enter') go(); });
      const m = modal({ title: 'Ny delt kalender', label: 'Kalender', size: 480,
        body: h('div', { class: 'stack', style: { gap: '12px' } },
          h('p', { class: 'faint', style: { margin: 0 } }, 'En delt kalender kan ses af de brugere, du inviterer. Alle med lov til at redigere kan tilføje aftaler – det bliver nemmere at planlægge ting sammen.'),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Farve'), sw), err),
        actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: go }, 'Opret')] });
      setTimeout(() => { if (!document.activeElement?.matches?.('.modal input, .modal textarea, .modal select') || document.activeElement === name) name.focus(); }, 50);
    }
    function manage(c0) {
      let c = c0;
      const me = store.get('user')?.id;
      const owner = () => c.role === 'owner';
      const list = h('div', { class: 'cal-members' });
      const err = h('div', { class: 'field-error' });
      const who = h('input', { class: 'input', placeholder: 'Brugernavn', 'aria-label': 'Brugernavn', autocapitalize: 'off', spellcheck: 'false' });
      const role = h('select', { class: 'select', 'aria-label': 'Rettighed' }, h('option', { value: 'editor' }, 'Kan redigere'), h('option', { value: 'viewer' }, 'Kan se'));
      const refresh = (nc) => { if (nc) c = nc; drawList(); loadShared(); };
      function drawList() {
        h(clear(list), null, c.members.map(mb => h('div', { class: 'cal-member' },
          h('span', { class: 'cm-ava', 'aria-hidden': 'true' }, ava(mb.avatar, '👤')),
          h('span', { class: 'cal-member-n' }, h('b', null, mb.name), h('span', { class: 'faint' }, ` @${mb.username}${mb.status === 'pending' ? ' · inviteret' : ''}`)),
          owner() && mb.role !== 'owner'
            ? h('select', { class: 'select select-sm', 'aria-label': `Rettighed for ${mb.name}`, onchange: async (x) => { try { refresh((await api.patch(`/api/calendars/${c.id}/members/${mb.id}`, { role: x.target.value })).calendar); } catch (y) { err.textContent = y.message; } } },
              h('option', { value: 'editor', selected: mb.role === 'editor' }, 'Kan redigere'), h('option', { value: 'viewer', selected: mb.role === 'viewer' }, 'Kan se'))
            : h('span', { class: 'chip' }, ROLE_DA[mb.role]),
          owner() && mb.role !== 'owner' ? h('button', { class: 'icon-btn', 'aria-label': `Fjern ${mb.name}`, title: 'Fjern', onclick: async () => {
            try { await api.del(`/api/calendars/${c.id}/members/${mb.id}`); c = { ...c, members: c.members.filter(x => x.id !== mb.id) }; refresh(); } catch (y) { err.textContent = y.message; }
          } }, icon('x')) : null)));
      }
      drawList();
      const invite = async () => {
        err.textContent = '';
        if (!who.value.trim()) { who.focus(); return; }
        try { refresh((await api.post(`/api/calendars/${c.id}/members`, { username: who.value.trim(), role: role.value })).calendar); toast('Invitation sendt', { type: 'ok', text: `@${who.value.trim()} skal acceptere den i sin kalender.` }); who.value = ''; }
        catch (y) { err.textContent = y.message; }
      };
      who.addEventListener('keydown', (k) => { if (k.key === 'Enter') invite(); });
      const nameIn = h('input', { class: 'input', value: c.name, maxlength: 60, 'aria-label': 'Navn' });
      const leave = h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: async () => {
        const ok = await confirmDialog(owner() ? { title: 'Slet den delte kalender?', text: `“${c.name}” og alle dens aftaler slettes for alle deltagere.`, confirmLabel: 'Slet', danger: true }
          : { title: 'Forlad kalenderen?', text: `Du kan ikke længere se “${c.name}”.`, confirmLabel: 'Forlad', danger: true });
        if (!ok) return;
        try { await api.del(`/api/calendars/${c.id}`); m.close(); loadShared(); } catch (y) { err.textContent = y.message; }
      } }, icon(owner() ? 'trash' : 'logout'), owner() ? 'Slet kalender' : 'Forlad');
      const m = modal({ title: `Delt kalender: ${c.name}`, label: 'Kalender', size: 560,
        body: h('div', { class: 'stack', style: { gap: '14px' } },
          owner() ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), h('div', { class: 'row', style: { gap: '8px' } }, nameIn,
            h('button', { class: 'btn', onclick: async () => { try { refresh((await api.put(`/api/calendars/${c.id}`, { name: nameIn.value.trim() })).calendar); toast('Navnet er gemt', { type: 'ok' }); } catch (y) { err.textContent = y.message; } } }, 'Gem'))) : null,
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, `Deltagere (${c.members.length})`), list),
          owner() ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Invitér en HUBTECH-bruger'), h('div', { class: 'cal-inv-row' }, who, role, h('button', { class: 'btn btn-primary', onclick: invite }, icon('plus'), 'Invitér'))) : h('p', { class: 'faint', style: { margin: 0 } }, `Din rettighed: ${ROLE_DA[c.role]}.`),
          err),
        actions: [leave, h('button', { class: 'btn', onclick: () => m.close() }, 'Luk')] });
      void me;
    }

    // ── month grid ──
    const title = h('h2', { class: 'cal-title' });
    const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': 'Måned' });
    const side = h('aside', { class: 'cal-day glass panel', 'aria-live': 'polite' });
    const agenda = h('div', { class: 'cal-agenda glass panel' });
    const movable = (e) => !e.cal && !e.series && st.events.some(x => x.id === e.id);
    const pill = (e, d) => h('button', { type: 'button', class: ['cal-pill', e.allDay && 'is-allday'], style: { '--c': e.color || 'var(--app)' }, title: movable(e) ? `${e.title} – træk for at flytte` : e.title, draggable: movable(e) ? 'true' : null,
      ondragstart: movable(e) ? (x) => { x.dataTransfer.setData('text/x-hubtech-event', e.id); x.dataTransfer.effectAllowed = 'move'; } : null,
      onclick: (x) => { x.stopPropagation(); edit(e); } },
      e.series && !e.bday ? h('span', { class: 'cal-rep', 'aria-label': 'Gentages' }, '↻') : null,
      !e.allDay && e.start && d === e.date ? h('span', { class: 'cal-time' }, e.start) : null, e.title);
    const toMin = (t) => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
    const toHm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    function moveTo(id, d, atMin) {
      const e = st.events.find(x => x.id === id);
      const timed = atMin != null && e && !e.endDate;
      if (!e || (e.date === d && (!timed || (!e.allDay && toMin(e.start) === atMin)))) return;
      const before = { date: e.date, endDate: e.endDate, remindAt: e.remindAt, reminded: e.reminded, start: e.start, end: e.end, allDay: e.allDay };
      const shift = Math.round((parseIso(d) - parseIso(e.date)) / 86400000);
      e.date = d; if (e.endDate) e.endDate = iso(addDays(parseIso(e.endDate), shift));
      if (timed) {   // dropped on a time in the week grid: keep the length
        const len = !e.allDay && e.start && e.end ? Math.max(15, toMin(e.end) - toMin(e.start)) : 60;
        const st0 = Math.min(atMin, 24 * 60 - len);
        Object.assign(e, { allDay: false, start: toHm(st0), end: toHm(Math.min(24 * 60 - 1, st0 + len)) });
      }
      e.remindAt = remindAt({ due: e.date, dueTime: e.allDay ? '09:00' : (e.start || '09:00'), remind: e.remind }); e.reminded = false;
      selected = d; persist(); draw();
      toast('Aftalen er flyttet', { type: 'ok', text: `${e.title} → ${parseIso(d).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })}${timed ? ` kl. ${e.start}` : ''}`, action: { label: 'Fortryd', onClick: () => { Object.assign(e, before); selected = e.date; persist(); draw(); } } });
    }
    const dropTarget = (el, d) => {
      el.addEventListener('dragover', (x) => { if ([...x.dataTransfer.types].includes('text/x-hubtech-event')) { x.preventDefault(); el.classList.add('is-drop'); } });
      el.addEventListener('dragleave', () => el.classList.remove('is-drop'));
      el.addEventListener('drop', (x) => { x.preventDefault(); el.classList.remove('is-drop'); moveTo(x.dataTransfer.getData('text/x-hubtech-event'), d); });
    };

    function drawMonth() {
      title.textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
      clear(grid);
      grid.appendChild(h('div', { class: 'cal-head', role: 'row' }, h('span', { class: 'cal-wk' }, 'Uge'), DAYS.map(d => h('span', { role: 'columnheader' }, d))));
      const first = addDays(cursor, -((cursor.getDay() + 6) % 7));
      const hol = new Map([...holidays(cursor.getFullYear() - 1), ...holidays(cursor.getFullYear()), ...holidays(cursor.getFullYear() + 1)]);
      for (let w = 0; w < 6; w++) {
        const row = h('div', { class: 'cal-row', role: 'row' }, h('span', { class: 'cal-wk' }, String(isoWeek(addDays(first, w * 7)))));
        for (let i = 0; i < 7; i++) {
          const day = addDays(first, w * 7 + i), d = iso(day);
          const evs = onDay(d), tk = tasksOn(d), hd = hol.get(d);
          const cell = h('div', { role: 'gridcell', tabindex: d === selected ? '0' : '-1', 'aria-selected': String(d === selected), 'aria-label': `${day.getDate()}. ${MONTHS[day.getMonth()]}${hd ? ', ' + hd : ''}${evs.length ? `, ${evs.length} aftaler` : ''}`,
            class: ['cal-cell', day.getMonth() !== cursor.getMonth() && 'is-out', d === iso(today) && 'is-today', d === selected && 'is-sel', i >= 5 && 'is-weekend', hd && 'is-holiday'], dataset: { d } },
          h('div', { class: 'cal-num' }, h('span', null, String(day.getDate())), hd ? h('span', { class: 'cal-hol' }, hd) : null),
          evs.slice(0, 3).map(e => pill(e, d)),
          evs.length > 3 ? h('span', { class: 'cal-more' }, `+${evs.length - 3} mere`) : null,
          tk.slice(0, 2).map(t => h('a', { class: 'cal-task', href: '#/apps/tasks', onclick: (x) => x.stopPropagation(), title: `Deadline: ${t.title}` }, icon('kanban'), t.title)));
          dropTarget(cell, d);
          cell.addEventListener('click', () => { selected = d; drawMonth(); drawSide(); });
          cell.addEventListener('dblclick', () => edit(null, d));
          cell.addEventListener('keydown', (k) => {
            const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k.key];
            if (mv) { k.preventDefault(); const nd = addDays(parseIso(selected), mv); selected = iso(nd); if (nd.getMonth() !== cursor.getMonth()) cursor = new Date(nd.getFullYear(), nd.getMonth(), 1); drawMonth(); drawSide(); grid.querySelector('.is-sel')?.focus(); }
            else if (k.key === 'Enter') edit(null, d);
          });
          row.appendChild(cell);
        }
        grid.appendChild(row);
      }
    }
    function drawSide() {
      const d = parseIso(selected), evs = onDay(selected), tk = tasksOn(selected), hd = holidays(d.getFullYear()).get(selected);
      h(clear(side), null,
        h('div', { class: 'cal-side-head' }, h('div', null, h('div', { class: 'eyebrow' }, d.toLocaleDateString('da-DK', { weekday: 'long' })), h('h3', null, d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' }))),
          h('button', { class: 'btn app-solid btn-sm', onclick: () => edit(null, selected) }, icon('plus'), 'Ny')),
        hd ? h('div', { class: 'cal-hol-chip' }, icon('flower'), hd) : null,
        evs.length || tk.length ? null : h('p', { class: 'faint' }, 'Ingen aftaler. Dobbeltklik på en dag for at oprette en.'),
        evs.map(e => h('button', { type: 'button', class: 'cal-item', style: { '--c': e.color || 'var(--app)' }, onclick: () => edit(e) },
          h('span', { class: 'cal-item-time' }, e.allDay ? 'Hele dagen' : `${e.start || ''}${e.end ? '–' + e.end : ''}`),
          h('b', null, e.title),
          e.location ? h('span', { class: 'faint' }, icon('mapPin'), e.location) : null,
          e.remind && e.remind !== 'none' && !e.cal ? h('span', { class: 'faint' }, icon('bell'), REMIND[e.remind]?.short) : null,
          e.series ? h('span', { class: 'faint' }, icon('refresh'), repeatShort(e.repeat)) : null)),
        tk.map(t => h('a', { class: 'cal-item is-task', href: '#/apps/tasks' }, h('span', { class: 'cal-item-time' }, 'Deadline'), h('b', null, t.title), h('span', { class: 'faint' }, icon('kanban'), 'Fra Opgaver'))));
    }
    function drawAgenda() {
      clear(agenda);
      const start = iso(today), days = [];
      for (let i = 0; i < 60; i++) {
        const d = iso(addDays(today, i)), evs = onDay(d), tk = tasksOn(d);
        if (evs.length || tk.length) days.push([d, evs, tk]);
      }
      if (!days.length) { agenda.appendChild(stateBlock({ app: app.hue, icon: 'calendar', title: 'Ingen aftaler de næste 60 dage', text: 'Opret en aftale, eller hent en kalender (.ics) fra telefonen eller Outlook.', actions: [h('button', { class: 'btn app-solid', onclick: () => edit(null, start) }, icon('plus'), 'Ny aftale')] })); return; }
      for (const [d, evs, tk] of days) {
        const day = parseIso(d);
        agenda.appendChild(h('section', { class: 'cal-ag-day' },
          h('h3', null, d === start ? 'I dag' : d === iso(addDays(today, 1)) ? 'I morgen' : day.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })),
          evs.map(e => h('button', { type: 'button', class: 'cal-item', style: { '--c': e.color || 'var(--app)' }, onclick: () => edit(e) },
            h('span', { class: 'cal-item-time' }, e.allDay ? 'Hele dagen' : `${e.start || ''}${e.end ? '–' + e.end : ''}`), h('b', null, e.title), e.location ? h('span', { class: 'faint' }, icon('mapPin'), e.location) : null)),
          tk.map(t => h('a', { class: 'cal-item is-task', href: '#/apps/tasks' }, h('span', { class: 'cal-item-time' }, 'Deadline'), h('b', null, t.title)))));
      }
    }
    // ── week ──
    const weekBox = h('div', { class: 'cal-wk-view glass panel' });
    const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
    function pointerDrag(el, e, minAtFor) {
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', (pd) => {
        if (pd.button !== 0) return;
        const r0 = el.getBoundingClientRect(), grab = pd.clientY - r0.top, x0 = pd.clientX, y0 = pd.clientY;
        let moving = false, target = null;
        const move = (pm) => {
          if (!moving && Math.hypot(pm.clientX - x0, pm.clientY - y0) < 6) return;
          if (!moving) { moving = true; el.classList.add('is-dragging'); try { el.setPointerCapture(pd.pointerId); } catch { /* */ } }
          el.style.transform = `translate(${pm.clientX - x0}px, ${pm.clientY - y0}px)`;
          el.style.pointerEvents = 'none';
          const under = document.elementFromPoint(pm.clientX, pm.clientY)?.closest?.('.cal-tg-col');
          if (target && target !== under) target.classList.remove('is-drop');
          target = under || null; target?.classList.add('is-drop');
          el.style.pointerEvents = '';
        };
        const up = (pu) => {
          removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
          target?.classList.remove('is-drop');
          if (!moving) return;
          el.dataset.dragged = '1'; setTimeout(() => { delete el.dataset.dragged; }, 50);
          el.classList.remove('is-dragging'); el.style.transform = '';
          if (pu.type === 'pointerup' && target) moveTo(e.id, target.dataset.d, minAtFor(target, pu.clientY, grab));
        };
        addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      });
    }
    // the week as a timetable (wide screens): hours down the side, each appointment where it belongs
    const HOUR = 44;
    function timeGrid(first, hol) {
      const days = Array.from({ length: 7 }, (_, i) => { const day = addDays(first, i), d = iso(day); return { i, day, d, evs: onDay(d), tk: tasksOn(d), hd: hol.get(d) }; });
      const timedOf = (x) => x.evs.filter(e => !e.allDay && e.start && e.date === x.d);
      const all = days.flatMap(timedOf);
      const h0 = Math.min(7, ...all.map(e => Math.floor(toMin(e.start) / 60)));
      const h1 = Math.max(22, ...all.map(e => Math.ceil(toMin(e.end || e.start) / 60) || 0));
      const px = (m) => ((m - h0 * 60) / 60) * HOUR;
      const minAtFor = (colEl, clientY, grab) => { const r = colEl.getBoundingClientRect(), z = r.height / ((h1 - h0) * HOUR) || 1; const y = (clientY - r.top) / z - grab; return Math.max(h0 * 60, Math.min(h1 * 60 - 15, Math.round((h0 * 60 + (y / HOUR) * 60) / 15) * 15)); };
      const head = h('div', { class: 'cal-tg-row cal-tg-head' }, h('span'), days.map(x => h('button', { type: 'button', class: ['cal-wk-head', x.d === iso(today) && 'is-today'], title: 'Ny aftale denne dag', onclick: () => edit(null, x.d) },
        h('span', null, DAYS[x.i]), h('b', null, String(x.day.getDate())), x.hd ? h('small', { class: 'cal-hol' }, x.hd) : null, h('span', { class: 'cal-wk-add', 'aria-hidden': 'true' }, '+'))));
      const allDay = h('div', { class: 'cal-tg-row cal-tg-allday' }, h('span', { class: 'cal-tg-lbl' }, 'Hele dagen'), days.map(x => {
        const cell = h('div', { class: 'cal-tg-adcell' },
          x.evs.filter(e => e.allDay || !e.start || e.date !== x.d).map(e => pill(e, x.d)),
          x.tk.map(t => h('a', { class: 'cal-pill is-task', href: '#/apps/tasks', title: t.title }, '☐ ', t.title)));
        dropTarget(cell, x.d);
        return cell;
      }));
      const body = h('div', { class: 'cal-tg-body', style: { height: `${(h1 - h0) * HOUR}px` } },
        h('div', { class: 'cal-tg-hours' }, Array.from({ length: h1 - h0 }, (_, k) => h('span', { style: { top: `${k * HOUR}px` } }, `${String(h0 + k).padStart(2, '0')}:00`))),
        days.map(x => {
          const col = h('div', { class: ['cal-tg-col', x.d === iso(today) && 'is-today', x.i >= 5 && 'is-weekend'], title: 'Klik for en ny aftale på det tidspunkt' });
          // lanes for overlapping appointments
          const evs = timedOf(x).map(e => ({ e, a: toMin(e.start), b: Math.max(toMin(e.start) + 20, toMin(e.end || e.start) || toMin(e.start) + 60) })).sort((p, q) => p.a - q.a || q.b - p.b);
          const lanesEnd = [];
          for (const v of evs) { let l = lanesEnd.findIndex(end => end <= v.a); if (l < 0) { l = lanesEnd.length; lanesEnd.push(0); } lanesEnd[l] = v.b; v.lane = l; }
          for (const v of evs) v.of = Math.max(...evs.filter(w => w.a < v.b && w.b > v.a).map(w => w.lane)) + 1;
          for (const v of evs) {
            const e = v.e;
            const evEl = h('button', { type: 'button', class: ['cal-tg-ev', movable(e) && 'is-movable'], style: { '--c': e.color || 'var(--app)', top: `${px(v.a)}px`, height: `${Math.max(20, px(v.b) - px(v.a) - 2)}px`, left: `calc(${(100 / v.of) * v.lane}% + 2px)`, width: `calc(${100 / v.of}% - 4px)` },
              title: `${e.start}${e.end ? '–' + e.end : ''} ${e.title}${e.location ? ' · ' + e.location : ''}${movable(e) ? ' – træk for at flytte' : ''}`,
              onclick: (ev) => { ev.stopPropagation(); if (evEl.dataset.dragged) { delete evEl.dataset.dragged; return; } edit(e); } },
              h('b', null, e.series && !e.bday ? '↻ ' : '', e.title), h('span', null, `${e.start}${e.end ? '–' + e.end : ''}`), e.location && px(v.b) - px(v.a) > 50 ? h('span', null, e.location) : null);
            if (movable(e)) pointerDrag(evEl, e, minAtFor);   // mouse and finger: drag to another day or time
            col.append(evEl);
          }
          if (x.d === iso(today)) { const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); if (m >= h0 * 60 && m <= h1 * 60) col.append(h('i', { class: 'cal-tg-now', style: { top: `${px(m)}px` }, 'aria-hidden': 'true' })); }
          const minAt = (y) => Math.max(h0 * 60, Math.min(h1 * 60 - 15, Math.round((h0 * 60 + (y / HOUR) * 60) / 15) * 15));
          col.addEventListener('click', (ev) => { if (ev.target !== col) return; const m0 = Math.floor(minAt(ev.offsetY) / 30) * 30; edit(null, x.d, { allDay: false, start: toHm(m0), end: toHm(Math.min(23 * 60 + 59, m0 + 60)) }); });
          col.dataset.d = x.d;
          // pills from the all-day row (or other views) can still be dropped onto a time
          col.addEventListener('dragover', (ev) => { if ([...ev.dataTransfer.types].includes('text/x-hubtech-event')) { ev.preventDefault(); col.classList.add('is-drop'); } });
          col.addEventListener('dragleave', () => col.classList.remove('is-drop'));
          col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('is-drop'); moveTo(ev.dataTransfer.getData('text/x-hubtech-event'), x.d, minAtFor(col, ev.clientY, 0)); });
          return col;
        }));
      const wrap = h('div', { class: 'cal-tg' }, head, allDay, h('div', { class: 'cal-tg-scroll' }, body));
      // start the view around the morning (or the first appointment)
      requestAnimationFrame(() => { const sc = wrap.querySelector('.cal-tg-scroll'); const firstM = Math.min(8 * 60, ...all.map(e => toMin(e.start))); if (sc) sc.scrollTop = Math.max(0, px(firstM) - 10); });
      return wrap;
    }
    function drawWeek() {
      const first = monday(parseIso(selected)), last = addDays(first, 6), hol = new Map([...holidays(first.getFullYear()), ...holidays(last.getFullYear())]);
      const nav = (n) => { selected = iso(addDays(parseIso(selected), n)); const nd = parseIso(selected); cursor = new Date(nd.getFullYear(), nd.getMonth(), 1); drawWeek(); };
      h(clear(weekBox), null,
        h('div', { class: 'cal-nav' },
          h('button', { class: 'icon-btn', 'aria-label': 'Forrige uge', onclick: () => nav(-7) }, icon('chevronLeft')),
          h('h2', { class: 'cal-title', style: { textTransform: 'none' } }, `Uge ${isoWeek(first)} · ${first.getDate()}. ${first.getMonth() !== last.getMonth() ? MONTHS[first.getMonth()].slice(0, 3) + ' ' : ''}– ${last.getDate()}. ${MONTHS[last.getMonth()]}`),
          h('button', { class: 'icon-btn', 'aria-label': 'Næste uge', onclick: () => nav(7) }, icon('chevronRight')),
          h('button', { class: 'btn btn-sm', onclick: () => { selected = iso(today); drawWeek(); } }, 'I dag')),
        innerWidth > 900 ? timeGrid(first, hol) : h('div', { class: 'cal-wk-grid' }, Array.from({ length: 7 }, (_, i) => {
          const day = addDays(first, i), d = iso(day), evs = onDay(d), tk = tasksOn(d), hd = hol.get(d);
          const col = h('div', { class: ['cal-wk-col', d === iso(today) && 'is-today', i >= 5 && 'is-weekend'] },
            h('button', { type: 'button', class: 'cal-wk-head', title: 'Ny aftale denne dag', onclick: () => edit(null, d) }, h('span', null, DAYS[i]), h('b', null, String(day.getDate())), hd ? h('small', { class: 'cal-hol' }, hd) : null, h('span', { class: 'cal-wk-add', 'aria-hidden': 'true' }, '+')),
            evs.map(e => h('button', { type: 'button', class: 'cal-item', style: { '--c': e.color || 'var(--app)' }, draggable: movable(e) ? 'true' : null,
              ondragstart: movable(e) ? (x) => x.dataTransfer.setData('text/x-hubtech-event', e.id) : null, onclick: () => edit(e) },
              h('span', { class: 'cal-item-time' }, e.allDay ? 'Hele dagen' : `${e.start || ''}${e.end ? '–' + e.end : ''}`), h('b', null, e.series ? '↻ ' : '', e.title), e.location ? h('span', { class: 'faint' }, icon('mapPin'), e.location) : null)),
            tk.map(t => h('a', { class: 'cal-item is-task', href: '#/apps/tasks' }, h('span', { class: 'cal-item-time' }, 'Deadline'), h('b', null, t.title))),
            evs.length || tk.length ? null : h('span', { class: 'cal-wk-free faint' }, 'Fri'));
          dropTarget(col, d);
          return col;
        })));
    }

    // ── search ──
    const results = h('div', { class: 'cal-results glass panel' });
    let query = '';
    function drawResults() {
      const q = query.toLowerCase(), t = iso(today);
      const hits = allEvents().filter(e => `${e.title} ${e.location || ''} ${e.notes || ''}`.toLowerCase().includes(q))
        .map(e => ({ e, d: nextStart(e, t) || e.date })).sort((a, b) => (a.d < t) - (b.d < t) || (a.d < t ? b.d.localeCompare(a.d) : a.d.localeCompare(b.d))).slice(0, 80);
      h(clear(results), null, h('h3', { style: { marginTop: 0 } }, hits.length ? `${hits.length} ${hits.length === 1 ? 'aftale' : 'aftaler'} med “${query}”` : `Ingen aftaler med “${query}”`),
        hits.map(({ e, d }) => h('button', { type: 'button', class: 'cal-item', style: { '--c': e.color || 'var(--app)' }, onclick: () => { selected = d; const nd = parseIso(d); cursor = new Date(nd.getFullYear(), nd.getMonth(), 1); edit(occurrenceOn(e, d) || e); } },
          h('span', { class: 'cal-item-time' }, `${d < t ? 'Var ' : ''}${parseIso(d).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', year: d.slice(0, 4) !== t.slice(0, 4) ? 'numeric' : undefined })}${e.allDay ? '' : ' ' + (e.start || '')}`),
          h('b', null, e.title), e.repeat ? h('span', { class: 'faint' }, icon('refresh'), repeatShort(e.repeat)) : null, e.location ? h('span', { class: 'faint' }, icon('mapPin'), e.location) : null)));
    }
    const searchIn = h('input', { class: 'input cal-search', type: 'search', placeholder: 'Søg i aftaler …', 'aria-label': 'Søg i aftaler', oninput: (x) => { query = x.target.value.trim(); draw(); } });

    // ── hurtig tilføj ──
    const fmtWhen = (r) => [parseIso(r.date).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }), r.allDay ? 'hele dagen' : `${r.start}–${r.end}`, r.repeat ? repeatShort(r.repeat).toLowerCase() : '', r.location ? `@ ${r.location}` : ''].filter(Boolean).join(' · ');
    const quickIn = h('input', { class: 'input', placeholder: 'Skriv fx “Tandlæge i morgen kl 10” eller “Fodbold hver tirsdag 17-18”', 'aria-label': 'Hurtig tilføj', maxlength: 200 });
    const quickHint = h('span', { class: 'cal-quick-hint faint', 'aria-live': 'polite' });
    const quickAdd = () => {
      const r = parseQuick(quickIn.value, today);
      if (!r.title) { quickHint.textContent = 'Skriv hvad aftalen handler om.'; quickIn.focus(); return; }
      const e = { id: uid(), title: r.title.slice(0, 160), date: r.date, endDate: null, allDay: r.allDay, start: r.start, end: r.end, location: r.location, notes: '', color: COLORS[0][0], remind: r.allDay ? 'none' : 'm15', ...(r.repeat ? { repeat: r.repeat } : {}) };
      if (!e.repeat) e.remindAt = remindAt({ due: e.date, dueTime: e.allDay ? '09:00' : (e.start || '09:00'), remind: e.remind });
      st.events.push(e); logActivity('calendar', 'new', e.title, 'Aftale oprettet');
      selected = e.date; const d = parseIso(e.date); cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      persist(); quickIn.value = ''; quickHint.textContent = ''; draw();
      toast(`Tilføjet: ${e.title}`, { type: 'ok', text: fmtWhen(r), action: { label: 'Ret', onClick: () => edit(e) } });
    };
    quickIn.addEventListener('input', () => { const r = parseQuick(quickIn.value, today); quickHint.textContent = quickIn.value.trim() && r.title ? `${r.title} – ${fmtWhen(r)}` : ''; });
    quickIn.addEventListener('keydown', (k) => { if (k.key === 'Enter') { k.preventDefault(); quickAdd(); } });
    const quickBox = h('div', { class: 'cal-quick glass panel' }, h('div', { class: 'cal-quick-row' }, icon('sparkles'), quickIn, h('button', { class: 'btn app-solid', onclick: quickAdd }, icon('plus'), 'Tilføj')), quickHint);

    const monthWrap = h('div', { class: 'cal-layout' }, h('div', { class: 'cal-main glass panel' },
      h('div', { class: 'cal-nav' },
        h('button', { class: 'icon-btn', 'aria-label': 'Forrige måned', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); drawMonth(); } }, icon('chevronLeft')),
        title,
        h('button', { class: 'icon-btn', 'aria-label': 'Næste måned', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); drawMonth(); } }, icon('chevronRight')),
        h('button', { class: 'btn btn-sm', onclick: () => { cursor = new Date(today.getFullYear(), today.getMonth(), 1); selected = iso(today); drawMonth(); drawSide(); } }, 'I dag')),
      grid), side);
    function draw() {
      stats();
      const v0 = query ? 'search' : view;
      monthWrap.hidden = v0 !== 'month'; agenda.hidden = v0 !== 'agenda'; weekBox.hidden = v0 !== 'week'; results.hidden = v0 !== 'search';
      if (v0 === 'search') drawResults();
      else if (v0 === 'month') { drawMonth(); drawSide(); } else if (v0 === 'week') drawWeek(); else drawAgenda();
    }

    // ── import / export ──
    const exportIcs = () => { saveBlob('HUBTECH-kalender.ics', new Blob([toIcs(allEvents().filter(e => !e.bday))], { type: 'text/calendar' })); toast('Kalender hentet', { type: 'ok', text: 'Åbn .ics-filen på telefonen eller i Outlook/Google Kalender.' }); };
    const importIcs = () => {
      const inp = h('input', { type: 'file', accept: '.ics,text/calendar', style: { display: 'none' } });
      inp.addEventListener('change', async () => {
        const f = inp.files[0]; inp.remove(); if (!f) return;
        const evs = fromIcs(await f.text());
        if (!evs.length) { toast('Ingen aftaler fundet i filen', { type: 'warn' }); return; }
        const seen = new Set(st.events.map(e => `${e.date}|${e.start}|${e.title}`));
        const fresh = evs.filter(e => !seen.has(`${e.date}|${e.start}|${e.title}`));
        st.events.push(...fresh); persist(); draw();
        toast(`${fresh.length} aftaler hentet`, { type: 'ok', text: fresh.length < evs.length ? `${evs.length - fresh.length} fandtes allerede.` : '' });
      });
      document.body.appendChild(inp); inp.click();
    };

    // ── subscribe from the phone: a private .ics address the phone's calendar follows by itself ──
    async function subscribe() {
      const out = h('div', { class: 'stack', style: { gap: '10px' } });
      const local = /^(localhost|127\.|\[::1\])/.test(location.host);
      const show = (r) => {
        const qr = h('span', { class: 'hl-qr' });
        import('../features/qr.js').then(m => m.qrSvg(r.webcal, 170)).then(svg => qr.append(svg)).catch(() => {});
        h(clear(out), null,
          h('div', { class: 'hl-code' }, qr, h('div', { class: 'stack', style: { gap: '8px', minWidth: 0 } },
            h('span', { class: 'faint', style: { fontSize: '13px' } }, 'Scan koden med telefonen, eller kopiér adressen ind i Outlook eller Google Kalender (“Tilføj kalender fra URL”).'),
            h('input', { class: 'input hl-codetext', readonly: true, value: r.url, 'aria-label': 'Kalenderens adresse', onfocus: (e) => e.target.select() }),
            h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
              h('a', { class: 'btn btn-primary', href: r.webcal }, icon('smartphone'), 'Åbn på denne enhed'),
              h('button', { class: 'btn', onclick: () => import('../features/appkit.js').then(m => m.copy(r.url, 'Adressen er kopieret')) }, icon('copy'), 'Kopiér')))),
          h('p', { class: 'faint', style: { margin: 0, fontSize: '13px' } }, 'Telefonen henter ændringer af sig selv (typisk hver time). Kun dem med adressen kan se kalenderen – del den ikke.'),
          h('div', { class: 'row', style: { gap: '8px' } },
            h('button', { class: 'btn btn-sm', onclick: async () => show(await api.post('/api/calendar/feed', {})) }, icon('refresh'), 'Lav en ny adresse'),
            h('button', { class: 'btn btn-sm btn-ghost', style: { color: 'var(--bad)' }, onclick: async () => { await api.del('/api/calendar/feed'); m.close(); toast('Abonnementet er slået fra', { type: 'ok', text: 'Den gamle adresse virker ikke mere.' }); } }, 'Slå fra')));
      };
      const startBtn = h('button', { class: 'btn btn-primary' }, icon('smartphone'), 'Lav min kalender-adresse');
      startBtn.addEventListener('click', async () => { try { show(await api.post('/api/calendar/feed', {})); } catch (e) { toast(e.message, { type: 'bad' }); } });
      h(out, null, startBtn);
      const m = modal({ title: 'Se kalenderen i telefonen', label: 'Kalender', size: 560,
        body: h('div', { class: 'stack', style: { gap: '12px' } },
          h('p', { style: { margin: 0 } }, 'Få dine HUBTECH-aftaler – også de gentagne – i telefonens egen kalender, så de bliver opdateret af sig selv.'),
          local ? h('div', { class: 'callout warn' }, icon('alert'), h('div', null, 'Du bruger HUBTECH på denne computers egen adresse, som telefonen ikke kan nå. Åbn HUBTECH via netværks- eller Tailscale-adressen først (', h('a', { href: '#/settings/about' }, 'Indstillinger → Om → Netværk'), ').')) : null,
          out),
        actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Luk')] });
      try { const s0 = await api.get('/api/calendar/feed'); if (s0.active) h(clear(out), null, h('p', { class: 'faint', style: { margin: 0 } }, 'Du har allerede en adresse. Af sikkerhedshensyn kan den ikke vises igen – lav en ny, hvis du skal bruge den (den gamle holder op med at virke).'), startBtn, h('button', { class: 'btn btn-sm btn-ghost', style: { color: 'var(--bad)', justifySelf: 'start' }, onclick: async () => { await api.del('/api/calendar/feed'); m.close(); toast('Abonnementet er slået fra', { type: 'ok' }); } }, 'Slå fra')); } catch { /* */ }
    }

    // ── print / PDF ──
    const printDialog = () => {
      let kind = view === 'agenda' ? 'list' : 'month';
      const monthIn = h('input', { class: 'input', type: 'month', value: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`, 'aria-label': 'Måned' });
      const dayIn = h('input', { class: 'input', type: 'date', value: selected, 'aria-label': 'Dag i ugen' });
      const fromIn = h('input', { class: 'input', type: 'date', value: iso(today), 'aria-label': 'Fra dato' });
      const daysIn = h('select', { class: 'select', 'aria-label': 'Periode' }, [[7, '1 uge'], [14, '2 uger'], [31, '1 måned'], [92, '3 måneder'], [366, '1 år']].map(([v, l]) => h('option', { value: v, selected: v === 31 }, l)));
      const withTasks = h('input', { type: 'checkbox', checked: true }), withNotes = h('input', { type: 'checkbox', checked: true });
      const opt = (label, el) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);
      const check = (el, text) => h('label', { class: 'cal-pcheck' }, el, h('span', null, text));
      const periodBox = h('div', { class: 'cal-pperiod' });
      const drawPeriod = () => h(clear(periodBox), null, kind === 'month' ? opt('Måned', monthIn) : kind === 'week' ? opt('En dag i ugen', dayIn) : h('div', { class: 'grid-2' }, opt('Fra', fromIn), opt('Periode', daysIn)));
      const seg = segmented([{ value: 'month', label: 'Måned', icon: 'grid' }, { value: 'week', label: 'Uge', icon: 'calendar' }, { value: 'list', label: 'Liste', icon: 'list' }], kind, (v) => { kind = v; drawPeriod(); notesRow.hidden = v !== 'list'; }, { label: 'Layout' });
      const notesRow = check(withNotes, 'Noter og sted under aftalerne'); notesRow.hidden = kind !== 'list';
      drawPeriod();
      const data = () => ({ events: expand(allEvents(), iso(addDays(today, -400)), iso(addDays(today, 800))), tasks: withTasks.checked ? tasks : [], holidays, withTasks: withTasks.checked });
      const parts = () => {
        if (kind === 'month') { const [y, m] = (monthIn.value || `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`).split('-').map(Number); return { year: y, month: m - 1, name: `${MONTHS[m - 1]}-${y}` }; }
        if (kind === 'week') { const d = parseIso(dayIn.value || selected); return { day: d, name: `uge-${isoWeek(d)}-${d.getFullYear()}` }; }
        return { from: parseIso(fromIn.value || iso(today)), days: Number(daysIn.value), withNotes: withNotes.checked, name: `aftaler-${fromIn.value}` };
      };
      const doPrint = async () => {
        const [{ printDocument }, cp] = await Promise.all([import('../features/printing.js'), import('../features/calprint.js')]);
        const p = parts(), d = data();
        const body = kind === 'month' ? cp.monthHtml(p.year, p.month, d) : kind === 'week' ? cp.weekHtml(p.day, d) : cp.listHtml(p.from, p.days, d, p);
        await printDocument({ title: `Kalender – ${p.name}`, css: cp.CAL_CSS, body, landscape: kind !== 'list', accent: '#0a659b' });
        m.close();
      };
      const doPdf = async (btn) => {
        btn.disabled = true;
        try {
          const cp = await import('../features/calprint.js');
          const p = parts();
          const blob = await cp.calendarPdf(kind, { ...p, accent: '#0a659b' }, data());
          await saveBlob(`Kalender ${p.name}.pdf`, blob);
          m.close();
        } catch (e) { toast('PDF kunne ikke laves', { type: 'bad', text: e.message }); }
        finally { btn.disabled = false; }
      };
      const pdfBtn = h('button', { class: 'btn btn-primary', onclick: () => doPdf(pdfBtn) }, icon('download'), 'Hent PDF');
      const m = modal({ title: 'Print eller hent kalenderen', label: 'Kalender', size: 560,
        body: h('div', { class: 'cal-print' }, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Layout'), seg), periodBox,
          h('div', { class: 'cal-pchecks' }, check(withTasks, 'Deadlines fra Opgaver'), notesRow),
          h('p', { class: 'faint', style: { margin: 0 } }, 'Måned og uge udskrives på A4 på tværs, listen på A4 på højkant. Helligdage og ugenumre kommer med.')),
        actions: [h('button', { class: 'btn', onclick: doPrint }, icon('file'), 'Print'), pdfBtn] });
    };

    unsub.forEach(f => f());
    unsub = [onLive('cal', loadShared), onLive('cal-events', (x) => { if (x.by !== store.get('user')?.id) loadShared(); }), onLive('reset', loadShared)];
    drawCals(); loadShared();
    try { const sv = localStorage.getItem('hubtech.cal.view'); if (['month', 'week', 'agenda'].includes(sv)) view = sv; } catch { /* */ }
    const viewSel = segmented([{ value: 'month', label: 'Måned', icon: 'grid' }, { value: 'week', label: 'Uge', icon: 'calendar' }, { value: 'agenda', label: 'Liste', icon: 'list' }], view, (x) => { view = x; try { localStorage.setItem('hubtech.cal.view', x); } catch { /* */ } draw(); }, { label: 'Visning' });
    // keyboard: T i dag · M/U/L visning · N ny aftale · / søg (not while typing or with a dialog open)
    const onKeys = (k) => {
      if (!searchIn.isConnected) { document.removeEventListener('keydown', onKeys); return; }
      if (k.ctrlKey || k.metaKey || k.altKey || document.querySelector('.modal-backdrop') || k.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const key = k.key.toLowerCase();
      const setView = (v) => { const b = viewSel.querySelectorAll('button')[['month', 'week', 'agenda'].indexOf(v)]; b?.click(); };
      if (key === 't') { selected = iso(today); cursor = new Date(today.getFullYear(), today.getMonth(), 1); draw(); }
      else if (key === 'm') setView('month'); else if (key === 'u') setView('week'); else if (key === 'l') setView('agenda');
      else if (key === 'n') { k.preventDefault(); edit(null, selected); }
      else if (key === '/') { k.preventDefault(); searchIn.focus(); }
      else return;
    };
    document.addEventListener('keydown', onKeys);
    draw();
    return h('div', { class: 'page calendar-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Arbejdsrum', title: 'Kalender', lead: 'Dine aftaler, opfølgninger fra Servicehjælp, delte kalendere med andre, helligdage og deadlines fra Opgaver – samlet ét sted.',
        actions: [heroBtn('Ny aftale', 'plus', { onclick: () => edit(null, selected) }), heroGhost('Print / PDF', 'file', { onclick: printDialog }), heroGhost('I telefonen', 'smartphone', { onclick: subscribe }), heroGhost('Hent .ics', 'download', { onclick: exportIcs }), heroGhost('Importér', 'upload', { onclick: importIcs })],
        stats: [
          { icon: 'calendar', label: 'Aftaler i dag', value: v.today },
          { icon: 'list', label: 'Næste 7 dage', value: v.week },
          { icon: 'clock', label: 'Næste aftale', value: v.next },
          { icon: 'kanban', label: 'Deadlines denne uge', value: v.dl }],
      }),
      quickBox,
      h('div', { class: 'cal-bar on-world' }, viewSel, searchIn, h('span', { class: 'faint kb-keys' }, 'Træk en aftale til en anden dag · T i dag · M/U/L visning · N ny aftale · / søg')),
      calsBox, monthWrap, weekBox, results, agenda);
  },
};
