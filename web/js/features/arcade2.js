/** Logic for Kodeknækker, Skubbepuslespil, Ordsøg and Blokfald (pure, unit-tested). */

// ── Kodeknækker: guess the secret code of 4 colours (repeats allowed) ──
export function mmScore(secret, guess) {
  let exact = 0; const s = [], g = [];
  secret.forEach((c, i) => { if (guess[i] === c) exact++; else { s.push(c); g.push(guess[i]); } });
  let near = 0; for (const c of g) { const k = s.indexOf(c); if (k >= 0) { near++; s.splice(k, 1); } }
  return { exact, near };
}
export const mmSecret = (len = 4, colors = 6, rnd = Math.random, repeats = true) => {
  const out = []; while (out.length < len) { const c = Math.floor(rnd() * colors); if (repeats || !out.includes(c)) out.push(c); } return out;
};

// ── Skubbepuslespil: n×n tiles, 0 = the hole ──
export function slideSolved(n) { return [...Array(n * n - 1).keys()].map(i => i + 1).concat(0); }
export const isSolved = (t) => t.every((v, i) => v === (i === t.length - 1 ? 0 : i + 1));
/** shuffle by making random legal moves from the solved state – always solvable */
export function slideShuffle(n, moves = 300, rnd = Math.random) {
  let t = slideSolved(n), last = -1;
  for (let k = 0; k < moves; k++) { const opts = slideNeighbours(t, n).filter(i => i !== last); const pick = opts[Math.floor(rnd() * opts.length)]; last = t.indexOf(0); t = slideMove(t, n, pick) || t; }
  return isSolved(t) ? slideShuffle(n, moves, rnd) : t;
}
export function slideNeighbours(t, n) { const z = t.indexOf(0), r = Math.floor(z / n), c = z % n, out = []; if (r > 0) out.push(z - n); if (r < n - 1) out.push(z + n); if (c > 0) out.push(z - 1); if (c < n - 1) out.push(z + 1); return out; }
/** move the tile at index i (a whole row/column slides if it's in line with the hole); returns the new tiles or null */
export function slideMove(t, n, i) {
  const z = t.indexOf(0), zr = Math.floor(z / n), zc = z % n, r = Math.floor(i / n), c = i % n;
  if (i === z || (r !== zr && c !== zc)) return null;
  const out = t.slice(), step = r === zr ? (c < zc ? -1 : 1) : (r < zr ? -n : n);
  for (let k = z; k !== i; k += step) out[k] = out[k + step];
  out[i] = 0;
  return out;
}

// ── Ordsøg: hide words in a grid in 8 directions ──
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
export function wordGrid(words, size = 12, rnd = Math.random, easy = false) {
  const dirs = easy ? DIRS.slice(0, 3) : DIRS;
  for (let attempt = 0; attempt < 50; attempt++) {
    const g = Array.from({ length: size }, () => Array(size).fill('')), placed = [];
    let ok = true;
    for (const raw of words.slice().sort((a, b) => b.length - a.length)) {
      const w = raw.toUpperCase(); let done = false;
      for (let k = 0; k < 300 && !done; k++) {
        const [dr, dc] = dirs[Math.floor(rnd() * dirs.length)], r = Math.floor(rnd() * size), c = Math.floor(rnd() * size);
        const er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        if (![...w].every((ch, i) => { const x = g[r + dr * i][c + dc * i]; return !x || x === ch; })) continue;
        [...w].forEach((ch, i) => { g[r + dr * i][c + dc * i] = ch; });
        placed.push({ word: w, r, c, dr, dc }); done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (!ok) continue;
    const fill = 'ABCDEFGHIJKLMNOPRSTUVYÆØÅ';
    for (const row of g) for (let c = 0; c < size; c++) if (!row[c]) row[c] = fill[Math.floor(rnd() * fill.length)];
    return { grid: g, placed };
  }
  return null;
}
/** the cells from a to b if they form a straight line (row, column or diagonal) */
export function lineCells(a, b) {
  const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]), n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  if (!(a[0] === b[0] || a[1] === b[1] || Math.abs(b[0] - a[0]) === Math.abs(b[1] - a[1]))) return null;
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + dr * i, a[1] + dc * i]);
}

// ── Blokfald: falling blocks on a 10×20 board ──
export const W = 10, H = 20;
export const PIECES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
export const COLORS = { I: '#22d3ee', O: '#facc15', T: '#a855f7', S: '#4ade80', Z: '#f87171', J: '#3b82f6', L: '#fb923c' };
export const emptyBoard = () => Array.from({ length: H }, () => Array(W).fill(null));
export function cells(p) {
  const size = p.type === 'I' ? 4 : p.type === 'O' ? 3 : 3;
  return PIECES[p.type].map(([x, y]) => { let [a, b] = [x, y]; for (let k = 0; k < (p.rot % 4 + 4) % 4; k++) [a, b] = [size - 1 - b, a]; return [p.x + a, p.y + b]; });
}
export const collides = (board, p) => cells(p).some(([x, y]) => x < 0 || x >= W || y >= H || (y >= 0 && board[y][x]));
/** rotate with simple wall kicks */
export function rotate(board, p, dir = 1) {
  for (const dx of [0, -1, 1, -2, 2]) { const q = { ...p, rot: p.rot + dir, x: p.x + dx }; if (!collides(board, q)) return q; }
  return p;
}
/** lock the piece; returns { board, lines } with full lines removed */
export function lock(board, p) {
  const b = board.map(r => r.slice());
  for (const [x, y] of cells(p)) if (y >= 0) b[y][x] = p.type;
  const keep = b.filter(r => r.some(c => !c)), lines = H - keep.length;
  while (keep.length < H) keep.unshift(Array(W).fill(null));
  return { board: keep, lines };
}
export const LINE_POINTS = [0, 100, 300, 500, 800];
/** a fair bag of the seven pieces */
export function bag(rnd = Math.random) { const t = Object.keys(PIECES); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; }
export const spawn = (type) => ({ type, rot: 0, x: 3, y: -1 });
export function dropDistance(board, p) { let d = 0; while (!collides(board, { ...p, y: p.y + d + 1 })) d++; return d; }

// ── Banko ──
/** a banko plate: 3 rows, 9 columns (1–9, 10–19 … 80–90), 5 numbers in each row, each column sorted */
export function plate(rnd = Math.random) {
  for (let tries = 0; tries < 200; tries++) {
    const grid = [[], [], []].map(() => Array(9).fill(null));
    const rows = [0, 1, 2].map(() => { const cols = [...Array(9).keys()]; for (let i = 8; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; } return cols.slice(0, 5); });
    const used = Array(9).fill(0); rows.forEach(r => r.forEach(c => used[c]++));
    if (used.some(n => n === 0)) continue;
    for (let c = 0; c < 9; c++) {
      const lo = c === 0 ? 1 : c * 10, hi = c === 8 ? 90 : c * 10 + 9, pool = []; for (let v = lo; v <= hi; v++) pool.push(v);
      const pickN = used[c], picked = []; while (picked.length < pickN) { const v = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; picked.push(v); }
      picked.sort((a, b) => a - b); let k = 0;
      for (let r = 0; r < 3; r++) if (rows[r].includes(c)) grid[r][c] = picked[k++];
    }
    return grid;
  }
  return null;
}
/** how many full rows a plate has with the called numbers */
export const fullRows = (p, called) => p.filter(row => row.filter(v => v != null).every(v => called.has(v))).length;
