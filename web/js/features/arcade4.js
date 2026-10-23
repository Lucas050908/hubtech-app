/** Logic for Labyrint, Lysslukker, Ordrul, Stigespil, Reaktion and Gæt dyret (pure, unit-tested). */

/** a small seeded random generator so a maze or puzzle can be shared by its number */
export function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ── Labyrint: cells with walls N E S W as bits 1 2 4 8 (a set bit = wall) ──
export const N = 1, E = 2, S = 4, W = 8;
const DIR = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
export function maze(w, h, rnd = Math.random) {
  const g = Array.from({ length: h }, () => Array(w).fill(15)), seen = Array.from({ length: h }, () => Array(w).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = DIR.filter(([, dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny][nx]; });
    if (!opts.length) { stack.pop(); continue; }
    const [bit, dx, dy, back] = opts[Math.floor(rnd() * opts.length)];
    g[y][x] &= ~bit; g[y + dy][x + dx] &= ~back; seen[y + dy][x + dx] = true; stack.push([x + dx, y + dy]);
  }
  return g;
}
export const canMove = (g, x, y, bit) => !(g[y][x] & bit);
export const step = (x, y, bit) => { const d = DIR.find(D => D[0] === bit); return [x + d[1], y + d[2]]; };
/** shortest path from a to b as a list of [x, y] */
export function solveMaze(g, a = [0, 0], b = [g[0].length - 1, g.length - 1]) {
  const key = (p) => p.join(','), prev = new Map([[key(a), null]]), q = [a];
  while (q.length) {
    const p = q.shift(); if (p[0] === b[0] && p[1] === b[1]) break;
    for (const [bit] of DIR) if (canMove(g, p[0], p[1], bit)) { const n = step(p[0], p[1], bit); if (!prev.has(key(n))) { prev.set(key(n), p); q.push(n); } }
  }
  if (!prev.has(key(b))) return null;
  const path = []; for (let p = b; p; p = prev.get(key(p))) path.unshift(p);
  return path;
}

// ── Lysslukker: press a light to toggle it and its neighbours; turn them all off ──
export function press(board, n, i) {
  const out = board.slice(), r = Math.floor(i / n), c = i % n;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < n && cc < n) out[rr * n + cc] = !out[rr * n + cc]; }
  return out;
}
/** a solvable puzzle: random presses from all-off */
export function lights(n = 5, presses = 8, rnd = Math.random) {
  let b = Array(n * n).fill(false), used = new Set();
  while (used.size < Math.min(presses, n * n)) used.add(Math.floor(rnd() * n * n));
  for (const i of used) b = press(b, n, i);
  return b.some(Boolean) ? { board: b, par: used.size } : lights(n, presses, rnd);
}
export const allOff = (b) => b.every(v => !v);

// ── Ordrul: unscramble a word ──
export function scramble(word, rnd = Math.random) {
  const w = [...word]; if (new Set(w).size < 2) return word;
  for (let k = 0; k < 20; k++) { const t = w.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } if (t.join('') !== word) return t.join(''); }
  return w.reverse().join('');
}
const sorted = (w) => [...w.toLowerCase()].sort().join('');
/** a guess is right if it is the word, or another word from the list with exactly the same letters */
export const isAnagram = (guess, word, list = []) => { const g = guess.trim().toLowerCase(); return g === word || (sorted(g) === sorted(word) && list.includes(g)); };

// ── Stigespil (snakes and ladders, but with ladders and slides): 1–100 ──
export const JUMPS = { 4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91, 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 };
export function newLadders(players) { return { players: players.map(p => ({ name: p.name, ai: !!p.ai })), pos: players.map(() => 0), turn: 0, phase: 'roll', last: null, winner: null, log: [] }; }
/** apply an action to a ladders game; 'roll' with an optional fixed die for tests. Returns true if it happened. */
export function applyLadders(s, seat, name, args = [], rnd = Math.random) {
  if (s.phase === 'over' || seat !== s.turn || name !== 'roll') return false;
  const die = args[0] ?? (1 + Math.floor(rnd() * 6)), from = s.pos[seat];
  let to = from + die; if (to > 100) to = 100 - (to - 100);        // bounce back from 100
  const jump = JUMPS[to]; const end = jump ?? to;
  s.pos[seat] = end; s.last = { seat, die, from, to, end, at: Date.now() };
  const who = s.players[seat].name;
  s.log.unshift(jump ? (jump > to ? `${who} slog ${die} og klatrede op ad en stige til ${end}` : `${who} slog ${die} og rutsjede ned til ${end}`) : `${who} slog ${die} og rykkede til ${end}`);
  s.log = s.log.slice(0, 12);
  if (end === 100) { s.phase = 'over'; s.winner = seat; return true; }
  if (die !== 6) s.turn = (s.turn + 1) % s.players.length;          // a six gives an extra roll
  return true;
}
export const aiLadders = () => ({ name: 'roll', args: [] });
/** square number → [row from bottom, column] on the snake-shaped board */
export function cellOf(n) { const r = Math.floor((n - 1) / 10), c = (n - 1) % 10; return [r, r % 2 ? 9 - c : c]; }

// ── Reaktion ──
export function reactionRating(ms) { return ms < 200 ? 'Lynhurtig!' : ms < 250 ? 'Rigtig hurtig' : ms < 320 ? 'Godt' : ms < 420 ? 'Helt fint' : 'Du kan blive hurtigere'; }
export const median = (a) => { if (!a.length) return null; const t = a.slice().sort((x, y) => x - y), m = Math.floor(t.length / 2); return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2); };

// ── Gæt dyret: a yes/no tree that learns ──
export const START_TREE = {
  q: 'Kan det flyve?',
  yes: { q: 'Er det et insekt?', yes: { a: 'en bi' }, no: { q: 'Kan det tale efter dig?', yes: { a: 'en papegøje' }, no: { a: 'en ørn' } } },
  no: { q: 'Lever det i vandet?', yes: { q: 'Er det et pattedyr?', yes: { a: 'en delfin' }, no: { a: 'en haj' } }, no: { q: 'Er det et kæledyr?', yes: { q: 'Siger det miav?', yes: { a: 'en kat' }, no: { a: 'en hund' } }, no: { q: 'Er det større end et menneske?', yes: { a: 'en elefant' }, no: { a: 'en ræv' } } } },
};
/** walk the tree along answers (array of booleans); returns the node reached */
export function walk(tree, path) { let n = tree; for (const a of path) n = a ? n.yes : n.no; return n; }
/** teach the tree: at the leaf reached by `path`, replace the wrong guess with a new question */
export function learn(tree, path, animal, question, yesForNew) {
  const t = JSON.parse(JSON.stringify(tree)), leafParent = path.length ? walk(t, path.slice(0, -1)) : null, old = walk(t, path);
  const node = { q: question.trim().replace(/\?*$/, '?'), yes: yesForNew ? { a: animal.trim() } : { a: old.a }, no: yesForNew ? { a: old.a } : { a: animal.trim() } };
  if (!leafParent) return node;
  if (path[path.length - 1]) leafParent.yes = node; else leafParent.no = node;
  return t;
}
export const countAnimals = (t) => (t.a ? 1 : countAnimals(t.yes) + countAnimals(t.no));
