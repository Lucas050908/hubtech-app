/** Tastaturtræner – learn to type with ten fingers: lessons from the home row to real sentences, speed and accuracy, records. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { logActivity } from '../core/store.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';

const LESSONS = [
  { id: 'home', title: 'Hjemrækken', hint: 'Fingrene hviler på a s d f og j k l æ. Tommelfingrene på mellemrum.', texts: ['asdf jklæ asdf jklæ fdsa ælkj', 'sal dal fald jal kaskade', 'fad flask æsel klas klasse', 'saks lak dask flad dall'] },
  { id: 'top', title: 'Øverste række', hint: 'Ræk op fra hjemrækken og tilbage igen: q w e r t y u i o p å.', texts: ['were tree pure quiet power', 'rute ruter tirsdag ude oppe', 'pære porte river etage ryttere', 'tyr tur tipper ripper retter'] },
  { id: 'bottom', title: 'Nederste række', hint: 'Ræk ned: z x c v b n m og komma, punktum, bindestreg.', texts: ['ben bind vinden mange cyklen', 'zebra boxen cement banan', 'vind, vand, venner, vinter.', 'mange mennesker bor ved byen'] },
  { id: 'nums', title: 'Tal og tegn', hint: 'Tallene sidder over q–p. Hold blikket på skærmen.', texts: ['192.168.1.1 og 10.0.0.1', 'port 443, port 80 og port 22', 'Ring 70 20 30 40 kl. 8:15', 'Pris: 1.299,95 kr. inkl. moms'] },
  { id: 'words', title: 'Hverdagsord', hint: 'Almindelige danske ord med æ, ø og å.', texts: ['Øl, æbler og blåbær på bordet.', 'Hun gik ned ad gaden i går.', 'Vi ses på fredag efter skole.', 'Kaffen er kold, men kagen er god.'] },
  { id: 'it', title: 'IT-sætninger', hint: 'Sætninger fra hverdagen som servicetekniker.', texts: [
    'Genstart printeren, og prøv at udskrive igen.', 'Kunden kan ikke logge ind på sin e-mail.', 'Husk at tage backup, før du opdaterer Windows.',
    'Routeren giver printeren en ny IP-adresse.', 'Slå totrinsbekræftelse til på alle konti.', 'Tjek kablet, før du skifter netværkskortet.'] },
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default {
  title: 'Tastaturtræner',
  destroy() { if (this._t) clearInterval(this._t); },
  async render() {
    const app = appById('typing');
    let store;
    try { store = await appState('typing', { runs: [], best: 0 }); } catch (e) { return loadError('Tastaturtræner', e); }
    const st = store.data;
    let lesson = LESSONS[0], target = '', started = 0, errors = 0, done = false;
    const self = this;
    const textEl = h('div', { class: 'ty-text', 'aria-hidden': 'true' });
    const input = h('textarea', { class: 'ty-input', rows: 2, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Skriv teksten her' });
    const live = { wpm: h('b', null, '0'), acc: h('b', null, '100 %'), time: h('b', null, '0 s') };
    const hint = h('p', { class: 'muted ty-hint' });
    const result = h('div', { 'aria-live': 'polite' });
    const best = { v: h('span') };
    const hist = h('div', { class: 'ty-hist' });

    const wpm = (chars, ms) => (ms > 0 ? Math.round(chars / 5 / (ms / 60000)) : 0);
    function newText() {
      target = pick(lesson.texts.filter(t => t !== target)) || lesson.texts[0];
      started = 0; errors = 0; done = false;
      input.value = ''; input.disabled = false;
      hint.textContent = lesson.hint;
      clear(result); paint(); stats();
      setTimeout(() => input.focus(), 30);
    }
    function paint() {
      const v = input.value;
      clear(textEl);
      [...target].forEach((ch, i) => {
        const cls = i < v.length ? (v[i] === ch ? 'ok' : 'bad') : i === v.length ? 'cur' : '';
        textEl.append(h('span', { class: cls }, ch === ' ' ? ' ' : ch));
      });
    }
    function stats() {
      const ms = started ? Date.now() - started : 0;
      const v = input.value;
      const right = [...v].filter((c, i) => c === target[i]).length;
      live.wpm.textContent = String(wpm(right, ms));
      live.acc.textContent = `${v.length + errors ? Math.max(0, Math.round((v.length - (v.length - right)) / (v.length + errors) * 100)) : 100} %`;
      live.time.textContent = `${Math.round(ms / 1000)} s`;
      best.v.textContent = `${st.best || 0} ord/min`;
    }
    input.addEventListener('beforeinput', (e) => { if (done) e.preventDefault(); });
    input.addEventListener('input', () => {
      if (!started) started = Date.now();
      const v = input.value;
      if (v.length > target.length) input.value = v.slice(0, target.length);
      const last = input.value.length - 1;
      if (last >= 0 && input.value[last] !== target[last]) errors++;
      paint(); stats();
      if (input.value === target) finish();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    function finish() {
      done = true; input.disabled = true;
      const ms = Date.now() - started;
      const speed = wpm(target.length, ms);
      const acc = Math.round(target.length / (target.length + errors) * 100);
      const record = speed > (st.best || 0) && acc >= 90;
      st.runs = [{ at: Date.now(), lesson: lesson.id, wpm: speed, acc }, ...st.runs].slice(0, 100);
      if (record) st.best = speed;
      store.save(); drawHist();
      logActivity('typing', 'run', `${speed} ord/min`, `${lesson.title} · ${acc} % rigtigt`);
      if (record) toast('Ny rekord!', { type: 'xp', text: `${speed} ord i minuttet` });
      h(clear(result), null, h('div', { class: ['ty-result', acc >= 95 ? 'is-ok' : ''] },
        h('div', null, h('b', null, `${speed}`), h('span', null, 'ord/min')), h('div', null, h('b', null, `${acc} %`), h('span', null, 'rigtigt')), h('div', null, h('b', null, `${(ms / 1000).toFixed(1)} s`), h('span', null, 'tid')),
        h('button', { class: 'btn btn-primary', onclick: newText }, icon('refresh'), 'Næste tekst')));
      stats();
    }
    function drawHist() {
      clear(hist);
      const runs = st.runs.slice(0, 12).reverse();
      if (!runs.length) { hist.append(h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen øvelser endnu.')); return; }
      const max = Math.max(30, ...runs.map(r => r.wpm));
      runs.forEach(r => hist.append(h('div', { class: 'fx-bar', title: `${r.wpm} ord/min · ${r.acc} %` }, h('span', { class: 'fx-bar-v' }, String(r.wpm)), h('i', { style: { height: `${Math.round(r.wpm / max * 100)}%` } }), h('span', { class: 'fx-bar-d' }, `${r.acc}%`))));
    }
    self._t = setInterval(() => { if (started && !done) stats(); }, 500);
    const seg = segmented(LESSONS.map(l => ({ value: l.id, label: l.title })), lesson.id, (v) => { lesson = LESSONS.find(l => l.id === v); newText(); }, { label: 'Lektion' });
    newText(); drawHist();
    return h('div', { class: 'page ty-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Læring', title: 'Tastaturtræner', lead: 'Lær at skrive hurtigt med ti fingre – fra hjemrækken til rigtige sætninger med æ, ø og å. Se på skærmen, ikke på tastaturet.',
        stats: [{ icon: 'trophy', label: 'Rekord', value: best.v }, { icon: 'list', label: 'Lektioner', value: String(LESSONS.length) }, { icon: 'clock', label: 'Øvelser', value: String(st.runs.length) }] }),
      panel(null, null, h('div', { class: 'cmd-filters' }, seg), hint,
        h('div', { class: 'ty-box', onclick: () => input.focus() }, textEl, input),
        h('div', { class: 'ty-live' }, h('span', null, live.wpm, ' ord/min'), h('span', null, live.acc, ' rigtigt'), h('span', null, live.time),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: newText }, icon('refresh'), 'Ny tekst')),
        result),
      panel('Dine seneste øvelser', 'chart', hist, h('p', { class: 'faint small', style: { margin: '8px 0 0' } }, 'Rekorder tæller kun med mindst 90 % rigtigt – hastighed uden præcision hjælper ikke.')));
  },
};
