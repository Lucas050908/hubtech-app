/**
 * Skak – pure chess logic (unit-tested in tests/apps.test.mjs): legal moves with castling, en passant and promotion,
 * check, mate, stalemate, draws (50 moves, threefold repetition, too little material) and the computer (alpha-beta).
 * The board is 64 squares, 0 = a8 … 63 = h1. White pieces are upper case (PNBRQK), black lower case, '' empty.
 */
const START = 'rnbqkbnrpppppppp' + ' '.repeat(32) + 'PPPPPPPPRNBQKBNR';
export const FILES = 'abcdefgh';
export const sqName = (i) => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
export const sqIndex = (n) => (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]);
const colorOf = (p) => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');
const other = (c) => (c === 'w' ? 'b' : 'w');
const rowOf = (i) => Math.floor(i / 8), colOf = (i) => i % 8;
export const NAMES = { p: 'bonde', n: 'springer', b: 'løber', r: 'tårn', q: 'dronning', k: 'konge' };
export const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

export function newGame() {
  const s = { board: [...START].map(ch => (ch === ' ' ? '' : ch)), turn: 'w', castle: 'KQkq', ep: -1, half: 0, full: 1, moves: [], last: null, result: null, reps: {} };
  s.reps[posKey(s)] = 1;
  return s;
}
/** A position from FEN (used by the tests and for 'start from a position'). */
export function fromFEN(fen) {
  const [pos, turn = 'w', castle = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const board = [];
  for (const ch of pos.replace(/\//g, '')) { if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) board.push(''); else board.push(ch); }
  const s = { board, turn, castle: castle === '-' ? '' : castle, ep: ep === '-' ? -1 : sqIndex(ep), half: Number(half), full: Number(full), moves: [], last: null, result: null, reps: {} };
  s.reps[posKey(s)] = 1;
  return s;
}
export const posKey = (s) => `${s.board.map(p => p || '.').join('')}${s.turn}${s.castle}${s.ep}`;

const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

/** Is square i attacked by colour `by`? */
export function attacked(b, i, by) {
  const r = rowOf(i), c = colOf(i);
  const is = (rr, cc, set) => { if (!on(rr, cc)) return false; const p = b[rr * 8 + cc]; return !!p && set.includes(p); };
  const up = by === 'w' ? 'P' : 'p', dr = by === 'w' ? 1 : -1;         // a white pawn attacks upwards, so it sits below
  if (is(r + dr, c - 1, up) || is(r + dr, c + 1, up)) return true;
  const n = by === 'w' ? 'N' : 'n', k = by === 'w' ? 'K' : 'k';
  for (const [a, d] of KN) if (is(r + a, c + d, n)) return true;
  for (const [a, d] of KG) if (is(r + a, c + d, k)) return true;
  const bq = by === 'w' ? 'BQ' : 'bq', rq = by === 'w' ? 'RQ' : 'rq';
  for (const [dirs, set] of [[DIAG, bq], [ORTH, rq]]) for (const [a, d] of dirs) {
    let rr = r + a, cc = c + d;
    while (on(rr, cc)) { const p = b[rr * 8 + cc]; if (p) { if (set.includes(p)) return true; break; } rr += a; cc += d; }
  }
  return false;
}
export const kingSq = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (s, c = s.turn) => attacked(s.board, kingSq(s.board, c), other(c));

/** Moves that follow the piece rules, ignoring whether your own king is left in check. */
function pseudo(s, c = s.turn) {
  const b = s.board, out = [];
  const add = (from, to, extra) => out.push({ from, to, ...extra });
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p || colorOf(p) !== c) continue;
    const t = p.toLowerCase(), r = rowOf(i), col = colOf(i);
    if (t === 'p') {
      const d = c === 'w' ? -1 : 1, startRow = c === 'w' ? 6 : 1, lastRow = c === 'w' ? 0 : 7;
      const one = i + d * 8;
      const push = (to, extra = {}) => { if (rowOf(to) === lastRow) for (const pr of 'qrbn') add(i, to, { ...extra, promo: pr }); else add(i, to, extra); };
      if (on(r + d, col) && !b[one]) { push(one); if (r === startRow && !b[one + d * 8]) add(i, one + d * 8, { double: true }); }
      for (const dc of [-1, 1]) {
        if (!on(r + d, col + dc)) continue;
        const to = (r + d) * 8 + col + dc;
        if (b[to] && colorOf(b[to]) !== c) push(to, { cap: b[to] });
        else if (to === s.ep) add(i, to, { ep: true, cap: c === 'w' ? 'p' : 'P' });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [a, d] of t === 'n' ? KN : KG) {
        if (!on(r + a, col + d)) continue;
        const to = (r + a) * 8 + col + d;
        if (!b[to]) add(i, to); else if (colorOf(b[to]) !== c) add(i, to, { cap: b[to] });
      }
      if (t === 'k') {
        const home = c === 'w' ? 60 : 4, [ks, qs] = c === 'w' ? ['K', 'Q'] : ['k', 'q'], o = other(c);
        if (i === home && !attacked(b, home, o)) {
          if (s.castle.includes(ks) && !b[home + 1] && !b[home + 2] && b[home + 3] === (c === 'w' ? 'R' : 'r') && !attacked(b, home + 1, o) && !attacked(b, home + 2, o)) add(i, home + 2, { castle: 'k' });
          if (s.castle.includes(qs) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (c === 'w' ? 'R' : 'r') && !attacked(b, home - 1, o) && !attacked(b, home - 2, o)) add(i, home - 2, { castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : [...DIAG, ...ORTH];
      for (const [a, d] of dirs) {
        let rr = r + a, cc = col + d;
        while (on(rr, cc)) {
          const to = rr * 8 + cc;
          if (!b[to]) add(i, to); else { if (colorOf(b[to]) !== c) add(i, to, { cap: b[to] }); break; }
          rr += a; cc += d;
        }
      }
    }
  }
  return out;
}

const CASTLE_SQ = { 60: 'KQ', 4: 'kq', 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };    // moving from/to these squares ends castling rights
/** Make a move on the state (no checks) and return what is needed to take it back. */
function make(s, m) {
  const b = s.board, p = b[m.from], c = colorOf(p);
  const undo = { m, p, castle: s.castle, ep: s.ep, half: s.half, capSq: m.ep ? m.to + (c === 'w' ? 8 : -8) : m.to, capP: m.ep ? b[m.to + (c === 'w' ? 8 : -8)] : b[m.to] };
  b[undo.capSq] = '';
  b[m.to] = m.promo ? (c === 'w' ? m.promo.toUpperCase() : m.promo) : p;
  b[m.from] = '';
  if (m.castle) { const home = c === 'w' ? 60 : 4; if (m.castle === 'k') { b[home + 1] = b[home + 3]; b[home + 3] = ''; } else { b[home - 1] = b[home - 4]; b[home - 4] = ''; } }
  let cr = s.castle;
  const strip = (sq) => { for (const ch of CASTLE_SQ[sq] || '') cr = cr.replace(ch, ''); };
  strip(m.from); strip(m.to);
  s.castle = cr;
  s.ep = m.double ? (m.from + m.to) / 2 : -1;
  s.half = p.toLowerCase() === 'p' || undo.capP ? 0 : s.half + 1;
  s.turn = other(c);
  return undo;
}
function unmake(s, u) {
  const b = s.board, m = u.m, c = colorOf(u.p);
  b[m.from] = u.p; b[m.to] = ''; b[u.capSq] = u.capP;
  if (m.castle) { const home = c === 'w' ? 60 : 4; if (m.castle === 'k') { b[home + 3] = b[home + 1]; b[home + 1] = ''; } else { b[home - 4] = b[home - 1]; b[home - 1] = ''; } }
  s.castle = u.castle; s.ep = u.ep; s.half = u.half; s.turn = c;
}

/** All legal moves for the side to move (or only those from square `from`). */
export function legalMoves(s, from = -1) {
  const c = s.turn, out = [];
  for (const m of pseudo(s, c)) {
    if (from >= 0 && m.from !== from) continue;
    const u = make(s, m);
    if (!attacked(s.board, kingSq(s.board, c), other(c))) out.push(m);
    unmake(s, u);
  }
  return out;
}

function insufficient(b) {
  const rest = b.filter(p => p && p.toLowerCase() !== 'k');
  if (!rest.length) return true;
  if (rest.length === 1 && 'nb'.includes(rest[0].toLowerCase())) return true;
  return false;
}
/** A move written the way chess players read it (Sf3, exd5, O-O, e8=D+). Danish piece letters: K D T L S. */
const DK = { k: 'K', q: 'D', r: 'T', b: 'L', n: 'S' };
function notation(s, m, all) {
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  const p = s.board[m.from].toLowerCase();
  let t = '';
  if (p === 'p') t = (m.cap ? `${FILES[colOf(m.from)]}x` : '') + sqName(m.to) + (m.promo ? `=${DK[m.promo]}` : '');
  else {
    const same = all.filter(o => o.to === m.to && o.from !== m.from && s.board[o.from] === s.board[m.from]);
    let dis = '';
    if (same.length) dis = same.some(o => colOf(o.from) === colOf(m.from)) ? (same.some(o => rowOf(o.from) === rowOf(m.from)) ? sqName(m.from) : sqName(m.from)[1]) : FILES[colOf(m.from)];
    t = DK[p] + dis + (m.cap ? 'x' : '') + sqName(m.to);
  }
  return t;
}

/** Play the move from → to (promo: 'q','r','b','n'). Returns the move or null if it isn't legal. Sets s.result when the game ends. */
export function play(s, from, to, promo = 'q', now = Date.now()) {
  if (s.result || checkFlag(s, now)) return null;
  const all = legalMoves(s);
  const m = all.find(x => x.from === from && x.to === to && (!x.promo || x.promo === promo));
  if (!m) return null;
  let san = notation(s, m, all);
  const mover = s.turn, piece = s.board[from];
  if (s.clock) {        // the mover's clock stops and gets the increment; the other one's starts
    if (s.clock.since != null) s.clock[mover] -= now - s.clock.since;
    if (s.clock.since != null || mover === 'w') s.clock[mover] += s.clock.inc;
    s.clock.since = now;
  }
  make(s, m);
  if (mover === 'b') s.full++;
  const key = posKey(s);
  s.reps[key] = (s.reps[key] || 0) + 1;
  const replies = legalMoves(s), check = inCheck(s);
  if (check) san += replies.length ? '+' : '#';
  s.moves.push(san);
  s.last = { from, to, san, piece, cap: m.cap || '' };
  if (!replies.length) s.result = check ? { winner: mover, why: 'mate' } : { winner: null, why: 'stalemate' };
  else if (s.half >= 100) s.result = { winner: null, why: 'fifty' };
  else if (s.reps[key] >= 3) s.result = { winner: null, why: 'repeat' };
  else if (insufficient(s.board)) s.result = { winner: null, why: 'material' };
  return m;
}
// ── the chess clock: { base, inc, w, b, since } in ms; it starts when white has made the first move ──
export const CLOCKS = [{ id: 'none', label: 'Uden ur' }, { id: '3+2', label: '3 min + 2 s', base: 180e3, inc: 2e3 }, { id: '5+0', label: '5 min', base: 300e3, inc: 0 }, { id: '10+0', label: '10 min', base: 600e3, inc: 0 }, { id: '15+10', label: '15 min + 10 s', base: 900e3, inc: 10e3 }];
export function setClock(s, id) {
  const c = CLOCKS.find(x => x.id === id);
  s.clock = c?.base ? { id, base: c.base, inc: c.inc, w: c.base, b: c.base, since: null } : null;
  return s;
}
/** Time left for colour c at time `now` (the side to move is ticking). */
export function clockLeft(s, c, now = Date.now()) {
  const k = s.clock; if (!k) return Infinity;
  return k[c] - (c === s.turn && k.since != null && !s.result ? now - k.since : 0);
}
/** The side to move has run out of time: the other one wins – unless it only has its king left. */
export function checkFlag(s, now = Date.now()) {
  if (!s.clock || s.result || s.clock.since == null || clockLeft(s, s.turn, now) > 0) return false;
  const c = s.turn, o = other(c);
  s.clock[c] = 0; s.clock.since = null;
  const canWin = s.board.some(p => p && colorOf(p) === o && p.toLowerCase() !== 'k');
  s.result = canWin ? { winner: o, why: 'time' } : { winner: null, why: 'timeDraw' };
  return true;
}
/** Pause the clock (e.g. after the app was closed): the time away doesn't count. */
export function resumeClock(s, now = Date.now()) { if (s.clock?.since != null && !s.result) s.clock.since = now; }
export const fmtClock = (ms) => {
  if (!isFinite(ms)) return '';
  const t = Math.max(0, ms);
  if (t < 10e3) return `0:0${(Math.floor(t / 100) / 10).toFixed(1)}`;
  const sec = Math.ceil(t / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
export function agreeDraw(s) { if (!s.result) { s.result = { winner: null, why: 'agreed' }; if (s.clock) s.clock.since = null; } }
export function resign(s, color) { if (!s.result) s.result = { winner: other(color), why: 'resign' }; }
export const RESULT_TEXT = { mate: 'Skakmat', stalemate: 'Pat – uafgjort', fifty: 'Uafgjort – 50 træk uden slag eller bondetræk', repeat: 'Uafgjort – samme stilling tre gange', material: 'Uafgjort – for lidt materiale til at sætte mat', resign: 'Opgivet', agreed: 'Uafgjort efter aftale', time: 'Tiden løb ud', timeDraw: 'Uafgjort – tiden løb ud, men modstanderen kan ikke sætte mat' };

/** Captured pieces so far, for the bars beside the board. */
export function captured(s) {
  const full = { p: 8, n: 2, b: 2, r: 2, q: 1 }, out = { w: [], b: [] };
  for (const t of 'qrbnp') {
    const w = s.board.filter(p => p === t.toUpperCase()).length, bl = s.board.filter(p => p === t).length;
    for (let k = w; k < full[t]; k++) out.b.push(t.toUpperCase());      // black has taken these white pieces
    for (let k = bl; k < full[t]; k++) out.w.push(t);
  }
  return out;
}

// ── the computer: alpha-beta with piece-square tables ──
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};
/** Score from white's point of view. */
export function evaluate(b) {
  let sc = 0, heavy = 0;
  for (const p of b) if (p && 'qQ'.includes(p)) heavy++;
  const endgame = heavy === 0 || b.filter(p => p && !'pPkK'.includes(p)).length <= 4;
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p) continue;
    const t = p.toLowerCase(), w = p === p.toUpperCase();
    const tbl = PST[t === 'k' && endgame ? 'ke' : t];
    const v = VAL[t] + tbl[w ? i : (7 - rowOf(i)) * 8 + colOf(i)];
    sc += w ? v : -v;
  }
  return sc;
}
const order = (ms) => ms.sort((a, b) => ((b.cap ? VAL[b.cap.toLowerCase()] * 10 : 0) + (b.promo ? 800 : 0)) - ((a.cap ? VAL[a.cap.toLowerCase()] * 10 : 0) + (a.promo ? 800 : 0)));
function search(s, depth, alpha, beta, ply, stats) {
  stats.n++;
  const sign = s.turn === 'w' ? 1 : -1;
  if (depth <= 0) {        // quiescence: keep looking at captures so it doesn't stop mid-exchange
    const stand = sign * evaluate(s.board);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 10 || stats.n > stats.max) return stand;
    const c = s.turn;
    for (const m of order(pseudo(s, c).filter(x => x.cap || x.promo))) {
      const u = make(s, m);
      if (attacked(s.board, kingSq(s.board, c), other(c))) { unmake(s, u); continue; }
      const v = -search(s, 0, -beta, -alpha, ply + 1, stats); unmake(s, u);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  const ms = legalMoves(s);
  if (!ms.length) return inCheck(s) ? -100000 + ply : 0;
  if (s.half >= 100) return 0;
  let best = -Infinity;
  for (const m of order(ms)) {
    const u = make(s, m); const v = -search(s, depth - 1, -beta, -alpha, ply + 1, stats); unmake(s, u);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
export const LEVELS = { easy: { label: 'Let', depth: 1, noise: 150 }, medium: { label: 'Middel', depth: 2, noise: 30 }, hard: { label: 'Svær', depth: 3, noise: 0 }, master: { label: 'Mester', depth: 4, noise: 0 } };
/** The computer's move for the side to move: { from, to, promo }. */
export function bestMove(s0, level = 'medium', r = Math.random) {
  const s = { ...s0, board: [...s0.board] };
  const L = LEVELS[level] || LEVELS.medium;
  const ms = order(legalMoves(s));
  if (!ms.length) return null;
  const stats = { n: 0, max: 60000 };
  let best = null, bv = -Infinity;
  for (const m of ms) {
    const u = make(s, m);
    const noReply = !legalMoves(s).length;
    let v = noReply ? (inCheck(s) ? 100000 : 0) : -search(s, L.depth - 1, -Infinity, Infinity, 1, stats);
    if (s0.reps?.[posKey(s)] && v > -150 && v < 50000) v -= 40;      // don't drift into a draw by repetition
    unmake(s, u);
    v += L.noise ? (r() - 0.5) * L.noise : r() * 2;
    if (v > bv) { bv = v; best = m; }
  }
  return { from: best.from, to: best.to, promo: best.promo || 'q' };
}

/** Count positions to a depth (perft) – checks that move generation is right. */
export function perft(s, depth) {
  if (!depth) return 1;
  let n = 0;
  for (const m of legalMoves(s)) { const u = make(s, m); n += perft(s, depth - 1); unmake(s, u); }
  return n;
}
