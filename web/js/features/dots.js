/**
 * Prikker og streger – take turns drawing a line between two neighbouring dots. Close a box and it's yours –
 * and you go again. When all lines are drawn, most boxes wins.
 * An n×m board of boxes has horizontal lines h(r, c) for r 0..n, c 0..m-1 and vertical lines v(r, c) for r 0..n-1, c 0..m.
 * Lines are numbered: horizontals first (r * m + c), then verticals ((n+1)*m + r * (m+1) + c).
 */
export function newGame(seats, n = 4, m = 4) {
  return { players: seats.slice(0, 2).map(p => ({ ...p })), n, m, lines: Array((n + 1) * m + n * (m + 1)).fill(-1), boxes: Array(n * m).fill(-1), turn: 0, phase: 'play', winner: null, last: null, log: [] };
}
export const H = (s, r, c) => r * s.m + c;
export const V = (s, r, c) => (s.n + 1) * s.m + r * (s.m + 1) + c;
const sides = (s, b) => { const r = Math.floor(b / s.m), c = b % s.m; return [H(s, r, c), H(s, r + 1, c), V(s, r, c), V(s, r, c + 1)]; };
/** the boxes a line belongs to */
export function boxesOf(s, l) {
  const out = [], hn = (s.n + 1) * s.m;
  if (l < hn) { const r = Math.floor(l / s.m), c = l % s.m; if (r > 0) out.push((r - 1) * s.m + c); if (r < s.n) out.push(r * s.m + c); }
  else { const k = l - hn, r = Math.floor(k / (s.m + 1)), c = k % (s.m + 1); if (c > 0) out.push(r * s.m + c - 1); if (c < s.m) out.push(r * s.m + c); }
  return out;
}
const drawn = (s, b) => sides(s, b).filter(l => s.lines[l] >= 0).length;
export function apply(s, seat, name, args = []) {
  if (s.phase !== 'play' || seat !== s.turn || name !== 'line') return false;
  const l = args[0];
  if (!Number.isInteger(l) || l < 0 || l >= s.lines.length || s.lines[l] >= 0) return false;
  s.lines[l] = seat; s.last = { seat, line: l, at: Date.now() };
  let closed = 0;
  for (const b of boxesOf(s, l)) if (drawn(s, b) === 4) { s.boxes[b] = seat; closed++; }
  if (s.lines.every(x => x >= 0)) {
    s.phase = 'over'; const a = s.boxes.filter(x => x === 0).length, c = s.boxes.filter(x => x === 1).length;
    s.winner = a === c ? null : a > c ? 0 : 1; return true;
  }
  if (!closed) s.turn = 1 - seat;
  return true;
}
export const score = (s) => [s.boxes.filter(x => x === 0).length, s.boxes.filter(x => x === 1).length];
/** the computer: take a box if it can, avoid giving one away, otherwise the line that gives away fewest */
export function aiMove(s, seat) {
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const free = s.lines.map((x, i) => (x < 0 ? i : -1)).filter(i => i >= 0);
  const closes = free.filter(l => boxesOf(s, l).some(b => drawn(s, b) === 3));
  if (closes.length) return { name: 'line', args: [closes[0]] };
  const safe = free.filter(l => boxesOf(s, l).every(b => drawn(s, b) < 2));
  if (safe.length) return { name: 'line', args: [safe[Math.floor(Math.random() * safe.length)]] };
  // every line gives something away: pick the one that opens the shortest chain
  let best = free[0], bestN = Infinity;
  for (const l of free) {
    const t = { ...s, lines: s.lines.slice(), boxes: s.boxes.slice() }; t.lines[l] = 1 - seat;
    let n = 0, again = true;
    while (again) { again = false; for (let k = 0; k < t.lines.length; k++) if (t.lines[k] < 0 && boxesOf(t, k).some(b => drawn(t, b) === 3)) { t.lines[k] = 1 - seat; n++; again = true; } }
    if (n < bestN) { bestN = n; best = l; }
  }
  return { name: 'line', args: [best] };
}
