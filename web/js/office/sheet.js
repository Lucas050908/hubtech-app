/** HUBTECH Office – Regneark: a spreadsheet with formulas, formatting, multiple sheets and CSV/Excel export. */
import { h, clear, rect, uiZoom } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, modal, confirmDialog } from '../core/ui.js';
import { evaluateSheet, isErr, colName, ref, parseRef, parseInput, fmtNumber, ALIAS, fmtDate } from './formula.js';
import { autoDateKind, condStyles, condDialog, renderChart, chartDialog, rangeText } from './sheetx.js';
import { download, safeName, readFile, loadXlsx } from './store.js';
import { errorToast } from '../core/ui.js';
import { editorFrame, toolBtn, toolSep, printNode, popMenu } from './frame.js';
import { escapeHtml } from './sanitize.js';

const FORMATS = [['auto', 'Automatisk'], ['num2', 'Tal 0,00'], ['int', 'Heltal'], ['kr', 'Valuta (kr.)'], ['pct', 'Procent'], ['date', 'Dato'], ['datetime', 'Dato og tid']];
const DEF_W = 104;

export const blankSheet = (name = 'Ark1') => ({ name, cells: {}, rows: 100, cols: 26, colW: {} });

function display(v, s = {}, raw) {
  if (isErr(v)) return v.err;
  if (typeof v === 'boolean') return v ? 'SAND' : 'FALSK';
  if (typeof v === 'number') {
    const dk = s?.fmt === 'date' || s?.fmt === 'datetime' ? s.fmt : (!s?.fmt || s.fmt === 'auto') ? autoDateKind(raw) : null;
    if (dk) return fmtDate(v, dk === 'datetime');
    switch (s?.fmt) {
      case 'num2': return v.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'int': return Math.round(v).toLocaleString('da-DK');
      case 'kr': return v.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });
      case 'pct': return `${(v * 100).toLocaleString('da-DK', { maximumFractionDigits: 2 })} %`;
      default: return Math.abs(v) >= 1e15 ? fmtNumber(v) : Number(v.toPrecision(12)).toLocaleString('da-DK', { maximumFractionDigits: 10 });
    }
  }
  return String(v ?? '');
}

/** Parse CSV/TSV text into rows of strings (handles quotes). */
export function parseDelimited(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const d = first.includes('\t') ? '\t' : (first.split(';').length >= first.split(',').length ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"' && cur === '') { q = true; continue; }
    if (c === d) { row.push(cur); cur = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; continue; }
    cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function sheetFromRows(rows, name = 'Ark1') {
  const s = blankSheet(name);
  rows.forEach((r, ri) => r.forEach((v, ci) => { if (v !== '') s.cells[ref(ci, ri)] = { v }; }));
  s.rows = Math.max(100, rows.length + 20);
  s.cols = Math.max(26, Math.max(0, ...rows.map(r => r.length)) + 2);
  return s;
}

export function sheetEditor(doc, ctx) {
  const data = doc.data && Array.isArray(doc.data.sheets) && doc.data.sheets.length ? doc.data : { sheets: [blankSheet()], active: 0 };
  let si = Math.min(data.active || 0, data.sheets.length - 1);
  const S = () => data.sheets[si];
  let values = new Map();
  let anchor = { c: 0, r: 0 }, focus = { c: 0, r: 0 };
  let editing = null;                                   // { c, r, input, original }
  const undo = [], redo = [];

  const preview = () => {
    const parts = [];
    for (const s of data.sheets) for (const [, c] of Object.entries(s.cells)) { if (parts.length > 12) break; if (c.v && c.v[0] !== '=') parts.push(c.v); }
    return parts.join(' · ').slice(0, 220);
  };
  const frame = editorFrame(doc, ctx, {
    getData: () => ({ data: { ...data, active: si }, preview: preview() }),
    onPrint: () => printSheet(),
    exportMenu: [
      ['CSV (Excel, aktivt ark)', 'file', () => exportCsv()],
      ['Excel (.xlsx) – med formler', 'grid', () => exportXlsx()],
      ['Excel 2003 (.xls)', 'grid', () => exportXls()],
      ['PDF / udskriv', 'download', () => printSheet()],
    ],
  });
  const saver = frame.saver;

  // ── DOM ──
  const nameBox = h('input', { class: 'sh-name', 'aria-label': 'Celle', value: 'A1', spellcheck: 'false' });
  const fx = h('input', { class: 'sh-fx', placeholder: 'Skriv en værdi eller en formel, fx =SUM(A1:A5)', 'aria-label': 'Formellinje', spellcheck: 'false' });
  const scroll = h('div', { class: 'sh-scroll', tabindex: '0', role: 'grid', 'aria-label': 'Regneark – brug piletasterne, Enter eller F2 for at redigere' });
  const table = h('table', { class: 'sh-grid', role: 'presentation' });
  const colgroup = h('colgroup');
  const thead = h('thead', { role: 'rowgroup' }), tbody = h('tbody', { role: 'rowgroup' });
  table.append(colgroup, thead, tbody);
  scroll.appendChild(table);
  const tabs = h('div', { class: 'sh-tabs' });
  const statusSel = h('span', { class: 'sh-stat' });
  let tds = [];   // tds[r][c]

  function build() {
    const s = S();
    clear(colgroup).appendChild(h('col', { style: { width: '46px' } }));
    for (let c = 0; c < s.cols; c++) colgroup.appendChild(h('col', { style: { width: `${s.colW[colName(c)] || DEF_W}px` } }));
    const hr = h('tr', { role: 'row' }, h('th', { class: 'sh-corner', role: 'columnheader', 'aria-label': 'Markér alt', onclick: () => { anchor = { c: 0, r: 0 }; focus = { c: s.cols - 1, r: s.rows - 1 }; paintSel(); } }));
    for (let c = 0; c < s.cols; c++) {
      const handle = h('span', { class: 'sh-resize', 'aria-hidden': 'true' });
      handle.addEventListener('mousedown', (e) => startResize(e, c));
      hr.appendChild(h('th', { class: 'sh-col', role: 'columnheader', dataset: { c }, onmousedown: (e) => { if (e.target === handle) return; anchor = { c, r: 0 }; focus = { c, r: s.rows - 1 }; paintSel(); } }, colName(c), handle));
    }
    clear(thead).appendChild(hr);
    clear(tbody);
    tds = [];
    for (let r = 0; r < s.rows; r++) {
      const tr = h('tr', { role: 'row' }, h('th', { class: 'sh-row', role: 'rowheader', dataset: { r }, onmousedown: () => { anchor = { c: 0, r }; focus = { c: s.cols - 1, r }; paintSel(); } }, String(r + 1)));
      const row = [];
      for (let c = 0; c < s.cols; c++) { const td = h('td', { role: 'gridcell', dataset: { c, r } }); row.push(td); tr.appendChild(td); }
      tds.push(row);
      tbody.appendChild(tr);
    }
    recalc();
    paintSel();
    drawTabs();
    drawCharts();
  }

  function recalc() {
    const s = S();
    values = evaluateSheet(s.cells);
    const cond = condStyles(s, values);
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
      const id = ref(c, r), cell = s.cells[id], td = tds[r][c];
      const v = values.get(id) ?? '';
      const st = cell?.s || {}, cf = cond.get(id);
      td.textContent = display(v, st, cell?.v);
      td.className = [typeof v === 'number' ? 'is-num' : '', isErr(v) ? 'is-err' : '', st.b ? 'is-b' : '', st.i ? 'is-i' : '', st.al ? `al-${st.al}` : '', frozenClass(c, r)].filter(Boolean).join(' ');
      td.style.backgroundColor = cf?.bg || st.bg || '';
      td.style.backgroundImage = cf?.bar ? `linear-gradient(90deg, rgba(76, 141, 255, .42) ${Math.round(cf.bar * 100)}%, transparent ${Math.round(cf.bar * 100)}%)` : '';
      td.style.color = cf?.fg || st.fg || '';
      td.title = cell?.v && cell.v[0] === '=' ? cell.v : '';
    }
    paintSel(true);
    applyFreeze();
    drawChartsSoon();
  }

  // ── selection ──
  const rng = () => ({ c1: Math.min(anchor.c, focus.c), c2: Math.max(anchor.c, focus.c), r1: Math.min(anchor.r, focus.r), r2: Math.max(anchor.r, focus.r) });
  let painted = [];
  function paintSel(keepScroll) {
    painted.forEach(td => td.classList.remove('is-sel', 'is-active'));
    painted = [];
    const { c1, c2, r1, r2 } = rng();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const td = tds[r]?.[c]; if (td) { td.classList.add('is-sel'); painted.push(td); } }
    const act = tds[anchor.r]?.[anchor.c];
    document.getElementById('sh-active-cell')?.removeAttribute('id');
    if (act) {
      act.classList.add('is-active'); painted.push(act);
      act.id = 'sh-active-cell';
      scroll.setAttribute('aria-activedescendant', 'sh-active-cell');
      act.setAttribute('aria-label', `${ref(anchor.c, anchor.r)}: ${act.textContent || 'tom'}`);
      if (!keepScroll) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    thead.querySelectorAll('.sh-col').forEach(th => th.classList.toggle('is-hl', +th.dataset.c >= c1 && +th.dataset.c <= c2));
    tbody.querySelectorAll('.sh-row').forEach(th => th.classList.toggle('is-hl', +th.dataset.r >= r1 && +th.dataset.r <= r2));
    nameBox.value = c1 === c2 && r1 === r2 ? ref(anchor.c, anchor.r) : `${ref(c1, r1)}:${ref(c2, r2)}`;
    if (!editing) fx.value = S().cells[ref(anchor.c, anchor.r)]?.v || '';
    const st = S().cells[ref(anchor.c, anchor.r)]?.s || {};
    bBtn.setAttribute('aria-pressed', String(!!st.b)); iBtn.setAttribute('aria-pressed', String(!!st.i));
    fmtSel.value = st.fmt || 'auto';
    // status: sum / average / count
    const ns = []; let cnt = 0;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const v = values.get(ref(c, r)); if (v !== '' && v != null) cnt++; if (typeof v === 'number') ns.push(v); }
    statusSel.textContent = (c1 !== c2 || r1 !== r2) && ns.length
      ? `Sum: ${display(ns.reduce((a, b) => a + b, 0))}   ·   Gennemsnit: ${(ns.reduce((a, b) => a + b, 0) / ns.length).toLocaleString('da-DK', { maximumFractionDigits: 2 })}   ·   Antal: ${cnt}`
      : cnt ? `Antal: ${cnt}` : '';
  }
  function select(c, r, extend) {
    const s = S();
    c = Math.max(0, Math.min(s.cols - 1, c)); r = Math.max(0, Math.min(s.rows - 1, r));
    if (extend) focus = { c, r }; else { anchor = { c, r }; focus = { c, r }; }
    paintSel();
  }

  // ── edits with undo ──
  function apply(changes, record = true) {          // changes: [{ id, before, after }] (cell objects or undefined)
    const s = S();
    for (const ch of changes) { if (ch.after && (ch.after.v || ch.after.s)) s.cells[ch.id] = ch.after; else delete s.cells[ch.id]; }
    if (record) { undo.push({ si, changes }); if (undo.length > 200) undo.shift(); redo.length = 0; }
    saver.touch(); recalc();
  }
  const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : undefined);
  function setValues(list) {                         // [{ c, r, v }]
    const s = S();
    apply(list.map(({ c, r, v }) => { const id = ref(c, r), before = clone(s.cells[id]); return { id, before, after: { ...(before || {}), v: String(v) } }; }));
  }
  function styleSel(patch) {
    const s = S(), { c1, c2, r1, r2 } = rng(), ch = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const id = ref(c, r), before = clone(s.cells[id]), st = { ...(before?.s || {}) };
      for (const [k, v] of Object.entries(typeof patch === 'function' ? patch(st) : patch)) { if (v === null || v === false || v === '' || v === 'auto') delete st[k]; else st[k] = v; }
      ch.push({ id, before, after: { ...(before || {}), s: Object.keys(st).length ? st : undefined } });
    }
    apply(ch);
  }
  function clearSel() {
    const s = S(), { c1, c2, r1, r2 } = rng(), ch = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const id = ref(c, r); if (s.cells[id]?.v) { const before = clone(s.cells[id]); ch.push({ id, before, after: { ...before, v: '' } }); } }
    if (ch.length) apply(ch);
  }
  function doUndo(stack, other) {
    const x = stack.pop(); if (!x) return;
    if (x.si !== si) { si = x.si; build(); }
    const s = S();
    for (const ch of x.changes) { const v = stack === undo ? ch.before : ch.after; if (v && (v.v || v.s)) s.cells[ch.id] = clone(v); else delete s.cells[ch.id]; }
    other.push(x); saver.touch(); recalc();
  }

  // ── in-cell editor ──
  function startEdit(initial, keepRaw, focusInput = true) {
    if (editing) return;
    const s = S(), id = ref(anchor.c, anchor.r), td = tds[anchor.r][anchor.c];
    const original = s.cells[id]?.v || '';
    const input = h('input', { class: 'sh-edit', spellcheck: 'false', 'aria-label': `Redigér ${id}` });
    input.value = keepRaw ? original : (initial ?? '');
    Object.assign(input.style, { left: `${td.offsetLeft}px`, top: `${td.offsetTop}px`, minWidth: `${td.offsetWidth}px`, height: `${td.offsetHeight}px` });
    scroll.appendChild(input);
    editing = { c: anchor.c, r: anchor.r, input, original };
    fx.value = input.value;
    if (focusInput) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    input.addEventListener('input', () => { fx.value = input.value; });
    input.addEventListener('keydown', onEditKey);
    input.addEventListener('blur', () => setTimeout(() => { if (editing?.input === input && document.activeElement !== fx) commit(); }, 0));
  }
  function commit(dc = 0, dr = 0) {
    if (!editing) return;
    const { c, r, input, original } = editing;
    const v = input.value;
    editing = null; input.remove();
    if (v !== original) setValues([{ c, r, v }]);
    select(c + dc, r + dr);
    scroll.focus({ preventScroll: true });
  }
  function cancel() { if (!editing) return; editing.input.remove(); editing = null; paintSel(); scroll.focus({ preventScroll: true }); }
  function onEditKey(e) {
    e.stopPropagation();   // the editor sits inside the grid – don't let the grid handle the same key again
    if (e.key === 'Enter') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }
  const formulaMode = () => editing && /^=/.test(editing.input.value) && /[=(+\-*/^&;,:<>]$/.test(editing.input.value.trim());

  // ── mouse ──
  let dragging = false;
  scroll.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td'); if (!td) return;
    const c = +td.dataset.c, r = +td.dataset.r;
    if (formulaMode()) { e.preventDefault(); editing.input.value += ref(c, r); fx.value = editing.input.value; editing.input.focus(); return; }
    if (editing) commit();
    select(c, r, e.shiftKey);
    dragging = true;
    scroll.focus({ preventScroll: true });
  });
  scroll.addEventListener('mouseover', (e) => { if (!dragging) return; const td = e.target.closest('td'); if (td) { focus = { c: +td.dataset.c, r: +td.dataset.r }; paintSel(true); } });
  const up = () => { dragging = false; };
  addEventListener('mouseup', up);
  scroll.addEventListener('dblclick', (e) => { if (e.target.closest('td')) startEdit(null, true); });
  // touch: tap selects a cell, a second tap on the selected cell edits it (double-tap is zoom on phones)
  let tapOnActive = false;
  scroll.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const td = e.target.closest('td');
    tapOnActive = !!td && !editing && +td.dataset.c === anchor.c && +td.dataset.r === anchor.r && anchor.c === focus.c && anchor.r === focus.r;
  });
  scroll.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !tapOnActive) return;
    tapOnActive = false; dragging = false;
    startEdit(null, true);
  });
  scroll.addEventListener('pointercancel', () => { tapOnActive = false; });

  // ── keyboard ──
  scroll.addEventListener('keydown', (e) => {
    if (editing) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    const mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (mv) { e.preventDefault(); const base = e.shiftKey ? focus : anchor; select(base.c + mv[0], base.r + mv[1], e.shiftKey); return; }
    if (k === 'Enter') { e.preventDefault(); select(anchor.c, anchor.r + (e.shiftKey ? -1 : 1)); return; }
    if (k === 'Tab') { e.preventDefault(); select(anchor.c + (e.shiftKey ? -1 : 1), anchor.r); return; }
    if (k === 'F2') { e.preventDefault(); startEdit(null, true); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearSel(); return; }
    if (k === 'Home') { e.preventDefault(); select(0, mod ? 0 : anchor.r); return; }
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); doUndo(undo, redo); return; }
    if (mod && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); doUndo(redo, undo); return; }
    if (mod && k.toLowerCase() === 'b') { e.preventDefault(); toggle('b'); return; }
    if (mod && k.toLowerCase() === 'i') { e.preventDefault(); toggle('i'); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); anchor = { c: 0, r: 0 }; focus = { c: S().cols - 1, r: S().rows - 1 }; paintSel(true); return; }
    if (!mod && !e.altKey && k.length === 1) { e.preventDefault(); startEdit(k); }
  });
  // clipboard (TSV, like Excel)
  scroll.addEventListener('copy', (e) => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', selectionTsv()); });
  scroll.addEventListener('cut', (e) => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', selectionTsv()); clearSel(); });
  scroll.addEventListener('paste', (e) => {
    if (editing) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain'); if (!text) return;
    const rows = parseDelimited(text.replace(/\r?\n$/, ''));
    const s = S(), list = [];
    rows.forEach((row, dr) => row.forEach((v, dc) => { const c = anchor.c + dc, r = anchor.r + dr; if (c < s.cols && r < s.rows) list.push({ c, r, v }); }));
    if (rows.length + anchor.r > s.rows) toast('Nogle rækker blev ikke indsat', { type: 'warn', text: 'Tilføj flere rækker først.' });
    if (list.length) { setValues(list); focus = { c: anchor.c + Math.max(...rows.map(r => r.length)) - 1, r: anchor.r + rows.length - 1 }; paintSel(true); }
  });
  function selectionTsv() {
    const { c1, c2, r1, r2 } = rng(), out = [];
    for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(display(values.get(ref(c, r)) ?? '', S().cells[ref(c, r)]?.s, S().cells[ref(c, r)]?.v)); out.push(row.join('\t')); }
    return out.join('\n');
  }

  // ── formula bar / name box ──
  fx.addEventListener('focus', () => { if (!editing) startEdit(null, true, false); });
  fx.addEventListener('input', () => { if (editing) editing.input.value = fx.value; });
  fx.addEventListener('keydown', (e) => { if (!editing) return; if (e.key === 'Enter') { e.preventDefault(); commit(0, 1); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
  fx.addEventListener('blur', () => setTimeout(() => { if (editing && document.activeElement !== editing.input) commit(); }, 0));
  nameBox.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const [a, b] = nameBox.value.trim().toUpperCase().split(':').map(parseRef);
    if (!a) { toast('Ugyldig celle', { type: 'warn', text: 'Skriv fx B4 eller A1:C10' }); return; }
    anchor = a; focus = b || a; paintSel(); scroll.focus();
  });

  // ── column resize ──
  function startResize(e, c) {
    e.preventDefault(); e.stopPropagation();
    const col = colgroup.children[c + 1], x0 = e.clientX, w0 = rect(col).width, z = uiZoom();
    const move = (ev) => { col.style.width = `${Math.max(40, Math.round(w0 + (ev.clientX - x0) / z))}px`; };
    const stop = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', stop); S().colW[colName(c)] = parseInt(col.style.width, 10); saver.touch(); applyFreeze(); };
    addEventListener('mousemove', move); addEventListener('mouseup', stop);
  }

  // ── toolbar ──
  const toggle = (k) => { const st = S().cells[ref(anchor.c, anchor.r)]?.s || {}; styleSel({ [k]: !st[k] }); };
  const bBtn = toolBtn('bold', 'Fed (Ctrl+B)', () => toggle('b'));
  const iBtn = toolBtn('italic', 'Kursiv (Ctrl+I)', () => toggle('i'));
  const fmtSel = h('select', { class: 'select ofx-select', 'aria-label': 'Talformat', title: 'Talformat' }, FORMATS.map(([v, l]) => h('option', { value: v }, l)));
  fmtSel.addEventListener('change', () => { styleSel({ fmt: fmtSel.value }); scroll.focus(); });
  const bg = h('input', { type: 'color', value: '#fff3a3', class: 'ofx-color is-mark', title: 'Fyldfarve', 'aria-label': 'Fyldfarve' });
  bg.addEventListener('input', () => styleSel({ bg: bg.value }));
  const fg = h('input', { type: 'color', value: '#e5484d', class: 'ofx-color', title: 'Tekstfarve', 'aria-label': 'Tekstfarve' });
  fg.addEventListener('input', () => styleSel({ fg: fg.value }));
  const noFill = toolBtn('eraser', 'Fjern farver og formatering', () => styleSel({ bg: null, fg: null, b: null, i: null, al: null, fmt: null }));
  function autoSum() {
    const s = S(); let r = anchor.r - 1;
    while (r >= 0 && typeof values.get(ref(anchor.c, r)) === 'number') r--;
    const top = r + 1;
    if (top >= anchor.r) { startEdit('=SUM('); return; }
    setValues([{ c: anchor.c, r: anchor.r, v: `=SUM(${ref(anchor.c, top)}:${ref(anchor.c, anchor.r - 1)})` }]);
    void s;
  }
  function sortBy(desc) {
    const s = S(); const col = anchor.c;
    let last = -1;
    for (const id of Object.keys(s.cells)) { const p = parseRef(id); if (p && s.cells[id].v) last = Math.max(last, p.r); }
    if (last < 1) return;
    const hasHeader = typeof values.get(ref(col, 0)) === 'string' && typeof values.get(ref(col, 1)) === 'number';
    const start = hasHeader ? 1 : 0;
    for (let r = start; r <= last; r++) for (let c = 0; c < s.cols; c++) if ((s.cells[ref(c, r)]?.v || '')[0] === '=') { toast('Kan ikke sortere formler', { type: 'warn', text: 'Området indeholder formler. Kopiér værdierne til et nyt ark og sortér dér.' }); return; }
    const rows = [];
    for (let r = start; r <= last; r++) { const row = []; for (let c = 0; c < s.cols; c++) row.push(clone(s.cells[ref(c, r)])); rows.push({ key: values.get(ref(col, r)), row }); }
    rows.sort((a, b) => { const x = a.key, y = b.key; if (x === '' || x == null) return 1; if (y === '' || y == null) return -1; const k = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'da'); return desc ? -k : k; });
    const ch = [];
    rows.forEach((o, i) => o.row.forEach((cell, c) => { const id = ref(c, start + i); ch.push({ id, before: clone(s.cells[id]), after: cell }); }));
    apply(ch);
    toast(`Sorteret efter kolonne ${colName(col)}`, { type: 'ok', ms: 1500, text: hasHeader ? 'Første række blev holdt som overskrift.' : '' });
  }
  // ── freeze panes ──
  const frz = () => S().freeze || { r: 0, c: 0 };
  function frozenClass(c, r) { const f = frz(); return [r < f.r ? 'fz-r' : '', c < f.c ? 'fz-c' : '', r === f.r - 1 ? 'fz-r-end' : '', c === f.c - 1 ? 'fz-c-end' : ''].filter(Boolean).join(' '); }
  function applyFreeze() {
    const f = frz(), s = S();
    const head = (thead.firstChild && rect(thead.firstChild).height) || 26;
    let top = head;
    for (let r = 0; r < s.rows; r++) {
      const rowTop = r < f.r ? top : null;
      if (r < f.r) top += (tds[r][0] && rect(tds[r][0]).height) || 26;
      const th = tbody.children[r]?.firstChild;
      if (th) { th.style.top = rowTop !== null ? `${rowTop}px` : ''; th.style.zIndex = rowTop !== null ? '4' : ''; th.style.position = 'sticky'; }
      let left = 46;
      for (let c = 0; c < s.cols; c++) {
        const td = tds[r][c];
        const fr = r < f.r, fc = c < f.c;
        td.style.position = fr || fc ? 'sticky' : '';
        td.style.top = fr ? `${rowTop}px` : '';
        td.style.left = fc ? `${left}px` : '';
        td.style.zIndex = fr && fc ? '3' : fr || fc ? '2' : '';
        if (c < f.c) left += parseInt(colgroup.children[c + 1]?.style.width, 10) || DEF_W;
      }
    }
    let left = 46;
    thead.querySelectorAll('.sh-col').forEach((th, c) => {
      th.style.left = c < f.c ? `${left}px` : '';
      th.style.zIndex = c < f.c ? '5' : '';
      if (c < f.c) left += parseInt(colgroup.children[c + 1]?.style.width, 10) || DEF_W;
    });
  }
  function setFreeze(r, c) { S().freeze = r || c ? { r, c } : undefined; saver.touch(); recalc(); scroll.focus({ preventScroll: true }); }
  const freezeBtn = toolBtn('snow', 'Frys rækker/kolonner', () => popMenu(freezeBtn, [
    ['Frys øverste række', 'snow', () => setFreeze(1, frz().c)],
    ['Frys første kolonne', 'snow', () => setFreeze(frz().r, 1)],
    [`Frys til ${ref(anchor.c, anchor.r)} (rækker over, kolonner til venstre)`, 'grid', () => setFreeze(anchor.r, anchor.c)],
    'sep',
    ['Fjern frysning', 'x', () => setFreeze(0, 0)],
  ]));

  // ── conditional formatting ──
  const condBtn = toolBtn('condFormat', 'Betinget formatering', () => condDialog(S(), rng(), () => { saver.touch(); recalc(); }));

  // ── charts ──
  const charts = h('div', { class: 'sh-charts' });
  let chartTimer = 0;
  function drawChartsSoon() { clearTimeout(chartTimer); chartTimer = setTimeout(drawCharts, 120); }
  function drawCharts() {
    const s = S();
    clear(charts);
    charts.hidden = !(s.charts || []).length;
    (s.charts || []).forEach((ch, i) => {
      const card = h('figure', { class: 'ch-card glass' },
        h('figcaption', null, h('b', null, ch.title || 'Diagram'), h('span', { class: 'faint' }, ch.range),
          h('span', { class: 'ch-actions' },
            h('button', { type: 'button', class: 'icon-btn', title: 'Redigér diagram', 'aria-label': 'Redigér diagram', onclick: async () => { const n = await chartDialog(ch, ch.range); if (n) { s.charts[i] = n; saver.touch(); drawCharts(); } } }, icon('edit')),
            h('button', { type: 'button', class: 'icon-btn', title: 'Slet diagram', 'aria-label': 'Slet diagram', onclick: async () => { if (!await confirmDialog({ title: 'Slet diagram?', text: ch.title || ch.range, confirmLabel: 'Slet', danger: true })) return; s.charts.splice(i, 1); saver.touch(); drawCharts(); } }, icon('trash')))),
        renderChart(ch, s, values));
      charts.appendChild(card);
    });
  }
  const chartBtn = toolBtn('chart', 'Indsæt diagram', async () => {
    const r = rng();
    const def = r.c1 === r.c2 && r.r1 === r.r2 ? guessTable() : rangeText(r);
    const n = await chartDialog(null, def);
    if (!n) return;
    (S().charts ||= []).push(n); saver.touch(); drawCharts();
    setTimeout(() => charts.lastChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  });
  function guessTable() {   // the filled block around the active cell
    const s = S(), filled = (c, r) => !!s.cells[ref(c, r)]?.v;
    let c1 = anchor.c, c2 = anchor.c, r1 = anchor.r, r2 = anchor.r;
    while (c1 > 0 && filled(c1 - 1, anchor.r)) c1--;
    while (c2 < s.cols - 1 && filled(c2 + 1, anchor.r)) c2++;
    while (r1 > 0 && filled(anchor.c, r1 - 1)) r1--;
    while (r2 < s.rows - 1 && filled(anchor.c, r2 + 1)) r2++;
    return rangeText({ c1, c2, r1, r2 });
  }

  frame.toolbar.append(
    toolBtn('undo', 'Fortryd (Ctrl+Z)', () => doUndo(undo, redo)), toolBtn('redo', 'Gentag (Ctrl+Y)', () => doUndo(redo, undo)), toolSep(),
    bBtn, iBtn, fg, bg, noFill, toolSep(),
    toolBtn('alignLeft', 'Venstrestil', () => styleSel({ al: 'left' })), toolBtn('alignCenter', 'Centrér', () => styleSel({ al: 'center' })), toolBtn('alignRight', 'Højrestil', () => styleSel({ al: 'right' })), toolSep(),
    fmtSel, toolSep(),
    toolBtn('sigma', 'Autosum', autoSum), chartBtn, condBtn, freezeBtn, toolBtn('sortAsc', 'Sortér stigende efter aktiv kolonne', () => sortBy(false)), toolBtn('sortDesc', 'Sortér faldende', () => sortBy(true)), toolSep(),
    toolBtn('rowPlus', 'Tilføj 20 rækker', () => { S().rows += 20; saver.touch(); build(); }),
    toolBtn('colPlus', 'Tilføj kolonne', () => { if (S().cols >= 52) { toast('Højst 52 kolonner', { type: 'warn' }); return; } S().cols += 1; saver.touch(); build(); }));

  // ── sheets ──
  function drawTabs() {
    clear(tabs);
    data.sheets.forEach((s, i) => {
      const b = h('button', { type: 'button', class: ['sh-tab', i === si && 'is-on'], title: 'Dobbeltklik for at omdøbe' }, s.name);
      b.addEventListener('click', () => { if (i !== si) { if (editing) commit(); si = i; saver.touch(); build(); } });
      b.addEventListener('dblclick', () => renameSheet(i));
      tabs.appendChild(b);
      if (i === si && data.sheets.length > 1) tabs.appendChild(h('button', { type: 'button', class: 'sh-tab-x', 'aria-label': `Slet ${s.name}`, title: 'Slet ark', onclick: () => deleteSheet(i) }, icon('x')));
    });
    tabs.appendChild(h('button', { type: 'button', class: 'sh-tab-add', 'aria-label': 'Nyt ark', title: 'Nyt ark', onclick: () => { data.sheets.push(blankSheet(`Ark${data.sheets.length + 1}`)); si = data.sheets.length - 1; saver.touch(); build(); } }, icon('plus')));
  }
  function renameSheet(i) {
    const inp = h('input', { class: 'input', value: data.sheets[i].name, maxlength: 30 });
    let m;
    const ok = () => { const v = inp.value.trim(); if (!v) return; data.sheets[i].name = v; m.close(); saver.touch(); drawTabs(); };
    m = modal({ title: 'Omdøb ark', body: inp, actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: ok }, 'Gem')] });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    setTimeout(() => inp.select(), 40);
  }
  async function deleteSheet(i) {
    if (!await confirmDialog({ title: `Slet “${data.sheets[i].name}”?`, text: 'Arket og alt indhold slettes.', confirmLabel: 'Slet', danger: true })) return;
    data.sheets.splice(i, 1); si = Math.max(0, Math.min(si, data.sheets.length - 1)); saver.touch(); build();
  }

  // ── export / print ──
  function used(s) {
    let mr = -1, mc = -1;
    for (const id of Object.keys(s.cells)) { const p = parseRef(id); if (p && (s.cells[id].v || s.cells[id].s)) { mr = Math.max(mr, p.r); mc = Math.max(mc, p.c); } }
    return { mr, mc };
  }
  function exportCsv() {
    const s = S(), { mr, mc } = used(s), v = evaluateSheet(s.cells), lines = [];
    for (let r = 0; r <= mr; r++) {
      const row = [];
      for (let c = 0; c <= mc; c++) { const val = v.get(ref(c, r)); const raw = s.cells[ref(c, r)]?.v, st = s.cells[ref(c, r)]?.s; let t = typeof val === 'number' && !autoDateKind(raw) && st?.fmt !== 'date' ? String(val).replace('.', ',') : display(val ?? '', st, raw); if (/[";\n]/.test(t)) t = `"${t.replace(/"/g, '""')}"`; row.push(t); }
      lines.push(row.join(';'));
    }
    download(`${safeName(frame.title())} - ${safeName(s.name)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function exportXls() {
    const x = (t) => escapeHtml(t);
    const sheets = data.sheets.map(s => {
      const { mr, mc } = used(s), v = evaluateSheet(s.cells), rows = [];
      for (let r = 0; r <= mr; r++) {
        const cells = [];
        for (let c = 0; c <= mc; c++) {
          const val = v.get(ref(c, r)), st = s.cells[ref(c, r)]?.s;
          const sid = st?.b ? ' ss:StyleID="b"' : '';
          if (typeof val === 'number') cells.push(`<Cell${sid}><Data ss:Type="Number">${val}</Data></Cell>`);
          else cells.push(`<Cell${sid}><Data ss:Type="String">${x(display(val ?? '', st, s.cells[ref(c, r)]?.v))}</Data></Cell>`);
        }
        rows.push(`<Row>${cells.join('')}</Row>`);
      }
      return `<Worksheet ss:Name="${x(s.name.slice(0, 31))}"><Table>${rows.join('')}</Table></Worksheet>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="b"><Font ss:Bold="1"/></Style></Styles>${sheets.join('')}</Workbook>`;
    download(`${safeName(frame.title())}.xls`, xml, 'application/vnd.ms-excel');
    toast('Excel-fil hentet', { type: 'ok', text: 'Formler gemmes som deres resultater.' });
  }
  async function exportXlsx() {
    try {
      download(`${safeName(frame.title())}.xlsx`, await workbookBlob(data));
      toast('Excel-fil hentet', { type: 'ok', text: 'Formlerne virker også i Excel.' });
    } catch (e) { errorToast(e, 'Excel-eksport mislykkedes'); }
  }
  function printSheet() {
    const s = S(), { mr, mc } = used(s), v = evaluateSheet(s.cells), cond = condStyles(s, v);
    const t = h('table', { class: 'print-sheet' });
    const head = h('tr', null, h('th'), ...Array.from({ length: mc + 1 }, (_, c) => h('th', null, colName(c))));
    t.appendChild(head);
    for (let r = 0; r <= mr; r++) t.appendChild(h('tr', null, h('th', null, String(r + 1)), ...Array.from({ length: mc + 1 }, (_, c) => {
      const st = s.cells[ref(c, r)]?.s || {}, val = v.get(ref(c, r));
      const cf = cond.get(ref(c, r));
      return h('td', { style: { fontWeight: st.b ? '700' : null, fontStyle: st.i ? 'italic' : null, textAlign: st.al || (typeof val === 'number' ? 'right' : null), background: cf?.bg || st.bg || null, color: cf?.fg || st.fg || null } }, display(val ?? '', st, s.cells[ref(c, r)]?.v));
    })));
    const chs = (s.charts || []).map(ch => h('figure', { class: 'print-chart' }, h('figcaption', null, ch.title || ''), renderChart(ch, s, v)));
    printNode(h('div', null, h('h2', null, `${frame.title()} – ${s.name}`), t, ...chs), frame.title(), 'print-landscape');
  }

  frame.body.append(
    h('div', { class: 'sh-fxbar glass' }, nameBox, h('span', { class: 'sh-fxicon', title: 'Formel' }, 'fx'), fx),
    h('div', { class: 'sh-wrap glass' }, scroll),
    charts,
    h('div', { class: 'sh-foot on-world' }, tabs, statusSel));
  frame.status.append(h('span', null, 'Formler: =SUM(A1:A5) · =HVIS(A1>10;"ja";"nej") · =LOPSLAG(…) · =XOPSLAG(…) · =IDAG() · Enter flytter ned · Tab flytter til højre'));
  build();
  setTimeout(() => scroll.focus({ preventScroll: true }), 50);
  return {
    el: frame.el,
    destroy() { if (editing) commit(); removeEventListener('mouseup', up); return frame.destroy(); },
  };
}

/** Real .xlsx (formulas kept) for a sheet document's data. */
export async function workbookBlob(data) {
  const X = await loadXlsx();
  const wb = X.utils.book_new();
  for (const s of data.sheets) {
    const v = evaluateSheet(s.cells), ws = {};
    let mr = 0, mc = 0;
    for (const [id, cell] of Object.entries(s.cells)) {
      const p = parseRef(id); if (!p || !cell.v) continue;
      mr = Math.max(mr, p.r); mc = Math.max(mc, p.c);
      const val = v.get(id);
      const o = typeof val === 'number' ? { t: 'n', v: val } : typeof val === 'boolean' ? { t: 'b', v: val } : isErr(val) ? { t: 's', v: val.err } : { t: 's', v: String(val ?? '') };
      if (cell.v[0] === '=') o.f = toExcelFormula(cell.v.slice(1));
      const dk = cell.s?.fmt === 'date' || cell.s?.fmt === 'datetime' ? cell.s.fmt : (!cell.s?.fmt ? autoDateKind(cell.v) : null);
      if (dk && o.t === 'n') o.z = dk === 'datetime' ? 'dd-mm-yyyy hh:mm' : 'dd-mm-yyyy';
      else if (cell.s?.fmt === 'kr') o.z = '#,##0.00 "kr."'; else if (cell.s?.fmt === 'pct') o.z = '0.00%'; else if (cell.s?.fmt === 'num2') o.z = '#,##0.00'; else if (cell.s?.fmt === 'int') o.z = '0';
      ws[id] = o;
    }
    ws['!ref'] = `A1:${ref(mc, mr)}`;
    ws['!cols'] = Array.from({ length: mc + 1 }, (_, c) => ({ wpx: s.colW?.[colName(c)] || DEF_W }));
    X.utils.book_append_sheet(wb, ws, (s.name || 'Ark').slice(0, 31));
  }
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function importCsvFile(file) {
  const text = await readFile(file);
  const rows = parseDelimited(text.replace(/^﻿/, ''));
  return { sheets: [sheetFromRows(rows, file.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Ark1')], active: 0 };
}
export { parseInput };


/** Danish function names and ; separators → the English form Excel stores in .xlsx files. */
export function toExcelFormula(f) {
  let out = '', i = 0, inStr = false;
  const danish = /;/.test(f.replace(/"[^"]*"/g, ''));
  while (i < f.length) {
    const c = f[i];
    if (c === '"') { inStr = !inStr; out += c; i++; continue; }
    if (inStr) { out += c; i++; continue; }
    if (c === ';') { out += ','; i++; continue; }
    if (danish && c === ',' && /\d/.test(f[i - 1] || '') && /\d/.test(f[i + 1] || '')) { out += '.'; i++; continue; }
    const m = /^[A-ZÆØÅ_][A-ZÆØÅ0-9_.]*(?=\()/i.exec(f.slice(i));
    if (m) { const up = m[0].toUpperCase(); out += ALIAS[up] || up; i += m[0].length; continue; }
    out += c; i++;
  }
  return out;
}

/** Open an Excel/OpenDocument file (.xlsx, .xls, .ods) as sheet data. */
export async function importWorkbookFile(file) {
  const buf = await readFile(file, 'buffer');
  // parsed in a worker of its own (see xlsx-worker.js): a crafted file can't touch the page, and can't freeze it
  const wb = await new Promise((resolve, reject) => {
    const w = new Worker('/js/office/xlsx-worker.js');
    const t = setTimeout(() => { w.terminate(); reject(new Error('Filen tog for lang tid at læse. Er det en gyldig regnearksfil?')); }, 30000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); e.data?.ok ? resolve(e.data.wb) : reject(new Error(`Filen kunne ikke læses: ${e.data?.error || 'ukendt fejl'}`)); };
    w.onerror = (e) => { clearTimeout(t); w.terminate(); reject(new Error(`Filen kunne ikke læses: ${e.message || 'ukendt fejl'}`)); };
    w.postMessage(buf, [buf]);
  });
  const sheets = wb.SheetNames.slice(0, 20).map((name) => {
    const ws = wb.Sheets[name], s = blankSheet(name.slice(0, 30));
    const range = { e: ws['!range'] || { r: 0, c: 0 } };
    for (const [id, cell] of Object.entries(ws)) {
      if (id[0] === '!') continue;
      const p = parseRef(id); if (!p || p.r > 4999 || p.c > 51) continue;
      if (cell.f) s.cells[id] = { v: '=' + cell.f };
      else if (cell.v != null && cell.v !== '') s.cells[id] = { v: typeof cell.v === 'boolean' ? (cell.v ? 'SAND' : 'FALSK') : /^\d{4}-\d\d-\d\dT/.test(cell.v) ? new Date(cell.v).toLocaleDateString('da-DK') : String(cell.v) };
    }
    s.rows = Math.min(5000, Math.max(100, range.e.r + 21));
    s.cols = Math.min(52, Math.max(26, range.e.c + 3));
    (ws['!cols'] || []).forEach((col, c) => { if (col?.wpx) s.colW[colName(c)] = Math.round(col.wpx); });
    return s;
  });
  return { sheets: sheets.length ? sheets : [blankSheet()], active: 0 };
}
