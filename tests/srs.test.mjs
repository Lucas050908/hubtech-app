// node tests/srs.test.mjs – spaced repetition + card import (Huskekort)
import assert from 'node:assert/strict';
import { schedule, nextLabel, isDue, isNew, startOfDay, DAY, parseCards } from '../web/js/features/srs.js';
const now = new Date(2026, 9, 20, 14, 0).getTime();
const fresh = { reps: 0, ivl: 0, ease: 2.5, lapses: 0, due: 0 };
assert.ok(isNew(fresh) && isDue(fresh, now));
let c = { ...fresh, ...schedule(fresh, 3, now) };
assert.equal(c.ivl, 1); assert.equal(c.due, startOfDay(now) + DAY); assert.ok(!isDue(c, now)); assert.ok(isDue(c, now + DAY));
c = { ...c, ...schedule(c, 3, now + DAY) }; assert.equal(c.ivl, 3);
c = { ...c, ...schedule(c, 3, now + 4 * DAY) }; assert.equal(c.ivl, 8);              // 3 * 2.5 = 7.5 → 8
const lapse = schedule(c, 1, now); assert.equal(lapse.reps, 0); assert.equal(lapse.lapses, 1); assert.equal(lapse.ease, 2.3); assert.equal(lapse.due, now + 60e3);
assert.equal(schedule(fresh, 4, now).ivl, 4); assert.equal(schedule(fresh, 2, now).ivl, 1);
assert.ok(schedule({ ...c, ease: 1.3 }, 1, now).ease >= 1.3);
assert.ok(schedule({ reps: 9, ivl: 3000, ease: 3 }, 4, now).ivl <= 3650);
assert.equal(nextLabel(fresh, 1, now), '1 min'); assert.equal(nextLabel(fresh, 3, now), '1 d'); assert.equal(nextLabel({ reps: 5, ivl: 100, ease: 2.5 }, 3, now), '8 md');
assert.deepEqual(parseCards('a;b\nc;d\n\n;x\n'), [['a', 'b'], ['c', 'd']]);
assert.deepEqual(parseCards('Ohm\tΩ\r\nWatt\tW'), [['Ohm', 'Ω'], ['Watt', 'W']]);
assert.deepEqual(parseCards('"To linjer";"en\nto"\n"Med ""citat""";ok'), [['To linjer', 'en\nto'], ['Med "citat"', 'ok']]);
console.log('srs ok');
