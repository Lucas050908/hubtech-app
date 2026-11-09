/** Cursor Projekter — real project portal backed by the local server integration. */
import { h, clear, timeAgo, fmtBytes, debounce } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { store, logActivity } from '../core/store.js';
import { getProjects, patchProjectCache, invalidateIntegrations } from '../core/services.js';
import { stateBlock, toast, modal, busy, skeletonRows, segmented, errorToast } from '../core/ui.js';
import { STATUS_LABEL, STATUS_CHIP, projectHue } from '../features/widgets.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { appById } from '../core/registry.js';
import { navigate } from '../core/router.js';

const SOURCE_LABEL = { 'cursor-recent': 'Cursor-historik', 'cursor-workspace': 'Cursor-arbejdsområde', 'project-root': 'Projektmappe' };
const LS_VIEW = 'hubtech.projects.view';
const DEMO = [
  { id: 'demo000000000001', name: 'webapp-platform', description: 'Next.js-projekt med API-integration', path: '~/Projects/webapp-platform', exists: true, isGit: true, sources: ['cursor-recent'], lastOpened: Date.now() / 1000 - 3600, meta: { status: 'active', favorite: true, tags: ['nextjs'] } },
  { id: 'demo000000000002', name: 'elektroniklab', description: 'Kredsløb og hardware-dokumentation', path: '~/Projects/elektroniklab', exists: true, isGit: true, sources: ['cursor-recent'], lastOpened: Date.now() / 1000 - 86400, meta: { status: 'active', tags: ['arduino'] } },
  { id: 'demo000000000003', name: 'ai-assistant', description: 'Python-projekt med LLM-integration', path: '~/Projects/ai-assistant', exists: true, isGit: false, sources: ['project-root'], lastOpened: Date.now() / 1000 - 3 * 86400, meta: { status: 'paused' } },
  { id: 'demo000000000004', name: 'designsystem', description: 'UI-komponenter og styles', path: '~/Projects/designsystem', exists: true, isGit: true, sources: ['cursor-workspace'], lastOpened: Date.now() / 1000 - 5 * 86400, meta: { status: 'active' } },
].map(p => ({ ...p, demo: true }));

async function openProject(p, target = 'cursor') {
  if (p.demo) { toast('Dette er demodata', { type: 'warn', text: 'Demoprojekter kan ikke åbnes. Forbind Cursor for at se dine egne.' }); return; }
  try {
    const r = await api.post(`/api/projects/${p.id}/open`, { target });
    if (r.ok) {
      toast(r.message, { type: 'ok', icon: target === 'folder' ? 'folder' : 'cube', text: p.name, ms: 2500 });
      patchProjectCache(p.id, { ...(p.meta || {}), lastOpenedHere: Math.floor(Date.now() / 1000) });
    } else if (r.deeplink) {
      toast('Åbner via Cursor-link', { type: 'warn', text: r.message + ' Din browser spørger måske, om Cursor må åbnes.', ms: 6000 });
      logActivity('cursor', 'project', p.name, 'Projekt åbnet via link', p.id);
      window.location.href = r.deeplink;
    } else {
      toast('Kunne ikke åbne projektet', { type: 'bad', text: r.message });
    }
  } catch (e) { errorToast(e, 'Kunne ikke åbne projektet'); }
}

async function saveMeta(p, patch) {
  if (p.demo) { p.meta = { ...(p.meta || {}), ...patch }; return p.meta; }
  const { meta } = await api.patch(`/api/projects/${p.id}/meta`, patch);
  p.meta = meta;
  patchProjectCache(p.id, meta);
  return meta;
}

function editRootsDialog(status, onDone) {
  const ta = h('textarea', { class: 'textarea mono', rows: 5, placeholder: '~/Projects\n~/code\nC:\\Users\\dig\\source\\repos', 'aria-label': 'Projektmapper, én pr. linje' });
  ta.value = (status?.roots || []).map(r => r.path).join('\n');
  const save = h('button', { class: 'btn btn-primary' }, 'Gem og søg');
  let m;
  save.addEventListener('click', busy(save, async () => {
    try {
      const roots = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      const r = await api.put('/api/integrations/cursor', { roots });
      invalidateIntegrations();
      m.close();
      const missing = r.status.roots.filter(x => !x.exists);
      toast('Projektmapper gemt', { type: missing.length ? 'warn' : 'ok', text: missing.length ? `Findes ikke: ${missing.map(x => x.path).join(', ')}` : `${roots.length} mappe(r) bliver scannet.` });
      onDone?.();
    } catch (e) { errorToast(e, 'Kunne ikke gemme'); }
  }));
  m = modal({
    title: 'Projektmapper', label: 'Cursor-integration',
    body: h('div', null,
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'HUBTECH scanner disse mapper (to niveauer ned) efter git-repos og projekter – ud over Cursors egen historik. Én mappe pr. linje. Kun mapper på den maskine, hvor serveren kører.'),
      ta,
      h('p', { class: 'field-hint', style: { marginTop: '8px' } }, 'Tip: ~ betyder din hjemmemappe. Mapper kan også sættes med HUBTECH_PROJECT_ROOTS i .env.')),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), save],
  });
  requestAnimationFrame(() => ta.focus());
}

function statusBar(data, reload) {
  const s = data.status;
  const n = data.projects.length;
  const ok = s.cursorInstalled;
  const refresh = h('button', { class: 'btn btn-sm', 'aria-label': 'Scan igen' }, icon('refresh'), 'Scan igen');
  refresh.addEventListener('click', busy(refresh, async () => { await reload(true); toast('Projekter opdateret', { type: 'ok', ms: 1800 }); }));
  return h('section', { class: 'glass panel project-status', dataset: { tour: 'project-status' } },
    h('div', { class: 'ps-items' },
      h('div', { class: 'ps-item' }, h('span', { class: ['status-dot', ok ? 'ok pulse' : 'warn'] }),
        h('div', null, h('b', null, ok ? 'Cursor forbundet' : 'Cursor ikke fundet'), h('div', { class: 'faint ps-sub mono' }, ok ? s.userDir : `Søgte i ${s.searched.join(', ')}`))),
      h('div', { class: 'ps-item' }, h('span', { class: ['status-dot', s.cli ? 'ok' : 'warn'] }),
        h('div', null, h('b', null, s.cli ? '“Åbn i Cursor” klar' : 'cursor-kommando mangler'), h('div', { class: 'faint ps-sub' }, s.cli ? 'Projekter åbnes direkte i Cursor' : 'Bruger cursor://-link i stedet'))),
      h('div', { class: 'ps-item' }, h('span', { class: ['status-dot', s.roots.length ? (s.roots.every(r => r.exists) ? 'ok' : 'warn') : ''] }),
        h('div', null, h('b', null, s.roots.length ? `${s.roots.length} projektmappe${s.roots.length === 1 ? '' : 'r'}` : 'Ingen projektmapper'), h('div', { class: 'faint ps-sub' }, s.roots.length ? s.roots.map(r => r.path + (r.exists ? '' : ' (findes ikke)')).join(' · ') : 'Valgfrit – tilføj fx ~/Projects'))),
      h('div', { class: 'ps-item' }, icon('layers'), h('div', null, h('b', null, `${n} projekt${n === 1 ? '' : 'er'}`), h('div', { class: 'faint ps-sub' }, `Scannet ${timeAgo(data.scannedAt)}`)))),
    h('div', { class: 'ps-actions' }, refresh,
      h('button', { class: 'btn btn-sm', onclick: () => editRootsDialog(s, () => reload(true)) }, icon('folder'), 'Projektmapper'),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/learn/guide/cursor-setup' }, icon('help'), 'Opsætning')));
}

function setupState(data, reload, enableDemo) {
  const s = data.status;
  return stateBlock({
    app: 'var(--hue-cursor)', icon: s.cursorInstalled ? 'folder' : 'plugOff', kind: s.cursorInstalled ? '' : 'pending',
    title: s.cursorInstalled ? 'Cursor er forbundet, men har ingen projekter endnu' : 'Forbind dine Cursor-projekter',
    text: s.cursorInstalled
      ? 'Åbn et projekt i Cursor, så dukker det op her – eller tilføj de mapper, hvor dine projekter ligger.'
      : `HUBTECH-serveren fandt ingen Cursor-installation på denne maskine (søgte i ${s.searched.join(' og ')}). Kører HUBTECH på samme computer som Cursor? Ellers kan du tilføje dine projektmapper direkte.`,
    actions: [
      h('button', { class: 'btn btn-primary', onclick: () => editRootsDialog(s, () => reload(true)) }, icon('folder'), 'Tilføj projektmappe'),
      h('a', { class: 'btn', href: '#/learn/guide/cursor-setup' }, icon('book'), 'Se opsætningsguiden'),
      h('button', { class: 'btn btn-ghost', onclick: enableDemo }, icon('eye'), 'Vis demo'),
    ],
  });
}

function projectCard(p, onChange) {
  const st = p.meta?.status;
  const star = h('button', { class: 'icon-btn btn-sm', 'aria-pressed': String(!!p.meta?.favorite), 'aria-label': p.meta?.favorite ? 'Fjern favorit' : 'Markér som favorit', html: svg(p.meta?.favorite ? 'starFill' : 'star'), style: { color: p.meta?.favorite ? 'var(--warn)' : null } });
  star.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    try { await saveMeta(p, { favorite: !p.meta?.favorite }); onChange(); } catch (err) { errorToast(err, 'Kunne ikke gemme'); }
  });
  const open = h('button', { class: 'app-card-cta pc-open', disabled: !p.exists && !p.remote }, icon('cube'), 'Åbn i Cursor');
  open.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openProject(p); });
  const when = p.meta?.lastOpenedHere || p.lastOpened || p.modified;
  return h('a', { class: ['project-card', !p.exists && !p.remote && 'is-missing'], href: p.demo ? null : `#/projects/${p.id}`, 'aria-label': p.name, style: { '--app': projectHue(p) } },
    h('div', { class: 'pc-top' },
      h('span', { class: 'row-icon tile' }, icon(p.remote ? 'globe' : p.isGit ? 'branch' : 'folder')),
      h('div', { class: 'pc-title' }, h('h3', null, p.name), h('div', { class: 'faint mono pc-path' }, p.path || p.uri)),
      star),
    h('p', { class: 'pc-desc muted' }, p.description || (p.exists ? 'Ingen beskrivelse (tilføj en README).' : p.remote ? 'Fjernprojekt (SSH/WSL/container).' : 'Mappen findes ikke længere på disken.')),
    h('div', { class: 'pc-chips' },
      p.demo ? h('span', { class: 'chip chip-demo' }, 'DEMO') : null,
      st ? h('span', { class: ['chip', STATUS_CHIP[st]] }, STATUS_LABEL[st]) : null,
      !p.exists && !p.remote ? h('span', { class: 'chip chip-bad' }, 'Mangler') : null,
      p.remote ? h('span', { class: 'chip chip-info' }, 'Fjern') : null,
      p.meta?.collection ? h('span', { class: 'chip' }, icon('layers'), p.meta.collection) : null,
      (p.meta?.tags || []).slice(0, 3).map(t => h('span', { class: 'chip' }, '#' + t)),
      (p.sources || []).slice(0, 1).map(s => h('span', { class: 'chip' }, SOURCE_LABEL[s] || s))),
    h('div', { class: 'pc-foot' }, h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, when ? `Sidst åbnet ${timeAgo(when)}` : ''), open));
}

// ── list view ───────────────────────────────────────────────────────────
function renderList(container, onData) {
  let data = null, demo = false;
  const f = { q: '', filter: 'all', status: '', collection: '', sort: 'recent', view: (() => { try { return localStorage.getItem(LS_VIEW) || 'grid'; } catch { return 'grid'; } })() };
  const statusSlot = h('div');
  const toolbar = h('div', { class: 'project-toolbar' });
  const listEl = h('div', { class: 'project-list' }, skeletonRows(4));
  const demoBanner = h('div', { class: 'callout warn', hidden: true, style: { marginBottom: '16px' } }, icon('alert'),
    h('div', null, h('strong', null, 'Demodata. '), 'Projekterne nedenfor er eksempler, ikke dine egne. De gemmes ikke. ', h('button', { class: 'btn btn-sm', style: { marginLeft: '8px' }, onclick: () => { demo = false; draw(); } }, 'Skjul demo')));

  async function load(force = false) {
    try {
      data = await getProjects({ force });
      if (data.restricted) {
        clear(container).appendChild(stateBlock({ icon: 'lock', title: 'Kun for platformens ejer', text: 'Cursor-projekter ligger på ejerens computer, så kun ejeren kan se dem.' }));
        return;
      }
      statusSlot.replaceChildren(statusBar(data, load));
      onData?.(data);
      draw();
    } catch (e) {
      statusSlot.replaceChildren();
      clear(listEl).appendChild(stateBlock({ kind: 'error', icon: 'alert', title: 'Projekterne kunne ikke hentes', text: e.message, actions: [h('button', { class: 'btn btn-primary', onclick: () => load(true) }, icon('refresh'), 'Prøv igen')] }));
    }
  }

  function drawToolbar(all) {
    const collections = [...new Set(all.map(p => p.meta?.collection).filter(Boolean))].sort();
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i navn, sti, beskrivelse eller tags…', value: f.q, 'aria-label': 'Søg i projekter' });
    search.addEventListener('input', debounce(() => { f.q = search.value; drawItems(); }, 120));
    const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Filtre' },
      [['all', 'Alle'], ['fav', 'Favoritter'], ['active', 'Aktive'], ['git', 'Git'], ['missing', 'Mangler'], ['archived', 'Arkiveret']].map(([v, l]) => {
        const b = h('button', { class: 'chip', 'aria-pressed': String(f.filter === v) }, l);
        b.addEventListener('click', () => { f.filter = v; chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); drawItems(); });
        return b;
      }));
    const coll = h('select', { class: 'select', 'aria-label': 'Samling', style: { width: 'auto', minHeight: '40px' } },
      h('option', { value: '' }, 'Alle samlinger'), collections.map(c => h('option', { value: c, selected: f.collection === c }, c)));
    coll.addEventListener('change', () => { f.collection = coll.value; drawItems(); });
    const sort = h('select', { class: 'select', 'aria-label': 'Sortering', style: { width: 'auto', minHeight: '40px' } },
      [['recent', 'Senest åbnet'], ['name', 'Navn'], ['modified', 'Senest ændret']].map(([v, l]) => h('option', { value: v, selected: f.sort === v }, l)));
    sort.addEventListener('change', () => { f.sort = sort.value; drawItems(); });
    const view = segmented([{ value: 'grid', label: '', icon: 'grid' }, { value: 'list', label: '', icon: 'list' }], f.view, (v) => { f.view = v; try { localStorage.setItem(LS_VIEW, v); } catch { /* */ } drawItems(); }, { label: 'Visning' });
    view.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-label', i ? 'Listevisning' : 'Gittervisning'));
    clear(toolbar).append(h('div', { class: 'pt-search' }, icon('search'), search), chips, h('div', { class: 'pt-right' }, collections.length ? coll : null, sort, view));
  }

  function filtered(all) {
    const q = f.q.trim().toLowerCase();
    let ps = all.filter(p => !p.meta?.hidden);
    if (f.filter !== 'archived') ps = ps.filter(p => p.meta?.status !== 'archived');
    if (f.filter === 'fav') ps = ps.filter(p => p.meta?.favorite);
    if (f.filter === 'active') ps = ps.filter(p => p.meta?.status === 'active');
    if (f.filter === 'git') ps = ps.filter(p => p.isGit);
    if (f.filter === 'missing') ps = ps.filter(p => !p.exists && !p.remote);
    if (f.filter === 'archived') ps = ps.filter(p => p.meta?.status === 'archived');
    if (f.collection) ps = ps.filter(p => p.meta?.collection === f.collection);
    if (q) ps = ps.filter(p => [p.name, p.path, p.uri, p.description, ...(p.meta?.tags || []), p.meta?.collection, p.meta?.note].filter(Boolean).join(' ').toLowerCase().includes(q));
    const t = (p) => p.meta?.lastOpenedHere || p.lastOpened || 0;
    if (f.sort === 'name') ps.sort((a, b) => a.name.localeCompare(b.name, 'da'));
    else if (f.sort === 'modified') ps.sort((a, b) => (b.modified || 0) - (a.modified || 0));
    else ps.sort((a, b) => (b.meta?.favorite ? 1 : 0) - (a.meta?.favorite ? 1 : 0) || t(b) - t(a) || (a.recentRank ?? 999) - (b.recentRank ?? 999));
    return ps;
  }

  function drawItems() {
    const all = demo ? DEMO : data.projects;
    const ps = filtered(all);
    clear(listEl);
    listEl.className = `project-list is-${f.view}`;
    if (!ps.length) {
      listEl.appendChild(stateBlock({ icon: 'search', title: 'Ingen projekter matcher', text: f.q ? `Intet matcher “${f.q}” med de valgte filtre.` : 'Ingen projekter i dette filter.', actions: [h('button', { class: 'btn', onclick: () => { f.q = ''; f.filter = 'all'; f.collection = ''; draw(); } }, 'Nulstil filtre')] }));
      return;
    }
    ps.forEach(p => listEl.appendChild(projectCard(p, drawItems)));
  }

  function draw() {
    const all = demo ? DEMO : data.projects;
    demoBanner.hidden = !demo;
    if (!all.length) {
      clear(toolbar);
      clear(listEl).appendChild(setupState(data, load, () => { demo = true; draw(); }));
      return;
    }
    drawToolbar(all);
    drawItems();
  }

  container.append(statusSlot, demoBanner, toolbar, listEl);
  load();
}

// ── detail view ─────────────────────────────────────────────────────────
async function renderDetail(container, id) {
  container.appendChild(skeletonRows(5));
  let p;
  try { p = (await api.get(`/api/projects/${id}`)).project; }
  catch (e) {
    clear(container).appendChild(stateBlock({ kind: e.status === 404 ? '' : 'error', icon: e.status === 404 ? 'search' : 'alert', title: e.status === 404 ? 'Projektet blev ikke fundet' : 'Kunne ikke hente projektet', text: e.status === 404 ? 'Det er måske fjernet fra Cursors historik eller fra dine projektmapper.' : e.message, actions: [h('a', { class: 'btn btn-primary', href: '#/projects' }, icon('arrowLeft'), 'Alle projekter')] }));
    return;
  }
  clear(container);
  logActivity('cursor', 'project-view', p.name, 'Projektdetaljer set', p.id);
  const g = p.git;
  const star = h('button', { class: 'btn app-hero-ghost', 'aria-pressed': String(!!p.meta?.favorite), html: svg(p.meta?.favorite ? 'starFill' : 'star') + `<span>${p.meta?.favorite ? 'Favorit' : 'Gør til favorit'}</span>` });
  star.addEventListener('click', async () => {
    try { await saveMeta(p, { favorite: !p.meta?.favorite }); star.innerHTML = svg(p.meta?.favorite ? 'starFill' : 'star') + `<span>${p.meta?.favorite ? 'Favorit' : 'Gør til favorit'}</span>`; star.setAttribute('aria-pressed', String(!!p.meta?.favorite)); }
    catch (e) { errorToast(e, 'Kunne ikke gemme'); }
  });
  const copy = h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Kopiér sti', html: svg('copy') });
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(p.path || p.uri); toast('Sti kopieret', { type: 'ok', ms: 1500 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } });

  // organisation panel
  const statusSeg = segmented([{ value: '', label: 'Ingen' }, ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))], p.meta?.status || '', async (v) => {
    try { await saveMeta(p, { status: v || null }); toast('Status gemt', { type: 'ok', ms: 1400 }); } catch (e) { errorToast(e, 'Kunne ikke gemme'); }
  }, { label: 'Status' });
  const collInput = h('input', { class: 'input', value: p.meta?.collection || '', placeholder: 'Fx Kunder, Skole, Hobby', maxlength: 40, 'aria-label': 'Samling' });
  collInput.addEventListener('change', async () => { try { await saveMeta(p, { collection: collInput.value.trim() || null }); toast('Samling gemt', { type: 'ok', ms: 1400 }); } catch (e) { errorToast(e, 'Kunne ikke gemme'); } });
  const tagsWrap = h('div', { class: 'tags-edit' });
  const drawTags = () => {
    clear(tagsWrap);
    for (const t of p.meta?.tags || []) {
      tagsWrap.appendChild(h('span', { class: 'chip' }, '#' + t, h('button', { class: 'tag-x', 'aria-label': `Fjern tag ${t}`, html: svg('x'), onclick: async () => { await saveMeta(p, { tags: (p.meta.tags || []).filter(x => x !== t) }); drawTags(); } })));
    }
    const inp = h('input', { class: 'input tag-input', placeholder: '+ tag', maxlength: 24, 'aria-label': 'Tilføj tag' });
    inp.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && inp.value.trim()) {
        e.preventDefault();
        const t = inp.value.trim().replace(/^#/, '');
        const tags = [...new Set([...(p.meta?.tags || []), t])].slice(0, 12);
        try { await saveMeta(p, { tags }); drawTags(); tagsWrap.querySelector('.tag-input')?.focus(); } catch (err) { errorToast(err, 'Kunne ikke gemme'); }
      }
    });
    tagsWrap.appendChild(inp);
  };
  drawTags();
  const note = h('textarea', { class: 'textarea', placeholder: 'Hvor slap du? Hvad er næste skridt?', maxlength: 2000, 'aria-label': 'Note' });
  note.value = p.meta?.note || '';
  const noteState = h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, '');
  note.addEventListener('input', debounce(async () => {
    noteState.textContent = 'Gemmer…';
    try { await saveMeta(p, { note: note.value }); noteState.textContent = 'Gemt ✓'; } catch { noteState.textContent = 'Ikke gemt'; }
  }, 700));

  const langs = p.languages || [];
  container.append(
    appHero({ ...appById('cursor'), hue: projectHue(p), icon: p.remote ? 'globe' : p.isGit ? 'branch' : 'folder' }, {
      back: { href: '#/projects', label: 'Tilbage til projekter' },
      eyebrow: 'Cursor-projekt', title: p.name,
      lead: h('span', null, p.description ? [p.description, h('br')] : null, h('span', { class: 'mono', style: { fontSize: 'var(--fs-xs)', opacity: .8 } }, p.path || p.uri), ' ', copy),
      actions: [
        star,
        p.exists ? heroGhost('Vis mappe', 'folder', { onclick: () => openProject(p, 'folder') }) : null,
        heroBtn('Åbn i Cursor', 'cube', { disabled: !p.exists && !p.remote, onclick: () => openProject(p) })].filter(Boolean),
      stats: [
        { icon: 'branch', label: 'Branch', value: g?.available ? g.branch : p.isGit ? '—' : 'Ikke git' },
        { icon: 'edit', label: 'Ikke-committede filer', value: g?.available ? String(g.dirty || 0) : '—' },
        { icon: 'code', label: 'Hovedsprog', value: (p.languages || [])[0]?.name || '—' },
        { icon: 'clock', label: 'Sidst i Cursor', value: p.lastOpened ? timeAgo(p.lastOpened) : '—' }],
    }),
    ...(!p.exists && !p.remote ? [h('div', { class: 'callout bad', style: { marginBottom: '16px' } }, icon('alert'), h('div', null, h('strong', null, 'Mappen findes ikke. '), 'Den er flyttet eller slettet, men står stadig i Cursors historik.'))] : []),
    h('div', { class: 'grid-2 project-detail' },
      h('div', { class: 'stack' },
        h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('branch'), 'Git')),
          g?.available ? h('dl', { class: 'kv' },
            h('dt', null, 'Branch'), h('dd', null, h('span', { class: 'chip chip-info' }, g.branch)),
            h('dt', null, 'Ændringer'), h('dd', null, g.dirty ? h('span', { class: 'chip chip-warn' }, `${g.dirty} ikke-committede filer`) : h('span', { class: 'chip chip-ok' }, 'Rent arbejdstræ')),
            g.lastCommit ? [h('dt', null, 'Seneste commit'), h('dd', null, h('div', null, g.lastCommit.subject), h('div', { class: 'faint mono', style: { fontSize: 'var(--fs-xs)' } }, `${g.lastCommit.hash} · ${g.lastCommit.author} · ${timeAgo(g.lastCommit.time)}`))] : null,
            g.remote ? [h('dt', null, 'Remote'), h('dd', { class: 'mono', style: { fontSize: 'var(--fs-sm)' } }, g.remote)] : null)
            : h('p', { class: 'faint' }, p.isGit ? 'Git er ikke tilgængelig på serveren.' : 'Ikke et git-repository.')),
        h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('code'), 'Sprog')),
          langs.length ? h('div', { class: 'lang-bars' }, langs.map(l => h('div', { class: 'lang' }, h('div', { class: 'lang-top' }, h('span', null, l.name), h('span', { class: 'mono faint' }, `${Math.round(l.share * 100)} %`)), h('div', { class: 'progress' }, h('i', { style: { '--v': `${l.share * 100}%` } })))))
            : h('p', { class: 'faint' }, 'Ingen kodefiler fundet.')),
        h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('file'), 'Filer'), h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Kun navne – indhold læses ikke')),
          (p.files || []).length ? h('ul', { class: 'file-list' }, p.files.filter(x => !x.hidden || ['.cursorrules', '.cursor', '.env.example'].includes(x.name)).slice(0, 60).map(x => h('li', null, h('span', { html: svg(x.dir ? 'folder' : 'file') }), h('span', { class: 'fl-name' }, x.name), h('span', { class: 'faint mono' }, x.dir ? '' : fmtBytes(x.size)))))
            : h('p', { class: 'faint' }, 'Ingen filer at vise.'))),
      h('div', { class: 'stack' },
        h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('tag'), 'Organisering')),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Status'), statusSeg),
          h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Samling'), collInput),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tags'), tagsWrap),
          h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'field-label' }, 'Note', noteState), note)),
        h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('info'), 'Metadata')),
          h('dl', { class: 'kv' },
            h('dt', null, 'Fundet via'), h('dd', null, (p.sources || []).map(s => SOURCE_LABEL[s] || s).join(', ')),
            h('dt', null, 'Type'), h('dd', null, p.kind === 'workspace' ? 'Arbejdsområde (.code-workspace)' : p.remote ? 'Fjernmappe' : 'Mappe'),
            p.lastOpened ? [h('dt', null, 'Sidst i Cursor'), h('dd', null, timeAgo(p.lastOpened))] : null,
            p.meta?.lastOpenedHere ? [h('dt', null, 'Sidst åbnet herfra'), h('dd', null, timeAgo(p.meta.lastOpenedHere))] : null,
            p.modified ? [h('dt', null, 'Mappe ændret'), h('dd', null, timeAgo(p.modified))] : null,
            h('dt', null, 'Cursor-regler'), h('dd', null, p.hasCursorRules ? h('span', { class: 'chip chip-ok' }, '.cursorrules / .cursor/rules') : h('span', { class: 'faint' }, 'Ingen'))),
          h('button', { class: 'btn btn-sm btn-ghost', style: { marginTop: '14px' }, onclick: async () => { await saveMeta(p, { hidden: true }); toast('Projektet er skjult', { text: 'Det vises ikke længere i oversigten.', action: { label: 'Fortryd', onClick: async () => { await saveMeta(p, { hidden: false }); } } }); navigate('/projects'); } }, icon('eyeOff'), 'Skjul fra oversigten')))));
}

export default {
  title: 'Projekter',
  render(ctx) {
    const root = h('div', { class: 'page' });
    if (ctx.params.id) { renderDetail(root, ctx.params.id); return root; }
    const openLast = heroBtn('Åbn seneste i Cursor', 'cube', { disabled: true, title: 'Åbner dit senest brugte projekt' });
    const v = { n: h('span', null, '—'), git: h('span', null, '—'), fav: h('span', null, '—'), cursor: h('span', null, h('span', { class: 'status-dot' }), '—') };
    root.appendChild(appHero(appById('cursor'), {
      eyebrow: 'Cursor Projekter', title: 'Projekter',
      lead: 'Dine rigtige projekter fra Cursor og dine projektmapper – søg, organisér og åbn dem ét sted.',
      actions: [openLast],
      stats: [
        { icon: 'layers', label: 'Projekter', value: v.n },
        { icon: 'branch', label: 'Git-repositories', value: v.git },
        { icon: 'star', label: 'Favoritter', value: v.fav },
        { icon: 'cube', label: 'Cursor', value: v.cursor }],
    }));
    renderList(root, (data) => {
      const ps = data.projects.filter(p => !p.meta?.hidden);
      v.n.textContent = String(ps.length);
      const last = ps.filter(p => p.exists || p.remote).sort((a, b) => (b.meta?.lastOpenedHere || b.lastOpened || 0) - (a.meta?.lastOpenedHere || a.lastOpened || 0))[0];
      openLast.disabled = !last;
      if (last) { openLast.title = `Åbn ${last.name}`; openLast.onclick = () => openProject(last); }
      v.git.textContent = String(ps.filter(p => p.isGit).length);
      v.fav.textContent = String(ps.filter(p => p.meta?.favorite).length);
      const ok = data.status?.cursorInstalled;
      v.cursor.replaceChildren(h('span', { class: ['status-dot', ok ? 'ok pulse' : 'warn'] }), ok ? 'Forbundet' : 'Ikke fundet');
    });
    return root;
  },
};
