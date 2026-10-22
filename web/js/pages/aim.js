/**
 * Aim-træner – click the targets fast. Red targets must NOT be clicked, gold ones give bonus.
 *  Klassisk (30 sek., topliste) · Reaktion (wait for green) · Præcision (small moving targets, on time).
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore } from '../features/gameroom.js';

const MODES = {
  classic: { label: 'Klassisk', icon: 'target', text: '30 sekunder. Klik på de blå mål – jo hurtigere, jo flere point. Gyldne mål giver bonus. Røde mål må du IKKE klikke på.' },
  reaction: { label: 'Reaktion', icon: 'timer', text: 'Vent, til feltet bliver grønt – klik så hurtigt du kan. Fem runder. Klikker du for tidligt, tæller det som en fejl.' },
  precision: { label: 'Præcision', icon: 'eye', text: '20 små mål, der flytter sig. Ram dem alle på kortest tid – hvert forkert klik giver 1 sekund ekstra.' },
};

export default {
  title: 'Aim-træner',
  destroy() { this._stop?.(); },
  async render() {
    const app = appById('aim');
    let store;
    try { store = await appState('aim', { best: {}, games: 0 }); } catch (e) { return loadError('Aim-træner', e); }
    const st = store.data, self = this;
    let mode = 'classic', timers = [], raf = 0, running = false;
    const arena = h('div', { class: 'aim-arena', role: 'application', 'aria-label': 'Skydebane' });
    const hud = h('div', { class: 'gm-top aim-hud' });
    const info = h('p', { class: 'muted', style: { marginTop: 0 } });
    const result = h('div');
    const stop = () => { running = false; timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = []; cancelAnimationFrame(raf); };
    this._stop = stop;
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const stat = (label, val) => h('span', null, `${label} `, h('b', null, val));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pop = (x, y, text, cls) => { const el = h('span', { class: ['aim-pop', cls], style: { left: `${x}px`, top: `${y}px` } }, text); arena.append(el); setTimeout(() => el.remove(), 700); };

    function intro() {
      stop(); clear(result); clear(arena);
      info.textContent = MODES[mode].text;
      const best = st.best[mode];
      h(clear(hud), null, stat('Rekord', best == null ? '–' : mode === 'classic' ? String(best) : `${best} ${mode === 'reaction' ? 'ms' : 's'}`), stat('Spil', String(st.games || 0)));
      arena.className = 'aim-arena';
      arena.append(h('div', { class: 'gm-overlay aim-start' }, h('b', null, MODES[mode].label), h('span', null, MODES[mode].text),
        h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('play'), 'Start')));
    }
    function start() {
      stop(); clear(arena); clear(result); running = true; st.games = (st.games || 0) + 1;
      ({ classic, reaction, precision })[mode]();
    }
    function finish(score, lines, better) {
      stop(); store.save();
      const rec = st.best[mode] == null || better(score, st.best[mode]);
      if (rec) st.best[mode] = score;
      store.save();
      if (mode === 'classic' && score > 0) submitScore('aim', score);
      if (rec) toast('Ny rekord!', { type: 'xp', text: lines[0] });
      clear(arena).append(h('div', { class: 'gm-overlay aim-start' }, h('b', null, rec ? 'Ny rekord! 🎯' : 'Færdig'), lines.map(l => h('span', null, l)),
        h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('refresh'), 'Igen')));
      h(clear(hud), null, stat('Rekord', mode === 'classic' ? String(st.best[mode]) : `${st.best[mode]} ${mode === 'reaction' ? 'ms' : 's'}`), stat('Spil', String(st.games)));
    }

    // ── Klassisk ──
    function classic() {
      const T = 30, t0 = performance.now();
      let score = 0, hits = 0, miss = 0, bad = 0, combo = 0, reacts = [];
      const scoreEl = h('b', null, '0'), timeEl = h('b', null, String(T)), comboEl = h('b', null, '×1');
      h(clear(hud), null, h('span', null, 'Point ', scoreEl), h('span', null, 'Tid ', timeEl), h('span', null, 'Kombo ', comboEl));
      const W = () => arena.clientWidth, H = () => arena.clientHeight;
      arena.onpointerdown = (e) => { if (e.target === arena && running) { miss++; combo = 0; comboEl.textContent = '×1'; const r = arena.getBoundingClientRect(); pop(e.clientX - r.left, e.clientY - r.top, 'Forbi', 'is-miss'); } };
      function spawn() {
        if (!running) return;
        const elapsed = (performance.now() - t0) / 1000;
        const roll = Math.random();
        const kind = elapsed > 3 && roll < 0.22 ? 'red' : roll > 0.94 ? 'gold' : 'blue';
        const size = Math.max(34, 70 - elapsed * 1.1) * (kind === 'gold' ? 0.75 : 1);
        const x = rnd(size / 2, W() - size / 2), y = rnd(size / 2, H() - size / 2), born = performance.now();
        const life = kind === 'red' ? 1700 : Math.max(650, 1500 - elapsed * 25);
        const t = h('button', { class: ['aim-target', `is-${kind}`], 'aria-label': kind === 'red' ? 'Rødt mål – klik ikke' : 'Mål', style: { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px`, '--life': `${life}ms` } }, kind === 'red' ? '✕' : null);
        t.addEventListener('pointerdown', (e) => {
          e.stopPropagation(); if (!running) return;
          t.remove();
          if (kind === 'red') { bad++; combo = 0; score = Math.max(0, score - 50); pop(x, y, '−50', 'is-bad'); arena.classList.add('is-hurt'); setTimeout(() => arena.classList.remove('is-hurt'), 220); }
          else {
            const ms = performance.now() - born; reacts.push(ms); hits++; combo = Math.min(combo + 1, 20);
            const pts = Math.round((kind === 'gold' ? 3 : 1) * (10 + Math.max(0, 1000 - ms) / 20) * (1 + Math.floor(combo / 5) * 0.5));
            score += pts; pop(x, y, `+${pts}`, kind === 'gold' ? 'is-gold' : '');
          }
          scoreEl.textContent = String(score); comboEl.textContent = `×${1 + Math.floor(combo / 5) * 0.5}`.replace('.', ',');
        });
        arena.append(t);
        later(() => { if (t.isConnected) { t.remove(); if (kind !== 'red') { combo = 0; comboEl.textContent = '×1'; } } }, life);
        later(spawn, Math.max(260, 620 - elapsed * 12));
        if (elapsed > 12 && Math.random() < 0.3) later(spawn, 120);       // later on, two at a time
      }
      spawn();
      const tick = () => {
        const left = Math.max(0, T - (performance.now() - t0) / 1000);
        timeEl.textContent = String(Math.ceil(left));
        if (left <= 0) {
          const acc = hits + miss ? Math.round(hits / (hits + miss) * 100) : 0;
          const avg = reacts.length ? Math.round(reacts.reduce((a, b) => a + b, 0) / reacts.length) : 0;
          arena.onpointerdown = null;
          finish(score, [`${score} point`, `${hits} ramt · ${miss} forbi · ${bad} røde ramt`, `Træfsikkerhed ${acc} % · gennemsnit ${avg} ms`], (a, b) => a > b);
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    // ── Reaktion ──
    function reaction() {
      const times = []; let early = 0, round = 0, readyAt = 0, state = 'wait';
      const pad = h('button', { class: 'aim-react is-wait' }, h('b', null, 'Vent …'), h('span', null, 'Klik, når feltet bliver grønt'));
      arena.append(pad);
      const roundEl = h('b', null, '1/5'), lastEl = h('b', null, '–');
      h(clear(hud), null, h('span', null, 'Runde ', roundEl), h('span', null, 'Sidste ', lastEl));
      const next = () => {
        state = 'wait'; pad.className = 'aim-react is-wait'; pad.replaceChildren(h('b', null, 'Vent …'), h('span', null, 'Klik, når feltet bliver grønt'));
        later(() => { if (!running) return; state = 'go'; readyAt = performance.now(); pad.className = 'aim-react is-go'; pad.replaceChildren(h('b', null, 'KLIK!')); }, rnd(1200, 3500));
      };
      pad.addEventListener('pointerdown', () => {
        if (!running) return;
        if (state === 'wait') { early++; stop(); running = true; pad.className = 'aim-react is-early'; pad.replaceChildren(h('b', null, 'For tidligt!'), h('span', null, 'Vent på grønt')); later(next, 1100); return; }
        if (state !== 'go') return;
        const ms = Math.round(performance.now() - readyAt); times.push(ms); lastEl.textContent = `${ms} ms`; round++;
        state = 'done'; pad.className = 'aim-react is-done'; pad.replaceChildren(h('b', null, `${ms} ms`), h('span', null, round < 5 ? 'Klar til næste …' : ''));
        if (round >= 5) { const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length); later(() => finish(avg, [`${avg} ms i gennemsnit`, `Bedste: ${Math.min(...times)} ms · for tidligt: ${early}`], (a, b) => a < b), 700); }
        else { roundEl.textContent = `${round + 1}/5`; later(next, 900); }
      });
      next();
    }

    // ── Præcision ──
    function precision() {
      const N = 20; let left = N, extra = 0; const t0 = performance.now();
      const leftEl = h('b', null, String(N)), timeEl = h('b', null, '0,0');
      h(clear(hud), null, h('span', null, 'Tilbage ', leftEl), h('span', null, 'Tid ', timeEl));
      arena.onpointerdown = (e) => { if (e.target === arena && running) { extra += 1; const r = arena.getBoundingClientRect(); pop(e.clientX - r.left, e.clientY - r.top, '+1 s', 'is-miss'); } };
      const place = () => {
        const size = 22, x = rnd(20, arena.clientWidth - 20), y = rnd(20, arena.clientHeight - 20);
        const t = h('button', { class: 'aim-target is-blue is-small', 'aria-label': 'Mål', style: { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` } });
        let dx = rnd(-1, 1), dy = rnd(-1, 1), px = x, py = y;
        const move = () => { if (!t.isConnected) return; px += dx; py += dy; if (px < 15 || px > arena.clientWidth - 15) dx = -dx; if (py < 15 || py > arena.clientHeight - 15) dy = -dy; t.style.left = `${px}px`; t.style.top = `${py}px`; t._r = requestAnimationFrame(move); };
        t.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!running) return; cancelAnimationFrame(t._r); t.remove(); left--; leftEl.textContent = String(left); pop(px, py, '✓', ''); if (left === 0) done(); else place(); });
        arena.append(t); move();
      };
      const tick = () => { if (!running) return; timeEl.textContent = (((performance.now() - t0) / 1000) + extra).toFixed(1).replace('.', ','); raf = requestAnimationFrame(tick); };
      const done = () => { arena.onpointerdown = null; const secs = Math.round(((performance.now() - t0) / 1000 + extra) * 10) / 10; finish(secs, [`${String(secs).replace('.', ',')} sekunder`, `${extra} forkerte klik (+${extra} s)`], (a, b) => a < b); };
      place(); raf = requestAnimationFrame(tick);
    }

    const seg = segmented(Object.entries(MODES).map(([value, m]) => ({ value, label: m.label, icon: m.icon })), mode, (v) => { mode = v; intro(); }, { label: 'Spiltype' });
    intro();
    return h('div', { class: 'page gm-page aim-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Aim-træner', lead: 'Træn dit sigte og din reaktionstid. Ram de blå, snup de gyldne – og hold fingrene fra de røde.', compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, seg),
      panel(null, null, info, hud, arena, result,
        h('p', { class: 'faint', style: { marginBottom: 0, textAlign: 'center' } }, 'Klassisk kommer på toplisten under Fart-tast → Topliste.')));
  },
};
