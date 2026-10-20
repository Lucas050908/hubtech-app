// Unit tests for the HUBTECH Office formula engine. Run: node tests/formula.test.mjs
import { evaluateSheet, parseInput, fmtDate, dateToSerial } from '../web/js/office/formula.js';
import { condStyles, chartData, autoDateKind } from '../web/js/office/sheetx.js';

let fails = 0, n = 0;
const eq = (name, got, want) => {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const sheet = (rows) => { const cells = {}; rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '') cells[`${String.fromCharCode(65 + c)}${r + 1}`] = { v: String(v) }; })); return cells; };
const calc = (cells, f) => evaluateSheet({ ...cells, Z99: { v: f } }).get('Z99');

const base = sheet([['Vare', 'Pris', 'Antal'], ['Æble', '5', '10'], ['Pære', '7,5', '4'], ['Banan', '3', '0'], ['Kiwi', '12', '2']]);
// basics + Danish names and separators
eq('sum', calc(base, '=SUM(B2:B5)'), 27.5);
eq('summer', calc(base, '=SUMMER(B2:B5)'), 27.5);
eq('decimal comma in ; mode', calc(base, '=SUM(B2;2,5)'), 7.5);
eq('english commas', calc(base, '=SUM(B2,2.5)'), 7.5);
eq('precedence', calc(base, '=2+3*4^2'), 50);
eq('percent', calc(base, '=200*10%'), 20);
eq('concat', calc(base, '=A2&" "&B2'), 'Æble 5');
eq('if', calc(base, '=HVIS(B3>5;"dyr";"billig")'), 'dyr');
eq('div0', calc(base, '=1/0'), { err: '#DIVISION/0!' });
eq('iferror', calc(base, '=HVIS.FEJL(1/0;"x")'), 'x');
eq('cycle', evaluateSheet({ A1: { v: '=B1' }, B1: { v: '=A1' } }).get('A1'), { err: '#CYKLUS!' });
eq('unknown fn', calc(base, '=FINDESIKKE(1)'), { err: '#NAVN?' });
// lookup
eq('vlookup exact', calc(base, '=LOPSLAG("pære";A2:C5;2;FALSK)'), 7.5);
eq('vlookup col 3', calc(base, '=VLOOKUP("Kiwi",A2:C5,3,FALSE)'), 2);
eq('vlookup missing', calc(base, '=LOPSLAG("Melon";A2:C5;2;0)'), { err: '#I/T' });
eq('vlookup approx', calc(sheet([['0', 'lav'], ['100', 'mellem'], ['500', 'høj']]), '=LOPSLAG(250;A1:B3;2)'), 'mellem');
eq('xlookup', calc(base, '=XOPSLAG("Banan";A2:A5;C2:C5)'), 0);
eq('xlookup not found', calc(base, '=XOPSLAG("Melon";A2:A5;C2:C5;"–")'), '–');
eq('hlookup', calc(base, '=VOPSLAG("Antal";A1:C5;3;FALSK)'), 4);
eq('index/match', calc(base, '=INDEKS(B2:B5;SAMMENLIGN("Kiwi";A2:A5;0))'), 12);
eq('index 2d', calc(base, '=INDEX(A1:C5,3,1)'), 'Pære');
eq('ifna', calc(base, '=HVIS.IT(LOPSLAG("x";A2:B5;2;0);"ingen")'), 'ingen');
// conditional aggregates
eq('sumif', calc(base, '=SUM.HVIS(B2:B5;">5")'), 19.5);
eq('sumifs', calc(base, '=SUM.HVISER(C2:C5;B2:B5;">4";A2:A5;"<>Kiwi")'), 14);
eq('countifs', calc(base, '=TÆL.HVISER(B2:B5;">=5";C2:C5;">0")'), 3);
eq('countif wildcard', calc(base, '=TÆL.HVIS(A2:A5;"*e")'), 2);
// text
eq('mid', calc(base, '=MIDT("HUBTECH";4;4)'), 'TECH');
eq('substitute', calc(base, '=UDSKIFT("a-b-c";"-";"/")'), 'a/b/c');
eq('search', calc(base, '=SØG("tech";"HUBTECH")'), 4);
eq('text number', calc(base, '=TEKST(1234,5;"# ##0,00")'), '1.234,50');
// dates
const d = dateToSerial(2026, 10, 20);
eq('parse dd-mm-yyyy', parseInput('20-10-2026'), d);
eq('parse iso', parseInput('2026-10-20'), d);
eq('parse invalid date stays text', parseInput('31-02-2026'), '31-02-2026');
eq('fmtDate', fmtDate(d), '20-10-2026');
eq('date fn', calc(base, '=DATO(2026;10;20)'), d);
eq('year/month/day', [calc(base, '=ÅR("20-10-2026")'), calc(base, '=MÅNED("20-10-2026")'), calc(base, '=DAG("20-10-2026")')], [2026, 10, 20]);
eq('weekday mon=1', calc(base, '=UGEDAG(DATO(2026;10;19);2)'), 1);
eq('iso week', calc(base, '=ISOUGE.NR(DATO(2026;1;1))'), 1);
eq('iso week 53', calc(base, '=ISOUGE.NR(DATO(2026;12;31))'), 53);
eq('days', calc(base, '=DAGE("24-12-2026";"20-10-2026")'), 65);
eq('date minus date', evaluateSheet({ A1: { v: '24-12-2026' }, A2: { v: '20-10-2026' }, A3: { v: '=A1-A2' } }).get('A3'), 65);
eq('edate end of month', fmtDate(calc(base, '=EDATO("31-01-2026";1)')), '28-02-2026');
eq('eomonth', fmtDate(calc(base, '=SLUT.PÅ.MÅNED("10-02-2028";0)')), '29-02-2028');
eq('networkdays', calc(base, '=ANTAL.ARBEJDSDAGE("01-10-2026";"31-10-2026")'), 22);
eq('text date', calc(base, '=TEKST(DATO(2026;10;20);"dddd d. mmmm åååå")'), 'tirsdag 20. oktober 2026');
eq('auto date kind', [autoDateKind('=IDAG()'), autoDateKind('=NU()'), autoDateKind('20-10-2026'), autoDateKind('=SUM(A1)')], ['date', 'datetime', 'date', null]);
// conditional formatting
const sh = { cells: sheet([['1'], ['-2'], ['5'], ['5']]), cond: [{ range: 'A1:A4', type: 'gt', v1: '2', color: 'red' }, { range: 'A1:A4', type: 'neg', color: 'blue' }] };
const cs = condStyles(sh, evaluateSheet(sh.cells));
eq('cond gt', [cs.has('A1'), cs.has('A3'), cs.get('A2')?.bg], [false, true, '#d8e8ff']);
const dup = condStyles({ cells: sh.cells, cond: [{ range: 'A1:A4', type: 'dup', color: 'yellow' }] }, evaluateSheet(sh.cells));
eq('cond dup', [...dup.keys()].sort(), ['A3', 'A4']);
const bars = condStyles({ cells: sh.cells, cond: [{ range: 'A1:A4', type: 'bars' }] }, evaluateSheet(sh.cells));
eq('cond bars max', bars.get('A3').bar, 1);
// charts
const cd = chartData({ cells: base }, evaluateSheet(base), 'A1:C5');
eq('chart labels', cd.labels, ['Æble', 'Pære', 'Banan', 'Kiwi']);
eq('chart series', cd.series.map(s => s.name), ['Pris', 'Antal']);
eq('chart values', cd.series[0].values, [5, 7.5, 3, 12]);

console.log(`${n - fails}/${n} formula tests passed`);
process.exit(fails ? 1 : 0);
