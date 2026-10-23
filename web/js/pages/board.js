/**
 * Tavlen – a shared board of sticky notes for brainstorms, retros and group work.
 * Everyone invited can add, move and vote on notes at the same time; changes show up live.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState, me } from '../features/shared.js';

const PAGE = 'board';
const W = 1800, H = 1100, NOTE = 168;
const COLORS = { gul: '#fde68a', pink: '#fbcfe8', blå: '#bfdbfe', grøn: '#bbf7d0', lilla: '#ddd6fe', orange: '#fed7aa' };
const TEMPLATES = {
  blank: { name: 'Tom tavle', zones: [] },
  brainstorm: { name: 'Brainstorm', zones: [{ label: 'Idéer', x: 40, y: 40, w: 1100, h: 1000, color: '#fde68a' }, { label: 'De bedste', x: 1180, y: 40, w: 580, h: 1000, color: '#bbf7d0' }] },
  retro: { name: 'Evaluering', zones: [{ label: 'Det gik godt 😊', x: 40, y: 40, w: 560, h: 1000, color: '#bbf7d0' }, { label: 'Det kan blive bedre 🤔', x: 620, y: 40, w: 560, h: 1000, color: '#fecaca' }, { label: 'Det prøver vi næste gang 💡', x: 1200, y: 40, w: 560, h: 1000, color: '#bfdbfe' }] },
  proscons: { name: 'Fordele og ulemper', zones: [{ label: 'Fordele 👍', x: 40, y: 40, w: 850, h: 1000, color: '#bbf7d0' }, { label: 'Ulemper 👎', x: 910, y: 40, w: 850, h: 1000, color: '#fecaca' }] },
  week: { name: 'Ugeplan', zones: ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag'].map((d, i) => ({ label: d, x: 40 + i * 346, y: 40, w: 330, h: 1000, color: ['#fde68a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#ddd6fe'][i] })) },
};

export async function publicView(data) {
  const { doc, entries } = data;
  return h('div', { class: 'pub-card tv-pub' }, h('h1', null, doc.title), h('div', { class: 'tv-scroll' }, canvas(doc, entries.filter(e => e.kind === 'item'), { readOnly: true })));
}

/** the board surface with zones and notes */
function canvas(doc, items, { readOnly = false, onMove, onEdit, onVote, onDelete, onColor } = {}) {
  const surf = h('div', { class: 'tv-surface', style: { width: `${W}px`, height: `${H}px` } },
    (doc.data.zones || []).map(z => h('div', { class: 'tv-zone', style: { left: `${z.x}px`, top: `${z.y}px`, width: `${z.w}px`, height: `${z.h}px`, '--z': z.color } }, h('b', null, z.label))));
  const meId = me();
  for (const it of items) {
    const d = it.data, votes = d.votes || [], voted = votes.includes(meId);
    const text = h('div', { class: 'tv-text' }, d.text || '');
    const note = h('div', { class: ['tv-note', voted && 'is-voted'], style: { left: `${d.x}px`, top: `${d.y}px`, background: COLORS[d.color] || COLORS.gul, transform: `rotate(${((it.id * 37) % 7) - 3}deg)` }, dataset: { id: it.id }, tabindex: 0, 'aria-label': `Seddel: ${d.text || 'tom'}` },
      text,
      h('div', { class: 'tv-meta' }, h('span', { class: 'tv-by' }, it.user?.name?.split(' ')[0] || ''),
        h('button', { class: ['tv-vote', voted && 'is-on'], 'aria-label': voted ? 'Fjern din stemme' : 'Stem på sedlen', 'aria-pressed': String(voted), disabled: readOnly, onclick: (e) => { e.stopPropagation(); onVote?.(it); } }, '♥', votes.length ? ` ${votes.length}` : '')));
    if (!readOnly) {
      // drag to move
      let sx, sy, ox, oy, moved = false, dragging = false;
      note.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, textarea') || e.button !== 0) return;
        dragging = true; moved = false; sx = e.clientX; sy = e.clientY; ox = d.x; oy = d.y; note.setPointerCapture(e.pointerId); note.classList.add('is-drag');
      });
      note.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        d.x = Math.max(0, Math.min(W - NOTE, ox + dx)); d.y = Math.max(0, Math.min(H - NOTE, oy + dy));
        note.style.left = `${d.x}px`; note.style.top = `${d.y}px`;
      });
      const end = () => { if (!dragging) return; dragging = false; note.classList.remove('is-drag'); if (moved) onMove?.(it, Math.round(d.x), Math.round(d.y)); };
      note.addEventListener('pointerup', end); note.addEventListener('pointercancel', end);
      // double click (or Enter) to edit
      const edit = () => {
        const ta = h('textarea', { class: 'tv-edit', maxlength: 300, 'aria-label': 'Tekst på sedlen' }); ta.value = d.text || '';
        const tools = h('div', { class: 'tv-tools' }, Object.entries(COLORS).map(([k, c]) => h('button', { class: 'tv-sw', style: { background: c }, 'aria-label': `Farve ${k}`, onclick: (e) => { e.stopPropagation(); note.style.background = c; onColor?.(it, k); } })),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet sedlen', onclick: (e) => { e.stopPropagation(); onDelete?.(it); } }, icon('trash')));
        text.replaceWith(ta); note.append(tools); note.classList.add('is-editing'); ta.focus(); ta.select();
        const done = () => { if (!note.classList.contains('is-editing')) return; note.classList.remove('is-editing'); if (ta.value !== (d.text || '')) onEdit?.(it, ta.value.trim()); else { ta.replaceWith(text); tools.remove(); } };
        ta.addEventListener('blur', () => setTimeout(() => { if (!note.contains(document.activeElement)) done(); }, 150));
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); } if (e.key === 'Escape') { ta.value = d.text || ''; ta.blur(); } });
      };
      note.addEventListener('dblclick', edit);
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === note) edit(); if ((e.key === 'Delete') && e.target === note) onDelete?.(it); });
      note._edit = edit;
    }
    surf.append(note);
  }
  return surf;
}

export default {
  title: 'Tavlen',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('board');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';

    async function list() {
      self._off?.(); self._off = onShared('board', () => { if (document.body.contains(root) && !root.querySelector('.tv-new')) list(); });
      let docs;
      try { docs = await sh.list('board'); } catch (e) { h(clear(root), null, loadError('Tavlen', e)); return; }
      const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'sh-card-h' }, h('b', null, d.title), visChip(d)),
        h('div', { class: 'sh-meta' }, h('span', null, `${d.counts.item || 0} sedler`), d.role === 'owner' ? null : person(d.owner), h('span', null, `rettet ${ago(d.updated)}`)));
      h(clear(root), null,
        h('div', { class: 'tv-new' }, h('b', null, 'Lav en ny tavle'), h('div', { class: 'tv-tpls' }, Object.entries(TEMPLATES).map(([k, t]) => h('button', { class: 'tv-tpl', onclick: () => create(k) },
          h('div', { class: 'tv-tpl-prev' }, t.zones.map(z => h('i', { style: { left: `${z.x / W * 100}%`, top: `${z.y / H * 100}%`, width: `${z.w / W * 100}%`, height: `${z.h / H * 100}%`, background: z.color } })), !t.zones.length ? h('span', null, '+') : null), h('span', null, t.name))))),
        docs.length ? [h('h3', { class: 'gr-h', style: { marginTop: '18px' } }, 'Dine tavler'), h('div', { class: 'sh-list' }, docs.map(card))] : null);
    }
    async function create(tpl) {
      const t = TEMPLATES[tpl];
      try { const d = await sh.create('board', { title: tpl === 'blank' ? 'Ny tavle' : t.name, data: { zones: t.zones }, visibility: 'private' }); location.hash = `#/apps/${PAGE}/d/${d.id}?share=1`; }
      catch (e) { toast('Kunne ikke oprette', { type: 'bad', text: e.message }); }
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Tavlen findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle tavler'))); return; }
      }
      const { doc } = res, owner = doc.role === 'owner';
      let items = res.entries.filter(e => e.kind === 'item');
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: 'Hvem skal være med?', publicOk: true, publicText: 'Alle med linket kan se tavlen (men ikke rette).' })) detail(id); }, 50); }
      const scroll = h('div', { class: 'tv-scroll' });
      let color = 'gul', busy = false;
      const refresh = async () => { const r = await sh.get(id).catch(() => null); if (!r) return; items = r.entries.filter(e => e.kind === 'item'); draw(); };
      // a live change from someone else: wait while I'm writing on or dragging a note
      let waitT = null;
      const later = () => { clearTimeout(waitT); if (scroll.querySelector('.is-editing, .is-drag') || busy) { waitT = setTimeout(later, 1200); return; } refresh(); };
      self._off?.(); self._off = onShared('board', (ev) => {
        if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; }
        if (!document.body.contains(scroll)) return;
        later();
      }, id);
      const act = async (fn) => { busy = true; try { await fn(); } catch (e) { toast('Det gik ikke', { type: 'bad', text: e.message }); } busy = false; later(); };
      const handlers = {
        onMove: (it, x, y) => act(() => sh.edit(it.id, { ...it.data, x, y })),
        onEdit: (it, text) => act(() => (text ? sh.edit(it.id, { ...it.data, text }) : sh.remove(it.id))),
        onColor: (it, c) => { it.data.color = c; sh.edit(it.id, { ...it.data, color: c }).catch(() => {}); },
        onVote: (it) => { const v = new Set(it.data.votes || []); v.has(me()) ? v.delete(me()) : v.add(me()); act(() => sh.edit(it.id, { ...it.data, votes: [...v] })); },
        onDelete: (it) => act(() => sh.remove(it.id)),
      };
      const addNote = async (x, y, text = '') => {
        busy = true;
        try {
          const r = await sh.add(doc.id, 'item', { x: Math.round(x ?? scroll.scrollLeft + 60 + Math.random() * 200), y: Math.round(y ?? scroll.scrollTop + 60 + Math.random() * 120), text, color, votes: [] });
          await refresh(); busy = false;
          scroll.querySelector(`[data-id="${r.id}"]`)?._edit?.();
        } catch (e) { busy = false; toast('Kunne ikke tilføje', { type: 'bad', text: e.message }); }
      };
      const draw = () => {
        const sl = scroll.scrollLeft, st = scroll.scrollTop;
        const surf = canvas(doc, items, handlers);
        surf.addEventListener('dblclick', (e) => { if (e.target === surf || e.target.classList.contains('tv-zone')) { const r = surf.getBoundingClientRect(); addNote(e.clientX - r.left - NOTE / 2, e.clientY - r.top - 30); } });
        h(clear(scroll), null, surf);
        scroll.scrollLeft = sl; scroll.scrollTop = st;
        h(clear(countEl), null, `${items.length} sedler · ${items.reduce((a, i) => a + (i.data.votes?.length || 0), 0)} stemmer`);
      };
      const countEl = h('span', { class: 'faint' });
      const sortVotes = () => { const top = items.slice().sort((a, b) => (b.data.votes?.length || 0) - (a.data.votes?.length || 0)).filter(i => i.data.votes?.length).slice(0, 10); return top; };
      const colorBtns = h('div', { class: 'tv-colors', role: 'radiogroup', 'aria-label': 'Farve på nye sedler' });
      const drawColors = () => h(clear(colorBtns), null, Object.entries(COLORS).map(([k, c]) => h('button', { class: ['tv-sw', color === k && 'is-on'], style: { background: c }, role: 'radio', 'aria-checked': String(color === k), 'aria-label': k, onclick: () => { color = k; drawColors(); } })));
      drawColors();
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'),
          owner ? (() => { const t = h('input', { class: 'input pg-title', value: doc.title, maxlength: 100, 'aria-label': 'Navn på tavlen' }); t.addEventListener('change', () => sh.update(doc.id, { title: t.value.trim() || 'Tavle' }).catch(() => {})); return t; })() : h('h2', null, doc.title),
          visChip(doc),
          owner ? h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: 'Hvem skal være med?', publicOk: true, publicText: 'Alle med linket kan se tavlen (men ikke rette).' })) detail(id); } }, icon('share'), 'Del') : null,
          owner ? h('button', { class: 'icon-btn', 'aria-label': 'Slet tavlen', onclick: async () => { if (await confirmDialog({ title: 'Slet tavlen for alle?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null),
        h('div', { class: 'tv-bar' }, h('button', { class: 'btn btn-primary', onclick: () => addNote() }, icon('plus'), 'Ny seddel'), colorBtns, countEl, h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn btn-sm', onclick: () => {
            const top = sortVotes();
            if (!top.length) return toast('Ingen har stemt endnu', { type: 'info', text: 'Tryk på ♥ på de sedler, du bedst kan lide.' });
            toast('Flest stemmer', { type: 'info', ms: 9000, text: top.slice(0, 5).map((t, i) => `${i + 1}. ${t.data.text || '(tom)'} – ${t.data.votes.length} ♥`).join('\n') });
          } }, icon('award'), 'Flest stemmer'),
          h('span', { class: 'faint tv-tip' }, 'Dobbeltklik for at skrive · træk for at flytte')),
        scroll);
      draw();
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page tv-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Tavlen', lead: 'En fælles tavle med gule sedler til brainstorm, evaluering og gruppearbejde. Alle kan skrive, flytte og stemme – på samme tid.', compact: true }), root);
  },
};
