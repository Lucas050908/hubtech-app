/** IT-ordbog – IT words in plain Danish: search, browse by subject, practise, and turn them into Huskekort. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { getState, saveState } from '../core/services.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';
import { GLOSSARY, GLOSSARY_CATS } from '../data/glossary.js';

const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

export default {
  title: 'IT-ordbog',
  async render() {
    const app = appById('glossary');
    let store;
    try { store = await appState('glossary', { known: [], best: 0 }); } catch (e) { return loadError('IT-ordbog', e); }
    const st = store.data;
    let cat = 'all', mode = 'browse';
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Søg i ordbogen – fx “dns”, “toner”, “backup”', 'aria-label': 'Søg i ordbogen' });
    const body = h('div');
    const knownCount = h('span');
    const items = () => GLOSSARY.filter(([t, c, d]) => (cat === 'all' || c === cat) && (!q.value.trim() || (t + ' ' + d).toLowerCase().includes(q.value.trim().toLowerCase())))
      .sort((a, b) => a[0].localeCompare(b[0], 'da'));

    function browse() {
      const list = items();
      knownCount.textContent = String(st.known.length);
      if (!list.length) { h(clear(body), null, h('p', { class: 'faint' }, 'Ingen ord matcher.')); return; }
      let letter = '';
      const out = [];
      for (const [t, c, d] of list) {
        const L = t[0].toUpperCase();
        if (L !== letter && !q.value.trim()) { letter = L; out.push(h('h3', { class: 'gl-letter' }, L)); }
        const known = st.known.includes(t);
        const mark = h('button', { class: ['icon-btn', 'btn-sm', known && 'is-on'], 'aria-pressed': String(known), 'aria-label': known ? `Markér “${t}” som ikke lært` : `Markér “${t}” som lært`, title: known ? 'Lært' : 'Markér som lært' }, icon(known ? 'checkCircle' : 'check'));
        mark.addEventListener('click', () => { st.known = known ? st.known.filter(x => x !== t) : [...st.known, t]; store.save(); browse(); });
        out.push(h('article', { class: ['gl-term', known && 'is-known'] },
          h('div', { class: 'gl-head' }, h('b', null, t), h('span', { class: 'chip' }, GLOSSARY_CATS.find(x => x.id === c)?.label), mark),
          h('p', null, d)));
      }
      h(clear(body), null, h('div', { class: 'gl-list' }, out));
    }

    let quiz = null;
    function practise() {
      const pool = items().length >= 4 ? items() : GLOSSARY;
      if (!quiz) quiz = { n: 0, score: 0, order: shuffle(pool).slice(0, 10) };
      if (quiz.n >= quiz.order.length) {
        const best = Math.max(st.best || 0, quiz.score);
        if (best !== st.best) { st.best = best; store.save(); }
        h(clear(body), null, panel('Færdig!', 'trophy', h('p', { class: 'gl-score' }, `${quiz.score} af ${quiz.order.length} rigtige`), h('p', { class: 'muted' }, `Din bedste: ${best} af 10.`),
          h('button', { class: 'btn btn-primary', onclick: () => { quiz = null; practise(); } }, icon('refresh'), 'Prøv igen')));
        return;
      }
      const [term, , desc] = quiz.order[quiz.n];
      const opts = shuffle([term, ...shuffle(pool.filter(x => x[0] !== term)).slice(0, 3).map(x => x[0])]);
      const fb = h('div', { class: 'gl-fb', 'aria-live': 'polite' });
      const btns = opts.map(o => h('button', { class: 'btn gl-opt', onclick: (e) => {
        btns.forEach(b => { b.disabled = true; if (b.textContent === term) b.classList.add('is-right'); });
        if (o === term) { quiz.score++; fb.textContent = 'Rigtigt!'; } else { e.currentTarget.classList.add('is-wrong'); fb.textContent = `Det rigtige svar er “${term}”.`; }
        setTimeout(() => { quiz.n++; practise(); }, o === term ? 700 : 1600);
      } }, o));
      h(clear(body), null, panel(`Spørgsmål ${quiz.n + 1} af ${quiz.order.length}`, 'help',
        h('p', { class: 'gl-q' }, desc), h('div', { class: 'gl-opts' }, btns), fb,
        h('p', { class: 'faint small', style: { margin: '10px 0 0' } }, `Point: ${quiz.score}`)));
    }

    async function toFlashcards() {
      const list = items();
      try {
        const fc = (await getState('flashcards', { force: true })) || { decks: [], cards: [], log: {}, reviews: 0 };
        fc.decks = fc.decks || []; fc.cards = fc.cards || [];
        const name = `IT-ordbog – ${cat === 'all' ? 'alle ord' : GLOSSARY_CATS.find(c => c.id === cat).label}`;
        let deck = fc.decks.find(d => d.name === name);
        if (!deck) { deck = { id: uid(), name, color: '#fda4af', created: Date.now() }; fc.decks.push(deck); }
        const have = new Set(fc.cards.filter(c => c.deck === deck.id).map(c => c.front));
        let n = 0;
        for (const [t, , d] of list) if (!have.has(t)) { fc.cards.push({ id: uid(), deck: deck.id, front: t, back: d, created: Date.now(), due: 0, reps: 0, ivl: 0, ease: 2.5, lapses: 0 }); n++; }
        saveState('flashcards', fc);
        toast(n ? `${n} huskekort lavet` : 'Kortene findes allerede', { type: 'ok', text: name, action: { label: 'Åbn Huskekort', onClick: () => { location.hash = '#/learn/flashcards'; } } });
      } catch (e) { toast('Kunne ikke lave huskekort', { type: 'bad', text: e.message }); }
    }

    const draw = () => (mode === 'browse' ? browse() : practise());
    q.addEventListener('input', () => { quiz = null; draw(); });
    const catSeg = segmented([{ value: 'all', label: 'Alle' }, ...GLOSSARY_CATS.map(c => ({ value: c.id, label: c.label }))], 'all', (v) => { cat = v; quiz = null; draw(); }, { label: 'Emne' });
    const modeSeg = segmented([{ value: 'browse', label: 'Ordbog' }, { value: 'quiz', label: 'Øv dig' }], 'browse', (v) => { mode = v; quiz = null; draw(); }, { label: 'Visning' });
    draw();
    return h('div', { class: 'page gl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Læring', title: 'IT-ordbog', lead: 'De ord, du møder som servicetekniker – forklaret på almindeligt dansk. Søg, øv dig, og lav dem om til huskekort.',
        stats: [{ icon: 'book', label: 'Ord', value: String(GLOSSARY.length) }, { icon: 'checkCircle', label: 'Lært', value: knownCount }, { icon: 'trophy', label: 'Bedste quiz', value: `${st.best || 0}/10` }] }),
      panel(null, null, h('div', { class: 'cmd-filters' }, q, h('div', { class: 'gl-bar' }, modeSeg, h('button', { class: 'btn btn-sm', onclick: toFlashcards }, icon('layers'), 'Lav huskekort')), catSeg)),
      h('div', { style: { marginTop: '16px' } }, body));
  },
};
