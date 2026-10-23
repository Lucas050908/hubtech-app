/** Blokfald – the falling blocks game: turn and drop the pieces, fill whole lines. Keyboard and touch. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';
import * as B from '../features/arcade2.js';

const CELL = 28;

export default {
  title: 'Blokfald',
  destroy() { cancelAnimationFrame(this._raf); document.removeEventListener('keydown', this._key); },
  async render() {
    const app = appById('blocks');
    let store;
    try { store = await appState('blocks', { best: 0, played: 0 }); } catch (e) { return loadError('Blokfald', e); }
    const st = store.data, self = this;
    const canvas = h('canvas', { class: 'bf-canvas', width: B.W * CELL, height: B.H * CELL, 'aria-label': 'Spillepladen' });
    const nextC = h('canvas', { class: 'bf-next', width: 4 * 20, height: 4 * 20, 'aria-label': 'Næste brik' });
    const holdC = h('canvas', { class: 'bf-next', width: 4 * 20, height: 4 * 20, 'aria-label': 'Gemt brik' });
    const scoreEl = h('b'), linesEl = h('b'), levelEl = h('b'), msg = h('div', { class: 'bf-msg' });
    const ctx = canvas.getContext('2d');
    let board, piece, queue, hold, canHold, score, lines, level, last, acc, over, paused = true, started = false;

    const fill = (c, x, y, s, color, ghost) => { c.fillStyle = color; c.globalAlpha = ghost ? 0.22 : 1; c.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); if (!ghost) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x * s + 1, y * s + 1, s - 2, 4); } c.globalAlpha = 1; };
    const mini = (c, type) => { c.clearRect(0, 0, 80, 80); if (!type) return; const cs = B.cells({ type, rot: 0, x: 0, y: 0 }); const mx = Math.min(...cs.map(p => p[0])), my = Math.min(...cs.map(p => p[1])); cs.forEach(([x, y]) => fill(c, x - mx + 0.5 + (type === 'O' ? 0.5 : 0), y - my + 1, 20, B.COLORS[type])); };
    const take = () => { if (queue.length < 7) queue.push(...B.bag()); return queue.shift(); };
    function reset() { board = B.emptyBoard(); queue = [...B.bag(), ...B.bag()]; piece = B.spawn(take()); hold = null; canHold = true; score = 0; lines = 0; level = 1; acc = 0; over = false; paused = false; started = true; last = performance.now(); msg.textContent = ''; msg.hidden = true; }
    const speed = () => Math.max(60, 800 - (level - 1) * 70);
    function lockPiece() {
      const r = B.lock(board, piece);
      board = r.board; lines += r.lines; score += B.LINE_POINTS[r.lines] * level; level = 1 + Math.floor(lines / 10);
      piece = B.spawn(take()); canHold = true;
      if (B.collides(board, piece)) gameOver();
    }
    function gameOver() {
      over = true; paused = true; st.played++;
      const best = score > (st.best || 0); if (best) st.best = score; store.save();
      if (score > 0) submitScore('blocks', score);
      msg.hidden = false; h(clear(msg), null, h('b', null, 'Spillet er slut'), h('span', null, `${score} point${best ? ' – ny rekord!' : ''}`), h('button', { class: 'btn btn-primary', onclick: () => { reset(); } }, icon('refresh'), 'Spil igen'));
      loadBoard();
    }
    const act = {
      left: () => { const q = { ...piece, x: piece.x - 1 }; if (!B.collides(board, q)) piece = q; },
      right: () => { const q = { ...piece, x: piece.x + 1 }; if (!B.collides(board, q)) piece = q; },
      rotate: () => { piece = B.rotate(board, piece); },
      down: () => { const q = { ...piece, y: piece.y + 1 }; if (!B.collides(board, q)) { piece = q; score += 1; } else lockPiece(); acc = 0; },
      drop: () => { const d = B.dropDistance(board, piece); piece = { ...piece, y: piece.y + d }; score += d * 2; lockPiece(); acc = 0; },
      hold: () => { if (!canHold) return; const t = piece.type; piece = B.spawn(hold || take()); hold = t; canHold = false; },
      pause: () => { if (over || !started) return; paused = !paused; msg.hidden = !paused; if (paused) h(clear(msg), null, h('b', null, 'Pause'), h('button', { class: 'btn btn-primary', onclick: () => act.pause() }, icon('play'), 'Fortsæt')); last = performance.now(); },
    };
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop', c: 'hold', C: 'hold', p: 'pause', P: 'pause', Escape: 'pause', x: 'rotate', X: 'rotate' };
    document.removeEventListener('keydown', this._key);
    this._key = (e) => { if (!document.body.contains(canvas) || e.target.closest?.('input, textarea')) return; const a = keys[e.key]; if (!a) return; e.preventDefault(); if (paused && a !== 'pause') return; act[a](); };
    document.addEventListener('keydown', this._key);
    function draw() {
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,.04)'; for (let x = 1; x < B.W; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke(); }
      board.forEach((row, y) => row.forEach((t, x) => { if (t) fill(ctx, x, y, CELL, B.COLORS[t]); }));
      if (!over) { const d = B.dropDistance(board, piece); B.cells({ ...piece, y: piece.y + d }).forEach(([x, y]) => y >= 0 && fill(ctx, x, y, CELL, B.COLORS[piece.type], true)); B.cells(piece).forEach(([x, y]) => y >= 0 && fill(ctx, x, y, CELL, B.COLORS[piece.type])); }
      mini(nextC.getContext('2d'), queue[0]); mini(holdC.getContext('2d'), hold);
      scoreEl.textContent = String(score); linesEl.textContent = String(lines); levelEl.textContent = String(level);
    }
    function loop(t) {
      if (!document.body.contains(canvas)) return;
      if (!paused && !over) { acc += t - last; if (acc > speed()) { act.down(); score -= 1; acc = 0; } }
      last = t; draw();
      self._raf = requestAnimationFrame(loop);
    }
    // touch: swipe left/right/down, tap = rotate
    let tx = null, ty = null, moved = false;
    canvas.addEventListener('pointerdown', (e) => { tx = e.clientX; ty = e.clientY; moved = false; });
    canvas.addEventListener('pointermove', (e) => { if (tx == null || paused) return; const dx = e.clientX - tx, dy = e.clientY - ty; if (Math.abs(dx) > 24) { act[dx > 0 ? 'right' : 'left'](); tx = e.clientX; moved = true; } else if (dy > 30) { act.down(); ty = e.clientY; moved = true; } });
    canvas.addEventListener('pointerup', (e) => { if (!moved && !paused) { if (e.clientY - ty < -40) act.drop(); else act.rotate(); } tx = null; });
    const pad = h('div', { class: 'bf-pad' }, [['left', '◀'], ['rotate', '⟳'], ['right', '▶'], ['hold', 'Gem'], ['down', '▼'], ['drop', '⤓']].map(([a, l]) => h('button', { class: 'bf-key', 'aria-label': { left: 'Venstre', right: 'Højre', rotate: 'Drej', down: 'Ned', drop: 'Slip', hold: 'Gem brik' }[a], onclick: () => { if (!paused) act[a](); } }, l)));
    const lb = h('div');
    const loadBoard = () => api.get('/api/games/boards/blocks').then(r => h(clear(lb), null, boardTable(r.board || r, { unit: 'point' }))).catch(() => {});
    board = B.emptyBoard(); queue = B.bag(); piece = B.spawn(queue[0]); score = 0; lines = 0; level = 1; hold = null; over = false;
    msg.hidden = false; h(msg, null, h('b', null, 'Blokfald'), h('span', null, `Rekord: ${st.best || 0}`), h('button', { class: 'btn btn-primary btn-lg', onclick: () => reset() }, icon('play'), 'Start'));
    last = performance.now(); this._raf = requestAnimationFrame(loop); loadBoard();
    return h('div', { class: 'page bf-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Blokfald', lead: 'Drej og slip brikkerne, og fyld hele rækker. Det går hurtigere og hurtigere – hvor langt når du?', compact: true }),
      h('div', { class: 'bf-wrap' },
        h('div', { class: 'bf-side' }, h('span', { class: 'field-label' }, 'Gemt (C)'), holdC, h('div', { class: 'bf-stat' }, h('small', null, 'Point'), scoreEl), h('div', { class: 'bf-stat' }, h('small', null, 'Rækker'), linesEl), h('div', { class: 'bf-stat' }, h('small', null, 'Niveau'), levelEl)),
        h('div', { class: 'bf-stage' }, canvas, msg),
        h('div', { class: 'bf-side' }, h('span', { class: 'field-label' }, 'Næste'), nextC, h('div', { class: 'faint bf-help' }, '← → flyt · ↑ drej · ↓ ned · mellemrum slip · C gem · P pause'))),
      pad, panel('Topliste', 'award', lb));
  },
};
