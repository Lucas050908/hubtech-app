/**
 * Farvebølge – a calm colour puzzle (unit-tested in tests/apps.test.mjs).
 * The board is a smooth blend between four corner colours. The tiles are shuffled, a few stay fixed (they have a dot),
 * and you swap tiles until the colours flow again. No clock, no score to lose.
 */
import { seededRandom } from './gamelogic.js';

const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
export const hex = ([r, g, b]) => `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')}`;
/** HSL (0–360, 0–1, 0–1) → [r, g, b] */
export function hsl(hh, s, l) {
  const k = (n) => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
/** four corner colours that blend nicely and are easy to tell apart */
export function corners(r) {
  const base = r() * 360, turn = 70 + r() * 70, s = 0.55 + r() * 0.3;
  return [hsl(base, s, 0.32 + r() * 0.08), hsl(base + turn, s, 0.55 + r() * 0.1), hsl(base - turn * 0.8, s * 0.9, 0.62 + r() * 0.1), hsl(base + turn * 1.9, s, 0.82 + r() * 0.06)];
}
/** the finished picture: w × h colours (bilinear blend of the corners) */
export function gradient(w, h, c) {
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = w > 1 ? x / (w - 1) : 0, v = h > 1 ? y / (h - 1) : 0;
    const mix = (i) => c[0][i] * (1 - u) * (1 - v) + c[1][i] * u * (1 - v) + c[2][i] * (1 - u) * v + c[3][i] * u * v;
    out.push(hex([mix(0), mix(1), mix(2)]));
  }
  return out;
}
/** level n: the board gets bigger and fewer tiles stay fixed */
export function levelSpec(n) {
  const sizes = [[4, 4], [4, 5], [5, 5], [5, 6], [6, 6], [6, 7], [7, 7], [7, 8], [8, 8], [8, 9], [9, 9], [9, 10]];
  const [w, h] = sizes[Math.min(n - 1, sizes.length - 1)];
  const fix = n <= 3 ? 'frame' : n <= 6 ? 'checker' : n <= 9 ? 'edges' : 'corners';
  return { w, h, fix };
}
export function fixedCells(w, h, kind) {
  const s = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, edgeX = x === 0 || x === w - 1, edgeY = y === 0 || y === h - 1;
    if (edgeX && edgeY) s.add(i);
    else if (kind === 'frame' && (edgeX || edgeY)) s.add(i);
    else if (kind === 'checker' && (edgeX || edgeY) && (x + y) % 2 === 0) s.add(i);
    else if (kind === 'edges' && ((edgeX && y % 3 === 0) || (edgeY && x % 3 === 0))) s.add(i);
  }
  return s;
}
/** a new puzzle: { w, h, colors (the answer), fixed: [indices], order: position → tile } */
export function makePuzzle(n, seed = `farve-${n}-${Math.random()}`) {
  const r = seededRandom(String(seed)), { w, h, fix } = levelSpec(n);
  const colors = gradient(w, h, corners(r)), fixed = fixedCells(w, h, fix);
  const free = [...Array(w * h).keys()].filter(i => !fixed.has(i));
  const order = [...Array(w * h).keys()];
  do {
    for (let k = free.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [order[free[k]], order[free[j]]] = [order[free[j]], order[free[k]]]; }
  } while (free.length > 1 && free.filter(i => order[i] === i).length > free.length / 4);
  return { n, w, h, colors, fixed: [...fixed], order };
}
export function swap(p, a, b) {
  if (a === b || p.fixed.includes(a) || p.fixed.includes(b)) return false;
  [p.order[a], p.order[b]] = [p.order[b], p.order[a]];
  return true;
}
export const placed = (p) => p.order.filter((t, i) => t === i).length;
export const solved = (p) => p.order.every((t, i) => t === i);
/** a hint: a tile that is in the wrong place, and where it belongs */
export function hint(p) {
  const pos = p.order.findIndex((t, i) => t !== i);
  return pos < 0 ? null : { from: p.order.indexOf(pos), to: pos };
}
