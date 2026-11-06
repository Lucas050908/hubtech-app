/** Servicehjælp: the report as an A4 PDF (jsPDF, vendored and loaded on demand) – with checks, parts and photos. */
import { loadScript } from '../office/store.js';
import { CHECKS, parseParts, kr } from './service.js';

async function asDataUrl(u) {
  if (!u) return null;
  if (u.startsWith('data:')) return u;
  try {
    const b = await (await fetch(u, { credentials: 'same-origin' })).blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch { return null; }
}

/** rec: a saved report ({ d, f: { f, q, p } }). Returns { name, blob }. */
export async function reportPdf(rec) {
  const lib = await loadScript('vendor/jspdf.umd.min.js', 'jspdf');
  const doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
  const o = rec.f || {}, f = o.f || {}, v = (id) => (f[id] || '').trim();
  const W = 210, L = 18, R = W - 18, BOTTOM = 280;
  let y = 22;
  doc.setProperties({ title: `Servicerapport ${v('r1')}`, creator: 'HUBTECH' });
  const need = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 20; } };
  const ink = () => doc.setTextColor(20, 24, 32), soft = () => doc.setTextColor(105, 112, 125);

  // header
  doc.setFillColor(249, 115, 22); doc.rect(0, 0, W, 4, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); ink(); doc.text('SERVICERAPPORT', L, y);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); soft();
  doc.text(rec.d || '', R, y - 6, { align: 'right' });
  if (v('r14')) doc.text(`Tekniker: ${v('r14')}`, R, y, { align: 'right' });
  y += 10;

  // customer and device side by side
  const block = (x, title, rows) => {
    let yy = y;
    doc.setFontSize(8); soft(); doc.text(title.toUpperCase(), x, yy); yy += 5.5;
    rows.filter(([, val]) => val).forEach(([k, val], i) => {
      doc.setFontSize(i === 0 ? 11.5 : 9.5); doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); ink();
      const lines = doc.splitTextToSize(k ? `${k}: ${val}` : val, 80); doc.text(lines, x, yy); yy += lines.length * (i === 0 ? 5.6 : 4.6);
    });
    return yy;
  };
  const y1 = block(L, 'Kunde', [['', v('r1')], ['Kontakt', v('r8')], ['', v('r9')], ['Tlf.', v('r10')]]);
  const y2 = block(110, 'Enhed', [['', [v('r11'), v('r2')].filter(Boolean).join(' – ')], ['Serienr.', v('r12')]]);
  y = Math.max(y1, y2) + 2;
  doc.setDrawColor(225, 228, 234); doc.line(L, y, R, y);
  y += 8;

  const section = (title, text) => {
    if (!text) return;
    const lines = doc.splitTextToSize(text, R - L);
    need(10 + lines.length * 4.8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); ink(); doc.text(title, L, y); y += 5.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(45, 50, 60); doc.text(lines, L, y); y += lines.length * 4.8 + 4;
  };
  section('Fejl som kunden beskriver', v('r3'));
  section('Fundet årsag', v('r4'));
  section('Udført arbejde', v('r5'));
  if (v('r15')) {
    need(12);
    const ok = /udbedt$/i.test(v('r15'));
    doc.setFillColor(...(ok ? [220, 252, 231] : [254, 243, 199])); doc.roundedRect(L, y - 4.5, R - L, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...(ok ? [21, 128, 61] : [146, 64, 14])); doc.text(`Resultat: ${v('r15')}`, L + 3, y + 0.8); y += 10;
  }
  const done = CHECKS.filter((_, i) => o.q?.[i]);
  if (done.length) section('Tjekket', done.map(x => `✓ ${x}`).join('    ').replace(/✓/g, '•'));

  // parts table
  const parts = parseParts(v('r6'));
  if (parts.rows.length) {
    need(16 + parts.rows.length * 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); ink(); doc.text('Reservedele', L, y); y += 4;
    doc.setFillColor(243, 244, 246); doc.rect(L, y, R - L, 6.5, 'F');
    doc.setFontSize(8.5); soft(); doc.text('Beskrivelse', L + 2, y + 4.4); doc.text('Varenr.', 112, y + 4.4); doc.text('Antal', 146, y + 4.4, { align: 'right' }); doc.text('Beløb', R - 2, y + 4.4, { align: 'right' }); y += 10.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); ink();
    for (const r of parts.rows) { doc.text(doc.splitTextToSize(r.desc || '–', 90)[0], L + 2, y); doc.text(r.no || '', 112, y); doc.text(String(r.qty).replace('.', ','), 146, y, { align: 'right' }); doc.text(r.price ? kr(r.sum) : '', R - 2, y, { align: 'right' }); y += 6; }
    if (parts.total) { doc.setFont('helvetica', 'bold'); doc.text(`I alt: ${kr(parts.total)}`, R - 2, y, { align: 'right' }); y += 7; }
  }
  section('Tidsforbrug', v('r7'));
  section('Anbefalinger og opfølgning', v('r13'));

  // photos, two per row
  const photos = (o.p || []).filter(p => p && p.u);
  if (photos.length) {
    need(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); ink(); doc.text('Billeder', L, y); y += 4;
    const colW = (R - L - 6) / 2;
    for (let i = 0; i < photos.length; i += 2) {
      const row = photos.slice(i, i + 2), imgs = await Promise.all(row.map(p => asDataUrl(p.u)));
      const hs = row.map((p) => colW * ((p.h || 3) / (p.w || 4)));
      const rh = Math.min(85, Math.max(...hs));
      need(rh + 10);
      row.forEach((p, k) => {
        const x = L + k * (colW + 6), h = Math.min(rh, hs[k]);
        if (imgs[k]) { try { doc.addImage(imgs[k], /png/i.test(imgs[k].slice(0, 30)) ? 'PNG' : 'JPEG', x, y, colW * (h / hs[k]), h); } catch { /* a photo that can't be read is left out */ } }
        if (p.c) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); soft(); doc.text(p.c, x, y + h + 4); }
      });
      y += rh + 9;
    }
  }

  // signature lines
  need(24); y = Math.max(y + 8, Math.min(BOTTOM - 16, y + 8));
  doc.setDrawColor(160, 166, 176); doc.line(L, y, L + 70, y); doc.line(R - 70, y, R, y);
  doc.setFontSize(8.5); soft(); doc.text('Kundens underskrift', L, y + 4.5); doc.text('Teknikerens underskrift', R - 70, y + 4.5);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); soft(); doc.text(`Lavet med HUBTECH Servicehjælp · side ${i} af ${pages}`, W / 2, 291, { align: 'center' }); }
  const safe = (v('r1') || 'kunde').replace(/[^\wæøåÆØÅ -]/g, '').trim().replace(/\s+/g, '-');
  return { name: `Servicerapport-${safe}-${(rec.d || '').replace(/\D+/g, '-')}.pdf`.replace(/-+/g, '-'), blob: doc.output('blob') };
}
