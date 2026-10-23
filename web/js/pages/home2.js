/** Home: Fødselsdage, Pakkeliste, Udlån and Plantepasser (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';
import * as H from '../features/home2.js';

const page = (id, title, lead, body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow: 'Hjemme', title, lead, compact: true }), body);
const empty = (emoji, title, text) => h('div', { class: 'sh-empty' }, h('span', { class: 'qz-big' }, emoji), h('b', null, title), h('span', { class: 'faint' }, text));
const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const dayName = (d) => d.toLocaleDateString('da-DK', { weekday: 'long' });
const fmtDate = (d) => `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
const del = async (what, fn) => { if (await confirmDialog({ title: `Slet “${what}”?`, confirmLabel: 'Slet', danger: true })) fn(); };
const dateInput = (label, value = '') => h('input', { class: 'input', type: 'date', value, 'aria-label': label });
const toISO = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromISO = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : null; };

// ── Fødselsdage ──
export const birthdays = {
  title: 'Fødselsdage',
  async render() {
    let store;
    try { store = await appState('birthdays', { people: [] }); } catch (e) { return loadError('Fødselsdage', e); }
    const st = store.data, root = h('div');
    function draw() {
      const name = h('input', { class: 'input', maxlength: 40, placeholder: 'Navn', 'aria-label': 'Navn' });
      const date = dateInput('Fødselsdato');
      const noYear = h('input', { type: 'checkbox' });
      const note = h('input', { class: 'input', maxlength: 80, placeholder: 'Gaveidé (valgfri)', 'aria-label': 'Gaveidé' });
      const add = () => {
        if (!name.value.trim() || !date.value) return toast('Skriv navn og dato', { type: 'warn' });
        const d = noYear.checked ? `--${date.value.slice(5)}` : date.value;
        st.people.push({ id: uid(), name: name.value.trim(), date: d, note: note.value.trim() }); store.save(); draw();
        toast(`${name.value.trim()} er tilføjet`, { type: 'ok' });
      };
      const list = st.people.map(p => ({ p, n: H.nextBirthday(p.date) })).filter(x => x.n).sort((a, b) => a.n.days - b.n.days);
      const soon = list.filter(x => x.n.days <= 30), today = list.filter(x => x.n.days === 0);
      h(clear(root), null,
        today.length ? h('div', { class: 'bd-today' }, h('span', { class: 'bd-cake' }, '🎂'), h('div', null, h('b', null, `I dag har ${today.map(x => x.p.name).join(' og ')} fødselsdag!`), h('span', null, today.map(x => x.n.turns ? `${x.p.name} bliver ${x.n.turns}` : '').filter(Boolean).join(' · ') || 'Husk at sige tillykke.'))) : null,
        panel('Tilføj fødselsdag', 'plus', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, name, date, h('label', { class: 'cal-pcheck' }, noYear, h('span', null, 'Kender ikke året')), note, h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj'))),
        list.length ? h('div', { class: 'stack' },
          soon.length ? panel('De næste 30 dage', 'calendar', h('div', { class: 'bd-soon' }, soon.map(({ p, n }) => h('div', { class: ['bd-big', n.days === 0 && 'is-today'] },
            h('b', { class: 'bd-days' }, n.days === 0 ? 'I dag' : n.days === 1 ? 'I morgen' : `${n.days} dage`), h('span', { class: 'bd-name' }, p.name),
            h('span', { class: 'faint' }, `${dayName(n.date)} d. ${fmtDate(n.date)}`), n.turns ? h('span', { class: ['bd-turns', H.ROUND(n.turns) && 'round'] }, `bliver ${n.turns}`) : null)))) : null,
          panel('Alle fødselsdage', 'gift', h('ul', { class: 'bd-list' }, list.map(({ p, n }) => h('li', null,
            h('span', { class: 'bd-date' }, h('b', null, String(n.date.getDate())), h('small', null, MONTHS[n.date.getMonth()].slice(0, 3))),
            h('div', { class: 'bd-b' }, h('b', null, p.name), h('span', { class: 'faint' }, [H.ageOn(p.date) != null ? `${H.ageOn(p.date)} år` : null, H.zodiac(p.date), n.days === 0 ? 'i dag' : `om ${n.days} ${n.days === 1 ? 'dag' : 'dage'}`].filter(Boolean).join(' · ')), p.note ? h('span', { class: 'bd-note' }, icon('gift'), p.note) : null),
            h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${p.name}`, onclick: () => del(p.name, () => { st.people = st.people.filter(x => x !== p); store.save(); draw(); }) }, icon('trash')))))))
          : empty('🎈', 'Ingen fødselsdage endnu', 'Tilføj familie og venner, så kan du se hvem der har fødselsdag snart, hvor gamle de bliver – og gemme en gaveidé.'));
    }
    draw();
    return page('birthdays', 'Fødselsdage', 'Glem aldrig en fødselsdag igen: se hvem der står for tur, hvor gamle de bliver, og gem gaveidéer til dem.', root);
  },
};

// ── Pakkeliste ──
export const packing = {
  title: 'Pakkeliste',
  async render() {
    let store;
    try { store = await appState('packing', { trips: [], open: null }); } catch (e) { return loadError('Pakkeliste', e); }
    const st = store.data, root = h('div');
    function overview() {
      const name = h('input', { class: 'input', maxlength: 40, placeholder: 'Fx Sommerhus i Skagen', 'aria-label': 'Navn på turen' });
      const picks = new Set(['basis']);
      const tpl = h('div', { class: 'pk-tpls' }, Object.entries(H.PACK_TEMPLATES).map(([k, t]) => h('button', { class: ['sh-tag', picks.has(k) && 'is-on'], 'aria-pressed': String(picks.has(k)), onclick: (e) => { picks.has(k) ? picks.delete(k) : picks.add(k); e.currentTarget.classList.toggle('is-on'); e.currentTarget.setAttribute('aria-pressed', String(picks.has(k))); } }, t.label)));
      const create = () => {
        const t = { id: uid(), name: name.value.trim() || 'Ny tur', items: [], made: Date.now() };
        for (const k of picks) t.items = H.mergeItems(t.items, H.PACK_TEMPLATES[k].items);
        st.trips.unshift(t); st.open = t.id; store.save(); draw();
      };
      return h('div', { class: 'stack' },
        panel('Ny pakkeliste', 'plus', name, h('p', { class: 'faint', style: { fontSize: '13px', margin: '8px 0 4px' } }, 'Start med færdige lister – du kan altid tilføje og slette bagefter:'), tpl, h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Lav listen'))),
        st.trips.length ? h('div', { class: 'pk-trips' }, st.trips.map(t => { const p = H.packProgress(t.items), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
          return h('button', { class: ['pk-trip', pct === 100 && 'is-done'], onclick: () => { st.open = t.id; store.save(); draw(); } }, h('b', null, t.name), h('div', { class: 'ch-prog' }, h('i', { style: { width: `${pct}%` } })), h('span', { class: 'faint' }, pct === 100 ? 'Alt er pakket ✓' : `${p.done} af ${p.total} pakket`)); }))
          : empty('🧳', 'Ingen pakkelister endnu', 'Vælg hvilken slags tur det er, så får du en færdig liste at krydse af.'));
    }
    function trip(t) {
      const p = H.packProgress(t.items), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
      const inp = h('input', { class: 'input', maxlength: 60, placeholder: 'Tilføj ting …', 'aria-label': 'Tilføj ting' });
      const add = () => { const v = inp.value.trim(); if (!v) return; t.items = H.mergeItems(t.items, v.split(/\s*,\s*/).filter(Boolean)); store.save(); draw(); root.querySelector('.pk-add input')?.focus(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const todo = t.items.filter(i => !i.done), done = t.items.filter(i => i.done);
      const row = (i) => h('li', { class: ['pk-item', i.done && 'is-done'] }, h('label', null, h('input', { type: 'checkbox', checked: i.done, onchange: () => { i.done = !i.done; store.save(); draw(); if (t.items.every(x => x.done) && t.items.length) toast('Alt er pakket – god tur! 🧳', { type: 'xp' }); } }), h('span', null, i.name)),
        h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${i.name}`, onclick: () => { t.items = t.items.filter(x => x !== i); store.save(); draw(); } }, icon('x')));
      return h('div', { class: 'stack' },
        h('div', { class: 'sh-detail-h' }, h('button', { class: 'btn btn-sm', onclick: () => { st.open = null; store.save(); draw(); } }, icon('arrowLeft'), 'Alle lister'), h('h2', { class: 'pk-title' }, t.name), h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn btn-sm', onclick: () => { t.items.forEach(i => { i.done = false; }); store.save(); draw(); } }, icon('refresh'), 'Pak ud'),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet listen', onclick: () => del(t.name, () => { st.trips = st.trips.filter(x => x !== t); st.open = null; store.save(); draw(); }) }, icon('trash'))),
        h('div', { class: 'pk-bar' }, h('div', { class: 'ch-prog' }, h('i', { style: { width: `${pct}%` } })), h('b', null, `${p.done}/${p.total}`)),
        h('div', { class: 'row pk-add', style: { gap: '6px' } }, inp, h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj')),
        h('div', { class: 'pk-more' }, h('span', { class: 'faint' }, 'Tilføj fra:'), Object.entries(H.PACK_TEMPLATES).map(([k, tp]) => h('button', { class: 'sh-tag', onclick: () => { t.items = H.mergeItems(t.items, tp.items); store.save(); draw(); } }, icon('plus'), tp.label))),
        todo.length ? h('ul', { class: 'pk-list' }, todo.map(row)) : h('p', { class: 'ok', style: { textAlign: 'center' } }, 'Alt er pakket ✓'),
        done.length ? h('details', { class: 'pk-done', open: done.length < 8 }, h('summary', null, `Pakket (${done.length})`), h('ul', { class: 'pk-list' }, done.map(row))) : null);
    }
    function draw() { const t = st.trips.find(x => x.id === st.open); h(clear(root), null, t ? trip(t) : overview()); }
    draw();
    return page('packing', 'Pakkeliste', 'Lav en pakkeliste ud fra færdige skabeloner til sommer, vinter, lejr, fly og sport – og kryds af, mens du pakker.', root);
  },
};

// ── Udlån ──
export const loans = {
  title: 'Udlån',
  async render() {
    let store;
    try { store = await appState('loans', { items: [] }); } catch (e) { return loadError('Udlån', e); }
    const st = store.data, root = h('div');
    let view = 'out';
    const LBL = { late: 'For sent', soon: 'Snart', out: 'Udlånt', back: 'Afleveret' };
    function draw() {
      const what = h('input', { class: 'input', maxlength: 60, placeholder: 'Hvad? Fx Harry-bog, boremaskine', 'aria-label': 'Hvad er lånt ud' });
      const who = h('input', { class: 'input', maxlength: 40, placeholder: 'Hvem?', 'aria-label': 'Hvem' });
      const dir = { v: 'lent' };
      const due = dateInput('Afleveres senest', toISO(Date.now() + 14 * 86400000));
      const add = () => {
        if (!what.value.trim() || !who.value.trim()) return toast('Skriv hvad og hvem', { type: 'warn' });
        st.items.unshift({ id: uid(), what: what.value.trim(), who: who.value.trim(), dir: dir.v, at: Date.now(), due: fromISO(due.value), back: null }); store.save(); view = 'out'; draw();
      };
      const items = st.items.filter(i => (view === 'back') === !!i.back).sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
      const late = st.items.filter(i => H.loanStatus(i) === 'late').length;
      h(clear(root), null,
        panel('Nyt udlån', 'plus', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
          segmented([{ value: 'lent', label: 'Jeg lånte ud' }, { value: 'borrowed', label: 'Jeg lånte' }], 'lent', (v) => { dir.v = v; who.placeholder = v === 'lent' ? 'Til hvem?' : 'Fra hvem?'; }, { label: 'Retning' }),
          what, who, h('label', { class: 'ln-due' }, h('span', { class: 'faint' }, 'Senest'), due), h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj'))),
        h('div', { class: 'cmd-filters', style: { margin: '12px 0' } }, segmented([{ value: 'out', label: `Ude nu (${st.items.filter(i => !i.back).length})` }, { value: 'back', label: 'Afleveret' }], view, (v) => { view = v; draw(); }, { label: 'Visning' }),
          late ? h('span', { class: 'ln-late-chip' }, icon('alert'), `${late} for sent`) : null),
        items.length ? h('ul', { class: 'ln-list' }, items.map(i => { const s = H.loanStatus(i), days = i.due ? H.daysBetween(Date.now(), i.due) : null;
          return h('li', { class: `ln-item is-${s}` },
            h('span', { class: 'ln-dir', title: i.dir === 'lent' ? 'Lånt ud' : 'Lånt' }, i.dir === 'lent' ? '↗' : '↙'),
            h('div', { class: 'ln-b' }, h('b', null, i.what), h('span', { class: 'faint' }, `${i.dir === 'lent' ? 'Lånt ud til' : 'Lånt af'} ${i.who} · ${new Date(i.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`)),
            h('span', { class: `ln-status is-${s}` }, s === 'back' ? `Afleveret ${new Date(i.back).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}` : days == null ? LBL[s] : days < 0 ? `${-days} ${days === -1 ? 'dag' : 'dage'} for sent` : days === 0 ? 'Senest i dag' : `${days} ${days === 1 ? 'dag' : 'dage'} tilbage`),
            i.back ? h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${i.what}`, onclick: () => del(i.what, () => { st.items = st.items.filter(x => x !== i); store.save(); draw(); }) }, icon('trash'))
              : h('button', { class: 'btn btn-sm', onclick: () => { i.back = Date.now(); store.save(); toast(`${i.what} er afleveret`, { type: 'ok' }); draw(); } }, icon('check'), 'Afleveret'));
        })) : empty(view === 'back' ? '📦' : '🤝', view === 'back' ? 'Intet afleveret endnu' : 'Intet er lånt ud', 'Skriv det ned, når du låner en bog, et spil eller værktøj ud – så ved du hvem der har det, og hvornår det skal tilbage.'));
    }
    draw();
    return page('loans', 'Udlån', 'Hold styr på hvad du har lånt ud – og hvad du selv har lånt. Se hvad der er for sent, og hvem der har det.', root);
  },
};

// ── Plantepasser ──
export const plants = {
  title: 'Plantepasser',
  async render() {
    let store;
    try { store = await appState('plants', { plants: [] }); } catch (e) { return loadError('Plantepasser', e); }
    const st = store.data, root = h('div');
    function draw() {
      const kind = h('select', { class: 'input', 'aria-label': 'Slags plante' }, H.PLANTS.map((p, i) => h('option', { value: String(i) }, p.name)), h('option', { value: 'x' }, 'Anden plante …'));
      const name = h('input', { class: 'input', maxlength: 30, placeholder: 'Kælenavn (valgfri)', 'aria-label': 'Kælenavn' });
      const every = h('input', { class: 'input', type: 'number', min: 1, max: 60, value: H.PLANTS[0].every, 'aria-label': 'Vand hver x dag', style: { width: '80px' } });
      const where = h('input', { class: 'input', maxlength: 30, placeholder: 'Hvor? Fx stuen', 'aria-label': 'Hvor står den' });
      kind.addEventListener('change', () => { if (kind.value !== 'x') every.value = H.PLANTS[Number(kind.value)].every; });
      const add = () => {
        const base = kind.value === 'x' ? null : H.PLANTS[Number(kind.value)];
        st.plants.push({ id: uid(), kind: base?.name || 'Plante', name: name.value.trim(), where: where.value.trim(), every: Math.max(1, Math.min(60, Number(every.value) || 7)), watered: Date.now(), log: [Date.now()] }); store.save(); draw();
      };
      const list = st.plants.map(p => ({ p, d: H.waterDue(p) })).sort((a, b) => a.d - b.d);
      const thirsty = list.filter(x => x.d <= 0);
      h(clear(root), null,
        thirsty.length ? h('div', { class: 'pl-alert' }, h('span', null, '💧'), h('b', null, thirsty.length === 1 ? `${thirsty[0].p.name || thirsty[0].p.kind} skal vandes i dag` : `${thirsty.length} planter skal vandes`),
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => { thirsty.forEach(({ p }) => { p.watered = Date.now(); p.log = [Date.now(), ...(p.log || [])].slice(0, 20); }); store.save(); toast('Alle er vandet 🌱', { type: 'ok' }); draw(); } }, 'Vandet alle')) : null,
        panel('Ny plante', 'plus', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, kind, name, where, h('label', { class: 'ln-due' }, h('span', { class: 'faint' }, 'Vand hver'), every, h('span', { class: 'faint' }, 'dag')), h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj'))),
        list.length ? h('div', { class: 'pl-grid' }, list.map(({ p, d }) => { const info = H.PLANTS.find(x => x.name === p.kind), pct = Math.max(0, Math.min(100, Math.round((d / p.every) * 100)));
          return h('div', { class: ['pl-card', d <= 0 && 'is-thirsty'] },
            h('div', { class: 'pl-top' }, h('span', { class: 'pl-pot' }, d < 0 ? '🥀' : '🪴'), h('div', null, h('b', null, p.name || p.kind), h('span', { class: 'faint' }, [p.name ? p.kind : null, p.where].filter(Boolean).join(' · ') || ' ')),
              h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${p.name || p.kind}`, onclick: () => del(p.name || p.kind, () => { st.plants = st.plants.filter(x => x !== p); store.save(); draw(); }) }, icon('trash'))),
            h('div', { class: 'pl-water', style: { '--p': `${pct}%` } }, h('i')),
            h('span', { class: ['pl-due', d <= 0 && 'bad'] }, d <= 0 ? `Vand ${H.dueText(d) === 'i dag' ? 'i dag' : `– ${H.dueText(d)}`}` : `Vand ${H.dueText(d)}`, h('small', { class: 'faint' }, ` · hver ${p.every}. dag`)),
            info ? h('small', { class: 'faint pl-tip' }, `☀ ${info.light}. ${info.tip}`) : null,
            h('button', { class: ['btn btn-sm', d <= 0 && 'btn-primary'], onclick: () => { p.watered = Date.now(); p.log = [Date.now(), ...(p.log || [])].slice(0, 20); store.save(); draw(); } }, '💧 Vandet'));
        })) : empty('🌱', 'Ingen planter endnu', 'Tilføj dine stueplanter, så husker HUBTECH hvornår de skal have vand – med tips til lys og pasning.'));
    }
    draw();
    return page('plants', 'Plantepasser', 'Hold liv i stueplanterne: se hvem der er tørstige, hvornår de skal vandes igen, og få tips til hver slags.', root);
  },
};
