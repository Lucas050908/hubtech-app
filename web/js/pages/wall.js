/**
 * Væggen – what's happening with your friends: short posts with pictures, links and #tags, likes and comments, live.
 * Each post is a shared doc (app 'post'); friends see "Dine venner" posts, everyone sees "Alle på HUBTECH".
 */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { store } from '../core/store.js';
import { appHero } from '../features/apphero.js';
import { loadError, copy } from '../features/appkit.js';
import { sh, onShared, ago, person, emptyState, commentBox, pickImages, lightbox, richText } from '../features/shared.js';
import { textParts, topTags } from '../features/sharedlogic.js';

const PAGE = 'wall';
const MAX_LEN = 2000;
const STEP = 25;

export default {
  title: 'Væggen',
  destroy() { this._off?.(); clearTimeout(this._t); },
  async render(ctx) {
    const app = appById('wall');
    const self = this, user = store.get('user');
    const feed = h('div', { class: 'wl-feed' }), side = h('aside', { class: 'wl-side' });
    let posts = [], filter = 'all', tag = null, shown = STEP, query = '';
    const open = new Set();          // posts with comments unfolded
    const one = ctx?.params?.sub === 'd' ? ctx.params.id : null;
    if (one) open.add(one);

    // ── write a post ──
    const text = h('textarea', { class: 'textarea wl-text', rows: 3, maxlength: MAX_LEN, placeholder: `Hvad sker der, ${user?.displayName?.split(' ')[0] || 'du'}?`, 'aria-label': 'Skriv et opslag' });
    const pics = [];
    const picBox = h('div', { class: 'wl-pics' });
    const left = h('span', { class: 'faint wl-left' });
    let vis = 'friends';
    const drawPics = () => h(clear(picBox), null, pics.map((u, i) => h('div', { class: 'wl-pic' }, h('img', { src: u, alt: '' }), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern billedet', onclick: () => { pics.splice(i, 1); drawPics(); } }, icon('x')))));
    text.addEventListener('input', () => { const n = MAX_LEN - text.value.length; left.textContent = n < 200 ? String(n) : ''; });
    const postBtn = h('button', { class: 'btn btn-primary', onclick: async () => {
      const t = text.value.trim();
      if (!t && !pics.length) { text.focus(); return; }
      postBtn.disabled = true;
      try {
        await sh.create('post', { title: (t || 'Billeder').slice(0, 80), data: { text: t, images: pics.slice() }, visibility: vis });
        text.value = ''; pics.length = 0; drawPics(); left.textContent = '';
        await load();
      } catch (e) { toast('Kunne ikke dele', { type: 'bad', text: e.message }); }
      postBtn.disabled = false;
    } }, icon('send'), 'Del');
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) postBtn.click(); });
    const visSeg = segmented([{ value: 'friends', label: 'Venner', icon: 'users' }, { value: 'all', label: 'Alle', icon: 'globe' }], vis, (v) => { vis = v; }, { label: 'Hvem kan se det' });
    const composer = h('section', { class: 'wl-compose' },
      h('div', { class: 'wl-compose-row' }, h('span', { class: 'avatar' }, ava(user?.avatar)), text),
      picBox,
      h('div', { class: 'wl-compose-bar' },
        h('button', { class: 'btn btn-sm btn-ghost', disabled: false, onclick: async () => { if (pics.length >= 4) return toast('Højst 4 billeder pr. opslag', { type: 'warn' }); const u = await pickImages({ max: 4 - pics.length }); pics.push(...u); drawPics(); } }, icon('image'), 'Billeder'),
        visSeg, left, h('span', { style: { flex: 1 } }), postBtn));

    // ── one post ──
    function card(d) {
      const liked = !!d.mine.like?.length, likes = d.counts.like || 0, comments = d.counts.comment || 0;
      const imgs = d.data.images || [];
      const body = h('div', { class: 'wl-body' }, richText(textParts(d.data.text || ''), { onTag: (t) => { tag = t; shown = STEP; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }));
      const cbox = h('div', { class: 'wl-comments' });
      const loadComments = async () => {
        try { const r = await sh.get(d.id); h(clear(cbox), null, commentBox(r.doc, r.entries, { onChange: () => { loadComments(); load(); } })); }
        catch { h(clear(cbox), null, h('p', { class: 'faint' }, 'Kunne ikke hente kommentarer.')); }
      };
      if (open.has(d.id)) loadComments();
      const mineP = d.role === 'owner';
      return h('article', { class: ['wl-post', one === d.id && 'is-focus'], dataset: { id: d.id } },
        h('header', { class: 'wl-head' }, person(d.owner), h('a', { class: 'faint wl-when', href: `#/apps/${PAGE}/d/${d.id}` }, ago(d.created)),
          h('span', { class: 'faint', title: d.visibility === 'all' ? 'Alle på HUBTECH' : 'Venner' }, icon(d.visibility === 'all' ? 'globe' : 'users')),
          h('span', { style: { flex: 1 } }),
          mineP ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Ret opslaget', onclick: () => editPost(d) }, icon('edit')) : null,
          mineP ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet opslaget', onclick: async () => { if (await confirmDialog({ title: 'Slet opslaget?', confirmLabel: 'Slet', danger: true })) { await sh.del(d.id); load(); } } }, icon('trash')) : null),
        d.data.text ? body : null,
        imgs.length ? h('div', { class: `wl-imgs n${Math.min(imgs.length, 4)}` }, imgs.slice(0, 4).map((u, i) => h('button', { class: 'wl-img', 'aria-label': `Vis billede ${i + 1}`, onclick: () => lightbox(imgs.map(url => ({ url, by: d.owner?.name })), i) }, h('img', { src: u, alt: '', loading: 'lazy' })))) : null,
        h('footer', { class: 'wl-actions' },
          h('button', { class: ['wl-act', liked && 'is-on'], 'aria-pressed': String(liked), 'aria-label': liked ? 'Synes ikke længere godt om' : 'Synes godt om', onclick: async (e) => {
            const b = e.currentTarget; b.classList.toggle('is-on'); b.classList.add('pop');
            try { await sh.add(d.id, 'like', liked ? { remove: true } : {}); load(); } catch (err) { toast('Det gik ikke', { type: 'bad', text: err.message }); }
          } }, icon('heart'), h('span', null, likes ? String(likes) : 'Synes godt om')),
          h('button', { class: ['wl-act', open.has(d.id) && 'is-open'], 'aria-expanded': String(open.has(d.id)), onclick: () => { open.has(d.id) ? open.delete(d.id) : open.add(d.id); draw(); } }, icon('chat'), h('span', null, comments ? `${comments} ${comments === 1 ? 'kommentar' : 'kommentarer'}` : 'Kommentér')),
          h('button', { class: 'wl-act', 'aria-label': 'Kopiér link til opslaget', onclick: () => copy(`${location.origin}/#/apps/${PAGE}/d/${d.id}`, 'Linket er kopieret') }, icon('link'))),
        open.has(d.id) ? cbox : null);
    }
    function editPost(d) {
      const el = feed.querySelector(`[data-id="${d.id}"] .wl-body`) || feed.querySelector(`[data-id="${d.id}"] .wl-head`);
      const ta = h('textarea', { class: 'textarea', rows: 3, maxlength: MAX_LEN, 'aria-label': 'Ret opslaget' }); ta.value = d.data.text || '';
      const box = h('div', { class: 'wl-edit' }, ta, h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', onclick: draw }, 'Annuller'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { try { await sh.update(d.id, { title: ta.value.trim().slice(0, 80) || 'Billeder', data: { ...d.data, text: ta.value.trim() } }); load(); } catch (e) { toast('Kunne ikke gemme', { type: 'bad', text: e.message }); } } }, 'Gem')));
      if (el.classList.contains('wl-body')) el.replaceWith(box); else el.after(box);
      ta.focus();
    }

    function draw() {
      const q = query.toLowerCase();
      let list = posts.filter(d => (filter === 'mine' ? d.role === 'owner' : filter === 'liked' ? d.mine.like?.length : true)
        && (!tag || (d.data.text || '').toLowerCase().includes(`#${tag}`)) && (!q || (d.data.text || '').toLowerCase().includes(q) || d.owner?.name?.toLowerCase().includes(q)));
      if (one) list = posts.filter(d => d.id === one);
      h(clear(feed), null,
        one ? h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}`, style: { justifySelf: 'start' } }, icon('arrowLeft'), 'Hele væggen') : composer,
        tag && !one ? h('div', { class: 'wl-tagbar' }, h('span', null, 'Viser '), h('b', null, `#${tag}`), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { tag = null; draw(); } }, icon('x'), 'Vis alt')) : null,
        list.length ? list.slice(0, shown).map(card)
          : one ? emptyState('alert', 'Opslaget findes ikke', 'Det er måske slettet, eller du har ikke adgang.')
            : emptyState('home', filter === 'all' && !tag && !q ? 'Væggen er tom' : 'Ingen opslag her', filter === 'all' && !tag && !q ? 'Skriv det første opslag – eller find venner i Fællesskab, så kommer deres opslag her.' : 'Prøv et andet filter.'),
        list.length > shown ? h('button', { class: 'btn wl-more', onclick: () => { shown += STEP; draw(); } }, 'Vis flere') : null);
      const tags = topTags(posts);
      const mineN = posts.filter(d => d.role === 'owner'), likesGot = mineN.reduce((a, d) => a + (d.counts.like || 0), 0);
      h(clear(side), null,
        h('section', { class: 'wl-box' }, h('input', { class: 'input', type: 'search', placeholder: 'Søg på væggen', value: query, 'aria-label': 'Søg på væggen', oninput: (e) => { query = e.target.value; clearTimeout(self._t); self._t = setTimeout(() => { draw(); side.querySelector('input')?.focus(); }, 250); } }),
          h('div', { class: 'wl-filters' }, [['all', 'Alle opslag', 'home'], ['mine', 'Mine', 'user'], ['liked', 'Synes godt om', 'heart']].map(([v, l, ic]) => h('button', { class: ['wl-filter', filter === v && 'is-on'], onclick: () => { filter = v; shown = STEP; if (one) location.hash = `#/apps/${PAGE}`; draw(); } }, icon(ic), l)))),
        tags.length ? h('section', { class: 'wl-box' }, h('b', null, 'Populære emner'), h('div', { class: 'wl-tags' }, tags.map(([t, n]) => h('button', { class: ['sh-tag', tag === t && 'is-on'], onclick: () => { tag = tag === t ? null : t; shown = STEP; draw(); } }, `#${t}`, h('small', { class: 'faint' }, ` ${n}`))))) : null,
        h('section', { class: 'wl-box wl-stats' }, h('div', null, h('b', null, String(mineN.length)), h('span', { class: 'faint' }, 'opslag')), h('div', null, h('b', null, String(likesGot)), h('span', { class: 'faint' }, 'hjerter'))),
        h('section', { class: 'wl-box' }, h('b', null, 'Tip'), h('p', { class: 'faint', style: { margin: '4px 0 0' } }, 'Skriv #emne i dit opslag, så kan andre finde det. Ctrl + Enter deler.')));
    }

    async function load() {
      try { posts = (await sh.list('post')).sort((a, b) => b.created - a.created); }
      catch (e) { h(clear(feed), null, loadError('Væggen', e)); return; }
      draw();
    }
    let pending = null;
    // while someone is writing, wait and try again – never drop the update
    const tryLoad = () => { if (!document.body.contains(feed)) return; if (feed.querySelector('.wl-edit') || document.activeElement?.closest?.('.wl-comments') || document.activeElement?.closest?.('.wl-compose')?.querySelector('textarea')?.value) { pending = setTimeout(tryLoad, 1500); return; } load(); };
    this._off = onShared('post', () => { if (!document.body.contains(feed)) return; clearTimeout(pending); pending = setTimeout(tryLoad, 400); });
    feed.append(h('p', { class: 'faint' }, 'Henter …'));
    load();
    return h('div', { class: 'page wl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Væggen', lead: 'Del hvad der sker – med billeder, links og #emner. Dine venner kan synes godt om og kommentere.', compact: true }),
      h('div', { class: 'wl-wrap' }, feed, side));
  },
};
