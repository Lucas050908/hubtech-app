/**
 * App banner — carries the Hjem/dashboard look into every app:
 * the app's own tinted landscape, its icon tile, title, actions and live stats.
 *
 *   appHero(app, { eyebrow, title, lead, actions, stats, compact, back })
 *   stats: [{ icon, label, value }]  – value can be a string or a node that updates itself
 */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { paintStill } from '../world/controller.js';

export function appHero(app, { eyebrow, title, lead, actions = [], stats = [], compact = false, back = null } = {}) {
  const art = h('canvas', { class: 'app-hero-art', 'aria-hidden': 'true' });
  requestAnimationFrame(() => paintStill(art, { ...app.art, landscape: 'valley', zoom: 0.62, focusY: compact ? 0.36 : 0.3 }));
  return h('section', { class: ['app-hero', compact && 'is-compact'], style: { '--app': app.hue }, 'data-app': app.id, 'aria-label': title || app.name },
    art,
    h('span', { class: 'app-hero-shade', 'aria-hidden': 'true' }),
    h('div', { class: 'app-hero-body' },
      back ? h('a', { class: 'icon-btn app-hero-back', href: back.href, 'aria-label': back.label || 'Tilbage' }, icon('arrowLeft')) : null,
      h('span', { class: 'app-card-icon app-hero-icon' }, icon(app.icon)),
      h('div', { class: 'app-hero-text' },
        eyebrow ? h('div', { class: 'app-hero-eyebrow' }, eyebrow) : null,
        h('h1', null, title || app.name),
        lead ? h('p', null, lead) : null),
      actions.length ? h('div', { class: 'app-hero-actions' }, ...actions) : null),
    stats.length ? h('div', { class: 'app-hero-stats' }, stats.filter(Boolean).map(s => h('div', { class: 'app-hero-stat' },
      h('span', { class: 'ahs-icon' }, icon(s.icon || 'info')),
      h('div', null, h('div', { class: 'ahs-value' }, s.value), h('div', { class: 'ahs-label' }, s.label))))) : null);
}

/** A glowing primary button in the app's own colour (used inside app heroes). */
export function heroBtn(label, iconName, attrs = {}) {
  return h(attrs.href ? 'a' : 'button', { class: 'btn app-hero-btn', ...attrs }, iconName ? icon(iconName) : null, label);
}
export function heroGhost(label, iconName, attrs = {}) {
  return h(attrs.href ? 'a' : 'button', { class: 'btn app-hero-ghost', ...attrs }, iconName ? icon(iconName) : null, label);
}
