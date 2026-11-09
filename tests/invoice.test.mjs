// node tests/invoice.test.mjs – Kunder & fakturaer
import assert from 'node:assert/strict';
import { matchesCustomer, quarter, totals, linesFromEntries, invoiceState, addDays, daDate, invoiceNo, hoursOf } from '../web/js/features/invoice.js';
assert.ok(matchesCustomer('Jensen A/S', 'jensen a/s'));
assert.ok(matchesCustomer('Jensen A/S', 'Service hos Jensen A/S i Vejle'));
assert.ok(!matchesCustomer('Holm', 'Holmegaard'));                 // whole words only
assert.ok(matchesCustomer('Bager Hansen', 'Nyt netværk – Bager  Hansen'));
assert.ok(!matchesCustomer('Bo', 'Bo og co'));                      // too short to search inside text
assert.ok(matchesCustomer('Bo', 'bo'));
assert.ok(!matchesCustomer('', 'x'));
assert.equal(quarter(1.01), 1.25); assert.equal(quarter(1), 1); assert.equal(quarter(0.1), 0.25); assert.equal(quarter(0), 0);
assert.deepEqual(totals([{ qty: 1.5, price: 450 }, { qty: 2, price: 39.95 }], 25), { net: 754.9, vat: 188.73, gross: 943.63 });
assert.deepEqual(totals([], 25), { net: 0, vat: 0, gross: 0 });
const t0 = new Date(2026, 9, 20, 9, 0).getTime();
const ls = linesFromEntries([{ id: 'b', start: t0 + 86400e3, end: t0 + 86400e3 + 50 * 60e3, desc: 'Printer' }, { id: 'a', start: t0, end: t0 + 3600e3, desc: '' }], 450);
assert.equal(ls[0].src.id, 'a'); assert.equal(ls[0].qty, 1); assert.equal(ls[0].text, '20-10-2026 · Arbejde'); assert.equal(ls[1].qty, 1); assert.equal(ls[1].price, 450);
assert.equal(hoursOf({ start: 0, end: 5400e3 }), 1.5);
assert.equal(invoiceState({ status: 'draft' }).key, 'draft');
assert.equal(invoiceState({ status: 'sent', due: '2026-10-01' }, '2026-10-20').key, 'overdue');
assert.equal(invoiceState({ status: 'sent', due: '2026-10-30' }, '2026-10-20').key, 'sent');
assert.equal(invoiceState({ status: 'paid', due: '2026-01-01' }, '2026-10-20').key, 'paid');
assert.equal(addDays('2026-12-28', 8), '2027-01-05'); assert.equal(daDate('2026-10-20'), '20-10-2026'); assert.equal(invoiceNo(42), '0042');
console.log('invoice ok');
