/**
 * Ludo for 2–4. Each player has 4 pieces. Roll a 6 to bring a piece out; a 6 also gives another roll.
 * Landing on a single opposing piece sends it home – except on the four start squares, which are safe.
 * After 51 steps around the board a piece turns into its own home row (5 squares) and must reach the goal
 * with an exact roll. When all your pieces are at home you get up to three tries to roll a 6.
 * Piece positions are counted from the player's own start: -1 = at home, 0–50 on the track, 51–55 home row, 56 = goal.
 */
export const COLORS = [{ name: 'Rød', hex: '#ef4444' }, { name: 'Grøn', hex: '#22c55e' }, { name: 'Gul', hex: '#eab308' }, { name: 'Blå', hex: '#3b82f6' }];
export const GOAL = 56;
const TRACK = 52;

export function newGame(seats, rnd = Math.random) {
  const n = Math.min(4, Math.max(2, seats.length));
  const colorIdx = n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n);
  return {
    players: seats.slice(0, n).map((p, i) => ({ ...p, color: colorIdx[i] })),
    pieces: Array.from({ length: n }, () => [-1, -1, -1, -1]),
    turn: Math.floor(rnd() * n), phase: 'roll', die: null, tries: 0, sixes: 0, winner: null, finished: [], log: [], last: null,
  };
}
/** the square on the shared track (0–51), or null when not on the track */
export const square = (s, seat, pos) => (pos >= 0 && pos <= 50 ? (s.players[seat].color * 13 + pos) % TRACK : null);
const SAFE = new Set([0, 13, 26, 39]);
export const isSafe = (sq) => SAFE.has(sq);

/** which pieces can move with the die */
export function movable(s, seat, die = s.die) {
  if (die == null) return [];
  return s.pieces[seat].map((pos, i) => {
    if (pos === GOAL) return -1;
    if (pos === -1) return die === 6 ? i : -1;
    return pos + die <= GOAL ? i : -1;
  }).filter(i => i >= 0);
}
/** where a piece ends and who it would send home */
export function preview(s, seat, i, die = s.die) {
  const pos = s.pieces[seat][i], to = pos === -1 ? 0 : pos + die, sq = square(s, seat, to), hits = [];
  if (sq != null && !isSafe(sq)) s.pieces.forEach((ps, o) => { if (o !== seat) ps.forEach((p, k) => { if (square(s, o, p) === sq) hits.push([o, k]); }); });
  // two pieces of the same colour on a square protect each other
  const byOwner = {}; hits.forEach(([o]) => { byOwner[o] = (byOwner[o] || 0) + 1; });
  return { to, sq, hits: hits.filter(([o]) => byOwner[o] === 1) };
}
const allHome = (s, seat) => s.pieces[seat].every(p => p === -1 || p === GOAL);
function nextTurn(s) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) { const t = (s.turn + k) % n; if (!s.finished.includes(t)) { s.turn = t; break; } }
  s.phase = 'roll'; s.die = null; s.tries = 0; s.sixes = 0;
}
const say = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 12); };

export function apply(s, seat, name, args = [], rnd = Math.random) {
  if (s.phase === 'over' || seat !== s.turn) return false;
  const who = s.players[seat].name;
  if (name === 'roll') {
    if (s.phase !== 'roll') return false;
    const die = 1 + Math.floor(rnd() * 6);
    s.die = die; s.last = { roll: die, seat, at: Date.now() };
    if (die === 6) s.sixes++;
    if (s.sixes === 3) { say(s, `${who} slog tre seksere i træk – turen går videre`); nextTurn(s); return true; }
    const m = movable(s, seat, die);
    if (!m.length) {
      if (allHome(s, seat) && s.tries < 2) { s.tries++; s.phase = 'roll'; say(s, `${who} slog ${die} – prøv igen (${s.tries + 1}/3)`); return true; }
      say(s, `${who} slog ${die} og kan ikke flytte`);
      if (die === 6) { s.phase = 'roll'; s.die = null; return true; }
      nextTurn(s); return true;
    }
    s.phase = 'move';
    return true;
  }
  if (name === 'move') {
    if (s.phase !== 'move') return false;
    const i = args[0];
    if (!movable(s, seat).includes(i)) return false;
    const { to, hits } = preview(s, seat, i);
    const was = s.pieces[seat][i];
    s.pieces[seat][i] = to;
    for (const [o, k] of hits) { s.pieces[o][k] = -1; say(s, `${who} sendte ${s.players[o].name} hjem!`); }
    s.last = { ...s.last, move: [seat, i, was, to], hits };
    if (to === GOAL) {
      say(s, `${who} fik en brik i mål`);
      if (s.pieces[seat].every(p => p === GOAL)) {
        s.finished.push(seat);
        if (s.winner == null) s.winner = seat;
        say(s, `${who} er færdig som nr. ${s.finished.length}!`);
        if (s.finished.length >= s.players.length - 1) { s.phase = 'over'; return true; }
        nextTurn(s); return true;
      }
    }
    if (s.die === 6 || hits.length) { s.phase = 'roll'; s.die = null; s.tries = 0; return true; }   // a 6 or a hit: roll again
    nextTurn(s);
    return true;
  }
  return false;
}

/** the computer: hit someone > reach the goal > bring a piece out > run from danger > move the front piece */
export function aiMove(s, seat) {
  if (s.phase === 'over' || s.turn !== seat) return null;
  if (s.phase === 'roll') return { name: 'roll', args: [] };
  const opts = movable(s, seat);
  if (!opts.length) return null;
  const danger = (sq) => sq != null && !isSafe(sq) && s.pieces.some((ps, o) => o !== seat && ps.some(p => { const q = square(s, o, p); if (q == null) return false; const d = (sq - q + TRACK) % TRACK; return d >= 1 && d <= 6; }));
  let best = opts[0], bestV = -Infinity;
  for (const i of opts) {
    const pos = s.pieces[seat][i], pv = preview(s, seat, i);
    let v = pv.hits.length * 100 + (pv.to === GOAL ? 80 : 0) + (pos === -1 ? 60 : 0) + (pv.to >= 51 && pos <= 50 ? 40 : 0);
    if (danger(square(s, seat, pos))) v += 25;
    if (danger(pv.sq)) v -= 30;
    if (isSafe(pv.sq ?? -1)) v += 10;
    v += pos / 10;
    if (v > bestV) { bestV = v; best = i; }
  }
  return { name: 'move', args: [best] };
}

// ── the board: a 15×15 grid ──
const TRACK_CELLS = (() => {
  const p = [];
  for (let c = 1; c <= 5; c++) p.push([6, c]);
  for (let r = 5; r >= 0; r--) p.push([r, 6]);
  p.push([0, 7]);
  for (let r = 0; r <= 5; r++) p.push([r, 8]);
  for (let c = 9; c <= 14; c++) p.push([6, c]);
  p.push([7, 14]);
  for (let c = 14; c >= 9; c--) p.push([8, c]);
  for (let r = 9; r <= 14; r++) p.push([r, 8]);
  p.push([14, 7]);
  for (let r = 14; r >= 9; r--) p.push([r, 6]);
  for (let c = 5; c >= 0; c--) p.push([8, c]);
  p.push([7, 0], [6, 0]);
  return p;
})();
const HOME_ROWS = [[1, 2, 3, 4, 5].map(c => [7, c]), [1, 2, 3, 4, 5].map(r => [r, 7]), [13, 12, 11, 10, 9].map(c => [7, c]), [13, 12, 11, 10, 9].map(r => [r, 7])];
const YARDS = [[[2, 2], [2, 3], [3, 2], [3, 3]], [[2, 11], [2, 12], [3, 11], [3, 12]], [[11, 11], [11, 12], [12, 11], [12, 12]], [[11, 2], [11, 3], [12, 2], [12, 3]]];
export const trackCell = (sq) => TRACK_CELLS[sq];
export const homeRow = (color) => HOME_ROWS[color];
/** grid [row, col] of a piece */
export function cellOf(s, seat, i) {
  const pos = s.pieces[seat][i], col = s.players[seat].color;
  if (pos === -1) return YARDS[col][i];
  if (pos === GOAL) return [7, 7];
  if (pos > 50) return HOME_ROWS[col][pos - 51];
  return TRACK_CELLS[square(s, seat, pos)];
}
