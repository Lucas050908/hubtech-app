/** Bøger og film – pure functions (unit-tested in tests/apps.test.mjs): sorting, filters, progress and a year's statistics. */
export const KINDS = { book: { label: 'Bog', many: 'Bøger', icon: 'book', unit: 'sider', by: 'Forfatter' }, film: { label: 'Film', many: 'Film', icon: 'video', unit: '', by: 'Instruktør' },
  series: { label: 'Serie', many: 'Serier', icon: 'monitor', unit: 'afsnit', by: 'Skaber' }, game: { label: 'Spil', many: 'Spil', icon: 'gamepad', unit: '', by: 'Udvikler' } };
export const STATUS = { want: 'Vil gerne', doing: 'I gang', done: 'Færdig', dropped: 'Droppet' };
export const DOING = { book: 'Læser', film: 'Ser', series: 'Ser', game: 'Spiller' };

export const progressPct = (it) => (it.total > 0 ? Math.min(100, Math.round(((it.progress || 0) / it.total) * 100)) : it.status === 'done' ? 100 : 0);
export function matches(it, { kind = 'all', status = 'all', q = '' } = {}) {
  if (kind !== 'all' && it.kind !== kind) return false;
  if (status !== 'all' && it.status !== status) return false;
  const t = q.trim().toLowerCase();
  return !t || [it.title, it.by, ...(it.tags || [])].some(x => String(x || '').toLowerCase().includes(t));
}
const ORDER = { doing: 0, want: 1, done: 2, dropped: 3 };
export function sortItems(items, by = 'status') {
  const a = [...items];
  if (by === 'title') return a.sort((x, y) => x.title.localeCompare(y.title, 'da'));
  if (by === 'rating') return a.sort((x, y) => (y.rating || 0) - (x.rating || 0) || x.title.localeCompare(y.title, 'da'));
  if (by === 'added') return a.sort((x, y) => (y.added || 0) - (x.added || 0));
  return a.sort((x, y) => ORDER[x.status] - ORDER[y.status] || (y.finished || '').localeCompare(x.finished || '') || (y.added || 0) - (x.added || 0));
}
/** Changing status fills in the dates: started when you begin, finished when you're done. */
export function setStatus(it, status, today) {
  it.status = status;
  if (status === 'doing' && !it.started) it.started = today;
  if (status === 'done') { it.finished = today; if (!it.started) it.started = today; if (it.total) it.progress = it.total; }
  if (status === 'want') { it.started = null; it.finished = null; }
  return it;
}
/** Progress forward (pages/episodes). Reaching the end marks it as done. */
export function addProgress(it, n, today) {
  it.progress = Math.max(0, Math.min(it.total || Infinity, (it.progress || 0) + n));
  if (it.status === 'want' && it.progress > 0) setStatus(it, 'doing', today);
  if (it.total && it.progress >= it.total && it.status !== 'done') setStatus(it, 'done', today);
  return it;
}
export function yearStats(items, year) {
  const done = items.filter(it => it.status === 'done' && String(it.finished || '').startsWith(String(year)));
  const by = Object.fromEntries(Object.keys(KINDS).map(k => [k, done.filter(it => it.kind === k).length]));
  const rated = done.filter(it => it.rating);
  const months = Array(12).fill(0);
  done.forEach(it => { months[Number(it.finished.slice(5, 7)) - 1]++; });
  return {
    done: done.length, by, months,
    pages: done.filter(it => it.kind === 'book').reduce((s, it) => s + (it.total || 0), 0),
    avg: rated.length ? Math.round(rated.reduce((s, it) => s + it.rating, 0) / rated.length * 10) / 10 : 0,
    best: [...rated].sort((a, b) => b.rating - a.rating).slice(0, 3),
  };
}
/** How far you are with this year's goal, and whether you're on track. */
export function goalStatus(doneCount, goal, date = new Date()) {
  if (!goal) return null;
  const start = new Date(date.getFullYear(), 0, 1), end = new Date(date.getFullYear() + 1, 0, 1);
  const part = (date - start) / (end - start), expected = Math.round(goal * part * 10) / 10;
  return { pct: Math.min(100, Math.round(doneCount / goal * 100)), expected, ahead: Math.round((doneCount - expected) * 10) / 10 };
}
export const suggest = (items, kind = 'all', r = Math.random) => { const pool = items.filter(it => it.status === 'want' && (kind === 'all' || it.kind === kind)); return pool.length ? pool[Math.floor(r() * pool.length)] : null; };
