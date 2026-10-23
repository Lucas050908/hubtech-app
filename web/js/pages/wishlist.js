/**
 * Ønskeseddel – write your wishes and share them. The others can mark "I'll buy it" so nobody gives the same –
 * and you never see who bought what, so the surprise is kept.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError, uid } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState, pickImages, commentBox } from '../features/shared.js';

const PAGE = 'wishlist';
const SHARE = { title: 'Del ønskesedlen', publicOk: true, publicText: 'Alle med linket kan se ønskerne (men skal logge ind for at reservere).' };
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
const PRIO = { 3: '❤️ Ønsker mig allermest', 2: 'Ønsker mig', 1: 'Lille ønske' };

function wishCard(w, { reserved, mine, canReserve, onReserve, owner, onEdit, onDelete }) {
  return h('div', { class: ['ws-item', reserved && !owner && 'is-taken', mine && 'is-mine'] },
    w.img ? h('img', { class: 'ws-img', src: w.img, alt: '' }) : h('div', { class: 'ws-img ws-noimg' }, '🎁'),
    h('div', { class: 'ws-body' },
      h('b', null, w.text), w.prio ? h('span', { class: 'ws-prio' }, PRIO[w.prio]) : null,
      w.note ? h('p', { class: 'muted' }, w.note) : null,
      h('div', { class: 'sh-meta' }, w.price ? h('span', null, w.price) : null, safeUrl(w.link) ? h('a', { href: safeUrl(w.link), target: '_blank', rel: 'noopener nofollow' }, icon('external'), ' Se varen') : null)),
    h('div', { class: 'ws-act' },
      owner ? [h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Ret ønske', onclick: onEdit }, icon('edit')), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet ønske', onclick: onDelete }, icon('trash'))]
        : mine ? h('button', { class: 'btn btn-sm', onclick: onReserve }, icon('check'), 'Du køber den – fortryd')
          : reserved ? h('span', { class: 'chip' }, 'Købes af en anden')
            : canReserve ? h('button', { class: 'btn btn-sm btn-primary', onclick: onReserve }, icon('gift'), 'Jeg køber den') : null));
}

export async function publicView(data, token) {
  const { doc, entries } = data;
  const taken = new Set(entries.filter(e => e.kind === 'reserve').map(e => e.data.item));
  return h('div', { class: 'pub-card ws-pub' }, h('h1', null, doc.title), doc.data.desc ? h('p', { class: 'muted' }, doc.data.desc) : null,
    h('div', { class: 'ws-list' }, (doc.data.items || []).map(w => wishCard(w, { reserved: taken.has(w.id) }))),
    h('div', { class: 'row-actions' }, h('a', { class: 'btn btn-primary', href: `#/login?next=${encodeURIComponent(`/p/${token}`)}` }, icon('user'), 'Log ind for at reservere en gave')));
}

export default {
  title: 'Ønskeseddel',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('wishlist');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';

    async function list() {
      self._off?.(); self._off = onShared('wishlist', () => { if (document.body.contains(root)) list(); });
      let docs;
      try { docs = await sh.list('wishlist'); } catch (e) { h(clear(root), null, loadError('Ønskeseddel', e)); return; }
      const mine = docs.filter(d => d.role === 'owner'), others = docs.filter(d => d.role !== 'owner');
      const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'sh-card-h' }, h('b', null, d.title), d.data.date ? h('span', { class: 'chip' }, new Date(`${d.data.date}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })) : null),
        h('div', { class: 'sh-meta' }, h('span', null, icon('gift'), ` ${(d.data.items || []).length} ønsker`), d.role === 'owner' ? visChip(d) : person(d.owner), d.role !== 'owner' && d.mine.reserve?.length ? h('span', { class: 'chip chip-ok' }, `Du køber ${d.mine.reserve.length}`) : null));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('b', { style: { flex: 1 } }, 'Mine ønskesedler'), h('button', { class: 'btn btn-primary', onclick: () => create() }, icon('plus'), 'Ny ønskeseddel')),
        mine.length ? h('div', { class: 'sh-list' }, mine.map(card)) : emptyState('gift', 'Ingen ønskesedler endnu', 'Lav en til fødselsdag, jul eller konfirmation. Del den – så kan familien skrive “jeg køber den”, uden at du kan se hvem.', h('button', { class: 'btn btn-primary', onclick: () => create() }, icon('plus'), 'Lav din første')),
        others.length ? [h('h3', { class: 'gr-h', style: { marginTop: '18px' } }, 'Andres ønskesedler'), h('div', { class: 'sh-list' }, others.map(card))] : null);
    }
    function create() {
      const title = h('input', { class: 'input', maxlength: 80, placeholder: 'Fx Min fødselsdag 2026', 'aria-label': 'Navn på ønskesedlen' });
      const date = h('input', { class: 'input', type: 'date', 'aria-label': 'Dato (valgfrit)', style: { width: 'auto' } });
      const err = h('div', { class: 'field-error' });
      h(clear(root), null, panel('Ny ønskeseddel', 'gift', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), title),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hvornår? (valgfrit)'), date), err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: list }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: async () => {
          if (!title.value.trim()) { err.textContent = 'Giv den et navn.'; return; }
          try { const d = await sh.create('wishlist', { title: title.value.trim(), data: { items: [], date: date.value || '' }, visibility: 'friends', public: false }); location.hash = `#/apps/${PAGE}/d/${d.id}`; }
          catch (e) { err.textContent = e.message; }
        } }, icon('check'), 'Opret'))));
      title.focus();
    }
    function wishDialog(doc, w, done) {
      const it = w ? { ...w } : { id: uid(), text: '', link: '', price: '', note: '', prio: 2, img: '' };
      const text = h('input', { class: 'input', maxlength: 120, value: it.text, placeholder: 'Hvad ønsker du dig?', 'aria-label': 'Ønske' });
      const link = h('input', { class: 'input', maxlength: 400, value: it.link, placeholder: 'https://… (valgfrit)', 'aria-label': 'Link til varen' });
      const price = h('input', { class: 'input', maxlength: 30, value: it.price, placeholder: 'Fx ca. 200 kr.', 'aria-label': 'Pris' });
      const note = h('input', { class: 'input', maxlength: 200, value: it.note, placeholder: 'Størrelse, farve … (valgfrit)', 'aria-label': 'Note' });
      const prio = h('select', { class: 'select', 'aria-label': 'Hvor meget' }, [3, 2, 1].map(p => h('option', { value: p, selected: p === it.prio }, PRIO[p])));
      const imgBox = h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } });
      const drawImg = () => h(clear(imgBox), null, it.img ? h('img', { class: 'pg-edthumb', src: it.img, alt: '' }) : null, h('button', { class: 'btn btn-sm', onclick: async () => { const [u] = await pickImages({ multiple: false }); if (u) { it.img = u; drawImg(); } } }, icon('image'), it.img ? 'Skift billede' : 'Billede (valgfrit)'));
      drawImg();
      const box = h('div', { class: 'ws-form stack' }, text, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, prio, price), link, note, imgBox,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => done(false) }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: async () => {
          if (!text.value.trim()) return text.focus();
          Object.assign(it, { text: text.value.trim(), link: link.value.trim(), price: price.value.trim(), note: note.value.trim(), prio: Number(prio.value) });
          const items = (doc.data.items || []).slice(); const k = items.findIndex(x => x.id === it.id); if (k >= 0) items[k] = it; else items.push(it);
          try { await sh.update(doc.id, { data: { ...doc.data, items } }); done(true); } catch (e) { toast('Kunne ikke gemme', { type: 'bad', text: e.message }); }
        } }, icon('check'), w ? 'Gem' : 'Tilføj')));
      return box;
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Ønskesedlen findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle ønskesedler'))); return; }
      }
      const { doc, entries } = res, owner = doc.role === 'owner';
      self._off?.(); self._off = onShared('wishlist', (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root) && !root.querySelector('.ws-form')) detail(id); }, id);
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, SHARE)) detail(id); }, 50); }
      const res2 = new Map(entries.filter(e => e.kind === 'reserve').map(e => [e.data.item, e]));
      const items = (doc.data.items || []).slice().sort((a, b) => (b.prio || 0) - (a.prio || 0));
      const addBox = h('div');
      const again = () => detail(id);
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title), visChip(doc),
          owner ? h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, SHARE)) again(); } }, icon('share'), 'Del') : null,
          owner ? h('button', { class: 'icon-btn', 'aria-label': 'Slet ønskesedlen', onclick: async () => { if (await confirmDialog({ title: 'Slet ønskesedlen?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null),
        owner ? h('div', { class: 'ws-note' }, icon('eye'), ' Du kan ikke se, hvem der køber hvad – så overraskelsen holder.') : h('div', { class: 'sh-meta', style: { marginBottom: '10px' } }, person(doc.owner), doc.data.date ? h('span', null, new Date(`${doc.data.date}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })) : null, h('span', null, `Tryk “Jeg køber den”, så ved de andre det – ${doc.owner?.name?.split(' ')[0] || 'ejeren'} kan ikke se det.`)),
        owner ? h('div', { style: { marginBottom: '12px' } }, addBox, h('button', { class: 'btn btn-primary', onclick: (e) => { e.currentTarget.remove(); addBox.append(panel('Nyt ønske', 'gift', wishDialog(doc, null, (ok) => (ok ? again() : again())))); addBox.querySelector('input').focus(); } }, icon('plus'), 'Tilføj ønske')) : null,
        items.length ? h('div', { class: 'ws-list' }, items.map(w => {
          const r = res2.get(w.id);
          return wishCard(w, { owner, reserved: !!r, mine: r?.mine, canReserve: !owner,
            onReserve: async () => { try { await sh.add(doc.id, 'reserve', r?.mine ? { item: w.id, remove: true } : { item: w.id }); if (!r) toast('Fedt – den er din at købe', { type: 'ok', text: 'De andre kan se, at den er taget.' }); again(); } catch (e) { toast(e.message, { type: 'warn' }); again(); } },
            onEdit: (e) => { const card = e.currentTarget.closest('.ws-item'); card.replaceWith(panel('Ret ønske', 'edit', wishDialog(doc, w, () => again()))); },
            onDelete: async () => { if (await confirmDialog({ title: `Slet “${w.text}”?`, confirmLabel: 'Slet', danger: true })) { await sh.update(doc.id, { data: { ...doc.data, items: doc.data.items.filter(x => x.id !== w.id) } }); again(); } } });
        })) : emptyState('gift', 'Ingen ønsker endnu', owner ? 'Tilføj det første ønske.' : 'Der er ikke skrevet nogen ønsker endnu.'),
        !owner ? panel('Aftal med de andre', 'chat', h('p', { class: 'faint', style: { marginTop: 0 } }, `Fx om I skal gå sammen om en gave. ${doc.owner?.name?.split(' ')[0] || 'Ejeren'} kan ikke se beskederne her.`), commentBox(doc, entries, { onChange: again })) : null);
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page ws-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Ønskeseddel', lead: 'Skriv dine ønsker og del dem. Familien markerer “jeg køber den”, så ingen giver det samme – og du kan ikke se hvem.', compact: true }), root);
  },
};
