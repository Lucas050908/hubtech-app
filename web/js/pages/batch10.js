/** Triktrak, 10.000, Sorteper, Del regningen, Navnemaskine, Skriveværksted, Cykelprøven og Kims leg (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy } from '../features/appkit.js';
import * as B from '../features/batch10.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n, cls = '') => h('span', { class: `ld-die ${cls}` }, Array.from({ length: 9 }, (_, i) => h('i', { class: n && PIPS[n].includes(i) ? 'on' : '' })));
const gamePage = (id, title, lead, g) => h('div', { class: `page dm-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow: 'Brætspil og kort', title, lead, compact: true }), g.el);

// ── Del regningen ──
export const splitbill = {
  title: 'Del regningen',
  async render() {
    let store;
    try { store = await appState('splitbill', { total: 600, people: 4, tip: 0, round: 1, mode: 'even', paid: [['Anna', 300], ['Bo', 150], ['Carl', 0]] }); } catch (e) { return loadError('Del regningen', e); }
    const st = store.data, root = h('div');
    const kr = (n) => `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.`;
    function draw() {
      let body;
      if (st.mode === 'even') {
        const out = h('div');
        const calc = () => { const r = B.splitBill(Number(st.total) || 0, Number(st.people) || 1, Number(st.tip) || 0, Number(st.round) || 1); h(clear(out), null, h('div', { class: 'os-big' }, h('span', { class: 'faint' }, 'Hver betaler'), h('b', null, kr(st.round > 1 ? r.rounded : Math.round(r.each * 100) / 100)), h('span', null, `I alt ${kr(Math.round(r.withTip * 100) / 100)}${st.round > 1 && r.extra > 0.004 ? ` · ${kr(Math.round(r.extra * 100) / 100)} til overs` : ''}`), h('button', { class: 'btn btn-sm', onclick: () => copy(String(st.round > 1 ? r.rounded : Math.round(r.each * 100) / 100)) }, icon('copy'), 'Kopiér beløbet'))); };
        const f = (k, label, attrs) => { const el = h('input', { class: 'input', type: 'number', value: st[k], 'aria-label': label, ...attrs }); el.addEventListener('input', () => { st[k] = Number(el.value); store.save(); calc(); }); return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el); };
        body = h('div', { class: 'os-wrap' }, h('div', { class: 'l3-card', style: { justifyItems: 'stretch', alignContent: 'start' } }, f('total', 'Regningen (kr.)', { min: 0, step: 'any' }), f('people', 'Antal personer', { min: 1, max: 100 }),
          h('span', { class: 'field-label' }, 'Drikkepenge'), segmented([0, 5, 10, 15].map(v => ({ value: String(v), label: `${v} %` })), String(st.tip), (v) => { st.tip = Number(v); store.save(); calc(); }, { label: 'Drikkepenge' }),
          h('span', { class: 'field-label' }, 'Rund op til'), segmented([1, 5, 10, 50].map(v => ({ value: String(v), label: v === 1 ? 'Øre' : `${v} kr.` })), String(st.round), (v) => { st.round = Number(v); store.save(); calc(); }, { label: 'Rund op' })),
          h('div', { class: 'l3-card' }, out));
        calc();
      } else {
        const rows = h('div', { class: 'stack', style: { gap: '6px' } }), out = h('div');
        const calc = () => { const paid = Object.fromEntries(st.paid.filter(p => p[0].trim()).map(p => [p[0].trim(), Number(p[1]) || 0])); const r = B.settleUp(paid);
          h(clear(out), null, h('p', { class: 'faint', style: { margin: '0 0 8px' } }, `Hver skulle betale ${kr(Math.round(r.share * 100) / 100)}`), r.out.length ? h('ul', { class: 'su-list' }, r.out.map(x => h('li', { class: 'su-slot' }, h('div', { class: 'su-b' }, h('b', null, `${x.from} → ${x.to}`)), h('b', { class: 'ok' }, kr(x.amount))))) : h('p', { class: 'ok' }, 'Alle har betalt lige meget ✓')); };
        const drawRows = () => h(clear(rows), null, st.paid.map((p, i) => { const n = h('input', { class: 'input', value: p[0], placeholder: 'Navn', 'aria-label': `Navn ${i + 1}` }), a = h('input', { class: 'input', type: 'number', value: p[1], placeholder: 'Betalt', 'aria-label': `Betalt af ${i + 1}`, style: { width: '120px' } });
          n.addEventListener('input', () => { p[0] = n.value; store.save(); calc(); }); a.addEventListener('input', () => { p[1] = Number(a.value); store.save(); calc(); });
          return h('div', { class: 'row', style: { gap: '6px' } }, n, a, st.paid.length > 2 ? h('button', { class: 'icon-btn', 'aria-label': 'Fjern', onclick: () => { st.paid.splice(i, 1); store.save(); drawRows(); calc(); } }, icon('x')) : null); }),
          h('button', { class: 'btn btn-sm', onclick: () => { st.paid.push(['', 0]); store.save(); drawRows(); } }, icon('plus'), 'Tilføj person'));
        drawRows(); calc();
        body = h('div', { class: 'os-wrap' }, h('div', { class: 'l3-card', style: { justifyItems: 'stretch', alignContent: 'start' } }, h('span', { class: 'field-label' }, 'Hvem har lagt ud?'), rows), h('div', { class: 'l3-card', style: { justifyItems: 'stretch' } }, h('b', null, 'Sådan går det lige op'), out));
      }
      h(clear(root), null, h('div', { class: 'l3-bar' }, segmented([{ value: 'even', label: 'Del ligeligt' }, { value: 'settle', label: 'Hvem skylder hvem?' }], st.mode, (v) => { st.mode = v; store.save(); draw(); }, { label: 'Visning' })), body);
    }
    draw();
    return page('splitbill', 'Værktøjer', 'Del regningen', 'Del regningen på restauranten eller turen: ligeligt med drikkepenge og oprunding – eller regn ud, hvem der skylder hvem, når I har lagt forskelligt ud.', root);
  },
};

// ── Skriveværksted ──
export const writing = {
  title: 'Skriveværksted',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('writing', { prompt: null, text: '', goal: 200, minutes: 10, stories: [] }); } catch (e) { return loadError('Skriveværksted', e); }
    const st = store.data, self = this, root = h('div');
    let ends = null;
    if (!st.prompt) st.prompt = B.PROMPTS[Math.floor(Math.random() * B.PROMPTS.length)];
    function draw() {
      const ta = h('textarea', { class: 'textarea wr-text', rows: 14, placeholder: 'Skriv løs – stavefejl er ligegyldige lige nu. Bare skriv!', 'aria-label': 'Din historie' }, st.text);
      const stats = h('div', { class: 'wr-stats' }), timer = h('b', { class: 'wr-timer' });
      const upd = () => { const c = B.textCount(ta.value), pct = Math.min(100, Math.round(c.words / (st.goal || 1) * 100)); h(clear(stats), null, h('span', null, h('b', null, String(c.words)), ` af ${st.goal} ord`), h('div', { class: 'ch-prog', style: { flex: 1 } }, h('i', { style: { width: `${pct}%` } })), h('span', { class: 'faint' }, `${c.sentences} sætninger · ${c.chars} tegn`)); };
      let saveT; ta.addEventListener('input', () => { st.text = ta.value; upd(); const sb = root.querySelector('.wr-save'); if (sb) sb.disabled = !ta.value.trim(); clearTimeout(saveT); saveT = setTimeout(() => store.save(), 600); });
      const tick = () => { if (!ends) { timer.textContent = `${st.minutes}:00`; return; } const left = Math.max(0, ends - Date.now()); timer.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; if (!left) { clearInterval(self._iv); ends = null; toast('Tiden er gået – godt skrevet! ✍️', { type: 'xp' }); } };
      h(clear(root), null,
        h('div', { class: 'wr-prompt' }, h('small', null, 'Skrivestarter'), h('p', null, st.prompt), h('button', { class: 'btn btn-sm', onclick: () => { let p; do { p = B.PROMPTS[Math.floor(Math.random() * B.PROMPTS.length)]; } while (p === st.prompt); st.prompt = p; store.save(); draw(); } }, icon('refresh'), 'En anden')),
        h('div', { class: 'l3-bar' }, h('label', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, h('span', { class: 'faint' }, 'Mål'), segmented([100, 200, 500].map(v => ({ value: String(v), label: `${v} ord` })), String(st.goal), (v) => { st.goal = Number(v); store.save(); upd(); }, { label: 'Ordmål' })),
          h('label', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, h('span', { class: 'faint' }, 'Tid'), segmented([5, 10, 20].map(v => ({ value: String(v), label: `${v} min.` })), String(st.minutes), (v) => { st.minutes = Number(v); store.save(); tick(); }, { label: 'Tid' })),
          timer, h('button', { class: 'btn btn-sm btn-primary', onclick: () => { ends = Date.now() + st.minutes * 60000; clearInterval(self._iv); self._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); tick(); }, 500); ta.focus(); } }, icon('play'), 'Start tiden')),
        ta, stats,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => copy(ta.value, 'Historien er kopieret') }, icon('copy'), 'Kopiér'),
          h('button', { class: 'btn btn-primary wr-save', disabled: !st.text.trim(), onclick: () => { st.stories.unshift({ at: Date.now(), prompt: st.prompt, text: st.text }); st.stories = st.stories.slice(0, 30); st.text = ''; store.save(); toast('Historien er gemt', { type: 'ok' }); draw(); } }, icon('check'), 'Gem historien')),
        st.stories.length ? panel('Mine historier', 'book', h('div', { class: 'stack', style: { gap: '8px' } }, st.stories.map(s => h('details', { class: 'wr-story' }, h('summary', null, h('b', null, s.text.split(/\s+/).slice(0, 8).join(' '), ' …'), h('span', { class: 'faint' }, ` · ${B.textCount(s.text).words} ord · ${new Date(s.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`)),
          h('p', { class: 'faint', style: { fontStyle: 'italic' } }, s.prompt), h('p', { style: { whiteSpace: 'pre-wrap' } }, s.text),
          h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn btn-sm', onclick: () => copy(s.text) }, icon('copy'), 'Kopiér'), h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Slet historien?', confirmLabel: 'Slet', danger: true })) { st.stories = st.stories.filter(x => x !== s); store.save(); draw(); } } }, icon('trash'), 'Slet')))))) : null);
      upd(); tick();
    }
    draw();
    return page('writing', 'Kreativ', 'Skriveværksted', 'Få en skrivestarter, sæt et ordmål og en tid – og skriv løs. Dine historier gemmes, så du kan læse dem igen.', root);
  },
};
