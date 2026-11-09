/**
 * Your own shortcuts in the menu on the left: the page you are on (a project, a guide, a customer …), an app, or a
 * website. Press + under your pinned apps to add one, drag them to change the order, right-click one to move,
 * rename or remove it. They are kept with the pinned apps in prefs.widgets (dock: the order, shortcuts: what the
 * ones that aren't apps point at), so they also turn up in Alle apps and in the tab bar on a phone.
 * The pure parts are tested in tests/apps.test.mjs.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appGlyph } from '../core/appicons.js';
import { store, setPref } from '../core/store.js';
import { APPS, appById, access, visible } from '../core/registry.js';
import { dockIds, DOCK_DEFAULT, DOCK_MIN, DOCK_MAX } from './widgetlogic.js';

export const SC = 's:';
const SAFE = /^(https?:\/\/|#\/)/i;

/** The whole pinned list (also the ones past dockCount). */
export function pinList(w = {}) {
  return Array.isArray(w.dock) && w.dock.length ? w.dock.filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i) : [...DOCK_DEFAULT];
}

/** "nyheder.dk" → https://nyheder.dk/ – only http(s) and HUBTECH's own pages (#/…); anything else is refused. */
export function normalizeUrl(s) {
  let t = String(s || '').trim();
  if (!t) return null;
  if (t.startsWith('#/')) return /^#\/[\w\-./?=&%~]*$/.test(t) ? t : null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t.replace(/^\/+/, '');
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch { return null; }
}
export const hostLabel = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Hjemmeside'; } };

/** What a shortcut id points at, in the shape the menu, the tab bar and Alle apps use. */
export function shortcutEntry(id, w = {}) {
  const s = (Array.isArray(w.shortcuts) ? w.shortcuts : []).find(x => x && x.id === id);
  if (!s || typeof s.href !== 'string' || !SAFE.test(s.href)) return null;
  const internal = s.href.startsWith('#/');
  const route = internal ? s.href.slice(1).split('?')[0] : null;
  const label = String(s.label || '').slice(0, 40) || (internal ? 'Genvej' : hostLabel(s.href));
  return { id, label, name: label, icon: typeof s.icon === 'string' && s.icon ? s.icon : (internal ? 'link' : 'globe'), href: s.href, route: s.href,
    hue: typeof s.hue === 'string' && s.hue ? s.hue : (internal ? '#e8763a' : '#6aa9e8'), external: !internal, shortcut: true,
    tagline: internal ? 'Genvej til en side' : hostLabel(s.href), match: (p) => !!route && p === route };
}

/** The page you are on as a shortcut: its title, and the icon of the app it belongs to. */
export function pageSuggestion(hash, title = '') {
  const path = String(hash || '').replace(/^#/, '').split('?')[0] || '/';
  if (path === '/') return null;
  const app = APPS.filter(a => a.route && a.page && a.status !== 'coming' && (path === a.route.slice(1) || path.startsWith(a.route.slice(1) + '/'))).sort((a, b) => b.route.length - a.route.length)[0] || null;
  const label = (String(title || '').replace(/\s+/g, ' ').trim() || app?.name || 'Genvej').slice(0, 40);
  return { href: '#' + path, label, icon: app?.icon || (path.startsWith('/learn') ? 'graduation' : 'link'), hue: app?.hue || null, app: app && path === app.route.slice(1) ? app.id : null };
}

/** Add a shortcut (in front of "Alle apps"). Returns the patch for prefs.widgets, or { error }. */
export function addShortcut(w = {}, { label, href, icon: ic, hue } = {}) {
  const url = normalizeUrl(href);
  if (!url) return { error: 'Adressen ser ikke rigtig ud – fx nyheder.dk eller https://…' };
  const list = pinList(w), n = dockIds(w).length;
  const shortcuts = (Array.isArray(w.shortcuts) ? w.shortcuts : []).filter(s => s && typeof s.id === 'string' && list.includes(s.id));
  if (shortcuts.some(s => s.href === url && list.indexOf(s.id) < n)) return { error: 'Den genvej har du allerede.' };
  if (n >= DOCK_MAX) return { error: `Du kan højst have ${DOCK_MAX} genveje og apps. Fjern en først.` };
  const id = SC + Math.random().toString(36).slice(2, 9);
  const sc = { id, label: String(label || '').replace(/\s+/g, ' ').trim().slice(0, 40) || (url.startsWith('#/') ? 'Genvej' : hostLabel(url)), href: url, icon: ic || (url.startsWith('#/') ? 'link' : 'globe'), ...(hue ? { hue } : {}) };
  const ai = list.indexOf('apps');
  list.splice(ai > -1 && ai < n ? ai : n, 0, id);
  return { id, shortcuts: [...shortcuts, sc], dock: list, dockCount: n + 1 };
}

/** Take something out of the menu (a shortcut is forgotten, an app can be pinned again from Alle apps). */
export function removePin(w = {}, id) {
  const list = pinList(w), n = dockIds(w).length, at = list.indexOf(id);
  if (at < 0) return { error: 'Den findes ikke længere.' };
  if (at < n && n <= DOCK_MIN) return { error: `Der skal mindst være ${DOCK_MIN} i menuen.` };
  list.splice(at, 1);
  const patch = { dock: list, dockCount: at < n ? n - 1 : n };
  if (id.startsWith(SC)) patch.shortcuts = (Array.isArray(w.shortcuts) ? w.shortcuts : []).filter(s => s && s.id !== id);
  return patch;
}

/** New order for some of the pinned (the ones in the menu): they swap places, the rest stay where they are. */
export function reorderPins(w = {}, order = []) {
  const list = pinList(w), set = new Set(order);
  if (order.some(id => !list.includes(id))) return { dock: list };
  const slots = list.map((id, i) => (set.has(id) ? i : -1)).filter(i => i > -1);
  const out = [...list];
  slots.forEach((slot, k) => { out[slot] = order[k]; });
  return { dock: out };
}

export function renameShortcut(w = {}, id, label) {
  const name = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return { error: 'Skriv et navn.' };
  return { shortcuts: (Array.isArray(w.shortcuts) ? w.shortcuts : []).map(s => (s && s.id === id ? { ...s, label: name } : s)) };
}

// ── in the browser ──
const widgets = () => store.get('prefs')?.widgets || {};
const save = (patch) => { const { id, error, ...rest } = patch; setPref('widgets', { ...widgets(), ...rest }); };
async function say(text, type = 'ok') { const { toast } = await import('../core/ui.js'); toast(text, { type, ms: type === 'ok' ? 1800 : 3000 }); }

function pageTitle() {
  const main = document.getElementById('main');
  for (const sel of ['.pj-head h2', '.app-hero h1', '.page-head h1', 'h1', 'h2']) {
    const t = main?.querySelector(sel)?.textContent?.trim();
    if (t) return t;
  }
  return '';
}

let open = null;
function place(box, anchor) {
  const r = anchor.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
  const left = Math.min(innerWidth - bw - 8, r.right + 18), top = Math.max(8, Math.min(innerHeight - bh - 8, r.top - 12));
  Object.assign(box.style, { left: `${Math.max(8, left)}px`, top: `${top}px` });
}
function popover(anchor, cls, label, build) {
  open?.close();
  const back = document.activeElement;
  const box = h('div', { class: ['sc-pop', cls], role: 'dialog', 'aria-label': label });
  let done = false;
  const close = ({ refocus = true } = {}) => {
    if (done) return; done = true; open = null;
    removeEventListener('pointerdown', outside, true); removeEventListener('keydown', key, true); removeEventListener('hashchange', hc);
    if (anchor.hasAttribute?.('aria-haspopup')) anchor.setAttribute('aria-expanded', 'false');
    box.remove();
    if (refocus && back?.isConnected) back.focus();
  };
  const outside = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) close({ refocus: false }); };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('a[href], button:not([disabled]), input')].filter(x => x.getClientRects().length);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  const hc = () => close({ refocus: false });
  build(box, close);
  document.body.append(box);
  place(box, anchor);
  if (anchor.hasAttribute?.('aria-haspopup')) anchor.setAttribute('aria-expanded', 'true');
  addEventListener('pointerdown', outside, true); addEventListener('keydown', key, true); addEventListener('hashchange', hc);
  open = { close, box };
  (box.querySelector('[autofocus]') || box.querySelector('input, button'))?.focus();
  return open;
}

/** The + in the menu: this page, an app, or a website. */
export function openAddShortcut(anchor, { fixed = new Set() } = {}) {
  if (open?.box?.classList.contains('sc-add')) { open.close(); return; }
  const user = store.get('user');
  popover(anchor, 'sc-add', 'Tilføj genvej', (box, close) => {
    const finish = (patch, text) => { if (patch.error) { say(patch.error, 'warn'); return; } save(patch); say(text); close({ refocus: false }); };
    // 1. the page you're on
    const sug = pageSuggestion(location.hash, pageTitle());
    const inMenu = sug && ((sug.app && (fixed.has(sug.app) || pinList(widgets()).slice(0, dockIds(widgets()).length).includes(sug.app))) || ['/apps', '/learn', '/settings'].includes(sug.href.slice(1)) || dockIds(widgets()).some(id => shortcutEntry(id, widgets())?.href === sug.href));
    let here = null;
    if (sug && !inMenu) {
      const name = h('input', { class: 'input sc-in', value: sug.label, maxlength: 40, 'aria-label': 'Navn på genvejen' });
      const add = () => sug.app
        ? import('./appdrawer.js').then(m => { const p = m.togglePin(widgets(), sug.app); finish(p, `${appById(sug.app)?.name || 'Appen'} er lagt i menuen`); })
        : finish(addShortcut(widgets(), { label: name.value, href: sug.href, icon: sug.icon, hue: sug.hue }), `“${name.value.trim() || sug.label}” er lagt i menuen`);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      here = h('section', { class: 'sc-sec' }, h('h3', { class: 'sc-h' }, 'Denne side'),
        h('div', { class: 'sc-here', style: sug.hue ? { '--app': sug.hue } : null }, h('span', { class: 'ab-ico' }, sug.app ? appGlyph(sug.app, sug.icon) : icon(sug.icon)), sug.app ? h('b', { class: 'sc-here-n' }, appById(sug.app)?.name) : name,
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: add }, icon('pin'), 'Fastgør')));
    }
    // 2. an app
    const q = h('input', { class: 'input sc-in', type: 'search', placeholder: 'Søg efter en app …', 'aria-label': 'Søg efter en app', autocomplete: 'off', autofocus: !here });
    const hits = h('ul', { class: 'sc-hits', role: 'list' });
    const pinned = () => pinList(widgets()).slice(0, dockIds(widgets()).length);
    const drawHits = () => {
      const t = q.value.trim().toLowerCase();
      const list = APPS.filter(a => a.page && a.status !== 'coming' && visible(a, user) && access(a, user).ok && !pinned().includes(a.id) && !fixed.has(a.id))
        .filter(a => !t || a.name.toLowerCase().includes(t) || (a.keywords || []).some(k => k.includes(t)))
        .sort((a, b) => (t && b.name.toLowerCase().startsWith(t)) - (t && a.name.toLowerCase().startsWith(t)) || a.name.localeCompare(b.name, 'da')).slice(0, t ? 6 : 0);
      h(clear(hits), null, list.map(a => h('li', null, h('button', { type: 'button', class: 'sc-hit', style: { '--app': a.hue },
        onclick: () => import('./appdrawer.js').then(m => finish(m.togglePin(widgets(), a.id), `${a.name} er lagt i menuen`)) },
        h('span', { class: 'ab-ico ab-ico-sm' }, appGlyph(a)), h('span', null, a.name), icon('plus')))));
      if (t && !list.length) h(hits, null, h('li', { class: 'faint sc-none' }, 'Ingen apps – eller den er der allerede.'));
      if (box.isConnected) place(box, anchor);   // it grows with the hits: keep it on the screen
    };
    q.addEventListener('input', drawHits);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hits.querySelector('button')?.click(); } });
    // 3. a website
    const url = h('input', { class: 'input sc-in', type: 'url', inputmode: 'url', placeholder: 'fx dr.dk eller https://…', 'aria-label': 'Adresse på hjemmesiden', autocomplete: 'off' });
    const nm = h('input', { class: 'input sc-in', placeholder: 'Navn (valgfrit)', maxlength: 40, 'aria-label': 'Navn på hjemmesiden' });
    const addUrl = () => finish(addShortcut(widgets(), { label: nm.value, href: url.value }), 'Hjemmesiden er lagt i menuen');
    for (const i of [url, nm]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } });
    h(box, null,
      h('div', { class: 'sc-head' }, h('h2', { class: 'sc-title' }, 'Tilføj genvej'), h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Luk', onclick: () => close() }, icon('x'))),
      here,
      h('section', { class: 'sc-sec' }, h('h3', { class: 'sc-h' }, 'En app'), q, hits),
      h('section', { class: 'sc-sec' }, h('h3', { class: 'sc-h' }, 'En hjemmeside'), h('div', { class: 'sc-row' }, url, nm, h('button', { type: 'button', class: 'btn btn-sm', onclick: addUrl }, icon('plus'), 'Tilføj'))),
      h('p', { class: 'sc-foot faint' }, 'Træk i genvejene for at flytte dem. Højreklik for at fjerne.'));
    if (here) requestAnimationFrame(() => here.querySelector('input, button')?.focus());
  });
}

/** Right-click (or the menu key) on a shortcut in the menu: move, rename, remove. `order` is the menu's order now. */
export function openPinMenu(anchor, id, order, at) {
  const w = widgets();
  const entry = id.startsWith(SC) ? shortcutEntry(id, w) : null;
  const name = entry?.label || appById(id)?.name || anchor.getAttribute('aria-label') || 'Genvejen';
  const i = order.indexOf(id);
  const move = (d) => { const o = [...order]; [o[i], o[i + d]] = [o[i + d], o[i]]; save(reorderPins(widgets(), o)); };
  const pop = popover(anchor, 'sc-menu', `Genvej: ${name}`, (box, close) => {
    const item = (label, ic, fn, disabled = false) => h('button', { type: 'button', role: 'menuitem', class: 'sc-mi', disabled, onclick: () => { close({ refocus: false }); fn(); } }, icon(ic), label);
    h(box, null, h('div', { role: 'menu', 'aria-label': name, class: 'sc-mlist' },
      item('Flyt op', 'arrowUp', () => move(-1), i <= 0),
      item('Flyt ned', 'arrowDown', () => move(1), i < 0 || i >= order.length - 1),
      entry ? item('Omdøb', 'edit', () => renameDialog(id, entry.label)) : null,
      entry?.external ? item('Åbn i browseren', 'external', () => window.open(entry.href, '_blank', 'noopener')) : null,
      item('Fjern fra menuen', 'trash', () => { const p = removePin(widgets(), id); if (p.error) say(p.error, 'warn'); else { save(p); say(`${name} er fjernet fra menuen`); } })));
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...box.querySelectorAll('.sc-mi:not([disabled])')], k = items.indexOf(document.activeElement);
      e.preventDefault(); items[(k + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    });
  });
  if (at && pop) Object.assign(pop.box.style, { left: `${Math.min(innerWidth - pop.box.offsetWidth - 8, at.x)}px`, top: `${Math.min(innerHeight - pop.box.offsetHeight - 8, at.y)}px` });
  pop?.box.querySelector('.sc-mi:not([disabled])')?.focus();
}

async function renameDialog(id, current) {
  const { modal } = await import('../core/ui.js');
  const inp = h('input', { class: 'input', value: current, maxlength: 40, 'aria-label': 'Nyt navn' });
  let m;
  const ok = () => { const p = renameShortcut(widgets(), id, inp.value); if (p.error) { say(p.error, 'warn'); return; } save(p); m.close(); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
  m = modal({ title: 'Omdøb genvej', size: 420, body: inp,
    actions: [h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { type: 'button', class: 'btn btn-primary', onclick: ok }, 'Gem')] });
  requestAnimationFrame(() => { inp.focus(); inp.select(); });
}

/** Drag the shortcuts in the menu up and down; `onDrop(order)` gets the new order. A drag never opens the link. */
export function railDrag(rail, onDrop) {
  let st = null, swallow = false;
  rail.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('.irail-item.is-pin');
    if (!el || e.button !== 0 || e.pointerType === 'touch') return;
    st = { el, y0: e.clientY, pid: e.pointerId, active: false };
  });
  rail.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    if (!st.active) {
      if (Math.abs(e.clientY - st.y0) < 6) return;
      st.active = true; st.el.setPointerCapture?.(e.pointerId); st.el.classList.add('is-drag'); rail.classList.add('is-sorting');
    }
    const others = [...rail.querySelectorAll('.irail-item.is-pin')].filter(p => p !== st.el);
    const over = others.find(p => { const r = p.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (over) { if (st.el.nextElementSibling !== over) over.before(st.el); }
    else if (others.length && others.at(-1).nextElementSibling !== st.el) others.at(-1).after(st.el);
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.pid) return;
    const was = st; st = null;
    if (!was.active) return;
    was.el.classList.remove('is-drag'); rail.classList.remove('is-sorting');
    swallow = true; setTimeout(() => { swallow = false; }, 0);
    onDrop([...rail.querySelectorAll('.irail-item.is-pin')].map(p => p.dataset.id));
  };
  rail.addEventListener('pointerup', end); rail.addEventListener('pointercancel', end);
  rail.addEventListener('click', (e) => { if (swallow) { e.preventDefault(); e.stopPropagation(); } }, true);
  rail.addEventListener('dragstart', (e) => { if (e.target.closest?.('.irail-item')) e.preventDefault(); });
}

/** Called by the menu when you let go of a shortcut. */
export function savePinOrder(order) { save(reorderPins(widgets(), order)); }
