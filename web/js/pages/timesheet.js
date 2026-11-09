/** Tidsregistrering — start/stop timer on customers/projects, day/week/month totals, hourly rate, CSV/Excel export. */
import { h, clear } from '../core/dom.js';
import { query } from '../core/router.js';
import { icon } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, modal, confirmDialog, stateBlock, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { saveBlob } from '../core/files.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dur = (ms) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
const hours = (ms) => (ms / 3600000).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kr = (n) => (Number(n) || 0).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });
const startOfWeek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

let st = null, tick = 0;

export default {
  title: 'Tidsregistrering',
  destroy() { flushState('timesheet'); clearInterval(tick); },
  async render() {
    const app = appById('timesheet');
    try { st = (await getState('timesheet', { force: true })) || {}; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Timesedlen kunne ikke hentes', text: e.message })); }
    if (!Array.isArray(st.entries)) st.entries = [];
    if (!st.rate) st.rate = 450;
    const persist = () => { saveState('timesheet', st, { onError: () => toast('Tiden kunne ikke gemmes', { type: 'bad' }) }); };
    const projects = () => [...new Set(st.entries.map(e => e.project).filter(Boolean))].slice(0, 40);

    // ── the running timer ──
    const clock = h('div', { class: 'ts-clock', 'aria-live': 'off' }, '0:00:00');
    const desc = h('input', { class: 'input', placeholder: 'Hvad laver du? Fx “Service på printer”', maxlength: 200, 'aria-label': 'Beskrivelse' });
    const proj = h('input', { class: 'input', placeholder: 'Kunde eller projekt', maxlength: 80, list: 'ts-projects', 'aria-label': 'Kunde eller projekt' });
    const plist = h('datalist', { id: 'ts-projects' });
    const bill = h('input', { type: 'checkbox', checked: true, id: 'ts-bill' });
    const startBtn = h('button', { class: 'btn app-solid ts-start' });
    function drawRunning() {
      const r = st.running;
      h(clear(startBtn), null, icon(r ? 'pause' : 'play'), r ? 'Stop' : 'Start');
      startBtn.classList.toggle('is-running', !!r);
      if (r) { desc.value = r.desc || ''; proj.value = r.project || ''; bill.checked = r.billable !== false; }
      h(clear(plist), null, projects().map(p => h('option', { value: p })));
      updateClock();
    }
    function updateClock() {
      const r = st.running;
      const s = r ? Math.floor((Date.now() - r.start) / 1000) : 0;
      clock.textContent = `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
      document.title = r ? `⏱ ${clock.textContent} · Tidsregistrering` : 'Tidsregistrering · HUBTECH';
    }
    function toggle() {
      if (st.running) {
        const r = st.running, end = Date.now();
        if (end - r.start < 30000) { st.running = null; persist(); drawRunning(); toast('Under 30 sekunder – ikke gemt', { ms: 1800 }); return; }
        st.entries.unshift({ id: uid(), start: r.start, end, desc: desc.value.trim() || r.desc || '', project: proj.value.trim() || r.project || '', billable: bill.checked });
        st.running = null;
        logActivity('timesheet', 'stop', desc.value.trim() || 'Tid registreret', dur(end - r.start));
        toast('Tid registreret', { type: 'ok', text: `${dur(end - r.start)} på ${proj.value.trim() || 'ingen kunde'}` });
      } else {
        st.running = { start: Date.now(), desc: desc.value.trim(), project: proj.value.trim(), billable: bill.checked };
      }
      persist(); drawRunning(); draw();
    }
    startBtn.addEventListener('click', toggle);
    for (const el of [desc, proj]) el.addEventListener('change', () => { if (st.running) { st.running.desc = desc.value.trim(); st.running.project = proj.value.trim(); persist(); } });
    bill.addEventListener('change', () => { if (st.running) { st.running.billable = bill.checked; persist(); } });
    for (const el of [desc, proj]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') toggle(); });

    // ── stats & list ──
    const v = { today: h('span'), week: h('span'), month: h('span'), money: h('span') };
    let range = 'week';
    const list = h('div', { class: 'ts-list' });
    const inRange = (e) => {
      const now = new Date();
      if (range === 'week') return e.start >= startOfWeek(now).getTime();
      if (range === 'month') return e.start >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      if (range === 'last') { const a = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), b = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); return e.start >= a && e.start < b; }
      return true;
    };
    const sum = (arr) => arr.reduce((a, e) => a + (e.end - e.start), 0);
    function stats() {
      const now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      v.today.textContent = dur(sum(st.entries.filter(e => e.start >= d0)));
      v.week.textContent = dur(sum(st.entries.filter(e => e.start >= startOfWeek(now).getTime())));
      const mon = st.entries.filter(e => e.start >= new Date(now.getFullYear(), now.getMonth(), 1).getTime());
      v.month.textContent = dur(sum(mon));
      v.money.textContent = kr(sum(mon.filter(e => e.billable !== false)) / 3600000 * st.rate);
    }
    function draw() {
      stats();
      clear(list);
      const items = st.entries.filter(inRange).sort((a, b) => b.start - a.start);
      if (!items.length) { list.appendChild(stateBlock({ app: app.hue, icon: 'stopwatch', title: 'Ingen registreringer i perioden', text: 'Tryk Start, når du går i gang – eller tilføj tid bagefter.', actions: [h('button', { class: 'btn', onclick: () => edit() }, icon('plus'), 'Tilføj tid manuelt')] })); return; }
      // per-project summary for the period
      const byProj = new Map();
      for (const e of items) { const k = e.project || 'Uden kunde/projekt'; byProj.set(k, (byProj.get(k) || 0) + (e.end - e.start)); }
      const total = sum(items);
      list.appendChild(h('div', { class: 'ts-summary' }, [...byProj].sort((a, b) => b[1] - a[1]).map(([p, ms]) => h('div', { class: 'ts-sum-row' },
        h('span', { class: 'ts-sum-name' }, p), h('span', { class: 'ts-bar', style: { '--w': `${Math.max(4, ms / total * 100)}%` } }), h('b', null, dur(ms))))));
      let day = null;
      for (const e of items) {
        const d = isoDay(e.start);
        if (d !== day) {
          day = d;
          const dayMs = sum(items.filter(x => isoDay(x.start) === d));
          list.appendChild(h('div', { class: 'ts-day' }, h('b', null, new Date(e.start).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })), h('span', { class: 'faint' }, dur(dayMs))));
        }
        list.appendChild(h('button', { type: 'button', class: 'ts-entry', onclick: () => edit(e) },
          h('span', { class: 'ts-when' }, `${hm(e.start)}–${hm(e.end)}`),
          h('span', { class: 'ts-what' }, h('b', null, e.desc || 'Uden beskrivelse'), e.project ? h('span', { class: 'chip' }, e.project) : null, e.billable === false ? h('span', { class: 'chip' }, 'Ikke fakturerbar') : null, e.invoice ? h('span', { class: 'chip chip-ok' }, 'Faktureret') : null),
          h('span', { class: 'ts-dur' }, dur(e.end - e.start))));
      }
      list.appendChild(h('div', { class: 'ts-total' }, h('span', null, `I alt (${hours(total)} timer)`), h('b', null, `${dur(total)} · ${kr(sum(items.filter(e => e.billable !== false)) / 3600000 * st.rate)}`)));
    }

    function edit(entry) {
      const isNew = !entry;
      const now = Date.now();
      const e = entry ? { ...entry } : { id: uid(), start: now - 3600000, end: now, desc: '', project: '', billable: true };
      const dateIn = h('input', { class: 'input', type: 'date', value: isoDay(e.start), 'aria-label': 'Dato' });
      const fromIn = h('input', { class: 'input', type: 'time', value: hm(e.start), 'aria-label': 'Fra' });
      const toIn = h('input', { class: 'input', type: 'time', value: hm(e.end), 'aria-label': 'Til' });
      const dIn = h('input', { class: 'input', value: e.desc, maxlength: 200, 'aria-label': 'Beskrivelse' });
      const pIn = h('input', { class: 'input', value: e.project, maxlength: 80, list: 'ts-projects', 'aria-label': 'Kunde eller projekt' });
      const bIn = h('input', { type: 'checkbox', checked: e.billable !== false, id: 'ts-ebill' });
      const err = h('div', { class: 'field-error' });
      const field = (l, i) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, l), i);
      let m;
      const save = () => {
        const s = new Date(`${dateIn.value}T${fromIn.value}`).getTime();
        let en = new Date(`${dateIn.value}T${toIn.value}`).getTime();
        if (!isFinite(s) || !isFinite(en)) { err.textContent = 'Udfyld dato og tidspunkter.'; return; }
        if (en <= s) en += 86400000;   // past midnight
        if (en - s > 24 * 3600000) { err.textContent = 'En registrering kan højst være 24 timer.'; return; }
        Object.assign(e, { start: s, end: en, desc: dIn.value.trim(), project: pIn.value.trim(), billable: bIn.checked });
        if (isNew) st.entries.push(e); else Object.assign(st.entries.find(x => x.id === e.id), e);
        persist(); m.close(); draw(); drawRunning();
      };
      const actions = [];
      if (!isNew) actions.push(h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: async () => {
        if (!await confirmDialog({ title: 'Slet registrering?', text: `${e.desc || 'Registreringen'} (${dur(e.end - e.start)}) slettes.`, confirmLabel: 'Slet', danger: true })) return;
        st.entries = st.entries.filter(x => x.id !== e.id); persist(); m.close(); draw();
      } }, icon('trash'), 'Slet'));
      actions.push(h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: save }, 'Gem'));
      m = modal({
        title: isNew ? 'Tilføj tid' : 'Redigér tid', label: 'Tidsregistrering', size: 520,
        body: h('div', { class: 'stack', style: { gap: '12px' } }, field('Beskrivelse', dIn), field('Kunde eller projekt', pIn),
          h('div', { class: 'ts-grid3' }, field('Dato', dateIn), field('Fra', fromIn), field('Til', toIn)),
          h('label', { class: 'cal-check' }, bIn, 'Fakturerbar'), err),
        actions,
      });
    }

    function exportRows() {
      const items = st.entries.filter(inRange).sort((a, b) => a.start - b.start);
      return [['Dato', 'Fra', 'Til', 'Timer', 'Kunde/projekt', 'Beskrivelse', 'Fakturerbar', 'Beløb (kr.)']].concat(items.map(e => {
        const t = (e.end - e.start) / 3600000;
        return [isoDay(e.start).split('-').reverse().join('-'), hm(e.start), hm(e.end), t, e.project, e.desc, e.billable === false ? 'Nej' : 'Ja', e.billable === false ? 0 : Math.round(t * st.rate * 100) / 100];
      }));
    }
    const periodName = () => ({ week: 'denne-uge', month: 'denne-maaned', last: 'sidste-maaned', all: 'alt' }[range]);
    function exportCsv() {
      const cell = (x) => { const s = typeof x === 'number' ? String(Math.round(x * 100) / 100).replace('.', ',') : String(x ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      saveBlob(`timeseddel-${periodName()}.csv`, new Blob(['﻿' + exportRows().map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    }
    async function exportXlsx() {
      try {
        const { loadXlsx } = await import('../office/store.js');
        const X = await loadXlsx();
        const rows = exportRows();
        const ws = X.utils.aoa_to_sheet(rows);
        const n = rows.length;
        ws[`D${n + 1}`] = { t: 'n', f: `SUM(D2:D${n})`, z: '0.00' };
        ws[`H${n + 1}`] = { t: 'n', f: `SUM(H2:H${n})`, z: '#,##0.00 "kr."' };
        ws[`A${n + 1}`] = { t: 's', v: 'I alt' };
        ws['!ref'] = `A1:H${n + 1}`;
        for (let r = 2; r <= n; r++) { if (ws[`D${r}`]) ws[`D${r}`].z = '0.00'; if (ws[`H${r}`]) ws[`H${r}`].z = '#,##0.00 "kr."'; }
        ws['!cols'] = [{ wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 24 }, { wch: 40 }, { wch: 11 }, { wch: 14 }];
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, 'Timeseddel');
        saveBlob(`timeseddel-${periodName()}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      } catch (e) { toast('Excel-filen kunne ikke laves', { type: 'bad', text: e.message }); }
    }
    const rateIn = h('input', { class: 'input ts-rate', type: 'number', min: 0, step: 25, value: st.rate, 'aria-label': 'Timepris i kroner' });
    rateIn.addEventListener('change', () => { st.rate = Math.max(0, Number(rateIn.value) || 0); persist(); draw(); });

    clearInterval(tick);
    tick = setInterval(updateClock, 1000);
    drawRunning(); draw();
    const rangeSel = segmented([{ value: 'week', label: 'Denne uge' }, { value: 'month', label: 'Denne måned' }, { value: 'last', label: 'Sidste måned' }, { value: 'all', label: 'Alt' }], range, (x) => { range = x; draw(); }, { label: 'Periode' });
    if (query().get('start')) { history.replaceState(null, '', '#/apps/timesheet'); if (!st.running) setTimeout(() => { toggle(); toast('Uret er startet', { type: 'ok', text: 'Skriv hvad du laver og hos hvem – det kan også gøres bagefter.' }); }, 250); }
    return h('div', { class: 'page timesheet-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Arbejdsrum', title: 'Tidsregistrering', lead: 'Ét klik når du starter, ét når du stopper. Se hvor tiden går hen – og hvad den er værd.',
        actions: [heroGhost('Tilføj tid', 'plus', { onclick: () => edit() }), heroGhost('Hent Excel', 'download', { onclick: exportXlsx })],
        stats: [
          { icon: 'clock', label: 'I dag', value: v.today },
          { icon: 'calendar', label: 'Denne uge', value: v.week },
          { icon: 'chart', label: 'Denne måned', value: v.month },
          { icon: 'sparkles', label: 'Fakturerbart (måned)', value: v.money }],
      }),
      h('section', { class: 'glass panel ts-timer' },
        clock,
        h('div', { class: 'ts-fields' }, desc, proj, plist, h('label', { class: 'cal-check' }, bill, 'Fakturerbar')),
        startBtn),
      h('div', { class: 'ts-bar-row on-world' }, rangeSel, h('span', { style: { flex: 1 } }),
        h('label', { class: 'ts-rate-wrap' }, 'Timepris', rateIn, 'kr.'),
        h('button', { class: 'btn btn-sm', onclick: exportCsv }, icon('download'), 'CSV')),
      h('section', { class: 'glass panel' }, list));
  },
};
