/** 2048 – slide the tiles (arrow keys or swipe); equal tiles merge. The game in progress and the record are kept on the account. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };

/** Slide one row to the left; returns [newRow, points]. */
function slideRow(row) {
  const xs = row.filter(Boolean), out = [];
  let pts = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] === xs[i + 1]) { out.push(xs[i] * 2); pts += xs[i] * 2; i++; } else out.push(xs[i]);
  }
  while (out.length < 4) out.push(0);
  return [out, pts];
}
export function move(grid, dir) {
  const g = grid.map(r => [...r]);
  const get = (i, j) => (dir === 'left' ? g[i][j] : dir === 'right' ? g[i][3 - j] : dir === 'up' ? g[j][i] : g[3 - j][i]);
  const set = (i, j, v) => { if (dir === 'left') g[i][j] = v; else if (dir === 'right') g[i][3 - j] = v; else if (dir === 'up') g[j][i] = v; else g[3 - j][i] = v; };
  let pts = 0, moved = false;
  for (let i = 0; i < 4; i++) {
    const row = [0, 1, 2, 3].map(j => get(i, j));
    const [nr, p] = slideRow(row);
    pts += p;
    nr.forEach((v, j) => { if (v !== row[j]) moved = true; set(i, j, v); });
  }
  return { grid: g, pts, moved };
}
const canMove = (g) => ['left', 'right', 'up', 'down'].some(d => move(g, d).moved);
function addTile(g) {
  const free = [];
  g.forEach((r, i) => r.forEach((v, j) => { if (!v) free.push([i, j]); }));
  if (!free.length) return g;
  const [i, j] = free[Math.floor(Math.random() * free.length)];
  g[i][j] = Math.random() < 0.9 ? 2 : 4;
  return g;
}
const fresh = () => addTile(addTile([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));

export default {
  title: '2048',
  destroy() { removeEventListener('keydown', this._k); },
  async render() {
    const app = appById('game2048');
    let store;
    try { store = await appState('game2048', { best: 0, grid: null, score: 0, won: false }); } catch (e) { return loadError('2048', e); }
    const st = store.data;
    if (!st.grid) { st.grid = fresh(); st.score = 0; }
    const board = h('div', { class: 'g2-board', role: 'grid', 'aria-label': '2048-bræt' });
    const scoreEl = h('b'), bestEl = h('b');
    const msg = h('div', { class: 'gm-overlay', hidden: true });

    function draw() {
      clear(board);
      st.grid.forEach(r => r.forEach(v => board.append(h('div', { class: ['g2-cell', v && `v${Math.min(v, 4096)}`], role: 'gridcell' }, v ? String(v) : ''))));
      scoreEl.textContent = String(st.score); bestEl.textContent = String(st.best);
    }
    function act(dir) {
      if (!msg.hidden) return;
      const r = move(st.grid, dir);
      if (!r.moved) return;
      st.grid = addTile(r.grid); st.score += r.pts;
      if (st.score > st.best) st.best = st.score;
      store.save(); draw();
      if (!st.won && st.grid.some(row => row.includes(2048))) {
        st.won = true; store.save();
        toast('2048!', { type: 'xp', text: 'Du klarede det – fortsæt, hvis du kan.' });
      }
      if (!canMove(st.grid)) {
        msg.replaceChildren(h('b', null, 'Ingen flere træk'), h('span', null, `${st.score} point`), h('button', { class: 'btn btn-primary', onclick: newGame }, icon('refresh'), 'Nyt spil'));
        msg.hidden = false;
      }
    }
    async function newGame() {
      if (msg.hidden && st.score > 0 && !await confirmDialog({ title: 'Start forfra?', text: 'Det igangværende spil forsvinder.', confirmLabel: 'Nyt spil' })) return;
      st.grid = fresh(); st.score = 0; st.won = false; msg.hidden = true; store.save(); draw();
    }
    this._k = (e) => {
      if (!document.body.contains(board) || e.target.closest?.('input, textarea, [contenteditable]')) return;
      const d = KEYS[e.key] || KEYS[e.key?.toLowerCase?.()];
      if (d) { e.preventDefault(); act(d); }
    };
    addEventListener('keydown', this._k);
    let t0 = null;
    board.addEventListener('touchstart', (e) => { t0 = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    board.addEventListener('touchend', (e) => {
      if (!t0) return;
      const dx = e.changedTouches[0].clientX - t0[0], dy = e.changedTouches[0].clientY - t0[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      t0 = null;
    });
    draw();
    return h('div', { class: 'page gm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: '2048', lead: 'Skub brikkerne med piletasterne eller ved at swipe. To ens brikker bliver til én – kan du nå 2048?', compact: true }),
      panel(null, null, h('div', { class: 'gm-top' }, h('span', null, 'Point ', scoreEl), h('span', null, 'Rekord ', bestEl),
        h('button', { class: 'btn btn-sm', onclick: newGame }, icon('refresh'), 'Nyt spil')),
        h('div', { class: 'gm-board g2-wrap' }, board, msg)));
  },
};
