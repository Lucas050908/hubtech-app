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
{
  const C = await import('../web/js/features/chess.js');
  // the clock: starts after white's first move, the increment is added, running out loses
  const s = C.setClock(C.newGame(), '3+2');
  assert.equal(s.clock.w, 180000);
  C.play(s, C.sqIndex('e2'), C.sqIndex('e4'), 'q', 1000);
  assert.equal(s.clock.w, 182000, 'hvid får tillægget, men tiden før første træk tæller ikke');
  assert.equal(C.clockLeft(s, 'b', 11000), 170000, 'sorts ur går');
  C.play(s, C.sqIndex('e7'), C.sqIndex('e5'), 'q', 11000);
  assert.equal(s.clock.b, 172000);
  assert.equal(C.checkFlag(s, 11000 + 181000), false);
  assert.equal(C.play(s, C.sqIndex('g1'), C.sqIndex('f3'), 'q', 11000 + 183000), null, 'for sent');
  assert.deepEqual(s.result, { winner: 'b', why: 'time' });
  // a lone king can't win on time
  const k = C.setClock(C.fromFEN('4k3/4p3/8/8/8/8/8/4K3 b - - 0 1'), '5+0'); k.clock.since = 0;
  assert.ok(C.checkFlag(k, 400000)); assert.equal(k.result.why, 'timeDraw');
  assert.equal(C.fmtClock(65000), '1:05'); assert.equal(C.fmtClock(9950), '0:09.9');
  const d = C.newGame(); C.agreeDraw(d); assert.equal(d.result.why, 'agreed');
  console.log('chess clock ok');
}
{
  const Q = await import('../web/js/features/quizboard.js');
  const { QB_CATEGORIES } = await import('../web/js/data/quizboard.js');
  // the question bank: five questions per category, the right answer isn't also among the wrong ones
  for (const c of QB_CATEGORIES) {
    assert.equal(c.qs.length, 5, c.name);
    for (const q of c.qs) { assert.ok(Q.hasChoices(q), q.q); assert.ok(!q.w.includes(q.a), q.q); assert.equal(new Set(q.w).size, 3, q.q); }
  }
  const { seededRandom } = await import('../web/js/features/gamelogic.js');
  const r = seededRandom('qb');
  const { board, key } = Q.buildBoard(Q.pickCategories(QB_CATEGORIES, 5, r), r);
  assert.equal(board.tiles.length, 5); assert.equal(board.tiles.flat().filter(t => t.joker).length, 1);
  assert.equal(board.tiles[0][0].opts[key[0][0].i], key[0][0].a, 'nøglen peger på det rigtige svar');
  assert.ok(!JSON.stringify(board).includes('"a"'), 'brættet indeholder ikke svarene');
  // online: everyone answers, the fastest right one picks next
  const s = Q.newGame(board, [{ name: 'A' }, { name: 'B' }, { name: 'C' }], 'all');
  assert.equal(Q.pick(s, 1, 0, 0), false, 'ikke din tur');
  assert.ok(Q.pick(s, 0, 0, 0, 1000)); assert.equal(Q.pick(s, 0, 0, 1), false);
  const right = key[0][0].i, wrong = (right + 1) % 4;
  assert.ok(Q.answer(s, 1, right, 3000)); assert.ok(Q.answer(s, 2, right, 2000)); assert.equal(Q.answer(s, 2, wrong, 2500), false, 'kun ét svar');
  assert.equal(Q.allAnswered(s), false); assert.ok(Q.answer(s, 0, wrong, 4000)); assert.ok(Q.allAnswered(s));
  assert.ok(Q.reveal(s, key));
  assert.deepEqual(s.players.map(p => p.score), [0, 100, 100]); assert.equal(s.chooser, 2, 'den hurtigste vælger');
  assert.ok(Q.next(s)); assert.equal(s.phase, 'pick');
  // on one screen: a wrong guess costs half, and the turn goes round
  const t = Q.newGame(board, [{ name: 'A' }, { name: 'B' }], 'turn');
  Q.pick(t, 0, 1, 1); assert.equal(Q.answer(t, 1, 0), false, 'kun den, der valgte, svarer');
  Q.answer(t, 0, (key[1][1].i + 1) % 4); Q.reveal(t, key);
  assert.equal(t.players[0].score, -100); assert.equal(t.chooser, 1);
  // quizmaster: points given by hand, and the game ends when the board is empty
  const m = Q.newGame(board, [{ name: 'Hold 1' }, { name: 'Hold 2' }], 'master');
  let n = 0;
  while (m.phase !== 'over' && n++ < 40) {
    const c = m.tiles.findIndex(col => col.some(x => !x.done)), rr = m.tiles[c].findIndex(x => !x.done);
    Q.pick(m, 0, c, rr); Q.reveal(m, key); Q.judge(m, n % 2, true); assert.equal(Q.judge(m, n % 2, true), false, 'kun én gang'); Q.next(m);
  }
  assert.equal(m.phase, 'over'); assert.equal(m.players[0].score + m.players[1].score, 1500 * 5 / 5 * 5 + board.tiles.flat().find(x => x.joker).v);
  assert.deepEqual(Q.checkBoard(Q.emptyBoard()).length > 0, true);
  console.log('quizboard ok');
}
{
  const N = await import('../web/js/features/netcalc.js');
  const s = N.parseCidr('192.168.1.130/26');
  assert.equal(N.intToIp(s.network), '192.168.1.128'); assert.equal(N.intToIp(s.broadcast), '192.168.1.191');
  assert.equal(N.intToIp(s.first), '192.168.1.129'); assert.equal(N.intToIp(s.last), '192.168.1.190');
  assert.equal(s.hosts, 62); assert.equal(N.intToIp(s.mask), '255.255.255.192'); assert.equal(N.intToIp(s.wildcard), '0.0.0.63');
  assert.match(s.kind, /^Privat/); assert.equal(s.cls, 'C');
  assert.equal(N.parseCidr('10.1.2.3 255.255.0.0').prefix, 16);
  assert.ok(N.parseCidr('10.1.2.3 255.0.255.0').error, 'ugyldig maske');
  assert.ok(N.parseCidr('300.1.1.1/24').error); assert.ok(N.parseCidr('hej').error);
  assert.equal(N.parseCidr('8.8.8.8/32').hosts, 1); assert.equal(N.parseCidr('10.0.0.0/31').hosts, 2);
  assert.match(N.parseCidr('169.254.3.4/16').kind, /DHCP/); assert.match(N.parseCidr('100.101.102.103/32').kind, /Tailscale/);
  const sp = N.split(N.parseCidr('192.168.0.0/24'), 3);
  assert.equal(sp.prefix, 26); assert.equal(sp.total, 4); assert.equal(N.intToIp(sp.list[3].network), '192.168.0.192');
  assert.equal(N.prefixFor(50), 26); assert.equal(N.prefixFor(254), 24); assert.equal(N.prefixFor(255), 23);
  assert.ok(N.sameSubnet(N.ipToInt('192.168.1.5'), N.ipToInt('192.168.1.200'), 24)); assert.ok(!N.sameSubnet(N.ipToInt('192.168.1.5'), N.ipToInt('192.168.2.5'), 24));
  assert.equal(N.convert(1, 'GiB', 'MiB'), 1024); assert.equal(N.convert(100, 'Mbit', 'MB'), 12.5);
  assert.equal(N.downloadSecs(1, 'GB', 100), 80); assert.equal(N.fmtDuration(80), '1 min. 20 sek.');
  assert.equal(N.toBinary(N.ipToInt('192.168.1.1')), '11000000.10101000.00000001.00000001');
  console.log('netcalc ok');
}
{
  const M = await import('../web/js/features/mealplan.js');
  const { STARTER_RECIPES } = await import('../web/js/data/recipes.js');
  assert.deepEqual(M.parseIngredient('500 g hakket oksekød'), { amount: 500, unit: 'g', name: 'hakket oksekød' });
  assert.deepEqual(M.parseIngredient('1 ½ dl mælk'), { amount: 1.5, unit: 'dl', name: 'mælk' });
  assert.deepEqual(M.parseIngredient('1,5 l bouillon'), { amount: 1.5, unit: 'l', name: 'bouillon' });
  assert.deepEqual(M.parseIngredient('1/2 tsk salt'), { amount: 0.5, unit: 'tsk', name: 'salt' });
  assert.deepEqual(M.parseIngredient('2 løg'), { amount: 2, unit: '', name: 'løg' });
  assert.deepEqual(M.parseIngredient('salt og peber'), { amount: null, unit: '', name: 'salt og peber' });
  assert.equal(M.formatIngredient(M.parseIngredient('3 dl mel'), 0.5), '1 ½ dl mel');
  assert.equal(M.formatIngredient(M.parseIngredient('500 g kød'), 1.5), '750 g kød');
  assert.equal(M.weekStart(new Date(2026, 9, 22)), '2026-10-19'); assert.equal(M.weekStart(new Date(2026, 9, 25)), '2026-10-19');
  assert.equal(M.weekNo('2026-10-19'), 43); assert.equal(M.addDays('2026-12-28', 7), '2027-01-04');
  // the shopping list adds up and scales
  const recipes = [{ id: 'a', name: 'A', servings: 4, ingredients: ['500 g hakket oksekød', '1 løg', '2 dl mælk', 'salt'] },
    { id: 'b', name: 'B', servings: 2, ingredients: ['250 g hakket oksekød', '1 løg', '8 dl mælk', 'salt'] }];
  const list = M.shoppingList(recipes, { 0: { id: 'a', servings: 4 }, 1: { id: 'b', servings: 4 } });
  const t = Object.fromEntries(list.map(x => [x.name.toLowerCase(), x]));
  assert.equal(t['hakket oksekød'].text, '1 kg hakket oksekød'); assert.equal(t['løg'].text, '3 løg'); assert.equal(t['mælk'].text, '1,8 l mælk');
  assert.ok(t['salt'].pantry); assert.deepEqual(t['løg'].from, ['A', 'B']);
  assert.equal(t['hakket oksekød'].aisle, 'Kød og fisk'); assert.equal(t['løg'].aisle, 'Frugt og grønt');
  const plan = M.fillWeek(STARTER_RECIPES, { 2: { id: 's-tacos', servings: 4 } }, () => 0.3);
  assert.equal(Object.keys(plan).length, 7); assert.equal(new Set(Object.values(plan).map(d => d.id)).size, 7, 'ingen gentagelser');
  for (const r of STARTER_RECIPES) for (const l of r.ingredients) assert.ok(M.parseIngredient(l).name, l);
  console.log('mealplan ok');
}
{
  const M = await import('../web/js/features/mealplan.js');
  const l = M.shoppingList([{ id: 'a', name: 'A', servings: 4, ingredients: ['1 gulerod', '4 gulerødder'] }], { 0: { id: 'a', servings: 4 } });
  assert.equal(l.length, 1); assert.equal(l[0].text, '5 gulerødder');
  console.log('mealplan plural ok');
}
{
  const W = await import('../web/js/features/wordgame.js');
  const { WORDS } = await import('../web/js/data/words5.js');
  assert.ok(WORDS.every(w => W.validGuess(w)), 'alle ord har fem bogstaver');
  assert.equal(new Set(WORDS).size, WORDS.length);
  assert.deepEqual(W.score('KANAL', 'KANAL'), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(W.score('LAKAN', 'KANAL'), ['near', 'ok', 'near', 'ok', 'near']);
  assert.deepEqual(W.score('AAAAA', 'BANAN'), ['no', 'ok', 'no', 'ok', 'no'], 'gentagne bogstaver tælles rigtigt');
  assert.deepEqual(W.score('ØSTER', 'SØSTER'.slice(1)), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.equal(W.keyStates(['LAKAN'], 'KANAL').A, 'ok');
  assert.equal(W.dailyWord(WORDS, '2026-10-22'), W.dailyWord(WORDS, '2026-10-22'));
  assert.notEqual(W.dailyWord(WORDS, '2026-10-22'), W.dailyWord(WORDS, '2026-10-23'));
  const seen = new Set(); for (let i = 0; i < WORDS.length; i++) { const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); seen.add(W.dailyWord(WORDS, d)); }
  assert.equal(seen.size, WORDS.length, 'ingen gentagelser, før listen er brugt');
  assert.equal(W.hardModeError('BANAN', ['LAKAN'], 'KANAL'), 'Gættet skal indeholde L');
  assert.equal(W.validGuess('ÆBLER'), true); assert.equal(W.validGuess('ab1cd'), false);
  assert.equal(W.shareText(['LAKAN', 'KANAL'], 'KANAL', '22/10'), 'Ordjagt 22/10 2/6\n🟨🟩🟨🟩🟨\n🟩🟩🟩🟩🟩');
  const st = W.stats({ '2026-10-20': { won: true, tries: 3 }, '2026-10-21': { won: true, tries: 4 }, '2026-10-22': { won: true, tries: 2 } }, '2026-10-22');
  assert.equal(st.streak, 3); assert.equal(st.best, 3); assert.deepEqual(st.dist, [0, 1, 1, 1, 0, 0]);
  console.log('wordgame ok');
}
{
  const T = await import('../web/js/features/workout.js');
  assert.equal(T.oneRm(100, 1), 100); assert.equal(T.oneRm(100, 5), 116.7); assert.equal(T.oneRm(0, 5), 0);
  const s = (id, date, sets, name = 'Bænkpres') => ({ id, date, exercises: [{ name, sets: sets.map(([kg, reps]) => ({ kg, reps, done: true })) }] });
  const h = [s('a', '2026-10-01', [[60, 10], [70, 5]]), s('b', '2026-10-08', [[80, 3]]), s('c', '2026-10-15', [[75, 8]])];
  assert.equal(T.sessionVolume(h[0]), 950);
  assert.deepEqual(T.series(h, 'Bænkpres').map(p => p.value), [81.7, 88, 95]);
  assert.deepEqual(T.records(h, h[2]).map(r => r.name), ['Bænkpres'], 'ny rekord');
  assert.equal(T.records(h, h[1]).length, 1, '88 slår 81,7');
  assert.equal(T.records([h[0]], h[0]).length, 0, 'første gang er ikke en rekord');
  assert.deepEqual(T.lastSets(h, 'Bænkpres').map(x => x.kg), [75]);
  const notDone = { id: 'd', date: '2026-10-20', exercises: [{ name: 'Bænkpres', sets: [{ kg: 200, reps: 1, done: false }] }] };
  assert.equal(T.series([...h, notDone], 'Bænkpres').length, 3, 'kun sæt, der er lavet, tæller');
  const run = { id: 'e', date: '2026-10-21', exercises: [{ name: 'Løb', sets: [{ min: 30, km: 5.2, done: true }] }] };
  assert.equal(T.series([run], 'Løb')[0].value, 5.2); assert.equal(T.kindOf('Planke'), 'time');
  const w = T.weekly(h, 4, new Date(2026, 9, 22));
  assert.deepEqual(w.map(x => x.count), [1, 1, 1, 0]);
  assert.equal(T.streakWeeks(h, new Date(2026, 9, 22)), 3, 'denne uge tæller ikke imod, før den er slut');
  assert.equal(T.fmtValue(95, 'weight'), '95 kg'); assert.equal(T.fmtSecs(75), '1:15');
  console.log('workout ok');
}
{
  const C = await import('../web/js/features/calc.js');
  const ev = (s) => C.evaluate(s);
  assert.equal(ev('2+3·4'), 14); assert.equal(ev('(1,5+2)^2'), 12.25); assert.equal(ev('2^3^2'), 512); assert.equal(ev('-2^2'), -4);
  assert.equal(ev('√16 + 5!'), 124); assert.equal(ev('20% · 150'), 30); assert.equal(ev('2π'), Number((2 * Math.PI).toPrecision(12)));
  assert.equal(ev('sin(30)'), 0.5); assert.equal(ev('3(4+1)'), 15); assert.equal(ev('10 ÷ 4'), 2.5); assert.equal(ev('0,1+0,2'), 0.3);
  assert.equal(ev('log(1000)'), 3); assert.equal(ev('1e3/4'), 250);
  for (const [s, m] of [['5/0', /dividere/], ['(2+3', /slutparentes/], ['2+', /for tidligt/], ['√-4', /negativt/], ['2#3', /Forstår ikke/], ['3.5!', /Fakultet/]]) assert.throws(() => ev(s), m, s);
  assert.equal(C.fmt(1234.5), '1.234,5');
  assert.equal(C.convertUnit(100, 'temp', '°C', '°F'), 212); assert.equal(C.convertUnit(1, 'length', 'mil', 'km'), 1.609344);
  assert.equal(Math.round(C.convertUnit(1, 'energy', 'kWh', 'kcal')), 860); assert.equal(C.convertUnit(36, 'speed', 'km/t', 'm/s'), 10);
  const v = C.vat(125); assert.equal(v.net, 100); assert.equal(v.vat, 25);
  assert.equal(C.vat(100, 25, false).gross, 125); assert.equal(C.change(80, 100), 25); assert.equal(C.whatPercent(30, 120), 25);
  assert.deepEqual(C.discount(200, 15), { save: 30, pay: 170 });
  const l = C.loan(100000, 6, 5);
  assert.equal(Math.round(l.pay), 1933); assert.equal(l.rows.length, 5); assert.ok(l.rows.at(-1).left < 0.01, 'betalt ud');
  assert.equal(Math.round(C.loan(12000, 0, 1).pay), 1000);
  assert.equal(Math.round(C.savings(0, 1000, 0, 2).end), 24000);
  console.log('calc ok');
}
{
  const L = await import('../web/js/features/library.js');
  const items = [
    { id: 1, kind: 'book', title: 'Den lange rejse', by: 'A. Forfatter', status: 'want', total: 300, progress: 0, added: 1 },
    { id: 2, kind: 'film', title: 'Bølgen', status: 'done', rating: 4, finished: '2026-03-02', added: 2 },
    { id: 3, kind: 'book', title: 'Aften', status: 'done', rating: 5, total: 200, finished: '2026-03-20', added: 3 },
    { id: 4, kind: 'series', title: 'Byen', status: 'doing', total: 10, progress: 4, added: 4, tags: ['krimi'] },
    { id: 5, kind: 'book', title: 'Gammel', status: 'done', rating: 2, finished: '2025-12-30', added: 5 },
  ];
  assert.deepEqual(L.sortItems(items).map(x => x.id), [4, 1, 3, 2, 5]);
  assert.equal(items.filter(x => L.matches(x, { q: 'krimi' })).length, 1);
  assert.equal(items.filter(x => L.matches(x, { kind: 'book', status: 'done' })).length, 2);
  const y = L.yearStats(items, 2026);
  assert.equal(y.done, 2); assert.equal(y.by.book, 1); assert.equal(y.pages, 200); assert.equal(y.avg, 4.5); assert.equal(y.months[2], 2); assert.equal(y.best[0].title, 'Aften');
  const b = { ...items[0] };
  L.addProgress(b, 50, '2026-10-22'); assert.equal(b.status, 'doing'); assert.equal(b.started, '2026-10-22');
  L.addProgress(b, 400, '2026-10-25'); assert.equal(b.progress, 300); assert.equal(b.status, 'done'); assert.equal(b.finished, '2026-10-25');
  assert.equal(L.progressPct({ total: 10, progress: 4 }), 40);
  const g = L.goalStatus(10, 24, new Date(2026, 6, 2));
  assert.equal(g.pct, 42); assert.ok(Math.abs(g.ahead + 2) < 0.2, String(g.ahead));
  assert.equal(L.suggest(items, 'book', () => 0).id, 1); assert.equal(L.suggest(items, 'game'), null);
  console.log('library ok');
}
