/** Regnemaskine – a calculator with history, a unit converter, percent and VAT, and loans and savings. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy } from '../features/appkit.js';
import * as C from '../features/calc.js';

const KEYS = [
  ['C', '(', ')', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['0', ',', '⌫', '='],
];
const SCI = ['√', '^', '!', '%', 'π', 'sin', 'cos', 'tan', 'log', 'ln'];
const kr = (n) => `${C.fmt(Math.round(n * 100) / 100, 2)} kr.`;

export default {
  title: 'Regnemaskine',
  destroy() { removeEventListener('keydown', this._k); },
  async render(ctx) {
    const app = appById('calculator');
    let store;
    try { store = await appState('calculator', { history: [], deg: true }); } catch (e) { return loadError('Regnemaskine', e); }
    const st = store.data, self = this;
    st.history = st.history || [];
    const first = ['calc', 'convert', 'percent', 'loan'].includes(ctx?.params?.sub) ? ctx.params.sub : 'calc';
    const body = h('div', { class: 'stack' });
    removeEventListener('keydown', self._k);
    const num = (inp) => Number(String(inp.value).replace(/\./g, '').replace(',', '.'));
    const field = (label, el, after) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), after ? h('div', { class: 'row', style: { gap: '6px' } }, el, h('span', { class: 'faint' }, after)) : el);
    const numIn = (value, label, w = '150px') => h('input', { class: 'input', inputmode: 'decimal', value, 'aria-label': label, style: { width: w } });

    function calcTab() {
      const input = h('input', { class: 'input calc-input', 'aria-label': 'Regnestykke', placeholder: '0', autocomplete: 'off', spellcheck: 'false' });
      const result = h('output', { class: 'calc-result', 'aria-live': 'polite' });
      const hist = h('ol', { class: 'calc-hist' });
      let justDone = false;
      const preview = () => {
        if (!input.value.trim()) { result.textContent = ''; result.classList.remove('is-err'); return; }
        try { result.textContent = `= ${C.fmt(C.evaluate(input.value, { deg: st.deg }))}`; result.classList.remove('is-err'); }
        catch { result.textContent = ''; }
      };
      const run = () => {
        if (!input.value.trim()) return;
        try {
          const v = C.evaluate(input.value, { deg: st.deg });
          st.history = [{ expr: input.value.trim(), v }, ...st.history].slice(0, 30); store.save();
          input.value = C.fmt(v).replace(/\./g, ''); result.textContent = ''; justDone = true; drawHist();
        } catch (e) { result.textContent = e.message; result.classList.add('is-err'); }
      };
      const put = (k) => {
        if (k === 'C') { input.value = ''; preview(); return; }
        if (k === '⌫') { input.value = input.value.slice(0, -1); preview(); return; }
        if (k === '=') { run(); return; }
        const t = ['sin', 'cos', 'tan', 'log', 'ln', '√'].includes(k) ? `${k}(` : k;
        if (justDone && /^[\d,(πs√clt]/.test(t)) input.value = '';      // a new number after "=" starts over
        justDone = false;
        input.value += t; preview(); input.focus();
      };
      function drawHist() {
        h(clear(hist), null, st.history.length ? st.history.map(x => h('li', null, h('button', { class: 'calc-h', onclick: () => { input.value = x.expr; preview(); input.focus(); } },
          h('span', { class: 'faint' }, x.expr), h('b', null, `= ${C.fmt(x.v)}`)))) : h('li', { class: 'faint' }, 'Dine udregninger kommer her.'));
      }
      input.addEventListener('input', () => { justDone = false; preview(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); run(); } if (e.key === 'Escape') { input.value = ''; preview(); } });
      drawHist();
      const degSeg = segmented([{ value: 'deg', label: 'Grader' }, { value: 'rad', label: 'Radianer' }], st.deg ? 'deg' : 'rad', (v) => { st.deg = v === 'deg'; store.save(); preview(); }, { label: 'Vinkler' });
      setTimeout(() => input.focus(), 50);
      return [h('div', { class: 'calc-wrap' },
        h('div', { class: 'calc-pad' },
          h('div', { class: 'calc-screen' }, input, result),
          h('div', { class: 'calc-sci' }, SCI.map(k => h('button', { class: 'calc-key is-fn', onclick: () => put(k) }, k))),
          h('div', { class: 'calc-keys' }, KEYS.flat().map(k => h('button', { class: ['calc-key', /[÷×−+]/.test(k) && 'is-op', k === '=' && 'is-eq', k === 'C' && 'is-clear'], 'aria-label': { '⌫': 'Slet', C: 'Ryd', '÷': 'Divider', '×': 'Gange', '−': 'Minus' }[k] || k, onclick: () => put(k) }, k === '⌫' ? icon('arrowLeft') : k))),
          h('div', { class: 'row', style: { justifyContent: 'space-between', gap: '8px' } }, degSeg,
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { try { copy(C.fmt(C.evaluate(input.value, { deg: st.deg }))); } catch { /* */ } } }, icon('copy'), 'Kopiér'))),
        panel('Historik', 'clock', hist, st.history.length ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { st.history = []; store.save(); drawHist(); } }, icon('trash'), 'Ryd') : null)),
      h('p', { class: 'faint' }, 'Du kan også skrive med tastaturet: * og / virker som gange og divider, ^ er potens, ! er fakultet. Enter giver resultatet.')];
    }

    function convertTab() {
      let group = 'length';
      const box = h('div');
      const draw = () => {
        const units = Object.keys(C.UNIT_GROUPS[group].units);
        const val = numIn('1', 'Værdi');
        const from = h('select', { class: 'select', 'aria-label': 'Fra' }, units.map(u => h('option', { value: u }, u)));
        const out = h('div', { class: 'nc-units' });
        from.value = { length: 'm', weight: 'kg', volume: 'l', area: 'm²', speed: 'km/t', time: 'time', temp: '°C', energy: 'kcal' }[group];
        const calc = () => {
          const v = num(val);
          h(clear(out), null, units.filter(u => u !== from.value).map(u => h('div', { class: 'nc-unit' }, h('b', null, isFinite(v) ? C.fmt(C.convertUnit(v, group, from.value, u), 6) : '–'), h('span', { class: 'faint' }, u))));
        };
        val.addEventListener('input', calc); from.addEventListener('change', calc);
        calc();
        h(clear(box), null, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, val, from), out);
      };
      const seg = segmented(Object.entries(C.UNIT_GROUPS).map(([value, g]) => ({ value, label: g.label })), group, (v) => { group = v; draw(); }, { label: 'Hvad' });
      draw();
      return [panel('Omregner', 'refresh', h('div', { class: 'cm-seg-scroll', style: { marginBottom: '12px' } }, seg), box)];
    }

    function percentTab() {
      const card = (title, ic, inputs, out, calc) => { inputs.forEach(i => i.addEventListener('input', calc)); calc(); return panel(title, ic, h('div', { class: 'calc-form' }, inputs.map(i => field(i.getAttribute('aria-label'), i))), out); };
      // VAT
      const vAmount = numIn('1.000', 'Beløb'), vRate = numIn('25', 'Momssats', '80px');
      let incl = true;
      const vOut = h('div', { class: 'calc-out' });
      const vCalc = () => { const r = C.vat(num(vAmount), num(vRate), incl); h(clear(vOut), null, [['Uden moms', r.net], ['Moms', r.vat], ['Med moms', r.gross]].map(([l, x]) => h('div', null, h('span', { class: 'faint' }, l), h('b', null, isFinite(x) ? kr(x) : '–')))); };
      const inclSeg = segmented([{ value: 'incl', label: 'Beløbet er med moms' }, { value: 'excl', label: 'uden moms' }], 'incl', (v) => { incl = v === 'incl'; vCalc(); }, { label: 'Moms' });
      [vAmount, vRate].forEach(i => i.addEventListener('input', vCalc)); vCalc();
      // x % of y
      const pA = numIn('15', 'Procent', '90px'), pB = numIn('640', 'Af'), pOut = h('p', { class: 'calc-line' });
      const pCalc = () => { pOut.textContent = `${C.fmt(num(pA))} % af ${C.fmt(num(pB))} er ${C.fmt(C.percentOf(num(pA), num(pB)), 4)}`; };
      // x is what % of y
      const wA = numIn('45', 'Del', '110px'), wB = numIn('180', 'Hele', '110px'), wOut = h('p', { class: 'calc-line' });
      const wCalc = () => { const r = C.whatPercent(num(wA), num(wB)); wOut.textContent = isFinite(r) ? `${C.fmt(num(wA))} er ${C.fmt(r, 2)} % af ${C.fmt(num(wB))}` : '–'; };
      // change
      const cA = numIn('80', 'Før', '110px'), cB = numIn('100', 'Efter', '110px'), cOut = h('p', { class: 'calc-line' });
      const cCalc = () => { const r = C.change(num(cA), num(cB)); cOut.textContent = isFinite(r) ? `Fra ${C.fmt(num(cA))} til ${C.fmt(num(cB))} er ${r >= 0 ? 'en stigning' : 'et fald'} på ${C.fmt(Math.abs(r), 2)} %` : '–'; };
      // discount
      const dP = numIn('499', 'Pris', '110px'), dR = numIn('20', 'Rabat i procent', '80px'), dOut = h('p', { class: 'calc-line' });
      const dCalc = () => { const r = C.discount(num(dP), num(dR)); dOut.textContent = `Du sparer ${kr(r.save)} og betaler ${kr(r.pay)}`; };
      return [panel('Moms', 'file', h('div', { class: 'calc-form' }, field('Beløb', vAmount, 'kr.'), field('Sats', vRate, '%'), inclSeg), vOut),
        h('div', { class: 'calc-cards' },
          card('Procent af', 'sigma', [pA, pB], pOut, pCalc),
          card('Hvor mange procent?', 'chart', [wA, wB], wOut, wCalc),
          card('Stigning eller fald', 'chart', [cA, cB], cOut, cCalc),
          card('Rabat', 'tag', [dP, dR], dOut, dCalc))];
    }

    function loanTab() {
      const amount = numIn('200.000', 'Lånebeløb'), rate = numIn('6', 'Rente', '80px'), years = numIn('5', 'Løbetid', '80px');
      const out = h('div'), table = h('div');
      const calc = () => {
        const l = C.loan(num(amount), num(rate), num(years));
        if (!l) { h(clear(out), null, h('p', { class: 'faint' }, 'Skriv beløb, rente og løbetid.')); clear(table); return; }
        h(clear(out), null, h('div', { class: 'calc-out' }, [['Pr. måned', l.pay], ['I alt', l.total], ['Heraf renter', l.interest]].map(([t, x]) => h('div', null, h('span', { class: 'faint' }, t), h('b', null, kr(x))))));
        h(clear(table), null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'nc-table' }, h('thead', null, h('tr', null, ['År', 'Renter', 'Afdrag', 'Restgæld'].map(x => h('th', null, x)))),
          h('tbody', null, l.rows.map(r => h('tr', null, h('td', null, String(r.year)), h('td', null, kr(r.interest)), h('td', null, kr(r.paid)), h('td', null, kr(r.left))))))));
      };
      [amount, rate, years].forEach(i => i.addEventListener('input', calc)); calc();
      const sStart = numIn('0', 'Startbeløb'), sMonth = numIn('1.000', 'Pr. måned'), sRate = numIn('3', 'Rente', '80px'), sYears = numIn('10', 'År', '80px');
      const sOut = h('div');
      const sCalc = () => { const r = C.savings(num(sStart), num(sMonth), num(sRate), num(sYears)); h(clear(sOut), null, h('div', { class: 'calc-out' }, [['Til sidst', r.end], ['Sat ind', r.paidIn], ['Renter', r.interest]].map(([t, x]) => h('div', null, h('span', { class: 'faint' }, t), h('b', null, isFinite(x) ? kr(x) : '–'))))); };
      [sStart, sMonth, sRate, sYears].forEach(i => i.addEventListener('input', sCalc)); sCalc();
      return [panel('Lån', 'calculator', h('div', { class: 'calc-form' }, field('Beløb', amount, 'kr.'), field('Rente', rate, '% om året'), field('Løbetid', years, 'år')), out, table,
          h('p', { class: 'faint' }, 'Beregnet som et annuitetslån med samme ydelse hver måned. Gebyrer og bidrag er ikke med, så ÅOP fra banken vil være højere.')),
        panel('Opsparing', 'trophy', h('div', { class: 'calc-form' }, field('Start', sStart, 'kr.'), field('Hver måned', sMonth, 'kr.'), field('Rente', sRate, '% om året'), field('I', sYears, 'år')), sOut)];
    }

    const TABS = { calc: calcTab, convert: convertTab, percent: percentTab, loan: loanTab };
    const open = (id) => { history.replaceState(null, '', `#/apps/calculator${id === 'calc' ? '' : `/${id}`}`); h(clear(body), null, TABS[id]()); };
    const seg = segmented([{ value: 'calc', label: 'Lommeregner', icon: 'calculator' }, { value: 'convert', label: 'Omregner', icon: 'refresh' }, { value: 'percent', label: 'Procent og moms', icon: 'sigma' }, { value: 'loan', label: 'Lån og opsparing', icon: 'chart' }], first, open, { label: 'Vælg' });
    h(body, null, TABS[first]());
    return h('div', { class: 'page calc-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Værktøjer', title: 'Regnemaskine', lead: 'Lommeregner med historik, omregning af enheder, moms og procent – og hvad et lån eller en opsparing giver.', compact: true }),
      h('div', { class: 'cmd-filters', style: { marginBottom: '16px' } }, seg), body);
  },
};
