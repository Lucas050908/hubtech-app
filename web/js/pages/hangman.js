/** Galgeleg med IT-ord – the words come from IT-ordbogen, and you learn what the word means when the round is over. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { GLOSSARY, GLOSSARY_CATS } from '../data/glossary.js';
import { hangState, isGuessable, normWord } from '../features/gamelogic.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ'.split('');
// a word is usable when it has 3–16 letters to guess and isn't mostly symbols
const WORDS = GLOSSARY.map(([term, cat, text]) => ({ term: term.split(' / ')[0].split(' (')[0], cat, text }))
  .filter(w => { const n = [...normWord(w.term)].filter(isGuessable).length; return n >= 3 && n <= 16 && n >= w.term.length * 0.7; });

const PARTS = [   // gallows first, then the person – 7 wrong guesses
  'M20 150 H120 M45 150 V20 H105 V35', 'M105 35 m-12 12 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0', 'M105 59 V100',
  'M105 70 L85 88', 'M105 70 L125 88', 'M105 100 L88 128', 'M105 100 L122 128'];

export default {
  title: 'Galgeleg',
  destroy() { removeEventListener('keydown', this._k); },
  async render() {
    const app = appById('hangman');
    let store;
    try { store = await appState('hangman', { won: 0, lost: 0, streak: 0, best: 0 }); } catch (e) { return loadError('Galgeleg', e); }
    const st = store.data;
    let cat = 'all', word, guessed, finished;
    const art = h('div', { class: 'hm-art', 'aria-hidden': 'true' });
    const wordEl = h('div', { class: 'hm-word', 'aria-live': 'polite' });
    const keys = h('div', { class: 'hm-keys' });
    const after = h('div', { class: 'hm-after' });
    const stats = h('div', { class: 'gm-top' });

    function next() {
      const pool = WORDS.filter(w => cat === 'all' || w.cat === cat);
      let w; do { w = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && w === word);
      word = w; guessed = []; finished = false; draw();
    }
    function guess(ch) {
      if (finished || guessed.includes(ch)) return;
      guessed.push(ch);
      const s = hangState(word.term, guessed);
      if (s.won || s.lost) {
        finished = true;
        if (s.won) { st.won++; st.streak++; if (st.streak > st.best) st.best = st.streak; if (st.streak > 1 && st.streak % 5 === 0) toast(`${st.streak} ord i træk!`, { type: 'xp' }); }
        else { st.lost++; st.streak = 0; }
        store.save();
      }
      draw();
    }
    function draw() {
      const s = hangState(word.term, guessed);
      art.innerHTML = `<svg viewBox="0 0 140 160" width="140" height="160">${PARTS.map((d, i) => `<path d="${d}" class="${i < s.wrong.length ? 'on' : ''}"/>`).join('')}</svg>`;
      clear(wordEl);
      s.shown.forEach((ch, i) => wordEl.append(h('span', { class: ['hm-ch', ch === ' ' && 'is-space', s.lost && ch === '_' && 'is-miss'] }, s.lost && ch === '_' ? normWord(word.term)[i] : ch === '_' ? '' : ch)));
      wordEl.setAttribute('aria-label', s.shown.map(c => (c === '_' ? 'tom' : c)).join(' '));
      clear(keys);
      LETTERS.forEach(L => keys.append(h('button', { class: ['btn hm-key', guessed.includes(L) && (normWord(word.term).includes(L) ? 'is-hit' : 'is-miss')], disabled: finished || guessed.includes(L), onclick: () => guess(L) }, L)));
      clear(after);
      if (finished) after.append(h('div', { class: ['hm-result glass', s.won ? 'is-ok' : 'is-bad'] },
        h('b', null, s.won ? 'Rigtigt! 🎉' : `Ordet var “${word.term}”`),
        h('p', null, h('strong', null, `${word.term}: `), word.text),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: next }, icon('arrowRight'), 'Næste ord'),
          h('a', { class: 'btn', href: `#/learn/glossary` }, icon('book'), 'Åbn IT-ordbogen'))));
      else after.append(h('p', { class: 'faint', style: { textAlign: 'center', margin: 0 } }, `${7 - s.wrong.length} forkerte gæt tilbage · Kategori: ${GLOSSARY_CATS.find(c => c.id === word.cat)?.label || ''}`));
      h(clear(stats), null, h('span', null, 'Vundet ', h('b', null, String(st.won))), h('span', null, 'I træk ', h('b', null, String(st.streak))), h('span', null, 'Bedste ', h('b', null, String(st.best))));
    }
    this._k = (e) => {
      if (!document.body.contains(keys) || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
      const L = e.key?.toUpperCase?.();
      if (LETTERS.includes(L)) { e.preventDefault(); guess(L); }
      else if (e.key === 'Enter' && finished) { e.preventDefault(); next(); }
    };
    addEventListener('keydown', this._k);
    const seg = segmented([{ value: 'all', label: 'Alle' }, ...GLOSSARY_CATS.map(c => ({ value: c.id, label: c.label }))], cat, (v) => { cat = v; next(); }, { label: 'Kategori' });
    next();
    return h('div', { class: 'page gm-page hm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Galgeleg', lead: 'Gæt IT-ordet bogstav for bogstav – og lær, hvad det betyder. Ordene kommer fra IT-ordbogen.', compact: true }),
      panel(null, null, h('div', { class: 'cmd-filters' }, seg), stats,
        h('div', { class: 'hm-stage' }, art, wordEl), keys, after));
  },
};
