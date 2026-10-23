/** Three small puzzle games in one module: Kodeknækker, Skubbepuslespil and Følg mønstret. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { mmScore, mmSecret, slideShuffle, slideMove, isSolved } from '../features/arcade2.js';

const PEGS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];
const PEG_NAMES = ['rød', 'blå', 'grøn', 'gul', 'lilla', 'orange', 'pink', 'turkis'];

export const mastermind = {
  title: 'Kodeknækker',
  async render() {
    const app = appById('mastermind');
    let store;
    try { store = await appState('mastermind', { level: 'normal', wins: 0, played: 0, best: {} }); } catch (e) { return loadError('Kodeknækker', e); }
    const st = store.data;
    const LV = { easy: { colors: 6, len: 4, tries: 10, repeats: false, name: 'Let' }, normal: { colors: 6, len: 4, tries: 10, repeats: true, name: 'Normal' }, hard: { colors: 8, len: 5, tries: 12, repeats: true, name: 'Svær' } };
    const root = h('div');
    function game() {
      const L = LV[st.level], secret = mmSecret(L.len, L.colors, Math.random, L.repeats), rows = [];
      let cur = [], over = false;
      const draw = () => {
        const won = rows.at(-1)?.score.exact === L.len;
        h(clear(root), null,
          h('div', { class: 'sh-top' }, segmented(Object.entries(LV).map(([k, v]) => ({ value: k, label: v.name })), st.level, (v) => { st.level = v; store.save(); game(); }, { label: 'Sværhed' }), h('span', { class: 'faint' }, `${rows.length}/${L.tries} forsøg`), h('button', { class: 'btn btn-sm', onclick: game }, icon('refresh'), 'Nyt spil')),
          h('div', { class: 'mm-board' },
            h('div', { class: 'mm-row mm-secret' }, secret.map(c => h('span', { class: 'mm-peg', style: over ? { background: PEGS[c] } : null }, over ? '' : '?')), h('span', { class: 'mm-fb' })),
            rows.slice().reverse().map(r => h('div', { class: 'mm-row' }, r.guess.map(c => h('span', { class: 'mm-peg', style: { background: PEGS[c] }, title: PEG_NAMES[c] })),
              h('span', { class: 'mm-fb', 'aria-label': `${r.score.exact} rigtig plads, ${r.score.near} rigtig farve` }, Array.from({ length: L.len }, (_, i) => h('i', { class: i < r.score.exact ? 'b' : i < r.score.exact + r.score.near ? 'w' : '' }))))),
            !over ? h('div', { class: 'mm-row mm-cur' }, Array.from({ length: L.len }, (_, i) => h('button', { class: 'mm-peg', style: cur[i] != null ? { background: PEGS[cur[i]] } : null, 'aria-label': cur[i] != null ? `Fjern ${PEG_NAMES[cur[i]]}` : 'Tom', onclick: () => { cur.splice(i, 1); draw(); } })),
              h('button', { class: 'btn btn-sm btn-primary', disabled: cur.length < L.len, onclick: guess }, 'Gæt')) : null),
          !over ? h('div', { class: 'mm-palette' }, PEGS.slice(0, L.colors).map((c, i) => h('button', { class: 'mm-peg big', style: { background: c }, 'aria-label': PEG_NAMES[i], disabled: cur.length >= L.len || (!L.repeats && cur.includes(i)), onclick: () => { cur.push(i); draw(); } }))) : null,
          over ? h('div', { class: ['dm-status', 'is-over'] }, won ? `Knækket på ${rows.length} forsøg! 🔓` : 'Ikke knækket denne gang – koden står øverst.') : null,
          h('p', { class: 'faint', style: { fontSize: '13px' } }, '● sort = rigtig farve på rigtig plads · ○ hvid = rigtig farve på forkert plads', L.repeats ? ' · samme farve kan bruges flere gange' : ''));
      };
      function guess() {
        const score = mmScore(secret, cur); rows.push({ guess: cur, score }); cur = [];
        if (score.exact === L.len || rows.length >= L.tries) {
          over = true; st.played++;
          if (score.exact === L.len) { st.wins++; if (!st.best[st.level] || rows.length < st.best[st.level]) { st.best[st.level] = rows.length; toast('Ny rekord!', { type: 'xp', text: `${rows.length} forsøg` }); } }
          store.save();
        }
        draw();
      }
      draw();
    }
    game();
    return h('div', { class: 'page mm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Kodeknækker', lead: 'Gæt den hemmelige farvekode. Efter hvert gæt får du at vide, hvor mange der sidder rigtigt – brug logik til at knække den.', compact: true }), root);
  },
};

export const slide = {
  title: 'Skubbepuslespil',
  destroy() { clearInterval(this._iv); },
  async render() {
    const app = appById('slide');
    let store;
    try { store = await appState('slide', { size: 4, best: {} }); } catch (e) { return loadError('Skubbepuslespil', e); }
    const st = store.data, self = this;
    const root = h('div');
    function game() {
      clearInterval(self._iv);
      const n = st.size; let tiles = slideShuffle(n), moves = 0, t0 = null, done = false;
      const timeEl = h('b');
      const tick = () => { timeEl.textContent = t0 ? `${Math.floor((Date.now() - t0) / 1000)} s` : '0 s'; };
      const draw = () => {
        h(clear(root), null,
          h('div', { class: 'sh-top' }, segmented([3, 4, 5].map(k => ({ value: String(k), label: `${k}×${k}` })), String(n), (v) => { st.size = Number(v); store.save(); game(); }, { label: 'Størrelse' }),
            h('span', null, h('b', null, String(moves)), ' træk'), timeEl, st.best[n] ? h('span', { class: 'faint' }, `Rekord: ${st.best[n].moves} træk`) : null, h('button', { class: 'btn btn-sm', onclick: game }, icon('refresh'), 'Bland')),
          h('div', { class: ['sl-board', done && 'is-done'], style: { gridTemplateColumns: `repeat(${n}, 1fr)` } }, tiles.map((v, i) => v ? h('button', { class: 'sl-tile', 'aria-label': `Brik ${v}`, onclick: () => {
            if (done) return; const nt = slideMove(tiles, n, i); if (!nt) return;
            if (!t0) t0 = Date.now(); tiles = nt; moves++;
            if (isSolved(tiles)) { done = true; clearInterval(self._iv); const secs = Math.round((Date.now() - t0) / 1000); const b = st.best[n]; if (!b || moves < b.moves) { st.best[n] = { moves, secs }; store.save(); toast('Ny rekord! 🧩', { type: 'xp', text: `${moves} træk på ${secs} sekunder` }); } else toast(`Løst på ${moves} træk!`, { type: 'ok' }); }
            draw();
          } }, String(v)) : h('span', { class: 'sl-hole' }))),
          done ? h('div', { class: 'dm-status is-over' }, `Løst på ${moves} træk og ${timeEl.textContent}! 🎉`) : h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Tryk på en brik i samme række eller kolonne som hullet for at skubbe. Få tallene i rækkefølge.'));
        tick();
      };
      self._iv = setInterval(() => { if (!document.body.contains(timeEl)) return clearInterval(self._iv); if (!done) tick(); }, 500);
      draw();
    }
    game();
    return h('div', { class: 'page sl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Skubbepuslespil', lead: 'Det klassiske puslespil med tal: skub brikkerne på plads med så få træk som muligt.', compact: true }), root);
  },
};

export const simon = {
  title: 'Følg mønstret',
  async render() {
    const app = appById('simon');
    let store;
    try { store = await appState('simon', { best: 0 }); } catch (e) { return loadError('Følg mønstret', e); }
    const st = store.data;
    const root = h('div');
    const TONES = [329.63, 261.63, 220, 164.81], COLORS = ['#22c55e', '#ef4444', '#eab308', '#3b82f6'];
    let ac = null;
    const tone = (i, ms = 350) => { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = TONES[i]; g.gain.setValueAtTime(0.25, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000); o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + ms / 1000); } catch { /* */ } };
    let seq = [], pos = 0, playing = false, btns = [];
    const status = h('div', { class: 'dm-status' }, 'Tryk Start og husk rækkefølgen.');
    const flash = (i, ms) => { btns[i].classList.add('on'); tone(i, ms); setTimeout(() => btns[i].classList.remove('on'), ms - 60); };
    const show = async () => {
      playing = true; status.textContent = `Runde ${seq.length} – se godt efter …`;
      const ms = Math.max(220, 600 - seq.length * 20);
      for (const i of seq) { await new Promise(r => setTimeout(r, ms * 0.45)); flash(i, ms); await new Promise(r => setTimeout(r, ms)); }
      playing = false; pos = 0; status.textContent = `Din tur – gentag ${seq.length} ${seq.length === 1 ? 'farve' : 'farver'}`;
    };
    const next = () => { seq.push(Math.floor(Math.random() * 4)); show(); };
    const press = (i) => {
      if (playing || !seq.length) return;
      flash(i, 260);
      if (i !== seq[pos]) {
        const score = seq.length - 1; const best = score > st.best; if (best) { st.best = score; store.save(); }
        status.textContent = `Forkert! Du nåede ${score} ${score === 1 ? 'runde' : 'runder'}${best ? ' – ny rekord!' : ''}`; seq = [];
        startBtn.hidden = false; return;
      }
      pos++;
      if (pos === seq.length) { status.textContent = 'Rigtigt!'; setTimeout(next, 700); }
    };
    btns = COLORS.map((c, i) => h('button', { class: `sm-btn q${i}`, style: { '--c': c }, 'aria-label': ['Grøn', 'Rød', 'Gul', 'Blå'][i], onclick: () => press(i) }));
    const startBtn = h('button', { class: 'btn btn-primary btn-lg', onclick: () => { startBtn.hidden = true; seq = []; next(); } }, icon('play'), 'Start');
    const keyMap = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 3, ArrowLeft: 2, 1: 0, 2: 1, 3: 2, 4: 3 };
    root.addEventListener('keydown', (e) => { if (keyMap[e.key] != null) { e.preventDefault(); press(keyMap[e.key]); } });
    h(root, null, h('div', { class: 'sm-wrap' }, h('div', { class: 'sm-board', tabindex: 0 }, btns, h('div', { class: 'sm-center' }, h('small', null, 'Rekord'), h('b', null, String(st.best)))), status, startBtn));
    return h('div', { class: 'page sm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Følg mønstret', lead: 'Farverne lyser op i en rækkefølge – gentag den. For hver runde kommer der én farve mere. Hvor mange kan du huske?', compact: true }), root);
  },
};
