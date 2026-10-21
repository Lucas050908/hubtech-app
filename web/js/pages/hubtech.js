/**
 * HUBTECH Office — documents, spreadsheets and presentations, saved per user on the server.
 * Routes:  #/apps/hubtech                 Office home (start new, templates, your files, classic HUBTECH)
 *          #/apps/hubtech/doc/<id>        Dokument      (office/doc.js)
 *          #/apps/hubtech/sheet/<id>      Regneark      (office/sheet.js)
 *          #/apps/hubtech/slides/<id>     Præsentation  (office/slides.js)
 *          #/apps/hubtech/<module>.html   the original HUBTECH pages (Pingochat, GameHub …)
 */
import { h, clear, debounce, timeAgo } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { store, logActivity } from '../core/store.js';
import { getIntegrations, invalidateIntegrations } from '../core/services.js';
import { toast, busy, errorToast, stateBlock, skeletonRows, modal, confirmDialog } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { siteFrame } from '../features/siteframe.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { appById } from '../core/registry.js';
import { KINDS, listDocs, getDoc, createDoc, updateDoc, deleteDoc, duplicateDoc, docHref, loadMammoth, readFile } from '../office/store.js';
import { TEMPLATES } from '../office/templates.js';
import { popMenu } from '../office/frame.js';
import { sanitizeHtml, textOf } from '../office/sanitize.js';

// From the original HUBTECH index.html
const TEAM = [
  ['Lucas Valentin', 'AI / HTML / CSS'], ['Magnus Froberg', 'AI / HTML / CSS'], ['Mathias Ejstrup', 'Design / Grafik'],
  ['Ronja Helander', 'Design / Grafik'], ['Sebastian Elgaard', 'AI / Design'],
];
// The original HUBTECH modules (web/sites/hubtech). img = the tile image used on the original front page.
export const MODULES = [
  { file: 'm.html', name: 'Pingochat', icon: 'chat', img: 'Pingochat.png', text: 'Beskeder og grupper med filer.' },
  { file: 'gamehob.html', name: 'GameHub', icon: 'gamepad', img: 'Untitled_4.webp', text: 'Snake, Sokoban, Vodka-spillet og julehistorien.' },
  { file: 'chatbot.html', name: 'Chatbot', icon: 'sparkles', img: 'image copy.png', text: 'HUBTECH-chatbotten.' },
  { file: 'd.html', name: 'Filer', icon: 'download', img: 'Unavngivet_8.png', text: 'Upload og del filer.' },
  { file: 'kalender.html', name: 'Kalender', icon: 'calendar', img: 'Unavngivet_9.png', text: 'Planlæg begivenheder.' },
  { file: 'doc.html', name: 'Klassiske dokumenter', icon: 'note', img: 'Unavngivet_6.png', text: 'Den gamle dokument-side.' },
  { file: 'index.html', name: 'Original forside', icon: 'hubtech', img: 'Logo.png', text: 'Den oprindelige HUBTECH-forside.' },
];
const MC_IP = 'b-cabin.gl.joinmc.link';
const IMPORT_ACCEPT = '.docx,.txt,.md,.markdown,.html,.htm,.csv,.tsv,.xlsx,.xls,.ods';

let activeEditor = null;
let gen = 0;   // bumped on destroy, so a slow load never mounts after you have left

async function siteBase() {
  try {
    const d = await getIntegrations();
    return d.hubtechSite?.url || (d.hubtechSite?.bundled ? 'sites/hubtech' : '');
  } catch { return 'sites/hubtech'; }
}

function modulePage(file) {
  const m = MODULES.find(x => x.file === file);
  const wrap = h('div');
  siteBase().then((base) => {
    logActivity('hubtech', 'module', m ? m.name : file, 'Klassisk HUBTECH-side åbnet', file);
    wrap.replaceWith(siteFrame({
      app: 'hubtech', title: m ? m.name : file, subtitle: 'Klassisk HUBTECH', src: `${base}/${file}`, iconName: m?.icon || 'hubtech',
      back: { href: '#/apps/hubtech', label: 'Tilbage til HUBTECH Office' },
    }));
  });
  return wrap;
}

// ── editors ──────────────────────────────────────────────────────────────
function editorPage(kind, id) {
  const wrap = h('div', { class: 'page' }, h('div', { class: 'ofx-loading' }, h('span', { class: 'spinner' }), 'Åbner…'));
  const my = gen;
  (async () => {
    try {
      const doc = await getDoc(id);
      if (my !== gen) return;
      if (KINDS[doc.kind].route !== kind) { navigate(docHref(doc).slice(1), { replace: true }); return; }
      const mod = doc.kind === 'doc' ? await import('../office/doc.js') : doc.kind === 'sheet' ? await import('../office/sheet.js') : await import('../office/slides.js');
      const make = doc.kind === 'doc' ? mod.docEditor : doc.kind === 'sheet' ? mod.sheetEditor : mod.slidesEditor;
      if (my !== gen) return;
      activeEditor = make(doc, {});
      wrap.replaceWith(activeEditor.el);
      document.title = `${doc.title} · HUBTECH Office`;
      if (doc.trashed) toast('Dette dokument ligger i papirkurven', { type: 'warn', text: 'Gendan det fra HUBTECH Office for at beholde det.' });
    } catch (e) {
      clear(wrap).appendChild(stateBlock({ kind: 'error', icon: 'alert', title: e.status === 404 ? 'Dokumentet findes ikke' : 'Dokumentet kunne ikke åbnes', text: e.status === 404 ? 'Det er måske slettet, eller linket er forkert.' : e.message,
        actions: [h('a', { class: 'btn btn-primary', href: '#/apps/hubtech' }, icon('arrowLeft'), 'Til HUBTECH Office')] }));
    }
  })();
  return wrap;
}

// ── creating & importing ─────────────────────────────────────────────────
async function createFrom(kind, tpl) {
  try {
    const data = tpl.make();
    tpl.post?.(data);
    const preview = (kind === 'doc' ? textOf(data.html)
      : kind === 'slides' ? data.slides.map(x => textOf(x.title)).filter(Boolean).join(' · ')
      : data.sheets.flatMap(sh => Object.values(sh.cells).map(c => c.v).filter(v => v && v[0] !== '=')).slice(0, 14).join(' · ')).slice(0, 220);
    const doc = await createDoc(kind, tpl.title, data, preview);
    navigate(docHref(doc).slice(1));
  } catch (e) { errorToast(e, 'Kunne ikke oprette'); }
}

async function importFile(file) {
  const name = file.name, lower = name.toLowerCase(), base = name.replace(/\.[^.]+$/, '').slice(0, 150) || 'Importeret';
  try {
    if (file.size > 12 * 1024 * 1024) throw Object.assign(new Error('Filen er større end 12 MB.'), { status: 413 });
    let doc;
    if (lower.endsWith('.docx')) {
      const mammoth = await loadMammoth();
      const r = await mammoth.convertToHtml({ arrayBuffer: await readFile(file, 'buffer') });
      const html = sanitizeHtml(r.value || '<p><br></p>');
      doc = await createDoc('doc', base, { html }, textOf(html).slice(0, 220));
    } else if (/\.(txt|md|markdown|html?)$/.test(lower)) {
      const { importAsDocHtml } = await import('../office/doc.js');
      const html = await importAsDocHtml(file);
      doc = await createDoc('doc', base, { html }, textOf(html).slice(0, 220));
    } else if (/\.(csv|tsv)$/.test(lower)) {
      const { importCsvFile } = await import('../office/sheet.js');
      doc = await createDoc('sheet', base, await importCsvFile(file));
    } else if (/\.(xlsx|xls|ods)$/.test(lower)) {
      const { importWorkbookFile } = await import('../office/sheet.js');
      doc = await createDoc('sheet', base, await importWorkbookFile(file));
    } else {
      toast('Filtypen kan ikke åbnes', { type: 'warn', text: 'HUBTECH Office kan åbne .docx, .xlsx, .xls, .ods, .csv, .txt, .md og .html. PowerPoint-filer kan gemmes, men ikke åbnes.' });
      return;
    }
    logActivity('hubtech', 'import', doc.title, 'Fil åbnet i HUBTECH Office', doc.id);
    toast('Filen er åbnet', { type: 'ok', text: name });
    navigate(docHref(doc).slice(1));
  } catch (e) { errorToast(e, `“${name}” kunne ikke åbnes`); }
}

// ── home ─────────────────────────────────────────────────────────────────
function tplThumb(kind, id) {
  const k = KINDS[kind];
  const lines = (n, w = []) => Array.from({ length: n }, (_, i) => h('i', { style: { width: `${w[i % w.length] || 80}%` } }));
  if (kind === 'doc') return h('div', { class: ['tpl-thumb', 'tpl-doc'] }, h('div', { class: 'tpl-paper' }, id === 'blank' ? null : [h('b'), ...lines(id === 'letter' ? 7 : 8, [90, 70, 85, 60, 95, 40])]));
  if (kind === 'sheet') return h('div', { class: ['tpl-thumb', 'tpl-sheet'] }, h('div', { class: 'tpl-grid' }, Array.from({ length: 24 }, (_, i) => h('i', { class: id !== 'blank' && (i < 4 || i % 4 === 3) ? 'is-fill' : null }))));
  return h('div', { class: ['tpl-thumb', 'tpl-slides'] }, h('div', { class: ['tpl-slide', `tpl-${id}`] }, h('b'), id === 'blank' ? null : lines(3, [60, 45, 52])));
}

function fileCard(d, reload) {
  const K = KINDS[d.kind];
  const starBtn = h('button', { type: 'button', class: 'icon-btn btn-sm ofh-star', 'aria-pressed': String(d.starred), 'aria-label': d.starred ? 'Fjern stjerne' : 'Stjernemarkér', html: svg(d.starred ? 'starFill' : 'star') });
  starBtn.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); try { await updateDoc(d.id, { starred: !d.starred }); reload(); } catch (err) { errorToast(err, 'Kunne ikke gemme'); } });
  const kebab = h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Handlinger for ${d.title}`, html: svg('more') });
  kebab.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    popMenu(kebab, d.trashed ? [
      ['Gendan', 'restore', async () => { await updateDoc(d.id, { trashed: false }); toast('Gendannet', { type: 'ok', text: d.title }); reload(); }],
      ['Slet permanent', 'trash', async () => { if (!await confirmDialog({ title: 'Slet permanent?', text: `“${d.title}” slettes for altid.`, confirmLabel: 'Slet', danger: true })) return; await deleteDoc(d.id); reload(); }, { danger: true }],
    ] : [
      ['Åbn', 'external', () => navigate(docHref(d).slice(1))],
      ['Omdøb', 'edit', () => rename(d, reload)],
      ['Lav en kopi', 'copy', async () => { try { const c = await duplicateDoc(d.id); toast('Kopi oprettet', { type: 'ok', text: c.title }); reload(); } catch (err) { errorToast(err, 'Kunne ikke kopiere'); } }],
      'sep',
      ['Flyt til papirkurv', 'trash', async () => { await updateDoc(d.id, { trashed: true }); toast('Flyttet til papirkurven', { text: d.title, action: { label: 'Fortryd', onClick: async () => { await updateDoc(d.id, { trashed: false }); reload(); } } }); reload(); }, { danger: true }],
    ]);
  });
  return h('a', { class: ['ofh-file', d.trashed && 'is-trashed'], href: d.trashed ? null : docHref(d), style: { '--kind': K.hue }, 'aria-label': `${K.label}: ${d.title}` },
    h('div', { class: 'ofh-file-top' }, h('span', { class: 'ofh-kind' }, icon(K.icon)), h('span', { class: 'ofh-kind-l' }, K.label), starBtn, kebab),
    h('div', { class: 'ofh-prev' }, d.preview || h('span', { class: 'faint' }, d.kind === 'doc' ? 'Tomt dokument' : d.kind === 'sheet' ? 'Tomt regneark' : 'Præsentation')),
    h('div', { class: 'ofh-file-foot' }, h('b', null, d.title), h('span', null, `Redigeret ${timeAgo(d.updatedAt)}`)));
}

function rename(d, reload) {
  const inp = h('input', { class: 'input', value: d.title, maxlength: 160 });
  let m;
  const ok = async () => { const t = inp.value.trim(); if (!t) return; m.close(); try { await updateDoc(d.id, { title: t }); reload(); } catch (e) { errorToast(e, 'Kunne ikke omdøbe'); } };
  m = modal({ title: 'Omdøb', body: inp, actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: ok }, 'Gem')] });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  setTimeout(() => inp.select(), 40);
}

function officeHome() {
  const app = { ...appById('hubtech') };
  const fileInput = h('input', { type: 'file', accept: IMPORT_ACCEPT, hidden: true });
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) importFile(f); });
  const v = { doc: h('span', null, '—'), sheet: h('span', null, '—'), slides: h('span', null, '—'), last: h('span', null, '—') };

  // templates
  const tplBox = h('div', { class: 'ofh-tpls' }, Object.entries(TEMPLATES).map(([kind, list]) => h('section', { class: 'ofh-tplgroup', style: { '--kind': KINDS[kind].hue } },
    h('h3', null, h('span', { class: 'ofh-kind' }, icon(KINDS[kind].icon)), KINDS[kind].plural, h('span', { class: 'faint' }, KINDS[kind].ext)),
    h('div', { class: 'ofh-tplrow' }, list.map(t => {
      const b = h('button', { type: 'button', class: 'ofh-tpl', title: `Ny: ${t.name}` }, tplThumb(kind, t.id), h('span', null, t.name));
      b.addEventListener('click', busy(b, () => createFrom(kind, t)));
      return b;
    })))));

  // files
  const f = { q: '', filter: 'all', sort: 'updated' };
  let docs = [];
  const grid = h('div', { class: 'ofh-files' }, skeletonRows(3));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i titler og indhold…', 'aria-label': 'Søg i filer' });
  search.addEventListener('input', debounce(() => { f.q = search.value.trim().toLowerCase(); draw(); }, 120));
  const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Filtre' },
    [['all', 'Alle'], ['doc', 'Dokumenter'], ['sheet', 'Regneark'], ['slides', 'Præsentationer'], ['starred', 'Stjernemarkeret'], ['trash', 'Papirkurv']].map(([val, l]) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.filter === val) }, l);
      b.addEventListener('click', () => { f.filter = val; chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); draw(); });
      return b;
    }));
  const sort = h('select', { class: 'select', 'aria-label': 'Sortering', style: { width: 'auto' } }, [['updated', 'Senest redigeret'], ['title', 'Navn'], ['created', 'Oprettet']].map(([val, l]) => h('option', { value: val }, l)));
  sort.addEventListener('change', () => { f.sort = sort.value; draw(); });

  async function load() {
    try { docs = await listDocs(); draw(); stats(); }
    catch (e) { clear(grid).appendChild(stateBlock({ kind: 'error', icon: 'alert', title: 'Filerne kunne ikke hentes', text: e.message, actions: [h('button', { class: 'btn btn-primary', onclick: load }, icon('refresh'), 'Prøv igen')] })); }
  }
  function stats() {
    const live = docs.filter(d => !d.trashed);
    for (const k of ['doc', 'sheet', 'slides']) v[k].textContent = String(live.filter(d => d.kind === k).length);
    v.last.textContent = live[0] ? timeAgo(live[0].updatedAt) : '—';
  }
  function draw() {
    let ds = docs.filter(d => (f.filter === 'trash' ? d.trashed : !d.trashed));
    if (['doc', 'sheet', 'slides'].includes(f.filter)) ds = ds.filter(d => d.kind === f.filter);
    if (f.filter === 'starred') ds = ds.filter(d => d.starred);
    if (f.q) ds = ds.filter(d => `${d.title} ${d.preview}`.toLowerCase().includes(f.q));
    if (f.sort === 'title') ds.sort((a, b) => a.title.localeCompare(b.title, 'da'));
    else if (f.sort === 'created') ds.sort((a, b) => b.createdAt - a.createdAt);
    else ds.sort((a, b) => (b.starred - a.starred) || (b.updatedAt - a.updatedAt));
    clear(grid);
    if (!ds.length) {
      grid.appendChild(stateBlock({
        app: 'var(--hue-hubtech)', icon: f.filter === 'trash' ? 'trash' : 'office',
        title: f.q ? `Intet matcher “${f.q}”` : f.filter === 'trash' ? 'Papirkurven er tom' : docs.length ? 'Ingen filer i dette filter' : 'Dine filer samles her',
        text: docs.length || f.q ? '' : 'Start med en skabelon ovenfor, eller åbn en Word-, Excel- eller tekstfil fra din computer.',
        actions: docs.length || f.q ? [] : [h('button', { class: 'btn btn-primary', onclick: () => fileInput.click() }, icon('upload'), 'Åbn en fil')],
      }));
      return;
    }
    ds.forEach(d => grid.appendChild(fileCard(d, load)));
  }
  load();

  // drag & drop a file anywhere on the page to open it
  const page = h('div', { class: 'page office-home', style: { '--app': app.hue } });
  page.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); page.classList.add('is-drop'); } });
  page.addEventListener('dragleave', (e) => { if (e.target === page || !page.contains(e.relatedTarget)) page.classList.remove('is-drop'); });
  page.addEventListener('drop', (e) => { const fl = e.dataTransfer?.files?.[0]; if (fl) { e.preventDefault(); page.classList.remove('is-drop'); importFile(fl); } });

  const quick = (kind) => () => createFrom(kind, TEMPLATES[kind][0]);
  page.append(
    appHero(app, {
      eyebrow: 'HUBTECH Office', title: 'HUBTECH Office',
      lead: 'Skriv dokumenter, regn på regneark og lav præsentationer. Alt gemmes på din konto – og kan hentes som Word, Excel, PowerPoint og PDF.',
      actions: [
        heroBtn('Nyt dokument', 'file', { onclick: quick('doc') }),
        heroGhost('Nyt regneark', 'grid', { onclick: quick('sheet') }),
        heroGhost('Ny præsentation', 'monitor', { onclick: quick('slides') }),
        heroGhost('Åbn fil', 'upload', { onclick: () => fileInput.click(), title: 'Åbn .docx, .xlsx, .csv, .txt, .md eller .html' }), fileInput],
      stats: [
        { icon: 'file', label: 'Dokumenter', value: v.doc },
        { icon: 'grid', label: 'Regneark', value: v.sheet },
        { icon: 'monitor', label: 'Præsentationer', value: v.slides },
        { icon: 'clock', label: 'Senest redigeret', value: v.last }],
    }),
    h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('plus'), 'Start nyt'), h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Eller træk en fil ind på siden for at åbne den')), tplBox),
    h('section', { class: 'glass panel', style: { marginTop: '16px' } },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('folder'), 'Dine filer')),
      h('div', { class: 'ofh-toolbar' }, h('div', { class: 'pt-search' }, icon('search'), search), chips, sort),
      grid),
    classicSection());
  return page;
}

function classicSection() {
  const owner = store.get('user').role === 'owner';
  const modBox = h('div', { class: 'tile-grid ofh-classic' });
  const cfg = h('div');
  (async () => {
    let d = {};
    try { d = (await getIntegrations()).hubtechSite || {}; } catch { /* */ }
    const base = d.url || 'sites/hubtech';
    for (const m of MODULES) {
      modBox.appendChild(h('a', { class: 'tile-card', href: `#/apps/hubtech/${encodeURIComponent(m.file)}`, style: { '--app': 'var(--hue-hubtech)' } },
        h('div', { class: 'tile-media contain', style: { backgroundImage: `url("${base}/${encodeURI(m.img)}")` } }, h('span', { class: 'app-card-icon' }, icon(m.icon))),
        h('div', { class: 'tile-body' }, h('h3', null, m.name), h('p', null, m.text))));
    }
    if (owner) {
      const inp = h('input', { class: 'input', value: d.url || '', placeholder: 'Tom = den indbyggede kopi (anbefalet)', 'aria-label': 'Adresse til et eksternt HUBTECH-site' });
      const save = h('button', { class: 'btn' }, 'Gem');
      save.addEventListener('click', busy(save, async () => {
        try { await api.put('/api/integrations/hubtech-site/url', { url: inp.value.trim() }); invalidateIntegrations(); toast('Adresse gemt', { type: 'ok', ms: 1500 }); }
        catch (e) { errorToast(e, 'Kunne ikke gemme'); }
      }));
      cfg.appendChild(h('details', { class: 'faq-item glass', style: { marginTop: '14px' } },
        h('summary', null, 'Avanceret: brug et eksternt HUBTECH-site', icon('chevronDown')),
        h('div', { class: 'faq-a' }, h('p', null, 'De klassiske sider kører som standard fra kopien i web/sites/hubtech.'), h('div', { class: 'bf-url', style: { width: '100%' } }, inp, save))));
    }
  })();
  const copyIp = h('button', { class: 'btn btn-sm', html: svg('copy') + '<span>Kopiér IP</span>' });
  let mcIp = MC_IP;
  const mcSub = h('div', { class: 'row-sub mono' }, `${MC_IP} · version 1.21.8`);
  api.get('/api/mc').then(({ server: s }) => { mcIp = s.port ? `${s.address}:${s.port}` : s.address; mcSub.textContent = [mcIp, s.version && `version ${s.version}`].filter(Boolean).join(' · '); }).catch(() => {});
  copyIp.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); try { await navigator.clipboard.writeText(mcIp); toast('Server-IP kopieret', { type: 'ok', ms: 1500 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } });
  return h('details', { class: 'ofh-classic-wrap glass panel', style: { marginTop: '16px' } },
    h('summary', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('hubtech'), 'Klassisk HUBTECH'), h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Pingochat, GameHub, chatbot, holdet og Minecraft-serveren'), icon('chevronDown')),
    modBox, cfg,
    h('div', { class: 'grid-2', style: { marginTop: '16px' } },
      h('div', null, h('h3', { class: 'ofh-sub' }, icon('users'), 'Folkene bag HUBTECH'),
        h('ul', { class: 'ht-team' }, TEAM.map(([n, r]) => h('li', null, h('span', { class: 'avatar solid' }, n[0]), h('div', null, h('b', null, n), h('div', { class: 'faint' }, r)))))),
      h('div', null, h('h3', { class: 'ofh-sub' }, icon('bell'), 'Community'),
        h('div', { class: 'list' },
          h('a', { class: 'row', href: '#/apps/minecraft', style: { '--app': 'var(--hue-minecraft)' } }, h('span', { class: 'row-icon solid' }, icon('gamepad')),
            h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'HUBTECH Minecraft-server'), mcSub), copyIp),
          h('a', { class: 'row', href: '#/apps/community' }, h('span', { class: 'row-icon solid' }, icon('chat')),
            h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Support i Fællesskab'), h('div', { class: 'row-sub' }, 'Spørgsmål, idéer og hjælp – i HUBTECH’s egen chat'))),
          h('a', { class: 'row', href: 'mailto:HUBTECH2025@proton.me' }, h('span', { class: 'row-icon solid' }, icon('mail')),
            h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, 'Kontakt os'), h('div', { class: 'row-sub' }, 'HUBTECH2025@proton.me')))))));
}

export default {
  title: 'HUBTECH Office',
  destroy() { gen++; try { activeEditor?.destroy(); } catch (e) { console.error(e); } activeEditor = null; },
  render(ctx) {
    const { sub, id } = ctx.params;
    if (sub && id && ['doc', 'sheet', 'slides'].includes(sub)) return editorPage(sub, decodeURIComponent(id));
    if (sub) {
      const file = decodeURIComponent(sub);
      if (/^[\w().\- ]+\.html$/i.test(file)) return modulePage(file);
    }
    return officeHome();
  },
};
