/**
 * Meyer – the Danish bluffing game with two dice. Roll in secret and say what you have – or something higher.
 * The next player believes you (and must roll and beat it) or "løfter" (lifts the cup). If you said more than you had,
 * you lose a life; if you told the truth, the lifter does. Meyer (21) is the best and costs two lives.
 * Order: 21 > 31 > 66 > 55 > 44 > 33 > 22 > 11 > 65 > 64 > … > 41 > 32.
 */
export const ORDER = (() => { const o = [21, 31, 66, 55, 44, 33, 22, 11]; for (let a = 6; a >= 3; a--) for (let b = a - 1; b >= 1; b--) if (!(a === 2 && b === 1) && !(a === 3 && b === 1)) o.push(a * 10 + b); return o; })();
export const strength = (v) => ORDER.length - ORDER.indexOf(v);          // higher is better
export const valueOf = (d1, d2) => { const hi = Math.max(d1, d2), lo = Math.min(d1, d2); return hi * 10 + lo; };
export const NAME = (v) => (v === 21 ? 'Meyer (21)' : v === 31 ? 'Lille Meyer (31)' : v % 11 === 0 ? `Par ${v % 10}'ere (${v})` : String(v));
export function newGame(seats, lives = 3) {
  return { players: seats.slice(0, 6).map(p => ({ ...p })), lives: seats.slice(0, 6).map(() => lives), turn: 0, phase: 'roll', roll: null, dice: null, said: null, by: null, log: [], winner: null, last: null };
}
const alive = (s) => s.lives.map((l, i) => (l > 0 ? i : -1)).filter(i => i >= 0);
const nextAlive = (s, i) => { for (let k = 1; k <= s.players.length; k++) { const j = (i + k) % s.players.length; if (s.lives[j] > 0) return j; } return i; };
const say = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 12); };
/** values you may announce now (must beat what was said) */
export const canSay = (s) => ORDER.filter(v => s.said == null || strength(v) > strength(s.said));
function loseLife(s, who, n) {
  s.lives[who] = Math.max(0, s.lives[who] - n);
  if (!s.lives[who]) say(s, `${s.players[who].name} er ude!`);
  const left = alive(s);
  if (left.length <= 1) { s.phase = 'over'; s.winner = left[0] ?? who; return; }
  s.turn = s.lives[who] > 0 ? who : nextAlive(s, who);
  s.phase = 'roll'; s.said = null; s.by = null; s.roll = null; s.dice = null;
}
export function apply(s, seat, name, args = [], rnd = Math.random) {
  if (s.phase === 'over' || seat !== s.turn) return false;
  const who = s.players[seat].name;
  if (name === 'roll' && s.phase === 'roll') {
    const d = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    s.dice = d; s.roll = valueOf(...d); s.phase = 'announce'; s.last = { seat, rolled: true, at: Date.now() }; return true;
  }
  if (name === 'announce' && s.phase === 'announce') {
    const v = Number(args[0]); if (!canSay(s).includes(v)) return false;
    s.said = v; s.by = seat; s.turn = nextAlive(s, seat); s.phase = 'respond';
    say(s, `${who} siger ${NAME(v)}`); s.last = { seat, said: v, at: Date.now() }; return true;
  }
  if (s.phase !== 'respond') return false;
  if (name === 'believe') { say(s, `${who} tror på det og slår`); s.phase = 'roll'; s.roll = null; s.dice = null; return true; }
  if (name === 'lift') {
    const lied = strength(s.roll) < strength(s.said), cost = s.said === 21 ? 2 : 1;
    s.reveal = { dice: s.dice, roll: s.roll, said: s.said, by: s.by, lifter: seat, lied, at: Date.now() };
    say(s, `${who} løfter: ${s.players[s.by].name} havde ${NAME(s.roll)} – ${lied ? 'snyd!' : 'det var sandt!'}`);
    loseLife(s, lied ? s.by : seat, cost);
    return true;
  }
  return false;
}
/** the computer: tells the truth when it can (sometimes a little more), bluffs just above otherwise, lifts suspicious claims */
export function aiMove(s, seat, rnd = Math.random) {
  if (s.phase === 'over' || s.turn !== seat) return null;
  if (s.phase === 'roll') return { name: 'roll', args: [] };
  if (s.phase === 'announce') {
    const ok = canSay(s);
    if (!ok.length) return { name: 'announce', args: [21] };
    if (ok.includes(s.roll)) {
      const higher = ok.filter(v => strength(v) > strength(s.roll));
      return { name: 'announce', args: [rnd() < 0.15 && higher.length ? higher[higher.length - 1] : s.roll] };
    }
    return { name: 'announce', args: [ok[ok.length - 1 - Math.floor(rnd() * Math.min(2, ok.length))]] };
  }
  // respond: how likely is a random roll at least this good?
  const p = (ORDER.filter(v => strength(v) >= strength(s.said)).reduce((a, v) => a + (v % 11 === 0 ? 1 : 2), 0)) / 36;
  return { name: p < 0.28 + rnd() * 0.12 ? 'lift' : 'believe', args: [] };
}
