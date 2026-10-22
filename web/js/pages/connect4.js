/** Fire på stribe – against the computer (three levels) or two players on the same screen. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { c4Empty, c4Drop, c4Winner, c4Valid, c4Best, C4_LEVELS, C4_ROWS, C4_COLS } from '../features/gamelogic.js';

export default {
  title: 'Fire på stribe',
  destroy() { clearTimeout(this._t); removeEventListener('keydown', this._k); },
  async render() {
    const app = appById('connect4');
    let store;
    try { store = await appState('connect4', { mode: 'cpu', level: 'medium', stats: {} }); } catch (e) { return loadError('Fire på stribe', e); }
    const st = store.data, self = this;
    let board, turn, over, win, thinking = false, hover = 3;
    const boardEl = h('div', { class: 'c4-board', role: 'grid', 'aria-label': 'Spillebræt' });
    const status = h('div', { class: 'c4-status', 'aria-live': 'polite' });
    const statsEl = h('div', { class: 'c4-stats' });
    const statKey = () => (st.mode === 'cpu' ? st.level : 'two');

    function reset() { board = c4Empty(); turn = 1; over = false; win = null; thinking = false; clearTimeout(self._t); draw(); }
    function play(col) {
      if (over || thinking || (st.mode === 'cpu' && turn !== 1)) return;
      if (!move(col)) return;
      if (!over && st.mode === 'cpu') {
        thinking = true; draw();
        self._t = setTimeout(() => { thinking = false; move(c4Best(board, 2, C4_LEVELS[st.level].depth)); }, 380);
      }
    }
    function move(col) {
      if (col < 0 || c4Drop(board, col, turn) < 0) return false;
      win = c4Winner(board);
      if (win || !c4Valid(board).length) {
        over = true;
        const s = (st.stats[statKey()] ||= { w: 0, l: 0, d: 0 });
        if (!win) s.d++; else if (st.mode === 'two' || win.player === 1) s.w++; else s.l++;
        store.save();
        if (st.mode === 'cpu' && win?.player === 1) toast('Du vandt!', { type: 'xp', text: `Mod computeren på ${C4_LEVELS[st.level].label.toLowerCase()}` });
      } else turn = turn === 1 ? 2 : 1;
      draw(); return true;
    }
    const name = (p) => (st.mode === 'cpu' ? (p === 1 ? 'Du' : 'Computeren') : (p === 1 ? 'Rød' : 'Gul'));
    function draw() {
      clear(boardEl);
      const winSet = new Set((win?.cells || []).map(([r, c]) => `${r},${c}`));
      for (let c = 0; c < C4_COLS; c++) {
        const col = h('button', { class: ['c4-col', c === hover && !over && 'is-hover'], 'aria-label': `Kolonne ${c + 1}`, disabled: over || board[0][c] !== 0, dataset: { c },
          onclick: () => play(c), onmouseenter: () => { hover = c; boardEl.querySelectorAll('.c4-col').forEach(x => x.classList.toggle('is-hover', Number(x.dataset.c) === c && !over)); } });
        for (let r = 0; r < C4_ROWS; r++) col.append(h('i', { class: ['c4-cell', board[r][c] && `p${board[r][c]}`, winSet.has(`${r},${c}`) && 'is-win'] }));
        boardEl.append(col);
      }
      status.className = `c4-status p${turn}`;
      status.textContent = over ? (win ? (st.mode === 'cpu' ? (win.player === 1 ? 'Du vandt! 🎉' : 'Computeren vandt') : `${name(win.player)} vandt! 🎉`) : 'Uafgjort – brættet er fyldt')
        : thinking ? 'Computeren tænker …' : st.mode === 'cpu' ? 'Din tur – vælg en kolonne' : `${name(turn)}s tur`;
      const s = st.stats[statKey()] || { w: 0, l: 0, d: 0 };
      h(clear(statsEl), null, st.mode === 'cpu'
        ? [h('span', null, 'Vundet ', h('b', null, String(s.w))), h('span', null, 'Tabt ', h('b', null, String(s.l))), h('span', null, 'Uafgjort ', h('b', null, String(s.d)))]
        : [h('span', null, 'Spil ', h('b', null, String(s.w + s.d))), h('span', null, 'Uafgjort ', h('b', null, String(s.d)))]);
    }
    this._k = (e) => {
      if (!document.body.contains(boardEl) || e.target.closest?.('input, textarea, select')) return;
      if (/^[1-7]$/.test(e.key)) { e.preventDefault(); hover = Number(e.key) - 1; play(hover); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); hover = (hover + (e.key === 'ArrowLeft' ? 6 : 1)) % 7; draw(); }
      else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button')) { e.preventDefault(); play(hover); }
    };
    addEventListener('keydown', this._k);
    const levelSeg = segmented(Object.entries(C4_LEVELS).map(([value, l]) => ({ value, label: l.label })), st.level, (v) => { st.level = v; store.save(); reset(); }, { label: 'Sværhedsgrad' });
    const modeSeg = segmented([{ value: 'cpu', label: 'Mod computeren', icon: 'bot' }, { value: 'two', label: 'To spillere', icon: 'users' }], st.mode, (v) => { st.mode = v; levelSeg.hidden = v !== 'cpu'; store.save(); reset(); }, { label: 'Spillere' });
    levelSeg.hidden = st.mode !== 'cpu';
    reset();
    return h('div', { class: 'page gm-page c4-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Fire på stribe', lead: 'Få fire i træk – vandret, lodret eller på skrå. Klik på en kolonne, eller tryk 1–7.', compact: true }),
      panel(null, null, h('div', { class: 'cmd-filters c4-filters' }, modeSeg, levelSeg), status,
        h('div', { class: 'c4-wrap' }, boardEl),
        h('div', { class: 'gm-top', style: { marginTop: '14px' } }, statsEl, h('button', { class: 'btn btn-sm', onclick: reset }, icon('refresh'), 'Nyt spil'))));
  },
};
