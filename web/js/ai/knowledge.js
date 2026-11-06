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

export const SOURCES = { chats: 'Tidligere samtaler med Gnist', guides: 'HUBTECHs guides og kurser', notes: 'Noter', tasks: 'Opgaver', calendar: 'Kalender', snippets: 'Kodestumper', customers: 'Kunder' };
const KIND = { chat: 'Tidligere samtale', note: 'Note', task: 'Opgave', event: 'Aftale', snippet: 'Kodestump', customer: 'Kunde', guide: 'Guide', lesson: 'Lektion' };
const HREF = { chat: '#/apps/gnist', note: '#/apps/notes', task: '#/apps/tasks', event: '#/apps/calendar', snippet: '#/apps/snippets', customer: '#/apps/customers' };

/** HUBTECH's own material – every guide and every course lesson – as small text items (built once). */
let library = null;
export function libraryItems() {
  library ||= (async () => {
    const [{ GUIDES }, C] = await Promise.all([import('../data/guides.js'), import('../data/courses.js')]);
    const { courses } = await C.loadAllCourses();
    const items = [];
    for (const g of GUIDES) items.push({ kind: 'guide', title: g.title, text: strip([g.summary, ...(g.sections || []).map(s => [s.h, s.p, ...(s.list || s.ul || [])].filter(Boolean).join(': '))].join(' ')).slice(0, 3000), href: `#/learn/guide/${g.id}` });
    for (const c of [C.START_COURSE, ...courses]) {
      (c.days || []).forEach((d, i) => items.push({ kind: 'lesson', title: `${c.short || c.title}: ${d.t}`, text: strip([d.g, C.pointsText(d.l), (d.q || []).map(q => q.join(' ')).join(' ')].join(' ')).slice(0, 2500), href: `#/learn/course/${c.id}/day/${i + 1}` }));
    }
    return items;
  })().catch(() => []);
  return library;
}
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Everything the assistant may read, as small text items. */
export async function collect(use) {
  const want = (k) => use?.[k] !== false;
  const [notes, tasks, cal, snips, cust, shared, gn] = await Promise.all([
    want('notes') ? getState('notes', { force: true }).catch(() => null) : null,
    want('tasks') ? getState('tasks', { force: true }).catch(() => null) : null,
    want('calendar') ? getState('calendar', { force: true }).catch(() => null) : null,
    want('snippets') ? getState('snippets', { force: true }).catch(() => null) : null,
    want('customers') ? getState('customers', { force: true }).catch(() => null) : null,
    want('calendar') ? api.get('/api/calendars/events').catch(() => null) : null,
    want('chats') ? getState('gnist', { force: true }).catch(() => null) : null,
  ]);
  const items = want('guides') ? [...await libraryItems()] : [];
  // earlier conversations – with any model, small or big – so Gnist remembers what you talked about
  for (const c of gn?.chats || []) items.push({ kind: 'chat', title: c.title, at: c.at, text: c.messages.map(m => `${m.role === 'user' ? 'Brugeren' : 'Gnist'}: ${strip(m.content).slice(0, 600)}`).join(' | ').slice(0, 3000) });
  for (const n of notes?.notes || []) items.push({ kind: 'note', title: n.title || 'Note uden titel', text: strip(n.body).slice(0, 4000), pinned: !!n.pinned, at: n.updated || 0 });
  for (const t of tasks?.tasks || []) items.push({ kind: 'task', title: t.title, text: `${t.status === 'done' ? 'færdig' : t.status === 'doing' ? 'i gang' : 'ikke startet'}${t.due ? `, frist ${t.due}` : ''}${t.prio ? `, prioritet ${t.prio}` : ''}${t.notes ? '. ' + strip(t.notes) : ''}`, due: t.due, done: t.status === 'done', at: t.updated || 0 });
  const ev = (e, cal) => ({ kind: 'event', title: e.title, date: e.date, text: `${e.repeat?.freq ? `gentages (${{ day: 'hver dag', weekday: 'hverdage', week: 'hver uge', '2week': 'hver anden uge', month: 'hver måned', year: 'hvert år' }[e.repeat.freq]}${e.repeat.until ? ' til ' + e.repeat.until : ''}) fra ` : ''}${e.date}${e.endDate ? ' til ' + e.endDate : ''}${e.allDay ? ' hele dagen' : e.start ? ` kl. ${e.start}${e.end ? '-' + e.end : ''}` : ''}${e.location ? `, sted: ${e.location}` : ''}${cal ? `, delt kalender` : ''}${e.notes ? '. ' + strip(e.notes) : ''}` });
  for (const e of cal?.events || []) items.push(ev(e));
  for (const e of shared?.events || []) items.push(ev(e, true));
  for (const s of snips?.items || []) items.push({ kind: 'snippet', title: s.title || 'Kodestump', text: `(${s.lang || ''}) ${String(s.code || '').slice(0, 1500)}`, at: s.updated || 0 });
  for (const c of cust?.customers || []) items.push({ kind: 'customer', title: c.name, text: [c.contact, c.phone, c.email, c.address, c.cvr && 'CVR ' + c.cvr, strip(c.notes)].filter(Boolean).join(', ') });
  return items;
}

// words that mean the same thing in a question and in HUBTECH's guides (Danish and English, everyday and technical)
const SYNONYMS = [
  ['printer', 'skriver', 'print', 'printe', 'udskrift', 'toner', 'blæk'],
  ['wifi', 'trådløs', 'trådløst', 'wlan', 'netværk', 'router', 'internet', 'forbindelse'],
  ['laser', 'laserskærer', 'gravering', 'gravere', 'lightburn', 'co2', 'fiber', 'diode'],
  ['3d', 'filament', 'slicer', 'bambu', 'creality', 'dyse', 'nozzle'],
  ['computer', 'pc', 'maskine', 'bærbar', 'laptop', 'windows'],
  ['fejl', 'problem', 'virker', 'fungerer', 'error', 'galt', 'stopper', 'går'],
  ['kode', 'program', 'programmere', 'script', 'python', 'javascript'],
  ['kodeord', 'adgangskode', 'password', 'login', 'logge'],
  ['strøm', 'spænding', 'volt', 'ampere', 'modstand', 'ohm', 'kredsløb'],
  ['fokus', 'fokusere', 'brændvidde', 'højde'],
  ['skære', 'skæring', 'cut', 'skærer', 'gennem'],
  ['kalender', 'aftale', 'aftaler', 'møde', 'tid'],
  ['opgave', 'opgaver', 'todo', 'deadline'],
];
const SYN = new Map();
for (const g of SYNONYMS) for (const w of g) SYN.set(w, g);
export function expandWords(ws) {
  const out = new Set(ws);
  for (const w of ws) for (const x of SYN.get(w) || []) out.add(x);
  return [...out];
}

const words = (s) => String(s || '').toLowerCase().normalize('NFC').match(/[a-zæøå0-9]{3,}/g)?.filter(w => !STOP.has(w)) || [];

/** Pick the items most relevant to the question, within a character budget. */
export function retrieve(items, question, budget, { calendarish = false, page = '' } = {}) {
  const asked = words(question);
  const extra = new Set(expandWords(asked).filter(w => !asked.includes(w)));
  const q = [...asked, ...extra];
  const today = iso(new Date()), soon = iso(new Date(Date.now() + 14 * 864e5));
  const scored = items.map(it => {
    const t = words(it.title), b = words(it.text);
    let s = 0;
    for (const w of q) {
      const stem = w.slice(0, Math.max(4, w.length - 2));
      const wt = extra.has(w) ? 0.5 : 1;   // a synonym counts, but less than the word the user wrote
      if (t.some(x => x.startsWith(stem))) s += 4 * wt;
      s += Math.min(3, b.filter(x => x.startsWith(stem)).length) * wt;
    }
    if (calendarish && (it.kind === 'event' && it.date >= today && it.date <= soon)) s += 3;
    if (calendarish && it.kind === 'task' && !it.done && it.due && it.due <= soon) s += 2;
    if (/prompt/i.test(it.title) && q.some(w => w.startsWith('prompt'))) s += 6;
    if (it.pinned) s += 0.5;
    if (page && it.href && page.startsWith(it.href)) s += 30;   // "what does this mean?" on a lesson: that lesson first
    // HUBTECH's own guides need a clear match (two words), so they don't crowd out the user's own data
    if ((it.kind === 'guide' || it.kind === 'lesson') && s < 6) s = 0;
    return { it, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const out = []; let used = 0;
  out.sources = [];
  for (const { it } of scored) {
    const line = `- [${KIND[it.kind]}] ${it.title}: ${it.text}`;
    const cut = line.length > 1200 ? line.slice(0, 1200) + ' …' : line;
    if (used + cut.length > budget) { if (out.length) break; else { out.push(cut.slice(0, budget)); out.sources.push(source(it)); break; } }
    out.push(cut); used += cut.length; out.sources.push(source(it));
  }
  return out;
}

const source = (it) => ({ kind: it.kind, label: KIND[it.kind], title: it.title, href: it.href || HREF[it.kind] || '' });

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
export function systemPrompt({ mode, context, facts, userName, style = 'points', compact = false }) {
  const now = new Date();
  // facts === null: the date, time and excerpts come with the question instead (questionBlock), so this prompt stays the
  // same between questions and the engine can reuse what it has already read – the answer starts much sooner
  const stable = facts === null;
  const base = `Du hedder Gnist og er HUBTECHs egen AI-assistent – "en lille gnist fra værkstedet". Du kører lokalt på ${userName ? userName + 's' : 'brugerens'} egen enhed, så ingen data forlader enheden.
Din personlighed: varm, nysgerrig og ligefrem – som en hjælpsom makker på værkstedet. Du er positiv uden at overdrive, siger tingene, som de er, og har en tør, venlig humor (højst én lille bemærkning, og aldrig når noget er alvorligt eller farligt). Du roser, når brugeren gør noget godt, og du siger "vi", når I løser noget sammen. Du bruger sjældent emojis (højst én ⚡ en gang imellem). ${userName ? `Brugeren hedder ${userName.split(' ')[0]} – brug navnet en gang imellem, ikke i hvert svar.` : ''}
Svar altid på dansk, kort og konkret. Opfind aldrig fakta om brugerens data – hvis du ikke kan se det i uddragene, så sig det. Spørger nogen, hvem du er, så fortæl, at du hedder Gnist, er HUBTECHs AI og kører på deres egen enhed.${stable ? '\nDato, klokkeslæt, den side brugeren er på og uddrag af brugerens data står sammen med hvert spørgsmål.' : `\nI dag er ${DAYS[now.getDay()]} ${iso(now)}, klokken er ${pad(now.getHours())}:${pad(now.getMinutes())}. Datoer: ${dateHelp()}.`}`;
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
Du kan hjælpe med at planlægge kalenderen, skrive tekster, forklare teknik (IT, netværk, printere, lasere, 3D-print, elektronik, kode) og bruge brugerens egne noter, opgaver, aftaler, kodestumper og kunder samt HUBTECHs egne guides og kurser (uddrag herunder). Hvis brugeren henviser til en "prompt" i sine noter, så følg den.
Sådan svarer du godt:
${style === 'text' ? '- Svar i korte, klare afsnit.' : `- Start med selve svaret i én kort sætning. Skriv resten som korte punkter, der starter med "- ", og fremhæv nøgleord med **fed**. Er det en fremgangsmåde, så brug nummererede trin (1. 2. 3.). Del længere svar op med en kort overskrift ("## ..."). Hold hvert punkt på én linje.`}
- Bygger dit svar på en guide eller lektion, så nævn dens titel, så brugeren kan læse videre.
- Er spørgsmålet uklart, så stil ét kort opklarende spørgsmål i stedet for at gætte.
- Ved du det ikke, så sig det ærligt – gæt aldrig på tal, priser, datoer eller indstillinger.
${style === 'text' || compact ? '' : `Eksempel på et godt svar:
Spørgsmål: Min printer er offline – hvad gør jeg?
Svar: Det skyldes oftest forbindelsen – lad os tjekke den først.
1. Se om printeren er tændt og viser **klar** i displayet.
2. Tjek **netværket**: står printeren på samme wifi som computeren?
3. Genstart **printerkøen** på computeren (Indstillinger → Printere).
4. Hjælper det ikke, så fjern printeren og tilføj den igen.
Se guiden "Printer-support" for flere trin.`}
Når brugeren beder dig OPRETTE eller FLYTTE noget, så skriv kort hvad du foreslår, og afslut med én eller flere handlinger i præcis dette format (én pr. linje):
<handling>{"type":"aftale","titel":"...","dato":"ÅÅÅÅ-MM-DD","start":"TT:MM","slut":"TT:MM","sted":"","noter":""}</handling>
<handling>{"type":"opgave","titel":"...","frist":"ÅÅÅÅ-MM-DD","noter":""}</handling>
<handling>{"type":"note","titel":"...","tekst":"..."}</handling>
<handling>{"type":"åbn","side":"kalender|noter|opgaver|kodestumper|kunder|fællesskab|kodeskolen|indstillinger"}</handling>
Brugeren skal selv godkende handlingerne. Brug kun handlinger, når brugeren beder om det.${stable ? '' : facts.length ? `\n\nUddrag af brugerens data:\n${facts.join('\n')}` : '\n\n(Ingen af brugerens data passede til spørgsmålet.)'}`;
}

/** What goes with each question when the system prompt is stable: date and time, the page, the excerpts – and the question. */
export function questionBlock(question, facts, { page = '' } = {}) {
  const now = new Date();
  return `[I dag er ${DAYS[now.getDay()]} ${iso(now)} kl. ${pad(now.getHours())}:${pad(now.getMinutes())}. Datoer: ${dateHelp()}.${page ? ` Brugeren er på siden: ${page}.` : ''}]
${facts.length ? `[Uddrag af brugerens data og HUBTECHs guides:\n${facts.join('\n')}]` : '[Ingen af brugerens data eller guides passede til spørgsmålet.]'}

${question}`;
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

