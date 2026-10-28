/** Tab bar shown on every page under Guides & Læring, so all learning is one section. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { LEARN_APPS, appById } from '../core/registry.js';

export function learnTabs(path) {
  const tabs = [
    { href: '#/learn', label: 'Oversigt', icon: 'book', hue: 'var(--hue-learn)', on: path === '/learn' || /^\/learn\/(guide|course)(\/|$)/.test(path) },
    ...LEARN_APPS.map(a => ({ href: a.route, label: a.name, icon: a.icon, hue: a.hue, on: path === a.route.slice(1) || path.startsWith(a.route.slice(1) + '/') })),
  ];
  const nav = h('nav', { class: 'learn-tabs', 'aria-label': 'Guides & Læring' },
    tabs.map(t => h('a', { class: ['learn-tab', t.on && 'is-on'], href: t.href, 'aria-current': t.on ? 'page' : null, style: { '--app': t.hue } }, icon(t.icon), h('span', null, t.label))));
  // on a phone the bar scrolls sideways – keep the current tab visible (without scrolling the page)
  requestAnimationFrame(() => { const on = nav.querySelector('.is-on'); if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; });
  return nav;
}

/** Tabs for an app group (Planlæg, Service, HUBTECH Office) – same look as Guides & Læring. */
export function suiteTabs(suite, path) {
  const members = suite.members.map(appById).filter(Boolean);
  // a big group (Spilhal has 40): a button that shows them all as a grid you can search in
  const all = members.length > 9 ? h('button', { class: 'learn-tab suite-all', 'aria-label': `Alle i ${suite.name}`, onclick: () => showAll(suite, members, path) }, icon('grid'), h('span', null, `Alle ${members.length}`)) : null;
  const nav = h('nav', { class: 'learn-tabs suite-tabs', 'aria-label': suite.name }, all,
    members.map(a => {
      const on = path === a.route.slice(1) || path.startsWith(a.route.slice(1) + '/');
      return h('a', { class: ['learn-tab', on && 'is-on'], href: a.route, 'aria-current': on ? 'page' : null, style: { '--app': a.hue } }, icon(a.icon), h('span', null, a.name));
    }));
  requestAnimationFrame(() => { const on = nav.querySelector('.is-on'); if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; });
  return nav;
}

function showAll(suite, members, path) {
  import('../core/ui.js').then(({ modal }) => {
    const q = h('input', { class: 'input', type: 'search', placeholder: `Søg i ${suite.name}`, 'aria-label': `Søg i ${suite.name}` });
    const grid = h('div', { class: 'lx-tiles suite-grid' });
    const norm = (t) => String(t || '').toLowerCase();
    const draw = () => grid.replaceChildren(...members.filter(a => !q.value.trim() || norm(a.name).includes(norm(q.value.trim())) || (a.keywords || []).some(k => norm(k).includes(norm(q.value.trim())))).map(a => h('a', { class: ['lx-tile', (path === a.route.slice(1) || path.startsWith(a.route.slice(1) + '/')) && 'is-on'], href: a.route, style: { '--app': a.hue }, onclick: () => m.close() }, h('span', { class: 'lx-ico' }, icon(a.icon)), h('span', { class: 'lx-name' }, a.name))));
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = grid.querySelector('a'); if (f) { location.hash = f.getAttribute('href'); m.close(); } } });
    const m = modal({ title: suite.name, label: suite.name, size: 720, body: h('div', { class: 'stack', style: { gap: '12px' } }, q, grid) });
    draw(); setTimeout(() => q.focus(), 50);
  });
}
