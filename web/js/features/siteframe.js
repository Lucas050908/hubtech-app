/** Runs one of the original websites (web/sites/*) or an external panel inside the platform frame. */
import { h } from '../core/dom.js';
import { appById } from '../core/registry.js';
import { appHero, heroGhost } from './apphero.js';

export function siteFrame({ app, title, subtitle, src, hue, iconName, back, actions = [], note }) {
  const base = (typeof app === 'string' ? appById(app) : app) || { id: 'site', name: title, icon: iconName || 'globe', hue: hue || 'var(--accent)', art: { season: 'summer', time: 'dusk' } };
  const heroApp = { ...base, icon: iconName || base.icon, hue: hue || base.hue };
  const frame = h('iframe', { class: 'site-frame', src, title, loading: 'eager', referrerpolicy: 'same-origin' });
  const loader = h('div', { class: 'site-loading' }, h('span', { class: 'spinner' }), h('span', null, `Indlæser ${title}…`));
  frame.addEventListener('load', () => loader.remove());
  return h('div', { class: 'page site-page', style: { '--app': heroApp.hue } },
    appHero(heroApp, {
      compact: true, back, title, lead: subtitle,
      actions: [...actions, heroGhost('Nyt vindue', 'external', { href: src, target: '_blank', rel: 'noopener' })],
    }),
    note || null,
    h('div', { class: 'site-frame-wrap' }, loader, frame));
}
