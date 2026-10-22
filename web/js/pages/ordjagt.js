/**
 * Ordjagt – find the five-letter word in six guesses. Green: right place, yellow: in the word, grey: not there.
 * Dagens ord is the same for everyone and has its own list; you can also practise with random words.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { api } from '../core/api.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';
import { todayISO } from '../features/gamelogic.js';
import * as W from '../features/wordgame.js';
import { WORDS } from '../data/words5.js';

const ROWS = [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Å'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Æ', 'Ø'], ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK']];
const PRAISE = ['Genialt!', 'Fantastisk!', 'Flot!', 'Godt gået!', 'Fint!', 'Puha – lige i sidste ende!'];
const ordFmt = (v) => { const s = v % 1000; return `${Math.floor(v / 1000)} gæt · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default {
  title: 'Ordjagt',
  destroy() { removeEventListener('keydown', this._k); clearInterval(this._iv); },
  async render(ctx) {
    const app = appById('ordjagt');
    let store;
    try { store = await appState('ordjagt', { daily: null, practice: null, history: {}, hard: false }); } catch (e) { return loadError('Ordjagt', e); }
    const st = store.data, self = this;
    st.history = st.history || {};
    const today = todayISO();
    let mode = ctx?.params?.sub === 'practice' ? 'practice' : 'daily';
    let typing = '', shake = false;
    if (!st.daily || st.daily.date !== today) st.daily = { date: today, guesses: [], done: false, secs: 0 };
    const game = () => {
      if (mode === 'daily') return { ...st.daily, answer: W.dailyWord(WORDS, today) };
      if (!st.practice || st.practice.done && st.practice.restart) st.practice = { answer: W.randomWord(WORDS), guesses: [], done: false, secs: 0 };
      return st.practice;
    };
    const grid = h('div', { class: 'oj-grid', role: 'grid', 'aria-label': 'Gæt' });
    const keys = h('div', { class: 'oj-keys', 'aria-label': 'Tastatur' });
    const msg = h('div', { class: 'oj-msg', 'aria-live': 'assertive' });
    const side = h('div', { class: 'oj-side' });

    function say(text, ms = 1800) { msg.textContent = text; msg.classList.add('is-on'); clearTimeout(say.t); say.t = setTimeout(() => msg.classList.remove('is-on'), ms); }
    function draw() {
      const g = game(), rows = [];
      for (let r = 0; r < W.TRIES; r++) {
        const word = g.guesses[r];
        const res = word ? W.score(word, g.answer) : null;
        const cur = !word && r === g.guesses.length && !g.done;
        rows.push(h('div', { class: ['oj-row', cur && shake && 'is-shake'], role: 'row' }, [0, 1, 2, 3, 4].map(i => {
          const ch = word ? word[i] : cur ? typing[i] || '' : '';
          const s = res?.[i];
          return h('div', { class: ['oj-tile', s && `is-${s}`, ch && !s && 'is-typed'], role: 'gridcell', style: s ? { animationDelay: `${i * 90}ms` } : null,
            'aria-label': ch ? `${ch}${s ? ` – ${{ ok: 'rigtig plads', near: 'forkert plads', no: 'ikke i ordet' }[s]}` : ''}` : 'tom' }, ch);
        })));
      }
      h(clear(grid), null, rows);
      shake = false;
      const ks = W.keyStates(g.guesses, g.answer);
      h(clear(keys), null, ROWS.map(row => h('div', { class: 'oj-krow' }, row.map(k => h('button', {
        class: ['oj-key', ks[k] && `is-${ks[k]}`, k.length > 1 && 'is-wide'], dataset: { k }, 'aria-label': k === 'BACK' ? 'Slet' : k === 'ENTER' ? 'Gæt' : k,
        onclick: () => press(k) }, k === 'BACK' ? icon('arrowLeft') : k === 'ENTER' ? 'Gæt' : k)))));
      drawSide();
    }
    function drawSide() {
      const g = game(), stats = W.stats(st.history, today);
      const max = Math.max(1, ...stats.dist);
      const result = g.done ? h('div', { class: ['oj-result', g.won ? 'is-won' : 'is-lost'] },
        h('b', null, g.won ? PRAISE[g.guesses.length - 1] : 'Øv – ikke denne gang'),
        h('span', null, g.won ? `Du fandt ordet i ${g.guesses.length} ${g.guesses.length === 1 ? 'gæt' : 'gæt'}.` : 'Ordet var ', !g.won ? h('b', null, g.answer) : null),
        mode === 'daily' ? h('div', { class: 'row-actions', style: { margin: 0 } },
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => copy(W.shareText(g.guesses, g.answer, `${Number(today.slice(8))}/${Number(today.slice(5, 7))}`), 'Resultatet er kopieret – uden at afsløre ordet') }, icon('share'), 'Del resultatet'),
          h('button', { class: 'btn btn-sm', onclick: () => switchMode('practice') }, 'Øv dig videre'))
          : h('button', { class: 'btn btn-sm btn-primary', onclick: () => { st.practice = null; typing = ''; store.save(); draw(); } }, icon('refresh'), 'Nyt ord')) : null;
      const daily = h('div');
      if (mode === 'daily') api.get(`/api/games/boards/daily-ord-${today}`).then(b => h(clear(daily), null, boardTable(b, { fmt: ordFmt }))).catch(() => {});
      h(clear(side), null, result,
        mode === 'daily' ? panel('Dagens liste', 'trophy', h('p', { class: 'faint', style: { marginTop: 0 } }, 'Alle får det samme ord i dag. Færrest gæt vinder – ved lige mange tæller tiden.'), daily) : null,
        panel('Din statistik', 'chart',
          h('div', { class: 'oj-stats' }, [[stats.played, 'spillet'], [`${stats.pct} %`, 'vundet'], [stats.streak, 'i træk'], [stats.best, 'bedste stime']].map(([v, l]) => h('div', null, h('b', null, String(v)), h('span', { class: 'faint' }, l)))),
          h('div', { class: 'oj-dist' }, stats.dist.map((n, i) => h('div', { class: 'oj-bar' }, h('span', null, String(i + 1)), h('i', { style: { width: `${Math.max(6, (n / max) * 100)}%` }, class: g.done && g.won && mode === 'daily' && g.guesses.length === i + 1 ? 'is-now' : '' }, String(n)))))),
        panel('Indstillinger', 'settings', h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: !!st.hard, disabled: g.guesses.length > 0 && !g.done, onchange: (e) => { st.hard = e.target.checked; store.save(); } }),
          h('span', null, 'Svær tilstand: grønne og gule bogstaver skal bruges i de næste gæt'))),
        panel('Sådan spiller man', 'help', h('ul', { class: 'pg-rules' },
          h('li', null, 'Gæt et ord på fem bogstaver. Du har seks forsøg.'),
          h('li', null, h('span', { class: 'oj-mini is-ok' }, 'S'), ' grøn: rigtigt bogstav på rigtig plads.'),
          h('li', null, h('span', { class: 'oj-mini is-near' }, 'K'), ' gul: bogstavet er i ordet, men et andet sted.'),
          h('li', null, h('span', { class: 'oj-mini is-no' }, 'O'), ' grå: bogstavet er ikke i ordet.'))));
    }
    function save(g) { if (mode === 'daily') { st.daily = { date: today, guesses: g.guesses, done: g.done, won: g.won, secs: g.secs }; } else st.practice = g; store.save(); }
    function press(k) {
      const g = game();
      if (g.done) return;
      if (k === 'BACK') { typing = typing.slice(0, -1); draw(); return; }
      if (k === 'ENTER') {
        if (typing.length < 5) { say('Ordet skal have fem bogstaver'); shake = true; draw(); return; }
        if (st.hard) { const e = W.hardModeError(typing, g.guesses, g.answer); if (e) { say(e); shake = true; draw(); return; } }
        g.guesses = [...g.guesses, typing]; typing = '';
        const won = W.norm(g.guesses.at(-1)) === g.answer;
        if (won || g.guesses.length >= W.TRIES) {
          g.done = true; g.won = won;
          if (mode === 'daily') {
            st.history[today] = { won, tries: g.guesses.length };
            if (won) submitScore(`daily-ord-${today}`, g.guesses.length * 1000 + Math.min(999, g.secs || 0)).then(() => drawSide());
          }
          setTimeout(() => say(won ? PRAISE[g.guesses.length - 1] : g.answer, 2600), 500);
        }
        save(g); draw(); return;
      }
      if (typing.length < 5 && W.LETTERS.includes(k)) { typing += k; draw(); }
    }
    this._k = (e) => {
      if (!document.body.contains(grid) || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const k = e.key === 'Enter' ? 'ENTER' : e.key === 'Backspace' ? 'BACK' : e.key.length === 1 ? e.key.toUpperCase() : null;
      if (!k || (k.length === 1 && !W.LETTERS.includes(k))) return;
      e.preventDefault(); press(k);
    };
    addEventListener('keydown', this._k);
    this._iv = setInterval(() => {       // the clock only counts while you play
      const g = game();
      if (!document.body.contains(grid) || document.hidden || g.done || !(g.guesses.length || typing)) return;
      g.secs = (g.secs || 0) + 1;
      if (mode === 'daily') st.daily.secs = g.secs;
      if (g.secs % 15 === 0) store.save();
    }, 1000);
    function switchMode(v) {
      mode = v; typing = '';
      seg.setValue(v);
      history.replaceState(null, '', `#/apps/ordjagt${v === 'daily' ? '' : '/practice'}`);
      draw();
    }
    const seg = segmented([{ value: 'daily', label: 'Dagens ord', icon: 'calendar' }, { value: 'practice', label: 'Øv dig', icon: 'refresh' }], mode, switchMode, { label: 'Vælg' });
    draw();
    return h('div', { class: 'page gm-page oj-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Ordjagt', lead: 'Find dagens ord på fem bogstaver i seks gæt. Samme ord for alle – hvem klarer det med færrest gæt?', compact: true }),
      h('div', { class: 'cmd-filters', style: { marginBottom: '16px' } }, seg),
      h('div', { class: 'oj-wrap' }, h('div', { class: 'oj-play' }, msg, grid, keys), side));
  },
};
