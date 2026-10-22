/**
 * Ejendomskongen – the rules of the property game (pure functions on a plain state object, unit-tested in tests/apps.test.mjs).
 * Our own board, names and cards. Roll, buy streets, collect rent, build houses and hotels – the last one standing wins
 * (or the richest after the agreed number of rounds).
 */

export const GROUPS = [
  { id: 0, color: '#8b5a2b', house: 1000 }, { id: 1, color: '#7dd3fc', house: 1000 }, { id: 2, color: '#f472b6', house: 2000 }, { id: 3, color: '#fb923c', house: 2000 },
  { id: 4, color: '#ef4444', house: 3000 }, { id: 5, color: '#facc15', house: 3000 }, { id: 6, color: '#22c55e', house: 4000 }, { id: 7, color: '#1d4ed8', house: 4000 },
];
const P = (name, group, price) => ({ type: 'prop', name, group, price });
export const BOARD = [
  { type: 'start', name: 'START' }, P('Bakkevej', 0, 1200), { type: 'chance', name: 'Lykkekort' }, P('Mosegade', 0, 1200), { type: 'tax', name: 'Indkomstskat', amount: 4000 },
  { type: 'station', name: 'Togstationen', price: 4000 }, P('Kildevej', 1, 2000), { type: 'chance', name: 'Lykkekort' }, P('Engvej', 1, 2000), P('Skovbrynet', 1, 2400),
  { type: 'jail', name: 'Fængsel / på besøg' }, P('Havnegade', 2, 2800), { type: 'util', name: 'Elværket', price: 3000 }, P('Fiskergade', 2, 2800), P('Strandvejen', 2, 3200),
  { type: 'station', name: 'Færgen', price: 4000 }, P('Kirkepladsen', 3, 3600), { type: 'chance', name: 'Lykkekort' }, P('Torvegade', 3, 3600), P('Rådhusstien', 3, 4000),
  { type: 'park', name: 'Fri parkering' }, P('Parkallé', 4, 4400), { type: 'chance', name: 'Lykkekort' }, P('Slotsgade', 4, 4400), P('Kongevejen', 4, 4800),
  { type: 'station', name: 'Lufthavnen', price: 4000 }, P('Søndergade', 5, 5200), P('Vestergade', 5, 5200), { type: 'util', name: 'Vandværket', price: 3000 }, P('Nørregade', 5, 5600),
  { type: 'gojail', name: 'Gå i fængsel' }, P('Bredgade', 6, 6000), P('Kronborgvej', 6, 6000), { type: 'chance', name: 'Lykkekort' }, P('Kastanjealléen', 6, 6400),
  { type: 'station', name: 'Metroen', price: 4000 }, { type: 'chance', name: 'Lykkekort' }, P('Fyrtårnsvej', 7, 7000), { type: 'tax', name: 'Luksusskat', amount: 2000 }, P('Kystvejen', 7, 8000),
];
export const START_MONEY = 30000, PASS_START = 4000, JAIL = 10, JAIL_FINE = 1000;
export const TOKENS = ['🚗', '🐶', '🎩', '🚀', '⛵', '🐱'];
const RENT_STEPS = [1, 5, 15, 45, 80, 125];
export const baseRent = (f) => Math.max(50, Math.round(f.price / 25 / 50) * 50);
export const buyable = (f) => ['prop', 'station', 'util'].includes(f.type);
export const groupFields = (g) => BOARD.map((f, i) => (f.group === g && f.type === 'prop' ? i : -1)).filter(i => i >= 0);

export const CARDS = [
  { text: 'Ryk frem til START, og modtag 4.000 kr.', go: 0 },
  { text: 'Ryk frem til Lufthavnen.', go: 25 },
  { text: 'Ryk frem til Kongevejen.', go: 24 },
  { text: 'Gå direkte i fængsel. Du passerer ikke START.', jail: true },
  { text: 'Løsladelseskort – gem det, til du får brug for det.', free: true },
  { text: 'Du har vundet i lotteriet: 2.000 kr.', money: 2000 },
  { text: 'Banken har lavet en fejl i din favør: 1.000 kr.', money: 1000 },
  { text: 'Fartbøde: betal 1.500 kr.', money: -1500 },
  { text: 'Dyrlægeregning: betal 800 kr.', money: -800 },
  { text: 'Gå 3 felter tilbage.', back: 3 },
  { text: 'Det er din fødselsdag! Alle giver dig 500 kr.', each: 500 },
  { text: 'Du er valgt som formand – betal hver spiller 300 kr.', each: -300 },
  { text: 'Reparation af dine ejendomme: 400 kr. pr. hus og 1.200 kr. pr. hotel.', repair: [400, 1200] },
  { text: 'Aktieudbytte: 1.500 kr.', money: 1500 },
  { text: 'Ryk frem til Bakkevej.', go: 1 },
  { text: 'Skattevæsenet betaler dig 800 kr. tilbage.', money: 800 },
];

const rnd6 = (r) => 1 + Math.floor(r() * 6);
const shuffle = (a, r) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const fmt = (n) => `${n.toLocaleString('da-DK')} kr.`;

export function newGame(players, { rounds = 0 } = {}, r = Math.random) {
  return {
    players: players.map((p, i) => ({ name: p.name, ai: !!p.ai, uid: p.uid ?? null, token: p.token || TOKENS[i], money: START_MONEY, pos: 0, jail: 0, free: 0, out: false })),
    owner: {}, houses: {}, mort: {}, turn: 0, phase: 'roll', dice: [0, 0], doubles: 0, round: 1, rounds,
    cards: shuffle(CARDS.map((_, i) => i), r), log: ['Spillet er startet. Held og lykke!'], pending: null, winner: null, lastCard: null,
  };
}
const log = (s, t) => { s.log = [t.replace(/\.\.$/, '.').replace(/!\.$/, '!'), ...s.log].slice(0, 60); };
const cur = (s) => s.players[s.turn];
const alive = (s) => s.players.filter(p => !p.out);

export function rentFor(s, i, diceTotal = 7) {
  const f = BOARD[i], o = s.owner[i];
  if (o == null || s.mort[i]) return 0;
  if (f.type === 'station') { const n = [5, 15, 25, 35].filter(k => s.owner[k] === o).length; return 500 * 2 ** (n - 1); }
  if (f.type === 'util') { const both = s.owner[12] === o && s.owner[28] === o; return diceTotal * (both ? 250 : 100); }
  const h = s.houses[i] || 0, base = baseRent(f);
  if (h) return base * RENT_STEPS[h];
  return ownsGroup(s, o, f.group) ? base * 2 : base;
}
export const ownsGroup = (s, pi, g) => groupFields(g).every(k => s.owner[k] === pi);

/** Net worth: money + streets (half if pawned) + houses at half price. */
export function worth(s, pi) {
  const p = s.players[pi]; if (p.out) return 0;
  let w = p.money;
  for (const [k, o] of Object.entries(s.owner)) if (o === pi) { const f = BOARD[k]; w += s.mort[k] ? f.price / 2 : f.price; if (f.type === 'prop') w += (s.houses[k] || 0) * GROUPS[f.group].house / 2; }
  return w;
}

/** Pay `amount` from player pi to `to` (player index or null = bank). Sells houses and pawns streets when needed; bankrupt if still short. */
export function pay(s, pi, amount, to = null) {
  const p = s.players[pi];
  if (amount <= 0) return true;
  if (p.money < amount) raise(s, pi, amount);
  if (p.money >= amount) { p.money -= amount; if (to != null) s.players[to].money += amount; return true; }
  // bankrupt
  const left = p.money; p.money = 0; p.out = true;
  log(s, `${p.name} er gået fallit${to != null ? ` til ${s.players[to].name}` : ''}.`);
  for (const k of Object.keys(s.owner)) if (s.owner[k] === pi) {
    delete s.houses[k];
    if (to != null) s.owner[k] = to; else { delete s.owner[k]; delete s.mort[k]; }
  }
  if (to != null) s.players[to].money += left;
  checkOver(s);
  return false;
}
function raise(s, pi, need) {
  const p = s.players[pi];
  const mine = () => Object.keys(s.owner).filter(k => s.owner[k] === pi).map(Number).sort((a, b) => BOARD[a].price - BOARD[b].price);
  // sell houses evenly (most built first)
  while (p.money < need) {
    const built = mine().filter(k => s.houses[k]).sort((a, b) => (s.houses[b] - s.houses[a]) || (BOARD[a].price - BOARD[b].price));
    if (!built.length) break;
    const k = built[0]; s.houses[k]--; if (!s.houses[k]) delete s.houses[k];
    p.money += GROUPS[BOARD[k].group].house / 2;
    log(s, `${p.name} sælger et hus på ${BOARD[k].name}.`);
  }
  for (const k of mine()) {
    if (p.money >= need) break;
    if (!s.mort[k] && !(s.houses[k])) { s.mort[k] = true; p.money += BOARD[k].price / 2; log(s, `${p.name} pantsætter ${BOARD[k].name}.`); }
  }
}
function checkOver(s) {
  const a = alive(s);
  if (a.length <= 1) { s.phase = 'over'; s.winner = s.players.indexOf(a[0]); log(s, `${a[0]?.name || 'Ingen'} har vundet spillet! 🏆`); }
}

function moveTo(s, to, { passStart = true } = {}) {
  const p = cur(s);
  if (passStart && to < p.pos) { p.money += PASS_START; log(s, `${p.name} passerer START og får ${fmt(PASS_START)}.`); }
  p.pos = to;
}
function goJail(s) { const p = cur(s); p.pos = JAIL; p.jail = 1; s.doubles = 0; s.noAgain = true; log(s, `${p.name} ryger i fængsel.`); s.phase = 'end'; }

function land(s, r) {
  const p = cur(s), i = p.pos, f = BOARD[i], total = s.dice[0] + s.dice[1];
  s.pending = null;
  if (f.type === 'gojail') return goJail(s);
  if (f.type === 'tax') { log(s, `${p.name} betaler ${fmt(f.amount)} i ${f.name.toLowerCase()}.`); pay(s, s.turn, f.amount); }
  else if (f.type === 'chance') return drawCard(s, r);
  else if (buyable(f)) {
    const o = s.owner[i];
    if (o == null) { s.pending = { type: 'buy', field: i }; s.phase = 'buy'; return; }
    if (o !== s.turn && !s.players[o].out) {
      const rent = rentFor(s, i, total);
      if (rent) { log(s, `${p.name} betaler ${fmt(rent)} i leje til ${s.players[o].name} for ${f.name}.`); pay(s, s.turn, rent, o); }
      else if (s.mort[i]) log(s, `${f.name} er pantsat – ingen leje.`);
    }
  }
  if (s.phase !== 'over') s.phase = 'end';
}
function drawCard(s, r) {
  const p = cur(s);
  if (!s.cards.length) s.cards = shuffle(CARDS.map((_, i) => i), r);
  const c = CARDS[s.cards.shift()];
  s.lastCard = c.text;
  log(s, `${p.name} trækker et lykkekort: ${c.text}`);
  s.phase = 'end';
  if (c.go != null) { moveTo(s, c.go); return land(s, r); }
  if (c.jail) return goJail(s);
  if (c.free) { p.free++; return; }
  if (c.back) { p.pos = (p.pos + 40 - c.back) % 40; return land(s, r); }
  if (c.money > 0) p.money += c.money;
  if (c.money < 0) pay(s, s.turn, -c.money);
  if (c.each) for (const [qi, q] of s.players.entries()) if (qi !== s.turn && !q.out) { if (c.each > 0) pay(s, qi, c.each, s.turn); else pay(s, s.turn, -c.each, qi); }
  if (c.repair) { let sum = 0; for (const [k, o] of Object.entries(s.owner)) if (o === s.turn && s.houses[k]) sum += s.houses[k] === 5 ? c.repair[1] : s.houses[k] * c.repair[0]; if (sum) pay(s, s.turn, sum); }
  if (s.phase !== 'over') s.phase = 'end';
}

/** Roll for the current player. In jail: doubles get you out (after 3 tries you pay the fine). */
export function roll(s, r = Math.random) {
  if (s.phase !== 'roll') return s;
  const p = cur(s);
  s.dice = [rnd6(r), rnd6(r)]; s.lastCard = null;
  const dbl = s.dice[0] === s.dice[1];
  log(s, `${p.name} slår ${s.dice[0]} og ${s.dice[1]}${dbl ? ' – to ens!' : ''}.`);
  if (p.jail) {
    if (dbl) { p.jail = 0; log(s, `${p.name} slår to ens og kommer ud af fængslet.`); s.doubles = 0; s.noAgain = true; }
    else if (p.jail >= 3) { log(s, `${p.name} har siddet tre runder og betaler ${fmt(JAIL_FINE)}.`); p.jail = 0; if (!pay(s, s.turn, JAIL_FINE)) return s; s.noAgain = true; }
    else { p.jail++; s.phase = 'end'; return s; }
  } else if (dbl) { s.doubles++; if (s.doubles >= 3) { log(s, `${p.name} slår to ens tre gange i træk.`); goJail(s); return s; } }
  moveTo(s, (p.pos + s.dice[0] + s.dice[1]) % 40);
  land(s, r);
  return s;
}
export function payJail(s) {
  const p = cur(s);
  if (!p.jail || s.phase !== 'roll') return s;
  if (p.free) { p.free--; log(s, `${p.name} bruger sit løsladelseskort.`); }
  else { if (p.money < JAIL_FINE) return s; pay(s, s.turn, JAIL_FINE); log(s, `${p.name} betaler ${fmt(JAIL_FINE)} og er fri.`); }
  p.jail = 0;
  return s;
}
export function buy(s) {
  const p = cur(s), i = s.pending?.field;
  if (s.phase !== 'buy' || i == null || p.money < BOARD[i].price) return s;
  p.money -= BOARD[i].price; s.owner[i] = s.turn; s.pending = null; s.phase = 'end';
  log(s, `${p.name} køber ${BOARD[i].name} for ${fmt(BOARD[i].price)}.`);
  return s;
}
export function skipBuy(s) { if (s.phase === 'buy') { log(s, `${cur(s).name} køber ikke ${BOARD[s.pending.field].name}.`); s.pending = null; s.phase = 'end'; } return s; }

/** Can player pi build on field i? (whole group, nothing pawned, build evenly, max hotel = 5) */
export function canBuild(s, pi, i) {
  const f = BOARD[i];
  if (f.type !== 'prop' || s.owner[i] !== pi || !ownsGroup(s, pi, f.group)) return false;
  const g = groupFields(f.group);
  if (g.some(k => s.mort[k])) return false;
  const h = s.houses[i] || 0;
  return h < 5 && h <= Math.min(...g.map(k => s.houses[k] || 0)) && s.players[pi].money >= GROUPS[f.group].house;
}
export function build(s, pi, i) {
  if (!canBuild(s, pi, i)) return s;
  const f = BOARD[i];
  s.players[pi].money -= GROUPS[f.group].house; s.houses[i] = (s.houses[i] || 0) + 1;
  log(s, `${s.players[pi].name} bygger ${s.houses[i] === 5 ? 'et hotel' : 'et hus'} på ${f.name}.`);
  return s;
}
export function canSell(s, pi, i) { const f = BOARD[i]; if (s.owner[i] !== pi || !s.houses[i]) return false; return s.houses[i] >= Math.max(...groupFields(f.group).map(k => s.houses[k] || 0)); }
export function sell(s, pi, i) { if (!canSell(s, pi, i)) return s; const f = BOARD[i]; s.houses[i]--; if (!s.houses[i]) delete s.houses[i]; s.players[pi].money += GROUPS[f.group].house / 2; log(s, `${s.players[pi].name} sælger et hus på ${f.name}.`); return s; }
export function mortgage(s, pi, i) {
  const f = BOARD[i];
  if (s.owner[i] !== pi || s.mort[i] || (f.type === 'prop' && groupFields(f.group).some(k => s.houses[k]))) return s;
  s.mort[i] = true; s.players[pi].money += f.price / 2; log(s, `${s.players[pi].name} pantsætter ${f.name} for ${fmt(f.price / 2)}.`); return s;
}
export const unmortgageCost = (i) => Math.round(BOARD[i].price * 0.55);
export function unmortgage(s, pi, i) {
  if (s.owner[i] !== pi || !s.mort[i] || s.players[pi].money < unmortgageCost(i)) return s;
  s.players[pi].money -= unmortgageCost(i); delete s.mort[i]; log(s, `${s.players[pi].name} indfrier pantet i ${BOARD[i].name}.`); return s;
}

/** Done with the turn: same player again after doubles, else the next one still in the game. */
export function endTurn(s) {
  if (s.phase !== 'end') return s;
  const p = cur(s);
  if (!p.out && !p.jail && s.dice[0] === s.dice[1] && s.dice[0] && !s.noAgain) { s.phase = 'roll'; log(s, `${p.name} slår igen.`); return s; }
  s.doubles = 0; s.noAgain = false;
  let n = s.turn;
  do { n = (n + 1) % s.players.length; if (n === 0) s.round++; } while (s.players[n].out);
  s.turn = n; s.phase = 'roll'; s.dice = [0, 0];
  if (s.rounds && s.round > s.rounds) {
    const ranks = s.players.map((q, i) => [worth(s, i), i]).sort((a, b) => b[0] - a[0]);
    s.winner = ranks[0][1]; s.phase = 'over';
    log(s, `Tiden er gået! ${s.players[s.winner].name} er rigest med ${fmt(ranks[0][0])} og vinder. 🏆`);
  }
  return s;
}

/** The computer's whole turn, one step at a time. Returns false when the turn is over. */
export function aiStep(s, r = Math.random) {
  const pi = s.turn, p = cur(s);
  if (s.phase === 'over') return false;
  const reserve = 2500 + 500 * Object.keys(s.houses).filter(k => s.owner[k] !== pi).length;
  if (s.phase === 'roll') {
    if (p.jail && (p.free || p.money > 12000)) payJail(s);
    roll(s, r); return true;
  }
  if (s.phase === 'buy') {
    const f = BOARD[s.pending.field];
    const completes = f.type === 'prop' && groupFields(f.group).every(k => k === s.pending.field || s.owner[k] === pi);
    if (p.money - f.price >= reserve || (completes && p.money >= f.price)) buy(s); else skipBuy(s);
    return true;
  }
  if (s.phase === 'end') {
    if (s.offer) return false;                     // waiting for a person to answer a trade offer
    if (aiTrade(s, pi)) return true;
    // unpawn when rich, then build evenly on the cheapest complete groups
    for (const k of Object.keys(s.mort).map(Number)) if (s.owner[k] === pi && p.money - unmortgageCost(k) > reserve + 4000) unmortgage(s, pi, k);
    let built = true;
    while (built) {
      built = false;
      for (let i = 0; i < 40; i++) if (canBuild(s, pi, i) && p.money - GROUPS[BOARD[i].group].house >= reserve + 1500) { build(s, pi, i); built = true; }
    }
    endTurn(s);
    return s.turn === pi && s.phase === 'roll';     // rolled doubles: keep going
  }
  return false;
}

// ── Handel ──
/** A trade: player a gives { props, money } and gets { props, money } from player b. */
export function tradeProblem(s, a, b, t) {
  if (a === b || s.players[a]?.out || s.players[b]?.out) return 'Vælg en anden spiller.';
  const give = t.give || {}, get = t.get || {};
  if (!(give.props?.length || get.props?.length || give.money || get.money)) return 'Handlen er tom.';
  for (const [who, side] of [[a, give], [b, get]]) {
    if ((side.money || 0) < 0 || (side.money || 0) > s.players[who].money) return `${s.players[who].name} har ikke ${(side.money || 0).toLocaleString('da-DK')} kr.`;
    for (const i of side.props || []) {
      if (s.owner[i] !== who) return `${BOARD[i].name} ejes ikke af ${s.players[who].name}.`;
      if (BOARD[i].type === 'prop' && groupFields(BOARD[i].group).some(k => s.houses[k])) return `Sælg husene i ${BOARD[i].name}s farve først.`;
    }
  }
  return null;
}
export function trade(s, a, b, t) {
  if (tradeProblem(s, a, b, t)) return false;
  const give = t.give || {}, get = t.get || {};
  for (const i of give.props || []) s.owner[i] = b;
  for (const i of get.props || []) s.owner[i] = a;
  s.players[a].money += (get.money || 0) - (give.money || 0);
  s.players[b].money += (give.money || 0) - (get.money || 0);
  const what = (side) => [...(side.props || []).map(i => BOARD[i].name), side.money ? fmt(side.money) : null].filter(Boolean).join(' + ') || 'ingenting';
  log(s, `Handel: ${s.players[a].name} giver ${what(give)} og får ${what(get)} fra ${s.players[b].name}.`);
  return true;
}
/** What field i is worth to player pi – much more if it completes (or blocks) a colour group. */
function fieldValue(s, pi, i, owning) {
  const f = BOARD[i];
  let v = s.mort[i] ? f.price * 0.5 : f.price;
  if (f.type === 'station') v *= 1 + 0.25 * [5, 15, 25, 35].filter(k => s.owner[k] === pi).length;
  if (f.type !== 'prop') return v;
  const g = groupFields(f.group), others = g.filter(k => k !== i);
  if (owning && others.every(k => s.owner[k] === pi)) v *= 3;                                     // completes my group
  else if (owning && others.some(k => s.owner[k] === pi)) v *= 1.4;
  return v;
}
/** How the computer (player ai) values a trade where it gives `give` and gets `get`. */
export function aiValue(s, ai, other, give, get) {
  let gain = (get.money || 0) - (give.money || 0);
  for (const i of get.props || []) gain += fieldValue(s, ai, i, true);
  for (const i of give.props || []) {
    let v = fieldValue(s, ai, i, false) + (fieldValue(s, ai, i, true) - fieldValue(s, ai, i, false)) * 0.5;
    const f = BOARD[i];
    if (f.type === 'prop' && groupFields(f.group).filter(k => k !== i).every(k => s.owner[k] === other)) v *= 3;   // would complete theirs
    gain -= v;
  }
  return gain;
}
/** Does the computer say yes? (b is the computer, the offer is seen from a: a gives `give`, gets `get`) */
export function aiAccepts(s, a, b, t) {
  if (tradeProblem(s, a, b, t)) return false;
  const v = aiValue(s, b, a, t.get || {}, t.give || {});
  const size = [...(t.get?.props || []), ...(t.give?.props || [])].reduce((x, i) => x + BOARD[i].price, 0) + (t.give?.money || 0) + (t.get?.money || 0);
  return v >= Math.max(300, size * 0.12);
}
/** The computer tries to buy the last street of a colour group. Returns true if something happened. */
function aiTrade(s, pi) {
  s.tradeRound ||= {};
  if ((s.tradeRound[pi] || 0) > s.round - 3) return false;
  const p = s.players[pi];
  for (let g = 0; g < GROUPS.length; g++) {
    const fields = groupFields(g), missing = fields.filter(k => s.owner[k] !== pi);
    if (missing.length !== 1 || fields.length - missing.length < 1) continue;
    const i = missing[0], o = s.owner[i];
    if (o == null || s.players[o].out || fields.some(k => s.houses[k])) continue;
    s.tradeRound[pi] = s.round;
    const price = Math.round(BOARD[i].price * 2.2 / 100) * 100;
    if (p.money - price < 3000) continue;
    const t = { give: { props: [], money: price }, get: { props: [i], money: 0 } };
    if (s.players[o].ai) {
      if (aiAccepts(s, pi, o, t)) { trade(s, pi, o, t); return true; }
      log(s, `${s.players[o].name} vil ikke sælge ${BOARD[i].name} til ${p.name}.`);
      return true;
    }
    s.offer = { from: pi, to: o, ...t };           // a person decides
    log(s, `${p.name} tilbyder ${s.players[o].name} ${fmt(price)} for ${BOARD[i].name}.`);
    return true;
  }
  return false;
}
/** Answer the open offer. */
export function answerOffer(s, yes) {
  const o = s.offer; if (!o) return s;
  s.offer = null;
  if (yes) trade(s, o.from, o.to, o); else log(s, `${s.players[o.to].name} siger nej tak.`);
  return s;
}

/**
 * Everything a player can do, by name – used both on one screen and online (where the host's browser applies the
 * actions the others send). seat = the player doing it. Returns true if something changed.
 */
export function applyAction(s, seat, name, args = []) {
  if (s.phase === 'over') return false;
  if (name === 'answer') { if (!s.offer || s.offer.to !== seat) return false; answerOffer(s, !!args[0]); return true; }
  if (name === 'cancelOffer') { if (!s.offer || s.offer.from !== seat) return false; s.offer = null; log(s, `${s.players[seat].name} trækker tilbuddet tilbage.`); return true; }
  if (seat !== s.turn || s.offer) return false;
  const before = JSON.stringify([s.phase, s.turn, s.players.map(p => p.money), s.owner, s.houses, s.mort, s.offer]);
  switch (name) {
    case 'roll': roll(s); break;
    case 'payJail': payJail(s); break;
    case 'buy': buy(s); break;
    case 'skipBuy': skipBuy(s); break;
    case 'endTurn': endTurn(s); break;
    case 'build': build(s, seat, Number(args[0])); break;
    case 'sell': sell(s, seat, Number(args[0])); break;
    case 'mortgage': mortgage(s, seat, Number(args[0])); break;
    case 'unmortgage': unmortgage(s, seat, Number(args[0])); break;
    case 'offer': {
      const b = Number(args[0]), t = args[1] || {};
      const clean = { give: { props: (t.give?.props || []).map(Number), money: Math.max(0, Math.round(Number(t.give?.money) || 0)) }, get: { props: (t.get?.props || []).map(Number), money: Math.max(0, Math.round(Number(t.get?.money) || 0)) } };
      const why = tradeProblem(s, seat, b, clean);
      if (why) { s.tradeMsg = why; return true; }
      s.tradeMsg = null;
      if (s.players[b].ai) {
        if (aiAccepts(s, seat, b, clean)) { log(s, `${s.players[b].name} siger ja.`); trade(s, seat, b, clean); }
        else { log(s, `${s.players[b].name} siger nej til handlen.`); s.tradeMsg = `${s.players[b].name} siger nej – byd lidt mere.`; }
      } else { s.offer = { from: seat, to: b, ...clean }; log(s, `${s.players[seat].name} sender et tilbud til ${s.players[b].name}.`); }
      return true;
    }
    default: return false;
  }
  return before !== JSON.stringify([s.phase, s.turn, s.players.map(p => p.money), s.owner, s.houses, s.mort, s.offer]);
}
