/**
 * Notesbog – a ring binder in HUBTECH Office (like OneNote): notebooks with coloured sections, pages and subpages,
 * and a free page. Click anywhere to write, draw with the mouse, a pen or a finger, tick off to-dos, paste pictures,
 * make tables and put tags on things. Every open to-do in one list, search across all notebooks, Gnist sums up a page
 * and suggests tasks, to-dos go to Opgaver, and a page can be sent to a project. Saved on your account (state
 * 'notebook') like the other apps. The pure parts are tested in tests/apps.test.mjs.
 */
import { h, clear, svgEl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, modal, confirmDialog } from '../core/ui.js';
import { appState, loadError, uid } from '../features/appkit.js';
import { api } from '../core/api.js';

export const COLORS = ['#e8763a', '#6aa9e8', '#8fcf9b', '#d98ad6', '#e8b46a', '#e57b6a', '#7fc8c0', '#b9b1a4'];
export const TAGS = [
  { id: 'vigtigt', label: 'Vigtigt', icon: 'alert' },
  { id: 'spg', label: 'Spørgsmål', icon: 'help' },
  { id: 'ide', label: 'Idé', icon: 'sparkles' },
  { id: 'husk', label: 'Husk', icon: 'bell' },
];
export const PENS = [['ink', 'Sort/hvid'], ['orange', 'Orange'], ['blue', 'Blå'], ['green', 'Grøn'], ['red', 'Rød']];
const MAX_BYTES = 3.6 * 1024 * 1024;
const IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// ── the pure parts ──────────────────────────────────────────────────────────────────────────────────────────────
export const newPage = (title = '', now = Date.now(), level = 0) => ({ id: uid(), title, created: now, at: now, level, blocks: [], ink: [] });
export const newSection = (name, color = COLORS[1], now = Date.now()) => ({ id: uid(), name, color, pages: [newPage('', now)] });
export const newBook = (name, color = COLORS[0], now = Date.now()) => ({ id: uid(), name, color, sections: [newSection('Noter', COLORS[1], now)] });

/** The first notebook: a page that shows how it works. */
export function starter(now = Date.now()) {
  const p = newPage('Velkommen til Notesbogen', now);
  p.blocks = [
    { id: uid(), kind: 'text', x: 40, y: 20, w: 520, html: 'Klik hvor som helst på siden for at skrive – og træk i en tekst for at flytte den.<br>Vælg <b>Tegn</b> for at tegne med musen, en pen eller fingeren.' },
    { id: uid(), kind: 'todo', x: 40, y: 130, w: 380, items: [
      { id: uid(), text: 'Lav en sektion til dit næste projekt', done: false },
      { id: uid(), text: 'Prøv Tegn og Viskelæder', done: false },
      { id: uid(), text: 'Bed Gnist opsummere siden', done: false, tag: 'ide' }] },
  ];
  const book = { id: uid(), name: 'Min notesbog', color: COLORS[0], sections: [{ id: uid(), name: 'Kom i gang', color: COLORS[0], pages: [p] }] };
  return { v: 1, books: [book], open: { book: book.id, section: book.sections[0].id, page: p.id } };
}

/** Makes sure what came from the server has the right shape (and that the open page exists). */
export function migrate(d) {
  if (!d || !Array.isArray(d.books) || !d.books.length) return starter();
  for (const b of d.books) {
    b.sections = Array.isArray(b.sections) && b.sections.length ? b.sections : [newSection('Noter')];
    for (const s of b.sections) {
      s.pages = Array.isArray(s.pages) && s.pages.length ? s.pages : [newPage('')];
      for (const p of s.pages) { p.blocks = Array.isArray(p.blocks) ? p.blocks : []; p.ink = Array.isArray(p.ink) ? p.ink : []; p.level = p.level ? 1 : 0; }
    }
  }
  const o = d.open || {};
  const book = d.books.find(b => b.id === o.book) || d.books[0];
  const sec = book.sections.find(s => s.id === o.section) || book.sections[0];
  const page = sec.pages.find(p => p.id === o.page) || sec.pages[0];
  d.open = { book: book.id, section: sec.id, page: page.id };
  return d;
}

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** The words in a text box (its HTML without tags). */
export function htmlText(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<(ul|ol)[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}• /g, '\n• ').replace(/\n{3,}/g, '\n\n').trim();
}
export function blockText(b) {
  if (b.kind === 'text') return htmlText(b.html);
  if (b.kind === 'todo') return (b.items || []).filter(i => i.text.trim()).map(i => `[${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
  if (b.kind === 'table') return (b.rows || []).map(r => r.join(' | ')).join('\n');
  if (b.kind === 'image') return b.caption ? `(billede: ${b.caption})` : '(billede)';
  return '';
}
const inOrder = (blocks) => [...blocks].sort((a, b) => (a.y - b.y) || (a.x - b.x));
export const pageText = (p) => [p.title, ...inOrder(p.blocks || []).map(blockText)].filter(Boolean).join('\n\n');

/** The page as Markdown – for a project, the clipboard or a file. */
export function pageMarkdown(p) {
  const tag = (t) => (t ? ` (${TAGS.find(x => x.id === t)?.label || t})` : '');
  const out = [`# ${p.title || 'Uden titel'}`];
  for (const b of inOrder(p.blocks || [])) {
    if (b.kind === 'text') out.push(htmlText(String(b.html || '').replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '_$2_').replace(/<li[^>]*>/gi, '- ')) + tag(b.tag));
    else if (b.kind === 'todo') out.push((b.items || []).filter(i => i.text.trim()).map(i => `- [${i.done ? 'x' : ' '}] ${i.text}${tag(i.tag)}`).join('\n'));
    else if (b.kind === 'table' && b.rows?.length) out.push([`| ${b.rows[0].join(' | ')} |`, `|${b.rows[0].map(() => '---').join('|')}|`, ...b.rows.slice(1).map(r => `| ${r.join(' | ')} |`)].join('\n'));
    else if (b.kind === 'image') out.push(`_(billede${b.caption ? `: ${b.caption}` : ''})_`);
  }
  if (p.ink?.length) out.push('_(tegning)_');
  return out.filter(Boolean).join('\n\n');
}

const snippet = (t, i, len) => { const a = Math.max(0, i - 40), z = Math.min(t.length, i + len + 70); return `${a ? '…' : ''}${t.slice(a, z).replace(/\s+/g, ' ')}${z < t.length ? '…' : ''}`; };
/** Every page that has the words – the title first. */
export function searchNotes(data, q) {
  const n = String(q || '').trim().toLowerCase();
  if (!n) return [];
  const hits = [];
  for (const book of data.books) for (const section of book.sections) for (const page of section.pages) {
    const text = pageText(page), i = text.toLowerCase().indexOf(n), inTitle = (page.title || '').toLowerCase().includes(n);
    if (inTitle || i > -1) hits.push({ book, section, page, score: inTitle ? 2 : 1, snippet: i > -1 ? snippet(text, i, n.length) : '' });
  }
  return hits.sort((a, b) => b.score - a.score || (b.page.at || 0) - (a.page.at || 0));
}

/** Every to-do that isn't done yet, in all notebooks. */
export function allTodos(data) {
  const out = [];
  for (const book of data.books) for (const section of book.sections) for (const page of section.pages) for (const block of page.blocks || []) {
    if (block.kind === 'todo') for (const item of block.items || []) if (!item.done && item.text.trim()) out.push({ book, section, page, block, item });
  }
  return out;
}

// ink: a stroke is { c: pen, w: width, hl: highlighter?, p: [x0, y0, x1, y1 …] }
const r1 = (v) => Math.round(v * 10) / 10;
export function simplify(p, tol = 1.5) {
  if (p.length <= 4) return p.map(r1);
  const out = [p[0], p[1]];
  for (let i = 2; i < p.length - 2; i += 2) { const dx = p[i] - out.at(-2), dy = p[i + 1] - out.at(-1); if (dx * dx + dy * dy >= tol * tol) out.push(p[i], p[i + 1]); }
  out.push(p.at(-2), p.at(-1));
  return out.map(r1);
}
export function strokePath(p) {
  if (p.length < 2) return '';
  if (p.length < 6) return `M${p[0]} ${p[1]}L${p.at(-2) + 0.01} ${p.at(-1)}`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${r1((p[i] + p[i + 2]) / 2)} ${r1((p[i + 1] + p[i + 3]) / 2)}`;
  return `${d}L${p.at(-2)} ${p.at(-1)}`;
}
export function hitStroke(s, x, y, r = 10) {
  for (let i = 0; i < s.p.length; i += 2) { const dx = s.p[i] - x, dy = s.p[i + 1] - y; if (dx * dx + dy * dy <= r * r) return true; }
  return false;
}
/** How far down the page has something on it. */
export function bottomOf(page) {
  let y = 0;
  for (const b of page.blocks || []) y = Math.max(y, b.y + (b.h || 90));
  for (const s of page.ink || []) for (let i = 1; i < s.p.length; i += 2) y = Math.max(y, s.p[i]);
  return y;
}

// ── in the browser ──────────────────────────────────────────────────────────────────────────────────────────────
const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN', 'CODE', 'MARK', 'H3']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'MATH', 'LINK', 'META', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO', 'CANVAS']);
/** Only plain formatting survives (bold, italic, lists …) – no attributes, no scripts, no pictures. */
export function cleanHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '').slice(0, 60000);
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) continue;
      if (ch.nodeType !== 1 || DROP.has(ch.tagName)) { ch.remove(); continue; }
      walk(ch);
      if (OK.has(ch.tagName)) for (const a of [...ch.attributes]) ch.removeAttribute(a.name);
      else ch.replaceWith(...ch.childNodes);
    }
  };
  walk(t.content);
  return t.innerHTML.slice(0, 20000);
}

async function shrink(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = h('canvas', { width: Math.max(1, Math.round(bmp.width * k)), height: Math.max(1, Math.round(bmp.height * k)) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let src = c.toDataURL('image/webp', 0.82);
  if (!src.startsWith('data:image/webp')) src = c.toDataURL('image/jpeg', 0.82);
  return { src, w: c.width, h: c.height };
}

function askText(title, value = '', hint = '') {
  return new Promise((resolve) => {
    const inp = h('input', { class: 'input', value, 'aria-label': title, maxlength: 80 });
    let done = false, m;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(inp.value.trim()); } });
    m = modal({ title, size: 420, body: h('div', { class: 'stack', style: { gap: '8px' } }, inp, hint ? h('p', { class: 'faint', style: { margin: 0 } }, hint) : null),
      actions: [h('button', { type: 'button', class: 'btn', onclick: () => finish('') }, 'Annuller'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => finish(inp.value.trim()) }, 'OK')],
      onClose: () => finish('') });
    requestAnimationFrame(() => { inp.focus(); inp.select(); });
  });
}

/** A small menu next to a button: [{ label, icon, run, danger, colors }]. */
function popMenu(anchor, items, label) {
  document.querySelector('.nb-menu')?.remove();
  const box = h('div', { class: 'menu glass glass-strong nb-menu', role: 'menu', 'aria-label': label });
  const close = () => { box.remove(); removeEventListener('pointerdown', out, true); removeEventListener('keydown', key, true); anchor.focus?.(); };
  const out = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  for (const it of items) {
    if (it.colors) {
      h(box, null, h('div', { class: 'nb-swatches', role: 'group', 'aria-label': it.label }, COLORS.map(c => h('button', { type: 'button', class: ['nb-swatch', c === it.current && 'is-on'], style: { background: c }, 'aria-label': `Farve ${c}`, 'aria-pressed': String(c === it.current), onclick: () => { close(); it.run(c); } }))));
    } else h(box, null, h('button', { type: 'button', role: 'menuitem', class: ['menu-item', it.danger && 'is-danger'], disabled: it.disabled, onclick: () => { close(); it.run(); } }, icon(it.icon), it.label));
  }
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  Object.assign(box.style, { position: 'fixed', left: `${Math.min(innerWidth - box.offsetWidth - 8, r.left)}px`, top: `${Math.min(innerHeight - box.offsetHeight - 8, r.bottom + 6)}px`, right: 'auto', zIndex: 90 });
  addEventListener('pointerdown', out, true); addEventListener('keydown', key, true);
  box.querySelector('button:not([disabled])')?.focus();
}

let S = null;
export default {
  title: 'Notesbog',
  destroy() { if (!S) return; S.st.flush(); S.off.forEach(f => f()); S = null; },
  async render() {
    let st;
    try { st = await appState('notebook', {}); } catch (e) { return loadError('Notesbogen', e); }
    const fresh = migrate(st.data);
    if (fresh !== st.data) { for (const k of Object.keys(st.data)) delete st.data[k]; Object.assign(st.data, fresh); st.save(); }
    const d = st.data;
    S = { st, view: 'page', q: '', tool: 'text', pen: 'ink', focus: null, lastPoint: null, mob: 'list', off: [] };

    const root = h('div', { class: 'nb' });
    const nav = h('aside', { class: 'nb-nav', 'aria-label': 'Notesbøger og sektioner' });
    const list = h('section', { class: 'nb-list', 'aria-label': 'Sider' });
    const main = h('section', { class: 'nb-main', 'aria-label': 'Siden' });
    const status = h('span', { class: 'nb-status faint', 'aria-live': 'polite' }, 'Gemt');
    h(root, null, nav, list, main);

    const book = () => d.books.find(b => b.id === d.open.book);
    const section = () => book().sections.find(s => s.id === d.open.section);
    const page = () => section().pages.find(p => p.id === d.open.page);
    let saveT = 0;
    const touch = (p = page()) => {
      if (p) p.at = Date.now();
      status.textContent = 'Gemmer …'; st.save();
      clearTimeout(saveT); saveT = setTimeout(() => { status.textContent = 'Gemt'; }, 800);
    };
    const when = (t) => new Date(t).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
    const openPage = (b, s, p) => { d.open = { book: b.id, section: s.id, page: p.id }; S.view = 'page'; S.mob = 'page'; st.save(); drawAll(); };

    // ── left: search, the notebook's sections, the other notebooks, all to-dos ──
    const search = h('input', { class: 'input nb-search-in', type: 'search', placeholder: 'Søg i alle notesbøger', 'aria-label': 'Søg i alle notesbøger', autocomplete: 'off' });
    search.addEventListener('input', () => { S.q = search.value; S.view = S.q.trim() ? 'search' : 'page'; drawList(); });
    async function addSection() {
      const name = await askText('Ny sektion', '', 'Fx Netværk, Møder med kunden eller Indkøb.');
      if (!name) return;
      const s = newSection(name, COLORS[book().sections.length % COLORS.length]);
      book().sections.push(s); d.open.section = s.id; d.open.page = s.pages[0].id; S.view = 'page'; touch(null); drawAll();
    }
    async function addBook() {
      const name = await askText('Ny notesbog', '', 'Fx Arbejde, Linux-noter eller Kursus.');
      if (!name) return;
      const b = newBook(name, COLORS[d.books.length % COLORS.length]);
      d.books.push(b); d.open = { book: b.id, section: b.sections[0].id, page: b.sections[0].pages[0].id }; S.view = 'page'; touch(null); drawAll();
    }
    const sectionMenu = (s, btn) => popMenu(btn, [
      { label: 'Omdøb', icon: 'edit', run: async () => { const n = await askText('Omdøb sektionen', s.name); if (n) { s.name = n; touch(null); drawAll(); } } },
      { label: 'Farve', colors: true, current: s.color, run: (c) => { s.color = c; touch(null); drawAll(); } },
      { label: 'Slet sektionen', icon: 'trash', danger: true, disabled: book().sections.length < 2, run: async () => {
        if (!await confirmDialog({ title: `Slet “${s.name}”?`, text: `Sektionen og dens ${s.pages.length} ${s.pages.length === 1 ? 'side' : 'sider'} slettes.`, confirmLabel: 'Slet', danger: true })) return;
        book().sections = book().sections.filter(x => x !== s); d.open.section = book().sections[0].id; d.open.page = book().sections[0].pages[0].id; touch(null); drawAll(); } },
    ], `Sektionen ${s.name}`);
    const bookMenu = (b, btn) => popMenu(btn, [
      { label: 'Omdøb', icon: 'edit', run: async () => { const n = await askText('Omdøb notesbogen', b.name); if (n) { b.name = n; touch(null); drawAll(); } } },
      { label: 'Farve', colors: true, current: b.color, run: (c) => { b.color = c; touch(null); drawAll(); } },
      { label: 'Slet notesbogen', icon: 'trash', danger: true, disabled: d.books.length < 2, run: async () => {
        if (!await confirmDialog({ title: `Slet “${b.name}”?`, text: 'Hele notesbogen med alle sektioner og sider slettes.', confirmLabel: 'Slet', danger: true })) return;
        d.books = d.books.filter(x => x !== b); d.open = migrate({ books: d.books }).open; touch(null); drawAll(); } },
    ], `Notesbogen ${b.name}`);

    function drawNav() {
      const b = book(), todos = allTodos(d).length;
      h(clear(nav), null,
        h('div', { class: 'nb-search' }, icon('search'), search),
        h('div', { class: 'nb-book-h' }, h('span', { class: 'nb-dot', style: { background: b.color } }), h('b', null, b.name),
          h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Mere om notesbogen ${b.name}`, onclick: (e) => bookMenu(b, e.currentTarget) }, icon('more'))),
        h('h3', { class: 'nb-h' }, 'Sektioner'),
        h('ul', { class: 'nb-secs', role: 'list' }, b.sections.map(s => h('li', { class: 'nb-sec-li' },
          h('button', { type: 'button', class: ['nb-sec', s.id === d.open.section && S.view === 'page' && 'is-on'], style: { '--sec': s.color }, 'aria-current': s.id === d.open.section ? 'true' : null,
            onclick: () => { d.open.section = s.id; d.open.page = s.pages[0].id; S.view = 'page'; search.value = ''; S.q = ''; st.save(); drawAll(); } },
            h('span', { class: 'nb-sec-bar', 'aria-hidden': 'true' }), h('span', { class: 'nb-sec-n' }, s.name), h('small', { class: 'faint' }, String(s.pages.length))),
          h('button', { type: 'button', class: 'icon-btn btn-sm nb-more', 'aria-label': `Mere om sektionen ${s.name}`, onclick: (e) => sectionMenu(s, e.currentTarget) }, icon('more'))))),
        h('button', { type: 'button', class: 'nb-add', onclick: addSection }, icon('plus'), 'Ny sektion'),
        h('h3', { class: 'nb-h' }, 'Mine notesbøger'),
        h('ul', { class: 'nb-books', role: 'list' }, d.books.map(x => h('li', null, h('button', { type: 'button', class: ['nb-bk', x.id === b.id && 'is-on'], onclick: () => { d.open = migrate({ books: d.books, open: { book: x.id } }).open; S.view = 'page'; st.save(); drawAll(); } },
          h('span', { class: 'nb-dot', style: { background: x.color } }), h('span', null, x.name))))),
        h('button', { type: 'button', class: 'nb-add', onclick: addBook }, icon('plus'), 'Ny notesbog'),
        h('button', { type: 'button', class: ['nb-todos-btn', S.view === 'todos' && 'is-on'], onclick: () => { S.view = 'todos'; S.mob = 'list'; drawAll(); } },
          icon('checkCircle'), h('span', null, 'Åbne punkter'), h('b', { class: 'nb-count' }, String(todos))));
    }

    // ── middle: the section's pages – or all to-dos, or what the search found ──
    const addPage = (level = 0) => {
      const s = section(), at = s.pages.findIndex(p => p.id === d.open.page);
      const p = newPage('', Date.now(), level);
      // a subpage goes right under the page you're on (after its other subpages)
      let i = at + 1; if (level) while (i < s.pages.length && s.pages[i].level) i++;
      s.pages.splice(level ? i : s.pages.length, 0, p);
      d.open.page = p.id; S.view = 'page'; S.mob = 'page'; touch(p); drawAll();
      main.querySelector('.nb-title')?.focus();
    };
    const pageMenu = (p, btn) => {
      const s = section(), i = s.pages.indexOf(p);
      popMenu(btn, [
        { label: p.level ? 'Gør til side' : 'Gør til underside', icon: p.level ? 'outdent' : 'indent', disabled: !p.level && i === 0, run: () => { p.level = p.level ? 0 : 1; touch(null); drawList(); } },
        { label: 'Flyt op', icon: 'arrowUp', disabled: i === 0, run: () => { [s.pages[i - 1], s.pages[i]] = [s.pages[i], s.pages[i - 1]]; touch(null); drawList(); } },
        { label: 'Flyt ned', icon: 'arrowDown', disabled: i === s.pages.length - 1, run: () => { [s.pages[i + 1], s.pages[i]] = [s.pages[i], s.pages[i + 1]]; touch(null); drawList(); } },
        { label: 'Slet siden', icon: 'trash', danger: true, run: () => deletePage(p) },
      ], `Siden ${p.title || 'Uden titel'}`);
    };
    async function deletePage(p) {
      if ((p.blocks.length || p.ink.length) && !await confirmDialog({ title: `Slet “${p.title || 'Uden titel'}”?`, text: 'Siden og alt på den slettes.', confirmLabel: 'Slet', danger: true })) return;
      const s = section();
      s.pages = s.pages.filter(x => x !== p);
      if (!s.pages.length) s.pages.push(newPage(''));
      if (d.open.page === p.id) d.open.page = s.pages[0].id;
      touch(null); drawAll();
    }
    function drawList() {
      if (S.view === 'todos') {
        const todos = allTodos(d);
        h(clear(list), null,
          h('div', { class: 'nb-list-h' }, h('h2', null, 'Åbne punkter'), todos.length ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => toTasks(todos.map(t => t.item), 'notesbogen') }, icon('kanban'), 'Send til Opgaver') : null),
          todos.length ? h('ul', { class: 'nb-todo-all', role: 'list' }, todos.map(t => h('li', null,
            h('input', { type: 'checkbox', 'aria-label': `Færdig: ${t.item.text}`, onchange: () => { t.item.done = true; touch(t.page); drawList(); drawNav(); if (t.page.id === d.open.page) drawPage(); } }),
            h('span', { class: 'nb-ta' }, h('span', null, t.item.text), t.item.tag ? tagChip(t.item.tag) : null,
              h('button', { type: 'button', class: 'nb-path', onclick: () => openPage(t.book, t.section, t.page) }, `${t.book.name} › ${t.section.name} › ${t.page.title || 'Uden titel'}`)))))
            : h('p', { class: 'faint nb-empty' }, 'Ingen åbne punkter. Godt gået!'));
        return;
      }
      if (S.view === 'search') {
        const hits = searchNotes(d, S.q);
        h(clear(list), null, h('div', { class: 'nb-list-h' }, h('h2', null, `${hits.length} ${hits.length === 1 ? 'side' : 'sider'}`)),
          hits.length ? h('ul', { class: 'nb-pages', role: 'list' }, hits.map(x => h('li', null, h('button', { type: 'button', class: 'nb-pg is-hit', onclick: () => openPage(x.book, x.section, x.page) },
            h('b', null, x.page.title || 'Uden titel'), h('small', { class: 'faint' }, `${x.book.name} › ${x.section.name}`), x.snippet ? h('span', { class: 'nb-snip' }, x.snippet) : null))))
            : h('p', { class: 'faint nb-empty' }, `Ingen sider med “${S.q.trim()}”.`));
        return;
      }
      const s = section();
      h(clear(list), null,
        h('div', { class: 'nb-list-h', style: { '--sec': s.color } }, h('span', { class: 'nb-sec-bar', 'aria-hidden': 'true' }), h('h2', null, s.name),
          h('button', { type: 'button', class: 'btn btn-sm nb-newpage', onclick: () => addPage(0) }, icon('plus'), 'Side')),
        h('ul', { class: 'nb-pages', role: 'list' }, s.pages.map(p => h('li', { class: ['nb-pg-li', p.level && 'is-sub'] },
          h('button', { type: 'button', class: ['nb-pg', p.id === d.open.page && 'is-on'], 'aria-current': p.id === d.open.page ? 'page' : null, onclick: () => { d.open.page = p.id; S.mob = 'page'; st.save(); drawList(); drawPage(); } },
            h('b', null, p.title || 'Uden titel'), h('small', { class: 'faint' }, p.level ? 'Underside' : when(p.at || p.created))),
          h('button', { type: 'button', class: 'icon-btn btn-sm nb-more', 'aria-label': `Mere om siden ${p.title || 'Uden titel'}`, onclick: (e) => pageMenu(p, e.currentTarget) }, icon('more'))))),
        h('button', { type: 'button', class: 'nb-add', onclick: () => addPage(1) }, icon('indent'), 'Underside'));
    }
    const tagChip = (id) => { const t = TAGS.find(x => x.id === id); return t ? h('span', { class: `nb-tag is-${t.id}` }, icon(t.icon), t.label) : null; };

    async function toTasks(items, from) {
      const { getState, saveState, flushState } = await import('../core/services.js');
      const ts = (await getState('tasks', { force: true })) || { tasks: [] };
      ts.tasks = Array.isArray(ts.tasks) ? ts.tasks : [];
      const now = Date.now(), have = new Set(ts.tasks.filter(t => t.status !== 'done').map(t => String(t.title).toLowerCase()));
      const add = items.filter(it => it.text.trim() && !have.has(it.text.trim().toLowerCase()));
      add.forEach((it, i) => ts.tasks.unshift({ id: now.toString(36) + i + Math.random().toString(36).slice(2, 6), title: it.text.trim().slice(0, 200), notes: `Fra ${from}`, status: 'todo', prio: it.tag === 'vigtigt' ? 'high' : 'med', due: null, project: null, remind: 'none', created: now, updated: now }));
      saveState('tasks', ts); flushState('tasks');
      toast(add.length ? `${add.length} ${add.length === 1 ? 'opgave' : 'opgaver'} lagt i Opgaver` : 'De står allerede i Opgaver', { type: 'ok', action: { label: 'Åbn Opgaver', onClick: () => { location.hash = '#/apps/tasks'; } } });
    }

    // ── right: the page itself ──
    const canvas = h('div', { class: 'nb-canvas' });
    const ink = svgEl('svg', { class: 'nb-ink', 'aria-hidden': 'true' });
    const paper = h('div', { class: 'nb-paper' });
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => { const f = fileIn.files?.[0]; fileIn.value = ''; if (f) { grow(); addImage(f, spot()); } } });

    const spot = () => ({ x: 40, y: Math.round(bottomOf(page()) + 24) });
    function grow() {
      const p = page(); if (!p) return;
      for (const el of canvas.querySelectorAll('.nb-block')) { const b = p.blocks.find(x => x.id === el.dataset.id); if (b) b.h = el.offsetHeight; }
      const hgt = Math.max(760, Math.round(bottomOf(p) + 360));
      canvas.style.height = `${hgt}px`; ink.setAttribute('height', String(hgt)); ink.setAttribute('width', String(canvas.clientWidth || 900));
    }
    const drawInk = () => { const p = page(); h(clear(ink), null); for (const s of p.ink) ink.append(strokeEl(s)); };
    const strokeEl = (s) => svgEl('path', { d: strokePath(s.p), class: ['nb-stroke', s.hl && 'is-hl'], style: `--pen: var(--pen-${PENS.some(([k]) => k === s.c) || s.c === 'yellow' ? s.c : 'ink'})`, 'stroke-width': String(s.w || 2.5) });

    function addBlock(b, focus = true) {
      page().blocks.push(b);
      const el = blockEl(b); canvas.append(el); grow(); touch();
      if (focus) requestAnimationFrame(() => (el.querySelector('[contenteditable]') || el.querySelector('.nb-grip'))?.focus());
      el.scrollIntoView?.({ block: 'nearest' });
      return el;
    }
    async function addImage(file, at) {
      if (!/^image\//.test(file.type)) return;
      if (JSON.stringify(d).length > MAX_BYTES) { toast('Der er ikke plads til flere billeder', { type: 'warn', text: 'Slet nogle billeder i notesbøgerne først.' }); return; }
      try { const x = await shrink(file); addBlock({ id: uid(), kind: 'image', x: at.x, y: at.y, w: Math.min(480, x.w), src: x.src, caption: '' }, false); }
      catch { toast('Billedet kunne ikke læses', { type: 'bad' }); }
    }
    const removeBlock = (b, el) => { const p = page(); p.blocks = p.blocks.filter(x => x !== b); el.remove(); touch(); grow(); };

    function blockEl(b) {
      const el = h('div', { class: ['nb-block', `nb-${b.kind}`], dataset: { id: b.id }, style: { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px` } });
      el.addEventListener('focusin', (e) => { S.focus = { block: b.id, item: e.target.closest('[data-item]')?.dataset.item || null }; });
      const grip = h('button', { type: 'button', class: 'nb-grip', 'aria-label': 'Flyt – træk, eller brug piletasterne', title: 'Flyt' }, icon('drag'));
      const extra = [];
      let body;
      if (b.kind === 'text') {
        body = h('div', { class: 'nb-text-ed', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Tekst', spellcheck: 'true' });
        body.innerHTML = cleanHtml(b.html);
        body.addEventListener('input', () => { b.html = cleanHtml(body.innerHTML); touch(); grow(); });
        body.addEventListener('paste', (e) => {
          const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
          e.preventDefault();
          if (f) { addImage(f, { x: b.x, y: b.y + el.offsetHeight + 16 }); return; }
          document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '');
        });
        body.addEventListener('focusout', () => setTimeout(() => { if (!el.contains(document.activeElement) && !htmlText(b.html) && !b.tag && page()?.blocks.includes(b)) removeBlock(b, el); }, 0));
      } else if (b.kind === 'todo') {
        body = h('ul', { class: 'nb-todo-list', role: 'list' });
        const draw = (focusId, atEnd) => {
          h(clear(body), null, b.items.map((it, i) => {
            const txt = h('span', { class: 'nb-todo-t', contenteditable: 'plaintext-only', role: 'textbox', 'aria-label': `Punkt ${i + 1}`, dataset: { item: it.id } }, it.text);
            txt.addEventListener('input', () => { it.text = txt.textContent.slice(0, 500); touch(); });
            txt.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') { e.preventDefault(); const n = { id: uid(), text: '', done: false }; b.items.splice(i + 1, 0, n); touch(); draw(n.id); grow(); }
              else if (e.key === 'Backspace' && !txt.textContent && b.items.length > 1) { e.preventDefault(); b.items.splice(i, 1); touch(); draw(b.items[Math.max(0, i - 1)].id, true); grow(); }
            });
            return h('li', { class: it.done ? 'is-done' : null, dataset: { item: it.id } },
              h('input', { type: 'checkbox', checked: it.done, 'aria-label': `Færdig: ${it.text || `punkt ${i + 1}`}`, onchange: (e) => { it.done = e.target.checked; touch(); draw(); drawNav(); } }),
              txt, it.tag ? tagChip(it.tag) : null);
          }));
          if (focusId) { const t = body.querySelector(`[data-item="${focusId}"].nb-todo-t`); if (t) { t.focus(); if (atEnd) { const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); } } }
        };
        draw();
        extra.push(h('button', { type: 'button', class: 'nb-bbtn', title: 'Send de åbne punkter til Opgaver', 'aria-label': 'Send de åbne punkter til Opgaver', onclick: () => toTasks(b.items.filter(x => !x.done), `notesbogen: “${page().title || 'Uden titel'}”`) }, icon('kanban')));
      } else if (b.kind === 'table') {
        body = h('table', { class: 'nb-table' });
        const draw = () => h(clear(body), null, h('tbody', null, b.rows.map((row, r) => h('tr', null, row.map((v, c) => {
          const td = h('td', { contenteditable: 'plaintext-only', 'aria-label': `Række ${r + 1}, kolonne ${c + 1}` }, v);
          td.addEventListener('input', () => { b.rows[r][c] = td.textContent.slice(0, 500); touch(); grow(); });
          return td;
        })))));
        draw();
        extra.push(h('button', { type: 'button', class: 'nb-bbtn', title: 'Tilføj en række', 'aria-label': 'Tilføj en række', onclick: () => { if (b.rows.length < 40) { b.rows.push(b.rows[0].map(() => '')); draw(); touch(); grow(); } } }, icon('rowPlus')),
          h('button', { type: 'button', class: 'nb-bbtn', title: 'Tilføj en kolonne', 'aria-label': 'Tilføj en kolonne', onclick: () => { if (b.rows[0].length < 10) { b.rows.forEach(r => r.push('')); draw(); touch(); grow(); } } }, icon('colPlus')));
      } else if (b.kind === 'image') {
        const cap = h('div', { class: 'nb-cap', contenteditable: 'plaintext-only', role: 'textbox', 'aria-label': 'Billedtekst', 'data-ph': 'Billedtekst …' }, b.caption || '');
        cap.addEventListener('input', () => { b.caption = cap.textContent.slice(0, 200); touch(); });
        body = h('figure', { class: 'nb-fig' }, IMG.test(b.src || '') ? h('img', { src: b.src, alt: b.caption || 'Billede', draggable: 'false', onload: grow }) : h('span', { class: 'faint' }, 'Billedet mangler'), cap);
      }
      const tag = b.tag ? tagChip(b.tag) : null;
      const del = h('button', { type: 'button', class: 'nb-bbtn', 'aria-label': 'Slet', title: 'Slet', onclick: () => removeBlock(b, el) }, icon('trash'));
      const rz = h('div', { class: 'nb-resize', 'aria-hidden': 'true' });
      h(el, null, h('div', { class: 'nb-bbar' }, grip, tag, h('span', { class: 'nb-grow' }), extra, del), body, rz);

      // move: drag the handle (or arrow keys on it); resize: drag the right edge
      const drag = (handle, onMove) => handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); handle.setPointerCapture(e.pointerId); el.classList.add('is-moving');
        const x0 = e.clientX, y0 = e.clientY, b0 = { x: b.x, y: b.y, w: b.w };
        const mv = (ev) => onMove(ev.clientX - x0, ev.clientY - y0, b0);
        const up = () => { el.classList.remove('is-moving'); handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); touch(); grow(); };
        handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
      });
      const place = () => { el.style.left = `${b.x}px`; el.style.top = `${b.y}px`; el.style.width = `${b.w}px`; };
      drag(grip, (dx, dy, b0) => { b.x = Math.max(0, Math.round(b0.x + dx)); b.y = Math.max(0, Math.round(b0.y + dy)); place(); });
      drag(rz, (dx, dy, b0) => { b.w = Math.max(140, Math.min((canvas.clientWidth || 1200) - b.x, Math.round(b0.w + dx))); place(); });
      grip.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 40 : 8, k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (k) { e.preventDefault(); b.x = Math.max(0, b.x + k[0]); b.y = Math.max(0, b.y + k[1]); place(); touch(); grow(); }
        else if (e.key === 'Delete') { e.preventDefault(); removeBlock(b, el); }
      });
      return el;
    }

    // click on the empty page to write; draw, highlight or erase with the pen tools
    let cur = null, curPath = null, erased = false;
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return [Math.max(0, r1(e.clientX - r.left)), Math.max(0, r1(e.clientY - r.top))]; };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const empty = e.target === canvas || e.target === ink || e.target.closest?.('.nb-ink');
      const [x, y] = pt(e);
      if (S.tool === 'text') {
        if (!empty) return;
        e.preventDefault();
        S.lastPoint = { x: Math.max(0, Math.round(x - 6)), y: Math.max(0, Math.round(y - 12)) };
        addBlock({ id: uid(), kind: 'text', ...S.lastPoint, w: 380, html: '' });
        return;
      }
      e.preventDefault(); canvas.setPointerCapture(e.pointerId);
      if (S.tool === 'eraser') { erased = eraseAt(x, y) || erased; return; }
      const hl = S.tool === 'hl';
      cur = { c: hl ? 'yellow' : S.pen, w: hl ? 16 : (e.pointerType === 'pen' ? 2 + 2 * (e.pressure || 0.5) : 2.6), hl, p: [x, y] };
      curPath = strokeEl(cur); ink.append(curPath);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (S.tool === 'eraser' && e.buttons & 1) { const [x, y] = pt(e); erased = eraseAt(x, y) || erased; return; }
      if (!cur) return;
      for (const ev of e.getCoalescedEvents?.() || [e]) cur.p.push(...pt(ev));
      curPath.setAttribute('d', strokePath(cur.p));
    });
    const endStroke = () => {
      if (erased) { erased = false; touch(); }
      if (!cur) return;
      cur.p = simplify(cur.p);
      if (cur.p.length >= 2) { page().ink.push(cur); curPath.setAttribute('d', strokePath(cur.p)); touch(); grow(); } else curPath.remove();
      cur = null; curPath = null;
    };
    canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke);
    function eraseAt(x, y) {
      const p = page(), before = p.ink.length;
      p.ink = p.ink.filter(s => !hitStroke(s, x, y, 10));
      if (p.ink.length !== before) { drawInk(); return true; }
      return false;
    }
    paper.addEventListener('paste', (e) => {
      if (e.target.closest?.('[contenteditable], input, textarea')) return;
      const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); addImage(f, S.lastPoint || spot()); }
    });

    // tags on the to-do item or the box you were last in
    function setTag(id) {
      const p = page(), b = p.blocks.find(x => x.id === S.focus?.block);
      if (!b) { toast('Klik først i en tekst eller et punkt', { type: 'info', ms: 2200 }); return; }
      const it = S.focus.item && b.kind === 'todo' ? b.items.find(x => x.id === S.focus.item) : null;
      const target = it || b;
      target.tag = target.tag === id || !id ? undefined : id;
      touch(); drawPage();
    }
    const fmt = (cmd, label, ic) => h('button', { type: 'button', class: 'nb-tool', 'aria-label': label, title: label, onmousedown: (e) => e.preventDefault(), onclick: () => document.execCommand(cmd) }, icon(ic));

    async function shareToProject() {
      let projects = [];
      try { projects = ((await api.get('/api/pj')).projects || []).filter(x => !x.archived); } catch { /* */ }
      if (!projects.length) { toast('Du har ingen projekter endnu', { type: 'info', text: 'Opret et under Projekter – så kan du sende sider dertil.' }); return; }
      const p = page(), md = pageMarkdown(p);
      let m;
      const send = async (pr) => {
        try {
          await api.post(`/api/pj/${pr.id}/msg`, { text: `📓 ${p.title || 'Uden titel'} – fra min notesbog`, code: { lang: 'markdown', text: md.slice(0, 12000) } });
          m.close(); toast(`Siden er sendt til ${pr.name}`, { type: 'ok', action: { label: 'Åbn projektet', onClick: () => { location.hash = `#/apps/projects/${pr.id}`; } } });
        } catch (e) { toast('Siden kunne ikke sendes', { type: 'bad', text: e.message }); }
      };
      m = modal({ title: 'Send siden til et projekt', size: 460, label: 'Notesbog',
        body: h('div', { class: 'stack', style: { gap: '8px' } }, h('p', { class: 'faint', style: { margin: 0 } }, 'Siden lægges i projektets samtale som tekst, så hele holdet kan læse den.'),
          h('ul', { class: 'nb-proj', role: 'list' }, projects.map(pr => h('li', null, h('button', { type: 'button', class: 'nb-pg', onclick: () => send(pr) }, h('b', null, pr.name), h('small', { class: 'faint' }, `${pr.members?.length || 1} med`)))))) });
    }
    const askGnist = () => {
      const text = pageText(page()).slice(0, 6000);
      if (!text.trim()) { toast('Siden er tom', { type: 'info', ms: 1800 }); return; }
      import('../ai/panel.js').then(m => m.askAssistant(`Her er en side fra min notesbog. Opsummér den kort i 3–5 punkter, og foreslå konkrete opgaver som handlinger, så jeg kan lægge dem i Opgaver.\n\n---\n${text}\n---`));
    };
    const pageMore = (btn) => popMenu(btn, [
      { label: 'Kopiér som tekst', icon: 'copy', run: async () => { try { await navigator.clipboard.writeText(pageMarkdown(page())); toast('Siden er kopieret', { type: 'ok', ms: 1400 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } } },
      { label: 'Hent som .md', icon: 'download', run: async () => { const { saveBlob } = await import('../core/files.js'); saveBlob(`${(page().title || 'side').replace(/[^\wæøåÆØÅ -]/g, '').trim() || 'side'}.md`, new Blob([pageMarkdown(page())], { type: 'text/markdown' })); } },
      { label: 'Slet alle tegninger', icon: 'eraser', disabled: !page().ink.length, run: () => { page().ink = []; drawInk(); touch(); } },
      { label: 'Slet siden', icon: 'trash', danger: true, run: () => deletePage(page()) },
    ], 'Mere om siden');

    function drawBar() {
      const tool = (id, label, ic) => h('button', { type: 'button', class: ['nb-tool', S.tool === id && 'is-on'], 'aria-pressed': String(S.tool === id), title: label, onclick: () => { S.tool = id; drawBar(); canvas.className = `nb-canvas is-${S.tool}`; } }, icon(ic), h('span', null, label));
      const insert = (kind, label, ic, make) => h('button', { type: 'button', class: 'nb-tool', title: label, onclick: () => { grow(); const at = spot(); addBlock({ id: uid(), kind, x: at.x, y: at.y, ...make() }); } }, icon(ic), h('span', null, label));
      return h('div', { class: 'nb-bar', role: 'toolbar', 'aria-label': 'Værktøjer' },
        h('button', { type: 'button', class: 'icon-btn nb-back', 'aria-label': 'Tilbage til siderne', onclick: () => { S.mob = 'list'; drawAll(); } }, icon('arrowLeft')),
        h('div', { class: 'nb-group', role: 'group', 'aria-label': 'Værktøj' }, tool('text', 'Tekst', 'edit'), tool('pen', 'Tegn', 'paint'), tool('hl', 'Overstreg', 'textColor'), tool('eraser', 'Viskelæder', 'eraser')),
        S.tool === 'pen' ? h('div', { class: 'nb-group nb-pens', role: 'group', 'aria-label': 'Farve' }, PENS.map(([k, l]) => h('button', { type: 'button', class: ['nb-pen', S.pen === k && 'is-on'], style: { '--pen': `var(--pen-${k})` }, 'aria-label': l, 'aria-pressed': String(S.pen === k), title: l, onclick: () => { S.pen = k; drawBarOnly(); } }))) : null,
        S.tool === 'text' ? h('div', { class: 'nb-group', role: 'group', 'aria-label': 'Format' }, fmt('bold', 'Fed (Ctrl+B)', 'bold'), fmt('italic', 'Kursiv (Ctrl+I)', 'italic'), fmt('underline', 'Understreg (Ctrl+U)', 'underline'), fmt('insertUnorderedList', 'Punktliste', 'list')) : null,
        h('div', { class: 'nb-group', role: 'group', 'aria-label': 'Indsæt' },
          insert('todo', 'Tjekliste', 'checkCircle', () => ({ w: 360, items: [{ id: uid(), text: '', done: false }] })),
          insert('table', 'Tabel', 'grid', () => ({ w: 420, rows: [['', '', ''], ['', '', ''], ['', '', '']] })),
          h('button', { type: 'button', class: 'nb-tool', title: 'Billede', onclick: () => fileIn.click() }, icon('image'), h('span', null, 'Billede')), fileIn,
          h('button', { type: 'button', class: 'nb-tool', title: 'Mærke', 'aria-haspopup': 'menu', onclick: (e) => popMenu(e.currentTarget, [...TAGS.map(t => ({ label: t.label, icon: t.icon, run: () => setTag(t.id) })), { label: 'Fjern mærke', icon: 'x', run: () => setTag(null) }], 'Mærke') }, icon('tag'), h('span', null, 'Mærke'))),
        h('span', { class: 'nb-grow' }),
        h('button', { type: 'button', class: 'btn btn-sm nb-gnist', onclick: askGnist }, icon('sparkles'), 'Opsummér · lav opgaver'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Send siden til et projekt', title: 'Send til et projekt', onclick: shareToProject }, icon('share')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mere om siden', title: 'Mere', onclick: (e) => pageMore(e.currentTarget) }, icon('more')));
    }
    let barEl = null;
    const drawBarOnly = () => { const nb = drawBar(); barEl?.replaceWith(nb); barEl = nb; };

    function drawPage() {
      const p = page();
      const title = h('input', { class: 'nb-title', value: p.title, placeholder: 'Uden titel', 'aria-label': 'Sidens titel', maxlength: 120 });
      let listT = 0;
      title.addEventListener('input', () => { p.title = title.value; touch(p); clearTimeout(listT); listT = setTimeout(drawList, 250); });
      title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); S.lastPoint = { x: 40, y: Math.round(bottomOf(p) + (p.blocks.length ? 24 : 16)) }; addBlock({ id: uid(), kind: 'text', ...S.lastPoint, w: 520, html: '' }); } });
      const date = new Date(p.created || Date.now());
      h(clear(canvas), null, ink);
      canvas.className = `nb-canvas is-${S.tool}`;
      drawInk();
      for (const b of p.blocks) canvas.append(blockEl(b));
      barEl = drawBar();
      h(clear(paper), null, h('div', { class: 'nb-sheet' },
        h('div', { class: 'nb-head' }, title, h('div', { class: 'nb-date faint' }, `${date.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`, status)),
        canvas));
      h(clear(main), null, barEl, paper);
      requestAnimationFrame(grow);
    }
    function drawAll() {
      root.classList.toggle('is-mob-page', S.mob === 'page');
      drawNav(); drawList(); drawPage();
    }
    drawAll();
    const onResize = () => grow();
    addEventListener('resize', onResize); S.off.push(() => removeEventListener('resize', onResize));

    const app = { hue: '#b07ad8' };
    return h('div', { class: 'page nb-page', style: { '--app': app.hue } }, root);
  },
};
