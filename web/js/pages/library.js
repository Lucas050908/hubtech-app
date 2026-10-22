/** Bøger og film – what you want to read, watch and play, what you're in the middle of, and what you thought of it. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented, modal } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { todayISO } from '../features/gamelogic.js';
import * as L from '../features/library.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const stars = (n, onPick, label = 'Bedømmelse') => h('span', { class: 'bk-stars', role: onPick ? 'radiogroup' : 'img', 'aria-label': onPick ? label : `${n || 0} af 5 stjerner` },
  [1, 2, 3, 4, 5].map(i => onPick
    ? h('button', { type: 'button', class: ['bk-star', i <= (n || 0) && 'is-on'], role: 'radio', 'aria-checked': String(i === n), 'aria-label': `${i} ${i === 1 ? 'stjerne' : 'stjerner'}`, onclick: () => onPick(i === n ? 0 : i) }, '★')
    : h('span', { class: ['bk-star', i <= (n || 0) && 'is-on'] }, '★')));

export default {
  title: 'Bøger og film',
  async render(ctx) {
    const app = appById('library');
    let store;
    try { store = await appState('library', { items: [], goal: {}, view: { kind: 'all', status: 'all', sort: 'status' } }); } catch (e) { return loadError('Bøger og film', e); }
    const st = store.data;
    st.items = st.items || []; st.goal = st.goal || {}; st.view = st.view || { kind: 'all', status: 'all', sort: 'status' };
    let tab = ctx?.params?.sub === 'stats' ? 'stats' : 'list', q = '';
    const body = h('div', { class: 'stack' });
    const today = todayISO(), year = Number(today.slice(0, 4));

    // ── the list ──
    function listTab() {
      const list = h('div', { class: 'bk-items' });
      const search = h('input', { class: 'input', type: 'search', value: q, placeholder: 'Søg titel, navn eller mærke', 'aria-label': 'Søg' });
      search.addEventListener('input', () => { q = search.value; draw(); });
      const kindSeg = segmented([{ value: 'all', label: 'Alt' }, ...Object.entries(L.KINDS).map(([value, k]) => ({ value, label: k.many, icon: k.icon }))], st.view.kind, (v) => { st.view.kind = v; store.save(); draw(); }, { label: 'Type' });
      const statusSel = h('select', { class: 'select', 'aria-label': 'Status' }, h('option', { value: 'all' }, 'Alle'), Object.entries(L.STATUS).map(([v, l]) => h('option', { value: v, selected: v === st.view.status }, l)));
      statusSel.addEventListener('change', () => { st.view.status = statusSel.value; store.save(); draw(); });
      const sortSel = h('select', { class: 'select', 'aria-label': 'Sortér' }, [['status', 'Efter status'], ['added', 'Nyeste først'], ['title', 'Titel A–Å'], ['rating', 'Bedst bedømt']].map(([v, l]) => h('option', { value: v, selected: v === st.view.sort }, l)));
      sortSel.addEventListener('change', () => { st.view.sort = sortSel.value; store.save(); draw(); });
      function card(it) {
        const k = L.KINDS[it.kind];
        const quick = it.status === 'want' ? h('button', { class: 'btn btn-sm', onclick: () => { L.setStatus(it, 'doing', today); store.save(); draw(); } }, icon('play'), `Start`)
          : it.status === 'doing' ? h('button', { class: 'btn btn-sm', onclick: () => { L.setStatus(it, 'done', today); store.save(); draw(); rateLater(it); } }, icon('check'), 'Færdig') : null;
        const prog = it.status === 'doing' && it.total ? h('div', { class: 'bk-prog' },
          h('div', { class: 'bk-bar' }, h('i', { style: { width: `${L.progressPct(it)}%` } })),
          h('span', { class: 'faint' }, `${it.progress || 0} af ${it.total} ${k.unit}`),
          h('button', { class: 'btn btn-sm btn-ghost', 'aria-label': `Frem i ${it.title}`, onclick: () => { const done = it.status; L.addProgress(it, it.kind === 'series' ? 1 : 10, today); store.save(); if (done !== it.status) { toast(`${it.title} er færdig`, { type: 'ok' }); rateLater(it); } draw(); } }, `+${it.kind === 'series' ? 1 : 10}`)) : null;
        return h('article', { class: ['bk-item', `is-${it.status}`] },
          h('span', { class: 'bk-kind', title: k.label }, icon(k.icon)),
          h('div', { class: 'bk-main' },
            h('button', { class: 'bk-title', onclick: () => edit(it) }, it.title),
            h('span', { class: 'faint' }, [it.by, it.year].filter(Boolean).join(' · ') || k.label),
            prog,
            it.status === 'done' ? h('div', { class: 'row', style: { gap: '8px' } }, stars(it.rating, (n) => { it.rating = n; store.save(); draw(); }, `Bedøm ${it.title}`), it.finished ? h('span', { class: 'faint', style: { fontSize: '12px' } }, `færdig ${Number(it.finished.slice(8))}. ${MONTHS[Number(it.finished.slice(5, 7)) - 1]}`) : null) : null,
            it.notes ? h('p', { class: 'bk-notes' }, it.notes) : null,
            (it.tags || []).length ? h('div', { class: 'mp-tags' }, it.tags.map(t => h('span', { class: 'chip' }, t))) : null),
          h('div', { class: 'bk-side' }, h('span', { class: ['chip', it.status === 'doing' && 'chip-info', it.status === 'done' && 'chip-ok'] }, it.status === 'doing' ? L.DOING[it.kind] : L.STATUS[it.status]), quick));
      }
      function draw() {
        const shown = L.sortItems(st.items.filter(it => L.matches(it, { ...st.view, q })), st.view.sort);
        h(clear(list), null, shown.length ? shown.map(card) : h('div', { class: 'bk-empty' }, icon('book'), h('b', null, st.items.length ? 'Intet passer til søgningen' : 'Listen er tom'),
          h('span', { class: 'faint' }, st.items.length ? 'Prøv en anden type eller status.' : 'Tilføj de bøger, film, serier og spil, du vil i gang med – eller dem, du har været igennem.')));
      }
      draw();
      return [h('div', { class: 'cm-seg-scroll' }, kindSeg),
        h('div', { class: 'bk-tools' }, search, statusSel, sortSel,
          h('button', { class: 'btn', onclick: () => { const s = L.suggest(st.items, st.view.kind); if (s) toast(`Hvad med “${s.title}”?`, { type: 'info', text: `${L.KINDS[s.kind].label} fra din liste over dem, du gerne vil.`, action: { label: 'Start', onClick: () => { L.setStatus(s, 'doing', today); store.save(); open('list'); } } }); else toast('Der er ikke noget på “Vil gerne”-listen', { type: 'warn' }); } }, icon('sparkles'), 'Foreslå noget'),
          h('button', { class: 'btn btn-primary', onclick: () => edit(null) }, icon('plus'), 'Tilføj')),
        list];
    }
    function rateLater(it) { if (!it.rating) setTimeout(() => toast('Hvad syntes du?', { type: 'info', text: `Giv “${it.title}” stjerner på listen.` }), 400); }

    function edit(it0) {
      const it = it0 ? structuredClone(it0) : { id: Date.now().toString(36), kind: st.view.kind !== 'all' ? st.view.kind : 'book', title: '', by: '', year: '', status: 'want', rating: 0, total: '', progress: 0, notes: '', tags: [], added: Date.now() };
      let close;
      const title = h('input', { class: 'input', value: it.title, maxlength: 120, 'aria-label': 'Titel' });
      const by = h('input', { class: 'input', value: it.by || '', maxlength: 80, 'aria-label': 'Af' });
      const yr = h('input', { class: 'input', type: 'number', min: 1000, max: 2100, value: it.year || '', 'aria-label': 'Udgivet år', style: { width: '100px' } });
      const total = h('input', { class: 'input', type: 'number', min: 0, max: 100000, value: it.total || '', 'aria-label': 'I alt', style: { width: '110px' } });
      const prog = h('input', { class: 'input', type: 'number', min: 0, max: 100000, value: it.progress || '', 'aria-label': 'Nået til', style: { width: '110px' } });
      const notes = h('textarea', { class: 'textarea', rows: 3, maxlength: 1000, 'aria-label': 'Noter' }); notes.value = it.notes || '';
      const tags = h('input', { class: 'input', value: (it.tags || []).join(', '), placeholder: 'fx krimi, lydbog, anbefalet af Maja', 'aria-label': 'Mærker' });
      const byLabel = h('span', { class: 'field-label' }), totalBox = h('div', { class: 'row', style: { gap: '10px' } });
      const err = h('div', { class: 'field-error' });
      const refresh = () => {
        const k = L.KINDS[it.kind]; byLabel.textContent = k.by;
        h(clear(totalBox), null, k.unit ? [h('label', { class: 'field' }, h('span', { class: 'field-label' }, `Antal ${k.unit}`), total), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nået til'), prog)] : null);
      };
      const kindSeg = segmented(Object.entries(L.KINDS).map(([value, k]) => ({ value, label: k.label, icon: k.icon })), it.kind, (v) => { it.kind = v; refresh(); }, { label: 'Type' });
      const statusSeg = segmented(Object.entries(L.STATUS).map(([value, l]) => ({ value, label: l })), it.status, (v) => { it.status = v; }, { label: 'Status' });
      let rating = it.rating || 0;
      const starBox = h('span');
      const drawStars = () => h(clear(starBox), null, stars(rating, (n) => { rating = n; drawStars(); }));
      drawStars(); refresh();
      const save = () => {
        it.title = title.value.trim(); it.by = by.value.trim(); it.year = Number(yr.value) || '';
        it.total = Number(total.value) || 0; it.progress = Math.min(Number(prog.value) || 0, it.total || Infinity);
        it.notes = notes.value.trim(); it.tags = tags.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 8); it.rating = rating;
        if (!it.title) { err.textContent = 'Skriv en titel.'; return; }
        const was = it0?.status;
        if (it.status !== was) L.setStatus(it, it.status, today);
        const i = st.items.findIndex(x => x.id === it.id);
        if (i >= 0) st.items[i] = it; else st.items.push(it);
        store.save(); close?.(); open(tab);
        if (!it0) toast(`“${it.title}” er tilføjet`, { type: 'ok' });
      };
      const m = modal({ title: it0 ? 'Ret' : 'Tilføj til listen', label: 'Bøger og film', size: 560,
        body: h('div', { class: 'stack', style: { gap: '12px' } }, h('div', { class: 'cm-seg-scroll' }, kindSeg),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), title),
          h('div', { class: 'row', style: { gap: '10px' } }, h('label', { class: 'field', style: { flex: 1 } }, byLabel, by), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'År'), yr)),
          h('div', { class: 'cm-seg-scroll' }, statusSeg), totalBox,
          h('div', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'field-label' }, 'Bedømmelse'), starBox),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Noter'), notes),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Mærker'), tags), err),
        actions: [
          it0 ? h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: async () => { if (await confirmDialog({ title: `Fjern “${it0.title}”?`, confirmLabel: 'Fjern', danger: true })) { st.items = st.items.filter(x => x.id !== it0.id); store.save(); close?.(); open(tab); } } }, icon('trash'), 'Fjern') : null,
          h('button', { class: 'btn', onclick: () => close?.() }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: save }, icon('check'), 'Gem')].filter(Boolean) });
      close = m.close;
      title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      setTimeout(() => title.focus(), 50);
    }

    // ── statistics ──
    function statsTab() {
      const s = L.yearStats(st.items, year), books = s.by.book;
      const goalIn = h('input', { class: 'input', type: 'number', min: 0, max: 1000, value: st.goal[year] || '', placeholder: 'fx 24', 'aria-label': `Mål for bøger i ${year}`, style: { width: '100px' } });
      goalIn.addEventListener('change', () => { st.goal[year] = Number(goalIn.value) || 0; store.save(); open('stats'); });
      const g = L.goalStatus(books, st.goal[year]);
      const maxM = Math.max(1, ...s.months);
      return [h('div', { class: 'wo-summary' }, [[s.done, `færdige i ${year}`], [s.pages.toLocaleString('da-DK'), 'sider læst'], [s.avg ? `${s.avg.toLocaleString('da-DK')} ★` : '–', 'i snit']].map(([v, l]) => h('div', null, h('b', null, String(v)), h('span', { class: 'faint' }, l)))),
        panel(`Læsemål ${year}`, 'trophy', h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, h('span', null, 'Jeg vil læse'), goalIn, h('span', null, 'bøger i år')),
          g ? [h('div', { class: 'bk-bar is-big' }, h('i', { style: { width: `${g.pct}%` } })),
            h('p', { class: 'faint' }, `${books} af ${st.goal[year]} bøger (${g.pct} %). ${g.ahead >= 0 ? `Du er ${g.ahead.toLocaleString('da-DK')} foran planen.` : `Du er ${Math.abs(g.ahead).toLocaleString('da-DK')} bag planen – der er tid endnu.`}`)] : null),
        panel('Hvad blev du færdig med?', 'chart',
          h('div', { class: 'bk-kinds' }, Object.entries(L.KINDS).map(([k, x]) => h('div', null, icon(x.icon), h('b', null, String(s.by[k])), h('span', { class: 'faint' }, x.many)))),
          h('div', { class: 'wo-bars', role: 'img', 'aria-label': 'Færdige pr. måned' }, s.months.map((n, i) => h('div', { class: 'wo-bar' }, h('i', { style: { height: `${(n / maxM) * 100}%` } }, n ? String(n) : ''), h('span', { class: 'faint' }, MONTHS[i]))))),
        s.best.length ? panel('Årets bedste', 'star', h('ol', { class: 'bk-best' }, s.best.map(it => h('li', null, h('b', null, it.title), ' ', stars(it.rating))))) : null];
    }

    const TABS = { list: listTab, stats: statsTab };
    function open(id) { tab = id; seg.setValue(id); history.replaceState(null, '', `#/apps/library${id === 'list' ? '' : '/stats'}`); h(clear(body), null, TABS[id]()); }
    const seg = segmented([{ value: 'list', label: 'Listen', icon: 'list' }, { value: 'stats', label: 'Statistik', icon: 'chart' }], tab, (v) => open(v), { label: 'Vælg' });
    open(tab);
    return h('div', { class: 'page bk-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Fritid', title: 'Bøger og film', lead: 'Hold styr på det, du vil læse, se og spille – hvor langt du er, og hvad du syntes. Sæt et læsemål for året.', compact: true }),
      h('div', { class: 'cmd-filters', style: { marginBottom: '16px' } }, seg), body);
  },
};
