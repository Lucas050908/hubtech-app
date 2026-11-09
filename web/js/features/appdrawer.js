/**
 * Alle apps. One view, two places: a drawer that slides out from the menu on the left (and covers the screen on a
 * phone) over the page you are on, and the #/apps page. Search first, then your pinned apps, the ones you used last
 * and every app sorted by what it is for. Pinned apps are the menu's own list (prefs.widgets.dock), so pinning an app
 * here also puts it in the menu on the left (and in the tab bar on a phone). The pure parts are tested in
 * tests/apps.test.mjs.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appGlyph } from '../core/appicons.js';
import { store } from '../core/store.js';
import { APPS, LEARN_APPS, SUITES, appById, access, visible, isLearnApp } from '../core/registry.js';
import { dockIds, DOCK_DEFAULT, DOCK_MIN, DOCK_MAX } from './widgetlogic.js';
import { shortcutEntry, removePin, SC } from './shortcuts.js';

// places that are not apps but can be pinned
const PLACES = {
  home: { id: 'home', name: 'Hjem', icon: 'home', route: '#/', hue: '#f97316', tagline: 'Forsiden' },
  learn: { id: 'learn', name: 'Læring', icon: 'graduation', route: '#/learn', hue: '#22c55e', tagline: 'Guides, kurser og øvelser' },
};
// the order of the groups; '_more' is the apps that belong to no group, '_learn' and '_system' are what they say
const ORDER = ['plan', 'office', 'team', '_more', 'service', 'support', 'money', 'dev', 'tools2', 'pause', '_learn', '_system'];

const usable = (a, user) => !!a && !!a.page && a.status !== 'coming' && visible(a, user) && access(a, user).ok;

/** Every app the user can open, in groups: [{ id, name, icon, hue, apps }]. */
export function appGroups(user) {
  const lift = (a) => (a?.partOf ? appById(a.partOf) : a);
  const grouped = new Set(SUITES.flatMap(s => s.members.flatMap(id => [id, appById(id)?.partOf].filter(Boolean))));
  const out = [];
  for (const key of ORDER) {
    let g;
    if (key === '_more') g = { id: 'more', name: 'Gnist og fællesskab', icon: 'sparkles', apps: APPS.filter(a => a.category === 'workspace' && !a.partOf && !grouped.has(a.id)) };
    else if (key === '_learn') g = { id: 'learn', name: 'Lær og øv', icon: 'graduation', apps: [appById('learning'), ...LEARN_APPS] };
    else if (key === '_system') g = { id: 'system', name: 'System', icon: 'settings', apps: APPS.filter(a => a.category === 'system') };
    else { const s = SUITES.find(x => x.id === key); if (!s) continue; g = { id: s.id, name: s.name, icon: s.icon, hue: s.hue, apps: s.members.map(appById) }; }
    g.apps = [...new Map(g.apps.map(lift).filter(a => usable(a, user)).map(a => [a.id, a])).values()];
    if (g.apps.length) out.push(g);
  }
  const seen = new Set(out.flatMap(g => g.apps.map(a => a.id)));
  const rest = APPS.filter(a => usable(a, user) && !a.partOf && !seen.has(a.id) && !isLearnApp(a));
  if (rest.length) out.push({ id: 'other', name: 'Andre apps', icon: 'apps', apps: rest });
  return out;
}

const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa');

/** Apps that match a search, best first: the name starts with it, then has it, then the description or the group does. */
export function searchApps(q, groups) {
  const n = norm(q.trim());
  if (!n) return [];
  const hits = [];
  for (const g of groups) for (const a of g.apps.flatMap(x => [x, ...(x.parts || []).map(appById).filter(Boolean)])) {
    const name = norm(a.name), hay = norm([a.tagline, a.description, g.name, a.partOf ? appById(a.partOf)?.name : '', ...(a.keywords || [])].join(' '));
    const sc = name.startsWith(n) ? 4 : name.split(/[\s-]+/).some(w => w.startsWith(n)) ? 3 : name.includes(n) ? 2 : hay.includes(n) ? 1 : 0;
    if (sc && !hits.some(x => x.a.id === a.id)) hits.push({ a, sc });
  }
  return hits.sort((x, y) => y.sc - x.sc || x.a.name.localeCompare(y.a.name, 'da')).map(x => x.a);
}

/** The pinned list as the menu shows it (the first dockCount of prefs.widgets.dock). */
export const pinnedIds = (w = {}) => dockIds(w);

/** Pin or unpin: returns the patch for prefs.widgets, or { error } when it can't be done. */
export function togglePin(w = {}, id) {
  const list = Array.isArray(w.dock) && w.dock.length ? w.dock.filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i) : [...DOCK_DEFAULT];
  const n = dockIds(w).length;
  const at = list.indexOf(id);
  if (at > -1 && at < n) {
    if (n <= DOCK_MIN) return { error: `Der skal mindst være ${DOCK_MIN} fastgjorte.` };
    list.splice(at, 1);
    return { dock: list, dockCount: n - 1, pinned: false };
  }
  if (n >= DOCK_MAX) return { error: `Du kan højst fastgøre ${DOCK_MAX}. Fjern en først.` };
  if (at > -1) list.splice(at, 1);
  const ai = list.indexOf('apps');   // in front of "Alle apps", so that one stays last
  list.splice(ai > -1 && ai < n ? ai : n, 0, id);
  return { dock: list, dockCount: n + 1, pinned: true };
}

/** What a pinned id is: an app the user can open, a place, or one of your own shortcuts. */
export function pinEntry(id, user, w = {}) {
  if (PLACES[id]) return PLACES[id];
  if (id.startsWith(SC)) return shortcutEntry(id, w);
  const a = appById(id);
  return usable(a, user) ? a : null;
}

function recentApps(user) {
  try { return JSON.parse(localStorage.getItem('hubtech.recentApps') || '[]').map(appById).filter(a => usable(a, user)).slice(0, 6); } catch { return []; }
}

/**
 * The view itself. mode 'panel' (the drawer: one column) or 'page' (the #/apps page: an index of the groups on the left).
 * onGo runs when an app is opened. Returns { el, focus() }.
 */
export function appBrowser({ mode = 'page', onGo = () => {} } = {}) {
  const user = store.get('user');
  const groups = appGroups(user);
  const count = new Set(groups.flatMap(g => g.apps.map(a => a.id))).size;
  const w = () => store.get('prefs')?.widgets || {};
  const isPinned = (id) => pinnedIds(w()).includes(id);

  const search = h('input', { class: 'input ab-search', type: 'search', placeholder: `Søg blandt ${count} apps …`, 'aria-label': 'Søg efter en app', autocomplete: 'off', spellcheck: 'false' });
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const body = h('div', { class: 'ab-body' });
  const index = mode === 'page' ? h('nav', { class: 'ab-index', 'aria-label': 'Grupper' }) : null;

  async function pin(a) {
    const patch = a.shortcut ? { ...removePin(w(), a.id), pinned: false } : togglePin(w(), a.id);
    const { toast } = await import('../core/ui.js');
    if (patch.error) { toast(patch.error, { type: 'warn', ms: 2600 }); return; }
    const { setWidgets } = await import('./topwidgets.js');
    setWidgets({ dock: patch.dock, dockCount: patch.dockCount, ...(patch.shortcuts ? { shortcuts: patch.shortcuts } : {}) });
    toast(patch.pinned ? `${a.name} er fastgjort i menuen` : `${a.name} er fjernet fra menuen`, { type: 'ok', ms: 2000 });
    const keep = document.activeElement?.dataset?.pin;
    draw();
    if (keep) body.querySelector(`[data-pin="${CSS.escape(keep)}"]`)?.focus();
  }
  const pinBtn = (a) => {
    const on = isPinned(a.id);
    return h('button', { type: 'button', class: 'ab-pin', dataset: { pin: a.id }, 'aria-pressed': String(on), 'aria-label': on ? `Fjern ${a.name} fra menuen` : `Fastgør ${a.name} i menuen`, title: on ? 'Fastgjort i menuen – klik for at fjerne' : 'Fastgør i menuen', onclick: () => pin(a) }, icon(on ? 'pinFill' : 'pin'));
  };
  const parts = (a) => (a.parts ? h('div', { class: 'ab-parts' }, a.parts.map(appById).filter(Boolean).map(p => h('a', { class: 'ab-part', href: p.route, onclick: () => onGo(p) }, p.name))) : null);
  const row = (a, first = false) => h('li', { class: ['ab-row', first && 'is-first', a.parts && 'has-parts'], style: { '--app': a.hue } },
    h('a', { class: 'ab-link', href: a.route, onclick: () => onGo(a) },
      h('span', { class: 'ab-ico' }, appGlyph(a)),
      h('span', { class: 'ab-txt' }, h('b', null, a.name), a.tagline ? h('small', null, a.tagline) : null),
      first ? h('kbd', { class: 'ab-enter', 'aria-hidden': 'true' }, 'Enter') : null),
    pinBtn(a), parts(a));
  const tile = (a) => h('li', { class: 'ab-tile', style: { '--app': a.hue } },
    h('a', { class: 'ab-link ab-tile-a', href: a.route, onclick: () => onGo(a), ...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, h('span', { class: 'ab-ico ab-ico-lg' }, appGlyph(a)), h('span', { class: 'ab-tile-n' }, a.name)),
    PLACES[a.id] ? null : pinBtn(a));
  const head = (text, ic, extra) => h('h3', { class: 'ab-h' }, icon(ic), h('span', null, text), extra || null);

  function draw() {
    const q = search.value.trim();
    clear(body);
    if (index) clear(index);
    if (q) {
      const hits = searchApps(q, groups);
      status.textContent = hits.length ? `${hits.length} apps fundet` : 'Ingen apps fundet';
      h(body, null, hits.length
        ? h('section', { class: 'ab-sec' }, head(`${hits.length} ${hits.length === 1 ? 'app' : 'apps'}`, 'search'), h('ul', { class: 'ab-rows', role: 'list' }, hits.map((a, i) => row(a, i === 0))))
        : h('div', { class: 'ab-empty' }, h('b', null, `Ingen apps matcher “${q}”.`), h('span', { class: 'faint' }, 'Prøv et andet ord – fx “faktura”, “printer” eller “skak”.')));
      return;
    }
    status.textContent = '';
    const pins = pinnedIds(w()).filter(id => id !== 'apps').map(id => pinEntry(id, user, w())).filter(Boolean);
    const recent = recentApps(user);
    const secs = [];
    if (pins.length) secs.push({ id: 'pinned', name: 'Fastgjort', el: h('section', { class: 'ab-sec', id: `ab-${mode}-pinned` }, head('Fastgjort', 'pin', h('small', { class: 'ab-hint' }, matchMedia('(max-width: 900px)').matches ? 'de første ligger også i bunden' : 'ligger også i menuen til venstre')), h('ul', { class: 'ab-tiles', role: 'list' }, pins.map(tile))) });
    if (recent.length) secs.push({ id: 'recent', name: 'Senest brugt', el: h('section', { class: 'ab-sec', id: `ab-${mode}-recent` }, head('Senest brugt', 'clock'), h('ul', { class: 'ab-chips', role: 'list' }, recent.map(a => h('li', null, h('a', { class: 'ab-chip', href: a.route, style: { '--app': a.hue }, onclick: () => onGo(a) }, h('span', { class: 'ab-ico ab-ico-sm' }, appGlyph(a)), a.name))))) });
    for (const g of groups) secs.push({ id: g.id, name: g.name, n: g.apps.length, el: h('section', { class: 'ab-sec ab-group', id: `ab-${mode}-${g.id}` }, head(g.name, g.icon, h('small', { class: 'ab-count' }, String(g.apps.length))), h('ul', { class: 'ab-rows', role: 'list' }, g.apps.map(a => row(a)))) });
    h(body, null, secs.map(s => s.el));
    if (index) h(index, null, secs.map(s => h('a', { class: 'ab-index-a', href: `#/apps`, onclick: (e) => { e.preventDefault(); document.getElementById(`ab-${mode}-${s.id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } }, h('span', null, s.name), s.n ? h('small', null, String(s.n)) : null)));
  }

  // keys: ↓ from the search goes to the first app, ↑↓ move between apps, Enter in the search opens the first hit
  const links = () => [...body.querySelectorAll('.ab-link, .ab-chip')].filter(e => e.getClientRects().length);
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = body.querySelector('.ab-row.is-first .ab-link'); if (first) { e.preventDefault(); first.click(); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); links()[0]?.focus(); }
  });
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = links(), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) { search.focus(); return; }
    all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  });
  draw();
  const el = h('div', { class: ['ab', `ab-${mode}`] },
    h('div', { class: 'ab-searchbar' }, icon('search'), search, status),
    index ? h('div', { class: 'ab-cols' }, index, body) : body);
  // pinned somewhere else (Tilpas, another tab): redraw – and stop listening once the view is gone
  const off = store.on('prefs', () => { if (!el.isConnected) { off(); return; } if (!body.contains(document.activeElement)) draw(); });
  return { el, focus: () => search.focus(), destroy: () => off() };
}

// ── the drawer ──
let current = null;
export function isAppDrawerOpen() { return !!current; }
export function closeAppDrawer() { current?.close(); }
export function openAppDrawer({ from } = {}) {
  if (current) { current.close(); return; }
  const back = from || document.activeElement;
  let done = false;
  const close = ({ refocus = true } = {}) => {
    if (done) return;
    done = true; current = null;
    removeEventListener('keydown', onKey, true); removeEventListener('hashchange', onHash);
    browser.destroy();
    document.documentElement.classList.remove('adr-open');
    document.querySelectorAll('[data-drawer="apps"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    panel.remove(); scrim.remove();
    if (refocus) (back?.isConnected ? back : [...document.querySelectorAll('[data-drawer="apps"]')].find(e => e.getClientRects().length))?.focus();
  };
  const browser = appBrowser({ mode: 'panel', onGo: () => close({ refocus: false }) });
  const panel = h('div', { class: 'adr', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'adr-t', id: 'app-drawer' },
    h('div', { class: 'adr-head' },
      h('div', { class: 'adr-tt' }, h('h2', { class: 'adr-title', id: 'adr-t' }, 'Alle apps'), h('span', { class: 'faint' }, 'Søg, åbn eller fastgør')),
      h('a', { class: 'icon-btn', href: '#/apps', 'aria-label': 'Vis som side', title: 'Vis som side', onclick: () => close({ refocus: false }) }, icon('maximize')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Luk Alle apps', title: 'Luk (Esc)', onclick: () => close() }, icon('x'))),
    browser.el);
  const scrim = h('div', { class: 'adr-scrim', 'aria-hidden': 'true', onclick: () => close() });
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('a[href], button:not([disabled]), input')].filter(x => x.getClientRects().length);
    if (!f.length) return;
    if (!panel.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
    else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  const onHash = () => close({ refocus: false });
  document.body.append(scrim, panel);
  document.documentElement.classList.add('adr-open');
  document.querySelectorAll('[data-drawer="apps"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
  addEventListener('keydown', onKey, true); addEventListener('hashchange', onHash);
  current = { close };
  browser.focus();
}
