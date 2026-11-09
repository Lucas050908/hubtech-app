/** Builds an invoice PDF with jsPDF (vendored, loaded on demand). A4, Danish, VAT specified. */
import { loadScript } from '../office/store.js';
import { totals, lineTotal, daDate, invoiceNo, kr } from './invoice.js';

const qtyTxt = (q) => (Number(q) || 0).toLocaleString('da-DK', { maximumFractionDigits: 2 });

export async function invoicePdf(inv, company = {}, customer = {}) {
  const lib = await loadScript('vendor/jspdf.umd.min.js', 'jspdf');
  const doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, L = 18, R = W - 18;
  const draft = inv.status === 'draft';
  doc.setProperties({ title: `Faktura ${invoiceNo(inv.no)}`, creator: 'HUBTECH' });

  // header: seller
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(20, 30, 45);
  doc.text(company.name || 'Dit firma', L, 24);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90, 100, 115);
  const seller = [company.address, [company.zip, company.city].filter(Boolean).join(' '), company.cvr && `CVR ${company.cvr}`, company.phone && `Tlf. ${company.phone}`, company.email].filter(Boolean);
  seller.forEach((s, i) => doc.text(String(s), L, 31 + i * 4.6));

  // title block
  doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(20, 30, 45);
  doc.text(draft ? 'FAKTURAUDKAST' : 'FAKTURA', R, 24, { align: 'right' });
  doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 70, 85);
  const meta = [['Fakturanr.', invoiceNo(inv.no)], ['Fakturadato', daDate(inv.date)], ['Forfaldsdato', daDate(inv.due)]];
  meta.forEach(([k, v], i) => { doc.text(k, R - 40, 32 + i * 5); doc.setFont('helvetica', 'bold'); doc.text(v || '–', R, 32 + i * 5, { align: 'right' }); doc.setFont('helvetica', 'normal'); });

  // buyer
  let y = 62;
  doc.setFontSize(8); doc.setTextColor(120, 130, 145); doc.text('FAKTURERES TIL', L, y);
  doc.setFontSize(11); doc.setTextColor(20, 30, 45); doc.setFont('helvetica', 'bold');
  doc.text(customer.name || '–', L, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 70, 85);
  [customer.contact && `Att. ${customer.contact}`, customer.address, customer.cvr && `CVR ${customer.cvr}`, customer.email].filter(Boolean).forEach((s, i) => doc.text(String(s), L, y + 11.5 + i * 4.6));

  // lines
  y = 96;
  const col = { text: L, qty: 128, unit: 140, price: 168, sum: R };
  doc.setFillColor(238, 242, 247); doc.rect(L - 2, y - 5, R - L + 4, 8, 'F');
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 70, 85);
  doc.text('Beskrivelse', col.text, y); doc.text('Antal', col.qty, y, { align: 'right' }); doc.text('Enhed', col.unit, y);
  doc.text('Pris', col.price, y, { align: 'right' }); doc.text('Beløb', col.sum, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(25, 35, 50);
  y += 8;
  for (const l of inv.lines || []) {
    const wrapped = doc.splitTextToSize(String(l.text || ''), col.qty - col.text - 14);
    if (y + wrapped.length * 4.6 > 250) { doc.addPage(); y = 24; }
    doc.text(wrapped, col.text, y);
    doc.text(qtyTxt(l.qty), col.qty, y, { align: 'right' });
    doc.text(String(l.unit || ''), col.unit, y);
    doc.text(kr(l.price).replace(' kr.', ''), col.price, y, { align: 'right' });
    doc.text(kr(lineTotal(l)).replace(' kr.', ''), col.sum, y, { align: 'right' });
    y += wrapped.length * 4.6 + 2.4;
    doc.setDrawColor(228, 232, 238); doc.line(L - 2, y - 3.2, R + 2, y - 3.2);
  }

  // totals
  const t = totals(inv.lines, inv.vat ?? 25);
  y += 4; if (y > 250) { doc.addPage(); y = 30; }
  const tot = (label, val, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11.5 : 9.5); doc.text(label, 150, y, { align: 'right' }); doc.text(val, R, y, { align: 'right' }); y += bold ? 7 : 5.4; };
  tot('Subtotal ekskl. moms', kr(t.net)); tot(`Moms ${inv.vat ?? 25} %`, kr(t.vat)); doc.setDrawColor(40, 50, 65); doc.line(110, y - 3.5, R, y - 3.5); y += 1.5; tot('I alt (DKK)', kr(t.gross), true);

  // payment + note
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 70, 85);
  if (inv.note) { const n = doc.splitTextToSize(inv.note, R - L); doc.text(n, L, y); y += n.length * 4.6 + 4; }
  const bank = company.reg && company.account ? `Reg.nr. ${company.reg} · Kontonr. ${company.account}` : '';
  const pay = [`Betaling senest ${daDate(inv.due)}${bank ? ` til ${bank}` : ''}.`, `Angiv fakturanummer ${invoiceNo(inv.no)} ved betaling.`];
  doc.text(pay, L, Math.max(y, 262));
  if (draft) { doc.setTextColor(200, 60, 60); doc.setFontSize(8.5); doc.text('Udkast – endnu ikke sendt', L, 284); }
  doc.setTextColor(150, 158, 170); doc.setFontSize(7.5); doc.text('Lavet med HUBTECH', R, 284, { align: 'right' });
  return doc.output('blob');
}
