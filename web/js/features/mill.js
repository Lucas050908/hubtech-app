/**
 * Mølle – 24 points on three squares. First both place 9 pieces each, then move along the lines.
 * Three in a row along a line (a mill) lets you take one of the other's pieces – not one in a mill, unless all
 * of them are. With only three pieces left you may jump anywhere. Fewer than three pieces or no moves: you lose.
 */
export const XY = [[0, 0], [0, 3], [0, 6], [1, 1], [1, 3], [1, 5], [2, 2], [2, 3], [2, 4], [3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [3, 6], [4, 2], [4, 3], [4, 4], [5, 1], [5, 3], [5, 5], [6, 0], [6, 3], [6, 6]];
export const ADJ = [[1, 9], [0, 2, 4], [1, 14], [4, 10], [1, 3, 5, 7], [4, 13], [7, 11], [4, 6, 8], [7, 12], [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23], [11, 16], [15, 17, 19], [12, 16], [10, 19], [16, 18, 20, 22], [13, 19], [9, 22], [19, 21, 23], [14, 22]];
export const MILLS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23], [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]];
export function newGame(seats) { return { players: seats.slice(0, 2).map(p => ({ ...p })), board: Array(24).fill(-1), hand: [9, 9], turn: 0, phase: 'play', remove: false, winner: null, last: null, log: [], quiet: 0 }; }
export const inMill = (b, p) => b[p] >= 0 && MILLS.some(m => m.includes(p) && m.every(q => b[q] === b[p]));
export const pieces = (b, seat) => b.filter(x => x === seat).length;
const say = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 10); };
/** legal actions for the seat to move: { place: [points] } | { move: [[from, to]] } | { remove: [points] } */
export function options(s, seat) {
  const b = s.board;
  if (s.remove) {
    const theirs = b.map((x, i) => (x === 1 - seat ? i : -1)).filter(i => i >= 0), free = theirs.filter(i => !inMill(b, i));
    return { remove: free.length ? free : theirs };
  }
  if (s.hand[seat] > 0) return { place: b.map((x, i) => (x < 0 ? i : -1)).filter(i => i >= 0) };
  const fly = pieces(b, seat) === 3, out = [];
  b.forEach((x, i) => { if (x !== seat) return; const to = fly ? b.map((y, k) => (y < 0 ? k : -1)).filter(k => k >= 0) : ADJ[i].filter(k => b[k] < 0); to.forEach(k => out.push([i, k])); });
  return { move: out };
}
function endCheck(s) {
  const o = 1 - s.turn;
  if (s.hand[o] === 0 && pieces(s.board, o) < 3) { s.phase = 'over'; s.winner = s.turn; say(s, `${s.players[o].name} har kun to brikker tilbage`); return true; }
  return false;
}
function nextTurn(s) {
  s.turn = 1 - s.turn;
  const op = options(s, s.turn);
  if (op.move && !op.move.length) { s.phase = 'over'; s.winner = 1 - s.turn; say(s, `${s.players[s.turn].name} kan ikke flytte`); }
  if (s.quiet >= 60) { s.phase = 'over'; s.winner = null; say(s, 'Uafgjort – 60 træk uden at tage en brik'); }
}
export function apply(s, seat, name, args = []) {
  if (s.phase !== 'play' || seat !== s.turn) return false;
  const op = options(s, seat);
  if (name === 'remove') {
    const p = args[0]; if (!op.remove || !op.remove.includes(p)) return false;
    s.board[p] = -1; s.remove = false; s.quiet = 0; s.last = { ...s.last, removed: p };
    say(s, `${s.players[seat].name} tog en brik`);
    if (!endCheck(s)) nextTurn(s);
    return true;
  }
  let to;
  if (name === 'place') { to = args[0]; if (!op.place || !op.place.includes(to)) return false; s.board[to] = seat; s.hand[seat]--; s.last = { seat, to, at: Date.now() }; }
  else if (name === 'move') { const [f, t] = args; if (!op.move || !op.move.some(([a, b]) => a === f && b === t)) return false; s.board[f] = -1; s.board[t] = seat; to = t; s.quiet++; s.last = { seat, from: f, to, at: Date.now() }; }
  else return false;
  if (inMill(s.board, to)) { s.remove = true; say(s, `${s.players[seat].name} fik en mølle!`); return true; }
  nextTurn(s);
  return true;
}
/** a simple computer: make a mill > stop the other's mill > take a piece that threatens > random */
export function aiMove(s, seat) {
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const op = options(s, seat), b = s.board;
  const wouldMill = (bb, p, who) => MILLS.some(m => m.includes(p) && m.every(q => (q === p ? true : bb[q] === who)));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (op.remove) {
    const threat = op.remove.filter(p => MILLS.some(m => m.includes(p) && m.filter(q => b[q] === 1 - seat).length === 2 && m.some(q => b[q] < 0)));
    return { name: 'remove', args: [pick(threat.length ? threat : op.remove)] };
  }
  if (op.place) {
    const win = op.place.filter(p => wouldMill(b, p, seat)); if (win.length) return { name: 'place', args: [win[0]] };
    const block = op.place.filter(p => wouldMill(b, p, 1 - seat)); if (block.length) return { name: 'place', args: [block[0]] };
    const good = op.place.filter(p => ADJ[p].length >= 3);
    return { name: 'place', args: [pick(good.length ? good : op.place)] };
  }
  const mv = op.move;
  const win = mv.filter(([f, t]) => { const bb = b.slice(); bb[f] = -1; return wouldMill(bb, t, seat); });
  if (win.length) return { name: 'move', args: pick(win) };
  const safe = mv.filter(([f, t]) => { const bb = b.slice(); bb[f] = -1; bb[t] = seat; return !options({ ...s, board: bb, turn: 1 - seat }, 1 - seat).move?.some(([a, c]) => { const b2 = bb.slice(); b2[a] = -1; return wouldMill(b2, c, 1 - seat); }); });
  return { name: 'move', args: pick(safe.length ? safe : mv) };
}
