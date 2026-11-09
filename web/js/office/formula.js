/**
 * Spreadsheet formula engine for HUBTECH Office (pure functions, no DOM).
 * Supports numbers, "strings", TRUE/FALSE, A1 / $A$1 refs, ranges A1:B3, operators
 * + - * / ^ & % = <> < > <= >=, and ~40 functions with Danish and English names.
 * Arguments may be separated by ; (Danish Excel) or , .
 */
export const ERR = (code) => ({ err: code });
export const isErr = (v) => v && typeof v === 'object' && 'err' in v;

export const colName = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
export const colIndex = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
export const ref = (c, r) => `${colName(c)}${r + 1}`;
export const parseRef = (s) => { const m = /^\$?([A-Z]{1,3})\$?(\d{1,5})$/i.exec(s); return m ? { c: colIndex(m[1]), r: Number(m[2]) - 1 } : null; };

/** Parse what the user typed into a cell (not a formula) → number | string | boolean. Danish formats are understood. */
// Dates are Excel serial numbers (days since 30-12-1899), so they sort, subtract and export like Excel.
const EPOCH = Date.UTC(1899, 11, 30);
export const dateToSerial = (y, m, d) => (Date.UTC(y, m - 1, d) - EPOCH) / 86400000;
export const serialToDate = (n) => new Date(EPOCH + Math.round(n * 86400000));
export const todaySerial = () => { const d = new Date(); return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
/** "20-10-2026", "20.10.2026", "20/10/26" or "2026-10-20" → serial, else null */
export function parseDate(s) {
  let m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(s), y, mo, d;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;   // 31-02 etc.
  return dateToSerial(y, mo, d);
}
export const looksLikeDate = (s) => parseDate(String(s ?? '').trim()) !== null;
export const fmtDate = (n, withTime = false) => {
  const d = serialToDate(n);
  const p = (x) => String(x).padStart(2, '0');
  const base = `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  return withTime ? `${base} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : base;
};

export function parseInput(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return '';
  const dt = parseDate(s);
  if (dt !== null) return dt;
  if (/^(sand|true)$/i.test(s)) return true;
  if (/^(falsk|false)$/i.test(s)) return false;
  let t = s.replace(/\s|kr\.?$/gi, '').replace(/^kr\.?/i, '');
  let pct = false;
  if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
  let n = NaN;
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, '').replace(',', '.'));   // 1.234,5
  else if (/^[-+]?\d+(,\d+)?$/.test(t)) n = Number(t.replace(',', '.'));                                // 12,5
  else if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) n = Number(t);                               // 12.5
  if (isFinite(n)) return pct ? n / 100 : n;
  return s;
}

// ── tokenizer ──
function tokenize(src) {
  const t = []; let i = 0;
  // Danish style "=SUM(A1;2,5)": when ; separates arguments, a comma between digits is a decimal comma
  const danish = /;/.test(src.replace(/"[^"]*"/g, ''));
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { let j = i + 1, s = ''; while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; } if (j >= src.length) throw ERR('#FEJL!'); t.push({ k: 'str', v: s }); i = j + 1; continue; }
    const num = (danish ? /^(\d+(?:[.,]\d+)?|\.\d+)(e[-+]?\d+)?/i : /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i).exec(src.slice(i));
    if (num && !/^[A-Z]/i.test(src.slice(i))) { t.push({ k: 'num', v: Number(num[0].replace(',', '.')) }); i += num[0].length; continue; }
    const rng = /^\$?[A-Z]{1,3}\$?\d{1,5}(:\$?[A-Z]{1,3}\$?\d{1,5})?(?![A-Z0-9_.(])/i.exec(src.slice(i));
    if (rng) { t.push({ k: rng[1] ? 'range' : 'ref', v: rng[0].toUpperCase() }); i += rng[0].length; continue; }
    const id = /^[A-ZÆØÅ_][A-ZÆØÅ0-9_.]*/i.exec(src.slice(i));
    if (id) { t.push({ k: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const op = /^(<=|>=|<>|[-+*/^&%=<>(),;:])/.exec(src.slice(i));
    if (op) { t.push({ k: 'op', v: op[0] }); i += op[0].length; continue; }
    throw ERR('#FEJL!');
  }
  return t;
}

// ── parser (precedence climbing) → AST ──
export function parse(src) {
  const t = tokenize(src); let p = 0;
  const peek = () => t[p], next = () => t[p++];
  const is = (v) => t[p] && t[p].k === 'op' && t[p].v === v;
  const expect = (v) => { if (!is(v)) throw ERR('#FEJL!'); p++; };
  function cmp() { let l = concat(); while (t[p]?.k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t[p].v)) { const o = next().v; l = { k: 'bin', o, l, r: concat() }; } return l; }
  function concat() { let l = add(); while (is('&')) { next(); l = { k: 'bin', o: '&', l, r: add() }; } return l; }
  function add() { let l = mul(); while (is('+') || is('-')) { const o = next().v; l = { k: 'bin', o, l, r: mul() }; } return l; }
  function mul() { let l = pow(); while (is('*') || is('/')) { const o = next().v; l = { k: 'bin', o, l, r: pow() }; } return l; }
  function pow() { let l = unary(); while (is('^')) { next(); l = { k: 'bin', o: '^', l, r: unary() }; } return l; }
  function unary() { if (is('-')) { next(); return { k: 'neg', a: unary() }; } if (is('+')) { next(); return unary(); } return postfix(); }
  function postfix() { let a = atom(); while (is('%')) { next(); a = { k: 'pct', a }; } return a; }
  function atom() {
    const tk = next();
    if (!tk) throw ERR('#FEJL!');
    if (tk.k === 'num') return { k: 'num', v: tk.v };
    if (tk.k === 'str') return { k: 'str', v: tk.v };
    if (tk.k === 'ref') return { k: 'ref', v: tk.v };
    if (tk.k === 'range') return { k: 'range', v: tk.v };
    if (tk.k === 'op' && tk.v === '(') { const e = cmp(); expect(')'); return e; }
    if (tk.k === 'id') {
      if (is('(')) {
        next(); const args = [];
        if (!is(')')) { do { args.push(is(';') || is(',') || is(')') ? { k: 'empty' } : cmp()); } while ((is(';') || is(',')) && next()); }
        expect(')');
        return { k: 'fn', name: tk.v, args };
      }
      if (tk.v === 'TRUE' || tk.v === 'SAND') return { k: 'bool', v: true };
      if (tk.v === 'FALSE' || tk.v === 'FALSK') return { k: 'bool', v: false };
      throw ERR('#NAVN?');
    }
    throw ERR('#FEJL!');
  }
  const ast = cmp();
  if (p < t.length) throw ERR('#FEJL!');
  return ast;
}

// ── evaluation ──
const toNum = (v) => {
  if (isErr(v)) throw v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === '' || v == null) return 0;
  const n = parseInput(v);
  if (typeof n === 'number') return n;
  throw ERR('#VÆRDI!');
};
const toStr = (v) => { if (isErr(v)) throw v; if (typeof v === 'number') return fmtNumber(v); if (typeof v === 'boolean') return v ? 'SAND' : 'FALSK'; return String(v ?? ''); };
const toBool = (v) => { if (isErr(v)) throw v; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; if (typeof v === 'string') { if (/^(sand|true)$/i.test(v)) return true; if (/^(falsk|false|)$/i.test(v)) return false; } throw ERR('#VÆRDI!'); };
export const fmtNumber = (n) => (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-9 && n !== 0)) ? n.toExponential(4).replace('.', ',') : Number(n.toPrecision(12)).toLocaleString('da-DK', { maximumFractionDigits: 10, useGrouping: false });

function flat(args) { const out = []; for (const a of args) { if (Array.isArray(a)) out.push(...a.flat()); else out.push(a); } return out; }
const nums = (args) => flat(args).filter(v => { if (isErr(v)) throw v; return typeof v === 'number'; });

function criteria(c) {
  const s = String(c ?? '');
  const m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(s);
  const op = m[1] || '=', rhs = m[2];
  const rn = parseInput(rhs);
  return (v) => {
    const isNum = typeof rn === 'number' && typeof v === 'number';
    const a = isNum ? v : String(v ?? '').toLowerCase(), b = isNum ? rn : String(rhs).toLowerCase();
    if (!isNum && (op === '=' || op === '<>') && /[*?]/.test(b)) { const re = new RegExp('^' + b.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); return op === '=' ? re.test(a) : !re.test(a); }
    switch (op) { case '=': return a === b; case '<>': return a !== b; case '<': return a < b; case '>': return a > b; case '<=': return a <= b; default: return a >= b; }
  };
}

/** a range as a grid (a single value counts as 1×1) */
function grid(t) {
  const a = Array.isArray(t) ? t : [t];
  const cols = a.cols || a.length, rows = a.rows || 1;
  return { rows, cols, at: (r, c) => a[r * cols + c], col: (c) => Array.from({ length: rows }, (_, r) => a[r * cols + c]), row: (r) => a.slice(r * cols, r * cols + cols) };
}
const same = (v, x) => (typeof v === 'number' && typeof x === 'number') ? v === x : String(v ?? '').toLowerCase() === String(x ?? '').toLowerCase();
/** exact (approx=false) or "largest value ≤ x" in sorted data (approx=true); desc → "smallest ≥ x" */
function findIn(x, list, approx, desc = false) {
  if (!approx) { const i = list.findIndex(v => same(v, x)); if (i < 0) throw ERR('#I/T'); return i; }
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v === '' || v == null) continue;
    const cmp = (typeof v === 'number' && typeof x === 'number') ? v - x : String(v).toLowerCase().localeCompare(String(x).toLowerCase());
    if (cmp === 0) return i;
    if (desc ? cmp > 0 : cmp < 0) best = i; else break;
  }
  if (best < 0) throw ERR('#I/T');
  return best;
}
function matchAll(pairs, n) {
  const ok = new Array(n).fill(true);
  for (let p = 0; p + 1 < pairs.length; p += 2) {
    const r = flat([pairs[p]]), f = criteria(pairs[p + 1]);
    if (r.length !== n) throw ERR('#VÆRDI!');
    r.forEach((v, i) => { if (!f(v)) ok[i] = false; });
  }
  return ok;
}
const dateNum = (v) => { if (typeof v === 'string') { const d = parseDate(v.trim()); if (d !== null) return d; } return toNum(v); };
function isoWeek(n) {
  const d = serialToDate(Math.floor(n));
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
/** TEXT(): the common Danish/Excel patterns – dd-mm-åååå, dddd, mmmm, 0,00, 0 %, # ##0 */
function textFormat(v, f) {
  const fl = f.toLowerCase();
  if (/[dmyå]/.test(fl) && !/[0#]/.test(fl)) {
    const d = serialToDate(dateNum(v));
    const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
    const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
    const p = (x) => String(x).padStart(2, '0');
    return f.replace(/dddd|ddd|dd|d|mmmm|mmm|mm|m|yyyy|åååå|yy|åå/gi, (t) => {
      switch (t.toLowerCase()) {
        case 'dddd': return DAYS[d.getUTCDay()];
        case 'ddd': return DAYS[d.getUTCDay()].slice(0, 3);
        case 'dd': return p(d.getUTCDate());
        case 'd': return String(d.getUTCDate());
        case 'mmmm': return MONTHS[d.getUTCMonth()];
        case 'mmm': return MONTHS[d.getUTCMonth()].slice(0, 3);
        case 'mm': return p(d.getUTCMonth() + 1);
        case 'm': return String(d.getUTCMonth() + 1);
        case 'yy': case 'åå': return String(d.getUTCFullYear()).slice(-2);
        default: return String(d.getUTCFullYear());
      }
    });
  }
  const n = toNum(v);
  const pct = f.includes('%');
  const x = pct ? n * 100 : n;
  const dec = (/[.,]([0#]+)/.exec(f) || [, ''])[1].length;
  const group = /#[ .]##0|# ##0|#\.##0/.test(f);
  const s = x.toLocaleString('da-DK', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: group });
  return pct ? `${s} %` : s;
}

const FN = {
  SUM: (a) => nums(a).reduce((x, y) => x + y, 0),
  AVERAGE: (a) => { const n = nums(a); if (!n.length) throw ERR('#DIVISION/0!'); return n.reduce((x, y) => x + y, 0) / n.length; },
  MIN: (a) => { const n = nums(a); return n.length ? Math.min(...n) : 0; },
  MAX: (a) => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
  COUNT: (a) => flat(a).filter(v => typeof v === 'number').length,
  COUNTA: (a) => flat(a).filter(v => v !== '' && v != null).length,
  COUNTBLANK: (a) => flat(a).filter(v => v === '' || v == null).length,
  PRODUCT: (a) => nums(a).reduce((x, y) => x * y, 1),
  MEDIAN: (a) => { const n = nums(a).sort((x, y) => x - y); if (!n.length) throw ERR('#TAL!'); const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
  ROUND: ([x, d]) => { const k = Math.pow(10, toNum(d ?? 0)); return Math.round(toNum(x) * k) / k; },
  ROUNDUP: ([x, d]) => { const k = Math.pow(10, toNum(d ?? 0)); const v = toNum(x); return Math.sign(v) * Math.ceil(Math.abs(v) * k) / k; },
  ROUNDDOWN: ([x, d]) => { const k = Math.pow(10, toNum(d ?? 0)); const v = toNum(x); return Math.sign(v) * Math.floor(Math.abs(v) * k) / k; },
  INT: ([x]) => Math.floor(toNum(x)),
  ABS: ([x]) => Math.abs(toNum(x)),
  SQRT: ([x]) => { const v = toNum(x); if (v < 0) throw ERR('#TAL!'); return Math.sqrt(v); },
  POWER: ([x, y]) => Math.pow(toNum(x), toNum(y)),
  MOD: ([x, y]) => { const d = toNum(y); if (!d) throw ERR('#DIVISION/0!'); const v = toNum(x); return v - d * Math.floor(v / d); },
  PI: () => Math.PI,
  IF: ([c, a, b]) => (toBool(c) ? (a ?? true) : (b ?? false)),
  IFERROR: ([v, alt]) => (isErr(v) ? alt : v),
  AND: (a) => flat(a).every(toBool),
  OR: (a) => flat(a).some(toBool),
  NOT: ([v]) => !toBool(v),
  CONCAT: (a) => flat(a).map(toStr).join(''),
  LEN: ([s]) => toStr(s).length,
  UPPER: ([s]) => toStr(s).toUpperCase(),
  LOWER: ([s]) => toStr(s).toLowerCase(),
  TRIM: ([s]) => toStr(s).trim().replace(/\s+/g, ' '),
  LEFT: ([s, n]) => toStr(s).slice(0, toNum(n ?? 1)),
  RIGHT: ([s, n]) => { const t = toStr(s); return t.slice(Math.max(0, t.length - toNum(n ?? 1))); },
  TODAY: () => todaySerial(),
  NOW: () => { const d = new Date(); return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; },
  COUNTIF: ([r, c]) => flat([r]).filter(criteria(c)).length,
  SUMIF: ([r, c, s]) => { const a = flat([r]), b = s ? flat([s]) : a, f = criteria(c); let t = 0; a.forEach((v, i) => { if (f(v) && typeof b[i] === 'number') t += b[i]; }); return t; },
  // ── lookup ──
  VLOOKUP: ([x, t, col, approx]) => {
    const g = grid(t), c = toNum(col) - 1;
    if (c < 0 || c >= g.cols) throw ERR('#REF!');
    const r = findIn(x, g.col(0), approx === undefined || approx === '' ? true : toBool(approx));
    return g.at(r, c);
  },
  HLOOKUP: ([x, t, row, approx]) => {
    const g = grid(t), r = toNum(row) - 1;
    if (r < 0 || r >= g.rows) throw ERR('#REF!');
    const c = findIn(x, g.row(0), approx === undefined || approx === '' ? true : toBool(approx));
    return g.at(r, c);
  },
  XLOOKUP: ([x, look, ret, notFound]) => {
    const a = flat([look]), b = flat([ret]);
    const i = a.findIndex(v => same(v, x));
    if (i < 0) { if (notFound !== undefined && notFound !== '') return notFound; throw ERR('#I/T'); }
    if (i >= b.length) throw ERR('#REF!');
    return b[i];
  },
  MATCH: ([x, t, type]) => {
    const a = flat([t]), k = type === undefined || type === '' ? 1 : toNum(type);
    if (k === 0) { const i = a.findIndex(v => same(v, x)); if (i < 0) throw ERR('#I/T'); return i + 1; }
    return findIn(x, a, true, k < 0) + 1;
  },
  INDEX: ([t, row, col]) => {
    const g = grid(t);
    let r = toNum(row ?? 1) - 1, c = toNum(col ?? 1) - 1;
    if (g.rows === 1 && (col === undefined || col === '')) { c = r; r = 0; }
    if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) throw ERR('#REF!');
    return g.at(r, c);
  },
  IFNA: ([v, alt]) => (isErr(v) && v.err === '#I/T' ? alt : v),
  ISERROR: ([v]) => isErr(v),
  ISBLANK: ([v]) => v === '' || v == null,
  ISNUMBER: ([v]) => typeof v === 'number',
  ISTEXT: ([v]) => typeof v === 'string' && v !== '',
  // ── conditional (multi) ──
  SUMIFS: ([s, ...pairs]) => { const vals = flat([s]), ok = matchAll(pairs, vals.length); return vals.reduce((t, v, i) => t + (ok[i] && typeof v === 'number' ? v : 0), 0); },
  COUNTIFS: (pairs) => { const n = flat([pairs[0]]).length; return matchAll(pairs, n).filter(Boolean).length; },
  AVERAGEIFS: ([s, ...pairs]) => { const vals = flat([s]), ok = matchAll(pairs, vals.length); const x = vals.filter((v, i) => ok[i] && typeof v === 'number'); if (!x.length) throw ERR('#DIVISION/0!'); return x.reduce((p, q) => p + q, 0) / x.length; },
  // ── text ──
  MID: ([s, start, n]) => toStr(s).substr(Math.max(0, toNum(start) - 1), toNum(n)),
  FIND: ([needle, hay, start]) => { const i = toStr(hay).indexOf(toStr(needle), Math.max(0, toNum(start ?? 1) - 1)); if (i < 0) throw ERR('#VÆRDI!'); return i + 1; },
  SEARCH: ([needle, hay, start]) => { const i = toStr(hay).toLowerCase().indexOf(toStr(needle).toLowerCase(), Math.max(0, toNum(start ?? 1) - 1)); if (i < 0) throw ERR('#VÆRDI!'); return i + 1; },
  SUBSTITUTE: ([s, a, b]) => toStr(s).split(toStr(a)).join(toStr(b)),
  TEXT: ([v, f]) => textFormat(v, toStr(f)),
  // ── dates ──
  DATE: ([y, m, d]) => { const dt = new Date(Date.UTC(toNum(y), toNum(m) - 1, toNum(d))); return (dt.getTime() - EPOCH) / 86400000; },
  YEAR: ([d]) => serialToDate(dateNum(d)).getUTCFullYear(),
  MONTH: ([d]) => serialToDate(dateNum(d)).getUTCMonth() + 1,
  DAY: ([d]) => serialToDate(dateNum(d)).getUTCDate(),
  WEEKDAY: ([d, type]) => { const w = serialToDate(dateNum(d)).getUTCDay(); const t = toNum(type ?? 1); return t === 2 ? (w + 6) % 7 + 1 : t === 3 ? (w + 6) % 7 : w + 1; },
  ISOWEEKNUM: ([d]) => isoWeek(dateNum(d)),
  WEEKNUM: ([d, type]) => { const t = toNum(type ?? 21); if (t === 21) return isoWeek(dateNum(d)); const dt = serialToDate(dateNum(d)); const jan1 = Date.UTC(dt.getUTCFullYear(), 0, 1); const off = (new Date(jan1).getUTCDay() - (t === 2 ? 1 : 0) + 7) % 7; return Math.floor(((dt - jan1) / 86400000 + off) / 7) + 1; },
  DAYS: ([a, b]) => Math.round(dateNum(a) - dateNum(b)),
  EDATE: ([d, m]) => { const dt = serialToDate(dateNum(d)); const t = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + toNum(m), 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return dateToSerial(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(dt.getUTCDate(), last)); },
  EOMONTH: ([d, m]) => { const dt = serialToDate(dateNum(d)); const t = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + toNum(m) + 1, 0)); return dateToSerial(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); },
  NETWORKDAYS: ([a, b, hol]) => {
    let s = Math.round(dateNum(a)), e = Math.round(dateNum(b)), sign = 1;
    if (e < s) { [s, e] = [e, s]; sign = -1; }
    const off = new Set(hol === undefined || hol === '' ? [] : flat([hol]).filter(v => v !== '').map(v => Math.round(dateNum(v))));
    let n = 0;
    for (let d = s; d <= e; d++) { const w = serialToDate(d).getUTCDay(); if (w !== 0 && w !== 6 && !off.has(d)) n++; }
    return n * sign;
  },
  AVERAGEIF: ([r, c, s]) => { const a = flat([r]), b = s ? flat([s]) : a, f = criteria(c); const x = []; a.forEach((v, i) => { if (f(v) && typeof b[i] === 'number') x.push(b[i]); }); if (!x.length) throw ERR('#DIVISION/0!'); return x.reduce((p, q) => p + q, 0) / x.length; },
};
export const ALIAS = { LOPSLAG: 'VLOOKUP', VOPSLAG: 'HLOOKUP', XOPSLAG: 'XLOOKUP', SAMMENLIGN: 'MATCH', INDEKS: 'INDEX', 'HVIS.IT': 'IFNA', 'ER.FEJL': 'ISERROR', 'ER.TOM': 'ISBLANK', 'ER.TAL': 'ISNUMBER', 'ER.TEKST': 'ISTEXT',
  'SUM.HVISER': 'SUMIFS', 'TÆL.HVISER': 'COUNTIFS', 'MIDDEL.HVISER': 'AVERAGEIFS', MIDT: 'MID', 'SØG': 'SEARCH', UDSKIFT: 'SUBSTITUTE', TEKST: 'TEXT',
  DATO: 'DATE', 'ÅR': 'YEAR', 'MÅNED': 'MONTH', DAG: 'DAY', UGEDAG: 'WEEKDAY', 'UGE.NR': 'WEEKNUM', 'ISOUGE.NR': 'ISOWEEKNUM', DAGE: 'DAYS', EDATO: 'EDATE', 'SLUT.PÅ.MÅNED': 'EOMONTH', 'ANTAL.ARBEJDSDAGE': 'NETWORKDAYS',
  SUMMER: 'SUM', MIDDEL: 'AVERAGE', 'MIDDELVÆRDI': 'AVERAGE', 'TÆL': 'COUNT', 'TÆLV': 'COUNTA', 'ANTAL.BLANKE': 'COUNTBLANK', PRODUKT: 'PRODUCT', AFRUND: 'ROUND', 'RUND.OP': 'ROUNDUP', 'RUND.NED': 'ROUNDDOWN', HELTAL: 'INT', KVROD: 'SQRT', POTENS: 'POWER', REST: 'MOD', HVIS: 'IF', 'HVIS.FEJL': 'IFERROR', OG: 'AND', ELLER: 'OR', IKKE: 'NOT', SAMMENKÆDNING: 'CONCAT', 'SAMMENKÆD': 'CONCAT', 'LÆNGDE': 'LEN', STORE: 'UPPER', 'STORE.BOGSTAVER': 'UPPER', SMÅ: 'LOWER', 'SMÅ.BOGSTAVER': 'LOWER', FJERN: 'TRIM', 'FJERN.OVERFLØDIGE.BLANKE': 'TRIM', VENSTRE: 'LEFT', 'HØJRE': 'RIGHT', IDAG: 'TODAY', NU: 'NOW', 'TÆL.HVIS': 'COUNTIF', 'SUM.HVIS': 'SUMIF', 'MIDDEL.HVIS': 'AVERAGEIF', MEDIAN: 'MEDIAN', CONCATENATE: 'CONCAT' };
export const FUNCTION_NAMES = [...Object.keys(FN), ...Object.keys(ALIAS)].sort();

function evalAst(n, get) {
  switch (n.k) {
    case 'num': case 'str': case 'bool': return n.v;
    case 'empty': return '';
    case 'ref': { const r = parseRef(n.v); if (!r) throw ERR('#REF!'); const v = get(r.c, r.r); if (isErr(v)) throw v; return v; }
    case 'range': {
      const [a, b] = n.v.split(':').map(parseRef); if (!a || !b) throw ERR('#REF!');
      const out = [];
      for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) out.push(get(c, r));
      out.rows = Math.abs(a.r - b.r) + 1; out.cols = Math.abs(a.c - b.c) + 1;
      return out;
    }
    case 'neg': return -toNum(evalAst(n.a, get));
    case 'pct': return toNum(evalAst(n.a, get)) / 100;
    case 'bin': {
      const l = evalAst(n.l, get), r = evalAst(n.r, get);
      if (Array.isArray(l) || Array.isArray(r)) throw ERR('#VÆRDI!');
      switch (n.o) {
        case '+': return toNum(l) + toNum(r);
        case '-': return toNum(l) - toNum(r);
        case '*': return toNum(l) * toNum(r);
        case '/': { const d = toNum(r); if (d === 0) throw ERR('#DIVISION/0!'); return toNum(l) / d; }
        case '^': return Math.pow(toNum(l), toNum(r));
        case '&': return toStr(l) + toStr(r);
        default: {
          const both = typeof l === 'number' && typeof r === 'number';
          const a = both ? l : toStr(l).toLowerCase(), b = both ? r : toStr(r).toLowerCase();
          return { '=': a === b, '<>': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[n.o];
        }
      }
    }
    case 'fn': {
      const name = ALIAS[n.name] || n.name;
      const f = FN[name];
      if (!f) throw ERR('#NAVN?');
      if (name === 'IFERROR' || name === 'IFNA' || name === 'ISERROR') { let v; try { v = evalAst(n.args[0], get); } catch (e) { v = isErr(e) ? e : ERR('#VÆRDI!'); } if (name === 'ISERROR') return isErr(v); return f([v, n.args[1] ? evalAst(n.args[1], get) : '']); }
      if (name === 'IF') { const c = evalAst(n.args[0], get); return toBool(c) ? (n.args[1] ? evalAst(n.args[1], get) : true) : (n.args[2] ? evalAst(n.args[2], get) : false); }
      return f(n.args.map(a => evalAst(a, get)));
    }
    default: throw ERR('#FEJL!');
  }
}

/**
 * Evaluate a whole sheet. cells: { A1: { v: raw } }.  Returns Map(ref -> value).
 * Cycles give #CYKLUS!.
 */
export function evaluateSheet(cells) {
  const out = new Map(), visiting = new Set(), asts = new Map();
  const get = (c, r) => valueOf(ref(c, r));
  function valueOf(id) {
    if (out.has(id)) return out.get(id);
    const raw = cells[id]?.v;
    if (raw == null || raw === '') { out.set(id, ''); return ''; }
    if (typeof raw !== 'string' || raw[0] !== '=' || raw.length < 2) { const v = parseInput(raw); out.set(id, v); return v; }
    if (visiting.has(id)) return ERR('#CYKLUS!');
    visiting.add(id);
    let v;
    try {
      let ast = asts.get(id);
      if (!ast) { ast = parse(raw.slice(1)); asts.set(id, ast); }
      v = evalAst(ast, get);
      if (Array.isArray(v)) v = v.length === 1 ? v[0] : ERR('#VÆRDI!');
      if (typeof v === 'number' && !isFinite(v)) v = ERR('#TAL!');
    } catch (e) { v = isErr(e) ? e : ERR('#FEJL!'); }
    visiting.delete(id);
    out.set(id, v);
    return v;
  }
  for (const id of Object.keys(cells)) valueOf(id);
  return out;
}
