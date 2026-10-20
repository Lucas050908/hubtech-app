/** Command palette (Ctrl/⌘+K): search apps, pages, guides, course days, projects and commands. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store, setWorld, setPref } from '../core/store.js';
import { APPS, access, isLearnApp, visible } from '../core/registry.js';
import { GUIDES } from '../data/guides.js';
import { COURSE } from '../data/course-servicetekniker.js';
import { getProjects } from '../core/services.js';
import { api } from '../core/api.js';
import { SEASONS, SEASON_LABEL, SEASON_ICON } from '../world/palettes.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa');

function score(item, q) {
  if (!q) return item.base || 1;
  const t = norm(item.title), k = norm(item.keywords || ''), s = norm(item.sub || '');
  let sc = 0;
  for (const w of q.split(/\s+/).filter(Boolean)) {
    if (t.startsWith(w)) sc += 10;
    else if (t.includes(w)) sc += 6;
    else if (k.includes(w)) sc += 4;
    else if (s.includes(w)) sc += 2;
    else return 0;
  }
  return sc + (item.base || 0) * 0.1;
}

function staticItems() {
  const user = store.get('user');
  const items = [];
  for (const a of APPS) {
    if (!visible(a, user)) continue;
    const acc = access(a, user);
    items.push({ group: isLearnApp(a) ? 'Læring' : 'Apps', title: a.name, sub: acc.ok ? a.tagline : acc.reason, icon: a.icon, hue: a.hue, href: a.route, keywords: (a.keywords || []).join(' '), base: 5, disabled: !acc.ok });
  }
  [['Hjem', '#/', 'home'], ['Dashboard', '#/dashboard', 'dashboard'], ['Apps', '#/apps', 'apps'], ['Projekter', '#/projects', 'folder'], ['Guides & Læring', '#/learn', 'book'],
    ['Profil', '#/settings/profile', 'user'], ['Sikkerhed & adgangskode', '#/settings/security', 'lock'], ['Verden & årstider', '#/settings/world', 'mountain'], ['Integrationer', '#/settings/integrations', 'plug']]
    .forEach(([t, href, ic]) => items.push({ group: 'Gå til', title: t, icon: ic, href, base: 4 }));
  for (const g of GUIDES) items.push({ group: 'Guides', title: g.title, sub: g.summary, icon: g.icon, href: `#/learn/guide/${g.id}`, keywords: g.category, base: 2 });
  COURSE.days.forEach((d, i) => items.push({ group: 'Kursus', title: `Dag ${i + 1}: ${d.t}`, sub: d.g, icon: 'graduation', hue: 'var(--hue-course)', href: `#/learn/course/${COURSE.id}/day/${i + 1}`, keywords: d.l.join(' ') + ' ' + d.d.join(' '), base: 1 }));
  for (const s of SEASONS) items.push({ group: 'Kommandoer', title: `Skift til ${SEASON_LABEL[s].toLowerCase()}`, icon: SEASON_ICON[s], run: () => setWorld({ seasonMode: 'manual', season: s }), keywords: 'årstid season baggrund', base: 1 });
  items.push({ group: 'Kommandoer', title: 'Automatisk årstid', icon: 'calendar', run: () => setWorld({ seasonMode: 'auto' }), keywords: 'årstid auto', base: 1 });
  items.push({ group: 'Kommandoer', title: 'Skift lys/mørk tilstand', icon: 'sun', run: () => setPref('theme', document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'), keywords: 'tema theme dark light', base: 1 });
  items.push({ group: 'Kommandoer', title: 'Start introduktionen', icon: 'sparkles', run: () => import('./onboarding.js').then(m => { location.hash = '#/'; setTimeout(() => m.startOnboarding({ restart: true }), 350); }), keywords: 'onboarding tour hjælp', base: 1 });
  items.push({ group: 'Kommandoer', title: 'Log ud', icon: 'logout', run: () => import('./auth.js').then(m => m.logout()), keywords: 'logout', base: 0 });
  return items;
}

let open = null;

export function openPalette(initial = '') {
  if (open) { open.input.focus(); return; }
  const prev = document.activeElement;
  let items = staticItems();
  let projectsLoaded = false;
  const input = h('input', { class: 'palette-input', type: 'search', placeholder: 'Søg apps, Office-filer, guides, projekter eller kommandoer…', 'aria-label': 'Søg', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', value: initial });
  const list = h('div', { class: 'palette-list', id: 'pal-list', role: 'listbox', 'aria-label': 'Resultater' });
  const foot = h('div', { class: 'palette-foot' }, h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), ' naviger'), h('span', null, h('kbd', null, 'Enter'), ' åbn'), h('span', null, h('kbd', null, 'Esc'), ' luk'));
  const box = h('div', { class: 'palette glass glass-strong', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Søg i HUBTECH' },
    h('div', { class: 'palette-search' }, icon('search'), input), list, foot);
  const back = h('div', { class: 'modal-backdrop palette-backdrop', onmousedown: (e) => { if (e.target === back) close(); } }, box);
  let results = [], sel = 0;

  if (store.get('user')?.role === 'owner') {
    getProjects().then(d => {
      projectsLoaded = true;
      items = items.concat(d.projects.filter(p => !p.meta?.hidden).map(p => ({ group: 'Projekter', title: p.name, sub: p.description || p.path || p.uri, icon: p.isGit ? 'branch' : 'folder', hue: 'var(--hue-cursor)', href: `#/projects/${p.id}`, keywords: (p.meta?.tags || []).join(' ') + ' ' + (p.meta?.collection || ''), base: 3 })));
      render();
    }).catch(() => {});
  }

  // full-text search in HUBTECH Office files (titles + content), asked from the server while typing
  const OFFICE = { doc: ['Dokument', 'file', 'doc'], sheet: ['Regneark', 'grid', 'sheet'], slides: ['Præsentation', 'present', 'slides'] };
  let officeItems = [], officeQ = '', officeTimer = 0;
  function searchOffice() {
    const raw = input.value.trim();
    clearTimeout(officeTimer);
    if (raw.length < 2) { if (officeItems.length) { items = items.filter(x => !officeItems.includes(x)); officeItems = []; } return; }
    officeTimer = setTimeout(async () => {
      if (raw === officeQ) return;
      officeQ = raw;
      try {
        const r = await api.get(`/api/office/search?q=${encodeURIComponent(raw)}`);
        if (input.value.trim() !== raw) return;
        items = items.filter(x => !officeItems.includes(x));
        officeItems = r.results.map(d => ({ group: 'Office-filer', title: d.title, sub: d.snippet || OFFICE[d.kind][0], icon: OFFICE[d.kind][1], hue: 'var(--hue-hubtech)',
          href: `#/apps/hubtech/${OFFICE[d.kind][2]}/${d.id}`, keywords: `${raw} ${OFFICE[d.kind][0]}`, base: d.inTitle ? 4 : 2 }));
        items = items.concat(officeItems);
        render();
      } catch { /* search is a bonus */ }
    }, 220);
  }

  function render() {
    searchOffice();
    const q = norm(input.value.trim());
    results = items.map(it => ({ it, s: score(it, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, q ? 40 : 18).map(x => x.it);
    sel = Math.min(sel, Math.max(0, results.length - 1));
    clear(list);
    if (!results.length) {
      list.appendChild(h('div', { class: 'palette-empty' },
        h('div', { class: 'state-art', style: { width: '60px', height: '60px', margin: '0 auto 10px' } }, icon('search')),
        h('b', null, `Ingen resultater for “${input.value.trim()}”`),
        h('p', { class: 'faint' }, projectsLoaded || store.get('user')?.role !== 'owner' ? 'Prøv et andet ord – fx “quiz”, “git” eller “vinter”.' : 'Projekter indlæses stadig…')));
      return;
    }
    let lastGroup = null;
    results.forEach((it, i) => {
      if (it.group !== lastGroup) { list.appendChild(h('div', { class: 'palette-group', role: 'presentation' }, it.group)); lastGroup = it.group; }
      const row = h('div', { class: ['palette-item', i === sel && 'is-sel', it.disabled && 'is-disabled'], role: 'option', id: `pal-${i}`, 'aria-selected': String(i === sel), 'aria-disabled': it.disabled ? 'true' : null, style: it.hue ? { '--app': it.hue } : null },
        h('span', { class: 'row-icon' }, icon(it.icon)),
        h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, it.title), it.sub ? h('div', { class: 'row-sub' }, it.sub) : null),
        it.run ? h('span', { class: 'chip' }, 'Kør') : icon('arrowRight'));
      row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; highlight(); } });
      row.addEventListener('click', () => choose(it));
      list.appendChild(row);
    });
    input.setAttribute('aria-activedescendant', `pal-${sel}`);
  }
  function highlight() {
    list.querySelectorAll('.palette-item').forEach((el, i) => { el.classList.toggle('is-sel', i === sel); el.setAttribute('aria-selected', String(i === sel)); });
    list.querySelector('.is-sel')?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `pal-${sel}`);
  }
  function choose(it) {
    if (!it || it.disabled) return;
    close();
    if (it.run) it.run(); else location.hash = it.href;
  }
  function close() {
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    open = null;
    prev?.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[sel]); }
  }
  input.addEventListener('input', () => { sel = 0; render(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  open = { input, close };
  render();
  requestAnimationFrame(() => input.focus());
}
