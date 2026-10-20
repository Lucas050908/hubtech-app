/** Guide reader. */
import { h } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { store, setPref, logActivity } from '../core/store.js';
import { appById } from '../core/registry.js';
import { guideById, GUIDES, GUIDE_CATEGORIES } from '../data/guides.js';
import { stateBlock, toast } from '../core/ui.js';
import { guideCard } from './learn.js';

function section(s) {
  const out = [];
  if (s.h) out.push(h('h2', { class: 'g-h' }, s.h));
  if (s.p) out.push(h('p', { class: 'g-p' }, s.p));
  if (s.list) out.push(h('ul', { class: 'g-list' }, s.list.map(x => h('li', null, x))));
  if (s.table) out.push(h('div', { class: 'g-table' }, h('table', null, h('tbody', null, s.table.map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', null, b)))))));
  if (s.steps) out.push(h('ol', { class: 'g-steps' }, s.steps.map((st, i) => h('li', { class: 'g-step' },
    h('span', { class: 'g-step-n' }, String(i + 1)),
    h('div', null,
      h('h3', null, st.t),
      st.d ? h('p', { class: 'muted' }, st.d) : null,
      st.code ? codeBlock(st.code) : null,
      st.tip ? h('div', { class: 'callout', style: { marginTop: '10px' } }, icon('sparkles'), h('div', null, st.tip)) : null)))));
  if (s.callout) out.push(h('div', { class: ['callout', s.callout.kind === 'warn' ? 'warn' : ''], style: { margin: '16px 0' } }, icon(s.callout.kind === 'warn' ? 'alert' : 'info'), h('div', null, s.callout.text)));
  return out;
}

function codeBlock(code) {
  const copy = h('button', { class: 'icon-btn btn-sm code-copy', 'aria-label': 'Kopiér', html: svg('copy') });
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); toast('Kopieret', { type: 'ok', ms: 1200 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } });
  return h('div', { class: 'code-wrap' }, h('pre', { class: 'code' }, code), copy);
}

export default {
  title: 'Guide',
  render(ctx) {
    const g = guideById(ctx.params.id);
    if (!g) return h('div', { class: 'page' }, stateBlock({ icon: 'book', title: 'Guiden findes ikke', actions: [h('a', { class: 'btn btn-primary', href: '#/learn' }, 'Alle guides')] }));
    this.title = g.title;
    const app = appById(g.app);
    const cat = GUIDE_CATEGORIES.find(c => c.id === g.category);
    logActivity('learning', 'guide', g.title, 'Guide læst', g.id);
    const saved = () => (store.get('prefs').savedGuides || []).includes(g.id);
    const saveBtn = h('button', { class: 'btn' });
    const drawSave = () => { saveBtn.innerHTML = svg(saved() ? 'starFill' : 'star') + `<span>${saved() ? 'Gemt' : 'Gem guide'}</span>`; saveBtn.setAttribute('aria-pressed', String(saved())); };
    drawSave();
    saveBtn.addEventListener('click', () => {
      const cur = store.get('prefs').savedGuides || [];
      setPref('savedGuides', saved() ? cur.filter(x => x !== g.id) : [...cur, g.id]);
      drawSave();
      toast(saved() ? 'Guide gemt' : 'Guide fjernet fra gemte', { type: 'ok', ms: 1600 });
    });
    const actions = (g.actions || []).map(a => {
      if (a.tour) return h('button', { class: 'btn btn-primary', onclick: () => { location.hash = '#/'; setTimeout(() => import('../features/onboarding.js').then(m => m.startOnboarding({ restart: true })), 450); } }, icon('sparkles'), a.label);
      return h('a', { class: 'btn', href: a.href, target: a.external ? '_blank' : null, rel: a.external ? 'noopener' : null }, a.label, icon(a.external ? 'external' : 'arrowRight'));
    });
    if (g.show) {
      actions.unshift(h('button', { class: 'btn btn-primary', onclick: () => {
        location.hash = g.show.route;
        setTimeout(() => import('../features/onboarding.js').then(m => {
          const ok = m.spotlight(g.show.target, { title: g.title, text: g.summary });
          if (!ok) toast('Elementet er ikke synligt på denne skærm', { type: 'warn', text: 'Prøv et større vindue, eller åbn menuen.' });
        }), 900);
      } }, icon('compass'), 'Vis mig'));
    }
    const related = GUIDES.filter(x => x.category === g.category && x.id !== g.id).slice(0, 3);
    return h('div', { class: 'page guide-page', style: { '--app': app?.hue || 'var(--accent)' } },
      h('div', { class: 'page-head' },
        h('div', null,
          h('div', { class: 'crumbs' }, h('a', { href: '#/learn' }, 'Guides & Læring'), icon('chevronRight'), h('span', null, cat?.label)),
          h('h1', null, g.title),
          h('p', null, g.summary),
          h('div', { class: 'gc-meta', style: { marginTop: '12px' } }, h('span', { class: 'chip' }, icon('clock'), `${g.minutes} min læsning`), app ? h('span', { class: 'chip chip-app' }, app.name) : null)),
        h('div', { class: 'page-head-actions' }, saveBtn)),
      h('article', { class: 'glass panel guide-body' },
        (g.sections || []).flatMap(section),
        g.faq ? h('div', { class: 'faq' }, g.faq.map(([q, a]) => h('details', { class: 'faq-item' }, h('summary', null, q, icon('chevronDown')), h('p', { class: 'muted' }, a)))) : null,
        actions.length ? h('div', { class: 'guide-actions' }, actions) : null),
      related.length ? h('section', { style: { marginTop: '28px' } }, h('h2', { class: 'guide-cat' }, 'Relaterede guides'), h('div', { class: 'guide-grid' }, related.map(guideCard))) : null);
  },
};
