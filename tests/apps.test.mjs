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
{
  const { seededRandom, makeSudoku, countSolutions } = await import('../web/js/features/gamelogic.js');
  const a = makeSudoku('medium', seededRandom('hubtech-2026-10-22')), b = makeSudoku('medium', seededRandom('hubtech-2026-10-22'));
  assert.deepEqual(a.puzzle, b.puzzle, 'samme dag = samme sudoku');
  assert.notDeepEqual(a.puzzle, makeSudoku('medium', seededRandom('hubtech-2026-10-23')).puzzle);
  assert.equal(countSolutions(a.puzzle), 1);
  console.log('daily ok');
}
{
  const Y = await import('../web/js/features/yatzy.js');
  assert.equal(Y.scoreFor('ones', [1, 1, 3, 1, 5]), 3);
  assert.equal(Y.scoreFor('pair', [1, 1, 6, 6, 2]), 12, 'højeste par');
  assert.equal(Y.scoreFor('twopairs', [5, 5, 3, 3, 1]), 16);
  assert.equal(Y.scoreFor('twopairs', [6, 6, 6, 6, 1]), 0, 'to par skal være forskellige');
  assert.equal(Y.scoreFor('three', [4, 4, 4, 2, 2]), 12); assert.equal(Y.scoreFor('four', [3, 3, 3, 3, 3]), 12);
  assert.equal(Y.scoreFor('small', [5, 4, 3, 2, 1]), 15); assert.equal(Y.scoreFor('small', [2, 3, 4, 5, 6]), 0); assert.equal(Y.scoreFor('large', [6, 2, 4, 3, 5]), 20);
  assert.equal(Y.scoreFor('house', [2, 2, 3, 3, 3]), 13); assert.equal(Y.scoreFor('house', [3, 3, 3, 3, 3]), 0, 'fuldt hus kræver to forskellige');
  assert.equal(Y.scoreFor('chance', [6, 5, 4, 3, 1]), 19); assert.equal(Y.scoreFor('yatzy', [2, 2, 2, 2, 2]), 50);
  const card = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
  assert.equal(Y.upperSum(card), 63); assert.equal(Y.bonusOf(card), 50); assert.equal(Y.totalOf(card), 113);
  // a game: only the player whose turn it is can act, three rolls at most, a box only once
  const s = Y.newGame([{ name: 'A' }, { name: 'B', ai: true }]);
  assert.equal(Y.applyAction(s, 1, 'roll'), false, 'ikke din tur');
  assert.equal(Y.applyAction(s, 0, 'score', ['chance']), false, 'slå først');
  assert.ok(Y.applyAction(s, 0, 'roll')); assert.ok(Y.applyAction(s, 0, 'hold', [0])); assert.ok(s.held[0]);
  const kept = s.dice[0];
  assert.ok(Y.applyAction(s, 0, 'roll')); assert.equal(s.dice[0], kept, 'gemt terning bliver liggende');
  assert.ok(Y.applyAction(s, 0, 'roll')); assert.equal(Y.applyAction(s, 0, 'roll'), false, 'højst tre slag');
  assert.ok(Y.applyAction(s, 0, 'score', ['chance'])); assert.equal(s.turn, 1);
  let n = 0; while (s.phase === 'play' && n++ < 500) { if (s.turn === 1) Y.aiStep(s); else { if (!s.rolls) Y.applyAction(s, 0, 'roll'); else Y.applyAction(s, 0, 'score', [Y.CAT_IDS.find(id => s.players[0].card[id] == null)]); } }
  assert.equal(s.phase, 'over'); assert.ok(s.players.every(p => Y.cardDone(p.card)));
  assert.equal(Y.applyAction(s, 0, 'score', ['ones']), false);
  // the computer plays a sensible game on its own
  let sum = 0; for (let g = 0; g < 12; g++) { const t = Y.newGame([{ name: 'C', ai: true }]); while (t.phase === 'play') Y.aiStep(t); sum += Y.totalOf(t.players[0].card); }
  assert.ok(sum / 12 > 150, `computeren får i snit ${sum / 12}`);
  console.log('yatzy ok');
}
{
  const C = await import('../web/js/features/chess.js');
  // perft: the number of positions after n moves – checks castling, en passant, promotion and pins
  assert.equal(C.perft(C.newGame(), 3), 8902);
  assert.equal(C.perft(C.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 2), 2039);
  assert.equal(C.perft(C.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 3), 2812);
  assert.equal(C.perft(C.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 2), 264);
  // fool's mate
  const s = C.newGame();
  for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) assert.ok(C.play(s, C.sqIndex(f), C.sqIndex(t)));
  assert.equal(C.play(s, C.sqIndex('a2'), C.sqIndex('a3')), null, 'sort er i trækket');
  assert.ok(C.play(s, C.sqIndex('d8'), C.sqIndex('h4')));
  assert.deepEqual(s.result, { winner: 'b', why: 'mate' }); assert.equal(s.moves.at(-1), 'Dh4#');
  // castling notation and rights
  const k = C.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(C.play(k, C.sqIndex('e1'), C.sqIndex('g1'))); assert.equal(k.board[C.sqIndex('f1')], 'R'); assert.equal(k.moves[0], 'O-O'); assert.equal(k.castle, 'kq');
  // en passant
  const e = C.fromFEN('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.ok(C.play(e, C.sqIndex('e5'), C.sqIndex('d6'))); assert.equal(e.board[C.sqIndex('d5')], '', 'bonden er slået en passant');
  // promotion to a knight
  const p = C.fromFEN('8/4P3/8/8/8/8/8/k6K w - - 0 1');
  assert.ok(C.play(p, C.sqIndex('e7'), C.sqIndex('e8'), 'n')); assert.equal(p.board[C.sqIndex('e8')], 'N'); assert.equal(p.moves[0], 'e8=S');
  // stalemate and too little material
  const st = C.fromFEN('7k/8/6Q1/8/8/8/8/K7 w - - 0 1'); C.play(st, C.sqIndex('g6'), C.sqIndex('f7')); assert.equal(st.result?.why, 'stalemate');
  const im = C.fromFEN('7k/8/8/8/8/8/8/Kr4B1 w - - 0 1'); C.play(im, C.sqIndex('a1'), C.sqIndex('b1')); assert.equal(im.result?.why, 'material');
  // the computer finds mate in one and takes a free queen
  const m1 = C.fromFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'); const mv = C.bestMove(m1, 'easy', () => 0.5);
  assert.equal(C.sqName(mv.to), 'a8');
  const fq = C.fromFEN('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1'); assert.equal(C.sqName(C.bestMove(fq, 'medium', () => 0.5).to), 'd5');
  console.log('chess ok');
}
