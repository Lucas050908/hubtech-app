/** Vaner without DOM: streaks for daily habits and for "x times a week" habits. Days are 'YYYY-MM-DD' strings. */
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (k) => new Date(k + 'T12:00:00');
const back = (k, n) => { const d = at(k); d.setDate(d.getDate() - n); return key(d); };

export const mondayKey = (k) => back(k, (at(k).getDay() + 6) % 7);
export const weekCount = (days, today) => { const m = mondayKey(today); return days.filter(d => d >= m && d <= today).length; };

export function streak(days, goal, today) {
  const set = new Set(days);
  if (!goal || goal >= 7) {
    let s = 0;
    for (let i = set.has(today) ? 0 : 1; ; i++) { if (set.has(back(today, i))) s++; else break; }
    return s;
  }
  // weeks in a row with the goal reached; this week counts once it is reached
  let m = mondayKey(today), s = 0;
  const inWeek = (mon) => { let n = 0; for (let i = 0; i < 7; i++) if (set.has(back(mon, -i))) n++; return n; };
  if (inWeek(m) >= goal) s++;
  for (m = back(m, 7); inWeek(m) >= goal; m = back(m, 7)) s++;
  return s;
}
