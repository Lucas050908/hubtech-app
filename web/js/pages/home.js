/** Hjem — the personal start screen (logged in). */
import { h, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { icon } from '../core/icons.js';
import { store, refreshSummary } from '../core/store.js';
import { appById, isLearnApp, entryApps, access, visible } from '../core/registry.js';
import { todayPanel } from '../features/today.js';
import { widgetPrefs, openCustomize } from '../features/topwidgets.js';
import { appCard, profileCard, activityPanel, shortcutsPanel, worldQuickPanel, seasonStrip, projectsPreview, learningPreview, panel } from '../features/widgets.js';

let unsub = [];

export default {
  title: 'Hjem',
  focus: 0,
  destroy() { unsub.forEach(f => f()); unsub = []; },
  render() {
    const u = store.get('user');
    const first = u.displayName.split(' ')[0];
    const pinned = entryApps([...new Set([...(store.get('prefs').pinnedApps || []), 'learning'])]).filter(a => !isLearnApp(a)).slice(0, 4);
    const profileSlot = h('div');
    const renderProfile = (s) => profileSlot.replaceChildren(profileCard(s));
    renderProfile(store.get('summary'));
    unsub.push(store.on('summary', renderProfile));
    refreshSummary();

    // a big clock like on a desk – the desert design's calm overview
    const clock = h('div', { class: 'home-clock', 'aria-hidden': 'true' });
    const tick = () => { const d = new Date(); clock.textContent = d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }); };
    tick();
    const clockTimer = setInterval(() => { if (!clock.isConnected) { clearInterval(clockTimer); return; } tick(); }, 15000);
    unsub.push(() => clearInterval(clockTimer));
    const hero = h('section', { class: 'home-hero', 'aria-labelledby': 'hero-title' },
      clock,
      h('h1', { id: 'hero-title', class: 'home-title' }, `${u.onboarding?.done ? 'Velkommen tilbage' : 'Velkommen'}, ${first}`),
      h('p', { class: 'home-lead' }, 'Dit digitale univers – samlet ét sted.'),
      h('p', { class: 'home-sub' }, 'Her finder du dine projekter, apps, læringsforløb og alt det, der hjælper dig med at udvikle dine idéer og færdigheder.'),
      h('div', { class: 'home-cta' },
        h('a', { class: 'btn btn-primary btn-glow', href: '#/dashboard' }, 'Gå til dashboard', icon('arrowRight')),
        h('button', { type: 'button', class: 'btn btn-ghost home-customize', onclick: () => openCustomize() }, icon('sliders'), 'Tilpas forsiden')));

    const apps = panel('Dine apps', { link: { href: '#/apps', label: 'Se alle apps' }, tour: 'home-apps' },
      h('div', { class: 'app-grid' }, pinned.map(a => appCard(a))));

    // the apps you opened last – one click back to them
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('hubtech.recentApps') || '[]').map(appById).filter(a => a && a.page && visible(a, u) && access(a, u).ok).slice(0, 6); } catch { /* */ }
    const recentRow = recent.length ? h('div', { class: 'home-recent' }, h('span', { class: 'faint' }, icon('clock'), ' Senest brugt'),
      h('div', { class: 'home-recent-row' }, recent.map(a => h('a', { class: 'home-recent-app', href: a.route, style: { '--app': a.hue } }, h('span', { class: 'lx-ico' }, icon(a.icon)), h('span', null, a.name))))) : null;
    if (recentRow) apps.append(recentRow);

    // together with others: visit connected HUBTECHs, invite friends
    const together = h('div');
    api.get('/api/hublink').then((hi) => {
      const go = (l) => import('./hubs.js').then(m => m.visit(l));
      const body = u.guestOf ? [h('p', { class: 'muted', style: { margin: 0 } }, `Du er på besøg fra ${u.guestOf.name}.`), h('button', { class: 'btn btn-primary', onclick: () => go({ id: u.guestOf.id, name: u.guestOf.name }) }, icon('home'), 'Tilbage til min HUBTECH')]
        : [hi.links.length ? h('div', { class: 'home-hubs' }, hi.links.slice(0, 4).map(l => h('button', { class: 'home-hub', onclick: () => go(l) }, h('span', { class: 'hl-logo' }, '🏠'), h('span', null, h('b', null, l.name), h('small', { class: 'faint' }, 'Besøg med din egen konto')), icon('arrowRight')))) : null,
          u.role === 'owner' ? h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, h('a', { class: 'btn btn-sm', href: '#/hubs' }, icon('user'), 'Invitér en ven'), h('a', { class: 'btn btn-sm', href: '#/hubs' }, icon('link'), hi.links.length ? `Alle forbindelser (${hi.links.length})` : 'Forbindelser'))
            : null,
          !hi.links.length ? h('p', { class: 'faint', style: { margin: 0 } }, 'Andre HUBTECH’er dukker op her af sig selv, når de bliver fundet. Indtil da: spil og del med de andre her under Sammen og Brætspil.') : null];
      h(together, null, panel('Sammen med andre', { link: { href: '#/hubs', label: 'Forbindelser' } }, h('div', { class: 'stack', style: { gap: '10px' } }, body)));
    }).catch(() => {});

    // every card can be switched off under "Tilpas" (prefs.widgets.home)
    const cards = {
      hero, today: todayPanel(), apps, together, previews: h('div', { class: 'home-row' }, projectsPreview(), learningPreview()), seasons: seasonStrip(),
      profile: profileSlot, activity: activityPanel({ limit: 4 }), shortcuts: shortcutsPanel(), world: worldQuickPanel(),
    };
    const hiddenNote = h('p', { class: 'faint home-empty on-world', hidden: true }, 'Alle kort er slået fra. ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openCustomize() }, icon('sliders'), 'Vælg kort'));
    const rail = h('aside', { class: 'rail', 'aria-label': 'Overblik' }, cards.profile, cards.activity, cards.shortcuts, cards.world);
    const applyCards = () => {
      const show = widgetPrefs().home;
      for (const [k, el] of Object.entries(cards)) el.hidden = !show[k];
      rail.hidden = !['profile', 'activity', 'shortcuts', 'world'].some(k => show[k]);
      layout.classList.toggle('no-rail', rail.hidden);
      hiddenNote.hidden = Object.keys(cards).some(k => show[k]);
    };
    const layout = h('div', { class: 'with-rail' },
      h('div', { class: 'stack' }, cards.hero, cards.today, cards.apps, cards.together, cards.previews, cards.seasons),
      rail);
    unsub.push(store.on('prefs', applyCards));
    applyCards();
    return h('div', { class: 'page home' }, hiddenNote, layout);
  },
};
