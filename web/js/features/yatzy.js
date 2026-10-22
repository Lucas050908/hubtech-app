/**
 * Yatzy – the Danish rules: 5 dice, up to 3 rolls a turn, 15 boxes, bonus 50 when the upper part reaches 63.
 * Pure logic (unit-tested in tests/apps.test.mjs): scoring, the game state, actions and the computer player.
 */
export const CATS = [
  { id: 'ones', label: 'Enere', upper: 1 }, { id: 'twos', label: 'Toere', upper: 2 }, { id: 'threes', label: 'Treere', upper: 3 },
  { id: 'fours', label: 'Firere', upper: 4 }, { id: 'fives', label: 'Femmere', upper: 5 }, { id: 'sixes', label: 'Seksere', upper: 6 },
  { id: 'pair', label: 'Et par' }, { id: 'twopairs', label: 'To par' }, { id: 'three', label: 'Tre ens' }, { id: 'four', label: 'Fire ens' },
  { id: 'small', label: 'Lille straight', hint: '1-2-3-4-5' }, { id: 'large', label: 'Stor straight', hint: '2-3-4-5-6' },
  { id: 'house', label: 'Fuldt hus', hint: '3 ens + 2 ens' }, { id: 'chance', label: 'Chance' }, { id: 'yatzy', label: 'Yatzy', hint: '5 ens' },
];
export const CAT_IDS = CATS.map(c => c.id);
export const BONUS_AT = 63, BONUS = 50;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const counts = (dice) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const d of dice) c[d]++; return c; };

/** Points the five dice give in a box. */
export function scoreFor(cat, dice) {
  const c = counts(dice);
  const up = CATS.find(x => x.id === cat)?.upper;
  if (up) return c[up] * up;
  const of = (n) => { for (let v = 6; v >= 1; v--) if (c[v] >= n) return v; return 0; };
  switch (cat) {
    case 'pair': return of(2) * 2;
    case 'twopairs': { const p = []; for (let v = 6; v >= 1; v--) if (c[v] >= 2) p.push(v); return p.length >= 2 ? (p[0] + p[1]) * 2 : 0; }
    case 'three': return of(3) * 3;
    case 'four': return of(4) * 4;
    case 'small': return [1, 2, 3, 4, 5].every(v => c[v] === 1) ? 15 : 0;
    case 'large': return [2, 3, 4, 5, 6].every(v => c[v] === 1) ? 20 : 0;
    case 'house': { const t = c.findIndex((n, v) => v && n === 3), p = c.findIndex((n, v) => v && n === 2); return t > 0 && p > 0 ? t * 3 + p * 2 : 0; }
    case 'chance': return sum(dice);
    case 'yatzy': return c.some((n, v) => v && n === 5) ? 50 : 0;
    default: return 0;
  }
}
export const upperSum = (card) => CATS.filter(c => c.upper).reduce((s, c) => s + (card[c.id] ?? 0), 0);
export const bonusOf = (card) => (upperSum(card) >= BONUS_AT ? BONUS : 0);
export const totalOf = (card) => sum(CAT_IDS.map(id => card[id] ?? 0)) + bonusOf(card);
export const cardDone = (card) => CAT_IDS.every(id => card[id] != null);

// ── the game ──
const die = (r) => 1 + Math.floor(r() * 6);
/** players: [{ name, ai, uid? }] */
export function newGame(players, r = Math.random) {
  return {
    v: 1, players: players.map(p => ({ name: p.name, ai: !!p.ai, uid: p.uid || null, card: {} })),
    turn: 0, dice: [1, 2, 3, 4, 5].map(() => die(r)), held: [false, false, false, false, false], rolls: 0, phase: 'play', round: 1, log: [], last: null,
  };
}
export const canRoll = (s) => s.phase === 'play' && s.rolls < 3;
export function winners(s) {
  const best = Math.max(...s.players.map(p => totalOf(p.card)));
  return s.players.map((p, i) => i).filter(i => totalOf(s.players[i].card) === best);
}
/** One move by player `seat`: roll, hold [i] or score [cat]. Returns true when something changed. */
export function applyAction(s, seat, name, args = [], r = Math.random) {
  if (s.phase !== 'play' || seat !== s.turn) return false;
  const p = s.players[seat];
  if (name === 'roll') {
    if (!canRoll(s) || (s.rolls && s.held.every(Boolean))) return false;
    s.dice = s.dice.map((d, i) => (s.rolls && s.held[i] ? d : die(r)));
    if (!s.rolls) s.held = [false, false, false, false, false];
    s.rolls++;
    s.last = { seat, roll: s.rolls };
    return true;
  }
  if (name === 'hold') {
    const i = Number(args[0]);
    if (!s.rolls || s.rolls >= 3 || !(i >= 0 && i < 5)) return false;
    s.held[i] = !s.held[i];
    return true;
  }
  if (name === 'score') {
    const cat = String(args[0]);
    if (!s.rolls || !CAT_IDS.includes(cat) || p.card[cat] != null) return false;
    const pts = scoreFor(cat, s.dice);
    p.card[cat] = pts;
    const label = CATS.find(c => c.id === cat).label;
    s.log = [`${p.name}: ${label} – ${pts ? `${pts} point` : 'streget'}`, ...s.log].slice(0, 30);
    s.rolls = 0; s.held = [false, false, false, false, false]; s.last = { seat, cat, pts };
    if (s.players.every(q => cardDone(q.card))) {
      s.phase = 'over';
      const w = winners(s);
      s.log = [w.length > 1 ? `Uafgjort mellem ${w.map(i => s.players[i].name).join(' og ')}` : `${s.players[w[0]].name} vinder med ${totalOf(s.players[w[0]].card)} point!`, ...s.log];
    } else {
      s.turn = (s.turn + 1) % s.players.length;
      if (s.turn === 0) s.round++;
    }
    return true;
  }
  return false;
}

// ── the computer ──
// What a box is "worth" to give up (roughly what you'd expect to get there later), so it scratches the cheap ones.
const EXPECT = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, pair: 9, twopairs: 13, three: 9, four: 6, small: 4, large: 4, house: 8, chance: 22, yatzy: 6 };
/** How good it is to put these dice in this box now (score + effect on the bonus − what the box would usually give). */
function boxValue(cat, dice, card) {
  const pts = scoreFor(cat, dice);
  let v = pts - EXPECT[cat];
  const up = CATS.find(c => c.id === cat)?.upper;
  if (up && upperSum(card) < BONUS_AT) {
    const par = up * 3;                       // three of each reaches the bonus
    v += (pts - par) * 0.9;
  }
  if (cat === 'chance' && pts < 20) v -= 6;  // keep Chance for a bad turn later
  if (cat === 'yatzy' && pts) v += 30;
  return v;
}
export function bestBox(card, dice) {
  let best = null, bv = -Infinity;
  for (const id of CAT_IDS) if (card[id] == null) { const v = boxValue(id, dice, card); if (v > bv) { bv = v; best = id; } }
  return { cat: best, value: bv };
}
/** Which dice to keep: tries every way to keep dice and simulates a few rerolls. */
export function bestHold(card, dice, rollsLeft, r = Math.random, samples = 48) {
  let best = [false, false, false, false, false], bv = -Infinity;
  const seen = new Set();
  for (let m = 0; m < 32; m++) {
    const held = [0, 1, 2, 3, 4].map(i => !!(m & (1 << i)));
    const key = dice.filter((d, i) => held[i]).sort().join('');
    if (seen.has(key)) continue;
    seen.add(key);
    let tot = 0;
    const n = m === 31 ? 1 : samples;
    for (let k = 0; k < n; k++) {
      let d = dice.map((x, i) => (held[i] ? x : die(r)));
      if (rollsLeft > 1) {        // a quick second reroll: keep the most common value
        const c = counts(d); let v = 6; for (let x = 6; x >= 1; x--) if (c[x] > c[v]) v = x;
        const straight = card.small == null || card.large == null ? new Set(d).size >= 4 : false;
        d = straight ? d.map((x, i) => (d.indexOf(x) === i ? x : die(r))) : d.map(x => (x === v ? x : die(r)));
      }
      tot += bestBox(card, d).value;
    }
    const v = tot / n;
    if (v > bv + 1e-9) { bv = v; best = held; }
  }
  return { held: best, value: bv };
}
/** One step for the computer whose turn it is. Returns the action it took. */
export function aiStep(s, r = Math.random) {
  const seat = s.turn, card = s.players[seat].card;
  if (!s.rolls) { applyAction(s, seat, 'roll', [], r); return 'roll'; }
  if (s.rolls < 3) {
    const stay = bestBox(card, s.dice).value;
    const { held, value } = bestHold(card, s.dice, 3 - s.rolls, r);
    if (value > stay + 0.5 && !held.every(Boolean)) { s.held = held; applyAction(s, seat, 'roll', [], r); return 'roll'; }
  }
  applyAction(s, seat, 'score', [bestBox(card, s.dice).cat], r);
  return 'score';
}
