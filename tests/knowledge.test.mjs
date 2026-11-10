// node tests/knowledge.test.mjs – Gnists opslag i HUBTECHs eget materiale
import assert from 'node:assert/strict';
globalThis.document = { documentElement: { dataset: {} } };
globalThis.addEventListener = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { retrieve, libraryItems } = await import('../web/js/ai/knowledge.js');
const items = await libraryItems();

const first = (q) => (retrieve(items, q, 1500) || [])[0] || '';

// et ord fra IT-ordbogen skal kunne slås op med ét ord – det var præcis det, der ikke virkede
for (const [q, word] of [['infill', 'Infill'], ['hvad er infill?', 'Infill'], ['offerplade', 'Offerplade'],
                         ['hvad betyder kerf', 'Kerf'], ['spindel', 'Spindel'], ['hvad er en passkey', 'Passkey']]) {
  assert.ok(first(q).includes(word), `"${q}" fandt ikke ordet ${word}: ${first(q).slice(0, 90)}`);
}
// flerordsord virker også
assert.ok(first('hvad er bit og byte').includes('Bit og byte'), first('hvad er bit og byte').slice(0, 90));

// og materialet drukner ikke i ordbogsord: et rigtigt spørgsmål giver stadig lektionen eller hjælpen
assert.ok(/Lektion|Hjælp|Guide/.test(first('hvordan tager jeg backup')), first('hvordan tager jeg backup').slice(0, 90));
assert.ok(/Lektion|Guide/.test(first('hvorfor må pvc ikke i laseren')), first('hvorfor må pvc ikke i laseren').slice(0, 90));

// hele guiden skal med i indekset – også trin, tabeller og fremhævede bokse
const printerGuide = items.find((i) => i.kind === 'guide' && i.title === 'Installér en netværksprinter');
assert.ok(printerGuide.text.length > 400, `guiden fylder kun ${printerGuide.text.length} tegn i indekset`);
assert.ok(printerGuide.text.includes('IP'), printerGuide.text.slice(0, 120));
const laserGuide = items.find((i) => i.kind === 'guide' && i.title === 'Dit første laserjob');
assert.ok(/brandt(æ|ae)ppe/i.test(laserGuide.text), 'fremhævede bokse og trin mangler i indekset');
const matGuide = items.find((i) => i.kind === 'guide' && i.title === 'Hvad må i laseren – og hvad må aldrig');
assert.ok(/fiber|MOPA/i.test(matGuide.text), 'tabellen mangler i indekset');

// og det kan mærkes: de her spørgsmål fandt enten den forkerte ting eller ingenting før
for (const [q, guide] of [['netværksprinter ip', 'Installér en netværksprinter'],
                          ['dashboard integrationer', 'Dit dashboard'],
                          ['3d print første lag', 'Dit første 3D-print'],
                          ['print fra mobilen', 'Print fra mobilen']]) {
  assert.ok(first(q).includes(guide), `"${q}" fandt ikke guiden ${guide}: ${first(q).slice(0, 90)}`);
}

// et spørgsmål uden noget at finde skal stadig give ingenting
assert.equal((retrieve(items, 'blomkål på en sejlbåd', 1500) || []).length, 0);

console.log('knowledge ok');
