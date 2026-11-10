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
const KIND = { chat: 'Tidligere samtale', note: 'Note', task: 'Opgave', event: 'Aftale', snippet: 'Kodestump', customer: 'Kunde', guide: 'Guide', lesson: 'Lektion', app: 'App i HUBTECH', term: 'IT-ordbog', command: 'Kommando', fix: 'Printerlægen', case: 'Fejlfindingscase', quiz: 'Quiz', fact: 'Opslag', help: 'Hjælp' };
const HREF = { chat: '#/apps/gnist', note: '#/apps/notes', task: '#/apps/tasks', event: '#/apps/calendar', snippet: '#/apps/snippets', customer: '#/apps/customers' };

/** HUBTECH's own material – every guide and every course lesson – as small text items (built once). */
let library = null;
export function libraryItems() {
  library ||= (async () => {
    const [{ GUIDES }, C, { APPS }, { GLOSSARY }, { COMMANDS, CMD_GROUPS, OS_LABEL }, { CODE_COURSES }, ST] = await Promise.all([
      import('../data/guides.js'), import('../data/courses.js'), import('../core/registry.js'), import('../data/glossary.js'),
      import('../data/commands.js'), import('../data/code-courses.js'), import('../data/course-servicetekniker.js')]);
    const { courses } = await C.loadAllCourses();
    const items = [];
    for (const g of GUIDES) items.push({ kind: 'guide', title: g.title, text: strip([g.summary, ...(g.sections || []).map(s => [s.h, s.p, ...(s.list || s.ul || []),
      ...(s.steps || []).map(x => `${x.t}: ${x.d}`), ...(s.table || []).flat(), s.callout?.text, s.code].filter(Boolean).join(': '))].join(' ')).slice(0, 3000), href: `#/learn/guide/${g.id}` });
    for (const c of [C.START_COURSE, ...courses]) {
      (c.days || []).forEach((d, i) => items.push({ kind: 'lesson', title: `${c.short || c.title}: ${d.t}`, text: strip([d.g, C.pointsText(d.l), (d.q || []).map(q => q.join(' ')).join(' ')].join(' ')).slice(0, 2500), href: `#/learn/course/${c.id}/day/${i + 1}` }));
    }
    // every app: what it does and where it is – "hvor kan jeg lave en faktura?"
    for (const a of APPS) {
      if (!a.route || a.status === 'hidden') continue;
      items.push({ kind: 'app', title: a.name, keys: (a.keywords || []).map(k => k.toLowerCase()), text: strip([`${a.name}: ${a.tagline || ''}`, a.description || '', (a.keywords || []).join(' ')].join(' ')).slice(0, 900), href: a.route });
    }
    // the IT dictionary: one item per word
    for (const [term, , text] of GLOSSARY) items.push({ kind: 'term', title: term, text: `${term}: ${text}`, href: '#/learn/glossary' });
    // commands, grouped like in the app (fx "Netværk – Windows")
    for (const [gid, glabel] of CMD_GROUPS.map(g => (Array.isArray(g) ? g : [g.id, g.label]))) {
      const cs = COMMANDS.filter(c => c.g === gid);
      if (cs.length) items.push({ kind: 'command', title: `Kommandoer: ${glabel}`, text: cs.map(c => `${c.cmd.replace(/\n/g, ' ; ')} (${OS_LABEL[c.os] || c.os}) – ${c.d}`).join(' | ').slice(0, 3000), href: '#/learn/commands' });
    }
    // Kodeskolen
    for (const c of CODE_COURSES) for (const l of c.lessons || []) items.push({ kind: 'lesson', title: `${c.title}: ${l.title}`, text: strip([l.body, l.task?.text || l.task || ''].join(' ')).slice(0, 2000), href: `#/learn/codeschool/${c.id}/${l.id}` });
    // more of HUBTECH's own material (each part on its own, so one that fails to load doesn't stop the rest)
    const more = async (path, fn) => { try { fn(await import(path)); } catch (e) { console.warn('[gnist] kunne ikke læse', path, e); } };
    await more('../data/helpfaq.js', ({ HELP }) => {   // how to use HUBTECH, and everyday IT trouble
      for (const x of HELP) items.push({ kind: 'help', title: x.q, text: `${x.q} ${x.a} ${x.k || ''}`, href: x.href });
    });
    await more('../data/printer-tree.js', ({ PROBLEMS, NODES }) => {   // the printer doctor: walk each fault tree
      for (const p of PROBLEMS) {
        const seen = new Set(), parts = [], todo = [p.start];
        while (todo.length && seen.size < 60) { const id = todo.shift(); if (!id || seen.has(id) || !NODES[id]) continue; seen.add(id); const n = NODES[id];
          if (n.q) parts.push(`Spørgsmål: ${n.q}${n.hint ? ` (${n.hint})` : ''}${n.code ? ` [${n.code}]` : ''}`); if (n.fix) parts.push(`Løsning – ${n.fix}: ${(n.steps || []).join(' ')}`); todo.push(n.yes, n.no); }
        items.push({ kind: 'fix', title: `${p.title} – ${p.sub}`, text: strip(parts.join(' ')).slice(0, 3000), href: '#/apps/printerdoctor' });
      }
    });
    await more('../features/labs.js', ({ CASES, NET_FAULTS }) => {   // the lab's cases: symptom, tests, answer and why
      for (const c of CASES || []) items.push({ kind: 'case', title: `${c.area}: ${c.title}`, text: strip([c.symptom, (c.tests || []).map(t => t.join(': ')).join(' '), `Årsag: ${c.options?.[c.a] || ''}.`, c.why].join(' ')).slice(0, 2500), href: '#/learn/labs' });
      if (NET_FAULTS?.length) items.push({ kind: 'case', title: 'Netværksfejl: sådan kender du dem', text: NET_FAULTS.map(f => `${f.label}: ${f.why}`).join(' '), href: '#/learn/labs' });
    });
    await more('../data/phishing.js', ({ SCENARIOS }) => {
      const tips = [...new Set((SCENARIOS || []).map(s => s.tip).filter(Boolean))];
      if (tips.length) items.push({ kind: 'guide', title: 'Sådan spotter du phishing og svindel', text: tips.join(' '), href: '#/learn/phishing' });
    });
    await more('../data/quizzes.js', ({ QUIZZES }) => {   // every question with the right answer and why
      for (const q of QUIZZES || []) items.push({ kind: 'quiz', title: `Quiz: ${q.title}`, text: (q.qs || []).map(([qq, opts, a, why]) => `${qq} Svar: ${opts[a]}. ${why || ''}`).join(' ').slice(0, 3500), href: '#/learn/quiz' });
    });
    // the servicetekniker course
    (ST.DAYS || []).forEach((d, i) => items.push({ kind: 'lesson', title: `Servicetekniker dag ${i + 1}: ${d.t}`, text: strip([d.g, (d.l || []).join(' '), (d.q || []).map(q => q.join(' ')).join(' ')].join(' ')).slice(0, 2500), href: `#/learn/course/servicetekniker/day/${i + 1}` }));
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

// two-letter words only when they are IT words ("ip adresse", "min pc") – and small verbs like "ser" and "får" say nothing
const SHORT = new Set(['ip', 'pc', 'it', 'ai', 'os', 'ad', 'tv', 'vm', '3d', '4g', '5g']);
const VERBS = new Set('ser får gør gøre går kommer står ved tror siger sker findes viser vise'.split(' '));   // not "skriver" (a printer), "bruger" (a user) or "finder" (the Mac's)
const words = (s) => String(s || '').toLowerCase().normalize('NFC').match(/[a-zæøå0-9]{2,}/g)?.filter(w => (w.length > 2 || SHORT.has(w)) && !STOP.has(w) && !VERBS.has(w)) || [];
/** Does the word x from a text match the asked word w? Long words by their stem; short ones only as themselves (+ an ending),
 *  so "ser" isn't "server" and "ram" isn't "rammeaftale". */
// Dansk sammensætning. Sidste led bestemmer hvad tingen ER ("varmepresse" er en presse), så det
// tæller fuldt; forleddet peger kun i retningen ("netværksprinter" er ikke en lektion om netværk),
// så det tæller halvt. Det korte led skal være mindst 4 tegn, ellers bliver "meningen" til "ingen".
const hits = (x, w, sammensat = true) => (w.length < 5 ? ((x === w || (x.startsWith(w) && x.length <= w.length + 2)) ? 1 : 0)
  : x.startsWith(w.slice(0, Math.max(4, w.length - 2))) ? 1
  : (sammensat && x.length >= 5 && w.length >= x.length + 4 && w.endsWith(x)) ? 1
  : (sammensat && x.length >= 5 && w.length >= x.length + 4 && w.startsWith(x)) ? 0.5 : 0)

/** How many letters must change to turn a into b (a swap of two neighbours counts as one) – stops early above max. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
// the words HUBTECH knows (from the items being searched), built once per list
const vocabs = new WeakMap();
function vocab(items) {
  let v = vocabs.get(items);
  if (!v) { v = new Set(); for (const it of items) { for (const w of words(it.title)) v.add(w); for (const w of words(it.text)) v.add(w); } vocabs.set(items, v); }
  return v;
}
/** Typos: each word that isn't known is matched to the closest known word. Returns Map(typed → meant). */
export function fixTypos(ws, items) {
  const v = vocab(items), out = new Map();
  for (const w of ws) {
    if (w.length < 4 || v.has(w) || /\d/.test(w) || STOP.has(w) || VERBS.has(w)) continue;   // "hvordan" skal ikke rettes til "hvoraf"
    const ascii = w.replace(/aa/g, 'å').replace(/oe/g, 'ø').replace(/ae/g, 'æ');   // "netvaerk" → "netværk"
    if (ascii !== w && v.has(ascii)) { out.set(w, ascii); continue; }
    const max = w.length >= 7 ? 2 : 1;
    let best = null, bd = max + 1;
    for (const x of v) {
      if (Math.abs(x.length - w.length) > max || x[0] !== w[0] && x[1] !== w[1]) continue;   // cheap filters first
      const d = editDistance(w, x, max);
      if (d < bd || (d === bd && best && x.length === w.length && best.length !== w.length)) { bd = d; best = x; if (d === 1 && x.length === w.length) break; }
    }
    if (best) out.set(w, best);
  }
  return out;
}

/** Pick the items most relevant to the question, within a character budget. */
export function retrieve(items, question, budget, { calendarish = false, page = '' } = {}) {
  const typed = words(question);
  const typos = fixTypos(typed, items);   // "pritner" is read as "printer"
  const asked = [...new Set(typed.map(w => typos.get(w) || w))];
  const extra = new Set(expandWords(asked).filter(w => !asked.includes(w)));
  const q = [...asked, ...extra];
  const gaet = new Set(typos.values());                 // stavekontrollen har gættet: så deler vi ikke ordet op oveni
  const egne = words(asked.join(' '));                  // indholdsord brugeren selv skrev
  // Ét langt, specifikt ord er et opslag ("tekstilfolie"), og brødtekst kan højst give 3 point,
  // så med krav om 6 kunne det aldrig findes. Et kort ord ("dag") er derimod et vagt spørgsmål,
  // og der skal HUBTECHs eget materiale ikke trænge sig på.
  const opslag = egne.length === 1 && egne[0].length >= 6;
  const kraev = (k) => (k === 'app' ? (opslag ? 6 : 9) : (opslag ? 4 : 6));
  const today = iso(new Date()), soon = iso(new Date(Date.now() + 14 * 864e5));
  const scored = items.map(it => {
    const t = words(it.title), b = words(it.text);
    let s = 0, syn = 0;
    for (const w of q) {
      const wt = extra.has(w) ? 0.5 : 1;   // a synonym counts, but less than the word the user wrote
      let p = 0;
      const tv = Math.max(0, ...t.map(x => hits(x, w, !gaet.has(w))));
      if (tv) p += 4 * wt * tv;
      p += Math.min(3, b.reduce((n, x) => n + hits(x, w, !gaet.has(w)), 0)) * wt;
      if (extra.has(w)) { p = Math.max(0, Math.min(p, 4 - syn)); syn += p; }   // synonymer må tilsammen højst give 4, så en bred tekst med mange beslægtede ord ikke slår den præcise
      s += p;
    }
    if (calendarish && (it.kind === 'event' && it.date >= today && it.date <= soon)) s += 3;
    if (calendarish && it.kind === 'task' && !it.done && it.due && it.due <= soon) s += 2;
    if (/prompt/i.test(it.title) && q.some(w => w.startsWith('prompt'))) s += 6;
    if (it.pinned) s += 0.5;
    // Appens navn eller et af dens håndplukkede søgeord: begge dele er at pege direkte på appen,
    // så begge giver samme bonus og sænker kravet fra 9 til 6. "faktura" er Kunders eget søgeord,
    // og kommentaren over app-emnerne siger netop "hvor kan jeg lave en faktura?".
    const pegerPaaApp = it.kind === 'app' && (asked.includes(it.title.toLowerCase()) || (it.keys || []).some(k => asked.includes(k)));
    if (pegerPaaApp) s += 3;   // the app's own name in the question ("skak") is a clear match
    if (it.kind === 'term') { const tw = words(it.title.replace(/\(.*?\)/g, ''));
      if (tw.length && tw.every(w => asked.some(a => a === w || (w.length >= 5 && a.length >= w.length + 4 && (a.endsWith(w) || a.startsWith(w)))))) s += 4; }   // "hvad er infill?" – og "tonerkassette" finder opslaget Toner   // "hvad er infill?" – the word itself is the question
    if (page && it.href && it.href.length > 7 && (page === it.href || page.startsWith(it.href + '/'))) s += it.kind === 'app' ? (s > 0 ? 3 : 0) : 30;   // only a real match – "#/" or "#/apps" is not "this page"   // "what does this mean?" on a lesson: that lesson first (the app you're in only nudges)
    // HUBTECH's own guides need a clear match (two words), so they don't crowd out the user's own data
    if (['guide', 'lesson', 'app', 'term', 'command', 'fix', 'case', 'quiz', 'fact', 'help'].includes(it.kind) && s < (pegerPaaApp ? 6 : kraev(it.kind))) s = 0;   // HUBTECH's own material only when it really fits
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
export function systemPrompt({ mode, context, facts, userName, style = 'points', compact = false, memory = '' }) {
  const now = new Date();
  // facts === null: the date, time and excerpts come with the question instead (questionBlock), so this prompt stays the
  // same between questions and the engine can reuse what it has already read – the answer starts much sooner
  const stable = facts === null;
  const base = `Du hedder Gnist og er HUBTECHs egen AI-assistent – "en lille gnist fra værkstedet". Du kører lokalt på ${userName ? userName + 's' : 'brugerens'} egen enhed, så ingen data forlader enheden.
Din personlighed: varm, nysgerrig og ligefrem – som en hjælpsom makker på værkstedet. Du er positiv uden at overdrive, siger tingene, som de er, og har en tør, venlig humor (højst én lille bemærkning, og aldrig når noget er alvorligt eller farligt). Du roser, når brugeren gør noget godt, og du siger "vi", når I løser noget sammen. Du bruger sjældent emojis (højst én ⚡ en gang imellem). ${userName ? `Brugeren hedder ${userName.split(' ')[0]} – brug navnet en gang imellem, ikke i hvert svar.` : ''}
Svar altid på dansk, kort og konkret. Brugeren skriver måske med stavefejl – forstå, hvad der menes, og ret ikke på stavningen. Opfind aldrig fakta om brugerens data – hvis du ikke kan se det i uddragene, så sig det. Spørger nogen, hvem du er, så fortæl, at du hedder Gnist, er HUBTECHs AI og kører på deres egen enhed.${stable ? '\nDato, klokkeslæt, den side brugeren er på og uddrag af brugerens data står sammen med hvert spørgsmål.' : `\nI dag er ${DAYS[now.getDay()]} ${iso(now)}, klokken er ${pad(now.getHours())}:${pad(now.getMinutes())}. Datoer: ${dateHelp()}.`}`;
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
  return `${base}${memory ? '\n' + memory : ''}
Du kan hjælpe med at planlægge kalenderen, skrive tekster, forklare teknik (IT, netværk, printere, lasere, 3D-print, elektronik, kode) og bruge brugerens egne noter, opgaver, aftaler, kodestumper og kunder samt HUBTECHs egne guides og kurser (uddrag herunder). Hvis brugeren henviser til en "prompt" i sine noter, så følg den.
Sådan svarer du godt:
${style === 'text' ? '- Svar i korte, klare afsnit.' : `- Start med selve svaret i én kort sætning. Skriv resten som korte punkter, der starter med "- ", og fremhæv nøgleord med **fed**. Er det en fremgangsmåde, så brug nummererede trin (1. 2. 3.). Del længere svar op med en kort overskrift ("## ..."). Hold hvert punkt på én linje.`}
- Bygger dit svar på en guide eller lektion, så nævn dens titel, så brugeren kan læse videre.
- Beder brugeren om en graf eller et diagram, så skriv den som en kodeblok, der starter med \`\`\`graf – en linje 'type: søjle' (eller linje eller cirkel), en linje 'titel: …' og så én linje pr. værdi som 'navn: tal'. HUBTECH tegner grafen.
- Er spørgsmålet uklart, så stil ét kort opklarende spørgsmål i stedet for at gætte.
- Ved du det ikke, så sig det ærligt – gæt aldrig på tal, priser, datoer eller indstillinger.
- Står der en udregning fra HUBTECH ved spørgsmålet, så brug de tal – regn ikke selv.
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
export function questionBlock(question, facts, { page = '', computed = [] } = {}) {
  const now = new Date();
  return `[I dag er ${DAYS[now.getDay()]} ${iso(now)} kl. ${pad(now.getHours())}:${pad(now.getMinutes())}. Datoer: ${dateHelp()}.${page ? ` Brugeren er på siden: ${page}.` : ''}]
${facts.length ? `[Uddrag af brugerens data og HUBTECHs guides:\n${facts.join('\n')}]` : '[Ingen af brugerens data eller guides passede til spørgsmålet.]'}
${computed.length ? `[Udregnet præcist af HUBTECH – brug præcis disse tal i dit svar:\n${computed.map(c => '- ' + c).join('\n')}]\n` : ''}
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


/** Does the question point at the page ("forklar det her", "hvad står der på siden", "opsummer siden")? */
export function asksAboutPage(q) { return /\b(det her|denne side|siden|skærmen|opsummer|resumé af|forklar (det|denne|dette|lektionen|opgaven)|hvad står der|hvad betyder det(te)?)\b/i.test(String(q || '')); }
