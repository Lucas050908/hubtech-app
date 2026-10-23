/** Murbrækker – bounce the ball with the paddle and break all the bricks. Mouse, touch or arrow keys. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';

const W = 480, H = 600, ROWS_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#a78bfa'];
/** level layouts: each string a row, # = brick, 2 = hard brick (two hits), . = empty */
const LEVELS = [
  ['##########', '##########', '##########', '##########'],
  ['#.#.#.#.#.', '.#.#.#.#.#', '##########', '2222222222', '##########'],
  ['....##....', '...####...', '..######..', '.###22###.', '##########', '2..2..2..2'],
  ['2########2', '#22####22#', '##########', '#.#.##.#.#', '2222222222', '##########'],
  ['##.####.##', '##.#22#.##', '##.####.##', '..........', '2222222222', '##########', '##########'],
];

export default {
  title: 'Murbrækker',
  destroy() { cancelAnimationFrame(this._raf); document.removeEventListener('keydown', this._kd); document.removeEventListener('keyup', this._ku); },
  async render() {
    const app = appById('breakout');
    let store;
    try { store = await appState('breakout', { best: 0 }); } catch (e) { return loadError('Murbrækker', e); }
    const st = store.data, self = this;
    const canvas = h('canvas', { class: 'bo-canvas', width: W, height: H, 'aria-label': 'Murbrækker' });
    const ctx = canvas.getContext('2d'), msg = h('div', { class: 'bf-msg' }), hud = h('div', { class: 'bo-hud' });
    let bricks, ball, paddle, lives, score, level, running = false, stuck = true, keys = {}, last = 0;
    const lb = h('div');
    const loadBoard = () => api.get('/api/games/boards/breakout').then(r => h(clear(lb), null, boardTable(r.board || r, { unit: 'point' }))).catch(() => {});
    function buildLevel() {
      const L = LEVELS[(level - 1) % LEVELS.length], bw = W / 10, bh = 22; bricks = [];
      L.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') bricks.push({ x: c * bw + 2, y: 60 + r * (bh + 4), w: bw - 4, h: bh, hp: ch === '2' ? 2 : 1, color: ROWS_COLORS[r % ROWS_COLORS.length] }); }));
      resetBall();
    }
    function resetBall() { paddle = { x: W / 2 - 45, w: 90, y: H - 30 }; ball = { x: W / 2, y: H - 44, vx: 0, vy: 0, r: 7 }; stuck = true; }
    function launch() { if (!stuck) return; const sp = 5.2 + level * 0.35; const a = (-Math.PI / 2) + (Math.random() - 0.5) * 0.8; ball.vx = Math.cos(a) * sp; ball.vy = Math.sin(a) * sp; stuck = false; }
    function start() { lives = 3; score = 0; level = 1; running = true; msg.hidden = true; buildLevel(); }
    function end(won) {
      running = false; const best = score > (st.best || 0); if (best) st.best = score; store.save(); if (score > 0) submitScore('breakout', score);
      msg.hidden = false; h(clear(msg), null, h('b', null, won ? 'Du klarede alle baner! 🎉' : 'Spillet er slut'), h('span', null, `${score} point${best ? ' – ny rekord!' : ''}`), h('button', { class: 'btn btn-primary', onclick: start }, icon('refresh'), 'Spil igen'));
      loadBoard();
    }
    function step(dt) {
      const sp = 8 * dt;
      if (keys.ArrowLeft) paddle.x -= sp; if (keys.ArrowRight) paddle.x += sp;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
      if (stuck) { ball.x = paddle.x + paddle.w / 2; ball.y = paddle.y - ball.r - 1; return; }
      const n = Math.ceil(Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * dt / 4);
      for (let k = 0; k < n; k++) {
        ball.x += ball.vx * dt / n; ball.y += ball.vy * dt / n;
        if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
        if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
        if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
        if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + 12 && ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
          const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), speed = Math.hypot(ball.vx, ball.vy) * 1.01, a = -Math.PI / 2 + hit * 1.05;
          ball.vx = Math.cos(a) * speed; ball.vy = Math.sin(a) * speed; ball.y = paddle.y - ball.r;
        }
        for (const b of bricks) {
          if (b.hp <= 0) continue;
          if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w && ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
            const ox = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r)), oy = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
            if (ox < oy) ball.vx = -ball.vx; else ball.vy = -ball.vy;
            b.hp--; score += b.hp ? 5 : 10 * level;
            break;
          }
        }
        if (ball.y > H + 20) { lives--; if (lives <= 0) return end(false); resetBall(); return; }
      }
      if (bricks.every(b => b.hp <= 0)) { score += 100 * level; level++; if (level > LEVELS.length * 2) return end(true); buildLevel(); }
    }
    function draw() {
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H);
      for (const b of bricks || []) if (b.hp > 0) { ctx.fillStyle = b.color; ctx.globalAlpha = b.hp === 2 ? 1 : 0.85; ctx.fillRect(b.x, b.y, b.w, b.h); if (b.hp === 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4); } ctx.globalAlpha = 1; }
      if (paddle) { ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(paddle.x, paddle.y, paddle.w, 12, 6) : ctx.rect(paddle.x, paddle.y, paddle.w, 12); ctx.fill(); }
      if (ball) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill(); }
      if (running && stuck) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '600 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Klik eller tryk mellemrum for at skyde', W / 2, H / 2 + 60); }
      h(clear(hud), null, h('span', null, '❤️'.repeat(Math.max(0, lives || 0))), h('b', null, `${score || 0} point`), h('span', null, `Bane ${level || 1}`));
    }
    function loop(t) { if (!document.body.contains(canvas)) return; const dt = Math.min(2.5, (t - (last || t)) / 16.67); last = t; if (running) step(dt); draw(); self._raf = requestAnimationFrame(loop); }
    const toX = (e) => { const r = canvas.getBoundingClientRect(); return (e.clientX - r.left) * (W / r.width); };
    canvas.addEventListener('pointermove', (e) => { if (paddle) paddle.x = Math.max(0, Math.min(W - paddle.w, toX(e) - paddle.w / 2)); });
    canvas.addEventListener('pointerdown', (e) => { if (paddle) paddle.x = Math.max(0, Math.min(W - paddle.w, toX(e) - paddle.w / 2)); if (running) launch(); });
    document.removeEventListener('keydown', this._kd); document.removeEventListener('keyup', this._ku);
    this._kd = (e) => { if (!document.body.contains(canvas)) return; if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); keys[e.key] = true; if (e.key === ' ' && running) launch(); };
    this._ku = (e) => { keys[e.key] = false; };
    document.addEventListener('keydown', this._kd); document.addEventListener('keyup', this._ku);
    h(msg, null, h('b', null, 'Murbrækker'), h('span', null, `Rekord: ${st.best || 0}`), h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('play'), 'Start'));
    level = 1; buildLevel(); lives = 3; score = 0;
    this._raf = requestAnimationFrame(loop); loadBoard();
    return h('div', { class: 'page bo-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Murbrækker', lead: 'Hold bolden i luften med pladen og knus alle klodserne. Ti baner, der bliver sværere og sværere.', compact: true }),
      h('div', { class: 'bo-wrap' }, hud, h('div', { class: 'bf-stage' }, canvas, msg)), panel('Topliste', 'award', lb));
  },
};
