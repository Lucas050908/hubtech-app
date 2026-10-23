/**
 * Dam – 8×8 draughts. Pieces stand on the dark squares; white (seat 0) starts at the bottom and moves up.
 * Rules: men move one step diagonally forward and capture forwards and backwards; capturing is compulsory and a
 * capture continues as long as it can; a man that ends its move on the far row becomes a king (dam), which
 * moves and captures any distance along a diagonal. You lose when you can't move. 40 moves in a row without a
 * capture or a man moving is a draw.
 * Board: 64 cells, 1/2 = white man/king, -1/-2 = black man/king, 0 = empty.
 */
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const rc = (i) => [i >> 3, i & 7];
const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
export const dark = (i) => ((i >> 3) + (i & 7)) % 2 === 1;
const side = (v) => (v > 0 ? 0 : v < 0 ? 1 : -1);     // seat that owns a piece

export function newBoard() {
  const b = Array(64).fill(0);
  for (let i = 0; i < 64; i++) if (dark(i)) { const r = i >> 3; if (r < 3) b[i] = -1; else if (r > 4) b[i] = 1; }
  return b;
}
export function newGame(seats) {
  return { players: seats.slice(0, 2).map((p, i) => ({ ...p, color: i ? 'Sort' : 'Hvid' })), board: newBoard(), turn: 0, phase: 'play', quiet: 0, last: null, winner: null, moves: 0, log: [] };
}

/** all capture sequences from a cell: [{ path: [from, …, to], caps: [cells] }] */
function captures(b, from) {
  const v = b[from], king = Math.abs(v) === 2, me = side(v), out = [];
  const walk = (cur, path, caps, board) => {
    let more = false;
    const [r, c] = rc(cur);
    for (const [dr, dc] of DIRS) {
      if (king) {
        let k = 1, rr = r + dr, cc = c + dc;
        while (at(rr, cc) >= 0 && board[at(rr, cc)] === 0) { rr += dr; cc += dc; k++; }
        const mid = at(rr, cc);
        if (mid < 0 || side(board[mid]) !== 1 - me || caps.includes(mid)) continue;
        let r2 = rr + dr, c2 = cc + dc;
        while (at(r2, c2) >= 0 && board[at(r2, c2)] === 0) {
          const to = at(r2, c2), nb = board.slice(); nb[cur] = 0; nb[to] = v;
          more = true; walk(to, [...path, to], [...caps, mid], nb);
          r2 += dr; c2 += dc;
        }
      } else {
        const mid = at(r + dr, c + dc), to = at(r + 2 * dr, c + 2 * dc);
        if (mid < 0 || to < 0 || board[to] !== 0 || side(board[mid]) !== 1 - me || caps.includes(mid)) continue;
        const nb = board.slice(); nb[cur] = 0; nb[to] = v;
        more = true; walk(to, [...path, to], [...caps, mid], nb);
      }
    }
    if (!more && caps.length) out.push({ path, caps });
  };
  walk(from, [from], [], b);
  return out;
}
function steps(b, from) {
  const v = b[from], king = Math.abs(v) === 2, [r, c] = rc(from), out = [];
  for (const [dr, dc] of DIRS) {
    if (!king && dr !== (v > 0 ? -1 : 1)) continue;
    let rr = r + dr, cc = c + dc;
    while (at(rr, cc) >= 0 && b[at(rr, cc)] === 0) { out.push({ path: [from, at(rr, cc)], caps: [] }); if (!king) break; rr += dr; cc += dc; }
  }
  return out;
}
/** every legal move for a seat (captures are compulsory) */
export function legalMoves(b, seat) {
  const mine = []; for (let i = 0; i < 64; i++) if (side(b[i]) === seat) mine.push(i);
  const caps = mine.flatMap(i => captures(b, i));
  return caps.length ? caps : mine.flatMap(i => steps(b, i));
}
function play(b, mv) {
  const nb = b.slice(), from = mv.path[0], to = mv.path.at(-1), v = nb[from];
  nb[from] = 0; for (const c of mv.caps) nb[c] = 0;
  nb[to] = Math.abs(v) === 1 && ((v > 0 && to >> 3 === 0) || (v < 0 && to >> 3 === 7)) ? v * 2 : v;
  return nb;
}

export function apply(s, seat, name, args) {
  if (s.phase !== 'play' || seat !== s.turn) return false;
  if (name === 'resign') { s.phase = 'over'; s.winner = 1 - seat; s.log.unshift(`${s.players[seat].name} gav op`); return true; }
  if (name !== 'move') return false;
  const [from, to] = args;
  const mv = legalMoves(s.board, seat).find(m => m.path[0] === from && m.path.at(-1) === to);
  if (!mv) return false;
  const wasMan = Math.abs(s.board[from]) === 1;
  s.board = play(s.board, mv);
  s.last = mv; s.moves++;
  s.quiet = mv.caps.length || wasMan ? 0 : s.quiet + 1;
  if (mv.caps.length) s.log.unshift(`${s.players[seat].name} slog ${mv.caps.length} brik${mv.caps.length > 1 ? 'ker' : ''}`);
  if (wasMan && Math.abs(s.board[to]) === 2) s.log.unshift(`${s.players[seat].name} fik en dam!`);
  s.log = s.log.slice(0, 20);
  s.turn = 1 - seat;
  if (!legalMoves(s.board, s.turn).length) { s.phase = 'over'; s.winner = seat; }
  else if (s.quiet >= 40) { s.phase = 'over'; s.winner = null; s.log.unshift('Uafgjort – 40 træk uden slag'); }
  return true;
}

// ── the computer ──
function evaluate(b, seat) {
  let sc = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v) continue;
    const r = i >> 3, val = Math.abs(v) === 2 ? 3.2 : 1 + (v > 0 ? (7 - r) : r) * 0.04 + ((i & 7) > 1 && (i & 7) < 6 ? 0.05 : 0);
    sc += side(v) === seat ? val : -val;
  }
  return sc;
}
function search(b, seat, me, depth, alpha, beta) {
  const moves = legalMoves(b, seat);
  if (!moves.length) return seat === me ? -100 - depth : 100 + depth;
  if (depth === 0) return evaluate(b, me);
  if (seat === me) {
    let best = -Infinity;
    for (const m of moves) { best = Math.max(best, search(play(b, m), 1 - seat, me, depth - 1, alpha, beta)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { best = Math.min(best, search(play(b, m), 1 - seat, me, depth - 1, alpha, beta)); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}
export function bestMove(b, seat, level = 2, rnd = Math.random) {
  const moves = legalMoves(b, seat);
  if (!moves.length) return null;
  if (level <= 0) return moves[Math.floor(rnd() * moves.length)];
  const depth = [0, 2, 4, 6][level] || 4;
  let best = -Infinity, pick = [];
  for (const m of moves) {
    const v = search(play(b, m), 1 - seat, seat, depth - 1, -Infinity, Infinity) + rnd() * 0.01;
    if (v > best + 1e-9) { best = v; pick = [m]; } else if (Math.abs(v - best) < 1e-9) pick.push(m);
  }
  return pick[0];
}
export function aiMove(s, seat) {
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const m = bestMove(s.board, seat, s.level ?? 2);
  return m ? { name: 'move', args: [m.path[0], m.path.at(-1)] } : null;
}
export const count = (b) => ({ white: b.filter(v => v > 0).length, black: b.filter(v => v < 0).length });
