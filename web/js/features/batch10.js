/** Logic for Triktrak, 10.000, Sorteper, Del regningen, Navnemaskine, Skriveværksted, Cykelprøven og Kims leg (pure, unit-tested). */

const rollDie = (rnd = Math.random) => 1 + Math.floor(rnd() * 6);

// ── Triktrak (backgammon). points[i] > 0 = white (seat 0) checkers, < 0 = black (seat 1).
// White moves from point 23 down to 0 and bears off below 0; black moves from 0 up to 23 and bears off above 23.
export function newTriktrak(players) {
  const p = Array(24).fill(0);
  p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5;
  p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5;
  return { players: players.map(x => ({ name: x.name, ai: !!x.ai })), points: p, bar: [0, 0], off: [0, 0], turn: 0, phase: 'roll', dice: [], left: [], last: null, winner: null, log: [] };
}
const sign = (seat) => (seat === 0 ? 1 : -1);
const own = (s, seat, i) => s.points[i] * sign(seat) > 0;
const home = (seat, i) => (seat === 0 ? i <= 5 : i >= 18);
const allHome = (s, seat) => s.bar[seat] === 0 && s.points.every((v, i) => !(v * sign(seat) > 0) || home(seat, i));
/** single moves with one die */
export function singleMoves(s, seat, die) {
  const out = [], dir = seat === 0 ? -1 : 1, open = (i) => s.points[i] * sign(seat) >= -1;
  if (s.bar[seat]) { const to = seat === 0 ? 24 - die : die - 1; if (open(to)) out.push({ from: 'bar', to, die }); return out; }
  const canOff = allHome(s, seat);
  for (let i = 0; i < 24; i++) {
    if (!own(s, seat, i)) continue;
    const to = i + dir * die;
    if (to >= 0 && to <= 23) { if (open(to)) out.push({ from: i, to, die }); continue; }
    if (!canOff) continue;
    const exact = seat === 0 ? to === -1 : to === 24;
    // a higher die may bear off only the checker furthest from home
    const further = seat === 0 ? s.points.some((v, j) => j > i && v > 0) : s.points.some((v, j) => j < i && v < 0);
    if (exact || !further) out.push({ from: i, to: 'off', die });
  }
  return out;
}
export function applySingle(s, seat, m) {
  const t = { ...s, points: s.points.slice(), bar: s.bar.slice(), off: s.off.slice() }, sg = sign(seat);
  if (m.from === 'bar') t.bar[seat]--; else t.points[m.from] -= sg;
  let hit = false;
  if (m.to === 'off') t.off[seat]++;
  else { if (t.points[m.to] === -sg) { t.points[m.to] = 0; t.bar[1 - seat]++; hit = true; } t.points[m.to] += sg; }
  return { state: t, hit };
}
/** all maximal sequences of moves for the dice that are left */
export function sequences(s, seat, dice) {
  const res = [];
  const rec = (st, left, path) => {
    let moved = false;
    const tried = new Set();
    for (let k = 0; k < left.length; k++) {
      if (tried.has(left[k])) continue; tried.add(left[k]);
      for (const m of singleMoves(st, seat, left[k])) { moved = true; const r = applySingle(st, seat, m); rec(r.state, left.filter((_, j) => j !== k), [...path, m]); }
    }
    if (!moved) res.push({ moves: path, state: st });
  };
  rec(s, dice, []);
  const max = Math.max(0, ...res.map(r => r.moves.length));
  let best = res.filter(r => r.moves.length === max);
  if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) { const hi = Math.max(...dice); if (best.some(r => r.moves[0].die === hi)) best = best.filter(r => r.moves[0].die === hi); }
  return best;
}
export function legalMoves(s, seat) {
  const seen = new Set(), out = [];
  for (const q of sequences(s, seat, s.left)) { const m = q.moves[0]; if (!m) continue; const k = `${m.from}>${m.to}>${m.die}`; if (!seen.has(k)) { seen.add(k); out.push(m); } }
  return out;
}
const nextTurn = (s) => { s.turn = 1 - s.turn; s.phase = 'roll'; s.dice = []; s.left = []; };
export function applyTriktrak(s, seat, name, args = [], rnd = Math.random) {
  if (s.phase === 'over' || seat !== s.turn) return false;
  const who = s.players[seat].name;
  if (name === 'roll' && s.phase === 'roll') {
    const a = args[0] ?? rollDie(rnd), b = args[1] ?? rollDie(rnd);
    s.dice = [a, b]; s.left = a === b ? [a, a, a, a] : [a, b]; s.phase = 'move'; s.last = { roll: [a, b], at: Date.now() };
    s.log.unshift(`${who} slog ${a} og ${b}`);
    if (!legalMoves(s, seat).length) { s.log.unshift(`${who} kan ikke flytte`); nextTurn(s); }
    s.log = s.log.slice(0, 12); return true;
  }
  if (name === 'move' && s.phase === 'move') {
    const [from, to, die] = args, m = legalMoves(s, seat).find(x => x.from === from && x.to === to && x.die === die);
    if (!m) return false;
    const r = applySingle(s, seat, m); Object.assign(s, { points: r.state.points, bar: r.state.bar, off: r.state.off });
    s.left.splice(s.left.indexOf(die), 1); s.last = { ...s.last, move: m, hit: r.hit, at: Date.now() };
    if (r.hit) s.log.unshift(`${who} slog en brik ud!`);
    if (s.off[seat] === 15) { s.phase = 'over'; s.winner = seat; s.log.unshift(`${who} har båret alle brikker af og vinder!`); return true; }
    if (!s.left.length || !legalMoves(s, seat).length) nextTurn(s);
    return true;
  }
  return false;
}
export const pips = (s, seat) => s.points.reduce((a, v, i) => a + (v * sign(seat) > 0 ? Math.abs(v) * (seat === 0 ? i + 1 : 24 - i) : 0), 0) + s.bar[seat] * 25;
function evaluate(st, seat) {
  const sg = sign(seat), me = seat, them = 1 - seat; let score = (pips(st, them) - pips(st, me)) + st.off[me] * 4 + st.bar[them] * 14 - st.bar[me] * 14;
  for (let i = 0; i < 24; i++) { const v = st.points[i] * sg; if (v === 1) score -= home(them, i) ? 7 : 4; if (v >= 2) score += home(me, i) ? 5 : 2.5; }
  return score;
}
export function aiTriktrak(s, seat) {
  if (s.phase === 'roll') return { name: 'roll', args: [] };
  let best = null, bs = -Infinity;
  for (const q of sequences(s, seat, s.left)) { if (!q.moves.length) continue; const v = evaluate(q.state, seat) + Math.random() * 0.01; if (v > bs) { bs = v; best = q.moves[0]; } }
  return best ? { name: 'move', args: [best.from, best.to, best.die] } : { name: 'roll', args: [] };
}

// ── 10.000 (dice): set aside scoring dice, roll on or stop ──
export function scoreDice(d) {
  const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of d) c[v]++;
  if (d.length === 6 && c.slice(1).every(n => n === 1)) return 1500;
  if (d.length === 6 && c.filter(n => n === 2).length === 3) return 750;
  let pts = 0;
  for (let f = 1; f <= 6; f++) {
    let n = c[f];
    if (n >= 3) { pts += (f === 1 ? 1000 : f * 100) * 2 ** (n - 3); n = 0; }
    if (f === 1) pts += n * 100; else if (f === 5) pts += n * 50; else if (n) return 0;   // dice that don't score make the choice invalid
  }
  return pts;
}
/** does a roll have any scoring dice at all? */
export const anyScore = (d) => d.includes(1) || d.includes(5) || [2, 3, 4, 6].some(f => d.filter(x => x === f).length >= 3) || (d.length === 6 && (new Set(d).size === 6 || [1, 2, 3, 4, 5, 6].filter(f => d.filter(x => x === f).length === 2).length === 3));
export const GOAL = 10000;
export function newTenk(players) { return { players: players.map(p => ({ name: p.name, ai: !!p.ai })), scores: players.map(() => 0), turn: 0, phase: 'roll', dice: [], kept: [], turnPts: 0, free: 6, last: null, winner: null, log: [] }; }
export function applyTenk(s, seat, name, args = [], rnd = Math.random) {
  if (s.phase === 'over' || seat !== s.turn) return false;
  const who = s.players[seat].name, next = () => { s.turn = (s.turn + 1) % s.players.length; s.phase = 'roll'; s.dice = []; s.kept = []; s.turnPts = 0; s.free = 6; };
  if (name === 'roll' && s.phase === 'roll') {
    s.dice = args[0] || Array.from({ length: s.free }, () => rollDie(rnd)); s.last = { at: Date.now() };
    if (!anyScore(s.dice)) { s.log.unshift(`${who} slog ${s.dice.join(' ')} – ingen point, turen går videre${s.turnPts ? ` (${s.turnPts} tabt)` : ''}`); s.phase = 'bust'; s.bustAt = Date.now(); s.log = s.log.slice(0, 12); return true; }
    s.phase = 'keep'; return true;
  }
  if (name === 'next' && s.phase === 'bust') { next(); return true; }
  if ((name === 'keep' || name === 'bank') && s.phase === 'keep') {
    const idx = args[0] || []; if (!idx.length || new Set(idx).size !== idx.length || idx.some(i => i < 0 || i >= s.dice.length)) return false;
    const pick = idx.map(i => s.dice[i]), pts = scoreDice(pick); if (!pts) return false;
    s.turnPts += pts; s.kept = [...s.kept, ...pick]; s.free -= pick.length; if (s.free === 0) s.free = 6;      // all six used: roll all six again
    if (name === 'bank') {
      s.scores[seat] += s.turnPts; s.log.unshift(`${who} stoppede med ${s.turnPts} point (${s.scores[seat]} i alt)`); s.log = s.log.slice(0, 12);
      if (s.scores[seat] >= GOAL) { s.phase = 'over'; s.winner = seat; s.log.unshift(`${who} nåede 10.000 og vinder!`); return true; }
      next(); return true;
    }
    s.dice = []; s.phase = 'roll'; return true;
  }
  return false;
}
/** the best set of dice to keep from a roll (most points) */
export function bestKeep(d) {
  let best = null, bp = 0;
  for (let mask = 1; mask < 1 << d.length; mask++) { const idx = d.map((_, i) => i).filter(i => mask & (1 << i)), p = scoreDice(idx.map(i => d[i])); if (p > bp || (p === bp && best && idx.length < best.length)) { bp = p; best = idx; } }
  return { idx: best || [], pts: bp };
}
export function aiTenk(s, seat) {
  if (s.phase === 'roll') return { name: 'roll', args: [] };
  if (s.phase === 'bust') return { name: 'next', args: [] };
  const k = bestKeep(s.dice), left = s.free - k.idx.length, total = s.turnPts + k.pts;
  const bank = (left > 0 && left <= 2 && total >= 300) || (left === 3 && total >= 500) || total >= 1000 || s.scores[seat] + total >= GOAL;
  return { name: bank && left !== 0 ? 'bank' : 'keep', args: [k.idx] };
}

// ── Sorteper: pairs out, draw from the next player; whoever ends with Sorteper (spar knægt) loses ──
export const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANKS = ['', 'E', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
export const OLD = 'S11';
export function oldDeck() { const d = []; for (const s of 'SHDC') for (let r = 1; r <= 13; r++) if (`${s}${r}` !== 'C11') d.push(`${s}${r}`); return d; }
const rank = (c) => Number(c.slice(1));
export function dropPairs(hand) {
  const keep = [], by = {};
  for (const c of hand) { if (c === OLD) { keep.push(c); continue; } const r = rank(c); if (by[r]) { keep.splice(keep.indexOf(by[r]), 1); by[r] = null; } else { by[r] = c; keep.push(c); } }
  return keep;
}
export function newOldmaid(players, rnd = Math.random) {
  const d = oldDeck(); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const hands = players.map(() => []); d.forEach((c, i) => hands[i % players.length].push(c));
  const s = { players: players.map(p => ({ name: p.name, ai: !!p.ai })), hands: hands.map(dropPairs), turn: 0, phase: 'play', last: null, loser: null, out: [], log: [] };
  settle(s); return s;
}
const nextWith = (s, from) => { for (let k = 1; k <= s.players.length; k++) { const i = (from + k) % s.players.length; if (s.hands[i].length) return i; } return -1; };
function settle(s) {
  const left = s.hands.map((h, i) => (h.length ? i : -1)).filter(i => i >= 0);
  for (let i = 0; i < s.players.length; i++) if (!s.hands[i].length && !s.out.includes(i)) s.out.push(i);
  if (left.length <= 1) { s.phase = 'over'; s.loser = left[0] ?? null; s.winner = s.out[0] ?? null; if (s.loser != null) s.log.unshift(`${s.players[s.loser].name} sidder med Sorteper!`); return; }
  if (!s.hands[s.turn].length) s.turn = nextWith(s, s.turn);
}
/** the player the current one draws from */
export const drawFrom = (s) => nextWith(s, s.turn);
export function applyOldmaid(s, seat, name, args = [], rnd = Math.random) {
  if (s.phase !== 'play' || seat !== s.turn || name !== 'draw') return false;
  const from = drawFrom(s); if (from < 0 || from === seat) return false;
  const k = Number.isInteger(args[0]) ? args[0] : Math.floor(rnd() * s.hands[from].length); if (k < 0 || k >= s.hands[from].length) return false;
  const [card] = s.hands[from].splice(k, 1), before = s.hands[seat].length;
  s.hands[seat] = dropPairs([...s.hands[seat], card]);
  const pair = s.hands[seat].length < before + 1;
  s.last = { seat, from, card: pair ? card : null, pair, at: Date.now() };
  s.log.unshift(`${s.players[seat].name} trak et kort fra ${s.players[from].name}${pair ? ` og fik et par ${RANKS[rank(card)]}'ere` : ''}`); s.log = s.log.slice(0, 10);
  s.turn = nextWith(s, seat); if (s.turn < 0) s.turn = seat;
  settle(s); return true;
}
export const aiOldmaid = (s) => ({ name: 'draw', args: [] });
export const cardLabel = (c) => `${RANKS[rank(c)]}${SUITS[c[0]]}`;

// ── Del regningen ──
export function splitBill(total, people, tipPct = 0, round = 1) {
  const n = Math.max(1, Math.floor(people)), withTip = total * (1 + tipPct / 100), each = withTip / n, rounded = Math.ceil(each / round) * round;
  return { withTip, each, rounded, extra: rounded * n - withTip };
}
/** who owes whom when people paid different amounts – fewest payments */
export function settleUp(paid) {
  const names = Object.keys(paid), total = names.reduce((a, k) => a + paid[k], 0), share = total / (names.length || 1);
  const bal = names.map(n => ({ n, v: Math.round((paid[n] - share) * 100) / 100 }));
  const out = [], pos = bal.filter(b => b.v > 0).sort((a, b) => b.v - a.v), neg = bal.filter(b => b.v < 0).sort((a, b) => a.v - b.v);
  let i = 0, j = 0;
  while (i < pos.length && j < neg.length) { const amt = Math.min(pos[i].v, -neg[j].v); if (amt > 0.004) out.push({ from: neg[j].n, to: pos[i].n, amount: Math.round(amt * 100) / 100 }); pos[i].v -= amt; neg[j].v += amt; if (pos[i].v < 0.005) i++; if (neg[j].v > -0.005) j++; }
  return { share, out };
}

// ── Navnemaskine ──
export const NAME_PARTS = {
  hold: [['De Lynhurtige', 'De Modige', 'De Vilde', 'De Glade', 'De Snedige', 'De Stærke', 'De Hemmelige', 'De Gyldne', 'De Flyvende', 'De Usynlige', 'De Larmende', 'De Kloge'], ['Ørne', 'Ulve', 'Drager', 'Pingviner', 'Raketter', 'Lyn', 'Tigre', 'Ninjaer', 'Kometer', 'Pirater', 'Robotter', 'Bjørne']],
  rum: [['Nova', 'Astra', 'Zeta', 'Orion', 'Vega', 'Kosmo', 'Luna', 'Sirius', 'Nebula', 'Kvasar'], ['-7', ' Prime', 'X', ' Station', ' 3000', 'ia', 'on', ' Beta', ' Omega', ' Alfa']],
  fantasy: [['Al', 'Bri', 'Eld', 'Fae', 'Gal', 'Ith', 'Mor', 'Syl', 'Thal', 'Vae', 'Ky', 'Ro'], ['adrin', 'wen', 'oril', 'andra', 'ion', 'eth', 'iel', 'uin', 'ara', 'ondo', 'ith', 'enna']],
  kæledyr: [['Lille', 'Store', 'Hr.', 'Fru', 'Kaptajn', 'Doktor', 'Sir', 'Prinsesse', 'Professor', 'Baron'], ['Snuden', 'Pjuske', 'Bamse', 'Kringle', 'Muffin', 'Pop', 'Lakrids', 'Bønne', 'Krølle', 'Pelle', 'Smilla', 'Kiks']],
  wifi: [['Ikke', 'Hemmeligt', 'Langsomt', 'Superhurtigt', 'Gratis', 'Familie', 'Gæste', 'Pizza', 'Hyggelig', 'Spion'], ['-Net', ' Bølgen', '-Hotspot', ' Router', '5G-ish', ' Signalet', ' Forbindelsen', ' Netværk']],
};
export function makeName(kind, rnd = Math.random) { const [a, b] = NAME_PARTS[kind] || NAME_PARTS.hold; const x = a[Math.floor(rnd() * a.length)], y = b[Math.floor(rnd() * b.length)]; return kind === 'fantasy' || kind === 'rum' ? `${x}${y}` : `${x} ${y}`.replace(/ (-|\d)/, '$1'); }

// ── Skriveværksted ──
export const PROMPTS = [
  'Du vågner op, og alle i byen er forsvundet – undtagen dig og en hund, der kan tale.',
  'En gammel nøgle falder ud af en bog på biblioteket. Der står et tal på den.',
  'Din robot har lært at lyve. Hvad er det første, den lyver om?',
  'Klassen tager på tur, men bussen kører en vej, der ikke står på noget kort.',
  'Skriv om den dag, hvor tyngdekraften holdt fri i en time.',
  'En brevdue lander i vindueskarmen med en besked til dig – fra fremtiden.',
  'Du finder en dør i kælderen, som ikke var der i går.',
  'Skriv en historie, der starter med: “Det var ikke min skyld, at elefanten kom med i skole.”',
  'Et computerspil begynder at sende dig beskeder, selv når skærmen er slukket.',
  'Beskriv din by om hundrede år, set gennem øjnene på en kat.',
  'Du får én superkraft, men den virker kun om tirsdagen.',
  'To venner bytter krop for en dag. Hvem fortryder det mest?',
  'Skriv om en drage, der er bange for ild.',
  'Den gamle nabo inviterer dig ind og viser dig sin samling af … hvad?',
  'Et stormvejr lukker alle inde på skolen natten over.',
  'Du opdager, at dit spejlbillede gør noget andet end dig.',
];
export const textCount = (t) => { const s = String(t).trim(); return { words: s ? s.split(/\s+/).length : 0, chars: s.length, sentences: (s.match(/[.!?]+(\s|$)/g) || []).length }; };

// ── Cykelprøven ──
export const BIKE = [
  ['Hvilken side af vejen skal du cykle i?', ['Højre side', 'Venstre side', 'Midt på vejen'], 0, 'I Danmark kører og cykler man i højre side – på cykelstien, hvis der er en.'],
  ['Hvad betyder hajtænder (hvide trekanter) på vejen foran dig?', ['Du skal holde tilbage for trafikken på den anden vej', 'Du har forkørselsret', 'Der er en fodgængerovergang'], 0, 'Hajtænder betyder ubetinget vigepligt: Du skal holde tilbage for de andre.'],
  ['Hvordan viser du, at du vil dreje til venstre?', ['Strækker venstre arm ud til siden', 'Strækker højre arm ud', 'Ringer med klokken'], 0, 'Stræk venstre arm ud i god tid, før du drejer.'],
  ['Hvordan viser du, at du vil standse?', ['Løfter den ene hånd op', 'Rækker begge arme frem', 'Kigger dig tilbage'], 0, 'Man løfter en hånd op for at vise, at man vil standse.'],
  ['Hvordan drejer man til venstre i et lyskryds på cykel?', ['I to tempi: kør over krydset, stop, og kør så ligeud igen', 'Kør ind midt på vejen og drej som en bil', 'Drej skråt over krydset med det samme'], 0, 'Cyklister drejer til venstre i to tempi: først ligeud over krydset, stop ved hjørnet, og så ligeud igen, når der er grønt.'],
  ['Hvad skal en cykel have, når du cykler i mørke?', ['Hvidt lys foran og rødt lys bagpå', 'Kun refleks på pedalerne', 'Et gult lys bagpå'], 0, 'I mørke skal du have hvidt eller gulligt lys foran og rødt lys bagpå – og reflekser.'],
  ['Må du cykle på fortovet?', ['Nej, som hovedregel ikke', 'Ja, altid', 'Kun hvis du ringer med klokken'], 0, 'Fortovet er til fodgængere. Cykel på cykelstien eller i vejens højre side.'],
  ['Hvad gør du, når en bus holder ved et stoppested med cykelsti forbi?', ['Holder tilbage for passagerer, der stiger af og på', 'Ringer og kører hurtigt forbi', 'Kører ud på fortovet'], 0, 'Du skal holde tilbage for de passagerer, der går til og fra bussen.'],
  ['Hvorfor er det farligt at køre ind på højre side af en lastbil, der skal dreje?', ['Chaufføren kan ikke altid se dig', 'Lastbilen kører altid hurtigt', 'Det er ikke farligt'], 0, 'Store biler har blinde vinkler. Hold dig bag lastbilen, til den har drejet.'],
  ['Hvad betyder et rødt lys med en cykel i lyskrydset?', ['Cyklister skal holde', 'Kun biler skal holde', 'Du må køre, hvis der er tomt'], 0, 'Rødt cykellys betyder stop for cyklister.'],
  ['Hvad skal du gøre, før du kører ud fra kantstenen?', ['Kigge dig tilbage og give tegn', 'Ringe med klokken', 'Køre hurtigt ud'], 0, 'Se dig tilbage og giv tegn, før du trækker ud.'],
  ['Hvorfor bør du bruge cykelhjelm?', ['Den beskytter hovedet, hvis du falder', 'Den er påbudt ved lov for alle', 'Den gør cyklen hurtigere'], 0, 'Hjelmen beskytter hovedet ved styrt – også selvom den ikke er påbudt for cyklister i Danmark.'],
  ['Hvem har vigepligt, når en fodgænger er på et fodgængerfelt?', ['Du skal holde tilbage for fodgængeren', 'Fodgængeren skal vente på dig', 'Den hurtigste'], 0, 'Fodgængere på et fodgængerfelt skal have lov at gå over.'],
  ['Hvad betyder højre vigepligt?', ['Du skal holde tilbage for trafik, der kommer fra højre', 'Du skal altid dreje til højre', 'Trafik fra venstre har vigepligt for dig'], 0, 'Er der ingen skilte eller hajtænder, skal du holde tilbage for dem, der kommer fra højre.'],
  ['Hvordan skal bremserne på en cykel være?', ['Der skal være to bremser, der virker', 'Én bremse er nok', 'Det er lige meget'], 0, 'En cykel skal have to bremser, der virker uafhængigt af hinanden.'],
];

// ── Kims leg ──
export const KIM_ITEMS = ['🍎', '🔑', '⚽', '🎸', '🕶️', '📚', '🧸', '🎈', '⏰', '🖍️', '🧦', '🍕', '🚲', '🌵', '🎩', '🐢', '🔦', '🧲', '🍌', '🎲', '🪁', '📎', '🧩', '🥕', '🐟', '🌂', '🧁', '🚀'];
export function kimRound(n, rnd = Math.random) {
  const pool = KIM_ITEMS.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const shown = pool.slice(0, n), gone = shown[Math.floor(rnd() * n)], extra = pool.slice(n, n + 3);
  return { shown, gone, options: [gone, ...extra].sort(() => rnd() - 0.5) };
}
