/** Tab bar shown on every page under Guides & Læring, so all learning is one section. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { LEARN_APPS } from '../core/registry.js';

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
