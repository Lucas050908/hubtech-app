/**
 * Kalaha – 6 pits each and a store (kalaha) at the end. Pick one of your pits and sow its stones one by one
 * counter-clockwise (skipping the other player's store). Last stone in your own store: go again.
 * Last stone in an empty pit on your side: take it and the stones opposite into your store.
 * When one side is empty the game ends, and the rest go to the one who owns them. Most stones wins.
 * Board: 0–5 seat 0's pits, 6 seat 0's store, 7–12 seat 1's pits, 13 seat 1's store.
 */
export const STORE = [6, 13];
export const pitsOf = (seat) => (seat ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5]);
export function newGame(seats, stones = 4) {
  const b = Array(14).fill(stones); b[6] = 0; b[13] = 0;
  return { players: seats.slice(0, 2).map(p => ({ ...p })), board: b, turn: 0, phase: 'play', winner: null, last: null, log: [], stones };
}
export const legal = (b, seat) => pitsOf(seat).filter(i => b[i] > 0);
/** sow from pit i; returns { board, again, captured, path } */
export function sow(b0, seat, i) {
  const b = b0.slice(); let n = b[i], k = i; const path = [];
  b[i] = 0;
  while (n > 0) { k = (k + 1) % 14; if (k === STORE[1 - seat]) continue; b[k]++; n--; path.push(k); }
  let captured = 0;
  if (pitsOf(seat).includes(k) && b[k] === 1 && b[12 - k] > 0) { captured = b[12 - k] + 1; b[STORE[seat]] += captured; b[k] = 0; b[12 - k] = 0; }
  return { board: b, again: k === STORE[seat], captured, path };
}
function finish(b) {
  if (pitsOf(0).every(i => !b[i]) || pitsOf(1).every(i => !b[i])) {
    for (const s of [0, 1]) for (const i of pitsOf(s)) { b[STORE[s]] += b[i]; b[i] = 0; }
    return true;
  }
  return false;
}
export function apply(s, seat, name, args = []) {
  if (s.phase !== 'play' || seat !== s.turn || name !== 'sow') return false;
  const i = args[0];
  if (!legal(s.board, seat).includes(i)) return false;
  const r = sow(s.board, seat, i);
  s.board = r.board; s.last = { seat, pit: i, path: r.path, captured: r.captured, at: Date.now() };
  if (r.captured) { s.log.unshift(`${s.players[seat].name} fangede ${r.captured} sten`); s.log = s.log.slice(0, 10); }
  if (finish(s.board)) { s.phase = 'over'; s.winner = s.board[6] === s.board[13] ? null : s.board[6] > s.board[13] ? 0 : 1; return true; }
  if (!r.again) s.turn = 1 - seat; else { s.log.unshift(`${s.players[seat].name} får en tur mere`); s.log = s.log.slice(0, 10); }
  return true;
}
function search(b, seat, me, depth, a, z) {
  const t = b.slice();
  if (finish(t) || depth === 0) return t[STORE[me]] - t[STORE[1 - me]];
  const moves = legal(b, seat);
  let best = seat === me ? -Infinity : Infinity;
  for (const i of moves) {
    const r = sow(b, seat, i), next = r.again ? seat : 1 - seat, v = search(r.board, next, me, depth - 1, a, z);
    if (seat === me) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); z = Math.min(z, v); }
    if (a >= z) break;
  }
  return best;
}
export function bestMove(b, seat, level = 2) {
  const moves = legal(b, seat); if (!moves.length) return null;
  if (level <= 0) return moves[Math.floor(Math.random() * moves.length)];
  const depth = [0, 2, 5, 8][level] || 5;
  let best = -Infinity, pick = moves[0];
  for (const i of moves) { const r = sow(b, seat, i), v = search(r.board, r.again ? seat : 1 - seat, seat, depth - 1, -Infinity, Infinity) + Math.random() * 0.01; if (v > best) { best = v; pick = i; } }
  return pick;
}
export function aiMove(s, seat) {
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const i = bestMove(s.board, seat, s.level ?? 2);
  return i == null ? null : { name: 'sow', args: [i] };
}
