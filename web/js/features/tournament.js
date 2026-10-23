/**
 * Turneringer: knockout brackets (with byes when the number isn't a power of two) and leagues (everyone meets
 * everyone, 3 points for a win, 1 for a draw). Pure functions – the page stores the result in a shared doc.
 * A match: { id, round, a, b, sa, sb } – a/b are participant indexes (null = not decided yet, -1 = bye).
 */
const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
/** standard seeding order for a bracket of size n: 1 v n, … so the best meet last */
function seedOrder(n) {
  let order = [0];
  while (order.length < n) { const m = order.length * 2; order = order.flatMap(x => [x, m - 1 - x]); }
  return order;
}
export function knockout(n) {
  const size = nextPow2(n), rounds = Math.log2(size), order = seedOrder(size), matches = [];
  let id = 0;
  for (let k = 0; k < size / 2; k++) {
    const a = order[2 * k] < n ? order[2 * k] : -1, b = order[2 * k + 1] < n ? order[2 * k + 1] : -1;
    matches.push({ id: id++, round: 0, slot: k, a, b, sa: null, sb: null });
  }
  for (let r = 1; r < rounds; r++) for (let k = 0; k < size / 2 ** (r + 1); k++) matches.push({ id: id++, round: r, slot: k, a: null, b: null, sa: null, sb: null });
  return advance({ format: 'knockout', rounds, matches });
}
/** winner index of a match, or null */
export function winner(m) {
  if (m.a === -1 && m.b != null && m.b !== -1) return m.b;
  if (m.b === -1 && m.a != null && m.a !== -1) return m.a;
  if (m.a == null || m.b == null || m.sa == null || m.sb == null || m.sa === m.sb) return null;
  return m.sa > m.sb ? m.a : m.b;
}
/** move winners on to the next round (and clear results that are no longer valid) */
export function advance(t) {
  if (t.format !== 'knockout') return t;
  for (let r = 1; r < t.rounds; r++) {
    for (const m of t.matches.filter(x => x.round === r)) {
      const [p, q] = t.matches.filter(x => x.round === r - 1 && Math.floor(x.slot / 2) === m.slot).sort((x, y) => x.slot - y.slot);
      const a = winner(p), b = winner(q);
      if (a !== m.a || b !== m.b) { m.a = a; m.b = b; m.sa = null; m.sb = null; }
    }
  }
  return t;
}
export function champion(t) {
  if (t.format === 'knockout') return winner(t.matches.find(m => m.round === t.rounds - 1));
  const tbl = standings(t), played = t.matches.every(m => m.sa != null && m.sb != null);
  return played && tbl.length ? tbl[0].i : null;
}
/** a league: everyone meets everyone once (the circle method), round by round */
export function league(n) {
  const list = Array.from({ length: n }, (_, i) => i); if (n % 2) list.push(-1);
  const m = list.length, matches = []; let id = 0;
  for (let r = 0; r < m - 1; r++) {
    for (let k = 0; k < m / 2; k++) { const a = list[k], b = list[m - 1 - k]; if (a !== -1 && b !== -1) matches.push({ id: id++, round: r, a: r % 2 ? b : a, b: r % 2 ? a : b, sa: null, sb: null }); }
    list.splice(1, 0, list.pop());
  }
  return { format: 'league', rounds: m - 1, matches };
}
export function standings(t, n = null) {
  const size = n ?? Math.max(-1, ...t.matches.flatMap(m => [m.a, m.b])) + 1;
  const rows = Array.from({ length: size }, (_, i) => ({ i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  for (const m of t.matches) {
    if (m.sa == null || m.sb == null || m.a < 0 || m.b < 0 || m.a == null || m.b == null) continue;
    const A = rows[m.a], Bq = rows[m.b];
    A.p++; Bq.p++; A.gf += m.sa; A.ga += m.sb; Bq.gf += m.sb; Bq.ga += m.sa;
    if (m.sa > m.sb) { A.w++; Bq.l++; A.pts += 3; } else if (m.sa < m.sb) { Bq.w++; A.l++; Bq.pts += 3; } else { A.d++; Bq.d++; A.pts++; Bq.pts++; }
  }
  return rows.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.i - y.i);
}
export const roundName = (t, r) => {
  if (t.format === 'league') return `Runde ${r + 1}`;
  const left = t.rounds - r;
  return left === 1 ? 'Finale' : left === 2 ? 'Semifinaler' : left === 3 ? 'Kvartfinaler' : `Runde ${r + 1}`;
};
