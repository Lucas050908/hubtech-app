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
{
  const { seededRandom, makeSudoku, countSolutions } = await import('../web/js/features/gamelogic.js');
  const a = makeSudoku('medium', seededRandom('hubtech-2026-10-22')), b = makeSudoku('medium', seededRandom('hubtech-2026-10-22'));
  assert.deepEqual(a.puzzle, b.puzzle, 'samme dag = samme sudoku');
  assert.notDeepEqual(a.puzzle, makeSudoku('medium', seededRandom('hubtech-2026-10-23')).puzzle);
  assert.equal(countSolutions(a.puzzle), 1);
  console.log('daily ok');
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
  // bots, Elo and ranks
  assert.equal(C.BOTS.length, 16); assert.ok(C.botById('gnist').coach); assert.equal(C.BOTS[0].rating, 100); assert.equal(C.BOTS.at(-1).rating, 2400);
  assert.deepEqual(C.TIERS.map(t => C.BOTS.filter(b => C.tierOf(b.rating).id === t.id).length), [4, 4, 4, 4], 'fire faner med fire bots');
  assert.equal(C.recommendedBot(800).id, 'emil'); assert.equal(C.recommendedBot(2600).id, 'storm'); assert.ok(C.BOTS.every((b, i) => i === 0 || b.rating > C.BOTS[i - 1].rating));
  assert.equal(C.rate(800, 800, 1, 0), 820); assert.equal(C.rate(800, 800, 0, 30), 790); assert.equal(C.rate(1500, 1500, 0.5, 30), 1500);
  assert.ok(C.rate(800, 400, 1, 0) - 800 < C.rate(800, 1300, 1, 0) - 800);        // beating a stronger bot gives more
  assert.equal(C.rankOf(599).name, 'Bonde'); assert.equal(C.rankOf(600).name, 'Springer'); assert.equal(C.rankOf(2500).name, 'Skakmester'); assert.equal(C.rankOf(1250).toNext, 250);
  let rec = C.applyResult(null, 1000, 1, 'Klub-Karl'); assert.equal(rec.games, 1); assert.ok(rec.r > 800 && rec.best === rec.r && rec.w === 1 && rec.hist.length === 1);
  rec = C.applyResult(rec, 400, 0, 'Bo'); assert.equal(rec.l, 1); assert.ok(rec.best >= rec.r);
  // a blundering bot with a forced random move still plays legal moves; every bot finds mate in one when it does not blunder
  for (const b of C.BOTS) { const mv2 = C.bestMove(C.fromFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), b.id, () => 0.99); assert.equal(C.sqName(mv2.to), 'a8', b.id); }
  const rnd = C.bestMove(C.newGame(), 'bo', () => 0.01); assert.ok(C.legalMoves(C.newGame()).some(m => m.from === rnd.from && m.to === rnd.to));
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

// Kalender: gentagelser og hurtig tilføj
{
  const R = await import('../web/js/features/calrecur.js');
  const wed = new Date(2026, 10, 4);   // onsdag 4. november 2026
  const q = (t) => R.parseQuick(t, wed);
  let r = q('Tandlæge i morgen kl 10');
  assert.deepEqual([r.title, r.date, r.start, r.end, r.allDay], ['Tandlæge', '2026-11-05', '10:00', '11:00', false]);
  r = q('Fodbold hver tirsdag 17-18:30 @ Hallen');
  assert.deepEqual([r.title, r.date, r.start, r.end, r.repeat.freq, r.location], ['Fodbold', '2026-11-10', '17:00', '18:30', 'week', 'Hallen']);
  r = q('Mors fødselsdag 12/3 hvert år');
  assert.deepEqual([r.title, r.date, r.allDay, r.repeat.freq], ['Mors fødselsdag', '2027-03-12', true, 'year']);
  r = q('møde på fredag kl. 14.30');
  assert.deepEqual([r.title, r.date, r.start, r.end], ['Møde', '2026-11-06', '14:30', '15:30']);
  r = q('Juleferie 24. december');
  assert.deepEqual([r.title, r.date], ['Juleferie', '2026-12-24']);
  r = q('Service hos Jensen om 2 uger fra 9 til 12');
  assert.deepEqual([r.title, r.date, r.start, r.end], ['Service hos Jensen', '2026-11-18', '09:00', '12:00']);
  r = q('Træning hverdage kl 7');
  assert.deepEqual([r.title, r.repeat.freq, r.start], ['Træning', 'weekday', '07:00']);
  r = q('Indkøb');
  assert.deepEqual([r.title, r.date, r.allDay, r.found.length], ['Indkøb', '2026-11-04', true, 0]);
  r = q('Ring til bank i dag 16:00');
  assert.deepEqual([r.title, r.date, r.start], ['Ring til bank', '2026-11-04', '16:00']);
  // repeating
  const ev = { id: 'a', date: '2026-11-04', repeat: { freq: 'week', skip: ['2026-11-18'], until: '2026-12-31' } };
  assert.ok(R.startsOn(ev, '2026-11-11')); assert.ok(!R.startsOn(ev, '2026-11-12')); assert.ok(!R.startsOn(ev, '2026-11-18')); assert.ok(!R.startsOn(ev, '2027-01-06'));
  assert.equal(R.nextStart(ev, '2026-11-12'), '2026-11-25');
  assert.equal(R.expand([ev], '2026-11-01', '2026-11-30').length, 3);
  const span = { id: 'b', date: '2026-11-06', endDate: '2026-11-08', repeat: { freq: 'week' } };
  assert.equal(R.occurrenceOn(span, '2026-11-15').date, '2026-11-13');
  assert.equal(R.occurrenceOn(span, '2026-11-16'), null);
  const bday = { id: 'c', date: '2024-02-29', repeat: { freq: 'year' } };
  assert.equal(R.nextStart(bday, '2025-01-01'), '2028-02-29');
  const mon = { id: 'd', date: '2026-01-31', repeat: { freq: 'month' } };
  assert.equal(R.nextStart(mon, '2026-02-01'), '2026-03-31');
  assert.ok(R.startsOn({ id: 'e', date: '2026-11-02', repeat: { freq: 'weekday' } }, '2026-11-06')); assert.ok(!R.startsOn({ id: 'e', date: '2026-11-02', repeat: { freq: 'weekday' } }, '2026-11-07'));
  for (const f of ['day', 'weekday', 'week', '2week', 'month', 'year']) assert.equal(R.fromRrule(R.toRrule({ freq: f, until: '2027-01-01' })).freq, f);
  assert.equal(R.fromRrule('FREQ=WEEKLY;UNTIL=20270101T000000Z').until, '2027-01-01');
  console.log('calrecur ok');
}

// Noter: tags, tjeklister, lister der fortsætter
{
  const N = await import('../web/js/features/notetext.js');
  assert.deepEqual(N.tagsOf('Møde #arbejde og #Idéer\n#arbejde igen, ikke#ord'), ['arbejde', 'idéer']);
  const body = 'Indkøb\n[ ] mælk\n- [x] brød\nnoget';
  assert.deepEqual(N.checklist(body).map(c => [c.line, c.done, c.text]), [[1, false, 'mælk'], [2, true, 'brød']]);
  assert.equal(N.toggleLine(body, 1), 'Indkøb\n[x] mælk\n- [x] brød\nnoget');
  assert.equal(N.toggleLine(body, 2), 'Indkøb\n[ ] mælk\n- [ ] brød\nnoget');
  assert.deepEqual(N.continueList('- æg', 4), { insert: '\n- ' });
  assert.deepEqual(N.continueList('[ ] æg', 6), { insert: '\n[ ] ' });
  assert.deepEqual(N.continueList('a\n2. to', 6), { insert: '\n3. ' });
  assert.deepEqual(N.continueList('a\n- ', 4), { clear: [2, 4] });
  assert.equal(N.continueList('bare tekst', 10), null);
  console.log('notetext ok');
}


// Office-dokument: genveje mens man skriver, og find
{
  const T = await import('../web/js/office/doctext.js').catch(e => ({ err: e }));
  if (T.err) { console.log('doctools skipped (needs DOM):', T.err.message.slice(0, 60)); }
  else {
    assert.deepEqual(T.shortcutFor('##'), ['block', 'h2']); assert.deepEqual(T.shortcutFor('1.'), ['ol']); assert.deepEqual(T.shortcutFor('[]'), ['check']); assert.equal(T.shortcutFor('hej'), null);
    assert.deepEqual(T.findAll('Hej hej HEJ', 'hej'), [0, 4, 8]); assert.deepEqual(T.findAll('Hej hej HEJ', 'hej', true), [4]); assert.deepEqual(T.findAll('aaa', 'aa'), [0]); assert.deepEqual(T.findAll('x', ''), []);
    assert.equal(T.keepCase('Æbler', 'pærer'), 'Pærer'); assert.equal(T.keepCase('ÆBLER', 'pærer'), 'PÆRER'); assert.equal(T.keepCase('æbler', 'Pærer'), 'Pærer');
    console.log('doctools ok');
  }
}

// Regneark: fyld serier, flyt formler, indsæt/slet rækker og kolonner
{
  const F = await import('../web/js/office/sheetfill.js');
  assert.equal(F.shiftFormula('=A1+$B$2+B$3*$C4', 1, 2), '=B3+$B$2+C$3*$C6');
  assert.equal(F.shiftFormula('=SUM(A1:A3)&"A1"', 0, 1), '=SUM(A2:A4)&"A1"');
  assert.equal(F.shiftFormula('=LOG10(A1)', 0, 1), '=LOG10(A2)');
  assert.equal(F.shiftFormula('=A1', 0, -1), '=#REF!');
  assert.deepEqual(F.fillSeries(['1', '2'], 3), ['3', '4', '5']);
  assert.deepEqual(F.fillSeries(['5'], 2), ['5', '5']);
  assert.deepEqual(F.fillSeries(['2,5', '3'], 2), ['3,5', '4,0']);
  assert.deepEqual(F.fillSeries(['Mandag'], 3), ['Tirsdag', 'Onsdag', 'Torsdag']);
  assert.deepEqual(F.fillSeries(['november', 'december'], 2), ['januar', 'februar']);
  assert.deepEqual(F.fillSeries(['Uge 44'], 2), ['Uge 45', 'Uge 46']);
  assert.deepEqual(F.fillSeries(['05-11-2026', '12-11-2026'], 2), ['19-11-2026', '26-11-2026']);
  assert.deepEqual(F.fillSeries(['30-12-2026'], 3), ['31-12-2026', '01-01-2027', '02-01-2027']);
  assert.deepEqual(F.fillSeries(['=A1*2'], 2), ['=A2*2', '=A3*2']);
  assert.deepEqual(F.fillSeries(['=A1*2'], 2, { dc: 1, dr: 0 }), ['=B1*2', '=C1*2']);
  assert.deepEqual(F.fillSeries(['ja', 'nej'], 3), ['ja', 'nej', 'ja']);
  // insert a row above row 2: B3's formula follows
  let cells = { A1: { v: '1' }, A2: { v: '2' }, A3: { v: '3' }, B1: { v: '=SUM(A1:A3)' }, B3: { v: '=A2+A3' } };
  let r = F.shiftCells(cells, 'row', 1, 1);
  assert.deepEqual(Object.keys(r).sort(), ['A1', 'A3', 'A4', 'B1', 'B4']);
  assert.equal(r.B1.v, '=SUM(A1:A4)'); assert.equal(r.B4.v, '=A3+A4');
  // delete row 2: the range shrinks, a direct reference breaks
  r = F.shiftCells(cells, 'row', 1, -1);
  assert.equal(r.B1.v, '=SUM(A1:A2)'); assert.equal(r.B2.v, '=#REF!+A2'); assert.equal(r.A2.v, '3');
  // columns
  r = F.shiftCells({ A1: { v: '1' }, B1: { v: '2' }, C1: { v: '=A1+B1' } }, 'col', 1, 1);
  assert.deepEqual(Object.keys(r).sort(), ['A1', 'C1', 'D1']); assert.equal(r.D1.v, '=A1+C1');
  r = F.shiftCells({ A1: { v: '1' }, B1: { v: '2' }, C1: { v: '=SUM(A1:B1)' } }, 'col', 0, -1);
  assert.equal(r.B1.v, '=SUM(A1:A1)');
  console.log('sheetfill ok');
}

{
  const { MAKER_COURSES, MAKER_GROUPS } = await import('../web/js/data/makercourses.js');
  const ids = new Set();
  const groups = new Set(MAKER_GROUPS.map(g => g[0]));
  for (const c of MAKER_COURSES) {
    assert.ok(/^[a-z0-9-]{2,30}$/.test(c.id) && !ids.has(c.id), c.id); ids.add(c.id);
    assert.equal(c.stateId, `course-${c.id}`);
    assert.ok(groups.has(c.group) && c.hue && c.title && c.short && c.intro && c.days.length >= 3, c.id);
    for (const d of c.days) {
      assert.ok(d.t && d.g && d.l.length >= 3 && d.d.length >= 2 && d.q.length >= 1, `${c.id}: ${d.t}`);
      for (const [label, url] of d.r) assert.ok(label && /^(https:\/\/|#\/)/.test(url), `${c.id}: ${url}`);
      for (const q of d.q) assert.ok(q.length === 2 && q[0].length > 8 && q[1].length > 2, `${c.id}: ${q[0]}`);
    }
  }
  for (const want of ['lasertyper', 'lightburn', 'xcs', 'falcon', 'bambu', 'creality', 'halot-box', 'canvasworkspace', 'scal', 'versaworks', 'rolandconnect', 'service-maskiner']) assert.ok(ids.has(want), want);
  console.log('makercourses ok');
}

{
  const { APP_COURSES, APP_GROUPS, htmlToPoints } = await import('../web/js/data/appcourses.js');
  const groups = new Set(APP_GROUPS.map(g => g[0]));
  const ids = new Set();
  for (const c of APP_COURSES) {
    assert.ok(!ids.has(c.id), c.id); ids.add(c.id);
    assert.ok(groups.has(c.group) && c.hue && c.days.length >= 2, c.id);
    for (const d of c.days) assert.ok(d.t && d.g && d.l.length && d.d.length && d.q.length && d.r.length, `${c.id}: ${d.t}`);
  }
  for (const want of ['netvaerk', 'printer-support', 'windows-support', 'hubtech', 'it-ordbog', 'it-viden', 'phishing', 'kommandoer', 'elektronik', 'digitale-grundfaerdigheder', 'kode-python', 'kode-arduino']) assert.ok(ids.has(want), want);
  assert.deepEqual(htmlToPoints('<p>Hej <b>du</b></p><ul><li>a &lt; b</li><li>to</li></ul>'), ['Hej du', 'a < b', 'to']);
  const { MAKER_COURSES } = await import('../web/js/data/makercourses.js');
  for (const c of MAKER_COURSES) assert.ok(!ids.has(c.id), 'dobbelt id ' + c.id);
  console.log('appcourses ok');
}

{
  const L = await import('../web/js/features/labs.js');
  assert.equal(L.laserRun('co2_40', 'ply3', { mode: 'cut', power: 100, speed: 10 }).level, 'cut');
  assert.equal(L.laserRun('diode10', 'acrClear', { mode: 'cut', power: 100, speed: 1 }).level, 'none');      // blue light goes through clear acrylic
  assert.equal(L.laserRun('co2_80', 'pvc', {}).level, 'banned');
  assert.equal(L.laserRun('co2_40', 'steel', { mode: 'engrave', power: 100, speed: 5 }).level, 'none');      // CO2 reflects off bare metal
  assert.equal(L.laserRun('fiber30', 'steel', { mode: 'engrave', power: 50, speed: 100 }).level, 'mark');
  assert.ok(['partial', 'score'].includes(L.laserRun('diode10', 'ply6', { mode: 'cut', power: 100, speed: 4 }).level));
  assert.equal(L.laserGrid('co2_40', 'ply3', 'cut').length, 5);
  // network: every fault gives the tell-tale answer
  const S = (f) => L.netScenario(Math.random, f);
  assert.ok(L.netCommand(S('cable'), 'ipconfig').join(' ').includes('Medie afbrudt'));
  assert.ok(L.netCommand(S('dhcp'), 'ipconfig').join(' ').includes('169.254.'));
  let s = S('dns'); assert.ok(L.netCommand(s, 'ping 8.8.8.8').join(' ').includes('Modtaget = 4')); assert.ok(L.netCommand(s, 'ping google.com')[0].includes('kunne ikke finde'));
  s = S('gateway'); assert.ok(L.netCommand(s, 'ping 192.168.1.254').join(' ').includes('Modtaget = 0')); assert.ok(L.netCommand(s, 'ping 192.168.1.1').join(' ').includes('Modtaget = 4'));
  s = S('isp'); assert.ok(L.netCommand(s, 'ping 192.168.1.1').join(' ').includes('Modtaget = 4')); assert.ok(L.netCommand(s, 'ping 8.8.8.8').join(' ').includes('Modtaget = 0'));
  s = S('ok'); for (const c of ['ping 192.168.1.1', 'ping 8.8.8.8', 'ping google.com']) assert.ok(L.netCommand(s, c).join(' ').includes('Modtaget = 4'), c);
  assert.ok(L.netCommand(s, 'dir')[0].includes('genkendes ikke'));
  // cases and 3D print
  for (const c of L.CASES) assert.ok(c.options[c.a] && c.tests.length >= 3 && c.why, c.id);
  assert.equal(L.caseScore(true, 2), 100); assert.equal(L.caseScore(true, 4), 80); assert.equal(L.caseScore(false, 1), 0);
  const a = L.printEstimate({ layer: 0.28, supports: true }), b = L.printEstimate({ layer: 0.12, supports: true });
  assert.ok(a.minutes < b.minutes && a.quality < b.quality && !a.warnings.length);
  assert.ok(L.printEstimate({ walls: 5, supports: true }).strength > L.printEstimate({ walls: 2, supports: true }).strength);
  assert.ok(L.printEstimate({ filament: 'tpu', speed: 150, temp: 225, supports: true }).warnings.length >= 2);
  console.log('labs ok');
}

{
  const E = await import('../web/js/features/electro.js');
  let r = E.solveCircuit({ v: 9, rs: [330], led: 'red', closed: true });
  assert.ok(Math.abs(r.i - 0.0212) < 0.0005 && r.ledState === 'on');
  assert.equal(E.solveCircuit({ v: 9, rs: [], led: 'red' }).ledState, 'burnt');
  assert.equal(E.solveCircuit({ v: 9, rs: [330], led: 'red', closed: false }).i, 0);
  assert.equal(E.solveCircuit({ v: 2, rs: [100], led: 'blue' }).ledState, 'off');                   // below the forward voltage
  r = E.solveCircuit({ v: 12, rs: [100, 100], mode: 'parallel' }); assert.equal(r.req, 50); assert.ok(Math.abs(r.parts[0].i - 0.12) < 1e-9 && r.parts[0].hot);
  r = E.solveCircuit({ v: 12, rs: [100, 220, 330], mode: 'mixed' }); assert.ok(Math.abs(r.req - (100 + 132)) < 1e-9 && Math.abs(r.parts[1].v - r.parts[2].v) < 1e-9);
  for (const k of E.PROBLEM_KINDS) for (let n = 0; n < 20; n++) { const p = E.makeProblem(k); assert.ok(Number.isFinite(p.answer) && p.answer > 0 && E.checkAnswer(p, String(p.answer).replace('.', ',')) && !E.checkAnswer(p, String(p.answer * 1.2)), k); }
  assert.deepEqual(['46,8 mA', '1.150 Ω', '0.468', '1.150,5'].map(E.parseAnswer), [46.8, 1150, 0.468, 1150.5]);
  assert.equal(E.fmt(0.0468, 'A'), '46,8 mA'); assert.equal(E.fmt(4700, 'Ω'), '4,7 kΩ');
  for (const f of E.FAULTS) assert.ok(f.options[f.a] && f.points.length >= 3 && f.why, f.id);
  assert.equal(E.levelOf(0).level, 1); assert.equal(E.levelOf(600).name, 'Kredsløbsbygger');
  const st = { stats: { sims: 1, right: 10 }, achievements: [] };
  assert.deepEqual(E.awardBadges(st).map(b => b.id), ['first-circuit', 'calc10']); assert.equal(E.awardBadges(st).length, 0);
  const d = { stats: {} }; E.touchDay(d, '2026-11-04'); E.touchDay(d, '2026-11-05'); E.touchDay(d, '2026-11-05'); assert.equal(d.stats.streakDays, 2);
  E.touchDay(d, '2026-11-08'); assert.equal(d.stats.streakDays, 1);
  console.log('electro ok');
}

// Widgets i topbaren: streak-tælling og standardvalg
{
  const W = await import('../web/js/features/widgetlogic.js');
  const now = new Date(2026, 10, 5, 12), day = (n, h = 10) => new Date(2026, 10, 5 - n, h).getTime() / 1000;
  assert.equal(W.dayStreak([day(0), day(1), day(1, 20), day(2), day(4)], now), 3, 'tre dage i træk');
  assert.equal(W.dayStreak([day(1), day(2)], now), 2, 'i går tæller stadig, når man ikke har været her i dag');
  assert.equal(W.dayStreak([day(2)], now), 0);
  assert.equal(W.winStreak([{ d: 8 }, { d: -5 }, { d: 6 }, { d: 3 }]), 2);
  assert.equal(W.winStreak([]), 0);
  assert.deepEqual(W.HOME_CARDS.filter(([k]) => W.WIDGET_DEFAULTS.home[k]).map(([k]) => k), ['clock', 'stats', 'today', 'resume'], 'ørken-designets kort er slået til');
  assert.deepEqual(['weather', 'streak', 'online', 'music'].map(k => W.WIDGET_DEFAULTS[k]), [false, true, true, true]);
  const t9 = new Date(2026, 10, 5, 9).getTime();
  const S = W.buildStats({ tasks: { tasks: [{ status: 'todo', due: '2026-11-05' }, { status: 'todo', due: '2026-11-01' }, { status: 'done' }] },
    calendar: { events: [{ title: 'Morgenmøde', date: '2026-11-05', start: '08:00' }, { title: 'Tandlæge', date: '2026-11-05', start: '10:00' }] },
    timesheet: { entries: [{ start: new Date(2026, 10, 3, 8).getTime(), end: new Date(2026, 10, 3, 10, 30).getTime() }, { start: new Date(2026, 10, 1, 8).getTime(), end: new Date(2026, 10, 1, 9).getTime() }] },
    summary: { level: 4, xp: 3420, levelXp: 420, levelSize: 1000 } }, t9);
  assert.deepEqual([S.cases.value, S.cases.sub, S.cases.warn], ['2', '1 overskredet', true]);
  assert.deepEqual([S.appt.value, S.appt.sub], ['10:00', 'Tandlæge'], 'næste aftale er den efter nu');
  assert.equal(S.hours.value, '2,5', 'kun denne uge (mandag–) tæller');
  assert.deepEqual([S.level.label, S.level.value, S.level.sub, S.level.pct], ['Level 4', '3.420 XP', '580 XP til level 5', 42], 'level-kortet siger XP og hvor langt der er');
  assert.equal(W.buildStats({ calendar: { events: [{ title: 'Fodbold', date: '2026-11-06', start: '17:00' }] } }, t9).appt.sub, 'I morgen · Fodbold');
  assert.equal(W.greeting('Lucas', [{ kind: 'event' }, { kind: 'event' }, { kind: 'task' }], new Date(2026, 10, 5, 8)), 'God morgen, Lucas – 2 aftaler og 1 deadline i dag');
  assert.equal(W.greeting('Lucas', [], new Date(2026, 10, 5, 20)), 'God aften, Lucas – ingen aftaler i dag');
  assert.equal(W.LOOK_VERSION, 2);
  console.log('widgets ok');
}

// AI-assistenten: Qwen 3 uden "tænkning" i svaret, og viden fra HUBTECHs guides og kurser
{
  const M = await import('../web/js/ai/models.js');
  assert.equal(M.stripThink('<think>\n\n</think>\n\nHej Lucas'), 'Hej Lucas');
  assert.equal(M.stripThink('<think>regner lidt'), '', 'tænkning, der stadig skrives, vises ikke');
  assert.equal(M.pickFor(2 * 1073741824).model.id, 'qwen3_17', '2 GB: Qwen 3 1,7B');
  assert.equal(M.pickFor(4 * 1073741824).model.id, 'qwen3_4', '4 GB: Qwen 3 4B');
  assert.ok(M.MODELS.filter(m => m.think).every(m => /\.gguf$/.test(m.file) && m.repo.includes('/')));
  Object.assign(globalThis, { addEventListener: globalThis.addEventListener || (() => {}), localStorage: globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} } });
  globalThis.document ||= { documentElement: { dataset: {} }, addEventListener() {}, visibilityState: 'visible' };
  globalThis.location ||= { hash: '', origin: 'http://localhost' };
  globalThis.matchMedia ||= () => ({ matches: false, addEventListener() {} });
  const K = await import('../web/js/ai/knowledge.js');
  const lib = await K.libraryItems();
  assert.ok(lib.length > 150 && lib.every(x => x.href.startsWith('#/')), 'alle guides, lektioner, apps og ord, med link');
  const r = K.retrieve(lib, 'hvordan finder jeg fokus på en CO2 laser', 4000);
  assert.ok(r.sources.length && r.sources.some(s => /laser/i.test(s.title)), r.sources.map(s => s.title));
  assert.ok(K.retrieve(lib, 'printeren er offline', 4000).sources.some(s => /printer/i.test(s.title)));
  assert.equal(K.retrieve(lib, 'hvad skal jeg nå i dag', 4000).sources.length, 0, 'guides fylder ikke, når de ikke passer');
  assert.ok(K.systemPrompt({ mode: 'normal', facts: [] }).includes('guides og kurser'));
  console.log('ai ok');
}

// AI: svar i punkter og Linux-terminalens taster
{
  const A = await import('../web/js/ai/actions.js');
  const b = A.answerBlocks('Kort svar.\n\n## Trin\n1. Tænd\n2. Sluk\n   og vent\n- **Vigtigt** ok\n- b');
  assert.deepEqual(b.map(x => x.type), ['p', 'h', 'ol', 'ul']);
  assert.deepEqual(b[2].items, ['Tænd', 'Sluk og vent']);
  const K = await import('../web/js/ai/knowledge.js');
  assert.ok(K.systemPrompt({ mode: 'normal', facts: [] }).includes('korte punkter'), 'punkter er standard');
  assert.ok(!K.systemPrompt({ mode: 'normal', facts: [], style: 'text' }).includes('korte punkter'));
  const T = await import('../web/js/features/termkeys.js');
  assert.equal(T.ctrl('c'), '\x03'); assert.equal(T.ctrl('D'), '\x04'); assert.equal(T.ctrl('['), '\x1b');
  assert.equal(T.keySeq('up'), '\x1b[A'); assert.equal(T.keySeq('c', { ctrl: true }), '\x03'); assert.equal(T.keySeq('x', { alt: true }), '\x1bx');
  assert.ok(T.EXTRA_KEYS.length === 14 && T.TRY.every(([c, d]) => c && d));
  console.log('ai-punkter og terminal ok');
}

// AI: systemprompten er den samme fra spørgsmål til spørgsmål (motoren genbruger den), dato og uddrag følger spørgsmålet
{
  const K = await import('../web/js/ai/knowledge.js');
  const a = K.systemPrompt({ mode: 'normal', facts: null, userName: 'Lucas' }), b = K.systemPrompt({ mode: 'normal', facts: null, userName: 'Lucas' });
  assert.equal(a, b); assert.ok(!/klokken er \d/.test(a), 'intet klokkeslæt i den faste prompt');
  const q = K.questionBlock('Hvad nu?', ['- [Note] Indkøb: mælk'], { page: 'Noter' });
  assert.ok(q.endsWith('Hvad nu?') && q.includes('Indkøb: mælk') && q.includes('siden: Noter') && /kl\. \d\d:\d\d/.test(q));
  assert.ok(K.questionBlock('x', []).includes('Ingen af brugerens data'));
  console.log('ai-cache ok');
}

// Dock og Gnist-tip
{
  const W = await import('../web/js/features/widgetlogic.js');
  assert.deepEqual(W.dockIds({}), W.DOCK_DEFAULT, 'standard-dock');
  assert.ok(W.DOCK_DEFAULT.includes('gnist') && W.DOCK_DEFAULT.at(-1) === 'apps');
  assert.deepEqual(W.dockIds({ dock: ['home', 'tasks', 'tasks', 'linux', 'apps'], dockCount: 3 }), ['home', 'tasks', 'linux'], 'antal og ingen dubletter');
  assert.equal(W.dockIds({ dockCount: 1 }).length, W.DOCK_MIN); assert.equal(W.dockIds({ dock: Array.from({ length: 20 }, (_, i) => 'a' + i), dockCount: 99 }).length, W.DOCK_MAX);
  assert.equal(W.gnistTip(new Date(2026, 10, 5, 8)), W.gnistTip(new Date(2026, 10, 5, 22)), 'samme tip hele dagen');
  assert.notEqual(W.gnistTip(new Date(2026, 10, 5)), W.gnistTip(new Date(2026, 10, 6)));
  console.log('dock og tip ok');
}

// Gnist runde 2: synonymer og siden man står på
{
  const K = await import('../web/js/ai/knowledge.js');
  assert.ok(K.expandWords(['skriver']).includes('printer') && K.expandWords(['wifi']).includes('netværk'));
  const lib = await K.libraryItems();
  const r = K.retrieve(lib, 'min skriver vil ikke udskrive', 4000);
  assert.ok(r.sources.some(s => /printer/i.test(s.title)), 'hverdagsord finder printer-guiden: ' + r.sources.map(s => s.title));
  const lesson = lib.find(x => x.kind === 'lesson' && /lightburn/i.test(x.title));
  const r2 = K.retrieve(lib, 'hvad betyder det her', 4000, { page: lesson.href });
  assert.equal(r2.sources[0]?.href, lesson.href, 'lektionen man står i kommer først');
  assert.ok(K.systemPrompt({ mode: 'normal', facts: null }).includes('Eksempel på et godt svar'));
  console.log('gnist runde 2 ok');
}

// Gnist som modstander i spillene
{
  const G = await import('../web/js/features/gnistplay.js');
  assert.equal(G.botName(1), 'Gnist'); assert.equal(G.botName(3), 'Gnist 3');
  const ps = G.renameBots([{ name: 'Lucas', ai: false }, { name: 'Computer 1', ai: true }, { name: 'Computer 2', ai: true }, { name: 'Bob', ai: true }]);
  assert.deepEqual(ps.map(p => p.name), ['Lucas', 'Gnist', 'Gnist 2', 'Bob'], 'gamle navne bliver til Gnist, egne navne bliver');
  const s = { players: [{ name: 'Lucas', ai: false }, { name: 'Gnist', ai: true }], turn: 1, phase: 'roll', log: ['x'] };
  assert.equal(G.gnistSays(s).mood, 'think');
  assert.equal(G.gnistSays(s).text, G.gnistSays(s).text, 'samme stilling – samme replik');
  assert.ok(G.LINES.you.includes(G.gnistSays({ ...s, turn: 0 }).text));
  assert.ok(G.LINES.won.includes(G.gnistSays({ ...s, phase: 'over', winner: 1 }).text));
  assert.ok(G.LINES.lost.includes(G.gnistSays({ ...s, phase: 'over', winner: 0 }).text));
  assert.equal(G.gnistSays({ players: [{ name: 'A' }, { name: 'B' }], turn: 0 }), null, 'ingen Gnist, når kun mennesker spiller');
  console.log('gnist som modstander ok');
}

// Gnist lærer dig skak
{
  const C = await import('../web/js/features/chess.js');
  const K = await import('../web/js/features/chesscoach.js');
  const step = (s, a, b) => { const before = JSON.parse(JSON.stringify(s)); C.play(s, C.sqIndex(a), C.sqIndex(b)); return K.explainMove(before, s, 'w'); };
  let s = C.newGame();
  assert.match(step(s, 'e2', 'e4').text, /midten/);
  C.play(s, C.sqIndex('e7'), C.sqIndex('e5'));
  assert.match(K.explainReply(s, 'w').text, /bonden til e5/);
  C.play(s, C.sqIndex('g1'), C.sqIndex('f3')); C.play(s, C.sqIndex('b8'), C.sqIndex('c6'));
  const bad = step(s, 'f1', 'a6');
  assert.equal(bad.kind, 'warn'); assert.match(bad.text, /løberen på a6/);
  assert.match(K.hintWhy(C.fromFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), { from: C.sqIndex('a1'), to: C.sqIndex('a8') }), /skakmat/);
  assert.match(K.hintWhy(C.fromFEN('rnbqkbnr/ppp2ppp/8/3pp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3'), { from: C.sqIndex('e4'), to: C.sqIndex('d5') }), /Slå bonden på d5/);
  const counts = Object.fromEntries(K.LESSONS.map(l => [l.t, K.lessonTargets(l).length]));
  assert.deepEqual([counts['Tårnet'], counts['Løberen'], counts['Springeren'], counts['Bonden']], [14, 13, 8, 3]);
  console.log('gnist skaktræner ok');
}

// Gnist på små modeller: en kort prompt uden eksempelsvar
{
  const K = await import('../web/js/ai/knowledge.js');
  const full = K.systemPrompt({ mode: 'normal', facts: null }), small = K.systemPrompt({ mode: 'normal', facts: null, compact: true });
  assert.ok(!small.includes('Eksempel på et godt svar') && small.length < full.length - 200 && small.includes('Gnist'));
  console.log('kort prompt ok');
}

// Gnists brief på Hjem
{
  const W = await import('../web/js/features/widgetlogic.js');
  const at = new Date(2026, 10, 6, 7, 45);
  assert.equal(W.gnistBrief([], at), null, 'ingenting i dag – så vises et tip');
  assert.equal(W.gnistBrief([{ kind: 'overdue', title: 'Ring til Jensen' }, { kind: 'overdue', title: 'Faktura' }, { kind: 'event', time: '08:00', title: 'Morgenmøde' }], at),
    'Start med «Ring til Jensen» – den er overskredet (og 1 mere). Næste aftale: «Morgenmøde» kl. 08:00 – om 15 min.');
  assert.equal(W.gnistBrief([{ kind: 'event', time: '07:00', title: 'Tidligt' }, { kind: 'task', time: '', title: 'Aflever rapport' }], at), '«Aflever rapport» har deadline i dag.');
  assert.equal(W.gnistBrief([{ kind: 'event', time: '07:00', title: 'Tidligt' }], at), 'Dagens aftaler er overstået – godt klaret!');
  console.log('gnist brief ok');
}


// Gnist forklarer i Dam
{
  const D = await import('../web/js/features/checkers.js');
  const s = D.newGame([{ name: 'A' }, { name: 'B', ai: true }]);
  const a = D.advice(s, 0);
  assert.ok(a && /^Flyt fra [a-h][1-8] til [a-h][1-8]/.test(a.text), a?.text);
  const b = Array(64).fill(0); b[5 * 8 + 2] = 1; b[4 * 8 + 3] = -1; b[0 * 8 + 1] = -1;   // white c3, black d4: white must take
  const t = { ...s, board: b, turn: 0 };
  assert.match(D.advice(t, 0).text, /Du skal slå/);
  assert.equal(D.advice({ ...t, turn: 1 }, 0), null, 'ikke din tur – intet råd');
  console.log('gnist dam ok');
}

// Gnist ved mere: apps, IT-ordbog, kommandoer, Kodeskolen og servicetekniker-kurset
{
  const K = await import('../web/js/ai/knowledge.js');
  const lib = await K.libraryItems();
  const kinds = new Set(lib.map(x => x.kind));
  for (const k of ['guide', 'lesson', 'app', 'term', 'command']) assert.ok(kinds.has(k), 'Gnist kender ' + k);
  const r1 = K.retrieve(lib, 'hvad er DHCP', 4000);
  assert.ok(r1.sources.some(s => s.title === 'DHCP' || /DHCP/.test(s.title)), 'ordbogen: ' + r1.sources.map(s => s.title));
  const r2 = K.retrieve(lib, 'hvordan ser jeg min ip adresse ipconfig', 4000);
  assert.ok(r2.sources.some(s => /Kommandoer/.test(s.title)), 'kommandoer: ' + r2.sources.map(s => s.title));
  const r3 = K.retrieve(lib, 'hvor kan jeg spille skak', 4000);
  assert.ok(r3.sources.some(s => s.href === '#/apps/chess'), 'apps: ' + r3.sources.map(s => s.title));
  assert.ok(lib.some(x => x.href?.startsWith('#/learn/codeschool/')), 'Kodeskolens lektioner er med');
  console.log('gnist viden ok: ' + lib.length + ' emner');
}

// Gnist ved endnu mere: printerlægen, fejlfindingscases, quiz, grundstoffer og historie
{
  const K = await import('../web/js/ai/knowledge.js');
  const lib = await K.libraryItems();
  const kinds = new Set(lib.map(x => x.kind));
  for (const k of ['fix', 'case', 'quiz']) assert.ok(kinds.has(k), 'Gnist kender ' + k);
  assert.ok(K.retrieve(lib, 'printeren siger papirstop hvad gør jeg', 4000).sources.some(s => s.href === '#/apps/printerdoctor'), 'printerlægen');
  assert.ok(K.retrieve(lib, 'co2 laseren skærer ikke igennem længere', 4000).sources.some(s => s.href === '#/learn/labs'), 'fejlfindingscases');
  assert.ok(lib.length > 450, 'mange emner: ' + lib.length);
  console.log('gnist mere viden ok: ' + lib.length + ' emner');
}

// Gnist regner præcist: tal, procent, moms, datoer og enheder
{
  const T = await import('../web/js/ai/tools.js');
  const now = new Date(2026, 10, 6, 8, 20);
  assert.deepEqual(T.quickFacts('hvad er 15 % af 2.400', now), ['15 % af 2.400 = 360']);
  assert.match(T.quickFacts('hvad er 1000 kr med moms', now)[0], /1\.250 kr\./);
  assert.match(T.quickFacts('1250 kr inkl. moms', now)[0], /1\.000 kr\. uden moms/);
  assert.deepEqual(T.quickFacts('regn 12*(3+4)/2 ud', now), ['12*(3+4)/2 = 42']);
  assert.deepEqual(T.quickFacts('hvad er 2,5 x 4', now), ['2,5 x 4 = 10']);
  assert.match(T.quickFacts('hvor mange dage er der til jul', now)[0], /48 dage til juleaften/);
  assert.match(T.quickFacts('hvilken ugedag er 24. december 2026', now)[0], /^torsdag/);
  assert.match(T.quickFacts('hvilken uge er det', now)[0], /uge 45/);
  assert.deepEqual(T.quickFacts('hvor mange cm er 12 tommer', now), ['12 tommer = 30,48 cm']);
  assert.deepEqual(T.quickFacts('30 c til f', now), ['30 °C = 86 °F']);
  assert.deepEqual(T.quickFacts('møde 24-12 kl 10', now), [], 'en dato er ikke et regnestykke');
  assert.deepEqual(T.quickFacts('printeren er offline', now), []);
  assert.equal(T.num('2.400'), 2400); assert.equal(T.num('2,5'), 2.5); assert.equal(T.num('1.5'), 1.5);
  const K = await import('../web/js/ai/knowledge.js');
  assert.ok(K.questionBlock('hvad er 2+2', [], { computed: ['2+2 = 4'] }).includes('- 2+2 = 4'));
  console.log('gnist regner ok');
}

// Gnist forstår stavefejl
{
  const K = await import('../web/js/ai/knowledge.js');
  assert.equal(K.editDistance('pritner', 'printer'), 1, 'to bogstaver byttet om er én fejl');
  assert.equal(K.editDistance('netvrk', 'netværk'), 1);
  assert.ok(K.editDistance('kat', 'printer') > 2);
  const lib = await K.libraryItems();
  const fx = K.fixTypos(['pritner', 'netvaerk', 'printer'], lib);
  assert.equal(fx.get('pritner'), 'printer'); assert.equal(fx.get('netvaerk'), 'netværk'); assert.ok(!fx.has('printer'), 'rigtige ord rører den ikke');
  assert.ok(K.retrieve(lib, 'min pritner er ofline', 4000).sources.some(s => /printer/i.test(s.title)), 'stavefejl finder stadig printer-guiden');
  assert.ok(K.retrieve(lib, 'hvad er dhpc', 4000).sources.some(s => /DHCP/.test(s.title)), 'dhpc → DHCP');
  assert.ok(K.systemPrompt({ mode: 'normal', facts: null }).includes('stavefejl'));
  console.log('gnist stavefejl ok');
}

// siden man står på: lektionen kommer først, men appen man er i skubber kun lidt
{
  const K = await import('../web/js/ai/knowledge.js');
  const lib = await K.libraryItems();
  const r = K.retrieve(lib, 'Min printer er offline – hvad gør jeg?', 1300, { page: '#/apps/notes' });
  assert.ok(/rinter/.test(r.sources[0]?.title || ''), 'på Noter finder printer-spørgsmålet stadig printer-hjælpen: ' + r.sources.map(s => s.title));
  console.log('side-boost ok');
}

// Gnist husker dig
{
  const M = await import('../web/js/ai/memory.js');
  assert.deepEqual(M.parseMemoryCommand('Husk at jeg arbejder med lasere.'), { type: 'remember', text: 'jeg arbejder med lasere' });
  assert.deepEqual(M.parseMemoryCommand('hvad husker du om mig?'), { type: 'list' });
  assert.deepEqual(M.parseMemoryCommand('Glem alt'), { type: 'forgetAll' });
  assert.equal(M.parseMemoryCommand('glem at jeg arbejder med lasere').type, 'forget');
  assert.equal(M.parseMemoryCommand('Min printer er offline'), null, 'almindelige spørgsmål er ikke kommandoer');
  let r = M.applyMemory([], M.parseMemoryCommand('Husk at jeg arbejder med lasere'));
  assert.equal(r.list[0].text, 'Jeg arbejder med lasere'); assert.match(r.reply, /husker jeg nu/);
  r = M.applyMemory(r.list, M.parseMemoryCommand('husk at min printer er en Brother'));
  assert.equal(r.list.length, 2);
  assert.match(M.applyMemory(r.list, { type: 'list' }).reply, /Brother/);
  r = M.applyMemory(r.list, M.parseMemoryCommand('glem at min printer er en Brother'));
  assert.deepEqual(r.list.map(x => x.text), ['Jeg arbejder med lasere']);
  assert.match(M.memoryBlock(r.list), /lasere/);
  const K = await import('../web/js/ai/knowledge.js');
  assert.ok(K.systemPrompt({ mode: 'normal', facts: null, memory: M.memoryBlock(r.list) }).includes('lasere'));
  assert.ok(!K.systemPrompt({ mode: 'tutor', facts: [], memory: 'XYZ' }).includes('XYZ'), 'kun i almindelig samtale');
  console.log('gnist husker ok');
}

// Gnist laver grafer
{
  const C = await import('../web/js/ai/charts.js');
  const c = C.parseChart('type: søjle\ntitel: Timer pr. dag\nMandag: 4\nTirsdag: 6,5\n- Onsdag: 3 timer');
  assert.deepEqual([c.type, c.title, c.data.map(d => d.value)], ['bar', 'Timer pr. dag', [4, 6.5, 3]]);
  assert.equal(C.parseChart('titel: x\nkun: 1'), null, 'mindst to tal');
  assert.deepEqual(C.chartFromText('lav en graf over jan 5, feb 8 og mar 3').data.map(d => d.label), ['jan', 'feb', 'mar']);
  assert.equal(C.chartFromText('lav et cirkeldiagram: husleje 6000, mad 3000, transport 1200').type, 'pie');
  assert.equal(C.chartFromText('hvad er en graf'), null);
  assert.equal(C.chartFromText('printeren er offline'), null);
  for (const t of ['bar', 'line', 'pie']) { const svg = C.chartSvg({ ...c, type: t }); assert.ok(svg.startsWith('<svg') && svg.includes('Timer pr. dag')); }
  assert.ok(!C.chartSvg({ type: 'bar', title: '<script>', data: [{ label: '<b>', value: 1 }, { label: 'x', value: 2 }] }).includes('<script>'), 'tekst escapes');
  const K = await import('../web/js/ai/knowledge.js');
  assert.ok(K.systemPrompt({ mode: 'normal', facts: null }).includes('```graf'));
  console.log('gnist grafer ok');
}

// Gnist læser en CSV-fil og laver en graf
{
  const C = await import('../web/js/ai/charts.js');
  const c = C.chartFromCsv('Måned;Salg;Kunder\nJan;120;4\nFeb;180;6\nMar;150;5', 'salg.csv');
  assert.deepEqual([c.type, c.title, c.data.map(d => d.value)], ['line', 'Salg (salg.csv)', [120, 180, 150]]);
  assert.equal(C.chartFromCsv('Vare,Antal\nSkruer,40\nMøtrikker,25\nSkiver,60').type, 'bar');
  assert.equal(C.chartFromCsv('bare noget tekst\nuden tal\nher'), null);
  console.log('csv-graf ok');
}

// bedre svar: forslag til siden, stop gentagelser, ryd op
{
  const Q = await import('../web/js/ai/quality.js');
  assert.match(Q.pageSuggestions('#/apps/chess')[0], /springeren/);
  assert.match(Q.pageSuggestions('#/learn/labs')[0], /laseren/, 'labs før det generelle læringsforslag');
  assert.equal(Q.pageSuggestions('#/').length, 5);
  assert.ok(Q.isLooping('Svaret er her. ' + 'Tjek kablet. '.repeat(8)));
  assert.ok(Q.isLooping('Start\n' + 'Genstart printeren og prøv igen.\n'.repeat(3)));
  assert.ok(!Q.isLooping('1. Tjek kablet.\n2. Genstart routeren.\n3. Prøv igen om lidt, og ring hvis det ikke virker.'));
  assert.equal(Q.tidyAnswer('Hej\nHej\nTjek kablet og strømmen.\nAndet\nTjek kablet og strømmen.'), 'Hej\nTjek kablet og strømmen.\nAndet');
  assert.equal(Q.tidyAnswer('```graf\na: 1\na: 1\n```'), '```graf\na: 1\na: 1\n```', 'kode og grafer røres ikke');
  console.log('bedre svar ok');
}

// Gnist kender klokken i hele verden og ser siden
{
  const T = await import('../web/js/ai/tools.js');
  const now = new Date(Date.UTC(2026, 10, 6, 8, 0));   // 09:00 i København (vintertid)
  const f = T.quickFacts('hvad er klokken i tokyo', now)[0];
  assert.match(f, /Tokyo er nu .*17[.:]00/, f);
  assert.match(T.quickFacts('hvad er klokken i new york', now)[0], /New York er nu .*03[.:]00/);
  assert.deepEqual(T.quickFacts('min printer er offline', now), []);
  const K = await import('../web/js/ai/knowledge.js');
  assert.ok(K.asksAboutPage('kan du forklare det her?') && K.asksAboutPage('opsummer siden') && !K.asksAboutPage('hvad skal jeg nå i dag'));
  console.log('verdensur og siden ok');
}

// Gnist kan hjælpe med HUBTECH og hverdagens IT-problemer
{
  const K = await import('../web/js/ai/knowledge.js');
  const lib = await K.libraryItems();
  const H = (await import('../web/js/data/helpfaq.js')).HELP;
  assert.ok(H.length >= 30 && H.every(x => x.q && x.a && x.href?.startsWith('#/')), 'hjælpen har spørgsmål, svar og link');
  const top = (q) => K.retrieve(lib, q, 3000).sources.map(s => s.title);
  assert.ok(top('jeg har glemt min adgangskode').some(t => /glemt min adgangskode/.test(t)), 'glemt adgangskode');
  assert.ok(top('min computer er så langsom').some(t => /Computeren er langsom/.test(t)), 'langsom computer');
  assert.ok(top('hvordan skifter jeg til mørkt tema').some(t => /tema/.test(t)), 'tema');
  assert.ok(top('der kommer ingen lyd ud af højtalerne').some(t => /lyd/.test(t)), 'lyd – også med stavefejl');
  console.log('gnist hjælp ok');
}

// Servicehjælp – en del af HUBTECH (data i de samme tilstande som før)
{
  const SV = await import('../web/js/features/service.js');
  assert.deepEqual(SV.unwrap({ v: '[1,2]' }), [1, 2]); assert.deepEqual(SV.unwrap(null), []); assert.equal(SV.unwrap({ v: 'Brother' }, ''), 'Brother');
  assert.deepEqual(SV.unwrap({ v: 'ødelagt' }), [], 'en ødelagt tilstand giver en tom liste');
  assert.deepEqual(SV.wrap([1]), { v: '[1]' });
  const o = SV.emptyReport('Lucas');
  assert.equal(o.f.r14, 'Lucas'); assert.equal(o.f.r11, 'Printer'); assert.equal(o.q.length, SV.CHECKS.length);
  Object.assign(o.f, { r1: 'Jensen A/S', r2: 'HL-L2350', r12: 'SN1', r3: 'Papirstop', r6: 'Toner | 2 | TN-2420 | 549,50\nSkrue' });
  o.q[1] = true;
  const p = SV.parseParts(o.f.r6);
  assert.equal(p.rows.length, 2); assert.equal(p.total, 1099); assert.equal(p.rows[1].qty, 1);
  const rec = SV.makeRecord(o, { date: '6.11.2026' });
  assert.deepEqual([rec.k, rec.e, rec.s, rec.d], ['Jensen A/S', 'HL-L2350', 'SN1', '6.11.2026']);
  assert.match(rec.t, /SERVICERAPPORT – 6\.11\.2026/); assert.match(rec.t, /Tjekket: Testkørt/); assert.match(rec.t, /I alt: 1\.099,00 kr\./);
  assert.equal(SV.parseDate('6.11.2026').getMonth(), 10); assert.equal(SV.parseDate('2026-11-06').getDate(), 6);
  const old = { d: '8.10.2026', k: 'Bager Hansen', e: 'Printer', t: 'Ny rulle' };   // a report from the old Servicehjælp
  assert.deepEqual(SV.searchReports([rec, old], 'rulle'), [old]); assert.deepEqual(SV.searchReports([rec, old], 'sn1'), [rec]);
  assert.equal(SV.tripKm(1000, 1032, 0), 32); assert.equal(SV.tripKm(0, 0, 12.5), 12.5);
  const m = SV.tripMonth([{ d: '2026-11-02', km: 30, ty: 'Erhverv' }, { d: '2026-11-03', km: 10, ty: 'Privat' }, { d: '2026-10-30', km: 99 }], '2026-11', '3,79');
  assert.deepEqual([m.work, m.priv, m.amount, m.trips.length], [30, 10, 113.7, 2]);
  const now = new Date(2026, 10, 6);
  assert.equal(SV.warrantyStatus({ d: '2026-01-10', mo: 12 }, now).state, 'aktiv');
  assert.equal(SV.warrantyStatus({ d: '2025-11-20', mo: 12 }, now).state, 'snart');
  assert.equal(SV.warrantyStatus({ d: '2024-01-01', mo: 12 }, now).state, 'udløbet');
  const st = SV.stats([rec, old], [{ d: '2026-11-02', km: 30 }], [{ d: '2026-11-01', a: 50 }], now);
  assert.equal(st.months.length, 12); assert.equal(st.months[11].reports, 1); assert.equal(st.months[10].reports, 1);
  assert.equal(st.months[11].km, 30); assert.equal(st.months[11].exp, 50); assert.equal(st.total, 2);
  assert.ok(SV.searchKb([{ t: 'Fejlkode', ti: 'E-04', c: 'Papirstop i bakke 2' }], 'bakke').length === 1);
  console.log('servicehjælp ok');
}

// mere undervisning: almen IT-viden
{
  const { GENERAL_COURSES } = await import('../web/js/data/generalcourses.js');
  assert.ok(GENERAL_COURSES.length >= 8, 'otte nye kurser');
  for (const c of GENERAL_COURSES) {
    assert.ok(c.id && c.title && c.intro && c.days.length >= 4, `kurset ${c.id} har lektioner`);
    for (const d of c.days) assert.ok(d.t && d.g && d.l.length >= 4 && d.d.length >= 2 && d.q.length >= 2 && d.r.every(([t, u]) => t && u.startsWith('#/')), `${c.id}: ${d.t}`);
  }
  const { APP_COURSES, APP_GROUPS } = await import('../web/js/data/appcourses.js');
  assert.ok(APP_COURSES.some(c => c.id === 'linux') && APP_GROUPS.some(g => g[0] === 'general'), 'kurserne vises i Læring');
  console.log('almen it-viden ok');
}

// Kode-editor: sprog, lærer-spørgsmål og resultattekst
{
  const C = await import('../web/js/pages/codepad.js');
  assert.deepEqual(C.LANGS.map(l => l.id), ['python', 'javascript', 'html', 'sql', 'bash']);
  assert.ok(C.LANGS.every(l => l.start.length > 20), 'hvert sprog har et eksempel');
  assert.match(C.teacherPrompt('bug', 'python'), /Find fejlen i min Python-kode/);
  assert.match(C.teacherPrompt('task', 'sql'), /Giv ikke løsningen/);
  assert.equal(C.outputText({ out: 'hej', error: '' }), 'hej');
  assert.equal(C.outputText({ tables: [{ columns: ['by', 'antal'], values: [['Aarhus', 2]] }] }), 'by | antal\nAarhus | 2');
  assert.equal(C.outputText({ tables: [], error: 'near "SELEC": syntax error' }), 'near "SELEC": syntax error');
  assert.equal(C.langOfFile('app.py'), 'python'); assert.equal(C.langOfFile('Dockerfile'), 'dockerfile'); assert.equal(C.langOfFile('x.ps1'), 'powershell'); assert.equal(C.langOfFile('noter'), 'text');
  assert.equal(C.runnerOf('python'), 'python'); assert.equal(C.runnerOf('css'), 'html'); assert.equal(C.runnerOf('go'), null);
  assert.equal(C.cleanName(' ../a/b:c.py '), 'a-b-c.py'); assert.equal(C.cleanName(''), '');
  assert.equal(C.errorLine('python', 'Fejl (sidste kald nederst):\n  Linje 2\n  Linje 7 (i f)\nZeroDivisionError: division by zero'), 7);
  assert.equal(C.errorLine('sql', 'near x'), 0);
  assert.match(C.teacherPrompt('explain', 'python', { selection: true }), /den markerede Python-kode/);
  assert.match(C.teacherPrompt('test', 'javascript'), /Skriv test til min JavaScript-kode/);
  { const m = C.migrate({ lang: 'sql', files: { python: 'print(1)' } });
    assert.equal(m.docs.length, 5); assert.equal(m.docs.find(f => f.name.endsWith('.py')).text, 'print(1)');
    assert.equal(m.docs.find(f => f.id === m.active).name, 'kunder.sql');
    assert.equal(C.migrate(m), m, 'nye data røres ikke'); }
  console.log('kode-editor ok');
}

// Projekter: beskeder med kode, krav til beskrivelse af en ændring, og forskellen linje for linje
{
  const P = await import('../web/js/pages/teamprojects.js');
  const L = await import('../web/js/features/linediff.js');
  assert.deepEqual(P.parseBlocks('Hej\n```py\nx = 1\n```\nslut'), [{ type: 'p', text: 'Hej' }, { type: 'code', lang: 'py', text: 'x = 1' }, { type: 'p', text: 'slut' }]);
  assert.deepEqual(P.parseInline('Se @Karl og `ls -l` på https://x.dk/a.').map(x => x.t), ['text', 'mention', 'text', 'code', 'text', 'link', 'text']);
  assert.equal(P.parseInline('@karl').find(x => x.t === 'mention').s, 'karl');
  assert.match(P.commitProblem('ab', 'Noget der er langt nok'), /titel/);
  assert.match(P.commitProblem('Ret login', P.COMMIT_TEMPLATE), /Beskriv/, 'en tom skabelon tæller ikke');
  assert.equal(P.commitProblem('Ret login', 'Hvad: venter efter 5 forsøg'), '');
  assert.match(P.aiReviewPrompt('Ret login', ['--- a.py']), /Gennemgå denne ændring.*Ret login/s);
  const d = L.diffLines('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual(L.countChanges(d), { add: 2, del: 1 });
  assert.equal(d.map(x => x.t).join(''), ' -+ +');
  assert.deepEqual(d.map(x => [x.a ?? 0, x.b ?? 0]), [[1, 1], [2, 0], [0, 2], [3, 3], [0, 4]], 'linjenumre i gammel og ny');
  assert.equal(L.hunks(L.diffLines(Array.from({ length: 30 }, (_, i) => i).join('\n'), Array.from({ length: 30 }, (_, i) => (i === 3 || i === 25 ? 'x' : i)).join('\n'))).length, 2, 'to ændringer langt fra hinanden = to stykker');
  assert.match(L.unified('a.py', 'a\nb', 'a\nc'), /^--- a\.py\n\+\+\+ a\.py\n@@ linje 1 @@\n a\n-b\n\+c$/);
  assert.equal(L.unified('a.py', 'x', 'x'), '', 'ingen forskel');
  console.log('projekter ok');
}

// Kalender: flere påmindelser, egen tid, heldagsaftaler, stille tid og gamle valg
{
  const C = await import('../web/js/features/calremind.js');
  const set = C.remindSettings({});
  const t = (x) => new Date(x).getTime();
  const e = { id: 'a', date: '2026-11-12', start: '10:00', allDay: false, reminders: [{ id: 'x', n: 15, unit: 'min' }, { id: 'y', n: 1, unit: 'day', time: '18:00' }] };
  assert.equal(C.reminderAt(e.reminders[0], e), t('2026-11-12T09:45'));
  assert.equal(C.reminderAt(e.reminders[1], e), t('2026-11-11T18:00'));
  assert.equal(C.reminderAt({ n: 2, unit: 'hour' }, { date: '2026-11-12', allDay: true }, '08:00'), t('2026-11-12T06:00'), 'heldag: fra den valgte tid');
  assert.equal(C.reminderAt({ unit: 'abs', abs: '2026-11-10T07:30' }, e), t('2026-11-10T07:30'));
  assert.equal(C.reminderLabel({ n: 15, unit: 'min' }), '15 min før');
  assert.equal(C.reminderLabel({ n: 1, unit: 'day', time: '18:00' }), 'Dagen før kl. 18:00');
  assert.equal(C.reminderLabel({ n: 2, unit: 'week', time: '09:00' }), '2 uger før kl. 09:00');
  assert.equal(C.reminderLabel({ n: 0, unit: 'min' }), 'Når den starter');
  assert.deepEqual(C.eventReminders({ remind: 'm15' }).map(r => [r.n, r.unit]), [[15, 'min']], 'det gamle valg virker stadig');
  assert.deepEqual(C.eventReminders({}), []);
  const q = { on: true, from: '22:00', to: '07:00', weekend: true };
  assert.equal(C.afterQuiet(t('2026-11-11T23:30'), q), t('2026-11-12T07:00'), 'om natten: kommer kl. 7');
  assert.equal(C.afterQuiet(t('2026-11-14T12:00'), q), t('2026-11-16T07:00'), 'lørdag: kommer mandag');
  assert.equal(C.afterQuiet(t('2026-11-11T12:00'), q), t('2026-11-11T12:00'));
  assert.deepEqual(C.remindersBetween(e, t('2026-11-11T00:00'), t('2026-11-13T00:00'), set).map(x => x.key), ['ev-a-2026-11-12-y', 'ev-a-2026-11-12-x']);
  const rep = { id: 'w', date: '2026-11-02', start: '08:00', repeat: { freq: 'week' }, reminders: [{ id: 'z', n: 10, unit: 'min' }] };
  assert.deepEqual(C.remindersBetween(rep, t('2026-11-08T00:00'), t('2026-11-24T00:00'), set).map(x => x.date), ['2026-11-09', '2026-11-16', '2026-11-23'], 'en gentaget aftale minder hver gang');
  assert.equal(C.defaultsFor(set, '', true)[0].time, '18:00');
  assert.equal(C.defaultsFor({ ...set, perCal: { k1: [{ n: 5, unit: 'min' }] } }, 'k1', false)[0].n, 5, 'standard pr. kalender');
  const R = await import('../web/js/features/reminders.js');
  const up = R.upcoming([], [{ ...e, date: '2099-01-10' }], t('2099-01-01T00:00'), set);
  assert.equal(up.length, 2, 'Android får alle påmindelser');
  assert.equal(C.eventOver({ start: '09:00', end: '10:00' }, '2026-11-09', t('2026-11-09T20:50')), true, 'en aftale i morges er overstået');
  assert.equal(C.eventOver({ start: '09:00' }, '2026-11-09', t('2026-11-09T09:30')), false, 'uden sluttid: en time');
  assert.equal(C.eventOver({ start: '23:00', end: '01:00' }, '2026-11-09', t('2026-11-10T00:30')), false, 'over midnat');
  assert.equal(C.eventOver({ allDay: true }, '2026-11-09', t('2026-11-09T23:00')), false, 'heldagsaftale gælder hele dagen');
  console.log('påmindelser ok');
}

// Et ikon sat direkte ind med append/replaceChildren bliver til teksten “[object Object]” – det må ikke ske nogen steder
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const walk = (d) => readdirSync(d).flatMap(f => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
  const bad = walk(new URL('../web/js', import.meta.url).pathname).filter(f => /\.(append|prepend|replaceChildren|after|before)\((icon|tileIcon|gnist|logo)\(/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, [], 'ikoner skal ind via h()');
  console.log('ikoner ok');
}

// Controller: knapperne læses rigtigt, og fokus flytter til nærmeste i retningen
{
  const G = await import('../web/js/features/gamepad.js');
  const btn = (on) => ({ pressed: on, value: on ? 1 : 0 });
  const pad = { buttons: Array.from({ length: 16 }, (_, i) => btn(i === 0 || i === 15)), axes: [0, -0.9] };
  const r = G.readPad(pad);
  assert.ok(r.a && r.right && r.up && !r.b && !r.down, 'A, højre (D-pad) og op (pind)');
  const at = (x, y) => ({ left: x, top: y, width: 10, height: 10 });
  const list = [{ el: 'right', rect: at(100, 0) }, { el: 'below', rect: at(0, 100) }, { el: 'far', rect: at(400, 10) }];
  assert.equal(G.nearest(at(0, 0), list, 'right').el, 'right');
  assert.equal(G.nearest(at(0, 0), list, 'down').el, 'below');
  assert.equal(G.nearest(at(0, 0), list, 'left'), null);
  console.log('controller ok');
}

// Alle apps: hver app i sin gruppe, søgning med æøå, og fastgør/fjern (de fastgjorte ligger i menuen til venstre)
{
  const A = await import('../web/js/features/appdrawer.js');
  const owner = A.appGroups({ role: 'owner', admin: true }), member = A.appGroups({ role: 'member' });
  const ids = (gs) => gs.flatMap(g => g.apps.map(a => a.id));
  assert.equal(new Set(ids(owner)).size, ids(owner).length, 'en app står kun ét sted');
  assert.deepEqual(owner.find(g => g.id === 'money').apps.map(a => a.id), ['budget', 'savings', 'piggy', 'expenses', 'splitbill', 'loans']);
  assert.ok(owner.find(g => g.id === 'learn').apps.some(a => a.id === 'codepad'), 'læringsapps under Lær og øv');
  assert.ok(!ids(member).includes('admin') && !ids(member).includes('owner') && !ids(member).includes('next'), 'skjulte og kommende apps vises ikke');
  assert.deepEqual(A.searchApps('skak', owner).map(a => a.id), ['chess']);
  assert.equal(A.searchApps('økonomi', owner).length, 6, 'gruppens navn tæller med');
  assert.equal(A.searchApps('kode', owner)[0].name.startsWith('Kode'), true, 'navnet først');
  assert.deepEqual(A.searchApps('   ', owner), []);
  const on = A.togglePin({}, 'budget');
  assert.equal(on.pinned, true); assert.equal(on.dock.at(-1), 'apps', 'Alle apps bliver sidst'); assert.equal(on.dockCount, 9);
  const off = A.togglePin({ dock: on.dock, dockCount: on.dockCount }, 'budget');
  assert.equal(off.pinned, false); assert.ok(!off.dock.includes('budget')); assert.equal(off.dockCount, 8);
  assert.ok(A.togglePin({ dock: ['home', 'apps'], dockCount: 2 }, 'apps').error, 'mindst to');
  assert.ok(A.togglePin({ dock: Array.from({ length: 12 }, (_, i) => `a${i}`), dockCount: 12 }, 'budget').error, 'højst tolv');
  assert.equal(A.togglePin({ dock: ['home', 'apps', 'budget'], dockCount: 2 }, 'budget').dock.join(), 'home,budget,apps', 'en skjult fastgjort rykkes frem');
  assert.equal(A.pinEntry('home', {}).name, 'Hjem'); assert.equal(A.pinEntry('admin', { role: 'member' }), null);
  console.log('alle apps ok');
}

// Egne genveje i menuen til venstre: en side, en app eller en hjemmeside – flyt, omdøb og fjern
{
  const S = await import('../web/js/features/shortcuts.js');
  assert.equal(S.normalizeUrl('dr.dk'), 'https://dr.dk/');
  assert.equal(S.normalizeUrl('http://intra.firma.dk/side?a=1'), 'http://intra.firma.dk/side?a=1');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///c:/x', 'bare-et-ord', 'https://bruger:kode@site.dk', '']) assert.equal(S.normalizeUrl(bad), null, bad);
  assert.equal(S.normalizeUrl('#/learn/guide/add-app'), '#/learn/guide/add-app');
  assert.equal(S.normalizeUrl('#/x"><script>'), null);
  const a = S.addShortcut({}, { href: 'dr.dk' });
  assert.ok(a.id.startsWith('s:') && a.dock.at(-1) === 'apps' && a.dock.at(-2) === a.id && a.dockCount === 9 && a.shortcuts[0].label === 'dr.dk' && a.shortcuts[0].icon === 'globe');
  const w = { dock: a.dock, dockCount: a.dockCount, shortcuts: a.shortcuts };
  assert.ok(S.addShortcut(w, { href: 'https://dr.dk/' }).error, 'ikke to gange');
  const e = S.shortcutEntry(a.id, w);
  assert.ok(e.external && e.href === 'https://dr.dk/' && e.label === 'dr.dk');
  assert.equal(S.shortcutEntry(a.id, { shortcuts: [{ id: a.id, href: 'javascript:x' }] }), null, 'farlige links vises aldrig');
  const p = S.addShortcut(w, { href: '#/apps/projects/abc', label: '  Lager-scanneren  ', icon: 'chat' });
  assert.equal(p.shortcuts.at(-1).label, 'Lager-scanneren');
  const pe = S.shortcutEntry(p.id, { ...w, ...p });
  assert.ok(!pe.external && pe.match('/apps/projects/abc') && !pe.match('/apps/projects'));
  const r = S.reorderPins({ ...w, ...p }, [p.id, a.id]);
  assert.ok(r.dock.indexOf(p.id) < r.dock.indexOf(a.id) && r.dock.at(-1) === 'apps', 'byt plads');
  const x = S.removePin({ ...w, ...p }, a.id);
  assert.ok(!x.dock.includes(a.id) && !x.shortcuts.some(s => s.id === a.id) && x.dockCount === 9);
  assert.ok(S.removePin({ dock: ['home', 'apps'], dockCount: 2 }, 'home').error, 'mindst to');
  assert.equal(S.renameShortcut(w, a.id, 'Nyheder').shortcuts[0].label, 'Nyheder');
  const sug = S.pageSuggestion('#/apps/projects/abc', 'Lager-scanneren');
  assert.deepEqual([sug.href, sug.label, sug.icon, sug.app], ['#/apps/projects/abc', 'Lager-scanneren', 'chat', null]);
  assert.equal(S.pageSuggestion('#/apps/budget', '').app, 'budget', 'en hel app fastgøres som appen');
  assert.equal(S.pageSuggestion('#/', 'Hjem'), null);
  assert.equal(S.pageSuggestion('#/learn/guide/add-app', 'Tilføj en ny app').label, 'Tilføj en ny app', 'kommende apps tæller ikke');
  const A = await import('../web/js/features/appdrawer.js');
  assert.equal(A.pinEntry(a.id, {}, w).name, 'dr.dk', 'genveje står også under Fastgjort i Alle apps');
  console.log('genveje ok');
}

// Arbejdstilstand: tændt, eller af sig selv om aftenen (også hen over midnat)
{
  const Wk = await import('../web/js/features/workmode.js');
  const w = (x) => Wk.workPrefs({ work: x });
  assert.deepEqual([w({}).warm, w({}).soft, w({}).calm, w({}).auto], [2, true, true, false], 'standard');
  assert.equal(w({ warm: 9, from: 'xx' }).warm, 3); assert.equal(w({ from: 'xx' }).from, '20:00');
  const at = (hh, mm = 0) => new Date(2026, 10, 9, hh, mm);
  assert.equal(Wk.workActive(w({ on: true }), at(12)), true);
  assert.equal(Wk.workActive(w({ auto: true }), at(21)), true, 'om aftenen');
  assert.equal(Wk.workActive(w({ auto: true }), at(6, 30)), true, 'om natten');
  assert.equal(Wk.workActive(w({ auto: true }), at(12)), false, 'om dagen');
  assert.equal(Wk.workActive(w({ auto: true, from: '09:00', to: '17:00' }), at(12)), true, 'i arbejdstiden');
  assert.equal(Wk.workActive(w({}), at(21)), false);
  const L = await import('../web/js/features/learnnav.js');
  const g = L.learnGroups();
  assert.equal(g.flatMap(x => x.apps).length, 13, 'alle læringsapps er med'); assert.deepEqual(g.map(x => x.name), ['Øv i praksis', 'Lær at kode', 'Træn og test', 'Slå op']);
  const I = await import('../web/js/core/appicons.js');
  for (const [id, d] of Object.entries(I.APP_GLYPHS)) assert.ok(!/<script|on\w+=/i.test(d), id);
  console.log('arbejdstilstand og læring ok');
}
