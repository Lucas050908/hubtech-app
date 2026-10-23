/**
 * Indkøbsliste – one shared list for the household: everyone can add and tick off, and it updates live in the shop.
 * Things are sorted by where they are in the shop; "2 l mælk" keeps the amount by itself.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError, appState } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState } from '../features/shared.js';
import { SHOP_CATS, shopCat, parseItem } from '../features/sharedlogic.js';

const PAGE = 'shopping';

export default {
  title: 'Indkøbsliste',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('shopping');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';
    let memo;
    try { memo = await appState('shopping', { recent: [] }); } catch { memo = { data: { recent: [] }, save() {} }; }

    async function list() {
      self._off?.(); self._off = onShared('shoplist', () => { if (document.body.contains(root)) list(); });
      let docs;
      try { docs = await sh.list('shoplist'); } catch (e) { h(clear(root), null, loadError('Indkøbsliste', e)); return; }
      if (docs.length === 1 && !qs.get('all')) { location.hash = `#/apps/${PAGE}/d/${docs[0].id}`; return; }
      const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'sh-card-h' }, h('b', null, d.title), visChip(d)),
        h('div', { class: 'sh-meta' }, h('span', null, icon('cart'), ` ${d.counts.item || 0} varer`), d.role === 'owner' ? null : person(d.owner), h('span', null, ago(d.updated))));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Ny liste')),
        docs.length ? h('div', { class: 'sh-list' }, docs.map(card)) : emptyState('cart', 'Ingen indkøbslister endnu', 'Lav en fælles liste til familien eller bofællesskabet – alle kan skrive på og krydse af, og den opdateres live, mens I handler.', h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Lav listen')));
    }
    async function create() {
      try { const d = await sh.create('shoplist', { title: 'Indkøb', data: {}, visibility: 'private' }); location.hash = `#/apps/${PAGE}/d/${d.id}?share=1`; }
      catch (e) { toast('Kunne ikke oprette', { type: 'bad', text: e.message }); }
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Listen findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}?all=1` }, 'Alle lister'))); return; }
      }
      const { doc } = res, owner = doc.role === 'owner';
      let items = res.entries.filter(e => e.kind === 'item');
      self._off?.(); self._off = onShared('shoplist', async (ev) => {
        if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}?all=1`; return; }
        if (!document.body.contains(root) || document.activeElement?.classList?.contains('sp-edit')) return;
        const r = await sh.get(id).catch(() => null); if (r) { items = r.entries.filter(e => e.kind === 'item'); drawList(); }
      }, id);
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: 'Hvem handler med?', editorsOk: false })) detail(id); }, 50); }
      const listBox = h('div', { class: 'sp-list' });
      const input = h('input', { class: 'input sp-add-in', maxlength: 80, placeholder: 'Tilføj fx “2 l mælk” …', 'aria-label': 'Tilføj vare', list: 'sp-recent', autocomplete: 'off' });
      const datalist = h('datalist', { id: 'sp-recent' }, (memo.data.recent || []).map(t => h('option', { value: t })));
      const refresh = async () => { const r = await sh.get(id).catch(() => null); if (r) { items = r.entries.filter(e => e.kind === 'item'); drawList(); } };
      const add = async (raw) => {
        const parts = String(raw).split(/,|\n/).map(x => x.trim()).filter(Boolean).slice(0, 30);
        for (const p of parts) {
          const { qty, text } = parseItem(p);
          if (items.some(i => !i.data.done && i.data.text.toLowerCase() === text.toLowerCase())) { toast(`${text} står allerede på listen`, { type: 'info', ms: 1800 }); continue; }
          await sh.add(doc.id, 'item', { text, qty, cat: shopCat(text), done: false }).catch(e => toast('Kunne ikke tilføje', { type: 'bad', text: e.message }));
          memo.data.recent = [text, ...(memo.data.recent || []).filter(t => t.toLowerCase() !== text.toLowerCase())].slice(0, 80);
        }
        memo.save(); refresh();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { add(input.value); input.value = ''; } });
      const toggle = async (it) => { it.data.done = !it.data.done; drawList(); await sh.edit(it.id, it.data).catch(() => {}); };
      function drawList() {
        const open = items.filter(i => !i.data.done), done = items.filter(i => i.data.done);
        const groups = SHOP_CATS.map(c => [c, open.filter(i => (i.data.cat || 'Andet') === c)]).filter(([, l]) => l.length);
        const row = (it) => h('div', { class: ['sp-item', it.data.done && 'is-done'] },
          h('button', { class: 'sp-check', 'aria-pressed': String(!!it.data.done), 'aria-label': `${it.data.done ? 'Fortryd' : 'Købt'}: ${it.data.text}`, onclick: () => toggle(it) }, it.data.done ? icon('check') : null),
          h('span', { class: 'sp-text', onclick: () => toggle(it) }, it.data.qty ? h('b', null, `${it.data.qty} `) : null, it.data.text),
          it.user && !it.mine ? h('span', { class: 'faint sp-by' }, it.user.name.split(' ')[0]) : null,
          h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${it.data.text}`, onclick: async () => { items = items.filter(x => x !== it); drawList(); await sh.remove(it.id).catch(() => {}); } }, icon('x')));
        h(clear(listBox), null,
          !items.length ? emptyState('cart', 'Listen er tom', 'Skriv hvad der mangler – flere ting på én gang med komma.') : null,
          groups.map(([c, l]) => h('div', { class: 'sp-group' }, h('span', { class: 'field-label' }, c), l.map(row))),
          done.length ? h('div', { class: 'sp-group' }, h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('span', { class: 'field-label' }, `I kurven (${done.length})`),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { const d = done.slice(); items = items.filter(x => !x.data.done); drawList(); for (const x of d) await sh.remove(x.id).catch(() => {}); toast('Kurven er tømt', { type: 'ok', ms: 1500 }); } }, icon('trash'), 'Ryd købte')), done.map(row)) : null);
        h(clear(countEl), null, open.length ? `${open.length} tilbage` : items.length ? 'Alt er købt 🎉' : '');
      }
      const countEl = h('span', { class: 'faint' });
      const quick = (memo.data.recent || []).slice(0, 12);
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}?all=1` }, icon('arrowLeft'), 'Lister'),
          owner ? (() => { const t = h('input', { class: 'input pg-title', value: doc.title, maxlength: 60, 'aria-label': 'Navn på listen' }); t.addEventListener('change', () => sh.update(doc.id, { title: t.value.trim() || 'Indkøb' }).catch(() => {})); return t; })() : h('h2', null, doc.title),
          countEl,
          owner ? h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: 'Hvem handler med?' })) detail(id); } }, icon('users'), 'Del') : null,
          owner ? h('button', { class: 'icon-btn', 'aria-label': 'Slet listen', onclick: async () => { if (await confirmDialog({ title: 'Slet listen?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}?all=1`; } } }, icon('trash')) : null),
        panel(null, null, h('div', { class: 'sp-add' }, input, datalist, h('button', { class: 'btn btn-primary', onclick: () => { if (input.value.trim()) { add(input.value); input.value = ''; input.focus(); } } }, icon('plus'), 'Tilføj')),
          quick.length ? h('div', { class: 'wl-tags', style: { marginTop: '8px' } }, quick.map(t => h('button', { class: 'sh-tag', onclick: () => add(t) }, '+ ', t))) : null),
        panel(null, null, listBox),
        doc.members?.length ? h('p', { class: 'faint' }, 'Deles med: ', doc.members.map(m => m.name.split(' ')[0]).join(', '), ` og ${doc.owner?.name?.split(' ')[0] || ''}`) : null);
      drawList(); input.focus();
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page sp-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Hjemme', title: 'Indkøbsliste', lead: 'Én fælles liste til hele husstanden. Alle kan skrive på og krydse af – og den opdateres live, mens I står i butikken.', compact: true }), root);
  },
};
