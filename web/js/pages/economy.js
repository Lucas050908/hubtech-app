/** Økonomi – budget, savings, the piggy bank, shared expenses, splitting the bill and loans in one app (a tab each). */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { appGlyph } from '../core/appicons.js';

export default {
  title: 'Økonomi',
  render() {
    const app = appById('economy');
    const parts = (app.parts || []).map(appById).filter(Boolean);
    return h('div', { class: 'page eco-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Økonomi', title: 'Økonomi', lead: 'Alt om penge ét sted. Vælg en fane foroven – eller start her.', compact: true }),
      h('div', { class: 'eco-grid' }, parts.map(a => h('a', { class: 'eco-card', href: a.route, style: { '--app': a.hue } },
        h('span', { class: 'ab-ico ab-ico-lg' }, appGlyph(a)), h('span', { class: 'eco-t' }, h('b', null, a.name), h('small', null, a.tagline)), icon('arrowRight')))));
  },
};
