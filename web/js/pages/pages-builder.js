/**
 * Sidebygger – your own little web page: a picture, a few words, your links, pictures and a guestbook.
 * Built from blocks, with themes, and shared as a link that works for everyone – no account needed.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError, copy } from '../features/appkit.js';
import { sh, onShared, ago, emptyState, pubUrl, pickImages, lightbox, shareDialog } from '../features/shared.js';
import { mdInline } from '../features/sharedlogic.js';

const PAGE = 'pages';
export const THEMES = {
  nat: { name: 'Nat', bg: 'linear-gradient(160deg, #0f172a, #1e1b4b 60%, #312e81)', fg: '#f8fafc', card: 'rgba(255,255,255,.08)', accent: '#a5b4fc' },
  hav: { name: 'Hav', bg: 'linear-gradient(160deg, #083344, #0e7490 70%, #22d3ee)', fg: '#ecfeff', card: 'rgba(255,255,255,.12)', accent: '#67e8f9' },
  skov: { name: 'Skov', bg: 'linear-gradient(160deg, #052e16, #166534 70%, #4ade80)', fg: '#f0fdf4', card: 'rgba(255,255,255,.1)', accent: '#86efac' },
  solnedgang: { name: 'Solnedgang', bg: 'linear-gradient(160deg, #4c0519, #be123c 55%, #fb923c)', fg: '#fff7ed', card: 'rgba(255,255,255,.12)', accent: '#fed7aa' },
  papir: { name: 'Papir', bg: '#faf7f0', fg: '#1c1917', card: '#ffffff', accent: '#b45309' },
  neon: { name: 'Neon', bg: '#050505', fg: '#e5e5e5', card: '#111', accent: '#39ff14' },
};
const BLOCKS = { heading: 'Overskrift', text: 'Tekst', links: 'Links', image: 'Billede', gallery: 'Galleri', contact: 'Kontakt', divider: 'Streg' };
const BLOCK_ICON = { heading: 'edit', text: 'file', links: 'link', image: 'image', gallery: 'image', contact: 'mail', divider: 'minus' };
const safeUrl = (u) => { const s = String(u || '').trim(); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`; return ''; };
const inline = (t) => mdInline(t).map(p => p.t === 'b' ? h('strong', null, p.v) : p.t === 'i' ? h('em', null, p.v) : p.t === 'code' ? h('code', null, p.v) : p.t === 'link' ? h('a', { href: p.href, target: '_blank', rel: 'noopener nofollow' }, p.v) : p.t === 'wiki' ? p.v : p.v);

/** the page itself (also the preview in the editor) */
export function renderSite(data, { guestbook = null } = {}) {
  const th = THEMES[data.theme] || THEMES.nat;
  const imgs = (data.blocks || []).flatMap(b => b.type === 'image' ? [b.url] : b.type === 'gallery' ? b.urls || [] : []).filter(Boolean);
  const block = (b) => {
    if (b.type === 'heading') return h('h2', { class: 'pg-h' }, b.text || '');
    if (b.type === 'text') return h('p', { class: 'pg-text' }, inline(b.text || ''));
    if (b.type === 'divider') return h('hr', { class: 'pg-hr' });
    if (b.type === 'links') return h('div', { class: 'pg-links' }, (b.items || []).filter(l => l.label && safeUrl(l.url)).map(l => h('a', { class: 'pg-link', href: safeUrl(l.url), target: '_blank', rel: 'noopener nofollow' }, l.emoji ? h('span', { 'aria-hidden': 'true' }, l.emoji) : null, h('span', null, l.label))));
    if (b.type === 'image') return b.url ? h('figure', { class: 'pg-img' }, h('img', { src: b.url, alt: b.caption || '', loading: 'lazy', onclick: () => lightbox(imgs.map(url => ({ url })), imgs.indexOf(b.url)) }), b.caption ? h('figcaption', null, b.caption) : null) : null;
    if (b.type === 'gallery') return (b.urls || []).length ? h('div', { class: 'pg-gallery' }, b.urls.map(u => h('img', { src: u, alt: '', loading: 'lazy', onclick: () => lightbox(imgs.map(url => ({ url })), imgs.indexOf(u)) }))) : null;
    if (b.type === 'contact') return b.email ? h('a', { class: 'pg-link pg-contact', href: `mailto:${b.email}` }, icon('mail'), h('span', null, b.label || 'Skriv til mig')) : null;
    return null;
  };
  return h('div', { class: 'pg-site', style: { '--pg-bg': th.bg, '--pg-fg': th.fg, '--pg-card': th.card, '--pg-accent': th.accent } },
    h('div', { class: 'pg-inner' },
      data.avatar ? h('img', { class: 'pg-avatar', src: data.avatar, alt: '' }) : h('div', { class: 'pg-avatar pg-avatar-none' }, (data.name || '?').slice(0, 1).toUpperCase()),
      h('h1', { class: 'pg-name' }, data.name || 'Dit navn'),
      data.bio ? h('p', { class: 'pg-bio' }, data.bio) : null,
      (data.blocks || []).map(block),
      guestbook));
}

function guestbookView(entries, onWrite) {
  const list = entries.filter(e => e.kind === 'guestbook').slice().reverse();
  const name = h('input', { class: 'pg-in', maxlength: 60, placeholder: 'Dit navn', 'aria-label': 'Dit navn' });
  const text = h('textarea', { class: 'pg-in', rows: 2, maxlength: 600, placeholder: 'Skriv en hilsen …', 'aria-label': 'Hilsen' });
  const err = h('div', { class: 'pg-err' });
  return h('section', { class: 'pg-guest' }, h('h2', { class: 'pg-h' }, 'Gæstebog'),
    onWrite ? h('div', { class: 'pg-guest-form' }, name, text, err, h('button', { class: 'pg-btn', onclick: async (e) => {
      if (!text.value.trim()) return text.focus();
      e.currentTarget.disabled = true;
      try { await onWrite({ name: name.value.trim() || 'Gæst', text: text.value.trim() }); } catch (x) { err.textContent = x.message; e.currentTarget.disabled = false; }
    } }, 'Skriv i gæstebogen')) : null,
    list.length ? list.slice(0, 50).map(g => h('div', { class: 'pg-entry' }, h('b', null, g.data.name || g.guest || g.user?.name || 'Gæst'), h('span', { class: 'pg-when' }, ago(g.at)), h('p', null, g.data.text))) : h('p', { class: 'pg-when' }, 'Vær den første til at skrive en hilsen.'));
}

export async function publicView(data, token) {
  const { doc } = data;
  const wrap = h('div', { class: 'pg-pub' });
  const draw = (entries) => h(clear(wrap), null, renderSite(doc.data, { guestbook: doc.data.guestbook !== false ? guestbookView(entries, async (g) => { await sh.pubAdd(token, 'guestbook', g); const r = await sh.pub(token); draw(r.entries); toast('Tak for din hilsen!', { type: 'ok' }); }) : null }));
  draw(data.entries);
  return wrap;
}

export default {
  title: 'Sidebygger',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('pages');
    const root = h('div'), self = this;

    async function list() {
      self._off?.();
      let docs;
      try { docs = await sh.list('page', true); } catch (e) { h(clear(root), null, loadError('Sidebygger', e)); return; }
      const card = (d) => h('a', { class: 'pg-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'pg-thumb', style: { background: (THEMES[d.data.theme] || THEMES.nat).bg } }, d.data.avatar ? h('img', { src: d.data.avatar, alt: '' }) : h('span', null, (d.data.name || d.title).slice(0, 1).toUpperCase())),
        h('div', { class: 'al-card-b' }, h('b', null, d.title), h('div', { class: 'sh-meta' }, h('span', null, `${(d.data.blocks || []).length} blokke`), h('span', null, icon('chat'), ` ${d.counts.guestbook || 0}`), h('span', null, ago(d.updated)))));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Ny side')),
        docs.length ? h('div', { class: 'al-cards' }, docs.map(card)) : emptyState('globe', 'Ingen sider endnu', 'Byg din egen lille hjemmeside: et billede, lidt om dig, dine links, billeder og en gæstebog. Del den med et link – alle kan se den.', h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Byg din første side')));
    }
    async function create() {
      const me = (await import('../core/store.js')).store.get('user');
      try {
        const d = await sh.create('page', { title: me?.displayName ? `${me.displayName}s side` : 'Min side', visibility: 'private', public: true,
          data: { theme: 'nat', name: me?.displayName || '', bio: 'Skriv lidt om dig selv her.', avatar: '', guestbook: true,
            blocks: [{ type: 'links', items: [{ emoji: '🎮', label: 'Mit yndlingsspil', url: '' }, { emoji: '📸', label: 'Mine billeder', url: '' }] }, { type: 'text', text: 'Velkommen til min side! **Skriv** gerne i gæstebogen.' }] } });
        location.hash = `#/apps/${PAGE}/d/${d.id}`;
      } catch (e) { toast('Kunne ikke oprette', { type: 'bad', text: e.message }); }
    }

    async function builder(id) {
      let res;
      try { res = await sh.get(id); } catch { h(clear(root), null, emptyState('alert', 'Siden findes ikke', '', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle sider'))); return; }
      const { doc, entries } = res;
      const d = structuredClone(doc.data); d.blocks ||= [];
      let title = doc.title, dirty = false, timer = null;
      self._off?.(); self._off = onShared('page', () => { /* a new guestbook entry: refresh the list under the editor */ refreshGuests(); }, id);
      const preview = h('div', { class: 'pg-preview' }), editorBox = h('div', { class: 'stack' }), status = h('span', { class: 'faint', style: { fontSize: '13px' } }, 'Gemt');
      const guests = h('div');
      const refreshGuests = async () => { const r = await sh.get(id).catch(() => null); if (!r) return; drawGuests(r.entries); };
      const drawGuests = (ents) => h(clear(guests), null, ents.filter(e => e.kind === 'guestbook').reverse().map(g => h('div', { class: 'sh-comment' }, h('b', null, g.data.name || g.guest || g.user?.name || 'Gæst'), h('span', { class: 'faint sh-when' }, ago(g.at)), h('p', null, g.data.text),
        h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet hilsen', onclick: async () => { await sh.remove(g.id); refreshGuests(); } }, icon('trash')))), !ents.some(e => e.kind === 'guestbook') ? h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen hilsner endnu.') : null);
      drawGuests(entries);
      const save = () => { dirty = true; status.textContent = 'Gemmer …'; clearTimeout(timer); timer = setTimeout(async () => {
        try { await sh.update(id, { title, data: d }); dirty = false; status.textContent = 'Gemt'; } catch (e) { status.textContent = 'Kunne ikke gemme'; toast('Kunne ikke gemme', { type: 'bad', text: e.message }); }
      }, 700); drawPreview(); };
      const drawPreview = () => h(clear(preview), null, renderSite(d, { guestbook: d.guestbook !== false ? h('section', { class: 'pg-guest' }, h('h2', { class: 'pg-h' }, 'Gæstebog'), h('p', { class: 'pg-when' }, 'Gæstebogen vises her.')) : null }));
      const inp = (obj, key, attrs = {}) => { const el = h(attrs.rows ? 'textarea' : 'input', { class: attrs.rows ? 'textarea' : 'input', value: obj[key] || '', ...attrs }); if (attrs.rows) el.value = obj[key] || ''; el.addEventListener('input', () => { obj[key] = el.value; save(); }); return el; };
      function blockEditor(b, i) {
        let body;
        if (b.type === 'heading') body = inp(b, 'text', { maxlength: 100, placeholder: 'Overskrift', 'aria-label': 'Overskrift' });
        else if (b.type === 'text') body = h('div', { class: 'stack', style: { gap: '4px' } }, inp(b, 'text', { rows: 3, maxlength: 3000, placeholder: 'Skriv noget …', 'aria-label': 'Tekst' }), h('span', { class: 'faint', style: { fontSize: '12px' } }, '**fed** · *kursiv* · links bliver klikbare'));
        else if (b.type === 'divider') body = h('span', { class: 'faint' }, 'En streg mellem blokkene');
        else if (b.type === 'contact') body = h('div', { class: 'row', style: { gap: '6px' } }, inp(b, 'label', { maxlength: 60, placeholder: 'Skriv til mig', 'aria-label': 'Tekst på knappen' }), inp(b, 'email', { type: 'email', maxlength: 120, placeholder: 'din@mail.dk', 'aria-label': 'E-mail' }));
        else if (b.type === 'links') {
          b.items ||= [];
          const box = h('div', { class: 'stack', style: { gap: '6px' } });
          const draw = () => h(clear(box), null, b.items.map((l, j) => h('div', { class: 'pg-linked' }, inp(l, 'emoji', { maxlength: 4, placeholder: '🔗', 'aria-label': 'Emoji', class: 'input pg-emoji' }), inp(l, 'label', { maxlength: 60, placeholder: 'Tekst', 'aria-label': `Link ${j + 1} tekst` }), inp(l, 'url', { maxlength: 300, placeholder: 'https://…', 'aria-label': `Link ${j + 1} adresse` }),
            h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern link', onclick: () => { b.items.splice(j, 1); draw(); save(); } }, icon('x')))),
            b.items.length < 20 ? h('button', { class: 'btn btn-sm', onclick: () => { b.items.push({ emoji: '', label: '', url: '' }); draw(); save(); box.querySelectorAll('input')[b.items.length * 3 - 2]?.focus(); } }, icon('plus'), 'Tilføj link') : null);
          draw(); body = box;
        } else if (b.type === 'image') {
          body = h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, b.url ? h('img', { class: 'pg-edthumb', src: b.url, alt: '' }) : null,
            h('button', { class: 'btn btn-sm', onclick: async () => { const [u] = await pickImages({ multiple: false }); if (u) { b.url = u; save(); drawEditor(); } } }, icon('image'), b.url ? 'Skift' : 'Vælg billede'), inp(b, 'caption', { maxlength: 120, placeholder: 'Billedtekst (valgfrit)', 'aria-label': 'Billedtekst' }));
        } else if (b.type === 'gallery') {
          b.urls ||= [];
          body = h('div', { class: 'wl-pics' }, b.urls.map((u, j) => h('div', { class: 'wl-pic' }, h('img', { src: u, alt: '' }), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern', onclick: () => { b.urls.splice(j, 1); save(); drawEditor(); } }, icon('x')))),
            h('button', { class: 'btn btn-sm', onclick: async () => { b.urls.push(...await pickImages({ max: 12 })); save(); drawEditor(); } }, icon('plus'), 'Tilføj billeder'));
        }
        const mv = (k) => { const j = i + k; [d.blocks[i], d.blocks[j]] = [d.blocks[j], d.blocks[i]]; save(); drawEditor(); };
        return h('div', { class: 'fm-bfield' }, h('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, icon(BLOCK_ICON[b.type] || 'file'), h('b', { style: { flex: 1 } }, BLOCKS[b.type]),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Flyt op', disabled: i === 0, onclick: () => mv(-1) }, icon('chevronUp')),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Flyt ned', disabled: i === d.blocks.length - 1, onclick: () => mv(1) }, icon('chevronDown')),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet blok', onclick: () => { d.blocks.splice(i, 1); save(); drawEditor(); } }, icon('trash'))), body);
      }
      function drawEditor() {
        h(clear(editorBox), null,
          panel('Om dig', 'user', h('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } },
            d.avatar ? h('img', { class: 'pg-edavatar', src: d.avatar, alt: '' }) : h('div', { class: 'pg-edavatar pg-avatar-none' }, (d.name || '?').slice(0, 1).toUpperCase()),
            h('div', { class: 'stack', style: { gap: '4px' } }, h('button', { class: 'btn btn-sm', onclick: async () => { const [u] = await pickImages({ multiple: false }); if (u) { d.avatar = u; save(); drawEditor(); } } }, icon('image'), d.avatar ? 'Skift billede' : 'Vælg billede'),
              d.avatar ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { d.avatar = ''; save(); drawEditor(); } }, 'Fjern') : null)),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), inp(d, 'name', { maxlength: 60, 'aria-label': 'Navn på siden' })),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Lidt om dig'), inp(d, 'bio', { rows: 2, maxlength: 300, 'aria-label': 'Om dig' }))),
          panel('Udseende', 'paint', h('div', { class: 'pg-themes' }, Object.entries(THEMES).map(([k, t]) => h('button', { class: ['pg-theme', (d.theme || 'nat') === k && 'is-on'], style: { background: t.bg, color: t.fg }, 'aria-pressed': String((d.theme || 'nat') === k), onclick: () => { d.theme = k; save(); drawEditor(); } }, t.name))),
            h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: d.guestbook !== false, onchange: (e) => { d.guestbook = e.target.checked; save(); } }), h('span', null, 'Vis gæstebog'))),
          panel('Blokke', 'list', h('div', { class: 'fm-builder' }, d.blocks.map(blockEditor)),
            h('div', { class: 'fm-add', style: { marginTop: '10px' } }, h('span', { class: 'faint' }, 'Tilføj:'), Object.entries(BLOCKS).map(([k, l]) => h('button', { class: 'btn btn-sm', onclick: () => { d.blocks.push({ type: k, ...(k === 'links' ? { items: [{ emoji: '', label: '', url: '' }] } : {}) }); save(); drawEditor(); } }, icon(BLOCK_ICON[k]), l)))),
          panel('Gæstebog', 'chat', guests));
      }
      drawEditor(); drawPreview();
      const url = pubUrl(doc);
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'),
          (() => { const t = h('input', { class: 'input pg-title', value: title, maxlength: 100, 'aria-label': 'Navn på siden (kun for dig)' }); t.addEventListener('input', () => { title = t.value || 'Min side'; save(); }); return t; })(),
          status,
          doc.public ? [h('button', { class: 'btn btn-sm', onclick: () => copy(url, 'Linket er kopieret') }, icon('copy'), 'Kopiér link'), h('a', { class: 'btn btn-sm btn-primary', href: url, target: '_blank', rel: 'noopener' }, icon('external'), 'Se siden')]
            : h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { if (await shareDialog(doc, { title: 'Del siden', publicOk: true, publicText: 'Alle med linket kan se siden og skrive i gæstebogen.' })) builder(id); } }, icon('link'), 'Slå linket til'),
          h('button', { class: 'icon-btn', 'aria-label': 'Slet siden', onclick: async () => { if (await confirmDialog({ title: 'Slet siden?', confirmLabel: 'Slet', danger: true })) { clearTimeout(timer); await sh.del(id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash'))),
        h('div', { class: 'pg-wrap' }, editorBox, h('div', { class: 'pg-phone' }, h('div', { class: 'pg-phone-bar' }, h('span'), h('small', { class: 'faint' }, url.replace(/^https?:\/\//, '').slice(0, 40))), preview)));
      window.addEventListener('beforeunload', () => { if (dirty) sh.update(id, { title, data: d }); }, { once: true });
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) builder(ctx.params.id); else list();
    return h('div', { class: 'page pg-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Del ud', title: 'Sidebygger', lead: 'Byg din egen lille hjemmeside med billeder, links og gæstebog – og del den med et link, som alle kan åbne.', compact: true }), root);
  },
};
