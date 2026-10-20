/** App launcher: every registered app, its status and requirements; pin to sidebar. */
import { h, clear } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { store, setPref } from '../core/store.js';
import { APPS, LEARN_APPS, access, isLearnApp } from '../core/registry.js';
import { getIntegrations } from '../core/services.js';
import { appCard } from '../features/widgets.js';
import { segmented, toast } from '../core/ui.js';

const CATS = [{ value: 'all', label: 'Alle' }, { value: 'workspace', label: 'Arbejdsrum' }, { value: 'system', label: 'System' }];

export default {
  title: 'Apps',
  render() {
    let cat = 'all';
    const grid = h('div', { class: 'launcher-grid', dataset: { tour: 'launcher-grid' } });
    const integ = { cursor: null, byteforge: null };
    getIntegrations().then((d) => {
      integ.cursor = d.cursor; integ.byteforge = d.byteforge;
      draw();
    }).catch(() => {});

    function requirement(app) {
      if (app.requires?.integration === 'cursor') {
        const c = integ.cursor;
        if (!c) return h('span', { class: 'chip' }, h('span', { class: 'status-dot' }), 'Tjekker…');
        if (c.restricted) return h('span', { class: 'chip' }, icon('lock'), 'Kun ejer');
        return c.cursorInstalled ? h('span', { class: 'chip chip-ok' }, h('span', { class: 'status-dot ok' }), 'Cursor fundet') : h('span', { class: 'chip chip-warn' }, h('span', { class: 'status-dot warn' }), 'Kræver opsætning');
      }
      if (app.requires?.integration === 'byteforge') {
        return h('span', { class: 'chip' }, icon('plug'), 'Forbindes til din server');
      }
      return null;
    }

    function draw() {
      clear(grid);
      const user = store.get('user');
      const pinned = store.get('prefs').pinnedApps || [];
      for (const app of APPS.filter(a => !isLearnApp(a) && (cat === 'all' || a.category === cat || (cat === 'workspace' && a.id === 'learning')))) {
        const acc = access(app, user);
        const isPinned = pinned.includes(app.id);
        const pin = h('button', { class: ['btn', 'btn-sm', isPinned ? 'btn-app' : 'btn-ghost'], style: { '--app': app.hue }, 'aria-pressed': String(isPinned), disabled: !acc.ok, html: svg(isPinned ? 'check' : 'plus') + `<span>${isPinned ? 'Fastgjort' : 'Fastgør i menu'}</span>` });
        pin.addEventListener('click', () => {
          const cur = store.get('prefs').pinnedApps || [];
          const next = cur.includes(app.id) ? cur.filter(x => x !== app.id) : [...cur, app.id];
          setPref('pinnedApps', next);
          toast(cur.includes(app.id) ? `${app.name} fjernet fra menuen` : `${app.name} fastgjort i menuen`, { type: 'ok', ms: 2200 });
          draw();
        });
        grid.appendChild(h('div', { class: 'launcher-item', style: { '--app': app.hue } },
          appCard(app, { compact: true }),
          h('div', { class: 'launcher-meta' },
            h('p', { class: 'muted' }, app.description),
            h('div', { class: 'launcher-chips' },
              h('span', { class: 'chip chip-app' }, { workspace: 'Arbejdsrum', learning: 'Læring', system: 'System' }[app.category]),
              app.status === 'coming' ? h('span', { class: 'chip chip-warn' }, 'Kommer snart') : app.status === 'beta' ? h('span', { class: 'chip chip-info' }, 'Beta') : null,
              requirement(app)),
            h('div', { class: 'launcher-actions' }, pin))));
      }
    }
    draw();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null, h('div', { class: 'eyebrow' }, 'App-launcher'), h('h1', null, 'Apps'), h('p', null, 'Alle platformens apps samlet ét sted. Fastgør dem, du bruger mest, så de ligger i menuen.')),
        h('div', { class: 'page-head-actions' }, segmented(CATS, cat, (v) => { cat = v; draw(); }, { label: 'Kategori' }))),
      h('a', { class: 'callout launcher-learn', href: '#/learn', style: { marginBottom: '18px' } }, icon('book'),
        h('div', null, h('strong', null, 'Al læring er samlet i Guides & Læring. '), `${LEARN_APPS.map(a => a.name).join(', ')} samt kurser og guides ligger dér – med faner øverst.`)),
      grid,
      h('div', { class: 'callout', style: { marginTop: '24px' } }, icon('rocket'),
        h('div', null, h('strong', null, 'Plads til nye apps. '), 'En ny app tilføjes med én registrering i app-registret – navigation, søgning og launcher følger med automatisk. ', h('a', { href: '#/learn/guide/add-app', style: { color: 'var(--accent)', fontWeight: 800 } }, 'Se hvordan →'))));
  },
};
