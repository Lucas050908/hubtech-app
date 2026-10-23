/** Ordsøg – find the hidden words in the letter grid. Drag (or tap the first and last letter) to mark a word. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { wordGrid, lineCells } from '../features/arcade2.js';

const THEMES = {
  dyr: ['HUND', 'KAT', 'HEST', 'GRIS', 'ELEFANT', 'GIRAF', 'LØVE', 'TIGER', 'PINGVIN', 'EGERN', 'RÆV', 'UGLE', 'HVAL', 'SÆL', 'ØRN', 'FRØ'],
  mad: ['PIZZA', 'PASTA', 'SUPPE', 'BRØD', 'OST', 'ÆBLE', 'BANAN', 'GULEROD', 'POMFRITTER', 'KAGE', 'IS', 'RIS', 'TOMAT', 'AGURK', 'PANDEKAGE', 'FRIKADELLE'],
  it: ['MUS', 'SKÆRM', 'KABEL', 'ROUTER', 'PRINTER', 'KODE', 'SERVER', 'TASTATUR', 'BATTERI', 'APP', 'NETVÆRK', 'BACKUP', 'KODEORD', 'VIRUS', 'PIXEL', 'DATA'],
  sport: ['FODBOLD', 'HÅNDBOLD', 'TENNIS', 'SVØMNING', 'CYKLING', 'LØB', 'GOLF', 'SKAK', 'BOKSNING', 'ROING', 'BADMINTON', 'DANS', 'SKI', 'RIDNING', 'KLATRING', 'YOGA'],
  natur: ['SKOV', 'STRAND', 'BJERG', 'SØ', 'Å', 'HAV', 'BLOMST', 'TRÆ', 'SOL', 'MÅNE', 'STJERNE', 'REGN', 'SNE', 'VIND', 'ØRKEN', 'REGNBUE'],
};
const THEME_NAMES = { dyr: 'Dyr', mad: 'Mad', it: 'IT', sport: 'Sport', natur: 'Natur' };
const SIZES = { easy: [9, 7, true], normal: [12, 10, false], hard: [15, 14, false] };

export default {
  title: 'Ordsøg',
  destroy() { clearInterval(this._iv); },
  async render() {
    const app = appById('wordsearch');
    let store;
    try { store = await appState('wordsearch', { theme: 'dyr', level: 'normal', solved: 0, best: {} }); } catch (e) { return loadError('Ordsøg', e); }
    const st = store.data, self = this;
    const root = h('div');
    function game() {
      clearInterval(self._iv);
      const [size, count, easy] = SIZES[st.level];
      const words = THEMES[st.theme].filter(w => w.length <= size).sort(() => Math.random() - 0.5).slice(0, count);
      const g = wordGrid(words, size, Math.random, easy);
      const found = new Set(), foundCells = new Map();
      let start = null, hover = null, t0 = Date.now();
      const timeEl = h('b');
      const gridEl = h('div', { class: 'wsr-grid', style: { gridTemplateColumns: `repeat(${size}, 1fr)` } });
      const listEl = h('div', { class: 'wsr-words' });
      const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.wsr-cell'); return el && gridEl.contains(el) ? [Number(el.dataset.r), Number(el.dataset.c)] : null; };
      const sel = () => (start && hover ? lineCells(start, hover) || [start] : start ? [start] : []);
      function drawGrid() {
        const s = new Set(sel().map(([r, c]) => `${r},${c}`));
        h(clear(gridEl), null, g.grid.flatMap((row, r) => row.map((ch, c) => h('span', { class: ['wsr-cell', s.has(`${r},${c}`) && 'is-sel', foundCells.has(`${r},${c}`) && 'is-found'], style: foundCells.has(`${r},${c}`) ? { '--c': foundCells.get(`${r},${c}`) } : null, dataset: { r, c } }, ch))));
      }
      function drawList() { h(clear(listEl), null, g.placed.map(p => h('span', { class: ['wsr-word', found.has(p.word) && 'is-found'] }, p.word))); }
      function tryWord() {
        const cells = sel(); if (cells.length < 2) return false;
        const text = cells.map(([r, c]) => g.grid[r][c]).join(''), rev = [...text].reverse().join('');
        const p = g.placed.find(x => !found.has(x.word) && (x.word === text || x.word === rev));
        if (!p) return false;
        found.add(p.word); const col = `hsl(${(found.size * 57) % 360}, 75%, 55%)`;
        cells.forEach(([r, c]) => foundCells.set(`${r},${c}`, col));
        drawList();
        if (found.size === g.placed.length) {
          clearInterval(self._iv); const secs = Math.round((Date.now() - t0) / 1000), key = `${st.theme}-${st.level}`;
          st.solved++; const best = !st.best[key] || secs < st.best[key]; if (best) st.best[key] = secs; store.save();
          toast(best ? `Alle ord fundet på ${secs} s – ny rekord!` : `Alle ord fundet på ${secs} sekunder!`, { type: best ? 'xp' : 'ok' });
        }
        return true;
      }
      gridEl.addEventListener('pointerdown', (e) => { const c = cellAt(e); if (!c) return; e.preventDefault(); if (start && !hover) { hover = c; if (!tryWord()) toast('Ikke et af ordene', { type: 'warn', ms: 1200 }); start = hover = null; drawGrid(); return; } start = c; hover = null; gridEl.setPointerCapture?.(e.pointerId); drawGrid(); });
      gridEl.addEventListener('pointermove', (e) => { if (!start || !(e.buttons & 1)) return; const c = cellAt(e); if (c && (!hover || c[0] !== hover[0] || c[1] !== hover[1])) { hover = c; drawGrid(); } });
      gridEl.addEventListener('pointerup', () => { if (start && hover && (hover[0] !== start[0] || hover[1] !== start[1])) { if (!tryWord()) { /* wrong */ } start = hover = null; } drawGrid(); });
      h(clear(root), null,
        h('div', { class: 'sh-top' }, segmented(Object.entries(THEME_NAMES).map(([v, l]) => ({ value: v, label: l })), st.theme, (v) => { st.theme = v; store.save(); game(); }, { label: 'Tema' }),
          segmented([{ value: 'easy', label: 'Let' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Svær' }], st.level, (v) => { st.level = v; store.save(); game(); }, { label: 'Sværhed' }),
          timeEl, h('button', { class: 'btn btn-sm', onclick: game }, icon('refresh'), 'Ny')),
        h('div', { class: 'wsr-wrap' }, gridEl, h('div', { class: 'stack' }, panel('Find ordene', 'search', listEl), h('p', { class: 'faint', style: { fontSize: '13px' } }, easy ? 'Ordene står vandret, lodret eller skråt nedad.' : 'Ordene kan stå i alle retninger – også baglæns.'))));
      self._iv = setInterval(() => { if (!document.body.contains(timeEl)) return clearInterval(self._iv); timeEl.textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
      drawGrid(); drawList(); timeEl.textContent = '0 s';
    }
    game();
    return h('div', { class: 'page wsr-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Ordsøg', lead: 'Find de skjulte ord i bogstavgitteret. Træk hen over et ord – eller tryk på første og sidste bogstav.', compact: true }), root);
  },
};
