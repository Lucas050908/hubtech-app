/** Reusable dashboard widgets shared by Home and Dashboard. */
import { h, clear, timeAgo, animateNumber } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { store, setWorld, toggleFavorite, isFavorite, setPref } from '../core/store.js';
import { APPS, appById, access } from '../core/registry.js';
import { api } from '../core/api.js';
import { getProjects, getState, courseProgress } from '../core/services.js';
import { paintStill, describeWorld } from '../world/controller.js';
import { SEASONS, SEASON_LABEL, SEASON_ICON, WEATHER_LABEL } from '../world/palettes.js';
import { activityRow } from '../core/shell.js';
import { progressBar, stateBlock, switchControl, setRangeFill, toast, skeletonRows } from '../core/ui.js';
import { COURSE } from '../data/course-servicetekniker.js';

export function panel(title, { link, icon: ic, tour, cls } = {}, ...body) {
  return h('section', { class: ['glass', 'panel', cls], dataset: tour ? { tour } : null },
    h('div', { class: 'panel-head' },
      h('h2', { class: 'panel-title' }, ic ? icon(ic) : null, title),
      link ? h('a', { class: 'panel-link', href: link.href }, link.label, icon('arrowRight')) : null),
    body);
}

export function appCard(app, { compact = false } = {}) {
  const user = store.get('user');
  const acc = access(app, user);
  const cv = h('canvas', { class: 'app-card-art', 'aria-hidden': 'true' });
  const fav = h('button', { class: 'icon-btn app-card-fav', 'aria-pressed': String(isFavorite('app', app.id)), 'aria-label': `Favorit: ${app.name}` }, icon(isFavorite('app', app.id) ? 'starFill' : 'star'));
  fav.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    try {
      const on = await toggleFavorite('app', app.id);
      fav.setAttribute('aria-pressed', String(on));
      fav.innerHTML = svg(on ? 'starFill' : 'star');
    } catch (err) { toast('Kunne ikke gemme favorit', { type: 'bad', text: err.message }); }
  });
  const el = h(acc.ok ? 'a' : 'div', {
    class: ['app-card', compact && 'is-compact', !acc.ok && 'is-locked'], href: acc.ok ? app.route : null,
    style: { '--app': app.hue }, 'aria-label': acc.ok ? `${app.name} – ${app.tagline}` : `${app.name} – ${acc.reason}`,
    dataset: { app: app.id },
  },
  h('div', { class: 'app-card-media' }, cv, h('div', { class: 'app-card-shade' }), h('span', { class: 'app-card-icon' }, icon(app.icon))),
  h('div', { class: 'app-card-body' },
    h('h3', { class: 'app-card-name' }, app.name),
    h('p', { class: 'app-card-tag' }, app.tagline),
    h('span', { class: 'app-card-cta' }, acc.ok ? h('span', null, 'Åbn app') : h('span', null, acc.reason), icon(acc.ok ? 'arrowRight' : acc.kind === 'coming' ? 'clock' : 'lock'))),
  acc.ok ? fav : null);
  requestAnimationFrame(() => paintStill(cv, { ...app.art, landscape: 'valley' }));
  return el;
}

export function profileCard(summary) {
  const u = store.get('user');
  const s = summary || { level: 1, levelXp: 0, levelSize: 1000, xp: 0, badges: 0, streak: 0 };
  const pct = Math.round(s.levelXp / s.levelSize * 100);
  const lvl = h('span', null, String(s.level));
  const xp = h('span', null, '0');
  const card = h('section', { class: 'glass panel profile-card', dataset: { tour: 'progress' } },
    h('div', { class: 'profile-top' },
      h('span', { class: 'avatar avatar-lg' }, u.avatar),
      h('div', { class: 'profile-id' },
        h('div', { class: 'profile-name' }, u.displayName),
        h('div', { class: 'faint profile-mail' }, u.email || '@' + u.username),
        h('span', { class: 'chip chip-info', style: { marginTop: '6px' } }, u.role === 'owner' ? 'Ejer' : 'Medlem'))),
    h('div', { class: 'profile-level' },
      h('div', { class: 'profile-level-row' }, h('b', null, 'Level ', lvl), h('span', { class: 'mono faint' }, xp, ` / ${s.levelSize.toLocaleString('da-DK')} XP`)),
      progressBar(pct, { lg: true })),
    h('div', { class: 'grid-4 profile-stats' },
      stat('folder', 'Projekter', s.organizedProjects ?? 0, '#/projects'),
      stat('graduation', 'Kurser', s.coursesActive ?? 0, '#/learn'),
      stat('badge', 'Badges', s.badges ?? 0, '#/learn/circuitpilot'),
      stat('flame', 'Dage i træk', s.streak ?? 0, '#/learn/circuitpilot')));
  requestAnimationFrame(() => animateNumber(xp, s.levelXp));
  return card;
}

function stat(ic, label, value, href) {
  return h('a', { class: 'stat', href }, icon(ic), h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, String(value)));
}

export function activityPanel({ limit = 5, title = 'Seneste aktiviteter' } = {}) {
  const list = h('div', { class: 'list' }, skeletonRows(3));
  const p = panel(title, { link: { href: '#/dashboard', label: 'Se alle' } }, list);
  api.get(`/api/activity?limit=${limit}`).then(({ activity }) => {
    clear(list);
    if (!activity.length) list.appendChild(h('p', { class: 'faint', style: { padding: '8px 4px' } }, 'Når du åbner apps, projekter og kurser, dukker det op her.'));
    activity.forEach(a => list.appendChild(activityRow(a)));
  }).catch(() => { clear(list); list.appendChild(h('p', { class: 'faint' }, 'Aktivitet kunne ikke hentes.')); });
  return p;
}

export function shortcutsPanel() {
  const items = [
    { ic: 'kanban', t: 'Opgaver', s: 'Dit board – hvad er næste skridt?', href: '#/apps/tasks', hue: '#ff4f8b' },
    { ic: 'note', t: 'Noter', s: 'Skriv en idé ned', href: '#/apps/notes', hue: '#ffa63d' },
    { ic: 'tool', t: 'Servicehjælp', s: 'Ny servicerapport', href: '#/apps/servicehelp', hue: '#ff8a4c' },
    { ic: 'folder', t: 'Åbn projekt', s: 'Vælg fra dine projekter', href: '#/projects', hue: '#22c55e' },
  ];
  return panel('Hurtige genveje', {}, h('div', { class: 'list' }, items.map(i => h('a', { class: 'row shortcut', href: i.href, style: { '--app': i.hue } },
    h('span', { class: 'row-icon solid' }, icon(i.ic)),
    h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, i.t), h('div', { class: 'row-sub' }, i.s)),
    h('span', { class: 'row-end' }, icon('chevronRight'))))));
}

export function worldQuickPanel() {
  const w = () => store.get('prefs').world;
  const auto = switchControl({ checked: w().seasonMode === 'auto', label: 'Automatisk årstid', id: 'wq-auto', onChange: (v) => setWorld({ seasonMode: v ? 'auto' : 'manual', season: describeWorld().season }) });
  const range = h('input', { class: 'range', type: 'range', min: 0, max: 1, step: 0.05, value: w().intensity, 'aria-label': 'Animationernes intensitet' });
  setRangeFill(range);
  range.addEventListener('input', () => { setRangeFill(range); setWorld({ intensity: Number(range.value) }); });
  const weather = h('select', { class: 'select select-bare', 'aria-label': 'Vejreffekter' },
    Object.entries(WEATHER_LABEL).map(([k, v]) => h('option', { value: k, selected: w().weather === k }, v)));
  weather.addEventListener('change', () => setWorld({ weather: weather.value }));
  return h('section', { class: 'glass panel world-quick', dataset: { tour: 'world-quick' } },
    h('div', { class: 'wq-row' }, h('div', null, h('b', null, 'Automatisk årstid'), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Baseret på dato og din placering')), auto),
    h('div', { class: 'wq-row' }, h('b', null, 'Animationer'), h('div', { style: { width: '55%' } }, range)),
    h('div', { class: 'wq-row' }, h('b', null, 'Vejreffekter'), weather));
}

export function seasonStrip() {
  const cur = describeWorld();
  const wrap = h('div', { class: 'season-strip glass', role: 'radiogroup', 'aria-label': 'Vælg årstid', dataset: { tour: 'seasons' } });
  for (const s of SEASONS) {
    const cv = h('canvas', { 'aria-hidden': 'true' });
    const b = h('button', { class: 'season-tile', role: 'radio', 'aria-checked': String(cur.season === s), dataset: { season: s } },
      cv, h('span', { class: 'season-tile-label' }, icon(SEASON_ICON[s]), SEASON_LABEL[s]));
    b.addEventListener('click', () => {
      setWorld({ seasonMode: 'manual', season: s });
      wrap.querySelectorAll('.season-tile').forEach(x => x.setAttribute('aria-checked', String(x.dataset.season === s)));
      toast(`${SEASON_LABEL[s]} i dalen`, { icon: SEASON_ICON[s], text: 'Automatisk årstid er slået fra. Slå den til igen under Verden.', ms: 2600 });
    });
    wrap.appendChild(b);
    requestAnimationFrame(() => paintStill(cv, { season: s, time: s === 'winter' ? 'day' : s === 'autumn' ? 'dusk' : s === 'spring' ? 'day' : 'dusk', focusX: 0.5 }));
  }
  return wrap;
}

const STATUS_LABEL = { active: 'Aktiv', paused: 'Pause', done: 'Færdig', idea: 'Idé', archived: 'Arkiveret' };
const STATUS_CHIP = { active: 'chip-ok', paused: 'chip-warn', done: 'chip-info', idea: '', archived: '' };
export { STATUS_LABEL, STATUS_CHIP };

export function projectsPreview({ limit = 4 } = {}) {
  const list = h('div', { class: 'list' }, skeletonRows(3));
  const p = panel('Seneste projekter', { link: { href: '#/projects', label: 'Se alle' }, tour: 'projects-preview' }, list);
  const user = store.get('user');
  if (user.role !== 'owner') {
    clear(list).appendChild(h('p', { class: 'faint' }, 'Lokale Cursor-projekter er kun synlige for platformens ejer.'));
    return p;
  }
  getProjects().then((d) => {
    clear(list);
    const ps = d.projects.filter(x => !x.meta?.hidden && x.meta?.status !== 'archived');
    if (!ps.length) {
      list.appendChild(stateBlock({
        app: 'var(--hue-cursor)', icon: d.status?.cursorInstalled ? 'folder' : 'plugOff',
        title: d.status?.cursorInstalled ? 'Ingen projekter fundet endnu' : 'Cursor er ikke forbundet',
        text: d.status?.cursorInstalled ? 'Åbn et projekt i Cursor, eller tilføj en projektmappe.' : 'HUBTECH fandt ingen Cursor-installation på denne maskine.',
        actions: [h('a', { class: 'btn btn-sm btn-primary', href: '#/projects' }, 'Opsæt forbindelse')],
      }));
      return;
    }
    const sorted = [...ps].sort((a, b) => (b.meta?.favorite ? 1 : 0) - (a.meta?.favorite ? 1 : 0) || (b.meta?.lastOpenedHere || b.lastOpened || 0) - (a.meta?.lastOpenedHere || a.lastOpened || 0));
    for (const pr of sorted.slice(0, limit)) list.appendChild(projectRow(pr));
  }).catch((e) => {
    clear(list).appendChild(h('p', { class: 'faint' }, 'Projekter kunne ikke hentes: ' + e.message));
  });
  return p;
}

/** A stable identity colour per project (same on Hjem and in Cursor Projekter). */
export function projectHue(pr) {
  const hues = ['#e8eef5', '#22c55e', '#2f8cff', '#ef4444', '#a259ff', '#f59e0b'];
  return hues[parseInt(String(pr.id).slice(0, 2), 16) % hues.length] || hues[0];
}

export function projectRow(pr) {
  const st = pr.meta?.status;
  const when = pr.meta?.lastOpenedHere || pr.lastOpened || pr.modified;
  const hue = projectHue(pr);
  const kebab = h('button', { class: 'icon-btn btn-sm kebab', 'aria-label': `Handlinger for ${pr.name}`, html: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="19" r="1.7" fill="currentColor"/></svg>' });
  kebab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); projectMenu(kebab, pr); });
  return h('a', { class: 'row project-row', href: `#/projects/${pr.id}`, style: { '--app': hue } },
    h('span', { class: 'row-icon tile' }, icon(pr.remote ? 'globe' : pr.isGit ? 'branch' : 'folder')),
    h('span', { class: 'row-main' },
      h('div', { class: 'row-title' }, pr.meta?.favorite ? h('span', { class: 'fav-dot', 'aria-label': 'Favorit' }, '★ ') : null, pr.name),
      h('div', { class: 'row-sub' }, pr.description || pr.path || pr.uri || '')),
    h('span', { class: 'row-end' },
      st ? h('span', { class: ['chip', STATUS_CHIP[st]] }, STATUS_LABEL[st]) : !pr.exists && !pr.remote ? h('span', { class: 'chip chip-bad' }, 'Mangler') : h('span', { class: 'chip chip-info' }, pr.isGit ? 'Git' : 'Mappe'),
      h('span', { class: 'faint row-when' }, when ? `Sidst åbnet ${timeAgo(when)}` : ''),
      kebab));
}

let openKebab = null;
document.addEventListener('click', () => { openKebab?.remove(); openKebab = null; });
function projectMenu(anchor, pr) {
  openKebab?.remove();
  const item = (ic, label, fn) => h('button', { class: 'menu-item', onclick: (e) => { e.stopPropagation(); openKebab?.remove(); openKebab = null; fn(); } }, icon(ic), label);
  const menu = h('div', { class: 'menu glass glass-strong kebab-menu', role: 'menu' },
    item('cube', 'Åbn i Cursor', async () => {
      try {
        const r = await api.post(`/api/projects/${pr.id}/open`, {});
        if (r.ok) toast(r.message, { type: 'ok', text: pr.name, ms: 2200 });
        else if (r.deeplink) window.location.href = r.deeplink;
        else toast('Kunne ikke åbne projektet', { type: 'bad', text: r.message });
      } catch (e) { toast('Kunne ikke åbne projektet', { type: 'bad', text: e.message }); }
    }),
    item('info', 'Detaljer', () => { location.hash = `#/projects/${pr.id}`; }),
    item(pr.meta?.favorite ? 'starFill' : 'star', pr.meta?.favorite ? 'Fjern favorit' : 'Gør til favorit', async () => {
      try { const { meta } = await api.patch(`/api/projects/${pr.id}/meta`, { favorite: !pr.meta?.favorite }); pr.meta = meta; toast(meta.favorite ? 'Favorit tilføjet' : 'Favorit fjernet', { type: 'ok', ms: 1500 }); }
      catch (e) { toast('Kunne ikke gemme', { type: 'bad', text: e.message }); }
    }));
  const r = anchor.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${Math.max(8, r.right - 220)}px;width:220px;`;
  document.body.appendChild(menu);
  openKebab = menu;
}

export function learningPreview() {
  const list = h('div', { class: 'list' }, skeletonRows(2));
  const p = panel('Læringsforløb', { link: { href: '#/learn', label: 'Se alle' }, tour: 'learning-preview' }, list);
  Promise.all([getState(COURSE.stateId).catch(() => null), getState('circuitpilot').catch(() => null)]).then(([cs, cp]) => {
    clear(list);
    const pr = courseProgress(cs);
    const chipFor = (done, total, started) => done >= total ? ['Gennemført', 'chip-ok'] : started ? ['I gang', 'chip-info'] : ['Klar til start', 'chip-warn'];
    list.appendChild(learnRow({
      href: `#/learn/course/${COURSE.id}/day/${pr.lastDay + 1}`, title: 'Servicetekniker – opstart', art: { season: 'summer', time: 'dusk', focusX: 0.3 },
      sub: `${pr.daysDone} / ${pr.totalDays} lektioner`, pct: pr.daysDone / pr.totalDays * 100 || pr.pct,
      chip: chipFor(pr.daysDone, pr.totalDays, pr.started), hue: 'var(--hue-course)',
    }));
    const slides = Math.min(15, cp?.stats?.slideSeen || 0);
    list.appendChild(learnRow({
      href: '#/learn/circuitpilot', title: 'Elektronik grundkursus', art: { season: 'summer', time: 'dusk', focusX: 0.62 },
      sub: `${slides} / 15 lektioner`, pct: slides / 15 * 100, chip: chipFor(slides, 15, slides > 0), hue: 'var(--hue-circuitpilot)',
    }));
    const fh = Math.min(8, cp?.stats?.fhDone || 0);
    list.appendChild(learnRow({
      href: '#/learn/circuitpilot', title: 'Fejlfinding i kredsløb', art: { season: 'winter', time: 'night', focusX: 0.4 },
      sub: `${fh} / 8 scenarier`, pct: fh / 8 * 100, chip: chipFor(fh, 8, fh > 0), hue: 'var(--hue-circuitpilot)',
    }));
  }).catch(() => { clear(list).appendChild(h('p', { class: 'faint' }, 'Læring kunne ikke hentes.')); });
  return p;
}

function learnRow({ href, title, sub, pct, chip, art, hue }) {
  const cv = h('canvas', { class: 'learn-thumb', 'aria-hidden': 'true' });
  requestAnimationFrame(() => paintStill(cv, art));
  return h('a', { class: 'row learn-row', href, style: { '--app': hue } },
    cv,
    h('span', { class: 'row-main' },
      h('div', { class: 'learn-row-top' }, h('div', { class: 'row-title' }, title), h('span', { class: ['chip', chip[1]] }, chip[0])),
      h('div', { class: 'row-sub' }, sub),
      progressBar(pct)),
    h('span', { class: 'row-end' }, icon('chevronRight')));
}

export { APPS, appById };
