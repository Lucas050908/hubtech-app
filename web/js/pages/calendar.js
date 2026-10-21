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
    ];

    // events on a day (multi-day events span their range)
    const onDay = (d) => allEvents().filter(e => d >= e.date && d <= (e.endDate || e.date)).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || String(a.start || '').localeCompare(String(b.start || '')));
    const tasksOn = (d) => tasks.filter(t => t.due === d);

    const v = { today: h('span'), week: h('span'), next: h('span'), dl: h('span') };
    function stats() {
      const t = iso(today), wEnd = iso(addDays(today, 7));
      v.today.textContent = String(onDay(t).length);
      v.week.textContent = String(allEvents().filter(e => e.date >= t && e.date < wEnd).length);
      const now = new Date();
      const up = allEvents().map(e => ({ e, at: new Date(`${e.date}T${e.allDay ? '00:00' : (e.start || '00:00')}`) })).filter(x => x.at >= now || x.e.date === t).sort((a, b) => a.at - b.at)[0];
      v.next.textContent = up ? `${up.e.date === t ? 'I dag' : up.at.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}${up.e.allDay ? '' : ' ' + (up.e.start || '')}` : '—';
      v.dl.textContent = String(tasks.filter(x => x.due >= t && x.due < wEnd).length);
    }

    // ── editor ──
    function edit(ev, date) {
      if (ev?.cal) { const c = calById(ev.cal); if (!c || c.role === 'viewer') return viewOnly(ev, c); }
      const isNew = !ev;
      const fromCal = ev?.cal || null;
      const e = ev ? { ...ev } : { id: uid(), title: '', date: date || selected, allDay: false, start: '09:00', end: '10:00', location: '', notes: '', color: COLORS[0][0], remind: 'm15' };
      const ti = h('input', { class: 'input', value: e.title, maxlength: 160, placeholder: 'Fx Service hos Jensen A/S', 'aria-label': 'Titel' });
      const da = h('input', { class: 'input', type: 'date', value: e.date, 'aria-label': 'Dato' });
      const de = h('input', { class: 'input', type: 'date', value: e.endDate || '', 'aria-label': 'Slutdato (valgfri)' });
      const ad = h('input', { type: 'checkbox', checked: !!e.allDay, id: 'cal-allday' });
      const s1 = h('input', { class: 'input', type: 'time', value: e.start || '', 'aria-label': 'Start' });
      const s2 = h('input', { class: 'input', type: 'time', value: e.end || '', 'aria-label': 'Slut' });
      const lo = h('input', { class: 'input', value: e.location || '', maxlength: 200, placeholder: 'Adresse eller sted', 'aria-label': 'Sted' });
      const rm = h('select', { class: 'select', 'aria-label': 'Påmindelse' }, Object.entries(REMIND).map(([k, r]) => h('option', { value: k, selected: (e.remind || 'none') === k }, r.label)));
      const no = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Noter', 'aria-label': 'Noter' }); no.value = e.notes || '';
      let color = e.color || COLORS[0][0];
      const sw = h('div', { class: 'cal-swatches', role: 'group', 'aria-label': 'Farve' });
      const drawSw = () => h(clear(sw), null, COLORS.map(([c, l]) => h('button', { type: 'button', class: 'cal-swatch', style: { '--sw': c }, 'aria-label': l, 'aria-pressed': String(c === color), onclick: () => { color = c; drawSw(); } })));
      drawSw();
      const times = h('div', { class: 'grid-2', hidden: !!e.allDay },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Start'), s1),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Slut'), s2));
      ad.addEventListener('change', () => { times.hidden = ad.checked; });
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
        const data = { title: e.title, date: e.date, endDate: e.endDate, allDay: e.allDay, start: e.start, end: e.end, location: e.location, notes: e.notes, color };
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
        const at = remindAt({ due: e.date, dueTime: e.allDay ? '09:00' : (e.start || '09:00'), remind: e.remind });
        if (at !== e.remindAt) { e.remindAt = at; e.reminded = false; }
        if (isNew || fromCal) { st.events.push(e); logActivity('calendar', 'new', e.title, 'Aftale oprettet'); }
        else Object.assign(st.events.find(x => x.id === e.id), e);
        selected = e.date;
        const d = parseIso(e.date); cursor = new Date(d.getFullYear(), d.getMonth(), 1);
        persist(); m.close(); draw();
      };
      const actions = [];
      if (!isNew) actions.push(h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: async () => {
        if (!await confirmDialog({ title: 'Slet aftale?', text: fromCal ? `“${e.title}” slettes for alle i “${calById(fromCal)?.name}”.` : `“${e.title}” slettes.`, confirmLabel: 'Slet', danger: true })) return;
        if (fromCal) {
          try { await api.del(`/api/calendars/${fromCal}/events/${e.id}`); } catch (x) { toast('Kunne ikke slette', { type: 'bad', text: x.message }); return; }
          m.close(); await loadShared(); toast('Aftale slettet', { text: e.title }); return;
        }
        st.events = st.events.filter(x => x.id !== e.id); persist(); m.close(); draw();
        toast('Aftale slettet', { text: e.title, action: { label: 'Fortryd', onClick: () => { st.events.push(ev); persist(); draw(); } } });
      } }, icon('trash'), 'Slet'));
      if (!isNew) actions.push(h('button', { class: 'btn btn-ghost', title: 'Del aftalen i en chat', onclick: () => shareEvent(e) }, icon('share'), 'Del'));
      actions.push(h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: save }, 'Gem'));
      m = modal({
        title: isNew ? 'Ny aftale' : 'Redigér aftale', label: 'Kalender', size: 560,
        body: h('div', { class: 'stack cal-form', style: { gap: '12px' } },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), ti),
          calSel ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Kalender'), calSel) : null,
          fromCal && ev.by ? h('p', { class: 'faint', style: { margin: 0 } }, `Oprettet af ${ev.by}${ev.updatedBy && ev.updatedBy !== ev.by ? ` · sidst rettet af ${ev.updatedBy}` : ''}`) : null,
          h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Dato'), da), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Til og med (valgfri)'), de)),
          h('label', { class: 'cal-check' }, ad, 'Hele dagen'),
          times,
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Sted'), lo),
          h('div', { class: 'grid-2' }, remindField, h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Farve'), sw)),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Noter'), no), err),
        actions,
      });
      syncCal();
      ti.addEventListener('keydown', (k) => { if (k.key === 'Enter') save(); });
      setTimeout(() => ti.focus(), 50);
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
      setTimeout(() => name.focus(), 50);
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
    const pill = (e, d) => h('button', { type: 'button', class: ['cal-pill', e.allDay && 'is-allday'], style: { '--c': e.color || 'var(--app)' }, title: e.title, onclick: (x) => { x.stopPropagation(); edit(e); } },
      !e.allDay && e.start && d === e.date ? h('span', { class: 'cal-time' }, e.start) : null, e.title);

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
          e.remind && e.remind !== 'none' ? h('span', { class: 'faint' }, icon('bell'), REMIND[e.remind]?.short) : null)),
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
    const monthWrap = h('div', { class: 'cal-layout' }, h('div', { class: 'cal-main glass panel' },
      h('div', { class: 'cal-nav' },
        h('button', { class: 'icon-btn', 'aria-label': 'Forrige måned', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); drawMonth(); } }, icon('chevronLeft')),
        title,
        h('button', { class: 'icon-btn', 'aria-label': 'Næste måned', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); drawMonth(); } }, icon('chevronRight')),
        h('button', { class: 'btn btn-sm', onclick: () => { cursor = new Date(today.getFullYear(), today.getMonth(), 1); selected = iso(today); drawMonth(); drawSide(); } }, 'I dag')),
      grid), side);
    function draw() {
      stats();
      monthWrap.hidden = view !== 'month'; agenda.hidden = view !== 'agenda';
      if (view === 'month') { drawMonth(); drawSide(); } else drawAgenda();
    }

    // ── import / export ──
    const exportIcs = () => { saveBlob('HUBTECH-kalender.ics', new Blob([toIcs(allEvents())], { type: 'text/calendar' })); toast('Kalender hentet', { type: 'ok', text: 'Åbn .ics-filen på telefonen eller i Outlook/Google Kalender.' }); };
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
      const data = () => ({ events: allEvents(), tasks: withTasks.checked ? tasks : [], holidays, withTasks: withTasks.checked });
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
    const viewSel = segmented([{ value: 'month', label: 'Måned', icon: 'grid' }, { value: 'agenda', label: 'Liste', icon: 'list' }], view, (x) => { view = x; draw(); }, { label: 'Visning' });
    draw();
    return h('div', { class: 'page calendar-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Arbejdsrum', title: 'Kalender', lead: 'Dine aftaler, Servicehjælps aftaler, delte kalendere med andre, helligdage og deadlines fra Opgaver – samlet ét sted.',
        actions: [heroBtn('Ny aftale', 'plus', { onclick: () => edit(null, selected) }), heroGhost('Print / PDF', 'file', { onclick: printDialog }), heroGhost('Hent .ics', 'download', { onclick: exportIcs }), heroGhost('Importér', 'upload', { onclick: importIcs })],
        stats: [
          { icon: 'calendar', label: 'Aftaler i dag', value: v.today },
          { icon: 'list', label: 'Næste 7 dage', value: v.week },
          { icon: 'clock', label: 'Næste aftale', value: v.next },
          { icon: 'kanban', label: 'Deadlines denne uge', value: v.dl }],
      }),
      h('div', { class: 'cal-bar on-world' }, viewSel, h('span', { class: 'faint kb-keys' }, 'Piletaster flytter dagen · Enter eller dobbeltklik opretter en aftale')),
      calsBox, monthWrap, agenda);
  },
};
