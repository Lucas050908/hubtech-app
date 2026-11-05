/**
 * Course player for every course: the start course "Servicetekniker: de første 12 dage" and the machine courses
 * (LightBurn, xTool, Bambu Lab, VersaWorks …). Progress, notes and "unsure" marks are stored per user and course.
 */
import { h, clear, debounce } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { logActivity, refreshSummary } from '../core/store.js';
import { getState, saveState, flushState, courseProgress } from '../core/services.js';
import { findCourse } from '../data/courses.js';
import { toast, progressBar, stateBlock, confirmDialog } from '../core/ui.js';
import { navigate } from '../core/router.js';

let COURSE = null, ID = '', U = 'Dag';
let state = null;
const hue = () => COURSE.hue || 'var(--hue-course)';

function ensure(i) {
  state.days = state.days || {};
  state.days[i] = state.days[i] || { tasks: [], unsure: [], notes: '', complete: false };
  return state.days[i];
}

function persist() {
  state.updatedAt = Math.floor(Date.now() / 1000);
  saveState(ID, state, { onError: (e) => toast('Fremdrift ikke gemt', { type: 'bad', text: e.message }) });
}

function dayStatus(i) {
  const d = state.days?.[i];
  const n = (d?.tasks || []).filter(Boolean).length;
  if (d?.complete) return 'done';
  if (n > 0 || d?.notes) return 'progress';
  return 'todo';
}

function overview(root) {
  const pr = courseProgress(state, COURSE.days);
  const next = Math.min(COURSE.days.length, pr.lastDay + 1);
  const unsure = [];
  COURSE.days.forEach((d, i) => (state.days?.[i]?.unsure || []).forEach((u, j) => { if (u) unsure.push({ day: i, q: d.q[j] }); }));
  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'crumbs' }, h('a', { href: '#/learn' }, 'Guides & Læring'), icon('chevronRight'), h('span', null, COURSE.short)),
        h('h1', null, COURSE.title), h('p', null, COURSE.intro)),
      h('div', { class: 'page-head-actions' },
        h('a', { class: 'btn btn-primary btn-lg', href: `#/learn/course/${COURSE.id}/day/${next}` }, icon(pr.started ? 'play' : 'arrowRight'), pr.started ? `Fortsæt · ${U.toLowerCase()} ${next}` : `Start ${U.toLowerCase()} 1`))),
    h('div', { class: 'with-rail' },
      h('section', { class: 'glass panel' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, `${COURSE.days.length} ${U === 'Dag' ? 'dage' : 'lektioner'}`)),
        h('ol', { class: 'day-grid' }, COURSE.days.map((d, i) => {
          const st = dayStatus(i);
          const n = (state.days?.[i]?.tasks || []).filter(Boolean).length;
          return h('li', null, h('a', { class: ['day-tile', `is-${st}`], href: `#/learn/course/${COURSE.id}/day/${i + 1}` },
            h('span', { class: 'day-num' }, st === 'done' ? h('span', { html: svg('check') }) : String(i + 1)),
            h('span', { class: 'day-main' }, h('b', null, d.t), h('span', { class: 'faint' }, d.g)),
            h('span', { class: 'day-count mono faint' }, `${n}/${d.d.length}`)));
        }))),
      h('aside', { class: 'rail' },
        h('section', { class: 'glass panel', style: { '--app': hue() } },
          h('div', { class: 'course-ring' },
            h('div', { class: 'ring-progress', style: { '--v': pr.pct, '--size': '110px', '--app': hue() } }, h('span', { style: { fontSize: '1.3rem' } }, `${pr.pct}%`)),
            h('div', null, h('b', null, `${pr.daysDone} af ${pr.totalDays} ${U === 'Dag' ? 'dage' : 'lektioner'}`), h('div', { class: 'faint' }, `${pr.done} af ${pr.tasks} øvelser`), h('div', { class: 'faint' }, `${pr.done * 15 + pr.daysDone * 50} XP optjent`)))),
        h('section', { class: 'glass panel' },
          h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('target'), 'Til repetition')),
          unsure.length ? h('ul', { class: 'g-list' }, unsure.slice(0, 8).map(u => h('li', null, h('a', { href: `#/learn/course/${COURSE.id}/day/${u.day + 1}` }, `${U} ${u.day + 1}: `, u.q[0]))))
            : h('p', { class: 'faint' }, 'Markér spørgsmål i “Tjek dig selv”, som du var usikker på – så samles de her til repetition.')),
        h('section', { class: 'glass panel' },
          h('p', { class: 'faint', style: { fontSize: 'var(--fs-sm)' } }, COURSE.note),
          h('button', { class: 'btn btn-sm btn-danger', style: { marginTop: '12px' }, onclick: async () => {
            if (!(await confirmDialog({ title: 'Nulstil fremdrift?', text: 'Alle afkrydsninger, noter og markeringer i kurset slettes fra din konto.', confirmLabel: 'Nulstil', danger: true }))) return;
            state = { startedAt: null, days: {}, lastDay: 0 }; persist(); flushState(ID); refreshSummary(); navigate(`/learn/course/${COURSE.id}`);
            toast('Kursets fremdrift er nulstillet', { type: 'ok' });
          } }, icon('refresh'), 'Nulstil fremdrift')))));
}

function dayView(root, idx) {
  const d = COURSE.days[idx];
  const s = ensure(idx);
  state.lastDay = idx;
  state.startedAt = state.startedAt || Math.floor(Date.now() / 1000);
  persist();
  const total = COURSE.days.length;

  const nav = h('nav', { class: 'day-nav', 'aria-label': U === 'Dag' ? 'Kursusdage' : 'Lektioner' }, COURSE.days.map((x, i) => h('a', {
    class: ['day-pill', `is-${dayStatus(i)}`], href: `#/learn/course/${COURSE.id}/day/${i + 1}`, 'aria-current': i === idx ? 'page' : null, 'aria-label': `${U} ${i + 1}: ${x.t}`,
  }, String(i + 1))));

  const bar = h('div');
  const drawBar = () => { const pr = courseProgress(state, COURSE.days); bar.replaceChildren(h('div', { class: 'ch-row' }, h('span', { class: 'faint' }, 'Kursets fremdrift'), h('span', { class: 'mono faint' }, `${pr.pct} %`)), progressBar(pr.pct, { app: hue() })); };
  drawBar();

  const tasks = h('ul', { class: 'tasks' }, d.d.map((t, j) => {
    const cb = h('input', { type: 'checkbox', checked: !!s.tasks[j], id: `t${idx}-${j}` });
    cb.addEventListener('change', () => {
      s.tasks[j] = cb.checked;
      const all = d.d.every((_, k) => s.tasks[k]);
      const wasComplete = s.complete;
      s.complete = all;
      persist();
      drawBar();
      nav.querySelectorAll('.day-pill')[idx].className = `day-pill is-${dayStatus(idx)}`;
      if (cb.checked) toast('+15 XP', { type: 'xp', text: 'Øvelse klaret', ms: 1400 });
      if (all && !wasComplete) {
        toast(`${U} ${idx + 1} gennemført`, { type: 'xp', text: '+50 XP – godt arbejde!' });
        logActivity('learning', 'course-day', `${COURSE.short} – ${U} ${idx + 1}`, `${d.t} gennemført`, `${COURSE.id}:${idx + 1}`);
        flushState(ID);
        setTimeout(refreshSummary, 600);
      } else setTimeout(refreshSummary, 800);
    });
    return h('li', null, h('label', { class: 'task', for: `t${idx}-${j}` }, cb, h('span', { class: 'task-box', html: svg('check'), 'aria-hidden': 'true' }), h('span', { class: 'task-text' }, t)));
  }));

  const quiz = h('div', { class: 'faq' }, d.q.map(([q, a], j) => {
    const unsure = h('button', { class: 'chip', 'aria-pressed': String(!!s.unsure?.[j]) }, icon('target'), s.unsure?.[j] ? 'Til repetition' : 'Jeg var usikker');
    unsure.addEventListener('click', (e) => {
      e.preventDefault();
      s.unsure = s.unsure || [];
      s.unsure[j] = !s.unsure[j];
      unsure.setAttribute('aria-pressed', String(s.unsure[j]));
      unsure.lastChild.textContent = s.unsure[j] ? 'Til repetition' : 'Jeg var usikker';
      persist();
    });
    return h('details', { class: 'faq-item' }, h('summary', null, q, icon('chevronDown')), h('div', { class: 'faq-a' }, h('p', null, a), unsure));
  }));

  const notes = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Dine noter – gemmes automatisk på din konto.', 'aria-label': `Noter til ${U.toLowerCase()} ${idx + 1}` });
  notes.value = s.notes || '';
  const noteState = h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } });
  notes.addEventListener('input', debounce(() => { s.notes = notes.value.slice(0, 5000); persist(); noteState.textContent = 'Gemt ✓'; }, 500));

  logActivity('learning', 'course', `${COURSE.short} – ${U} ${idx + 1}`, d.t, `${COURSE.id}:${idx + 1}`);

  root.append(
    h('div', { class: 'course-top' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/learn' }, 'Guides & Læring'), icon('chevronRight'), h('a', { href: `#/learn/course/${COURSE.id}` }, COURSE.short), icon('chevronRight'), h('span', null, `${U} ${idx + 1}`)),
      nav, bar),
    h('article', { class: 'glass panel day-card', style: { '--app': hue() } },
      h('div', { class: 'day-head' },
        h('span', { class: 'chip chip-app' }, `${U} ${idx + 1} af ${total}`),
        s.complete ? h('span', { class: 'chip chip-ok' }, icon('check'), 'Gennemført') : null),
      h('h1', { class: 'day-title' }, d.t),
      h('p', { class: 'day-goal' }, icon('target'), d.g),
      h('div', { class: 'day-cols' },
        h('div', null,
          h('h2', { class: 'g-h' }, 'Læs'),
          h('ul', { class: 'read-list' }, d.r.map(([label, url]) => h('li', null, h('a', { href: url, target: '_blank', rel: 'noopener' }, icon('external'), label)))),
          h('h2', { class: 'g-h' }, 'Lær'),
          h('ul', { class: 'g-list' }, d.l.map(x => h('li', null, x)))),
        h('div', null,
          h('h2', { class: 'g-h' }, 'Øv'),
          tasks,
          h('h2', { class: 'g-h' }, 'Tjek dig selv'),
          quiz,
          h('h2', { class: 'g-h', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, 'Noter', noteState),
          notes)),
      h('div', { class: 'day-pager' },
        h('a', { class: ['btn', idx === 0 && 'is-hidden'], href: `#/learn/course/${COURSE.id}/day/${idx}`, 'aria-disabled': idx === 0 ? 'true' : null }, icon('arrowLeft'), U === 'Dag' ? 'Forrige dag' : 'Forrige lektion'),
        idx < total - 1 ? h('a', { class: 'btn btn-primary', href: `#/learn/course/${COURSE.id}/day/${idx + 2}` }, U === 'Dag' ? 'Næste dag' : 'Næste lektion', icon('arrowRight'))
          : h('a', { class: 'btn btn-primary', href: `#/learn/course/${COURSE.id}` }, 'Til kursusoversigten', icon('check')))));
}

export default {
  title: 'Kursus',
  destroy() { if (ID) flushState(ID); },
  async render(ctx) {
    const root = h('div', { class: 'page course-page' });
    if (ID) flushState(ID);
    const found = await findCourse(ctx.params.id).catch(() => null);
    if (!found) {
      root.appendChild(stateBlock({ icon: 'book', title: 'Kurset findes ikke', actions: [h('a', { class: 'btn btn-primary', href: '#/learn' }, 'Til læring')] }));
      return root;
    }
    COURSE = found; ID = found.stateId; U = found.unit || 'Dag';
    root.style.setProperty('--hue-course', hue());
    try { state = (await getState(ID)) || { days: {}, lastDay: 0 }; }
    catch (e) { root.appendChild(stateBlock({ kind: 'error', icon: 'alert', title: 'Fremdriften kunne ikke hentes', text: e.message })); return root; }
    if (ctx.params.day) {
      const idx = Number(ctx.params.day) - 1;
      if (!(idx >= 0 && idx < COURSE.days.length)) { root.appendChild(stateBlock({ icon: 'compass', title: U === 'Dag' ? 'Den dag findes ikke' : 'Den lektion findes ikke', actions: [h('a', { class: 'btn btn-primary', href: `#/learn/course/${COURSE.id}` }, 'Kursusoversigt')] })); return root; }
      this.title = `${U} ${idx + 1} · ${COURSE.short}`;
      dayView(root, idx);
    } else {
      this.title = COURSE.title;
      overview(root);
    }
    return root;
  },
};
