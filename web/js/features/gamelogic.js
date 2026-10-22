/** Pure game logic for Sudoku, Fire på stribe and Galgeleg (unit-tested in tests/apps.test.mjs). */

// ── Sudoku: 81 numbers in a flat array, 0 = empty ──
const rnd = (n, r = Math.random) => Math.floor(r() * n);
const shuffled = (a, r = Math.random) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = rnd(i + 1, r); [x[i], x[j]] = [x[j], x[i]]; } return x; };

export function canPlace(g, i, v) {
  const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3;
  for (let k = 0; k < 9; k++) {
    if (g[r * 9 + k] === v && r * 9 + k !== i) return false;
    if (g[k * 9 + c] === v && k * 9 + c !== i) return false;
    const bi = (br + Math.floor(k / 3)) * 9 + bc + k % 3;
    if (g[bi] === v && bi !== i) return false;
  }
  return true;
}

/** Number of solutions, stopping at `limit`. */
export function countSolutions(g0, limit = 2) {
  const g = [...g0];
  let n = 0;
  (function solve() {
    if (n >= limit) return;
    let best = -1, opts = null;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const o = []; for (let v = 1; v <= 9; v++) if (canPlace(g, i, v)) o.push(v);
      if (!o.length) return;
      if (!opts || o.length < opts.length) { best = i; opts = o; if (o.length === 1) break; }
    }
    if (best < 0) { n++; return; }
    for (const v of opts) { g[best] = v; solve(); g[best] = 0; if (n >= limit) return; }
  })();
  return n;
}

function fillGrid(r) {
  const g = Array(81).fill(0);
  (function fill(i) {
    if (i === 81) return true;
    for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], r)) if (canPlace(g, i, v)) { g[i] = v; if (fill(i + 1)) return true; g[i] = 0; }
    return false;
  })(0);
  return g;
}

export const SUDOKU_LEVELS = { easy: { label: 'Let', clues: 40 }, medium: { label: 'Middel', clues: 32 }, hard: { label: 'Svær', clues: 27 } };

/** A puzzle with exactly one solution. */
export function makeSudoku(level = 'easy', r = Math.random) {
  const solution = fillGrid(r);
  const puzzle = [...solution];
  const target = SUDOKU_LEVELS[level]?.clues ?? 40;
  let filled = 81;
  for (const i of shuffled([...Array(81).keys()], r)) {
    if (filled <= target) break;
    const keep = puzzle[i]; puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[i] = keep; else filled--;
  }
  return { puzzle, solution };
}

// ── Fire på stribe: 7 columns × 6 rows, board[row][col], row 0 at the top; 0 empty, 1 you, 2 the computer ──
export const C4_ROWS = 6, C4_COLS = 7;
export const c4Empty = () => Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(0));
export const c4Valid = (b) => [...Array(C4_COLS).keys()].filter(c => b[0][c] === 0);
export function c4Drop(b, col, p) {
  for (let r = C4_ROWS - 1; r >= 0; r--) if (b[r][col] === 0) { b[r][col] = p; return r; }
  return -1;
}
/** { player, cells } for four in a row, otherwise null. */
export function c4Winner(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < C4_ROWS; r++) for (let c = 0; c < C4_COLS; c++) {
    const p = b[r][c]; if (!p) continue;
    for (const [dr, dc] of dirs) {
      const cells = [[r, c]];
      for (let k = 1; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= C4_ROWS || cc < 0 || cc >= C4_COLS || b[rr][cc] !== p) break; cells.push([rr, cc]); }
      if (cells.length === 4) return { player: p, cells };
    }
  }
  return null;
}
function c4Score(b, me) {
  const op = me === 1 ? 2 : 1;
  let s = 0;
  for (let r = 0; r < C4_ROWS; r++) if (b[r][3] === me) s += 3;
  const lines = [];
  for (let r = 0; r < C4_ROWS; r++) for (let c = 0; c < C4_COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const w = []; for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= C4_ROWS || cc < 0 || cc >= C4_COLS) break; w.push(b[rr][cc]); }
    if (w.length === 4) lines.push(w);
  }
  for (const w of lines) {
    const m = w.filter(x => x === me).length, o = w.filter(x => x === op).length, e = 4 - m - o;
    if (m === 3 && e === 1) s += 5; else if (m === 2 && e === 2) s += 2;
    if (o === 3 && e === 1) s -= 4;
  }
  return s;
}
function minimax(b, depth, a, beta, maxing, me) {
  const w = c4Winner(b), valid = c4Valid(b);
  if (w) return w.player === me ? 100000 + depth : -100000 - depth;
  if (!valid.length) return 0;
  if (depth === 0) return c4Score(b, me);
  const order = valid.sort((x, y) => Math.abs(3 - x) - Math.abs(3 - y));
  const p = maxing ? me : (me === 1 ? 2 : 1);
  let best = maxing ? -Infinity : Infinity;
  for (const c of order) {
    const r = c4Drop(b, c, p);
    const v = minimax(b, depth - 1, a, beta, !maxing, me);
    b[r][c] = 0;
    if (maxing) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (a >= beta) break;
  }
  return best;
}
export const C4_LEVELS = { easy: { label: 'Let', depth: 1 }, medium: { label: 'Middel', depth: 3 }, hard: { label: 'Svær', depth: 6 } };
/** The computer's move for player `me`. */
export function c4Best(b0, me = 2, depth = 4, r = Math.random) {
  const b = b0.map(row => [...row]);
  const valid = c4Valid(b);
  if (!valid.length) return -1;
  if (depth <= 1 && r() < 0.35) return valid[rnd(valid.length, r)];   // the easy level makes mistakes
  let best = -Infinity, moves = [];
  for (const c of valid.sort((x, y) => Math.abs(3 - x) - Math.abs(3 - y))) {
    const row = c4Drop(b, c, me);
    const v = minimax(b, depth - 1, -Infinity, Infinity, false, me);
    b[row][c] = 0;
    if (v > best) { best = v; moves = [c]; } else if (v === best) moves.push(c);
  }
  return moves[rnd(moves.length, r)];
}

// ── Galgeleg ──
export const normWord = (w) => String(w).toUpperCase();
/** Letters that are part of the guess (A–Å); anything else (space, dash, digits) is shown from the start. */
export const isGuessable = (ch) => /[A-ZÆØÅ]/.test(ch);
export function hangState(word, guessed) {
  const W = normWord(word), g = new Set(guessed);
  const shown = [...W].map(ch => (!isGuessable(ch) || g.has(ch) ? ch : '_'));
  const wrong = [...g].filter(ch => !W.includes(ch));
  return { shown, wrong, won: !shown.includes('_'), lost: wrong.length >= 7 };
}
