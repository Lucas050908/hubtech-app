/** Værktøjskasse — electronics calculators for the workshop (pure client-side maths). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { subnet, parseBase, toBases, transferSeconds, fmtDuration, voltageDrop, batteryHours } from '../features/ittools.js';

// ── SI helpers ─────────────────────────────────────────────────────────
const PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
/** "4k7", "4,7k", "2.2M", "470", "100n" → number (NaN if invalid) */
export function parseSI(str) {
  if (str == null) return NaN;
  let s = String(str).trim().replace(/\s/g, '').replace(',', '.').replace(/(ohm|Ω|Ω|v|a|w|f|hz)$/i, '');
  if (!s) return NaN;
  const mid = s.match(/^(\d+)([pnuµmkKMG])(\d+)$/);            // 4k7 style
  if (mid) return Number(`${mid[1]}.${mid[3]}`) * PREFIX[mid[2]];
  const m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([pnuµmkKMG]?)$/);
  return m ? Number(m[1]) * PREFIX[m[2]] : NaN;
}
export function fmtSI(v, unit = '', digits = 3) {
  if (!isFinite(v)) return '—';
  if (v === 0) return `0 ${unit}`;
  const steps = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const a = Math.abs(v);
  const [f, p] = steps.find(([f]) => a >= f * 0.9995) || steps[steps.length - 1];
  const n = Number((v / f).toPrecision(digits));
  return `${n.toLocaleString('da-DK', { maximumFractionDigits: 3 })} ${p}${unit}`;
}
const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
function nearestE12Above(r) {
  if (!(r > 0)) return NaN;
  const dec = Math.pow(10, Math.floor(Math.log10(r)));
  for (const k of [...E12, 10]) if (k * dec >= r * 0.9999) return Number((k * dec).toPrecision(3));
  return NaN;
}

// ── small UI helpers ───────────────────────────────────────────────────
function field(label, unit, attrs = {}) {
  const inp = h('input', { class: 'input', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', ...attrs, 'aria-label': `${label}${unit ? ` (${unit})` : ''}` });
  if (unit.length > 2) inp.style.paddingRight = `${unit.length * 8 + 22}px`;
  return { inp, el: h('label', { class: 'tk-field' }, h('span', { class: 'tk-label' }, label), h('div', { class: 'tk-input' }, inp, unit ? h('span', { class: 'tk-unit' }, unit) : null)) };
}
const out = () => h('div', { class: 'tk-out', 'aria-live': 'polite' });
const res = (label, value, strong) => h('div', { class: ['tk-res', strong && 'is-main'] }, h('span', null, label), h('b', null, value));
function tool(id, title, ic, desc, body) {
  return h('section', { class: 'glass panel tk-tool', id: `tk-${id}` },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, h('span', { class: 'row-icon solid tk-ic' }, icon(ic)), title)),
    h('p', { class: 'faint tk-desc' }, desc), body);
}
let logged = new Set();
const used = (name) => { if (!logged.has(name)) { logged.add(name); logActivity('toolkit', 'calc', name, 'Beregning i Værktøjskassen'); } };

// ── tools ──────────────────────────────────────────────────────────────
function ohm() {
  const U = field('Spænding U', 'V', { placeholder: 'fx 12' }), I = field('Strøm I', 'A', { placeholder: 'fx 20m' }), R = field('Modstand R', 'Ω', { placeholder: 'fx 4k7' }), P = field('Effekt P', 'W', { placeholder: '' });
  const o = out();
  const calc = () => {
    const vals = { U: parseSI(U.inp.value), I: parseSI(I.inp.value), R: parseSI(R.inp.value), P: parseSI(P.inp.value) };
    const known = Object.entries(vals).filter(([, x]) => isFinite(x));
    clear(o);
    if (known.length < 2) { o.appendChild(h('p', { class: 'faint' }, 'Udfyld to af felterne – resten beregnes.')); return; }
    let { U: u, I: i, R: r, P: p } = vals; const has = (k) => isFinite(vals[k]);
    if (has('U') && has('I')) { r = u / i; p = u * i; }
    else if (has('U') && has('R')) { i = u / r; p = u * i; }
    else if (has('I') && has('R')) { u = i * r; p = u * i; }
    else if (has('P') && has('U')) { i = p / u; r = u / i; }
    else if (has('P') && has('I')) { u = p / i; r = u / i; }
    else if (has('P') && has('R')) { u = Math.sqrt(p * r); i = u / r; }
    o.append(res('Spænding', fmtSI(u, 'V')), res('Strøm', fmtSI(i, 'A')), res('Modstand', fmtSI(r, 'Ω'), true), res('Effekt', fmtSI(p, 'W')),
      known.length > 2 ? h('p', { class: 'faint', style: { gridColumn: '1/-1' } }, 'Bemærk: mere end to felter er udfyldt – de to første bruges.') : null);
    used('Ohms lov');
  };
  [U, I, R, P].forEach(f => f.inp.addEventListener('input', calc));
  const clr = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { [U, I, R, P].forEach(f => { f.inp.value = ''; }); calc(); } }, icon('x'), 'Ryd');
  calc();
  return tool('ohm', 'Ohms lov', 'circuit', 'U = R · I og P = U · I. Skriv værdier med præfiks: 4k7, 20m, 2,2M.',
    h('div', null, h('div', { class: 'tk-grid' }, U.el, I.el, R.el, P.el), o, h('div', { class: 'tk-foot' }, clr)));
}

const BANDS = [
  ['Sort', '#111111', 0, 1, null], ['Brun', '#7a4420', 1, 10, 1], ['Rød', '#d32f2f', 2, 100, 2], ['Orange', '#f57c00', 3, 1e3, null], ['Gul', '#fbc02d', 4, 1e4, null],
  ['Grøn', '#2e7d32', 5, 1e5, 0.5], ['Blå', '#1565c0', 6, 1e6, 0.25], ['Violet', '#7b1fa2', 7, 1e7, 0.1], ['Grå', '#8a8a8a', 8, 1e8, 0.05], ['Hvid', '#f5f5f5', 9, 1e9, null],
  ['Guld', '#c9a227', null, 0.1, 5], ['Sølv', '#c0c0c0', null, 0.01, 10],
];
function colorCode() {
  let five = false;
  const digitIdx = BANDS.map((b, i) => [b, i]).filter(([b]) => b[2] !== null).map(([, i]) => i);
  const mulIdx = BANDS.map((_, i) => i);
  const tolIdx = BANDS.map((b, i) => [b, i]).filter(([b]) => b[4] !== null).map(([, i]) => i);
  const mk = (idxs, def, aria) => { const s = h('select', { class: 'select tk-band', 'aria-label': aria }, idxs.map(i => h('option', { value: String(i), selected: i === def }, BANDS[i][0]))); return s; };
  const b1 = mk(digitIdx, 4, '1. ring'), b2 = mk(digitIdx, 7, '2. ring'), b3 = mk(digitIdx, 0, '3. ring (kun 5 ringe)'), bm = mk(mulIdx, 2, 'Multiplikator'), bt = mk(tolIdx, 10, 'Tolerance');
  const picture = h('div', { class: 'tk-resistor', 'aria-hidden': 'true' });
  const o = out();
  const b3wrap = h('div', { class: 'tk-field', hidden: true }, h('span', { class: 'tk-label' }, '3. ciffer'), b3);
  const calc = () => {
    const d = [b1, b2, ...(five ? [b3] : [])].map(s => BANDS[Number(s.value)][2]);
    const val = Number(d.join('')) * BANDS[Number(bm.value)][3];
    const tol = BANDS[Number(bt.value)][4];
    clear(picture).append(h('span', { class: 'tk-lead' }), h('div', { class: 'tk-body' },
      [b1, b2, ...(five ? [b3] : []), bm].map(s => h('i', { style: { background: BANDS[Number(s.value)][1] } })),
      h('i', { class: 'tk-tol', style: { background: BANDS[Number(bt.value)][1] } })), h('span', { class: 'tk-lead' }));
    clear(o).append(res('Modstand', fmtSI(val, 'Ω'), true), res('Tolerance', `± ${tol} %`), res('Område', `${fmtSI(val * (1 - tol / 100), 'Ω')} – ${fmtSI(val * (1 + tol / 100), 'Ω')}`));
    used('Farvekode');
  };
  [b1, b2, b3, bm, bt].forEach(s => s.addEventListener('change', calc));
  const count = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Antal ringe' },
    ...[4, 5].map(n => { const b = h('button', { type: 'button', 'aria-pressed': String(n === 4) }, `${n} ringe`); b.addEventListener('click', () => { five = n === 5; b3wrap.hidden = !five; count.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); calc(); }); return b; }));
  calc();
  return tool('color', 'Modstandens farvekode', 'tag', 'Vælg ringene fra venstre. Guld/sølv-ringen er tolerancen og sidder til højre.',
    h('div', null, count, picture,
      h('div', { class: 'tk-grid tk-grid-3' },
        h('div', { class: 'tk-field' }, h('span', { class: 'tk-label' }, '1. ciffer'), b1), h('div', { class: 'tk-field' }, h('span', { class: 'tk-label' }, '2. ciffer'), b2), b3wrap,
        h('div', { class: 'tk-field' }, h('span', { class: 'tk-label' }, 'Multiplikator'), bm), h('div', { class: 'tk-field' }, h('span', { class: 'tk-label' }, 'Tolerance'), bt)),
      o));
}

function divider() {
  const Vin = field('Indgang Vin', 'V', { value: '12' }), R1 = field('R1 (top)', 'Ω', { value: '10k' }), R2 = field('R2 (bund)', 'Ω', { value: '4k7' });
  const o = out();
  const calc = () => {
    const vin = parseSI(Vin.inp.value), r1 = parseSI(R1.inp.value), r2 = parseSI(R2.inp.value);
    clear(o);
    if (![vin, r1, r2].every(isFinite) || r1 + r2 <= 0) { o.appendChild(h('p', { class: 'faint' }, 'Udfyld Vin, R1 og R2.')); return; }
    const vout = vin * r2 / (r1 + r2), i = vin / (r1 + r2);
    o.append(res('Udgang Vout', fmtSI(vout, 'V'), true), res('Strøm', fmtSI(i, 'A')), res('Effekt R1 / R2', `${fmtSI(i * i * r1, 'W')} / ${fmtSI(i * i * r2, 'W')}`), res('Forhold', `${(r2 / (r1 + r2) * 100).toFixed(1).replace('.', ',')} %`));
    used('Spændingsdeler');
  };
  [Vin, R1, R2].forEach(f => f.inp.addEventListener('input', calc));
  calc();
  return tool('div', 'Spændingsdeler', 'layers', 'Vout = Vin · R2 / (R1 + R2) – uden belastning på udgangen.',
    h('div', null, h('div', { class: 'tk-grid tk-grid-3' }, Vin.el, R1.el, R2.el), o));
}

function led() {
  const Vs = field('Forsyning', 'V', { value: '5' }), Vf = field('LED-spænding Vf', 'V', { value: '2' }), If = field('LED-strøm', 'A', { value: '20m' });
  const presets = h('div', { class: 'tk-presets' }, [['Rød', 2.0], ['Gul', 2.1], ['Grøn', 2.2], ['Blå', 3.2], ['Hvid', 3.2]].map(([n, v]) =>
    h('button', { class: 'chip', type: 'button', onclick: () => { Vf.inp.value = String(v).replace('.', ','); calc(); } }, n, ' ', h('span', { class: 'faint' }, `${String(v).replace('.', ',')} V`))));
  const o = out();
  const calc = () => {
    const vs = parseSI(Vs.inp.value), vf = parseSI(Vf.inp.value), i = parseSI(If.inp.value);
    clear(o);
    if (![vs, vf, i].every(isFinite) || i <= 0) { o.appendChild(h('p', { class: 'faint' }, 'Udfyld forsyning, Vf og strøm.')); return; }
    if (vs <= vf) { o.appendChild(h('p', { class: 'tk-warn' }, icon('alert'), 'Forsyningen skal være højere end LED-spændingen.')); return; }
    const r = (vs - vf) / i, e = nearestE12Above(r), p = i * i * e, ireal = (vs - vf) / e;
    const watt = p < 0.125 * 0.6 ? '1/8 W' : p < 0.25 * 0.6 ? '1/4 W' : p < 0.5 * 0.6 ? '1/2 W' : p < 0.6 ? '1 W' : '2 W eller mere';
    o.append(res('Beregnet R', fmtSI(r, 'Ω')), res('Nærmeste E12 (over)', fmtSI(e, 'Ω'), true), res('Strøm med E12', fmtSI(ireal, 'A')), res('Effekt i modstand', `${fmtSI(p, 'W')} → brug ${watt}`));
    used('LED-formodstand');
  };
  [Vs, Vf, If].forEach(f => f.inp.addEventListener('input', calc));
  calc();
  return tool('led', 'Formodstand til LED', 'sparkles', 'R = (Vforsyning − Vf) / I. Vælg altid den nærmeste standardværdi over.',
    h('div', null, presets, h('div', { class: 'tk-grid tk-grid-3' }, Vs.el, Vf.el, If.el), o));
}

function seriesParallel() {
  const list = field('Modstande (adskilt af mellemrum eller semikolon)', '', { value: '220 1k 4k7' });
  const o = out();
  const calc = () => {
    const parts = list.inp.value.split(/[\s;]+/).filter(Boolean);
    const rs = parts.map(parseSI);
    clear(o);
    const bad = parts.filter((p, i) => !(rs[i] > 0));
    if (!parts.length) { o.appendChild(h('p', { class: 'faint' }, 'Skriv mindst én modstand.')); return; }
    if (bad.length) { o.appendChild(h('p', { class: 'tk-warn' }, icon('alert'), `Forstår ikke: ${bad.join(', ')}`)); return; }
    const ser = rs.reduce((a, r) => a + r, 0), par = 1 / rs.reduce((a, r) => a + 1 / r, 0);
    o.append(res('I serie', fmtSI(ser, 'Ω'), true), res('Parallelt', fmtSI(par, 'Ω'), true), res('Antal', String(rs.length)));
    used('Serie/parallel');
  };
  list.inp.addEventListener('input', calc);
  calc();
  return tool('sp', 'Serie og parallel', 'branch', 'Serie: R1 + R2 + … · Parallelt: 1 / (1/R1 + 1/R2 + …).', h('div', null, list.el, o));
}

function capCode() {
  const code = field('Kode på kondensatoren', '', { value: '104', placeholder: 'fx 104, 473, 4n7, 220' });
  const o = out();
  const calc = () => {
    const s = code.inp.value.trim().replace(',', '.');
    clear(o);
    let pf = NaN;
    if (/^\d{3}$/.test(s)) pf = Number(s.slice(0, 2)) * Math.pow(10, Number(s[2]));
    else if (/^\d{1,2}$/.test(s)) pf = Number(s);
    else { const v = parseSI(s); if (isFinite(v)) pf = /[pnuµm]/.test(s) ? v * 1e12 : v; }
    if (!(pf > 0)) { o.appendChild(h('p', { class: 'faint' }, 'Skriv en 3-cifret kode (fx 104) eller en værdi (fx 4n7).')); return; }
    const f = pf * 1e-12;
    o.append(res('Kapacitet', fmtSI(f, 'F'), true), res('pF', `${Number(pf.toPrecision(4)).toLocaleString('da-DK')} pF`), res('nF', `${Number((pf / 1e3).toPrecision(4)).toLocaleString('da-DK')} nF`), res('µF', `${Number((pf / 1e6).toPrecision(4)).toLocaleString('da-DK')} µF`));
    used('Kondensatorkode');
  };
  code.inp.addEventListener('input', calc);
  calc();
  return tool('cap', 'Kondensatorkode', 'chip', 'De to første cifre er værdien, det tredje er antal nuller – i pF. 104 = 10 · 10⁴ pF = 100 nF.', h('div', null, code.el, o));
}

// ── IT & network tools ─────────────────────────────────────────────────
function subnetTool() {
  const ip = field('IP-adresse og prefiks', '', { value: '192.168.1.10/24', placeholder: '192.168.1.10/24 eller 10.0.0.5 255.255.255.0', inputmode: 'text' });
  const o = out();
  const calc = () => {
    const r = subnet(ip.inp.value);
    clear(o);
    if (r.error) { o.appendChild(h('p', { class: 'faint' }, r.error)); return; }
    o.append(res('Netværk', `${r.network}/${r.prefix}`, true), res('Brugbare værter', r.hosts.toLocaleString('da-DK'), true),
      res('Første vært', r.first), res('Sidste vært', r.last), res('Broadcast', r.broadcast), res('Subnetmaske', r.mask),
      res('Wildcard', r.wildcard), res('Type', r.kind), h('div', { class: 'tk-res tk-wide' }, h('span', null, 'Masken i binær'), h('b', null, r.binary)));
    used('Subnetberegner');
  };
  ip.inp.addEventListener('input', calc);
  calc();
  return tool('subnet', 'Subnetberegner', 'globe', 'Netværk, broadcast og værtsområde for en IPv4-adresse. Prefiks (/24) eller maske (255.255.255.0) – begge virker.', h('div', null, ip.el, o));
}

function basesTool() {
  const defs = [['dec', 'Decimal', 10], ['hex', 'Hexadecimal', 16], ['bin', 'Binær', 2], ['oct', 'Oktal', 8]];
  const fs = Object.fromEntries(defs.map(([k, l]) => [k, field(l, '', { inputmode: 'text', placeholder: k === 'hex' ? 'fx FF' : '' })]));
  const asc = h('div', { class: 'tk-res' }, h('span', null, 'Tegn (ASCII)'), h('b', null, '–'));
  const msg = h('p', { class: 'faint tk-msg', 'aria-live': 'polite' });
  const set = (from) => {
    const [, , base] = defs.find(d => d[0] === from);
    const v = parseBase(fs[from].inp.value, base);
    msg.textContent = '';
    for (const [k] of defs) fs[k].inp.removeAttribute('aria-invalid');
    if (v === null && fs[from].inp.value.trim()) fs[from].inp.setAttribute('aria-invalid', 'true');
    if (v === null) { if (fs[from].inp.value.trim()) msg.textContent = `Ugyldigt tal i ${defs.find(d => d[0] === from)[1].toLowerCase()}.`; return; }
    const b = toBases(v);
    for (const [k] of defs) if (k !== from) fs[k].inp.value = b[k];
    asc.lastChild.textContent = b.ascii ? `“${b.ascii}”` : '–';
    used('Talsystemer');
  };
  for (const [k] of defs) fs[k].inp.addEventListener('input', () => set(k));
  fs.dec.inp.value = '255'; set('dec');
  return tool('bases', 'Talsystemer', 'code', 'Skriv i et hvilket som helst felt – de andre opdateres. Forstår også 0x…, 0b… og meget store tal.',
    h('div', null, h('div', { class: 'tk-grid' }, defs.map(([k]) => fs[k].el)), h('div', { class: 'tk-out' }, asc), msg));
}

function transferTool() {
  const size = field('Datamængde', 'GB', { value: '50', placeholder: 'fx 50 eller 500m' });
  const speed = field('Hastighed', 'Mbit/s', { value: '100', placeholder: 'fx 100' });
  const o = out();
  const calc = () => {
    const gb = parseSI(size.inp.value), mb = parseSI(speed.inp.value);
    clear(o);
    if (!(gb > 0 && mb > 0)) { o.appendChild(h('p', { class: 'faint' }, 'Udfyld datamængde og hastighed.')); return; }
    const sec = transferSeconds(gb * 1e9, mb);
    o.append(res('Tid (teoretisk)', fmtDuration(sec), true), res('Tid med ~10 % overhead', fmtDuration(sec * 1.1)), res('Hastighed', `${(mb / 8).toLocaleString('da-DK', { maximumFractionDigits: 1 })} MB/s`), res('Pr. time', `${(mb / 8 * 3600 / 1000).toLocaleString('da-DK', { maximumFractionDigits: 1 })} GB`));
    used('Overførselstid');
  };
  [size, speed].forEach(f => f.inp.addEventListener('input', calc));
  calc();
  return tool('transfer', 'Overførselstid', 'download', 'Hvor lang tid tager en backup eller download? Husk: 1 byte = 8 bit, så 100 Mbit/s ≈ 12,5 MB/s.', h('div', null, h('div', { class: 'tk-grid' }, size.el, speed.el), o));
}

function dropTool() {
  const len = field('Kabellængde (enkelt vej)', 'm', { value: '25' });
  const cur = field('Strøm', 'A', { value: '10' });
  const area = h('select', { class: 'select', 'aria-label': 'Tværsnit' }, ['0.75', '1', '1.5', '2.5', '4', '6', '10', '16'].map(a => h('option', { value: a, selected: a === '1.5' }, `${a.replace('.', ',')} mm²`)));
  const sys = h('select', { class: 'select', 'aria-label': 'System' }, h('option', { value: '230' }, '230 V, 1-faset'), h('option', { value: '400' }, '400 V, 3-faset'), h('option', { value: '12' }, '12 V DC'), h('option', { value: '24' }, '24 V DC'), h('option', { value: '5' }, '5 V DC'));
  const mat = h('select', { class: 'select', 'aria-label': 'Leder' }, h('option', { value: '0.0175' }, 'Kobber'), h('option', { value: '0.028' }, 'Aluminium'));
  const lab = (t, el) => h('label', { class: 'tk-field' }, h('span', { class: 'tk-label' }, t), el);
  const o = out();
  const calc = () => {
    const L = parseSI(len.inp.value), I = parseSI(cur.inp.value), A = Number(area.value), U = Number(sys.value);
    clear(o);
    if (!(L > 0 && I > 0)) { o.appendChild(h('p', { class: 'faint' }, 'Udfyld længde og strøm.')); return; }
    const r = voltageDrop({ length: L, current: I, area: A, voltage: U, rho: Number(mat.value), threePhase: U === 400 });
    const ok = r.pct <= (U <= 24 ? 3 : 4);
    o.append(res('Spændingsfald', `${r.du.toLocaleString('da-DK', { maximumFractionDigits: 2 })} V`, true), res('I procent', `${r.pct.toLocaleString('da-DK', { maximumFractionDigits: 2 })} %`, true),
      res('Effekttab i kablet', fmtSI(r.loss, 'W')), res('Spænding ved forbrugeren', `${(U - r.du).toLocaleString('da-DK', { maximumFractionDigits: 2 })} V`),
      h('p', { class: ['tk-verdict', ok ? 'is-ok' : 'is-bad'] }, ok ? 'Inden for den typiske grænse (4 % – 3 % ved lavvolt).' : 'Over den typiske grænse – vælg et større tværsnit eller et kortere kabel.'));
    used('Spændingsfald');
  };
  [len, cur].forEach(f => f.inp.addEventListener('input', calc));
  [area, sys, mat].forEach(e => e.addEventListener('change', calc));
  calc();
  return tool('drop', 'Spændingsfald i kabel', 'plug', 'ΔU = 2 · L · I · ρ / A (1-faset/DC) og √3 · L · I · ρ / A (3-faset). Vejledende – følg altid gældende installationsregler.',
    h('div', null, h('div', { class: 'tk-grid' }, len.el, cur.el, lab('Tværsnit', area), lab('System', sys), lab('Leder', mat)), o));
}

function batteryTool() {
  const cap = field('Kapacitet', 'mAh', { value: '2000' });
  const load = field('Forbrug', 'mA', { value: '85' });
  const o = out();
  const calc = () => {
    const c = parseSI(cap.inp.value), l = parseSI(load.inp.value);
    clear(o);
    if (!(c > 0 && l > 0)) { o.appendChild(h('p', { class: 'faint' }, 'Udfyld kapacitet og forbrug.')); return; }
    const hrs = batteryHours(c, l);
    o.append(res('Driftstid (realistisk, 80 %)', fmtDuration(hrs * 3600), true), res('Teoretisk', fmtDuration(c / l * 3600)));
    used('Batteritid');
  };
  [cap, load].forEach(f => f.inp.addEventListener('input', calc));
  calc();
  return tool('battery', 'Batteritid', 'power', 'Hvor længe holder batteriet? Regner med 80 % af kapaciteten – batterier leverer sjældent det hele.', h('div', null, h('div', { class: 'tk-grid' }, cap.el, load.el), o));
}

export default {
  title: 'Værktøjskasse',
  destroy() { logged = new Set(); },
  render() {
    const app = appById('toolkit');
    const tools = [ohm(), colorCode(), led(), divider(), seriesParallel(), capCode(), batteryTool(), dropTool()];
    const itTools = [subnetTool(), basesTool(), transferTool()];
    const jump = (id, label) => h('a', { class: 'btn app-hero-ghost', href: `#/learn/toolkit`, onclick: (e) => { e.preventDefault(); document.getElementById(`tk-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, label);
    return h('div', { class: 'page toolkit-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Læring · værksted', title: 'Værktøjskasse',
        lead: 'Hurtige beregnere til elektronik, el og netværk – samme formler som i CircuitPilot og servicetekniker-kurset. Skriv værdier med præfiks som 4k7, 20m eller 2,2M.',
        actions: [jump('ohm', 'Ohms lov'), jump('color', 'Farvekode'), jump('subnet', 'Subnet'), jump('bases', 'Hex/binær')],
        stats: [
          { icon: 'calculator', label: 'Beregnere', value: String(tools.length + itTools.length) },
          { icon: 'layers', label: 'Standardværdier', value: 'E12' },
          { icon: 'tag', label: 'Præfikser', value: 'p n µ m k M' },
          { icon: 'graduation', label: 'Passer til', value: 'CircuitPilot' }],
      }),
      h('h2', { class: 'tk-group on-world' }, icon('circuit'), 'Elektronik og el'),
      h('div', { class: 'tk-layout' }, tools),
      h('h2', { class: 'tk-group on-world' }, icon('globe'), 'IT og netværk'),
      h('div', { class: 'tk-layout' }, itTools));
  },
};
