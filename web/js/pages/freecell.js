/** Fri celle – the solitaire where (almost) every game can be won. Click a card, then where it should go. Double-click sends it the best place. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import * as F from '../features/freecell.js';

export default {
  title: 'Fri celle',
  destroy() { clearInterval(this._iv); },
  async render() {
    const app = appById('freecell');
    let store;
    try { store = await appState('freecell', { game: null, won: 0, played: 0, best: null, started: null }); } catch (e) { return loadError('Fri celle', e); }
    const st = store.data, self = this, root = h('div');
    let sel = null;     // { from, n }
    if (!st.game) { st.game = F.newGame(); st.started = Date.now(); st.played++; store.save(); }
    const timeEl = h('b');
    const card = (c, attrs = {}) => h('div', { class: ['ot-card', 'fcl-card', 'HD'.includes(c[0]) && 'red', attrs.class], ...attrs.on, 'aria-label': F.label(c) }, h('span', { class: 'ot-tl' }, F.label(c).slice(0, -1), h('br'), F.SUITS[c[0]]), h('span', { class: 'ot-mid' }, F.SUITS[c[0]]));
    const act = (from, to, n) => {
      const g = st.game;
      if (!F.move(g, from, to, n)) { toast('Det træk er ikke tilladt', { type: 'warn', ms: 1200 }); sel = null; draw(); return; }
      sel = null; F.autoFound(g); store.save();
      if (F.won(g)) { const secs = Math.round((Date.now() - st.started) / 1000); st.won++; if (!st.best || secs < st.best) st.best = secs; store.save(); toast(`Vundet på ${g.moves} træk! 🎉`, { type: 'xp' }); }
      draw();
    };
    const pick = (from, n) => {
      if (sel) { const s0 = sel; if (from.t === s0.from.t && from.i === s0.from.i) { sel = null; draw(); return; } act(s0.from, from.t === 'cell' ? { t: 'cell', i: from.i } : from, s0.n); return; }
      sel = { from, n }; draw();
    };
    const auto = (from, n) => { const t = F.bestTarget(st.game, from, n); if (t) act(from, t, n); else toast('Kortet kan ikke flyttes nogen steder', { type: 'warn', ms: 1200 }); };
    function draw() {
      const g = st.game, isSel = (t, i) => sel && sel.from.t === t && sel.from.i === i;
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('span', null, h('b', null, String(g.moves)), ' træk'), timeEl, h('span', { class: 'faint' }, `Vundet ${st.won} af ${st.played}${st.best ? ` · bedste tid ${Math.floor(st.best / 60)}:${String(st.best % 60).padStart(2, '0')}` : ''}`), h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn btn-sm', disabled: !g.history.length, onclick: () => { F.undo(g); sel = null; store.save(); draw(); } }, icon('undo'), 'Fortryd'),
          h('button', { class: 'btn btn-sm', onclick: async () => { if (F.won(g) || await confirmDialog({ title: 'Nyt spil?', text: 'Det igangværende spil tæller som tabt.', confirmLabel: 'Nyt spil' })) { st.game = F.newGame(); st.started = Date.now(); st.played++; sel = null; store.save(); draw(); } } }, icon('refresh'), 'Nyt spil')),
        h('div', { class: 'fcl-top' },
          h('div', { class: 'fcl-cells' }, g.cells.map((c, i) => h('div', { class: ['fcl-slot', isSel('cell', i) && 'is-sel'], onclick: () => (c ? pick({ t: 'cell', i }, 1) : sel ? act(sel.from, { t: 'cell', i }, sel.n) : null), ondblclick: () => c && auto({ t: 'cell', i }, 1) }, c ? card(c) : h('span', { class: 'faint' }, 'Fri')))),
          h('div', { class: 'fcl-found' }, Object.entries(g.found).map(([s, v]) => h('div', { class: 'fcl-slot found', onclick: () => sel && act(sel.from, { t: 'found' }, sel.n) }, v ? card(`${s}${v}`) : h('span', { class: ['fcl-suit', 'HD'.includes(s) && 'red'] }, F.SUITS[s]))))),
        h('div', { class: 'fcl-cols' }, g.cols.map((col, i) => {
          const run = F.runLength(col);
          return h('div', { class: ['fcl-col', isSel('col', i) && 'is-sel'], onclick: (e) => { if (!col.length && sel) act(sel.from, { t: 'col', i }, sel.n); } },
            col.length ? col.map((c, k) => { const fromEnd = col.length - k, movable = fromEnd <= run;
              return card(c, { class: [movable && 'movable', isSel('col', i) && fromEnd <= sel.n && 'picked'].filter(Boolean).join(' '), on: { style: { '--k': k }, onclick: (e) => { e.stopPropagation(); if (sel && !(sel.from.t === 'col' && sel.from.i === i)) { act(sel.from, { t: 'col', i }, sel.n); return; } if (movable) pick({ t: 'col', i }, fromEnd); }, ondblclick: (e) => { e.stopPropagation(); if (movable) { sel = null; auto({ t: 'col', i }, fromEnd); } } } }); })
              : h('div', { class: 'fcl-empty' }));
        })),
        F.won(g) ? h('div', { class: 'dm-status is-over' }, `Du vandt på ${g.moves} træk! 🎉`) : h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Klik på et kort og derefter hvor det skal hen – eller dobbeltklik for at sende det det bedste sted. Byg nedad i skiftende farver.'));
      tick();
    }
    const tick = () => { const s = Math.round((Date.now() - (st.started || Date.now())) / 1000); timeEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    clearInterval(this._iv); this._iv = setInterval(() => { if (!document.body.contains(timeEl)) return clearInterval(self._iv); if (!F.won(st.game)) tick(); }, 1000);
    draw();
    return h('div', { class: 'page fcl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Fri celle', lead: 'Kabalen hvor alle kort ligger åbent – og næsten alle spil kan vindes. Brug de fire frie celler klogt.', compact: true }), root);
  },
};
