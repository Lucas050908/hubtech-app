/** Logic for Gloser, Robotvej, Solsystemet, Køleskabet, Opsparing, Kassemand and Juveler (pure, unit-tested). */

// ── Gloser: word sets and a Leitner box system ──
export const VOCAB = {
  'en-dyr': { lang: 'Engelsk', name: 'Dyr', words: [['hund', 'dog'], ['kat', 'cat'], ['hest', 'horse'], ['ko', 'cow'], ['gris', 'pig'], ['fugl', 'bird'], ['fisk', 'fish'], ['mus', 'mouse'], ['ræv', 'fox'], ['bjørn', 'bear'], ['ulv', 'wolf'], ['får', 'sheep'], ['and', 'duck'], ['kanin', 'rabbit'], ['egern', 'squirrel'], ['hval', 'whale']] },
  'en-mad': { lang: 'Engelsk', name: 'Mad', words: [['brød', 'bread'], ['mælk', 'milk'], ['æble', 'apple'], ['ost', 'cheese'], ['smør', 'butter'], ['æg', 'egg'], ['kylling', 'chicken'], ['kartoffel', 'potato'], ['gulerod', 'carrot'], ['vand', 'water'], ['sukker', 'sugar'], ['salt', 'salt'], ['ris', 'rice'], ['suppe', 'soup'], ['kage', 'cake'], ['jordbær', 'strawberry']] },
  'en-skole': { lang: 'Engelsk', name: 'Skole', words: [['blyant', 'pencil'], ['bog', 'book'], ['lærer', 'teacher'], ['elev', 'pupil'], ['tavle', 'blackboard'], ['lektier', 'homework'], ['frikvarter', 'break'], ['klasse', 'class'], ['viskelæder', 'eraser'], ['lineal', 'ruler'], ['taske', 'bag'], ['skema', 'timetable'], ['prøve', 'test'], ['spørgsmål', 'question'], ['svar', 'answer'], ['sprog', 'language']] },
  'en-verber': { lang: 'Engelsk', name: 'Udsagnsord', words: [['at løbe', 'to run'], ['at spise', 'to eat'], ['at sove', 'to sleep'], ['at læse', 'to read'], ['at skrive', 'to write'], ['at svømme', 'to swim'], ['at synge', 'to sing'], ['at købe', 'to buy'], ['at tænke', 'to think'], ['at hjælpe', 'to help'], ['at glemme', 'to forget'], ['at vinde', 'to win'], ['at bygge', 'to build'], ['at lære', 'to learn'], ['at rejse', 'to travel'], ['at vælge', 'to choose']] },
  'de-basis': { lang: 'Tysk', name: 'Basis', words: [['hus', 'das Haus'], ['bil', 'das Auto'], ['bog', 'das Buch'], ['skole', 'die Schule'], ['ven', 'der Freund'], ['by', 'die Stadt'], ['vand', 'das Wasser'], ['hund', 'der Hund'], ['kat', 'die Katze'], ['bord', 'der Tisch'], ['stol', 'der Stuhl'], ['vindue', 'das Fenster'], ['dag', 'der Tag'], ['nat', 'die Nacht'], ['tak', 'danke'], ['goddag', 'guten Tag']] },
  'de-tal': { lang: 'Tysk', name: 'Tal og farver', words: [['en', 'eins'], ['to', 'zwei'], ['tre', 'drei'], ['fire', 'vier'], ['fem', 'fünf'], ['seks', 'sechs'], ['syv', 'sieben'], ['otte', 'acht'], ['ni', 'neun'], ['ti', 'zehn'], ['rød', 'rot'], ['blå', 'blau'], ['grøn', 'grün'], ['gul', 'gelb'], ['sort', 'schwarz'], ['hvid', 'weiß']] },
};
export const BOX_DAYS = [0, 1, 2, 4, 7, 14];          // days until a card in box i comes back
const DAY = 86400000;
/** after an answer: right moves the card up a box, wrong sends it back to box 0 */
export function review(card = { box: 0, due: 0 }, right, now = Date.now()) {
  const box = right ? Math.min(BOX_DAYS.length - 1, (card.box || 0) + 1) : 0;
  return { box, due: now + (right ? BOX_DAYS[box] * DAY : 0), seen: (card.seen || 0) + 1 };
}
/** cards that are due now, those never seen first */
export function dueCards(words, progress = {}, now = Date.now(), limit = 12) {
  return words.map((w, i) => ({ w, i, p: progress[i] })).filter(x => !x.p || x.p.due <= now).sort((a, b) => (a.p ? 1 : 0) - (b.p ? 1 : 0) || (a.p?.box || 0) - (b.p?.box || 0)).slice(0, limit);
}
/** compare answers kindly: case, spaces, and an article in German don't have to be perfect */
export function vocabMatch(want, got) {
  const n = (s) => String(s).toLowerCase().replace(/ß/g, 'ss').replace(/[.!?,]/g, '').replace(/\s+/g, ' ').trim();
  const strip = (s) => n(s).replace(/^(der|die|das|to|the|a|an|at) /, '');
  return n(want) === n(got) || strip(want) === strip(got);
}

// ── Robotvej: a tiny programming language for a robot on a grid ──
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];        // up, right, down, left
/** levels: '#' wall, '.' floor, 'S' start (facing right), 'G' goal, '*' star (collect all) */
export const ROBOT_LEVELS = [
  { name: 'Lige ud', max: 4, map: ['#######', '#S...G#', '#######'] },
  { name: 'Rundt om hjørnet', max: 7, map: ['######', '#S..##', '###.##', '###.G#', '######'] },
  { name: 'Saml stjernen', max: 8, map: ['#######', '#S.*..#', '#####.#', '#G....#', '#######'] },
  { name: 'Gentag', max: 4, map: ['##########', '#S.......G#', '##########'], hint: 'Brug “gentag” så programmet bliver kort.' },
  { name: 'Trappen', max: 10, map: ['#######', '#S#####', '#.#####', '#..####', '##..###', '###..G#', '#######'], hint: 'En trappe er det samme lille mønster igen og igen.' },
  { name: 'Spiralen', max: 16, map: ['#######', '#S....#', '#####.#', '#*..#.#', '#.#G#.#', '#.###.#', '#.....#', '#######'] },
  { name: 'Stjernejagt', max: 20, map: ['########', '#S.*.*.#', '#.####.#', '#*#G...#', '#.####*#', '#......#', '########'] },
];
export function parseLevel(lv) {
  let start = null, goal = null; const stars = [];
  lv.map.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'S') start = [x, y]; if (ch === 'G') goal = [x, y]; if (ch === '*') stars.push(`${x},${y}`); }));
  return { start, goal, stars, wall: (x, y) => (lv.map[y]?.[x] ?? '#') === '#' };
}
/** program: list of { op: 'fwd'|'left'|'right'|'repeat', n?, body? }. Returns the steps and how it ended. */
export function runRobot(lv, program, maxSteps = 400) {
  const L = parseLevel(lv); let [x, y] = L.start, dir = 1; const got = new Set(), steps = [{ x, y, dir }];
  let crash = false;
  const exec = (list) => {
    for (const ins of list) {
      if (crash || steps.length > maxSteps) return;
      if (ins.op === 'repeat') { for (let k = 0; k < Math.min(20, ins.n || 2); k++) exec(ins.body || []); continue; }
      if (ins.op === 'left') dir = (dir + 3) % 4; else if (ins.op === 'right') dir = (dir + 1) % 4;
      else if (ins.op === 'fwd') { const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1]; if (L.wall(nx, ny)) { crash = true; steps.push({ x, y, dir, crash: true }); return; } x = nx; y = ny; if (L.stars.includes(`${x},${y}`)) got.add(`${x},${y}`); }
      steps.push({ x, y, dir });
    }
  };
  exec(program);
  const atGoal = x === L.goal[0] && y === L.goal[1], allStars = got.size === L.stars.length;
  return { steps, crash, won: !crash && atGoal && allStars, atGoal, stars: got.size, total: L.stars.length };
}
export const programSize = (p) => p.reduce((a, ins) => a + 1 + (ins.op === 'repeat' ? programSize(ins.body || []) : 0), 0);

// ── Solsystemet ──
export const PLANETS = [
  { name: 'Merkur', km: 4879, au: 0.39, days: 88, moons: 0, temp: '167 °C', fact: 'Den mindste planet og den nærmeste solen. Et år varer kun 88 dage.', color: '#a8a29e' },
  { name: 'Venus', km: 12104, au: 0.72, days: 225, moons: 0, temp: '464 °C', fact: 'Den varmeste planet – den tykke atmosfære holder på varmen. Den drejer baglæns.', color: '#fbbf24' },
  { name: 'Jorden', km: 12742, au: 1, days: 365, moons: 1, temp: '15 °C', fact: 'Den eneste planet vi kender med liv og flydende vand på overfladen.', color: '#3b82f6' },
  { name: 'Mars', km: 6779, au: 1.52, days: 687, moons: 2, temp: '−65 °C', fact: 'Den røde planet har solsystemets højeste vulkan, Olympus Mons.', color: '#ef4444' },
  { name: 'Jupiter', km: 139820, au: 5.2, days: 4333, moons: 95, temp: '−110 °C', fact: 'Den største planet. Den røde plet er en storm, der er større end Jorden.', color: '#f59e0b' },
  { name: 'Saturn', km: 116460, au: 9.58, days: 10759, moons: 146, temp: '−140 °C', fact: 'Kendt for sine ringe af is og sten. Den er så let, at den kunne flyde på vand.', color: '#fde68a' },
  { name: 'Uranus', km: 50724, au: 19.2, days: 30687, moons: 28, temp: '−195 °C', fact: 'Den ligger ned på siden og ruller rundt om solen.', color: '#67e8f9' },
  { name: 'Neptun', km: 49244, au: 30.05, days: 60190, moons: 16, temp: '−200 °C', fact: 'Den yderste planet har de kraftigste vinde i solsystemet – over 2.000 km/t.', color: '#6366f1' },
];
/** your age on another planet */
export const planetAge = (years, p) => Math.floor((years * 365.25) / p.days * 10) / 10;
/** light from the sun takes about 8 min 19 s to reach Earth (1 AU) */
export const lightMinutes = (au) => Math.round(au * 499 / 60 * 10) / 10;

// ── Køleskabet ──
export function expiry(item, now = Date.now()) {
  if (!item.date) return { days: null, state: 'ok' };
  const a = new Date(now); a.setHours(0, 0, 0, 0); const b = new Date(`${item.date}T00:00`);
  const days = Math.round((b - a) / DAY);
  return { days, state: days < 0 ? 'old' : days <= 1 ? 'today' : days <= 3 ? 'soon' : 'ok' };
}

// ── Opsparing: compound interest with monthly deposits ──
export function savings({ start = 0, monthly = 0, rate = 0, years = 1 }) {
  const r = rate / 100 / 12, rows = []; let bal = start, paid = start;
  for (let m = 1; m <= Math.round(years * 12); m++) { bal = bal * (1 + r) + monthly; paid += monthly; if (m % 12 === 0) rows.push({ year: m / 12, balance: bal, paid, interest: bal - paid }); }
  return { balance: bal, paid, interest: bal - paid, rows };
}

// ── Kassemand (push the boxes onto the targets) ──
/** '#' wall, ' ' floor, '.' target, '$' box, '*' box on target, '@' player, '+' player on target */
export const SOKO = [
  ['#####', '#@$.#', '#####'],
  ['######', '#    #', '# $$ #', '# .. #', '#  @ #', '######'],
  ['########', '#..    #', '# $$ # #', '#  @   #', '########'],
  ['#######', '#.  # #', '# $   #', '#  $$.#', '#.  @ #', '#######'],
  ['########', '#  .   #', '# #$## #', '# $ @ .#', '##  #  #', ' #     #', ' #######'],
  [' #####', ' #   ###', ' #.$   #', '###.$# #', '#   @  #', '#  ## ##', '####### '],
  ['#####   ', '#   #   ', '# $ # ##', '# $ ##.#', '## @  .#', ' #  ## #', ' #     #', ' #######'],
  ['  #####', '###   #', '#.@$  #', '### $.#', '#.##$ #', '# # . ##', '#$  $$.#', '#   .  #', '########'],
];
export function sokoParse(rows) {
  const w = Math.max(...rows.map(r => r.length)), cells = [], boxes = new Set(), targets = new Set(); let player = null;
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) { const ch = r[x] || ' '; cells.push(ch === '#' ? '#' : ' '); const k = y * w + x; if ('.*+'.includes(ch)) targets.add(k); if ('$*'.includes(ch)) boxes.add(k); if ('@+'.includes(ch)) player = k; } });
  return { w, h: rows.length, cells, boxes: [...boxes], targets: [...targets], player, moves: 0, pushes: 0, hist: [] };
}
/** move by dx, dy; returns the new state or null if blocked */
export function sokoMove(s, dx, dy) {
  const d = dy * s.w + dx, p = s.player + d;
  if (s.cells[p] === '#') return null;
  const bi = s.boxes.indexOf(p);
  if (bi >= 0) { const q = p + d; if (s.cells[q] === '#' || s.boxes.includes(q)) return null; const boxes = s.boxes.slice(); boxes[bi] = q; return { ...s, boxes, player: p, moves: s.moves + 1, pushes: s.pushes + 1, hist: [...s.hist, { player: s.player, boxes: s.boxes }].slice(-200) }; }
  return { ...s, player: p, moves: s.moves + 1, hist: [...s.hist, { player: s.player, boxes: s.boxes }].slice(-200) };
}
export const sokoUndo = (s) => (s.hist.length ? { ...s, ...s.hist[s.hist.length - 1], moves: s.moves + 1, hist: s.hist.slice(0, -1) } : s);
export const sokoWon = (s) => s.boxes.every(b => s.targets.includes(b));

// ── Juveler (match three) ──
export const GEMS = 6;
export function gemBoard(n = 8, rnd = Math.random) {
  const b = Array.from({ length: n * n }, () => 0);
  for (let i = 0; i < n * n; i++) { let g; do { g = Math.floor(rnd() * GEMS); } while ((i % n >= 2 && b[i - 1] === g && b[i - 2] === g) || (i >= 2 * n && b[i - n] === g && b[i - 2 * n] === g)); b[i] = g; }
  return b;
}
/** indexes that are part of a row or column of three or more */
export function findMatches(b, n = 8) {
  const out = new Set();
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c, g = b[i]; if (g == null || g < 0) continue;
    if (c <= n - 3 && b[i + 1] === g && b[i + 2] === g) { let k = c; while (k < n && b[r * n + k] === g) out.add(r * n + k++); }
    if (r <= n - 3 && b[i + n] === g && b[i + 2 * n] === g) { let k = r; while (k < n && b[k * n + c] === g) out.add(k++ * n + c); }
  }
  return [...out];
}
export const adjacent = (a, b, n = 8) => (Math.abs(a - b) === 1 && Math.floor(a / n) === Math.floor(b / n)) || Math.abs(a - b) === n;
export function swap(b, a, c) { const t = b.slice(); [t[a], t[c]] = [t[c], t[a]]; return t; }
/** remove matches, let gems fall and fill from the top; returns { board, removed } for one cascade step */
export function collapse(b, n = 8, rnd = Math.random) {
  const m = new Set(findMatches(b, n)); if (!m.size) return { board: b, removed: 0 };
  const t = b.slice();
  for (let c = 0; c < n; c++) { const col = []; for (let r = n - 1; r >= 0; r--) if (!m.has(r * n + c)) col.push(t[r * n + c]); while (col.length < n) col.push(Math.floor(rnd() * GEMS)); for (let r = n - 1, k = 0; r >= 0; r--, k++) t[r * n + c] = col[k]; }
  return { board: t, removed: m.size };
}
/** is there any swap that makes a match? */
export function hasMove(b, n = 8) {
  for (let i = 0; i < n * n; i++) for (const j of [i + 1, i + n]) if (j < n * n && adjacent(i, j, n) && findMatches(swap(b, i, j), n).length) return true;
  return false;
}
