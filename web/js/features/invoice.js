/** Pure helpers for Kunder & fakturaer (unit-tested in tests/invoice.test.mjs). */

export const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
/** Does `text` belong to the customer called `name`? Exact name, or the name as a whole word inside the text. */
export function matchesCustomer(name, text) {
  const n = norm(name), t = norm(text);
  if (!n || !t) return false;
  if (t === n) return true;
  if (n.length < 3) return false;
  const i = t.indexOf(n);
  if (i < 0) return false;
  const before = t[i - 1], after = t[i + n.length];
  const edge = (ch) => ch === undefined || !/[\p{L}\p{N}]/u.test(ch);
  return edge(before) && edge(after);
}

export const hoursOf = (e) => Math.max(0, ((e.end || 0) - (e.start || 0)) / 3600e3);
/** Billing is rounded up to the nearest quarter of an hour (0.25). */
export const quarter = (h) => Math.max(0, Math.ceil(h * 4 - 1e-9) / 4) + 0;
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function lineTotal(l) { return round2((Number(l.qty) || 0) * (Number(l.price) || 0)); }
export function totals(lines = [], vatPct = 25) {
  const net = round2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const vat = round2(net * (Number(vatPct) || 0) / 100);
  return { net, vat, gross: round2(net + vat) };
}

const d2 = (n) => String(n).padStart(2, '0');
export const isoDate = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`; };
export const daDate = (iso) => { const [y, m, d] = String(iso || '').split('-'); return y && m && d ? `${d}-${m}-${y}` : ''; };
export function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n).getTime()); }

/** Time entries → invoice lines (one per entry, quarter hours, the entry's own text). */
export function linesFromEntries(entries, rate) {
  return entries.slice().sort((a, b) => a.start - b.start).map(e => ({
    text: `${daDate(isoDate(e.start))} · ${e.desc || 'Arbejde'}`, qty: quarter(hoursOf(e)), unit: 'timer', price: Number(rate) || 0, src: { kind: 'time', id: e.id },
  }));
}

/** "0042" style invoice numbers. */
export const invoiceNo = (n) => String(n).padStart(4, '0');

/** Status of an invoice, including overdue. */
export function invoiceState(inv, today = isoDate()) {
  if (inv.status === 'paid') return { key: 'paid', label: 'Betalt' };
  if (inv.status === 'sent') return inv.due && inv.due < today ? { key: 'overdue', label: 'Forfalden' } : { key: 'sent', label: 'Sendt' };
  return { key: 'draft', label: 'Kladde' };
}

export const kr = (n) => (Number(n) || 0).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr.';
