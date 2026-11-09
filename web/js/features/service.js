/**
 * Servicehjælp – the data behind the app (pure, tested in tests/apps.test.mjs).
 * The data lives on the HUBTECH account in the same states as before ("svc-log", "svc-drv" …, each { v: "<json>" }),
 * so reports, trips and warranties made in the old Servicehjælp are simply there – and Kunder still finds the reports.
 */

/** The account states Servicehjælp uses. */
export const KEYS = { log: 'svc-log', drv: 'svc-drv', drvp: 'svc-drvp', drvr: 'svc-drvr', gar: 'svc-gar', exp: 'svc-exp', kb: 'svc-kb', tek: 'svc-tek', draft: 'svc-draft' };

/** { v: "[…]" } → the list (or the default when it is missing or broken). */
export function unwrap(state, fallback = []) {
  if (state == null || state.v == null) return fallback;
  if (typeof fallback === 'string') return String(state.v);
  try { const x = JSON.parse(state.v); return x ?? fallback; } catch { return fallback; }
}
/** The list → { v: "[…]" } for the account. */
export const wrap = (x) => ({ v: typeof x === 'string' ? x : JSON.stringify(x) });

// ── the report ──
export const DEVICE_TYPES = ['Printer', 'Varmeblæser', '3D-printer', 'Laserskærer', 'PC / netværk', 'Andet'];
export const RESULTS = ['Fejl udbedt', 'Delvist udbedt, kræver opfølgning', 'Reservedele skal bestilles', 'Enhed bør udskiftes / kasseres'];
export const CHECKS = ['Rengjort', 'Testkørt', 'Driver / firmware opdateret', 'Sikkerhedstjek udført', 'Kalibreret / nivelleret', 'Kunde instrueret'];
/** The report's fields (the ids are the same as in the old Servicehjælp, so old reports open as they are). */
export const FIELDS = [
  { id: 'r1', label: 'Kunde / firma', group: 'kunde', req: true },
  { id: 'r8', label: 'Kontaktperson', group: 'kunde' },
  { id: 'r9', label: 'Adresse', group: 'kunde' },
  { id: 'r10', label: 'Telefon', group: 'kunde', type: 'tel' },
  { id: 'r11', label: 'Enhedstype', group: 'enhed', options: DEVICE_TYPES },
  { id: 'r2', label: 'Mærke / model', group: 'enhed' },
  { id: 'r12', label: 'Serienummer', group: 'enhed', scan: true },
  { id: 'r3', label: 'Fejl som kunden beskriver', group: 'arbejde', area: true },
  { id: 'r4', label: 'Fundet årsag', group: 'arbejde', area: true },
  { id: 'r5', label: 'Udført arbejde', group: 'arbejde', area: true },
  { id: 'r15', label: 'Resultat', group: 'arbejde', options: RESULTS },
  { id: 'r6', label: 'Reservedele (én pr. linje: beskrivelse | antal | varenr. | pris)', group: 'dele', area: true },
  { id: 'r7', label: 'Tidsforbrug', group: 'dele', hint: 'fx 1,5 t' },
  { id: 'r13', label: 'Anbefalinger og opfølgning', group: 'afslut', area: true },
  { id: 'r14', label: 'Tekniker', group: 'afslut' },
  { id: 'r17', label: 'Mappe', group: 'afslut', hint: 'fx et projekt eller en kunde-mappe' },
  { id: 'r16', label: "Personlige noter (kommer ikke med i PDF'en)", group: 'afslut', area: true },
];
export const GROUPS = [['kunde', 'Kunde'], ['enhed', 'Enheden'], ['arbejde', 'Fejl og arbejde'], ['dele', 'Reservedele og tid'], ['afslut', 'Afslutning']];

export const emptyReport = (tek = '') => ({ f: Object.fromEntries(FIELDS.map(x => [x.id, x.id === 'r14' ? tek : x.options ? x.options[0] : ''])), q: CHECKS.map(() => false), p: [] });
const todayDa = (d = new Date()) => d.toLocaleDateString('da-DK');

/** Reservedele: "Toner | 1 | TN-2420 | 549" per line → rows and the total. */
export function parseParts(text) {
  const rows = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [desc = '', qty = '1', no = '', price = ''] = l.split('|').map(x => x.trim());
    const q = Number(String(qty).replace(',', '.')) || 1, p = Number(String(price).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
    return { desc, qty: q, no, price: p, sum: q * p };
  });
  return { rows, total: rows.reduce((a, r) => a + r.sum, 0) };
}
export const kr = (n) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;

/** The report as plain text (copy, mail – and what Kunder shows). */
export function reportText(o, date = todayDa()) {
  const f = o.f || {}, v = (id) => (f[id] || '').trim();
  const L = [`SERVICERAPPORT – ${date}`, ''];
  const add = (label, id) => { if (v(id)) L.push(`${label}: ${v(id)}`); };
  add('Kunde', 'r1'); add('Kontakt', 'r8'); add('Adresse', 'r9'); add('Telefon', 'r10');
  L.push(''); add('Enhed', 'r11'); add('Model', 'r2'); add('Serienummer', 'r12');
  L.push(''); add('Fejl', 'r3'); add('Årsag', 'r4'); add('Udført', 'r5'); add('Resultat', 'r15');
  const done = CHECKS.filter((_, i) => o.q?.[i]);
  if (done.length) L.push(`Tjekket: ${done.join(', ')}`);
  const parts = parseParts(f.r6);
  if (parts.rows.length) { L.push('', 'Reservedele:'); parts.rows.forEach(r => L.push(`- ${r.desc}${r.qty !== 1 ? ` × ${r.qty}` : ''}${r.no ? ` (${r.no})` : ''}${r.price ? ` – ${kr(r.sum)}` : ''}`)); if (parts.total) L.push(`I alt: ${kr(parts.total)}`); }
  add('Tid', 'r7'); add('Anbefaling', 'r13'); add('Tekniker', 'r14');
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A saved report – the same shape as before ({ id, d, k, e, s, f, t }), so old and new reports live side by side. */
export function makeRecord(o, { id, date } = {}) {
  const f = o.f || {};
  const d = date || todayDa();
  return { id: id || `r${Date.now()}`, d, k: (f.r1 || '').trim() || '-', e: (f.r2 || '').trim() || '-', s: (f.r12 || '').trim(), f: o, t: reportText(o, d) };
}
/** "6.11.2026" or "2026-11-06" → a Date (or null). */
export function parseDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  return null;
}
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
/** Search the reports: customer, model, serial number, folder and text. */
export function searchReports(log, q = '') {
  const s = q.trim().toLowerCase();
  if (!s) return log;
  return log.filter(r => [r.k, r.e, r.s, r.d, r.t, r.f?.f?.r17, r.f?.f?.r3, r.f?.f?.r5].join(' ').toLowerCase().includes(s));
}
export const folders = (log) => [...new Set(log.map(r => (r.f?.f?.r17 || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'da'));

// ── kørebog ──
export const TRIP_TYPES = ['Erhverv', 'Privat'];
/** km for a trip: from the odometer when both readings are there, otherwise the km typed. */
export const tripKm = (start, end, km) => (start > 0 && end > start ? end - start : Number(km) || 0);
export function tripMonth(drv, month, rate = 0) {
  const trips = drv.filter(t => String(t.d || '').startsWith(month)).sort((a, b) => String(a.d).localeCompare(String(b.d)));
  const work = trips.filter(t => (t.ty || 'Erhverv') === 'Erhverv').reduce((a, t) => a + (Number(t.km) || 0), 0);
  const priv = trips.filter(t => t.ty === 'Privat').reduce((a, t) => a + (Number(t.km) || 0), 0);
  return { trips, work: Math.round(work * 10) / 10, priv: Math.round(priv * 10) / 10, amount: Math.round(work * (Number(String(rate).replace(',', '.')) || 0) * 100) / 100 };
}

// ── garanti ──
export const WARRANTY_TYPES = ['Fabriksgaranti', 'Reparationsgaranti', 'Installation', 'Andet'];
/** When a warranty ends and how many days are left (negative = ended). */
export function warrantyStatus(g, now = new Date()) {
  const s = parseDate(g.d) || now;
  const end = new Date(s.getFullYear(), s.getMonth() + (Number(g.mo) || 12), s.getDate());
  const days = Math.ceil((end - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  return { end, days, state: days < 0 ? 'udløbet' : days <= 30 ? 'snart' : 'aktiv' };
}

// ── udgifter ──
export const EXP_TYPES = ['Benzin', 'Hotel', 'Mad', 'Parkering', 'Broafgift', 'Kørsel (egen bil)', 'Værktøj', 'Andet'];
export const EXP_STATUS = ['Ikke indsendt', 'Indsendt', 'Refunderet'];

// ── viden ──
export const KB_TYPES = ['Fejlkode', 'Reservedel', 'Måleværdi', 'Manual / link', 'Note'];
export function searchKb(kb, q = '', type = '') {
  const s = q.trim().toLowerCase();
  return kb.filter(x => (!type || x.t === type) && (!s || [x.ti, x.m, x.c, x.l, x.t].join(' ').toLowerCase().includes(s)));
}

// ── statistik ──
/** The last 12 months: reports, km and expenses per month, plus device types, results and the busiest customers. */
export function stats(log, drv = [], exp = [], now = new Date()) {
  const keys = Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));
  const per = Object.fromEntries(keys.map(k => [k, { reports: 0, km: 0, exp: 0 }]));
  const count = (map, k) => { if (k) map.set(k, (map.get(k) || 0) + 1); };
  const types = new Map(), results = new Map(), customers = new Map();
  for (const r of log) {
    const d = parseDate(r.d), k = d && monthKey(d);
    if (k && per[k]) per[k].reports++;
    count(types, r.f?.f?.r11 || (r.f ? '' : 'Ældre rapport'));
    count(results, r.f?.f?.r15);
    if (r.k && r.k !== '-') count(customers, r.k);
  }
  for (const t of drv) { const d = parseDate(t.d), k = d && monthKey(d); if (k && per[k] && (t.ty || 'Erhverv') === 'Erhverv') per[k].km += Number(t.km) || 0; }
  for (const x of exp) { const d = parseDate(x.d), k = d && monthKey(d); if (k && per[k]) per[k].exp += Number(x.a) || 0; }
  const top = (m, n = 6) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value }));
  return {
    months: keys.map(k => ({ key: k, label: monthLabel(k), ...per[k] })),
    total: log.length,
    thisMonth: per[keys[11]].reports,
    types: top(types), results: top(results), customers: top(customers, 8),
  };
}
