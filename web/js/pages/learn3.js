/** Lær og værktøjer: Hovedstæder, Klokken, Brøker, Stavning, Omregner, Terninger, Tæller og Billedgåder (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy, uid } from '../features/appkit.js';
import * as L from '../features/learn3.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const say = (t) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'da-DK'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch { return false; } };
const score = (st) => h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(st.right)), ' rigtige'), h('span', null, h('b', null, String(st.streak)), ' i træk'), h('span', { class: 'faint' }, `rekord ${st.best}`));
const mark = (st, ok, store) => { if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.wrong++; st.streak = 0; } store.save(); };

// ── Omregner ──
export const units = {
  title: 'Omregner',
  async render() {
    let store;
    try { store = await appState('units', { kind: 'length', from: 'km', to: 'm', v: 1 }); } catch (e) { return loadError('Omregner', e); }
    const st = store.data, root = h('div');
    function draw() {
      const U = L.UNITS[st.kind], names = Object.keys(U.units);
      if (!names.includes(st.from)) st.from = names[0]; if (!names.includes(st.to)) st.to = names[1] || names[0];
      const val = h('input', { class: 'input om-in', type: 'number', step: 'any', value: st.v, 'aria-label': 'Værdi' });
      const sel = (v, label, on) => h('select', { class: 'input', 'aria-label': label, onchange: (e) => on(e.target.value) }, names.map(n => h('option', { value: n, selected: n === v }, n)));
      const out = h('output', { class: 'om-out' }), table = h('div', { class: 'om-all' });
      const calc = () => {
        const v = Number(val.value); st.v = v; store.save();
        out.textContent = `${L.nice(L.convert(st.kind, v, st.from, st.to))} ${st.to}`;
        h(clear(table), null, names.filter(n => n !== st.from).map(n => h('button', { class: ['om-row', n === st.to && 'is-on'], onclick: () => { st.to = n; store.save(); draw(); } }, h('span', null, n), h('b', null, L.nice(L.convert(st.kind, v, st.from, n))))));
      };
      val.addEventListener('input', calc);
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented(Object.entries(L.UNITS).map(([k, u]) => ({ value: k, label: u.label })), st.kind, (v) => { st.kind = v; st.from = null; st.to = null; st.v = 1; store.save(); draw(); }, { label: 'Hvad vil du omregne?' })),
        h('div', { class: 'l3-card om-card' },
          h('div', { class: 'om-line' }, val, sel(st.from, 'Fra', (v) => { st.from = v; store.save(); draw(); }),
            h('button', { class: 'icon-btn', 'aria-label': 'Byt om', onclick: () => { [st.from, st.to] = [st.to, st.from]; store.save(); draw(); } }, icon('refresh')),
            sel(st.to, 'Til', (v) => { st.to = v; store.save(); draw(); })),
          h('div', { class: 'om-res' }, out, h('button', { class: 'btn btn-sm', onclick: () => copy(out.textContent.split(' ')[0]) }, icon('copy'), 'Kopiér'))),
        panel(`${L.nice(Number(st.v))} ${st.from} er også`, 'list', table));
      calc();
    }
    draw();
    return page('units', 'Værktøjer', 'Omregner', 'Omregn længde, vægt, rumfang, areal, fart, tid, data og temperatur – også tommer, pund, spiseskefulde og tønder land.', root);
  },
};

// ── Terninger ──
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };