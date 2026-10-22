/** Minestryger – classic minesweeper. Click to reveal, right-click (or flag mode) to flag. The first click is always safe. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { submitScore } from '../features/gameroom.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';

const LEVELS = { easy: { label: 'Begynder', w: 9, h: 9, m: 10 }, mid: { label: 'Øvet', w: 16, h: 16, m: 40 }, hard: { label: 'Ekspert', w: 24, h: 16, m: 80 } };

export default {
  title: 'Minestryger',
  destroy() { clearInterval(this._t); },
  async render() {
    const app = appById('mines');
    let store;
    try { store = await appState('mines', { best: {}, wins: 0 }); } catch (e) { return loadError('Minestryger', e); }
    const st = store.data, self = this;
    let level = 'easy', cells, started = 0, over = false, flagMode = false, revealed = 0;
    const grid = h('div', { class: 'mn-grid' });
    const timeEl = h('b', null, '0'), minesEl = h('b'), bestEl = h('b');
    const face = h('button', { class: 'btn btn-sm' }, icon('refresh'), 'Nyt spil');
    const flagBtn = h('button', { class: 'btn btn-sm', 'aria-pressed': 'false' }, icon('flag'), 'Flag-tilstand');
    const L = () => LEVELS[level];
    const idx = (x, y) => y * L().w + x;
    const around = (x, y) => { const out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < L().w && ny < L().h) out.push([nx, ny]); } return out; };

    function newGame() {
      cells = Array.from({ length: L().w * L().h }, () => ({ mine: false, open: false, flag: false, n: 0 }));
      started = 0; over = false; revealed = 0; timeEl.textContent = '0';
      grid.style.setProperty('--w', L().w);
      bestEl.textContent = st.best[level] ? `${st.best[level]} s` : '–';
      draw();
    }
    function plant(sx, sy) {
      const safe = new Set([idx(sx, sy), ...around(sx, sy).map(([x, y]) => idx(x, y))]);
      let placed = 0;
      while (placed < L().m) { const i = Math.floor(Math.random() * cells.length); if (!cells[i].mine && !safe.has(i)) { cells[i].mine = true; placed++; } }
      for (let y = 0; y < L().h; y++) for (let x = 0; x < L().w; x++) cells[idx(x, y)].n = around(x, y).filter(([a, b]) => cells[idx(a, b)].mine).length;
    }
    function open(x, y) {
      const c = cells[idx(x, y)];
      if (c.open || c.flag) return;
      c.open = true; revealed++;
      if (c.mine) return lose();
      if (!c.n) around(x, y).forEach(([a, b]) => open(a, b));
    }
    function click(x, y, flag) {
      if (over) return;
      const c = cells[idx(x, y)];
      if (flag || flagMode) { if (!c.open) { c.flag = !c.flag; draw(); } return; }
      if (!started) { plant(x, y); started = Date.now(); }
      if (c.open && c.n) {                       // "chord": open the neighbours when the flags around match the number
        const ns = around(x, y);
        if (ns.filter(([a, b]) => cells[idx(a, b)].flag).length === c.n) ns.forEach(([a, b]) => open(a, b));
      } else open(x, y);
      if (!over && revealed === cells.length - L().m) win();
      draw();
    }
    function lose() { over = true; cells.forEach(c => { if (c.mine) c.open = true; }); toast('Bom!', { type: 'bad', text: 'Prøv igen – det første klik er altid sikkert.' }); }
    function win() {
      over = true;
      const s = Math.round((Date.now() - started) / 1000);
      st.wins = (st.wins || 0) + 1;
      if (!st.best[level] || s < st.best[level]) { st.best[level] = s; toast('Ny rekord!', { type: 'xp', text: `${L().label} på ${s} sekunder` }); }
      else toast('Du vandt!', { type: 'ok', text: `${s} sekunder` });
      cells.forEach(c => { if (c.mine) c.flag = true; });
      submitScore(`mines-${level === 'mid' ? 'medium' : level}`, s);
      store.save(); bestEl.textContent = `${st.best[level]} s`;
    }
    function draw() {
      clear(grid);
      minesEl.textContent = String(L().m - cells.filter(c => c.flag).length);
      for (let y = 0; y < L().h; y++) for (let x = 0; x < L().w; x++) {
        const c = cells[idx(x, y)];
        const b = h('button', { class: ['mn-cell', c.open && 'is-open', c.open && c.mine && 'is-mine', c.flag && !c.open && 'is-flag', c.open && c.n && `n${c.n}`], 'aria-label': c.open ? (c.mine ? 'Mine' : c.n ? String(c.n) : 'Tom') : c.flag ? 'Flag' : 'Skjult felt' },
          c.open ? (c.mine ? '✹' : c.n || '') : c.flag ? '⚑' : '');
        b.addEventListener('click', () => click(x, y, false));
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); click(x, y, true); });
        grid.append(b);
      }
    }
    face.addEventListener('click', newGame);
    flagBtn.addEventListener('click', () => { flagMode = !flagMode; flagBtn.setAttribute('aria-pressed', String(flagMode)); flagBtn.classList.toggle('btn-primary', flagMode); });
    self._t = setInterval(() => { if (started && !over) timeEl.textContent = String(Math.round((Date.now() - started) / 1000)); }, 500);
    const seg = segmented(Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.label })), level, (v) => { level = v; newGame(); }, { label: 'Niveau' });
    newGame();
    return h('div', { class: 'page gm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Minestryger', lead: 'Find alle felter uden miner. Tallet viser, hvor mange miner der rører feltet. Højreklik – eller Flag-tilstand på telefonen – sætter et flag.', compact: true }),
      panel(null, null, h('div', { class: 'cmd-filters' }, seg),
        h('div', { class: 'gm-top', style: { marginTop: '12px' } }, h('span', null, 'Miner ', minesEl), h('span', null, 'Tid ', timeEl), h('span', null, 'Rekord ', bestEl)),
        h('div', { class: 'mn-actions' }, face, flagBtn),
        h('div', { class: 'mn-wrap' }, grid)));
  },
};
