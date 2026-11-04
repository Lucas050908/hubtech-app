/** Noter — quick notes, autosaved on the server per user. */
import { h, clear, debounce, timeAgo } from '../core/dom.js';
import { query } from '../core/router.js';
import { icon, svg } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, confirmDialog, stateBlock, modal, segmented } from '../core/ui.js';
import { saveBlob } from '../core/files.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { tagsOf, toggleLine, continueList } from '../features/notetext.js';
const TRASH_DAYS = 30;

const COLORS = [
  ['', 'Ingen farve'], ['#ffa63d', 'Rav'], ['#ff4f8b', 'Pink'], ['#22d3ee', 'Cyan'], ['#4ade80', 'Grøn'], ['#a78bfa', 'Violet'],
];
const LS_SEL = 'hubtech.notes.selected';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const words = (s) => (s.trim().match(/\S+/g) || []).length;

let st = null, sel = null, onKey = null, mode = 'write';

export default {
  title: 'Noter',
  destroy() { flushState('notes'); removeEventListener('keydown', onKey); },
  async render() {
    const app = appById('notes');
    try { st = (await getState('notes', { force: true })) || { notes: [] }; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Noterne kunne ikke hentes', text: e.message })); }
    if (!Array.isArray(st.notes)) st.notes = [];
    const cutoff = Date.now() - TRASH_DAYS * 86400000;
    if (st.notes.some(n => n.trashed && n.trashed < cutoff)) { st.notes = st.notes.filter(n => !(n.trashed && n.trashed < cutoff)); saveState('notes', st); }
    let trashMode = false, tag = '';
    const live = () => st.notes.filter(n => !n.trashed);
    try { sel = localStorage.getItem(LS_SEL); } catch { sel = null; }
    if (!st.notes.some(n => n.id === sel)) sel = sorted()[0]?.id || null;

    const v = { n: h('span'), pinned: h('span'), words: h('span'), last: h('span') };
    const stats = () => {
      v.n.textContent = String(live().length);
      v.pinned.textContent = String(live().filter(n => n.pinned).length);
      v.words.textContent = live().reduce((a, n) => a + words(n.title + ' ' + n.body), 0).toLocaleString('da-DK');
      const last = Math.max(0, ...st.notes.map(n => n.updated || 0));
      v.last.textContent = last ? timeAgo(last / 1000) : '—';
    };
    let failed = false;
    const saveLabel = h('span', { class: 'note-save faint' }, '');
    const persist = () => {
      saveLabel.textContent = 'Gemmer…';
      saveState('notes', st, { onError: () => { saveLabel.textContent = 'Ikke gemt – tjek serveren'; if (!failed) { failed = true; toast('Noten kunne ikke gemmes', { type: 'bad' }); } } });
      clearTimeout(persist.t);
      persist.t = setTimeout(() => { if (!failed) saveLabel.textContent = 'Gemt ✓'; }, 900);
      failed = false;
      stats();
    };

    function sorted() {
      return st.notes.filter(n => !!n.trashed === trashMode).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));
    }
    const q = { v: '' };
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i noter…', 'aria-label': 'Søg i noter' });
    search.addEventListener('input', debounce(() => { q.v = search.value.trim().toLowerCase(); drawList(); }, 100));
    const list = h('div', { class: 'note-list', role: 'listbox', 'aria-label': 'Noter' });
    const editor = h('div', { class: 'note-editor glass' });

    function newNote() {
      if (trashMode) { trashMode = false; drawSideBits(); }
      const now = Date.now();
      const n = { id: uid(), title: '', body: tag ? `\n\n#${tag}` : '', pinned: false, color: '', created: now, updated: now };
      mode = 'write';
      st.notes.unshift(n);
      select(n.id);
      persist();
      logActivity('notes', 'new', 'Ny note', 'Note oprettet');
      setTimeout(() => { if (!editor.contains(document.activeElement)) editor.querySelector('.note-title')?.focus(); }, 30);   // never steal focus from the body
    }
    function select(id) {
      sel = id;
      try { localStorage.setItem(LS_SEL, id || ''); } catch { /* */ }
      drawList(); drawEditor();
    }

    function drawList() {
      clear(list);
      const items = sorted().filter(n => (!q.v || (n.title + ' ' + n.body).toLowerCase().includes(q.v)) && (trashMode || !tag || tagsOf(n.body + ' ' + n.title).includes(tag)));
      if (!items.length) {
        list.appendChild(h('p', { class: 'faint', style: { padding: '14px', fontSize: 'var(--fs-sm)' } }, trashMode ? 'Papirkurven er tom.' : q.v ? `Ingen noter matcher “${q.v}”.` : tag ? `Ingen noter med #${tag}.` : 'Ingen noter endnu.'));
        return;
      }
      for (const n of items) {
        const snippet = (n.body.trim().split('\n').find(Boolean) || 'Tom note').replace(/^\s*(?:[-*]\s+)?\[ \]/, '☐').replace(/^\s*(?:[-*]\s+)?\[[xX]\]/, '☑');
        list.appendChild(h('button', { class: ['note-item', n.id === sel && 'is-active'], role: 'option', 'aria-selected': String(n.id === sel), style: { '--note': n.color || 'var(--line-2)' }, onclick: () => select(n.id) },
          h('div', { class: 'note-item-top' },
            h('b', null, n.title.trim() || 'Uden titel'),
            n.pinned ? h('span', { class: 'note-pin', html: svg('starFill'), 'aria-label': 'Fastgjort' }) : null),
          h('span', { class: 'note-snip' }, snippet),
          h('span', { class: 'note-when' }, trashMode ? `Slettet ${timeAgo(n.trashed / 1000)}` : timeAgo((n.updated || n.created) / 1000))));
      }
    }
    // tags and the wastebasket under the list
    const sideBits = h('div', { class: 'note-sidebits' });
    function drawSideBits() {
      const tags = {};
      for (const n of live()) for (const t of tagsOf(n.body + ' ' + n.title)) tags[t] = (tags[t] || 0) + 1;
      const trashed = st.notes.length - live().length;
      if (tag && !tags[tag]) tag = '';
      h(clear(sideBits), null,
        Object.keys(tags).length && !trashMode ? h('div', { class: 'note-tags', role: 'group', 'aria-label': 'Emner' }, Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t, c]) =>
          h('button', { type: 'button', class: ['chip', 'note-tag', t === tag && 'is-on'], 'aria-pressed': String(t === tag), onclick: () => { tag = t === tag ? '' : t; drawSideBits(); drawList(); } }, `#${t}`, h('small', null, String(c))))) : null,
        trashed || trashMode ? h('button', { type: 'button', class: ['btn', 'btn-sm', 'btn-ghost', 'note-trash-btn', trashMode && 'is-on'], onclick: () => { trashMode = !trashMode; tag = ''; drawSideBits(); select(sorted()[0]?.id || null); } },
          icon(trashMode ? 'chevronLeft' : 'trash'), trashMode ? 'Tilbage til noterne' : `Papirkurv (${trashed})`) : null,
        trashMode && trashed ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', style: { color: 'var(--bad)' }, onclick: async () => {
          if (!await confirmDialog({ title: 'Tøm papirkurven?', text: `${trashed} ${trashed === 1 ? 'note' : 'noter'} slettes for altid.`, confirmLabel: 'Tøm', danger: true })) return;
          st.notes = live(); persist(); drawSideBits(); select(null);
        } }, 'Tøm papirkurven') : null);
    }
    function trash(n) {
      n.trashed = Date.now(); persist();
      select(sorted()[0]?.id || null); drawSideBits();
      toast('Noten er lagt i papirkurven', { text: n.title || 'Uden titel', action: { label: 'Fortryd', onClick: () => { delete n.trashed; persist(); select(n.id); drawSideBits(); } } });
    }
    // read mode: headings, bullets, clickable checkboxes, links and tags
    function rendered(n, onChange) {
      const out = h('div', { class: 'note-view' });
      const inline = (text) => {
        const parts = []; let last = 0;
        const rx = /(https?:\/\/[^\s<]+)|(^|\s)#([\p{L}\p{N}_-]{2,30})|\*\*([^*]+)\*\*/gu;
        let m;
        while ((m = rx.exec(text))) {
          parts.push(text.slice(last, m.index));
          if (m[1]) parts.push(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer' }, m[1]));
          else if (m[3]) parts.push(m[2], h('button', { type: 'button', class: 'chip note-tag', onclick: () => { tag = m[3].toLowerCase(); drawSideBits(); drawList(); } }, `#${m[3]}`));
          else parts.push(h('b', null, m[4]));
          last = m.index + m[0].length;
        }
        parts.push(text.slice(last));
        return parts;
      };
      const lines = String(n.body || '').split('\n');
      let ul = null;
      lines.forEach((l, i) => {
        const ck = /^(\s*)(?:[-*]\s+)?\[( |x|X)\]\s?(.*)$/.exec(l), bl = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l), hd = /^(#{1,3})\s+(.*)$/.exec(l);
        if (ck) {
          ul = null;
          out.append(h('label', { class: ['note-ck', ck[2] !== ' ' && 'is-done'] }, h('input', { type: 'checkbox', checked: ck[2] !== ' ', onchange: () => { n.body = toggleLine(n.body, i); onChange(); } }), h('span', null, ...inline(ck[3]))));
        } else if (hd) { ul = null; out.append(h(`h${hd[1].length + 1}`, null, ...inline(hd[2]))); }
        else if (bl) { if (!ul) { ul = h('ul'); out.append(ul); } ul.append(h('li', null, ...inline(bl[1]))); }
        else { ul = null; out.append(l.trim() ? h('p', null, ...inline(l)) : h('div', { class: 'note-gap' })); }
      });
      if (!n.body.trim()) out.append(h('p', { class: 'faint' }, 'Noten er tom – skift til “Skriv”.'));
      return out;
    }

    function drawEditor() {
      clear(editor);
      const n = st.notes.find(x => x.id === sel);
      if (!n) {
        editor.appendChild(trashMode ? stateBlock({ app: app.hue, icon: 'trash', title: 'Papirkurven', text: `Slettede noter ligger her i ${TRASH_DAYS} dage, så du kan fortryde.` })
          : stateBlock({ app: app.hue, icon: 'note', title: live().length ? 'Vælg en note' : 'Skriv din første note', text: 'Idéer, mødenoter, huskelister – noterne gemmes automatisk på din konto. Skriv #emne for at samle noter, og [ ] for en tjekliste.', actions: [h('button', { class: 'btn app-solid', onclick: newNote }, icon('plus'), 'Ny note')] }));
        return;
      }
      if (n.trashed) {
        editor.style.setProperty('--note', n.color || 'var(--app)');
        editor.append(h('div', { class: 'callout warn' }, icon('trash'), h('div', null, h('strong', null, 'Noten ligger i papirkurven. '), `Den slettes for altid ${new Date(n.trashed + TRASH_DAYS * 86400000).toLocaleDateString('da-DK', { day: 'numeric', month: 'long' })}.`),
          h('div', { class: 'row', style: { gap: '8px', marginLeft: 'auto' } },
            h('button', { class: 'btn btn-sm btn-primary', onclick: () => { delete n.trashed; persist(); trashMode = false; drawSideBits(); select(n.id); toast('Noten er gendannet', { type: 'ok' }); } }, icon('refresh'), 'Gendan'),
            h('button', { class: 'btn btn-sm btn-ghost', style: { color: 'var(--bad)' }, onclick: async () => { if (!await confirmDialog({ title: 'Slet for altid?', text: `“${n.title || 'Uden titel'}” kan ikke gendannes bagefter.`, confirmLabel: 'Slet', danger: true })) return; st.notes = st.notes.filter(x => x !== n); persist(); drawSideBits(); select(sorted()[0]?.id || null); } }, 'Slet for altid'))),
          h('h2', { class: 'note-title' }, n.title || 'Uden titel'), rendered(n, () => {}));
        return;
      }
      const touch = () => { n.updated = Date.now(); persist(); };
      const titleIn = h('input', { class: 'note-title', value: n.title, placeholder: 'Titel', maxlength: 160, 'aria-label': 'Titel' });
      const body = h('textarea', { class: 'note-body', placeholder: 'Skriv her…', 'aria-label': 'Indhold' }); body.value = n.body;
      const count = h('span', { class: 'faint' }, `${words(n.body)} ord`);
      const relist = debounce(drawList, 400);
      titleIn.addEventListener('input', () => { n.title = titleIn.value; touch(); relist(); });
      const retag = debounce(drawSideBits, 800);
      body.addEventListener('input', () => { n.body = body.value; count.textContent = `${words(n.body)} ord`; touch(); relist(); retag(); });
      body.addEventListener('keydown', (e) => {   // Enter keeps a list or checklist going; Enter on an empty bullet ends it
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing || body.selectionStart !== body.selectionEnd) return;
        const r = continueList(body.value, body.selectionStart);
        if (!r) return;
        e.preventDefault();
        if (r.insert) body.setRangeText(r.insert, body.selectionStart, body.selectionStart, 'end');
        else body.setRangeText('', r.clear[0], r.clear[1], 'end');
        body.dispatchEvent(new Event('input'));
      });
      const insertCheck = () => {
        mode = 'write';
        const at = body.selectionStart ?? body.value.length, ls = body.value.lastIndexOf('\n', at - 1) + 1;
        if (/^\s*(?:[-*]\s+)?\[[ xX]\]/.test(body.value.slice(ls))) { body.focus(); return; }
        body.setRangeText('[ ] ', ls, ls, 'end'); body.focus(); body.dispatchEvent(new Event('input'));
      };
      const view = rendered(n, () => { touch(); drawList(); drawEditor(); });
      const modeSeg = segmented([{ value: 'write', label: 'Skriv', icon: 'edit' }, { value: 'read', label: 'Vis', icon: 'eye' }], mode, (x) => { mode = x; drawEditor(); }, { label: 'Visning' });
      const pin = h('button', { class: 'icon-btn', 'aria-pressed': String(!!n.pinned), 'aria-label': n.pinned ? 'Frigør' : 'Fastgør', title: n.pinned ? 'Frigør' : 'Fastgør øverst', html: svg(n.pinned ? 'starFill' : 'star'), style: { color: n.pinned ? 'var(--warn)' : null } });
      pin.addEventListener('click', () => { n.pinned = !n.pinned; touch(); drawList(); drawEditor(); });
      const swatches = h('div', { class: 'note-swatches', role: 'group', 'aria-label': 'Farve' }, COLORS.map(([c, l]) => h('button', {
        class: 'note-swatch', 'aria-label': l, title: l, 'aria-pressed': String((n.color || '') === c), style: { '--sw': c || 'transparent' },
        onclick: () => { n.color = c; touch(); drawList(); drawEditor(); },
      })));
      const del = h('button', { class: 'icon-btn', 'aria-label': 'Læg i papirkurven', title: 'Slet (kan fortrydes)', html: svg('trash') });
      del.addEventListener('click', () => {
        if (!n.title.trim() && !n.body.trim()) { st.notes = st.notes.filter(x => x !== n); persist(); select(sorted()[0]?.id || null); return; }
        trash(n);
      });
      const copy = h('button', { class: 'icon-btn', 'aria-label': 'Kopiér tekst', title: 'Kopiér', html: svg('copy') });
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText((n.title ? n.title + '\n\n' : '') + n.body); toast('Kopieret', { type: 'ok', ms: 1200 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } });
      editor.style.setProperty('--note', n.color || 'var(--app)');
      editor.append(
        h('div', { class: 'note-toolbar' }, swatches, h('span', { style: { flex: 1 } }), modeSeg,
          h('button', { class: 'icon-btn', 'aria-label': 'Tjekliste-punkt', title: 'Tjekliste-punkt ([ ])', onclick: insertCheck }, icon('checkCircle')), pin, copy,
          h('button', { class: 'icon-btn', 'aria-label': 'Del noten i Fællesskab', title: 'Del i en chat', onclick: () => import('../features/sharechat.js').then(x => x.shareToChat({ kind: 'note', title: n.title || 'Note', body: String(n.body || '').slice(0, 3000) })), html: svg('share') }),
          h('button', { class: 'icon-btn', 'aria-label': 'Print eller hent som PDF', title: 'Print / PDF', onclick: () => printDialog(n), html: svg('file') }), del),
        titleIn, mode === 'read' ? view : body,
        h('div', { class: 'note-foot' }, count, h('span', null, '·'), h('span', { class: 'faint' }, `Oprettet ${new Date(n.created).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })}`), h('span', { style: { flex: 1 } }), saveLabel));
    }

    // ── print / PDF ──
    function printDialog(one) {
      let scope = one ? 'one' : 'all';
      const seg = one ? segmented([{ value: 'one', label: 'Denne note' }, { value: 'all', label: `Alle noter (${st.notes.length})` }], scope, (v) => { scope = v; }, { label: 'Hvad' }) : null;
      const pick = () => scope === 'one' && one ? [one] : sorted();
      const go = async (how, btn) => {
        btn.disabled = true;
        try {
          const np = await import('../features/noteprint.js');
          const notes = pick(), single = notes.length === 1;
          if (how === 'pdf') await saveBlob(`${single ? (notes[0].title || 'Note').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) : 'Noter'}.pdf`, await np.notesPdf(notes, { single }));
          else { const { printDocument } = await import('../features/printing.js'); await printDocument({ title: single ? (notes[0].title || 'Note') : 'Noter', css: np.NOTE_CSS, body: np.notesHtml(notes, { single }), accent: '#7c3aed' }); }
          m.close();
        } catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); }
        finally { btn.disabled = false; }
      };
      const pBtn = h('button', { class: 'btn', onclick: () => go('print', pBtn) }, icon('file'), 'Print');
      const dBtn = h('button', { class: 'btn btn-primary', onclick: () => go('pdf', dBtn) }, icon('download'), 'Hent PDF');
      const m = modal({ title: 'Print eller hent noter', label: 'Noter', size: 480,
        body: h('div', { class: 'cal-print' }, seg ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Hvad'), seg) : h('p', { class: 'muted', style: { margin: 0 } }, `Alle ${st.notes.length} noter – fastgjorte først.`),
          h('p', { class: 'faint', style: { margin: 0 } }, 'A4 med titel, dato og farvemarkering. Tjeklister ([ ] og [x]) vises som afkrydsningsfelter.')),
        actions: [pBtn, dBtn] });
    }

    // keyboard: Ctrl/⌘+Alt+N = new note
    removeEventListener('keydown', onKey);
    onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newNote(); } };
    addEventListener('keydown', onKey);

    stats(); drawList(); drawEditor(); drawSideBits();
    if (query().get('new')) { history.replaceState(null, '', '#/apps/notes'); setTimeout(newNote, 200); }
    return h('div', { class: 'page notes-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Arbejdsrum', title: 'Noter', lead: 'Skriv ned, før du glemmer det. Noterne gemmes automatisk på din konto og følger dig på alle enheder.',
        actions: [heroBtn('Ny note', 'plus', { onclick: newNote }), heroGhost('Print / PDF', 'file', { onclick: () => st.notes.length ? printDialog(null) : toast('Ingen noter at printe') })],
        stats: [
          { icon: 'note', label: 'Noter', value: v.n },
          { icon: 'star', label: 'Fastgjort', value: v.pinned },
          { icon: 'edit', label: 'Ord i alt', value: v.words },
          { icon: 'clock', label: 'Senest ændret', value: v.last }],
      }),
      h('div', { class: 'notes-layout' },
        h('aside', { class: 'glass panel note-side' },
          h('div', { class: 'note-side-head' }, h('div', { class: 'pt-search' }, icon('search'), search),
            h('button', { class: 'icon-btn', 'aria-label': 'Ny note', title: 'Ny note (Ctrl+Alt+N)', onclick: newNote }, icon('plus'))),
          list, sideBits),
        editor));
  },
};
