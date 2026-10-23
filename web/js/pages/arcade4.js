/** Spilhal 4: Labyrint, Lysslukker, Ordrul, Stigespil, Reaktion, Gæt dyret, Kalejdoskop og Hoppeløb (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import { submitScore, boardTable } from '../features/gameroom.js';
import { WORDS } from '../data/words5.js';
import * as A from '../features/arcade4.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const lbPanel = (game, unit) => { const el = h('div'); const load = () => api.get(`/api/games/boards/${game}`).then(r => h(clear(el), null, boardTable(r.board || r, { unit }))).catch(() => {}); load(); return { el: panel('Topliste', 'award', el), reload: load }; };
const fmtTime = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// ── Labyrint ──
export const labyrinth = {
  title: 'Labyrint',
  destroy() { document.removeEventListener('keydown', this._k); clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('labyrinth', { size: 'medium', best: {}, solved: 0 }); } catch (e) { return loadError('Labyrint', e); }
    const st = store.data, self = this, root = h('div');
    const SIZES = { small: [10, 8], medium: [16, 12], large: [24, 18] };
    let g, W, H, pos, trail, start, done, showPath, seed;
    const newMaze = (s) => { seed = s ?? Math.floor(Math.random() * 1e6); [W, H] = SIZES[st.size]; g = A.maze(W, H, A.seeded(seed)); pos = [0, 0]; trail = new Set(['0,0']); start = null; done = false; showPath = false; draw(); };
    const move = (bit) => {
      if (done || !A.canMove(g, pos[0], pos[1], bit)) return;
      if (!start) start = Date.now();
      pos = A.step(pos[0], pos[1], bit); trail.add(pos.join(','));
      if (pos[0] === W - 1 && pos[1] === H - 1) { done = Date.now() - start; st.solved++; const best = !st.best[st.size] || done < st.best[st.size]; if (best) st.best[st.size] = done; store.save(); toast(`I mål på ${fmtTime(done)}${best ? ' – ny rekord!' : ''}`, { type: 'xp' }); }
      paint();
    };
    let canvas, ctx, info;
    function paint() {
      const cs = Math.floor(Math.min(640, (root.clientWidth || 640) - 8) / W), pad = 3;
      canvas.width = W * cs + pad * 2; canvas.height = H * cs + pad * 2;
      const css = getComputedStyle(root), app = css.getPropertyValue('--app').trim() || '#22d3ee', line = css.getPropertyValue('--text').trim() || '#e2e8f0';
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.translate(pad, pad);
      ctx.fillStyle = 'rgba(34,197,94,.35)'; ctx.fillRect((W - 1) * cs + 2, (H - 1) * cs + 2, cs - 4, cs - 4);
      ctx.fillStyle = app; ctx.globalAlpha = 0.3; for (const k of trail) { const [x, y] = k.split(',').map(Number); ctx.fillRect(x * cs + cs * 0.3, y * cs + cs * 0.3, cs * 0.4, cs * 0.4); } ctx.globalAlpha = 1;
      if (showPath) { const p = A.solveMaze(g, pos); ctx.strokeStyle = '#facc15'; ctx.lineWidth = Math.max(2, cs / 6); ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x * cs + cs / 2, y * cs + cs / 2) : ctx.moveTo(x * cs + cs / 2, y * cs + cs / 2))); ctx.stroke(); }
      ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = g[y][x], X = x * cs, Y = y * cs;
        if (c & A.N) { ctx.moveTo(X, Y); ctx.lineTo(X + cs, Y); } if (c & A.W) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + cs); }
        if (y === H - 1 && c & A.S) { ctx.moveTo(X, Y + cs); ctx.lineTo(X + cs, Y + cs); } if (x === W - 1 && c & A.E) { ctx.moveTo(X + cs, Y); ctx.lineTo(X + cs, Y + cs); } }
      ctx.stroke();
      ctx.fillStyle = app; ctx.beginPath(); ctx.arc(pos[0] * cs + cs / 2, pos[1] * cs + cs / 2, cs * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      tick();
    }
    const tick = () => { if (info) info.textContent = done ? `I mål på ${fmtTime(done)} 🎉` : start ? fmtTime(Date.now() - start) : 'Klar – brug piletasterne eller swipe'; };
    function draw() {
      canvas = h('canvas', { class: 'lb2-canvas', 'aria-label': 'Labyrint' }); ctx = canvas.getContext('2d'); info = h('b', { class: 'lb2-info' });
      let touch = null;
      canvas.addEventListener('pointerdown', (e) => { touch = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', (e) => { if (!touch) return; const dx = e.clientX - touch[0], dy = e.clientY - touch[1]; if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) { move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? A.E : A.W) : (dy > 0 ? A.S : A.N)); touch = [e.clientX, e.clientY]; } });
      canvas.addEventListener('pointerup', () => { touch = null; });
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'small', label: 'Lille' }, { value: 'medium', label: 'Mellem' }, { value: 'large', label: 'Stor' }], st.size, (v) => { st.size = v; store.save(); newMaze(); }, { label: 'Størrelse' }),
          h('button', { class: 'btn btn-sm', onclick: () => newMaze() }, icon('refresh'), 'Ny labyrint'), h('button', { class: 'btn btn-sm', onclick: () => { showPath = !showPath; paint(); } }, icon('eye'), 'Vis vejen'),
          h('span', { class: 'faint', style: { fontSize: '13px' } }, `Nr. ${seed}${st.best[st.size] ? ` · rekord ${fmtTime(st.best[st.size])}` : ''}`)),
        h('div', { class: 'lb2-wrap' }, info, canvas,
          h('div', { class: 'lb2-pad' }, [['', null], ['▲', A.N], ['', null], ['◀', A.W], ['▼', A.S], ['▶', A.E]].map(([l, b]) => (b ? h('button', { class: 'bf-key', 'aria-label': { 1: 'Op', 2: 'Højre', 4: 'Ned', 8: 'Venstre' }[b], onclick: () => move(b) }, l) : h('span'))))));
      requestAnimationFrame(paint);
    }
    document.removeEventListener('keydown', this._k);
    this._k = (e) => { if (!document.body.contains(root)) return; const b = { ArrowUp: A.N, ArrowRight: A.E, ArrowDown: A.S, ArrowLeft: A.W, w: A.N, d: A.E, s: A.S, a: A.W }[e.key]; if (b && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); move(b); } };
    document.addEventListener('keydown', this._k);
    clearInterval(this._iv); this._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); if (start && !done) tick(); }, 500);
    newMaze();
    return page('labyrinth', 'Spilhal', 'Labyrint', 'Find vej fra hjørnet oppe til venstre til det grønne felt – hver labyrint er ny. Piletaster, WASD eller swipe.', root);
  },
};

// ── Lysslukker ──
export const lightsout = {
  title: 'Lysslukker',
  async render() {
    let store;
    try { store = await appState('lightsout', { n: 5, level: 1, best: 0 }); } catch (e) { return loadError('Lysslukker', e); }
    const st = store.data, root = h('div');
    let pz, board, moves;
    const fresh = () => { pz = A.lights(st.n, Math.min(st.n * st.n - 2, 2 + st.level)); board = pz.board; moves = 0; draw(); };
    function draw() {
      const won = A.allOff(board);
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: '3', label: '3×3' }, { value: '4', label: '4×4' }, { value: '5', label: '5×5' }], String(st.n), (v) => { st.n = Number(v); st.level = 1; store.save(); fresh(); }, { label: 'Størrelse' }),
          h('button', { class: 'btn btn-sm', onclick: fresh }, icon('refresh'), 'Ny gåde'), h('span', { class: 'faint', style: { fontSize: '13px' } }, `Bane ${st.level} · bedste bane ${st.best}`)),
        h('div', { class: 'l3-card' },
          h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(moves)), ' tryk'), h('span', null, 'kan klares på ', h('b', null, String(pz.par)))),
          h('div', { class: ['lo-grid', won && 'is-won'], style: { '--n': st.n } }, board.map((on, i) => h('button', { class: ['lo-cell', on && 'on'], 'aria-label': `Lys ${i + 1}: ${on ? 'tændt' : 'slukket'}`, 'aria-pressed': String(on), disabled: won, onclick: () => { board = A.press(board, st.n, i); moves++; if (A.allOff(board)) { st.level++; st.best = Math.max(st.best, st.level - 1); store.save(); toast(moves <= pz.par ? 'Perfekt – på færrest mulige tryk! 🌟' : 'Alle lys er slukket! 💡', { type: 'xp' }); } draw(); } }))),
          won ? h('button', { class: 'btn btn-primary btn-lg', onclick: fresh }, `Bane ${st.level}`, icon('play')) : h('p', { class: 'faint', style: { fontSize: '13px', textAlign: 'center', margin: 0 } }, 'Et tryk skifter lyset og dets naboer over, under og ved siden af. Sluk dem alle.')));
    }
    fresh();
    return page('lightsout', 'Spilhal', 'Lysslukker', 'Sluk alle lysene – men hvert tryk skifter også naboerne. Banerne bliver sværere, jo længere du kommer.', root);
  },
};

// ── Ordrul ──
export const anagram = {
  title: 'Ordrul',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('anagram', { best: 0, played: 0 }); } catch (e) { return loadError('Ordrul', e); }
    const st = store.data, self = this, root = h('div'), lb = lbPanel('anagram', 'ord');
    let word, mix, picked, points, ends, running = false, skipped = 0, solved = [];
    const next = () => { word = WORDS[Math.floor(Math.random() * WORDS.length)]; mix = [...A.scramble(word)]; picked = []; draw(); };
    const start = () => { points = 0; skipped = 0; solved = []; ends = Date.now() + 60000; running = true; next(); clearInterval(self._iv); self._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); if (Date.now() >= ends) finish(); else root.querySelector('.ar-time b') && (root.querySelector('.ar-time b').textContent = String(Math.ceil((ends - Date.now()) / 1000))); }, 250); };
    const finish = () => { clearInterval(self._iv); running = false; st.played++; const best = points > st.best; if (best) st.best = points; store.save(); if (points) submitScore('anagram', points); lb.reload(); draw(); };
    const guess = () => {
      const g = picked.map(i => mix[i]).join('');
      if (A.isAnagram(g, word, WORDS)) { points++; solved.push(word); toast(`${word.toUpperCase()} ✓`, { type: 'ok', ms: 900 }); next(); }
      else { root.querySelector('.ar-slots')?.classList.add('shake'); setTimeout(() => { picked = []; draw(); }, 350); }
    };
    function draw() {
      if (!running) {
        h(clear(root), null, h('div', { class: 'l3-card' },
          solved.length || st.played ? h('div', { class: 'ar-result' }, h('b', null, `${points ?? 0} ord`), h('span', { class: 'faint' }, `Din rekord er ${st.best}`), solved.length ? h('span', { class: 'faint' }, solved.join(' · ')) : null) : h('span', { class: 'qz-big' }, '🔤'),
          h('p', { class: 'l3-ask' }, 'Byt rundt på bogstaverne og find ordet på fem bogstaver.', h('b', null, 'Hvor mange når du på 60 sekunder?')),
          h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('play'), solved.length || st.played ? 'Spil igen' : 'Start')), lb.el);
        return;
      }
      h(clear(root), null, h('div', { class: 'l3-card' },
        h('div', { class: 'l3-score' }, h('span', { class: 'ar-time' }, h('b', null, String(Math.ceil((ends - Date.now()) / 1000))), ' sek.'), h('span', null, h('b', null, String(points)), ' ord')),
        h('div', { class: 'ar-slots' }, Array.from({ length: 5 }, (_, k) => h('span', { class: ['ar-slot', picked[k] != null && 'on'] }, picked[k] != null ? mix[picked[k]].toUpperCase() : ''))),
        h('div', { class: 'ar-tiles' }, mix.map((ch, i) => h('button', { class: 'ar-tile', disabled: picked.includes(i), 'aria-label': `Bogstav ${ch}`, onclick: () => { picked.push(i); if (picked.length === 5) { draw(); guess(); } else draw(); } }, ch.toUpperCase()))),
        h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } },
          h('button', { class: 'btn', disabled: !picked.length, onclick: () => { picked.pop(); draw(); } }, icon('undo'), 'Fortryd'),
          h('button', { class: 'btn', onclick: () => { mix = [...A.scramble(mix.join(''))]; picked = []; draw(); } }, icon('refresh'), 'Bland'),
          h('button', { class: 'btn btn-ghost', onclick: () => { skipped++; toast(`Det var ${word.toUpperCase()}`, { type: 'info', ms: 1200 }); next(); } }, 'Spring over'))));
    }
    document.removeEventListener('keydown', this._k);
    this._k = (e) => { if (!running || !document.body.contains(root)) return; const k = e.key.toLowerCase(); if (k === 'backspace') { picked.pop(); draw(); return; } const i = mix.findIndex((ch, j) => ch === k && !picked.includes(j)); if (i >= 0) { picked.push(i); draw(); if (picked.length === 5) guess(); } };
    document.addEventListener('keydown', this._k);
    draw();
    return page('anagram', 'Spilhal', 'Ordrul', 'Bogstaverne er blandet sammen – find ordet. Klik på bogstaverne eller skriv på tastaturet. Et minut, så mange ord som muligt.', root);
  },
};
anagram.destroy = function () { clearInterval(this._iv); document.removeEventListener('keydown', this._k); };

// ── Stigespil ──
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const SEAT = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
export const ladders = {
  title: 'Stigespil',
  destroy() { this._g?.destroy(); },
  async render() {
    const app = appById('ladders');
    let store;
    try { store = await appState('ladders', { game: null, setup: null, wins: 0, played: 0 }); } catch (e) { return loadError('Stigespil', e); }
    const st = store.data;
    let anim = 0;
    const g = this._g = hostedGame({
      page: 'ladders', game: 'ladders', title: 'Stigespil', store, minPlayers: 2, maxPlayers: 6, seatColor: (i) => SEAT[i],
      onlineText: 'Invitér op til 5 af dem, der har HUBTECH. Alle slår selv med terningen.',
      newGame: (seats) => A.newLadders(seats), apply: (s, seat, name, args) => A.applyLadders(s, seat, name, args), aiMove: A.aiLadders, aiDelay: () => 900,
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (!s.players[s.winner].ai) st.wins++; } },
      rules: () => panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Slå med terningen og ryk frem. Den første på felt 100 vinder.'),
        h('li', null, 'Lander du for foden af en stige, klatrer du op. Lander du på toppen af en rutsjebane, glider du ned.'),
        h('li', null, 'Slår du en 6\'er, må du slå igen. Slår du for meget til 100, går du tilbage igen.'))),
      render(ctl) {
        const s = ctl.s, my = ctl.canAct(s.turn) && s.phase !== 'over';
        const fresh = s.last && s.last.at !== anim && Date.now() - s.last.at < 1200; if (fresh) { anim = s.last.at; setTimeout(() => g.redraw(), 700); }
        const cells = []; for (let n = 1; n <= 100; n++) { const [r, c] = A.cellOf(n), j = A.JUMPS[n]; cells.push(h('div', { class: ['sl2-cell', (r + c) % 2 && 'alt', j && (j > n ? 'up' : 'down'), n === 100 && 'goal'], style: { gridRow: 10 - r, gridColumn: c + 1 } }, h('small', null, String(n)), j ? h('em', null, j > n ? `↑${j}` : `↓${j}`) : null)); }
        const tokens = s.players.map((p, i) => { const n = s.pos[i]; if (!n) return null; const [r, c] = A.cellOf(n), same = s.pos.slice(0, i).filter(x => x === n).length; return h('span', { class: 'sl2-tok', style: { gridRow: 10 - r, gridColumn: c + 1, '--c': SEAT[i], '--k': same }, title: p.name }); });
        const lines = (() => { const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 10 10'); svg.setAttribute('class', 'sl2-svg'); svg.setAttribute('preserveAspectRatio', 'none');
          for (const [a, b] of Object.entries(A.JUMPS)) { const [r1, c1] = A.cellOf(Number(a)), [r2, c2] = A.cellOf(b), l = document.createElementNS(ns, 'line'); l.setAttribute('x1', c1 + 0.5); l.setAttribute('y1', 9.5 - r1); l.setAttribute('x2', c2 + 0.5); l.setAttribute('y2', 9.5 - r2); l.setAttribute('class', b > a ? 'up' : 'down'); svg.append(l); }
          return svg; })();
        const d = s.last?.die;
        return h('div', { class: 'sl2-wrap' },
          h('div', { class: 'sl2-board' }, cells, lines, tokens),
          h('div', { class: 'sl2-side' },
            h('div', { class: 'my-players', style: { justifyContent: 'flex-start' } }, s.players.map((p, i) => h('div', { class: ['dm-player', s.turn === i && s.phase !== 'over' && 'is-turn'] }, h('span', { class: 'yz-seat', style: { background: SEAT[i] } }, String(i + 1)), h('b', null, p.name), h('span', { class: 'faint' }, s.pos[i] ? `felt ${s.pos[i]}` : 'start')))),
            h('div', { class: 'row', style: { gap: '12px', alignItems: 'center' } }, h('span', { class: ['ld-die', fresh && 'is-rolling'] }, Array.from({ length: 9 }, (_, i) => h('i', { class: d && PIPS[d].includes(i) ? 'on' : '' }))),
              my ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => ctl.act('roll') }, icon('cube'), 'Slå') : null),
            h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', my && 'is-mine'] }, s.phase === 'over' ? `${s.players[s.winner].name} vandt! 🎉` : my ? 'Din tur – slå med terningen' : `${s.players[s.turn].name} slår …`),
            h('div', { class: 'row-actions' }, g.controls()),
            s.log.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 6).map(l => h('li', null, l))) : null));
      },
    });
    return h('div', { class: 'page dm-page sl2-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Stigespil', lead: 'Det klassiske terningespil med stiger op og rutsjebaner ned. For 2–6 på samme skærm, mod computeren eller online.', compact: true }), g.el);
  },
};

// ── Reaktion ──
export const reaction = {
  title: 'Reaktion',
  destroy() { clearTimeout(this._t); },
  async render() {
    let store;
    try { store = await appState('reaction', { best: null, history: [] }); } catch (e) { return loadError('Reaktion', e); }
    const st = store.data, self = this, root = h('div'), lb = lbPanel('reaction', 'ms');
    let state = 'idle', shown = 0, round = [], msg = '';
    const ROUNDS = 5;
    const arm = () => { state = 'wait'; draw(); clearTimeout(self._t); self._t = setTimeout(() => { state = 'go'; shown = performance.now(); draw(); }, 1200 + Math.random() * 2600); };
    const hit = () => {
      if (state === 'idle' || state === 'done') { round = []; arm(); return; }
      if (state === 'wait') { clearTimeout(self._t); state = 'early'; msg = 'For tidligt! Vent til det bliver grønt.'; draw(); return; }
      if (state === 'early') { arm(); return; }
      if (state === 'go') {
        const ms = Math.round(performance.now() - shown); round.push(ms); msg = `${ms} ms – ${A.reactionRating(ms)}`;
        if (round.length >= ROUNDS) { state = 'done'; const m = A.median(round); st.history = [m, ...st.history].slice(0, 20); const best = !st.best || m < st.best; if (best) st.best = m; store.save(); submitScore('reaction', m); lb.reload(); msg = `Din tid: ${m} ms (midterste af ${ROUNDS}) – ${A.reactionRating(m)}${best ? ' · ny rekord!' : ''}`; draw(); }
        else { state = 'between'; draw(); clearTimeout(self._t); self._t = setTimeout(arm, 900); }
      }
    };
    function draw() {
      const TXT = { idle: ['Tryk for at starte', `Tryk, så snart feltet bliver grønt. ${ROUNDS} forsøg.`], wait: ['Vent …', 'Vent på grønt'], go: ['TRYK NU!', ''], early: ['For tidligt!', 'Tryk for at prøve igen'], between: [msg, `Forsøg ${round.length + 1} af ${ROUNDS} kommer …`], done: [msg, 'Tryk for at prøve igen'] }[state];
      h(clear(root), null,
        h('button', { class: `rx-pad is-${state}`, onpointerdown: (e) => { e.preventDefault(); hit(); } }, h('b', null, TXT[0]), TXT[1] ? h('span', null, TXT[1]) : null,
          round.length ? h('span', { class: 'rx-dots' }, round.map(ms => h('i', null, `${ms}`))) : null),
        h('div', { class: 'grid-2 dc-grid' },
          panel('Dine tider', 'chart', st.history.length ? h('div', { class: 'stack' }, h('p', { class: 'faint', style: { margin: 0 } }, `Rekord ${st.best} ms · gennemsnit ${Math.round(st.history.reduce((a, b) => a + b, 0) / st.history.length)} ms`), h('div', { class: 'rx-hist' }, st.history.slice(0, 12).reverse().map(ms => h('i', { style: { height: `${Math.max(8, Math.min(100, 100 - (ms - 150) / 4))}%` }, title: `${ms} ms` })))) : h('p', { class: 'faint' }, 'Ingen tider endnu.')),
          lb.el));
    }
    document.removeEventListener('keydown', this._k);
    this._k = (e) => { if (e.key === ' ' && document.body.contains(root) && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { e.preventDefault(); hit(); } };
    document.addEventListener('keydown', this._k);
    draw();
    return page('reaction', 'Spilhal', 'Reaktion', 'Hvor hurtigt reagerer du? Tryk så snart feltet skifter til grønt – det midterste af fem forsøg tæller på toplisten.', root);
  },
};
reaction.destroy = function () { clearTimeout(this._t); document.removeEventListener('keydown', this._k); };

// ── Gæt dyret ──
export const animals = {
  title: 'Gæt dyret',
  async render() {
    let store;
    try { store = await appState('animals', { tree: null, games: 0, won: 0 }); } catch (e) { return loadError('Gæt dyret', e); }
    const st = store.data, root = h('div');
    if (!st.tree) st.tree = A.START_TREE;
    let path = null, phase = 'start';
    function draw() {
      const node = path ? A.walk(st.tree, path) : null;
      let body;
      if (phase === 'start') body = [h('span', { class: 'qz-big' }, '🦊'), h('p', { class: 'l3-ask' }, 'Tænk på et dyr – så prøver jeg at gætte det.', h('b', null, 'Klar?')), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { path = []; phase = 'ask'; draw(); } }, 'Jeg har et dyr'),
        h('span', { class: 'faint', style: { fontSize: '13px' } }, `Jeg kender ${A.countAnimals(st.tree)} dyr og har gættet rigtigt ${st.won} af ${st.games} gange.`)];
      else if (phase === 'ask' && node.q) body = [h('p', { class: 'l3-ask' }, `Spørgsmål ${path.length + 1}`, h('b', null, node.q)), h('div', { class: 'l3-opts', style: { gridTemplateColumns: '1fr 1fr', width: 'min(360px, 100%)' } }, h('button', { class: 'l3-opt', onclick: () => { path.push(true); draw(); } }, 'Ja'), h('button', { class: 'l3-opt', onclick: () => { path.push(false); draw(); } }, 'Nej'))];
      else if (phase === 'ask') body = [h('p', { class: 'l3-ask' }, 'Jeg tror, det er …', h('b', null, `${node.a}!`)), h('div', { class: 'l3-opts', style: { gridTemplateColumns: '1fr 1fr', width: 'min(360px, 100%)' } },
        h('button', { class: 'l3-opt', onclick: () => { st.games++; st.won++; store.save(); phase = 'won'; draw(); } }, 'Ja, rigtigt!'), h('button', { class: 'l3-opt', onclick: () => { st.games++; store.save(); phase = 'teach'; draw(); } }, 'Nej'))];
      else if (phase === 'won') body = [h('span', { class: 'qz-big' }, '🎉'), h('p', { class: 'l3-ask' }, 'Jeg gættede det!', h('b', null, `Det var ${node.a}.`)), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { path = []; phase = 'ask'; draw(); } }, 'Igen')];
      else {
        const animal = h('input', { class: 'input', maxlength: 40, placeholder: 'fx en kanin', 'aria-label': 'Hvilket dyr var det' });
        const q = h('input', { class: 'input', maxlength: 80, placeholder: 'fx Har det lange ører?', 'aria-label': 'Et spørgsmål der skiller dem ad' });
        const yes = { v: true };
        body = [h('p', { class: 'l3-ask' }, 'Du vandt! Lær mig det dyr, så kan jeg det næste gang.', h('b', null, 'Hvilket dyr var det?')),
          h('div', { class: 'stack an-teach' }, animal, h('label', { class: 'faint', style: { fontSize: '13px' } }, `Skriv et ja/nej-spørgsmål, der skiller dit dyr fra ${node.a}:`), q,
            h('div', { class: 'row', style: { gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, h('span', { class: 'faint', style: { fontSize: '13px' } }, 'For dit dyr er svaret'), segmented([{ value: 'y', label: 'Ja' }, { value: 'n', label: 'Nej' }], 'y', (v) => { yes.v = v === 'y'; }, { label: 'Svar for dit dyr' })),
            h('button', { class: 'btn btn-primary', onclick: () => {
              if (!animal.value.trim() || q.value.trim().length < 4) return toast('Skriv både dyret og et spørgsmål', { type: 'warn' });
              let a = animal.value.trim(); if (!/^(en|et) /i.test(a)) a = `en ${a}`;
              st.tree = A.learn(st.tree, path, a, q.value, yes.v); store.save(); toast(`Tak! Nu kender jeg ${A.countAnimals(st.tree)} dyr`, { type: 'ok' }); path = null; phase = 'start'; draw();
            } }, icon('check'), 'Lær det'))];
      }
      h(clear(root), null, h('div', { class: 'l3-card an-card' }, body),
        phase === 'start' && A.countAnimals(st.tree) > A.countAnimals(A.START_TREE) ? h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Glem alle de dyr, du har lært mig?', confirmLabel: 'Start forfra', danger: true })) { st.tree = A.START_TREE; store.save(); draw(); } } }, icon('refresh'), 'Start forfra')) : null);
    }
    draw();
    return page('animals', 'Spilhal', 'Gæt dyret', 'Tænk på et dyr og svar ja eller nej – så gætter HUBTECH det. Tager den fejl, lærer du den det nye dyr, og så bliver den klogere.', root);
  },
};

// ── Kalejdoskop ──
export const kaleidoscope = {
  title: 'Kalejdoskop',
  async render() {
    let store;
    try { store = await appState('kaleidoscope', { slices: 8, mirror: true, width: 4, rainbow: true, color: '#22d3ee' }); } catch (e) { return loadError('Kalejdoskop', e); }
    const st = store.data, S = 720;
    const canvas = h('canvas', { class: 'kl2-canvas', width: S, height: S, 'aria-label': 'Tegneflade til kalejdoskop' }), ctx = canvas.getContext('2d');
    const bg = () => { ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, S, S); };
    bg();
    let last = null, hue = 0;
    const toP = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * S / r.width - S / 2, (e.clientY - r.top) * S / r.height - S / 2]; };
    const line = (a, b) => {
      ctx.save(); ctx.translate(S / 2, S / 2); ctx.lineCap = 'round'; ctx.lineWidth = st.width; hue = (hue + 2) % 360; ctx.strokeStyle = st.rainbow ? `hsl(${hue}, 90%, 62%)` : st.color;
      for (let k = 0; k < st.slices; k++) { ctx.rotate(Math.PI * 2 / st.slices); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); if (st.mirror) { ctx.beginPath(); ctx.moveTo(a[0], -a[1]); ctx.lineTo(b[0], -b[1]); ctx.stroke(); } }
      ctx.restore();
    };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); last = toP(e); line(last, [last[0] + 0.1, last[1]]); });
    canvas.addEventListener('pointermove', (e) => { if (!last) return; const p = toP(e); line(last, p); last = p; });
    canvas.addEventListener('pointerup', () => { last = null; });
    canvas.style.touchAction = 'none';
    const color = h('input', { type: 'color', value: st.color, 'aria-label': 'Farve', onchange: (e) => { st.color = e.target.value; st.rainbow = false; store.save(); } });
    const width = h('input', { type: 'range', min: 1, max: 24, value: st.width, 'aria-label': 'Stregtykkelse', oninput: (e) => { st.width = Number(e.target.value); store.save(); } });
    const tools = h('div', { class: 'kl2-tools' },
      segmented([4, 6, 8, 12, 16].map(n => ({ value: String(n), label: String(n) })), String(st.slices), (v) => { st.slices = Number(v); store.save(); }, { label: 'Antal spejlinger' }),
      h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: st.mirror, onchange: (e) => { st.mirror = e.target.checked; store.save(); } }), h('span', null, 'Spejl')),
      h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: st.rainbow, onchange: (e) => { st.rainbow = e.target.checked; store.save(); } }), h('span', null, 'Regnbue')),
      color, h('label', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, h('span', { class: 'faint' }, 'Streg'), width),
      h('button', { class: 'btn btn-sm', onclick: bg }, icon('eraser'), 'Ryd'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'kalejdoskop.png'; a.click(); } }, icon('download'), 'Gem billede'));
    return page('kaleidoscope', 'Kreativ', 'Kalejdoskop', 'Tegn med fingeren eller musen, og se mønstret spejle sig rundt om midten. Vælg antal spejlinger, farver og streg – og gem dit billede.', tools, h('div', { class: 'kl2-wrap' }, canvas));
  },
};

// ── Hoppeløb ──
export const jumper = {
  title: 'Hoppeløb',
  destroy() { cancelAnimationFrame(this._raf); document.removeEventListener('keydown', this._k); document.removeEventListener('keyup', this._k); },
  async render() {
    let store;
    try { store = await appState('jumper', { best: 0 }); } catch (e) { return loadError('Hoppeløb', e); }
    const st = store.data, self = this, W = 800, H = 260, GROUND = 220, lb = lbPanel('jumper', 'point');
    const canvas = h('canvas', { class: 'jp-canvas', width: W, height: H, 'aria-label': 'Hoppeløb' }), ctx = canvas.getContext('2d'), msg = h('div', { class: 'bf-msg' });
    let y, vy, obs, speed, dist, running = false, frame = 0, duck = false;
    const reset = () => { y = GROUND; vy = 0; obs = []; speed = 6; dist = 0; frame = 0; running = true; msg.hidden = true; };
    const jump = () => { if (running && y >= GROUND) vy = -12.5; };
    const over = () => { running = false; const sc = Math.floor(dist / 10), best = sc > st.best; if (best) { st.best = sc; store.save(); } if (sc) submitScore('jumper', sc); lb.reload(); msg.hidden = false; h(clear(msg), null, h('b', null, 'Bump!'), h('span', null, `${sc} point${best ? ' – ny rekord!' : ''}`), h('button', { class: 'btn btn-primary btn-lg', onclick: reset }, icon('play'), 'Løb igen')); };
    const step = () => {
      if (!running) return; frame++; dist += speed; speed = Math.min(15, 6 + dist / 2500);
      vy += 0.7; y = Math.min(GROUND, y + vy); if (y >= GROUND) vy = 0;
      if (!obs.length || obs[obs.length - 1].x < W - (260 + Math.random() * 260)) { const bird = dist > 1500 && Math.random() < 0.3; obs.push(bird ? { x: W + 20, w: 34, h: 22, y: GROUND - 58 - Math.random() * 20, bird: true } : { x: W + 20, w: 18 + Math.random() * 20, h: 30 + Math.random() * 28 }); }
      for (const o of obs) o.x -= speed; obs = obs.filter(o => o.x > -60);
      const ph = duck && y >= GROUND ? 26 : 46, px = 70, py = y - ph;
      for (const o of obs) { const oy = o.bird ? o.y : GROUND - o.h; if (px + 30 > o.x + 3 && px + 4 < o.x + o.w - 3 && py + ph > oy + 3 && py < oy + o.h - 3) return over(); }
    };
    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1e293b'); g.addColorStop(1, '#334155'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 5; i++) { const x = ((i * 220) - (dist || 0) * 0.2) % (W + 200); ctx.beginPath(); ctx.ellipse((x + W + 200) % (W + 200) - 100, 50 + i * 13, 50, 14, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#64748b'; ctx.fillRect(0, GROUND, W, 2); ctx.fillStyle = '#475569'; for (let i = 0; i < 30; i++) ctx.fillRect(((i * 53) - (dist || 0)) % W + (((i * 53) - (dist || 0)) % W < 0 ? W : 0), GROUND + 8 + (i % 3) * 8, 8, 2);
      for (const o of obs || []) { if (o.bird) { ctx.fillStyle = '#f472b6'; const f = Math.floor(frame / 8) % 2; ctx.beginPath(); ctx.moveTo(o.x, o.y + 11); ctx.lineTo(o.x + 17, o.y + (f ? 0 : 22)); ctx.lineTo(o.x + 34, o.y + 11); ctx.lineTo(o.x + 17, o.y + 14); ctx.fill(); } else { ctx.fillStyle = '#22c55e'; ctx.fillRect(o.x, GROUND - o.h, o.w, o.h); ctx.fillRect(o.x - 6, GROUND - o.h * 0.65, 6, 4); ctx.fillRect(o.x + o.w, GROUND - o.h * 0.45, 6, 4); } }
      const ph = duck && (y ?? GROUND) >= GROUND ? 26 : 46, py = (y ?? GROUND) - ph;
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(70, py, 30, ph); ctx.fillStyle = '#0b1020'; ctx.fillRect(88, py + 7, 5, 5);
      if (running && (y ?? GROUND) >= GROUND) { const f = Math.floor(frame / 5) % 2; ctx.fillStyle = '#38bdf8'; ctx.fillRect(f ? 74 : 88, GROUND - 2, 8, 4); }
      ctx.fillStyle = '#e2e8f0'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'right'; ctx.fillText(`${Math.floor((dist || 0) / 10)}  ·  rekord ${st.best}`, W - 16, 30);
    };
    const loop = () => { if (!document.body.contains(canvas)) return; step(); draw(); self._raf = requestAnimationFrame(loop); };
    canvas.addEventListener('pointerdown', jump);
    document.removeEventListener('keydown', this._k);
    this._k = (e) => { if (!document.body.contains(canvas)) return; if (e.type === 'keydown' && (e.key === ' ' || e.key === 'ArrowUp')) { e.preventDefault(); jump(); } if (e.key === 'ArrowDown') { e.preventDefault(); duck = e.type === 'keydown'; } };
    document.removeEventListener('keyup', this._k); document.addEventListener('keydown', this._k); document.addEventListener('keyup', this._k);
    msg.hidden = false; h(msg, null, h('b', null, 'Hoppeløb'), h('span', null, `Rekord: ${st.best}`), h('button', { class: 'btn btn-primary btn-lg', onclick: reset }, icon('play'), 'Start'));
    this._raf = requestAnimationFrame(loop);
    return page('jumper', 'Spilhal', 'Hoppeløb', 'Løb så langt du kan, og hop over kaktusserne – senere kommer der også fugle, du må dukke dig for. Mellemrum eller tryk for at hoppe, ↓ for at dukke.', h('div', { class: 'bo-wrap' }, h('div', { class: 'bf-stage' }, canvas, msg)), lb.el);
  },
};
