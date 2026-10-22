/** Budget – income and expenses per month, by category, with fixed items you can copy to the next month. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';

const CATS = { out: ['Bolig', 'Mad', 'Transport', 'Abonnementer', 'Telefon og internet', 'Fritid', 'Tøj', 'Opsparing', 'Andet'], in: ['Løn', 'SU', 'Salg', 'Gave', 'Andet'] };
const kr = (n) => n.toLocaleString('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 });
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthName = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('da-DK', { month: 'long', year: 'numeric' }); };
const shift = (k, n) => { const [y, m] = k.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };

export default {
  title: 'Budget',
  async render() {
    const app = appById('budget');
    let store;
    try { store = await appState('budget', { items: [] }); } catch (e) { return loadError('Budget', e); }
    const st = store.data;
    let month = monthKey(new Date()), kind = 'out';
    const head = h('h2', { class: 'panel-title bd-month' });
    const tiles = h('div', { class: 'bd-tiles' });
    const bars = h('div', { class: 'bd-bars' });
    const list = h('div', { class: 'list' });

    const items = () => st.items.filter(i => i.month === month).sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'in' ? -1 : 1));
    function draw() {
      head.textContent = monthName(month);
      const its = items();
      const inc = its.filter(i => i.kind === 'in').reduce((a, i) => a + i.amount, 0);
      const out = its.filter(i => i.kind === 'out').reduce((a, i) => a + i.amount, 0);
      h(clear(tiles), null,
        h('div', { class: 'bd-tile' }, h('span', null, 'Indtægter'), h('b', { class: 'is-in' }, kr(inc))),
        h('div', { class: 'bd-tile' }, h('span', null, 'Udgifter'), h('b', { class: 'is-out' }, kr(out))),
        h('div', { class: ['bd-tile', inc - out < 0 && 'is-neg'] }, h('span', null, inc - out >= 0 ? 'Tilbage' : 'Underskud'), h('b', null, kr(inc - out))));
      const byCat = {};
      its.filter(i => i.kind === 'out').forEach(i => { byCat[i.cat] = (byCat[i.cat] || 0) + i.amount; });
      const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...cats.map(c => c[1]));
      h(clear(bars), null, cats.length ? cats.map(([c, v]) => h('div', { class: 'bd-bar' }, h('span', null, c), h('div', { class: 'bd-track' }, h('i', { style: { width: `${v / max * 100}%` } })), h('b', null, kr(v)), h('small', { class: 'faint' }, out ? `${Math.round(v / out * 100)} %` : '')))
        : h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen udgifter denne måned.'));
      clear(list);
      if (!its.length) list.append(h('p', { class: 'faint' }, 'Ingen poster endnu. Tilføj din løn og dine faste udgifter først.'));
      its.forEach(i => {
        const del = h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${i.text || i.cat}` }, icon('trash'));
        del.addEventListener('click', () => { st.items = st.items.filter(x => x.id !== i.id); store.save(); draw(); });
        list.append(h('div', { class: 'row' },
          h('span', { class: ['row-icon', i.kind === 'in' && 'solid'] }, icon(i.kind === 'in' ? 'download' : 'upload')),
          h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, i.text || i.cat), h('div', { class: 'row-sub' }, `${i.cat}${i.fixed ? ' · fast' : ''}`)),
          h('b', { class: i.kind === 'in' ? 'bd-in' : 'bd-out' }, `${i.kind === 'in' ? '+' : '−'} ${kr(i.amount)}`), del));
      });
    }
    // add
    const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'Beløb (kr.)', 'aria-label': 'Beløb' });
    const text = h('input', { class: 'input', placeholder: 'Tekst – fx Husleje', maxlength: 60, 'aria-label': 'Tekst' });
    const cat = h('select', { class: 'select', 'aria-label': 'Kategori' });
    const fixed = h('input', { type: 'checkbox', 'aria-label': 'Fast hver måned' });
    const fillCats = () => { clear(cat); CATS[kind].forEach(c => cat.append(h('option', { value: c }, c))); };
    const kindSeg = segmented([{ value: 'out', label: 'Udgift' }, { value: 'in', label: 'Indtægt' }], kind, (v) => { kind = v; fillCats(); }, { label: 'Type' });
    fillCats();
    const add = () => {
      const a = Math.round(Number(String(amount.value).replace(',', '.')) * 100) / 100;
      if (!(a > 0)) { amount.focus(); toast('Skriv et beløb', { type: 'warn' }); return; }
      st.items.push({ id: uid(), month, kind, amount: a, cat: cat.value, text: text.value.trim(), fixed: fixed.checked });
      amount.value = ''; text.value = ''; store.save(); draw(); amount.focus();
    };
    [amount, text].forEach(x => x.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); }));
    const copyFixed = () => {
      const prev = st.items.filter(i => i.month === shift(month, -1) && i.fixed);
      const have = new Set(items().map(i => `${i.kind}|${i.cat}|${i.text}`));
      const add_ = prev.filter(i => !have.has(`${i.kind}|${i.cat}|${i.text}`));
      if (!add_.length) { toast(prev.length ? 'De faste poster er allerede her' : 'Ingen faste poster i sidste måned', { type: 'info' }); return; }
      add_.forEach(i => st.items.push({ ...i, id: uid(), month }));
      store.save(); draw(); toast(`${add_.length} faste poster kopieret`, { type: 'ok' });
    };
    draw();
    return h('div', { class: 'page bd-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Arbejdsrum', title: 'Budget', lead: 'Hold styr på pengene: indtægter og udgifter pr. måned, hvad du bruger mest på, og hvad der er tilbage.' }),
      panel(null, null,
        h('div', { class: 'bd-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Forrige måned', onclick: () => { month = shift(month, -1); draw(); } }, icon('chevronLeft')), head,
          h('button', { class: 'icon-btn', 'aria-label': 'Næste måned', onclick: () => { month = shift(month, 1); draw(); } }, icon('chevronRight')),
          h('button', { class: 'btn btn-sm', onclick: copyFixed, title: 'Kopiér poster markeret som faste fra måneden før' }, icon('copy'), 'Hent faste poster')),
        tiles),
      h('div', { class: 'bd-layout' },
        panel('Tilføj', 'plus', kindSeg, h('div', { class: 'bd-form' }, amount, text, cat,
          h('label', { class: 'bd-fixed' }, fixed, h('span', null, 'Fast hver måned')), h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj'))),
        panel('Hvad går pengene til?', 'chart', bars)),
      panel('Poster', 'list', list));
  },
};
