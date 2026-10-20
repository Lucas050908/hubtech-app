/** Host page for Servicehjælp (the original app, saving to the HUBTECH account via sh-bridge.js). */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store, logActivity } from '../core/store.js';
import { api } from '../core/api.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroGhost } from '../features/apphero.js';

let onMsg = null, unsubTheme = null, frame = null;

export default {
  title: 'Servicehjælp',
  destroy() {
    try { frame?.contentWindow?.postMessage({ type: 'flush' }, location.origin); } catch { /* */ }
    removeEventListener('message', onMsg);
    unsubTheme?.();
    frame = null;
  },
  render() {
    const app = appById('servicehelp');
    const dot = h('span', { class: 'status-dot ok', title: 'Gemt på din konto' });
    frame = h('iframe', { class: 'cp-frame', src: 'apps/servicehelp/index.html', title: 'Servicehjælp', allow: 'fullscreen' });
    onMsg = (e) => {
      if (e.origin !== location.origin || e.source !== frame?.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'svc:saved') { dot.className = 'status-dot ok'; dot.title = 'Gemt på din konto'; }
      else if (d.type === 'svc:save-error') { dot.className = 'status-dot bad'; dot.title = 'Kunne ikke gemme'; toast('Servicehjælp kunne ikke gemme', { type: 'bad', text: 'Tjek at HUBTECH-serveren kører. Vi prøver igen automatisk.' }); }
      else if (d.type === 'svc:too-large') toast('For stort til at gemme', { type: 'bad', text: 'Der er for mange eller for store billeder i en del af Servicehjælp. Hent en PDF og slet gamle rapporter med fotos.' });
      else if (d.type === 'svc:unauthorized') api.get('/api/me').catch(() => {});
      else if (d.type === 'svc:scan' && /^[a-z0-9]{1,8}$/.test(d.field || '')) {
        import('../features/scanner.js').then(({ scan }) => scan({ title: 'Scan serienummeret', hint: 'Stregkoden eller QR-koden på maskinens typeskilt.' })).then((value) => {
          if (value) frame?.contentWindow?.postMessage({ type: 'svc:scan-result', field: d.field, value }, location.origin);
        });
      }
    };
    addEventListener('message', onMsg);
    unsubTheme = store.on('prefs', () => frame?.contentWindow?.postMessage({ type: 'theme', theme: document.documentElement.dataset.theme }, location.origin));
    logActivity('servicehelp', 'open', 'Servicehjælp', 'App åbnet');
    return h('div', { class: 'page cp-page', style: { '--app': app.hue } },
      appHero(app, {
        compact: true, title: 'Servicehjælp', lead: 'Servicerapporter, kalender, kunder, kørebog og udgifter – gemt på din HUBTECH-konto',
        actions: [
          h('span', { class: 'cp-hero-stat', title: 'Gemmes automatisk på din konto' }, dot, 'Synk'),
          heroGhost('', 'external', { href: 'apps/servicehelp/index.html', target: '_blank', rel: 'noopener', 'aria-label': 'Åbn i nyt vindue' })],
      }),
      frame);
  },
};
