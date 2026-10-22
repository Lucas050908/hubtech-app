/**
 * Kabale (Klondike). Click a card to pick it up, then click where it should go. Click the same card again
 * (or double-click) and it jumps to the best place by itself. Draw 1 or 3, undo, and the game is saved.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { deck, cardEl, isRed, rankNo, SUITS } from '../features/cards.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function newKlondike() {
  const d = deck(1);
  const tableau = Array.from({ length: 7 }, (_, i) => ({ down: d.splice(0, i), up: d.splice(0, 1) }));
  return { stock: d, waste: [], found: [[], [], [], []], tableau, moves: 0, secs: 0, won: false };
}
const canFound = (c, pile) => (pile.length ? pile[pile.length - 1].s === c.s && rankNo(c) === rankNo(pile[pile.length - 1]) + 1 : c.r === 'A');
const canTab = (c, col) => { const top = col.up[col.up.length - 1]; return top ? isRed(top) !== isRed(c) && rankNo(top) === rankNo(c) + 1 : !col.down.length && c.r === 'K'; };

export default {
  title: 'Kabale',
  destroy() { clearInterval(this._iv); },
  async render() {
    const app = appById('solitaire');
    let store;
    try { store = await appState('solitaire', { game: null, draw: 1, wins: 0, best: null }); } catch (e) { return loadError('Kabale', e); }
    const st = store.data, self = this;
    if (!st.game) st.game = newKlondike();
    let G = st.game, sel = null, undo = [];
    const board = h('div', { class: 'sol-board' });
    const movesEl = h('b'), timeEl = h('b'), bestEl = h('b');
    const snap = () => { undo.push(JSON.stringify(G)); if (undo.length > 200) undo.shift(); };
    const save = () => { st.game = G; store.save(); };

    // where is a selection: { from: 'waste' } | { from: 'found', i } | { from: 'tab', i, k (index in up) }
    const cardsOf = (s) => (s.from === 'waste' ? [G.waste[G.waste.length - 1]] : s.from === 'found' ? [G.found[s.i][G.found[s.i].length - 1]] : G.tableau[s.i].up.slice(s.k));
    function take(s) {
      if (s.from === 'waste') return [G.waste.pop()];
      if (s.from === 'found') return [G.found[s.i].pop()];
      const col = G.tableau[s.i], out = col.up.splice(s.k);
      if (!col.up.length && col.down.length) col.up.push(col.down.pop());
      return out;
    }
    function moveTo(s, target) {
      const cards = cardsOf(s); if (!cards[0]) return false;
      if (target.to === 'found') {
        if (cards.length !== 1 || !canFound(cards[0], G.found[target.i])) return false;
        snap(); G.found[target.i].push(...take(s));
      } else {
        if (s.from === 'tab' && s.i === target.i) return false;
        if (!canTab(cards[0], G.tableau[target.i])) return false;
        snap(); G.tableau[target.i].up.push(...take(s));
      }
      G.moves++; afterMove(); return true;
    }
    function auto(s) {
      const cards = cardsOf(s);
      if (cards.length === 1) for (let i = 0; i < 4; i++) if (canFound(cards[0], G.found[i])) return moveTo(s, { to: 'found', i });
      for (let i = 0; i < 7; i++) if (!(s.from === 'tab' && s.i === i) && canTab(cards[0], G.tableau[i]) && !(cards[0].r === 'K' && s.from === 'tab' && s.k === 0 && !G.tableau[s.i].down.length)) return moveTo(s, { to: 'tab', i });
      return false;
    }
    function afterMove() {
      sel = null;
      if (G.found.every(f => f.length === 13)) {
        G.won = true; st.wins++;
        if (!st.best || G.secs < st.best) { st.best = G.secs; toast('Ny rekord!', { type: 'xp', text: `Kabalen gik op på ${fmt(G.secs)}` }); }
        else toast('Kabalen gik op! 🎉', { type: 'ok', text: `${G.moves} træk på ${fmt(G.secs)}` });
      }
      save(); draw();
    }
    function drawStock() {
      snap(); sel = null;
      if (!G.stock.length) { if (!G.waste.length) { undo.pop(); return; } G.stock = G.waste.reverse(); G.waste = []; }
      else for (let n = 0; n < st.draw && G.stock.length; n++) G.waste.push(G.stock.pop());
      G.moves++; save(); draw();
    }
    function finishAll() {     // every card is face up: put them all on the foundations
      let moved = true;
      const step = () => {
        moved = false;
        for (const s of [{ from: 'waste' }, ...G.tableau.map((c, i) => ({ from: 'tab', i, k: c.up.length - 1 }))]) {
          const c = cardsOf(s)[0]; if (!c) continue;
          for (let i = 0; i < 4; i++) if (canFound(c, G.found[i])) { G.found[i].push(...take(s)); G.moves++; moved = true; break; }
          if (moved) break;
        }
        if (moved) { draw(); setTimeout(step, 70); } else afterMove();
      };
      snap(); step();
    }
    function click(s) {
      if (G.won) return;
      if (sel && sel.from === s.from && sel.i === s.i && sel.k === s.k) { if (!auto(s)) { sel = null; draw(); } return; }
      if (sel && s.from === 'tab') { if (moveTo(sel, { to: 'tab', i: s.i })) return; }
      if (sel && s.from === 'found') { if (moveTo(sel, { to: 'found', i: s.i })) return; }
      if (!cardsOf(s)[0]) { sel = null; draw(); return; }
      sel = s; draw();
    }
    const isSel = (s) => sel && sel.from === s.from && sel.i === s.i && (s.from !== 'tab' || s.k >= sel.k);
    function draw() {
      const top = h('div', { class: 'sol-top' },
        h('button', { class: ['sol-pile sol-stock', !G.stock.length && 'is-empty'], 'aria-label': G.stock.length ? `Bunken – ${G.stock.length} kort` : 'Vend bunken', onclick: drawStock },
          G.stock.length ? cardEl(null, { up: false }) : h('span', null, icon('refresh'))),
        h('div', { class: 'sol-pile sol-waste' }, G.waste.slice(-st.draw).map((c, i, arr) => {
          const s = { from: 'waste' }, last = i === arr.length - 1;
          return cardEl(c, { cls: [last && isSel(s) && 'is-sel', 'sol-fan'], style: { '--i': i }, onclick: last ? () => click(s) : null, ondblclick: last ? () => auto(s) : null });
        })),
        h('div', { class: 'sol-gap' }),
        G.found.map((f, i) => {
          const s = { from: 'found', i };
          return h('div', { class: 'sol-pile sol-found', onclick: () => click(s), 'aria-label': `Grundbunke ${i + 1}` },
            f.length ? cardEl(f[f.length - 1], { cls: isSel(s) && 'is-sel' }) : h('span', { class: 'sol-ghost' }, SUITS[i]));
        }));
      const cols = h('div', { class: 'sol-cols' }, G.tableau.map((col, i) => h('div', { class: 'sol-col', onclick: (e) => { if (e.target === e.currentTarget) click({ from: 'tab', i, k: col.up.length }); } },
        col.down.map(() => cardEl(null, { up: false, cls: 'sol-down' })),
        col.up.map((c, k) => { const s = { from: 'tab', i, k }; return cardEl(c, { cls: ['sol-up', isSel(s) && 'is-sel'], onclick: (e) => { e.stopPropagation(); click(s); }, ondblclick: (e) => { e.stopPropagation(); auto(s); } }); }),
        !col.down.length && !col.up.length ? h('span', { class: 'sol-ghost sol-empty', onclick: () => click({ from: 'tab', i, k: 0 }) }, 'K') : null)));
      h(clear(board), null, top, cols,
        G.won ? h('div', { class: 'gm-overlay sol-won' }, h('b', null, 'Kabalen gik op! 🎉'), h('span', null, `${G.moves} træk · ${fmt(G.secs)}`), h('button', { class: 'btn btn-primary', onclick: newGame }, icon('refresh'), 'Ny kabale')) : null);
      movesEl.textContent = String(G.moves); timeEl.textContent = fmt(G.secs); bestEl.textContent = st.best ? fmt(st.best) : '–';
      autoBtn.hidden = G.won || G.stock.length || G.waste.length > 1 || G.tableau.some(c => c.down.length);
    }
    async function newGame() {
      if (!G.won && G.moves > 0 && !await confirmDialog({ title: 'Start en ny kabale?', text: 'Den, du er i gang med, forsvinder.', confirmLabel: 'Ny kabale' })) return;
      G = newKlondike(); undo = []; sel = null; save(); draw();
    }
    const autoBtn = h('button', { class: 'btn btn-sm btn-primary', onclick: finishAll }, icon('sparkles'), 'Læg alle op');
    this._iv = setInterval(() => { if (!document.hidden && document.body.contains(board) && !G.won && G.moves) { G.secs++; timeEl.textContent = fmt(G.secs); if (G.secs % 20 === 0) save(); } }, 1000);
    const drawSeg = segmented([{ value: 1, label: 'Træk 1' }, { value: 3, label: 'Træk 3' }], st.draw, (v) => { st.draw = v; store.save(); draw(); }, { label: 'Træk' });
    draw();
    return h('div', { class: 'page gm-page sol-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Kabale', lead: 'Klassisk kabale. Klik på et kort og så hvor det skal hen – eller klik to gange, så finder kortet selv den bedste plads.', compact: true }),
      panel(null, null,
        h('div', { class: 'sol-bar' }, drawSeg, h('span', null, 'Træk ', movesEl), h('span', null, 'Tid ', timeEl), h('span', null, 'Rekord ', bestEl),
          h('div', { class: 'sol-acts' }, autoBtn,
            h('button', { class: 'btn btn-sm', onclick: () => { if (!undo.length) return; G = JSON.parse(undo.pop()); sel = null; save(); draw(); } }, icon('undo'), 'Fortryd'),
            h('button', { class: 'btn btn-sm', onclick: newGame }, icon('refresh'), 'Ny kabale'))),
        board));
  },
};
