/** Host page for CircuitPilot (the original app, integrated via cp-bridge.js). */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store, refreshSummary, logActivity } from '../core/store.js';
import { api } from '../core/api.js';
import { getState, cpLevel } from '../core/services.js';
import { toast } from '../core/ui.js';
import { appHero, heroGhost } from '../features/apphero.js';
import { appById } from '../core/registry.js';

let onMsg = null, unsubTheme = null, frame = null;

export default {
  title: 'CircuitPilot',
  destroy() {
    try { frame?.contentWindow?.postMessage({ type: 'flush' }, location.origin); } catch { /* */ }
    removeEventListener('message', onMsg);
    unsubTheme?.();
    frame = null;
    setTimeout(refreshSummary, 400);
  },
  render() {
    const xpEl = h('span', null, '—');
    const lvEl = h('span', null, '—');
    const badgeEl = h('span', null, '—');
    const saveDot = h('span', { class: 'status-dot ok', title: 'Gemt på din konto' });
    getState('circuitpilot', { force: true }).then(s => {
      xpEl.textContent = (s?.xp || 0).toLocaleString('da-DK');
      lvEl.textContent = String(cpLevel(s?.xp || 0));
      badgeEl.textContent = String(s?.achievements?.length || 0);
    }).catch(() => {});
    frame = h('iframe', { class: 'cp-frame', src: 'apps/circuitpilot/index.html', title: 'CircuitPilot', allow: 'fullscreen' });
    onMsg = (e) => {
      if (e.origin !== location.origin || e.source !== frame?.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'cp:saved') {
        xpEl.textContent = (d.xp || 0).toLocaleString('da-DK');
        lvEl.textContent = String(cpLevel(d.xp || 0));
        badgeEl.textContent = String(d.achievements || 0);
        saveDot.className = 'status-dot ok';
        saveDot.title = 'Gemt på din konto';
      } else if (d.type === 'cp:save-error') {
        saveDot.className = 'status-dot bad';
        saveDot.title = 'Kunne ikke gemme';
        toast('CircuitPilot kunne ikke gemme', { type: 'bad', text: 'Tjek at HUBTECH-serveren kører. Vi prøver igen ved næste handling.' });
      } else if (d.type === 'cp:unauthorized') {
        api.get('/api/me').catch(() => {}); // triggers the global session-expired flow
      }
    };
    addEventListener('message', onMsg);
    unsubTheme = store.on('prefs', () => frame?.contentWindow?.postMessage({ type: 'theme', theme: document.documentElement.dataset.theme }, location.origin));
    logActivity('circuitpilot', 'open', 'CircuitPilot', 'App åbnet');

    return h('div', { class: 'page cp-page', style: { '--app': 'var(--hue-circuitpilot)' } },
      appHero(appById('circuitpilot'), {
        compact: true, title: 'CircuitPilot', lead: 'Electronics Academy · indhold på engelsk · fremskridt gemmes på din konto',
        actions: [
          h('span', { class: 'cp-hero-stat', title: 'Level' }, icon('trophy'), 'Level ', lvEl),
          h('span', { class: 'cp-hero-stat', title: 'XP' }, icon('flame'), xpEl, ' XP'),
          h('span', { class: 'cp-hero-stat hide-sm', title: 'Badges' }, icon('badge'), badgeEl),
          h('span', { class: 'cp-hero-stat', title: 'Fremskridt gemmes på din HUBTECH-konto' }, saveDot, 'Synk'),
          heroGhost('Guide', 'help', { href: '#/learn/guide/circuitpilot', class: 'btn app-hero-ghost hide-sm' }),
          heroGhost('', 'external', { href: 'apps/circuitpilot/index.html', target: '_blank', rel: 'noopener', 'aria-label': 'Åbn i nyt vindue' })],
      }),
      frame);
  },
};
