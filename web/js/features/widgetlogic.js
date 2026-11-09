/** Pure parts of the top-bar widgets: defaults and streak counting (tested in tests/apps.test.mjs). */
import { occurrenceOn } from './calrecur.js';

// the cards on Hjem: the desert design's overview first (on by default), the older cards after (off, can be switched on)
export const HOME_CARDS = [
  ['clock', 'Ur, vejr og hilsen'], ['stats', 'Nøgletal'], ['today', 'I dag'], ['resume', 'Fortsæt hvor du slap'],
  ['hero', 'Velkomst'], ['apps', 'Dine apps'], ['together', 'Sammen med andre'], ['previews', 'Projekter og læring'], ['seasons', 'Årstider'],
  ['profile', 'Profil og level'], ['activity', 'Seneste aktiviteter'], ['shortcuts', 'Hurtige genveje'], ['world', 'Verdenen'],
];
const HOME_ON = new Set(['clock', 'stats', 'today', 'resume']);

export const WIDGET_DEFAULTS = {
  music: true, musicMode: 'title',            // compact | title
  streak: true, streakMode: 'learn',          // learn | active | chess
  online: true, onlineMode: 'avatars',        // avatars | count | hubs
  weather: false, weatherMode: 'full',        // full | temp – in the top bar (Hjem shows it by the clock)
  city: '',
  home: Object.fromEntries(HOME_CARDS.map(([k]) => [k, HOME_ON.has(k)])),
};
/** The dock at the bottom: which places, in which order, and how many are shown. 'home', 'learn' and 'apps' are places; the rest are app ids. */
export const DOCK_DEFAULT = ['home', 'projects', 'hubtech', 'calendar', 'tasks', 'learn', 'gnist', 'apps'];
export const DOCK_MIN = 2, DOCK_MAX = 12;
export function dockIds(w = {}) {
  const list = Array.isArray(w.dock) && w.dock.length ? w.dock.filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i) : DOCK_DEFAULT;
  const n = Math.max(DOCK_MIN, Math.min(DOCK_MAX, Number(w.dockCount) || DOCK_DEFAULT.length));
  return list.slice(0, n);
}

/** bumped when HUBTECH gets a new look: everyone moves to it once (and can choose otherwise after) */
export const LOOK_VERSION = 2;

const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const WD = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

/** The four numbers on Hjem from the apps' states (pure, tested). */
export function buildStats({ calendar, tasks, timesheet, summary }, now = Date.now()) {
  const today = iso(now);
  const open = (tasks?.tasks || []).filter(t => t.status !== 'done');
  const dueToday = open.filter(t => t.due === today).length, late = open.filter(t => t.due && t.due < today).length;
  const cases = { value: String(open.length), sub: late ? `${late} overskredet` : dueToday ? `${dueToday} med deadline i dag` : open.length ? 'Ingen haster' : 'Alt er klaret', warn: late > 0, href: '#/apps/tasks' };
  // next appointment from now (the next 30 days, repeating ones too)
  let next = null;
  const nowHM = new Date(now).toTimeString().slice(0, 5);
  for (let i = 0; i < 31 && !next; i++) {
    const day = iso(now + i * 86400e3);
    const hits = (calendar?.events || []).map(e => occurrenceOn(e, day)).filter(Boolean)
      .filter(e => i > 0 || e.allDay || !e.start || e.start >= nowHM)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    if (hits.length) next = { e: hits[0], i, day };
  }
  const when = next ? (next.i === 0 ? '' : next.i === 1 ? 'I morgen · ' : `${WD[new Date(next.day + 'T12:00').getDay()]} ${Number(next.day.slice(8))}/${Number(next.day.slice(5, 7))} · `) : '';
  const appt = next ? { value: next.e.allDay || !next.e.start ? 'Hele dagen' : next.e.start, sub: when + next.e.title, href: '#/apps/calendar' } : { value: '–', sub: 'Ingen kommende aftaler', href: '#/apps/calendar' };
  // hours this week (monday first), the running clock included
  const d = new Date(now); const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
  let ms = (timesheet?.entries || []).filter(e => e.end && e.start >= monday).reduce((a, e) => a + (e.end - e.start), 0);
  if (timesheet?.running?.start) ms += Math.max(0, now - Math.max(monday, timesheet.running.start));
  const hrs = Math.round(ms / 36e5 * 10) / 10;
  const hours = { value: hrs.toLocaleString('da-DK', { maximumFractionDigits: 1 }), sub: timesheet?.running ? 'Uret kører nu' : hrs ? 'registreret i Tidsregistrering' : 'Ingen registreret endnu', hot: !!timesheet?.running, href: '#/apps/timesheet' };
  const s = summary || { level: 1, xp: 0, levelXp: 0, levelSize: 1000 };
  const left = Math.max(0, (s.levelSize || 1000) - (s.levelXp || 0));
  const level = { label: `Level ${s.level}`, value: `${(s.xp || 0).toLocaleString('da-DK')} XP`, sub: `${left.toLocaleString('da-DK')} XP til level ${s.level + 1}`, pct: Math.round((s.levelXp || 0) / (s.levelSize || 1000) * 100), href: '#/dashboard' };
  return { cases, appt, hours, level };
}

/** Gnist's tip of the day on Hjem (the same tip all day). */
export const GNIST_TIPS = [
  'Tryk Ctrl+K og skriv hvad som helst – apps, guides og kursuslektioner dukker op.',
  'Spørg mig: "Hvad skal jeg nå i dag?" – så kigger jeg i din kalender og dine opgaver.',
  'Under Tilpas kan du selv vælge, hvor mange apps der er i docken.',
  'Linux-terminalen er en rigtig Linux. Prøv at skrive top – og q for at stoppe igen.',
  'Øvelseslab har en lasersimulator, hvor du kan teste materialer uden at brænde noget.',
  'Hold din streak i live: bare én lektion om dagen tæller.',
  'Bed mig lave en aftale: "Tandlæge i morgen kl. 10" – du godkender selv.',
  'Kodeskolen retter dine opgaver automatisk og giver XP.',
  'Ctrl+J åbner mig overalt i appen – også midt i en opgave.',
  'Tryk ↑ i mit skrivefelt for at hente dit sidste spørgsmål frem igen.',
  'Elværkstedet har nye regneopgaver hver gang – perfekt til at øve Ohms lov.',
  'Alle kurser kan søges i – også de enkelte lektioner.',
  'Skriv til mig: "Husk at jeg arbejder med lasere" – så husker jeg det og tager det med i mine svar.',
];
export function gnistTip(now = new Date()) {
  const day = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 864e5);
  return GNIST_TIPS[((day % GNIST_TIPS.length) + GNIST_TIPS.length) % GNIST_TIPS.length];
}

/** "God morgen, Lucas – 2 aftaler og 3 deadlines i dag" */
export function greeting(name, agenda = [], now = new Date()) {
  const hr = now.getHours();
  const hi = hr < 5 ? 'God nat' : hr < 10 ? 'God morgen' : hr < 12 ? 'God formiddag' : hr < 18 ? 'God eftermiddag' : 'God aften';
  const ev = agenda.filter(a => a.kind === 'event').length, dl = agenda.filter(a => a.kind !== 'event').length;
  const part = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const rest = ev && dl ? `${part(ev, 'aftale', 'aftaler')} og ${part(dl, 'deadline', 'deadlines')} i dag` : ev ? `${part(ev, 'aftale', 'aftaler')} i dag` : dl ? `${part(dl, 'deadline', 'deadlines')} i dag` : 'ingen aftaler i dag';
  return `${hi}, ${name} – ${rest}`;
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** days in a row (ending today or yesterday) with at least one timestamp (seconds) */
export function dayStreak(times, now = new Date()) {
  const days = new Set(times.map(t => dayKey(new Date(t * 1000))));
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
/** rated chess games won in a row, newest last in hist (a win raises the rating) */
export function winStreak(hist = []) {
  let n = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i].d > 0; i--) n++;
  return n;
}


/**
 * Gnist's brief for today, from the "I dag" agenda (buildToday): what to start with, the next appointment and
 * today's deadlines – at most two short sentences. null when there is nothing today (then Hjem shows a tip).
 */
export function gnistBrief(agenda = [], now = new Date()) {
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const out = [];
  const late = agenda.filter(a => a.kind === 'overdue');
  if (late.length) out.push(`Start med «${late[0].title}» – den er overskredet${late.length > 1 ? ` (og ${late.length - 1} mere)` : ''}.`);
  const next = agenda.filter(a => a.kind === 'event' && a.time && a.time >= hm).sort((a, b) => a.time.localeCompare(b.time))[0];
  if (next) {
    const mins = (Number(next.time.slice(0, 2)) * 60 + Number(next.time.slice(3, 5))) - (now.getHours() * 60 + now.getMinutes());
    out.push(`Næste aftale: «${next.title}» kl. ${next.time}${mins <= 60 ? ` – om ${mins} min` : ''}.`);
  }
  const due = agenda.filter(a => a.kind === 'task');
  if (due.length && out.length < 2) out.push(due.length === 1 ? `«${due[0].title}» har deadline i dag${due[0].time ? ` kl. ${due[0].time}` : ''}.` : `${due.length} opgaver har deadline i dag – den første er «${due[0].title}».`);
  if (!out.length && agenda.some(a => a.kind === 'event')) out.push('Dagens aftaler er overstået – godt klaret!');
  return out.length ? out.slice(0, 2).join(' ') : null;
}
