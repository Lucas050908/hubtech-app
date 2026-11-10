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

// ── Sammensatte ord ────────────────────────────────────────────────────────
// En dansker skriver "netværksprinter", ikke "printer på netværket". Teksten skriver
// "printer", og et sammensat ord har hovedet til sidst – uden den regel fandt Gnist intet.
for (const [q, vent] of [['netværksprinter', /Installér en netværksprinter/],
                         ['hvordan sætter jeg en netværksprinter op', /Installér en netværksprinter/],
                         ['varmepresse', /varmepresse/i],
                         ['skæreplotter', /skæreplotter/i],
                         ['tekstilfolie', /tekstilfolie/i]]) {
  assert.ok(vent.test(first(q)), `"${q}" fandt ikke ${vent}: ${first(q).slice(0, 100)}`);
}
// men forleddet skal være langt nok, ellers bliver "meningen" delt til "ingen"
assert.ok(!/ingen lyd/i.test(first('hvad er meningen med livet')), first('hvad er meningen med livet').slice(0, 80));

// ── Stavekontrollen må ikke ødelægge spørgeord ─────────────────────────────
// "hvordan" blev rettet til "hvoraf", som derefter matchede alt med "hvor", "hvorfor" og "hvornår".
{
  const { fixTypos } = await import('../web/js/ai/knowledge.js');
  const rettet = fixTypos(['hvordan', 'hvornår', 'hvem', 'hvad', 'pritner'], items);
  assert.equal(rettet.get('hvordan'), undefined, 'hvordan må ikke "rettes"');
  assert.equal(rettet.get('hvornår'), undefined);
  assert.equal(rettet.get('hvad'), undefined);
  assert.equal(rettet.get('pritner'), 'printer', 'rigtige stavefejl skal stadig rettes');
}

// ── Synonymer må ikke slå det præcise svar ─────────────────────────────────
// En bred tekst, der nævner mange beslægtede ord (co2, diode, gravering …), vandt før
// over lektionen, der hedder præcis det, der blev spurgt om.
assert.ok(first('hvordan virker en laser').includes('Sådan virker en laser'),
  first('hvordan virker en laser').slice(0, 100));

// ── Sammensatte ord finder også opslaget for deres dele ────────────────────
// I et dansk sammensat ord bestemmer sidste led hvad tingen er, men forleddet
// peger ofte på opslaget: "tonerkassette" handler om Toner, "printerdriver" om Driver.
for (const [q, opslag] of [['tonerkassette', 'Toner'], ['printerdriver', 'Driver']]) {
  assert.ok(first(q).includes(`[IT-ordbog] ${opslag}`), `"${q}" fandt ikke opslaget ${opslag}: ${first(q).slice(0, 100)}`);
}

// ── Appernes egne søgeord tæller ───────────────────────────────────────────
// Kommentaren over app-emnerne siger "hvor kan jeg lave en faktura?" – og netop det
// spørgsmål fandt ingenting, fordi søgeordene blev smeltet ind i brødteksten.
assert.ok(first('hvordan laver jeg en faktura').includes('Kunder'), first('hvordan laver jeg en faktura').slice(0, 100));
// men et vagt spørgsmål må stadig ikke trække HUBTECHs materiale ind
assert.equal((retrieve(items, 'hvad skal jeg nå i dag', 4000) || []).length, 0);

// ── Korte fagord skal kunne slås op ───────────────────────────────────────
// Ord på to tegn kasseres, med mindre de står på listen over IT-ord. GB, MB, KB og TB
// stod ikke der, så "hvad er gb" gav ingenting — og det er noget, man slår op.
for (const [q, vent] of [['hvad er GB', /KB, MB, GB, TB/], ['hvor mange MB er en GB', /KB, MB, GB, TB/],
                         ['hvad er usb pd', /Power Delivery/], ['hvad betyder nm', /nanometer|bølgelængde/i]]) {
  assert.ok(vent.test(first(q)), `"${q}": ${first(q).slice(0, 90)}`);
}
// men to tegn må ikke ramme et længere ord: "ap" er ikke "apps"
assert.equal((retrieve(items, 'hvad er et ap', 1500) || []).length, 0);

// ── Et ord er nok til et opslag ────────────────────────────────────────────
// Brødtekst kan højst give 3 point, så med krav om 6 kunne et étords-opslag aldrig findes.
for (const q of ['printerdriver', 'netværkskabel', 'sublimationspapir']) {
  assert.ok((retrieve(items, q, 1500) || []).length > 0, `"${q}" gav ingenting`);
}

console.log('knowledge ok');
