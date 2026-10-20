/** Opgaver — a kanban board (at gøre · i gang · færdig), saved per user on the server. */
import { h, clear, debounce } from '../core/dom.js';
import { query } from '../core/router.js';
import { icon } from '../core/icons.js';
import { store, logActivity } from '../core/store.js';
import { getState, saveState, flushState, getProjects } from '../core/services.js';
import { toast, modal, confirmDialog, errorToast, stateBlock, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { REMIND, remindAt, notifyPermissionButton } from '../features/reminders.js';
import { listDocs, KINDS } from '../office/store.js';

const COLS = [
  { id: 'todo', label: 'At gøre', icon: 'list', hue: '#7cc4ff' },
  { id: 'doing', label: 'I gang', icon: 'play', hue: '#ffb547' },
  { id: 'done', label: 'Færdig', icon: 'checkCircle', hue: '#4ade80' },
];
const PRIO = { high: ['Høj', 'chip-bad'], med: ['Mellem', 'chip-warn'], low: ['Lav', 'chip-info'] };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);

let st = null;          // { tasks: [] }
let saveErr = false;
let projects = [];
let docs = [];   // the user's Office files (for linking)

function persist() {
  saveState('tasks', st, { onError: () => { if (!saveErr) { saveErr = true; toast('Opgaverne kunne ikke gemmes', { type: 'bad', text: 'Tjek at HUBTECH-serveren kører.' }); } } });
  saveErr = false;
}

function dueInfo(due) {
  if (!due) return null;
  const d = Math.round((new Date(due + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  if (d < 0) return [`${-d} dag${d === -1 ? '' : 'e'} over`, 'chip-bad', true];
  if (d === 0) return ['I dag', 'chip-warn', false];
  if (d === 1) return ['I morgen', 'chip-info', false];
  return [new Date(due + 'T00:00:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }), '', false];
}

export default {
  title: 'Opgaver',
  destroy() { flushState('tasks'); },
  async render() {
    const app = appById('tasks');
    try { st = (await getState('tasks', { force: true })) || { tasks: [] }; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Opgaverne kunne ikke hentes', text: e.message })); }
    if (!Array.isArray(st.tasks)) st.tasks = [];
    listDocs().then(d => { docs = d.filter(x => !x.trashed).map(x => ({ id: x.id, kind: x.kind, title: x.title })); draw(); }).catch(() => {});
    if (store.get('user').role === 'owner') getProjects().then(d => { projects = (d.projects || []).filter(p => !p.meta?.hidden).map(p => ({ id: p.id, name: p.name })); fillProjects(); }).catch(() => {});

    const v = { open: h('span'), doing: h('span'), done: h('span'), late: h('span') };
    const updateStats = () => {
      const t = st.tasks;
      v.open.textContent = String(t.filter(x => x.status !== 'done').length);
      v.doing.textContent = String(t.filter(x => x.status === 'doing').length);
      v.done.textContent = String(t.filter(x => x.status === 'done').length);
      const late = t.filter(x => x.status !== 'done' && dueInfo(x.due)?.[2]).length;
      v.late.replaceChildren(late ? h('span', { class: 'status-dot bad' }) : h('span', { class: 'status-dot ok' }), String(late));
    };

    // ── add bar ──
    const title = h('input', { class: 'input', placeholder: 'Hvad skal gøres?', 'aria-label': 'Ny opgave', maxlength: 200 });
    const prio = h('select', { class: 'select', 'aria-label': 'Prioritet' }, ['med', 'high', 'low'].map(p => h('option', { value: p }, `${PRIO[p][0]} prioritet`)));
    const due = h('input', { class: 'input', type: 'date', 'aria-label': 'Deadline' });
    const remind = h('select', { class: 'select', 'aria-label': 'Påmindelse', title: 'Påmindelse' }, Object.entries(REMIND).map(([k, r]) => h('option', { value: k }, r.label)));
    const proj = h('select', { class: 'select', 'aria-label': 'Projekt', hidden: true }, h('option', { value: '' }, 'Intet projekt'));
    function fillProjects() {
      if (!projects.length) return;
      proj.hidden = false;
      proj.append(...projects.map(p => h('option', { value: p.id }, p.name)));
    }
    const add = h('button', { class: 'btn app-solid' }, icon('plus'), 'Tilføj');
    const doAdd = () => {
      const t = title.value.trim();
      if (!t) { title.focus(); return; }
      const now = Date.now();
      const task = { id: uid(), title: t, notes: '', status: 'todo', prio: prio.value, due: due.value || null, project: proj.value || null, remind: due.value ? remind.value : 'none', created: now, updated: now };
      task.remindAt = remindAt(task);
      st.tasks.unshift(task);
      persist();
      title.value = ''; due.value = '';
      draw();
      title.focus();
    };
    add.addEventListener('click', doAdd);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

    // ── filters ──
    const f = { q: '', view: 'all' };
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i opgaver…', 'aria-label': 'Søg i opgaver' });
    search.addEventListener('input', debounce(() => { f.q = search.value.trim().toLowerCase(); draw(); }, 120));
    const view = segmented([{ value: 'all', label: 'Alle' }, { value: 'high', label: 'Høj prioritet' }, { value: 'due', label: 'Med deadline' }], 'all', (x) => { f.view = x; draw(); }, { label: 'Filter' });

    const board = h('div', { class: 'kb-board' });
    const match = (t) => (!f.q || [t.title, t.notes].join(' ').toLowerCase().includes(f.q)) && (f.view !== 'high' || t.prio === 'high') && (f.view !== 'due' || t.due);

    function move(t, status, beforeId = null) {
      const was = t.status;
      st.tasks = st.tasks.filter(x => x !== t);
      t.status = status; t.updated = Date.now();
      if (status === 'done' && was !== 'done') { t.doneAt = Date.now(); logActivity('tasks', 'done', t.title, 'Opgave færdig'); toast('Opgave færdig', { type: 'ok', text: t.title, ms: 1800 }); }
      const idx = beforeId ? st.tasks.findIndex(x => x.id === beforeId) : -1;
      if (idx >= 0) st.tasks.splice(idx, 0, t); else {
        // end of its column = after the last task with that status
        let last = -1; st.tasks.forEach((x, i) => { if (x.status === status) last = i; });
        st.tasks.splice(last + 1, 0, t);
      }
      persist(); draw();
    }

    function card(t) {
      const ci = COLS.findIndex(c => c.id === t.status);
      const di = dueInfo(t.due);
      const pname = t.project ? (projects.find(p => p.id === t.project)?.name || 'Projekt') : null;
      const el = h('article', { class: ['kb-card', t.status === 'done' && 'is-done', `prio-${t.prio}`], draggable: 'true', tabindex: '0', dataset: { id: t.id }, 'aria-label': t.title },
        h('div', { class: 'kb-card-top' },
          h('h4', null, t.title),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': `Redigér ${t.title}`, onclick: (e) => { e.stopPropagation(); edit(t); } }, icon('edit'))),
        t.notes ? h('p', { class: 'kb-notes' }, t.notes) : null,
        h('div', { class: 'kb-chips' },
          h('span', { class: ['chip', PRIO[t.prio]?.[1]] }, PRIO[t.prio]?.[0] || 'Mellem'),
          di ? h('span', { class: ['chip', t.status !== 'done' && di[1]] }, icon('calendar'), di[0], t.dueTime ? ` ${t.dueTime}` : '') : null,
          t.remind && t.remind !== 'none' && t.status !== 'done' ? h('span', { class: ['chip', t.reminded ? '' : 'chip-info'], title: t.remindAt ? `Påmindelse ${new Date(t.remindAt).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}` : '' }, icon('bell'), t.reminded ? 'Påmindet' : REMIND[t.remind]?.short || 'Påmind') : null,
          t.doc ? h('a', { class: 'chip', href: `#/apps/hubtech/${KINDS[t.doc.kind]?.route || 'doc'}/${t.doc.id}`, onclick: (e) => e.stopPropagation(), title: 'Åbn i HUBTECH Office' }, icon(KINDS[t.doc.kind]?.icon || 'file'), (docs.find(d => d.id === t.doc.id)?.title || t.doc.title || 'Dokument').slice(0, 32)) : null,
          pname ? h('a', { class: 'chip', href: `#/projects/${t.project}`, onclick: (e) => e.stopPropagation() }, icon('cube'), pname) : null),
        h('div', { class: 'kb-card-foot' },
          h('button', { class: 'icon-btn btn-sm', disabled: ci === 0, 'aria-label': 'Flyt til venstre', onclick: () => move(t, COLS[ci - 1].id) }, icon('chevronLeft')),
          t.status !== 'done'
            ? h('button', { class: 'btn btn-sm kb-next', onclick: () => move(t, COLS[ci + 1].id) }, t.status === 'todo' ? 'Start' : 'Færdig', icon(t.status === 'todo' ? 'play' : 'check'))
            : h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, t.doneAt ? `Færdig ${new Date(t.doneAt).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}` : 'Færdig'),
          h('button', { class: 'icon-btn btn-sm', disabled: ci === COLS.length - 1, 'aria-label': 'Flyt til højre', onclick: () => move(t, COLS[ci + 1].id) }, icon('chevronRight'))));
      el.addEventListener('dblclick', () => edit(t));
      el.addEventListener('keydown', (e) => {
        if (e.target !== el) return;
        if (e.key === 'Enter') { edit(t); return; }
        // keyboard instead of drag-and-drop: Alt+← → moves between columns, Alt+↑ ↓ changes the order
        if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          const nc = COLS[ci + (e.key === 'ArrowRight' ? 1 : -1)];
          if (!nc) return;
          move(t, nc.id); refocus(t.id); announce(`${t.title} flyttet til ${nc.label}`);
          return;
        }
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const same = st.tasks.filter(x => x.status === t.status);
          const i = same.indexOf(t), j = i + (e.key === 'ArrowDown' ? 1 : -1);
          if (j < 0 || j >= same.length) return;
          const a = st.tasks.indexOf(t), b = st.tasks.indexOf(same[j]);
          [st.tasks[a], st.tasks[b]] = [st.tasks[b], st.tasks[a]];
          t.updated = Date.now(); persist(); draw(); refocus(t.id);
          announce(`${t.title}: plads ${j + 1} af ${same.length} i ${COLS[ci].label}`);
          return;
        }
        // plain arrows move the focus between cards
        const nav = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
        if (!nav) return;
        e.preventDefault();
        const lists = [...board.querySelectorAll('.kb-list')];
        const col = lists[ci], cards = [...col.querySelectorAll('.kb-card')], idx = cards.indexOf(el);
        if (nav[1]) cards[idx + nav[1]]?.focus();
        else { const other = lists[ci + nav[0]]; const oc = other ? [...other.querySelectorAll('.kb-card')] : []; (oc[Math.min(idx, oc.length - 1)] || null)?.focus(); }
      });
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('is-dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
      return el;
    }

    function column(c) {
      const items = st.tasks.filter(t => t.status === c.id && match(t));
      const list = h('div', { class: 'kb-list', dataset: { status: c.id } }, items.map(card));
      if (!items.length) list.appendChild(h('div', { class: 'kb-empty' }, c.id === 'todo' ? 'Tilføj en opgave ovenfor' : c.id === 'doing' ? 'Træk en opgave hertil, når du går i gang' : 'Færdige opgaver lander her'));
      list.addEventListener('dragover', (e) => { e.preventDefault(); list.classList.add('is-over'); });
      list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) list.classList.remove('is-over'); });
      list.addEventListener('drop', (e) => {
        e.preventDefault(); list.classList.remove('is-over');
        const t = st.tasks.find(x => x.id === e.dataTransfer.getData('text/plain'));
        if (!t) return;
        const before = [...list.querySelectorAll('.kb-card:not(.is-dragging)')].find(el => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
        move(t, c.id, before?.dataset.id || null);
      });
      const clearDone = c.id === 'done' && items.length ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
        if (!await confirmDialog({ title: 'Ryd færdige opgaver?', text: `${items.length} færdige opgave(r) slettes permanent.`, confirmLabel: 'Ryd', danger: true })) return;
        const ids = new Set(items.map(t => t.id));
        st.tasks = st.tasks.filter(t => !ids.has(t.id)); persist(); draw();
      } }, icon('trash'), 'Ryd') : null;
      return h('section', { class: 'kb-col glass', style: { '--col': c.hue } },
        h('header', { class: 'kb-col-head' }, h('span', { class: 'kb-col-icon' }, icon(c.icon)), h('h3', null, c.label), h('span', { class: 'kb-count' }, String(st.tasks.filter(t => t.status === c.id).length)), clearDone),
        list);
    }

    function draw() {
      clear(board).append(...COLS.map(column));
      updateStats();
    }
    const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
    const refocus = (id) => requestAnimationFrame(() => board.querySelector(`.kb-card[data-id="${id}"]`)?.focus());

    function edit(t) {
      const ti = h('input', { class: 'input', value: t.title, maxlength: 200, 'aria-label': 'Titel' });
      const no = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Noter, links, tjekliste…', 'aria-label': 'Noter' }); no.value = t.notes || '';
      const pr = h('select', { class: 'select', 'aria-label': 'Prioritet' }, Object.entries(PRIO).map(([k, [l]]) => h('option', { value: k, selected: t.prio === k }, l)));
      const du = h('input', { class: 'input', type: 'date', value: t.due || '', 'aria-label': 'Deadline' });
      const tm = h('input', { class: 'input', type: 'time', value: t.dueTime || '', 'aria-label': 'Klokkeslæt' });
      const rm = h('select', { class: 'select', 'aria-label': 'Påmindelse' }, Object.entries(REMIND).map(([k, r]) => h('option', { value: k, selected: (t.remind || 'none') === k }, r.label)));
      const dc = h('select', { class: 'select', 'aria-label': 'Office-fil' }, h('option', { value: '' }, 'Ingen fil'), docs.map(d => h('option', { value: d.id, selected: t.doc?.id === d.id }, `${KINDS[d.kind]?.label || ''}: ${d.title}`)));
      const sts = h('select', { class: 'select', 'aria-label': 'Status' }, COLS.map(c => h('option', { value: c.id, selected: t.status === c.id }, c.label)));
      const pj = h('select', { class: 'select', 'aria-label': 'Projekt' }, h('option', { value: '' }, 'Intet projekt'), projects.map(p => h('option', { value: p.id, selected: t.project === p.id }, p.name)));
      let m;
      m = modal({
        title: 'Redigér opgave', label: 'Redigér opgave',
        body: h('div', { class: 'stack', style: { gap: '12px' } },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), ti),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Noter'), no),
          h('div', { class: 'grid-2', style: { gap: '10px' } },
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Prioritet'), pr),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Deadline'), du),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Klokkeslæt (valgfrit)'), tm),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Påmindelse'), rm),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Status'), sts),
            projects.length ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Projekt'), pj) : null,
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Office-fil'), dc)),
          notifyPermissionButton()),
        actions: [
          h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: async () => {
            m.close();
            st.tasks = st.tasks.filter(x => x !== t); persist(); draw();
            toast('Opgave slettet', { text: t.title, action: { label: 'Fortryd', onClick: () => { st.tasks.unshift(t); persist(); draw(); } } });
          } }, icon('trash'), 'Slet'),
          h('button', { class: 'btn btn-ghost', title: 'Del opgaven i en chat', onclick: () => import('../features/sharechat.js').then(x => x.shareToChat({ kind: 'task', title: t.title, body: t.notes || '', due: t.due || '' })) }, icon('share'), 'Del'),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: () => {
            const nt = ti.value.trim();
            if (!nt) { ti.focus(); return; }
            const d = docs.find(x => x.id === dc.value);
            Object.assign(t, { title: nt, notes: no.value.trim(), prio: pr.value, due: du.value || null, dueTime: tm.value || null, project: pj.value || null, doc: d ? { id: d.id, kind: d.kind, title: d.title } : null, remind: rm.value, updated: Date.now() });
            const at = remindAt(t);
            if (at !== t.remindAt) { t.remindAt = at; t.reminded = false; }
            if (rm.value !== 'none' && !t.due) toast('Påmindelsen kræver en deadline', { type: 'warn', text: 'Vælg en dato, så kan HUBTECH minde dig om opgaven.' });
            m.close();
            if (sts.value !== t.status) move(t, sts.value); else { persist(); draw(); }
          } }, 'Gem'),
        ],
      });
      setTimeout(() => ti.focus(), 50);
    }

    draw();
    if (query().get('new')) { history.replaceState(null, '', '#/apps/tasks'); setTimeout(() => { title.focus(); title.scrollIntoView({ block: 'center' }); }, 300); }
    return h('div', { class: 'page tasks-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Arbejdsrum', title: 'Opgaver', lead: 'Planlæg det, du skal nå. Træk kortene mellem kolonnerne – eller brug pilene. Alt gemmes på din konto.',
        stats: [
          { icon: 'list', label: 'Åbne opgaver', value: v.open },
          { icon: 'play', label: 'I gang', value: v.doing },
          { icon: 'checkCircle', label: 'Færdige', value: v.done },
          { icon: 'alert', label: 'Over deadline', value: v.late }],
      }),
      h('section', { class: 'glass panel kb-add' },
        h('div', { class: 'kb-add-row' }, h('div', { class: 'kb-add-title' }, icon('plus'), title), prio, due, remind, proj, add)),
      h('div', { class: 'kb-filters' }, h('div', { class: 'pt-search' }, icon('search'), search), view),
      h('p', { class: 'kb-keys faint' }, 'Tastatur: ← → ↑ ↓ skifter kort · Alt + ← → flytter mellem kolonner · Alt + ↑ ↓ ændrer rækkefølge · Enter redigerer'),
      board, live);
  },
};
