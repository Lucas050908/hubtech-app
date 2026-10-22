/** Snake – arrow keys / WASD, swipe or the buttons on a phone. Gets faster as it grows. Record on the account. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';

const N = 20;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };

export default {
  title: 'Snake',
  destroy() { clearTimeout(this._t); removeEventListener('keydown', this._k); document.removeEventListener('visibilitychange', this._v); },
  async render() {
    const app = appById('snake');
    let store;
    try { store = await appState('snake', { best: 0, games: 0 }); } catch (e) { return loadError('Snake', e); }
    const st = store.data, self = this;
    const cv = h('canvas', { class: 'gm-canvas', width: 600, height: 600, 'aria-label': 'Spillebræt' });
    const ctx = cv.getContext('2d');
    const scoreEl = h('b', null, '0'), bestEl = h('b', null, String(st.best));
    const overlay = h('div', { class: 'gm-overlay' });
    let snake, dir, nextDir, food, score, running = false, over = false;
    const FALLBACK = { '--gm-bg': '#0d1a2b', '--gm-grid': '#11223a', '--gm-head': '#b9f6ca', '--gm-body': '#d36ef0' };
    const css = (v) => (cv.isConnected && getComputedStyle(cv).getPropertyValue(v).trim()) || FALLBACK[v];

    function reset() { snake = [[9, 10], [8, 10], [7, 10]]; dir = nextDir = 'right'; score = 0; scoreEl.textContent = '0'; placeFood(); over = false; draw(); }
    function placeFood() { do { food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; } while (snake.some(([x, y]) => x === food[0] && y === food[1])); }
    function speed() { return Math.max(60, 150 - score * 3); }
    function step() {
      dir = nextDir;
      const [dx, dy] = DIRS[dir];
      const head = [snake[0][0] + dx, snake[0][1] + dy];
      if (head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N || snake.some(([x, y], i) => i < snake.length - 1 && x === head[0] && y === head[1])) return end();
      snake.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) { score++; scoreEl.textContent = String(score); placeFood(); }
      else snake.pop();
      draw();
      self._t = setTimeout(step, speed());
    }
    function end() {
      running = false; over = true;
      st.games = (st.games || 0) + 1;
      if (score > st.best) { st.best = score; bestEl.textContent = String(score); toast('Ny rekord!', { type: 'xp', text: `${score} point i Snake` }); }
      store.save(); draw(); showOverlay('Game over', `${score} point`, 'Spil igen');
    }
    function draw() {
      const c = cv.width / N;
      ctx.fillStyle = css('--gm-bg'); ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = css('--gm-grid');
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) ctx.fillRect(i * c, j * c, c, c);
      ctx.fillStyle = '#ff5f7a';
      ctx.beginPath(); ctx.arc(food[0] * c + c / 2, food[1] * c + c / 2, c * 0.36, 0, Math.PI * 2); ctx.fill();
      snake.forEach(([x, y], i) => {
        ctx.fillStyle = i === 0 ? css('--gm-head') : css('--gm-body');
        const r = c * 0.22, px = x * c + 2, py = y * c + 2, s = c - 4;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, s, s, r) : ctx.rect(px, py, s, s); ctx.fill();
      });
    }
    function showOverlay(title, sub, btn) {
      overlay.replaceChildren(h('b', null, title), sub ? h('span', null, sub) : null, h('button', { class: 'btn btn-primary', onclick: go }, icon('play'), btn));
      overlay.hidden = false;
    }
    function go() { if (over) reset(); overlay.hidden = true; if (!running) { running = true; clearTimeout(self._t); self._t = setTimeout(step, speed()); } cv.focus(); }
    function turn(d) {
      const opp = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (d !== opp[dir]) nextDir = d;
      if (!running && !over && overlay.hidden === false) go();
    }
    this._k = (e) => {
      if (!document.body.contains(cv) || e.target.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key === ' ') { e.preventDefault(); if (!running) go(); return; }
      const d = KEYS[e.key] || KEYS[e.key?.toLowerCase?.()];
      if (d) { e.preventDefault(); turn(d); }
    };
    addEventListener('keydown', this._k);
    this._v = () => { if (document.hidden && running) { running = false; clearTimeout(self._t); showOverlay('Pause', null, 'Fortsæt'); } };
    document.addEventListener('visibilitychange', this._v);
    let t0 = null;
    cv.addEventListener('touchstart', (e) => { t0 = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    cv.addEventListener('touchend', (e) => {
      if (!t0) return;
      const dx = e.changedTouches[0].clientX - t0[0], dy = e.changedTouches[0].clientY - t0[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      t0 = null;
    });
    const pad = h('div', { class: 'gm-pad' }, ['up', 'left', 'down', 'right'].map(d => h('button', { class: `btn gm-pad-${d}`, 'aria-label': { up: 'Op', down: 'Ned', left: 'Venstre', right: 'Højre' }[d], onclick: () => turn(d) }, icon({ up: 'chevronDown', down: 'chevronDown', left: 'chevronLeft', right: 'chevronRight' }[d]))));
    reset(); showOverlay('Snake', 'Spis de røde prikker – undgå kanten og dig selv.', 'Start');
    requestAnimationFrame(() => requestAnimationFrame(draw));     // again once on the page, so the theme's colours are used
    return h('div', { class: 'page gm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Snake', lead: 'Piletasterne eller W A S D – på telefonen swiper du eller bruger knapperne. Slangen bliver hurtigere, jo længere den er.', compact: true }),
      panel(null, null, h('div', { class: 'gm-top' }, h('span', null, 'Point ', scoreEl), h('span', null, 'Rekord ', bestEl)),
        h('div', { class: 'gm-board' }, cv, overlay), pad));
  },
};
