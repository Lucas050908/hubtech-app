/** Canvas games: Minigolf, Flyvefisk, Pong and Asteroider (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';

const page = (id, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow: 'Spilhal', title, lead, compact: true }), ...body);
const board = (game, unit) => { const el = h('div'); api.get(`/api/games/boards/${game}`).then(r => h(clear(el), null, boardTable(r.board || r, { unit }))).catch(() => {}); return { el, reload() { api.get(`/api/games/boards/${game}`).then(r => h(clear(el), null, boardTable(r.board || r, { unit }))).catch(() => {}); } }; };
const overlay = (msg, title, sub, btnLabel, onClick) => { msg.hidden = false; h(clear(msg), null, h('b', null, title), sub ? h('span', null, sub) : null, h('button', { class: 'btn btn-primary btn-lg', onclick: onClick }, icon('play'), btnLabel)); };

// ── Minigolf ──
const HOLES = [
  { par: 2, ball: [80, 300], hole: [520, 300], walls: [] },
  { par: 3, ball: [80, 500], hole: [520, 100], walls: [[250, 150, 30, 400]] },
  { par: 3, ball: [80, 100], hole: [80, 500], walls: [[0, 280, 450, 30]] },
  { par: 3, ball: [300, 520], hole: [300, 80], walls: [[150, 250, 300, 30], [100, 380, 120, 25], [380, 380, 120, 25]] },
  { par: 4, ball: [60, 60], hole: [540, 540], walls: [[120, 0, 25, 450], [240, 150, 25, 450], [360, 0, 25, 450], [480, 150, 25, 300]] },
  { par: 3, ball: [300, 540], hole: [300, 300], walls: [[200, 200, 200, 20], [200, 380, 80, 20], [320, 380, 80, 20], [200, 200, 20, 200], [380, 200, 20, 200]] },
];
export const minigolf = {
  title: 'Minigolf',
  destroy() { cancelAnimationFrame(this._raf); },
  async render() {
    let store;
    try { store = await appState('minigolf', { best: null }); } catch (e) { return loadError('Minigolf', e); }
    const st = store.data, self = this, W = 600, H = 600;
    const canvas = h('canvas', { class: 'mg-canvas', width: W, height: H, 'aria-label': 'Minigolfbane' }), ctx = canvas.getContext('2d'), info = h('div', { class: 'bo-hud' }), msg = h('div', { class: 'bf-msg' });
    let hole = 0, strokes = [], ball, vel, aim = null, sunk = false;
    const start = (i) => { hole = i; const H0 = HOLES[i]; ball = { x: H0.ball[0], y: H0.ball[1] }; vel = { x: 0, y: 0 }; sunk = false; strokes[i] = 0; msg.hidden = true; };
    const toP = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
    canvas.addEventListener('pointerdown', (e) => { if (Math.hypot(vel.x, vel.y) > 0.05 || sunk) return; aim = toP(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (aim) aim = { ...aim, now: toP(e) }; });
    canvas.addEventListener('pointerup', () => { if (!aim?.now) { aim = null; return; } const dx = aim.x - aim.now.x, dy = aim.y - aim.now.y, p = Math.min(1, Math.hypot(dx, dy) / 220); if (p > 0.03) { const a = Math.atan2(dy, dx); vel = { x: Math.cos(a) * p * 16, y: Math.sin(a) * p * 16 }; strokes[hole]++; } aim = null; });
    function step() {
      if (sunk) return;
      const H0 = HOLES[hole];
      for (let k = 0; k < 4; k++) {
        ball.x += vel.x / 4; ball.y += vel.y / 4;
        if (ball.x < 10 || ball.x > W - 10) { vel.x = -vel.x; ball.x = Math.max(10, Math.min(W - 10, ball.x)); }
        if (ball.y < 10 || ball.y > H - 10) { vel.y = -vel.y; ball.y = Math.max(10, Math.min(H - 10, ball.y)); }
        for (const [x, y, w, hh] of H0.walls) if (ball.x + 8 > x && ball.x - 8 < x + w && ball.y + 8 > y && ball.y - 8 < y + hh) {
          const ox = Math.min(ball.x + 8 - x, x + w - (ball.x - 8)), oy = Math.min(ball.y + 8 - y, y + hh - (ball.y - 8));
          if (ox < oy) { vel.x = -vel.x; ball.x += vel.x > 0 ? ox : -ox; } else { vel.y = -vel.y; ball.y += vel.y > 0 ? oy : -oy; }
        }
      }
      vel.x *= 0.982; vel.y *= 0.982; if (Math.hypot(vel.x, vel.y) < 0.08) vel = { x: 0, y: 0 };
      const d = Math.hypot(ball.x - H0.hole[0], ball.y - H0.hole[1]);
      if (d < 14 && Math.hypot(vel.x, vel.y) < 9) { sunk = true; vel = { x: 0, y: 0 };
        const s = strokes[hole], par = H0.par, txt = s === 1 ? 'Hole in one! 🎉' : s < par ? 'Under par!' : s === par ? 'Par' : `${s - par} over par`;
        if (hole < HOLES.length - 1) overlay(msg, txt, `${s} slag på hul ${hole + 1}`, 'Næste hul', () => start(hole + 1));
        else { const total = strokes.reduce((a, b) => a + b, 0), best = !st.best || total < st.best; if (best) { st.best = total; store.save(); } overlay(msg, `Færdig: ${total} slag`, best ? 'Ny rekord!' : `Par er ${HOLES.reduce((a, x) => a + x.par, 0)} – din rekord er ${st.best}`, 'Spil igen', () => { strokes = []; start(0); }); }
      }
    }
    function draw() {
      const H0 = HOLES[hole];
      ctx.fillStyle = '#15803d'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < W; i += 30) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
      ctx.fillStyle = '#78350f'; for (const [x, y, w, hh] of H0.walls) ctx.fillRect(x, y, w, hh);
      ctx.fillStyle = '#052e16'; ctx.beginPath(); ctx.arc(H0.hole[0], H0.hole[1], 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(H0.hole[0], H0.hole[1]); ctx.lineTo(H0.hole[0], H0.hole[1] - 50); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.fillRect(H0.hole[0], H0.hole[1] - 50, 22, 14);
      if (!sunk) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2); ctx.fill(); }
      if (aim?.now) { const dx = aim.x - aim.now.x, dy = aim.y - aim.now.y, p = Math.min(1, Math.hypot(dx, dy) / 220); ctx.strokeStyle = `hsl(${120 - p * 120}, 90%, 60%)`; ctx.lineWidth = 4; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + dx * 0.8, ball.y + dy * 0.8); ctx.stroke(); ctx.setLineDash([]); }
      h(clear(info), null, h('span', null, `Hul ${hole + 1}/${HOLES.length}`), h('b', null, `${strokes[hole] || 0} slag`), h('span', null, `Par ${H0.par}`), h('span', { class: 'faint' }, `I alt ${strokes.reduce((a, b) => a + (b || 0), 0)}`));
    }
    const loop = () => { if (!document.body.contains(canvas)) return; step(); draw(); self._raf = requestAnimationFrame(loop); };
    start(0); this._raf = requestAnimationFrame(loop);
    return page('minigolf', 'Minigolf', 'Seks huller med mure og gange. Træk tilbage fra bolden for at sigte – jo længere, jo hårdere – og slip for at slå.',
      h('div', { class: 'bo-wrap' }, info, h('div', { class: 'bf-stage' }, canvas, msg), h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Træk væk fra bolden og slip. Rekord: ', st.best ? `${st.best} slag` : '–')));
  },
};

// ── Flyvefisk ──
export const flappy = {
  title: 'Flyvefisk',
  destroy() { cancelAnimationFrame(this._raf); document.removeEventListener('keydown', this._k); },
  async render() {
    let store;
    try { store = await appState('flappy', { best: 0 }); } catch (e) { return loadError('Flyvefisk', e); }
    const st = store.data, self = this, W = 400, H = 600, lb = board('flappy', 'point');
    const canvas = h('canvas', { class: 'fl-canvas', width: W, height: H, 'aria-label': 'Flyvefisk' }), ctx = canvas.getContext('2d'), msg = h('div', { class: 'bf-msg' });
    let y, vy, pipes, score, running = false, frame = 0;
    const reset = () => { y = H / 2; vy = 0; pipes = []; score = 0; frame = 0; running = true; msg.hidden = true; };
    const flap = () => { if (!running) return; vy = -7.2; };
    const over = () => { running = false; const best = score > st.best; if (best) { st.best = score; store.save(); } if (score > 0) submitScore('flappy', score); lb.reload(); overlay(msg, 'Plask!', `${score} point${best ? ' – ny rekord!' : ''}`, 'Prøv igen', reset); };
    const step = () => {
      if (!running) return; frame++;
      vy += 0.38; y += vy;
      if (frame % 95 === 1) { const gap = 165 - Math.min(45, score * 2), top = 60 + Math.random() * (H - 220 - gap); pipes.push({ x: W, top, gap, passed: false }); }
      for (const p of pipes) { p.x -= 2.6 + Math.min(1.6, score * 0.05); if (!p.passed && p.x + 60 < 90) { p.passed = true; score++; } if (90 + 16 > p.x && 90 - 16 < p.x + 60 && (y - 14 < p.top || y + 14 > p.top + p.gap)) return over(); }
      pipes = pipes.filter(p => p.x > -70);
      if (y > H - 30 || y < 0) over();
    };
    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0ea5e9'); g.addColorStop(1, '#0c4a6e'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.15)'; for (let i = 0; i < 12; i++) { const bx = (i * 73 + frame * 0.5) % W, by = (i * 151 + frame * 1.2) % H; ctx.beginPath(); ctx.arc(W - bx, H - by, 3 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#16a34a'; for (const p of pipes || []) { ctx.fillRect(p.x, 0, 60, p.top); ctx.fillRect(p.x, p.top + p.gap, 60, H - p.top - p.gap); ctx.fillStyle = '#15803d'; ctx.fillRect(p.x - 4, p.top - 18, 68, 18); ctx.fillRect(p.x - 4, p.top + p.gap, 68, 18); ctx.fillStyle = '#16a34a'; }
      ctx.fillStyle = '#d97706'; ctx.fillRect(0, H - 30, W, 30);
      ctx.save(); ctx.translate(90, y ?? H / 2); ctx.rotate(Math.max(-0.5, Math.min(0.8, (vy || 0) / 12)));
      ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-30, -10); ctx.lineTo(-30, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, -4, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(10, -4, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '800 44px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(score ?? 0), W / 2, 70);
    };
    const loop = () => { if (!document.body.contains(canvas)) return; step(); draw(); self._raf = requestAnimationFrame(loop); };
    canvas.addEventListener('pointerdown', flap);
    document.removeEventListener('keydown', this._k); this._k = (e) => { if (!document.body.contains(canvas)) return; if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); flap(); } }; document.addEventListener('keydown', this._k);
    score = 0; overlay(msg, 'Flyvefisk', `Rekord: ${st.best}`, 'Start', reset); this._raf = requestAnimationFrame(loop);
    return page('flappy', 'Flyvefisk', 'Tryk (eller mellemrum) for at svømme op, og styr fisken gennem hullerne i tangen. Hvor langt når du?', h('div', { class: 'bo-wrap' }, h('div', { class: 'bf-stage' }, canvas, msg)), panel('Topliste', 'award', lb.el));
  },
};

// ── Pong ──
export const pong = {
  title: 'Pong',
  destroy() { cancelAnimationFrame(this._raf); document.removeEventListener('keydown', this._kd); document.removeEventListener('keyup', this._ku); },
  async render() {
    let store;
    try { store = await appState('pong', { level: 'normal', wins: 0, played: 0 }); } catch (e) { return loadError('Pong', e); }
    const st = store.data, self = this, W = 700, H = 440;
    const canvas = h('canvas', { class: 'po-canvas', width: W, height: H, 'aria-label': 'Pong' }), ctx = canvas.getContext('2d'), msg = h('div', { class: 'bf-msg' });
    const SPEED = { easy: 3.2, normal: 4.6, hard: 6.4 }, keys = {};
    let p1, p2, ball, s1, s2, running = false, two = false;
    const serve = (dir) => { ball = { x: W / 2, y: H / 2, vx: 5 * dir, vy: (Math.random() - 0.5) * 6 }; };
    const reset = (twoP) => { two = twoP; p1 = H / 2 - 40; p2 = H / 2 - 40; s1 = 0; s2 = 0; running = true; msg.hidden = true; serve(Math.random() < 0.5 ? 1 : -1); };
    const step = () => {
      if (!running) return;
      if (keys.w || keys.W || (!two && keys.ArrowUp)) p1 -= 7; if (keys.s || keys.S || (!two && keys.ArrowDown)) p1 += 7;
      if (two) { if (keys.ArrowUp) p2 -= 7; if (keys.ArrowDown) p2 += 7; } else { const target = ball.vx > 0 ? ball.y - 40 + Math.sin(Date.now() / 300) * 18 : H / 2 - 40; p2 += Math.max(-SPEED[st.level], Math.min(SPEED[st.level], target - p2)); }
      p1 = Math.max(0, Math.min(H - 80, p1)); p2 = Math.max(0, Math.min(H - 80, p2));
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.y < 8 || ball.y > H - 8) { ball.vy = -ball.vy; ball.y = Math.max(8, Math.min(H - 8, ball.y)); }
      const hit = (px, py) => ball.y > py - 6 && ball.y < py + 86 && Math.abs(ball.x - px) < 14;
      if (ball.vx < 0 && hit(28, p1)) { ball.vx = Math.min(13, -ball.vx * 1.06); ball.vy = ((ball.y - (p1 + 40)) / 40) * 7; }
      if (ball.vx > 0 && hit(W - 28, p2)) { ball.vx = -Math.min(13, ball.vx * 1.06); ball.vy = ((ball.y - (p2 + 40)) / 40) * 7; }
      if (ball.x < -20) { s2++; serve(1); } if (ball.x > W + 20) { s1++; serve(-1); }
      if (s1 >= 7 || s2 >= 7) { running = false; if (!two) { st.played++; if (s1 > s2) st.wins++; store.save(); } overlay(msg, two ? (s1 > s2 ? 'Venstre vinder!' : 'Højre vinder!') : s1 > s2 ? 'Du vandt! 🎉' : 'Computeren vandt', `${s1} – ${s2}`, 'Spil igen', () => reset(two)); }
    };
    const draw = () => {
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.setLineDash([10, 12]); ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(20, p1 ?? H / 2 - 40, 12, 80); ctx.fillRect(W - 32, p2 ?? H / 2 - 40, 12, 80);
      if (ball) { ctx.beginPath(); ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2); ctx.fill(); }
      ctx.font = '800 48px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillText(String(s1 ?? 0), W / 2 - 60, 60); ctx.fillText(String(s2 ?? 0), W / 2 + 60, 60);
    };
    const loop = () => { if (!document.body.contains(canvas)) return; step(); draw(); self._raf = requestAnimationFrame(loop); };
    canvas.addEventListener('pointermove', (e) => { if (!running) return; const r = canvas.getBoundingClientRect(), y = (e.clientY - r.top) * H / r.height; p1 = y - 40; });
    document.removeEventListener('keydown', this._kd); document.removeEventListener('keyup', this._ku);
    this._kd = (e) => { if (!document.body.contains(canvas)) return; if (['ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault(); keys[e.key] = true; }; this._ku = (e) => { keys[e.key] = false; };
    document.addEventListener('keydown', this._kd); document.addEventListener('keyup', this._ku);
    msg.hidden = false; h(msg, null, h('b', null, 'Pong'), segmented([{ value: 'easy', label: 'Let' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Svær' }], st.level, (v) => { st.level = v; store.save(); }, { label: 'Computerens niveau' }),
      h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => reset(false) }, icon('play'), 'Mod computeren'), h('button', { class: 'btn btn-lg', onclick: () => reset(true) }, icon('users'), 'To spillere')));
    this._raf = requestAnimationFrame(loop);
    return page('pong', 'Pong', 'Det allerførste computerspil: hold bolden i spil med pladen. Mod computeren (styr med musen eller piletaster) eller to ved samme tastatur (W/S og ↑/↓). Først til 7.',
      h('div', { class: 'bo-wrap' }, h('div', { class: 'bf-stage' }, canvas, msg), h('p', { class: 'faint', style: { fontSize: '13px' } }, `Du har vundet ${st.wins} af ${st.played} kampe mod computeren.`)));
  },
};

// ── Asteroider ──
export const asteroids = {
  title: 'Asteroider',
  destroy() { cancelAnimationFrame(this._raf); document.removeEventListener('keydown', this._kd); document.removeEventListener('keyup', this._ku); },
  async render() {
    let store;
    try { store = await appState('asteroids', { best: 0 }); } catch (e) { return loadError('Asteroider', e); }
    const st = store.data, self = this, W = 720, H = 520, lb = board('asteroids', 'point'), keys = {};
    const canvas = h('canvas', { class: 'po-canvas', width: W, height: H, 'aria-label': 'Asteroider' }), ctx = canvas.getContext('2d'), msg = h('div', { class: 'bf-msg' });
    let ship, rocks, shots, score, lives, level, running = false, cool = 0, inv = 0;
    const rock = (x, y, r) => { const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2 + level * 0.15; return { x, y, r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, pts: Array.from({ length: 10 }, () => 0.75 + Math.random() * 0.35) }; };
    const wave = () => { rocks = []; for (let i = 0; i < 3 + level; i++) { let x, y; do { x = Math.random() * W; y = Math.random() * H; } while (Math.hypot(x - W / 2, y - H / 2) < 150); rocks.push(rock(x, y, 46)); } };
    const reset = () => { ship = { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0 }; shots = []; score = 0; lives = 3; level = 1; inv = 120; running = true; msg.hidden = true; wave(); };
    const wrap = (o) => { o.x = (o.x + W) % W; o.y = (o.y + H) % H; };
    const step = () => {
      if (!running) return;
      if (keys.ArrowLeft) ship.a -= 0.075; if (keys.ArrowRight) ship.a += 0.075;
      if (keys.ArrowUp) { ship.vx += Math.cos(ship.a) * 0.16; ship.vy += Math.sin(ship.a) * 0.16; }
      ship.vx *= 0.99; ship.vy *= 0.99; ship.x += ship.vx; ship.y += ship.vy; wrap(ship);
      if (cool > 0) cool--; if (inv > 0) inv--;
      if (keys[' '] && cool === 0 && shots.length < 6) { shots.push({ x: ship.x + Math.cos(ship.a) * 16, y: ship.y + Math.sin(ship.a) * 16, vx: Math.cos(ship.a) * 8 + ship.vx, vy: Math.sin(ship.a) * 8 + ship.vy, life: 60 }); cool = 9; }
      for (const s of shots) { s.x += s.vx; s.y += s.vy; wrap(s); s.life--; } shots = shots.filter(s => s.life > 0);
      for (const r of rocks) { r.x += r.vx; r.y += r.vy; wrap(r); }
      for (const s of shots) for (const r of rocks) if (!r.dead && Math.hypot(s.x - r.x, s.y - r.y) < r.r) { r.dead = true; s.life = 0; score += r.r > 40 ? 20 : r.r > 20 ? 50 : 100; if (r.r > 15) rocks.push(rock(r.x, r.y, r.r / 2), rock(r.x, r.y, r.r / 2)); }
      rocks = rocks.filter(r => !r.dead);
      if (!inv && rocks.some(r => Math.hypot(r.x - ship.x, r.y - ship.y) < r.r + 10)) { lives--; if (lives <= 0) { running = false; const best = score > st.best; if (best) { st.best = score; store.save(); } if (score) submitScore('asteroids', score); lb.reload(); overlay(msg, 'Rumskibet er ramt!', `${score} point${best ? ' – ny rekord!' : ''}`, 'Spil igen', reset); return; } ship = { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0 }; inv = 150; }
      if (!rocks.length) { level++; wave(); inv = 90; }
    };
    const draw = () => {
      ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 60; i++) ctx.fillRect((i * 97) % W, (i * 53) % H, 1.5, 1.5);
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
      for (const r of rocks || []) { ctx.beginPath(); r.pts.forEach((k, i) => { const a = i / r.pts.length * Math.PI * 2, x = r.x + Math.cos(a) * r.r * k, y = r.y + Math.sin(a) * r.r * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); }
      ctx.fillStyle = '#fde047'; for (const s of shots || []) ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
      if (ship && (!inv || Math.floor(inv / 6) % 2)) { ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.a); ctx.strokeStyle = '#38bdf8'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-11, -10); ctx.lineTo(-6, 0); ctx.lineTo(-11, 10); ctx.closePath(); ctx.stroke(); if (keys.ArrowUp && running) { ctx.strokeStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-18 - Math.random() * 6, 0); ctx.lineTo(-8, 5); ctx.stroke(); } ctx.restore(); }
      ctx.fillStyle = '#fff'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${score ?? 0} point · bølge ${level ?? 1} · ${'▲'.repeat(Math.max(0, lives ?? 3))}`, 14, 26);
    };
    const loop = () => { if (!document.body.contains(canvas)) return; step(); draw(); self._raf = requestAnimationFrame(loop); };
    document.removeEventListener('keydown', this._kd); document.removeEventListener('keyup', this._ku);
    this._kd = (e) => { if (!document.body.contains(canvas)) return; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); keys[e.key] = true; }; this._ku = (e) => { keys[e.key] = false; };
    document.addEventListener('keydown', this._kd); document.addEventListener('keyup', this._ku);
    const pad = h('div', { class: 'bf-pad' }, [['ArrowLeft', '⟲'], ['ArrowUp', '▲'], ['ArrowRight', '⟳'], [' ', 'Skyd']].map(([k, l]) => h('button', { class: 'bf-key', onpointerdown: () => { keys[k] = true; }, onpointerup: () => { keys[k] = false; }, onpointerleave: () => { keys[k] = false; } }, l)));
    level = 1; overlay(msg, 'Asteroider', `Rekord: ${st.best}`, 'Start', reset); this._raf = requestAnimationFrame(loop);
    return page('asteroids', 'Asteroider', 'Styr rumskibet gennem asteroidebæltet og skyd stenene i stykker. ← → drej, ↑ fart, mellemrum skyd.', h('div', { class: 'bo-wrap' }, h('div', { class: 'bf-stage' }, canvas, msg)), pad, panel('Topliste', 'award', lb.el));
  },
};
