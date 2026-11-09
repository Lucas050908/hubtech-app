/** A QR code as crisp SVG (the qrcode library is loaded the first time it is needed). */
export async function qrSvg(text, size = 168) {
  const { loadScript } = await import('../office/store.js');
  const qrcode = await loadScript('vendor/qrcode.js', 'qrcode');
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  const n = q.getModuleCount(), cell = size / (n + 8);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${((c + 4) * cell).toFixed(2)} ${((r + 4) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(NS, 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${size} ${size}`); svgEl.setAttribute('width', size); svgEl.setAttribute('height', size);
  svgEl.setAttribute('role', 'img'); svgEl.setAttribute('aria-label', `QR-kode til ${text}`); svgEl.classList.add('qr');
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('rx', 10); bg.setAttribute('fill', '#fff');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#0a1422');
  svgEl.append(bg, p);
  return svgEl;
}
