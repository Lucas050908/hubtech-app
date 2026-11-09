/** The logged-in workspace frame: sidebar, topbar, content outlet. Built once, updated reactively. */
import { h, clear, timeAgo, ava } from './dom.js';
import { icon, tileIcon, gnist, logo, svg } from './icons.js';
import { appGlyph } from './appicons.js';
import { store, setPref, setWorld } from './store.js';
import { APPS, appById, access, isLearnApp, visible, entryApps, suiteOf } from './registry.js';
import { api } from './api.js';
import { paintStill, describeWorld } from '../world/controller.js';
import { SEASONS, SEASON_LABEL } from '../world/palettes.js';
import { SCENES } from '../world/scenes.js';
// loaded when first needed (the search with its guide index, and the introduction) – keeps the start light
const openPalette = (...a) => import('../features/palette.js').then(m => m.openPalette(...a));
const startOnboarding = (...a) => import('../features/onboarding.js').then(m => m.startOnboarding(...a));
import { logout } from '../features/auth.js';
import { bgmButton, initBgm } from '../features/bgm.js';
import { topWidgets, openCustomize } from '../features/topwidgets.js';
import { workButton, initWork } from '../features/workmode.js';
import { dockIds } from '../features/widgetlogic.js';
import { shortcutEntry, SC, railDrag, savePinOrder } from '../features/shortcuts.js';
import { modal, toast } from './ui.js';
import { onOfflineChange, offlineStatus, replay } from './offline.js';

let shellEl = null;
let outlet = null;
let navEl = null;
let appsNavEl = null;
let seasonMini = null;
let topbar = null;
let dockEl = null;
let railEl = null;

// the dock at the bottom (the desert design): you choose which apps and how many (Tilpas → Dock)
const DOCK_PLACES = {
  home: { id: 'home', label: 'Hjem', icon: 'home', href: '#/', hue: '#f97316', match: (p) => p === '/' },
  learn: { id: 'learn', label: 'Læring', icon: 'graduation', href: '#/learn', hue: '#22c55e', match: (p) => p.startsWith('/learn') },
  apps: { id: 'apps', label: 'Alle apps', icon: 'apps', href: '#/apps', hue: '#57534e', match: (p) => p === '/apps' },
};
const SHORT = { hubtech: 'Office', calendar: 'Kalender', tasks: 'Opgaver' };
export function dockEntry(id, u = store.get('user')) {
  if (DOCK_PLACES[id]) return DOCK_PLACES[id];
  if (id.startsWith(SC)) return shortcutEntry(id, store.get('prefs')?.widgets || {});   // your own shortcut: a page or a website
  const a0 = appById(id), a = a0?.partOf ? appById(a0.partOf) : a0;
  if (!a || !access(a, u).ok) return null;
  const routes = [a, ...(a.parts || []).map(appById).filter(Boolean)].map(x => x.route.replace(/^#/, ''));
  return { id: a.id, label: SHORT[a.id] || a.name, icon: a.icon, href: a.route, hue: a.hue, match: (p) => routes.some(r => p === r || p.startsWith(r + '/')) };
}
function dockItems() {
  const u = store.get('user');
  return dockIds(store.get('prefs')?.widgets || {}).map(id => dockEntry(id, u)).filter((e, i, all) => e && all.findIndex(x => x?.id === e.id) === i);
}
let dockTab = null;
const dockMin = () => { try { return localStorage.getItem('hubtech.dockMin') === '1'; } catch { return false; } };
function setDockMin(on) {
  try { localStorage.setItem('hubtech.dockMin', on ? '1' : '0'); } catch { /* */ }
  document.documentElement.classList.toggle('dock-min', on);
}
// "Alle apps" opens the drawer over the page you're on (a plain click; Ctrl/middle click still opens the page)
function drawerClick(e) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const from = e.currentTarget;
  if ((location.hash.replace(/^#/, '').split('?')[0] || '/') === '/apps') { e.preventDefault(); document.querySelector('.ab-page .ab-search')?.focus(); return; }
  e.preventDefault();
  import('../features/appdrawer.js').then(m => m.openAppDrawer({ from }));
}
const drawerAttrs = (id) => id === 'apps' ? { 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: drawerClick } : {};

function renderDock() {
  if (!dockEl) return;
  h(clear(dockEl), null, dockItems().map(d => h('a', { class: 'dock-item', href: d.href, dataset: d.id === 'apps' ? { id: d.id, drawer: 'apps' } : { id: d.id }, style: { '--app': d.hue }, ...drawerAttrs(d.id), ...(d.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
    h('span', { class: 'dock-ic' }, tileIcon(d.icon)), h('span', { class: 'dock-line', 'aria-hidden': 'true' }, icon(d.icon)), h('span', { class: 'dock-label' }, d.label))),
    h('button', { type: 'button', class: 'dock-hide', 'aria-label': 'Skjul taskbaren', title: 'Skjul taskbaren', onclick: () => setDockMin(true) }, icon('chevronDown')));
  if (!dockTab) {
    dockTab = h('button', { type: 'button', class: 'dock-tab', 'aria-label': 'Vis taskbaren', title: 'Vis taskbaren', onclick: () => setDockMin(false) }, icon('chevronUp'));
    dockEl.after(dockTab);
  }
  document.documentElement.classList.toggle('dock-min', dockMin());
}

// design D: an icon rail on the left – the places you use most
const RAIL = [
  { id: 'home', label: 'Hjem', icon: 'home', href: '#/', match: (p) => p === '/' },
  { id: 'projects', label: 'Projekter', icon: 'chat', href: '#/apps/projects', match: (p) => p.startsWith('/apps/projects'), app: 'projects' },
  { id: 'hubtech', label: 'Office', icon: 'office', href: '#/apps/hubtech', match: (p) => /^\/apps\/(hubtech|notebook|notes)(\/|$)/.test(p), app: 'hubtech' },
  { id: 'calendar', label: 'Kalender', icon: 'calendar', href: '#/apps/calendar', match: (p) => p.startsWith('/apps/calendar'), app: 'calendar' },
  { id: 'tasks', label: 'Opgaver', icon: 'kanban', href: '#/apps/tasks', match: (p) => p.startsWith('/apps/tasks'), app: 'tasks' },
  { id: 'codepad', label: 'Kode-editor', icon: 'code', href: '#/learn/codepad', match: (p) => p.startsWith('/learn/codepad'), app: 'codepad' },
  { id: 'learn', label: 'Lær og øv', icon: 'graduation', href: '#/learn', match: (p) => p.startsWith('/learn') && !p.startsWith('/learn/codepad') },
  { id: 'apps', label: 'Alle apps', icon: 'apps', href: '#/apps', match: (p) => p === '/apps' },
  { sep: true },
  { id: 'gnist', label: 'Gnist', icon: 'sparkles', href: '#/apps/gnist', match: (p) => p.startsWith('/apps/gnist'), app: 'gnist' },
  { id: 'settings', label: 'Indstillinger', icon: 'settings', href: '#/settings', match: (p) => p.startsWith('/settings') },
];
const RAIL_IDS = new Set(RAIL.filter(r => r.id).map(r => r.id));
// your shortcuts – pinned apps (Alle apps → pin, or Tilpas), pages and websites (the + under them) – sit under the
// fixed places. Drag them to move them, right-click one to move, rename or remove it.
let railPins = [];
let railKey = '';
const RAIL_MAX_PINS = 8;
const pinsNow = (u = store.get('user')) => dockIds(store.get('prefs')?.widgets || {}).map(id => dockEntry(id, u)).filter((e, i, all) => e && !RAIL_IDS.has(e.id) && all.findIndex(x => x?.id === e.id) === i).slice(0, RAIL_MAX_PINS);
const pinsKey = (u, pins) => `${u?.id}|${pins.map(p => `${p.id}:${p.label}`).join(',')}`;
function pinMenu(el, at) {
  const order = [...railEl.querySelectorAll('.irail-item.is-pin')].map(x => x.dataset.id);
  import('../features/shortcuts.js').then(m => m.openPinMenu(el, el.dataset.id, order, at));
}
function renderRail() {
  if (!railEl) return;
  const u = store.get('user');
  railPins = pinsNow(u);
  railKey = pinsKey(u, railPins);
  const mark = h('a', { class: 'irail-logo', href: '#/', 'aria-label': 'HUBTECH – til forsiden', title: 'HUBTECH' }, logo(40));   // the same logo as the app icon
  const item = (r, pinned = false) => h('a', { class: ['irail-item', pinned && 'is-pin'], href: r.href, dataset: r.id === 'apps' ? { id: r.id, drawer: 'apps', tour: 'allapps' } : { id: r.id }, 'aria-label': r.label, ...drawerAttrs(r.id),
    ...(pinned ? { draggable: 'false', style: { '--app': r.hue }, oncontextmenu: (e) => { e.preventDefault(); pinMenu(e.currentTarget, { x: e.clientX + 4, y: e.clientY }); },
      onkeydown: (e) => { if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); pinMenu(e.currentTarget); } } } : {}),
    ...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
    appGlyph(r.app || r.id, r.icon), h('span', { class: 'irail-tip', 'aria-hidden': 'true' }, r.external ? `${r.label} ↗` : r.label));
  const add = h('button', { type: 'button', class: 'irail-item irail-add', 'aria-label': 'Tilføj genvej', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', dataset: { tour: 'shortcut' },
    onclick: (e) => { const at = e.currentTarget; import('../features/shortcuts.js').then(m => m.openAddShortcut(at, { fixed: RAIL_IDS })); } },
    icon('plus'), h('span', { class: 'irail-tip', 'aria-hidden': 'true' }, 'Tilføj genvej'));
  const out = [];
  for (const r of RAIL.filter(r => r.sep || !r.app || (appById(r.app) && access(appById(r.app), u).ok))) {
    if (r.id === 'apps') out.push(h('span', { class: 'irail-div', 'aria-hidden': 'true' }), ...railPins.map(p => item(p, true)), add, h('span', { class: 'irail-div', 'aria-hidden': 'true' }));
    out.push(r.sep ? h('span', { class: 'irail-sep', 'aria-hidden': 'true' }) : item(r));
  }
  h(clear(railEl), null, mark, out);
}

const MAIN_NAV = [
  { id: 'home', label: 'Hjem', icon: 'home', href: '#/', match: (p) => p === '/' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '#/dashboard', match: (p) => p.startsWith('/dashboard') },
  { id: 'apps', label: 'Apps', icon: 'apps', href: '#/apps', match: (p) => p === '/apps' },
  { id: 'projects', label: 'Cursor-projekter', icon: 'folder', href: '#/projects', match: (p) => p.startsWith('/projects'), app: 'cursor' },
  { id: 'learn', label: 'Guides & Læring', icon: 'book', href: '#/learn', match: (p) => p.startsWith('/learn') },
  { id: 'hubs', label: 'Forbindelser', icon: 'link', href: '#/hubs', match: (p) => p.startsWith('/hubs') },
  { id: 'settings', label: 'Indstillinger', icon: 'settings', href: '#/settings', match: (p) => p.startsWith('/settings') },
];

const QUOTES = [
  'Små skridt hver dag skaber store resultater.',
  'Gode teknikere stiller gode spørgsmål.',
  'Byg det, test det, forbedr det.',
  'Skift kun én ting ad gangen – og notér det.',
];

export function getOutlet() { return outlet; }
export function hasShell() { return !!shellEl && document.body.contains(shellEl); }

export function buildShell(root) {
  clear(root);
  outlet = h('main', { class: 'content', id: 'main', tabindex: '-1' });
  navEl = h('nav', { class: 'nav', 'aria-label': 'Hovedmenu', dataset: { tour: 'nav' } });
  appsNavEl = h('div', { class: 'nav', dataset: { tour: 'launcher' } });
  seasonMini = h('div', { class: 'season-mini', dataset: { tour: 'world' } });
  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'HUBTECH – til forsiden' }, logo(36), h('span', { class: 'brand-name' }, 'HUB', h('b', null, 'TECH'))),
    navEl,
    h('div', { class: 'nav-label', id: 'apps-label' }, 'Dine apps'),
    appsNavEl,
    h('div', { class: 'sidebar-foot' },
      seasonMini,
      h('button', { type: 'button', class: 'nav-item side-logout', onclick: () => logout() }, icon('logout'), h('span', null, 'Log ud')),
      h('div', { class: 'quote' }, icon('quote'), h('span', null, QUOTES[new Date().getDate() % QUOTES.length]))),
  );
  topbar = buildTopbar();
  dockEl = h('nav', { class: 'dock', 'aria-label': 'Dock', dataset: { tour: 'dock' } });
  railEl = h('nav', { class: 'irail', 'aria-label': 'Genveje' });
  railDrag(railEl, savePinOrder);
  shellEl = h('div', { class: 'shell', id: 'shell' },
    railEl,
    sidebar,
    h('div', { class: 'main-col' }, topbar, outlet),
    dockEl);
  root.appendChild(shellEl);
  // close the mobile drawer when navigating
  addEventListener('hashchange', () => shellEl?.classList.remove('nav-open'));
  addEventListener('scroll', () => topbar.classList.toggle('is-scrolled', scrollY > 8), { passive: true });
  renderNav();
  renderRail();
  renderDock();
  renderAppsNav();
  renderSeasonMini();
  store.on('prefs', () => { renderAppsNav(); renderSeasonMini(); renderThemeBtn(); });
  store.on('user', () => { renderUserChip(); renderAppsNav(); renderDock(); renderRail(); });
  store.on('prefs', () => {
    renderDock();
    const u = store.get('user');
    if (pinsKey(u, pinsNow(u)) !== railKey) renderRail();
    setActiveNav(location.hash.replace(/^#/, '').split('?')[0] || '/');
  });
  store.on('summary', renderUserChip);
  return shellEl;
}

export function setActiveNav(path) {
  if (!navEl) return;
  drawCrumb(path);
  if (dockEl) {
    const items = dockItems();
    for (const a of dockEl.querySelectorAll('.dock-item')) {
      const on = items.find(d => d.id === a.dataset.id)?.match(path);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }
  if (railEl) {
    const pinHere = railPins.some(r => r.shortcut && r.match(path));   // a shortcut to exactly this page wins over its app
    for (const a of railEl.querySelectorAll('a.irail-item')) {
      const r = [...RAIL, ...railPins].find(x => x.id === a.dataset.id);
      const on = r?.match(path) && (!pinHere || r.shortcut);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }
  for (const a of navEl.querySelectorAll('.nav-item')) {
    const item = MAIN_NAV.find(n => n.id === a.dataset.id);
    const on = item?.match(path);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  for (const a of appsNavEl.querySelectorAll('.nav-item')) {
    const app = appById(a.dataset.id);
    const s = suiteOf(a.dataset.id);
    const routes = s ? s.members.map(id => appById(id)?.route).filter(Boolean) : app ? [app.route] : [];
    const on = routes.some(r => path.startsWith(r.replace(/^#/, '')) && r !== '#/');
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

function renderNav() {
  clear(navEl);
  for (const n of MAIN_NAV) {
    navEl.appendChild(h('a', { class: 'nav-item', href: n.href, dataset: { id: n.id } }, icon(n.icon), h('span', null, n.label)));
  }
}

function renderAppsNav() {
  if (!appsNavEl) return;
  clear(appsNavEl);
  const user = store.get('user');
  const pinned = entryApps(store.get('prefs').pinnedApps || []).filter(a => !isLearnApp(a) && visible(a, user));
  for (const app of pinned) {
    const acc = access(app, user);
    appsNavEl.appendChild(h('a', {
      class: ['nav-item', !acc.ok && 'is-locked'], href: app.route, dataset: { id: app.id }, style: { '--app': app.hue },
      title: acc.ok ? app.tagline : acc.reason,
    },
    h('span', { class: 'nav-app-icon' }, tileIcon(app.icon)),
    h('span', null, app.name),
    h('span', { class: 'nav-end' }, acc.ok ? icon('chevronRight') : icon('lock'))));
  }
  appsNavEl.appendChild(h('a', { class: 'nav-item', href: '#/apps', style: { fontSize: 'var(--fs-sm)' } }, icon('plus'), h('span', null, 'Flere apps')));
}

function renderSeasonMini() {
  if (!seasonMini) return;
  const d = describeWorld();
  clear(seasonMini);
  const cv = h('canvas', { 'aria-hidden': 'true' });
  // a theme scene (the desert is the standard look): show it, its name, and a shortcut to the settings – seasons don't apply
  const w = store.get('prefs').world;
  if (SCENES.desert) {
    seasonMini.append(cv,
      h('div', { class: 'season-mini-bar' }, h('div', { class: 'lbl' }, h('small', null, 'Baggrund'), h('b', null, SCENES.desert.name))),
      h('a', { class: 'season-mini-settings', href: '#/settings/world' }, icon('settings'), 'Udseende'));
    requestAnimationFrame(() => import('../world/cityscape.js').then(m => m.paintScene(cv, 'desert', { time: d.time, light: document.documentElement.dataset.theme === 'light' })));
    return;
  }
  const step = (dir) => {
    const i = SEASONS.indexOf(d.season);
    const next = SEASONS[(i + dir + 4) % 4];
    setWorld({ seasonMode: 'manual', season: next });
  };
  seasonMini.append(cv,
    h('div', { class: 'season-mini-bar' },
      h('div', { class: 'lbl' }, h('small', null, 'Årstider'), h('b', null, `${d.seasonLabel}${store.get('prefs').world.seasonMode === 'auto' ? ' · auto' : ''}`)),
      h('button', { class: 'icon-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Forrige årstid', onclick: () => step(-1) }, icon('chevronLeft')),
      h('button', { class: 'icon-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Næste årstid', onclick: () => step(1) }, icon('chevronRight'))),
    h('a', { class: 'season-mini-settings', href: '#/settings/world' }, icon('settings'), 'Indstillinger'));
  requestAnimationFrame(() => paintStill(cv, { season: d.season, time: d.time, landscape: d.landscape, focusX: 0.55 }));
}

let themeBtn, userChipWrap, bellWrap, crumbEl;
function buildTopbar() {
  themeBtn = null;
  bellWrap = h('div', { class: 'pop-anchor' });
  const moreWrap = h('div', { class: 'pop-anchor' });
  const moreBtn = h('button', { type: 'button', class: 'icon-btn tb-more', 'aria-haspopup': 'menu', 'aria-label': 'Tema, fuld skærm og Tilpas', title: 'Tema, fuld skærm og Tilpas' }, icon('sliders'));
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleQuickMenu(moreWrap); });
  moreWrap.appendChild(moreBtn);
  crumbEl = h('div', { class: 'tb-crumb' });
  initWork();
  const aiBtn = h('button', { class: 'icon-btn ai-top', 'aria-label': 'Gnist – AI-assistent (Ctrl+J)', title: 'Gnist – AI-assistent (Ctrl+J)', onclick: () => import('../ai/panel.js').then(m => m.toggleAssistant()) }, gnist(26));
  const bell = h('button', { class: 'icon-btn', 'aria-label': 'Aktivitet og notifikationer', 'aria-haspopup': 'true' }, icon('bell'), h('span', { class: 'dot', hidden: true }));
  api.get('/api/activity?limit=1').then(({ activity }) => {
    const seen = Number(store.device('seenActivity') || 0);
    if (activity[0] && activity[0].at > seen) bell.querySelector('.dot').hidden = false;
  }).catch(() => {});
  bell.addEventListener('click', () => { bell.querySelector('.dot').hidden = true; store.device('seenActivity', Math.floor(Date.now() / 1000)); });
  bell.addEventListener('click', (e) => { e.stopPropagation(); toggleNotifications(bellWrap); });
  bellWrap.appendChild(bell);
  userChipWrap = h('div', { class: 'pop-anchor', dataset: { tour: 'profile' } });
  renderUserChip();
  // offline / waiting changes indicator
  const net = h('button', { type: 'button', class: 'net-chip', hidden: true, onclick: () => replay() });
  const drawNet = (st) => {
    net.hidden = !st.offline && !st.pending;
    net.classList.toggle('is-off', !!st.offline);
    h(clear(net), null, icon(st.offline ? 'plugOff' : 'refresh'),
      h('span', null, st.offline ? (st.pending ? `Offline · ${st.pending} ${st.pending === 1 ? 'ændring venter' : 'ændringer venter'}` : 'Offline') : `Gemmer ${st.pending} …`));
    net.title = st.offline ? 'Serveren kan ikke nås. Dine ændringer gemmes på denne enhed og sendes, når forbindelsen er tilbage. Klik for at prøve nu.' : 'Sender ændringer';
    if (st.synced) toast('Forbindelsen er tilbage', { type: 'ok', text: `${st.synced} ${st.synced === 1 ? 'ændring er' : 'ændringer er'} gemt på serveren.` });
    if (st.dropped?.length) toast('Nogle ændringer kunne ikke gemmes', { type: 'warn', text: 'De var slettet eller ændret et andet sted.' });
  };
  onOfflineChange(drawNet);
  drawNet(offlineStatus());
  const music = bgmButton();
  return h('header', { class: 'topbar' },
    h('a', { class: 'top-brand', href: '#/', 'aria-label': 'HUBTECH – til Hjem' }, logo(30), h('span', null, 'HUBTECH')),
    h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Åbn menu', 'aria-controls': 'sidebar', onclick: () => shellEl.classList.toggle('nav-open') }, icon('menu')),
    crumbEl,
    h('button', { class: 'search-trigger', dataset: { tour: 'search' }, 'aria-label': 'Søg i HUBTECH (Ctrl+K)', onclick: () => openPalette() },
      icon('search'), h('span', null, 'Søg i apps, filer, guides og projekter …'), h('kbd', null, navigator.platform?.includes('Mac') ? '⌘ K' : 'Ctrl K')),
    h('div', { class: 'top-actions' }, net, h('div', { class: 'tb-status' }, topWidgets(music), music), aiBtn, workButton(), bellWrap, moreWrap, userChipWrap));
}

function renderThemeBtn() { /* the theme is chosen in the menu by the sliders (toggleQuickMenu) */ }

// where you are: the app (and the part of it), or the place – in Lær og øv it picks between the learning apps
const CRUMB_PLACES = [['/apps', 'Alle apps', 'apps'], ['/learn', 'Lær og øv', 'graduation'], ['/settings', 'Indstillinger', 'settings'], ['/dashboard', 'Dashboard', 'dashboard'], ['/hubs', 'Forbindelser', 'link'], ['/projects', 'Cursor-projekter', 'folder']];
function drawCrumb(path) {
  if (!crumbEl) return;
  const app = APPS.filter(a => a.route && (path === a.route.slice(1) || path.startsWith(a.route.slice(1) + '/'))).sort((a, b) => b.route.length - a.route.length)[0];
  const tile = (ic, hue, app) => h('span', { class: 'ab-ico ab-ico-sm', style: { '--app': hue || 'var(--accent)' } }, app ? appGlyph(app, ic) : icon(ic));
  if (path.startsWith('/learn')) {
    const btn = h('button', { type: 'button', class: 'tb-crumb-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `Lær og øv${isLearnApp(app) ? ` – ${app.name}` : ''}: vælg en læringsapp` },
      tile('graduation', '#22c55e'), h('span', { class: 'tb-crumb-t' }, 'Lær og øv'),
      isLearnApp(app) ? [h('span', { class: 'tb-crumb-sep', 'aria-hidden': 'true' }, '›'), h('span', { class: 'tb-crumb-s' }, app.name)] : null, icon('chevronDown'));
    btn.addEventListener('click', () => import('../features/learnnav.js').then(m => m.openLearnPanel(btn, path)));
    h(clear(crumbEl), null, btn);
    return;
  }
  if (path === '/') { h(clear(crumbEl), null, tile('home', '#f97316'), h('span', { class: 'tb-crumb-t' }, 'Hjem')); return; }
  if (app) {
    const parent = app.partOf ? appById(app.partOf) : null;
    h(clear(crumbEl), null, tile((parent || app).icon, (parent || app).hue, parent || app),
      parent ? [h('a', { class: 'tb-crumb-t', href: parent.route }, parent.name), h('span', { class: 'tb-crumb-sep', 'aria-hidden': 'true' }, '›'), h('span', { class: 'tb-crumb-s' }, app.name)]
        : h('span', { class: 'tb-crumb-t' }, app.name));
    return;
  }
  const pl = CRUMB_PLACES.find(([k]) => path === k || path.startsWith(k + '/'));
  h(clear(crumbEl), null, pl ? [tile(pl[2]), h('span', { class: 'tb-crumb-t' }, pl[1])] : null);
}

function toggleQuickMenu(anchor) {
  if (openMenu) return closeMenus();
  const dark = document.documentElement.dataset.theme !== 'light';
  const fs = !!document.fullscreenElement;
  const item = (ic, label, fn, cls) => h('button', { class: ['menu-item', cls], role: 'menuitem', onclick: () => { closeMenus(); fn(); } }, icon(ic), label);
  openMenu = h('div', { class: 'menu glass glass-strong tb-menu', role: 'menu', 'aria-label': 'Tema, fuld skærm og Tilpas' },
    h('div', { class: 'tb-theme', role: 'group', 'aria-label': 'Tema' },
      [['dark', 'Mørk', 'moon'], ['light', 'Lys', 'sun']].map(([v, l, ic]) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String((v === 'dark') === dark), class: (v === 'dark') === dark ? 'is-on' : '', onclick: () => { setPref('theme', v); closeMenus(); } }, icon(ic), l))),
    item(fs ? 'minimize' : 'maximize', fs ? 'Afslut fuld skærm (Esc)' : 'Fuld skærm (F11)', () => import('./desktop.js').then(m => m.toggleFullscreen()), 'fs-btn'),
    item('sliders', 'Tilpas topbar og forside', () => openCustomize(), 'tw-customize'),
    item('help', 'Tastaturgenveje', showShortcuts));
  anchor.appendChild(openMenu);
  openMenu.querySelector('button')?.focus();
}

function renderUserChip() {
  if (!userChipWrap) return;
  const u = store.get('user');
  const s = store.get('summary');
  clear(userChipWrap);
  if (!u) return;
  const btn = h('button', { class: 'user-chip', 'aria-haspopup': 'menu', 'aria-label': `Brugermenu for ${u.displayName}` },
    h('span', { class: 'avatar' }, ava(u.avatar)),
    h('span', { class: 'user-chip-text' }, h('div', { class: 'user-chip-name' }, u.displayName), h('div', { class: 'user-chip-role' }, u.role === 'owner' ? 'Ejer' : u.guestOf ? `Gæst fra ${u.guestOf.name}` : 'Medlem')),
    icon('chevronDown'));
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggleUserMenu(userChipWrap); });
  userChipWrap.appendChild(btn);
}

let openMenu = null;
function closeMenus() { openMenu?.remove(); openMenu = null; }
document.addEventListener('click', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

function toggleUserMenu(anchor) {
  if (openMenu) return closeMenus();
  const item = (ic, label, fn) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { closeMenus(); fn(); } }, icon(ic), label);
  const me = store.get('user');
  openMenu = h('div', { class: 'menu glass glass-strong', role: 'menu' },
    me ? h('div', { class: 'tb-me' }, h('span', { class: 'avatar' }, ava(me.avatar)), h('div', null, h('b', null, me.displayName), h('small', null, me.role === 'owner' ? 'Ejer' : me.guestOf ? `Gæst fra ${me.guestOf.name}` : 'Medlem'))) : null,
    item('user', 'Profil', () => { location.hash = '#/settings/profile'; }),
    item('dashboard', 'Dashboard', () => { location.hash = '#/dashboard'; }),
    item('settings', 'Indstillinger', () => { location.hash = '#/settings'; }),
    item('sliders', 'Tilpas topbar og forside', () => openCustomize()),
    store.get('user')?.guestOf ? item('home', `Tilbage til ${store.get('user').guestOf.name}`, () => import('../pages/hubs.js').then(m => m.visit({ id: store.get('user').guestOf.id, name: store.get('user').guestOf.name }))) : item('link', 'Forbundne HUBTECH’er', () => { location.hash = '#/hubs'; }),
    item('sparkles', 'Start introduktion igen', () => { location.hash = '#/'; setTimeout(() => startOnboarding({ restart: true }), 350); }),
    item('help', 'Tastaturgenveje', showShortcuts),
    h('div', { class: 'menu-sep' }),
    item('logout', 'Log ud', () => logout()));
  anchor.appendChild(openMenu);
  openMenu.querySelector('button')?.focus();
}

async function toggleNotifications(anchor) {
  if (openMenu) return closeMenus();
  const list = h('div', { class: 'list' }, h('div', { class: 'skel skel-row' }), h('div', { class: 'skel skel-row' }));
  openMenu = h('div', { class: 'menu glass glass-strong notif-pop', role: 'dialog', 'aria-label': 'Aktivitet' },
    h('header', null, 'Seneste aktivitet', h('a', { class: 'panel-link', href: '#/dashboard', onclick: closeMenus }, 'Se alt', icon('arrowRight'))), list);
  anchor.appendChild(openMenu);
  try {
    const { activity } = await api.get('/api/activity?limit=8');
    clear(list);
    if (!activity.length) list.appendChild(h('div', { class: 'faint', style: { padding: '16px', textAlign: 'center' } }, 'Ingen aktivitet endnu.'));
    for (const a of activity) list.appendChild(activityRow(a));
  } catch {
    clear(list); list.appendChild(h('div', { class: 'faint', style: { padding: '16px' } }, 'Kunne ikke hente aktivitet.'));
  }
}

export function activityRow(a) {
  const app = appById(a.app) || appById(a.app === 'course' ? 'learning' : 'hubtech');
  const href = a.app === 'cursor' && a.ref ? `#/projects/${a.ref}` : app?.route || '#/';
  return h('a', { class: 'row', href, style: { '--app': app?.hue } },
    h('span', { class: 'row-icon solid' }, icon(app?.icon || 'sparkles')),
    h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, a.title), h('div', { class: 'row-sub' }, [a.detail, timeAgo(a.at)].filter(Boolean).join(' • '))),
    h('span', { class: 'row-end' }, icon('chevronRight')));
}

export function showShortcuts() {
  const rows = [['Ctrl/⌘ + K', 'Åbn søgning og kommandoer'], ['G derefter H', 'Gå til Hjem'], ['G derefter D', 'Gå til Dashboard'], ['G derefter P', 'Gå til Projekter'], ['G derefter L', 'Gå til Guides & Læring'], ['?', 'Vis denne oversigt'], ['Esc', 'Luk dialoger og menuer']];
  modal({ title: 'Tastaturgenveje', label: 'Hjælp', body: h('dl', { class: 'kv', style: { gridTemplateColumns: 'auto 1fr', rowGap: '12px' } }, rows.flatMap(([k, v]) => [h('dt', null, h('kbd', null, k)), h('dd', null, v)])) });
}

// G-sequence shortcuts
let gPressed = 0;
document.addEventListener('keydown', (e) => {
  if (!store.get('user')) return;
  // Ctrl/⌘+K works everywhere – also while typing in a field
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '?') { showShortcuts(); return; }
  if (e.key.toLowerCase() === 'g') { gPressed = Date.now(); return; }
  if (Date.now() - gPressed < 900) {
    const map = { h: '#/', d: '#/dashboard', p: '#/projects', l: '#/learn', a: '#/apps', s: '#/settings' };
    const to = map[e.key.toLowerCase()];
    if (to) { location.hash = to; gPressed = 0; }
  }
});

export { APPS };
