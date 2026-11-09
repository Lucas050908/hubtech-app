/** Regneark extras: conditional formatting, charts (SVG) and date display rules. Pure helpers + small dialogs. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { modal } from '../core/ui.js';
import { parseRef, ref, isErr, parseInput, fmtDate, looksLikeDate, fmtNumber } from './formula.js';

// ── dates ──
const DATE_FN = /^=\s*(TODAY|IDAG|DATE|DATO|EDATE|EDATO|EOMONTH|SLUT\.PÅ\.MÅNED|WORKDAY|ARBEJDSDAG)\s*\(/i;
const DATETIME_FN = /^=\s*(NOW|NU)\s*\(/i;
/** 'date' | 'datetime' | null – how a numeric cell without an explicit format should be shown */
export function autoDateKind(raw) {
  if (typeof raw !== 'string') return null;
  if (DATETIME_FN.test(raw)) return 'datetime';
  if (DATE_FN.test(raw) || looksLikeDate(raw)) return 'date';
  return null;
}
export const showDate = (n, kind) => fmtDate(n, kind === 'datetime');

// ── ranges ──
export function parseRange(txt) {
  const [a, b] = String(txt || '').trim().toUpperCase().replace(/\$/g, '').split(':').map(parseRef);
  if (!a) return null;
  const e = b || a;
  return { c1: Math.min(a.c, e.c), c2: Math.max(a.c, e.c), r1: Math.min(a.r, e.r), r2: Math.max(a.r, e.r) };
}
export const rangeText = ({ c1, c2, r1, r2 }) => (c1 === c2 && r1 === r2 ? ref(c1, r1) : `${ref(c1, r1)}:${ref(c2, r2)}`);

// ── conditional formatting ──
export const COND_TYPES = [
  ['gt', 'Større end'], ['lt', 'Mindre end'], ['between', 'Mellem'], ['eq', 'Lig med'],
  ['text', 'Tekst indeholder'], ['neg', 'Negative tal'], ['dup', 'Dubletter'], ['top', 'Største N'],
  ['scale', 'Farveskala (rød → grøn)'], ['bars', 'Datasøjler'],
];
export const COND_COLORS = {
  red: { bg: '#ffd7d5', fg: '#9b1c1c', label: 'Rød' },
  green: { bg: '#d3f5df', fg: '#11643a', label: 'Grøn' },
  yellow: { bg: '#fff1b8', fg: '#7a5800', label: 'Gul' },
  blue: { bg: '#d8e8ff', fg: '#1d4f91', label: 'Blå' },
  purple: { bg: '#ead9ff', fg: '#5b2a99', label: 'Lilla' },
};
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const scaleColor = (t) => {      // 0 → red, .5 → yellow, 1 → green (soft tones that keep text readable)
  const R = [248, 105, 107], Y = [255, 235, 132], G = [99, 190, 123];
  const [x, y, k] = t < 0.5 ? [R, Y, t * 2] : [Y, G, (t - 0.5) * 2];
  return `rgb(${lerp(x[0], y[0], k)}, ${lerp(x[1], y[1], k)}, ${lerp(x[2], y[2], k)})`;
};

/** → Map(cellId → { bg, fg, bar }) for every rule on the sheet (later rules win). */
export function condStyles(sheet, values) {
  const out = new Map();
  for (const rule of sheet.cond || []) {
    const rg = parseRange(rule.range);
    if (!rg) continue;
    const ids = [];
    for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) ids.push(ref(c, r));
    const val = (id) => values.get(id);
    const nums = ids.map(val).filter(v => typeof v === 'number');
    const col = COND_COLORS[rule.color] || COND_COLORS.red;
    const set = (id, st) => out.set(id, { ...(out.get(id) || {}), ...st });
    if (rule.type === 'scale' || rule.type === 'bars') {
      if (!nums.length) continue;
      const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
      for (const id of ids) {
        const v = val(id);
        if (typeof v !== 'number') continue;
        const t = (v - min) / span;
        if (rule.type === 'scale') set(id, { bg: scaleColor(t), fg: '#1d2430' });
        else set(id, { bar: Math.max(0.04, max <= 0 ? 0 : Math.max(0, v) / (max > 0 ? max : 1)) });
      }
      continue;
    }
    let test;
    const a = parseInput(rule.v1), b = parseInput(rule.v2);
    switch (rule.type) {
      case 'gt': test = (v) => typeof v === 'number' && typeof a === 'number' && v > a; break;
      case 'lt': test = (v) => typeof v === 'number' && typeof a === 'number' && v < a; break;
      case 'between': test = (v) => typeof v === 'number' && typeof a === 'number' && typeof b === 'number' && v >= Math.min(a, b) && v <= Math.max(a, b); break;
      case 'eq': test = (v) => (typeof v === 'number' && typeof a === 'number') ? v === a : String(v ?? '').toLowerCase() === String(rule.v1 ?? '').toLowerCase() && v !== ''; break;
      case 'text': test = (v) => typeof v === 'string' && v !== '' && String(rule.v1 || '') !== '' && v.toLowerCase().includes(String(rule.v1).toLowerCase()); break;
      case 'neg': test = (v) => typeof v === 'number' && v < 0; break;
      case 'dup': {
        const seen = new Map();
        ids.forEach(id => { const v = val(id); if (v === '' || v == null || isErr(v)) return; const k = typeof v === 'number' ? `n${v}` : `s${String(v).toLowerCase()}`; seen.set(k, (seen.get(k) || 0) + 1); });
        test = (v) => { if (v === '' || v == null || isErr(v)) return false; const k = typeof v === 'number' ? `n${v}` : `s${String(v).toLowerCase()}`; return seen.get(k) > 1; };
        break;
      }
      case 'top': {
        const n = Math.max(1, Math.round(typeof a === 'number' ? a : 3));
        const cut = [...nums].sort((x, y) => y - x)[Math.min(n, nums.length) - 1];
        test = (v) => typeof v === 'number' && v >= cut;
        break;
      }
      default: continue;
    }
    for (const id of ids) if (test(val(id))) set(id, { bg: col.bg, fg: col.fg });
  }
  return out;
}

export function describeRule(rule) {
  const t = Object.fromEntries(COND_TYPES)[rule.type] || rule.type;
  const v = rule.type === 'between' ? ` ${rule.v1} og ${rule.v2}` : ['gt', 'lt', 'eq', 'text', 'top'].includes(rule.type) ? ` ${rule.v1}` : '';
  return `${rule.range}: ${t}${v}`;
}

/** Dialog listing the sheet's rules + a form to add one for `selection`. onChange() after every edit. */
export function condDialog(sheet, selection, onChange) {
  sheet.cond ||= [];
  const list = h('div', { class: 'cf-list' });
  const drawList = () => {
    clear(list);
    if (!sheet.cond.length) { list.appendChild(h('p', { class: 'muted' }, 'Ingen regler på dette ark endnu.')); return; }
    sheet.cond.forEach((r, i) => list.appendChild(h('div', { class: 'cf-row' },
      h('span', { class: 'cf-swatch', style: { background: r.type === 'scale' ? 'linear-gradient(90deg,#f8696b,#ffeb84,#63be7b)' : r.type === 'bars' ? 'linear-gradient(90deg,#7cb4ff 60%,transparent 60%)' : (COND_COLORS[r.color] || COND_COLORS.red).bg } }),
      h('span', { class: 'cf-text' }, describeRule(r)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Slet regel', title: 'Slet regel', onclick: () => { sheet.cond.splice(i, 1); drawList(); onChange(); } }, icon('trash')))));
  };
  drawList();
  const range = h('input', { class: 'input', value: rangeText(selection), 'aria-label': 'Område', spellcheck: 'false' });
  const type = h('select', { class: 'select' }, COND_TYPES.map(([v, l]) => h('option', { value: v }, l)));
  const v1 = h('input', { class: 'input', placeholder: 'Værdi', 'aria-label': 'Værdi' });
  const v2 = h('input', { class: 'input', placeholder: 'Og', 'aria-label': 'Anden værdi' });
  const color = h('select', { class: 'select', 'aria-label': 'Farve' }, Object.entries(COND_COLORS).map(([k, c]) => h('option', { value: k }, c.label)));
  const err = h('div', { class: 'field-error' });
  const colorLabel = h('label', null, 'Farve', color);
  const sync = () => {
    const t = type.value;
    v1.hidden = !['gt', 'lt', 'between', 'eq', 'text', 'top'].includes(t);
    v2.hidden = t !== 'between';
    colorLabel.hidden = ['scale', 'bars'].includes(t);
    v1.placeholder = t === 'top' ? 'Antal, fx 3' : t === 'text' ? 'Tekst' : 'Værdi';
  };
  type.addEventListener('change', sync); sync();
  const add = h('button', { type: 'button', class: 'btn btn-primary' }, icon('plus'), 'Tilføj regel');
  add.addEventListener('click', () => {
    const rg = parseRange(range.value);
    if (!rg) { err.textContent = 'Skriv et område, fx B2:B20.'; return; }
    if (!v1.hidden && v1.value.trim() === '') { err.textContent = 'Udfyld værdien.'; return; }
    err.textContent = '';
    sheet.cond.push({ range: rangeText(rg), type: type.value, v1: v1.value.trim(), v2: v2.value.trim(), color: color.value });
    drawList(); onChange();
  });
  let m;
  m = modal({
    title: 'Betinget formatering', label: 'Regneark', size: 560,
    body: h('div', { class: 'cf-body' }, list,
      h('h3', { class: 'cf-h' }, 'Ny regel'),
      h('div', { class: 'cf-form' }, h('label', null, 'Område', range), h('label', null, 'Hvis cellen er', type), h('div', { class: 'cf-vals' }, v1, v2), colorLabel),
      err),
    actions: [add, h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, 'Færdig')],
  });
  return m;
}

// ── charts ──
export const CHART_TYPES = [['bar', 'Søjler'], ['line', 'Linje'], ['pie', 'Cirkel']];
const PALETTE = ['#4c8dff', '#f59e0b', '#22c55e', '#e5484d', '#a259ff', '#14b8a6', '#f97316', '#64748b'];

/** Read a range as { labels, series:[{name, values}] }: first column = labels (if text), first row = series names (if text). */
export function chartData(sheet, values, rangeTxt) {
  const rg = parseRange(rangeTxt);
  if (!rg) return null;
  const at = (c, r) => values.get(ref(c, r));
  const firstRowText = [];
  for (let c = rg.c1; c <= rg.c2; c++) firstRowText.push(typeof at(c, rg.r1) === 'string' && at(c, rg.r1) !== '');
  const headerRow = rg.r2 > rg.r1 && firstRowText.slice(rg.c2 > rg.c1 ? 1 : 0).some(Boolean);
  let labelCol = false;
  if (rg.c2 > rg.c1) { labelCol = true; for (let r = rg.r1 + (headerRow ? 1 : 0); r <= rg.r2; r++) { const v = at(rg.c1, r); if (typeof v === 'number' && !autoDateKind(sheet.cells[ref(rg.c1, r)]?.v)) { labelCol = false; break; } } }
  const r0 = rg.r1 + (headerRow ? 1 : 0), c0 = rg.c1 + (labelCol ? 1 : 0);
  const labels = [];
  for (let r = r0; r <= rg.r2; r++) {
    if (!labelCol) { labels.push(String(r - r0 + 1)); continue; }
    const v = at(rg.c1, r), raw = sheet.cells[ref(rg.c1, r)]?.v;
    labels.push(typeof v === 'number' ? (autoDateKind(raw) ? fmtDate(v) : fmtNumber(v)) : String(v ?? ''));
  }
  const series = [];
  for (let c = c0; c <= rg.c2; c++) {
    const name = headerRow ? String(at(c, rg.r1) ?? '') : `Serie ${c - c0 + 1}`;
    const vals = [];
    for (let r = r0; r <= rg.r2; r++) { const v = at(c, r); vals.push(typeof v === 'number' ? v : null); }
    if (vals.some(v => v !== null)) series.push({ name, values: vals });
  }
  return { labels, series };
}

const svgEl = (tag, attrs = {}, kids = []) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  for (const k of [].concat(kids)) if (k) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return e;
};
const niceStep = (span) => { const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; };
const short = (n) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('da-DK', { maximumFractionDigits: 1 })} mio.` : n.toLocaleString('da-DK', { maximumFractionDigits: 2 });

/** SVG chart (600×340 viewBox) for a chart definition. */
export function renderChart(chart, sheet, values) {
  const W = 600, H = 340;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ch-svg', role: 'img', 'aria-label': chart.title || 'Diagram' });
  const d = chartData(sheet, values, chart.range);
  if (!d || !d.series.length) {
    svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'ch-empty' }, 'Ingen tal i området'));
    return svg;
  }
  const legend = svgEl('g', { class: 'ch-legend' });
  const names = chart.type === 'pie' ? d.labels : d.series.map(s => s.name);
  let lx = 16;
  names.slice(0, 8).forEach((n, i) => {
    legend.appendChild(svgEl('rect', { x: lx, y: H - 20, width: 10, height: 10, rx: 2, fill: PALETTE[i % PALETTE.length] }));
    const t = svgEl('text', { x: lx + 14, y: H - 11, class: 'ch-lbl' }, String(n).slice(0, 18));
    legend.appendChild(t);
    lx += 24 + Math.min(18, String(n).length) * 6.4;
  });
  if (chart.type === 'pie') {
    const vals = d.series[0].values.map(v => Math.max(0, v || 0));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = (H - 28) / 2 + 4, R = Math.min(W, H - 40) / 2 - 12;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return;
      const a1 = a0 + (v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a) => `${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)}`;
      const path = v === total ? `M ${cx - R} ${cy} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0` : `M ${cx} ${cy} L ${p(a0)} A ${R} ${R} 0 ${large} 1 ${p(a1)} Z`;
      const slice = svgEl('path', { d: path, fill: PALETTE[i % PALETTE.length], class: 'ch-slice' }, svgEl('title', {}, `${d.labels[i]}: ${short(v)} (${Math.round(v / total * 100)} %)`));
      svg.appendChild(slice);
      const mid = (a0 + a1) / 2;
      if (v / total > 0.06) svg.appendChild(svgEl('text', { x: cx + R * 0.62 * Math.cos(mid), y: cy + R * 0.62 * Math.sin(mid) + 4, 'text-anchor': 'middle', class: 'ch-pct' }, `${Math.round(v / total * 100)} %`));
      a0 = a1;
    });
    svg.appendChild(legend);
    return svg;
  }
  const all = d.series.flatMap(s => s.values).filter(v => v !== null);
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  if (lo === hi) hi = lo + 1;
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const L = 58, R = W - 14, T = 14, B = H - 54;
  const y = (v) => B - (v - lo) / (hi - lo) * (B - T);
  for (let v = lo; v <= hi + step / 2; v += step) {
    svg.appendChild(svgEl('line', { x1: L, x2: R, y1: y(v), y2: y(v), class: v === 0 ? 'ch-axis' : 'ch-grid' }));
    svg.appendChild(svgEl('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ch-lbl' }, short(Math.round(v * 1e6) / 1e6)));
  }
  const n = d.labels.length, band = (R - L) / Math.max(1, n);
  const every = Math.ceil(n / 12);
  d.labels.forEach((lb, i) => { if (i % every === 0) svg.appendChild(svgEl('text', { x: L + band * (i + 0.5), y: B + 16, 'text-anchor': 'middle', class: 'ch-lbl' }, String(lb).slice(0, 12))); });
  if (chart.type === 'line') {
    d.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => (v === null ? null : [L + band * (i + 0.5), y(v)]));
      let dd = '', pen = false;
      for (const p of pts) { if (!p) { pen = false; continue; } dd += `${pen ? ' L' : ' M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`; pen = true; }
      svg.appendChild(svgEl('path', { d: dd.trim(), fill: 'none', stroke: PALETTE[si % PALETTE.length], 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      pts.forEach((p, i) => { if (p) svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 4, fill: PALETTE[si % PALETTE.length], class: 'ch-dot' }, svgEl('title', {}, `${s.name} – ${d.labels[i]}: ${short(s.values[i])}`))); });
    });
  } else {
    const k = d.series.length, gap = band * 0.18, bw = (band - gap * 2) / k;
    d.series.forEach((s, si) => s.values.forEach((v, i) => {
      if (v === null) return;
      const x = L + band * i + gap + bw * si, y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
      svg.appendChild(svgEl('rect', { x, y: y0, width: Math.max(1, bw - 2), height: Math.max(1, y1 - y0), rx: 3, fill: PALETTE[si % PALETTE.length], class: 'ch-bar' }, svgEl('title', {}, `${s.name} – ${d.labels[i]}: ${short(v)}`)));
    }));
  }
  svg.appendChild(legend);
  return svg;
}

/** Dialog to add or edit a chart. resolve(chart | null) */
export function chartDialog(chart, defaultRange) {
  return new Promise((resolve) => {
    const title = h('input', { class: 'input', value: chart?.title || '', placeholder: 'Titel (valgfri)', maxlength: 80 });
    const range = h('input', { class: 'input', value: chart?.range || defaultRange, spellcheck: 'false' });
    const type = h('select', { class: 'select' }, CHART_TYPES.map(([v, l]) => h('option', { value: v, selected: (chart?.type || 'bar') === v }, l)));
    const err = h('div', { class: 'field-error' });
    let m;
    const ok = () => {
      const rg = parseRange(range.value);
      if (!rg) { err.textContent = 'Skriv et område, fx A1:B8.'; return; }
      resolve({ id: chart?.id || Math.random().toString(36).slice(2, 10), title: title.value.trim(), range: rangeText(rg), type: type.value });
      m.close();
    };
    m = modal({
      title: chart ? 'Redigér diagram' : 'Indsæt diagram', label: 'Regneark', size: 480,
      body: h('div', { class: 'cf-form' },
        h('label', null, 'Diagramtype', type), h('label', null, 'Dataområde', range), h('label', null, 'Titel', title),
        h('p', { class: 'muted small' }, 'Første kolonne bruges som navne, og første række som serie-navne, hvis de er tekst.'), err),
      actions: [h('button', { type: 'button', class: 'btn', onclick: () => { m.close(); resolve(null); } }, 'Annuller'), h('button', { type: 'button', class: 'btn btn-primary', onclick: ok }, chart ? 'Gem' : 'Indsæt')],
      onClose: () => resolve(null),
    });
  });
}
