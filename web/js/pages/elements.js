/** Grundstoffer – the periodic table in Danish: look elements up, filter by kind, and quiz yourself. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { ELEMENTS, CATS } from '../data/elements.js';

const CAT_COLOR = { alkali: '#f87171', alkaline: '#fb923c', transition: '#fbbf24', post: '#94a3b8', metalloid: '#2dd4bf', nonmetal: '#4ade80', halogen: '#a3e635', noble: '#c084fc', lanthanide: '#f472b6', actinide: '#e879f9' };
const STATE_ICON = { gas: '💨', 'væske': '💧', 'fast stof': '🧱', ukendt: '❓' };

export default {
  title: 'Grundstoffer',
  async render() {
    const app = appById('elements');
    let store;
    try { store = await appState('elements', { best: 0, seen: [] }); } catch (e) { return loadError('Grundstoffer', e); }
    const st = store.data;
    const root = h('div');
    let sel = ELEMENTS[0], filter = null, query = '', mode = 'table';
    const info = h('div');

    function card(e) {
      return h('div', { class: 'el-card', style: { '--c': CAT_COLOR[e.cat] } },
        h('div', { class: 'el-big' }, h('small', null, String(e.z)), h('b', null, e.sym), h('span', null, e.name)),
        h('dl', { class: 'el-facts' },
          h('dt', null, 'Atomnummer'), h('dd', null, String(e.z)),
          h('dt', null, 'Atommasse'), h('dd', null, `${e.mass} u`),
          h('dt', null, 'Type'), h('dd', null, CATS[e.cat]),
          h('dt', null, 'Periode'), h('dd', null, String(e.period)),
          h('dt', null, 'Gruppe'), h('dd', null, e.group ? String(e.group) : '–'),
          h('dt', null, 'Ved stuetemperatur'), h('dd', null, `${STATE_ICON[e.state]} ${e.state}`),
          h('dt', null, 'Protoner / elektroner'), h('dd', null, `${e.z} / ${e.z}`)));
    }
    function table() {
      const q = query.trim().toLowerCase();
      const match = (e) => (!filter || e.cat === filter) && (!q || e.name.toLowerCase().includes(q) || e.sym.toLowerCase() === q || String(e.z) === q);
      const grid = h('div', { class: 'el-grid' },
        ELEMENTS.map(e => h('button', { class: ['el-cell', sel === e && 'is-sel', !match(e) && 'is-dim'], style: { gridRow: e.row, gridColumn: e.col, '--c': CAT_COLOR[e.cat] }, 'aria-label': `${e.name} (${e.sym})`, title: e.name, onclick: (ev) => { sel = e; h(clear(info), null, card(e)); grid.querySelectorAll('.is-sel').forEach(x => x.classList.remove('is-sel')); ev.currentTarget.classList.add('is-sel'); } },
          h('small', null, String(e.z)), h('b', null, e.sym))),
        h('div', { class: 'el-gap', style: { gridRow: 8, gridColumn: '1 / -1' } }));
      const search = h('input', { class: 'input', type: 'search', value: query, placeholder: 'Søg: navn, symbol eller nummer', 'aria-label': 'Søg grundstof' });
      search.addEventListener('input', () => { query = search.value; const qq = query.trim().toLowerCase(); const hit = qq && (ELEMENTS.find(e => e.sym.toLowerCase() === qq || String(e.z) === qq || e.name.toLowerCase() === qq) || ELEMENTS.find(e => e.name.toLowerCase().startsWith(qq)) || ELEMENTS.find(e => e.name.toLowerCase().includes(qq))); if (hit) sel = hit; draw(); const si = root.querySelector('input[type=search]'); si?.focus(); si?.setSelectionRange(si.value.length, si.value.length); });
      h(clear(info), null, card(sel));
      return h('div', { class: 'stack' },
        h('div', { class: 'sh-top' }, search),
        h('div', { class: 'el-legend' }, Object.entries(CATS).map(([k, l]) => h('button', { class: ['el-leg', filter === k && 'is-on'], style: { '--c': CAT_COLOR[k] }, onclick: () => { filter = filter === k ? null : k; draw(); } }, h('i'), l))),
        h('div', { class: 'el-wrap' }, h('div', { class: 'el-scroll' }, grid), info));
    }
    function quiz() {
      let score = 0, n = 0, streakN = 0, q = null;
      const box = h('div');
      const kinds = ['symbol', 'name', 'number'];
      const pool = ELEMENTS.filter(e => e.z <= 56 || [79, 78, 80, 82, 92, 86].includes(e.z));
      const ask = () => {
        if (n >= 15) return done();
        const e = pool[Math.floor(Math.random() * pool.length)], kind = kinds[Math.floor(Math.random() * kinds.length)];
        const others = []; while (others.length < 3) { const o = pool[Math.floor(Math.random() * pool.length)]; if (o !== e && !others.includes(o)) others.push(o); }
        const opts = [e, ...others].sort(() => Math.random() - 0.5);
        q = { e, kind };
        const label = kind === 'symbol' ? `Hvilket grundstof har symbolet ${e.sym}?` : kind === 'name' ? `Hvad er symbolet for ${e.name.toLowerCase()}?` : `Hvilket grundstof har atomnummer ${e.z}?`;
        h(clear(box), null, h('div', { class: 'el-quiz' }, h('span', { class: 'faint' }, `Spørgsmål ${n + 1} af 15 · ${score} rigtige${streakN > 2 ? ` · 🔥 ${streakN}` : ''}`), h('h2', null, label),
          h('div', { class: 'el-opts' }, opts.map(o => h('button', { class: 'el-opt', style: { '--c': CAT_COLOR[o.cat] }, onclick: (ev) => {
            const ok = o === e; n++; if (ok) { score++; streakN++; } else streakN = 0;
            ev.currentTarget.classList.add(ok ? 'ok' : 'bad');
            box.querySelectorAll('.el-opt').forEach(b => { b.disabled = true; if (b.dataset.z === String(e.z)) b.classList.add('ok'); });
            setTimeout(ask, ok ? 600 : 1500);
          }, dataset: { z: o.z } }, kind === 'name' ? o.sym : o.name)))));
      };
      const done = () => {
        const best = score > (st.best || 0); if (best) { st.best = score; store.save(); }
        h(clear(box), null, panel(null, null, h('div', { class: 'pub-done' }, h('div', { class: 'qz-big' }, score >= 13 ? '🧪' : '⚗️'), h('h2', null, `${score} af 15 rigtige`), best ? h('p', null, 'Ny rekord!') : h('p', { class: 'muted' }, `Din rekord er ${st.best}.`), h('button', { class: 'btn btn-primary', onclick: () => { score = 0; n = 0; streakN = 0; ask(); } }, icon('refresh'), 'Igen'))));
      };
      ask();
      return box;
    }
    function draw() {
      h(clear(root), null, h('div', { class: 'cmd-filters', style: { marginBottom: '12px' } }, segmented([{ value: 'table', label: 'Det periodiske system', icon: 'grid' }, { value: 'quiz', label: 'Quiz', icon: 'help' }], mode, (v) => { mode = v; draw(); }, { label: 'Visning' })),
        mode === 'table' ? table() : quiz());
    }
    draw();
    return h('div', { class: 'page el-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Skole', title: 'Grundstoffer', lead: 'Det periodiske system på dansk: tryk på et grundstof, se hvilke der hører sammen – og test dig selv i quizzen.', compact: true }), root);
  },
};
