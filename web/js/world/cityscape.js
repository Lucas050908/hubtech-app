/**
 * Theme scenes: animated backgrounds drawn live on a canvas – Tokyo at night, a neon street, a Chinese megacity,
 * a city of the future, traditional Japan, an Asian harbour skyline, minimal and elegant. Everything is generated
 * here (no photos), so it is sharp on any screen (4K too), costs nothing to download and has no copyright.
 *
 * Static parts (sky, skylines, lit windows, sign glow) are painted once into layers; each frame only moves the
 * small things (neon flicker, trains, boats, rain, petals, light beams). ~30 frames a second, paused when hidden.
 */

import { SCENES } from './scenes.js';
export { SCENES };

// ── helpers ──
const TAU = Math.PI * 2;
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function layer(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h)) : Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
  return c;
}
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Time of day for scenes that follow the clock. */
function palette(scene, time) {
  const P = {
    night: { sky: [[0, '#05060f'], [0.55, '#0b1030'], [1, '#1d1640']], haze: '#3a2a6b', build: ['#070a17', '#0b1022', '#111833'], win: ['#ffd38a', '#9fd3ff', '#ffe9c2'], lit: 0.42, water: '#060a1a', stars: 1 },
    dusk: { sky: [[0, '#1a1b4b'], [0.45, '#6b3a7a'], [0.75, '#ff8a5c'], [1, '#ffc38a']], haze: '#ff9a6b', build: ['#1a1530', '#231a3a', '#2c2145'], win: ['#ffd38a', '#ffe6b0', '#ffc070'], lit: 0.28, water: '#2a1f40', stars: 0.25 },
    dawn: { sky: [[0, '#2a3a6b'], [0.5, '#8a7aa8'], [0.8, '#ffb4a2'], [1, '#ffe0c2']], haze: '#ffc8b0', build: ['#2b2f4a', '#353a58', '#41466a'], win: ['#ffe2b0', '#fff2d0', '#ffd090'], lit: 0.14, water: '#3a3f60', stars: 0.1 },
    day: { sky: [[0, '#3f86d8'], [0.6, '#8cc4ef'], [1, '#d8eefa']], haze: '#cfe6f7', build: ['#4f6380', '#62779a', '#7a8fb0'], win: ['#d8ecff', '#bcd8f5', '#e8f4ff'], lit: 0.05, water: '#4a7ab0', stars: 0 },
  };
  if (scene === 'tokyo' || scene === 'neon' || scene === 'future') return P.night;
  return P[time] || P.night;
}

// ── buildings ──
/** A row of buildings along a baseline. Returns their boxes (for signs and lights). */
function skyline(ctx, r, { W, base, count, hMin, hMax, wMin, wMax, color, win, lit, roofs = ['flat'], gap = 0, edge = null, winSize = 1 }) {
  const out = [];
  let x = -wMax * r();
  while (x < W + wMax) {
    const w = lerp(wMin, wMax, r());
    const h = lerp(hMin, hMax, Math.pow(r(), 1.4));
    const top = base - h;
    const roof = pick(r, roofs);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (roof === 'spire') { ctx.rect(x, top, w, h); ctx.moveTo(x + w * 0.42, top); ctx.lineTo(x + w / 2, top - h * 0.18); ctx.lineTo(x + w * 0.58, top); }
    else if (roof === 'stepped') { ctx.rect(x, top + h * 0.08, w, h * 0.92); ctx.rect(x + w * 0.15, top, w * 0.7, h * 0.1); ctx.rect(x + w * 0.32, top - h * 0.06, w * 0.36, h * 0.08); }
    else if (roof === 'slant') { ctx.moveTo(x, base); ctx.lineTo(x, top + h * 0.12); ctx.lineTo(x + w, top); ctx.lineTo(x + w, base); }
    else if (roof === 'round') { ctx.rect(x, top + w / 2, w, h - w / 2); ctx.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0); }
    else if (roof === 'antenna') { ctx.rect(x, top, w, h); ctx.rect(x + w / 2 - 1, top - h * 0.22, 2, h * 0.22); }
    else ctx.rect(x, top, w, h);
    ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h); }
    // windows
    if (win && lit > 0) {
      const cw = Math.max(2, 3 * winSize), ch = Math.max(2, 4 * winSize), gx = cw * 2.2, gy = ch * 2.1;
      for (let wy = top + gy; wy < base - gy; wy += gy) {
        const rowLit = r() < 0.85;
        for (let wx = x + gx * 0.6; wx < x + w - gx * 0.6; wx += gx) {
          if (!rowLit || r() > lit) continue;
          ctx.fillStyle = hexA(pick(r, win), 0.55 + r() * 0.45);
          ctx.fillRect(wx, wy, cw, ch);
        }
      }
    }
    out.push({ x, w, top, h, roof });
    x += w + gap * r();
  }
  return out;
}

/** A vertical neon sign with glyph-like strokes (made-up signs, not real words). */
function neonSign(r, h, color, vertical = true) {
  const n = Math.max(2, Math.round(h / 22));
  const cw = 18, pad = 5;
  const W = vertical ? cw + pad * 2 : n * cw + pad * 2, H = vertical ? n * cw + pad * 2 : cw + pad * 2;
  const glow = 10;
  const c = layer(W + glow * 2, H + glow * 2), x = c.getContext('2d');
  x.translate(glow, glow);
  x.fillStyle = 'rgba(8,6,20,.85)'; x.fillRect(0, 0, W, H);
  x.strokeStyle = color; x.lineWidth = 2; x.lineCap = 'round';
  x.shadowColor = color; x.shadowBlur = 12;
  x.strokeRect(1.5, 1.5, W - 3, H - 3);
  for (let i = 0; i < n; i++) {
    const ox = vertical ? pad : pad + i * cw, oy = vertical ? pad + i * cw : pad;
    const strokes = 2 + Math.floor(r() * 3);
    x.beginPath();
    for (let s = 0; s < strokes; s++) {
      const kind = r();
      const a = 3 + r() * 4, b = 3 + r() * 10;
      if (kind < 0.35) { x.moveTo(ox + a, oy + b); x.lineTo(ox + cw - a, oy + b); }
      else if (kind < 0.7) { x.moveTo(ox + b * 0.8, oy + a); x.lineTo(ox + b * 0.8, oy + cw - a); }
      else if (kind < 0.85) { x.moveTo(ox + a, oy + a); x.lineTo(ox + cw - a, oy + cw - a); }
      else { x.moveTo(ox + cw - a, oy + a); x.lineTo(ox + a + 2, oy + cw - a); }
    }
    x.stroke();
  }
  return c;
}

const NEON = ['#ff3d9a', '#3df2ff', '#ffcf3d', '#a36bff', '#ff5a3d', '#3dff9e', '#ff6bd6'];

// ── scenes ──
function buildScene(name, W, H, time, light) {
  const r = mulberry({ tokyo: 11, neon: 23, shanghai: 37, future: 41, kyoto: 53, harbor: 67, minimal: 71, silk: 83 }[name] || 1);
  const P = palette(name, time);
  const bg = layer(W, H), b = bg.getContext('2d');
  const S = { name, W, H, bg, time, anim: [], P, horizon: H * 0.68 };
  const s = Math.max(0.6, Math.min(2.4, W / 1600));     // scale details with the screen
  b.fillStyle = vgrad(b, 0, H, P.sky); b.fillRect(0, 0, W, H);
  const stars = () => { for (let i = 0; i < 260 * P.stars; i++) { b.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; const z = r() < 0.08 ? 1.6 : 1; b.fillRect(r() * W, r() * H * 0.55, z * s, z * s); } };
  const glowBand = (y, color, h, a) => { const g = b.createLinearGradient(0, y - h, 0, y + h); g.addColorStop(0, hexA(color, 0)); g.addColorStop(0.5, hexA(color, a)); g.addColorStop(1, hexA(color, 0)); b.fillStyle = g; b.fillRect(0, y - h, W, h * 2); };

  if (name === 'tokyo') {
    stars();
    const base = H * 0.78;
    glowBand(base - H * 0.2, '#ff4fa8', H * 0.25, 0.18);
    skyline(b, r, { W, base: base - H * 0.02, hMin: H * 0.12, hMax: H * 0.36, wMin: 30 * s, wMax: 70 * s, color: '#0c0f24', win: ['#9fd3ff', '#ffd38a'], lit: 0.25, roofs: ['flat', 'antenna', 'stepped'], winSize: s * 0.7 });
    // a lattice broadcast tower
    const tx = W * 0.72, tb = base - H * 0.04, th = H * 0.62;
    b.strokeStyle = '#ff6a3a'; b.lineWidth = 1.4 * s; b.shadowColor = '#ff6a3a'; b.shadowBlur = 8 * s;
    b.beginPath();
    for (const sgn of [-1, 1]) { b.moveTo(tx + sgn * 34 * s, tb); b.quadraticCurveTo(tx + sgn * 10 * s, tb - th * 0.55, tx + sgn * 2 * s, tb - th); }
    for (let i = 1; i < 14; i++) { const t = i / 14, y = tb - th * t, half = lerp(34, 2, Math.pow(t, 0.7)) * s; b.moveTo(tx - half, y); b.lineTo(tx + half, y); if (i % 2) { b.moveTo(tx - half, y); b.lineTo(tx + half * 0.8, y - th / 14); } }
    b.moveTo(tx, tb - th); b.lineTo(tx, tb - th * 1.12);
    b.stroke(); b.shadowBlur = 0;
    S.anim.push({ type: 'blink', x: tx, y: tb - th * 1.12, r: 3 * s, color: '#ff3030', period: 1.6 });
    const front = skyline(b, r, { W, base, hMin: H * 0.18, hMax: H * 0.5, wMin: 46 * s, wMax: 110 * s, color: '#05070f', win: P.win, lit: 0.48, roofs: ['flat', 'antenna', 'stepped', 'slant'], winSize: s });
    for (const bd of front) if (r() < 0.55 && bd.h > H * 0.22) S.anim.push({ type: 'sign', img: neonSign(r, Math.min(bd.h * 0.6, 220 * s) / s, pick(r, NEON)), x: bd.x + bd.w * (r() < 0.5 ? 0.08 : 0.62), y: bd.top + bd.h * 0.1, s, flick: r() < 0.25, ph: r() * 10 });
    // elevated train line
    S.rail = base + H * 0.035;
    b.fillStyle = '#04050c'; b.fillRect(0, S.rail, W, 8 * s);
    for (let x = 0; x < W; x += 140 * s) b.fillRect(x, S.rail, 10 * s, H - S.rail);
    S.anim.push({ type: 'train', y: S.rail - 16 * s, h: 14 * s, len: 420 * s, speed: 0.11, color: '#d8f2ff' });
    b.fillStyle = vgrad(b, base + H * 0.05, H, [[0, '#090b1a'], [1, '#03040a']]); b.fillRect(0, S.rail + 8 * s, W, H);
    S.reflect = { y: S.rail + 8 * s, from: base - H * 0.3 };
    S.anim.push({ type: 'rain', n: Math.round(220 * s), color: 'rgba(180,200,255,.35)' });
  }

  else if (name === 'neon') {
    // a street seen from the middle: facades on both sides lead to a vanishing point
    const vx = W * 0.5, vy = H * 0.5;
    b.fillStyle = vgrad(b, 0, H, [[0, '#06040f'], [0.5, '#170a2a'], [1, '#05030a']]); b.fillRect(0, 0, W, H);
    glowBand(vy, '#ff3d9a', H * 0.12, 0.25);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const t0 = i / 9, t1 = (i + 1) / 9;
        const x0 = side < 0 ? lerp(0, vx - W * 0.06, t0) : lerp(W, vx + W * 0.06, t0);
        const x1 = side < 0 ? lerp(0, vx - W * 0.06, t1) : lerp(W, vx + W * 0.06, t1);
        const top0 = lerp(-H * 0.2, vy - H * 0.22, t0), top1 = lerp(-H * 0.2, vy - H * 0.22, t1);
        const bot0 = lerp(H * 1.05, vy + H * 0.06, t0), bot1 = lerp(H * 1.05, vy + H * 0.06, t1);
        b.fillStyle = i % 2 ? '#0d0a1c' : '#110d24';
        b.beginPath(); b.moveTo(x0, top0); b.lineTo(x1, top1); b.lineTo(x1, bot1); b.lineTo(x0, bot0); b.fill();
        // signs sticking out from the wall
        if (i < 8) for (let k = 0; k < 2; k++) {
          const tt = lerp(t0, t1, 0.5);
          const sh = (1 - tt) * H * 0.42 * (0.6 + r() * 0.5);
          const sx = side < 0 ? lerp(0, vx - W * 0.06, tt) : lerp(W, vx + W * 0.06, tt);
          const sy = lerp(H * 0.05, vy - H * 0.12, tt) + k * sh * 0.9;
          const img = neonSign(r, Math.max(44, sh / Math.max(0.5, (1 - tt) * s)), pick(r, NEON));
          S.anim.push({ type: 'sign', img, x: sx - (side < 0 ? 0 : img.width * (1 - tt) * s), y: sy, s: (1 - tt) * s * 1.1, flick: r() < 0.3, ph: r() * 10 });
        }
      }
    }
    // wet street
    b.fillStyle = vgrad(b, vy + H * 0.06, H, [[0, '#120a22'], [1, '#05030c']]);
    b.beginPath(); b.moveTo(vx - W * 0.06, vy + H * 0.06); b.lineTo(vx + W * 0.06, vy + H * 0.06); b.lineTo(W * 1.2, H); b.lineTo(-W * 0.2, H); b.fill();
    S.reflect = { y: vy + H * 0.07, from: H * 0.1 };
    S.anim.push({ type: 'rain', n: Math.round(260 * s), color: 'rgba(255,170,230,.3)' });
    S.anim.push({ type: 'steam', x: W * 0.36, y: H * 0.86, s });
  }

  else if (name === 'shanghai') {
    stars();
    const base = H * 0.66;
    glowBand(base - H * 0.05, P.haze, H * 0.18, time === 'day' ? 0.2 : 0.3);
    skyline(b, r, { W, base, hMin: H * 0.06, hMax: H * 0.2, wMin: 26 * s, wMax: 60 * s, color: P.build[2], win: P.win, lit: P.lit * 0.6, roofs: ['flat', 'stepped'], winSize: s * 0.6 });
    // landmark-style supertalls (generic shapes)
    const tall = (x, w, h, kind) => {
      const top = base - h;
      b.fillStyle = P.build[0];
      b.beginPath();
      if (kind === 'twist') { b.moveTo(x, base); b.bezierCurveTo(x - w * 0.1, top + h * 0.5, x + w * 0.25, top + h * 0.2, x + w * 0.3, top); b.lineTo(x + w * 0.7, top); b.bezierCurveTo(x + w * 0.75, top + h * 0.2, x + w * 1.1, top + h * 0.5, x + w, base); }
      else if (kind === 'opener') { b.moveTo(x, base); b.lineTo(x + w * 0.12, top); b.lineTo(x + w * 0.88, top); b.lineTo(x + w, base); b.closePath(); b.moveTo(x + w * 0.32, top + h * 0.05); b.lineTo(x + w * 0.68, top + h * 0.05); b.lineTo(x + w * 0.66, top + h * 0.11); b.lineTo(x + w * 0.34, top + h * 0.11); b.closePath(); }
      else if (kind === 'spheres') { b.rect(x + w * 0.45, top + h * 0.1, w * 0.1, h * 0.9); b.moveTo(x + w * 0.5 + w * 0.28, base - h * 0.35); b.arc(x + w * 0.5, base - h * 0.35, w * 0.28, 0, TAU); b.moveTo(x + w * 0.5 + w * 0.18, base - h * 0.72); b.arc(x + w * 0.5, base - h * 0.72, w * 0.18, 0, TAU); b.rect(x + w * 0.49, top - h * 0.12, w * 0.02, h * 0.22); }
      else { b.moveTo(x, base); b.lineTo(x + w * 0.1, top + h * 0.1); b.lineTo(x + w / 2, top); b.lineTo(x + w * 0.9, top + h * 0.1); b.lineTo(x + w, base); }
      b.fill('evenodd');
      if (time !== 'day') { b.strokeStyle = hexA(kind === 'spheres' ? '#ff5fb0' : '#7fd8ff', 0.6); b.lineWidth = 1.2 * s; b.stroke(); }
      return { x, w, top, h };
    };
    const t1 = tall(W * 0.18, 70 * s, H * 0.5, 'spheres');
    tall(W * 0.55, 90 * s, H * 0.6, 'twist');
    tall(W * 0.66, 80 * s, H * 0.52, 'opener');
    tall(W * 0.45, 70 * s, H * 0.46, 'needle');
    const front = skyline(b, r, { W, base, hMin: H * 0.1, hMax: H * 0.32, wMin: 36 * s, wMax: 80 * s, color: P.build[1], win: P.win, lit: P.lit, roofs: ['flat', 'spire', 'slant', 'round'], winSize: s * 0.8, edge: time === 'day' ? null : 'rgba(127,216,255,.18)' });
    if (time !== 'day') for (const bd of front) if (r() < 0.2) S.anim.push({ type: 'facade', x: bd.x, y: bd.top, w: bd.w, h: bd.h, color: pick(r, ['#3df2ff', '#ff3d9a', '#ffcf3d', '#7d6bff']), ph: r() * 10 });
    S.anim.push({ type: 'blink', x: t1.x + t1.w / 2, y: t1.top - t1.h * 0.12, r: 3 * s, color: '#ff3030', period: 1.4 });
    b.fillStyle = vgrad(b, base, H, [[0, P.water], [1, '#02040c']]); b.fillRect(0, base, W, H - base);
    S.reflect = { y: base, from: base - H * 0.55 };
    for (let i = 0; i < 4; i++) S.anim.push({ type: 'boat', y: base + H * (0.05 + i * 0.06), speed: 0.012 + r() * 0.02, dir: r() < 0.5 ? -1 : 1, x: r(), s: s * (1 + i * 0.25), lit: time !== 'day' });
  }

  else if (name === 'future') {
    b.fillStyle = vgrad(b, 0, H, [[0, '#07021a'], [0.5, '#2a0b4d'], [0.8, '#a8247a'], [1, '#ff6a6a']]); b.fillRect(0, 0, W, H);
    stars();
    // a big planet
    const px = W * 0.78, py = H * 0.24, pr = H * 0.16;
    const pg = b.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr); pg.addColorStop(0, '#ffd6f5'); pg.addColorStop(0.6, '#b25bd6'); pg.addColorStop(1, 'rgba(90,30,140,0)');
    b.fillStyle = pg; b.beginPath(); b.arc(px, py, pr, 0, TAU); b.fill();
    b.strokeStyle = 'rgba(255,200,255,.35)'; b.lineWidth = 2 * s; b.beginPath(); b.ellipse(px, py, pr * 1.7, pr * 0.32, -0.25, 0, TAU); b.stroke();
    const base = H * 0.82;
    const far = skyline(b, r, { W, base, hMin: H * 0.2, hMax: H * 0.5, wMin: 24 * s, wMax: 50 * s, color: '#1a0833', win: ['#ff6bd6', '#6bf3ff'], lit: 0.12, roofs: ['spire', 'flat', 'round'], winSize: s * 0.6, edge: 'rgba(255,107,214,.25)' });
    const near = skyline(b, r, { W, base: H * 1.0, hMin: H * 0.3, hMax: H * 0.75, wMin: 50 * s, wMax: 120 * s, color: '#0b0418', win: ['#6bf3ff', '#ff6bd6', '#fff3b0'], lit: 0.18, roofs: ['spire', 'slant', 'stepped'], gap: 40 * s, winSize: s, edge: 'rgba(107,243,255,.45)' });
    // sky bridges
    b.strokeStyle = 'rgba(107,243,255,.5)'; b.lineWidth = 2 * s;
    for (let i = 0; i < near.length - 1; i++) if (r() < 0.4) { const y = Math.max(near[i].top, near[i + 1].top) + 30 * s + r() * 60 * s; b.beginPath(); b.moveTo(near[i].x + near[i].w, y); b.lineTo(near[i + 1].x, y); b.stroke(); }
    const tallest = near.reduce((a, c) => (c.h > a.h ? c : a), near[0]);
    S.anim.push({ type: 'rings', x: tallest.x + tallest.w / 2, y: tallest.top + tallest.h * 0.25, r: tallest.w * 1.1, s });
    b.fillStyle = vgrad(b, H * 0.86, H, [[0, 'rgba(8,3,20,0)'], [0.35, '#0a0418'], [1, '#05020c']]); b.fillRect(0, H * 0.86, W, H * 0.14);
    b.fillStyle = 'rgba(255,107,214,.35)'; b.fillRect(0, H * 0.905, W, Math.max(1, s));
    for (let i = 0; i < 4; i++) S.anim.push({ type: 'traffic', y: H * (0.3 + i * 0.1), speed: 0.05 + r() * 0.08, n: 6 + Math.floor(r() * 6), color: i % 2 ? '#6bf3ff' : '#ff6bd6', s });
    void far;
  }

  else if (name === 'kyoto') {
    if (P.stars) stars();
    const sunY = H * (time === 'day' ? 0.2 : 0.5);
    if (time !== 'night') { const sg = b.createRadialGradient(W * 0.3, sunY, 0, W * 0.3, sunY, H * 0.3); sg.addColorStop(0, hexA('#fff1d6', 0.9)); sg.addColorStop(0.15, hexA('#ffd9a8', 0.5)); sg.addColorStop(1, hexA('#ffd9a8', 0)); b.fillStyle = sg; b.fillRect(0, 0, W, H); }
    else { b.fillStyle = 'rgba(255,248,230,.9)'; b.beginPath(); b.arc(W * 0.3, H * 0.2, 22 * s, 0, TAU); b.fill(); }
    // misty mountain layers
    const mount = (y, amp, color, seed) => { b.fillStyle = color; b.beginPath(); b.moveTo(0, H); for (let x = 0; x <= W; x += 8) { const k = x / W; b.lineTo(x, y - amp * (0.5 + 0.5 * Math.sin(k * 5 + seed) * Math.sin(k * 2.3 + seed * 2)) - amp * 0.3 * Math.sin(k * 13 + seed)); } b.lineTo(W, H); b.fill(); };
    const mc = time === 'night' ? ['#141a33', '#0f1428', '#0a0e1d'] : time === 'day' ? ['#9fb6cf', '#7d97b3', '#5d7896'] : ['#8a6a8a', '#6a4f72', '#4a3858'];
    mount(H * 0.55, H * 0.14, mc[0], 1); mount(H * 0.62, H * 0.1, mc[1], 3);
    glowBand(H * 0.62, time === 'night' ? '#6a7ab0' : '#ffffff', H * 0.05, 0.25);
    mount(H * 0.68, H * 0.06, mc[2], 5);
    // pagoda
    const px = W * 0.7, pb = H * 0.7, dark = time === 'day' ? '#2a2630' : '#0b0910';
    b.fillStyle = dark;
    for (let i = 0; i < 5; i++) {
      const y = pb - i * 40 * s, w = (90 - i * 12) * s;
      b.fillRect(px - w * 0.32, y - 30 * s, w * 0.64, 30 * s);
      b.beginPath(); b.moveTo(px - w * 0.7, y - 28 * s); b.quadraticCurveTo(px, y - 46 * s, px + w * 0.7, y - 28 * s); b.lineTo(px + w * 0.5, y - 36 * s); b.lineTo(px - w * 0.5, y - 36 * s); b.fill();
    }
    b.fillRect(px - 2 * s, pb - 5 * 40 * s - 40 * s, 4 * s, 44 * s);
    // water and a torii gate standing in it
    const wy = H * 0.74;
    b.fillStyle = vgrad(b, wy, H, [[0, time === 'night' ? '#0b1022' : time === 'day' ? '#6f97bf' : '#5a4060'], [1, time === 'night' ? '#05070f' : '#2a2a40']]); b.fillRect(0, wy, W, H - wy);
    const gx = W * 0.32, gw = 150 * s, gh = 130 * s, gy = wy + 26 * s;
    b.fillStyle = time === 'night' ? '#7a1a1a' : '#c4302b';
    b.fillRect(gx - gw * 0.36, gy - gh, 12 * s, gh); b.fillRect(gx + gw * 0.36 - 12 * s, gy - gh, 12 * s, gh);
    b.beginPath(); b.moveTo(gx - gw * 0.62, gy - gh - 6 * s); b.quadraticCurveTo(gx, gy - gh - 22 * s, gx + gw * 0.62, gy - gh - 6 * s); b.lineTo(gx + gw * 0.58, gy - gh + 8 * s); b.quadraticCurveTo(gx, gy - gh - 6 * s, gx - gw * 0.58, gy - gh + 8 * s); b.fill();
    b.fillRect(gx - gw * 0.48, gy - gh + 22 * s, gw * 0.96, 9 * s);
    S.reflect = { y: wy, from: wy - H * 0.35 };
    // cherry trees and lanterns
    for (let i = 0; i < 7; i++) {
      const tx = r() < 0.5 ? r() * W * 0.22 : W * 0.82 + r() * W * 0.2, ty = H * (0.7 + r() * 0.12), tr = (40 + r() * 50) * s;
      b.fillStyle = dark; b.fillRect(tx - 3 * s, ty, 6 * s, 50 * s);
      for (let k = 0; k < 14; k++) { b.fillStyle = hexA(pick(r, ['#ffb7d0', '#ffc9dc', '#f79ac0', '#ffd6e5']), time === 'night' ? 0.35 : 0.85); b.beginPath(); b.arc(tx + (r() - 0.5) * tr * 1.6, ty - r() * tr * 0.9, tr * (0.25 + r() * 0.25), 0, TAU); b.fill(); }
    }
    for (let i = 0; i < 6; i++) S.anim.push({ type: 'lantern', x: W * (0.08 + i * 0.16), y: H * (0.79 + (i % 2) * 0.03), s, ph: r() * 10, bright: time === 'night' || time === 'dusk' ? 1 : 0.4 });
    S.anim.push({ type: 'petals', n: Math.round(70 * s) });
  }

  else if (name === 'harbor') {
    if (P.stars) stars();
    const base = H * 0.66;
    // the peak behind the city
    b.fillStyle = time === 'day' ? '#5d7f86' : time === 'night' ? '#0b1420' : '#3a3550';
    b.beginPath(); b.moveTo(0, base); for (let x = 0; x <= W; x += 8) { const k = x / W; b.lineTo(x, base - H * (0.18 + 0.12 * Math.sin(k * 3.2 + 0.6) + 0.04 * Math.sin(k * 11))); } b.lineTo(W, base); b.fill();
    glowBand(base - H * 0.03, P.haze, H * 0.1, time === 'day' ? 0.25 : 0.35);
    skyline(b, r, { W, base, hMin: H * 0.12, hMax: H * 0.42, wMin: 22 * s, wMax: 54 * s, color: P.build[1], win: P.win, lit: P.lit, roofs: ['flat', 'spire', 'antenna', 'stepped', 'slant'], winSize: s * 0.7 });
    b.fillStyle = vgrad(b, base, H, [[0, P.water], [1, '#02050c']]); b.fillRect(0, base, W, H - base);
    S.reflect = { y: base, from: base - H * 0.5 };
    for (let i = 0; i < 3; i++) S.anim.push({ type: 'boat', y: base + H * (0.06 + i * 0.08), speed: 0.008 + r() * 0.012, dir: r() < 0.5 ? -1 : 1, x: r(), s: s * (1.2 + i * 0.4), lit: time !== 'day', ferry: true });
    if (time !== 'day') for (let i = 0; i < 5; i++) S.anim.push({ type: 'beam', x: W * (0.15 + i * 0.17), y: base - H * 0.1, len: H * 0.7, s, ph: r() * TAU, color: pick(r, ['#9fd3ff', '#c9a6ff', '#7dffcf', '#ffffff']) });
  }

  else if (name === 'minimal') {
    const cols = light ? ['#c9dcff', '#ffdcc4', '#ded0ff', '#c6efe0'] : ['#1d2f66', '#3a1f5c', '#0f4256', '#4a2147'];
    b.fillStyle = light ? '#eef3f8' : '#070c18'; b.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) S.anim.push({ type: 'blob', x: r(), y: r(), r: 0.35 + r() * 0.3, color: cols[i], sp: 0.01 + r() * 0.015, ph: r() * TAU, light });
    void cols;
  }

  else if (name === 'silk') {
    b.fillStyle = vgrad(b, 0, H, light ? [[0, '#f6f0e6'], [1, '#e9dcc6']] : [[0, '#0a0810'], [1, '#17111c']]); b.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) S.anim.push({ type: 'ribbon', y: H * (0.3 + i * 0.12), amp: H * (0.05 + r() * 0.06), sp: 0.04 + r() * 0.05, ph: r() * TAU, color: light ? pick(r, ['#c9a46a', '#b88c55', '#d9bd8a']) : pick(r, ['#c9a46a', '#8a6a4a', '#e0c08a']), w: (40 + r() * 70) * s, light });
    S.anim.push({ type: 'dust', n: Math.round(90 * s), light });
  }

  // a reflection of the city in water / on the wet street (redrawn with ripples each frame)
  if (S.reflect) {
    const rf = layer(W, Math.max(1, Math.round(H - S.reflect.y)));
    const x = rf.getContext('2d');
    x.translate(0, 0); x.scale(1, -1);
    x.drawImage(bg, 0, S.reflect.from, W, S.reflect.y - S.reflect.from, 0, -(S.reflect.y - S.reflect.from) * 0.95, W, (S.reflect.y - S.reflect.from) * 0.95);
    S.reflectImg = rf;
  }
  // static per-scene randomness for the moving parts
  S.rng = r;
  return S;
}

export class CityScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cfg = { scene: 'tokyo', time: 'night', intensity: 0.7, reduced: false, hq: false, light: false };
    this.running = false; this.raf = 0; this.t0 = performance.now(); this.parts = null;
    this._onVis = () => { if (document.hidden) this.stop(); else this.start(); };
    document.addEventListener('visibilitychange', this._onVis);
    let rt = 0;
    this._onResize = () => { clearTimeout(rt); rt = setTimeout(() => this.rebuild(), 200); };
    addEventListener('resize', this._onResize);
  }

  size() {
    const dpr = Math.min(devicePixelRatio || 1, this.cfg.hq ? 2 : 1.25);
    const w = innerWidth, h = innerHeight;
    // keep big screens affordable: about 2.5 megapixels unless "Høj" quality is chosen
    const cap = this.cfg.hq ? 8.5e6 : 2.6e6;
    const k = Math.min(dpr, Math.sqrt(cap / (w * h)));
    return { W: Math.round(w * k), H: Math.round(h * k) };
  }

  configure(patch) {
    const before = { ...this.cfg };
    Object.assign(this.cfg, patch);
    if (!this.S || ['scene', 'time', 'hq', 'light'].some(k => before[k] !== this.cfg[k])) this.rebuild();
    if (this.cfg.reduced) { this.stop(); this.draw(performance.now(), true); } else this.start();
  }

  rebuild() {
    const { W, H } = this.size();
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.S = buildScene(this.cfg.scene, W, H, this.cfg.time, this.cfg.light);
    this.parts = null;
    this.draw(performance.now(), this.cfg.reduced || !this.running);
  }

  start() {
    if (this.running || this.cfg.reduced || document.hidden || !this.S || this.canvas.hidden) return;
    this.running = true;
    let last = 0;
    const loop = (t) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (t - last < 32) return;          // ~30 fps is plenty for a background
      last = t;
      this.draw(t, false);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  destroy() { this.stop(); document.removeEventListener('visibilitychange', this._onVis); removeEventListener('resize', this._onResize); }

  /** Particles (rain, petals, dust) made once per scene. */
  particles() {
    if (this.parts) return this.parts;
    const { W, H } = this.S, r = mulberry(5), k = 0.4 + this.cfg.intensity;
    this.parts = {};
    for (const a of this.S.anim) {
      if (a.type === 'rain') this.parts.rain = Array.from({ length: Math.round(a.n * k) }, () => ({ x: r() * W, y: r() * H, v: 0.6 + r() * 0.6, l: 10 + r() * 16 }));
      if (a.type === 'petals') this.parts.petals = Array.from({ length: Math.round(a.n * k) }, () => ({ x: r() * W, y: r() * H, v: 0.15 + r() * 0.25, ph: r() * TAU, z: 2 + r() * 4 }));
      if (a.type === 'dust') this.parts.dust = Array.from({ length: Math.round(a.n * k) }, () => ({ x: r() * W, y: r() * H, v: 0.02 + r() * 0.05, ph: r() * TAU, z: 0.6 + r() * 1.8 }));
    }
    return this.parts;
  }

  draw(now, still) {
    const S = this.S; if (!S) return;
    const ctx = this.ctx, { W, H } = S;
    const t = (still ? 12 : (now - this.t0) / 1000);
    const k = this.cfg.intensity;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(S.bg, 0, 0);
    const P = this.particles();
    if (S.reflectImg) {                    // ripples: the reflection drawn in strips that sway
      const ry = S.reflect.y, rh = S.reflectImg.height, strips = Math.min(70, Math.ceil(rh / 4));
      ctx.globalAlpha = 0.32;
      for (let i = 0; i < strips; i++) {
        const y0 = (i / strips) * rh, sh = rh / strips + 1;
        const off = Math.sin(t * 1.4 + i * 0.7) * (0.6 + i * 0.05) * (W / 1600) * 1.6;
        ctx.drawImage(S.reflectImg, 0, y0, W, sh, off, ry + y0, W, sh);
      }
      ctx.globalAlpha = 1;
    }
    for (const a of S.anim) {
      switch (a.type) {
        case 'sign': {
          let al = 0.9;
          if (a.flick) { const f = Math.sin(t * 9 + a.ph) + Math.sin(t * 23 + a.ph * 3); al = f > 1.6 ? 0.25 : 0.95; }
          else al = 0.82 + 0.12 * Math.sin(t * 1.3 + a.ph);
          ctx.globalAlpha = al;
          ctx.drawImage(a.img, a.x, a.y, a.img.width * a.s, a.img.height * a.s);
          // the sign seen in the wet street / the water
          const sh = a.img.height * a.s;
          if (S.reflect && a.y + sh < S.reflect.y) {
            const my = S.reflect.y * 2 - (a.y + sh) + Math.sin(t * 2 + a.ph) * 2;
            ctx.save(); ctx.globalAlpha = al * 0.22; ctx.translate(0, my + sh); ctx.scale(1, -1);
            ctx.drawImage(a.img, a.x, 0, a.img.width * a.s, sh); ctx.restore();
          }
          ctx.globalAlpha = 1; break;
        }
        case 'blink': if ((t % a.period) < a.period * 0.35) { ctx.fillStyle = a.color; ctx.shadowColor = a.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; } break;
        case 'train': {
          const span = W + a.len * 2, x = ((t * a.speed * W) % span) - a.len;
          ctx.fillStyle = '#0a0d1a'; ctx.fillRect(x, a.y, a.len, a.h);
          ctx.fillStyle = a.color;
          for (let wx = x + 6; wx < x + a.len - 8; wx += a.h * 1.1) ctx.fillRect(wx, a.y + a.h * 0.25, a.h * 0.7, a.h * 0.4);
          break;
        }
        case 'facade': { ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 0.8 + a.ph); ctx.fillStyle = a.color; const band = a.h * 0.12, y = a.y + ((t * 0.15 + a.ph) % 1) * (a.h - band); ctx.fillRect(a.x, y, a.w, band); ctx.globalAlpha = 1; break; }
        case 'boat': {
          const x = (((a.x + t * a.speed * a.dir) % 1) + 1) % 1 * (W + 200) - 100, sz = a.s * (a.ferry ? 1.4 : 1);
          ctx.fillStyle = '#05060c'; ctx.beginPath(); ctx.moveTo(x - 22 * sz, a.y); ctx.lineTo(x + 22 * sz, a.y); ctx.lineTo(x + 16 * sz, a.y + 6 * sz); ctx.lineTo(x - 16 * sz, a.y + 6 * sz); ctx.fill();
          ctx.fillRect(x - 10 * sz, a.y - 6 * sz, 20 * sz, 6 * sz);
          if (a.lit) { ctx.fillStyle = '#ffe2a0'; for (let i = -8; i <= 6; i += 4) ctx.fillRect(x + i * sz, a.y - 4 * sz, 2 * sz, 2 * sz); ctx.globalAlpha = 0.25; ctx.fillRect(x - 18 * sz, a.y + 7 * sz, 36 * sz, 1.5 * sz); ctx.globalAlpha = 1; }
          break;
        }
        case 'rings': {
          ctx.save(); ctx.translate(a.x, a.y); ctx.strokeStyle = 'rgba(107,243,255,.55)'; ctx.lineWidth = 1.5 * a.s; ctx.shadowColor = '#6bf3ff'; ctx.shadowBlur = 10;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, i * 26 * a.s, a.r * (1 + i * 0.25), a.r * 0.18 * (1 + 0.3 * Math.sin(t * 0.7 + i)), 0, 0, TAU); ctx.stroke(); }
          ctx.restore(); break;
        }
        case 'traffic': {
          ctx.fillStyle = a.color;
          for (let i = 0; i < a.n; i++) { const x = (((i / a.n + t * a.speed) % 1) + 1) % 1 * (W + 100) - 50, y = a.y + Math.sin(i * 3.1) * 12 * a.s; ctx.globalAlpha = 0.85; ctx.fillRect(x, y, 14 * a.s, 2.5 * a.s); ctx.globalAlpha = 0.25; ctx.fillRect(x - 40 * a.s, y + 0.5 * a.s, 40 * a.s, 1.5 * a.s); }
          ctx.globalAlpha = 1; break;
        }
        case 'lantern': {
          const fl = 0.75 + 0.25 * Math.sin(t * 3 + a.ph) * Math.sin(t * 1.7 + a.ph);
          const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 40 * a.s); g.addColorStop(0, `rgba(255,190,110,${0.55 * fl * a.bright})`); g.addColorStop(1, 'rgba(255,160,80,0)');
          ctx.fillStyle = g; ctx.fillRect(a.x - 40 * a.s, a.y - 40 * a.s, 80 * a.s, 80 * a.s);
          ctx.fillStyle = `rgba(255,${180 + 40 * fl},120,${0.9 * Math.max(0.5, a.bright)})`; ctx.beginPath(); ctx.ellipse(a.x, a.y, 7 * a.s, 10 * a.s, 0, 0, TAU); ctx.fill();
          break;
        }
        case 'beam': {
          const ang = -Math.PI / 2 + Math.sin(t * 0.25 + a.ph) * 0.5;
          ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang + Math.PI / 2);
          const g = ctx.createLinearGradient(0, 0, 0, -a.len); g.addColorStop(0, hexA(a.color, 0.22 * k + 0.05)); g.addColorStop(1, hexA(a.color, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-3 * a.s, 0); ctx.lineTo(-30 * a.s, -a.len); ctx.lineTo(30 * a.s, -a.len); ctx.lineTo(3 * a.s, 0); ctx.fill();
          ctx.restore(); break;
        }
        case 'steam': {
          for (let i = 0; i < 4; i++) { const y = a.y - ((t * 20 + i * 40) % 160) * a.s, al = 0.08 * (1 - ((t * 20 + i * 40) % 160) / 160); const g = ctx.createRadialGradient(a.x, y, 0, a.x, y, 50 * a.s); g.addColorStop(0, `rgba(255,220,255,${al})`); g.addColorStop(1, 'rgba(255,220,255,0)'); ctx.fillStyle = g; ctx.fillRect(a.x - 50 * a.s, y - 50 * a.s, 100 * a.s, 100 * a.s); }
          break;
        }
        case 'blob': {
          const x = (a.x + 0.08 * Math.sin(t * a.sp * 6 + a.ph)) * W, y = (a.y + 0.08 * Math.cos(t * a.sp * 5 + a.ph)) * H, rr = a.r * Math.max(W, H);
          const g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, hexA(a.color, a.light ? 0.9 : 0.85)); g.addColorStop(1, hexA(a.color, 0));
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break;
        }
        case 'ribbon': {
          ctx.save(); ctx.globalAlpha = a.light ? 0.35 : 0.28; ctx.strokeStyle = a.color; ctx.lineWidth = a.w; ctx.lineCap = 'round';
          const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, hexA(a.color, 0)); g.addColorStop(0.5, hexA(a.color, 1)); g.addColorStop(1, hexA(a.color, 0)); ctx.strokeStyle = g;
          ctx.beginPath();
          for (let x = -40; x <= W + 40; x += 24) { const y = a.y + Math.sin(x / W * 4 + t * a.sp * 6 + a.ph) * a.amp + Math.sin(x / W * 9 - t * a.sp * 3) * a.amp * 0.3; x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke(); ctx.restore(); break;
        }
        default: break;
      }
    }
    // particles
    if (P.rain) {
      ctx.strokeStyle = S.anim.find(a => a.type === 'rain').color; ctx.lineWidth = Math.max(1, W / 1600);
      ctx.beginPath();
      for (const p of P.rain) { if (!still) { p.y += p.v * 22 * (W / 1600 + 0.4); p.x -= p.v * 3; if (p.y > H) { p.y = -20; p.x = Math.random() * (W + 100); } } ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + p.l); }
      ctx.stroke();
    }
    if (P.petals) {
      for (const p of P.petals) {
        if (!still) { p.y += p.v * 3; p.x += Math.sin(t + p.ph) * 0.8 + 0.6; if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; } if (p.x > W + 10) p.x = -10; }
        ctx.fillStyle = 'rgba(255,190,215,.85)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.z, p.z * 0.6, t + p.ph, 0, TAU); ctx.fill();
      }
    }
    if (P.dust) {
      ctx.fillStyle = S.anim.find(a => a.type === 'dust').light ? 'rgba(180,140,70,.7)' : 'rgba(255,215,140,.8)';
      for (const p of P.dust) { if (!still) { p.y -= p.v * 3; p.x += Math.sin(t * 0.5 + p.ph) * 0.3; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } } ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t + p.ph)); ctx.fillRect(p.x, p.y, p.z, p.z); }
      ctx.globalAlpha = 1;
    }
  }
}

/** A small still picture of a scene (theme pickers). */
export function paintScene(canvas, name, { time = 'night', light = false } = {}) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(40, Math.round((canvas.clientWidth || 240) * dpr)), h = Math.max(30, Math.round((canvas.clientHeight || 140) * dpr));
  // build at a desktop size and scale down, so the miniature looks like the real thing
  const BW = 960, BH = Math.round(960 * h / w);
  const off = layer(BW, BH);
  const sc = new CityScene.__Painter(off);
  sc.paint(name, BW, BH, time, light);
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(off, 0, 0, w, h);
}
CityScene.__Painter = class {
  constructor(c) { this.c = c; }
  paint(name, W, H, time, light) {
    const S = buildScene(name, W, H, time, light);
    const fake = Object.create(CityScene.prototype);
    fake.S = S; fake.ctx = this.c.getContext('2d'); fake.cfg = { intensity: 0.7 }; fake.parts = null; fake.t0 = 0;
    CityScene.prototype.draw.call(fake, 0, true);
  }
};
