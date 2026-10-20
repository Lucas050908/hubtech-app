/** HUBTECH boot: world → session → router → pages. */
import { h, clear } from './core/dom.js';
import { api, onUnauthorized } from './core/api.js';
import { store, loadUserData, resetSessionState } from './core/store.js';
import { route, startRouter, navigate, currentPath } from './core/router.js';
import { buildShell, hasShell, getOutlet, setActiveNav } from './core/shell.js';
import { appById, access, isLearnApp } from './core/registry.js';
import { learnTabs } from './features/learnnav.js';
import { initAutoSync } from './features/autosync.js';
import { startLive } from './core/live.js';
import { initWorld, setFocus } from './world/controller.js';
import { stateBlock, toast, closeAllModals } from './core/ui.js';
import { icon } from './core/icons.js';
import { renderLogin, renderSignup } from './features/auth.js';
import { maybeStartOnboarding } from './features/onboarding.js';
import { applyDisplay } from './core/display.js';
import { initDesktop } from './core/desktop.js';

const root = document.getElementById('root');

// ── theme ──────────────────────────────────────────────────────────────
const mq = matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const t = store.get('prefs').theme || 'dark';
  const eff = t === 'system' ? (mq.matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.theme = eff;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', eff === 'light' ? '#dfe9f3' : '#0a1422');
}
store.on('prefs', applyTheme);
applyDisplay();
mq.addEventListener?.('change', applyTheme);
applyTheme();

// ── routes ─────────────────────────────────────────────────────────────
const page = (loader, opts = {}) => ({ loader, auth: true, focus: 1, ...opts });
route('/', { home: true });
route('/login', { public: true, render: renderLogin, title: 'Log ind' });
route('/signup', { public: true, render: renderSignup, title: 'Opret konto' });
route('/dashboard', page(() => import('./pages/dashboard.js')));
route('/apps', page(() => import('./pages/launcher.js')));
route('/projects', page(() => import('./pages/projects.js'), { app: 'cursor' }));
route('/projects/:id', page(() => import('./pages/projects.js'), { app: 'cursor' }));
route('/learn', page(() => import('./pages/learn.js'), { app: 'learning' }));
route('/learn/guide/:id', page(() => import('./pages/guide.js'), { app: 'learning' }));
route('/learn/course/:id', page(() => import('./pages/course.js'), { app: 'learning' }));
route('/learn/course/:id/day/:day', page(() => import('./pages/course.js'), { app: 'learning' }));
route('/learn/:app', { auth: true, focus: 1, appRoute: true, learn: true });
route('/learn/:app/:sub', { auth: true, focus: 1, appRoute: true, learn: true });
route('/learn/:app/:sub/:id', { auth: true, focus: 1, appRoute: true, learn: true });
route('/apps/:app', { auth: true, focus: 1, appRoute: true });
route('/apps/:app/:sub', { auth: true, focus: 1, appRoute: true });
route('/apps/:app/:sub/:id', { auth: true, focus: 1, appRoute: true });
route('/share', page(() => import('./pages/share.js')));
route('/settings', page(() => import('./pages/settings.js'), { app: 'settings' }));
route('/settings/:tab', page(() => import('./pages/settings.js'), { app: 'settings' }));
route('/404', { notFound: true });

let activePage = null;
let renderSeq = 0;

async function onRoute({ path, route: r, params }) {
  const seq = ++renderSeq;
  const user = store.get('user');
  if (r.notFound) return showInShell(notFound(), { title: 'Ikke fundet' }, seq);

  if (r.public) {
    if (user) return navigate('/', { replace: true });
    return showPublic(await r.render(), r.title, seq);
  }
  if (r.home) {
    if (!user) {
      const mod = await import('./pages/landing.js');
      if (seq !== renderSeq) return;
      return showPublic(await mod.default.render({}), null, seq, 0);
    }
    const mod = await import('./pages/home.js');
    return showInShell(mod.default, { params, focus: 0 }, seq);
  }
  if (r.auth && !user) {
    return navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
  }
  if (r.appRoute) {
    const app = appById(params.app);
    // learning apps moved into Guides & Læring – keep old /apps/… links and bookmarks working
    if (!r.learn && isLearnApp(app)) return navigate(path.replace(/^\/apps\//, '/learn/'), { replace: true });
    if (r.learn && !isLearnApp(app)) return showInShell(notFound(), { title: 'Ikke fundet' }, seq);
    if (!app || !app.page) return showInShell(notFound(), { title: 'Ikke fundet' }, seq);
    const acc = access(app, user);
    if (!acc.ok) return showInShell(lockedPage(app, acc), { title: app.name }, seq);
    const mod = await app.page();
    return showInShell(mod.default, { params, app }, seq);
  }
  const mod = await r.loader();
  return showInShell(mod.default, { params, app: r.app ? appById(r.app) : null }, seq);
}

function teardown() {
  closeAllModals();
  try { activePage?.destroy?.(); } catch (e) { console.error(e); }
  activePage = null;
}

function showPublic(node, title, seq, focus = 1) {
  if (seq !== renderSeq) return;
  teardown();
  clear(root);
  setFocus(focus);
  root.appendChild(node);
  document.title = title ? `${title} · HUBTECH` : 'HUBTECH — dit digitale univers';
  window.scrollTo(0, 0);
  bootDone();
}

async function showInShell(mod, { params = {}, app = null, title, focus } = {}, seq) {
  if (!hasShell()) { buildShell(root); initAutoSync(); startLive(); import('./ai/panel.js').then(m => m.initAssistant()).catch(e => console.error(e)); import('./features/calls.js').then(m => m.initCalls()).catch(e => console.error(e)); import('./features/bgm.js').then(m => m.initBgm()).catch(e => console.error(e)); }
  const outlet = getOutlet();
  setActiveNav(currentPath());
  setFocus(focus ?? mod.focus ?? 1);
  const old = outlet.firstElementChild;
  if (old && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    old.classList.add('leaving');
    await new Promise(r => setTimeout(r, 120));
  }
  if (seq !== renderSeq) return;
  teardown();
  clear(outlet);
  const ctx = { params, app, user: store.get('user') };
  let node;
  try {
    node = await mod.render(ctx);
  } catch (err) {
    console.error(err);
    node = h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Siden kunne ikke indlæses', text: err.message || String(err), actions: [h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, icon('refresh'), 'Prøv igen')] }));
  }
  if (seq !== renderSeq) { try { mod.destroy?.(); } catch { /* */ } return; }
  activePage = mod;
  if (currentPath().startsWith('/learn') && node?.classList?.contains('page')) node.prepend(learnTabs(currentPath()));
  outlet.appendChild(node);
  document.title = `${title || mod.title || app?.name || 'HUBTECH'} · HUBTECH`;
  window.scrollTo(0, 0);
  bootDone();
  maybeStartOnboarding();
}

function notFound() {
  return {
    title: 'Ikke fundet',
    render: () => h('div', { class: 'page', style: { paddingTop: '8vh' } }, stateBlock({
      icon: 'compass', title: 'Den sti findes ikke i universet', text: 'Siden er måske flyttet, eller linket er forkert. Brug søgningen eller gå tilbage til start.',
      actions: [h('a', { class: 'btn btn-primary', href: '#/' }, icon('home'), 'Til Hjem'), h('a', { class: 'btn', href: '#/apps' }, icon('apps'), 'Alle apps')],
    })),
  };
}

function lockedPage(app, acc) {
  return {
    title: app.name,
    render: () => h('div', { class: 'page', style: { paddingTop: '8vh' } }, stateBlock({
      app: app.hue, icon: acc.kind === 'coming' ? 'rocket' : 'lock',
      title: acc.kind === 'coming' ? `${app.name} er på vej` : `${app.name} er låst`,
      text: acc.kind === 'coming' ? app.description : 'Denne app giver adgang til filer og programmer på maskinen, hvor HUBTECH kører, og er derfor forbeholdt platformens ejer.',
      actions: [h('a', { class: 'btn', href: '#/apps' }, icon('apps'), 'Tilbage til apps')],
    })),
  };
}

let booted = false;
function bootDone() {
  if (booted) return;
  booted = true;
  const b = document.getElementById('boot');
  b?.classList.add('gone');
  setTimeout(() => b?.remove(), 700);
}

// ── session expiry ─────────────────────────────────────────────────────
let expiredShown = false;
onUnauthorized(() => {
  if (!store.get('user') || expiredShown) return;
  expiredShown = true;
  resetSessionState();
  toast('Din session er udløbet', { type: 'warn', text: 'Log ind igen for at fortsætte.' });
  const next = currentPath();
  navigate(`/login?expired=1&next=${encodeURIComponent(next)}`, { replace: true });
  setTimeout(() => { expiredShown = false; }, 3000);
});
store.on('user', (u) => {
  if (!u && hasShell()) { clear(root); }
  import('./features/reminders.js').then(m => (u ? m.startReminders() : m.stopReminders())).catch(() => {});
});

// ── boot ───────────────────────────────────────────────────────────────
async function boot() {
  try { initDesktop(); } catch (e) { console.error(e); }
  try { initWorld(document.getElementById('world')); } catch (e) { console.error('Landskabet kunne ikke starte', e); }
  try {
    const status = await api.get('/api/auth/status');
    store.set('authStatus', status);
    if (status.user) {
      store.set('user', status.user);
      await loadUserData();
    }
  } catch (err) {
    bootDone();
    clear(root);
    root.appendChild(h('div', { class: 'public', style: { justifyContent: 'center', padding: '16px' } }, h('div', { style: { maxWidth: '560px', margin: '0 auto' } }, stateBlock({
      kind: 'error', icon: 'plugOff', title: 'Serveren svarer ikke',
      text: 'HUBTECH-serveren kunne ikke kontaktes. Start den med “python3 server/app.py” og genindlæs siden.',
      actions: [h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, icon('refresh'), 'Prøv igen')],
    }))));
    return;
  }
  startRouter(onRoute);
  if (store.get('user')) import('./features/reminders.js').then(m => m.startReminders()).catch(() => {});
  // a Fokus timer that was running before a reload keeps running (and notifies) on every page
  try { if (store.get('user') && JSON.parse(localStorage.getItem('hubtech.focus.timer') || 'null')?.running) import('./pages/focus.js'); } catch { /* */ }
}

boot();
