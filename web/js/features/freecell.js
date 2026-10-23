/**
 * Fri celle (FreeCell) – all 52 cards face up in 8 columns. Move them to the 4 foundations (ace to king per suit).
 * In the columns you build down in alternating colours. 4 free cells hold one card each.
 * You may move several cards at once if there's room to do it one by one: (free cells + 1) × 2^(empty columns).
 * Cards: suit + value 1–13 ('H1' = hjerter es). A location: { t: 'col'|'cell'|'found', i }.
 */
export const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const red = (c) => 'HD'.includes(c[0]), val = (c) => Number(c.slice(1));
export const label = (c) => `${{ 1: 'E', 11: 'B', 12: 'D', 13: 'K' }[val(c)] || val(c)}${SUITS[c[0]]}`;
export function newGame(rnd = Math.random) {
  const d = []; for (const s of 'SHDC') for (let v = 1; v <= 13; v++) d.push(`${s}${v}`);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const cols = Array.from({ length: 8 }, () => []); d.forEach((c, i) => cols[i % 8].push(c));
  return { cols, cells: [null, null, null, null], found: { S: 0, H: 0, D: 0, C: 0 }, moves: 0, history: [] };
}
const fits = (card, onto) => !onto || (red(card) !== red(onto) && val(card) === val(onto) - 1);
export const canFound = (g, c) => g.found[c[0]] === val(c) - 1;
export function maxRun(g, toEmptyCol = false) { const free = g.cells.filter(x => !x).length, empty = g.cols.filter(c => !c.length).length - (toEmptyCol ? 1 : 0); return (free + 1) * 2 ** Math.max(0, empty); }
/** the longest movable run at the bottom of a column */
export function runLength(col) { let n = 1; while (n < col.length && fits(col[col.length - n], col[col.length - n - 1])) n++; return col.length ? n : 0; }
const snap = (g) => JSON.stringify({ cols: g.cols, cells: g.cells, found: g.found });
/** move `n` cards from a location to another; returns true if done */
export function move(g, from, to, n = 1) {
  const before = snap(g);
  let cards;
  if (from.t === 'col') { const col = g.cols[from.i]; if (!col.length || n > runLength(col)) return false; cards = col.slice(-n); }
  else if (from.t === 'cell') { if (!g.cells[from.i] || n !== 1) return false; cards = [g.cells[from.i]]; }
  else return false;
  if (to.t === 'found') { if (n !== 1 || !canFound(g, cards[0])) return false; g.found[cards[0][0]]++; }
  else if (to.t === 'cell') { if (n !== 1 || g.cells[to.i]) return false; g.cells[to.i] = cards[0]; }
  else if (to.t === 'col') {
    if (from.t === 'col' && from.i === to.i) return false;
    const dest = g.cols[to.i], top = dest[dest.length - 1];
    if (!fits(cards[0], top) || n > maxRun(g, !dest.length)) return false;
    dest.push(...cards);
  } else return false;
  if (from.t === 'col') g.cols[from.i].splice(-n, n); else g.cells[from.i] = null;
  g.history.push(before); if (g.history.length > 200) g.history.shift();
  g.moves++;
  return true;
}
export function undo(g) { const s = g.history.pop(); if (!s) return false; Object.assign(g, JSON.parse(s)); g.moves++; return true; }
/** put cards on the foundations while it's safe (no lower opposite-colour card still needs them) */
export function autoFound(g) {
  let moved = 0, again = true;
  while (again) {
    again = false;
    const safe = (c) => canFound(g, c) && (val(c) <= 2 || (red(c) ? g.found.S >= val(c) - 1 && g.found.C >= val(c) - 1 : g.found.H >= val(c) - 1 && g.found.D >= val(c) - 1));
    for (let i = 0; i < 4; i++) if (g.cells[i] && safe(g.cells[i])) { const s = snap(g); g.found[g.cells[i][0]]++; g.cells[i] = null; g.history.push(s); moved++; again = true; }
    for (let i = 0; i < 8; i++) { const col = g.cols[i], c = col[col.length - 1]; if (c && safe(c)) { const s = snap(g); g.found[c[0]]++; col.pop(); g.history.push(s); moved++; again = true; } }
  }
  return moved;
}
export const won = (g) => Object.values(g.found).every(v => v === 13);
/** best place for a card when it's double-clicked: foundation, then a column, then a free cell */
export function bestTarget(g, from, n = 1) {
  const card = from.t === 'col' ? g.cols[from.i][g.cols[from.i].length - n] : g.cells[from.i];
  if (!card) return null;
  if (n === 1 && canFound(g, card)) return { t: 'found' };
  const cols = g.cols.map((c, i) => ({ c, i })).filter(({ c, i }) => !(from.t === 'col' && from.i === i));
  const nonEmpty = cols.find(({ c }) => c.length && fits(card, c[c.length - 1]) && n <= maxRun(g));
  if (nonEmpty) return { t: 'col', i: nonEmpty.i };
  const empty = cols.find(({ c }) => !c.length && n <= maxRun(g, true));
  if (empty && !(from.t === 'col' && g.cols[from.i].length === n)) return { t: 'col', i: empty.i };
  const cell = g.cells.findIndex(x => !x);
  if (n === 1 && cell >= 0 && from.t === 'col') return { t: 'cell', i: cell };
  return null;
}
