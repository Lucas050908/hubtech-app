/** Logic for Fem på stribe, Tændstikker, Støjmåler, Ordklasser, Talsystemer, Genveje, Klaver og Morgenrutine (pure, unit-tested). */

// ── Fem på stribe (15×15, black starts) ──
export const N = 15;
export function newGomoku(players) { return { players: players.map(p => ({ name: p.name, ai: !!p.ai })), board: Array(N * N).fill(-1), turn: 0, phase: 'play', last: null, winner: null, line: null, moves: 0, log: [] }; }
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
/** five (or more) in a row through i? returns the cells or null */
export function fiveAt(b, i) {
  const p = b[i]; if (p < 0) return null; const x0 = i % N, y0 = Math.floor(i / N);
  for (const [dx, dy] of DIRS) {
    const cells = [i];
    for (const s of [1, -1]) { let x = x0 + dx * s, y = y0 + dy * s; while (x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === p) { cells.push(y * N + x); x += dx * s; y += dy * s; } }
    if (cells.length >= 5) return cells.sort((a, c) => a - c);
  }
  return null;
}
export function applyGomoku(s, seat, name, args = []) {
  if (s.phase !== 'play' || seat !== s.turn || name !== 'place') return false;
  const i = args[0]; if (!Number.isInteger(i) || i < 0 || i >= N * N || s.board[i] >= 0) return false;
  s.board[i] = seat; s.last = i; s.moves++;
  const line = fiveAt(s.board, i);
  if (line) { s.phase = 'over'; s.winner = seat; s.line = line; s.log.unshift(`${s.players[seat].name} fik fem på stribe!`); return true; }
  if (s.moves >= N * N) { s.phase = 'over'; s.winner = null; s.log.unshift('Uafgjort – brættet er fyldt'); return true; }
  s.turn = 1 - s.turn; return true;
}
/** score a cell for a player: count open runs in each direction */
function lineScore(b, i, p) {
  const x0 = i % N, y0 = Math.floor(i / N); let total = 0;
  for (const [dx, dy] of DIRS) {
    let run = 1, open = 0;
    for (const s of [1, -1]) { let x = x0 + dx * s, y = y0 + dy * s; while (x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === p) { run++; x += dx * s; y += dy * s; } if (x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] < 0) open++; }
    total += run >= 5 ? 1e6 : run === 4 ? (open === 2 ? 1e5 : open ? 1e4 : 0) : run === 3 ? (open === 2 ? 5e3 : open ? 400 : 0) : run === 2 ? (open === 2 ? 200 : open ? 30 : 0) : open ? 4 : 0;
  }
  return total;
}
export function aiGomoku(s, seat) {
  const b = s.board, me = seat, them = 1 - seat; let best = -1, bestI = Math.floor(N * N / 2);
  if (s.moves === 0) return { name: 'place', args: [bestI] };
  for (let i = 0; i < N * N; i++) {
    if (b[i] >= 0) continue;
    const x = i % N, y = Math.floor(i / N); let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && b[yy * N + xx] >= 0) { near = true; break; } }
    if (!near) continue;
    const sc = lineScore(b, i, me) * 1.1 + lineScore(b, i, them) + Math.random();
    if (sc > best) { best = sc; bestI = i; }
  }
  return { name: 'place', args: [bestI] };
}

// ── Tændstikker (Nim): rows of matches; take any number from one row. Whoever takes the last one loses (misère) or wins. ──
export const nimXor = (rows) => rows.reduce((a, b) => a ^ b, 0);
export function nimMove(rows, misere = true) {
  const big = rows.filter(r => r > 1).length;
  if (misere && big <= 1) {
    // endgame: leave an odd number of single matches for the opponent
    const ones = rows.filter(r => r === 1).length, bi = rows.findIndex(r => r > 1);
    if (bi >= 0) return { row: bi, take: ones % 2 ? rows[bi] : rows[bi] - 1 };
  }
  const x = nimXor(rows);
  if (x) for (let i = 0; i < rows.length; i++) { const t = rows[i] ^ x; if (t < rows[i]) return { row: i, take: rows[i] - t }; }
  const i = rows.findIndex(r => r > 0); return { row: i, take: 1 };       // losing position: take one and hope
}
export const nimDone = (rows) => rows.every(r => r === 0);

// ── Støjmåler ──
/** RMS of samples (−1..1) to a 0–100 level */
export function level(samples) { let s = 0; for (const v of samples) s += v * v; const rms = Math.sqrt(s / (samples.length || 1)); return Math.max(0, Math.min(100, Math.round((20 * Math.log10(rms || 1e-6) + 60) * 100 / 60))); }
export const NOISE = [[0, 'Musestille', '#22c55e'], [30, 'Hviske', '#84cc16'], [50, 'Snakke stille', '#facc15'], [70, 'Højt', '#f97316'], [85, 'Alt for højt!', '#ef4444']];
export const noiseLabel = (v) => NOISE.slice().reverse().find(([t]) => v >= t);

// ── Ordklasser ──
export const CLASSES = { n: 'Navneord', v: 'Udsagnsord', a: 'Tillægsord', s: 'Stedord', t: 'Talord', f: 'Forholdsord', b: 'Biord', k: 'Bindeord' };
/** sentences with each word tagged: 'word/tag' (untagged words are skipped in the quiz) */
export const SENTENCES = [
  'Den/s store/a hund/n løber/v hurtigt/b over/f vejen/n',
  'Jeg/s spiser/v tre/t røde/a æbler/n',
  'Min/s søster/n synger/v og/k danser/v i/f haven/n',
  'Katten/n sover/v altid/b på/f den/s bløde/a sofa/n',
  'Vi/s cykler/v til/f skole/n hver/s morgen/n',
  'To/t små/a fugle/n flyver/v højt/b over/f træerne/n',
  'Hun/s læser/v en/t spændende/a bog/n',
  'Drengen/n bygger/v et/t flot/a tårn/n af/f klodser/n',
  'Mormor/n bager/v lækre/a boller/n om/f søndagen/n',
  'De/s spiller/v fodbold/n efter/f skole/n men/k før/f aftensmaden/n',
  'Det/s regner/v meget/b i/f november/n',
  'Den/s gamle/a lærer/n fortæller/v sjove/a historier/n',
];
export const parseSentence = (s) => s.split(' ').map(w => { const [word, tag] = w.split('/'); return { word, tag: tag || null }; });

// ── Talsystemer ──
export const toBase = (n, b) => (n >>> 0).toString(b).toUpperCase();
export function fromBase(str, b) { const s = String(str).trim().toLowerCase().replace(/^0[bx]/, ''); if (!s || ![...s].every(c => '0123456789abcdef'.slice(0, b).includes(c))) return null; return parseInt(s, b); }
export const BASES = { 2: 'Binær', 8: 'Oktal', 10: 'Decimal', 16: 'Hex' };
export function numTask(level = 1, rnd = Math.random) {
  const max = [15, 63, 255, 4095][Math.max(0, Math.min(3, level - 1))], n = 1 + Math.floor(rnd() * max);
  const pairs = [[10, 2], [2, 10], [10, 16], [16, 10], [2, 16], [16, 2]], [from, to] = pairs[Math.floor(rnd() * (level === 1 ? 2 : pairs.length))];
  return { n, from, to, ask: toBase(n, from), answer: toBase(n, to) };
}
/** the place values of a binary number, e.g. 1011 → [8, 0, 2, 1] */
export const bitValues = (bin) => [...bin].map((c, i, a) => (c === '1' ? 2 ** (a.length - 1 - i) : 0));

// ── Genveje (Windows / Mac) ──
export const SHORTCUTS = [
  ['Kopiér', 'Ctrl+C', '⌘+C'], ['Sæt ind', 'Ctrl+V', '⌘+V'], ['Klip', 'Ctrl+X', '⌘+X'], ['Fortryd', 'Ctrl+Z', '⌘+Z'], ['Gentag', 'Ctrl+Y', '⌘+Shift+Z'],
  ['Markér alt', 'Ctrl+A', '⌘+A'], ['Gem', 'Ctrl+S', '⌘+S'], ['Søg på siden', 'Ctrl+F', '⌘+F'], ['Udskriv', 'Ctrl+P', '⌘+P'], ['Ny fane', 'Ctrl+T', '⌘+T'],
  ['Luk fanen', 'Ctrl+W', '⌘+W'], ['Genåbn lukket fane', 'Ctrl+Shift+T', '⌘+Shift+T'], ['Skift program', 'Alt+Tab', '⌘+Tab'], ['Lås computeren', 'Win+L', 'Ctrl+⌘+Q'], ['Vis skrivebordet', 'Win+D', 'F11'],
  ['Skærmbillede af et område', 'Win+Shift+S', '⌘+Shift+4'], ['Stifinder / Finder', 'Win+E', '⌘+Mellemrum'], ['Jobliste (Task Manager)', 'Ctrl+Shift+Esc', '⌘+Alt+Esc'], ['Fed skrift', 'Ctrl+B', '⌘+B'], ['Kursiv', 'Ctrl+I', '⌘+I'],
  ['Understreget', 'Ctrl+U', '⌘+U'], ['Zoom ind', 'Ctrl++', '⌘++'], ['Genindlæs siden', 'F5', '⌘+R'], ['Adresselinjen', 'Ctrl+L', '⌘+L'], ['Omdøb fil', 'F2', 'Enter'],
];
/** the keys pressed as a normalized combo like 'Ctrl+Shift+T' */
export function combo(e, mac = false) {
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key === ' ' ? 'Mellemrum' : e.key === 'Escape' ? 'Esc' : e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const parts = []; if (e.ctrlKey) parts.push('Ctrl'); if (e.metaKey) parts.push(mac ? '⌘' : 'Win'); if (e.altKey) parts.push('Alt'); if (e.shiftKey && !(k === '+' )) parts.push('Shift');
  return [...parts, k === '=' && e.ctrlKey ? '+' : k].join('+');
}

// ── Klaver ──
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
export const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const noteName = (midi) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
/** simple tunes in the public domain, as midi notes and beats */
export const TUNES = {
  'Mester Jakob': [[60, 1], [62, 1], [64, 1], [60, 1], [60, 1], [62, 1], [64, 1], [60, 1], [64, 1], [65, 1], [67, 2], [64, 1], [65, 1], [67, 2]],
  'Lille Peter Edderkop': [[67, 1], [60, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 2], [64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [60, 2]],
  'Glæden (Beethoven)': [[64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2]],
  'Blinke lille stjerne': [[60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2]],
};
export const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74 };

// ── Morgenrutine ──
export const ROUTINE = ['Stå op', 'Tisse og vaske hænder', 'Tøj på', 'Morgenmad', 'Børste tænder', 'Rede håret', 'Pakke tasken', 'Sko og jakke på'];
export function streak(days, today) {
  // days: { 'YYYY-MM-DD': true } for complete mornings; count back from today (or yesterday if today isn't done yet)
  const d = new Date(`${today}T12:00`); let n = 0;
  const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (!days[key(d)]) d.setDate(d.getDate() - 1);
  while (days[key(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
