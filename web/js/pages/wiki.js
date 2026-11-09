/**
 * Wiki – a shared notebook of pages that link to each other: the class's notes, the club's rules, the game group's guides.
 * Everyone invited can write; every page keeps its last ten versions. A link can show it to anyone (read only).
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState } from '../features/shared.js';
import { mdBlocks, mdInline, slugify, wikiLinks } from '../features/sharedlogic.js';

const PAGE = 'wiki';
const SHARE = { title: 'Del wikien', publicOk: true, publicText: 'Alle med linket kan læse wikien – også uden en konto.', editorsOk: true };
const HOME = 'forside';
const STARTER = (title) => `# ${title}\n\nVelkommen! Det her er forsiden. Skriv hvad wikien handler om.\n\n## Sider\n- [[Regler]]\n- [[Huskeliste]]\n\nTip: skriv **[[Navn på en side]]** for at lave et link til en ny side.`;

/** markdown → DOM (no innerHTML). wiki links call onWiki(slug, title), existing tells if the page exists */
export function renderMd(text, { onWiki, exists = () => true } = {}) {
  const inl = (t) => mdInline(t).map(p => p.t === 'b' ? h('strong', null, p.v) : p.t === 'i' ? h('em', null, p.v) : p.t === 'code' ? h('code', null, p.v)
    : p.t === 'link' ? h('a', { href: p.href, target: '_blank', rel: 'noopener nofollow' }, p.v)
      : p.t === 'wiki' ? h('a', { href: '#', class: ['wk-link', !exists(p.slug) && 'is-new'], title: exists(p.slug) ? p.v : `${p.v} (findes ikke endnu)`, onclick: (e) => { e.preventDefault(); onWiki?.(p.slug, p.v); } }, p.v)
        : p.v);
  return h('div', { class: 'wk-md' }, mdBlocks(text).map(b => b.t === 'h' ? h(`h${b.level + 1}`, null, inl(b.text)) : b.t === 'ul' ? h('ul', null, b.items.map(x => h('li', null, inl(x))))
    : b.t === 'ol' ? h('ol', null, b.items.map(x => h('li', null, inl(x)))) : b.t === 'quote' ? h('blockquote', null, inl(b.text)) : b.t === 'code' ? h('pre', null, h('code', null, b.text))
      : b.t === 'hr' ? h('hr') : h('p', null, inl(b.text))));
}

export async function publicView(data) {
  const { doc, entries } = data;
  const pages = new Map(entries.filter(e => e.kind === 'page').map(e => [e.data.slug, e]));
  const view = h('div', { class: 'wk-pubpage' }), nav = h('nav', { class: 'wk-pubnav' });
  const show = (slug) => {
    const p = pages.get(slug) || pages.get(HOME) || [...pages.values()][0];
    h(clear(view), null, p ? [h('h2', null, p.data.title), renderMd(p.data.body, { exists: (s) => pages.has(s), onWiki: (s) => { if (pages.has(s)) show(s); } })] : h('p', { class: 'muted' }, 'Wikien er tom.'));
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b.dataset.slug === p?.data.slug));
  };
  h(nav, null, [...pages.values()].sort((a, b) => (b.data.slug === HOME) - (a.data.slug === HOME) || a.data.title.localeCompare(b.data.title, 'da')).map(p => h('button', { class: 'wl-filter', dataset: { slug: p.data.slug }, onclick: () => show(p.data.slug) }, icon(p.data.slug === HOME ? 'home' : 'file'), p.data.title)));
  show(HOME);
  return h('div', { class: 'pub-card wk-pub' }, h('h1', null, doc.title), h('div', { class: 'wk-pubwrap' }, nav, view));
}

export default {
  title: 'Wiki',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('wiki');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';

    async function list() {
      self._off?.(); self._off = onShared('wiki', () => { if (document.body.contains(root)) list(); });
      let docs;
      try { docs = await sh.list('wiki'); } catch (e) { h(clear(root), null, loadError('Wiki', e)); return; }
      const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'sh-card-h' }, h('b', null, d.title), visChip(d)),
        d.data.desc ? h('span', { class: 'faint' }, d.data.desc) : null,
        h('div', { class: 'sh-meta' }, h('span', null, icon('file'), ` ${d.counts.page || 0} sider`), d.role === 'owner' ? null : person(d.owner), h('span', null, `rettet ${ago(d.updated)}`)));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Ny wiki')),
        docs.length ? h('div', { class: 'sh-list' }, docs.map(card)) : emptyState('book', 'Ingen wikier endnu', 'Lav en fælles notesbog: klassens noter, klubbens regler, guides til jeres spil – sider der linker til hinanden, og som alle kan rette i.', h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Lav den første')));
    }
    async function create() {
      const title = h('input', { class: 'input', maxlength: 100, placeholder: 'Fx 8.B’s noter', 'aria-label': 'Navn på wikien' });
      const desc = h('input', { class: 'input', maxlength: 200, placeholder: 'Hvad handler den om? (valgfrit)', 'aria-label': 'Kort beskrivelse' });
      const err = h('div', { class: 'field-error' });
      h(clear(root), null, panel('Ny wiki', 'book', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), title), desc, err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: list }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: async () => {
          if (!title.value.trim()) { err.textContent = 'Giv wikien et navn.'; return; }
          try {
            const d = await sh.create('wiki', { title: title.value.trim(), data: { desc: desc.value.trim() }, visibility: 'private' });
            await sh.add(d.id, 'page', { slug: HOME, title: 'Forside', body: STARTER(title.value.trim()) });
            location.hash = `#/apps/${PAGE}/d/${d.id}?share=1`;
          } catch (e) { err.textContent = e.message; }
        } }, icon('check'), 'Opret'))));
      title.focus();
    }

    async function detail(id, slug = HOME, mode = 'read') {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Wikien findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle wikier'))); return; }
      }
      const { doc, entries } = res, owner = doc.role === 'owner';
      const pages = new Map(entries.filter(e => e.kind === 'page').map(e => [e.data.slug, e]));
      self._off?.(); self._off = onShared('wiki', (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root) && !root.querySelector('.wk-editor')) detail(id, cur, 'read'); }, id);
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, SHARE)) detail(id, slug); }, 50); }
      let cur = slug, filter = '';
      const go = (s, title) => { if (pages.has(s)) { cur = s; draw('read'); } else { cur = s; draw('edit', title); } };
      const nav = h('nav', { class: 'wk-nav', 'aria-label': 'Sider' }), main = h('article', { class: 'wk-main' });
      const sorted = () => [...pages.values()].sort((a, b) => (b.data.slug === HOME) - (a.data.slug === HOME) || a.data.title.localeCompare(b.data.title, 'da'));
      const drawNav = () => h(clear(nav), null,
        h('input', { class: 'input', type: 'search', placeholder: 'Find en side', value: filter, 'aria-label': 'Find en side', oninput: (e) => { filter = e.target.value.toLowerCase(); drawNav(); nav.querySelector('input').focus(); } }),
        h('div', { class: 'wk-pages' }, sorted().filter(p => !filter || p.data.title.toLowerCase().includes(filter) || (p.data.body || '').toLowerCase().includes(filter)).map(p => h('button', { class: ['wl-filter', p.data.slug === cur && 'is-on'], onclick: () => go(p.data.slug) }, icon(p.data.slug === HOME ? 'home' : 'file'), p.data.title))),
        h('form', { class: 'wk-new', onsubmit: (e) => { e.preventDefault(); const t = e.target.elements[0].value.trim(); if (t) go(slugify(t), t); } },
          h('input', { class: 'input', maxlength: 100, placeholder: 'Ny side …', 'aria-label': 'Navn på ny side' }), h('button', { class: 'icon-btn', type: 'submit', 'aria-label': 'Lav siden' }, icon('plus'))));
      function draw(m, newTitle) {
        drawNav();
        const p = pages.get(cur);
        if (m === 'edit') return editor(p, newTitle);
        if (m === 'history') return showHistory(p);
        if (!p) { cur = HOME; if (!pages.has(HOME)) return editor(null, 'Forside'); return draw('read'); }
        const backlinks = sorted().filter(x => x.data.slug !== cur && wikiLinks(x.data.body).includes(cur));
        h(clear(main), null,
          h('div', { class: 'wk-head' }, h('h2', null, p.data.title), h('span', { style: { flex: 1 } }),
            h('button', { class: 'btn btn-sm btn-primary', onclick: () => draw('edit') }, icon('edit'), 'Ret'),
            p.data.history?.length ? h('button', { class: 'btn btn-sm', onclick: () => draw('history') }, icon('clock'), 'Historik') : null,
            cur !== HOME && (owner || p.mine) ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet siden', onclick: async () => { if (await confirmDialog({ title: `Slet “${p.data.title}”?`, confirmLabel: 'Slet', danger: true })) { await sh.remove(p.id); detail(id, HOME); } } }, icon('trash')) : null),
          renderMd(p.data.body, { onWiki: go, exists: (s) => pages.has(s) }),
          h('footer', { class: 'wk-foot faint' }, h('span', null, `Rettet ${ago(p.edited || p.at)}`), p.user ? h('span', null, ' · startet af ', person(p.user)) : null,
            backlinks.length ? h('div', { class: 'wk-back' }, h('span', null, 'Linker hertil: '), backlinks.map(b => h('button', { class: 'sh-tag', onclick: () => go(b.data.slug) }, b.data.title))) : null));
      }
      function editor(p, newTitle) {
        const title = h('input', { class: 'input', maxlength: 100, value: p?.data.title || newTitle || '', 'aria-label': 'Sidens titel', disabled: cur === HOME && !!p });
        const body = h('textarea', { class: 'textarea wk-text', rows: 18, maxlength: 50000, 'aria-label': 'Sidens tekst' }); body.value = p?.data.body || `# ${newTitle || ''}\n\n`;
        const prev = h('div', { class: 'wk-preview' });
        const drawPrev = () => h(clear(prev), null, renderMd(body.value, { exists: (s) => pages.has(s) || s === cur }));
        body.addEventListener('input', drawPrev); drawPrev();
        const ins = (before, after = '', ph = 'tekst') => { const s = body.selectionStart, e = body.selectionEnd, sel = body.value.slice(s, e) || ph; body.setRangeText(before + sel + after, s, e, 'select'); body.focus(); drawPrev(); };
        const save = async () => {
          const t = title.value.trim(); if (!t) return toast('Siden skal have en titel', { type: 'warn' });
          const slugNow = p ? p.data.slug : cur;
          try {
            if (p) await sh.edit(p.id, { ...p.data, title: t, body: body.value, history: undefined });
            else await sh.add(doc.id, 'page', { slug: slugNow, title: t, body: body.value });
            toast('Siden er gemt', { type: 'ok' }); detail(id, slugNow);
          } catch (e) { toast('Kunne ikke gemme', { type: 'bad', text: e.message }); }
        };
        body.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
        h(clear(main), null, h('div', { class: 'wk-editor stack' },
          h('div', { class: 'wk-head' }, h('h2', null, p ? 'Ret siden' : 'Ny side'), h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-sm', onclick: () => (p ? draw('read') : detail(id, HOME)) }, 'Annuller'), h('button', { class: 'btn btn-sm btn-primary', onclick: save }, icon('check'), 'Gem')),
          title,
          h('div', { class: 'wk-tools' }, [['Overskrift', () => ins('\n## ', '', 'Overskrift')], ['Fed', () => ins('**', '**')], ['Kursiv', () => ins('*', '*')], ['Punkt', () => ins('\n- ', '', 'punkt')], ['Link til side', () => ins('[[', ']]', 'Side')], ['Kode', () => ins('`', '`')]].map(([l, fn]) => h('button', { class: 'btn btn-sm', onclick: fn }, l))),
          h('div', { class: 'wk-split' }, body, prev),
          h('p', { class: 'faint', style: { margin: 0 } }, 'Skriv [[Navn]] for et link til en anden side · # overskrift · - punkt · **fed** · Ctrl + S gemmer')));
        (p ? body : title).focus();
      }
      function showHistory(p) {
        const hist = (p.data.history || []).slice().reverse();
        h(clear(main), null, h('div', { class: 'wk-head' }, h('h2', null, `Historik: ${p.data.title}`), h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-sm', onclick: () => draw('read') }, icon('arrowLeft'), 'Tilbage')),
          h('p', { class: 'faint' }, 'De seneste ti versioner gemmes. Du kan hente en gammel version tilbage.'),
          hist.map((v, i) => panel(null, null, h('div', { class: 'sh-meta' }, h('b', null, i === 0 ? 'Forrige version' : `${i + 1} versioner siden`), h('span', null, ago(v.at)), h('span', { style: { flex: 1 } }),
            h('button', { class: 'btn btn-sm', onclick: async () => { await sh.edit(p.id, { ...p.data, body: v.body, history: undefined }); toast('Den gamle version er hentet tilbage', { type: 'ok' }); detail(id, cur); } }, icon('undo'), 'Gendan')),
            h('details', null, h('summary', null, 'Vis tekst'), renderMd(v.body)))));
      }
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title), visChip(doc),
          owner || doc.role === 'editor' ? h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, SHARE)) detail(id, cur); } }, icon('share'), 'Del') : null,
          owner ? h('button', { class: 'icon-btn', 'aria-label': 'Slet wikien', onclick: async () => { if (await confirmDialog({ title: 'Slet hele wikien?', text: 'Alle sider slettes for alle.', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null),
        h('div', { class: 'wk-wrap' }, nav, main));
      draw(mode);
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page wk-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Wiki', lead: 'En fælles notesbog med sider, der linker til hinanden. Alle inviterede kan skrive – og hver side husker sine seneste versioner.', compact: true }), root);
  },
};
