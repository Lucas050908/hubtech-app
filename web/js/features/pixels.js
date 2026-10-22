/** Pixelværksted – pure functions (unit-tested in tests/apps.test.mjs): drawing, fill, mirror, moving and compact saving. */
export const SIZES = [16, 24, 32];
export const PALETTE = ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'];

export const blank = (w, h = w) => Array(w * h).fill('');
/** the pixel on the other side of the middle line (mirror drawing) */
export const mirrorOf = (i, w) => { const x = i % w, y = Math.floor(i / w); return y * w + (w - 1 - x); };
/** paint one pixel (and its mirror) – returns a new array */
export function paint(px, w, i, color, mirror = false) {
  const out = [...px];
  out[i] = color;
  if (mirror) out[mirrorOf(i, w)] = color;
  return out;
}
/** fill the area of the same colour that i is part of (4 directions) */
export function fill(px, w, h, i, color) {
  const from = px[i];
  if (from === color) return [...px];
  const out = [...px], stack = [i];
  while (stack.length) {
    const k = stack.pop();
    if (out[k] !== from) continue;
    out[k] = color;
    const x = k % w, y = Math.floor(k / w);
    if (x > 0) stack.push(k - 1); if (x < w - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - w); if (y < h - 1) stack.push(k + w);
  }
  return out;
}
/** a straight line between two pixels (for fast mouse moves) */
export function line(i0, i1, w) {
  let x0 = i0 % w, y0 = Math.floor(i0 / w);
  const x1 = i1 % w, y1 = Math.floor(i1 / w), dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, out = [];
  let err = dx + dy;
  for (;;) { out.push(y0 * w + x0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  return out;
}
/** move the whole drawing (wraps round the edge) */
export function shift(px, w, h, dx, dy) {
  const out = blank(w, h);
  px.forEach((c, i) => { const x = (i % w + dx + w) % w, y = (Math.floor(i / w) + dy + h) % h; out[y * w + x] = c; });
  return out;
}
export const flipH = (px, w) => px.map((_, i) => px[mirrorOf(i, w)]);
export function flipV(px, w, h) { return px.map((_, i) => px[(h - 1 - Math.floor(i / w)) * w + (i % w)]); }
export const usedColors = (frames) => [...new Set(frames.flat().filter(Boolean))];

// ── saving: a palette and one character per pixel, so a 32 × 32 picture with 8 frames stays small ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function pack(art) {
  const pal = usedColors(art.frames).slice(0, 63);
  return { w: art.w, h: art.h, fps: art.fps || 6, pal, frames: art.frames.map(f => f.map(c => B64[c ? pal.indexOf(c) + 1 : 0] || 'A').join('')) };
}
export function unpack(p) {
  if (!p || !SIZES.includes(p.w) || !Array.isArray(p.frames)) return null;
  const h = p.h || p.w;
  const frames = p.frames.slice(0, 12).map(s => { const f = [...String(s)].slice(0, p.w * h).map(ch => { const k = B64.indexOf(ch); return k > 0 ? (p.pal[k - 1] || '') : ''; }); while (f.length < p.w * h) f.push(''); return f; });
  return { w: p.w, h, fps: p.fps || 6, frames: frames.length ? frames : [blank(p.w, h)] };
}
export const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c);
