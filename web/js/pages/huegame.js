/**
 * Farvebølge – a calm colour puzzle. Swap tiles until the colours flow from corner to corner.
 * Tiles with a dot stay put. No clock and no way to lose; each tile that finds its place plays a soft note.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import * as Hg from '../features/huegame.js';

const LEVELS = 12;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
let actx = null;
function chime(step, vol = 0.06) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime, f = 440 * 2 ** ((60 + PENTA[step % PENTA.length] - 69) / 12);
    for (const [mult, v] of [[1, vol], [2, vol * 0.25]]) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 1.9);
    }
  } catch { /* no sound – fine */ }
}

export default {
  title: 'Farvebølge',
  async render() {
    const app = appById('huegame');
    let store;
    try { store = await appState('huegame', { level: 1, unlocked: 1, puzzle: null, moves: 0, best: {}, sound: true }); } catch (e) { return loadError('Farvebølge', e); }
    const st = store.data;
    st.best = st.best || {};
    if (!st.puzzle) { st.puzzle = Hg.makePuzzle(st.level); st.moves = 0; store.save(); }
    let p = st.puzzle, sel = -1, dragFrom = -1, hintPair = null;
    const board = h('div', { class: 'hg-board', role: 'grid', 'aria-label': 'Farvebølge' });
    const info = h('div', { class: 'hg-info' });
    const levels = h('div', { class: 'hg-levels' });

    function start(n, fresh = true) {
      st.level = n; if (fresh || !st.puzzle || st.puzzle.n !== n) { st.puzzle = Hg.makePuzzle(n); st.moves = 0; }
      p = st.puzzle; sel = -1; hintPair = null; store.save(); draw(); drawLevels();
    }
    function trySwap(a, b) {
      if (!Hg.swap(p, a, b)) return;
      st.moves++; hintPair = null;
      const landed = [a, b].filter(i => p.order[i] === i).length;
      if (landed && st.sound !== false) chime(Hg.placed(p) % PENTA.length + (landed === 2 ? 2 : 0));
      store.save();
      if (Hg.solved(p)) return finish();
      draw();
    }
    function finish() {
      const n = p.n, best = st.best[n];
      if (!best || st.moves < best) st.best[n] = st.moves;
      st.unlocked = Math.max(st.unlocked, Math.min(LEVELS, n + 1));
      store.save(); draw(true); drawLevels();
      if (st.sound !== false) [0, 2, 4, 7].forEach((s, i) => setTimeout(() => chime(s + 5, 0.05), i * 160));
    }
    function draw(done = false) {
      const fixed = new Set(p.fixed);
      board.style.setProperty('--w', p.w);
      board.classList.toggle('is-done', done || Hg.solved(p));
      h(clear(board), null, p.order.map((tile, pos) => h('button', {
        class: ['hg-tile', fixed.has(pos) && 'is-fixed', pos === sel && 'is-sel', hintPair && (hintPair.from === pos || hintPair.to === pos) && 'is-hint'],
        style: { background: p.colors[tile], '--d': `${(pos % p.w + Math.floor(pos / p.w)) * 40}ms` }, dataset: { pos },
        'aria-label': fixed.has(pos) ? `Fast felt ${pos + 1}` : `Felt ${pos + 1}${pos === sel ? ', valgt' : ''}`,
        onpointerdown: (e) => { if (fixed.has(pos) || Hg.solved(p)) return; dragFrom = pos; e.currentTarget.releasePointerCapture?.(e.pointerId); },
        onpointerup: () => { if (dragFrom >= 0 && dragFrom !== pos) { const a = dragFrom; dragFrom = -1; sel = -1; trySwap(a, pos); } else dragFrom = -1; },
        onclick: () => {
          if (fixed.has(pos) || Hg.solved(p)) return;
          if (sel < 0) { sel = pos; draw(); return; }
          if (sel === pos) { sel = -1; draw(); return; }
          const a = sel; sel = -1; trySwap(a, pos);
        } }, fixed.has(pos) ? h('i', { class: 'hg-dot' }) : null)));
      const solvedNow = done || Hg.solved(p);
      h(clear(info), null,
        h('div', null, h('b', null, `Bane ${p.n}`), h('span', { class: 'faint' }, `${p.w} × ${p.h} · ${st.moves} ${st.moves === 1 ? 'byt' : 'byt'}${st.best[p.n] ? ` · bedst ${st.best[p.n]}` : ''}`)),
        solvedNow ? h('div', { class: 'hg-win' }, h('b', null, 'Smukt.'), p.n < LEVELS ? h('button', { class: 'btn btn-primary', onclick: () => start(p.n + 1) }, 'Næste bane', icon('arrowRight')) : h('button', { class: 'btn btn-primary', onclick: () => start(LEVELS) }, 'Nye farver', icon('refresh')))
          : h('div', { class: 'row', style: { gap: '6px' } },
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { hintPair = Hg.hint(p); draw(); setTimeout(() => { hintPair = null; if (document.body.contains(board)) draw(); }, 2500); } }, icon('sparkles'), 'Hint'),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => start(p.n) }, icon('refresh'), 'Nye farver')));
    }
    function drawLevels() {
      h(clear(levels), null, Array.from({ length: LEVELS }, (_, i) => i + 1).map(n => h('button', {
        class: ['hg-lv', n === p.n && 'is-on', st.best[n] && 'is-done'], disabled: n > st.unlocked, 'aria-label': `Bane ${n}${st.best[n] ? ' (klaret)' : n > st.unlocked ? ' (låst)' : ''}`,
        onclick: () => start(n, n !== p.n) }, st.best[n] ? '✓' : String(n))));
    }
    draw(); drawLevels();
    const soundBox = h('input', { type: 'checkbox', checked: st.sound !== false, onchange: (e) => { st.sound = e.target.checked; store.save(); } });
    return h('div', { class: 'page gm-page hg-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Afslappende spil', title: 'Farvebølge', lead: 'Byt brikkerne, til farverne flyder roligt fra hjørne til hjørne. Brikker med en prik sidder fast og viser vejen. Ingen tid, ingen stress.', compact: true }),
      h('div', { class: 'hg-wrap' },
        h('div', { class: 'hg-main' }, info, board),
        h('div', { class: 'hg-side' },
          panel('Baner', 'grid', levels, h('p', { class: 'faint' }, 'Hver bane er ny hver gang – tryk “Nye farver” for andre farver.')),
          panel('Sådan spiller man', 'help', h('ul', { class: 'pg-rules' },
            h('li', null, 'Tryk på en brik og så på en anden for at bytte dem – eller træk den hen.'),
            h('li', null, 'Brikker med en prik sidder rigtigt og kan ikke flyttes.'),
            h('li', null, 'Kig efter, hvordan farven skifter vandret og lodret. Et blidt klokkespil lyder, når en brik finder sin plads.')),
            h('label', { class: 'cal-pcheck' }, soundBox, h('span', null, 'Lyd'))))));
  },
};
