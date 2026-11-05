/** Pure parts of the top-bar widgets: defaults and streak counting (tested in tests/apps.test.mjs). */
export const HOME_CARDS = [
  ['hero', 'Velkomst'], ['today', 'I dag'], ['apps', 'Dine apps'], ['together', 'Sammen med andre'],
  ['previews', 'Projekter og læring'], ['seasons', 'Årstider'],
  ['profile', 'Profil og level'], ['activity', 'Seneste aktiviteter'], ['shortcuts', 'Hurtige genveje'], ['world', 'Verdenen'],
];

export const WIDGET_DEFAULTS = {
  music: true, musicMode: 'compact',          // compact | title
  streak: true, streakMode: 'learn',          // learn | active | chess
  online: true, onlineMode: 'avatars',        // avatars | count | hubs
  weather: true, weatherMode: 'full',         // full | temp
  city: '',
  home: Object.fromEntries(HOME_CARDS.map(([k]) => [k, true])),
};

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

