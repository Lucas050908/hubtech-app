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
  const hours = { value: hrs.toLocaleString('da-DK', { maximumFractionDigits: 1 }), sub: timesheet?.running ? 'Uret kører nu' : 'timer denne uge', hot: !!timesheet?.running, href: '#/apps/timesheet' };
  const s = summary || { level: 1, xp: 0, levelXp: 0, levelSize: 1000 };
  const level = { label: `Level ${s.level}`, value: (s.xp || 0).toLocaleString('da-DK'), pct: Math.round((s.levelXp || 0) / (s.levelSize || 1000) * 100), href: '#/dashboard' };
  return { cases, appt, hours, level };
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

