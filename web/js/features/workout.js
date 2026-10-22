/** Træning – pure functions (unit-tested in tests/apps.test.mjs): sets, records and progress. */

/** Exercises to pick from. kind: 'weight' (reps × kg), 'body' (reps, extra kg optional), 'time' (seconds), 'cardio' (minutes + km) */
export const EXERCISES = [
  ['Bænkpres', 'weight', 'Bryst'], ['Squat', 'weight', 'Ben'], ['Dødløft', 'weight', 'Ryg'], ['Skulderpres', 'weight', 'Skuldre'],
  ['Roning med stang', 'weight', 'Ryg'], ['Biceps curl', 'weight', 'Arme'], ['Triceps pushdown', 'weight', 'Arme'], ['Benpres', 'weight', 'Ben'],
  ['Lunges', 'weight', 'Ben'], ['Lat pulldown', 'weight', 'Ryg'], ['Hip thrust', 'weight', 'Ben'], ['Lægløft', 'weight', 'Ben'],
  ['Armbøjninger', 'body', 'Bryst'], ['Pull-ups', 'body', 'Ryg'], ['Dips', 'body', 'Arme'], ['Mavebøjninger', 'body', 'Mave'], ['Burpees', 'body', 'Hele kroppen'],
  ['Planke', 'time', 'Mave'], ['Wall sit', 'time', 'Ben'],
  ['Løb', 'cardio', 'Kondition'], ['Cykling', 'cardio', 'Kondition'], ['Roning (maskine)', 'cardio', 'Kondition'], ['Gang', 'cardio', 'Kondition'], ['Svømning', 'cardio', 'Kondition'],
].map(([name, kind, group]) => ({ name, kind, group }));
export const kindOf = (name, custom = []) => (EXERCISES.find(e => e.name === name) || custom.find(e => e.name === name))?.kind || 'weight';

/** Estimated one-rep max (Epley). Only for 1–12 reps; more reps say little about the max. */
export const oneRm = (kg, reps) => (kg > 0 && reps > 0 ? Math.round(kg * (reps === 1 ? 1 : 1 + Math.min(reps, 12) / 30) * 10) / 10 : 0);
/** total kg lifted in an exercise (sets × reps × kg) */
export const volume = (ex) => (ex.sets || []).reduce((s, x) => s + (Number(x.kg) || 0) * (Number(x.reps) || 0), 0);
export const sessionVolume = (s) => (s.exercises || []).reduce((t, ex) => t + volume(ex), 0);
export const doneSets = (ex) => (ex.sets || []).filter(x => x.done);

/** the best value for an exercise in one session: kg for weights (with 1RM), reps for body weight, seconds for time, km for cardio */
export function best(ex, kind) {
  const sets = doneSets(ex);
  if (!sets.length) return null;
  if (kind === 'weight') { const top = sets.reduce((a, b) => (oneRm(b.kg, b.reps) > oneRm(a.kg, a.reps) ? b : a)); return { value: oneRm(top.kg, top.reps), kg: Number(top.kg), reps: Number(top.reps) }; }
  if (kind === 'body') return { value: Math.max(...sets.map(x => Number(x.reps) || 0)) };
  if (kind === 'time') return { value: Math.max(...sets.map(x => Number(x.secs) || 0)) };
  return { value: Math.max(...sets.map(x => Number(x.km) || 0)), minutes: sets.reduce((s, x) => s + (Number(x.min) || 0), 0) };
}
/** the history of one exercise: [{ date, value, ... }] oldest first */
export function series(history, name, custom = []) {
  const kind = kindOf(name, custom), out = [];
  for (const s of [...history].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const ex of s.exercises || []) if (ex.name === name) { const b = best(ex, kind); if (b && b.value > 0) out.push({ date: s.date, ...b }); }
  }
  return out;
}
/** sets in `session` that beat everything before it → [{ name, value }] */
export function records(history, session, custom = []) {
  const before = history.filter(s => s.id !== session.id && s.date <= session.date);
  const out = [];
  for (const ex of session.exercises || []) {
    const kind = kindOf(ex.name, custom), b = best(ex, kind);
    if (!b || !b.value) continue;
    const prev = series(before, ex.name, custom);
    if (prev.length && b.value > Math.max(...prev.map(p => p.value))) out.push({ name: ex.name, value: b.value, kind });
  }
  return out;
}
/** last time's sets for an exercise – shown as a hint when you train it again */
export function lastSets(history, name, beforeDate = '9999') {
  const s = [...history].filter(x => x.date < beforeDate || beforeDate === '9999').sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1))
    .find(x => (x.exercises || []).some(e => e.name === name && doneSets(e).length));
  return s ? doneSets(s.exercises.find(e => e.name === name)) : [];
}
/** sessions per week for the last `n` weeks (Monday first), newest last */
export function weekly(history, n = 8, today = new Date()) {
  const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = monday(today);
  return Array.from({ length: n }, (_, i) => {
    const a = new Date(start); a.setDate(a.getDate() - 7 * (n - 1 - i));
    const b = new Date(a); b.setDate(b.getDate() + 7);
    const list = history.filter(s => s.date >= iso(a) && s.date < iso(b));
    return { week: iso(a), count: list.length, volume: list.reduce((t, s) => t + sessionVolume(s), 0) };
  });
}
export function streakWeeks(history, today = new Date()) {
  const w = weekly(history, 104, today);
  let n = 0;
  for (let i = w.length - 1; i >= 0; i--) { if (w[i].count) n++; else if (i !== w.length - 1) break; }
  return n;
}
export const fmtKg = (n) => `${(Math.round(n * 10) / 10).toLocaleString('da-DK')} kg`;
export const fmtSecs = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} sek.`);
export const fmtValue = (v, kind) => (kind === 'weight' ? fmtKg(v) : kind === 'body' ? `${v} gentagelser` : kind === 'time' ? fmtSecs(v) : `${v.toLocaleString('da-DK')} km`);
