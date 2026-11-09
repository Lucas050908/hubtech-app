/** Home: Fødselsdage, Pakkeliste, Udlån and Plantepasser (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';
import * as H from '../features/home2.js';

const page = (id, title, lead, body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow: 'Hjemme', title, lead, compact: true }), body);
const empty = (emoji, title, text) => h('div', { class: 'sh-empty' }, h('span', { class: 'qz-big' }, emoji), h('b', null, title), h('span', { class: 'faint' }, text));
const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const dayName = (d) => d.toLocaleDateString('da-DK', { weekday: 'long' });
const fmtDate = (d) => `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
const del = async (what, fn) => { if (await confirmDialog({ title: `Slet “${what}”?`, confirmLabel: 'Slet', danger: true })) fn(); };
const dateInput = (label, value = '') => h('input', { class: 'input', type: 'date', value, 'aria-label': label });
const toISO = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromISO = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : null; };

// ── Udlån ──
export const loans = {
  title: 'Udlån',
  async render() {
    let store;
    try { store = await appState('loans', { items: [] }); } catch (e) { return loadError('Udlån', e); }
    const st = store.data, root = h('div');
    let view = 'out';
    const LBL = { late: 'For sent', soon: 'Snart', out: 'Udlånt', back: 'Afleveret' };
    function draw() {
      const what = h('input', { class: 'input', maxlength: 60, placeholder: 'Hvad? Fx Harry-bog, boremaskine', 'aria-label': 'Hvad er lånt ud' });
      const who = h('input', { class: 'input', maxlength: 40, placeholder: 'Hvem?', 'aria-label': 'Hvem' });
      const dir = { v: 'lent' };
      const due = dateInput('Afleveres senest', toISO(Date.now() + 14 * 86400000));
      const add = () => {
        if (!what.value.trim() || !who.value.trim()) return toast('Skriv hvad og hvem', { type: 'warn' });
        st.items.unshift({ id: uid(), what: what.value.trim(), who: who.value.trim(), dir: dir.v, at: Date.now(), due: fromISO(due.value), back: null }); store.save(); view = 'out'; draw();
      };
      const items = st.items.filter(i => (view === 'back') === !!i.back).sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
      const late = st.items.filter(i => H.loanStatus(i) === 'late').length;
      h(clear(root), null,
        panel('Nyt udlån', 'plus', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
          segmented([{ value: 'lent', label: 'Jeg lånte ud' }, { value: 'borrowed', label: 'Jeg lånte' }], 'lent', (v) => { dir.v = v; who.placeholder = v === 'lent' ? 'Til hvem?' : 'Fra hvem?'; }, { label: 'Retning' }),
          what, who, h('label', { class: 'ln-due' }, h('span', { class: 'faint' }, 'Senest'), due), h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj'))),
        h('div', { class: 'cmd-filters', style: { margin: '12px 0' } }, segmented([{ value: 'out', label: `Ude nu (${st.items.filter(i => !i.back).length})` }, { value: 'back', label: 'Afleveret' }], view, (v) => { view = v; draw(); }, { label: 'Visning' }),
          late ? h('span', { class: 'ln-late-chip' }, icon('alert'), `${late} for sent`) : null),
        items.length ? h('ul', { class: 'ln-list' }, items.map(i => { const s = H.loanStatus(i), days = i.due ? H.daysBetween(Date.now(), i.due) : null;
          return h('li', { class: `ln-item is-${s}` },
            h('span', { class: 'ln-dir', title: i.dir === 'lent' ? 'Lånt ud' : 'Lånt' }, i.dir === 'lent' ? '↗' : '↙'),
            h('div', { class: 'ln-b' }, h('b', null, i.what), h('span', { class: 'faint' }, `${i.dir === 'lent' ? 'Lånt ud til' : 'Lånt af'} ${i.who} · ${new Date(i.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`)),
            h('span', { class: `ln-status is-${s}` }, s === 'back' ? `Afleveret ${new Date(i.back).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}` : days == null ? LBL[s] : days < 0 ? `${-days} ${days === -1 ? 'dag' : 'dage'} for sent` : days === 0 ? 'Senest i dag' : `${days} ${days === 1 ? 'dag' : 'dage'} tilbage`),
            i.back ? h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${i.what}`, onclick: () => del(i.what, () => { st.items = st.items.filter(x => x !== i); store.save(); draw(); }) }, icon('trash'))
              : h('button', { class: 'btn btn-sm', onclick: () => { i.back = Date.now(); store.save(); toast(`${i.what} er afleveret`, { type: 'ok' }); draw(); } }, icon('check'), 'Afleveret'));
        })) : empty(view === 'back' ? '📦' : '🤝', view === 'back' ? 'Intet afleveret endnu' : 'Intet er lånt ud', 'Skriv det ned, når du låner en bog, et spil eller værktøj ud – så ved du hvem der har det, og hvornår det skal tilbage.'));
    }
    draw();
    return page('loans', 'Udlån', 'Hold styr på hvad du har lånt ud – og hvad du selv har lånt. Se hvad der er for sent, og hvem der har det.', root);
  },
};
