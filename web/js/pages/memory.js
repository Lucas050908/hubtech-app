/** Huskespil – turn two cards; find all pairs with as few moves as possible. IT icons instead of fruit. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';

const ICONS = ['printer', 'monitor', 'smartphone', 'globe', 'database', 'chip', 'terminal', 'shield', 'mail', 'cloud', 'server', 'key', 'plug', 'gamepad', 'camera', 'music'];
const SIZES = { s: { label: '8 par', pairs: 8, cols: 4 }, m: { label: '12 par', pairs: 12, cols: 6 } };
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

export default {
  title: 'Huskespil',
  async render() {
    const app = appById('memory');
    let store;
    try { store = await appState('memory', { best: {} }); } catch (e) { return loadError('Huskespil', e); }
    const st = store.data;
    let size = 's', cards, open = [], moves = 0, found = 0, lock = false;
    const grid = h('div', { class: 'mm-grid' });
    const movesEl = h('b'), bestEl = h('b');

    function newGame() {
      const S = SIZES[size];
      cards = shuffle(shuffle(ICONS).slice(0, S.pairs).flatMap(ic => [{ ic }, { ic }])).map(c => ({ ...c, up: false, done: false }));
      open = []; moves = 0; found = 0; lock = false;
      grid.style.setProperty('--cols', S.cols);
      draw();
    }
    function flip(i) {
      const c = cards[i];
      if (lock || c.up || c.done) return;
      c.up = true; open.push(i); draw();
      if (open.length < 2) return;
      moves++; movesEl.textContent = String(moves);
      const [a, b] = open;
      if (cards[a].ic === cards[b].ic) {
        cards[a].done = cards[b].done = true; open = []; found++;
        if (found === SIZES[size].pairs) {
          const best = st.best[size];
          if (!best || moves < best) { st.best[size] = moves; store.save(); toast('Ny rekord!', { type: 'xp', text: `${moves} træk` }); }
          else toast('Alle par fundet!', { type: 'ok', text: `${moves} træk` });
        }
        draw();
      } else {
        lock = true;
        setTimeout(() => { cards[a].up = cards[b].up = false; open = []; lock = false; draw(); }, 850);
      }
    }
    function draw() {
      clear(grid);
      cards.forEach((c, i) => grid.append(h('button', { class: ['mm-card', (c.up || c.done) && 'is-up', c.done && 'is-done'], 'aria-label': c.up || c.done ? c.ic : 'Skjult kort', onclick: () => flip(i) },
        h('span', { class: 'mm-back' }, '?'), h('span', { class: 'mm-face' }, icon(c.ic)))));
      movesEl.textContent = String(moves);
      bestEl.textContent = st.best[size] ? `${st.best[size]} træk` : '–';
    }
    const seg = segmented(Object.entries(SIZES).map(([value, s]) => ({ value, label: s.label })), size, (v) => { size = v; newGame(); }, { label: 'Størrelse' });
    newGame();
    return h('div', { class: 'page gm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Huskespil', lead: 'Vend to kort ad gangen, og find alle par med så få træk som muligt.', compact: true }),
      panel(null, null, h('div', { class: 'cmd-filters' }, seg),
        h('div', { class: 'gm-top', style: { marginTop: '12px' } }, h('span', null, 'Træk ', movesEl), h('span', null, 'Rekord ', bestEl), h('button', { class: 'btn btn-sm', onclick: newGame }, icon('refresh'), 'Nyt spil')),
        grid));
  },
};
