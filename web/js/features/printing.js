/**
 * Printing for HUBTECH: a clean, white A4 document rendered in a hidden frame and sent to the printer
 * (on a computer the print dialog also offers "Gem som PDF"). In the Android app the page is handed to
 * Android's own print service via the HubtechAndroid bridge.
 */
const BASE_CSS = `
@page { size: A4 PAGE_ORIENT; margin: 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #142033; font: 500 10pt/1.4 Manrope, "Segoe UI", system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3 { font-family: Sora, "Segoe UI", system-ui, sans-serif; margin: 0; letter-spacing: -.01em; }
.p-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5pt solid var(--accent, #2563eb); padding-bottom: 3mm; margin-bottom: 5mm; }
.p-head h1 { font-size: 22pt; font-weight: 700; }
.p-head .p-sub { color: #5b6b80; font-size: 9.5pt; margin-top: 1mm; }
.p-brand { text-align: right; color: #8090a6; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.p-brand b { display: block; color: var(--accent, #2563eb); font: 800 12pt Sora, system-ui, sans-serif; letter-spacing: .04em; }
.p-foot { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; color: #97a3b3; font-size: 7.5pt; }
.p-page { break-after: page; }
.p-page:last-child { break-after: auto; }
.muted { color: #6b7a8f; }
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

export function buildDocument({ title, css = '', body, landscape = false, accent = '#2563eb' }) {
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>:root{--accent:${accent}}${BASE_CSS.replace('PAGE_ORIENT', landscape ? 'landscape' : 'portrait')}${css}</style></head>
<body>${body}<div class="p-foot"><span>${esc(title)}</span><span>Udskrevet ${esc(new Date().toLocaleString('da-DK', { dateStyle: 'long', timeStyle: 'short' }))} · HUBTECH</span></div></body></html>`;
}

/** Print an HTML document. Returns a promise that resolves when the print dialog has been opened. */
export function printDocument(opts) {
  const html = buildDocument(opts);
  const bridge = window.HubtechAndroid;
  if (bridge?.printHtml) { bridge.printHtml(opts.title || 'HUBTECH', html, location.origin + '/'); return Promise.resolve(true); }
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.onload = async () => {
      try { await frame.contentDocument.fonts?.ready; } catch { /* */ }
      setTimeout(() => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* */ }
        resolve(true);
        setTimeout(() => frame.remove(), 60e3);
      }, 120);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
