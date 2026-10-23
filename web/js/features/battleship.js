/**
 * Sænke slagskibe – 10×10, the fleet: 5, 4, 3, 3 and 2. Both place their ships (or let them be placed at random),
 * then take turns firing at the other's sea. A hit gives another shot. Sink the whole fleet to win.
 * Cells are 0–99 (row * 10 + col). A placement is written as "start:length:dir" joined by ";", dir h or v.
 */
export const FLEET = [5, 4, 3, 3, 2];
export const SHIP_NAMES = { 5: 'Hangarskib', 4: 'Slagskib', 3: 'Krydser', 2: 'Ubåd' };

export function shipCells(start, len, dir) {
  const r = Math.floor(start / 10), c = start % 10, out = [];
  for (let k = 0; k < len; k++) { const rr = dir === 'v' ? r + k : r, cc = dir === 'h' ? c + k : c; if (rr > 9 || cc > 9) return null; out.push(rr * 10 + cc); }
  return out;
}
/** ships may not overlap or touch each other (not even on the corners) */
export function validFleet(ships) {
  if (ships.length !== FLEET.length || ships.map(s => s.length).sort().join() !== FLEET.slice().sort().join()) return false;
  const taken = new Set();
  for (const s of ships) {
    if (!s || s.some(c => c < 0 || c > 99)) return false;
    for (const c of s) {
      const r = Math.floor(c / 10), cc = c % 10;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, c2 = cc + dc; if (rr < 0 || rr > 9 || c2 < 0 || c2 > 9) continue;
        if (taken.has(rr * 10 + c2)) return false;
      }
    }
    s.forEach(c => taken.add(c));
  }
  return true;
}
export const encode = (placed) => placed.map(p => `${p.start}:${p.len}:${p.dir}`).join(';');
export function decode(str) {
  const out = [];
  for (const part of String(str || '').split(';')) { const [a, b, d] = part.split(':'); const cells = shipCells(Number(a), Number(b), d); if (!cells) return null; out.push(cells); }
  return out;
}
export function randomFleet(rnd = Math.random) {
  for (let tries = 0; tries < 500; tries++) {
    const placed = [], ships = [];
    let ok = true;
    for (const len of FLEET) {
      let done = false;
      for (let k = 0; k < 200 && !done; k++) {
        const dir = rnd() < 0.5 ? 'h' : 'v', start = Math.floor(rnd() * 100), cells = shipCells(start, len, dir);
        if (cells && touchFree([...ships, cells])) { ships.push(cells); placed.push({ start, len, dir }); done = true; }
      }
      if (!done) { ok = false; break; }
    }
    if (ok) return placed;
  }
  return null;
}
function touchFree(ships) {
  const taken = new Set();
  for (const s of ships) {
    for (const c of s) { const r = Math.floor(c / 10), cc = c % 10; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, c2 = cc + dc; if (rr >= 0 && rr <= 9 && c2 >= 0 && c2 <= 9 && taken.has(rr * 10 + c2)) return false; } }
    s.forEach(c => taken.add(c));
  }
  return true;
}

export function newGame(seats) {
  return { players: seats.slice(0, 2).map(p => ({ ...p })), fleets: [null, null], shots: [[], []], turn: 0, phase: 'place', winner: null, last: null, log: [] };
}
/** what seat sees of the opponent's sea: per cell null | 'miss' | 'hit' | 'sunk' */
export function seaView(s, target) {
  const v = Array(100).fill(null), fleet = s.fleets[target] || [], shots = new Set(s.shots[target]);
  for (const c of shots) v[c] = 'miss';
  for (const ship of fleet) { const hit = ship.filter(c => shots.has(c)); const sunk = hit.length === ship.length; for (const c of hit) v[c] = sunk ? 'sunk' : 'hit'; }
  return v;
}
export const sunkCount = (s, target) => (s.fleets[target] || []).filter(ship => ship.every(c => s.shots[target].includes(c))).length;
const say = (s, t) => { s.log.unshift(t); s.log = s.log.slice(0, 12); };

export function apply(s, seat, name, args = []) {
  if (s.phase === 'over') return false;
  if (name === 'place') {
    if (s.phase !== 'place' || s.fleets[seat]) return false;
    const ships = decode(args[0]);
    if (!ships || !validFleet(ships)) return false;
    s.fleets[seat] = ships;
    if (s.fleets.every(Boolean)) { s.phase = 'play'; say(s, 'Begge flåder er klar – skyd!'); }
    return true;
  }
  if (name === 'fire') {
    if (s.phase !== 'play' || seat !== s.turn) return false;
    const c = args[0], target = 1 - seat;
    if (!Number.isInteger(c) || c < 0 || c > 99 || s.shots[target].includes(c)) return false;
    s.shots[target].push(c);
    const ship = s.fleets[target].find(sh => sh.includes(c));
    const sunk = ship && ship.every(x => s.shots[target].includes(x));
    s.last = { seat, cell: c, hit: !!ship, sunk: !!sunk, at: Date.now() };
    if (sunk) say(s, `${s.players[seat].name} sænkede et ${SHIP_NAMES[ship.length].toLowerCase()}!`);
    if (sunkCount(s, target) === FLEET.length) { s.phase = 'over'; s.winner = seat; say(s, `${s.players[seat].name} har sænket hele flåden!`); return true; }
    if (!ship) s.turn = target;          // a hit: shoot again
    return true;
  }
  return false;
}

/** the computer: random (on a chessboard pattern) until it hits, then follows the ship */
export function aiMove(s, seat, rnd = Math.random) {
  if (s.phase === 'place') return s.fleets[seat] ? null : { name: 'place', args: [encode(randomFleet(rnd))] };
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const target = 1 - seat, view = seaView(s, target), free = (c) => c >= 0 && c < 100 && view[c] === null;
  const hits = view.map((v, i) => (v === 'hit' ? i : -1)).filter(i => i >= 0);
  const nb = (c) => [c - 10, c + 10, c % 10 ? c - 1 : -1, c % 10 < 9 ? c + 1 : -1].filter(free);
  if (hits.length) {
    if (hits.length > 1) {
      const horiz = Math.floor(hits[0] / 10) === Math.floor(hits[1] / 10), sorted = hits.slice().sort((a, b) => a - b);
      const ends = horiz ? [sorted[0] % 10 ? sorted[0] - 1 : -1, sorted.at(-1) % 10 < 9 ? sorted.at(-1) + 1 : -1] : [sorted[0] - 10, sorted.at(-1) + 10];
      const f = ends.filter(free); if (f.length) return { name: 'fire', args: [f[Math.floor(rnd() * f.length)]] };
    }
    const cand = hits.flatMap(nb); if (cand.length) return { name: 'fire', args: [cand[Math.floor(rnd() * cand.length)]] };
  }
  // cells next to a sunk ship can't hold another ship
  const blocked = new Set();
  view.forEach((v, i) => { if (v === 'sunk') { const r = Math.floor(i / 10), c = i % 10; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr <= 9 && cc >= 0 && cc <= 9) blocked.add(rr * 10 + cc); } } });
  let opts = view.map((v, i) => (v === null && !blocked.has(i) && (Math.floor(i / 10) + i) % 2 === 0 ? i : -1)).filter(i => i >= 0);
  if (!opts.length) opts = view.map((v, i) => (v === null && !blocked.has(i) ? i : -1)).filter(i => i >= 0);
  if (!opts.length) opts = view.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0);
  return { name: 'fire', args: [opts[Math.floor(rnd() * opts.length)]] };
}
