/**
 * Otter – the card game where eights are wild. 2–6 players, 7 cards each (5 when there are more than four).
 * Play a card with the same suit or value as the top of the pile. An 8 can always be played, and you choose
 * the suit. If you can't play, draw a card – if it fits you may play it, otherwise you pass.
 * First to get rid of all their cards wins; the others count the points left in their hands.
 * Cards are strings: suit (S ♠, H ♥, D ♦, C ♣) + value 1–13, e.g. "H8".
 */
export const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'spar', H: 'hjerter', D: 'ruder', C: 'klør' };
export const VAL = { 1: 'A', 11: 'J', 12: 'D', 13: 'K' };
export const suitOf = (c) => c[0];
export const valOf = (c) => Number(c.slice(1));
export const label = (c) => `${SUITS[suitOf(c)]}${VAL[valOf(c)] || valOf(c)}`;
export const isRed = (c) => 'HD'.includes(suitOf(c));
export const points = (c) => (valOf(c) === 8 ? 50 : valOf(c) >= 11 ? 10 : valOf(c));

function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function newDeck() { const d = []; for (const s of 'SHDC') for (let v = 1; v <= 13; v++) d.push(`${s}${v}`); return d; }

export function newGame(seats, rnd = Math.random) {
  const n = Math.min(6, Math.max(2, seats.length)), deck = shuffle(newDeck(), rnd), per = n > 4 ? 5 : 7;
  const hands = Array.from({ length: n }, () => deck.splice(0, per));
  let top = deck.findIndex(c => valOf(c) !== 8);        // never start with an 8
  const first = deck.splice(top, 1)[0];
  return { players: seats.slice(0, n).map(p => ({ ...p })), hands, deck, pile: [first], suit: suitOf(first), turn: Math.floor(rnd() * n), phase: 'play', drew: null, winner: null, score: null, log: [], last: null };
}
export const top = (s) => s.pile.at(-1);
export const canPlay = (s, c) => valOf(c) === 8 || suitOf(c) === s.suit || valOf(c) === valOf(top(s));
export const playable = (s, seat) => s.hands[seat].filter(c => (s.drew ? c === s.drew : true) && canPlay(s, c));
const say = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 12); };
function refill(s, rnd) {
  if (s.deck.length) return;
  const keep = s.pile.pop();
  s.deck = shuffle(s.pile, rnd); s.pile = [keep];
}
const next = (s) => { s.turn = (s.turn + 1) % s.players.length; s.drew = null; };

export function apply(s, seat, name, args = [], rnd = Math.random) {
  if (s.phase !== 'play' || seat !== s.turn) return false;
  const who = s.players[seat].name;
  if (name === 'play') {
    const [c, chosen] = args, hand = s.hands[seat];
    if (!hand.includes(c) || !canPlay(s, c) || (s.drew && c !== s.drew)) return false;
    if (valOf(c) === 8 && !SUITS[chosen]) return false;
    hand.splice(hand.indexOf(c), 1);
    s.pile.push(c); s.stuck = 0;
    s.suit = valOf(c) === 8 ? chosen : suitOf(c);
    s.last = { seat, card: c, at: Date.now() };
    if (valOf(c) === 8) say(s, `${who} spillede en 8'er og valgte ${SUIT_NAME[chosen]} ${SUITS[chosen]}`);
    if (!hand.length) {
      s.phase = 'over'; s.winner = seat;
      s.score = s.hands.map(hh => hh.reduce((a, x) => a + points(x), 0));
      say(s, `${who} har ingen kort tilbage og vinder!`);
      return true;
    }
    if (hand.length === 1) say(s, `${who} har ét kort tilbage!`);
    next(s);
    return true;
  }
  if (name === 'draw') {
    if (s.drew) return false;
    refill(s, rnd);
    if (!s.deck.length) {
      say(s, `${who} kan ikke trække – bunken er tom`);
      s.stuck = (s.stuck || 0) + 1;
      if (s.stuck >= s.players.length) {        // nobody can do anything: fewest points wins
        s.phase = 'over'; s.score = s.hands.map(hh => hh.reduce((a, x) => a + points(x), 0));
        s.winner = s.score.indexOf(Math.min(...s.score)); say(s, 'Ingen kan spille – færrest point vinder');
        return true;
      }
      next(s); return true;
    }
    const c = s.deck.pop();
    s.hands[seat].push(c);
    s.last = { seat, drew: true, at: Date.now() };
    if (canPlay(s, c)) { s.drew = c; return true; }
    say(s, `${who} trak et kort og må stå over`);
    next(s);
    return true;
  }
  if (name === 'pass') {
    if (!s.drew) return false;
    say(s, `${who} står over`);
    next(s);
    return true;
  }
  return false;
}

/** the computer: keeps its eights for last and steers towards the suit it has most of */
export function aiMove(s, seat) {
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const hand = s.hands[seat], ok = playable(s, seat);
  const most = () => { const n = { S: 0, H: 0, D: 0, C: 0 }; hand.forEach(c => { if (valOf(c) !== 8) n[suitOf(c)]++; }); return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0]; };
  if (!ok.length) return s.drew ? { name: 'pass', args: [] } : { name: 'draw', args: [] };
  const plain = ok.filter(c => valOf(c) !== 8);
  if (plain.length) {
    const n = {}; hand.forEach(c => { n[suitOf(c)] = (n[suitOf(c)] || 0) + 1; });
    plain.sort((a, b) => (n[suitOf(b)] - n[suitOf(a)]) || (points(b) - points(a)));
    return { name: 'play', args: [plain[0]] };
  }
  return { name: 'play', args: [ok[0], most()] };
}
