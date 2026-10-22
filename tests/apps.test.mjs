// node tests/apps.test.mjs – game logic (Sudoku, Fire på stribe, Galgeleg) and the Kodeord app
import assert from 'node:assert/strict';
import { makeSudoku, countSolutions, canPlace, c4Empty, c4Drop, c4Winner, c4Best, c4Valid, hangState } from '../web/js/features/gamelogic.js';
import { makePassword, makePassphrase, strength, crackText, SETS } from '../web/js/features/pwtools.js';

// Sudoku: a valid solution, the puzzle agrees with it, and has exactly one solution
for (const lv of ['easy', 'hard']) {
  const { puzzle, solution } = makeSudoku(lv);
  assert.equal(solution.length, 81);
  solution.forEach((v, i) => assert.ok(v >= 1 && v <= 9 && canPlace(solution, i, v), `løsningen er gyldig (${i})`));
  puzzle.forEach((v, i) => assert.ok(v === 0 || v === solution[i]));
  assert.equal(countSolutions(puzzle), 1, `${lv}: præcis én løsning`);
  const clues = puzzle.filter(Boolean).length;
  assert.ok(lv === 'easy' ? clues <= 42 : clues <= 34, `${lv}: ${clues} tal givet`);
}
assert.equal(countSolutions(Array(81).fill(0)), 2);   // empty board → many (stops at 2)

// Fire på stribe
let b = c4Empty();
[0, 1, 2].forEach(c => c4Drop(b, c, 1));
assert.equal(c4Winner(b), null);
assert.equal(c4Best(b, 2, 4), 3, 'computeren blokerer tre på stribe');
c4Drop(b, 3, 1); assert.equal(c4Winner(b).player, 1); assert.equal(c4Winner(b).cells.length, 4);
b = c4Empty(); [0, 0, 0].forEach(() => c4Drop(b, 6, 2)); assert.equal(c4Best(b, 2, 3), 6, 'computeren tager selv sejren');
b = c4Empty(); for (let r = 0; r < 4; r++) for (let k = 0; k <= r; k++) c4Drop(b, r, k === r ? 1 : 2);  // diagonal for player 1
assert.equal(c4Winner(b)?.player, 1, 'skrå sejr');
b = c4Empty(); for (let i = 0; i < 6; i++) c4Drop(b, 0, 1 + (i % 2)); assert.ok(!c4Valid(b).includes(0)); assert.equal(c4Drop(b, 0, 1), -1);

// Galgeleg
let s = hangState('USB-C', ['U', 'S']);
assert.deepEqual(s.shown, ['U', 'S', '_', '-', '_']); assert.equal(s.won, false);
s = hangState('USB-C', ['U', 'S', 'B', 'C']); assert.equal(s.won, true);
s = hangState('Toner', ['A', 'B', 'C', 'D', 'F', 'G', 'H']); assert.equal(s.lost, true); assert.equal(s.wrong.length, 7);
assert.equal(hangState('Wi-Fi', ['W', 'I', 'F']).won, true);

// Kodeord
for (let i = 0; i < 50; i++) {
  const p = makePassword({ length: 20 });
  assert.equal(p.length, 20);
  for (const set of Object.values(SETS)) assert.ok([...p].some(ch => set.includes(ch)), 'mindst ét af hver slags tegn');
  assert.ok(!/[lIO01]/.test(p), 'ingen tegn der ligner hinanden');
}
assert.equal(makePassword({ length: 10, lower: false, upper: false, digits: true, symbols: false }).replace(/[2-9]/g, ''), '');
const ph = makePassphrase({ words: 5, sep: '-', number: true });
assert.equal(ph.split('-').length, 6); assert.ok(/\d\d$/.test(ph)); assert.ok(/[A-ZÆØÅ]/.test(ph));
assert.equal(strength('123456').score, 0);
assert.equal(strength('Sommer2024!').score <= 1, true, 'ord + årstal er svagt');
assert.ok(strength('Sommer2024!').warnings.length >= 1);
assert.equal(strength('qwertyuiop').score, 0);
assert.ok(strength('kage-ravn-Tromle-fjeld-uld-42').score >= 3);
assert.ok(strength(makePassword({ length: 20 })).score === 4);
assert.equal(strength('').label, 'Ingen kode');
assert.equal(crackText(0.2), 'under et sekund'); assert.equal(crackText(3600), '1 time'); assert.equal(crackText(7200), '2 timer'); assert.equal(crackText(1e20), 'mere end en million år');
console.log('apps ok');
// Kryds og bolle
{
  const { tttWinner, tttBest } = await import('../web/js/features/gamelogic.js');
  assert.deepEqual(tttWinner([1, 1, 1, 0, 0, 0, 0, 0, 0]).cells, [0, 1, 2]);
  assert.equal(tttWinner([1, 2, 1, 0, 0, 0, 0, 0, 0]), null);
  assert.equal(tttBest([1, 1, 0, 2, 0, 0, 0, 0, 0], 2, 'hard'), 2, 'blocks');
  assert.equal(tttBest([1, 1, 0, 2, 2, 0, 1, 0, 0], 2, 'hard'), 5, 'wins rather than blocks');
  assert.equal(tttBest([2, 2, 0, 1, 1, 0, 0, 0, 0], 2, 'medium'), 2);
  // the hard computer never loses against random play
  for (let g = 0; g < 200; g++) {
    const b = Array(9).fill(0); let t = 1;
    while (!tttWinner(b) && b.some(x => !x)) { const free = [...Array(9).keys()].filter(i => !b[i]); b[t === 1 ? free[Math.floor(Math.random() * free.length)] : tttBest(b, 2, 'hard')] = t; t = t === 1 ? 2 : 1; }
    assert.notEqual(tttWinner(b)?.player, 1, 'umulig taber aldrig');
  }
  console.log('tictactoe ok');
}
// Ejendomskongen
{
  const P = await import('../web/js/features/property.js');
  assert.equal(P.BOARD.length, 40);
  assert.equal(P.BOARD.filter(f => f.type === 'prop').length, 22);
  // rent: base, full group doubles, houses
  let s = P.newGame([{ name: 'A' }, { name: 'B' }]);
  s.owner[1] = 0; assert.equal(P.rentFor(s, 1), 50);
  s.owner[3] = 0; assert.equal(P.rentFor(s, 1), 100, 'hele gruppen = dobbelt leje');
  assert.ok(P.canBuild(s, 0, 1)); P.build(s, 0, 1); assert.equal(P.rentFor(s, 1), 250);
  assert.ok(!P.canBuild(s, 0, 1), 'skal bygge jævnt'); assert.ok(P.canBuild(s, 0, 3));
  s.owner[5] = 1; s.owner[15] = 1; assert.equal(P.rentFor(s, 5), 1000);
  s.owner[12] = 1; assert.equal(P.rentFor(s, 12, 8), 800); s.owner[28] = 1; assert.equal(P.rentFor(s, 12, 8), 2000);
  // paying more than you have: houses sold, streets pawned, then bankrupt to the creditor
  s = P.newGame([{ name: 'A' }, { name: 'B' }]);
  s.owner[1] = 0; s.owner[3] = 0; s.houses[1] = 1; s.players[0].money = 0;
  assert.equal(P.pay(s, 0, 1000, 1), true);
  assert.equal(s.houses[1], undefined); assert.ok(s.mort[1] || s.mort[3]);
  assert.equal(P.pay(s, 0, 50000, 1), false); assert.ok(s.players[0].out); assert.equal(s.owner[1], 1); assert.equal(s.phase, 'over'); assert.equal(s.winner, 1);
  // many computer-only games: no crashes, no negative money, always someone wins
  let rs = 1; const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  for (let g = 0; g < 60; g++) {
    s = P.newGame([{ name: 'A', ai: true }, { name: 'B', ai: true }, { name: 'C', ai: true }, { name: 'D', ai: true }], { rounds: g % 3 === 0 ? 0 : 40 }, rng);
    let steps = 0;
    while (s.phase !== 'over' && steps < 20000) { P.aiStep(s, rng); steps++; s.players.forEach(p => assert.ok(p.money >= 0, 'aldrig negative penge')); }
    if (s.rounds) { assert.equal(s.phase, 'over', `spil ${g} sluttede (${steps} skridt, runde ${s.round})`); assert.ok(s.winner >= 0); }
  }
  console.log('property ok');
}
// Ejendomskongen: handel
{
  const P = await import('../web/js/features/property.js');
  let s = P.newGame([{ name: 'A' }, { name: 'B', ai: true }]);
  s.owner[1] = 0; s.owner[3] = 1;
  const t = { give: { props: [], money: 1000 }, get: { props: [3], money: 0 } };
  assert.equal(P.aiAccepts(s, 0, 1, t), false, 'computeren sælger ikke den sidste i en gruppe billigt');
  t.give.money = 9000;
  assert.equal(P.aiAccepts(s, 0, 1, t), true, 'men for nok penge');
  assert.ok(P.trade(s, 0, 1, t)); assert.equal(s.owner[3], 0); assert.equal(s.players[0].money, 21000); assert.equal(s.players[1].money, 39000);
  assert.ok(P.ownsGroup(s, 0, 0));
  s.houses[1] = 1; assert.match(P.tradeProblem(s, 0, 1, { give: { props: [3] }, get: {} }), /huse/);
  assert.match(P.tradeProblem(s, 0, 1, { give: { money: 999999 }, get: {} }), /har ikke/);
  // the computer buys the last street from another computer, and makes an offer to a person
  s = P.newGame([{ name: 'A' }, { name: 'B', ai: true }, { name: 'C', ai: true }]);
  s.owner[6] = 1; s.owner[8] = 1; s.owner[9] = 0; s.turn = 1; s.phase = 'end'; s.round = 5; s.dice = [1, 2];
  P.aiStep(s); assert.ok(s.offer && s.offer.to === 0 && s.offer.get.props[0] === 9, 'tilbud til et menneske');
  P.answerOffer(s, true); assert.equal(s.owner[9], 1); assert.equal(s.offer, null);
  console.log('property trade ok');
}
{
  const P = await import('../web/js/features/property.js');
  const s = P.newGame([{ name: 'A' }, { name: 'B' }]);
  assert.equal(P.applyAction(s, 1, 'roll'), false, 'ikke din tur');
  assert.equal(P.applyAction(s, 0, 'roll'), true);
  s.owner[1] = 0; s.owner[3] = 1; s.phase = 'end';
  assert.equal(P.applyAction(s, 0, 'offer', [1, { give: { money: 3000 }, get: { props: [3] } }]), true);
  assert.ok(s.offer); assert.equal(P.applyAction(s, 0, 'endTurn'), false, 'venter på svar');
  assert.equal(P.applyAction(s, 0, 'answer', [true]), false, 'kun modtageren svarer');
  assert.equal(P.applyAction(s, 1, 'answer', [true]), true); assert.equal(s.owner[3], 0);
  console.log('property actions ok');
}
