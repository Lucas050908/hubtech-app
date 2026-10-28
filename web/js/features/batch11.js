/** Logic for Prik til prik, Talrækker, Bogstaver, Tælleleg, Tegneserie, Emojigåder, Puslespil, Dagens plan, Talhukommelse og Ordsprog (pure, unit-tested). */

// ── Prik til prik: pictures as points on a 100×100 canvas, joined in order ──
export const DOT_PICS = [
  { name: 'Stjerne', pts: [[50, 5], [61, 38], [96, 38], [68, 59], [79, 93], [50, 72], [21, 93], [32, 59], [4, 38], [39, 38]], close: true },
  { name: 'Hus', pts: [[15, 90], [15, 45], [50, 12], [85, 45], [85, 90], [60, 90], [60, 65], [40, 65], [40, 90]], close: true },
  { name: 'Fisk', pts: [[10, 50], [30, 30], [55, 25], [75, 35], [90, 20], [88, 50], [90, 80], [75, 65], [55, 75], [30, 70]], close: true },
  { name: 'Hjerte', pts: [[50, 30], [62, 15], [80, 12], [93, 25], [93, 42], [80, 62], [50, 90], [20, 62], [7, 42], [7, 25], [20, 12], [38, 15]], close: true },
  { name: 'Båd', pts: [[10, 65], [90, 65], [78, 85], [22, 85], [10, 65], [48, 65], [48, 10], [80, 55], [48, 55]], close: false },
  { name: 'Raket', pts: [[50, 5], [64, 25], [64, 65], [78, 85], [62, 80], [56, 92], [44, 92], [38, 80], [22, 85], [36, 65], [36, 25]], close: true },
  { name: 'Kat', pts: [[25, 90], [20, 55], [22, 30], [15, 8], [35, 20], [50, 18], [65, 20], [85, 8], [78, 30], [80, 55], [75, 90]], close: true },
  { name: 'Træ', pts: [[44, 92], [44, 72], [15, 72], [32, 52], [20, 52], [38, 32], [28, 32], [50, 6], [72, 32], [62, 32], [80, 52], [68, 52], [85, 72], [56, 72], [56, 92]], close: true },
];

// ── Talrækker ──
export function sequence(level = 1, rnd = Math.random) {
  const r = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const kinds = level === 1 ? ['add'] : level === 2 ? ['add', 'sub', 'mul'] : ['add', 'mul', 'sq', 'fib', 'alt', 'grow'];
  const k = kinds[Math.floor(rnd() * kinds.length)];
  let s = [], rule = '';
  if (k === 'add') { const a = r(1, 20), d = r(2, level === 1 ? 5 : 12); s = [0, 1, 2, 3, 4, 5].map(i => a + d * i); rule = `+${d} hver gang`; }
  if (k === 'sub') { const d = r(2, 9), a = d * 6 + r(5, 40); s = [0, 1, 2, 3, 4, 5].map(i => a - d * i); rule = `−${d} hver gang`; }
  if (k === 'mul') { const a = r(1, 4), m = r(2, 3); s = [0, 1, 2, 3, 4, 5].map(i => a * m ** i); rule = `×${m} hver gang`; }
  if (k === 'sq') { const a = r(1, 5); s = [0, 1, 2, 3, 4, 5].map(i => (a + i) ** 2); rule = 'kvadrattal (n × n)'; }
  if (k === 'fib') { const a = r(1, 4), b = r(a, a + 4); s = [a, b]; while (s.length < 6) s.push(s.at(-1) + s.at(-2)); rule = 'de to forrige lagt sammen'; }
  if (k === 'alt') { const a = r(2, 20), p = r(3, 9), q = r(1, p - 1); s = [a]; for (let i = 1; i < 6; i++) s.push(s.at(-1) + (i % 2 ? p : -q)); rule = `skiftevis +${p} og −${q}`; }
  if (k === 'grow') { const a = r(1, 10); s = [a]; for (let i = 1; i < 6; i++) s.push(s.at(-1) + i); rule = '+1, +2, +3 …'; }
  return { shown: s.slice(0, 5), answer: s[5], rule, kind: k };
}

// ── Bogstaver ──
export const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ'];
export const LETTER_WORDS = { A: 'abe', B: 'bil', C: 'citron', D: 'due', E: 'elefant', F: 'fisk', G: 'gris', H: 'hund', I: 'is', J: 'juletræ', K: 'kat', L: 'løve', M: 'mus', N: 'næsehorn', O: 'ost', P: 'pingvin', Q: 'quiz', R: 'ræv', S: 'sol', T: 'tog', U: 'ugle', V: 'vand', W: 'wienerbrød', X: 'xylofon', Y: 'yoghurt', Z: 'zebra', Æ: 'æble', Ø: 'ørn', Å: 'ål' };
export function letterRound(n = 4, rnd = Math.random, pool = ALPHABET) {
  const pick = pool.slice().sort(() => rnd() - 0.5).slice(0, n); return { target: pick[Math.floor(rnd() * n)], options: pick };
}

// ── Tælleleg ──
export const COUNT_THINGS = ['🍎', '🐟', '⭐', '🚗', '🎈', '🐞', '🌼', '🍪', '🐥', '⚽'];
export function countRound(max = 10, rnd = Math.random) {
  const n = 1 + Math.floor(rnd() * max), thing = COUNT_THINGS[Math.floor(rnd() * COUNT_THINGS.length)];
  const opts = new Set([n]); while (opts.size < 4) { const o = Math.max(1, n + Math.floor(rnd() * 7) - 3); opts.add(o); }
  return { n, thing, options: [...opts].sort((a, b) => a - b) };
}

// ── Tegneserie ──
export const CHARACTERS = ['🧒', '👧', '👦', '👩', '👨', '👵', '👴', '🐶', '🐱', '🦊', '🐻', '🤖', '👽', '🐉', '🦄', '🐸'];
export const SCENES = { by: ['🏠', '🏢', '🌳'], skov: ['🌲', '🌲', '🍄'], strand: ['🏖️', '🌊', '☀️'], rummet: ['🪐', '⭐', '🌙'], skole: ['🏫', '📚', '✏️'], nat: ['🌙', '⭐', '🏠'] };
export const newComic = () => ({ title: 'Min tegneserie', panels: [0, 1, 2].map(() => ({ scene: 'by', chars: [{ e: '🧒', text: '' }, { e: '🐶', text: '' }] })) });
/** wrap text into lines that fit `max` characters */
export function wrapText(t, max = 18) { const out = []; let line = ''; for (const w of String(t).split(/\s+/).filter(Boolean)) { if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; }

// ── Emojigåder: what word do the emojis make? ──
export const EMOJI_PUZZLES = [
  ['☀️🌻', 'solsikke'], ['⭐🐟', 'søstjerne'], ['🍳🥞', 'pandekage'], ['🔥🚒', 'brandbil'], ['🐝🏠', 'bistade'], ['❄️⛄', 'snemand'], ['🌧️🌈', 'regnbue'], ['🍓🍰', 'jordbærkage'],
  ['🦶⚽', 'fodbold'], ['🌙🔦', 'månelys'], ['🎂🎉', 'fødselsdag'], ['🐻🍯', 'honning'], ['🏰👑', 'slot'], ['🚂🛤️', 'jernbane'], ['🧊🍦', 'is'], ['📖🐛', 'bogorm'],
  ['🍎🌳', 'æbletræ'], ['🏖️⛱️', 'strandparasol'], ['💡🧠', 'idé'], ['🕷️🕸️', 'spindelvæv'], ['⛈️⚡', 'tordenvejr'], ['🧸🛏️', 'godnat'], ['🐟🎣', 'fiskestang'], ['🌍🗺️', 'verdenskort'],
];
export const emojiMatch = (want, got) => { const n = (s) => String(s).toLowerCase().replace(/[éè]/g, 'e').replace(/[^a-zæøå]/g, ''); return n(want) === n(got); };

// ── Puslespil: pieces on an n×n grid, swap two to solve ──
export function jigsaw(n, rnd = Math.random) { const t = [...Array(n * n).keys()]; do { for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } } while (t.every((v, i) => v === i)); return t; }
export const jigsawDone = (t) => t.every((v, i) => v === i);
export const jigsawSwap = (t, a, b) => { const c = t.slice(); [c[a], c[b]] = [c[b], c[a]]; return c; };

// ── Dagens plan ──
export const PLAN_ICONS = ['⏰', '🥣', '🪥', '👕', '🎒', '🚌', '🏫', '🍎', '⚽', '🎨', '📚', '🛝', '🍽️', '🛁', '📺', '🧸', '🛏️', '🚲', '🎵', '👵'];
export const DEFAULT_PLAN = [['07:00', '⏰', 'Stå op'], ['07:15', '🥣', 'Morgenmad'], ['07:45', '🎒', 'Gå i skole'], ['12:00', '🍎', 'Frokost'], ['14:00', '🛝', 'Fritids'], ['17:30', '🍽️', 'Aftensmad'], ['19:00', '🛁', 'Bad og tænder'], ['19:30', '🛏️', 'Godnat']];
/** index of the item happening now (the last one that has started) */
export function nowIndex(items, hhmm) { let k = -1; items.forEach((it, i) => { if (it[0] <= hhmm) k = i; }); return k; }

// ── Talhukommelse ──
export const digits = (n, rnd = Math.random) => Array.from({ length: n }, (_, i) => String(i === 0 ? 1 + Math.floor(rnd() * 9) : Math.floor(rnd() * 10))).join('');
export const showMs = (n) => 800 + n * 550;

// ── Ordsprog ──
export const PROVERBS = [
  ['Den der ler sidst,', 'ler bedst', 'Den, der vinder til sidst, har grund til at være glad.'],
  ['Mange bække små', 'gør en stor å', 'Mange små ting bliver til noget stort tilsammen.'],
  ['Øvelse gør', 'mester', 'Man bliver god ved at øve sig.'],
  ['Man skal ikke skue hunden', 'på hårene', 'Man skal ikke dømme nogen på udseendet.'],
  ['Hvad hjertet er fuldt af,', 'løber munden over med', 'Det, man går meget op i, taler man om.'],
  ['Når katten er ude,', 'spiller musene på bordet', 'Når den, der bestemmer, er væk, laver de andre ballade.'],
  ['Bedre sent', 'end aldrig', 'Det er bedre at gøre noget sent end slet ikke.'],
  ['Ingen roser', 'uden torne', 'Alt godt har også en skyggeside.'],
  ['Morgenstund har', 'guld i mund', 'Det er godt at komme tidligt i gang.'],
  ['Man skal smede,', 'mens jernet er varmt', 'Man skal gribe chancen, mens den er der.'],
  ['Stille vand', 'har dyb grund', 'Stille mennesker kan have meget på hjerte.'],
  ['Den enes død,', 'den andens brød', 'Det, der er uheld for én, kan være held for en anden.'],
  ['Små gryder', 'har også ører', 'Børn hører mere, end voksne tror.'],
  ['Lige børn', 'leger bedst', 'Folk, der ligner hinanden, kommer godt ud af det sammen.'],
  ['Man skal ikke kaste med sten,', 'når man selv bor i et glashus', 'Kritisér ikke andre for noget, du selv gør.'],
  ['Der er ingen røg', 'uden ild', 'Rygter har ofte noget sandt i sig.'],
  ['Af skade', 'bliver man klog', 'Man lærer af sine fejl.'],
  ['Ude godt,', 'men hjemme bedst', 'Det er dejligt at rejse, men bedst at komme hjem.'],
];
export function proverbQ(rnd = Math.random) {
  const i = Math.floor(rnd() * PROVERBS.length), wrong = PROVERBS.filter((_, k) => k !== i).sort(() => rnd() - 0.5).slice(0, 3).map(p => p[1]);
  return { p: PROVERBS[i], options: [PROVERBS[i][1], ...wrong].sort(() => rnd() - 0.5) };
}
