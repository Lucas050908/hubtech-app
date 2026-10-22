/** Sudoku – three levels, notes, conflicts in red, hints. The game is saved on the account, so you can continue on the phone. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { makeSudoku, canPlace, SUDOKU_LEVELS } from '../features/gamelogic.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default {
  title: 'Sudoku',
  destroy() { clearInterval(this._iv); removeEventListener('keydown', this._k); },
  async render() {
    const app = appById('sudoku');
    let store;
    try { store = await appState('sudoku', { game: null, best: {}, won: 0 }); } catch (e) { return loadError('Sudoku', e); }
    const st = store.data, self = this;
    let level = st.game?.level || 'easy', sel = -1, notesMode = false;
    const grid = h('div', { class: 'sd-grid', role: 'grid', 'aria-label': 'Sudoku' });
    const timeEl = h('b', null, '0:00'), bestEl = h('b'), leftEl = h('b');

    function newGame(lv = level) {
      level = lv;
      const { puzzle, solution } = makeSudoku(level);
      st.game = { level, puzzle, solution, cur: [...puzzle], notes: Array(81).fill(''), secs: 0, hints: 0, done: false };
      sel = st.game.puzzle.findIndex(v => !v); store.save(); draw();
    }
    const g = () => st.game;
    function setCell(i, v) {
      const G = g(); if (!G || G.done || G.puzzle[i]) return;
      if (notesMode && v) {
        const n = new Set(G.notes[i]); n.has(String(v)) ? n.delete(String(v)) : n.add(String(v));
        G.notes[i] = [...n].sort().join(''); G.cur[i] = 0;
      } else {
        G.cur[i] = G.cur[i] === v ? 0 : v; G.notes[i] = '';
        if (v && G.cur[i] === v) {     // tidy the notes in the same row, column and box
          const r = Math.floor(i / 9), c = i % 9;
          for (let k = 0; k < 81; k++) { const rr = Math.floor(k / 9), cc = k % 9; if (rr === r || cc === c || (Math.floor(rr / 3) === Math.floor(r / 3) && Math.floor(cc / 3) === Math.floor(c / 3))) G.notes[k] = G.notes[k].replace(String(v), ''); }
        }
      }
      if (G.cur.every((x, k) => x === G.solution[k])) win();
      store.save(); draw();
    }
    function win() {
      const G = g(); G.done = true; st.won = (st.won || 0) + 1;
      const best = st.best[G.level];
      const rec = !G.hints && (!best || G.secs < best);
      if (rec) st.best[G.level] = G.secs;
      toast(rec ? 'Ny rekord!' : 'Sudoku løst!', { type: rec ? 'xp' : 'ok', text: `${SUDOKU_LEVELS[G.level].label} på ${fmt(G.secs)}${G.hints ? ` med ${G.hints} hint` : ''}` });
    }
    function hint() {
      const G = g(); if (!G || G.done) return;
      let i = sel >= 0 && !G.puzzle[sel] && G.cur[sel] !== G.solution[sel] ? sel : G.cur.findIndex((v, k) => v !== G.solution[k]);
      if (i < 0) return;
      G.hints++; notesMode = false; sel = i; G.cur[i] = 0; setCell(i, G.solution[i]);
    }
    function check() {
      const G = g(); const wrong = G.cur.filter((v, k) => v && v !== G.solution[k]).length;
      toast(wrong ? `${wrong} tal er forkert` : 'Alt, du har skrevet, er rigtigt', { type: wrong ? 'warn' : 'ok' });
      grid.classList.add('sd-checking'); setTimeout(() => grid.classList.remove('sd-checking'), 2500);
    }
    function draw() {
      const G = g(); clear(grid);
      const sv = sel >= 0 ? G.cur[sel] : 0, sr = Math.floor(sel / 9), sc = sel % 9;
      for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9), c = i % 9, v = G.cur[i], given = !!G.puzzle[i];
        const peer = sel >= 0 && (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)));
        const bad = v && !canPlace(G.cur, i, v);
        const cell = h('button', { class: ['sd-cell', given && 'is-given', i === sel && 'is-sel', peer && 'is-peer', v && v === sv && 'is-same', bad && 'is-bad', v && !given && v !== G.solution[i] && 'is-wrong', c % 3 === 2 && c < 8 && 'br', r % 3 === 2 && r < 8 && 'bb'],
          role: 'gridcell', 'aria-label': `Række ${r + 1}, kolonne ${c + 1}: ${v || 'tom'}`, dataset: { i },
          onclick: () => { sel = i; draw(); } },
          v ? String(v) : G.notes[i] ? h('span', { class: 'sd-notes' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => h('i', null, G.notes[i].includes(String(n)) ? String(n) : ''))) : '');
        grid.append(cell);
      }
      grid.classList.toggle('is-done', !!G.done);
      bestEl.textContent = st.best[G.level] ? fmt(st.best[G.level]) : '–';
      leftEl.textContent = String(G.cur.filter(x => !x).length);
      timeEl.textContent = fmt(G.secs);
      notesBtn.setAttribute('aria-pressed', String(notesMode)); notesBtn.classList.toggle('btn-primary', notesMode);
      pad.querySelectorAll('[data-n]').forEach(b => { const n = Number(b.dataset.n); b.disabled = G.cur.filter(x => x === n).length >= 9; });
    }
    const notesBtn = h('button', { class: 'btn btn-sm', onclick: () => { notesMode = !notesMode; draw(); } }, icon('edit'), 'Noter');
    const pad = h('div', { class: 'sd-pad' },
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => h('button', { class: 'btn sd-num', dataset: { n }, onclick: () => sel >= 0 && setCell(sel, n) }, String(n))),
      h('button', { class: 'btn sd-num', 'aria-label': 'Slet', onclick: () => sel >= 0 && setCell(sel, 0) }, icon('eraser')));
    this._k = (e) => {
      if (!document.body.contains(grid) || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (/^[1-9]$/.test(e.key) && sel >= 0) { e.preventDefault(); setCell(sel, Number(e.key)); }
      else if ((e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') && sel >= 0) { e.preventDefault(); setCell(sel, 0); }
      else if (e.key.toLowerCase() === 'n') { notesMode = !notesMode; draw(); }
      else {
        const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (mv) { e.preventDefault(); sel = sel < 0 ? 0 : (sel + mv + 81) % 81; draw(); }
      }
    };
    addEventListener('keydown', this._k);
    this._iv = setInterval(() => {
      const G = g(); if (!G || G.done || document.hidden || !document.body.contains(grid)) return;
      G.secs++; timeEl.textContent = fmt(G.secs);
      if (G.secs % 15 === 0) store.save();
    }, 1000);
    const seg = segmented(Object.entries(SUDOKU_LEVELS).map(([value, l]) => ({ value, label: l.label })), level, async (v) => {
      const G = g();
      if (G && !G.done && G.cur.some((x, k) => x && !G.puzzle[k]) && !await confirmDialog({ title: 'Start et nyt spil?', text: 'Det spil, du er i gang med, forsvinder.', confirmLabel: 'Nyt spil' })) { seg.setValue(level); return; }
      newGame(v);
    }, { label: 'Sværhedsgrad' });
    if (!st.game) newGame(level); else { sel = st.game.cur.findIndex((v, k) => !v && !st.game.puzzle[k]); draw(); }
    return h('div', { class: 'page gm-page sd-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Sudoku', lead: 'Hvert tal fra 1 til 9 én gang i hver række, kolonne og boks. Brug tastaturet eller knapperne – N skifter til noter.', compact: true }),
      panel(null, null, h('div', { class: 'cmd-filters' }, seg),
        h('div', { class: 'gm-top', style: { marginTop: '12px' } }, h('span', null, 'Tid ', timeEl), h('span', null, 'Tomme ', leftEl), h('span', null, 'Rekord ', bestEl)),
        h('div', { class: 'sd-wrap' }, grid,
          h('div', { class: 'sd-side' }, pad,
            h('div', { class: 'sd-acts' }, notesBtn,
              h('button', { class: 'btn btn-sm', onclick: hint }, icon('sparkles'), 'Hint'),
              h('button', { class: 'btn btn-sm', onclick: check }, icon('checkCircle'), 'Tjek'),
              h('button', { class: 'btn btn-sm', onclick: () => newGame(level) }, icon('refresh'), 'Nyt spil'))))));
  },
};
