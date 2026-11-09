/** Alle apps as a page (#/apps): the same view as the drawer from the menu, with the groups listed on the left. */
import { h } from '../core/dom.js';
import { appBrowser } from '../features/appdrawer.js';

export default {
  title: 'Apps',
  render() {
    const b = appBrowser({ mode: 'page' });
    return h('div', { class: 'page ab-page', dataset: { tour: 'launcher-grid' } },
      h('div', { class: 'page-head' },
        h('div', null, h('div', { class: 'eyebrow' }, 'Alle apps'), h('h1', null, 'Apps'),
          h('p', null, 'Søg, åbn og fastgør. Det, du fastgør, ligger i menuen til venstre – og øverst her.'))),
      b.el);
  },
};
