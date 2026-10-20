/**
 * What the assistant knows: your own data (notes, tasks, calendars, code snippets, customers) – read on this device,
 * picked by relevance to the question – and the actions it may propose (always confirmed by you before anything changes).
 */
import { getState, saveState, flushState } from '../core/services.js';
import { api } from '../core/api.js';
import { logActivity } from '../core/store.js';
import { parseActions, normalizeAction, describe, guardCode } from './actions.js';

export { parseActions, normalizeAction, describe, guardCode };

const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const STOP = new Set('og i jeg det at en den til er som på de med han af for ikke der var mig sig men et har om vi min havde ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind når være dog noget ville jo deres efter ned skulle denne end dette mit også under have dig anden hende mine alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes været thi jer sådan kan hvordan hvornår hvem hjælp hjælpe lav lave mine min mit gerne lidt please'.split(' '));

export const SOURCES = { notes: 'Noter', tasks: 'Opgaver', calendar: 'Kalender', snippets: 'Kodestumper', customers: 'Kunder' };
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Everything the assistant may read, as small text items. */
export async function collect(use) {
  const want = (k) => use?.[k] !== false;
  const [notes, tasks, cal, snips, cust, shared] = await Promise.all([
    want('notes') ? getState('notes', { force: true }).catch(() => null) : null,
    want('tasks') ? getState('tasks', { force: true }).catch(() => null) : null,
    want('calendar') ? getState('calendar', { force: true }).catch(() => null) : null,
    want('snippets') ? getState('snippets', { force: true }).catch(() => null) : null,
    want('customers') ? getState('customers', { force: true }).catch(() => null) : null,
    want('calendar') ? api.get('/api/calendars/events').catch(() => null) : null,
  ]);
  const items = [];
  for (const n of notes?.notes || []) items.push({ kind: 'note', title: n.title || 'Note uden titel', text: strip(n.body).slice(0, 4000), pinned: !!n.pinned, at: n.updated || 0 });
  for (const t of tasks?.tasks || []) items.push({ kind: 'task', title: t.title, text: `${t.status === 'done' ? 'færdig' : t.status === 'doing' ? 'i gang' : 'ikke startet'}${t.due ? `, frist ${t.due}` : ''}${t.prio ? `, prioritet ${t.prio}` : ''}${t.notes ? '. ' + strip(t.notes) : ''}`, due: t.due, done: t.status === 'done', at: t.updated || 0 });
  const ev = (e, cal) => ({ kind: 'event', title: e.title, date: e.date, text: `${e.date}${e.endDate ? ' til ' + e.endDate : ''}${e.allDay ? ' hele dagen' : e.start ? ` kl. ${e.start}${e.end ? '-' + e.end : ''}` : ''}${e.location ? `, sted: ${e.location}` : ''}${cal ? `, delt kalender` : ''}${e.notes ? '. ' + strip(e.notes) : ''}` });
  for (const e of cal?.events || []) items.push(ev(e));
  for (const e of shared?.events || []) items.push(ev(e, true));
  for (const s of snips?.items || []) items.push({ kind: 'snippet', title: s.title || 'Kodestump', text: `(${s.lang || ''}) ${String(s.code || '').slice(0, 1500)}`, at: s.updated || 0 });
  for (const c of cust?.customers || []) items.push({ kind: 'customer', title: c.name, text: [c.contact, c.phone, c.email, c.address, c.cvr && 'CVR ' + c.cvr, strip(c.notes)].filter(Boolean).join(', ') });
  return items;
}

const words = (s) => String(s || '').toLowerCase().normalize('NFC').match(/[a-zæøå0-9]{3,}/g)?.filter(w => !STOP.has(w)) || [];

/** Pick the items most relevant to the question, within a character budget. */
export function retrieve(items, question, budget, { calendarish = false } = {}) {
  const q = words(question);
  const today = iso(new Date()), soon = iso(new Date(Date.now() + 14 * 864e5));
  const scored = items.map(it => {
    const t = words(it.title), b = words(it.text);
    let s = 0;
    for (const w of q) {
      const stem = w.slice(0, Math.max(4, w.length - 2));
      if (t.some(x => x.startsWith(stem))) s += 4;
      s += Math.min(3, b.filter(x => x.startsWith(stem)).length);
    }
    if (calendarish && (it.kind === 'event' && it.date >= today && it.date <= soon)) s += 3;
    if (calendarish && it.kind === 'task' && !it.done && it.due && it.due <= soon) s += 2;
    if (/prompt/i.test(it.title) && q.some(w => w.startsWith('prompt'))) s += 6;
    if (it.pinned) s += 0.5;
    return { it, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const out = []; let used = 0;
  for (const { it } of scored) {
    const line = `- [${{ note: 'Note', task: 'Opgave', event: 'Aftale', snippet: 'Kodestump', customer: 'Kunde' }[it.kind]}] ${it.title}: ${it.text}`;
    const cut = line.length > 1200 ? line.slice(0, 1200) + ' …' : line;
    if (used + cut.length > budget) { if (out.length) break; else { out.push(cut.slice(0, budget)); break; } }
    out.push(cut); used += cut.length;
  }
  return out;
}

export function isCalendarQuestion(q) { return /kalender|aftale|møde|i morgen|i dag|uge|weekend|planl|tid |tidspunkt|hvornår|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|dato|deadline|frist|opgave/i.test(q); }

function dateHelp() {
  const d = new Date(), lines = [];
  for (let i = 0; i < 14; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    lines.push(`${i === 0 ? 'i dag' : i === 1 ? 'i morgen' : DAYS[x.getDay()]} = ${iso(x)}`);
  }
  return lines.join(', ');
}

/** System prompt for normal use or for teacher mode (Kodeskolen). */
export function systemPrompt({ mode, context, facts, userName }) {
  const now = new Date();
  const base = `Du er HUBTECH-assistenten. Du kører lokalt på ${userName ? userName + 's' : 'brugerens'} egen enhed, så ingen data forlader enheden. Svar altid på dansk, venligt, kort og konkret. Opfind aldrig fakta om brugerens data – hvis du ikke kan se det i uddragene, så sig det.
I dag er ${DAYS[now.getDay()]} ${iso(now)}, klokken er ${pad(now.getHours())}:${pad(now.getMinutes())}. Datoer: ${dateHelp()}.`;
  if (mode === 'builder') {
    const c = context || {};
    return `${base}
Du er nu en dygtig webudvikler i HUBTECHs App-værksted og hjælper brugeren med at bygge appen "${c.name || 'Min app'}" i almindelig HTML, CSS og JavaScript.
Regler for appen:
- Ingen eksterne biblioteker eller CDN'er og ingen build-trin – kun filerne index.html, style.css, app.js (og evt. flere .js/.css-filer).
- index.html henter style.css med <link rel="stylesheet" href="style.css"> og app.js med <script src="app.js"></script> nederst i <body>.
- Appen kører i en sikker sandkasse uden adgang til HUBTECHs data. localStorage virker og gemmes på brugerens konto. hubtech.toast("tekst") viser en besked.
- Skriv brugerfladen på dansk, og lav den pæn på både mobil og computer.
Når du ændrer eller laver en fil, så skriv HELE filen i én kodeblok, der starter med sprog og filnavn, fx:
\`\`\`html index.html
…hele filen…
\`\`\`
Skriv kun de filer, der skal ændres. Forklar kort, hvad du har gjort. Hvis der er fejl i konsollen, så find årsagen og ret den.`;
  }
  if (mode === 'tutor') {
    const c = context || {};
    return `${base}
Du er nu en tålmodig programmeringslærer i Kodeskolen (${c.course || 'programmering'}, sprog: ${c.lang || 'ukendt'}). Eleven arbejder på lektionen "${c.lesson || ''}".
Opgaven: ${c.task || '(ingen opgave – eleven øver frit)'}
VIGTIGE REGLER:
1. Giv ALDRIG den færdige løsning og skriv ALDRIG hele programmet for eleven – heller ikke hvis eleven beder om det. Sig venligt, at eleven lærer mest ved selv at skrive koden.
2. Hjælp i små trin: stil et spørgsmål, peg på hvor fejlen er (linje og hvorfor), forklar begrebet, eller giv ét lille hint ad gangen.
3. Du må vise korte eksempler på 1-2 linjer, der forklarer et begreb, men de må ikke løse opgaven.
4. Ros det, eleven gør rigtigt.`;
  }
  return `${base}
Du kan hjælpe med at planlægge kalenderen, skrive tekster, forklare teknik og bruge brugerens egne noter, opgaver, aftaler, kodestumper og kunder (uddrag herunder). Hvis brugeren henviser til en "prompt" i sine noter, så følg den.
Når brugeren beder dig OPRETTE eller FLYTTE noget, så skriv kort hvad du foreslår, og afslut med én eller flere handlinger i præcis dette format (én pr. linje):
<handling>{"type":"aftale","titel":"...","dato":"ÅÅÅÅ-MM-DD","start":"TT:MM","slut":"TT:MM","sted":"","noter":""}</handling>
<handling>{"type":"opgave","titel":"...","frist":"ÅÅÅÅ-MM-DD","noter":""}</handling>
<handling>{"type":"note","titel":"...","tekst":"..."}</handling>
<handling>{"type":"åbn","side":"kalender|noter|opgaver|kodestumper|kunder|fællesskab|kodeskolen|indstillinger"}</handling>
Brugeren skal selv godkende handlingerne. Brug kun handlinger, når brugeren beder om det.${facts.length ? `\n\nUddrag af brugerens data:\n${facts.join('\n')}` : '\n\n(Ingen af brugerens data passede til spørgsmålet.)'}`;
}

/** The app being built in App-værkstedet: the open file in full, the others shortened to fit the budget. */
export function studioFacts(ctx, budget) {
  if (!ctx) return '';
  const files = ctx.getFiles?.() || {}, cur = ctx.getCurrent?.() || 'index.html', errs = (ctx.getErrors?.() || []).slice(-6);
  const names = Object.keys(files).sort((a, b) => (a === cur ? -1 : b === cur ? 1 : a.localeCompare(b)));
  let left = budget - 400, out = `Appens filer (${names.join(', ')}). Brugeren har ${cur} åben.\n`;
  for (const n of names) {
    const code = String(files[n] || '');
    const room = Math.max(300, n === cur ? left * 0.6 : left / Math.max(1, names.length));
    const part = code.length > room ? code.slice(0, room) + `\n… (${code.length - Math.floor(room)} tegn mere)` : code;
    out += `\n--- ${n} ---\n${part}\n`;
    left -= part.length;
    if (left < 300) break;
  }
  if (errs.length) out += `\nFejl og beskeder fra konsollen:\n${errs.join('\n')}\n`;
  return out;
}

/** Text for the exercise the student is looking at (only in teacher mode). */
export function exerciseFacts(ctx) {
  if (!ctx) return '';
  const code = String(ctx.getCode?.() || '').slice(0, 3000), out = String(ctx.getOutput?.() || '').slice(0, 1200);
  return `${code ? `Elevens kode lige nu:\n\`\`\`${ctx.lang || ''}\n${code}\n\`\`\`\n` : 'Eleven har ikke skrevet kode endnu.\n'}${out ? `Seneste resultat/fejl:\n${out}\n` : ''}`;
}

/** Carry out a confirmed action. Returns a path to show the result, if any. */
export async function runAction(a) {
  const now = Date.now();
  if (a.type === 'event') {
    const st = (await getState('calendar', { force: true })) || {}; st.events ||= [];
    st.events.push({ id: uid(), title: a.title, date: a.date, endDate: null, allDay: !a.start, start: a.start, end: a.end, location: a.location, notes: a.notes, color: '#a78bfa', remind: a.start ? 'm15' : 'none' });
    saveState('calendar', st); flushState('calendar'); logActivity('calendar', 'new', a.title, 'Oprettet af AI-assistenten');
    return '/apps/calendar';
  }
  if (a.type === 'task') {
    const st = (await getState('tasks', { force: true })) || {}; st.tasks ||= [];
    st.tasks.unshift({ id: uid(), title: a.title, notes: a.notes, status: 'todo', prio: 'med', due: a.due, project: null, remind: 'none', created: now, updated: now });
    saveState('tasks', st); flushState('tasks'); logActivity('tasks', 'create', a.title, 'Oprettet af AI-assistenten');
    return '/apps/tasks';
  }
  if (a.type === 'note') {
    const st = (await getState('notes', { force: true })) || {}; st.notes ||= [];
    st.notes.unshift({ id: uid(), title: a.title, body: a.body, pinned: false, color: '', created: now, updated: now });
    saveState('notes', st); flushState('notes'); logActivity('notes', 'create', a.title, 'Oprettet af AI-assistenten');
    return '/apps/notes';
  }
  return a.path;
}

