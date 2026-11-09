/** Kalender → print (month / week / list) and PDF. Pure layout code; the calendar page supplies the data. */
import { esc } from './printing.js';
import { loadScript } from '../office/store.js';

export const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const DAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7); };
const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));

/** Everything that happens on a day: events (multi-day aware), task deadlines and the holiday. Sorted by time. */
export function dayItems(day, { events = [], tasks = [], holidays = () => new Map(), withTasks = true }) {
  const k = iso(day);
  const items = events.filter(e => e.date <= k && (e.endDate || e.date) >= k)
    .map(e => ({ kind: 'event', time: e.allDay || !e.start ? '' : e.start, end: e.allDay ? '' : e.end || '', title: e.title || 'Aftale', where: e.location || '', notes: e.notes || '', color: e.color || '#2563eb', multi: !!e.endDate && e.endDate !== e.date }));
  if (withTasks) for (const t of tasks) if (t.due === k && t.status !== 'done') items.push({ kind: 'task', time: t.dueTime || '', title: t.title, where: '', notes: '', color: '#e11d74' });
  items.sort((a, b) => (a.time ? 0 : -1) - (b.time ? 0 : -1) || a.time.localeCompare(b.time));
  return { items, holiday: holidays(day.getFullYear()).get(k) || '' };
}

const CSS = `
.m-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.m-grid th { font: 700 8pt Sora, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #5b6b80; padding: 0 0 2mm; text-align: left; }
.m-grid th.wk, .m-grid td.wk { width: 7mm; text-align: center; color: #9aa6b6; font-size: 7pt; font-weight: 700; }
.m-grid td.d { border: .6pt solid #d7dee8; vertical-align: top; padding: 1.6mm 1.8mm; height: 28mm; overflow: hidden; }
.m-grid td.d.out { background: #f6f8fb; color: #a8b3c2; }
.m-grid td.d.we { background: #fbfcfe; }
.m-grid td.d.today { box-shadow: inset 0 0 0 1.4pt var(--accent); }
.dn { display: flex; justify-content: space-between; align-items: baseline; font: 700 11pt Sora, system-ui, sans-serif; }
.hol { font: 600 6.5pt Manrope, system-ui, sans-serif; color: #c2410c; text-align: right; max-width: 70%; line-height: 1.15; }
.ev { display: flex; gap: 1.2mm; align-items: baseline; font-size: 7.4pt; line-height: 1.25; margin-top: .9mm; overflow: hidden; }
.ev i { flex: none; width: 1.8mm; height: 1.8mm; border-radius: 50%; background: var(--c); transform: translateY(.2mm); }
.ev b { font-weight: 800; color: #26354a; flex: none; }
.ev span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev.multi { background: color-mix(in srgb, var(--c) 16%, #fff); border-radius: 1mm; padding: .2mm 1mm; }
.ev.task span { color: #a3155a; }
.more { font-size: 6.8pt; color: #6b7a8f; margin-top: .6mm; font-weight: 700; }
.w-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2mm; }
.w-day { border: .6pt solid #d7dee8; border-radius: 2mm; min-height: 150mm; padding: 2.5mm; }
.w-day.today { border-color: var(--accent); box-shadow: 0 0 0 .8pt var(--accent); }
.w-day h3 { font-size: 10pt; display: flex; justify-content: space-between; } .w-day h3 small { color: #8090a6; font: 600 8pt Manrope, sans-serif; }
.w-day .hol { text-align: left; max-width: none; margin-top: .5mm; }
.w-ev { border-left: 2pt solid var(--c); background: color-mix(in srgb, var(--c) 9%, #fff); border-radius: 0 1.4mm 1.4mm 0; padding: 1.4mm 2mm; margin-top: 2mm; font-size: 8pt; break-inside: avoid; }
.w-ev .t { font: 800 7.6pt Manrope, sans-serif; color: #3b4a60; }
.w-ev .ti { font-weight: 700; color: #142033; }
.w-ev .wh { color: #6b7a8f; font-size: 7.2pt; }
.l-day { display: grid; grid-template-columns: 30mm 1fr; gap: 4mm; padding: 2.6mm 0; border-bottom: .6pt solid #e3e8ef; break-inside: avoid; }
.l-date b { display: block; font: 700 13pt Sora, sans-serif; } .l-date span { color: #6b7a8f; font-size: 8.5pt; }
.l-ev { display: grid; grid-template-columns: 22mm 1fr; gap: 3mm; padding: 1mm 0; }
.l-ev .t { font-weight: 800; color: #3b4a60; } .l-ev .ti { font-weight: 700; } .l-ev .ti i { display: inline-block; width: 2.2mm; height: 2.2mm; border-radius: 50%; background: var(--c); margin-right: 1.6mm; }
.l-ev .wh, .l-ev .no { color: #6b7a8f; font-size: 8.5pt; white-space: pre-wrap; }
.l-empty { color: #8090a6; padding: 10mm 0; text-align: center; }
`;
export const CAL_CSS = CSS;

function head(title, sub) {
  return `<div class="p-head"><div><h1>${esc(title)}</h1><div class="p-sub">${esc(sub)}</div></div><div class="p-brand"><b>HUBTECH</b>Kalender</div></div>`;
}
const evLine = (it) => `<div class="ev${it.multi ? ' multi' : ''}${it.kind === 'task' ? ' task' : ''}" style="--c:${esc(it.color)}"><i></i>${it.time ? `<b>${esc(it.time)}</b>` : ''}<span>${it.kind === 'task' ? '⚑ ' : ''}${esc(it.title)}</span></div>`;

export function monthHtml(year, month, data, { maxPerDay = 5 } = {}) {
  const first = new Date(year, month, 1), start = monday(first);
  const todayK = iso(new Date());
  let rows = '';
  for (let w = 0; w < 6; w++) {
    const wkStart = addDays(start, w * 7);
    if (w > 3 && wkStart.getMonth() !== month) break;
    rows += `<tr><td class="wk">${isoWeek(wkStart)}</td>`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(wkStart, i);
      const { items, holiday } = dayItems(d, data);
      const cls = ['d', d.getMonth() !== month && 'out', i >= 5 && 'we', iso(d) === todayK && 'today'].filter(Boolean).join(' ');
      const shown = items.slice(0, maxPerDay).map(evLine).join('');
      const more = items.length > maxPerDay ? `<div class="more">+ ${items.length - maxPerDay} mere</div>` : '';
      rows += `<td class="${cls}"><div class="dn"><span>${d.getDate()}</span>${holiday ? `<span class="hol">${esc(holiday)}</span>` : ''}</div>${shown}${more}</td>`;
    }
    rows += '</tr>';
  }
  const n = data.events.filter(e => e.date.slice(0, 7) === `${year}-${pad(month + 1)}`).length;
  return `<section class="p-page">${head(`${cap(MONTHS[month])} ${year}`, `${n} aftale${n === 1 ? '' : 'r'} · uge ${isoWeek(first)}–${isoWeek(new Date(year, month + 1, 0))}`)}
<table class="m-grid"><thead><tr><th class="wk">Uge</th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function weekHtml(anyDay, data) {
  const start = monday(anyDay), end = addDays(start, 6), todayK = iso(new Date());
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const { items, holiday } = dayItems(d, data);
    return `<div class="w-day${iso(d) === todayK ? ' today' : ''}"><h3>${DAYS[i]} <small>${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}</small></h3>${holiday ? `<div class="hol">${esc(holiday)}</div>` : ''}
${items.map(it => `<div class="w-ev" style="--c:${esc(it.color)}">${it.time ? `<div class="t">${esc(it.time)}${it.end ? '–' + esc(it.end) : ''}</div>` : `<div class="t">${it.kind === 'task' ? 'Deadline' : 'Hele dagen'}</div>`}<div class="ti">${esc(it.title)}</div>${it.where ? `<div class="wh">${esc(it.where)}</div>` : ''}</div>`).join('')}</div>`;
  }).join('');
  return `<section class="p-page">${head(`Uge ${isoWeek(start)}`, `${start.getDate()}. ${MONTHS[start.getMonth()]} – ${end.getDate()}. ${MONTHS[end.getMonth()]} ${end.getFullYear()}`)}<div class="w-grid">${cols}</div></section>`;
}

export function listHtml(from, days, data, { withNotes = true } = {}) {
  let out = '', count = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const { items, holiday } = dayItems(d, data);
    if (!items.length && !holiday) continue;
    count += items.length;
    out += `<div class="l-day"><div class="l-date"><b>${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}</b><span>${DAYS[(d.getDay() + 6) % 7]}${holiday ? ` · ${esc(holiday)}` : ''}</span></div><div>${items.map(it => `<div class="l-ev" style="--c:${esc(it.color)}"><div class="t">${it.time ? esc(it.time) + (it.end ? '–' + esc(it.end) : '') : it.kind === 'task' ? 'Deadline' : 'Hele dagen'}</div><div><div class="ti"><i></i>${esc(it.title)}</div>${it.where ? `<div class="wh">${esc(it.where)}</div>` : ''}${withNotes && it.notes ? `<div class="no">${esc(it.notes)}</div>` : ''}</div></div>`).join('') || '<div class="muted">Helligdag</div>'}</div></div>`;
  }
  const to = addDays(from, days - 1);
  return `<section>${head('Aftaler', `${from.getDate()}. ${MONTHS[from.getMonth()]} – ${to.getDate()}. ${MONTHS[to.getMonth()]} ${to.getFullYear()} · ${count} i alt`)}${out || '<div class="l-empty">Ingen aftaler i perioden.</div>'}</section>`;
}

// ── PDF (vector, one click) ──
const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); const n = m ? parseInt(m[1], 16) : 0x2563eb; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

export async function calendarPdf(kind, opts, data) {
  const lib = await loadScript('vendor/jspdf.umd.min.js', 'jspdf');
  const landscape = kind !== 'list';
  const doc = new lib.jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  const W = landscape ? 297 : 210, H = landscape ? 210 : 297, M = 12;
  const accent = hex(opts.accent);
  const header = (title, sub) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(20, 32, 51); doc.text(title, M, M + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(91, 107, 128); doc.text(sub, M, M + 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...accent); doc.text('HUBTECH', W - M, M + 8, { align: 'right' });
    doc.setFontSize(7.5); doc.setTextColor(128, 144, 166); doc.text('KALENDER', W - M, M + 12.5, { align: 'right' });
    doc.setDrawColor(...accent); doc.setLineWidth(.9); doc.line(M, M + 17, W - M, M + 17);
  };
  const footer = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(151, 163, 179); doc.text(`Udskrevet ${new Date().toLocaleString('da-DK', { dateStyle: 'long', timeStyle: 'short' })} · HUBTECH`, W - M, H - 6, { align: 'right' }); };
  const clip = (t, w, size) => { doc.setFontSize(size); let s = String(t); while (s.length > 1 && doc.getTextWidth(s) > w) s = s.slice(0, -2) + '…'; return s; };

  if (kind === 'month') {
    const { year, month } = opts;
    const first = new Date(year, month, 1), start = monday(first);
    header(`${cap(MONTHS[month])} ${year}`, `Uge ${isoWeek(first)}–${isoWeek(new Date(year, month + 1, 0))}`);
    const top = M + 24, wk = 7, cw = (W - 2 * M - wk) / 7;
    const weeks = []; for (let w = 0; w < 6; w++) { const s = addDays(start, w * 7); if (w > 3 && s.getMonth() !== month) break; weeks.push(s); }
    const ch = (H - top - M - 4) / weeks.length;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(91, 107, 128);
    DAYS.forEach((d, i) => doc.text(d.toUpperCase(), M + wk + i * cw + 1.5, top - 2));
    weeks.forEach((ws, r) => {
      const y = top + r * ch;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(154, 166, 182); doc.text(String(isoWeek(ws)), M + wk / 2, y + 5, { align: 'center' });
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i), x = M + wk + i * cw;
        const out = d.getMonth() !== month;
        if (out) { doc.setFillColor(246, 248, 251); doc.rect(x, y, cw, ch, 'F'); }
        doc.setDrawColor(215, 222, 232); doc.setLineWidth(.2); doc.rect(x, y, cw, ch);
        if (iso(d) === iso(new Date())) { doc.setDrawColor(...accent); doc.setLineWidth(.7); doc.rect(x + .35, y + .35, cw - .7, ch - .7); }
        const { items, holiday } = dayItems(d, data);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...(out ? [168, 179, 194] : [20, 32, 51])); doc.text(String(d.getDate()), x + 1.8, y + 5);
        if (holiday) { doc.setFont('helvetica', 'normal'); doc.setTextColor(194, 65, 12); doc.text(clip(holiday, cw - 9, 6.2), x + cw - 1.5, y + 4.6, { align: 'right' }); }
        let ly = y + 9.2; const room = Math.max(1, Math.floor((ch - 10) / 3.6));
        items.slice(0, items.length > room ? room - 1 : room).forEach(it => {
          doc.setFillColor(...hex(it.color)); doc.circle(x + 2.6, ly - 1, .8, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(38, 53, 74);
          let tx = x + 4.2;
          if (it.time) { doc.text(it.time, tx, ly); tx += doc.getTextWidth(it.time) + 1.2; }
          doc.setFont('helvetica', 'normal'); doc.setTextColor(...(it.kind === 'task' ? [163, 21, 90] : [20, 32, 51]));
          doc.text(clip(it.title, x + cw - 1.5 - tx, 6.8), tx, ly);
          ly += 3.6;
        });
        if (items.length > room) { doc.setFont('helvetica', 'bold'); doc.setFontSize(6.4); doc.setTextColor(107, 122, 143); doc.text(`+ ${items.length - room + 1} mere`, x + 4.2, ly); }
      }
    });
    footer();
  } else if (kind === 'week') {
    const start = monday(opts.day), end = addDays(start, 6);
    header(`Uge ${isoWeek(start)}`, `${start.getDate()}. ${MONTHS[start.getMonth()]} – ${end.getDate()}. ${MONTHS[end.getMonth()]} ${end.getFullYear()}`);
    const top = M + 22, gap = 2, cw = (W - 2 * M - 6 * gap) / 7, chh = H - top - M - 4;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i), x = M + i * (cw + gap);
      doc.setDrawColor(...(iso(d) === iso(new Date()) ? accent : [215, 222, 232])); doc.setLineWidth(iso(d) === iso(new Date()) ? .6 : .25); doc.roundedRect(x, top, cw, chh, 1.5, 1.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 32, 51); doc.text(DAYS[i], x + 2.2, top + 6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(128, 144, 166); doc.text(`${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}`, x + cw - 2, top + 6, { align: 'right' });
      const { items, holiday } = dayItems(d, data);
      let y = top + 10;
      if (holiday) { doc.setTextColor(194, 65, 12); doc.setFontSize(6.8); doc.text(clip(holiday, cw - 4, 6.8), x + 2.2, y); y += 4; }
      for (const it of items) {
        const lines = doc.setFontSize(7.4).splitTextToSize(it.title, cw - 7).slice(0, 3);
        const hh = 4.8 + lines.length * 3.2 + (it.where ? 3.2 : 0);
        if (y + hh > top + chh - 2) break;
        const c = hex(it.color);
        doc.setFillColor(...c.map(v => Math.round(255 - (255 - v) * .12))); doc.rect(x + 2, y, cw - 4, hh, 'F');
        doc.setFillColor(...c); doc.rect(x + 2, y, .9, hh, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6); doc.setTextColor(59, 74, 96);
        doc.text(it.time ? `${it.time}${it.end ? '–' + it.end : ''}` : it.kind === 'task' ? 'Deadline' : 'Hele dagen', x + 4, y + 3.4);
        doc.setFontSize(7.4); doc.setTextColor(20, 32, 51); doc.text(lines, x + 4, y + 6.8);
        if (it.where) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(107, 122, 143); doc.text(clip(it.where, cw - 7, 6.6), x + 4, y + 6.8 + lines.length * 3.2); }
        y += hh + 2;
      }
    }
    footer();
  } else {
    const { from, days, withNotes = true } = opts;
    const to = addDays(from, days - 1);
    header('Aftaler', `${from.getDate()}. ${MONTHS[from.getMonth()]} – ${to.getDate()}. ${MONTHS[to.getMonth()]} ${to.getFullYear()}`);
    let y = M + 26, any = false;
    const newPage = () => { footer(); doc.addPage(); y = M + 8; };
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i);
      const { items, holiday } = dayItems(d, data);
      if (!items.length && !holiday) continue;
      any = true;
      const need = 8 + items.length * 6;
      if (y + Math.min(need, 30) > H - M - 6) newPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 32, 51); doc.text(`${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}`, M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(107, 122, 143); doc.text(DAYS[(d.getDay() + 6) % 7] + (holiday ? ` · ${holiday}` : ''), M, y + 4.4);
      let iy = y;
      for (const it of items) {
        if (iy > H - M - 10) { newPage(); iy = y; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(59, 74, 96);
        doc.text(it.time ? `${it.time}${it.end ? '–' + it.end : ''}` : it.kind === 'task' ? 'Deadline' : 'Hele dagen', M + 36, iy);
        doc.setFillColor(...hex(it.color)); doc.circle(M + 64, iy - 1.2, 1.1, 'F');
        doc.setTextColor(20, 32, 51); const tl = doc.splitTextToSize(it.title, W - M - 68); doc.text(tl, M + 67, iy); iy += tl.length * 4.2;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3); doc.setTextColor(107, 122, 143);
        if (it.where) { doc.text(doc.splitTextToSize(it.where, W - M - 68), M + 67, iy); iy += 3.8; }
        if (withNotes && it.notes) { const nl = doc.splitTextToSize(it.notes, W - M - 68).slice(0, 6); doc.text(nl, M + 67, iy); iy += nl.length * 3.6; }
        iy += 2;
      }
      y = Math.max(y + 10, iy + 1);
      doc.setDrawColor(227, 232, 239); doc.setLineWidth(.2); doc.line(M, y - 3, W - M, y - 3);
      y += 3;
    }
    if (!any) { doc.setFontSize(10); doc.setTextColor(128, 144, 166); doc.text('Ingen aftaler i perioden.', W / 2, M + 40, { align: 'center' }); }
    footer();
  }
  return doc.output('blob');
}
