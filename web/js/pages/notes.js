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

const COLORS = [
  ['', 'Ingen farve'], ['#ffa63d', 'Rav'], ['#ff4f8b', 'Pink'], ['#22d3ee', 'Cyan'], ['#4ade80', 'Grøn'], ['#a78bfa', 'Violet'],
];
const LS_SEL = 'hubtech.notes.selected';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const words = (s) => (s.trim().match(/\S+/g) || []).length;

let st = null, sel = null, onKey = null;

export default {
  title: 'Noter',
  destroy() { flushState('notes'); removeEventListener('keydown', onKey); },
  async render() {
    const app = appById('notes');
    try { st = (await getState('notes', { force: true })) || { notes: [] }; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Noterne kunne ikke hentes', text: e.message })); }
    if (!Array.isArray(st.notes)) st.notes = [];
    try { sel = localStorage.getItem(LS_SEL); } catch { sel = null; }
    if (!st.notes.some(n => n.id === sel)) sel = sorted()[0]?.id || null;

    const v = { n: h('span'), pinned: h('span'), words: h('span'), last: h('span') };
    const stats = () => {
      v.n.textContent = String(st.notes.length);
      v.pinned.textContent = String(st.notes.filter(n => n.pinned).length);
      v.words.textContent = st.notes.reduce((a, n) => a + words(n.title + ' ' + n.body), 0).toLocaleString('da-DK');
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
      return [...st.notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));
    }
    const q = { v: '' };
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i noter…', 'aria-label': 'Søg i noter' });
    search.addEventListener('input', debounce(() => { q.v = search.value.trim().toLowerCase(); drawList(); }, 100));
    const list = h('div', { class: 'note-list', role: 'listbox', 'aria-label': 'Noter' });
    const editor = h('div', { class: 'note-editor glass' });

    function newNote() {
      const now = Date.now();
      const n = { id: uid(), title: '', body: '', pinned: false, color: '', created: now, updated: now };
      st.notes.unshift(n);
      select(n.id);
      persist();
      logActivity('notes', 'new', 'Ny note', 'Note oprettet');
      setTimeout(() => editor.querySelector('.note-title')?.focus(), 30);
    }
    function select(id) {
      sel = id;
      try { localStorage.setItem(LS_SEL, id || ''); } catch { /* */ }
      drawList(); drawEditor();
    }

    function drawList() {
      clear(list);
      const items = sorted().filter(n => !q.v || (n.title + ' ' + n.body).toLowerCase().includes(q.v));
      if (!items.length) {
        list.appendChild(h('p', { class: 'faint', style: { padding: '14px', fontSize: 'var(--fs-sm)' } }, q.v ? `Ingen noter matcher “${q.v}”.` : 'Ingen noter endnu.'));
        return;
      }
      for (const n of items) {
        const snippet = n.body.trim().split('\n').find(Boolean) || 'Tom note';
        list.appendChild(h('button', { class: ['note-item', n.id === sel && 'is-active'], role: 'option', 'aria-selected': String(n.id === sel), style: { '--note': n.color || 'var(--line-2)' }, onclick: () => select(n.id) },
          h('div', { class: 'note-item-top' },
            h('b', null, n.title.trim() || 'Uden titel'),
            n.pinned ? h('span', { class: 'note-pin', html: svg('starFill'), 'aria-label': 'Fastgjort' }) : null),
          h('span', { class: 'note-snip' }, snippet),
          h('span', { class: 'note-when' }, timeAgo((n.updated || n.created) / 1000))));
      }
    }

    function drawEditor() {
      clear(editor);
      const n = st.notes.find(x => x.id === sel);
      if (!n) {
        editor.appendChild(stateBlock({ app: app.hue, icon: 'note', title: st.notes.length ? 'Vælg en note' : 'Skriv din første note', text: 'Idéer, mødenoter, huskelister – noterne gemmes automatisk på din konto.', actions: [h('button', { class: 'btn app-solid', onclick: newNote }, icon('plus'), 'Ny note')] }));
        return;
      }
      const touch = () => { n.updated = Date.now(); persist(); };
      const titleIn = h('input', { class: 'note-title', value: n.title, placeholder: 'Titel', maxlength: 160, 'aria-label': 'Titel' });
      const body = h('textarea', { class: 'note-body', placeholder: 'Skriv her…', 'aria-label': 'Indhold' }); body.value = n.body;
      const count = h('span', { class: 'faint' }, `${words(n.body)} ord`);
      const relist = debounce(drawList, 400);
      titleIn.addEventListener('input', () => { n.title = titleIn.value; touch(); relist(); });
      body.addEventListener('input', () => { n.body = body.value; count.textContent = `${words(n.body)} ord`; touch(); relist(); });
      const pin = h('button', { class: 'icon-btn', 'aria-pressed': String(!!n.pinned), 'aria-label': n.pinned ? 'Frigør' : 'Fastgør', title: n.pinned ? 'Frigør' : 'Fastgør øverst', html: svg(n.pinned ? 'starFill' : 'star'), style: { color: n.pinned ? 'var(--warn)' : null } });
      pin.addEventListener('click', () => { n.pinned = !n.pinned; touch(); drawList(); drawEditor(); });
      const swatches = h('div', { class: 'note-swatches', role: 'group', 'aria-label': 'Farve' }, COLORS.map(([c, l]) => h('button', {
        class: 'note-swatch', 'aria-label': l, title: l, 'aria-pressed': String((n.color || '') === c), style: { '--sw': c || 'transparent' },
        onclick: () => { n.color = c; touch(); drawList(); drawEditor(); },
      })));
      const del = h('button', { class: 'icon-btn', 'aria-label': 'Slet note', title: 'Slet', html: svg('trash') });
      del.addEventListener('click', async () => {
        if ((n.title || n.body) && !await confirmDialog({ title: 'Slet note?', text: `“${n.title || 'Uden titel'}” slettes permanent.`, confirmLabel: 'Slet', danger: true })) return;
        st.notes = st.notes.filter(x => x !== n); persist();
        select(sorted()[0]?.id || null);
      });
      const copy = h('button', { class: 'icon-btn', 'aria-label': 'Kopiér tekst', title: 'Kopiér', html: svg('copy') });
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText((n.title ? n.title + '\n\n' : '') + n.body); toast('Kopieret', { type: 'ok', ms: 1200 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } });
      editor.style.setProperty('--note', n.color || 'var(--app)');
      editor.append(
        h('div', { class: 'note-toolbar' }, swatches, h('span', { style: { flex: 1 } }), pin, copy,
          h('button', { class: 'icon-btn', 'aria-label': 'Del noten i Fællesskab', title: 'Del i en chat', onclick: () => import('../features/sharechat.js').then(x => x.shareToChat({ kind: 'note', title: n.title || 'Note', body: String(n.body || '').slice(0, 3000) })), html: svg('share') }),
          h('button', { class: 'icon-btn', 'aria-label': 'Print eller hent som PDF', title: 'Print / PDF', onclick: () => printDialog(n), html: svg('file') }), del),
        titleIn, body,
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

    stats(); drawList(); drawEditor();
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
          list),
        editor));
  },
};
