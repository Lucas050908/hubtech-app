/**
 * Fotoalbum – shared albums for a trip, a party or the class: everyone invited can add pictures,
 * comment and watch it as a slideshow. A link can show the album to family without an account.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState, commentBox, pickImages, lightbox } from '../features/shared.js';

const PAGE = 'albums';
const SHARE = { title: 'Del albummet', publicOk: true, publicText: 'Alle med linket kan se billederne – også uden en konto (fx familien).' };

function grid(photos, { onOpen, canDelete, onDelete }) {
  return h('div', { class: 'al-grid' }, photos.map((p, i) => h('figure', { class: 'al-photo' },
    h('button', { class: 'al-open', 'aria-label': p.data.caption || `Billede ${i + 1}`, onclick: () => onOpen(i) }, h('img', { src: p.data.url, alt: p.data.caption || '', loading: 'lazy' })),
    p.data.caption ? h('figcaption', null, p.data.caption) : null,
    canDelete?.(p) ? h('button', { class: 'icon-btn btn-sm al-del', 'aria-label': 'Slet billedet', onclick: () => onDelete(p) }, icon('trash')) : null)));
}

export async function publicView(data) {
  const { doc, entries } = data;
  const photos = entries.filter(e => e.kind === 'photo');
  return h('div', { class: 'pub-card al-pub' }, h('h1', null, doc.title), doc.data.desc ? h('p', { class: 'muted' }, doc.data.desc) : null,
    h('p', { class: 'faint' }, `${photos.length} billeder`),
    photos.length ? grid(photos, { onOpen: (i) => lightbox(photos.map(p => ({ url: p.data.url, caption: p.data.caption })), i) }) : h('p', { class: 'muted' }, 'Der er ingen billeder endnu.'));
}

export default {
  title: 'Fotoalbum',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('albums');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';

    async function list() {
      self._off?.(); self._off = onShared('album', () => { if (document.body.contains(root)) list(); });
      let docs;
      try { docs = await sh.list('album'); } catch (e) { h(clear(root), null, loadError('Fotoalbum', e)); return; }
      const card = (d) => h('a', { class: 'al-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'al-cover' }, (d.data.preview || []).length ? (d.data.preview || []).slice(0, 4).map(u => h('img', { src: u, alt: '', loading: 'lazy' })) : icon('image')),
        h('div', { class: 'al-card-b' }, h('b', null, d.title), h('div', { class: 'sh-meta' }, h('span', null, icon('image'), ` ${d.counts.photo || 0}`), d.role === 'owner' ? null : person(d.owner), h('span', null, ago(d.updated)))));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('b', { style: { flex: 1 } }, docs.length ? `${docs.length} ${docs.length === 1 ? 'album' : 'albummer'}` : ''), h('button', { class: 'btn btn-primary', onclick: () => editor(null) }, icon('plus'), 'Nyt album')),
        docs.length ? h('div', { class: 'al-cards' }, docs.map(card)) : emptyState('image', 'Ingen albummer endnu', 'Lav et album til en tur, en fest eller klassen – og lad alle lægge deres billeder i det samme sted.', h('button', { class: 'btn btn-primary', onclick: () => editor(null) }, icon('plus'), 'Lav det første')));
    }

    function editor(doc) {
      const title = h('input', { class: 'input', maxlength: 120, value: doc?.title || '', placeholder: 'Fx Lejrskole 2026', 'aria-label': 'Navn på albummet' });
      const desc = h('textarea', { class: 'textarea', rows: 2, maxlength: 600, placeholder: 'Hvad er det fra? (valgfrit)', 'aria-label': 'Beskrivelse' }); desc.value = doc?.data.desc || '';
      const err = h('div', { class: 'field-error' });
      h(clear(root), null, panel(doc ? 'Ret album' : 'Nyt album', 'image',
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), title), desc, err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (doc ? detail(doc.id) : list()) }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: async () => {
            if (!title.value.trim()) { err.textContent = 'Giv albummet et navn.'; return; }
            try {
              if (doc) { await sh.update(doc.id, { title: title.value.trim(), data: { ...doc.data, desc: desc.value.trim() } }); detail(doc.id); }
              else { const d = await sh.create('album', { title: title.value.trim(), data: { desc: desc.value.trim(), preview: [] }, visibility: 'private' }); location.hash = `#/apps/${PAGE}/d/${d.id}?share=1`; }
            } catch (e) { err.textContent = e.message; }
          } }, icon('check'), doc ? 'Gem' : 'Opret og invitér'))));
      title.focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Albummet findes ikke', 'Det er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle albummer'))); return; }
      }
      const { doc, entries } = res, owner = doc.role === 'owner';
      self._off?.(); self._off = onShared('album', (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root) && !document.querySelector('.slb')) detail(id); }, id);
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, SHARE)) detail(id); }, 50); }
      let photos = entries.filter(e => e.kind === 'photo');
      let order = 'new', who = null;
      const body = h('div');
      const people = [...new Map(photos.filter(p => p.user).map(p => [p.user.id, p.user])).values()];
      const shownPhotos = () => { let p = photos.slice(); if (who) p = p.filter(x => x.user?.id === who); return order === 'new' ? p.reverse() : p; };
      const items = (ps) => ps.map(p => ({ url: p.data.url, caption: p.data.caption, by: p.user?.name }));
      const draw = () => { const ps = shownPhotos(); h(clear(body), null, ps.length ? grid(ps, { onOpen: (i) => lightbox(items(ps), i), canDelete: (p) => p.mine || owner, onDelete: async (p) => { if (await confirmDialog({ title: 'Slet billedet?', confirmLabel: 'Slet', danger: true })) { await sh.remove(p.id); await refreshPreview(); detail(id); } } }) : emptyState('image', 'Ingen billeder endnu', 'Tryk “Tilføj billeder” – alle der er inviteret kan lægge billeder i.')); };
      // the owner keeps the four newest pictures on the album (for the card in the list)
      const refreshPreview = async () => {
        if (!owner) return;
        const r = await sh.get(id).catch(() => null); if (!r) return;
        const pv = r.entries.filter(e => e.kind === 'photo').slice(-4).reverse().map(e => e.data.url);
        if (JSON.stringify(pv) !== JSON.stringify(doc.data.preview || [])) await sh.update(id, { data: { ...doc.data, preview: pv } }).catch(() => {});
      };
      if (owner && JSON.stringify(photos.slice(-4).reverse().map(e => e.data.url)) !== JSON.stringify(doc.data.preview || [])) refreshPreview();
      const add = async () => {
        const urls = await pickImages({ max: 30 });
        if (!urls.length) return;
        for (const url of urls) await sh.add(doc.id, 'photo', { url, caption: '' }).catch(e => toast('Et billede kom ikke med', { type: 'bad', text: e.message }));
        toast(`${urls.length} billede${urls.length > 1 ? 'r' : ''} lagt i albummet`, { type: 'ok' });
        await refreshPreview(); detail(id);
      };
      draw();
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title), visChip(doc),
          owner ? [h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, SHARE)) detail(id); } }, icon('share'), 'Del'),
            h('button', { class: 'btn btn-sm', onclick: () => editor(doc) }, icon('edit'), 'Ret'),
            h('button', { class: 'icon-btn', 'aria-label': 'Slet albummet', onclick: async () => { if (await confirmDialog({ title: 'Slet albummet og alle billeder?', text: 'Det kan ikke fortrydes.', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash'))] : null),
        doc.data.desc ? h('p', { class: 'muted' }, doc.data.desc) : null,
        h('div', { class: 'al-bar' },
          h('button', { class: 'btn btn-primary', onclick: add }, icon('upload'), 'Tilføj billeder'),
          photos.length > 1 ? h('button', { class: 'btn', onclick: () => { const ps = shownPhotos(); const lb = lightbox(items(ps), 0); setTimeout(() => document.querySelector('.slb [aria-label="Lysbilledshow"]')?.click(), 50); return lb; } }, icon('play'), 'Lysbilledshow') : null,
          h('span', { style: { flex: 1 } }),
          people.length > 1 ? h('select', { class: 'select', style: { width: 'auto' }, 'aria-label': 'Hvis billeder', onchange: (e) => { who = e.target.value ? Number(e.target.value) : null; draw(); } }, h('option', { value: '' }, 'Alles billeder'), people.map(p => h('option', { value: p.id }, p.name))) : null,
          segmented([{ value: 'new', label: 'Nyeste' }, { value: 'old', label: 'Ældste' }], order, (v) => { order = v; draw(); }, { label: 'Rækkefølge' })),
        h('p', { class: 'faint', style: { margin: '0 0 10px' } }, `${photos.length} billeder · ${people.length || 1} ${people.length === 1 ? 'person' : 'personer'} har bidraget`),
        body,
        panel('Snak om billederne', 'chat', commentBox(doc, entries, { onChange: () => detail(id) })));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page al-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Fotoalbum', lead: 'Fælles albummer til ture, fester og klassen. Alle inviterede lægger billeder i – og familien kan se dem via et link.', compact: true }), root);
  },
};
