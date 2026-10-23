/** Pure helpers for the shared apps (unit-tested in tests/apps.test.mjs). */

// ── Afstemninger ──
/** votes → { counts, voters, pct, top } */
export function tally(entries, nOptions) {
  const counts = Array(nOptions).fill(0), who = Array.from({ length: nOptions }, () => []);
  const votes = entries.filter(e => e.kind === 'vote');
  for (const v of votes) for (const c of v.data.choices || []) if (c >= 0 && c < nOptions) { counts[c]++; if (v.user) who[c].push(v.user); }
  const voters = votes.length, max = Math.max(0, ...counts);
  return { counts, who, voters, pct: counts.map(n => (voters ? Math.round((n / voters) * 100) : 0)), top: max ? counts.map((n, i) => (n === max ? i : -1)).filter(i => i >= 0) : [] };
}

// ── Arrangementer ──
export function rsvps(entries) {
  const out = { yes: [], maybe: [], no: [], guests: 0 };
  for (const e of entries.filter(x => x.kind === 'rsvp')) { out[e.data.answer]?.push(e); if (e.data.answer === 'yes') out.guests += 1 + Math.max(0, Math.min(10, Number(e.data.plus) || 0)); }
  return out;
}
/** "om 3 dage", "i morgen kl. 18.00", "i gang", "har været" */
export function whenText(startIso, endIso, now = new Date()) {
  const s = new Date(startIso), e = endIso ? new Date(endIso) : new Date(s.getTime() + 2 * 3600e3);
  if (isNaN(s)) return '';
  if (now >= s && now <= e) return 'I gang nu';
  if (now > e) return 'Har været';
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(s) - day(now)) / 864e5);
  const t = s.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `I dag kl. ${t}`;
  if (days === 1) return `I morgen kl. ${t}`;
  if (days < 7) return `${s.toLocaleDateString('da-DK', { weekday: 'long' })} kl. ${t}`;
  return `Om ${days} dage`;
}
/** an .ics file so the event can go into any calendar */
export function ics({ title, start, end, place = '', desc = '', uid = 'hubtech' }) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
  const e = end || new Date(new Date(start).getTime() + 2 * 3600e3).toISOString();
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HUBTECH//DA', 'BEGIN:VEVENT', `UID:${uid}@hubtech`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(e)}`,
    `SUMMARY:${esc(title)}`, place ? `LOCATION:${esc(place)}` : null, desc ? `DESCRIPTION:${esc(desc)}` : null, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

// ── Formularer ──
export const FIELD_TYPES = { text: 'Kort tekst', long: 'Lang tekst', choice: 'Ét valg', multi: 'Flere valg', number: 'Tal', scale: 'Skala 1–5', date: 'Dato', email: 'E-mail', yesno: 'Ja/nej', info: 'Tekst (ingen svar)' };
/** answers per field: counts for choices, average for numbers/scales, the texts for the rest */
export function formStats(fields, responses) {
  return fields.filter(f => f.type !== 'info').map(f => {
    const vals = responses.map(r => r.data.answers?.[f.id]).filter(v => v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && !v.length));
    if (['choice', 'multi', 'yesno'].includes(f.type)) {
      const opts = f.type === 'yesno' ? ['Ja', 'Nej'] : f.options || [];
      const counts = opts.map(o => vals.filter(v => (Array.isArray(v) ? v.includes(o) : v === o)).length);
      return { field: f, n: vals.length, opts, counts };
    }
    if (['number', 'scale'].includes(f.type)) {
      const nums = vals.map(Number).filter(n => isFinite(n));
      return { field: f, n: nums.length, avg: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null,
        dist: f.type === 'scale' ? [1, 2, 3, 4, 5].map(k => nums.filter(n => n === k).length) : null };
    }
    return { field: f, n: vals.length, texts: vals.map(String) };
  });
}
/** spreadsheet export (Excel opens it: semicolon separated, BOM for æøå) */
export function toCSV(fields, responses) {
  const q = (v) => { const s = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = fields.filter(f => f.type !== 'info');
  const head = ['Tidspunkt', 'Navn', ...cols.map(f => f.label)];
  const rows = responses.map(r => [new Date(r.at * 1000).toLocaleString('da-DK'), r.user?.name || r.guest || '', ...cols.map(f => r.data.answers?.[f.id])]);
  return '\ufeff' + [head, ...rows].map(row => row.map(q).join(';')).join('\r\n');
}
export function checkAnswers(fields, answers) {
  for (const f of fields) {
    if (f.type === 'info') continue;
    const v = answers[f.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (f.required && empty) return { field: f.id, error: `Udfyld “${f.label}”` };
    if (!empty && f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { field: f.id, error: 'Skriv en gyldig e-mail' };
    if (!empty && f.type === 'number' && !isFinite(Number(v))) return { field: f.id, error: `“${f.label}” skal være et tal` };
  }
  return null;
}

// ── Væggen ──
/** text → parts: plain text, links and #tags (so they can be shown as links without innerHTML) */
export function textParts(text) {
  const out = [], re = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])|(^|[\s(])#([\p{L}\p{N}_]{2,30})/gu;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m[1]) { if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) }); out.push({ t: 'link', v: m[1] }); last = m.index + m[0].length; }
    else { const start = m.index + m[2].length; if (start > last) out.push({ t: 'text', v: text.slice(last, start) }); out.push({ t: 'tag', v: m[3].toLowerCase() }); last = m.index + m[0].length; }
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}
export const tagsOf = (text) => [...new Set(textParts(text || '').filter(p => p.t === 'tag').map(p => p.v))];
/** the most used tags across posts → [[tag, n], …] */
export function topTags(posts, n = 8) {
  const c = new Map();
  for (const p of posts) for (const t of tagsOf(p.data?.text)) c.set(t, (c.get(t) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'da')).slice(0, n);
}

// ── Spørg og svar ──
/** votes (kind 'vote', data {target, v: 1|-1}) → { [target]: score }, and my own vote per target */
export function scores(entries) {
  const s = {}, mine = {};
  for (const e of entries) if (e.kind === 'vote') { const v = e.data.v === -1 ? -1 : 1; s[e.data.target] = (s[e.data.target] || 0) + v; if (e.mine) mine[e.data.target] = v; }
  return { s, mine };
}
/** answers in the order to show them: the accepted one first, then by score, then oldest first */
export function sortAnswers(entries, accepted) {
  const { s } = scores(entries);
  return entries.filter(e => e.kind === 'answer').sort((a, b) => (b.id === accepted) - (a.id === accepted) || (s[b.id] || 0) - (s[a.id] || 0) || a.at - b.at);
}

// ── Fællesudgifter ──
/** amounts are kept in øre (whole numbers) so the sums always add up */
export const toOre = (kr) => Math.round(Number(String(kr).replace(/\s/g, '').replace(',', '.')) * 100);
export const kr = (ore) => `${(ore / 100).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
/** split an amount (øre) between keys; the øre that don't divide evenly go to the first ones. custom: {key: øre} */
export function splitAmount(total, keys, custom = null) {
  const out = {};
  if (custom) { for (const k of keys) out[k] = Math.round(custom[k] || 0); return out; }
  const base = Math.floor(total / keys.length); let rest = total - base * keys.length;
  for (const k of keys) { out[k] = base + (rest > 0 ? 1 : 0); rest--; }
  return out;
}
/** everyone's balance (øre): positive = gets money back, negative = owes */
export function balances(entries) {
  const bal = {}, add = (k, v) => { bal[k] = (bal[k] || 0) + v; };
  for (const e of entries) {
    if (e.kind === 'expense') {
      const total = toOre(e.data.amount); if (!(total > 0)) continue;
      add(e.data.paidBy, total);
      const parts = splitAmount(total, e.data.split, e.data.custom || null);
      for (const [k, v] of Object.entries(parts)) add(k, -v);
    } else if (e.kind === 'settle') {
      const a = toOre(e.data.amount); add(e.data.from, a); add(e.data.to, -a);
    }
  }
  for (const k of Object.keys(bal)) if (bal[k] === 0) delete bal[k];
  return bal;
}
/** the fewest payments that make everyone even: [{from, to, amount(øre)}] */
export function settleUp(bal) {
  const debt = Object.entries(bal).filter(([, v]) => v < 0).map(([k, v]) => [k, -v]).sort((a, b) => b[1] - a[1]);
  const cred = Object.entries(bal).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const out = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i][1], cred[j][1]);
    if (amt > 0) out.push({ from: debt[i][0], to: cred[j][0], amount: amt });
    debt[i][1] -= amt; cred[j][1] -= amt;
    if (!debt[i][1]) i++; if (!cred[j][1]) j++;
  }
  return out;
}
/** spending per category (øre) */
export function byCategory(entries) {
  const c = {};
  for (const e of entries) if (e.kind === 'expense') c[e.data.category || 'Andet'] = (c[e.data.category || 'Andet'] || 0) + toOre(e.data.amount);
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

// ── Wiki ──
export const slugify = (t) => String(t).toLowerCase().trim().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'side';
/** a little markdown: # headings, - lists, 1. lists, > quotes, ``` code, blank line = new paragraph */
export function mdBlocks(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n'), out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push({ t: 'code', text: buf.join('\n') }); continue; }
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { out.push({ t: 'h', level: m[1].length, text: m[2] }); i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) { const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, '')); out.push({ t: 'ul', items }); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const items = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '')); out.push({ t: 'ol', items }); continue; }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push({ t: 'quote', text: buf.join('\n') }); continue; }
    if (/^---+\s*$/.test(l)) { out.push({ t: 'hr' }); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|\s*[-*]\s|\s*\d+[.)]\s|---+\s*$)/.test(lines[i])) buf.push(lines[i++]);
    out.push({ t: 'p', text: buf.join('\n') });
  }
  return out;
}
/** inline: **fed**, *kursiv*, `kode`, [tekst](https://…) and [[Wiki-side]] */
export function mdInline(text) {
  const out = [], re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[\[([^\]]{1,80})\]\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1] != null) out.push({ t: 'b', v: m[1] }); else if (m[2] != null) out.push({ t: 'i', v: m[2] }); else if (m[3] != null) out.push({ t: 'code', v: m[3] });
    else if (m[4] != null) out.push({ t: 'wiki', v: m[4], slug: slugify(m[4]) }); else if (m[5] != null) out.push({ t: 'link', v: m[5], href: m[6] }); else out.push({ t: 'link', v: m[7].replace(/^https?:\/\//, ''), href: m[7] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}
/** the [[links]] on a page – for "links here" */
export const wikiLinks = (body) => [...new Set(mdBlocks(body).flatMap(b => [b.text || '', ...(b.items || [])]).flatMap(t => mdInline(t)).filter(p => p.t === 'wiki').map(p => p.slug))];

// ── Udfordringer ──
const dayIso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00`); d.setDate(d.getDate() + n); return dayIso(d); };
export const todayIso = () => dayIso(new Date());
/** the days in a row up to today (or yesterday, if today isn't done yet) */
export function streak(dates, today = todayIso()) {
  const set = new Set(dates);
  let d = set.has(today) ? today : addDays(today, -1), n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
/** per person: days done, total amount, current streak – sorted best first */
export function challengeStats(entries, { start, days }, today = todayIso()) {
  const end = addDays(start, days - 1), per = new Map();
  const get = (e) => { const k = e.userId ?? e.user?.id; if (!per.has(k)) per.set(k, { user: e.user, id: k, dates: [], total: 0, joined: false }); return per.get(k); };
  for (const e of entries) {
    if (e.kind === 'join') get(e).joined = true;
    if (e.kind === 'checkin' && e.data.date >= start && e.data.date <= end) { const p = get(e); p.dates.push(e.data.date); p.total += Number(e.data.amount) || 0; }
  }
  const out = [...per.values()].map(p => ({ ...p, days: new Set(p.dates).size, streak: streak(p.dates, today > end ? end : today) }));
  return out.sort((a, b) => b.days - a.days || b.total - a.total || b.streak - a.streak);
}
/** how far the challenge has come: day number, days left, done? */
export function challengeDay({ start, days }, today = todayIso()) {
  const n = Math.round((new Date(`${today}T12:00`) - new Date(`${start}T12:00`)) / 864e5) + 1;
  return { day: Math.max(0, Math.min(days, n)), left: Math.max(0, days - Math.max(0, n)), started: n >= 1, done: n > days };
}

// ── Skoleskema ──
const toMin = (t) => { const [a, b] = String(t).split(':').map(Number); return a * 60 + (b || 0); };
/** ISO week number (for A/B weeks) */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y0) / 864e5 + 1) / 7);
}
/** which week (A/B) a date is in, given which week number was "A" */
export const weekLetter = (date, abWeeks, aParity = 0) => (!abWeeks ? '' : isoWeek(date) % 2 === aParity ? 'A' : 'B');
/** the lessons of a day: [{ i, slot, lesson }] for a schedule { slots: [{from,to}], days: { 'A'|'': [[lesson|null x slots] x 5] } } */
export function dayLessons(sch, date) {
  const wd = (date.getDay() + 6) % 7; if (wd > 4) return [];
  const wk = weekLetter(date, sch.abWeeks, sch.aParity || 0);
  const grid = sch.weeks?.[wk || 'A'] || [];
  return (sch.slots || []).map((slot, i) => ({ i, slot, lesson: grid[wd]?.[i] || null })).filter(x => x.lesson && x.lesson.subject);
}
/** what's on now and next */
export function nowNext(sch, now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes(), list = dayLessons(sch, now);
  const cur = list.find(x => toMin(x.slot.from) <= m && m < toMin(x.slot.to)) || null;
  const next = list.find(x => toMin(x.slot.from) > m) || null;
  return { now: cur, next, minsLeft: cur ? toMin(cur.slot.to) - m : null, minsTo: next ? toMin(next.slot.from) - m : null, done: !cur && !next && list.length > 0 };
}
