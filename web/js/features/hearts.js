/**
 * Hjerterfri – 4 players, 13 cards each. Before each round you pass three cards (left, right, across, then keep).
 * Whoever has ♣2 starts. Follow suit if you can. Hearts can't be led until one has been played ("broken").
 * No points may be played in the very first trick. Each ♥ is 1 point, ♠Q (spar dame) 13. Take all 26: the
 * others get 26 instead ("skyd månen"). The game ends when someone reaches 100 – lowest score wins.
 * Cards: 'S12' = spar dame (1 = es is high: value 14).
 */
export const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const NAMES = { S: 'spar', H: 'hjerter', D: 'ruder', C: 'klør' };
const rank = (c) => { const v = Number(c.slice(1)); return v === 1 ? 14 : v; };
export const suit = (c) => c[0];
export const label = (c) => `${SUITS[c[0]]}${{ 1: 'E', 11: 'B', 12: 'D', 13: 'K' }[Number(c.slice(1))] || c.slice(1)}`;
export const points = (c) => (suit(c) === 'H' ? 1 : c === 'S12' ? 13 : 0);
const PASS_DIR = [1, 3, 2, 0];   // left, right, across, keep
export const PASS_TEXT = ['til venstre', 'til højre', 'over for dig', 'ingen bytte'];
export const sortHand = (h) => h.slice().sort((a, b) => 'CDSH'.indexOf(suit(a)) - 'CDSH'.indexOf(suit(b)) || rank(a) - rank(b));

function deal(rnd) {
  const d = []; for (const s of 'SHDC') for (let v = 1; v <= 13; v++) d.push(`${s}${v}`);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return [0, 1, 2, 3].map(k => sortHand(d.slice(k * 13, k * 13 + 13)));
}
export function newGame(seats, rnd = Math.random) {
  const s = { players: seats.slice(0, 4).map(p => ({ ...p })), scores: [0, 0, 0, 0], round: 0, log: [] };
  while (s.players.length < 4) { const n = s.players.filter(p => p.ai).length; s.players.push({ name: n ? `Gnist ${n + 1}` : 'Gnist', ai: true }); }
  startRound(s, rnd);
  return s;
}
function startRound(s, rnd = Math.random) {
  s.hands = deal(rnd); s.taken = [0, 0, 0, 0].map(() => []); s.trick = []; s.broken = false; s.tricks = 0; s.lastTrick = null;
  s.passDir = PASS_DIR[s.round % 4]; s.passing = s.passDir ? [null, null, null, null] : null;
  s.phase = s.passDir ? 'pass' : 'play';
  if (!s.passDir) s.turn = s.hands.findIndex(h => h.includes('C2'));
  else s.turn = null;
}
/** which cards may be played now */
export function legal(s, seat) {
  const hand = s.hands[seat]; if (s.phase !== 'play' || s.turn !== seat) return [];
  if (!s.trick.length) {
    if (s.tricks === 0) return hand.includes('C2') ? ['C2'] : [];
    const non = hand.filter(c => suit(c) !== 'H');
    return s.broken || !non.length ? hand : non;
  }
  const lead = suit(s.trick[0].card), follow = hand.filter(c => suit(c) === lead);
  if (follow.length) return follow;
  if (s.tricks === 0) { const safe = hand.filter(c => !points(c)); if (safe.length) return safe; }
  return hand;
}
const say = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 12); };
export function apply(s, seat, name, args = []) {
  if (s.phase === 'over') return false;
  if (name === 'pass') {
    if (s.phase !== 'pass' || s.passing[seat]) return false;
    const cards = args[0];
    if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3 || !cards.every(c => s.hands[seat].includes(c))) return false;
    s.passing[seat] = cards;
    if (s.passing.every(Boolean)) {
      s.passing.forEach((cs, from) => { const to = (from + s.passDir) % 4; s.hands[from] = s.hands[from].filter(c => !cs.includes(c)); s.hands[to] = s.hands[to].concat(cs); });
      s.received = s.passing.map((_, to) => s.passing[(to - s.passDir + 4) % 4]);
      s.hands = s.hands.map(sortHand); s.passing = null; s.phase = 'play'; s.turn = s.hands.findIndex(h => h.includes('C2'));
    }
    return true;
  }
  if (name === 'play') {
    const c = args[0];
    if (!legal(s, seat).includes(c)) return false;
    s.hands[seat] = s.hands[seat].filter(x => x !== c);
    s.trick.push({ seat, card: c });
    if (suit(c) === 'H' && !s.broken) { s.broken = true; if (s.trick.length > 1) say(s, 'Hjerterne er brudt!'); }
    if (s.trick.length < 4) { s.turn = (seat + 1) % 4; return true; }
    const lead = suit(s.trick[0].card);
    const win = s.trick.filter(t => suit(t.card) === lead).sort((a, b) => rank(b.card) - rank(a.card))[0].seat;
    const pts = s.trick.reduce((a, t) => a + points(t.card), 0);
    s.taken[win].push(...s.trick.map(t => t.card)); s.lastTrick = { cards: s.trick, winner: win, at: Date.now() };
    if (pts) say(s, `${s.players[win].name} tog ${pts} ${pts === 1 ? 'point' : 'point'}`);
    s.trick = []; s.tricks++; s.turn = win;
    if (s.tricks === 13) endRound(s);
    return true;
  }
  if (name === 'next') {
    if (s.phase !== 'scored') return false;
    s.round++; startRound(s); return true;
  }
  return false;
}
function endRound(s) {
  const pts = s.taken.map(t => t.reduce((a, c) => a + points(c), 0));
  const moon = pts.findIndex(p => p === 26);
  const add = moon >= 0 ? pts.map((_, i) => (i === moon ? 0 : 26)) : pts;
  if (moon >= 0) say(s, `${s.players[moon].name} skød månen! Alle andre får 26 point.`);
  s.roundPoints = add; s.scores = s.scores.map((v, i) => v + add[i]);
  if (Math.max(...s.scores) >= 100) { s.phase = 'over'; const lo = Math.min(...s.scores); s.winner = s.scores.indexOf(lo); }
  else s.phase = 'scored';
}
/** the computer: pass high spades/hearts; play low, dump points when it can't follow, avoid winning tricks with points */
export function aiMove(s, seat) {
  if (s.phase === 'pass' && !s.passing[seat]) {
    const h = s.hands[seat], danger = (c) => (c === 'S12' ? 100 : c === 'S1' || c === 'S13' ? 90 : suit(c) === 'H' ? 40 + rank(c) : rank(c));
    return { name: 'pass', args: [h.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3)] };
  }
  if (s.phase === 'scored' && seat === 0 && s.players.every(p => p.ai)) return { name: 'next', args: [] };
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const opts = legal(s, seat); if (!opts.length) return null;
  const byRank = (a, b) => rank(a) - rank(b);
  if (!s.trick.length) { const safe = opts.filter(c => !points(c) && !(suit(c) === 'S' && rank(c) > 11)); return { name: 'play', args: [(safe.length ? safe : opts).sort(byRank)[0]] }; }
  const lead = suit(s.trick[0].card), following = suit(opts[0]) === lead;
  const high = Math.max(...s.trick.filter(t => suit(t.card) === lead).map(t => rank(t.card)));
  const trickPts = s.trick.reduce((a, t) => a + points(t.card), 0);
  if (following) {
    const under = opts.filter(c => rank(c) < high).sort(byRank);
    if (under.length) return { name: 'play', args: [under.at(-1)] };              // highest card that still loses
    if (s.trick.length === 3 && !trickPts) return { name: 'play', args: [opts.filter(c => c !== 'S12').sort(byRank).at(-1) || opts[0]] };   // last and safe: take with the highest
    return { name: 'play', args: [opts.sort(byRank)[0]] };
  }
  if (opts.includes('S12')) return { name: 'play', args: ['S12'] };
  const hearts = opts.filter(c => suit(c) === 'H').sort(byRank);
  if (hearts.length) return { name: 'play', args: [hearts.at(-1)] };
  return { name: 'play', args: [opts.sort(byRank).at(-1)] };
}
