// node tests/isoweek.test.mjs – ugenumre
// Appen har tre selvstændige isoWeek(): i Gnists værktøjer, i sharedlogic (A/B-uger)
// og i kalenderens print. Viser de ikke det samme, siger appen to forskellige ting om
// samme dag. Denne test binder alle tre til ISO-8601-reglen: uge 1 er ugen med 4. januar.
import assert from 'node:assert/strict';

// ai/tools.js trækker browserkode med ind, så de få globale stubbes før import.
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), documentElement: { style: {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }); } catch { /* findes allerede */ }

const { isoWeek: fraGnist } = await import('../web/js/ai/tools.js');
const { isoWeek: fraDeling } = await import('../web/js/features/sharedlogic.js');
const { isoWeek: fraPrint } = await import('../web/js/features/calprint.js');

/** ISO-8601 regnet forfra: ugen er nummereret efter sin torsdag, og uge 1 rummer 4. januar. */
const efterReglen = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const mandag1 = new Date(jan4);
  mandag1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  return Math.round((t - mandag1) / (7 * 864e5)) + 1;
};

let dage = 0;
for (let y = 2019; y <= 2040; y++) {
  for (let m = 0; m < 12; m++) {
    for (let dd = 1; dd <= 31; dd++) {
      const d = new Date(y, m, dd);
      if (d.getMonth() !== m) continue;
      dage++;
      const w = efterReglen(d), hvor = `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      assert.equal(fraGnist(d), w, `Gnist: ${hvor}`);
      assert.equal(fraDeling(d), w, `sharedlogic: ${hvor}`);
      assert.equal(fraPrint(d), w, `calprint: ${hvor}`);
    }
  }
}

// Kendte holdepunkter, regnet i hånden mod en dansk kalender
const uge = (s) => fraPrint(new Date(...s.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))));
assert.equal(uge('2026-01-01'), 1);    // torsdag – uge 1
assert.equal(uge('2025-12-29'), 1);    // mandag i uge 1 af 2026
assert.equal(uge('2021-01-01'), 53);   // fredag – stadig uge 53 af 2020
assert.equal(uge('2020-12-31'), 53);   // 2020 havde 53 uger
assert.equal(uge('2024-12-30'), 1);    // mandag i uge 1 af 2025
assert.equal(uge('2026-12-31'), 53);   // 2026 har 53 uger

// A/B-uger bygger på ugenummeret, så pariteten skal følge med
const { weekLetter } = await import('../web/js/features/sharedlogic.js');
assert.equal(weekLetter(new Date(2026, 0, 5), true, 1), 'B');   // uge 2 er lige, og A er de ulige
assert.equal(weekLetter(new Date(2026, 0, 12), true, 1), 'A');  // uge 3
assert.equal(weekLetter(new Date(2026, 0, 5), true, 0), 'A');   // omvendt paritet
assert.equal(weekLetter(new Date(2026, 0, 5), false, 1), '');   // slået fra

console.log(`ugenumre ok (${dage} dage × 3 funktioner)`);
