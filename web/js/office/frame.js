/** Shared editor chrome for HUBTECH Office: top bar, toolbar, status bar, autosave, menus, print. */
import { h, clear } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { toast, confirmDialog, errorToast, modal } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { KINDS, autosaver, updateDoc, duplicateDoc, docHref, listVersions, getVersion, restoreVersion } from './store.js';
import { sanitizeHtml, textOf } from './sanitize.js';

export const toolBtn = (ic, label, onClick, cls) => {
  const b = h('button', { type: 'button', class: ['ofx-tool', cls], title: label, 'aria-label': label, html: svg(ic) });
  b.addEventListener('mousedown', (e) => e.preventDefault());   // keep the text selection in the editor
  b.addEventListener('click', onClick);
  return b;
};
export const toolSep = () => h('span', { class: 'ofx-sep', 'aria-hidden': 'true' });

/** Small popover menu: items = [[label, icon, fn, {danger}] | 'sep'] */
export function popMenu(anchor, items) {
  document.querySelector('.ofx-menu')?.remove();
  const m = h('div', { class: 'ofx-menu glass', role: 'menu' }, items.map(it => it === 'sep' ? h('hr') : h('button', {
    type: 'button', role: 'menuitem', class: it[3]?.danger ? 'is-danger' : null,
    onclick: () => { close(); it[2](); },
  }, icon(it[1]), it[0])));
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = `${Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6)}px`;
  m.style.left = `${Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
  const close = () => { m.remove(); removeEventListener('mousedown', out, true); removeEventListener('keydown', esc, true); };
  const out = (e) => { if (!m.contains(e.target) && e.target !== anchor) close(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); } };
  setTimeout(() => { addEventListener('mousedown', out, true); addEventListener('keydown', esc, true); });
  m.querySelector('button')?.focus();
  return m;
}

/** Print only `node` (a clone), titled `title`. */
export function printNode(node, title, cls = '') {
  const root = h('div', { class: ['print-root', cls] });
  const clone = node.cloneNode(true);
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
  root.appendChild(clone);
  document.body.appendChild(root);
  document.documentElement.classList.add('printing');
  const old = document.title;
  document.title = title || old;
  const done = () => { root.remove(); document.documentElement.classList.remove('printing'); document.title = old; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (root.isConnected) done(); }, 1500); }, 80);
}

const REASON = { auto: 'Automatisk gemt', 'before-restore': 'Før gendannelse' };
const when = (t) => new Date(t * 1000).toLocaleString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A read-only preview of a version's data. */
function versionPreview(kind, data) {
  if (kind === 'doc') {
    const d = h('div', { class: 'doc-page vh-doc' });
    d.innerHTML = sanitizeHtml(data?.html || '');
    return d;
  }
  if (kind === 'sheet') {
    const s = data?.sheets?.[data.active || 0] || data?.sheets?.[0];
    if (!s) return h('p', { class: 'muted' }, 'Tomt regneark');
    const t = h('table', { class: 'vh-sheet' });
    let mr = 0, mc = 0;
    for (const id of Object.keys(s.cells || {})) { const m = /^([A-Z]+)(\d+)$/.exec(id); if (!m) continue; mr = Math.max(mr, +m[2]); mc = Math.max(mc, m[1].charCodeAt(0) - 64); }
    for (let r = 1; r <= Math.min(mr, 30); r++) t.appendChild(h('tr', null, Array.from({ length: Math.min(mc, 10) }, (_, c) => h('td', null, s.cells[`${String.fromCharCode(65 + c)}${r}`]?.v || ''))));
    return h('div', null, h('p', { class: 'faint' }, `Ark “${s.name}”${data.sheets.length > 1 ? ` (+${data.sheets.length - 1} flere)` : ''} · formler vises som de er skrevet`), t);
  }
  const slides = data?.slides || [];
  return h('ol', { class: 'vh-slides' }, slides.map(sl => h('li', null, h('b', null, textOf(sl.title) || '(uden titel)'), h('span', { class: 'faint' }, textOf(sl.body).slice(0, 120)))));
}

async function taskForDoc(doc, docTitle) {
  try {
    const { getState, saveState, flushState } = await import('../core/services.js');
    const st = (await getState('tasks', { force: true })) || { tasks: [] };
    if (!Array.isArray(st.tasks)) st.tasks = [];
    const now = Date.now();
    st.tasks.unshift({ id: now.toString(36) + Math.random().toString(36).slice(2, 7), title: `Arbejd videre på “${docTitle}”`, notes: '', status: 'todo', prio: 'med', due: null, project: null,
      doc: { id: doc.id, kind: doc.kind, title: docTitle }, remind: 'none', created: now, updated: now });
    saveState('tasks', st); flushState('tasks');
    toast('Opgave oprettet', { type: 'ok', text: 'Du finder den i Opgaver – med et link tilbage til filen.', action: { label: 'Åbn Opgaver', onClick: () => navigate('/apps/tasks') } });
  } catch (e) { errorToast(e, 'Kunne ikke oprette opgaven'); }
}

async function versionsDialog(doc, saver) {
  await saver.flush();
  let r;
  try { r = await listVersions(doc.id); } catch (e) { errorToast(e, 'Kunne ikke hente historikken'); return; }
  const list = h('div', { class: 'vh-list', role: 'listbox', 'aria-label': 'Versioner' });
  const pane = h('div', { class: 'vh-pane' }, h('p', { class: 'muted' }, r.versions.length ? 'Vælg en version til venstre for at se den.' : 'Der er ingen ældre versioner endnu. HUBTECH gemmer en version, når du begynder at redigere igen efter en pause på 10 minutter.'));
  const restoreBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, icon('restore'), 'Gendan denne version');
  let picked = null;
  list.appendChild(h('div', { class: 'vh-item is-current' }, h('b', null, 'Nuværende version'), h('span', { class: 'faint' }, when(r.current.updatedAt))));
  r.versions.forEach((v) => {
    const it = h('button', { type: 'button', class: 'vh-item', role: 'option' }, h('b', null, when(v.createdAt)), h('span', { class: 'faint' }, `${REASON[v.reason] || v.reason} · ${v.title}`));
    it.addEventListener('click', async () => {
      list.querySelectorAll('.vh-item').forEach(x => x.setAttribute('aria-selected', String(x === it)));
      h(clear(pane), null, h('p', { class: 'muted' }, 'Henter…'));
      try { const full = await getVersion(doc.id, v.id); picked = full; h(clear(pane), null, versionPreview(doc.kind, full.data)); restoreBtn.disabled = false; }
      catch (e) { h(clear(pane), null, h('p', { class: 'faint' }, e.message)); }
    });
    list.appendChild(it);
  });
  restoreBtn.addEventListener('click', async () => {
    if (!picked) return;
    if (!await confirmDialog({ title: 'Gendan versionen?', text: `Dokumentet sættes tilbage til ${when(picked.createdAt)}. Den nuværende udgave gemmes i historikken, så du kan fortryde.`, confirmLabel: 'Gendan' })) return;
    try {
      await saver.flush();
      saver.stop?.();
      await restoreVersion(doc.id, picked.id);
      m.close();
      toast('Versionen er gendannet', { type: 'ok' });
      setTimeout(() => location.reload(), 300);
    } catch (e) { errorToast(e, 'Kunne ikke gendanne'); }
  });
  const m = modal({ title: 'Versionshistorik', label: doc.title, size: 980, body: h('div', { class: 'vh-body' }, list, pane),
    actions: [h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, 'Luk'), restoreBtn] });
}

export function editorFrame(doc, ctx, { getData, onPrint, exportMenu = [], extraActions = [] }) {
  const K = KINDS[doc.kind];
  const title = h('input', { class: 'ofx-title', value: doc.title, maxlength: 160, 'aria-label': 'Titel', spellcheck: 'false' });
  const state = h('span', { class: 'ofx-state', 'aria-live': 'polite' }, icon('checkCircle'), 'Gemt');
  const setState = (s, err) => {
    state.dataset.s = s;
    const t = { saving: ['refresh', 'Gemmer…'], saved: ['checkCircle', 'Gemt på din konto'], dirty: ['edit', 'Ændringer…'], error: ['alert', 'Ikke gemt – prøver igen'] }[s] || ['checkCircle', 'Gemt'];
    h(clear(state), null, icon(t[0]), t[1]);
    if (s === 'error' && err?.status === 413) toast('Dokumentet er for stort', { type: 'bad', text: 'Fjern nogle billeder, eller del det op i flere dokumenter.' });
  };
  const saver = autosaver(doc.id, () => ({ title: title.value.trim() || doc.title, ...getData() }), setState);
  title.addEventListener('input', () => saver.touch());
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });

  let starred = !!doc.starred;
  const star = h('button', { type: 'button', class: 'ofx-icon', 'aria-pressed': String(starred), title: 'Stjernemarkér', 'aria-label': 'Stjernemarkér', html: svg(starred ? 'starFill' : 'star') });
  star.addEventListener('click', async () => {
    starred = !starred;
    star.innerHTML = svg(starred ? 'starFill' : 'star'); star.setAttribute('aria-pressed', String(starred));
    try { await updateDoc(doc.id, { starred }); } catch (e) { errorToast(e, 'Kunne ikke gemme'); }
  });
  const exportBtn = h('button', { type: 'button', class: 'btn btn-sm ofx-export' }, icon('download'), h('span', { class: 'hide-sm' }, 'Hent / udskriv'));
  exportBtn.addEventListener('click', () => popMenu(exportBtn, exportMenu));
  const more = h('button', { type: 'button', class: 'ofx-icon', title: 'Flere handlinger', 'aria-label': 'Flere handlinger', html: svg('more') });
  more.addEventListener('click', () => popMenu(more, [
    ['Udskriv', 'download', () => onPrint?.()],
    ['Versionshistorik', 'clock', () => versionsDialog(doc, saver)],
    ['Lav en opgave om filen', 'kanban', () => taskForDoc(doc, title.value.trim() || doc.title)],
    ['Lav en kopi', 'copy', async () => { await saver.flush(); try { const d = await duplicateDoc(doc.id); toast('Kopi oprettet', { type: 'ok', text: d.title }); navigate(docHref(d).slice(1)); } catch (e) { errorToast(e, 'Kunne ikke kopiere'); } }],
    'sep',
    ['Flyt til papirkurv', 'trash', async () => {
      if (!await confirmDialog({ title: 'Flyt til papirkurv?', text: `“${title.value}” kan gendannes fra papirkurven i HUBTECH Office.`, confirmLabel: 'Flyt', danger: true })) return;
      await saver.flush();
      try { await updateDoc(doc.id, { trashed: true }); toast('Flyttet til papirkurven', { text: title.value }); navigate('/apps/hubtech'); } catch (e) { errorToast(e, 'Kunne ikke flytte'); }
    }, { danger: true }],
  ]));

  const toolbar = h('div', { class: 'ofx-tools', role: 'toolbar', 'aria-label': 'Formatering' });
  const body = h('div', { class: 'ofx-body' });
  const status = h('div', { class: 'ofx-status on-world' });
  const el = h('div', { class: ['page', 'ofx', `ofx-${doc.kind}`], style: { '--kind': K.hue } },
    h('header', { class: 'ofx-bar glass' },
      h('a', { class: 'icon-btn', href: '#/apps/hubtech', 'aria-label': 'Tilbage til HUBTECH Office', title: 'HUBTECH Office' }, icon('arrowLeft')),
      h('span', { class: 'ofx-kind', title: K.label }, icon(K.icon)),
      h('div', { class: 'ofx-titlewrap' }, title, h('div', { class: 'ofx-sub' }, h('span', null, `HUBTECH Office · ${K.label}`), state)),
      ...extraActions, star, exportBtn, more),
    toolbar, body, status);

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saver.flush().then(() => toast('Gemt', { type: 'ok', ms: 1200 })); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); onPrint?.(); }
  };
  const onUnload = (e) => { if (saver.dirty) { saver.flush(); e.preventDefault(); e.returnValue = ''; } };
  addEventListener('keydown', onKey);
  addEventListener('beforeunload', onUnload);
  return {
    el, toolbar, body, status, saver,
    title: () => title.value.trim() || doc.title,
    destroy() { removeEventListener('keydown', onKey); removeEventListener('beforeunload', onUnload); document.querySelector('.ofx-menu')?.remove(); return saver.stop(); },
  };
}
