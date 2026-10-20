/** The logged-in workspace frame: sidebar, topbar, content outlet. Built once, updated reactively. */
import { h, clear, timeAgo } from './dom.js';
import { icon, logo, svg } from './icons.js';
import { store, setPref, setWorld } from './store.js';
import { APPS, appById, access, isLearnApp } from './registry.js';
import { api } from './api.js';
import { paintStill, describeWorld } from '../world/controller.js';
import { SEASONS, SEASON_LABEL } from '../world/palettes.js';
import { openPalette } from '../features/palette.js';
import { startOnboarding } from '../features/onboarding.js';
import { logout } from '../features/auth.js';
import { modal, toast } from './ui.js';
import { onOfflineChange, offlineStatus, replay } from './offline.js';

let shellEl = null;
let outlet = null;
let navEl = null;
let appsNavEl = null;
let seasonMini = null;
let topbar = null;

const MAIN_NAV = [
  { id: 'home', label: 'Hjem', icon: 'home', href: '#/', match: (p) => p === '/' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '#/dashboard', match: (p) => p.startsWith('/dashboard') },
  { id: 'apps', label: 'Apps', icon: 'apps', href: '#/apps', match: (p) => p === '/apps' },
  { id: 'projects', label: 'Projekter', icon: 'folder', href: '#/projects', match: (p) => p.startsWith('/projects'), app: 'cursor' },
  { id: 'learn', label: 'Guides & Læring', icon: 'book', href: '#/learn', match: (p) => p.startsWith('/learn') },
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
      h('div', { class: 'quote' }, icon('quote'), h('span', null, QUOTES[new Date().getDate() % QUOTES.length]))),
  );
  topbar = buildTopbar();
  shellEl = h('div', { class: 'shell', id: 'shell' },
    sidebar,
    h('div', { class: 'main-col' }, topbar, outlet));
  root.appendChild(shellEl);
  // close the mobile drawer when navigating
  addEventListener('hashchange', () => shellEl?.classList.remove('nav-open'));
  addEventListener('scroll', () => topbar.classList.toggle('is-scrolled', scrollY > 8), { passive: true });
  renderNav();
  renderAppsNav();
  renderSeasonMini();
  store.on('prefs', () => { renderAppsNav(); renderSeasonMini(); renderThemeBtn(); });
  store.on('user', () => { renderUserChip(); renderAppsNav(); });
  store.on('summary', renderUserChip);
  return shellEl;
}

export function setActiveNav(path) {
  if (!navEl) return;
  for (const a of navEl.querySelectorAll('.nav-item')) {
    const item = MAIN_NAV.find(n => n.id === a.dataset.id);
    const on = item?.match(path);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  for (const a of appsNavEl.querySelectorAll('.nav-item')) {
    const app = appById(a.dataset.id);
    const on = app && path.startsWith(app.route.replace(/^#/, '')) && app.route !== '#/';
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
  const pinned = (store.get('prefs').pinnedApps || []).map(appById).filter(a => a && !isLearnApp(a));
  for (const app of pinned) {
    const acc = access(app, user);
    appsNavEl.appendChild(h('a', {
      class: ['nav-item', !acc.ok && 'is-locked'], href: app.route, dataset: { id: app.id }, style: { '--app': app.hue },
      title: acc.ok ? app.tagline : acc.reason,
    },
    h('span', { class: 'nav-app-icon' }, icon(app.icon)),
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

let themeBtn, userChipWrap, bellWrap;
function buildTopbar() {
  themeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Skift lys/mørk tilstand' });
  themeBtn.addEventListener('click', () => {
    const cur = store.get('prefs').theme;
    setPref('theme', document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    void cur;
  });
  renderThemeBtn();
  bellWrap = h('div', { class: 'pop-anchor' });
  const aiBtn = h('button', { class: 'icon-btn ai-top', 'aria-label': 'AI-assistent (Ctrl+J)', title: 'AI-assistent (Ctrl+J)', onclick: () => import('../ai/panel.js').then(m => m.toggleAssistant()) }, icon('sparkles'));
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
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Åbn menu', 'aria-controls': 'sidebar', onclick: () => shellEl.classList.toggle('nav-open') }, icon('menu')),
    h('button', { class: 'search-trigger', dataset: { tour: 'search' }, 'aria-label': 'Søg i platformen (Ctrl+K)', onclick: () => openPalette() },
      icon('search'), h('span', null, 'Søg i platformen, projekter, guides og mere...'), h('kbd', null, navigator.platform?.includes('Mac') ? '⌘ + K' : 'Ctrl + K')),
    h('div', { class: 'top-actions' }, net, aiBtn, themeBtn, bellWrap, h('div', { class: 'top-sep' }), userChipWrap));
}

function renderThemeBtn() {
  if (!themeBtn) return;
  themeBtn.innerHTML = svg(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun');
}

function renderUserChip() {
  if (!userChipWrap) return;
  const u = store.get('user');
  const s = store.get('summary');
  clear(userChipWrap);
  if (!u) return;
  const btn = h('button', { class: 'user-chip', 'aria-haspopup': 'menu', 'aria-label': `Brugermenu for ${u.displayName}` },
    h('span', { class: 'avatar' }, u.avatar),
    h('span', { class: 'user-chip-text' }, h('div', { class: 'user-chip-name' }, u.displayName), h('div', { class: 'user-chip-role' }, u.role === 'owner' ? 'Ejer' : 'Medlem')),
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
  openMenu = h('div', { class: 'menu glass glass-strong', role: 'menu' },
    item('user', 'Profil', () => { location.hash = '#/settings/profile'; }),
    item('settings', 'Indstillinger', () => { location.hash = '#/settings'; }),
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
