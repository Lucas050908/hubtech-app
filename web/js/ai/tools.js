/**
 * Gnist's calculator: small models are bad at sums, dates and units, so HUBTECH works them out exactly and hands Gnist
 * the results with the question. Pure (tested in tests/apps.test.mjs) – no eval, the page's CSP forbids it anyway.
 */
const fmt = (n) => (Number.isFinite(n) ? Number(n.toFixed(6)).toLocaleString('da-DK', { maximumFractionDigits: 4 }) : String(n));

/** A Danish or English number: "2.400" and "2 400" are 2400, "2,5" and "2.5" are 2.5. */
export function num(s) {
  let t = String(s).trim().replace(/\s(?=\d{3}\b)/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  return Number(t);
}

// ── arithmetic: + - * / ^ and parentheses ──
function evaluate(src) {
  const toks = src.replace(/[x×·]/g, '*').replace(/÷/g, '/').match(/\d[\d.,]*|[-+*/^()]/g);
  if (!toks) return NaN;
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  function atom() {
    const t = next();
    if (t === '(') { const v = expr(); if (next() !== ')') throw new Error('('); return v; }
    if (t === '-') return -atom();
    if (t === '+') return atom();
    if (t == null || !/\d/.test(t)) throw new Error('tal');
    return num(t);
  }
  function power() { const b = atom(); if (peek() === '^') { next(); return b ** power(); } return b; }
  function term() { let v = power(); while (peek() === '*' || peek() === '/') { const op = next(), r = power(); v = op === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = next(), r = term(); v = op === '+' ? v + r : v - r; } return v; }
  const v = expr();
  if (i !== toks.length) throw new Error('rest');
  return v;
}
const N = String.raw`\d[\d.,]*(?:\s\d{3})*`;

function mathFacts(q, out) {
  // percent of: "15 % af 2400", "15 procent af 2.400"
  for (const m of q.matchAll(new RegExp(`(${N})\\s*(?:%|procent)\\s+af\\s+(${N})`, 'gi'))) {
    const p = num(m[1]), b = num(m[2]);
    out.push(`${fmt(p)} % af ${fmt(b)} = ${fmt(p / 100 * b)}`);
  }
  // Danish VAT (25 %): "1000 kr med moms", "1250 kr inkl. moms", "800 uden moms"
  const vat = q.match(new RegExp(`(${N})\\s*(?:kr\\.?|kroner)?\\s*(med|plus|\\+|inkl\\.?|inklusive|uden|ekskl\\.?|eksklusive|minus)\\s*moms`, 'i'));
  if (vat) {
    const v = num(vat[1]), w = vat[2].toLowerCase();
    if (/^(med|plus|\+)$/.test(w)) out.push(`${fmt(v)} kr. + 25 % moms = ${fmt(v * 1.25)} kr. (momsen er ${fmt(v * 0.25)} kr.)`);
    else if (/^inkl|^inklusive/.test(w)) out.push(`${fmt(v)} kr. inkl. moms = ${fmt(v / 1.25)} kr. uden moms (momsen er ${fmt(v - v / 1.25)} kr.)`);
    else out.push(`${fmt(v)} kr. uden moms = ${fmt(v * 1.25)} kr. med 25 % moms (momsen er ${fmt(v * 0.25)} kr.)`);
  }
  // square root
  const sq = q.match(new RegExp(`kvadratrod(?:en)?\\s+af\\s+(${N})`, 'i'));
  if (sq) out.push(`Kvadratroden af ${fmt(num(sq[1]))} = ${fmt(Math.sqrt(num(sq[1])))}`);
  // plain arithmetic: at least two numbers with an operator between them
  for (const m of q.matchAll(/[(\d][\d\s.,+\-*/x×·÷^()]*[\d)]/g)) {
    const e = m[0].trim();
    if (!/\d\s*[-+*/x×·÷^]\s*[\d(]/.test(e) || /^\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?$/.test(e)) continue;   // not a date like 24-12
    try { const v = evaluate(e); if (Number.isFinite(v)) out.push(`${e.replace(/\s+/g, ' ')} = ${fmt(v)}`); } catch { /* not a sum */ }
  }
}

// ── dates ──
const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dkDate = (d) => `${DAYS[d.getDay()]} d. ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
function findDate(q, now) {
  const lq = q.toLowerCase();
  if (/\bjuleaften|\bjul\b/.test(lq)) return { d: new Date(now.getFullYear(), 11, 24), name: 'juleaften' };
  if (/nytårsaften/.test(lq)) return { d: new Date(now.getFullYear(), 11, 31), name: 'nytårsaften' };
  if (/\bnytår\b/.test(lq)) return { d: new Date(now.getFullYear() + 1, 0, 1), name: 'nytårsdag' };
  if (/sankthans/.test(lq)) return { d: new Date(now.getFullYear(), 5, 23), name: 'sankthansaften' };
  const m = lq.match(new RegExp(`(\\d{1,2})\\.?\\s*(${MONTHS.join('|')})(?:\\s+(\\d{4}))?`));
  if (m) return { d: new Date(m[3] ? Number(m[3]) : now.getFullYear(), MONTHS.indexOf(m[2]), Number(m[1])), name: null, year: !!m[3] };
  return null;
}
function dateFacts(q, now, out) {
  const lq = q.toLowerCase();
  if (/hvilken uge|ugenummer|uge nummer|hvad uge/.test(lq) && !findDate(q, now)) out.push(`I dag er ${dkDate(now)}, uge ${isoWeek(now)}.`);
  const f = findDate(q, now);
  if (!f) return;
  let d = f.d;
  const today = day0(now);
  if (/hvor (mange|længe)|dage til|indtil|til jul|om hvor/.test(lq)) {
    if (d < today && !f.year) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    const n = Math.round((day0(d) - today) / 864e5);
    out.push(n === 0 ? `${f.name ? f.name[0].toUpperCase() + f.name.slice(1) : 'Den dag'} er i dag (${dkDate(d)}).` : n > 0 ? `Der er ${n} dage til ${f.name || dkDate(d)} (${dkDate(d)}, uge ${isoWeek(d)}).` : `${dkDate(d)} var for ${-n} dage siden.`);
  } else if (/ugedag|hvilken dag|hvad dag|uge/.test(lq)) out.push(`${f.name ? f.name[0].toUpperCase() + f.name.slice(1) + ' er ' : ''}${dkDate(d)} (uge ${isoWeek(d)}).`);
}

// ── units ──
const UNITS = {
  km: ['l', 1000], m: ['l', 1], meter: ['l', 1], cm: ['l', 0.01], mm: ['l', 0.001], tommer: ['l', 0.0254], tomme: ['l', 0.0254], inch: ['l', 0.0254], '"': ['l', 0.0254], fod: ['l', 0.3048], feet: ['l', 0.3048], ft: ['l', 0.3048], miles: ['l', 1609.344], mile: ['l', 1609.344],
  kg: ['w', 1], g: ['w', 0.001], gram: ['w', 0.001], pund: ['w', 0.45359237], lb: ['w', 0.45359237], lbs: ['w', 0.45359237], oz: ['w', 0.0283495], ounce: ['w', 0.0283495],
  l: ['v', 1], liter: ['v', 1], dl: ['v', 0.1], cl: ['v', 0.01], ml: ['v', 0.001], gallon: ['v', 3.78541],
  gb: ['d', 1e9], mb: ['d', 1e6], kb: ['d', 1e3], tb: ['d', 1e12],
  kmt: ['s', 1 / 3.6], 'km/t': ['s', 1 / 3.6], 'km/h': ['s', 1 / 3.6], 'm/s': ['s', 1], mph: ['s', 0.44704],
};
const UNIT_RE = Object.keys(UNITS).sort((a, b) => b.length - a.length).map(u => u.replace(/[/".]/g, '\\$&')).join('|');
function unitFacts(q, out) {
  const lq = q.toLowerCase();
  const t = lq.match(new RegExp(`(-?${N})\\s*(?:°\\s*)?(c|celsius|f|fahrenheit)\\b\\s*(?:til|i|=|in|to)\\s*(?:°\\s*)?(c|celsius|f|fahrenheit)\\b`));
  if (t) {
    const v = num(t[1]), from = t[2][0], to = t[3][0];
    if (from !== to) out.push(from === 'c' ? `${fmt(v)} °C = ${fmt(v * 9 / 5 + 32)} °F` : `${fmt(v)} °F = ${fmt((v - 32) * 5 / 9)} °C`);
  }
  for (const m of lq.matchAll(new RegExp(`(${N})\\s*(${UNIT_RE})(?![a-zæøå])\\s*(?:til|i|=|in|to|er hvor mange)\\s*(${UNIT_RE})(?![a-zæøå])`, 'g'))) {
    const [, v0, a, b] = m, A = UNITS[a], B = UNITS[b];
    if (A && B && A[0] === B[0] && a !== b) out.push(`${fmt(num(v0))} ${a} = ${fmt(num(v0) * A[1] / B[1])} ${b}`);
  }
  // "hvor mange cm er 12 tommer"
  for (const m of lq.matchAll(new RegExp(`hvor mange\\s+(${UNIT_RE})(?![a-zæøå])\\s+(?:er|på|svarer)\\s+(?:til\\s+)?(${N})\\s*(${UNIT_RE})(?![a-zæøå])`, 'g'))) {
    const [, b2, v0, a2] = m, A = UNITS[a2], B = UNITS[b2];
    if (A && B && A[0] === B[0] && a2 !== b2) out.push(`${fmt(num(v0))} ${a2} = ${fmt(num(v0) * A[1] / B[1])} ${b2}`);
  }
}

// ── the time around the world (the device's own time zone data – exact, also with summer time) ──
const ZONES = {
  københavn: 'Europe/Copenhagen', danmark: 'Europe/Copenhagen', london: 'Europe/London', england: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
  stockholm: 'Europe/Stockholm', oslo: 'Europe/Oslo', helsinki: 'Europe/Helsinki', reykjavik: 'Atlantic/Reykjavik', island: 'Atlantic/Reykjavik', nuuk: 'America/Nuuk', grønland: 'America/Nuuk',
  tórshavn: 'Atlantic/Faroe', færøerne: 'Atlantic/Faroe', madrid: 'Europe/Madrid', rom: 'Europe/Rome', athen: 'Europe/Athens', istanbul: 'Europe/Istanbul', moskva: 'Europe/Moscow',
  dubai: 'Asia/Dubai', indien: 'Asia/Kolkata', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', bangkok: 'Asia/Bangkok', singapore: 'Asia/Singapore', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai',
  kina: 'Asia/Shanghai', hongkong: 'Asia/Hong_Kong', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', seoul: 'Asia/Seoul', korea: 'Asia/Seoul', sydney: 'Australia/Sydney', australien: 'Australia/Sydney',
  auckland: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland', 'new york': 'America/New_York', washington: 'America/New_York', chicago: 'America/Chicago', denver: 'America/Denver',
  'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', california: 'America/Los_Angeles', toronto: 'America/Toronto', mexico: 'America/Mexico_City',
  'são paulo': 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo', brasilien: 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires', kairo: 'Africa/Cairo', egypten: 'Africa/Cairo',
  nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg', sydafrika: 'Africa/Johannesburg', thailand: 'Asia/Bangkok', usa: 'America/New_York',
};
function clockFacts(q, now, out) {
  const lq = q.toLowerCase();
  if (!/klokken|tid(en)? (er det )?i|hvad er tiden|time ?zone|tidszone|tidsforskel/.test(lq)) return;
  const names = Object.keys(ZONES).sort((a, b) => b.length - a.length);
  const hits = []; let rest = lq;
  for (const n of names) if (new RegExp(`(^|[^a-zæøå])${n}([^a-zæøå]|$)`).test(rest)) { hits.push(n); rest = rest.replace(n, ' '); }
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Copenhagen';
  const offset = (tz) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(now); const g = (t) => Number(p.find(x => x.type === t).value); return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - Math.floor(now.getTime() / 60000) * 60000) / 3600000; };
  for (const n of hits.slice(0, 3)) {
    const tz = ZONES[n];
    const t = new Intl.DateTimeFormat('da-DK', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(now);
    const diff = Math.round((offset(tz) - offset(here)) * 2) / 2;
    out.push(`Klokken i ${n.replace(/(^|\s)\S/g, c => c.toUpperCase())} er nu ${t}${diff ? ` (${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')} timer i forhold til her)` : ' (samme tid som her)'}.`);
  }
}

/** Exact facts for the question (sums, percentages, VAT, dates, units) – an empty list when there is nothing to work out. */
export function quickFacts(question, now = new Date()) {
  const q = String(question || '').slice(0, 400), out = [];
  try { mathFacts(q, out); } catch { /* */ }
  try { dateFacts(q, now, out); } catch { /* */ }
  try { unitFacts(q, out); } catch { /* */ }
  try { clockFacts(q, now, out); } catch { /* */ }
  return [...new Set(out)].slice(0, 5);
}
