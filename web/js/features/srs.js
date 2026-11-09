/**
 * Spaced repetition (a simplified SM-2, like Anki) for Huskekort.
 * card: { reps, ivl (days), ease, lapses, due (ms) }
 * grade: 1 = Igen, 2 = Svært, 3 = Godt, 4 = Let
 * A card is due when `due` is before the end of today; "Igen" puts it back in today's queue after 1 minute.
 */
export const DAY = 86400e3;
export const GRADES = [
  { g: 1, label: 'Igen', key: '1', cls: 'is-again' },
  { g: 2, label: 'Svært', key: '2', cls: 'is-hard' },
  { g: 3, label: 'Godt', key: '3', cls: 'is-good' },
  { g: 4, label: 'Let', key: '4', cls: 'is-easy' },
];

export function startOfDay(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function endOfDay(t = Date.now()) { return startOfDay(t) + DAY - 1; }
export const isNew = (c) => !c.reps && !c.lapses;
export const isDue = (c, now = Date.now()) => (c.due || 0) <= endOfDay(now);

/** Returns the card's new scheduling fields (pure – does not change `card`). */
export function schedule(card, grade, now = Date.now()) {
  let { reps = 0, ivl = 0, ease = 2.5, lapses = 0 } = card;
  if (grade === 1) {
    return { reps: 0, ivl: 0, ease: Math.max(1.3, +(ease - 0.2).toFixed(2)), lapses: reps ? lapses + 1 : lapses, due: now + 60e3, last: now };
  }
  if (grade === 2) { ivl = reps ? Math.max(ivl + 1, Math.round(ivl * 1.2)) : 1; ease = Math.max(1.3, ease - 0.15); }
  if (grade === 3) ivl = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(ivl + 1, Math.round(ivl * ease));
  if (grade === 4) { ivl = reps === 0 ? 4 : Math.max(ivl + 2, Math.round(ivl * ease * 1.3)); ease += 0.15; }
  ivl = Math.min(ivl, 3650);
  return { reps: reps + 1, ivl, ease: +ease.toFixed(2), lapses, due: startOfDay(now) + ivl * DAY, last: now };
}

/** Short Danish label for when the card comes back after `grade`. */
export function nextLabel(card, grade, now = Date.now()) {
  const s = schedule(card, grade, now);
  if (grade === 1) return '1 min';
  const d = s.ivl;
  if (d < 31) return `${d} d`;
  if (d < 365) return `${Math.round(d / 30)} md`;
  return `${(d / 365).toFixed(1).replace('.', ',')} år`;
}

/** CSV/tab/semicolon text → [[front, back]]. Quoted fields with ;, tab and newlines are supported. */
export function parseCards(text) {
  const rows = []; let row = [], f = '', q = false;
  const sep = /\t/.test(text) ? '\t' : ';';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; continue; }
    if (ch === '"' && f === '') q = true;
    else if (ch === sep) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => [String(r[0] || '').trim(), String(r[1] || '').trim()]).filter(([a, b]) => a && b);
}
