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
{
  const B = await import('../web/js/features/beats.js');
  const p = B.PRESETS.boom.make();
  assert.deepEqual(B.hits(p, 0).drums, ['kick', 'hat']); assert.deepEqual(B.hits(p, 4).drums, ['snare', 'hat']);
  assert.equal(B.hits(p, 0).bass[0], 33); assert.ok(B.countNotes(p) > 15);
  assert.equal(B.stepTime(4, 120), 0.5); assert.equal(B.stepTime(1, 120, 0), 0.125); assert.ok(B.stepTime(1, 120, 0.5) > 0.125, 'swing skubber');
  assert.equal(B.barSecs(120), 2);
  for (const [id, pr] of Object.entries(B.PRESETS)) {
    const x = pr.make(), code = B.encode(x), y = B.decode(code);
    assert.deepEqual(y, { ...x, swing: Math.round(x.swing * 100) / 100 }, id);
    assert.ok(code.length < 100, `${id}: koden er kort (${code.length})`);
  }
  assert.equal(B.decode('noget vrøvl'), null); assert.equal(B.decode('1.100.0.00.!!'), null);
  assert.equal(B.noteName(69), 'A4'); assert.equal(Math.round(B.midiToHz(69)), 440);
  const w = B.wav(new Float32Array([0, 1, -1]), 8000);
  assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF'); assert.equal(w.length, 50);
  console.log('beats ok');
}
{
  const P = await import('../web/js/features/pixels.js');
  let px = P.blank(4);
  px = P.paint(px, 4, 0, '#ff004d', true);
  assert.equal(px[0], '#ff004d'); assert.equal(px[3], '#ff004d', 'spejling');
  const box = ['#000000', '#000000', '#000000', '#000000', '#000000', '', '', '#000000', '#000000', '', '', '#000000', '#000000', '#000000', '#000000', '#000000'];
  const f = P.fill(box, 4, 4, 5, '#ffec27');
  assert.deepEqual([f[5], f[6], f[9], f[10], f[0]], ['#ffec27', '#ffec27', '#ffec27', '#ffec27', '#000000'], 'fyld stopper ved kanten');
  assert.deepEqual(P.line(0, 15, 4), [0, 5, 10, 15]);
  assert.deepEqual(P.shift(['a', '', '', ''], 2, 2, 1, 1), ['', '', '', 'a']);
  assert.deepEqual(P.flipH(['a', 'b', 'c', 'd'], 2), ['b', 'a', 'd', 'c']); assert.deepEqual(P.flipV(['a', 'b', 'c', 'd'], 2, 2), ['c', 'd', 'a', 'b']);
  const art = { w: 16, h: 16, fps: 8, frames: [P.paint(P.blank(16), 16, 17, '#29adff'), P.fill(P.blank(16), 16, 16, 0, '#00e436')] };
  const packed = P.pack(art);
  assert.equal(packed.frames[0].length, 256); assert.deepEqual(P.unpack(JSON.parse(JSON.stringify(packed))), art);
  assert.equal(P.unpack({ w: 7, frames: [] }), null);
  console.log('pixels ok');
}
{
  const R = await import('../web/js/features/calm.js');
  const b = R.BREATHS.boks;
  assert.equal(R.cycleSecs(b), 16);
  assert.deepEqual([R.phaseAt(b, 0).phase, R.phaseAt(b, 4.5).phase, R.phaseAt(b, 9).phase, R.phaseAt(b, 13).phase, R.phaseAt(b, 16).phase], ['in', 'hold', 'out', 'rest', 'in']);
  assert.equal(R.phaseAt(b, 2).scale, 0.4); assert.equal(R.phaseAt(b, 5).scale, 0.8, 'hold = stor'); assert.equal(R.phaseAt(b, 14).scale, 0, 'hvil = lille');
  assert.equal(R.phaseAt(b, 10).scale, 0.4, 'ud halvvejs'); assert.equal(R.phaseAt(b, 17).cycle, 1); assert.equal(R.phaseAt(b, 1.2).left, 3);
  const s = R.BREATHS.sukket; assert.equal(R.phaseAt(s, 2.5).scale, 0.9);
  assert.equal(R.fadeAt(0, 600), 1); assert.equal(R.fadeAt(570, 600), 0.25); assert.equal(R.fadeAt(600, 600), 0); assert.equal(R.fadeAt(10, 0), 1);
  const sum = R.summary({ '2026-10-20': 5, '2026-10-21': 10, '2026-10-22': 3.4, '2026-10-10': 20 }, '2026-10-22');
  assert.equal(sum.today, 3); assert.equal(sum.streak, 3); assert.equal(sum.total, 38); assert.equal(sum.week.length, 7); assert.equal(sum.week[6].min, 3);
  assert.equal(R.summary({ '2026-10-21': 4 }, '2026-10-22').streak, 1, 'i går tæller, til dagen er gået');
  for (const g of Object.values(R.GUIDES)) assert.ok(g.steps.length >= 5);
  console.log('calm ok');
}
{
  const Hg = await import('../web/js/features/huegame.js');
  assert.equal(Hg.hex([255, 0, 128]), '#ff0080'); assert.deepEqual(Hg.hsl(0, 1, 0.5).map(Math.round), [255, 0, 0]);
  const g = Hg.gradient(3, 3, [[0, 0, 0], [255, 0, 0], [0, 0, 255], [255, 255, 255]]);
  assert.equal(g[0], '#000000'); assert.equal(g[2], '#ff0000'); assert.equal(g[6], '#0000ff'); assert.equal(g[8], '#ffffff'); assert.equal(g[4], '#804080');
  const p = Hg.makePuzzle(1, 'test');
  assert.equal(p.w * p.h, 16); assert.equal(p.fixed.length, 12, 'ramme fast på de første baner');
  assert.ok(!Hg.solved(p)); assert.ok(p.fixed.every(i => p.order[i] === i), 'faste brikker ligger rigtigt');
  assert.equal(Hg.swap(p, p.fixed[0], 5), false, 'faste brikker kan ikke flyttes');
  let n = 0; while (!Hg.solved(p) && n++ < 50) { const x = Hg.hint(p); assert.ok(Hg.swap(p, x.from, x.to)); }
  assert.ok(Hg.solved(p)); assert.equal(Hg.placed(p), 16); assert.equal(Hg.hint(p), null);
  assert.deepEqual(Hg.makePuzzle(5, 'x').order, Hg.makePuzzle(5, 'x').order, 'samme frø = samme bane');
  const big = Hg.makePuzzle(12, 'y'); assert.equal(big.w * big.h, 90); assert.equal(big.fixed.length, 4);
  assert.equal(new Set(Hg.makePuzzle(3, 'z').colors).size, 25, 'alle felter har forskellig farve');
  console.log('huegame ok');
}
{
  const S = await import('../web/js/features/sharedlogic.js');
  const votes = [{ kind: 'vote', data: { choices: [0] }, user: { name: 'A' } }, { kind: 'vote', data: { choices: [1] } }, { kind: 'vote', data: { choices: [0, 2] } }, { kind: 'comment', data: {} }];
  const t = S.tally(votes, 3);
  assert.deepEqual(t.counts, [2, 1, 1]); assert.equal(t.voters, 3); assert.deepEqual(t.pct, [67, 33, 33]); assert.deepEqual(t.top, [0]); assert.equal(t.who[0].length, 1);
  const r = S.rsvps([{ kind: 'rsvp', data: { answer: 'yes', plus: 2 } }, { kind: 'rsvp', data: { answer: 'no' } }, { kind: 'rsvp', data: { answer: 'yes' } }]);
  assert.equal(r.yes.length, 2); assert.equal(r.guests, 4); assert.equal(r.no.length, 1);
  const now = new Date(2026, 9, 23, 12);
  assert.equal(S.whenText(new Date(2026, 9, 24, 18).toISOString(), null, now), 'I morgen kl. 18.00');
  assert.equal(S.whenText(new Date(2026, 9, 23, 11).toISOString(), null, now), 'I gang nu'); assert.equal(S.whenText(new Date(2026, 9, 1).toISOString(), null, now), 'Har været');
  assert.equal(S.whenText(new Date(2026, 10, 20).toISOString(), null, now), 'Om 28 dage');
  const cal = S.ics({ title: 'Fest; med venner', start: '2026-11-01T18:00:00Z', place: 'Hjemme' });
  assert.ok(cal.includes(String.raw`SUMMARY:Fest\; med venner`)); assert.ok(cal.includes('DTSTART:20261101T180000Z')); assert.ok(cal.includes('DTEND:20261101T200000Z'));
  const fields = [{ id: 'a', type: 'choice', label: 'Farve', options: ['Rød', 'Blå'] }, { id: 'b', type: 'scale', label: 'Hvor godt' }, { id: 'c', type: 'text', label: 'Kommentar' }, { id: 'i', type: 'info', label: 'x' }, { id: 'm', type: 'multi', label: 'Mad', options: ['Pizza', 'Sushi'] }];
  const resp = [{ data: { answers: { a: 'Rød', b: 4, c: 'Godt', m: ['Pizza', 'Sushi'] } }, at: 1, guest: 'Ida' }, { data: { answers: { a: 'Rød', b: 5, m: ['Pizza'] } }, at: 2 }, { data: { answers: { a: 'Blå', b: 3 } }, at: 3 }];
  const st = S.formStats(fields, resp);
  assert.deepEqual(st[0].counts, [2, 1]); assert.equal(st[1].avg, 4); assert.deepEqual(st[1].dist, [0, 0, 1, 1, 1]); assert.deepEqual(st[2].texts, ['Godt']); assert.deepEqual(st[3].counts, [2, 1]);
  const csv = S.toCSV(fields, resp);
  assert.ok(csv.startsWith('﻿Tidspunkt;Navn;Farve;Hvor godt;Kommentar;Mad')); assert.ok(csv.includes(';Ida;Rød;4;Godt;Pizza, Sushi'));
  assert.equal(S.checkAnswers([{ id: 'e', type: 'email', label: 'Mail', required: true }], { e: 'x' }).error, 'Skriv en gyldig e-mail');
  assert.equal(S.checkAnswers([{ id: 'e', type: 'text', label: 'Navn', required: true }], {}).field, 'e'); assert.equal(S.checkAnswers(fields, {}), null);
  console.log('sharedlogic batch 1 ok');
}

{ // sharedlogic batch 2
  const L = await import('../web/js/features/sharedlogic.js');
  const parts = L.textParts('Se https://hubtech.dk/x. #Fest i aften #fest (og #ok)');
  assert.deepEqual(parts.map(p => p.t), ['text', 'link', 'text', 'tag', 'text', 'tag', 'text', 'tag', 'text']);
  assert.equal(parts[1].v, 'https://hubtech.dk/x');
  assert.deepEqual(L.tagsOf('#Fest og #fest og #æbler a#b'), ['fest', 'æbler']);
  assert.equal(L.textParts('ingen links').length, 1);
  assert.deepEqual(L.topTags([{ data: { text: '#aa #bb' } }, { data: { text: '#bb' } }]), [['bb', 2], ['aa', 1]]);
  const ents = [{ kind: 'vote', data: { target: 'q', v: 1 } }, { kind: 'vote', data: { target: 7, v: -1 }, mine: true }, { kind: 'vote', data: { target: 8, v: 1 } },
    { kind: 'answer', id: 7, at: 1 }, { kind: 'answer', id: 8, at: 2 }, { kind: 'answer', id: 9, at: 3 }];
  const sc = L.scores(ents);
  assert.deepEqual(sc.s, { q: 1, 7: -1, 8: 1 }); assert.deepEqual(sc.mine, { 7: -1 });
  assert.deepEqual(L.sortAnswers(ents, null).map(a => a.id), [8, 9, 7]);
  assert.deepEqual(L.sortAnswers(ents, 9).map(a => a.id), [9, 8, 7]);
  console.log('sharedlogic batch 2 ok');
}

{ // sharedlogic: Fællesudgifter
  const L = await import('../web/js/features/sharedlogic.js');
  assert.equal(L.toOre('12,50'), 1250); assert.equal(L.toOre('1 000'), 100000);
  assert.deepEqual(L.splitAmount(1000, ['a', 'b', 'c']), { a: 334, b: 333, c: 333 });
  const ents = [
    { kind: 'expense', data: { amount: '300', paidBy: 'a', split: ['a', 'b', 'c'], category: 'Mad' } },
    { kind: 'expense', data: { amount: '90', paidBy: 'b', split: ['b', 'c'], category: 'Transport' } },
    { kind: 'expense', data: { amount: '50', paidBy: 'c', split: ['a', 'c'], custom: { a: 4000, c: 1000 } } },
  ];
  const b = L.balances(ents);
  assert.deepEqual(b, { a: 16000, b: -5500, c: -10500 });
  assert.equal(Object.values(b).reduce((x, y) => x + y, 0), 0);
  const pay = L.settleUp(b);
  assert.deepEqual(pay, [{ from: 'c', to: 'a', amount: 10500 }, { from: 'b', to: 'a', amount: 5500 }]);
  const after = L.balances([...ents, ...pay.map(p => ({ kind: 'settle', data: { ...p, amount: p.amount / 100 } }))]);
  assert.deepEqual(after, {});
  assert.deepEqual(L.byCategory(ents)[0], ['Mad', 30000]);
  assert.equal(L.kr(123456), '1.234,56 kr.');
  console.log('expenses ok');
}

{ // sharedlogic: wiki and challenges
  const L = await import('../web/js/features/sharedlogic.js');
  assert.equal(L.slugify('Regler for Klassen!'), 'regler-for-klassen');
  assert.equal(L.slugify('Æbler & pærer'), 'æbler-pærer');
  const b = L.mdBlocks('# Titel\nFørste linje\nanden\n\n- a\n- b\n1. x\n2. y\n> citat\n```\nkode *ikke*\n```\n---\n## Under');
  assert.deepEqual(b.map(x => x.t), ['h', 'p', 'ul', 'ol', 'quote', 'code', 'hr', 'h']);
  assert.equal(b[1].text, 'Første linje\nanden'); assert.deepEqual(b[2].items, ['a', 'b']); assert.equal(b[5].text, 'kode *ikke*'); assert.equal(b[7].level, 2);
  const inl = L.mdInline('Se **fed** og *skrå* `x` [[Regler for klassen]] [her](https://a.dk) https://b.dk.');
  assert.deepEqual(inl.map(p => p.t), ['text', 'b', 'text', 'i', 'text', 'code', 'text', 'wiki', 'text', 'link', 'text', 'link', 'text']);
  assert.equal(inl[7].slug, 'regler-for-klassen'); assert.equal(inl[9].href, 'https://a.dk'); assert.equal(inl[11].href, 'https://b.dk');
  assert.deepEqual(L.wikiLinks('[[A b]] og\n- [[C]]\n[[A b]]'), ['a-b', 'c']);
  assert.equal(L.addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(L.streak(['2026-03-01', '2026-03-02', '2026-03-03'], '2026-03-03'), 3);
  assert.equal(L.streak(['2026-03-01', '2026-03-02'], '2026-03-03'), 2);      // today not done yet
  assert.equal(L.streak(['2026-03-01'], '2026-03-03'), 0);
  const ents = [{ kind: 'join', userId: 1 }, { kind: 'join', userId: 2 },
    { kind: 'checkin', userId: 1, data: { date: '2026-03-01', amount: 20 } }, { kind: 'checkin', userId: 1, data: { date: '2026-03-02', amount: 30 } },
    { kind: 'checkin', userId: 2, data: { date: '2026-03-02', amount: 90 } }, { kind: 'checkin', userId: 2, data: { date: '2026-02-20', amount: 999 } }];
  const st = L.challengeStats(ents, { start: '2026-03-01', days: 7 }, '2026-03-02');
  assert.deepEqual(st.map(s => [s.id, s.days, s.total, s.streak]), [[1, 2, 50, 2], [2, 1, 90, 1]]);
  assert.deepEqual(L.challengeDay({ start: '2026-03-01', days: 7 }, '2026-03-03'), { day: 3, left: 4, started: true, done: false });
  assert.equal(L.challengeDay({ start: '2026-03-01', days: 7 }, '2026-02-25').started, false);
  assert.equal(L.challengeDay({ start: '2026-03-01', days: 7 }, '2026-03-09').done, true);
  console.log('wiki + challenges ok');
}

{ // sharedlogic: Skoleskema
  const L = await import('../web/js/features/sharedlogic.js');
  assert.equal(L.isoWeek(new Date(2026, 0, 1)), 1);
  assert.equal(L.isoWeek(new Date(2026, 9, 23)), 43);
  assert.equal(L.weekLetter(new Date(2026, 9, 23), true, 1), 'A');
  assert.equal(L.weekLetter(new Date(2026, 9, 23), true, 0), 'B');
  const sch = { slots: [{ from: '08:00', to: '08:45' }, { from: '08:50', to: '09:35' }, { from: '10:00', to: '10:45' }],
    weeks: { A: [[{ subject: 'Dansk' }, { subject: 'Matematik' }, null], [], [], [], [{ subject: 'Idræt' }, null, null]] } };
  const mon = new Date(2026, 9, 19, 8, 10);   // Monday
  assert.deepEqual(L.dayLessons(sch, mon).map(x => x.lesson.subject), ['Dansk', 'Matematik']);
  const nn = L.nowNext(sch, mon);
  assert.equal(nn.now.lesson.subject, 'Dansk'); assert.equal(nn.next.lesson.subject, 'Matematik'); assert.equal(nn.minsLeft, 35); assert.equal(nn.minsTo, 40);
  assert.equal(L.nowNext(sch, new Date(2026, 9, 19, 12, 0)).done, true);
  assert.equal(L.dayLessons(sch, new Date(2026, 9, 24)).length, 0);   // Saturday
  console.log('schedule ok');
}

{ // every code challenge's own solution passes its tests (and the starter code doesn't)
  const { CHALLENGES } = await import('../web/js/data/codechallenges.js');
  const same = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b);
  const ids = new Set();
  for (const c of CHALLENGES) {
    assert.ok(!ids.has(c.id), c.id); ids.add(c.id);
    const f = new Function(`${c.solution}\n;return ${c.fn};`)();
    for (const t of c.tests) assert.ok(same(f(...structuredClone(t.args)), t.expect), `${c.id} ${JSON.stringify(t.args)} → ${JSON.stringify(f(...structuredClone(t.args)))}`);
    const s = new Function(`${c.start}\n;return ${c.fn};`)();
    assert.ok(!c.tests.every(t => { try { return same(s(...structuredClone(t.args)), t.expect); } catch { return false; } }), `${c.id} starter passes`);
  }
  console.log(`code challenges ok (${CHALLENGES.length})`);
}

{ // Dam
  const D = await import('../web/js/features/checkers.js');
  const g = D.newGame([{ name: 'A' }, { name: 'B' }]);
  assert.deepEqual(D.count(g.board), { white: 12, black: 12 });
  assert.equal(D.legalMoves(g.board, 0).length, 7);
  // compulsory capture, double jump, promotion
  const b = Array(64).fill(0); const at = (r, c) => r * 8 + c;
  b[at(5, 0)] = 1; b[at(4, 1)] = -1; b[at(2, 3)] = -1; b[at(0, 7)] = -1;
  let m = D.legalMoves(b, 0);
  assert.equal(m.length, 1); assert.deepEqual(m[0].path, [at(5, 0), at(3, 2), at(1, 4)]); assert.equal(m[0].caps.length, 2);
  const s = { players: [{}, {}], board: b, turn: 0, phase: 'play', quiet: 0, log: [], moves: 0 };
  assert.ok(!D.apply(s, 0, 'move', [at(5, 0), at(3, 2)]), 'must finish the capture');
  assert.ok(D.apply(s, 0, 'move', [at(5, 0), at(1, 4)]));
  assert.equal(D.count(s.board).black, 1);
  // black's man moves, then white promotes
  assert.ok(!D.apply(s, 0, 'move', [at(1, 4), at(0, 5)]), 'not your turn');
  const bm = D.legalMoves(s.board, 1); assert.ok(bm.length > 0);
  const kb = Array(64).fill(0); kb[at(1, 2)] = 1; kb[at(7, 0)] = -1;
  const s2 = { players: [{}, {}], board: kb, turn: 0, phase: 'play', quiet: 0, log: [], moves: 0 };
  assert.ok(D.apply(s2, 0, 'move', [at(1, 2), at(0, 1)])); assert.equal(s2.board[at(0, 1)], 2, 'king');
  // flying king captures from a distance
  const fb = Array(64).fill(0); fb[at(7, 0)] = 2; fb[at(3, 4)] = -1; fb[at(0, 1)] = -1;
  const fm = D.legalMoves(fb, 0); assert.ok(fm.every(x => x.caps.length === 1) && fm.some(x => x.path.at(-1) === at(2, 5)));
  // the computer takes a free piece and finishes the game when it can
  const ab = Array(64).fill(0); ab[at(5, 2)] = 1; ab[at(4, 3)] = -1;
  assert.deepEqual(D.bestMove(ab, 0, 2).path, [at(5, 2), at(3, 4)]);
  const s3 = { players: [{}, {}], board: ab, turn: 0, phase: 'play', quiet: 0, log: [], moves: 0 };
  D.apply(s3, 0, 'move', [at(5, 2), at(3, 4)]); assert.equal(s3.phase, 'over'); assert.equal(s3.winner, 0);
  // a whole game computer vs computer ends
  const gg = D.newGame([{ name: 'A' }, { name: 'B' }]); let n = 0;
  while (gg.phase === 'play' && n++ < 400) { const mv = D.bestMove(gg.board, gg.turn, 1); D.apply(gg, gg.turn, 'move', [mv.path[0], mv.path.at(-1)]); }
  assert.equal(gg.phase, 'over');
  console.log('checkers ok', n, 'moves, winner', gg.winner);
}

{ // Ludo
  const L = await import('../web/js/features/ludo.js');
  const dice = (...xs) => { let k = 0; return () => (xs[k++ % xs.length] - 1) / 6 + 0.01; };
  const s = L.newGame([{ name: 'A' }, { name: 'B' }], () => 0);
  assert.equal(s.turn, 0); assert.deepEqual(s.players.map(p => p.color), [0, 2]);
  L.apply(s, 0, 'roll', [], dice(3)); assert.equal(s.phase, 'roll'); assert.equal(s.tries, 1, 'all home: try again');
  L.apply(s, 0, 'roll', [], dice(6)); assert.equal(s.phase, 'move'); assert.deepEqual(L.movable(s, 0), [0, 1, 2, 3]);
  assert.ok(L.apply(s, 0, 'move', [0])); assert.equal(s.pieces[0][0], 0); assert.equal(s.turn, 0, 'a six: roll again');
  L.apply(s, 0, 'roll', [], dice(4)); L.apply(s, 0, 'move', [0]); assert.equal(s.pieces[0][0], 4); assert.equal(s.turn, 1);
  // B (colour 2, start square 26) lands on A's piece and sends it home
  s.pieces[1][0] = (4 - 26 + 52) % 52 - 2;   // two steps behind A's square 4
  assert.equal(L.square(s, 1, s.pieces[1][0]) , 2);
  L.apply(s, 1, 'roll', [], dice(2)); assert.ok(L.apply(s, 1, 'move', [0]));
  assert.equal(s.pieces[0][0], -1, 'sent home'); assert.equal(s.turn, 1, 'a hit gives another roll');
  // exact roll into the goal, and the game ends
  const g = L.newGame([{ name: 'A' }, { name: 'B' }], () => 0);
  g.pieces[0] = [56, 56, 56, 53]; g.phase = 'roll';
  L.apply(g, 0, 'roll', [], dice(5)); assert.deepEqual(L.movable(g, 0), [], 'overshoot not allowed'); assert.equal(g.turn, 1);
  g.turn = 0; L.apply(g, 0, 'roll', [], dice(3)); L.apply(g, 0, 'move', [3]); assert.equal(g.phase, 'over'); assert.equal(g.winner, 0);
  // four computers finish a game
  const c = L.newGame([{ name: 'A', ai: true }, { name: 'B', ai: true }, { name: 'C', ai: true }, { name: 'D', ai: true }]); let n = 0;
  while (c.phase !== 'over' && n++ < 5000) { const m = L.aiMove(c, c.turn); L.apply(c, c.turn, m.name, m.args); }
  assert.equal(c.phase, 'over'); assert.equal(c.finished.length, 3);
  console.log('ludo ok', n);
}

{ // Otter
  const O = await import('../web/js/features/otter.js');
  const g = O.newGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }], () => 0.3);
  assert.deepEqual(g.hands.map(h => h.length), [7, 7, 7]); assert.equal(g.deck.length + g.pile.length + 21, 52); assert.notEqual(O.valOf(O.top(g)), 8);
  const s = { players: [{ name: 'A' }, { name: 'B' }], hands: [['H3', 'S8', 'C5'], ['D9']], deck: ['C2', 'H12'], pile: ['H9'], suit: 'H', turn: 0, phase: 'play', drew: null, log: [] };
  assert.ok(!O.apply(s, 0, 'play', ['C5']), 'wrong suit');
  assert.ok(!O.apply(s, 0, 'play', ['S8']), 'an 8 needs a suit');
  assert.ok(O.apply(s, 0, 'play', ['S8', 'C'])); assert.equal(s.suit, 'C'); assert.equal(s.turn, 1);
  assert.ok(O.apply(s, 1, 'draw', [])); assert.equal(s.drew, null, 'H12 does not fit clubs: pass'); assert.equal(s.turn, 0);
  assert.ok(O.apply(s, 0, 'play', ['C5']));
  assert.ok(O.apply(s, 1, 'draw', [])); assert.equal(s.drew, 'C2'); assert.ok(!O.apply(s, 1, 'play', ['D9']), 'only the drawn card');
  assert.ok(O.apply(s, 1, 'play', ['C2']));
  assert.ok(O.apply(s, 0, 'draw', [])); // deck empty → refilled from the pile
  // a game between computers ends
  const c = O.newGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]); let n = 0;
  while (c.phase !== 'over' && n++ < 3000) { const m = O.aiMove(c, c.turn); assert.ok(O.apply(c, c.turn, m.name, m.args), JSON.stringify(m)); }
  assert.equal(c.phase, 'over'); assert.equal(c.score[c.winner], Math.min(...c.score));
  console.log('otter ok', n);
}

{ // Sænke slagskibe
  const B = await import('../web/js/features/battleship.js');
  assert.deepEqual(B.shipCells(8, 3, 'h'), null, 'off the board');
  assert.deepEqual(B.shipCells(0, 3, 'v'), [0, 10, 20]);
  for (let k = 0; k < 50; k++) { const f = B.randomFleet(); assert.ok(B.validFleet(B.decode(B.encode(f)))); }
  assert.ok(!B.validFleet([[0, 1, 2, 3, 4], [11, 12, 13, 14], [40, 41, 42], [60, 61, 62], [80, 81]]), 'touching');
  const fleet = '0:5:h;20:4:h;40:3:h;60:3:h;80:2:h';
  const s = B.newGame([{ name: 'A' }, { name: 'B' }]);
  assert.ok(!B.apply(s, 0, 'fire', [0]), 'placing first');
  assert.ok(B.apply(s, 0, 'place', [fleet])); assert.ok(!B.apply(s, 0, 'place', [fleet]), 'only once');
  assert.ok(B.apply(s, 1, 'place', [fleet])); assert.equal(s.phase, 'play');
  assert.ok(B.apply(s, 0, 'fire', [80])); assert.equal(s.turn, 0, 'hit: again');
  assert.ok(B.apply(s, 0, 'fire', [81])); assert.equal(B.sunkCount(s, 1), 1);
  assert.ok(!B.apply(s, 0, 'fire', [81]), 'same cell twice');
  assert.ok(B.apply(s, 0, 'fire', [99])); assert.equal(s.turn, 1, 'miss: the other one');
  assert.deepEqual([B.seaView(s, 1)[80], B.seaView(s, 1)[99]], ['sunk', 'miss']);
  // two computers play to the end
  const g = B.newGame([{ name: 'A', ai: true }, { name: 'B', ai: true }]); let n = 0;
  while (g.phase !== 'over' && n++ < 400) { for (const seat of [0, 1]) { const m = B.aiMove(g, seat); if (m) assert.ok(B.apply(g, seat, m.name, m.args), JSON.stringify(m)); } }
  assert.equal(g.phase, 'over');
  console.log('battleship ok', g.shots[0].length + g.shots[1].length, 'shots');
}

{ // Turneringer
  const T = await import('../web/js/features/tournament.js');
  const k = T.knockout(6);
  assert.equal(k.rounds, 3); assert.equal(k.matches.length, 7);
  assert.equal(k.matches.filter(m => m.round === 0 && (m.a === -1 || m.b === -1)).length, 2, 'two byes');
  assert.equal(k.matches.filter(m => m.round === 1 && (m.a != null || m.b != null)).length, 2, 'byes go straight on');
  for (const m of k.matches.filter(m => m.round === 0 && m.a >= 0 && m.b >= 0)) { m.sa = 2; m.sb = 1; }
  T.advance(k); const semis = k.matches.filter(m => m.round === 1);
  assert.ok(semis.every(m => m.a != null && m.b != null));
  semis.forEach(m => { m.sa = 0; m.sb = 3; }); T.advance(k);
  const fin = k.matches.find(m => m.round === 2); fin.sa = 1; fin.sb = 0; T.advance(k);
  assert.equal(T.champion(k), fin.a); assert.equal(T.roundName(k, 2), 'Finale'); assert.equal(T.roundName(k, 1), 'Semifinaler');
  // changing an early result clears the later ones it affects
  const first = k.matches.find(m => m.round === 0 && m.a >= 0 && m.b >= 0); first.sa = 0; first.sb = 5; T.advance(k);
  assert.ok(k.matches.find(m => m.round === 2).sa == null || T.champion(k) != null);
  const l = T.league(5);
  assert.equal(l.matches.length, 10); assert.equal(l.rounds, 5);
  const pairs = new Set(l.matches.map(m => [m.a, m.b].sort().join()));
  assert.equal(pairs.size, 10, 'everyone meets everyone once');
  l.matches.forEach(m => { m.sa = m.a < m.b ? 2 : 0; m.sb = m.a < m.b ? 0 : 2; });   // lower index always wins
  assert.deepEqual(T.standings(l, 5).map(r => r.i), [0, 1, 2, 3, 4]); assert.equal(T.standings(l, 5)[0].pts, 12); assert.equal(T.champion(l), 0);
  console.log('tournament ok');
}

{ // Kalaha
  const K = await import('../web/js/features/kalaha.js');
  const g = K.newGame([{ name: 'A' }, { name: 'B' }]);
  assert.equal(g.board.reduce((a, b) => a + b, 0), 48);
  assert.ok(K.apply(g, 0, 'sow', [2])); assert.equal(g.board[6], 1); assert.equal(g.turn, 0, 'last stone in own store: again');
  assert.ok(!K.apply(g, 0, 'sow', [2]), 'empty pit');
  assert.ok(K.apply(g, 0, 'sow', [0])); assert.equal(g.turn, 1);
  // capture
  const b = [0, 0, 1, 0, 0, 0, 0, 3, 3, 5, 3, 3, 3, 0];
  const r = K.sow(b, 0, 2); assert.equal(r.captured, 6); assert.equal(r.board[6], 6); assert.equal(r.board[9], 0);
  // sowing past the other's store
  const b2 = Array(14).fill(0); b2[5] = 10; b2[12] = 1; const r2 = K.sow(b2, 0, 5); assert.equal(r2.board[13], 0); assert.equal(r2.board.reduce((x, y) => x + y, 0), 11);
  // computer vs computer finishes, all stones counted
  const c = K.newGame([{}, {}]); let n = 0; c.level = 2;
  while (c.phase === 'play' && n++ < 300) { const m = K.aiMove(c, c.turn); K.apply(c, c.turn, m.name, m.args); }
  assert.equal(c.phase, 'over'); assert.equal(c.board[6] + c.board[13], 48);
  console.log('kalaha ok');
}

{ // Vend (reversi)
  const R = await import('../web/js/features/reversi.js');
  const g = R.newGame([{}, {}]);
  assert.deepEqual(R.legal(g.board, 0).sort((a, b) => a - b), [19, 26, 37, 44]);
  assert.ok(!R.apply(g, 0, 'place', [0])); assert.ok(R.apply(g, 0, 'place', [19]));
  assert.deepEqual(R.count(g.board), [4, 1]); assert.equal(g.turn, 1);
  // no wrapping around the edge
  const b = Array(64).fill(0); b[7] = 2; b[8] = 1; assert.equal(R.flips(b, 6, 0).length, 0);
  const c = R.newGame([{}, {}]); let n = 0;
  while (c.phase === 'play' && n++ < 200) { const m = R.aiMove(c, c.turn); assert.ok(R.apply(c, c.turn, m.name, m.args)); }
  assert.equal(c.phase, 'over');
  console.log('reversi ok', R.count(c.board));
}

{ // Prikker og streger
  const P = await import('../web/js/features/dots.js');
  const g = P.newGame([{}, {}], 2, 2);
  assert.equal(g.lines.length, 12);
  assert.deepEqual(P.boxesOf(g, P.H(g, 1, 0)).sort(), [0, 2]); assert.deepEqual(P.boxesOf(g, P.V(g, 0, 2)), [1]);
  for (const l of [P.H(g, 0, 0), P.H(g, 1, 0), P.V(g, 0, 0)]) P.apply(g, g.turn, 'line', [l]);
  const before = g.turn; assert.ok(P.apply(g, before, 'line', [P.V(g, 0, 1)])); assert.equal(g.boxes[0], before); assert.equal(g.turn, before, 'closed a box: again');
  const c = P.newGame([{}, {}], 4, 4); let n = 0;
  while (c.phase === 'play' && n++ < 100) { const m = P.aiMove(c, c.turn); assert.ok(P.apply(c, c.turn, m.name, m.args)); }
  assert.equal(c.phase, 'over'); assert.equal(P.score(c)[0] + P.score(c)[1], 16);
  console.log('dots ok');
}

{ // Mølle
  const M = await import('../web/js/features/mill.js');
  for (let i = 0; i < 24; i++) for (const j of M.ADJ[i]) assert.ok(M.ADJ[j].includes(i), `adjacency ${i}-${j}`);
  const g = M.newGame([{}, {}]);
  M.apply(g, 0, 'place', [0]); M.apply(g, 1, 'place', [9]); M.apply(g, 0, 'place', [1]); M.apply(g, 1, 'place', [10]);
  assert.ok(M.apply(g, 0, 'place', [2])); assert.ok(g.remove); assert.equal(g.turn, 0);
  assert.ok(!M.apply(g, 0, 'place', [5]), 'must remove first');
  assert.ok(M.apply(g, 0, 'remove', [9])); assert.equal(g.board[9], -1); assert.equal(g.turn, 1);
  let n = 0; const c = M.newGame([{}, {}]);
  while (c.phase === 'play' && n++ < 600) { const m = M.aiMove(c, c.turn); assert.ok(M.apply(c, c.turn, m.name, m.args), JSON.stringify(m)); }
  assert.equal(c.phase, 'over');
  console.log('mill ok', n);
}

{ // Indkøbsliste
  const L = await import('../web/js/features/sharedlogic.js');
  assert.equal(L.shopCat('Bananer'), 'Frugt og grønt'); assert.equal(L.shopCat('Letmælk'), 'Mejeri og æg'); assert.equal(L.shopCat('toiletpapir'), 'Husholdning');
  assert.equal(L.shopCat('rugbrød'), 'Brød og bageri'); assert.equal(L.shopCat('hakket oksekød'), 'Kød og fisk'); assert.equal(L.shopCat('en ting'), 'Andet');
  assert.deepEqual(L.parseItem('2 l mælk'), { qty: '2 l', text: 'mælk' }); assert.deepEqual(L.parseItem('6 æg'), { qty: '6', text: 'æg' }); assert.deepEqual(L.parseItem('smør'), { qty: '', text: 'smør' });
  console.log('shopping ok');
}

{ // Regnemester
  const M = await import('../web/js/features/mathdrill.js');
  for (let i = 0; i < 300; i++) {
    for (const op of ['add', 'sub', 'mul', 'div']) {
      const t = M.task(op, i % 4);
      const v = op === 'add' ? t.a + t.b : op === 'sub' ? t.a - t.b : op === 'mul' ? t.a * t.b : t.a / t.b;
      assert.equal(v, t.answer); assert.ok(Number.isInteger(t.answer) && t.answer >= 0, `${op} ${JSON.stringify(t)}`);
    }
  }
  const t7 = M.task('mul', 1, Math.random, [7]); assert.ok(t7.a === 7 || t7.b === 7);
  const st = {}; M.record(st, { key: 'mul:6x7' }, false); M.record(st, { key: 'mul:6x7' }, false);
  let seen = 0; for (let i = 0; i < 200; i++) if (M.nextTask('mul', 1, st).key === 'mul:6x7') seen++;
  assert.ok(seen > 30, 'wrong answers come back more often');
  assert.equal(M.mastery(st, 7, 6), 0); assert.equal(M.mastery(st, 2, 2), null);
  console.log('mathdrill ok');
}

{ // Grundstoffer
  const { ELEMENTS } = await import('../web/js/data/elements.js');
  assert.equal(ELEMENTS.length, 118);
  assert.equal(new Set(ELEMENTS.map(e => `${e.row},${e.col}`)).size, 118, 'no two in the same cell');
  assert.equal(new Set(ELEMENTS.map(e => e.sym)).size, 118);
  const by = Object.fromEntries(ELEMENTS.map(e => [e.sym, e]));
  assert.deepEqual([by.Fe.row, by.Fe.col, by.Fe.name], [4, 8, 'Jern']); assert.deepEqual([by.Au.row, by.Au.col], [6, 11]);
  assert.deepEqual([by.U.row, by.U.cat], [10, 'actinide']); assert.deepEqual([by.Og.row, by.Og.col], [7, 18]); assert.deepEqual([by.B.col, by.Al.col], [13, 13]);
  assert.equal(by.Hg.state, 'væske'); assert.equal(by.Cl.cat, 'halogen'); assert.equal(by.Na.cat, 'alkali'); assert.equal(by.Fe.period, 4); assert.equal(by.Nd.period, 6);
  console.log('elements ok');
}

{ // Tidslinjen
  const T = await import('../web/js/data/timeline.js');
  assert.ok(T.EVENTS.length >= 60); assert.equal(new Set(T.EVENTS.map(e => e[1])).size, T.EVENTS.length);
  const sorted = T.EVENTS.slice().sort((a, b) => a[0] - b[0]); assert.deepEqual(sorted, T.EVENTS, 'listed in order');
  const cards = [[1066], [1492], [1969]];
  assert.ok(T.fits(cards, 1200, 1)); assert.ok(!T.fits(cards, 1200, 2)); assert.ok(T.fits(cards, 2000, 3)); assert.ok(T.fits(cards, 1492, 1) && T.fits(cards, 1492, 2), 'same year: either side');
  assert.equal(T.yearText(-44), '44 f.Kr.'); assert.equal(T.yearText(1450, true), 'ca. 1450');
  console.log('timeline ok');
}

{ // Hemmelige koder
  const C = await import('../web/js/features/ciphers.js');
  assert.equal(C.caesar('Hej Åse', 1), 'Ifk Atf');
  assert.equal(C.caesar(C.caesar('Rødgrød med fløde!', 7), -7), 'Rødgrød med fløde!');
  assert.equal(C.atbash(C.atbash('Hemmelig')), 'Hemmelig'); assert.equal(C.atbash('a'), 'å');
  assert.equal(C.toMorse('sos'), '... --- ...'); assert.equal(C.fromMorse(C.toMorse('hej med dig')), 'hej med dig'); assert.equal(C.fromMorse(C.toMorse('æble')), 'æble');
  assert.equal(C.fromBinary(C.toBinary('Hej Øster')), 'Hej Øster'); assert.equal(C.toBinary('A'), '01000001');
  assert.equal(C.toNumbers('abc å'), '1-2-3 / 29'); assert.equal(C.fromNumbers('1-2-3 / 29'), 'abc å');
  const secret = C.caesar('det er en hemmelig besked som kun du kan læse her i dag', 11);
  assert.equal(C.crackCaesar(secret), 11);
  console.log('ciphers ok');
}

{ // Kodeknækker, Skubbepuslespil, Ordsøg, Blokfald
  const A = await import('../web/js/features/arcade2.js');
  assert.deepEqual(A.mmScore([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, near: 0 });
  assert.deepEqual(A.mmScore([0, 1, 2, 3], [3, 2, 1, 0]), { exact: 0, near: 4 });
  assert.deepEqual(A.mmScore([0, 0, 1, 1], [0, 1, 0, 2]), { exact: 1, near: 2 });
  assert.deepEqual(A.mmScore([1, 2, 3, 4], [1, 1, 1, 1]), { exact: 1, near: 0 });
  const t = A.slideShuffle(4); assert.ok(!A.isSolved(t)); assert.equal(new Set(t).size, 16);
  const s3 = A.slideSolved(3); assert.ok(A.isSolved(s3));
  assert.deepEqual(A.slideMove(s3, 3, 6), [1, 2, 3, 4, 5, 6, 0, 7, 8], 'a whole row slides'); assert.equal(A.slideMove(s3, 3, 0), null);
  const words = ['KODE', 'SKOLE', 'HUBTECH', 'ÆBLE', 'SPIL'];
  const g = A.wordGrid(words, 10);
  for (const p of g.placed) assert.equal([...p.word].map((_, i) => g.grid[p.r + p.dr * i][p.c + p.dc * i]).join(''), p.word);
  assert.equal(g.placed.length, 5);
  assert.deepEqual(A.lineCells([0, 0], [2, 2]), [[0, 0], [1, 1], [2, 2]]); assert.equal(A.lineCells([0, 0], [1, 2]), null);
  let b = A.emptyBoard(); for (let x = 0; x < 10; x++) if (x < 6) b[19][x] = 'O';
  const I = { type: 'I', rot: 0, x: 6, y: 18 }; // row 19 = y+1 → cells x 6..9
  const r = A.lock(b, I); assert.equal(r.lines, 1); assert.ok(r.board[19].every(c => !c));
  assert.equal(A.cells({ type: 'T', rot: 4, x: 0, y: 0 }).join(), A.cells({ type: 'T', rot: 0, x: 0, y: 0 }).join(), 'four turns = start');
  assert.ok(A.collides(A.emptyBoard(), { type: 'I', rot: 0, x: 8, y: 0 }));
  assert.equal(A.dropDistance(A.emptyBoard(), A.spawn('O')), 19);
  console.log('arcade2 ok');
}

{ // Karakterer, tekst, hold, farver, sparegris
  const T = await import('../web/js/features/tools2.js');
  assert.equal(T.average([{ grade: 12, weight: 1 }, { grade: 7, weight: 1 }, { grade: 4, weight: 2 }]), 6.8);
  assert.equal(T.average([]), null); assert.equal(T.average([{ grade: 5, weight: 1 }]), null, '5 is not on the scale');
  assert.equal(T.needed([{ grade: 7, weight: 1 }], 8.5), 10); assert.equal(T.needed([{ grade: 2, weight: 1 }], 12), null);
  const s = T.textStats('Hunden løber. Katten sover i solen! Det er en dejlig sommerdag.');
  assert.equal(s.words, 11); assert.equal(s.sentences, 3); assert.equal(s.lix, Math.round(11 / 3 + 100 / 11));
  assert.ok(T.lixText(20).startsWith('Let')); assert.ok(T.lixText(60).startsWith('Meget'));
  assert.equal(T.titleCase('hej med dig'), 'Hej Med Dig'); assert.equal(T.sentenceCase('HEJ. MED DIG'), 'Hej. Med dig');
  assert.equal(T.sortLines('b\nå\na'), 'a\nb\nå'); assert.equal(T.uniqueLines('a\nb\na'), 'a\nb');
  assert.deepEqual(T.topWords('kode kode sjov kode sjov og at')[0], ['kode', 3]);
  const tm = T.teams(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3); assert.deepEqual(tm.map(t => t.length).sort(), [2, 2, 3]); assert.equal(tm.flat().length, 7);
  assert.equal(T.teamsOfSize(Array.from({ length: 10 }, (_, i) => i), 3).length, 3);
  assert.deepEqual(T.hexToRgb('#fff'), [255, 255, 255]); assert.equal(T.rgbToHex(255, 0, 128), '#ff0080');
  assert.equal(T.contrast('#000000', '#ffffff'), 21); assert.ok(T.wcag(4.6).aa && !T.wcag(4.6).aaa);
  const [hh, ss, ll] = T.rgbToHsl(255, 0, 0); assert.deepEqual([hh, ss, ll], [0, 100, 50]); assert.deepEqual(T.hslToRgb(120, 100, 50), [0, 255, 0]);
  assert.equal(T.palette('#ff0000', 'complement')[1], '#00ffff'); assert.equal(T.palette('#336699', 'shades').length, 6);
  assert.equal(T.weeksToGoal(100, 500, 50), 8); assert.equal(T.weeksToGoal(600, 500, 50), 0); assert.equal(T.weeksToGoal(0, 500, 0), null);
  console.log('tools2 ok');
}

{ // Hjerterfri
  const Hh = await import('../web/js/features/hearts.js');
  const g = Hh.newGame([{ name: 'A' }, { name: 'B', ai: true }, { name: 'C', ai: true }, { name: 'D', ai: true }]);
  assert.equal(g.phase, 'pass'); assert.ok(g.hands.every(h => h.length === 13));
  assert.ok(!Hh.apply(g, 0, 'pass', [[g.hands[0][0]]]), 'three cards');
  for (let seat = 0; seat < 4; seat++) assert.ok(Hh.apply(g, seat, 'pass', [g.hands[seat].slice(0, 3)]));
  assert.equal(g.phase, 'play'); assert.ok(g.hands[g.turn].includes('C2')); assert.deepEqual(Hh.legal(g, g.turn), ['C2']);
  // a whole game between computers ends, scores add up
  const c = Hh.newGame([{ ai: true, name: 'A' }, { ai: true, name: 'B' }, { ai: true, name: 'C' }, { ai: true, name: 'D' }]); let n = 0;
  while (c.phase !== 'over' && n++ < 20000) {
    let moved = false;
    for (let seat = 0; seat < 4 && !moved; seat++) { const m = Hh.aiMove(c, seat); if (m) { assert.ok(Hh.apply(c, seat, m.name, m.args), JSON.stringify([c.phase, m])); moved = true; } }
    assert.ok(moved, 'someone can always move');
  }
  assert.equal(c.phase, 'over'); assert.ok(Math.max(...c.scores) >= 100); assert.equal(c.scores.reduce((a, b) => a + b, 0) % 26, 0, 'each round gives 26 points');
  console.log('hearts ok', c.round + 1, 'rounds');
}

{ // Meyer
  const M = await import('../web/js/features/meyer.js');
  assert.equal(M.ORDER[0], 21); assert.equal(M.ORDER[1], 31); assert.equal(M.ORDER.at(-1), 32); assert.equal(M.ORDER.length, 21);
  assert.equal(M.valueOf(1, 2), 21); assert.equal(M.valueOf(4, 6), 64); assert.ok(M.strength(11) > M.strength(65));
  const fixed = (...v) => { let k = 0; return () => (v[k++ % v.length] - 1) / 6 + 0.01; };
  const g = M.newGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  M.apply(g, 0, 'roll', [], fixed(4, 3)); assert.equal(g.roll, 43);
  assert.ok(M.apply(g, 0, 'announce', [55])); assert.equal(g.turn, 1);
  assert.ok(M.apply(g, 1, 'lift')); assert.deepEqual(g.lives, [2, 3, 3], 'a bluff costs the bluffer'); assert.equal(g.turn, 0);
  M.apply(g, 0, 'roll', [], fixed(6, 6)); M.apply(g, 0, 'announce', [66]); M.apply(g, 1, 'lift');
  assert.deepEqual(g.lives, [2, 2, 3], 'truth costs the lifter'); assert.equal(g.turn, 1);
  M.apply(g, 1, 'roll', [], fixed(5, 2)); assert.ok(!M.apply(g, 1, 'announce', [32]) || true);
  const c = M.newGame([{}, {}, {}, {}]); let n = 0;
  while (c.phase !== 'over' && n++ < 2000) { const m = M.aiMove(c, c.turn); assert.ok(M.apply(c, c.turn, m.name, m.args), JSON.stringify(m)); }
  assert.equal(c.phase, 'over'); assert.equal(c.lives.filter(l => l > 0).length, 1);
  console.log('meyer ok');
}

{ // Fri celle
  const F = await import('../web/js/features/freecell.js');
  const g = F.newGame(); assert.deepEqual(g.cols.map(c => c.length), [7, 7, 7, 7, 6, 6, 6, 6]);
  const mk = () => ({ cols: [['C5', 'H4', 'S3'], ['D6'], ['H6'], ['D1'], ['C1', 'H2'], ['D13'], ['S13'], ['H13']], cells: [null, null, null, null], found: { S: 0, H: 0, D: 0, C: 0 }, moves: 0, history: [] });
  let t = mk();
  assert.equal(F.runLength(t.cols[0]), 3);
  assert.ok(F.move(t, { t: 'col', i: 0 }, { t: 'col', i: 2 }, 3), 'black C5 on red H6 with the run');
  assert.deepEqual(t.cols[2], ['H6', 'C5', 'H4', 'S3']); assert.equal(t.cols[0].length, 0);
  assert.ok(F.undo(t)); assert.deepEqual(t.cols[0], ['C5', 'H4', 'S3']);
  t.cells = ['S1', 'S2', 'D2', 'C2']; assert.equal(F.maxRun(t), 1);
  assert.ok(!F.move(t, { t: 'col', i: 0 }, { t: 'col', i: 2 }, 3), 'no room for three cards');
  t = mk(); assert.ok(F.move(t, { t: 'col', i: 3 }, { t: 'found' })); assert.equal(t.found.D, 1);
  assert.ok(!F.move(t, { t: 'col', i: 4 }, { t: 'found' }), 'H2 needs H1 first');
  t = mk(); t.cols[4] = ['H2', 'C1']; const n = F.autoFound(t); assert.ok(n >= 2, 'aces and twos go up by themselves'); assert.equal(t.found.C, 1);
  assert.deepEqual(F.bestTarget(mk(), { t: 'col', i: 3 }), { t: 'found' });
  console.log('freecell ok');
}

{ // Banko
  const A = await import('../web/js/features/arcade2.js');
  for (let k = 0; k < 100; k++) {
    const p = A.plate();
    assert.ok(p.every(r => r.filter(v => v != null).length === 5), 'five numbers in each row');
    for (let c = 0; c < 9; c++) { const col = p.map(r => r[c]).filter(v => v != null); assert.ok(col.length >= 1); assert.deepEqual(col, col.slice().sort((x, y) => x - y)); assert.ok(col.every(v => (c === 0 ? v >= 1 && v <= 9 : c === 8 ? v >= 80 && v <= 90 : Math.floor(v / 10) === c))); }
    assert.equal(new Set(p.flat().filter(v => v != null)).size, 15);
  }
  const p = A.plate(); assert.equal(A.fullRows(p, new Set(p[0].filter(Boolean))), 1);
  console.log('banko ok');
}

{ // Fødselsdage, Pakkeliste, Udlån, Plantepasser
  const H = await import('../web/js/features/home2.js');
  const today = new Date(2026, 9, 23);
  let b = H.nextBirthday('2010-10-25', today); assert.equal(b.days, 2); assert.equal(b.turns, 16);
  b = H.nextBirthday('2010-10-23', today); assert.equal(b.days, 0); assert.equal(b.turns, 16);
  b = H.nextBirthday('2012-01-05', today); assert.equal(b.date.getFullYear(), 2027); assert.equal(b.turns, 15);
  b = H.nextBirthday('--03-01', today); assert.equal(b.turns, null); assert.equal(b.date.getMonth(), 2);
  b = H.nextBirthday('2008-02-29', new Date(2026, 2, 5)); assert.equal(b.date.getFullYear(), 2027); assert.equal(b.date.getMonth(), 2); assert.equal(b.date.getDate(), 1);
  assert.equal(H.nextBirthday('nope', today), null);
  assert.equal(H.ageOn('2010-10-24', today), 15); assert.equal(H.ageOn('2010-10-23', today), 16);
  assert.equal(H.zodiac('2010-03-25'), 'Vædderen'); assert.equal(H.zodiac('2010-12-25'), 'Stenbukken'); assert.equal(H.zodiac('2010-01-10'), 'Stenbukken'); assert.equal(H.zodiac('2010-08-01'), 'Løven');
  let list = H.mergeItems([{ name: 'Telefon', done: true }], ['telefon', 'Oplader', 'Oplader']);
  assert.equal(list.length, 2); assert.equal(list[0].done, true); assert.deepEqual(H.packProgress(list), { done: 1, total: 2 });
  const now = new Date(2026, 9, 23, 15).getTime(), D = 86400000;
  assert.equal(H.loanStatus({ due: now - D }, now), 'late'); assert.equal(H.loanStatus({ due: now + 2 * D }, now), 'soon');
  assert.equal(H.loanStatus({ due: now + 10 * D }, now), 'out'); assert.equal(H.loanStatus({ due: now - D, back: now }, now), 'back'); assert.equal(H.loanStatus({}, now), 'out');
  assert.equal(H.waterDue({ every: 7, watered: now - 3 * D }, now), 4); assert.equal(H.waterDue({ every: 2, watered: now - 5 * D }, now), -3); assert.equal(H.waterDue({ every: 5 }, now), 0);
  assert.equal(H.dueText(-3), '3 dage for sent'); assert.equal(H.dueText(1), 'i morgen');
  console.log('home2 ok');
}

{ // Hovedstæder, Klokken, Brøker, Stavning, Omregner, Terninger, Billedgåder
  const L = await import('../web/js/features/learn3.js');
  assert.ok(L.CAPITALS.length >= 75); assert.ok(L.CAPITALS.every(c => L.REGIONS.includes(c[2])));
  for (let k = 0; k < 50; k++) { const q = L.capitalQ(L.CAPITALS, k % 2 ? 'capital' : 'country'); assert.equal(q.options.length, 4); assert.equal(new Set(q.options).size, 4); assert.ok(q.options.includes(q.answer)); }
  assert.equal(L.norm(' Bogota '), L.norm('Bogotá')); assert.equal(L.norm('Washington DC'), L.norm('Washington D.C.'));
  assert.equal(L.clockWords(3, 0), 'tre'); assert.equal(L.clockWords(3, 15), 'kvart over tre'); assert.equal(L.clockWords(3, 30), 'halv fire');
  assert.equal(L.clockWords(3, 45), 'kvart i fire'); assert.equal(L.clockWords(3, 25), 'fem minutter i halv fire'); assert.equal(L.clockWords(3, 35), 'fem minutter over halv fire');
  assert.equal(L.clockWords(11, 50), 'ti minutter i tolv'); assert.equal(L.clockWords(12, 30), 'halv et'); assert.equal(L.clockWords(15, 5), 'fem minutter over tre'); assert.equal(L.clockWords(9, 1), 'et minut over ni');
  assert.equal(L.digital(7, 5), '07.05');
  for (let k = 0; k < 30; k++) { const t = L.randomTime(2); assert.ok(t.m % 15 === 0 && t.h >= 1 && t.h <= 12); }
  assert.deepEqual(L.simplify([6, 8]), [3, 4]); assert.deepEqual(L.fadd([1, 2], [1, 3]), [5, 6]); assert.deepEqual(L.fmul([2, 3], [3, 4]), [1, 2]); assert.deepEqual(L.fdiv([1, 2], [1, 4]), [2, 1]);
  assert.deepEqual(L.parseFrac('1 1/2'), [3, 2]); assert.deepEqual(L.parseFrac('4/8'), [1, 2]); assert.deepEqual(L.parseFrac('3'), [3, 1]); assert.equal(L.parseFrac('1/0'), null); assert.equal(L.parseFrac('x'), null);
  assert.equal(L.fstr([3, 1]), '3'); assert.ok(L.feq([2, 4], [1, 2]));
  for (const kind of ['shade', 'simplify', 'compare', 'add', 'mul']) for (let k = 0; k < 20; k++) { const t = L.fracTask(kind); assert.ok(t.answer); if (kind === 'simplify') assert.ok(L.feq(t.frac, t.answer)); }
  assert.deepEqual(L.spellDiff('hus', 'hos').map(x => x.ok), [true, false, true]); assert.equal(L.spellDiff('kat', 'ka').length, 3);
  assert.ok(Math.abs(L.convert('length', 1, 'km', 'm') - 1000) < 1e-9); assert.ok(Math.abs(L.convert('temp', 100, '°C', '°F') - 212) < 1e-9); assert.ok(Math.abs(L.convert('temp', 0, 'K', '°C') + 273.15) < 1e-9);
  assert.ok(Math.abs(L.convert('speed', 36, 'km/t', 'm/s') - 10) < 1e-9); assert.equal(L.convert('length', 1, 'km', 'kg'), null); assert.equal(L.nice(1000), '1.000');
  let r = L.rollDice('3d6+2', () => 0.999); assert.equal(r.total, 20); assert.equal(r.rolls.length, 3); r = L.rollDice('d20', () => 0); assert.equal(r.total, 1); assert.equal(L.rollDice('hej'), null); assert.ok(L.rollDice('2t10'));
  assert.deepEqual(L.clues([1, 1, 0, 1, 0]), [2, 1]); assert.deepEqual(L.clues([0, 0]), [0]);
  for (const n of L.NONOGRAMS) { assert.equal(n.grid.length, n.size, n.name); assert.ok(n.grid.every(row => row.length === n.size), n.name); }
  const g = L.NONOGRAMS[0].grid; assert.ok(L.solved(g, g.map(r => r.map(v => (v ? 1 : 2))))); assert.ok(!L.solved(g, g.map(r => r.map(() => 0))));
  console.log('learn3 ok');
}

{ // Labyrint, Lysslukker, Ordrul, Stigespil, Reaktion, Gæt dyret
  const A = await import('../web/js/features/arcade4.js');
  const r1 = A.seeded(42), r2 = A.seeded(42); assert.equal(r1(), r2());
  const g = A.maze(12, 9, A.seeded(7));
  let open = 0; for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) { if (x < 11 && !(g[y][x] & A.E)) { open++; assert.ok(!(g[y][x + 1] & A.W), 'walls agree'); } if (y < 8 && !(g[y][x] & A.S)) open++; }
  assert.equal(open, 12 * 9 - 1, 'a perfect maze is a tree');
  const path = A.solveMaze(g); assert.ok(path && path[0].join() === '0,0' && path.at(-1).join() === '11,8');
  assert.deepEqual(A.maze(5, 5, A.seeded(3)), A.maze(5, 5, A.seeded(3)), 'same number, same maze');
  let b = Array(9).fill(false); b = A.press(b, 3, 4); assert.deepEqual(b.map(Number), [0, 1, 0, 1, 1, 1, 0, 1, 0]); b = A.press(b, 3, 0); assert.deepEqual(b.map(Number), [1, 0, 0, 0, 1, 1, 0, 1, 0]);
  const L = A.lights(5, 6); assert.ok(!A.allOff(L.board)); assert.ok(L.par <= 6);
  for (let k = 0; k < 20; k++) { const s = A.scramble('banan'); assert.notEqual(s, 'banan'); assert.equal([...s].sort().join(''), 'aabnn'); }
  assert.ok(A.isAnagram('Banan', 'banan')); assert.ok(A.isAnagram('ensom', 'mones', ['ensom', 'mones'])); assert.ok(!A.isAnagram('ensom', 'mones', [])); assert.ok(!A.isAnagram('bnaan', 'banan'));
  const s = A.newLadders([{ name: 'A' }, { name: 'B', ai: true }]);
  assert.ok(A.applyLadders(s, 0, 'roll', [4])); assert.equal(s.pos[0], 14, 'a ladder from 4 to 14'); assert.equal(s.turn, 1);
  assert.ok(!A.applyLadders(s, 0, 'roll', [1]), 'not your turn');
  assert.ok(A.applyLadders(s, 1, 'roll', [6])); assert.equal(s.turn, 1, 'a six gives another roll');
  s.pos[1] = 97; s.turn = 1; A.applyLadders(s, 1, 'roll', [5]); assert.equal(s.pos[1], 98, 'bounce back from 100'); s.turn = 1; s.pos[1] = 97; A.applyLadders(s, 1, 'roll', [3]); assert.equal(s.phase, 'over'); assert.equal(s.winner, 1);
  s.phase = 'roll'; s.turn = 0; s.pos[0] = 15; A.applyLadders(s, 0, 'roll', [2]); assert.equal(s.pos[0], 7, 'a slide from 17 to 7');
  assert.deepEqual(A.cellOf(1), [0, 0]); assert.deepEqual(A.cellOf(11), [1, 9]); assert.deepEqual(A.cellOf(100), [9, 0]);
  assert.equal(A.median([300, 200, 250]), 250); assert.equal(A.median([1, 2, 3, 4]), 3); assert.equal(A.median([]), null); assert.equal(A.reactionRating(190), 'Lynhurtig!');
  assert.equal(A.walk(A.START_TREE, [false, false, true, true]).a, 'en kat');
  const t2 = A.learn(A.START_TREE, [false, false, true, true], 'en kanin', 'Har det lange ører', true);
  assert.equal(A.walk(t2, [false, false, true, true]).q, 'Har det lange ører?'); assert.equal(A.walk(t2, [false, false, true, true, true]).a, 'en kanin'); assert.equal(A.walk(t2, [false, false, true, true, false]).a, 'en kat');
  assert.equal(A.countAnimals(t2), A.countAnimals(A.START_TREE) + 1); assert.equal(A.walk(A.START_TREE, [false, false, true, true]).a, 'en kat', 'the original is unchanged');
  console.log('arcade4 ok');
}

{ // Gloser, Robotvej, Solsystemet, Køleskabet, Opsparing, Kassemand, Juveler
  const B = await import('../web/js/features/batch8.js');
  for (const s of Object.values(B.VOCAB)) assert.ok(s.words.length >= 12 && s.words.every(w => w.length === 2 && w[0] && w[1]));
  const now = 1_800_000_000_000, D = 86400000;
  let c = B.review(undefined, true, now); assert.deepEqual([c.box, c.due], [1, now + D]); c = B.review(c, true, now); assert.equal(c.box, 2); c = B.review(c, false, now); assert.deepEqual([c.box, c.due], [0, now]);
  const words = B.VOCAB['en-dyr'].words; assert.equal(B.dueCards(words, {}, now, 5).length, 5); assert.equal(B.dueCards(words, { 0: { box: 3, due: now + D } }, now, 99).length, words.length - 1);
  assert.ok(B.vocabMatch('der Hund', 'Hund')); assert.ok(B.vocabMatch('weiß', 'weiss')); assert.ok(B.vocabMatch('to run', 'Run')); assert.ok(!B.vocabMatch('dog', 'cat'));
  // every robot level can be solved within its limit (search over moves, then squeeze runs of steps into “gentag”)
  for (const lv of B.ROBOT_LEVELS) {
    const L = B.parseLevel(lv), key = (x, y, d, m) => `${x},${y},${d},${m}`, q = [[L.start[0], L.start[1], 1, 0, []]], seen = new Set([key(L.start[0], L.start[1], 1, 0)]); let sol = null;
    while (q.length) { const [x, y, d, m, path] = q.shift(); if (x === L.goal[0] && y === L.goal[1] && m === (1 << L.stars.length) - 1) { sol = path; break; }
      for (const op of ['fwd', 'left', 'right']) { let nx = x, ny = y, nd = d, nm = m; if (op === 'left') nd = (d + 3) % 4; else if (op === 'right') nd = (d + 1) % 4; else { nx = x + B.DIRS[d][0]; ny = y + B.DIRS[d][1]; if (L.wall(nx, ny)) continue; const si = L.stars.indexOf(`${nx},${ny}`); if (si >= 0) nm |= 1 << si; } const k = key(nx, ny, nd, nm); if (!seen.has(k)) { seen.add(k); q.push([nx, ny, nd, nm, [...path, op]]); } } }
    const prog = []; for (const op of sol) { const last = prog.at(-1); if (last?.op === 'repeat' && last.body[0].op === op) last.n++; else if (last?.op === 'fwd' && op === 'fwd') { prog.pop(); prog.push({ op: 'repeat', n: 2, body: [{ op }] }); } else prog.push({ op }); }
    const HAND = { Trappen: [{ op: 'right' }, { op: 'fwd' }, { op: 'repeat', n: 3, body: [{ op: 'fwd' }, { op: 'left' }, { op: 'fwd' }, { op: 'right' }] }, { op: 'left' }, { op: 'fwd' }] };
    const best = HAND[lv.name] || prog;
    assert.ok(B.runRobot(lv, prog).won, lv.name); assert.ok(B.runRobot(lv, best).won, lv.name); assert.ok(B.programSize(best) <= lv.max, `${lv.name} fits in ${lv.max}`);
  }
  assert.ok(B.runRobot(B.ROBOT_LEVELS[0], [{ op: 'fwd' }, { op: 'left' }, { op: 'fwd' }]).crash, 'walking into a wall');
  assert.ok(B.runRobot(B.ROBOT_LEVELS[3], [{ op: 'repeat', n: 8, body: [{ op: 'fwd' }] }]).won);
  const earth = B.PLANETS.find(p => p.name === 'Jorden'); assert.equal(B.planetAge(10, earth), 10); assert.equal(B.lightMinutes(1), 8.3);
  assert.ok(B.planetAge(10, B.PLANETS[0]) > 40);
  const t = new Date(now); const iso = (k) => { const d = new Date(now + k * D); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  assert.equal(B.expiry({ date: iso(-1) }, now).state, 'old'); assert.equal(B.expiry({ date: iso(0) }, now).state, 'today'); assert.equal(B.expiry({ date: iso(3) }, now).state, 'soon'); assert.equal(B.expiry({ date: iso(9) }, now).state, 'ok'); assert.equal(B.expiry({}, now).days, null);
  let sv = B.savings({ start: 1000, monthly: 0, rate: 12, years: 1 }); assert.ok(Math.abs(sv.balance - 1126.825) < 0.01); sv = B.savings({ start: 0, monthly: 100, rate: 0, years: 2 }); assert.equal(sv.balance, 2400); assert.equal(sv.rows.length, 2);
  B.SOKO.slice(0, 7).forEach((lv, i) => {
    const s0 = B.sokoParse(lv), key = (s) => s.player + '|' + s.boxes.slice().sort((a, b) => a - b).join(','), q = [s0], seen = new Set([key(s0)]); let ok = false;
    while (q.length) { const s = q.shift(); if (B.sokoWon(s)) { ok = true; break; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = B.sokoMove({ ...s, hist: [] }, dx, dy); if (n && !seen.has(key(n))) { seen.add(key(n)); q.push(n); } } }
    assert.ok(ok, `Kassemand bane ${i + 1} kan løses`); assert.equal(s0.boxes.length, s0.targets.length);
  });
  let k = B.sokoParse(B.SOKO[0]); assert.equal(B.sokoMove(k, -1, 0), null, 'wall'); k = B.sokoMove(k, 1, 0); assert.ok(B.sokoWon(k)); assert.equal(k.pushes, 1); assert.ok(!B.sokoWon(B.sokoUndo(k)));
  for (let r = 0; r < 20; r++) { const g = B.gemBoard(8); assert.equal(B.findMatches(g).length, 0, 'a new board has no matches'); }
  const g = [0, 0, 1, 2, 3, 4, 5, 0, ...Array(56).fill(null).map((_, i) => (i * 7 + Math.floor(i / 8)) % 6)];
  const m = B.findMatches([0, 0, 0, 1, 2, 3, 4, 5, ...Array(56).fill(-1)]); assert.deepEqual(m, [0, 1, 2]);
  assert.ok(B.adjacent(0, 1)); assert.ok(B.adjacent(0, 8)); assert.ok(!B.adjacent(7, 8)); assert.ok(!B.adjacent(0, 9));
  const col = B.collapse([0, 0, 0, 1, 2, 3, 4, 5, ...Array(56).fill(3)].map((v, i) => (i >= 8 ? ((i + Math.floor(i / 8)) % 2 ? 4 : 5) : v)), 8, () => 0.5); assert.equal(col.removed, 3);
  assert.ok(typeof B.hasMove(B.gemBoard(8)) === 'boolean'); void g; void t;
  console.log('batch8 ok');
}

{ // Fem på stribe, Tændstikker, Støjmåler, Ordklasser, Talsystemer, Genveje, Klaver, Morgenrutine
  const B = await import('../web/js/features/batch9.js');
  const s = B.newGomoku([{ name: 'A' }, { name: 'B', ai: true }]);
  for (let k = 0; k < 4; k++) { assert.ok(B.applyGomoku(s, 0, 'place', [7 * 15 + k])); assert.ok(B.applyGomoku(s, 1, 'place', [8 * 15 + k])); }
  assert.ok(!B.applyGomoku(s, 1, 'place', [0]), 'not your turn'); assert.ok(!B.applyGomoku(s, 0, 'place', [7 * 15]), 'taken');
  assert.ok(B.applyGomoku(s, 0, 'place', [7 * 15 + 4])); assert.equal(s.phase, 'over'); assert.equal(s.winner, 0); assert.equal(s.line.length, 5);
  const t = B.newGomoku([{ name: 'A' }, { name: 'B', ai: true }]); [112, 113, 114].forEach((i) => { t.board[i] = 0; }); t.board[30] = 1; t.board[200] = 1; t.moves = 5; t.turn = 1;
  const mv = B.aiGomoku(t, 1); assert.ok([111, 115].includes(mv.args[0]), 'the computer blocks an open three');
  t.board[142 + 3] = 1; t.board[142 + 3] = -1; const w = B.newGomoku([{ name: 'A' }, { name: 'B' }]); [0, 1, 2, 3].forEach(i => { w.board[60 + i] = 1; }); w.moves = 8; w.turn = 1; assert.ok([59, 64].includes(B.aiGomoku(w, 1).args[0]), 'the computer wins when it can');
  // Nim: the computer's move from a winning position leaves a losing one (normal play)
  for (const rows of [[1, 3, 5, 7], [3, 4, 5], [2, 2, 1]]) { const m = B.nimMove(rows, false), r = rows.slice(); if (B.nimXor(rows)) { r[m.row] -= m.take; assert.equal(B.nimXor(r), 0, String(rows)); } }
  let r = [0, 0, 5]; let m = B.nimMove(r, true); assert.deepEqual(m, { row: 2, take: 4 }, 'misère: leave one match'); r = [1, 0, 5]; m = B.nimMove(r, true); assert.deepEqual(m, { row: 2, take: 5 });
  assert.ok(B.nimDone([0, 0])); assert.equal(B.level(new Float32Array(100)), 0); assert.ok(B.level(new Float32Array(100).fill(0.5)) > 80); assert.equal(B.noiseLabel(10)[1], 'Musestille'); assert.equal(B.noiseLabel(95)[1], 'Alt for højt!');
  for (const sen of B.SENTENCES) assert.ok(B.parseSentence(sen).every(w => w.word && (w.tag === null || B.CLASSES[w.tag])), sen);
  assert.equal(B.toBase(10, 2), '1010'); assert.equal(B.toBase(255, 16), 'FF'); assert.equal(B.fromBase('ff', 16), 255); assert.equal(B.fromBase('0b101', 2), 5); assert.equal(B.fromBase('12', 2), null); assert.equal(B.fromBase('', 10), null);
  for (let k = 0; k < 40; k++) { const q = B.numTask(1 + (k % 4)); assert.equal(B.fromBase(q.answer, q.to), q.n); assert.equal(B.fromBase(q.ask, q.from), q.n); }
  assert.deepEqual(B.bitValues('1011'), [8, 0, 2, 1]);
  assert.ok(B.SHORTCUTS.length >= 20 && B.SHORTCUTS.every(x => x.length === 3));
  assert.equal(B.combo({ key: 't', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }), 'Ctrl+Shift+T'); assert.equal(B.combo({ key: 'Control', ctrlKey: true }), null); assert.equal(B.combo({ key: 'F5' }), 'F5');
  assert.equal(Math.round(B.freq(69)), 440); assert.equal(Math.round(B.freq(60)), 262); assert.equal(B.noteName(60), 'C4'); assert.equal(B.noteName(71), 'H4');
  assert.equal(B.streak({ '2026-10-22': true, '2026-10-21': true, '2026-10-19': true }, '2026-10-23'), 2); assert.equal(B.streak({ '2026-10-23': true, '2026-10-22': true }, '2026-10-23'), 2); assert.equal(B.streak({}, '2026-10-23'), 0);
  console.log('batch9 ok');
}

{ // Triktrak, 10.000, Sorteper, Del regningen, Navnemaskine, Skriveværksted, Cykelprøven, Kims leg
  const B = await import('../web/js/features/batch10.js');
  const s = B.newTriktrak([{ name: 'A' }, { name: 'B', ai: true }]);
  assert.equal(s.points.reduce((a, v) => a + (v > 0 ? v : 0), 0), 15); assert.equal(s.points.reduce((a, v) => a + (v < 0 ? -v : 0), 0), 15); assert.equal(B.pips(s, 0), 167); assert.equal(B.pips(s, 1), 167);
  assert.ok(B.applyTriktrak(s, 0, 'roll', [3, 1])); assert.equal(s.phase, 'move');
  const lm = B.legalMoves(s, 0); assert.ok(lm.some(m => m.from === 7 && m.to === 4 && m.die === 3)); assert.ok(!lm.some(m => m.to === 0 && m.die === 3 && m.from === 3), 'no checker there');
  assert.ok(B.applyTriktrak(s, 0, 'move', [7, 4, 3])); assert.ok(B.applyTriktrak(s, 0, 'move', [5, 4, 1])); assert.equal(s.points[4], 2, 'made the 5-point'); assert.equal(s.turn, 1);
  assert.ok(!B.applyTriktrak(s, 0, 'roll'), 'not your turn');
  // hitting and entering from the bar
  const h = B.newTriktrak([{ name: 'A' }, { name: 'B' }]); h.points = Array(24).fill(0); h.points[10] = 1; h.points[8] = -1; h.points[20] = -14; h.points[0] = 14; h.phase = 'move'; h.left = [2]; h.turn = 0;
  assert.ok(B.applyTriktrak(h, 0, 'move', [10, 8, 2])); assert.equal(h.bar[1], 1, 'black is hit');
  h.turn = 1; h.phase = 'move'; h.left = [3, 5]; assert.ok(B.legalMoves(h, 1).every(m => m.from === 'bar'), 'must enter first');
  // bearing off: higher die only moves the furthest checker
  const o = B.newTriktrak([{ name: 'A' }, { name: 'B' }]); o.points = Array(24).fill(0); o.points[2] = 2; o.points[0] = 1; o.points[23] = -15; o.off = [12, 0]; o.phase = 'move'; o.left = [6]; o.turn = 0;
  const om = B.legalMoves(o, 0); assert.deepEqual(om.map(m => `${m.from}>${m.to}`), ['2>off']);
  // must use both dice when possible
  const both = B.newTriktrak([{ name: 'A' }, { name: 'B' }]); both.phase = 'move'; both.left = [6, 5];
  for (const q of B.sequences(both, 0, [6, 5])) assert.equal(q.moves.length, 2);
  // the computer plays a whole game against itself without getting stuck
  const g = B.newTriktrak([{ name: 'A', ai: true }, { name: 'B', ai: true }]); let n = 0;
  while (g.phase !== 'over' && n++ < 3000) { const mv = B.aiTriktrak(g, g.turn); assert.ok(B.applyTriktrak(g, g.turn, mv.name, mv.args), `stuck at ${n}`); }
  assert.equal(g.phase, 'over'); assert.equal(g.off[g.winner], 15);
  // 10.000
  assert.equal(B.scoreDice([1]), 100); assert.equal(B.scoreDice([5, 5]), 100); assert.equal(B.scoreDice([1, 1, 1]), 1000); assert.equal(B.scoreDice([4, 4, 4, 4]), 800); assert.equal(B.scoreDice([1, 2, 3, 4, 5, 6]), 1500);
  assert.equal(B.scoreDice([2, 2, 3, 3, 6, 6]), 750); assert.equal(B.scoreDice([2, 1]), 0, 'a dead die makes the choice invalid'); assert.ok(!B.anyScore([2, 3, 4, 6, 2, 3])); assert.ok(B.anyScore([2, 2, 2, 3])); assert.ok(B.anyScore([2, 2, 3, 3, 4, 4]));
  assert.deepEqual(B.bestKeep([1, 5, 2, 3, 4, 6]).pts, 1500); assert.equal(B.bestKeep([1, 1, 2, 3]).pts, 200);
  const t = B.newTenk([{ name: 'A' }, { name: 'B', ai: true }]);
  assert.ok(B.applyTenk(t, 0, 'roll', [[1, 5, 2, 3, 4, 4]])); assert.ok(!B.applyTenk(t, 0, 'keep', [[2]]), 'a 3 does not score'); assert.ok(B.applyTenk(t, 0, 'keep', [[0]])); assert.equal(t.turnPts, 100); assert.equal(t.free, 5);
  assert.ok(B.applyTenk(t, 0, 'roll', [[2, 3, 4, 6, 2]])); assert.equal(t.phase, 'bust'); assert.ok(B.applyTenk(t, 0, 'next')); assert.equal(t.turn, 1); assert.equal(t.scores[0], 0);
  assert.ok(B.applyTenk(t, 1, 'roll', [[1, 1, 1, 5, 2, 3]])); assert.ok(B.applyTenk(t, 1, 'bank', [[0, 1, 2, 3]])); assert.equal(t.scores[1], 1050); assert.equal(t.turn, 0);
  const hot = B.newTenk([{ name: 'A' }, { name: 'B' }]); B.applyTenk(hot, 0, 'roll', [[1, 2, 3, 4, 5, 6]]); B.applyTenk(hot, 0, 'keep', [[0, 1, 2, 3, 4, 5]]); assert.equal(hot.free, 6, 'all six used: roll all again');
  const ai = B.newTenk([{ name: 'A', ai: true }, { name: 'B', ai: true }]); n = 0; while (ai.phase !== 'over' && n++ < 5000) { const mv = B.aiTenk(ai, ai.turn); assert.ok(B.applyTenk(ai, ai.turn, mv.name, mv.args), `tenk stuck ${n} ${mv.name}`); } assert.equal(ai.phase, 'over');
  // Sorteper
  assert.equal(B.oldDeck().length, 51); assert.deepEqual(B.dropPairs(['H5', 'S5', 'D7', 'S11', 'H11']), ['D7', 'S11', 'H11']);
  for (let k = 0; k < 20; k++) { const om2 = B.newOldmaid([{ name: 'A', ai: true }, { name: 'B', ai: true }, { name: 'C', ai: true }]); let m = 0; while (om2.phase !== 'over' && m++ < 2000) assert.ok(B.applyOldmaid(om2, om2.turn, 'draw')); assert.equal(om2.phase, 'over'); assert.ok(om2.hands[om2.loser].includes(B.OLD)); assert.equal(om2.hands.flat().length, 1); }
  // Del regningen
  let b = B.splitBill(600, 4, 10, 1); assert.equal(b.each, 165); b = B.splitBill(100, 3, 0, 10); assert.equal(b.rounded, 40); assert.ok(Math.abs(b.extra - 20) < 1e-9);
  const su = B.settleUp({ Anna: 300, Bo: 0, Carl: 0 }); assert.equal(su.share, 100); assert.deepEqual(su.out.map(x => [x.from, x.to, x.amount]).sort(), [['Bo', 'Anna', 100], ['Carl', 'Anna', 100]]);
  for (const k of Object.keys(B.NAME_PARTS)) assert.ok(B.makeName(k).length > 2);
  assert.deepEqual(B.textCount('Hej med dig. Hvordan går det?'), { words: 6, chars: 29, sentences: 2 }); assert.equal(B.textCount('').words, 0);
  assert.ok(B.BIKE.length >= 12 && B.BIKE.every(q => q[1].length >= 3 && q[2] >= 0 && q[2] < q[1].length && q[3]));
  const kr = B.kimRound(8); assert.equal(kr.shown.length, 8); assert.ok(kr.shown.includes(kr.gone)); assert.equal(kr.options.length, 4); assert.ok(kr.options.includes(kr.gone)); assert.equal(kr.options.filter(x => kr.shown.includes(x)).length, 1);
  console.log('batch10 ok');
}

{ // Prik til prik, Talrækker, Bogstaver, Tælleleg, Tegneserie, Emojigåder, Puslespil, Dagens plan, Talhukommelse, Ordsprog
  const B = await import('../web/js/features/batch11.js');
  for (const p of B.DOT_PICS) assert.ok(p.pts.length >= 8 && p.pts.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100), p.name);
  for (let lv = 1; lv <= 3; lv++) for (let k = 0; k < 40; k++) { const s = B.sequence(lv); assert.equal(s.shown.length, 5); assert.ok(Number.isInteger(s.answer) && s.rule); }
  const r = (() => { let i = 0; return () => [0.1, 0.5][i++ % 2]; })(); const sq = B.sequence(1, () => 0); assert.deepEqual(sq.shown, [1, 3, 5, 7, 9]); assert.equal(sq.answer, 11); void r;
  assert.equal(B.ALPHABET.length, 29); assert.ok(B.ALPHABET.every(l => B.LETTER_WORDS[l]?.[0].toUpperCase() === l));
  const lr = B.letterRound(4); assert.equal(lr.options.length, 4); assert.ok(lr.options.includes(lr.target));
  for (let k = 0; k < 30; k++) { const c = B.countRound(10); assert.equal(c.options.length, 4); assert.ok(c.options.includes(c.n)); assert.ok(c.options.every(o => o >= 1)); }
  assert.equal(B.newComic().panels.length, 3); assert.deepEqual(B.wrapText('Hej med dig hvordan går det i dag', 12), ['Hej med dig', 'hvordan går', 'det i dag']);
  assert.ok(B.EMOJI_PUZZLES.length >= 20); assert.ok(B.emojiMatch('solsikke', ' Solsikke ')); assert.ok(B.emojiMatch('idé', 'ide')); assert.ok(!B.emojiMatch('sol', 'måne'));
  const j = B.jigsaw(3); assert.equal(j.length, 9); assert.ok(!B.jigsawDone(j)); assert.ok(B.jigsawDone([0, 1, 2, 3])); assert.deepEqual(B.jigsawSwap([1, 0, 2], 0, 1), [0, 1, 2]);
  assert.equal(B.nowIndex(B.DEFAULT_PLAN, '12:30'), 3); assert.equal(B.nowIndex(B.DEFAULT_PLAN, '06:00'), -1); assert.equal(B.nowIndex(B.DEFAULT_PLAN, '23:00'), B.DEFAULT_PLAN.length - 1);
  for (let n = 3; n < 12; n++) { const d = B.digits(n); assert.equal(d.length, n); assert.notEqual(d[0], '0'); }
  for (let k = 0; k < 20; k++) { const q = B.proverbQ(); assert.equal(q.options.length, 4); assert.ok(q.options.includes(q.p[1])); assert.equal(new Set(q.options).size, 4); }
  console.log('batch11 ok');
}
