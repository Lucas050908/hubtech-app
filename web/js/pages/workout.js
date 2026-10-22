/**
 * Træning – log your workouts: sets with kg and repetitions (or time / km), a rest timer between sets,
 * your records, progress per exercise and routines you can start with one click.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented, modal } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { todayISO } from '../features/gamelogic.js';
import * as T from '../features/workout.js';

const STARTER_ROUTINES = [
  { id: 'r-hel', name: 'Helkrop', exercises: ['Squat', 'Bænkpres', 'Roning med stang', 'Skulderpres', 'Planke'] },
  { id: 'r-over', name: 'Overkrop', exercises: ['Bænkpres', 'Lat pulldown', 'Skulderpres', 'Biceps curl', 'Triceps pushdown'] },
  { id: 'r-ben', name: 'Ben', exercises: ['Squat', 'Dødløft', 'Lunges', 'Lægløft'] },
  { id: 'r-hjem', name: 'Hjemme uden udstyr', exercises: ['Armbøjninger', 'Mavebøjninger', 'Burpees', 'Planke', 'Wall sit'] },
  { id: 'r-lob', name: 'Løbetur', exercises: ['Løb'] },
];
const fmtDur = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} t. ${m % 60} min.` : `${m} min.`; };
const dateDa = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' }); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default {
  title: 'Træning',
  destroy() { clearInterval(this._iv); },
  async render(ctx) {
    const app = appById('workout');
    let store;
    try { store = await appState('workout', { active: null, history: [], routines: null, custom: [], rest: 90 }); } catch (e) { return loadError('Træning', e); }
    const st = store.data, self = this;
    if (!Array.isArray(st.routines)) { st.routines = structuredClone(STARTER_ROUTINES); store.save(); }
    st.history = st.history || []; st.custom = st.custom || [];
    let tab = ['train', 'history', 'progress', 'routines'].includes(ctx?.params?.sub) ? ctx.params.sub : 'train';
    let restEnd = 0, restTotal = 0;
    const body = h('div', { class: 'stack' });
    const kind = (name) => T.kindOf(name, st.custom);
    const newSet = (name, prev) => {
      const k = kind(name);
      if (prev) return { ...prev, done: false };
      return k === 'weight' ? { kg: '', reps: '' } : k === 'body' ? { reps: '' } : k === 'time' ? { secs: '' } : { min: '', km: '' };
    };
    const exFor = (name) => {
      const last = T.lastSets(st.history, name);
      const sets = last.length ? last.map(x => ({ ...x, done: false })) : [newSet(name), newSet(name), newSet(name)].slice(0, kind(name) === 'cardio' ? 1 : 3);
      return { name, sets };
    };
    const setText = (x, k) => (k === 'weight' ? `${x.reps || 0} × ${x.kg || 0} kg` : k === 'body' ? `${x.reps || 0}${x.kg ? ` (+${x.kg} kg)` : ''}` : k === 'time' ? T.fmtSecs(Number(x.secs) || 0) : `${x.km || 0} km på ${x.min || 0} min.`);

    // ── train ──
    function start(routine) {
      st.active = { id: uid(), name: routine?.name || 'Træning', date: todayISO(), started: Date.now(), exercises: (routine?.exercises || []).map(exFor) };
      store.save(); open('train');
    }
    function trainTab() {
      const a = st.active;
      if (!a) {
        const w = T.weekly(st.history, 1)[0], streak = T.streakWeeks(st.history), last = [...st.history].sort((x, y) => y.date.localeCompare(x.date))[0];
        return [h('div', { class: 'wo-summary' },
          [[w.count, 'træninger i denne uge'], [streak, streak === 1 ? 'uge i træk' : 'uger i træk'], [last ? dateDa(last.date) : '–', 'sidste træning']].map(([v, l]) => h('div', null, h('b', null, String(v)), h('span', { class: 'faint' }, l)))),
          panel('Start en træning', 'play',
            h('div', { class: 'wo-starts' }, st.routines.map(r => h('button', { class: 'wo-start', onclick: () => start(r) }, h('b', null, r.name), h('span', { class: 'faint' }, r.exercises.join(' · ')))),
              h('button', { class: 'wo-start is-empty', onclick: () => start(null) }, icon('plus'), h('b', null, 'Tom træning'), h('span', { class: 'faint' }, 'Vælg øvelserne undervejs'))))];
      }
      const exCards = a.exercises.map((ex, ei) => {
        const k = kind(ex.name), last = T.lastSets(st.history, ex.name);
        const cols = k === 'weight' ? [['kg', 'kg'], ['reps', 'Gentagelser']] : k === 'body' ? [['reps', 'Gentagelser'], ['kg', 'Ekstra kg']] : k === 'time' ? [['secs', 'Sekunder']] : [['min', 'Minutter'], ['km', 'Km']];
        return h('section', { class: 'wo-ex' },
          h('div', { class: 'wo-ex-h' }, h('b', null, ex.name),
            last.length ? h('span', { class: 'faint' }, `Sidst: ${last.map(x => setText(x, k)).join(', ')}`) : h('span', { class: 'faint' }, 'Første gang'),
            h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${ex.name}`, onclick: () => { a.exercises.splice(ei, 1); store.save(); open('train'); } }, icon('x'))),
          h('div', { class: 'wo-sets', style: { '--cols': cols.length } },
            h('span', { class: 'faint' }, 'Sæt'), cols.map(([, l]) => h('span', { class: 'faint' }, l)), h('span'),
            ex.sets.map((x, si) => [
              h('span', { class: 'wo-n' }, String(si + 1)),
              cols.map(([f, l]) => {
                const inp = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: f === 'kg' || f === 'km' ? '0.5' : '1', value: x[f] ?? '', placeholder: last[si]?.[f] != null ? String(last[si][f]) : '', 'aria-label': `${ex.name} sæt ${si + 1}: ${l}` });
                inp.addEventListener('input', () => { x[f] = inp.value === '' ? '' : Number(inp.value); store.save(); });
                return inp;
              }),
              h('button', { class: ['wo-check', x.done && 'is-done'], 'aria-pressed': String(!!x.done), 'aria-label': `${ex.name} sæt ${si + 1} lavet`, onclick: () => {
                for (const [f] of cols) if ((x[f] === '' || x[f] == null) && last[si]?.[f] != null) x[f] = last[si][f];      // empty = the same as last time
                x.done = !x.done; store.save();
                if (x.done && k !== 'cardio') { restTotal = st.rest || 90; restEnd = Date.now() + restTotal * 1000; }
                open('train');
              } }, icon('check'))]).flat()),
          h('div', { class: 'row', style: { gap: '6px' } },
            h('button', { class: 'btn btn-sm', onclick: () => { ex.sets.push(newSet(ex.name, ex.sets.at(-1))); store.save(); open('train'); } }, icon('plus'), 'Sæt'),
            ex.sets.length > 1 ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { ex.sets.pop(); store.save(); open('train'); } }, icon('minus'), 'Fjern sæt') : null));
      });
      const name = h('input', { class: 'input wo-name', value: a.name, maxlength: 40, 'aria-label': 'Navn på træningen' });
      name.addEventListener('input', () => { a.name = name.value.trim() || 'Træning'; store.save(); });
      const restSel = h('select', { class: 'select', 'aria-label': 'Pause mellem sæt' }, [45, 60, 90, 120, 180].map(s => h('option', { value: s, selected: s === (st.rest || 90) }, `Pause ${T.fmtSecs(s)}`)));
      restSel.addEventListener('change', () => { st.rest = Number(restSel.value); store.save(); });
      return [h('div', { class: 'wo-active-h' }, name, h('span', { class: 'wo-clock', 'aria-label': 'Tid' }, '0:00'), restSel),
        h('div', { class: 'wo-rest', hidden: true, role: 'timer' }, h('i'), h('span', null, 'Pause'), h('b', null, ''),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { restEnd += 15000; restTotal += 15; } }, '+15 s'), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { restEnd = 0; } }, 'Spring over')),
        exCards.length ? exCards : h('p', { class: 'faint' }, 'Tilføj den første øvelse.'),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: pickExercise }, icon('plus'), 'Tilføj øvelse')),
        h('div', { class: 'row-actions wo-finish' },
          h('button', { class: 'btn btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Kassér træningen?', text: 'Det, du har skrevet, bliver ikke gemt.', confirmLabel: 'Kassér', danger: true })) { st.active = null; restEnd = 0; store.save(); open('train'); } } }, 'Kassér'),
          h('button', { class: 'btn btn-primary btn-lg', onclick: finish }, icon('check'), 'Afslut træningen'))];
    }
    function finish() {
      const a = st.active;
      a.exercises = a.exercises.map(ex => ({ ...ex, sets: ex.sets.filter(x => x.done) })).filter(ex => ex.sets.length);
      if (!a.exercises.length) { toast('Sæt flueben ved de sæt, du har lavet', { type: 'warn' }); return; }
      a.secs = Math.round((Date.now() - a.started) / 1000);
      const recs = T.records([...st.history, a], a, st.custom);
      st.history.push(a); st.active = null; restEnd = 0; store.save();
      toast('Træningen er gemt', { type: recs.length ? 'xp' : 'ok', text: recs.length ? `Ny rekord: ${recs.map(r => `${r.name} ${T.fmtValue(r.value, r.kind)}`).join(', ')}` : `${a.exercises.length} øvelser · ${fmtDur(a.secs)}` });
      open('history');
    }
    function pickExercise() {
      let q = '', close;
      const list = h('div', { class: 'wo-pick' });
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg, eller skriv en ny øvelse', 'aria-label': 'Søg øvelse' });
      const all = () => [...T.EXERCISES, ...st.custom];
      const add = (name) => { st.active.exercises.push(exFor(name)); store.save(); close?.(); open('train'); };
      const draw = () => {
        const t = q.toLowerCase(), found = all().filter(e => !t || e.name.toLowerCase().includes(t) || e.group.toLowerCase().includes(t));
        const groups = [...new Set(found.map(e => e.group))];
        h(clear(list), null, groups.map(g => [h('div', { class: 'cm-emoji-h' }, g), found.filter(e => e.group === g).map(e => h('button', { class: 'wo-pick-btn', onclick: () => add(e.name) }, e.name))]),
          q && !all().some(e => e.name.toLowerCase() === t) ? h('div', { class: 'wo-new' }, h('span', null, `Ny øvelse: “${q}”`),
            ['weight', 'body', 'time', 'cardio'].map(k => h('button', { class: 'btn btn-sm', onclick: () => { st.custom.push({ name: q, kind: k, group: 'Egne' }); add(q); } }, { weight: 'Med vægt', body: 'Kropsvægt', time: 'På tid', cardio: 'Kondition' }[k]))) : null);
      };
      search.addEventListener('input', () => { q = search.value.trim(); draw(); });
      draw();
      const m = modal({ title: 'Tilføj øvelse', label: 'Træning', size: 520, body: h('div', { class: 'stack', style: { gap: '10px' } }, search, list) });
      close = m.close; setTimeout(() => search.focus(), 50);
    }

    // ── history ──
    function historyTab() {
      const list = [...st.history].sort((a, b) => b.date.localeCompare(a.date) || b.started - a.started);
      if (!list.length) return [h('p', { class: 'faint' }, 'Når du har afsluttet en træning, kan du se den her.')];
      return [h('div', { class: 'wo-hist' }, list.slice(0, 100).map(s => h('details', { class: 'wo-session' },
        h('summary', null, h('b', null, s.name), h('span', { class: 'faint' }, `${dateDa(s.date)} · ${s.secs ? fmtDur(s.secs) : ''}${T.sessionVolume(s) ? ` · ${T.fmtKg(T.sessionVolume(s))} i alt` : ''}`)),
        h('ul', null, s.exercises.map(ex => h('li', null, h('b', null, ex.name), ': ', ex.sets.map(x => setText(x, kind(ex.name))).join(', ')))),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Slet træningen?', confirmLabel: 'Slet', danger: true })) { st.history = st.history.filter(x => x !== s); store.save(); open('history'); } } }, icon('trash'), 'Slet'))))];
    }

    // ── progress ──
    function progressTab() {
      const weeks = T.weekly(st.history, 10);
      const maxC = Math.max(1, ...weeks.map(w => w.count));
      const bars = h('div', { class: 'wo-bars', role: 'img', 'aria-label': `Træninger pr. uge de sidste ${weeks.length} uger` }, weeks.map(w => h('div', { class: 'wo-bar' },
        h('i', { style: { height: `${(w.count / maxC) * 100}%` } }, w.count ? String(w.count) : ''), h('span', { class: 'faint' }, `${Number(w.week.slice(8))}/${Number(w.week.slice(5, 7))}`))));
      const names = [...new Set(st.history.flatMap(s => s.exercises.map(e => e.name)))].sort((a, b) => a.localeCompare(b, 'da'));
      const sel = h('select', { class: 'select', 'aria-label': 'Øvelse' }, names.map(n => h('option', { value: n }, n)));
      const chart = h('div');
      const drawChart = () => {
        const name = sel.value, k = kind(name), pts = T.series(st.history, name, st.custom);
        if (!pts.length) { h(clear(chart), null, h('p', { class: 'faint' }, 'Ingen data endnu.')); return; }
        const W = 600, H = 220, P = 32, vals = pts.map(p => p.value), lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05 || 1;
        const x = (i) => P + (pts.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (pts.length - 1)), y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
        const NS = 'http://www.w3.org/2000/svg', el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k2, v] of Object.entries(a)) e.setAttribute(k2, v); return e; };
        const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wo-chart', role: 'img', 'aria-label': `${name}: udvikling` });
        svg.append(el('polyline', { points: pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
        const top = Math.max(...vals);
        pts.forEach((p, i) => { const c = el('circle', { cx: x(i), cy: y(p.value), r: p.value === top ? 7 : 5, class: p.value === top ? 'is-best' : '' }); const t = el('title', {}); t.textContent = `${dateDa(p.date)}: ${T.fmtValue(p.value, k)}`; c.append(t); svg.append(c); });
        const best = pts.find(p => p.value === top);
        h(clear(chart), null, h('p', { class: 'wo-best' }, icon('trophy'), ` Bedste: ${T.fmtValue(top, k)}${k === 'weight' ? ` (beregnet maks. for 1 løft – ${best.reps} × ${best.kg} kg)` : ''} · ${dateDa(best.date)}`), svg);
      };
      sel.addEventListener('change', drawChart);
      if (names.length) drawChart();
      return [panel('Træninger pr. uge', 'chart', bars, h('p', { class: 'faint' }, (() => { const n = T.streakWeeks(st.history); return `${n} ${n === 1 ? 'uge' : 'uger'} i træk med mindst én træning.`; })())),
        panel('Udvikling pr. øvelse', 'trophy', names.length ? [sel, chart] : h('p', { class: 'faint' }, 'Afslut en træning for at se din udvikling.'))];
    }

    // ── routines ──
    function routinesTab() {
      return [h('p', { class: 'muted', style: { margin: 0 } }, 'En rutine er en fast liste af øvelser, du kan starte med ét klik. Vægtene fra sidst bliver foreslået.'),
        h('div', { class: 'wo-starts' }, st.routines.map(r => h('div', { class: 'wo-start is-static' }, h('b', null, r.name), h('span', { class: 'faint' }, r.exercises.join(' · ')),
          h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn btn-sm btn-primary', onclick: () => start(r) }, icon('play'), 'Start'),
            h('button', { class: 'btn btn-sm', onclick: () => editRoutine(r) }, icon('edit'), 'Ret'),
            h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${r.name}`, onclick: async () => { if (await confirmDialog({ title: `Slet “${r.name}”?`, confirmLabel: 'Slet', danger: true })) { st.routines = st.routines.filter(x => x !== r); store.save(); open('routines'); } } }, icon('trash')))))),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: () => editRoutine(null) }, icon('plus'), 'Ny rutine'))];
    }
    function editRoutine(r0) {
      const r = r0 ? structuredClone(r0) : { id: `r-${uid()}`, name: '', exercises: [] };
      const name = h('input', { class: 'input', value: r.name, maxlength: 40, placeholder: 'Fx Mandag', 'aria-label': 'Navn på rutinen' });
      const chosen = h('div', { class: 'wo-chosen' });
      const all = [...T.EXERCISES, ...st.custom];
      const drawChosen = () => h(clear(chosen), null, r.exercises.length ? r.exercises.map((n, i) => h('span', { class: 'chip' }, n, h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${n}`, onclick: () => { r.exercises.splice(i, 1); drawChosen(); } }, icon('x')))) : h('span', { class: 'faint' }, 'Vælg øvelser nedenfor.'));
      drawChosen();
      const err = h('div', { class: 'field-error' });
      h(clear(body), null, panel(r0 ? `Ret ${r0.name}` : 'Ny rutine', 'edit',
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name), chosen,
        h('div', { class: 'wo-pick' }, [...new Set(all.map(e => e.group))].map(g => [h('div', { class: 'cm-emoji-h' }, g), all.filter(e => e.group === g).map(e => h('button', { class: 'wo-pick-btn', onclick: () => { if (r.exercises.length < 15) { r.exercises.push(e.name); drawChosen(); } } }, e.name))])),
        err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => open('routines') }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: () => {
            r.name = name.value.trim();
            if (!r.name || !r.exercises.length) { err.textContent = 'Giv rutinen et navn, og vælg mindst én øvelse.'; return; }
            const i = st.routines.findIndex(x => x.id === r.id);
            if (i >= 0) st.routines[i] = r; else st.routines.push(r);
            store.save(); open('routines');
          } }, icon('check'), 'Gem rutinen'))));
    }

    // clock + rest timer
    clearInterval(self._iv);
    self._iv = setInterval(() => {
      if (!document.body.contains(body)) return;
      const clock = body.querySelector('.wo-clock');
      if (clock && st.active) { const s = Math.floor((Date.now() - st.active.started) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
      const rest = body.querySelector('.wo-rest');
      if (!rest) return;
      const left = Math.ceil((restEnd - Date.now()) / 1000);
      rest.hidden = left <= 0;
      if (left > 0) { rest.querySelector('b').textContent = T.fmtSecs(left); rest.querySelector('i').style.width = `${(left / restTotal) * 100}%`; }
      if (left === 0 && restEnd) { restEnd = 0; try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ } toast('Pausen er slut', { type: 'info', text: 'Klar til næste sæt' }); }
    }, 250);

    const TABS = { train: trainTab, history: historyTab, progress: progressTab, routines: routinesTab };
    function open(id) {
      tab = id; seg.setValue(id);
      history.replaceState(null, '', `#/apps/workout${id === 'train' ? '' : `/${id}`}`);
      h(clear(body), null, TABS[id]());
    }
    const seg = segmented([{ value: 'train', label: 'Træn', icon: 'play' }, { value: 'history', label: 'Historik', icon: 'list' }, { value: 'progress', label: 'Fremskridt', icon: 'chart' }, { value: 'routines', label: 'Rutiner', icon: 'layers' }], tab, (v) => open(v), { label: 'Vælg' });
    open(tab);
    return h('div', { class: 'page wo-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Planlæg', title: 'Træning', lead: 'Skriv dine sæt ned, mens du træner. Se dine rekorder, din udvikling og hvor mange uger i træk du har trænet.', compact: true }),
      h('div', { class: 'cmd-filters', style: { marginBottom: '16px' } }, seg), body);
  },
};
