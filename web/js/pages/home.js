/** Hjem — the personal start screen (logged in). */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store, refreshSummary } from '../core/store.js';
import { appById, isLearnApp } from '../core/registry.js';
import { todayPanel } from '../features/today.js';
import { appCard, profileCard, activityPanel, shortcutsPanel, worldQuickPanel, seasonStrip, projectsPreview, learningPreview, panel } from '../features/widgets.js';

let unsub = [];

export default {
  title: 'Hjem',
  focus: 0,
  destroy() { unsub.forEach(f => f()); unsub = []; },
  render() {
    const u = store.get('user');
    const first = u.displayName.split(' ')[0];
    const pinned = [...new Set([...(store.get('prefs').pinnedApps || []), 'learning'])].map(appById).filter(a => a && !isLearnApp(a)).slice(0, 4);
    const profileSlot = h('div');
    const renderProfile = (s) => profileSlot.replaceChildren(profileCard(s));
    renderProfile(store.get('summary'));
    unsub.push(store.on('summary', renderProfile));
    refreshSummary();

    const hero = h('section', { class: 'home-hero', 'aria-labelledby': 'hero-title' },
      h('h1', { id: 'hero-title', class: 'home-title' }, `${u.onboarding?.done ? 'Velkommen tilbage' : 'Velkommen'}, ${first}`),
      h('p', { class: 'home-lead' }, 'Dit digitale univers – samlet ét sted.'),
      h('p', { class: 'home-sub' }, 'Her finder du dine projekter, apps, læringsforløb og alt det, der hjælper dig med at udvikle dine idéer og færdigheder.'),
      h('div', { class: 'home-cta' },
        h('a', { class: 'btn btn-primary btn-glow', href: '#/dashboard' }, 'Gå til dashboard', icon('arrowRight'))));

    const apps = panel('Dine apps', { link: { href: '#/apps', label: 'Se alle apps' }, tour: 'home-apps' },
      h('div', { class: 'app-grid' }, pinned.map(a => appCard(a))));

    return h('div', { class: 'page home' },
      h('div', { class: 'with-rail' },
        h('div', { class: 'stack' },
          hero,
          todayPanel(),
          apps,
          h('div', { class: 'home-row' }, projectsPreview(), learningPreview()),
          seasonStrip()),
        h('aside', { class: 'rail', 'aria-label': 'Overblik' },
          profileSlot,
          activityPanel({ limit: 4 }),
          shortcutsPanel(),
          worldQuickPanel())));
  },
};
