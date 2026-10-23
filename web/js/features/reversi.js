/**
 * Vend (reversi) – 8×8. Place a piece so that it encloses a row of the other's pieces (in any of 8 directions);
 * they all turn to your colour. If you can't place, you pass. When nobody can move, most pieces wins.
 * Board: 64 cells, 1 = seat 0 (black, starts), 2 = seat 1 (white), 0 = empty.
 */
const D = [-9, -8, -7, -1, 1, 7, 8, 9];
export function newBoard() { const b = Array(64).fill(0); b[27] = 2; b[36] = 2; b[28] = 1; b[35] = 1; return b; }
export function newGame(seats) { return { players: seats.slice(0, 2).map(p => ({ ...p })), board: newBoard(), turn: 0, phase: 'play', winner: null, last: null, log: [], passes: 0 }; }
function flipsFor(b, i, me) {
  if (b[i]) return [];
  const out = [];
  for (const d of D) {
    const line = []; let k = i + d;
    while (k >= 0 && k < 64 && Math.abs((k % 8) - ((k - d) % 8)) <= 1 && b[k] === 3 - me) { line.push(k); k += d; }
    if (line.length && k >= 0 && k < 64 && Math.abs((k % 8) - ((k - d) % 8)) <= 1 && b[k] === me) out.push(...line);
  }
  return out;
}
export const flips = (b, i, seat) => flipsFor(b, i, seat + 1);
export function legal(b, seat) { const out = []; for (let i = 0; i < 64; i++) if (flips(b, i, seat).length) out.push(i); return out; }
export const count = (b) => [b.filter(x => x === 1).length, b.filter(x => x === 2).length];
function play(b, i, seat) { const nb = b.slice(); for (const k of flips(b, i, seat)) nb[k] = seat + 1; nb[i] = seat + 1; return nb; }
export function apply(s, seat, name, args = []) {
  if (s.phase !== 'play' || seat !== s.turn || name !== 'place') return false;
  const i = args[0], f = flips(s.board, i, seat);
  if (!f.length) return false;
  s.board = play(s.board, i, seat); s.last = { seat, cell: i, flipped: f, at: Date.now() };
  let next = 1 - seat;
  if (!legal(s.board, next).length) {
    if (!legal(s.board, seat).length) { s.phase = 'over'; const [a, c] = count(s.board); s.winner = a === c ? null : a > c ? 0 : 1; return true; }
    s.log.unshift(`${s.players[next].name} kan ikke lægge og må stå over`); s.log = s.log.slice(0, 8); next = seat;
  }
  s.turn = next;
  return true;
}
const W = [100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, 1, 1, 1, 1, -2, 10, 5, -2, 1, 0, 0, 1, -2, 5];
const weight = (i) => W[(i >> 3) < 4 ? (i >> 3) * 8 + (i & 7) : (7 - (i >> 3)) * 8 + (i & 7)];
function evalB(b, me) { let v = 0; for (let i = 0; i < 64; i++) if (b[i]) v += (b[i] === me + 1 ? 1 : -1) * weight(i); return v + (legal(b, me).length - legal(b, 1 - me).length) * 3; }
function search(b, seat, me, depth, a, z) {
  const moves = legal(b, seat);
  if (depth === 0) return evalB(b, me);
  if (!moves.length) { if (!legal(b, 1 - seat).length) { const [x, y] = count(b); const d = me ? y - x : x - y; return d * 1000; } return search(b, 1 - seat, me, depth - 1, a, z); }
  let best = seat === me ? -Infinity : Infinity;
  for (const i of moves) { const v = search(play(b, i, seat), 1 - seat, me, depth - 1, a, z); if (seat === me) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); z = Math.min(z, v); } if (a >= z) break; }
  return best;
}
export function bestMove(b, seat, level = 2) {
  const moves = legal(b, seat); if (!moves.length) return null;
  if (level <= 0) return moves[Math.floor(Math.random() * moves.length)];
  const depth = [0, 1, 3, 5][level] || 3;
  let best = -Infinity, pick = moves[0];
  for (const i of moves) { const v = search(play(b, i, seat), 1 - seat, seat, depth - 1, -Infinity, Infinity) + Math.random(); if (v > best) { best = v; pick = i; } }
  return pick;
}
export function aiMove(s, seat) { if (s.phase !== 'play' || s.turn !== seat) return null; const i = bestMove(s.board, seat, s.level ?? 2); return i == null ? null : { name: 'place', args: [i] }; }
