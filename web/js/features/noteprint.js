/** Noter → print and PDF: one note, or all notes (pinned first). */
import { esc } from './printing.js';
import { loadScript } from '../office/store.js';

const fmt = (t) => new Date(t).toLocaleString('da-DK', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); const n = m ? parseInt(m[1], 16) : 0xa78bfa; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

export const NOTE_CSS = `
.n-note { border-left: 3pt solid var(--c); padding: 1mm 0 1mm 5mm; margin-bottom: 8mm; break-inside: avoid-page; }
.n-note h2 { font-size: 15pt; font-weight: 700; display: flex; gap: 2mm; align-items: baseline; }
.n-note h2 .pin { font-size: 9pt; color: #b7791f; }
.n-meta { color: #7b8aa0; font-size: 8pt; margin: 1mm 0 3mm; }
.n-body { white-space: pre-wrap; font-size: 10.5pt; line-height: 1.55; overflow-wrap: anywhere; }
.n-body .ck { font-family: inherit; }
.n-single .n-note { border-left-width: 4pt; }
.n-single .n-note h2 { font-size: 20pt; }
.n-toc { columns: 2; column-gap: 8mm; font-size: 9pt; margin: 0 0 8mm; padding: 0; list-style: none; }
.n-toc li { padding: .8mm 0; border-bottom: .5pt dotted #ccd5e0; break-inside: avoid; }
`;

const bodyHtml = (t) => esc(t || '').replace(/^\[( |x|X)\] (.*)$/gm, (_, x, rest) => `<span class="ck">${x.trim() ? '☑' : '☐'} ${rest}</span>`);

export function notesHtml(notes, { single = false } = {}) {
  const head = `<div class="p-head"><div><h1>${single ? 'Note' : 'Noter'}</h1><div class="p-sub">${single ? esc(notes[0]?.title || 'Uden titel') : `${notes.length} note${notes.length === 1 ? '' : 'r'}`}</div></div><div class="p-brand"><b>HUBTECH</b>Noter</div></div>`;
  const toc = !single && notes.length > 3 ? `<ul class="n-toc">${notes.map(n => `<li>${n.pinned ? '★ ' : ''}${esc(n.title || 'Uden titel')}</li>`).join('')}</ul>` : '';
  const cards = notes.map(n => `<article class="n-note" style="--c:${esc(n.color || '#a78bfa')}"><h2>${esc(n.title || 'Uden titel')}${n.pinned ? '<span class="pin">★ fastgjort</span>' : ''}</h2>
<div class="n-meta">Senest ændret ${esc(fmt(n.updated || n.created))}</div><div class="n-body">${bodyHtml(n.body)}</div></article>`).join('');
  return `<section class="${single ? 'n-single' : ''}">${head}${toc}${cards}</section>`;
}

export async function notesPdf(notes, { single = false } = {}) {
  const lib = await loadScript('vendor/jspdf.umd.min.js', 'jspdf');
  const doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 16, TW = W - 2 * M - 6;
  const footer = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(151, 163, 179); doc.text(`Udskrevet ${new Date().toLocaleString('da-DK', { dateStyle: 'long', timeStyle: 'short' })} · HUBTECH`, W - M, H - 8, { align: 'right' }); };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(20, 32, 51); doc.text(single ? 'Note' : 'Noter', M, M + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(91, 107, 128);
  doc.text(single ? (notes[0]?.title || 'Uden titel') : `${notes.length} note${notes.length === 1 ? '' : 'r'}`, M, M + 14);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(124, 58, 237); doc.text('HUBTECH', W - M, M + 8, { align: 'right' });
  doc.setDrawColor(124, 58, 237); doc.setLineWidth(.9); doc.line(M, M + 17, W - M, M + 17);
  let y = M + 28;
  const page = () => { footer(); doc.addPage(); y = M + 6; };
  for (const n of notes) {
    if (y > H - 50) page();
    const top = y;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(single ? 18 : 14); doc.setTextColor(20, 32, 51);
    const tl = doc.splitTextToSize(n.title || 'Uden titel', TW);
    doc.text(tl, M + 6, y); y += tl.length * (single ? 7.4 : 6) - 1;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(123, 138, 160);
    doc.text(`Senest ændret ${fmt(n.updated || n.created)}${n.pinned ? '  ·  fastgjort' : ''}`, M + 6, y + 1.5); y += 7;
    doc.setFontSize(10.5); doc.setTextColor(30, 42, 60);
    // checklist lines ("[ ] …" / "[x] …") get a real box; wrapped lines are indented under the text
    const lines = [];
    for (const raw of String(n.body || '').split('\n')) {
      const ck = /^\[( |x|X)\] (.*)$/.exec(raw);
      if (ck) doc.splitTextToSize(ck[2], TW - 6).forEach((t, i) => lines.push({ t, x: 6, box: i === 0 ? (ck[1].trim() ? 'on' : 'off') : null }));
      else doc.splitTextToSize(raw || ' ', TW).forEach(t => lines.push({ t, x: 0 }));
    }
    let segTop = top - 5;
    for (const ln of lines) {
      if (y > H - 22) { doc.setFillColor(...hex(n.color)); doc.rect(M, segTop, 1.2, y - segTop - 3, 'F'); page(); segTop = y - 5; }
      if (ln.box) {
        doc.setDrawColor(90, 104, 124); doc.setLineWidth(.3); doc.rect(M + 6, y - 3.1, 3.4, 3.4);
        if (ln.box === 'on') { doc.setDrawColor(124, 58, 237); doc.setLineWidth(.6); doc.line(M + 6.6, y - 1.5, M + 7.6, y - .3); doc.line(M + 7.6, y - .3, M + 9.1, y - 2.8); }
      }
      doc.setTextColor(...(ln.box === 'on' ? [123, 138, 160] : [30, 42, 60]));
      doc.text(ln.t, M + 6 + ln.x, y); y += 5.2;
    }
    doc.setFillColor(...hex(n.color)); doc.rect(M, segTop, 1.2, y - segTop - 3, 'F');
    y += 9;
  }
  footer();
  return doc.output('blob');
}
