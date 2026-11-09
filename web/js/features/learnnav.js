/**
 * Navigation inside a section.
 * - Lær og øv: one slim line instead of a row of 14 tabs – "Lær og øv › Kode-editor ▾". The name opens a panel with
 *   every learning app sorted by what it is for, and the ones you used last sit at the end of the line.
 * - An app made of parts (Økonomi, HUBTECH Office with the Notesbog): a tab for each part.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appGlyph } from '../core/appicons.js';
import { LEARN_APPS, appById } from '../core/registry.js';

export const LEARN_GROUPS = [
  { name: 'Øv i praksis', icon: 'terminal', ids: ['labs', 'linux', 'codepad', 'electro'] },
  { name: 'Lær at kode', icon: 'code', ids: ['codeschool', 'snippets'] },
  { name: 'Træn og test', icon: 'target', ids: ['flashcards', 'quiz', 'phishing', 'typing', 'bits'] },
  { name: 'Slå op', icon: 'book', ids: ['glossary', 'toolkit'] },
];
const onApp = (a, path) => path === a.route.slice(1) || path.startsWith(a.route.slice(1) + '/');
const isOverview = (path) => path === '/learn' || /^\/learn\/(guide|course)(\/|$)/.test(path);

/** The learning apps in their groups (an app no group knows yet goes in "Mere"). */
export function learnGroups(apps = LEARN_APPS) {
  const seen = new Set();
  const out = LEARN_GROUPS.map(g => ({ ...g, apps: g.ids.map(id => apps.find(a => a.id === id)).filter(Boolean) })).filter(g => g.apps.length);
  out.forEach(g => g.apps.forEach(a => seen.add(a.id)));
  const rest = apps.filter(a => !seen.has(a.id));
  if (rest.length) out.push({ name: 'Mere', icon: 'grid', apps: rest });
  return out;
}

function recentLearn(path) {
  try { return JSON.parse(localStorage.getItem('hubtech.recentApps') || '[]').map(id => LEARN_APPS.find(a => a.id === id)).filter(a => a && !onApp(a, path)).slice(0, 3); } catch { return []; }
}

export function learnTabs(path) {
  const cur = LEARN_APPS.find(a => onApp(a, path));
  const curBtn = h('button', { type: 'button', class: 'lnb-cur', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `${cur ? cur.name : 'Oversigt'} – vis alle læringsapps`, style: cur ? { '--app': cur.hue } : null,
    onclick: (e) => openLearnPanel(e.currentTarget, path) },
    h('span', { class: 'ab-ico ab-ico-sm' }, cur ? appGlyph(cur) : icon('book')), h('span', { class: 'lnb-name' }, cur ? cur.name : 'Oversigt'), icon('chevronDown'));
  const recent = recentLearn(path);
  return h('nav', { class: 'lnb', 'aria-label': 'Lær og øv' },
    h('a', { class: ['lnb-home', isOverview(path) && 'is-on'], href: '#/learn', 'aria-current': isOverview(path) ? 'page' : null }, icon('graduation'), h('span', null, 'Lær og øv')),
    h('span', { class: 'lnb-sep', 'aria-hidden': 'true' }, icon('chevronRight')),
    curBtn,
    recent.length ? h('div', { class: 'lnb-recent', role: 'group', 'aria-label': 'Senest brugt' }, h('span', { class: 'lnb-recent-l faint' }, 'Senest'),
      recent.map(a => h('a', { class: 'lnb-chip', href: a.route, style: { '--app': a.hue } }, appGlyph(a), h('span', null, a.name)))) : null);
}

let pop = null;
export function openLearnPanel(btn, path) {
  if (pop) { const open = pop.box.isConnected; pop.close({ refocus: open }); if (open) return; }   // gone with a redrawn top bar: open a new one
  if (!btn.isConnected) return;
  const recent = recentLearn(path);
  const box = h('div', { class: 'lnb-pop', role: 'dialog', 'aria-label': 'Alle læringsapps' },
    recent.length ? h('section', { class: 'lnb-grp lnb-grp-recent' }, h('h3', { class: 'ab-h' }, icon('clock'), h('span', null, 'Senest brugt')),
      h('div', { class: 'lnb-chips' }, recent.map(a => h('a', { class: 'lnb-chip', href: a.route, style: { '--app': a.hue } }, appGlyph(a), h('span', null, a.name))))) : null,
    learnGroups().map(g => h('section', { class: 'lnb-grp' },
      h('h3', { class: 'ab-h' }, icon(g.icon), h('span', null, g.name)),
      h('div', { class: 'lnb-items' }, g.apps.map(a => h('a', { class: ['lnb-item', onApp(a, path) && 'is-on'], href: a.route, 'aria-current': onApp(a, path) ? 'page' : null, style: { '--app': a.hue } },
        h('span', { class: 'ab-ico' }, appGlyph(a)), h('span', { class: 'ab-txt' }, h('b', null, a.name), a.tagline ? h('small', null, a.tagline) : null)))))),
    h('a', { class: 'lnb-all', href: '#/learn' }, icon('book'), h('span', null, 'Guides, kurser og oversigt'), icon('arrowRight')));
  let done = false;
  const close = ({ refocus = true } = {}) => {
    if (done) return; done = true; pop = null;
    removeEventListener('pointerdown', outside, true); removeEventListener('keydown', key, true); removeEventListener('hashchange', hc);
    btn.setAttribute('aria-expanded', 'false'); box.remove();
    if (refocus && btn.isConnected) btn.focus();
  };
  const outside = (e) => { if (!box.contains(e.target) && !btn.contains(e.target)) close({ refocus: false }); };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const all = [...box.querySelectorAll('a')], i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      all[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length].focus();
    }
    if (e.key === 'Tab') {
      const all = [...box.querySelectorAll('a')];
      if (e.shiftKey && document.activeElement === all[0]) { e.preventDefault(); all.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === all.at(-1)) { e.preventDefault(); all[0].focus(); }
    }
  };
  const hc = () => close({ refocus: false });
  btn.after(box);
  btn.setAttribute('aria-expanded', 'true');
  addEventListener('pointerdown', outside, true); addEventListener('keydown', key, true); addEventListener('hashchange', hc);
  pop = { close, box };
  (box.querySelector('.lnb-item.is-on') || box.querySelector('a'))?.focus();
}

/** Tabs for an app made of parts: the app itself (Overblik / Filer) and a tab per part. */
export function partTabs(parent, path) {
  const parts = (parent.parts || []).map(appById).filter(Boolean);
  const root = parent.route.slice(1);
  const tabs = [{ href: parent.route, label: parent.tabLabel || parent.name, icon: parent.tabIcon || parent.icon, hue: parent.hue, on: path === root },
    ...parts.map(a => ({ href: a.route, label: a.name, icon: a.icon, app: a, hue: a.hue, on: onApp(a, path) }))];
  const nav = h('nav', { class: 'learn-tabs part-tabs', 'aria-label': parent.name },
    tabs.map(t => h('a', { class: ['learn-tab', t.on && 'is-on'], href: t.href, 'aria-current': t.on ? 'page' : null, style: { '--app': t.hue } }, t.app ? appGlyph(t.app) : icon(t.icon), h('span', null, t.label))));
  requestAnimationFrame(() => { const on = nav.querySelector('.is-on'); if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; });
  return nav;
}

/** Tabs for an app group (Planlæg, Service, HUBTECH Office) – same look as Guides & Læring. */
export function suiteTabs(suite, path) {
  const members = suite.members.map(appById).filter(Boolean);
  // a big group (Spilhal has 40): a button that shows them all as a grid you can search in
  const all = members.length > 9 ? h('button', { class: 'learn-tab suite-all', 'aria-label': `Alle i ${suite.name}`, onclick: () => showAll(suite, members, path) }, icon('grid'), h('span', null, `Alle ${members.length}`)) : null;
  const nav = h('nav', { class: 'learn-tabs suite-tabs', 'aria-label': suite.name }, all,
    members.map(a => {
      const on = onApp(a, path);
      return h('a', { class: ['learn-tab', on && 'is-on'], href: a.route, 'aria-current': on ? 'page' : null, style: { '--app': a.hue } }, appGlyph(a), h('span', null, a.name));
    }));
  requestAnimationFrame(() => { const on = nav.querySelector('.is-on'); if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; });
  return nav;
}

function showAll(suite, members, path) {
  import('../core/ui.js').then(({ modal }) => {
    const q = h('input', { class: 'input', type: 'search', placeholder: `Søg i ${suite.name}`, 'aria-label': `Søg i ${suite.name}` });
    const grid = h('div', { class: 'lx-tiles suite-grid' });
    const norm = (t) => String(t || '').toLowerCase();
    const draw = () => h(clear(grid), null, members.filter(a => !q.value.trim() || norm(a.name).includes(norm(q.value.trim())) || (a.keywords || []).some(k => norm(k).includes(norm(q.value.trim())))).map(a => h('a', { class: ['lx-tile', onApp(a, path) && 'is-on'], href: a.route, style: { '--app': a.hue }, onclick: () => m.close() }, h('span', { class: 'lx-ico' }, icon(a.icon)), h('span', { class: 'lx-name' }, a.name))));
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = grid.querySelector('a'); if (f) { location.hash = f.getAttribute('href'); m.close(); } } });
    const m = modal({ title: suite.name, label: suite.name, size: 720, body: h('div', { class: 'stack', style: { gap: '12px' } }, q, grid) });
    draw(); setTimeout(() => q.focus(), 50);
  });
}
