/** Gæt flaget – four answers, keep your streak going. The best streak goes on the leaderboard. Plus all flags to study. */
import { h, clear, raw } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore } from '../features/gameroom.js';
import { FLAGS, flagSvg } from '../data/flags.js';

const REGIONS = { all: 'Hele verden', eu: 'Europa', w: 'Resten af verden' };
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

export default {
  title: 'Gæt flaget',
  destroy() { clearTimeout(this._t); removeEventListener('keydown', this._k); if (this._streak >= 3) submitScore('flags', this._streak); },
  async render() {
    const app = appById('flags');
    let store;
    try { store = await appState('flags', { best: 0, right: 0, seen: {} }); } catch (e) { return loadError('Gæt flaget', e); }
    const st = store.data, self = this;
    let region = 'all', streak = 0, cur = null, opts = [], answered = false, deck = [];
    const stage = h('div', { class: 'fl-stage' });
    const streakEl = h('b', null, '0'), bestEl = h('b', null, String(st.best));
    const pool = () => FLAGS.filter(f => region === 'all' || f.r === region);

    function next() {
      answered = false;
      if (!deck.length) deck = shuffle(pool());
      cur = deck.pop();
      // wrong answers: preferably flags that look alike (same region, same kind of design)
      const kind = (f) => (f.n ? 'n' : f.h ? `h${f.h.length}` : f.v ? `v${f.v.length}` : 'o');
      const others = shuffle(pool().filter(f => f !== cur));
      const alike = others.filter(f => kind(f) === kind(cur));
      opts = shuffle([cur, ...[...alike, ...others.filter(f => !alike.includes(f))].slice(0, 3)]);
      draw();
    }
    function answer(f) {
      if (answered) return;
      answered = true;
      const ok = f === cur;
      st.seen[cur.id] = (st.seen[cur.id] || 0) + (ok ? 1 : 0);
      if (ok) { streak++; st.right++; if (streak > st.best) { st.best = streak; bestEl.textContent = String(st.best); } }
      else { if (streak >= 3) submitScore('flags', streak); if (streak >= 5) toast(`Stime på ${streak}!`, { type: 'xp' }); streak = 0; }
      streakEl.textContent = String(streak); self._streak = streak;
      store.save(); draw(f);
      self._t = setTimeout(next, ok ? 900 : 2200);
    }
    function draw(picked) {
      clear(stage).append(
        h('div', { class: 'fl-flag', role: 'img', 'aria-label': 'Hvilket land har dette flag?' }, raw(flagSvg(cur))),
        h('div', { class: 'gl-opts fl-opts' }, opts.map((f, i) => h('button', {
          class: ['btn gl-opt', answered && f === cur && 'is-right', answered && f === picked && f !== cur && 'is-wrong'], disabled: answered,
          onclick: () => answer(f) }, h('kbd', null, String(i + 1)), f.name))));
    }
    this._k = (e) => { if (!document.body.contains(stage) || e.target.closest?.('input, textarea')) return; const n = Number(e.key); if (n >= 1 && n <= 4 && opts[n - 1]) answer(opts[n - 1]); };
    addEventListener('keydown', this._k);

    const study = h('div', { class: 'fl-grid' });
    const drawStudy = () => h(clear(study), null, pool().slice().sort((a, b) => a.name.localeCompare(b.name, 'da')).map(f => h('figure', { class: 'fl-card' }, raw(flagSvg(f)), h('figcaption', null, f.name))));
    const seg = segmented(Object.entries(REGIONS).map(([value, label]) => ({ value, label })), region, (v) => { region = v; deck = []; if (streak >= 3) submitScore('flags', streak); streak = 0; streakEl.textContent = '0'; next(); drawStudy(); }, { label: 'Område' });
    next(); drawStudy();
    return h('div', { class: 'page gm-page fl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Gæt flaget', lead: `${FLAGS.length} flag fra hele verden. Hvor lang en stime kan du få? Tryk 1–4 eller klik.`, compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, seg),
      panel(null, null, h('div', { class: 'gm-top' }, h('span', null, 'Stime ', streakEl), h('span', null, 'Bedste ', bestEl)), stage),
      panel('Lær flagene', 'book', study));
  },
};
