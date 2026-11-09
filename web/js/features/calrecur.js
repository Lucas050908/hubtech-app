/**
 * Kalender helpers without DOM: repeating events and "hurtig tilføj" (write an appointment in plain Danish).
 *   e.repeat = { freq: 'day' | 'weekday' | 'week' | '2week' | 'month' | 'year', until?: 'YYYY-MM-DD', skip?: ['YYYY-MM-DD'] }
 */
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);

export const REPEAT = {
  none: 'Gentages ikke',
  day: 'Hver dag',
  weekday: 'Hverdage (man–fre)',
  week: 'Hver uge',
  '2week': 'Hver anden uge',
  month: 'Hver måned',
  year: 'Hvert år',
};
export const repeatShort = (r) => (r && r.freq && REPEAT[r.freq]) ? REPEAT[r.freq].replace(' (man–fre)', '') : '';

/** Does a repeating event have an occurrence that starts on day d (iso)? */
export function startsOn(e, d) {
  const r = e.repeat;
  if (!r || !r.freq || d < e.date || (r.until && d > r.until) || (r.skip || []).includes(d)) return false;
  if (d === e.date) return true;
  const a = parseIso(e.date), b = parseIso(d);
  switch (r.freq) {
    case 'day': return true;
    case 'weekday': return b.getDay() >= 1 && b.getDay() <= 5;
    case 'week': return dayDiff(e.date, d) % 7 === 0;
    case '2week': return dayDiff(e.date, d) % 14 === 0;
    case 'month': return b.getDate() === a.getDate();
    case 'year': return b.getDate() === a.getDate() && b.getMonth() === a.getMonth();
    default: return false;
  }
}

/** The occurrence of e that covers day d, as a copy with its own dates – or null. Works for one-off events too. */
export function occurrenceOn(e, d) {
  const span = e.endDate ? Math.max(0, dayDiff(e.date, e.endDate)) : 0;
  if (!e.repeat?.freq) return d >= e.date && d <= (e.endDate || e.date) ? e : null;
  for (let k = 0; k <= span; k++) {
    const s = iso(addDays(parseIso(d), -k));
    if (startsOn(e, s)) return { ...e, date: s, endDate: span ? iso(addDays(parseIso(s), span)) : null, series: e.id, occ: s };
  }
  return null;
}

/** The first day ≥ from (iso) where e starts, within ~4 years; null when the series has ended. */
export function nextStart(e, from) {
  if (!e.repeat?.freq) return e.date >= from ? e.date : null;
  let d = from < e.date ? e.date : from;
  for (let i = 0; i < 1500; i++) {
    if (e.repeat.until && d > e.repeat.until) return null;
    if (startsOn(e, d)) return d;
    d = iso(addDays(parseIso(d), 1));
  }
  return null;
}

/** All occurrences that start between from and to (both iso, inclusive) – for printing and export. */
export function expand(events, from, to) {
  const out = [];
  for (const e of events) {
    if (!e.repeat?.freq) { if ((e.endDate || e.date) >= from && e.date <= to) out.push(e); continue; }
    let d = nextStart(e, from), n = 0;
    while (d && d <= to && n++ < 800) {
      out.push(occurrenceOn(e, d));
      d = nextStart(e, iso(addDays(parseIso(d), 1)));
    }
  }
  return out;
}

// ── iCalendar RRULE (the common cases) ──
export function toRrule(r) {
  if (!r?.freq) return null;
  const until = r.until ? `;UNTIL=${r.until.replace(/-/g, '')}` : '';
  return { day: 'FREQ=DAILY', weekday: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', week: 'FREQ=WEEKLY', '2week': 'FREQ=WEEKLY;INTERVAL=2', month: 'FREQ=MONTHLY', year: 'FREQ=YEARLY' }[r.freq] + until;
}
export function fromRrule(s) {
  if (!s) return null;
  const p = Object.fromEntries(String(s).split(';').map(x => x.split('=')));
  const iv = Number(p.INTERVAL || 1);
  let freq = null;
  if (p.FREQ === 'DAILY' && iv === 1) freq = 'day';
  else if (p.FREQ === 'WEEKLY' && p.BYDAY === 'MO,TU,WE,TH,FR') freq = 'weekday';
  else if (p.FREQ === 'WEEKLY' && iv === 1) freq = 'week';
  else if (p.FREQ === 'WEEKLY' && iv === 2) freq = '2week';
  else if (p.FREQ === 'MONTHLY' && iv === 1) freq = 'month';
  else if (p.FREQ === 'YEARLY' && iv === 1) freq = 'year';
  if (!freq) return null;
  const u = /^(\d{4})(\d{2})(\d{2})/.exec(p.UNTIL || '');
  return { freq, ...(u ? { until: `${u[1]}-${u[2]}-${u[3]}` } : {}) };
}

// ── hurtig tilføj: "Tandlæge i morgen kl 10", "Fodbold hver tirsdag 17-18:30", "Mors fødselsdag 12/3 hvert år" ──
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const MON_RX = '(jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:t(?:ember)?)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const monIdx = (s) => MON.findIndex(m => m.startsWith(s.toLowerCase().replace('.', '').slice(0, 3)));
const WD_RX = '(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?:en)?';
const NUM = { en: 1, et: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, syv: 7, otte: 8, ni: 9, ti: 10, fjorten: 14 };

/**
 * Read a short Danish sentence into an appointment. Returns { title, date, allDay, start, end, repeat, location, found }
 * where `found` lists what was understood (for the preview). today: a Date (midnight).
 */
export function parseQuick(text, today = new Date()) {
  let s = ' ' + String(text || '').replace(/\s+/g, ' ').trim() + ' ';
  const found = [];
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let date = null, start = null, end = null, repeat = null, location = '';
  const cut = (rx, fn) => { const m = rx.exec(s); if (!m) return false; const r = fn(m); if (r === false) return false; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return true; };
  const hm = (h, m) => { h = Number(h); m = Number(m || 0); return h >= 0 && h < 24 && m >= 0 && m < 60 ? `${pad(h)}:${pad(m)}` : null; };

  // place: "@ Hallen" or "@Hallen" (to the end, or up to the next keyword)
  cut(/\s@\s?([^@]+?)(?=\s(?:kl\.?|fra|hver|hvert|i dag|i morgen|på|den|d\.)\s|\s*$)/i, (m) => { location = m[1].trim(); found.push('sted'); });

  // repeat
  cut(/\s(hver(?:t)?\s+(?:anden|andet)\s+uge|hver\s+14\.?\s+dag)\s/i, () => { repeat = { freq: '2week' }; });
  if (!repeat) cut(/\s(hver\s+dag|dagligt)\s/i, () => { repeat = { freq: 'day' }; });
  if (!repeat) cut(/\s(alle\s+hverdage|hver\s+hverdag|på\s+hverdage|hverdage)\s/i, () => { repeat = { freq: 'weekday' }; });
  if (!repeat) cut(new RegExp(`\\s(?:hver|hverr?|alle)\\s+${WD_RX}e?\\s`, 'i'), (m) => { repeat = { freq: 'week' }; const want = WD.indexOf(m[1].toLowerCase()); const d = addDays(t0, (want - t0.getDay() + 7) % 7); date = iso(d); });
  if (!repeat) cut(/\s(hver\s+uge|ugentligt)\s/i, () => { repeat = { freq: 'week' }; });
  if (!repeat) cut(/\s(hver\s+måned|månedligt)\s/i, () => { repeat = { freq: 'month' }; });
  if (!repeat) cut(/\s(hvert\s+år|hver\s+år|årligt)\s/i, () => { repeat = { freq: 'year' }; });
  if (repeat) found.push('gentag');

  // time: "kl 10", "kl. 10.30-12", "10:00-11:30", "fra 10 til 12"
  const T = '(\\d{1,2})(?:[:.](\\d{2}))?';
  if (!cut(new RegExp(`\\s(?:kl\\.?\\s*|fra\\s+(?:kl\\.?\\s*)?)?${T}\\s*(?:-|–|til)\\s*(?:kl\\.?\\s*)?${T}(?=\\s)`, 'i'), (m) => { const a = hm(m[1], m[2]), b = hm(m[3], m[4]); if (!a || !b || (!m[2] && !m[4] && !/kl|fra/i.test(m[0]) && Number(m[1]) > 24)) return false; start = a; end = b; }))
    cut(new RegExp(`\\s(?:kl\\.?\\s*${T}|${'(\\d{1,2})[:.](\\d{2})'})(?=\\s)`, 'i'), (m) => { const a = m[1] !== undefined ? hm(m[1], m[2]) : hm(m[3], m[4]); if (!a) return false; start = a; });
  if (start) {
    found.push('tid');
    if (!end) { const [hh, mm] = start.split(':').map(Number); end = hm(Math.min(23, hh + 1), hh + 1 > 23 ? 59 : mm); }
  }

  // date
  if (!date) {
    const rel = [[/\si\s?dag\s/i, 0], [/\si\s?overmorgen\s/i, 2], [/\si\s?morgen\s/i, 1]];
    for (const [rx, n] of rel) if (cut(rx, () => { date = iso(addDays(t0, n)); })) break;
  }
  if (!date) cut(/\som\s+(\d+|en|et|to|tre|fire|fem|seks|syv|otte|ni|ti|fjorten)\s+(dag|dage|uge|uger|måned|måneder)\s/i, (m) => {
    const n = Number(m[1]) || NUM[m[1].toLowerCase()] || 1, u = m[2].toLowerCase();
    date = iso(u.startsWith('dag') ? addDays(t0, n) : u.startsWith('uge') ? addDays(t0, 7 * n) : new Date(t0.getFullYear(), t0.getMonth() + n, t0.getDate()));
  });
  if (!date) cut(new RegExp(`\\s(?:den\\s+|d\\.\\s*)?(\\d{1,2})\\.?\\s*${MON_RX}(?:\\s+(\\d{4}))?\\s`, 'i'), (m) => {
    const mi = monIdx(m[2]); if (mi < 0) return false;
    let d = new Date(m[3] ? Number(m[3]) : t0.getFullYear(), mi, Number(m[1]));
    if (d.getDate() !== Number(m[1])) return false;
    if (!m[3] && d < t0) d = new Date(d.getFullYear() + 1, mi, Number(m[1]));
    date = iso(d);
  });
  if (!date) cut(/\s(?:den\s+|d\.\s*)?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?=\s)/, (m) => {
    const dd = Number(m[1]), mm = Number(m[2]); if (mm < 1 || mm > 12) return false;
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : t0.getFullYear();
    let d = new Date(y, mm - 1, dd); if (d.getDate() !== dd) return false;
    if (!m[3] && d < t0) d = new Date(y + 1, mm - 1, dd);
    date = iso(d);
  });
  if (!date) cut(new RegExp(`\\s(?:(?:på|om|på\\s+næste|næste)\\s+)?${WD_RX}\\s`, 'i'), (m) => {
    const want = WD.indexOf(m[1].toLowerCase());
    const n = (want - t0.getDay() + 7) % 7 || 7;    // "fredag" on a Friday means next week's
    date = iso(addDays(t0, n));
  });
  if (date) found.push('dato');

  // what is left is the title (drop dangling little words)
  let title = s.replace(/\s+/g, ' ').trim().replace(/^(?:på|den|d\.|kl\.?|i|om|fra|til|,|-)\s+/i, '').replace(/\s+(?:på|den|d\.|kl\.?|i|om|fra|til|,|-)$/i, '').trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title, date: date || iso(t0), allDay: !start, start, end: start ? end : null, repeat, location, found };
}
