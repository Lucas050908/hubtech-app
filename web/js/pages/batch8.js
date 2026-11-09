/** Gloser, Robotvej, Solsystemet, Køleskabet, Opsparing, Kassemand, Juveler og Rumforsvar (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';
import * as B from '../features/batch8.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const kr = (n) => `${Math.round(n).toLocaleString('da-DK')} kr.`;
const say = (t, lang) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = lang; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* */ } };

// ── Opsparing ──
export const savings = {
  title: 'Opsparing',
  async render() {
    let store;
    try { store = await appState('savings', { start: 1000, monthly: 200, rate: 3, years: 10 }); } catch (e) { return loadError('Opsparing', e); }
    const st = store.data, root = h('div');
    function draw() {
      const field = (k, label, opts) => { const el = h('input', { class: 'input', type: 'number', value: st[k], 'aria-label': label, ...opts }); el.addEventListener('input', () => { st[k] = Math.max(0, Number(el.value) || 0); store.save(); calc(); }); return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el); };
      const out = h('div');
      const calc = () => {
        const r = B.savings({ ...st, years: Math.min(60, st.years) }), max = Math.max(1, ...r.rows.map(x => x.balance));
        h(clear(out), null,
          h('div', { class: 'os-big' }, h('span', { class: 'faint' }, `Efter ${st.years} år har du`), h('b', null, kr(r.balance)), h('span', null, `Du har selv sat ${kr(r.paid)} ind – renterne har givet `, h('b', { class: 'ok' }, kr(r.interest)))),
          r.rows.length ? h('div', { class: 'os-chart', role: 'img', 'aria-label': 'Opsparingen år for år' }, r.rows.map(x => h('div', { class: 'os-col', title: `År ${x.year}: ${kr(x.balance)}` }, h('i', { class: 'os-int', style: { height: `${x.interest / max * 100}%` } }), h('i', { class: 'os-paid', style: { height: `${x.paid / max * 100}%` } }), r.rows.length <= 20 || x.year % 5 === 0 ? h('small', null, String(x.year)) : null))) : null,
          h('div', { class: 'os-legend' }, h('span', null, h('i', { class: 'os-paid' }), 'Det du har sat ind'), h('span', null, h('i', { class: 'os-int' }), 'Renter')),
          h('p', { class: 'faint', style: { fontSize: '12px' } }, 'Regnestykket er et eksempel med samme rente hele vejen og renter tilskrevet hver måned. Det er ikke økonomisk rådgivning.'));
      };
      h(clear(root), null, h('div', { class: 'os-wrap' },
        h('div', { class: 'l3-card', style: { justifyItems: 'stretch', alignContent: 'start' } }, field('start', 'Startbeløb (kr.)', { min: 0 }), field('monthly', 'Sparer hver måned (kr.)', { min: 0 }), field('rate', 'Rente pr. år (%)', { min: 0, max: 30, step: 0.1 }), field('years', 'Antal år', { min: 1, max: 60 })),
        h('div', { class: 'l3-card', style: { justifyItems: 'stretch' } }, out)));
      calc();
    }
    draw();
    return page('savings', 'Værktøjer', 'Opsparing', 'Se hvad der sker, når man sparer op hver måned – og hvordan renter på renter får pengene til at vokse over tid.', root);
  },
};
