/**
 * Regnemaskine – pure functions (unit-tested in tests/apps.test.mjs).
 * A small, safe expression evaluator (no eval), unit conversion, percent/VAT and loans.
 */

// ── expressions: 2+3·4, (1,5+2)^2, √16, 5!, 20%, sin(30), π ──
const FUNCS = {
  sqrt: Math.sqrt, '√': Math.sqrt, ln: Math.log, log: Math.log10, abs: Math.abs, round: Math.round,
  sin: (x, d) => Math.sin(d ? x * Math.PI / 180 : x), cos: (x, d) => Math.cos(d ? x * Math.PI / 180 : x), tan: (x, d) => Math.tan(d ? x * Math.PI / 180 : x),
};
function tokenize(src) {
  const s = String(src).replace(/\s+/g, '').replace(/×|·|\*/g, '*').replace(/÷|:/g, '/').replace(/−|–/g, '-').replace(/pi/gi, 'π');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const num = /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0].replace(',', '.')) }); i += num[0].length; continue; }
    const fn = /^(sqrt|ln|log|abs|round|sin|cos|tan)/i.exec(s.slice(i));
    if (fn) { out.push({ t: 'fn', v: fn[0].toLowerCase() }); i += fn[0].length; continue; }
    if (c === '√') { out.push({ t: 'fn', v: '√' }); i++; continue; }
    if (c === 'π') { out.push({ t: 'num', v: Math.PI }); i++; continue; }
    if (c === 'e' || c === 'E') { out.push({ t: 'num', v: Math.E }); i++; continue; }
    if ('+-*/^()%!'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`Forstår ikke “${c}”`);
  }
  return out;
}
/** Evaluate an expression. Throws an Error with a Danish message if it can't. */
export function evaluate(src, { deg = true } = {}) {
  const tk = tokenize(src);
  if (!tk.length) throw new Error('Skriv et regnestykke');
  let p = 0;
  const peek = () => tk[p], eat = (t) => (tk[p]?.t === t ? tk[p++] : null);
  // implicit multiplication: 2π, 3(4), (2)(3), 2√9
  const startsValue = (x) => x && (x.t === 'num' || x.t === '(' || x.t === 'fn');
  function expr() { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else return v; } }
  function term() {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('/')) { const d = unary(); if (d === 0) throw new Error('Man kan ikke dividere med 0'); v /= d; }
      else if (startsValue(peek())) v *= unary();
      else return v;
    }
  }
  function unary() { if (eat('-')) return -unary(); if (eat('+')) return unary(); return power(); }
  function power() { const b = postfix(); if (eat('^')) return b ** unary(); return b; }
  function postfix() {
    let v = atom();
    for (;;) {
      if (eat('!')) { if (v < 0 || !Number.isInteger(v) || v > 170) throw new Error('Fakultet (!) kun for hele tal fra 0 til 170'); let f = 1; for (let k = 2; k <= v; k++) f *= k; v = f; }
      else if (eat('%')) v /= 100;
      else return v;
    }
  }
  function atom() {
    const t = tk[p++];
    if (!t) throw new Error('Regnestykket slutter for tidligt');
    if (t.t === 'num') return t.v;
    if (t.t === '(') { const v = expr(); if (!eat(')')) throw new Error('Der mangler en slutparentes'); return v; }
    if (t.t === 'fn') {
      const x = peek()?.t === '(' ? (p++, (() => { const v = expr(); if (!eat(')')) throw new Error('Der mangler en slutparentes'); return v; })()) : unary();
      if ((t.v === 'sqrt' || t.v === '√') && x < 0) throw new Error('Kvadratroden af et negativt tal findes ikke');
      if ((t.v === 'ln' || t.v === 'log') && x <= 0) throw new Error('Logaritmen kræver et positivt tal');
      return FUNCS[t.v](x, deg);
    }
    throw new Error('Regnestykket er ikke helt rigtigt');
  }
  const v = expr();
  if (p < tk.length) throw new Error(tk[p].t === ')' ? 'Der er en slutparentes for meget' : 'Regnestykket er ikke helt rigtigt');
  if (!isFinite(v)) throw new Error('Resultatet er for stort');
  return Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12));
}
export function fmt(n, max = 10) {
  if (!isFinite(n)) return '–';
  if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-9)) return n.toExponential(6).replace('.', ',');
  return n.toLocaleString('da-DK', { maximumFractionDigits: max });
}

// ── units ──
export const UNIT_GROUPS = {
  length: { label: 'Længde', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, tomme: 0.0254, fod: 0.3048, yard: 0.9144, mil: 1609.344, sømil: 1852 } },
  weight: { label: 'Vægt', units: { mg: 1e-6, g: 0.001, kg: 1, ton: 1000, pund: 0.45359237, ounce: 0.028349523125 } },
  volume: { label: 'Rumfang', units: { ml: 0.001, cl: 0.01, dl: 0.1, l: 1, 'm³': 1000, tsk: 0.005, spsk: 0.015, kop: 0.25, gallon: 3.785411784 } },
  area: { label: 'Areal', units: { 'cm²': 1e-4, 'm²': 1, ar: 100, hektar: 1e4, 'km²': 1e6, tønde: 5516 } },
  speed: { label: 'Fart', units: { 'm/s': 1, 'km/t': 1 / 3.6, mph: 0.44704, knob: 0.514444 } },
  time: { label: 'Tid', units: { sekund: 1, minut: 60, time: 3600, døgn: 86400, uge: 604800, år: 31557600 } },
  temp: { label: 'Temperatur', units: { '°C': 1, '°F': 1, K: 1 } },
  energy: { label: 'Energi', units: { J: 1, kJ: 1000, kcal: 4184, kWh: 3.6e6, Wh: 3600 } },
};
export function convertUnit(value, group, from, to) {
  if (group === 'temp') {
    const c = from === '°C' ? value : from === '°F' ? (value - 32) * 5 / 9 : value - 273.15;
    return to === '°C' ? c : to === '°F' ? c * 9 / 5 + 32 : c + 273.15;
  }
  const u = UNIT_GROUPS[group].units;
  return (value * u[from]) / u[to];
}

// ── percent and VAT ──
export const VAT = 25;
/** price incl. or excl. VAT → { net, vat, gross } */
export function vat(amount, rate = VAT, includes = true) {
  const net = includes ? amount / (1 + rate / 100) : amount;
  return { net, vat: net * rate / 100, gross: net * (1 + rate / 100) };
}
export const percentOf = (pct, of) => (of * pct) / 100;
export const whatPercent = (part, whole) => (whole ? (part / whole) * 100 : NaN);
export const change = (from, to) => (from ? ((to - from) / Math.abs(from)) * 100 : NaN);
export const discount = (price, pct) => ({ save: price * pct / 100, pay: price * (1 - pct / 100) });

// ── loans (annuity: the same payment every month) ──
export function loan(principal, yearlyPct, years, perYear = 12) {
  const n = Math.round(years * perYear), r = yearlyPct / 100 / perYear;
  if (!(principal > 0) || !(n > 0)) return null;
  const pay = r ? principal * r / (1 - (1 + r) ** -n) : principal / n;
  const rows = [];
  let left = principal;
  for (let y = 1; y <= Math.ceil(n / perYear); y++) {
    let interest = 0, paid = 0;
    for (let k = 0; k < perYear && (y - 1) * perYear + k < n; k++) { const i = left * r; interest += i; paid += pay - i; left -= pay - i; }
    rows.push({ year: y, interest, paid, left: Math.max(0, left) });
  }
  return { pay, total: pay * n, interest: pay * n - principal, rows };
}
/** saving up: how much you end with after `years` when you put `monthly` aside at `yearlyPct` interest */
export function savings(start, monthly, yearlyPct, years) {
  const r = yearlyPct / 100 / 12;
  let v = start;
  for (let m = 0; m < years * 12; m++) v = v * (1 + r) + monthly;
  const paidIn = start + monthly * years * 12;
  return { end: v, paidIn, interest: v - paidIn };
}
