/**
 * Screen size and the window's background, per device (stored locally).
 *  - Størrelse: CSS zoom on <body>. "Automatisk" enlarges the interface on very big screens shown at 100 %
 *    (a 4K monitor without Windows scaling), so text doesn't become tiny.
 *  - Gennemsigtig baggrund: only in the HUBTECH app for Windows. The app window has a see-through, blurred
 *    background (Windows' acrylic/Mica), so your own wallpaper shows behind HUBTECH. A web page in a browser can't.
 */
import { store } from './store.js';

export const SCALES = [['auto', 'Automatisk'], ['0.9', '90 %'], ['1', '100 %'], ['1.25', '125 %'], ['1.5', '150 %'], ['1.75', '175 %'], ['2', '200 %']];
export const BACKDROPS = [['acrylic', 'Sløret (acrylic)'], ['mica', 'Diskret (Mica)'], ['clear', 'Helt klar']];

/** Running inside the HUBTECH Windows app (WebView2), which can make its window see-through? */
export const canBeTransparent = () => !!window.chrome?.webview && /HubtechDesktop\/\d+/.test(navigator.userAgent);

export function autoZoom(w = innerWidth, h = innerHeight) {
  if (matchMedia('(pointer: coarse)').matches) return 1;
  if (w >= 3400 && h >= 1800) return 1.75;
  if (w >= 2800 && h >= 1500) return 1.5;
  if (w >= 2300 && h >= 1250) return 1.25;
  return 1;
}

export const getScale = () => store.device('uiScale') || 'auto';
export const getBackdrop = () => store.device('backdrop') || 'off';

export function applyDisplay() {
  const s = getScale();
  const z = s === 'auto' ? autoZoom() : Math.max(0.75, Math.min(2.5, Number(s) || 1));
  document.body.style.zoom = z === 1 ? '' : String(z);
  document.documentElement.dataset.zoom = String(z);
  document.documentElement.style.setProperty('--z', String(z));   // CSS: 100vh / var(--z) = the visible height inside the zoomed page
  const bd = canBeTransparent() ? getBackdrop() : 'off';
  if (bd === 'off') delete document.documentElement.dataset.transparent;
  else document.documentElement.dataset.transparent = bd;
  try { window.chrome?.webview?.postMessage({ type: 'backdrop', value: bd }); } catch { /* */ }
  window.__hubtechWorld?.[bd === 'off' ? 'startLoop' : 'stopLoop']?.();
  dispatchEvent(new Event('hubtech-display'));
}
export function setScale(v) { store.device('uiScale', v); applyDisplay(); }
export function setBackdrop(v) { store.device('backdrop', v); applyDisplay(); }

let t = 0;
addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (getScale() === 'auto') applyDisplay(); }, 150); });
