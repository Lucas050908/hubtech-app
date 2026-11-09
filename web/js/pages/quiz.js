/** IT-quiz – multiple choice in five subjects with an explanation after each answer; records per subject. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { logActivity } from '../core/store.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { QUIZZES } from '../data/quizzes.js';

const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const total = QUIZZES.reduce((a, q) => a + q.qs.length, 0);

export default {
  title: 'Quiz',
  async render() {
    const app = appById('quiz');
    let store;
    try { store = await appState('quiz', { best: {}, played: 0 }); } catch (e) { return loadError('Quiz', e); }
    const st = store.data;
    const body = h('div');

    function home() {
      h(clear(body), null, h('div', { class: 'qz-grid' }, QUIZZES.map(z => {
        const b = st.best[z.id];
        return h('button', { class: 'qz-card glass', type: 'button', onclick: () => play(z) },
          h('span', { class: 'app-card-icon' }, icon(z.icon)),
          h('b', null, z.title), h('span', { class: 'faint' }, `${z.qs.length} spørgsmål`),
          h('span', { class: ['chip', b === z.qs.length && 'chip-ok'] }, b == null ? 'Ikke prøvet' : `Bedste: ${b}/${z.qs.length}`));
      })));
    }

    function play(z) {
      const qs = shuffle(z.qs).map(([q, opts, right, why]) => {
        const order = shuffle(opts.map((o, i) => i));
        return { q, opts: order.map(i => opts[i]), right: order.indexOf(right), why };
      });
      let n = 0, score = 0;
      const step = () => {
        if (n >= qs.length) {
          const prev = st.best[z.id];
          if (prev == null || score > prev) st.best[z.id] = score;
          st.played = (st.played || 0) + 1; store.save();
          logActivity('quiz', 'done', `Quiz: ${z.title}`, `${score} af ${qs.length} rigtige`);
          if (score === qs.length) toast('Alle rigtige!', { type: 'xp', text: z.title });
          h(clear(body), null, panel(`${z.title} – færdig`, 'trophy',
            h('p', { class: 'gl-score' }, `${score} af ${qs.length}`),
            h('p', { class: 'muted' }, score === qs.length ? 'Perfekt – du kan det her.' : score >= qs.length * 0.7 ? 'Flot! Tag den igen for at få alle rigtige.' : 'Læs guiderne under Guides & Læring, og prøv igen.'),
            h('div', { class: 'pd-actions' }, h('button', { class: 'btn btn-primary', onclick: () => play(z) }, icon('refresh'), 'Prøv igen'), h('button', { class: 'btn', onclick: home }, icon('arrowLeft'), 'Alle quizzer'))));
          return;
        }
        const it = qs[n];
        const why = h('div', { class: 'qz-why', 'aria-live': 'polite' });
        const next = h('button', { class: 'btn btn-primary', hidden: true, onclick: () => { n++; step(); } }, n === qs.length - 1 ? 'Se resultat' : 'Næste', icon('arrowRight'));
        const btns = it.opts.map((o, i) => h('button', { class: 'btn gl-opt', onclick: () => {
          btns.forEach((b, j) => { b.disabled = true; if (j === it.right) b.classList.add('is-right'); });
          if (i === it.right) score++; else btns[i].classList.add('is-wrong');
          h(clear(why), null, h('b', null, i === it.right ? 'Rigtigt! ' : 'Ikke helt. '), it.why);
          next.hidden = false; next.focus();
        } }, o));
        h(clear(body), null, panel(`${z.title} · ${n + 1} af ${qs.length}`, z.icon,
          h('div', { class: 'cl-bar', style: { marginBottom: '14px' } }, h('i', { style: { width: `${n / qs.length * 100}%` } })),
          h('p', { class: 'gl-q' }, it.q), h('div', { class: 'gl-opts' }, btns), why,
          h('div', { class: 'pd-actions' }, next, h('button', { class: 'btn btn-ghost', onclick: home }, 'Afbryd'))));
      };
      step();
    }
    home();
    return h('div', { class: 'page qz-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Læring', title: 'Quiz', lead: 'Test din viden om printere, netværk, hardware, sikkerhed og Windows. Du får en forklaring efter hvert svar.',
        stats: [{ icon: 'help', label: 'Spørgsmål', value: String(total) }, { icon: 'layers', label: 'Emner', value: String(QUIZZES.length) }, { icon: 'trophy', label: 'Spillet', value: String(st.played || 0) }] }),
      body);
  },
};
