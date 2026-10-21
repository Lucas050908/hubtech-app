/**
 * Crop a profile picture: drag to move, zoom with the slider, the mouse wheel or two fingers, see the round result
 * before saving. Returns a 512×512 WebP (or JPEG where the browser can't make WebP), or null if cancelled.
 */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { modal } from '../core/ui.js';

const OUT = 512;
const MAX_FILE = 25 * 1024 * 1024;

async function decode(file) {
  if (file.size > MAX_FILE) throw new Error('Billedet er for stort (højst 25 MB).');
  if (file.type && !/^image\//.test(file.type)) throw new Error('Vælg en billedfil (JPG, PNG eller WebP).');
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* older browsers */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async'; img.src = url;
    await img.decode();
    return img;
  } catch { throw new Error('Billedet kunne ikke åbnes. Brug JPG, PNG eller WebP.'); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

export async function cropAvatar(file) {
  const img = await decode(file);
  const iw = img.width, ih = img.height;
  if (iw < 32 || ih < 32) throw new Error('Billedet er for lille.');
  return new Promise((resolve) => {
    const SIZE = Math.min(320, Math.floor(innerWidth * 0.78));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cv = h('canvas', { class: 'crop-canvas', width: SIZE * dpr, height: SIZE * dpr, style: { width: `${SIZE}px`, height: `${SIZE}px` }, tabindex: '0', 'aria-label': 'Billedet – træk for at flytte, brug piletasterne og + / −' });
    const ctx = cv.getContext('2d');
    const minScale = Math.max(SIZE / iw, SIZE / ih);      // the picture always fills the circle
    let scale = minScale, x = (SIZE - iw * scale) / 2, y = (SIZE - ih * scale) / 2;
    const clamp = () => { x = Math.min(0, Math.max(SIZE - iw * scale, x)); y = Math.min(0, Math.max(SIZE - ih * scale, y)); };
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a1422'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, iw * scale, ih * scale);
    };
    const zoom = h('input', { type: 'range', class: 'range', min: 1, max: 4, step: 0.01, value: 1, 'aria-label': 'Zoom' });
    const zoomTo = (z, cx = SIZE / 2, cy = SIZE / 2) => {
      const ns = minScale * Math.max(1, Math.min(4, z));
      x = cx - (cx - x) * (ns / scale); y = cy - (cy - y) * (ns / scale); scale = ns;
      clamp(); draw(); zoom.value = String(scale / minScale);
    };
    zoom.addEventListener('input', () => zoomTo(Number(zoom.value)));
    // drag (mouse, pen, one finger) and pinch (two fingers)
    const pts = new Map();
    let pinch = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: scale / minScale }; } });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; zoomTo(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
      const k = SIZE / cv.getBoundingClientRect().width;     // screen pixels → stage pixels (also with zoomed UI)
      x += dx * k; y += dy * k; clamp(); draw();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(), k = SIZE / r.width; zoomTo(scale / minScale * (e.deltaY < 0 ? 1.08 : 1 / 1.08), (e.clientX - r.left) * k, (e.clientY - r.top) * k); }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 20 : 6;
      if (e.key === 'ArrowLeft') x += step; else if (e.key === 'ArrowRight') x -= step; else if (e.key === 'ArrowUp') y += step; else if (e.key === 'ArrowDown') y -= step;
      else if (e.key === '+' || e.key === '=') return zoomTo(scale / minScale * 1.1); else if (e.key === '-') return zoomTo(scale / minScale / 1.1); else return;
      e.preventDefault(); clamp(); draw();
    });
    draw();
    let done = false;
    const save = h('button', { class: 'btn btn-primary' }, icon('check'), 'Gem billede');
    const cancel = h('button', { class: 'btn btn-ghost' }, 'Annullér');
    const m = modal({
      title: 'Tilpas dit profilbillede', label: 'Profil', size: 420,
      body: h('div', { class: 'crop-wrap' }, h('div', { class: 'crop-stage', style: { width: `${SIZE}px`, height: `${SIZE}px` } }, cv, h('div', { class: 'crop-mask', 'aria-hidden': 'true' })),
        h('label', { class: 'crop-zoom' }, icon('search'), zoom), h('p', { class: 'faint', style: { margin: 0, textAlign: 'center' } }, 'Træk i billedet for at flytte det. Zoom med skyderen, musehjulet eller to fingre.')),
      actions: [cancel, save],
      onClose: () => { if (!done) resolve(null); },
    });
    cancel.addEventListener('click', () => m.close());
    save.addEventListener('click', async () => {
      const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
      const o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
      const k = OUT / SIZE;
      o.drawImage(img, x * k, y * k, iw * scale * k, ih * scale * k);
      let blob = await toBlob(out, 'image/webp', 0.88);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(out, 'image/jpeg', 0.9);
      done = true; m.close(); resolve(blob);
    });
    setTimeout(() => cv.focus(), 50);
  });
}
