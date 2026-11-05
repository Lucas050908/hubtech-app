/** Regneark without DOM: fill series (træk ned), move formulas, and insert/delete rows and columns. Tested in node. */
import { colName, colIndex, parseDate, fmtDate } from './formula.js';

const REF = /(\$?)([A-Z]{1,3})(\$?)(\d{1,5})(?![A-Z0-9_(])/g;
const MAXC = 16384, MAXR = 99999;

/** Apply fn(token) to every cell reference outside "strings". fn gets { ac, c, ar, r, rangeEnd, rangeStart } and returns text. */
function mapRefs(f, fn) {
  if (!String(f).startsWith('=')) return f;
  return String(f).split(/("(?:[^"]|"")*")/).map((part, i) => (i % 2 ? part : part.replace(REF, (m, ac, col, ar, row, off, all) => {
    if (off > 0 && /[A-Z0-9_.]/i.test(all[off - 1])) return m;    // part of a name like LOG10
    const c = colIndex(col), r = Number(row) - 1;
    if (c >= MAXC || r >= MAXR) return m;
    return fn({ ac: !!ac, c, ar: !!ar, r, rangeStart: all[off + m.length] === ':', rangeEnd: off > 0 && all[off - 1] === ':' });
  }))).join('');
}
const refText = (ac, c, ar, r) => `${ac ? '$' : ''}${colName(c)}${ar ? '$' : ''}${r + 1}`;

/** A formula copied dc columns and dr rows away: relative references follow, $-references stay. */
export function shiftFormula(f, dc, dr) {
  return mapRefs(f, ({ ac, c, ar, r }) => {
    const nc = ac ? c : c + dc, nr = ar ? r : r + dr;
    return nc < 0 || nr < 0 ? '#REF!' : refText(ac, nc, ar, nr);
  });
}

const WEEKDAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const WD_SHORT = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];
const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const MON_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const LISTS = [WEEKDAYS, WD_SHORT, MONTHS, MON_SHORT];
const caseLike = (model, s) => (model === model.toUpperCase() && model !== model.toLowerCase() ? s.toUpperCase() : model[0] === model[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s);
const num = (s) => { const t = String(s).trim().replace(/\./g, '').replace(',', '.'); return /^[-+]?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
const fmtNum = (n, model) => { const dec = (String(model).split(/[.,]/)[1] || '').length; const s = n.toFixed(Math.min(dec, 6)); return /,/.test(String(model)) || !/\./.test(String(model)) ? s.replace('.', ',') : s; };

/**
 * The next `count` values after the raw values `src` (one row or column), like dragging the fill handle in Excel:
 * numbers and dates continue their step (one number is copied), weekdays and months go round, "Uge 1" → "Uge 2",
 * formulas move along. `step` is how far each new cell is from the previous one ({dc, dr}).
 */
export function fillSeries(src, count, step = { dc: 0, dr: 1 }) {
  const out = [];
  const n = src.length;
  if (!n || count <= 0) return out;
  // formulas (or a mix): repeat the pattern and move references
  if (src.some(v => String(v).startsWith('='))) {
    for (let i = 0; i < count; i++) { const k = (n + i) % n, times = Math.floor((n + i) / n); out.push(shiftFormula(src[k], step.dc * n * times, step.dr * n * times)); }
    return out;
  }
  const nums = src.map(num);
  if (nums.every(x => x !== null)) {
    const d = n > 1 ? nums[n - 1] - nums[n - 2] : 0;
    const okStep = n < 3 || nums.every((x, i) => i === 0 || Math.abs(x - nums[i - 1] - d) < 1e-9);
    const model = src.reduce((a, v) => ((String(v).split(/[.,]/)[1] || '').length > (String(a).split(/[.,]/)[1] || '').length ? v : a), src[n - 1]);
    for (let i = 1; i <= count; i++) out.push(okStep ? fmtNum(nums[n - 1] + d * i, model) : src[(i - 1) % n]);
    return out;
  }
  const dates = src.map(v => parseDate(String(v).trim()));
  if (dates.every(x => x !== null)) {
    const d = n > 1 ? dates[n - 1] - dates[n - 2] : 1;
    for (let i = 1; i <= count; i++) out.push(fmtDate(dates[n - 1] + d * i));
    return out;
  }
  for (const list of LISTS) {
    const idx = src.map(v => list.indexOf(String(v).trim().toLowerCase().replace(/\.$/, '')));
    if (idx.every(x => x >= 0)) {
      const d = n > 1 ? ((idx[n - 1] - idx[n - 2]) + list.length) % list.length || 1 : 1;
      for (let i = 1; i <= count; i++) out.push(caseLike(String(src[n - 1]).trim(), list[(idx[n - 1] + d * i) % list.length]));
      return out;
    }
  }
  const tail = src.map(v => /^(.*?)(\d+)$/.exec(String(v)));
  if (tail.every(Boolean) && tail.every(t => t[1] === tail[0][1])) {
    const ns = tail.map(t => Number(t[2])), d = n > 1 ? ns[n - 1] - ns[n - 2] : 1;
    for (let i = 1; i <= count; i++) out.push(`${tail[0][1]}${ns[n - 1] + d * i}`);
    return out;
  }
  for (let i = 0; i < count; i++) out.push(src[i % n]);
  return out;
}

/**
 * Insert (n > 0) or delete (n < 0) rows or columns at index `at` in a cells map { A1: {v, s} }. Cells move, and every
 * formula is fixed so it still points at the same cells (deleted ones become #REF!). Returns a new map.
 */
export function shiftCells(cells, axis, at, n) {
  const isRow = axis === 'row';
  const del = n < 0 ? -n : 0;
  const move = (i) => (n > 0 ? (i >= at ? i + n : i) : (i >= at + del ? i - del : i < at ? i : null));
  const fixRef = ({ ac, c, ar, r, rangeStart, rangeEnd }) => {
    const i = isRow ? r : c;
    let j = move(i);
    if (j === null) {                           // inside what was deleted
      if (rangeStart) j = at;                   // a range shrinks instead
      else if (rangeEnd) j = at - 1;
      else return '#REF!';
      if (j < 0) return '#REF!';
    }
    return isRow ? refText(ac, c, ar, j) : refText(ac, j, ar, r);
  };
  const out = {};
  for (const [id, cell] of Object.entries(cells || {})) {
    const m = /^([A-Z]+)(\d+)$/.exec(id); if (!m) continue;
    const c = colIndex(m[1]), r = Number(m[2]) - 1;
    const j = move(isRow ? r : c);
    if (j === null) continue;
    const nid = isRow ? `${m[1]}${j + 1}` : `${colName(j)}${r + 1}`;
    out[nid] = cell?.v && String(cell.v).startsWith('=') ? { ...cell, v: mapRefs(cell.v, fixRef) } : cell;
  }
  return out;
}
