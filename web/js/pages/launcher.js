/** App launcher: every registered app, its status and requirements; pin to sidebar. */
import { h, clear } from '../core/dom.js';
import { icon, tileIcon, svg } from '../core/icons.js';
import { store, setPref } from '../core/store.js';
import { APPS, LEARN_APPS, SUITES, appById, access, isLearnApp, visible, suiteOf, entryApp } from '../core/registry.js';
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
        return h('span', { class: 'chip' }, icon('plug'), 'Kører på HUBTECH-serveren');
      }
      return null;
    }

    function draw() {
      clear(grid);
      const user = store.get('user');
      const pinned = store.get('prefs').pinnedApps || [];
      for (const raw of APPS.filter(a => !isLearnApp(a) && visible(a, user) && (!suiteOf(a.id) || suiteOf(a.id).members[0] === a.id) && (cat === 'all' || a.category === cat || (cat === 'workspace' && a.id === 'learning')))) {
        const app = entryApp(raw);
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

    // ── quick find: search every single app, the ones you used last, and the topics ──
    const user0 = store.get('user');
    const usable = (a) => a && a.page && visible(a, user0) && access(a, user0).ok;
    const tile = (a) => h('a', { class: 'lx-tile', href: a.route, style: { '--app': a.hue }, title: a.tagline || a.name }, h('span', { class: 'lx-ico' }, tileIcon(a.icon)), h('span', { class: 'lx-name' }, a.name));
    const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const found = h('div', { class: 'lx-found' });
    const search = h('input', { class: 'input lx-search', type: 'search', placeholder: `Søg blandt ${APPS.filter(usable).length} apps – fx “skak”, “gloser” eller “indkøb”`, 'aria-label': 'Søg efter en app', autocomplete: 'off' });
    const browse = h('div', { class: 'lx-browse' });
    const doSearch = () => {
      const q = norm(search.value.trim());
      if (!q) { found.hidden = true; browse.hidden = false; grid.hidden = false; return; }
      const hits = APPS.filter(usable).map(a => { const name = norm(a.name), hay = norm([a.tagline, a.description, ...(a.keywords || [])].join(' ')); const sc = name.startsWith(q) ? 3 : name.includes(q) ? 2 : hay.includes(q) ? 1 : 0; return { a, sc }; }).filter(x => x.sc).sort((x, y) => y.sc - x.sc || x.a.name.localeCompare(y.a.name, 'da'));
      found.hidden = false; browse.hidden = true; grid.hidden = true;
      h(clear(found), null, hits.length ? h('div', { class: 'lx-tiles' }, hits.slice(0, 40).map(x => tile(x.a))) : h('p', { class: 'faint' }, `Ingen apps matcher “${search.value.trim()}”.`));
    };
    search.addEventListener('input', doSearch);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = found.querySelector('a'); if (first) location.hash = first.getAttribute('href'); } });
    let recent = []; try { recent = JSON.parse(localStorage.getItem('hubtech.recentApps') || '[]').map(appById).filter(usable).slice(0, 8); } catch { /* */ }
    const topics = SUITES.map(s => ({ s, apps: s.members.map(appById).filter(usable) })).filter(t => t.apps.length > 1);
    h(browse, null,
      recent.length ? h('section', { class: 'lx-sec' }, h('h2', { class: 'lx-h' }, icon('clock'), 'Senest brugt'), h('div', { class: 'lx-tiles' }, recent.map(tile))) : null,
      h('section', { class: 'lx-sec' }, h('h2', { class: 'lx-h' }, icon('grid'), 'Emner'),
        h('div', { class: 'lx-topics' }, topics.map(({ s, apps }) => h('details', { class: 'lx-topic', style: { '--app': s.hue } },
          h('summary', null, h('span', { class: 'lx-ico' }, tileIcon(s.icon)), h('span', { class: 'lx-tt' }, h('b', null, s.name), h('small', null, `${apps.length} apps`)), icon('chevronDown')),
          h('div', { class: 'lx-tiles' }, apps.map(tile)))))),
      h('h2', { class: 'lx-h', style: { marginTop: '8px' } }, icon('apps'), 'Alle apps'));
    found.hidden = true;

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null, h('div', { class: 'eyebrow' }, 'App-launcher'), h('h1', null, 'Apps'), h('p', null, 'Alle platformens apps samlet ét sted. Fastgør dem, du bruger mest, så de ligger i menuen.')),
        h('div', { class: 'page-head-actions' }, segmented(CATS, cat, (v) => { cat = v; draw(); }, { label: 'Kategori' }))),
      h('div', { class: 'lx-searchbar' }, icon('search'), search), found, browse,
      h('a', { class: 'callout launcher-learn', href: '#/learn', style: { marginBottom: '18px' } }, icon('book'),
        h('div', null, h('strong', null, 'Al læring er samlet i Guides & Læring. '), `${LEARN_APPS.map(a => a.name).join(', ')} samt kurser og guides ligger dér – med faner øverst.`)),
      grid,
      h('div', { class: 'callout', style: { marginTop: '24px' } }, icon('rocket'),
        h('div', null, h('strong', null, 'Plads til nye apps. '), 'En ny app tilføjes med én registrering i app-registret – navigation, søgning og launcher følger med automatisk. ', h('a', { href: '#/learn/guide/add-app', style: { color: 'var(--accent)', fontWeight: 800 } }, 'Se hvordan →'))));
  },
};
