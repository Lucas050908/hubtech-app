/** Personal dashboard: progression, getting-started checklist, favorites, integrations, history. */
import { h, clear, timeAgo, animateNumber } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { store, refreshSummary, DEFAULT_WORLD } from '../core/store.js';
import { appById, APPS } from '../core/registry.js';
import { getState, getProjects, getIntegrations, courseProgress } from '../core/services.js';
import { guideById } from '../data/guides.js';
import { COURSE } from '../data/course-servicetekniker.js';
import { activityRow } from '../core/shell.js';
import { panel, projectRow } from '../features/widgets.js';
import { progressBar, skeletonRows } from '../core/ui.js';

let unsub = [];

function progressPanel(s) {
  const pct = Math.round(s.levelXp / s.levelSize * 100);
  const total = h('span', { class: 'big-num' }, '0');
  const b = s.breakdown;
  const max = Math.max(1, b.circuitpilot, b.courses, b.onboarding, b.codeschool || 0, b.flashcards || 0);
  const src = [['CircuitPilot', b.circuitpilot, 'var(--hue-circuitpilot)', 'circuit'], ['Kurser', b.courses, 'var(--hue-course)', 'graduation'], ['Kodeskolen', b.codeschool || 0, 'var(--hue-codeschool)', 'code'], ['Huskekort', b.flashcards || 0, 'var(--hue-flashcards)', 'layers'], ['Introduktion', b.onboarding, 'var(--accent)', 'sparkles']];
  const p = h('section', { class: 'glass panel progress-panel', dataset: { tour: 'progress' } },
    h('div', { class: 'pp-ring' },
      h('div', { class: 'ring-progress', style: { '--v': pct, '--size': '132px' } }, h('div', { style: { textAlign: 'center' } }, h('div', { class: 'faint', style: { fontSize: '.7rem', fontWeight: 800, letterSpacing: '.12em' } }, 'LEVEL'), h('div', { style: { font: '700 2.2rem/1 var(--font-display)' } }, String(s.level))))),
    h('div', { class: 'pp-main' },
      h('div', { class: 'eyebrow' }, 'Din progression'),
      h('div', { class: 'pp-total' }, total, h('span', { class: 'faint' }, ' XP i alt')),
      h('div', { class: 'faint', style: { fontSize: 'var(--fs-sm)', marginBottom: '14px' } }, `${(s.levelSize - s.levelXp).toLocaleString('da-DK')} XP til level ${s.level + 1}`),
      h('div', { class: 'xp-sources' }, src.map(([n, v, c, ic]) => h('div', { class: 'xp-src', style: { '--app': c } },
        h('div', { class: 'xp-src-top' }, h('span', null, h('span', { html: svg(ic), class: 'xp-ic' }), n), h('span', { class: 'mono' }, `${v.toLocaleString('da-DK')} XP`)),
        progressBar(v / max * 100, { app: c }))))));
  requestAnimationFrame(() => animateNumber(total, s.xp));
  return p;
}

function checklist(items) {
  const done = items.filter(i => i.done).length;
  return panel('Kom godt i gang', {},
    h('div', { class: 'ch-row', style: { marginBottom: '10px' } }, h('span', { class: 'faint' }, `${done} af ${items.length} klaret`), h('span', { class: 'mono faint' }, `${Math.round(done / items.length * 100)} %`)),
    progressBar(done / items.length * 100),
    h('ul', { class: 'checklist' }, items.map(i => h('li', null, h('a', { class: ['check-item', i.done && 'is-done'], href: i.href },
      h('span', { class: 'check-box', html: svg(i.done ? 'check' : 'chevronRight') }),
      h('span', null, h('b', null, i.t), h('span', { class: 'faint' }, i.s)))))));
}

export default {
  title: 'Dashboard',
  destroy() { unsub.forEach(f => f()); unsub = []; },
  render() {
    const user = store.get('user');
    const owner = user.role === 'owner';
    const progSlot = h('div', null, h('div', { class: 'skel', style: { height: '200px', borderRadius: 'var(--r-lg)' } }));
    const drawProg = (s) => { if (s) progSlot.replaceChildren(progressPanel(s)); };
    drawProg(store.get('summary'));
    unsub.push(store.on('summary', drawProg));
    refreshSummary();

    const checkSlot = h('div', null, h('div', { class: 'skel', style: { height: '260px', borderRadius: 'var(--r-lg)' } }));
    const favList = h('div', { class: 'list' }, skeletonRows(2));
    const integList = h('div', { class: 'list' }, skeletonRows(3));
    const actList = h('div', { class: 'timeline' }, skeletonRows(4));

    Promise.all([
      getState('circuitpilot').catch(() => null),
      getState(COURSE.stateId).catch(() => null),
      owner ? getProjects().catch(() => null) : Promise.resolve(null),
    ]).then(([cp, cs, pd]) => {
      const pr = courseProgress(cs);
      const favs = store.get('favorites');
      const w = store.get('prefs').world;
      const personalised = Object.keys(DEFAULT_WORLD).some(k => k !== 'lat' && w[k] !== DEFAULT_WORLD[k]);
      const items = [
        { t: 'Gennemfør introduktionen', s: 'En kort rundvisning af platformen', done: user.onboarding.done, href: '#/settings/profile' },
        { t: 'Start opstartskurset', s: 'Kryds din første øvelse af', done: pr.done > 0, href: `#/learn/course/${COURSE.id}/day/1` },
        { t: 'Prøv CircuitPilot', s: 'Svar på et quizspørgsmål eller lav et lab', done: !!cp && ((cp.stats?.qT || 0) > 0 || (cp.stats?.labsDone || []).length > 0 || cp.xp > 0), href: '#/learn/circuitpilot' },
        owner ? { t: 'Forbind dine projekter', s: 'Cursor eller en projektmappe', done: !!pd && pd.projects?.length > 0, href: '#/projects' } : null,
        { t: 'Gør verdenen til din egen', s: 'Vælg årstid, vejr eller lysstyrke', done: personalised, href: '#/settings/world' },
        { t: 'Markér en favorit', s: 'Stjernemarkér en app eller et projekt', done: favs.length > 0 || !!pd?.projects?.some(p => p.meta?.favorite), href: '#/apps' },
      ].filter(Boolean);
      checkSlot.replaceChildren(checklist(items));

      clear(favList);
      const rows = [];
      favs.filter(f => f.kind === 'app').forEach(f => { const a = appById(f.ref); if (a) rows.push(h('a', { class: 'row', href: a.route, style: { '--app': a.hue } }, h('span', { class: 'row-icon' }, icon(a.icon)), h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, a.name), h('div', { class: 'row-sub' }, a.tagline)), h('span', { class: 'row-end' }, icon('chevronRight')))); });
      (store.get('prefs').savedGuides || []).forEach(id => { const g = guideById(id); if (g) rows.push(h('a', { class: 'row', href: `#/learn/guide/${g.id}`, style: { '--app': 'var(--hue-learn)' } }, h('span', { class: 'row-icon' }, icon(g.icon)), h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, g.title), h('div', { class: 'row-sub' }, 'Gemt guide')), h('span', { class: 'row-end' }, icon('chevronRight')))); });
      (pd?.projects || []).filter(p => p.meta?.favorite).slice(0, 5).forEach(p => rows.push(projectRow(p)));
      if (!rows.length) favList.appendChild(h('p', { class: 'faint' }, 'Stjernemarkér apps, guides og projekter for at samle dem her.'));
      rows.forEach(r => favList.appendChild(r));
    });

    getIntegrations().then(async (d) => {
      clear(integList);
      const item = (ic, name, dot, text, href) => h('a', { class: 'row', href }, h('span', { class: 'row-icon' }, icon(ic)), h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, name), h('div', { class: 'row-sub' }, text)), h('span', { class: 'row-end' }, h('span', { class: ['status-dot', dot] }), icon('chevronRight')));
      if (d.cursor.restricted) integList.appendChild(item('cube', 'Cursor', '', 'Kun for platformens ejer', '#/projects'));
      else integList.appendChild(item('cube', 'Cursor', d.cursor.cursorInstalled ? 'ok' : 'warn', d.cursor.cursorInstalled ? `Forbundet${d.cursor.cli ? ' · åbner direkte' : ' · via link'}` : 'Ikke fundet på denne maskine – kræver opsætning', '#/projects'));
      const bfRow = item('anvil', 'ByteForge', '', 'Tjekker…', '#/apps/byteforge');
      integList.appendChild(bfRow);
      integList.appendChild(item('hubtech', 'HUBTECH-site', (d.hubtechSite.url || d.hubtechSite.bundled) ? 'ok' : 'warn', d.hubtechSite.url || (d.hubtechSite.bundled ? 'Indbygget · 7 moduler klar' : 'Moduler ikke forbundet'), '#/apps/hubtech'));
      try {
        const r = await api.get('/api/integrations/byteforge/check');
        bfRow.replaceWith(item('anvil', 'ByteForge', r.state === 'online' ? 'ok' : r.state === 'not_configured' ? 'warn' : 'bad', r.state === 'online' ? `Online · ${r.url}` : r.state === 'not_configured' ? 'Ingen adresse angivet' : `Offline · ${r.url}`, '#/apps/byteforge'));
      } catch { /* leave as is */ }
    }).catch(() => { clear(integList).appendChild(h('p', { class: 'faint' }, 'Kunne ikke hente status.')); });

    api.get('/api/activity?limit=40').then(({ activity }) => {
      clear(actList);
      if (!activity.length) { actList.appendChild(h('p', { class: 'faint' }, 'Ingen historik endnu.')); return; }
      let lastDay = '';
      for (const a of activity) {
        const d = new Date(a.at * 1000);
        const key = d.toDateString();
        if (key !== lastDay) {
          lastDay = key;
          const today = new Date().toDateString(), yest = new Date(Date.now() - 86400000).toDateString();
          actList.appendChild(h('div', { class: 'tl-day' }, key === today ? 'I dag' : key === yest ? 'I går' : d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })));
        }
        actList.appendChild(activityRow(a));
      }
    }).catch(() => { clear(actList).appendChild(h('p', { class: 'faint' }, 'Historikken kunne ikke hentes.')); });

    const quickApps = APPS.filter(a => a.status === 'available' && (a.id !== 'cursor' || owner)).slice(0, 6);
    return h('div', { class: 'page dashboard' },
      h('div', { class: 'page-head' },
        h('div', null, h('div', { class: 'eyebrow' }, 'Personligt dashboard'), h('h1', null, 'Dit overblik'), h('p', null, 'Fremdrift, favoritter, integrationer og historik – samlet ét sted.')),
        h('div', { class: 'page-head-actions' }, quickApps.slice(0, 3).map(a => h('a', { class: 'btn btn-app', href: a.route, style: { '--app': a.hue } }, icon(a.icon), a.name)))),
      h('div', { class: 'dash-grid' },
        h('div', { class: 'dash-a' }, progSlot),
        h('div', { class: 'dash-b' }, checkSlot),
        h('div', { class: 'dash-c' }, panel('Favoritter', { icon: 'star' }, favList)),
        h('div', { class: 'dash-d' }, panel('Integrationer', { icon: 'plug', link: { href: '#/settings/integrations', label: 'Indstil' } }, integList)),
        h('div', { class: 'dash-e', id: 'activity' }, panel('Historik', { icon: 'clock' }, actList))));
  },
};
