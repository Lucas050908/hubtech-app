/** Logic for Hovedstæder, Klokken, Brøker, Stavning, Omregner, Terninger and Billedgåder (pure, unit-tested). */

export const shuffle = (a, rnd = Math.random) => { const t = a.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; };

// ── Hovedstæder: [land, hovedstad, verdensdel] ──
export const CAPITALS = [
  ['Danmark', 'København', 'Europa'], ['Sverige', 'Stockholm', 'Europa'], ['Norge', 'Oslo', 'Europa'], ['Finland', 'Helsinki', 'Europa'], ['Island', 'Reykjavik', 'Europa'],
  ['Tyskland', 'Berlin', 'Europa'], ['Frankrig', 'Paris', 'Europa'], ['Storbritannien', 'London', 'Europa'], ['Irland', 'Dublin', 'Europa'], ['Holland', 'Amsterdam', 'Europa'],
  ['Belgien', 'Bruxelles', 'Europa'], ['Luxembourg', 'Luxembourg', 'Europa'], ['Spanien', 'Madrid', 'Europa'], ['Portugal', 'Lissabon', 'Europa'], ['Italien', 'Rom', 'Europa'],
  ['Schweiz', 'Bern', 'Europa'], ['Østrig', 'Wien', 'Europa'], ['Polen', 'Warszawa', 'Europa'], ['Tjekkiet', 'Prag', 'Europa'], ['Slovakiet', 'Bratislava', 'Europa'],
  ['Ungarn', 'Budapest', 'Europa'], ['Rumænien', 'Bukarest', 'Europa'], ['Bulgarien', 'Sofia', 'Europa'], ['Grækenland', 'Athen', 'Europa'], ['Kroatien', 'Zagreb', 'Europa'],
  ['Slovenien', 'Ljubljana', 'Europa'], ['Serbien', 'Beograd', 'Europa'], ['Estland', 'Tallinn', 'Europa'], ['Letland', 'Riga', 'Europa'], ['Litauen', 'Vilnius', 'Europa'],
  ['Ukraine', 'Kyiv', 'Europa'], ['Tyrkiet', 'Ankara', 'Europa'], ['Albanien', 'Tirana', 'Europa'], ['Malta', 'Valletta', 'Europa'], ['Cypern', 'Nicosia', 'Europa'],
  ['USA', 'Washington D.C.', 'Amerika'], ['Canada', 'Ottawa', 'Amerika'], ['Mexico', 'Mexico City', 'Amerika'], ['Brasilien', 'Brasília', 'Amerika'], ['Argentina', 'Buenos Aires', 'Amerika'],
  ['Chile', 'Santiago', 'Amerika'], ['Peru', 'Lima', 'Amerika'], ['Colombia', 'Bogotá', 'Amerika'], ['Cuba', 'Havana', 'Amerika'], ['Venezuela', 'Caracas', 'Amerika'],
  ['Kina', 'Beijing', 'Asien'], ['Japan', 'Tokyo', 'Asien'], ['Sydkorea', 'Seoul', 'Asien'], ['Indien', 'New Delhi', 'Asien'], ['Thailand', 'Bangkok', 'Asien'],
  ['Vietnam', 'Hanoi', 'Asien'], ['Indonesien', 'Jakarta', 'Asien'], ['Filippinerne', 'Manila', 'Asien'], ['Pakistan', 'Islamabad', 'Asien'], ['Iran', 'Teheran', 'Asien'],
  ['Saudi-Arabien', 'Riyadh', 'Asien'], ['Israel', 'Jerusalem', 'Asien'], ['Nepal', 'Kathmandu', 'Asien'], ['Mongoliet', 'Ulaanbaatar', 'Asien'], ['Singapore', 'Singapore', 'Asien'],
  ['Egypten', 'Kairo', 'Afrika'], ['Marokko', 'Rabat', 'Afrika'], ['Nigeria', 'Abuja', 'Afrika'], ['Kenya', 'Nairobi', 'Afrika'], ['Etiopien', 'Addis Abeba', 'Afrika'],
  ['Sydafrika', 'Pretoria', 'Afrika'], ['Ghana', 'Accra', 'Afrika'], ['Tanzania', 'Dodoma', 'Afrika'], ['Senegal', 'Dakar', 'Afrika'], ['Tunesien', 'Tunis', 'Afrika'],
  ['Australien', 'Canberra', 'Oceanien'], ['New Zealand', 'Wellington', 'Oceanien'], ['Fiji', 'Suva', 'Oceanien'], ['Papua Ny Guinea', 'Port Moresby', 'Oceanien'],
  ['Grønland', 'Nuuk', 'Rigsfællesskabet'], ['Færøerne', 'Tórshavn', 'Rigsfællesskabet'],
];
export const REGIONS = ['Europa', 'Amerika', 'Asien', 'Afrika', 'Oceanien', 'Rigsfællesskabet'];
/** a question: which way ('capital' asks for the capital of a country), the right answer and 4 options from the same region when possible */
export function capitalQ(pool, way = 'capital', rnd = Math.random) {
  const q = pool[Math.floor(rnd() * pool.length)], k = way === 'capital' ? 1 : 0;
  const same = CAPITALS.filter(c => c !== q && c[2] === q[2] && c[k] !== q[k]), other = CAPITALS.filter(c => c !== q && c[2] !== q[2]);
  const wrong = [...shuffle(same, rnd), ...shuffle(other, rnd)].map(c => c[k]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
  return { q, ask: way === 'capital' ? q[0] : q[1], answer: q[k], options: shuffle([q[k], ...wrong], rnd) };
}
/** loose match for typed answers: case, accents, punctuation and spaces don't matter */
export const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zæøå0-9]/g, '');

// ── Klokken: Danish time words ──
const NUM = ['tolv', 'et', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti', 'elleve', 'tolv'];
const MIN = { 1: 'et', 2: 'to', 3: 'tre', 4: 'fire', 5: 'fem', 6: 'seks', 7: 'syv', 8: 'otte', 9: 'ni', 10: 'ti', 11: 'elleve', 12: 'tolv', 13: 'tretten', 14: 'fjorten', 16: 'seksten', 17: 'sytten', 18: 'atten', 19: 'nitten', 20: 'tyve', 21: 'enogtyve', 22: 'toogtyve', 23: 'treogtyve', 24: 'fireogtyve', 25: 'femogtyve', 26: 'seksogtyve', 27: 'syvogtyve', 28: 'otteogtyve', 29: 'niogtyve' };
const hourWord = (h) => NUM[((h % 12) + 12) % 12 || 12];
/** “kvart over tre”, “halv fire”, “fem minutter i halv fire” … (Danish 'halv fire' = 3:30) */
export function clockWords(h, m) {
  const H = hourWord(h), N = hourWord(h + 1), mm = ((m % 60) + 60) % 60;
  const min = (x) => (x === 1 ? 'et minut' : `${MIN[x]} minutter`);
  if (mm === 0) return `${H}`;
  if (mm === 15) return `kvart over ${H}`;
  if (mm === 30) return `halv ${N}`;
  if (mm === 45) return `kvart i ${N}`;
  if (mm < 15 || (mm > 15 && mm < 20)) return `${min(mm)} over ${H}`;
  if (mm >= 20 && mm < 30) return `${min(30 - mm)} i halv ${N}`;
  if (mm > 30 && mm <= 40) return `${min(mm - 30)} over halv ${N}`;
  return `${min(60 - mm)} i ${N}`;
}
export const digital = (h, m) => `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
/** a random time on the given level: 1 = hele/halve, 2 = kvarter, 3 = 5 minutter, 4 = minutter */
export function randomTime(level = 2, rnd = Math.random) {
  const step = [60, 30, 15, 5, 1][Math.max(0, Math.min(4, level))];
  return { h: 1 + Math.floor(rnd() * 12), m: Math.floor(rnd() * (60 / step)) * step };
}

// ── Brøker ──
export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
export const simplify = ([n, d]) => { const g = gcd(n, d), s = d < 0 ? -1 : 1; return [s * n / g, s * d / g]; };
export const fadd = ([a, b], [c, d]) => simplify([a * d + c * b, b * d]);
export const fsub = ([a, b], [c, d]) => simplify([a * d - c * b, b * d]);
export const fmul = ([a, b], [c, d]) => simplify([a * c, b * d]);
export const fdiv = ([a, b], [c, d]) => simplify([a * d, b * c]);
export const feq = (x, y) => { const [a, b] = simplify(x), [c, d] = simplify(y); return a === c && b === d; };
/** parse “3/4”, “1 1/2”, “2”, “-1/3” → [n, d] or null */
export function parseFrac(s) {
  const t = String(s).trim().replace(',', '.');
  let m = /^(-?\d+)\s+(\d+)\/(\d+)$/.exec(t); if (m) { const w = Number(m[1]), n = Number(m[2]), d = Number(m[3]); return d ? simplify([w * d + Math.sign(w || 1) * n, d]) : null; }
  m = /^(-?\d+)\/(-?\d+)$/.exec(t); if (m) return Number(m[2]) ? simplify([Number(m[1]), Number(m[2])]) : null;
  m = /^-?\d+$/.exec(t); if (m) return [Number(t), 1];
  return null;
}
export const fstr = ([n, d]) => (d === 1 ? String(n) : `${n}/${d}`);
/** a task on a level: 'shade' (what fraction is coloured), 'simplify', 'compare', 'add', 'mul' */
export function fracTask(kind, rnd = Math.random) {
  const r = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  if (kind === 'shade') { const d = r(2, 10), n = r(1, d - 1); return { kind, frac: [n, d], answer: [n, d] }; }
  if (kind === 'simplify') { const d = r(2, 9), n = r(1, d - 1), k = r(2, 5); const [a, b] = simplify([n, d]); return { kind, frac: [n * k, d * k], answer: [a, b] }; }
  if (kind === 'compare') { let a, b; do { const d1 = r(2, 9), d2 = r(2, 9); a = [r(1, d1 - 1), d1]; b = [r(1, d2 - 1), d2]; } while (feq(a, b)); return { kind, a, b, answer: a[0] * b[1] > b[0] * a[1] ? '>' : '<' }; }
  if (kind === 'add') { const d1 = r(2, 6), d2 = r(2, 6), a = [r(1, d1 - 1), d1], b = [r(1, d2 - 1), d2]; return { kind, a, b, op: '+', answer: fadd(a, b) }; }
  const d1 = r(2, 6), d2 = r(2, 6), a = [r(1, d1), d1], b = [r(1, d2), d2]; return { kind: 'mul', a, b, op: '·', answer: fmul(a, b) };
}

// ── Stavning ──
export const SPELL = {
  1: ['hus', 'bil', 'kat', 'hund', 'sol', 'is', 'bord', 'stol', 'mor', 'far', 'fisk', 'bog', 'dør', 'ost', 'mælk', 'brød', 'træ', 'blå', 'rød', 'grøn'],
  2: ['skole', 'cykel', 'vinter', 'sommer', 'blomst', 'kage', 'hjem', 'hjerte', 'gul', 'sne', 'regn', 'vej', 'leg', 'øje', 'øre', 'tand', 'sko', 'hvem', 'hvad', 'hvor'],
  3: ['computer', 'chokolade', 'restaurant', 'giraf', 'genbrug', 'garage', 'chauffør', 'juice', 'weekend', 'pizza', 'hjelm', 'hjørne', 'kirke', 'kniv', 'gnave', 'stjerne', 'sjov', 'skjorte', 'tænke', 'tunge'],
  4: ['nysgerrig', 'ansvarlig', 'efterår', 'mærkeligt', 'besværlig', 'pludselig', 'desværre', 'egentlig', 'selvfølgelig', 'tilfældigvis', 'utrolig', 'fantastisk', 'nødvendig', 'interessant', 'naturligvis', 'rytme', 'symbol', 'tidsskrift', 'entré', 'ingeniør'],
};
/** compare letter by letter and return [{ch, ok}] so the page can show where it went wrong */
export function spellDiff(want, got) {
  const a = want.toLowerCase(), b = String(got).trim().toLowerCase(), out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push({ ch: a[i] ?? '', got: b[i] ?? '', ok: a[i] === b[i] });
  return out;
}

// ── Omregner ──
export const UNITS = {
  length: { label: 'Længde', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, tomme: 0.0254, fod: 0.3048, mil: 1609.344, 'sømil': 1852 } },
  weight: { label: 'Vægt', units: { mg: 1e-6, g: 0.001, kg: 1, ton: 1000, pund: 0.45359237, unse: 0.028349523 } },
  volume: { label: 'Rumfang', units: { ml: 0.001, cl: 0.01, dl: 0.1, l: 1, 'm³': 1000, tsk: 0.005, spsk: 0.015, kop: 0.25, gallon: 3.785411784 } },
  area: { label: 'Areal', units: { 'cm²': 1e-4, 'm²': 1, ar: 100, hektar: 10000, 'km²': 1e6, tdl: 5516 } },
  speed: { label: 'Fart', units: { 'm/s': 1, 'km/t': 1 / 3.6, mph: 0.44704, knob: 0.514444 } },
  time: { label: 'Tid', units: { sekund: 1, minut: 60, time: 3600, dag: 86400, uge: 604800, 'år': 31557600 } },
  data: { label: 'Data', units: { bit: 0.125, byte: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 } },
  temp: { label: 'Temperatur', units: { '°C': 'c', '°F': 'f', K: 'k' } },
};
export function convert(kind, v, from, to) {
  const u = UNITS[kind]?.units; if (!u || !(from in u) || !(to in u) || !Number.isFinite(v)) return null;
  if (kind === 'temp') { const c = from === '°C' ? v : from === '°F' ? (v - 32) * 5 / 9 : v - 273.15; return to === '°C' ? c : to === '°F' ? c * 9 / 5 + 32 : c + 273.15; }
  return v * u[from] / u[to];
}
export const nice = (n) => (n == null ? '–' : Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-4 && n !== 0) ? n.toExponential(4).replace('.', ',') : Number(n.toPrecision(10)).toLocaleString('da-DK', { maximumFractionDigits: 6 }));

// ── Terninger ──
/** roll e.g. '3d6+2' → { rolls, total } ; also 'd20', '2d10-1' */
export function rollDice(expr, rnd = Math.random) {
  const m = /^\s*(\d*)\s*[dDtT]\s*(\d+)\s*([+-]\s*\d+)?\s*$/.exec(expr || ''); if (!m) return null;
  const n = Math.min(50, Number(m[1] || 1)), sides = Number(m[2]), mod = m[3] ? Number(m[3].replace(/\s/g, '')) : 0;
  if (!n || sides < 2 || sides > 1000) return null;
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(rnd() * sides));
  return { n, sides, mod, rolls, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

// ── Billedgåder (nonogram) ──
export const clues = (line) => { const out = []; let run = 0; for (const c of line) { if (c) run++; else if (run) { out.push(run); run = 0; } } if (run) out.push(run); return out.length ? out : [0]; };
export const rowClues = (g) => g.map(clues);
export const colClues = (g) => g[0].map((_, c) => clues(g.map(r => r[c])));
export const solved = (want, have) => want.every((r, i) => r.every((v, j) => !!v === (have[i][j] === 1)));
const P = (rows) => rows.map(r => [...r].map(ch => (ch === '#' ? 1 : 0)));
export const NONOGRAMS = [
  { name: 'Hjerte', size: 5, grid: P(['.#.#.', '#####', '#####', '.###.', '..#..']) },
  { name: 'Hus', size: 5, grid: P(['..#..', '.###.', '#####', '#.#.#', '#.###']) },
  { name: 'Smiley', size: 5, grid: P(['.....', '.#.#.', '.....', '#...#', '.###.']) },
  { name: 'Pil', size: 5, grid: P(['..#..', '.###.', '#.#.#', '..#..', '..#..']) },
  { name: 'Kat', size: 10, grid: P(['#........#', '##......##', '#.######.#', '#.#.##.#.#', '#........#', '#...##...#', '.#......#.', '..######..', '..#....#..', '..##..##..']) },
  { name: 'Træ', size: 10, grid: P(['....##....', '...####...', '..######..', '...####...', '..######..', '.########.', '##########', '....##....', '....##....', '...####...']) },
  { name: 'Anker', size: 10, grid: P(['....##....', '...#..#...', '....##....', '..######..', '....##....', '....##....', '#...##...#', '##..##..##', '.########.', '...####...']) },
  { name: 'Rumskib', size: 10, grid: P(['....##....', '...####...', '...#..#...', '...####...', '..######..', '.##.##.##.', '##########', '#.######.#', '...#..#...', '..##..##..']) },
  { name: 'Note', size: 10, grid: P(['....######', '....######', '....#....#', '....#....#', '....#....#', '....#....#', '.####..###', '#####.####', '#####.####', '.###...##.']) },
  { name: 'Kop', size: 10, grid: P(['..#.#.#...', '...#.#.#..', '..........', '#######...', '#######.##', '#######..#', '#######.##', '.#####....', '..###.....', '#########.']) },
];
