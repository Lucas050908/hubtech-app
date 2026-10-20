/**
 * App-værkstedet — build small web apps (HTML, CSS, JavaScript) inside HUBTECH, with a live preview, a console and
 * the local AI assistant as co-pilot. Apps run sandboxed (server/studio.py), keep their data on your account and can
 * be shared with the other users.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal, confirmDialog, stateBlock, segmented } from '../core/ui.js';
import { navigate, query } from '../core/router.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { codeEditor } from '../features/codeeditor.js';
import { saveBlob } from '../core/files.js';
import { setAiContext } from '../ai/context.js';
import { getStudio } from '../features/appsettings.js';
import { TEMPLATES } from '../data/studio-templates.js';

const BASE = '#/apps/studio';
const FILE_RE = /^[A-Za-z0-9_-]{1,40}\.(html|css|js|json|md|txt|svg)$/;
const LANG = { html: 'html', svg: 'html', css: 'css', js: 'javascript', json: 'javascript', md: 'text', txt: 'text' };
const ICONS = ['🧩', '✅', '🧮', '🎯', '⏱️', '🎮', '📊', '🎨', '🎵', '📝', '🌦️', '🔧', '💡', '🚀', '📚', '🛒'];
let cleanup = [];

const ago = (sec) => { const d = Date.now() / 1000 - sec; return d < 60 ? 'lige nu' : d < 3600 ? `${Math.floor(d / 60)} min. siden` : d < 86400 ? `${Math.floor(d / 3600)} t. siden` : new Date(sec * 1000).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }); };

/** Messages from a running app: console lines, saved data and toasts. */
function bridge(frame, appId, { onConsole } = {}) {
  let t = 0, pending = null;
  const flush = () => { if (!pending) return; const d = pending; pending = null; api.put(`/api/studio/data/${appId}`, { data: d }).catch(e => toast('Appens data kunne ikke gemmes', { type: 'bad', text: e.message })); };
  const on = (e) => {
    if (e.source !== frame.contentWindow || !e.data || e.data.__studio !== 1) return;
    const m = e.data;
    if (m.type === 'console') onConsole?.(m.level, String(m.text || ''));
    else if (m.type === 'store' && m.data && typeof m.data === 'object') { pending = m.data; clearTimeout(t); t = setTimeout(flush, 600); }
    else if (m.type === 'toast') toast(String(m.text || '').slice(0, 200), { icon: 'sparkles' });
    else if (m.type === 'ready') onConsole?.('ready', '');
  };
  addEventListener('message', on);
  return () => { removeEventListener('message', on); clearTimeout(t); flush(); };
}

function runFrame(id, { draft = false, title = 'App' } = {}) {
  return h('iframe', { class: 'st-frame', title, src: `/api/studio/run/${id}${draft ? `?draft=1&t=${Date.now()}` : ''}`,
    sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock', allow: 'fullscreen', referrerpolicy: 'no-referrer' });
}

/** One self-contained .html file (for download) – the same inlining as the server does. */
function inlineDoc(files) {
  let doc = files['index.html'] || '';
  doc = doc.replace(/<link\b[^>]*?href=["']\.?\/?([A-Za-z0-9_-]+\.css)["'][^>]*>/gi, (m, n) => (files[n] != null ? `<style>\n${files[n]}\n</style>` : m));
  doc = doc.replace(/<script\b([^>]*?)\bsrc=["']\.?\/?([A-Za-z0-9_-]+\.js)["'][^>]*>\s*<\/script>/gi, (m, a, n) => (files[n] != null ? `<script${/type=["']module/i.test(a) ? ' type="module"' : ''}>\n${files[n].replace(/<\/script/gi, '<\\/script')}\n</script>` : m));
  return doc;
}

export default {
  title: 'App-værksted',
  destroy() { cleanup.forEach(f => { try { f(); } catch { /* */ } }); cleanup = []; setAiContext(null); },
  async render(ctx) {
    this.destroy();
    const app = appById('studio');
    const { sub, id } = ctx.params || {};
    try {
      if (sub === 'edit' && id) return await editor(app, id);
      if (sub === 'run' && id) return await runner(app, id);
      return await overview(app);
    } catch (e) {
      return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'App-værkstedet kunne ikke åbnes', text: e.message, actions: [h('a', { class: 'btn', href: BASE }, 'Til App-værkstedet')] }));
    }
  },
};

// ── overview ───────────────────────────────────────────────────────────
async function overview(app) {
  const d = await api.get('/api/studio/apps');
  const grid = h('div', { class: 'st-grid' });
  const gallery = h('div', { class: 'st-grid' });
  const reload = async () => { const x = await api.get('/api/studio/apps'); d.mine = x.mine; d.gallery = x.gallery; draw(); };
  const menu = (a) => {
    const m = modal({ title: a.name, label: 'App-værksted', size: 420, body: h('div', { class: 'sc-list' },
      h('button', { class: 'sc-item', onclick: async () => { m.close(); await api.put(`/api/studio/apps/${a.id}`, { published: !a.published }).catch(e => toast(e.message, { type: 'bad' })); toast(a.published ? 'Appen er ikke længere delt' : 'Appen er delt', { type: 'ok', text: a.published ? '' : 'Alle brugere kan nu finde den i galleriet.' }); reload(); } },
        h('span', { class: 'cm-ava' }, icon(a.published ? 'lock' : 'globe')), h('span', null, h('b', null, a.published ? 'Stop deling' : 'Del i galleriet'), h('span', { class: 'faint' }, a.published ? 'Kun du kan se appen' : 'Alle brugere på denne HUBTECH kan køre og kopiere den'))),
      h('button', { class: 'sc-item', onclick: async () => { m.close(); try { const r = await api.post(`/api/studio/apps/${a.id}/remix`); toast('Kopi lavet', { type: 'ok' }); navigate(`/apps/studio/edit/${r.app.id}`); } catch (e) { toast(e.message, { type: 'bad' }); } } }, h('span', { class: 'cm-ava' }, icon('copy')), h('span', null, h('b', null, 'Lav en kopi'))),
      h('button', { class: 'sc-item', onclick: async () => { m.close(); const full = (await api.get(`/api/studio/apps/${a.id}`)).app; await saveBlob(`${a.name.replace(/[^\wæøåÆØÅ -]+/g, '').trim() || 'app'}.html`, new Blob([inlineDoc(full.files)], { type: 'text/html' })); } }, h('span', { class: 'cm-ava' }, icon('download')), h('span', null, h('b', null, 'Hent som HTML-fil'), h('span', { class: 'faint' }, 'Én fil, der kan åbnes i enhver browser'))),
      h('button', { class: 'sc-item', onclick: async () => { m.close(); if (await confirmDialog({ title: `Slet ${a.name}?`, text: 'Appen og dens kode slettes. Det kan ikke fortrydes.', confirmLabel: 'Slet', danger: true })) { await api.del(`/api/studio/apps/${a.id}`).catch(e => toast(e.message, { type: 'bad' })); reload(); } } }, h('span', { class: 'cm-ava' }, icon('trash')), h('span', null, h('b', { style: { color: 'var(--bad)' } }, 'Slet appen')))),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Luk')] });
  };
  const card = (a) => h('article', { class: 'st-card glass' },
    h('a', { class: 'st-card-main', href: `${BASE}/run/${a.id}`, 'aria-label': `Kør ${a.name}` }, h('span', { class: 'st-icon' }, a.icon || '🧩'),
      h('span', { class: 'st-card-t' }, h('b', null, a.name), h('span', { class: 'faint' }, a.mine ? `${a.published ? 'Delt · ' : ''}ændret ${ago(a.updatedAt)}` : `af ${a.owner?.name || '?'} · ${a.runs} kørsler`))),
    a.description ? h('p', { class: 'st-desc faint' }, a.description) : null,
    h('div', { class: 'st-card-b' },
      h('a', { class: 'btn btn-sm app-solid', href: `${BASE}/run/${a.id}` }, icon('play'), 'Kør'),
      a.mine ? h('a', { class: 'btn btn-sm', href: `${BASE}/edit/${a.id}` }, icon('edit'), 'Redigér')
        : h('button', { class: 'btn btn-sm', onclick: async () => { try { const r = await api.post(`/api/studio/apps/${a.id}/remix`); toast('Kopien er din – byg videre på den', { type: 'ok' }); navigate(`/apps/studio/edit/${r.app.id}`); } catch (e) { toast(e.message, { type: 'bad' }); } } }, icon('copy'), 'Lav en kopi'),
      a.mine ? h('button', { class: 'icon-btn', 'aria-label': `Flere valg for ${a.name}`, onclick: () => menu(a) }, icon('more')) : null));
  const stats = { mine: h('span'), shared: h('span'), runs: h('span') };
  function draw() {
    stats.mine.textContent = String(d.mine.length); stats.shared.textContent = String(d.mine.filter(a => a.published).length); stats.runs.textContent = String(d.gallery.length);
    h(clear(grid), null, d.mine.length ? d.mine.map(card) : stateBlock({ app: app.hue, icon: 'code', title: 'Du har ingen apps endnu', text: 'Start fra en skabelon – eller beskriv din idé, så skriver AI-assistenten den første udgave.', actions: [h('button', { class: 'btn app-solid', onclick: newApp }, icon('plus'), 'Ny app')] }));
    h(clear(gallery), null, d.gallery.length ? d.gallery.map(card) : h('p', { class: 'faint' }, 'Ingen har delt apps endnu. Del din egen via ⋯ på kortet.'));
  }
  draw();
  return h('div', { class: 'page studio-page', style: { '--app': app.hue } },
    appHero(app, { eyebrow: 'Arbejdsrum', title: 'App-værksted', lead: 'Byg dine egne små apps i HTML, CSS og JavaScript. Se resultatet med det samme, og lad din lokale AI skrive og rette koden sammen med dig.',
      actions: [heroBtn('Ny app', 'plus', { onclick: newApp }), heroGhost('Spørg AI', 'sparkles', { onclick: () => import('../ai/panel.js').then(m => m.toggleAssistant(true)) })],
      stats: [{ icon: 'code', label: 'Mine apps', value: stats.mine }, { icon: 'globe', label: 'Delt af mig', value: stats.shared }, { icon: 'users', label: 'I galleriet', value: stats.runs }] }),
    h('section', { class: 'st-sec' }, h('h2', { class: 'st-h2 on-world' }, 'Mine apps'), grid),
    h('section', { class: 'st-sec' }, h('h2', { class: 'st-h2 on-world' }, 'Galleri – delt af andre'), gallery));
}

function newApp() {
  let tpl = TEMPLATES[0], ic = tpl.icon;
  const name = h('input', { class: 'input', maxlength: 60, placeholder: 'Fx Min huskeliste', 'aria-label': 'Navn' });
  const idea = h('textarea', { class: 'textarea', rows: 3, maxlength: 1000, placeholder: 'Valgfrit: beskriv appen, så skriver AI-assistenten den for dig. Fx “En app hvor jeg kan registrere hvor meget vand jeg drikker hver dag”', 'aria-label': 'Beskriv appen til AI-assistenten' });
  const tpls = h('div', { class: 'st-tpls', role: 'radiogroup', 'aria-label': 'Skabelon' });
  const icons = h('div', { class: 'cm-iconpick', role: 'group', 'aria-label': 'Ikon' });
  const draw = () => {
    h(clear(tpls), null, TEMPLATES.map(t => h('button', { type: 'button', role: 'radio', class: 'st-tpl', 'aria-checked': String(t === tpl), onclick: () => { tpl = t; ic = t.icon; draw(); } }, h('span', { class: 'st-tpl-ic' }, t.icon), h('b', null, t.name), h('span', { class: 'faint' }, t.description))));
    h(clear(icons), null, ICONS.map(x => h('button', { type: 'button', class: 'cm-iconbtn', 'aria-pressed': String(x === ic), onclick: () => { ic = x; draw(); } }, x)));
  };
  draw();
  const err = h('div', { class: 'field-error' });
  const go = async (btn) => {
    btn.disabled = true;
    try {
      const r = await api.post('/api/studio/apps', { name: name.value.trim() || (tpl.id === 'blank' ? 'Min app' : tpl.name), icon: ic, description: tpl.id === 'blank' ? '' : tpl.description, files: tpl.files });
      m.close();
      const ask = idea.value.trim();
      navigate(`/apps/studio/edit/${r.app.id}${ask ? `?ask=${encodeURIComponent(ask)}` : ''}`);
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  };
  const ok = h('button', { class: 'btn btn-primary', onclick: () => go(ok) }, icon('plus'), 'Opret');
  const m = modal({ title: 'Ny app', label: 'App-værksted', size: 640,
    body: h('div', { class: 'stack', style: { gap: '12px' } },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Start fra'), tpls),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ikon'), icons),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Lad AI-assistenten bygge den'), idea), err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), ok] });
  setTimeout(() => name.focus(), 50);
}

// ── runner ─────────────────────────────────────────────────────────────
async function runner(app, id) {
  const a = (await api.get(`/api/studio/apps/${id}`)).app;
  const frame = runFrame(id, { title: a.name });
  cleanup.push(bridge(frame, id));
  return h('div', { class: 'page st-run-page', style: { '--app': app.hue } },
    h('header', { class: 'st-run-h glass' },
      h('a', { class: 'icon-btn', href: BASE, 'aria-label': 'Tilbage til App-værkstedet' }, icon('chevronLeft')),
      h('span', { class: 'st-icon' }, a.icon), h('div', { class: 'st-run-t' }, h('h1', null, a.name), h('p', { class: 'faint' }, a.mine ? 'Din app' : `af ${a.owner?.name || '?'}`)),
      h('button', { class: 'icon-btn', 'aria-label': 'Genstart appen', title: 'Genstart', onclick: () => { frame.src = `/api/studio/run/${id}?t=${Date.now()}`; } }, icon('refresh')),
      a.mine ? h('a', { class: 'btn btn-sm', href: `${BASE}/edit/${id}` }, icon('edit'), 'Redigér')
        : h('button', { class: 'btn btn-sm', onclick: async () => { const r = await api.post(`/api/studio/apps/${id}/remix`); navigate(`/apps/studio/edit/${r.app.id}`); } }, icon('copy'), 'Lav en kopi')),
    h('div', { class: 'st-run-body glass' }, frame));
}

// ── editor ─────────────────────────────────────────────────────────────
async function editor(app, id) {
  const a = (await api.get(`/api/studio/apps/${id}`)).app;
  if (!a.mine) { navigate(`/apps/studio/run/${id}`, { replace: true }); return h('div'); }
  let files = { ...a.files }, current = 'index.html', dirty = false, saving = false, saveTimer = 0, autoRun = getStudio().autoRun, view = 'code';
  const undo = [];
  const logs = [];
  const status = h('span', { class: 'st-status faint', role: 'status' }, 'Gemt');
  const nameIn = h('input', { class: 'st-name', value: a.name, maxlength: 60, 'aria-label': 'Appens navn' });
  const iconBtn = h('button', { class: 'st-icon st-icon-btn', 'aria-label': 'Skift ikon', title: 'Skift ikon' }, a.icon);
  const tabs = h('div', { class: 'st-tabs', role: 'tablist', 'aria-label': 'Filer' });
  const edHost = h('div', { class: 'st-ed' });
  const consoleList = h('ol', { class: 'st-console', 'aria-label': 'Konsol', 'aria-live': 'polite' });
  const errBadge = h('span', { class: 'cm-badge', hidden: true });
  let frame = runFrame(id, { draft: true, title: 'Forhåndsvisning' });
  const previewBox = h('div', { class: 'st-preview' }, frame);
  let unbridge = null;
  const attach = () => { unbridge?.(); unbridge = bridge(frame, id, { onConsole: addLog }); };
  attach();
  cleanup.push(() => unbridge?.());
  const undoBtn = h('button', { class: 'btn btn-sm btn-ghost', disabled: true, title: 'Fortryd sidste store ændring (AI, slettet fil)', onclick: () => restore() }, icon('undo'), 'Fortryd');

  function addLog(level, text) {
    if (level === 'ready') return;
    logs.push({ level, text, at: Date.now() });
    if (logs.length > 200) logs.shift();
    consoleList.appendChild(h('li', { class: `is-${level}` }, h('span', { class: 'st-lvl' }, { error: '✕', warn: '!', info: 'i', log: '›' }[level] || '›'), h('span', null, text)));
    consoleList.scrollTop = consoleList.scrollHeight;
    const n = logs.filter(l => l.level === 'error').length;
    errBadge.hidden = !n; errBadge.textContent = String(n);
  }
  function clearLogs() { logs.length = 0; clear(consoleList); errBadge.hidden = true; }
  function run() {
    clearLogs();
    const next = runFrame(id, { draft: true, title: 'Forhåndsvisning' });
    frame.replaceWith(next); frame = next; attach();
  }
  async function save({ andRun = autoRun } = {}) {
    clearTimeout(saveTimer);
    if (saving) { saveTimer = setTimeout(() => save({ andRun }), 300); return; }
    if (!dirty) { if (andRun) run(); return; }
    saving = true; dirty = false; status.textContent = 'Gemmer …';
    try {
      await api.put(`/api/studio/apps/${id}`, { files, name: nameIn.value.trim() || 'Min app', icon: iconBtn.textContent });
      status.textContent = 'Gemt'; status.classList.remove('is-bad');
      if (andRun) run();
    } catch (e) { dirty = true; status.textContent = 'Ikke gemt'; status.classList.add('is-bad'); toast('Appen kunne ikke gemmes', { type: 'bad', text: e.message }); }
    finally { saving = false; }
  }
  const changed = () => { dirty = true; status.textContent = 'Ændret'; clearTimeout(saveTimer); saveTimer = setTimeout(() => save(), 900); };
  nameIn.addEventListener('input', changed);
  iconBtn.addEventListener('click', () => {
    const m = modal({ title: 'Vælg ikon', label: 'App-værksted', size: 420, body: h('div', { class: 'cm-iconpick' }, ICONS.map(x => h('button', { type: 'button', class: 'cm-iconbtn', onclick: () => { iconBtn.textContent = x; m.close(); changed(); } }, x))), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Luk')] });
  });

  let ed = null;
  function openFile(n) {
    current = n;
    ed = codeEditor(LANG[n.split('.').pop()] || 'text', files[n] ?? '', (v) => { files[current] = v; changed(); }, { rows: 22, label: `Koden i ${n}` });
    ed.ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save({ andRun: true }); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save({ andRun: true }); }
    });
    ed.el.style.setProperty('--st-font', `${getStudio().fontSize}px`);
    h(clear(edHost), null, ed.el);
    drawTabs();
  }
  function drawTabs() {
    const order = Object.keys(files).sort((x, y) => (x === 'index.html' ? -1 : y === 'index.html' ? 1 : x.localeCompare(y)));
    h(clear(tabs), null, order.map(n => h('div', { class: ['st-tab', n === current && 'is-active'], role: 'presentation' },
      h('button', { role: 'tab', 'aria-selected': String(n === current), onclick: () => openFile(n) }, n),
      n !== 'index.html' ? h('button', { class: 'st-tab-x', 'aria-label': `Slet ${n}`, title: 'Slet filen', onclick: async () => {
        if (!await confirmDialog({ title: `Slet ${n}?`, text: 'Du kan fortryde med knappen Fortryd.', confirmLabel: 'Slet', danger: true })) return;
        snapshot(); delete files[n]; changed(); openFile(current === n ? 'index.html' : current);
      } }, icon('x')) : null)),
      h('button', { class: 'st-tab-add', 'aria-label': 'Ny fil', title: 'Ny fil', onclick: newFile }, icon('plus')));
  }
  function newFile() {
    const inp = h('input', { class: 'input', placeholder: 'fx spil.js eller data.json', 'aria-label': 'Filnavn', autocapitalize: 'off', spellcheck: 'false' });
    const err = h('div', { class: 'field-error' });
    const go = () => {
      const n = inp.value.trim();
      if (!FILE_RE.test(n)) { err.textContent = 'Brug bogstaver, tal, - og _ og en af endelserne .js, .css, .html, .json, .md, .txt eller .svg.'; return; }
      if (files[n] != null) { err.textContent = 'Filen findes allerede.'; return; }
      files[n] = n.endsWith('.json') ? '{}\n' : ''; changed(); m.close(); openFile(n);
      if (n.endsWith('.js') || n.endsWith('.css')) toast(`Husk at hente ${n} i index.html`, { text: n.endsWith('.js') ? `<script src="${n}"></script>` : `<link rel="stylesheet" href="${n}">` });
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const m = modal({ title: 'Ny fil', label: 'App-værksted', size: 420, body: h('div', { class: 'stack', style: { gap: '8px' } }, inp, err), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: go }, 'Opret')] });
    setTimeout(() => inp.focus(), 50);
  }
  function snapshot() { undo.push({ ...files }); if (undo.length > 30) undo.shift(); undoBtn.disabled = false; }
  function restore() {
    const prev = undo.pop();
    if (!prev) return;
    files = prev; undoBtn.disabled = !undo.length;
    changed(); openFile(files[current] != null ? current : 'index.html'); save({ andRun: true });
    toast('Fortrudt', { type: 'ok' });
  }

  // the AI assistant can read the files and console, and write files you accept
  setAiContext({ kind: 'studio', name: a.name, getFiles: () => files, getCurrent: () => current, getErrors: () => logs.filter(l => l.level === 'error' || l.level === 'warn').map(l => l.text),
    applyFile: (n, code, { quiet = false } = {}) => {
      if (!FILE_RE.test(n)) { toast('Ugyldigt filnavn', { type: 'bad', text: n }); return false; }
      snapshot();
      files[n] = code;
      changed(); openFile(n); save({ andRun: true });
      if (!quiet) toast(`${n} er opdateret`, { type: 'ok', action: { label: 'Fortryd', onClick: restore } });
      return true;
    } });

  const pubBtn = h('button', { class: 'btn btn-sm', onclick: async () => {
    try { const r = await api.put(`/api/studio/apps/${id}`, { published: !a.published }); a.published = r.app.published; drawPub(); toast(a.published ? 'Appen er delt i galleriet' : 'Appen er ikke længere delt', { type: 'ok' }); }
    catch (e) { toast(e.message, { type: 'bad' }); }
  } });
  const drawPub = () => h(clear(pubBtn), null, icon(a.published ? 'globe' : 'share'), a.published ? 'Delt' : 'Del');
  drawPub();
  const autoCb = h('input', { type: 'checkbox', checked: autoRun, onchange: (e) => { autoRun = e.target.checked; } });
  const panes = h('div', { class: 'st-panes', dataset: { view } });
  const viewSeg = segmented([{ value: 'code', label: 'Kode', icon: 'code' }, { value: 'preview', label: 'Vis', icon: 'eye' }, { value: 'console', label: 'Konsol', icon: 'terminal' }], view, (v) => { view = v; panes.dataset.view = v; if (v === 'preview' && dirty) save({ andRun: true }); }, { label: 'Visning' });
  const aiBtn = h('button', { class: 'btn btn-sm st-ai', onclick: () => import('../ai/panel.js').then(m => m.toggleAssistant(true)) }, icon('sparkles'), 'AI-hjælp');
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save({ andRun: true }); } };
  addEventListener('keydown', onKey);
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', beforeUnload);
  cleanup.push(() => { removeEventListener('keydown', onKey); removeEventListener('beforeunload', beforeUnload); if (dirty) save({ andRun: false }); });

  openFile('index.html');
  panes.append(
    h('section', { class: 'st-code glass', 'aria-label': 'Kode' }, tabs, edHost),
    h('section', { class: 'st-side', 'aria-label': 'Forhåndsvisning og konsol' },
      h('div', { class: 'st-prev-wrap glass' }, h('div', { class: 'st-pane-h' }, icon('eye'), h('b', null, 'Forhåndsvisning'), h('span', { style: { flex: 1 } }),
        h('label', { class: 'cal-pcheck st-auto' }, autoCb, h('span', null, 'Kør automatisk')),
        h('button', { class: 'icon-btn', 'aria-label': 'Åbn i fuld skærm', title: 'Fuld skærm', onclick: async () => { await save({ andRun: false }); navigate(`/apps/studio/run/${id}`); } }, icon('external'))), previewBox),
      h('div', { class: 'st-con-wrap glass' }, h('div', { class: 'st-pane-h' }, icon('terminal'), h('b', null, 'Konsol'), errBadge, h('span', { style: { flex: 1 } }),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => import('../ai/panel.js').then(m => m.askAssistant('Ret fejlen i konsollen, og forklar kort hvad der var galt.')), title: 'Bed AI-assistenten om at rette fejlene' }, icon('sparkles'), 'Ret med AI'),
        h('button', { class: 'icon-btn', 'aria-label': 'Ryd konsollen', title: 'Ryd', onclick: clearLogs }, icon('trash'))), consoleList)));

  const ask = query().get('ask');
  if (ask) {
    history.replaceState(null, '', `${BASE}/edit/${id}`);
    setTimeout(() => import('../ai/panel.js').then(m => m.askAssistant(`Byg denne app: ${ask}`)), 400);
  }
  return h('div', { class: 'page st-edit-page', style: { '--app': app.hue } },
    h('header', { class: 'st-bar glass' },
      h('a', { class: 'icon-btn', href: BASE, 'aria-label': 'Tilbage til App-værkstedet' }, icon('chevronLeft')),
      iconBtn, nameIn, status, h('span', { class: 'st-bar-gap' }),
      viewSeg, undoBtn,
      h('button', { class: 'btn btn-sm app-solid', title: 'Gem og kør (Ctrl+Enter)', onclick: () => save({ andRun: true }) }, icon('play'), 'Kør'),
      pubBtn,
      h('button', { class: 'icon-btn', 'aria-label': 'Hent som HTML-fil', title: 'Hent som én HTML-fil', onclick: () => saveBlob(`${(nameIn.value.trim() || 'app').replace(/[^\wæøåÆØÅ -]+/g, '')}.html`, new Blob([inlineDoc(files)], { type: 'text/html' })) }, icon('download')),
      aiBtn),
    panes);
}
