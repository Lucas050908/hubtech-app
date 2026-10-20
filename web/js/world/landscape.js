/**
 * The living world — a procedural, painterly 2D landscape on <canvas>.
 *
 * Design:
 *  - Terrain is generated from a fixed seed, so every season shows *the same valley*.
 *  - Static layers (sky, far ridges, mid valley + lake, foreground) are painted once into
 *    offscreen canvases per scene and only re-painted on resize or scene change.
 *  - Each frame composites those layers with parallax and adds the living parts: drifting
 *    clouds, light rays, lake glitter, particles (petals, motes, leaves, snow), weather, birds.
 *  - Season / time changes cross-fade between two scenes.
 *  - Frame rate is capped (30 fps), the loop pauses when the tab is hidden, and reduced
 *    motion renders a single still frame.
 */
import { resolvePalette, rgb, mix, mul, css } from './palettes.js';

// ── deterministic randomness & noise ────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise1(seed) {
  const r = mulberry32(seed);
  const P = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) P[i] = r();
  return (x) => {
    const i = Math.floor(x), f = x - i;
    const a = P[i & 1023], b = P[(i + 1) & 1023];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}
function fbm(n, x, oct = 5) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f + i * 17.3); norm += a; a *= 0.5; f *= 2.07; }
  return s / norm;
}
function ridged(n, x, oct = 5) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(2 * n(x * f + i * 9.1) - 1); s += a * v * v; norm += a; a *= 0.5; f *= 2.13; }
  return s / norm;
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ── terrain definition (normalised coordinates, y down, 0..1 of height) ──
const LANDSCAPES = {
  valley: { seed: 7, horizon: 0.44, far: 0.32, mid: 0.17, near: 0.07, lakeBottom: 0.7, center: 0.555, valleyWidth: 0.16, peak: 0.4, peakL: 0.31, peakR: 0.79 },
  highlands: { seed: 23, horizon: 0.5, far: 0.38, mid: 0.22, near: 0.09, lakeBottom: 0.72, center: 0.45, valleyWidth: 0.1, peak: 0.34, peakL: 0.28, peakR: 0.74 },
  fjord: { seed: 41, horizon: 0.47, far: 0.4, mid: 0.24, near: 0.06, lakeBottom: 0.8, center: 0.5, valleyWidth: 0.06, peak: 0.52, peakL: 0.34, peakR: 0.67 },
  alps: { seed: 59, horizon: 0.5, far: 0.48, mid: 0.25, near: 0.1, lakeBottom: 0.74, center: 0.52, valleyWidth: 0.12, peak: 0.6, peakL: 0.2, peakR: 0.72 },
  hills: { seed: 3, horizon: 0.5, far: 0.12, mid: 0.13, near: 0.09, lakeBottom: 0.7, center: 0.6, valleyWidth: 0.35, peak: 0.0, peakL: 0.3, peakR: 0.8, drop: 0.012, hillL: 0.09, hillR: 0.1 },
  coast: { seed: 88, horizon: 0.55, far: 0.035, mid: 0.025, near: 0.02, lakeBottom: 0.86, center: 0.5, valleyWidth: 0.6, peak: 0.07, peakL: 0.03, peakR: 0.98, lake: [0.04, 0.3, 0.97, 0.72], hillL: 0.08, hillR: 0.06 },
  lakes: { seed: 101, horizon: 0.46, far: 0.26, mid: 0.18, near: 0.08, lakeBottom: 0.76, center: 0.42, valleyWidth: 0.22, peak: 0.2, peakL: 0.12, peakR: 0.72, lake: [0.18, 0.48, 0.9, 0.6] },
};
export const LANDSCAPE_KINDS = Object.keys(LANDSCAPES);

const LAKE = [0.36, 0.7, 0.76, 0.46];
function buildTerrain(kind) {
  const L = LANDSCAPES[kind] || LANDSCAPES.valley;
  const n = [noise1(L.seed), noise1(L.seed + 11), noise1(L.seed + 23), noise1(L.seed + 37), noise1(L.seed + 51), noise1(L.seed + 67)];
  const valley = (x, w) => smooth(0, 1, Math.abs(x - L.center) / (w + 0.0001));
  const T = {
    ...L,
    // heights above horizon (fraction of screen height)
    far: (x) => L.far * (0.32 + 0.68 * valley(x, L.valleyWidth * 2.4)) * (0.12 + 0.95 * Math.pow(ridged(n[0], x * 1.9 + 2.4, 6), 1.7)) + 0.035,
    mid: (x) => L.mid * (0.12 + 0.88 * valley(x, L.valleyWidth * 1.8)) * (0.25 + 0.6 * fbm(n[1], x * 2.6 + 5) + 0.45 * Math.pow(ridged(n[4], x * 4.1 + 3, 4), 2)) + 0.012,
    near: (x) => L.near * (0.05 + 0.95 * valley(x, L.valleyWidth * 1.25)) * (0.4 + 0.8 * fbm(n[2], x * 7.5 + 1)),
    // y (screen fraction) of the shore hills tops – left and right of the lake
    // lake = [left shore starts dropping, left shore fully down, right shore starts, right shore fully down]; drop = how far the shore hills fall away (0 = no lake)
    shoreL: (x) => L.horizon + 0.012 - (L.hillL ?? 0.13) * Math.pow(clamp(1 - x / 0.46), 1.4) - 0.012 * fbm(n[3], x * 18) + (L.drop ?? 0.6) * Math.pow(smooth((L.lake || LAKE)[0], (L.lake || LAKE)[1], x), 1.6),
    shoreR: (x) => L.horizon + 0.016 - (L.hillR ?? 0.12) * Math.pow(clamp((x - 0.66) / 0.34), 1.3) - 0.012 * fbm(n[3], x * 18 + 40) + (L.drop ?? 0.6) * Math.pow(smooth((L.lake || LAKE)[2], (L.lake || LAKE)[3], x), 1.6),
    nearShore: (x) => L.lakeBottom + 0.025 * fbm(n[4], x * 6) - 0.035 * Math.pow(clamp(1 - Math.abs(x - 0.56) / 0.45), 2) + 0.03 * Math.pow(Math.abs(x - 0.56) * 2, 2),
    fore: (x) => 0.9 + 0.035 * fbm(n[5], x * 5) - 0.3 * Math.pow(clamp(1 - x / 0.3), 2.1) - 0.26 * Math.pow(clamp((x - 0.75) / 0.25), 2.2),
    // tall, jagged rock peaks that frame the valley on both sides (like the mockup's mountains)
    peaks: (x) => {
      const g = (c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
      const env = Math.max(g(L.peakL, 0.075), 0.92 * g(L.peakR, 0.08), 0.75 * g(L.peakL - 0.2, 0.08), 0.7 * g(L.peakR + 0.17, 0.07));
      if (env < 0.01) return 0;
      const spikes = Math.pow(ridged(n[5], x * 8.5 + 1.7, 5), 1.5);
      const v = x * 21 + n[3](x * 4) * 2.5;
      const saw = 1 - Math.abs((((v % 2) + 2) % 2) - 1);
      const teeth = Math.pow(ridged(n[2], x * 34 + 4.2, 3), 2.5);
      return L.peak * env * (0.4 + 0.38 * spikes + 0.14 * saw * saw + 0.1 * teeth);
    },
    rand: (s) => mulberry32(L.seed * 1000 + s),
  };
  return T;
}

// ── drawing helpers ────────────────────────────────────────────────────
function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h)) : Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
  return c;
}

function fillProfile(ctx, W, H, M, fn, bottom, style) {
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  const step = Math.max(2, Math.round(W / 700));
  for (let px = 0; px <= W + 2 * M; px += step) {
    const x = (px - M) / W;
    ctx.lineTo(px, fn(x) * H);
  }
  ctx.lineTo(W + 2 * M, bottom);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/** Mountain ridge with aerial perspective, slope lighting and snow caps. */
function paintRidge(ctx, S, heightFn, baseCol, depth, opts = {}) {
  const { W, H, M, P, T } = S;
  const horizonY = T.horizon * H;
  const hz = P.haze;
  const aerial = [0.58, 0.36, 0.16][depth];
  const top = mix(P.shade(baseCol), hz, aerial);
  const bot = mix(P.shade(baseCol), hz, Math.min(1, aerial + 0.42));
  const yOf = (x) => T.horizon - heightFn(x);
  // body
  let minY = H;
  const step = Math.max(2, Math.round(W / 640));
  const cols = [];
  for (let px = 0; px <= W + 2 * M; px += step) {
    const x = (px - M) / W;
    const y = yOf(x) * H;
    cols.push([px, y, x]);
    if (y < minY) minY = y;
  }
  const g = ctx.createLinearGradient(0, minY, 0, horizonY);
  g.addColorStop(0, css(top)); g.addColorStop(1, css(bot));
  ctx.beginPath(); ctx.moveTo(0, horizonY + 2);
  for (const [px, y] of cols) ctx.lineTo(px, y);
  ctx.lineTo(W + 2 * M, horizonY + 2); ctx.closePath();
  ctx.fillStyle = g; ctx.fill();

  // slope lighting – light comes from the sun's horizontal position.
  // Painted into a temp layer and blurred so faces read as soft planes, not stripes.
  const sunX = P.sky.sunPos[0];
  const lightC = mix(P.sky.light, [255, 255, 255], 0.2);
  const shadowC = mix(mul(baseCol, 0.35), [20, 30, 60], 0.5);
  const strength = [0.16, 0.34, 0.4][depth] * (P.time === 'night' ? 0.35 : 1);
  // painted at quarter resolution and upscaled: bilinear filtering turns columns into soft planes
  const DS = 4;
  const tmp = makeCanvas(Math.ceil(ctx.canvas.width / DS), Math.ceil(ctx.canvas.height / DS));
  const tc = tmp.getContext('2d');
  tc.scale(1 / DS, 1 / DS);
  // faces: coarse segments shaded by their mean slope, then heavily blurred
  const K = Math.max(3, Math.round((W / 48) / step));
  for (let i0 = 0; i0 < cols.length - 1; i0 += K) {
    const i1 = Math.min(cols.length - 1, i0 + K);
    const yA = cols[i0][1], yB = cols[i1][1];
    const xMid = (cols[i0][2] + cols[i1][2]) / 2;
    const slope = (yB - yA) / ((i1 - i0) * step);
    const toward = Math.sign(sunX - xMid) || 1;
    const lit = clamp(-slope * toward * 1.8, -1, 1);
    if (Math.abs(lit) < 0.03) continue;
    let yTop = Math.min(yA, yB);
    for (let i = i0; i <= i1; i++) yTop = Math.min(yTop, cols[i][1]);
    const c = lit > 0 ? lightC : shadowC;
    const a = Math.abs(lit) * strength * (lit > 0 ? 1 : 1.2);
    const len = (horizonY - yTop) * (0.55 + 0.4 * Math.abs(lit));
    const g2 = tc.createLinearGradient(0, yTop, 0, yTop + len);
    g2.addColorStop(0, css(c, a)); g2.addColorStop(0.5, css(c, a * 0.55)); g2.addColorStop(1, css(c, 0));
    tc.fillStyle = g2;
    tc.fillRect(cols[i0][0], yTop, cols[i1][0] - cols[i0][0] + 1, len);
  }
  // snow caps: one soft polygon between the ridge line and a noisy snow line
  let snowPath = null;
  if (opts.snow !== false && depth < 2) {
    let maxH = 0;
    for (const [, y] of cols) maxH = Math.max(maxH, T.horizon - y / H);
    const snowline = P.land.snowline * maxH;
    const nz = noise1(311 + depth);
    const yS = (x) => (T.horizon - snowline - 0.03 * (nz(x * 9) - 0.5) - 0.016 * (nz(x * 37 + 5) - 0.5)) * H;
    snowPath = new Path2D();
    snowPath.moveTo(cols[0][0], Math.min(cols[0][1], yS(cols[0][2])));
    for (const [px, y] of cols) snowPath.lineTo(px, y);
    for (let i = cols.length - 1; i >= 0; i--) { const [px, y, x] = cols[i]; snowPath.lineTo(px, Math.max(y, yS(x))); }
    snowPath.closePath();
  }
  ctx.save();
  ctx.clip();
  if (snowPath) {
    const snowLit = mix(P.shade(P.land.snow), [255, 255, 255], P.time === 'night' ? 0 : 0.25);
    try { ctx.filter = `blur(${Math.max(0.6, W / 1100).toFixed(1)}px)`; } catch { /* */ }
    ctx.fillStyle = css(mix(snowLit, P.haze, depth === 0 ? 0.28 : 0.1), 0.94);
    ctx.fill(snowPath);
    ctx.filter = 'none';
  }
  // blur the quarter-resolution light layer itself (cheap), then upscale – faces become soft planes, no stripes
  const soft = makeCanvas(tmp.width, tmp.height);
  const sc = soft.getContext('2d');
  try { sc.filter = `blur(${Math.max(1.5, W / (depth === 0 ? 180 : 320)).toFixed(1)}px)`; } catch { /* */ }
  sc.drawImage(tmp, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  // haze at the foot of the range
  const hg = ctx.createLinearGradient(0, horizonY - H * 0.08 * (2 - depth), 0, horizonY + 2);
  hg.addColorStop(0, css(hz, 0)); hg.addColorStop(1, css(hz, 0.55 - depth * 0.12));
  ctx.fillStyle = hg;
  ctx.fillRect(0, horizonY - H * 0.12, W + 2 * M, H * 0.12 + 2);
}

function conifer(ctx, x, y, s, col, P, rimSide, snowAmt) {
  const tiers = 4;
  ctx.fillStyle = css(mul(col, 0.55));
  ctx.fillRect(x - s * 0.05, y - s * 0.18, s * 0.1, s * 0.2);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const w = s * (0.42 - t * 0.28);
    const top = y - s * (0.32 + t * 0.62) - s * 0.28;
    const base = y - s * (0.12 + t * 0.62);
    ctx.beginPath();
    ctx.moveTo(x - w, base); ctx.lineTo(x, top); ctx.lineTo(x + w, base);
    ctx.quadraticCurveTo(x, base + s * 0.06, x - w, base);
    ctx.fillStyle = css(col); ctx.fill();
    // rim light on the sun side
    if (P.time !== 'night') {
      ctx.beginPath();
      ctx.moveTo(x, top); ctx.lineTo(x + w * rimSide, base);
      ctx.lineTo(x + w * rimSide * 0.55, base);
      ctx.closePath();
      ctx.fillStyle = css(mix(col, P.sky.light, 0.42), 0.55); ctx.fill();
    }
    if (snowAmt > 0) {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.8, base - s * 0.02); ctx.lineTo(x, top + s * 0.02); ctx.lineTo(x + w * 0.8, base - s * 0.02);
      ctx.quadraticCurveTo(x, base - s * 0.14, x - w * 0.8, base - s * 0.02);
      ctx.fillStyle = css(P.shade(P.land.snow), 0.85 * snowAmt); ctx.fill();
    }
  }
}

function deciduous(ctx, x, y, s, col, P, rimSide, r, bare) {
  const trunk = css(mul(P.shade([92, 70, 52]), 0.9));
  ctx.strokeStyle = trunk; ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 0.5); ctx.stroke();
  if (bare) {
    ctx.lineWidth = Math.max(0.6, s * 0.035);
    for (let i = 0; i < 6; i++) {
      const by = y - s * (0.3 + 0.5 * r());
      const dir = r() < 0.5 ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + dir * s * (0.15 + 0.25 * r()), by - s * (0.2 + 0.2 * r())); ctx.stroke();
    }
    ctx.fillStyle = css(P.shade(P.land.snow), 0.5);
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.62, s * 0.2, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const blobs = 4 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const bx = x + (r() - 0.5) * s * 0.55, by = y - s * (0.55 + r() * 0.35);
    const br = s * (0.17 + r() * 0.14);
    ctx.fillStyle = css(mix(col, [10, 20, 10], 0.12 + r() * 0.1));
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    if (P.time !== 'night') {
      ctx.fillStyle = css(mix(col, P.sky.light, 0.35), 0.28);
      ctx.beginPath(); ctx.arc(bx + br * 0.3 * rimSide, by - br * 0.25, br * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function treeBand(ctx, S, topFn, x0, x1, count, sizeFn, seed, opts = {}) {
  const { W, H, M, P, T } = S;
  const r = T.rand(seed);
  const trees = [];
  const groves = opts.groves ? Array.from({ length: opts.groves }, () => [x0 + (x1 - x0) * r(), r() * (opts.spread ?? 0.05)]) : null;
  for (let i = 0; i < count; i++) {
    let x, depthIn;
    if (groves) {
      const [gx, gd] = groves[Math.floor(r() * groves.length)];
      const gauss = () => (r() + r() + r() - 1.5) / 1.5;
      x = gx + gauss() * 0.03; depthIn = Math.max(0, gd + gauss() * 0.018);
    } else { x = x0 + (x1 - x0) * r(); depthIn = r() * (opts.spread ?? 0.05); }
    const y = topFn(x) + depthIn + 0.004;
    trees.push({ x, y, k: r() });
  }
  trees.sort((a, b) => a.y - b.y);
  const sunX = P.sky.sunPos[0];
  const snow = P.season === 'winter' ? 1 : 0;
  for (const t of trees) {
    const s = sizeFn(t.y) * H * (0.75 + t.k * 0.5);
    if (!(s > 1)) continue; // sizeFn can go ≤ 0 high on the hills – such trees are invisible anyway
    const px = t.x * W + M, py = t.y * H;
    const rim = Math.sign(sunX - t.x) || 1;
    const dark = opts.dark ?? 0;
    const isDecid = r() < P.land.decidShare * (opts.decidBias ?? 1);
    if (isDecid) {
      const pal = P.land.decid;
      const c = mix(P.shade(pal[Math.floor(r() * pal.length)]), [8, 14, 12], dark);
      deciduous(ctx, px, py, s, c, P, rim, r, !!P.land.bare);
    } else {
      const c = mix(P.shade(P.land.conifer), [6, 12, 10], dark);
      conifer(ctx, px, py, s, mix(c, P.haze, opts.haze ?? 0), P, rim, snow);
    }
  }
}


// ── detail painters (the "hand-painted" extras) ────────────────────────
/** Jagged rock peaks: lit and shadowed faces, creases, gullies, snow in the clefts. */
function paintPeaks(ctx, S) {
  const { W, H, M, P, T } = S;
  const horizonY = T.horizon * H;
  const step = Math.max(1, Math.round(W / 1100));
  const cols = [];
  let minY = H;
  for (let px = 0; px <= W + 2 * M; px += step) {
    const x = (px - M) / W;
    const y = (T.horizon - T.peaks(x)) * H;
    cols.push([px, y, x]);
    if (y < minY) minY = y;
  }
  if (horizonY - minY < H * 0.03) return;
  const night = P.time === 'night';
  const hz = P.haze;
  const rock = mix(P.shade(P.land.ridges[1]), P.shade([84, 78, 88]), 0.55);
  const body = new Path2D();
  body.moveTo(0, horizonY + 2);
  for (const [px, y] of cols) body.lineTo(px, y);
  body.lineTo(W + 2 * M, horizonY + 2); body.closePath();
  const g = ctx.createLinearGradient(0, minY, 0, horizonY);
  g.addColorStop(0, css(mix(rock, hz, 0.12))); g.addColorStop(0.6, css(mix(rock, hz, 0.34))); g.addColorStop(1, css(mix(rock, hz, 0.66)));
  ctx.fillStyle = g; ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  const sunX = P.sky.sunPos[0];
  const warm = P.time === 'dusk' || P.time === 'dawn';
  const lightC = warm ? mix(P.sky.light, P.sky.sun, 0.35) : mix(P.sky.light, [255, 255, 255], 0.15);
  const shadowC = mix(mul(rock, 0.32), [16, 22, 46], 0.5);
  // warm wash on the upper rock (the light catches the tops)
  const lw = ctx.createLinearGradient(0, minY, 0, horizonY);
  lw.addColorStop(0, css(lightC, night ? 0.06 : 0.42)); lw.addColorStop(0.6, css(lightC, night ? 0 : 0.08));
  ctx.fillStyle = lw; ctx.fillRect(0, minY, W + 2 * M, horizonY - minY);
  const r = T.rand(91);
  // snow: above a noisy snowline relative to each column's own height + streaks down the gullies
  const snowK = { winter: 0.42, spring: 0.66, autumn: 0.74, summer: 0.84 }[P.season] ?? 0.8;
  const peakMax = horizonY - minY;
  const nz = noise1(517);
  const snowC = mix(P.shade(P.land.snow), [255, 255, 255], night ? 0 : 0.2);
  const snow = new Path2D();
  snow.moveTo(cols[0][0], cols[0][1]);
  for (const [px, y] of cols) snow.lineTo(px, y);
  for (let i = cols.length - 1; i >= 0; i--) {
    const [px, y, x] = cols[i];
    const lineY = horizonY - peakMax * (snowK + 0.12 * (nz(x * 14) - 0.5) + 0.06 * (nz(x * 55 + 3) - 0.5));
    snow.lineTo(px, Math.max(y, lineY));
  }
  snow.closePath();
  ctx.fillStyle = css(mix(snowC, hz, 0.12), 0.92);
  ctx.fill(snow);
  // find the tips (local maxima) and paint the face that turns away from the sun in shadow
  const win = Math.max(3, Math.round((W * 0.014) / step));
  const tips = [];
  for (let i = win; i < cols.length - win; i++) {
    const y = cols[i][1];
    if (horizonY - y < H * 0.035) continue;
    let ok = true;
    for (let j = i - win; j <= i + win; j++) if (cols[j][1] < y) { ok = false; break; }
    if (ok && (!tips.length || i - tips[tips.length - 1] > win)) tips.push(i);
  }
  for (const i of tips) {
    const [tx, ty, xn] = cols[i];
    const dir = sunX > xn ? -1 : 1;
    let j = i;
    while (j + dir > 0 && j + dir < cols.length - 1 && cols[j + dir][1] >= cols[j][1] - 0.4) j += dir;
    const hgt = horizonY - ty;
    const crease = [];
    const drift = dir * hgt * (0.1 + 0.12 * r());
    for (let k = 1; k <= 9; k++) {
      const f = k / 9;
      crease.push([tx + drift * f + (r() - 0.5) * hgt * 0.035 * f, ty + f * (hgt + 4)]);
    }
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    for (let k = i; k !== j + dir; k += dir) ctx.lineTo(cols[k][0], cols[k][1]);
    ctx.lineTo(cols[j][0], horizonY + 4);
    for (let k = crease.length - 1; k >= 0; k--) ctx.lineTo(crease[k][0], crease[k][1]);
    ctx.closePath();
    ctx.fillStyle = css(shadowC, night ? 0.38 : 0.62);
    ctx.fill();
    // a second, smaller facet inside the lit face gives the rock its chiselled look
    const sub = [];
    const off = -dir * hgt * (0.12 + 0.1 * r());
    for (let k = 0; k <= 6; k++) { const f = 0.15 + k / 6 * 0.85; sub.push([tx + off * f + (r() - 0.5) * hgt * 0.04, ty + f * hgt]); }
    ctx.beginPath();
    ctx.moveTo(tx, ty + hgt * 0.06);
    for (const [a, b] of sub) ctx.lineTo(a, b);
    for (let k = sub.length - 1; k >= 0; k--) ctx.lineTo(sub[k][0] + dir * hgt * 0.05 * (k / sub.length), sub[k][1]);
    ctx.closePath();
    ctx.fillStyle = css(shadowC, night ? 0.14 : 0.26);
    ctx.fill();
    // rim light along the lit ridge
    if (!night) {
      ctx.beginPath();
      let k = i; const end = Math.max(0, Math.min(cols.length - 1, i - dir * win * 2));
      ctx.moveTo(cols[k][0], cols[k][1]);
      while (k !== end) { k -= dir; ctx.lineTo(cols[k][0], cols[k][1] + 0.5); }
      ctx.strokeStyle = css(mix(lightC, [255, 255, 255], 0.3), 0.75);
      ctx.lineWidth = Math.max(0.8, H / 600);
      ctx.stroke();
    }
  }
  // gullies and strata
  const nG = Math.round(220 * W / 1600);
  for (let n = 0; n < nG; n++) {
    const c = cols[Math.floor(r() * cols.length)];
    const hgt = horizonY - c[1];
    if (hgt < H * 0.03) continue;
    let x = c[0], y = c[1] + r() * hgt * 0.35;
    const len = hgt * (0.12 + 0.4 * r());
    const lit = r() < 0.3;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * len * 0.12; y += len / 6; ctx.lineTo(x, y); }
    ctx.strokeStyle = lit ? css(night ? snowC : lightC, 0.12) : css(shadowC, 0.22);
    ctx.lineWidth = Math.max(0.6, (H / 900) * (0.6 + r()));
    ctx.stroke();
  }
  ctx.restore();
  // waterfall down the right-hand rock wall
  const wx = T.peakR - 0.06;
  const wTop = (T.horizon - T.peaks(wx) * 0.62) * H;
  if (horizonY - wTop > H * 0.05) {
    const px = wx * W + M;
    const fall = ctx.createLinearGradient(0, wTop, 0, horizonY);
    const wc = P.season === 'winter' ? [220, 236, 250] : mix([235, 245, 255], P.sky.light, 0.25);
    fall.addColorStop(0, css(wc, 0)); fall.addColorStop(0.15, css(wc, night ? 0.35 : 0.75)); fall.addColorStop(1, css(wc, night ? 0.25 : 0.55));
    ctx.strokeStyle = fall; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.lineWidth = Math.max(1, H * (0.0035 - k * 0.001));
      ctx.beginPath(); ctx.moveTo(px + k * 1.5, wTop);
      ctx.bezierCurveTo(px + 3 + k, wTop + (horizonY - wTop) * 0.3, px - 2 + k, wTop + (horizonY - wTop) * 0.7, px + 1 + k, horizonY);
      ctx.stroke();
    }
    const mg = ctx.createRadialGradient(px, horizonY, 0, px, horizonY, H * 0.05);
    mg.addColorStop(0, css(wc, night ? 0.25 : 0.5)); mg.addColorStop(1, css(wc, 0));
    ctx.fillStyle = mg; ctx.fillRect(px - H * 0.05, horizonY - H * 0.05, H * 0.1, H * 0.1);
  }
  // haze at the foot
  const hg = ctx.createLinearGradient(0, horizonY - H * 0.12, 0, horizonY + 2);
  hg.addColorStop(0, css(hz, 0)); hg.addColorStop(1, css(hz, 0.5));
  ctx.fillStyle = hg; ctx.fillRect(0, horizonY - H * 0.12, W + 2 * M, H * 0.12 + 2);
}

/** Soft mist band – drifting veils between the mountain ranges. */
function paintMist(ctx, S, yFrac, thick, alpha, seed) {
  const { W, H, M, P, T } = S;
  const r = T.rand(seed);
  const col = mix(P.haze, [255, 255, 255], P.time === 'night' ? 0.05 : 0.3);
  const n = Math.round(14 + W / 90);
  for (let i = 0; i < n; i++) {
    const cx = r() * (W + 2 * M), cy = (yFrac + (r() - 0.5) * thick) * H;
    const rw = W * (0.06 + r() * 0.14), rh = H * thick * (0.4 + r() * 0.5);
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, rh / rw);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
    g.addColorStop(0, css(col, alpha * (0.5 + r() * 0.5))); g.addColorStop(1, css(col, 0));
    ctx.fillStyle = g; ctx.fillRect(-rw, -rw, rw * 2, rw * 2);
    ctx.restore();
  }
}

/** Long, thin lit clouds across the sky (sunset streaks). */
function paintStreakClouds(ctx, S) { // eslint-disable-line no-param-reassign
  const { W, H, M, P, T } = S;
  const r = T.rand(133);
  const t = P.time;
  const n = t === 'dusk' || t === 'dawn' ? 12 : t === 'day' ? 7 : 5;
  const [sx, sy] = P.sky.sunPos;
  // painted at quarter resolution and upscaled – the softness comes for free (a blur filter per streak is very slow)
  const horizonY = T.horizon * H;
  const tmp = makeCanvas(Math.ceil((W + 2 * M) / 4), Math.ceil(horizonY / 4));
  const out = ctx;
  ctx = tmp.getContext('2d');
  ctx.scale(0.25, 0.25);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const y = H * (0.06 + r() * (T.horizon - 0.13));
    const x = r() * (W + 2 * M);
    const len = W * (0.12 + r() * 0.28), th = H * (0.005 + r() * 0.014);
    const d = Math.hypot((x - M) / W - sx, (y / H - sy) * 1.6);
    const near = Math.exp(-d * d * 6);
    let col, a;
    if (t === 'dusk' || t === 'dawn') { col = mix(mix(P.sky.mid, P.sky.top, 0.3), mix(P.sky.sun, P.sky.light, 0.4), 0.25 + 0.7 * near + 0.25 * (y / H / T.horizon)); a = 0.55; }
    else if (t === 'day') { col = mix(P.sky.light, [255, 255, 255], 0.6); a = 0.35; }
    else { col = mix(P.sky.top, [200, 214, 240], 0.25); a = 0.16; }
    for (let k = 0; k < 4; k++) {
      const ox = (r() - 0.5) * len * 0.5, oy = (r() - 0.5) * th * 2.2;
      const l2 = len * (0.45 + r() * 0.55);
      const g = ctx.createLinearGradient(x + ox - l2 / 2, 0, x + ox + l2 / 2, 0);
      g.addColorStop(0, css(col, 0)); g.addColorStop(0.5, css(col, a * (0.6 + r() * 0.4))); g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x + ox, y + oy, l2 / 2, th * (0.5 + r() * 0.7), 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  out.imageSmoothingEnabled = true;
  out.drawImage(tmp, 0, 0, W + 2 * M, horizonY);
}

/** Painterly texture: patches of lighter/darker grass, so slopes aren't flat colour. */
function texturize(ctx, S, topFn, x0, x1, seed, count, opts = {}) {
  const { W, H, M, P, T } = S;
  const r = T.rand(seed);
  const light = mix(P.shade(opts.light || P.land.hill[1]), P.sky.light, P.time === 'night' ? 0 : 0.25);
  const dark = P.shade(opts.dark || P.land.hillDark);
  const bottom = opts.bottom ?? 1;
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * r();
    const top = topFn(x);
    const y = top + Math.pow(r(), 1.4) * (bottom - top);
    const d = clamp((y - T.horizon) / (1 - T.horizon));
    const sz = H * (0.003 + 0.028 * d) * (0.5 + r());
    if ((y * H) - sz * 0.5 < top * H + 1) continue;
    const isLight = r() < 0.55;
    ctx.fillStyle = css(isLight ? light : dark, (isLight ? 0.07 : 0.09) * (0.5 + r()));
    ctx.beginPath(); ctx.ellipse(x * W + M, y * H, sz * (2.4 + r() * 1.5), sz * 0.32, (r() - 0.5) * 0.15, 0, Math.PI * 2); ctx.fill();
  }
}

const FLOWERS = { spring: ['#ffd6e6', '#ffffff', '#f7b7cf', '#fff3a6', '#c9b6ff'], summer: ['#ffe066', '#ffffff', '#ff8fb1', '#b48cff', '#ff6b4a'], autumn: ['#e8892e', '#c9472a', '#f0b83c', '#a8521e'], winter: ['#ffffff', '#eef6ff'] };
function paintFlowers(ctx, S, topFn, x0, x1, seed, count, bottom = 1) {
  const { W, H, M, P, T } = S;
  const r = T.rand(seed);
  const pal = FLOWERS[P.season] || FLOWERS.summer;
  const winter = P.season === 'winter';
  // flowers grow in patches: pick a few centres, scatter blossoms of one or two colours around each
  const patches = Math.max(2, Math.round(count / 14));
  for (let pI = 0; pI < patches; pI++) {
    const px0 = x0 + (x1 - x0) * r();
    const top0 = topFn(px0);
    const py0 = top0 + 0.01 + Math.pow(r(), 1.3) * (bottom - top0) * 0.9;
    const cA = rgb(pal[Math.floor(r() * pal.length)]), cB = rgb(pal[Math.floor(r() * pal.length)]);
    const d0 = clamp((py0 - T.horizon) / (1 - T.horizon));
    const spreadX = 0.012 + 0.04 * d0, spreadY = 0.004 + 0.012 * d0;
    for (let i = 0; i < 14; i++) {
      const x = px0 + (r() - 0.5) * spreadX * 2, y = py0 + (r() - 0.5) * spreadY * 2;
      if (y < topFn(x) + 0.003) continue;
      const d = clamp((y - T.horizon) / (1 - T.horizon));
      const rad = H * (0.0007 + 0.0022 * d) * (0.6 + r() * 0.7);
      ctx.fillStyle = css(P.shade(r() < 0.7 ? cA : cB), winter ? 0.45 : 0.85);
      ctx.beginPath(); ctx.arc(x * W + M, y * H, Math.max(0.4, rad), 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Boulders with a lit top, moss in the green seasons and snow in winter. */
function paintRocks(ctx, S, spots, seed) {
  const { W, H, M, P, T } = S;
  const r = T.rand(seed);
  const rock = P.shade([112, 108, 112]);
  const lightC = mix(rock, P.sky.light, P.time === 'night' ? 0.05 : 0.45);
  for (const [x, yFn, size] of spots) {
    const cx = x * W + M, base = yFn(x) * H + size * H * 0.25;
    const rw = size * H * (0.8 + r() * 0.5), rh = size * H * (0.5 + r() * 0.3);
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + (k / 10) * Math.PI;
      const rr = 0.85 + r() * 0.25;
      const px = cx + Math.cos(a) * rw * rr, py = base + Math.sin(a) * rh * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, base - rh, 0, base);
    g.addColorStop(0, css(lightC)); g.addColorStop(0.5, css(rock)); g.addColorStop(1, css(mul(rock, 0.45)));
    ctx.fillStyle = g; ctx.fill();
    if (P.season === 'winter') {
      ctx.fillStyle = css(P.shade(P.land.snow), 0.9);
      ctx.beginPath(); ctx.ellipse(cx, base - rh * 0.82, rw * 0.7, rh * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    } else if (P.season !== 'autumn') {
      ctx.fillStyle = css(P.shade(P.land.grass), 0.45);
      ctx.beginPath(); ctx.ellipse(cx - rw * 0.2, base - rh * 0.8, rw * 0.45, rh * 0.18, -0.2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** A few small cabins by the lake – windows glow at dusk and night. */
function paintCabins(ctx, S, xs, seed) {
  const { W, H, M, P, T } = S;
  const r = T.rand(seed);
  const glow = P.time === 'night' || P.time === 'dusk' || P.time === 'dawn';
  for (const x of xs) {
    const s = H * (0.013 + r() * 0.005);
    const cx = x * W + M, base = (T.shoreL(x) + 0.014) * H;
    const wall = P.shade([150, 102, 66]), roof = P.shade(P.season === 'winter' ? [235, 242, 250] : [70, 46, 40]);
    ctx.fillStyle = css(wall); ctx.fillRect(cx - s * 0.6, base - s * 0.7, s * 1.2, s * 0.7);
    ctx.fillStyle = css(mul(wall, 0.6)); ctx.fillRect(cx + s * 0.2, base - s * 0.7, s * 0.4, s * 0.7);
    ctx.fillStyle = css(roof);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.75, base - s * 0.66); ctx.lineTo(cx, base - s * 1.2); ctx.lineTo(cx + s * 0.75, base - s * 0.66); ctx.closePath(); ctx.fill();
    const wc = glow ? [255, 206, 120] : mix([120, 150, 180], P.sky.light, 0.3);
    ctx.fillStyle = css(wc, glow ? 1 : 0.8);
    ctx.fillRect(cx - s * 0.38, base - s * 0.48, s * 0.22, s * 0.2);
    ctx.fillRect(cx - s * 0.02, base - s * 0.48, s * 0.18, s * 0.2);
    if (glow) {
      const g = ctx.createRadialGradient(cx - s * 0.15, base - s * 0.4, 0, cx - s * 0.15, base - s * 0.4, s * 2.2);
      g.addColorStop(0, 'rgba(255,200,110,.35)'); g.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - s * 2.4, base - s * 2.6, s * 4.8, s * 4.8);
    }
  }
}

/** Small wooded islands in the lake, with their reflections. */
function paintIslands(ctx, S) {
  const { W, H, M, P, T } = S;
  const horizonY = T.horizon * H;
  const spots = [[T.center - 0.07, 0.032, 0.028], [T.center + 0.045, 0.06, 0.02], [T.center - 0.02, 0.016, 0.014]];
  const r = T.rand(151);
  for (const [x, dy, w] of spots) {
    const cx = x * W + M, cy = horizonY + dy * H;
    const rw = w * W, rh = rw * 0.18;
    // reflection
    const rg = ctx.createLinearGradient(0, cy, 0, cy + rh * 2.2);
    rg.addColorStop(0, css(mul(P.shade(P.land.hillDark), 0.8), 0.32)); rg.addColorStop(1, css(mul(P.shade(P.land.hillDark), 0.8), 0));
    ctx.fillStyle = rg;
    ctx.fillRect(cx - rw * 0.85, cy, rw * 1.7, rh * 2.2);
    const g = ctx.createLinearGradient(0, cy - rh, 0, cy);
    g.addColorStop(0, css(mix(P.shade(P.land.hill[0]), P.haze, 0.3))); g.addColorStop(1, css(P.shade(P.land.hillDark)));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, 0); ctx.fill();
    const k = Math.max(3, Math.round(rw / (H * 0.006)));
    for (let i = 0; i < k; i++) {
      const tx = cx + (r() - 0.5) * rw * 1.5;
      const ty = cy - rh * Math.sqrt(Math.max(0, 1 - Math.pow((tx - cx) / rw, 2))) + 1;
      conifer(ctx, tx, ty, H * (0.012 + r() * 0.01), mix(P.shade(P.land.conifer), P.haze, 0.25), P, Math.sign(P.sky.sunPos[0] - x) || 1, P.season === 'winter' ? 1 : 0);
    }
  }
}

// ── layer painters ────────────────────────────────────────────────────
function paintSky(ctx, S) {
  const { W, H, M, P } = S;
  const sky = P.sky;
  const g = ctx.createLinearGradient(0, 0, 0, S.T.horizon * H);
  g.addColorStop(0, css(sky.top));
  g.addColorStop(0.55, css(mix(sky.top, sky.mid, 0.85)));
  g.addColorStop(0.82, css(mix(sky.mid, sky.low, 0.6)));
  g.addColorStop(1, css(sky.low));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W + 2 * M, H);
  const [sx, sy] = sky.sunPos;
  const cx = sx * W + M, cy = sy * H;
  // stars
  if (sky.stars > 0) {
    const r = S.T.rand(5);
    const n = Math.round(260 * sky.stars * (W * H) / (1600 * 900));
    for (let i = 0; i < n; i++) {
      const x = r() * (W + 2 * M), y = r() * H * S.T.horizon * 0.85;
      const a = (0.25 + r() * 0.75) * sky.stars * (1 - y / (H * S.T.horizon));
      ctx.fillStyle = `rgba(235,242,255,${a.toFixed(3)})`;
      const sz = r() < 0.06 ? 1.6 : r() < 0.3 ? 1.1 : 0.7;
      ctx.fillRect(x, y, sz, sz);
    }
  }
  const oc = P.overcast || 0;
  // glow
  const glowR = Math.max(W, H) * (sky.moon ? 0.35 : 0.75) * (1 - oc * 0.5);
  const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  gl.addColorStop(0, css(sky.sun, (sky.moon ? 0.35 : 0.75) * (1 - oc * 0.7)));
  gl.addColorStop(0.12, css(mix(sky.sun, sky.low, 0.4), sky.moon ? 0.14 : 0.42));
  gl.addColorStop(0.45, css(sky.low, sky.moon ? 0.04 : 0.15));
  gl.addColorStop(1, css(sky.low, 0));
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, W + 2 * M, H);
  if (oc < 0.5) paintStreakClouds(ctx, S);
  // disc
  const R = sky.sunR * Math.min(W, H * 1.6);
  if (oc > 0.4) return; // overcast: no visible disc
  if (sky.moon) {
    ctx.fillStyle = css(sky.sun, 0.95);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,140,190,0.22)';
    [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [0.05, 0.4, 0.1], [-0.1, 0.05, 0.08]].forEach(([dx, dy, rr]) => {
      ctx.beginPath(); ctx.arc(cx + dx * R, cy + dy * R, rr * R, 0, Math.PI * 2); ctx.fill();
    });
  } else {
    const dg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
    dg.addColorStop(0, 'rgba(255,255,250,1)'); dg.addColorStop(0.55, css(sky.sun, 1)); dg.addColorStop(1, css(sky.sun, 0));
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2); ctx.fill();
  }
}

function paintBack(ctx, S) {
  paintRidge(ctx, S, S.T.far, S.P.land.ridges[0], 0);
  paintMist(ctx, S, S.T.horizon - 0.03, 0.05, 0.35, 211);
  paintPeaks(ctx, S);
}

function paintMid(ctx, S, backCanvas, skyCanvas) {
  const { W, H, M, P, T } = S;
  const horizonY = T.horizon * H;
  paintRidge(ctx, S, T.mid, P.land.ridges[1], 1);
  paintMist(ctx, S, T.horizon - 0.012, 0.03, 0.4, 223);
  paintRidge(ctx, S, T.near, P.land.ridges[2], 2, { snow: false });
  // forest line on the near foothills
  treeBand(ctx, S, (x) => T.horizon - T.near(x) + 0.006, -0.04, 1.04, Math.round(170 * W / 1600), () => 0.012, 31, { spread: 0.01, haze: 0.5, decidBias: 0.6 });

  // lake
  const lakeTop = horizonY, lakeBot = (T.lakeBottom + 0.05) * H;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, lakeTop, W + 2 * M, lakeBot - lakeTop); ctx.clip();
  const lg = ctx.createLinearGradient(0, lakeTop, 0, lakeBot);
  const water = P.shade(P.land.lake);
  lg.addColorStop(0, css(mix(P.sky.low, water, 0.35)));
  lg.addColorStop(0.4, css(mix(P.sky.mid, water, 0.6)));
  lg.addColorStop(1, css(mix(P.sky.top, water, 0.7)));
  ctx.fillStyle = lg; ctx.fillRect(0, lakeTop, W + 2 * M, lakeBot - lakeTop);
  // reflections of sky + mountains (mirror around horizon)
  // the reflection is composed at quarter resolution: upscaling gives the soft, watery blur
  // for a fraction of the cost of a blur filter on the full canvas
  const RW = Math.max(1, Math.ceil((W + 2 * M) / 4)), RH = Math.max(1, Math.ceil(horizonY / 4));
  const refl = makeCanvas(RW, RH);
  const rc = refl.getContext('2d');
  rc.drawImage(skyCanvas, 0, 0, W + 2 * M, horizonY, 0, 0, RW, RH);
  rc.drawImage(backCanvas, 0, 0, W + 2 * M, horizonY, 0, 0, RW, RH);
  rc.drawImage(ctx.canvas, 0, 0, W + 2 * M, horizonY, 0, 0, RW, RH);
  ctx.globalAlpha = P.land.ice ? 0.22 : 0.5;
  ctx.imageSmoothingEnabled = true;
  ctx.setTransform(1, 0, 0, -1, 0, 2 * horizonY);
  ctx.drawImage(refl, 0, 0, W + 2 * M, horizonY);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  // depth tint
  const tg = ctx.createLinearGradient(0, lakeTop, 0, lakeBot);
  tg.addColorStop(0, css(water, 0.12)); tg.addColorStop(1, css(mul(water, 0.6), 0.55));
  ctx.fillStyle = tg; ctx.fillRect(0, lakeTop, W + 2 * M, lakeBot - lakeTop);
  if (P.land.ice) {
    ctx.fillStyle = css(P.shade([214, 230, 244]), P.land.ice * 0.55);
    ctx.fillRect(0, lakeTop, W + 2 * M, lakeBot - lakeTop);
    const r = T.rand(77);
    ctx.strokeStyle = css(P.shade([255, 255, 255]), 0.35); ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = r() * (W + 2 * M), y = lakeTop + r() * (lakeBot - lakeTop);
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * W * 0.08, y + (r() - 0.5) * 6); ctx.stroke();
    }
  }
  // water line sparkle
  ctx.fillStyle = css(mix(P.sky.low, [255, 255, 255], 0.4), 0.55);
  ctx.fillRect(0, lakeTop, W + 2 * M, Math.max(1, H * 0.0015));
  ctx.restore();
  paintIslands(ctx, S);

  // shore hills (left & right) with forests
  const [h0, h1] = P.land.hill;
  const hillFill = (fn, x0, x1) => {
    let minY = H;
    for (let x = x0; x <= x1; x += 0.01) minY = Math.min(minY, fn(x) * H);
    const g = ctx.createLinearGradient(0, minY, 0, H);
    g.addColorStop(0, css(P.shade(h1))); g.addColorStop(0.4, css(P.shade(h0))); g.addColorStop(1, css(P.shade(P.land.hillDark)));
    return g;
  };
  fillProfile(ctx, W, H, M, T.shoreL, H, hillFill(T.shoreL, -0.05, 0.45));
  fillProfile(ctx, W, H, M, T.shoreR, H, hillFill(T.shoreR, 0.65, 1.05));
  texturize(ctx, S, T.shoreL, -0.05, 0.5, 45, Math.round(700 * W / 1600));
  texturize(ctx, S, T.shoreR, 0.62, 1.05, 46, Math.round(560 * W / 1600));
  paintFlowers(ctx, S, T.shoreL, -0.05, 0.45, 47, Math.round(260 * W / 1600));
  paintFlowers(ctx, S, T.shoreR, 0.7, 1.05, 48, Math.round(200 * W / 1600));
  treeBand(ctx, S, T.shoreL, -0.05, 0.47, Math.round(220 * W / 1600), (y) => 0.018 + (y - 0.45) * 0.11, 41, { spread: 0.06, groves: 9 });
  treeBand(ctx, S, T.shoreR, 0.7, 1.05, Math.round(170 * W / 1600), (y) => 0.018 + (y - 0.45) * 0.11, 43, { spread: 0.06, groves: 7 });
  // forest groves further down the slopes
  treeBand(ctx, S, (x) => T.shoreL(x) + 0.04, -0.05, 0.36, Math.round(110 * W / 1600), (y) => 0.02 + (y - 0.45) * 0.12, 44, { spread: 0.14, groves: 6 });
  treeBand(ctx, S, (x) => T.shoreR(x) + 0.04, 0.78, 1.05, Math.round(90 * W / 1600), (y) => 0.02 + (y - 0.45) * 0.12, 42, { spread: 0.14, groves: 5 });
  paintCabins(ctx, S, [T.center - 0.235, T.center - 0.205, T.center - 0.18], 49);

  // near shore meadow
  const ms = ctx.createLinearGradient(0, T.lakeBottom * H, 0, H);
  ms.addColorStop(0, css(P.shade(h1))); ms.addColorStop(1, css(P.shade(P.land.hillDark)));
  fillProfile(ctx, W, H, M, T.nearShore, H, ms);
  texturize(ctx, S, T.nearShore, -0.04, 1.04, 51, Math.round(600 * W / 1600));
  paintFlowers(ctx, S, T.nearShore, -0.04, 1.04, 52, Math.round(320 * W / 1600));
  paintRocks(ctx, S, [[T.center - 0.24, T.nearShore, 0.012], [T.center - 0.215, T.nearShore, 0.008], [T.center + 0.21, T.nearShore, 0.011]], 53);
  // meadow highlight line (sunlit edge)
  ctx.save();
  ctx.globalAlpha = P.time === 'night' ? 0.15 : 0.35;
  ctx.strokeStyle = css(mix(P.shade(h1), P.sky.light, 0.5));
  ctx.lineWidth = Math.max(1, H * 0.002);
  ctx.beginPath();
  for (let px = 0; px <= W + 2 * M; px += 4) { const y = T.nearShore((px - M) / W) * H; px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y); }
  ctx.stroke();
  ctx.restore();
}

function paintFront(ctx, S) {
  const { W, H, M, P, T } = S;
  const [c0, c1] = P.land.fore;
  const g = ctx.createLinearGradient(0, 0.7 * H, 0, H);
  g.addColorStop(0, css(P.shade(c0))); g.addColorStop(1, css(mul(P.shade(c1), 0.9)));
  fillProfile(ctx, W, H, M, T.fore, H, g);
  texturize(ctx, S, T.fore, -0.06, 1.06, 65, Math.round(260 * W / 1600), { light: c0, dark: c1 });
  paintFlowers(ctx, S, T.fore, 0.15, 0.85, 66, Math.round(90 * W / 1600), 0.97);
  paintRocks(ctx, S, [[0.2, T.fore, 0.03], [0.245, T.fore, 0.018], [0.83, T.fore, 0.026], [0.79, T.fore, 0.014]], 67);
  treeBand(ctx, S, T.fore, -0.06, 0.24, 10, () => 0.17, 61, { spread: 0.05, dark: 0.3, decidBias: 0.45 });
  treeBand(ctx, S, T.fore, 0.8, 1.06, 9, () => 0.16, 63, { spread: 0.05, dark: 0.3, decidBias: 0.45 });
  // grass tufts along the foreground edge (static part)
  const r = T.rand(71);
  ctx.strokeStyle = css(mix(P.shade(P.land.grass), P.sky.light, 0.25), 0.7);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 260 * W / 1600; i++) {
    const x = r();
    const y = T.fore(x) * H + 2;
    const px = x * W + M;
    const hgt = H * (0.008 + r() * 0.014);
    ctx.beginPath(); ctx.moveTo(px, y); ctx.quadraticCurveTo(px + 2, y - hgt * 0.6, px + (r() - 0.3) * 6, y - hgt); ctx.stroke();
  }
  // readability vignette at the bottom
  const vg = ctx.createLinearGradient(0, H * 0.72, 0, H);
  vg.addColorStop(0, 'rgba(4,8,16,0)'); vg.addColorStop(1, 'rgba(4,8,16,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, H * 0.72, W + 2 * M, H * 0.28);
}

function makeCloud(S, r, w, h) {
  const { P } = S;
  const c = makeCanvas(Math.ceil(w), Math.ceil(h));
  const x = c.getContext('2d');
  const top = mix(mix(P.sky.light, [255, 255, 255], 0.45), P.sky.sun, P.time === 'dusk' ? 0.35 : 0.1);
  const under = mix(P.sky.mid, P.sky.top, 0.35);
  const night = P.time === 'night';
  const puffs = 26 + Math.floor(r() * 14);
  try { x.filter = `blur(${Math.max(1, h * 0.035).toFixed(1)}px)`; } catch { /* */ }
  for (let i = 0; i < puffs; i++) {
    const u = r();
    const px = w * (0.12 + 0.76 * u), py = h * (0.58 - 0.22 * Math.sin(u * Math.PI) * r());
    const pr = h * (0.1 + 0.16 * r()) * (1 - Math.abs(u - 0.5) * 0.8);
    const g = x.createRadialGradient(px, py - pr * 0.4, pr * 0.05, px, py, pr);
    g.addColorStop(0, css(night ? mul(top, 0.35) : top, night ? 0.22 : 0.55));
    g.addColorStop(0.65, css(night ? mul(under, 0.6) : mix(top, under, 0.6), night ? 0.15 : 0.35));
    g.addColorStop(1, css(under, 0));
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill();
  }
  // flat, slightly shaded base
  const bg = x.createLinearGradient(0, h * 0.55, 0, h * 0.8);
  bg.addColorStop(0, css(under, 0)); bg.addColorStop(1, css(under, night ? 0.08 : 0.18));
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  if (P.time === 'dusk' || P.time === 'dawn') {
    // sunset clouds glow on their undersides
    const ug = x.createLinearGradient(0, h * 0.35, 0, h * 0.78);
    ug.addColorStop(0, css(P.sky.sun, 0)); ug.addColorStop(1, css(mix(P.sky.sun, P.sky.light, 0.5), 0.6));
    x.fillStyle = ug; x.fillRect(0, 0, w, h);
  }
  return c;
}

function makeFog(S, w, h) {
  const c = makeCanvas(Math.ceil(w), Math.ceil(h));
  const x = c.getContext('2d');
  const col = mix(S.P.sky.low, [255, 255, 255], 0.3);
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, css(col, 0.55)); g.addColorStop(1, css(col, 0));
  x.setTransform(1, 0, 0, h / w, 0, 0);
  x.fillStyle = g; x.fillRect(0, 0, w, w);
  return c;
}

function makeRays(S) {
  // half-resolution sprite; bilinear upscaling keeps the rays soft
  const { W, H, P } = S;
  const c = makeCanvas(Math.ceil(W / 2), Math.ceil(H / 2));
  const x = c.getContext('2d');
  x.scale(0.5, 0.5);
  const [sx, sy] = P.sky.sunPos;
  const cx = sx * W, cy = sy * H;
  const len = Math.max(W, H) * 1.1;
  const r = S.T.rand(201);
  for (let i = 0; i < 7; i++) {
    const a0 = -Math.PI + (i / 7) * Math.PI + (r() - 0.5) * 0.12 + 0.12;
    const wd = 0.06 + 0.04 * r();
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, len);
    const a = 0.03 * (0.6 + 0.4 * r());
    g.addColorStop(0, css(P.sky.sun, a)); g.addColorStop(0.55, css(P.sky.sun, a * 0.35)); g.addColorStop(1, css(P.sky.sun, 0));
    x.fillStyle = g;
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, len, a0, a0 + wd); x.closePath(); x.fill();
  }
  return c;
}

let GLOW = null;
function glowSprite() {
  if (GLOW) return GLOW;
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  GLOW = { white: c, tint: {} };
  return GLOW;
}
function tintedGlow(color) {
  const G = glowSprite();
  if (G.tint[color]) return G.tint[color];
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  x.drawImage(G.white, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, 64, 64);
  G.tint[color] = c;
  return c;
}

// ── scene ──────────────────────────────────────────────────────────────
const tick = () => new Promise(r => setTimeout(r, 0));

async function buildSceneAsync(opts) {
  // same as buildScene but yields to the event loop between the expensive layers,
  // so the current scene keeps animating while the next one is painted
  return buildScene(opts, tick);
}

function buildScene(opts, yieldFn) {
  if (yieldFn) return buildSceneStepped(opts, yieldFn);
  const S = sceneBase(opts);
  const { W, H, M } = S;
  const sky = makeCanvas(W + 2 * M, H), back = makeCanvas(W + 2 * M, H), mid = makeCanvas(W + 2 * M, H), front = makeCanvas(W + 2 * M, H);
  paintSky(sky.getContext('2d'), S);
  paintBack(back.getContext('2d'), S);
  paintMid(mid.getContext('2d'), S, back, sky);
  paintFront(front.getContext('2d'), S);
  return finishScene(S, { sky, back, mid, front });
}

function sceneBase({ w, h, scale, season, time, landscape, weather }) {
  const W = Math.round(w * scale), H = Math.round(h * scale);
  const M = Math.round(W * 0.04);
  const T = buildTerrain(landscape);
  const P = resolvePalette(season, time);
  if (time === 'dusk' || time === 'dawn') P.sky = { ...P.sky, sunPos: [P.sky.sunPos[0], T.horizon - 0.045] };
  else P.sky = { ...P.sky, sunPos: [P.sky.sunPos[0], Math.min(P.sky.sunPos[1], T.horizon - 0.2)] };
  if (weather === 'rain' || weather === 'drizzle' || weather === 'fog') {
    const k = weather === 'rain' ? 0.55 : weather === 'fog' ? 0.45 : 0.3;
    const grey = [150, 162, 176];
    P.sky = { ...P.sky, top: mix(P.sky.top, mul(grey, 0.6), k), mid: mix(P.sky.mid, grey, k), low: mix(P.sky.low, mix(grey, [255, 255, 255], 0.3), k), light: mix(P.sky.light, grey, k) };
    P.haze = P.sky.low;
    P.overcast = k + 0.2;
  }
  return { W, H, M, T, P, scale, season, time, weather };
}

async function buildSceneStepped(opts, yieldFn) {
  const S = sceneBase(opts);
  const { W, H, M } = S;
  const sky = makeCanvas(W + 2 * M, H), back = makeCanvas(W + 2 * M, H), mid = makeCanvas(W + 2 * M, H), front = makeCanvas(W + 2 * M, H);
  paintSky(sky.getContext('2d'), S); await yieldFn();
  paintBack(back.getContext('2d'), S); await yieldFn();
  paintMid(mid.getContext('2d'), S, back, sky); await yieldFn();
  paintFront(front.getContext('2d'), S); await yieldFn();
  return finishScene(S, { sky, back, mid, front });
}

function finishScene(S, layers) {
  const { W, H, T } = S;
  const weather = S.weather, season = S.season;
  const r = T.rand(101);
  const clouds = [];
  const nClouds = weather === 'rain' ? 9 : weather === 'clear' && season === 'summer' ? 5 : 7;
  for (let i = 0; i < nClouds; i++) {
    const cw = W * (0.18 + r() * 0.22), ch = cw * (0.32 + r() * 0.12);
    clouds.push({ img: makeCloud(S, r, cw, ch), x: r(), y: 0.02 + r() * (T.horizon * 0.42), speed: 0.004 + r() * 0.006, w: cw, h: ch, a: weather === 'rain' ? 0.95 : 0.7 + r() * 0.3 });
  }
  clouds.sort((a, b) => a.y - b.y);
  const fog = makeFog(S, W * 0.6, H * 0.14);
  return { ...S, layers, clouds, fog };
}

// ── particles ─────────────────────────────────────────────────────────
const PARTICLE_COLORS = {
  petals: ['#ffd6e6', '#ffffff', '#f7b7cf', '#fff1f6'],
  leaves: ['#e8892e', '#c9472a', '#f0b83c', '#a8521e', '#d86a2a'],
  motes: ['#fff6d6', '#ffe9a8', '#ffffff'],
  snow: ['#ffffff', '#eef5ff', '#dce9f8'],
  fireflies: ['#e9ff8a', '#fffbb0'],
  rain: ['#dfe8f5'],
};

function spawn(type, W, H, r, initial) {
  const p = { type, x: r() * W, y: initial ? r() * H : -10, s: 1, rot: r() * Math.PI * 2, vr: (r() - 0.5) * 0.06, a: 1, t: r() * 1000, col: PARTICLE_COLORS[type][Math.floor(r() * PARTICLE_COLORS[type].length)] };
  switch (type) {
    case 'snow': p.s = 0.8 + r() * 2.4; p.vy = 0.35 + p.s * 0.28; p.vx = 0; p.a = 0.55 + r() * 0.45; break;
    case 'leaves': p.s = 3 + r() * 4; p.vy = 0.45 + r() * 0.5; p.vx = 0.2 + r() * 0.5; break;
    case 'petals': p.s = 2 + r() * 2.5; p.vy = 0.25 + r() * 0.35; p.vx = 0.3 + r() * 0.5; p.a = 0.85; break;
    case 'motes': p.s = 0.8 + r() * 1.8; p.vy = -0.05 - r() * 0.1; p.vx = 0.1 + r() * 0.15; p.a = 0; p.y = initial ? r() * H : H * (0.4 + r() * 0.5); break;
    case 'fireflies': p.s = 1.2 + r() * 1.6; p.vy = (r() - 0.5) * 0.2; p.vx = (r() - 0.5) * 0.3; p.y = H * (0.6 + r() * 0.35); p.a = 0; break;
    case 'rain': p.s = 1; p.vy = 14 + r() * 8; p.vx = -2.2; p.len = 10 + r() * 14; p.a = 0.18 + r() * 0.25; p.y = initial ? r() * H : -20; p.x = r() * (W + 200); break;
  }
  return p;
}

// ── the World ─────────────────────────────────────────────────────────
// ── hold the animation while typing / while a dialog is open ──
let holdInstalled = false, typingUntil = 0;
const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
function installHold() {
  holdInstalled = true;
  addEventListener('keydown', (e) => { if (e.target?.closest?.(TYPING)) typingUntil = performance.now() + 1200; }, true);
}
export const worldHeld = () => performance.now() < typingUntil || !!document.querySelector('.modal-backdrop');

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cfg = { season: 'summer', time: 'dusk', weather: 'clear', intensity: 0.7, brightness: 0.9, parallax: true, reduced: false, landscape: 'valley', focus: 0 };
    this.scene = null;
    this.prev = null;
    this.fade = 1;
    this.particles = [];
    this.weatherParticles = [];
    this.birds = [];
    this.px = 0; this.py = 0; this.tx = 0; this.ty = 0;
    this.time0 = performance.now();
    this.last = 0;
    this.running = false;
    this.rng = mulberry32(Date.now() & 0xffff);
    // 0 = full … 3 = lowest animated, 4 = still. Remembered per device; start one step better to re-test.
    let q = 0, stored = null;
    try { stored = localStorage.getItem('hubtech.world.quality'); } catch { /* */ }
    if (stored !== null) q = Math.max(0, Math.min(4, Number(stored) - 1));
    else {
      // first visit on this device: phones and small machines start in light mode (lower resolution, fewer particles)
      const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
      const weak = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
      if (phone || weak) q = 2;
    }
    this.quality = q;
    this._onMove = (e) => {
      if (!this.cfg.parallax) return;
      this.tx = (e.clientX / innerWidth - 0.5) * 2;
      this.ty = (e.clientY / innerHeight - 0.5) * 2;
    };
    this._onResize = () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.rebuild(true), 180); };
    this._onVis = () => { if (document.hidden) this.stopLoop(); else this.startLoop(); };
    addEventListener('pointermove', this._onMove, { passive: true });
    addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVis);
  }

  get size() { return { w: innerWidth, h: innerHeight }; }

  renderScale(w, h) {
    const hq = this.cfg.hq && this.quality === 0;
    const dpr = Math.min(devicePixelRatio || 1, hq ? 2 : 1.5);
    // the scene is soft – fewer pixels give the same look with far less fill-rate.
    // The quality governor lowers the budget on machines that can't keep up; "Høj kvalitet" allows full sharpness.
    const budget = hq ? 4.4e6 : [1.7e6, 1.0e6, 0.55e6, 0.55e6][this.quality] ?? 1.7e6;
    return Math.min(dpr, Math.sqrt(budget / (w * h)));
  }

  /** Adaptive quality: watch real frame cost and step down resolution / fps / particles if needed. */
  saveQuality() { try { localStorage.setItem('hubtech.world.quality', String(this.quality)); } catch { /* */ } }

  govern(cost) {
    this._ema = this._ema == null ? cost : this._ema * 0.9 + cost * 0.1;
    this._frames = (this._frames || 0) + 1;
    if (this._frames < 40) return;
    if (this._ema > 16 && this.quality < 3) {
      this.quality++;
      this.saveQuality();
      this._frames = 0; this._ema = null;
      this.resetParticles();
      this.rebuild(true);
    } else if (this._ema > 22 && this.quality === 3) {
      // last resort: a still image keeps the atmosphere without costing the user anything
      this.quality = 4;
      this.saveQuality();
      this.stopLoop();
      this.drawFrame(performance.now(), true);
      console.info('[HUBTECH] Verdenen vises som stillbillede for at spare ressourcer.');
    }
  }

  effectiveWeather() {
    const w = this.cfg.weather;
    if (w && w !== 'auto') return w;
    return { spring: 'clear', summer: 'clear', autumn: 'clear', winter: 'snow' }[this.cfg.season];
  }

  configure(patch) {
    const before = { ...this.cfg };
    Object.assign(this.cfg, patch);
    this.canvas.style.filter = `brightness(${this.cfg.brightness}) saturate(${0.9 + this.cfg.brightness * 0.12})`;
    const sceneChanged = !this.scene || ['season', 'time', 'landscape', 'weather', 'hq'].some(k => before[k] !== this.cfg[k]);
    if (sceneChanged) this.rebuild(false);
    if (!sceneChanged && (before.intensity !== this.cfg.intensity || before.focus !== this.cfg.focus)) this.resetParticles();
    if (this.cfg.reduced || this.quality >= 4) { this.stopLoop(); this.drawFrame(performance.now(), true); }
    else this.startLoop();
  }

  rebuild(isResize) {
    const { w, h } = this.size;
    const scale = this.renderScale(w, h);
    const opts = { w, h, scale, season: this.cfg.season, time: this.cfg.time, landscape: this.cfg.landscape, weather: this.effectiveWeather() };
    const token = (this._buildToken = (this._buildToken || 0) + 1);
    const apply = (next) => {
      if (token !== this._buildToken) return; // a newer request superseded this one
      if (this.canvas.width !== next.W || this.canvas.height !== next.H) {
        this.canvas.width = next.W; this.canvas.height = next.H;
      }
      if (this.scene && !isResize && !this.cfg.reduced && this.scene.W === next.W) {
        this.prev = this.scene; this.fade = 0; this.fadeStart = performance.now();
      } else { this.prev = null; this.fade = 1; }
      const old = this.scene;
      this.scene = next;
      if (isResize || !old || old.season !== next.season || old.time !== next.time || old.weather !== next.weather) this.resetParticles();
      if (this.cfg.reduced || !this.running) this.drawFrame(performance.now(), true);
    };
    if (!this.scene || this.cfg.reduced) {
      const t0 = performance.now();
      apply(buildScene(opts));
      const took = performance.now() - t0;
      // a slow first build says more than any device check: go straight to light mode (or a still picture)
      if (took > 2200 && this.quality < 4) { this.quality = 4; this.saveQuality(); this.stopLoop(); console.info(`[HUBTECH] Landskabet tog ${Math.round(took)} ms – vises som stillbillede.`); }
      else if (took > 800 && this.quality < 2) { this.quality = 2; this.saveQuality(); console.info(`[HUBTECH] Landskabet tog ${Math.round(took)} ms – let tilstand.`); setTimeout(() => this.rebuild(true), 50); }
    }
    else buildSceneAsync(opts).then(apply);
  }

  resetParticles() {
    if (!this.scene) return;
    const { W, H, P } = this.scene;
    const k = this.cfg.intensity * (this.cfg.focus ? 0.55 : 1) * [1, 0.8, 0.5, 0.35, 0.35][this.quality || 0];
    const area = (W * H) / (1600 * 900);
    let type = P.land.particles;
    if (P.time === 'night' && this.cfg.season === 'summer') type = 'fireflies';
    const counts = { petals: 34, leaves: 30, motes: 46, snow: 0, fireflies: 34 };
    const n = Math.round((counts[type] || 0) * k * area);
    this.particles = Array.from({ length: n }, () => spawn(type, W, H, this.rng, true));
    const w = this.effectiveWeather();
    const wn = w === 'snow' ? Math.round(220 * k * area) : w === 'rain' ? Math.round(260 * k * area) : w === 'drizzle' ? Math.round(110 * k * area) : 0;
    const wt = w === 'snow' ? 'snow' : 'rain';
    this.weatherParticles = Array.from({ length: wn }, () => spawn(wt, W, H, this.rng, true));
    this.birds = [];
  }

  startLoop() {
    this.last = 0;
    if (!holdInstalled) installHold();
    if (this.running || this.cfg.reduced || document.hidden || this.quality >= 4) return;
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const fps = this.quality >= 2 ? 20 : this.cfg.intensity < 0.35 ? 24 : 30;
      if (t - this.last < 1000 / fps - 1) return;
      // Hold the picture still while a dialog/search is open or the user is typing: every moving frame
      // forces all the frosted-glass panels on top to be re-blurred, which makes typing feel sluggish.
      if (worldHeld()) { this.last = t; return; }
      const gap = this.last ? t - this.last : 1000 / fps;
      this.last = t;
      const t0 = performance.now();
      this.drawFrame(t, false);
      // cost = main-thread draw time, or how late the frame arrived (raster/compositing happens off our clock)
      this.govern(Math.max(performance.now() - t0, gap - 1000 / fps));
    };
    this.raf = requestAnimationFrame(loop);
  }

  stopLoop() { this.running = false; cancelAnimationFrame(this.raf); }

  destroy() {
    this.stopLoop();
    removeEventListener('pointermove', this._onMove);
    removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
  }

  drawScene(S, t, alpha, still) {
    const ctx = this.ctx;
    const { W, H, M } = S;
    const k = this.cfg.intensity;
    const off = (d) => -M + this.px * M * d;
    ctx.globalAlpha = alpha;
    ctx.drawImage(S.layers.sky, off(0.15), this.py * 3);
    // clouds behind the mountains
    const sec = (t - this.time0) / 1000;
    for (const c of S.clouds) {
      const span = W + c.w * 2;
      const x = ((c.x * span + sec * c.speed * W * (still ? 0 : 0.6 + k * 0.6)) % span) - c.w + off(0.25) + M;
      ctx.globalAlpha = alpha * c.a;
      ctx.drawImage(c.img, x, c.y * H + this.py * 4, c.w, c.h);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(S.layers.back, off(0.35), this.py * 5);
    ctx.drawImage(S.layers.mid, off(0.6), this.py * 7);
    // living light on the lake
    this.lakeGlitter(S, sec, alpha, off(0.6));
    ctx.drawImage(S.layers.front, off(1), this.py * 10);
  }

  lakeGlitter(S, sec, alpha, ox) {
    const ctx = this.ctx;
    const { W, H, T, P } = S;
    if (P.land.ice > 0.5) return;
    const [sx] = P.sky.sunPos;
    const cx = sx * W + ox + S.M;
    const top = T.horizon * H, bot = T.lakeBottom * H;
    const night = P.time === 'night';
    const base = night ? 0.35 : P.time === 'day' ? 0.5 : 0.9;
    const col = mix(P.sky.sun, [255, 255, 255], 0.3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rows = 42;
    for (let i = 0; i < rows; i++) {
      const f = i / rows;
      const y = top + 2 + f * f * (bot - top);
      const spread = W * (0.01 + f * 0.05);
      for (let j = 0; j < 3; j++) {
        const ph = i * 12.9898 + j * 78.233;
        const flick = 0.5 + 0.5 * Math.sin(sec * (1.1 + ((i + j) % 5) * 0.31) + ph);
        if (flick < 0.35) continue;
        const w = spread * (0.15 + 0.5 * flick) * (j === 0 ? 1 : 0.55);
        const x = cx + Math.sin(ph) * spread * 0.9 + Math.sin(sec * 0.35 + i) * spread * 0.15 - w / 2;
        const xn = (x + w / 2 - ox - S.M) / W, yn = y / H;
        if (!(T.shoreL(xn) > yn && T.shoreR(xn) > yn && T.nearShore(xn) > yn)) continue;
        ctx.fillStyle = css(col, alpha * base * (0.1 + 0.3 * flick) * (1 - f * 0.55));
        ctx.fillRect(x, y, w, Math.max(1, H * 0.0016 * (1 + f * 2)));
      }
    }
    ctx.restore();
  }

  lightRays(S, sec, alpha) {
    const { P } = S;
    if (!(P.time === 'dusk' || P.time === 'dawn') || this.cfg.intensity < 0.15 || P.overcast || this.quality >= 2) return;
    if (!S.rays) S.rays = makeRays(S);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * this.cfg.intensity * (0.75 + 0.25 * Math.sin(sec * 0.25));
    ctx.drawImage(S.rays, this.px * S.M * 0.15 - S.M * 0.15, 0, S.W, S.H);
    ctx.restore();
  }

  stepParticles(S, dt, sec, still) {
    const ctx = this.ctx;
    const { W, H } = S;
    const wind = Math.sin(sec * 0.13) * 0.6 + Math.sin(sec * 0.041) * 0.4;
    const k = dt / 33;
    for (const p of this.particles) {
      if (!still) {
        p.t += dt * 0.001;
        p.x += (p.vx + wind * (p.type === 'leaves' ? 0.6 : 0.3)) * k;
        p.y += p.vy * k + Math.sin(p.t * 1.7) * 0.15 * k;
        p.rot += p.vr * k;
        if (p.type === 'motes' || p.type === 'fireflies') {
          p.a = Math.min(1, p.a + 0.01 * k) * (0.6 + 0.4 * Math.sin(p.t * (p.type === 'fireflies' ? 3 : 1.2)));
          p.x += Math.sin(p.t * 0.9) * 0.3 * k;
          p.y += Math.cos(p.t * 0.7) * 0.2 * k;
        }
        if (p.y > H + 20 || p.x > W + 30 || p.x < -30 || p.y < -40) Object.assign(p, spawn(p.type, W, H, this.rng, false), p.type === 'motes' || p.type === 'fireflies' ? {} : { x: this.rng() * W * 1.2 - W * 0.2 });
      }
      this.drawParticle(ctx, p);
    }
  }

  drawParticle(ctx, p) {
    switch (p.type) {
      case 'leaves':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.t * 2)) * 0.7 + 0.3);
        ctx.fillStyle = p.col; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); break;
      case 'petals':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.t * 2.5)) * 0.6 + 0.4);
        ctx.fillStyle = p.col; ctx.globalAlpha = p.a;
        ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.62, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); break;
      case 'motes':
      case 'fireflies': {
        const a = Math.max(0, p.a);
        const r = p.s * (p.type === 'fireflies' ? 5 : 3.2);
        ctx.globalAlpha = p.type === 'fireflies' ? 0.9 * a : 0.55 * a;
        ctx.drawImage(tintedGlow(p.type === 'fireflies' ? '#f0ff96' : '#fff6d6'), p.x - r, p.y - r, r * 2, r * 2);
        break;
      }
      default: break;
    }
    ctx.globalAlpha = 1;
  }

  stepWeather(S, dt, sec, still) {
    const ctx = this.ctx;
    const { W, H, P } = S;
    const w = this.effectiveWeather();
    const k = dt / 33;
    if (w === 'rain' || w === 'drizzle') {
      ctx.save();
      ctx.strokeStyle = css(mix(P.sky.low, [220, 230, 245], 0.6), 1);
      ctx.lineWidth = Math.max(1, S.scale);
      for (const p of this.weatherParticles) {
        if (!still) { p.x += p.vx * k; p.y += p.vy * k * (w === 'drizzle' ? 0.6 : 1); if (p.y > H) { p.y = -20 - this.rng() * 100; p.x = this.rng() * (W + 200); } }
        ctx.globalAlpha = p.a * (w === 'drizzle' ? 0.7 : 1);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 1.5, p.y + p.len * (w === 'drizzle' ? 0.6 : 1)); ctx.stroke();
      }
      ctx.restore();
    } else if (w === 'snow') {
      ctx.fillStyle = '#fff';
      const wind = Math.sin(sec * 0.2) * 0.8;
      for (const p of this.weatherParticles) {
        if (!still) {
          p.t += dt * 0.001;
          p.y += p.vy * k; p.x += (Math.sin(p.t * 1.3 + p.s) * 0.5 + wind * p.s * 0.25) * k;
          if (p.y > H + 5) { p.y = -5; p.x = this.rng() * W; }
          if (p.x > W + 5) p.x = -5; if (p.x < -5) p.x = W + 5;
        }
        ctx.globalAlpha = p.a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (w === 'fog' || (S.season === 'autumn' && P.time !== 'day') || w === 'rain') {
      const amount = w === 'fog' ? 1 : 0.45;
      for (let i = 0; i < 5; i++) {
        const fx = ((sec * (8 + i * 3) * S.scale + i * W * 0.31) % (W * 1.6)) - W * 0.3;
        const fy = S.T.horizon * H + (i - 1.5) * H * 0.035;
        ctx.globalAlpha = 0.5 * amount;
        ctx.drawImage(S.fog, fx, fy - S.fog.height / 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  stepBirds(S, dt, sec) {
    const { W, H, P } = S;
    if (P.time === 'night' || S.season === 'winter' || this.cfg.intensity < 0.3 || this.cfg.focus) return;
    if (this.birds.length === 0 && this.rng() < 0.009 * (dt / 33)) {
      const y = H * (0.1 + this.rng() * 0.2);
      const n = 3 + Math.floor(this.rng() * 6);
      for (let i = 0; i < n; i++) this.birds.push({ x: -40 - i * 18 * S.scale, y: y + (i % 2) * 10 * S.scale + i * 4 * S.scale, ph: this.rng() * 6, v: (1.1 + this.rng() * 0.2) * S.scale });
    }
    const ctx = this.ctx;
    ctx.strokeStyle = css(mul(P.sky.top, 0.4), 0.85);
    ctx.lineWidth = 1.4 * S.scale;
    for (const b of this.birds) {
      b.x += b.v * (dt / 33) * 1.6; b.y += Math.sin(sec + b.ph) * 0.15;
      const f = Math.sin(sec * 9 + b.ph) * 3 * S.scale;
      ctx.beginPath(); ctx.moveTo(b.x - 6 * S.scale, b.y - f); ctx.quadraticCurveTo(b.x - 2 * S.scale, b.y - 2, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 2 * S.scale, b.y - 2, b.x + 6 * S.scale, b.y - f); ctx.stroke();
    }
    this.birds = this.birds.filter(b => b.x < W + 60);
  }

  drawFrame(t, still) {
    if (!this.scene) return;
    const dt = Math.min(80, this._lt ? t - this._lt : 33);
    this._lt = t;
    // ease parallax (with a gentle idle drift so the world breathes)
    const sec = (t - this.time0) / 1000;
    const idle = still ? 0 : 0.18 * this.cfg.intensity;
    const tx = this.cfg.parallax ? this.tx + Math.sin(sec * 0.07) * idle : 0;
    const ty = this.cfg.parallax ? this.ty * 0.5 + Math.cos(sec * 0.05) * idle * 0.3 : 0;
    this.px += (tx - this.px) * (still ? 1 : 0.04);
    this.py += (ty - this.py) * (still ? 1 : 0.04);
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.prev) {
      this.fade = Math.min(1, (t - this.fadeStart) / 1800);
      const e = this.fade < 0.5 ? 2 * this.fade * this.fade : 1 - Math.pow(-2 * this.fade + 2, 2) / 2;
      this.drawScene(this.prev, t, 1, still);
      this.drawScene(this.scene, t, e, still);
      if (this.fade >= 1) this.prev = null;
    } else {
      this.drawScene(this.scene, t, 1, still);
    }
    ctx.globalAlpha = 1;
    this.lightRays(this.scene, sec, 1);
    this.stepBirds(this.scene, dt, sec);
    this.stepParticles(this.scene, dt, sec, still);
    this.stepWeather(this.scene, dt, sec, still);
  }

  /** Paint a static thumbnail of any scene into a canvas (used for app art & season pickers). */
  static renderStill(canvas, { season = 'summer', time = 'dusk', landscape = 'valley', weather = 'clear', focusX = 0.5, focusY = 0.45, zoom = 1, w, h, tint = null, mono = false } = {}) {
    w = w || canvas.clientWidth || 320; h = h || canvas.clientHeight || 180;
    const scale = Math.min(devicePixelRatio || 1, 2);
    // render the full world at a "screen-like" aspect, then crop around focusX
    const vw = Math.max(w * 1.7 * zoom, 480), vh = vw * 9 / 16;
    const S = buildScene({ w: vw, h: vh, scale: 1, season, time, landscape, weather });
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    const full = makeCanvas(S.W, S.H);
    const f = full.getContext('2d');
    f.drawImage(S.layers.sky, -S.M, 0);
    for (const c of S.clouds) { f.globalAlpha = c.a; f.drawImage(c.img, c.x * S.W, c.y * S.H, c.w, c.h); }
    f.globalAlpha = 1;
    f.drawImage(S.layers.back, -S.M, 0);
    f.drawImage(S.layers.mid, -S.M, 0);
    f.drawImage(S.layers.front, -S.M, 0);
    // crop to target aspect
    const ta = w / h, sa = S.W / S.H;
    let sw = S.W, sh = S.H;
    if (ta > sa) sh = S.W / ta; else sw = S.H * ta;
    const sx = Math.max(0, Math.min(S.W - sw, focusX * S.W - sw / 2));
    const sy = Math.max(0, (S.H - sh) * focusY);
    if (mono) { try { ctx.filter = 'grayscale(0.9) contrast(1.15) brightness(0.95)'; } catch { /* */ } }
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    if (tint) {
      // give each app card its own colour mood (like the mockup), keeping the landscape's light
      ctx.save();
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = tint; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (weather === 'snow' || season === 'winter') {
      const r = mulberry32(9);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc(r() * canvas.width, r() * canvas.height, r() * 1.6 * scale, 0, Math.PI * 2); ctx.fill(); }
    }
    return canvas;
  }
}
