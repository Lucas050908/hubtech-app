// node tests/ai.test.mjs – the AI assistant's action parsing, teacher-mode code guard and RAM-based model choice
import assert from 'node:assert/strict';
import { parseActions, normalizeAction, guardCode, describe } from '../web/js/ai/actions.js';
import { MODELS, pickFor, ramFor } from '../web/js/ai/models.js';

const GB = 1073741824;
// actions
let r = parseActions('Jeg foreslår en aftale.\n<handling>{"type":"aftale","titel":"Tandlæge","dato":"2026-10-21","start":"10:00","slut":"10.45","sted":"Vejle"}</handling>');
assert.equal(r.text, 'Jeg foreslår en aftale.');
assert.deepEqual(r.actions, [{ type: 'event', title: 'Tandlæge', date: '2026-10-21', start: '10:00', end: '10:45', location: 'Vejle', notes: '' }]);
r = parseActions('Her:\n```json\n{"type": "opgave", "titel": "Ring til Jensen", "frist": "2026-10-23",}\n```');
assert.equal(r.actions[0].type, 'task'); assert.equal(r.actions[0].due, '2026-10-23'); assert.equal(r.text, 'Her:');
r = parseActions('<handling>{"type":"note","titel":"Ideer","tekst":"1. mere RAM"}</handling><handling>{"type":"åbn","side":"kalender"}</handling>');
assert.deepEqual(r.actions.map(a => a.type), ['note', 'open']); assert.equal(r.actions[1].path, '/apps/calendar');
assert.equal(parseActions('<handling>{"type":"aftale","titel":"x","dato":"i morgen"}</handling>').actions.length, 0);   // invalid date
assert.equal(parseActions('<handling>{"type":"slet-alt"}</handling>').actions.length, 0);                              // unknown type
assert.equal(parseActions('<handling>{"type":"åbn","side":"/etc/passwd"}</handling>').actions.length, 0);              // only known pages
assert.equal(parseActions('Svar … <handling>{"type":"aft').text, 'Svar …');                                          // half-streamed
assert.equal(normalizeAction({ type: 'aftale', titel: 'Møde', dato: '2026-10-22', start: '9:5' }).start, null);
assert.equal(normalizeAction({ type: 'aftale', titel: 'Møde', dato: '2026-10-22', start: '9:05' }).start, '09:05');
assert.match(describe(normalizeAction({ type: 'opgave', titel: 'A' })).text, /Ingen frist/);
// teacher mode hides longer code
const g = guardCode('Prøv:\n```python\nprint(1)\n```\nog\n```python\na = 1\nb = 2\nc = 3\nprint(a+b+c)\n```');
assert.equal(g.hidden.length, 1); assert.ok(g.text.includes('print(1)')); assert.ok(g.text.includes('[[skjult-kode-0]]'));
// model choice from a RAM limit
assert.equal(pickFor(0.5 * GB).model.id, 'qwen05');
assert.equal(pickFor(0.75 * GB).model.id, 'qwen05');
assert.equal(pickFor(1 * GB).model.id, 'llama1b');
assert.equal(pickFor(1.5 * GB).model.id, 'qwen15');
assert.equal(pickFor(2 * GB).model.id, 'qwen15');
assert.equal(pickFor(3 * GB).model.id, 'llama3b');
for (const lim of [0.75, 1, 1.5, 2, 2.5, 3, 4]) { const p = pickFor(lim * GB); assert.ok(p.ram <= lim * GB, `fits ${lim}`); }
assert.ok(pickFor(0.2 * GB).tooSmall);
assert.ok(ramFor(MODELS[0], 4096) > ramFor(MODELS[0], 1024));
console.log('ai ok');
// App-værkstedet: files in the answer
import { extractFiles } from '../web/js/ai/actions.js';
let x = extractFiles('Her er appen:\n```html index.html\n<h1>Hej</h1>\n```\nOg stil:\n```css\nh1{color:red}\n```\n```js\n// app.js\nconsole.log(1)\n```\n```bash\nls\n```');
assert.deepEqual(x.files.map(f => f.name), ['index.html', 'style.css', 'app.js']);
assert.equal(x.files[0].code, '<h1>Hej</h1>');
assert.ok(x.text.includes('[[fil-0]]') && x.text.includes('```bash'));
x = extractFiles('```spil.js\nlet a\n```');
assert.equal(x.files[0].name, 'spil.js');
assert.equal(extractFiles('```js ../../etc.js\nx\n```').files[0].name, 'app.js');
console.log('studio ai ok');
