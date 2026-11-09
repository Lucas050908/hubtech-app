/** Prik til prik, Talrækker, Bogstaver, Tælleleg, Tegneserie, Emojigåder, Puslespil, Dagens plan, Talhukommelse og Ordsprog (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import * as B from '../features/batch11.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const score = (st) => h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(st.right)), ' rigtige'), h('span', null, h('b', null, String(st.streak)), ' i træk'), h('span', { class: 'faint' }, `rekord ${st.best}`));
const mark = (st, ok, store) => { if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.streak = 0; } store.save(); };
const say = (t) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'da-DK'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch { return false; } };
const svgEl = (t, a = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', t); for (const k in a) e.setAttribute(k, a[k]); return e; };

// ── Dagens plan ──
export const dayplan = {
  title: 'Dagens plan',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('dayplan', { items: B.DEFAULT_PLAN.map(x => x.slice()), done: {} }); } catch (e) { return loadError('Dagens plan', e); }
    const st = store.data, self = this, root = h('div');
    let edit = false;
    const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const today = () => new Date().toDateString();
    function draw() {
      st.items.sort((a, b) => a[0].localeCompare(b[0]));
      const now = B.nowIndex(st.items, hhmm()), done = st.done[today()] || [];
      if (edit) {
        const rows = st.items.map((it, i) => { const t = h('input', { class: 'input', type: 'time', value: it[0], 'aria-label': `Tid ${i + 1}`, style: { width: '110px' } }), x = h('input', { class: 'input', value: it[2], maxlength: 30, 'aria-label': `Hvad ${i + 1}` });
          t.addEventListener('change', () => { it[0] = t.value; store.save(); }); x.addEventListener('input', () => { it[2] = x.value; store.save(); });
          return h('div', { class: 'dp2-edit' }, t, h('select', { class: 'input', 'aria-label': `Billede ${i + 1}`, style: { width: '70px' }, onchange: (e) => { it[1] = e.target.value; store.save(); } }, B.PLAN_ICONS.map(ic => h('option', { value: ic, selected: ic === it[1] }, ic))), x, h('button', { class: 'icon-btn', 'aria-label': 'Fjern', onclick: () => { st.items.splice(i, 1); store.save(); draw(); } }, icon('x'))); });
        h(clear(root), null, panel('Ret planen', 'edit', h('div', { class: 'stack', style: { gap: '6px' } }, rows), h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', onclick: () => { st.items.push(['12:00', '⭐', 'Noget nyt']); store.save(); draw(); } }, icon('plus'), 'Tilføj'), h('button', { class: 'btn btn-primary', onclick: () => { edit = false; draw(); } }, icon('check'), 'Færdig'))));
        return;
      }
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, h('b', { class: 'dp2-clock' }, hhmm()), h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-sm', onclick: () => { edit = true; draw(); } }, icon('edit'), 'Ret planen')),
        h('ol', { class: 'dp2-list' }, st.items.map((it, i) => h('li', { class: ['dp2-item', i === now && 'is-now', i < now && 'is-past', done.includes(i) && 'is-done'] },
          h('span', { class: 'dp2-time' }, it[0]), h('span', { class: 'dp2-icon' }, it[1]), h('b', null, it[2]), i === now ? h('span', { class: 'chip chip-info' }, 'Nu') : null,
          h('button', { class: ['dp2-check', done.includes(i) && 'on'], 'aria-label': `Færdig: ${it[2]}`, 'aria-pressed': String(done.includes(i)), onclick: () => { const d = st.done[today()] = (st.done[today()] || []); d.includes(i) ? d.splice(d.indexOf(i), 1) : d.push(i); for (const k of Object.keys(st.done)) if (k !== today()) delete st.done[k]; store.save(); draw(); } }, done.includes(i) ? '✓' : '')))));
      setTimeout(() => root.querySelector('.dp2-item.is-now')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
    clearInterval(this._iv); this._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); if (!edit) draw(); }, 60000);
    draw();
    return page('dayplan', 'Hjemme', 'Dagens plan', 'Et overskueligt dagsskema med billeder – så alle kan se, hvad der sker nu, og hvad der kommer bagefter. Godt for børn, der har brug for overblik.', root);
  },
};
