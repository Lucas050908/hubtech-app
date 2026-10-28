/** Fem på stribe, Tændstikker, Støjmåler, Ordklasser, Talsystemer, Genveje, Klaver og Morgenrutine (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, todayKey } from '../features/appkit.js';
import { boardGamePage } from './boardgames2.js';
import * as B from '../features/batch9.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const score = (st) => h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(st.right)), ' rigtige'), h('span', null, h('b', null, String(st.streak)), ' i træk'), h('span', { class: 'faint' }, `rekord ${st.best}`));
const mark = (st, ok, store) => { if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.streak = 0; } store.save(); };

// ── Fem på stribe ──
export const gomoku = boardGamePage({
  id: 'gomoku', title: 'Fem på stribe', mod: { newGame: B.newGomoku, apply: B.applyGomoku, aiMove: B.aiGomoku }, aiDelay: 500,
  lead: 'Få fem i træk – vandret, lodret eller på skrå – før modstanderen. Mod computeren, ved samme skærm eller online.',
  yourTurn: () => 'Din tur – sæt en brik',
  rules: ['Sæt skiftevis en brik på et ledigt kryds.', 'Den første med fem (eller flere) i træk vinder – vandret, lodret eller på skrå.', 'Hold øje med modstanderens “åbne tre” – de bliver hurtigt til fire, der ikke kan stoppes.'],
  renderBoard(ctl, g, s, my) {
    const line = new Set(s.line || []);
    return h('div', { class: 'gk-board' }, s.board.map((v, i) => h('button', { class: ['gk-cell', s.last === i && 'is-last', line.has(i) && 'is-line'], disabled: !my || v >= 0, 'aria-label': `Felt ${i % 15 + 1},${Math.floor(i / 15) + 1}${v === 0 ? ' sort' : v === 1 ? ' hvid' : ''}`, onclick: () => ctl.act('place', [i]) },
      v >= 0 ? h('span', { class: `gk-stone p${v}` }) : null)));
  },
});

// ── Tændstikker ──
export const nim = {
  title: 'Tændstikker',
  async render() {
    let store;
    try { store = await appState('nim', { misere: true, start: [1, 3, 5, 7], wins: 0, played: 0, two: false }); } catch (e) { return loadError('Tændstikker', e); }
    const st = store.data, root = h('div');
    let rows, turn, pick, over, log;
    const fresh = (first = 0) => { rows = st.start.slice(); turn = first; pick = null; over = null; log = []; draw(); if (!st.two && turn === 1) setTimeout(cpu, 700); };
    const names = () => (st.two ? ['Spiller 1', 'Spiller 2'] : ['Dig', 'Computeren']);
    const end = (who) => { // who took the last match
      const winner = st.misere ? 1 - who : who; over = { winner }; if (!st.two) { st.played++; if (winner === 0) st.wins++; store.save(); } draw();
    };
    const take = (row, n) => { rows[row] -= n; log.unshift(`${names()[turn]} tog ${n} fra række ${row + 1}`); pick = null; if (B.nimDone(rows)) return end(turn); turn = 1 - turn; draw(); if (!st.two && turn === 1) setTimeout(cpu, 800); };
    const cpu = () => { if (over || !document.body.contains(root)) return; const m = B.nimMove(rows, st.misere); take(m.row, m.take); };
    function draw() {
      const my = !over && (st.two || turn === 0);
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'm', label: 'Den sidste taber' }, { value: 'n', label: 'Den sidste vinder' }], st.misere ? 'm' : 'n', (v) => { st.misere = v === 'm'; store.save(); fresh(); }, { label: 'Regel' }),
          segmented([{ value: 'cpu', label: 'Mod computeren' }, { value: 'two', label: 'To spillere' }], st.two ? 'two' : 'cpu', (v) => { st.two = v === 'two'; store.save(); fresh(); }, { label: 'Modstander' }),
          segmented([{ value: '1,3,5,7', label: '1-3-5-7' }, { value: '3,4,5', label: '3-4-5' }, { value: '2,4,6,8', label: '2-4-6-8' }], st.start.join(','), (v) => { st.start = v.split(',').map(Number); store.save(); fresh(); }, { label: 'Start' })),
        h('div', { class: 'l3-card' },
          h('div', { class: ['dm-status', over && 'is-over', my && 'is-mine'] }, over ? (st.two ? `${names()[over.winner]} vandt! 🎉` : over.winner === 0 ? 'Du vandt over computeren! 🎉' : 'Computeren vandt – prøv igen') : my ? `${names()[turn]}: vælg tændstikker i én række` : 'Computeren tænker …'),
          h('div', { class: 'nm-rows' }, rows.map((n, r) => h('div', { class: 'nm-row' }, h('span', { class: 'faint nm-n' }, String(n)),
            Array.from({ length: st.start[r] }, (_, k) => k < n ? h('button', { class: ['nm-match', pick && pick.row === r && k >= n - pick.n && 'is-picked'], disabled: !my, 'aria-label': `Række ${r + 1}, tændstik ${k + 1}`, onclick: () => { pick = { row: r, n: n - k }; draw(); } }) : h('span', { class: 'nm-gone' }))))),
          my && pick ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => take(pick.row, pick.n) }, `Tag ${pick.n} ${pick.n === 1 ? 'tændstik' : 'tændstikker'}`) : null,
          over ? h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn btn-primary', onclick: () => fresh(0) }, 'Jeg starter'), st.two ? null : h('button', { class: 'btn', onclick: () => fresh(1) }, 'Computeren starter')) : null,
          log.length ? h('ul', { class: 'dm-log' }, log.slice(0, 4).map(l => h('li', null, l))) : null,
          !st.two ? h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, `Du har vundet ${st.wins} af ${st.played}. Tip: computeren regner binært – kan du gennemskue hvordan?`) : null));
    }
    fresh();
    return page('nim', 'Spilhal', 'Tændstikker', 'Det gamle tændstikspil: tag så mange du vil fra én række ad gangen. Den, der tager den sidste, taber – eller vinder, hvis I vælger det.', root);
  },
};

// ── Støjmåler ──
export const noise = {
  title: 'Støjmåler',
  destroy() { cancelAnimationFrame(this._raf); this._stop?.(); },
  async render() {
    let store;
    try { store = await appState('noise', { limit: 70 }); } catch (e) { return loadError('Støjmåler', e); }
    const st = store.data, self = this;
    const face = h('div', { class: 'nz-face' }, '🙂'), meter = h('div', { class: 'nz-meter' }, h('i')), label = h('b', { class: 'nz-label' }, 'Tryk på start'), info = h('span', { class: 'faint' });
    let over = 0, quiet = 0, t0 = 0;
    const limit = h('input', { type: 'range', min: 30, max: 95, value: st.limit, 'aria-label': 'Grænse', oninput: (e) => { st.limit = Number(e.target.value); store.save(); mark.style.left = `${st.limit}%`; } });
    const mark = h('span', { class: 'nz-mark', style: { left: `${st.limit}%` } });
    const btn = h('button', { class: 'btn btn-primary btn-lg', onclick: async () => {
      if (self._stop) { self._stop(); return; }
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('HUBTECH fik ikke lov at bruge mikrofonen', { type: 'warn' }); return; }
      const ac = new AudioContext(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const buf = new Float32Array(an.fftSize); let smooth = 0; t0 = Date.now(); over = 0; quiet = 0;
      self._stop = () => { cancelAnimationFrame(self._raf); stream.getTracks().forEach(t => t.stop()); ac.close().catch(() => {}); self._stop = null; btn.textContent = 'Start'; label.textContent = 'Stoppet'; };
      btn.textContent = 'Stop';
      let last = performance.now();
      const loop = (now) => {
        if (!document.body.contains(btn)) return self._stop?.();
        an.getFloatTimeDomainData(buf); const v = B.level(buf); smooth = smooth * 0.85 + v * 0.15; const dt = (now - last) / 1000; last = now;
        if (smooth > st.limit) over += dt; else quiet += dt;
        const [, txt, col] = B.noiseLabel(smooth);
        meter.firstChild.style.width = `${smooth}%`; meter.firstChild.style.background = col; label.textContent = txt; face.textContent = smooth > st.limit ? '😱' : smooth > st.limit - 15 ? '😐' : '🙂';
        face.classList.toggle('is-loud', smooth > st.limit);
        info.textContent = `Stille ${Math.round(quiet / Math.max(1, quiet + over) * 100)} % af tiden · ${Math.floor((Date.now() - t0) / 60000)} min.`;
        self._raf = requestAnimationFrame(loop);
      };
      self._raf = requestAnimationFrame(loop);
    } }, icon('mic'), 'Start');
    return page('noise', 'Værktøjer', 'Støjmåler', 'Til klassen eller hjemmearbejdet: mikrofonen måler, hvor højt der er – og ansigtet bliver sur, når I går over grænsen. Lyden optages ikke.',
      h('div', { class: 'l3-card nz-card' }, face, label, h('div', { class: 'nz-track' }, meter, mark), info, btn,
        h('label', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', { class: 'faint' }, 'Grænse'), limit)));
  },
};

// ── Ordklasser ──
export const wordclass = {
  title: 'Ordklasser',
  async render() {
    let store;
    try { store = await appState('wordclass', { level: 3, right: 0, streak: 0, best: 0 }); } catch (e) { return loadError('Ordklasser', e); }
    const st = store.data, root = h('div');
    const LEVELS = { 1: ['n', 'v'], 2: ['n', 'v', 'a'], 3: ['n', 'v', 'a', 's', 't', 'f'], 4: Object.keys(B.CLASSES) };
    let sen, idx, answered;
    const next = () => { const allowed = LEVELS[st.level]; let w; do { sen = B.parseSentence(B.SENTENCES[Math.floor(Math.random() * B.SENTENCES.length)]); w = sen.map((x, i) => ({ ...x, i })).filter(x => x.tag && allowed.includes(x.tag)); } while (!w.length); idx = w[Math.floor(Math.random() * w.length)].i; answered = null; draw(); };
    function draw() {
      const want = sen[idx].tag, opts = LEVELS[st.level];
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: '1', label: 'Navne- og udsagnsord' }, { value: '2', label: '+ tillægsord' }, { value: '3', label: '+ stedord, talord, forholdsord' }, { value: '4', label: 'Alle' }], String(st.level), (v) => { st.level = Number(v); store.save(); next(); }, { label: 'Niveau' })),
        h('div', { class: 'l3-card' }, score(st),
          h('p', { class: 'okl-sent' }, sen.map((w, i) => h('span', { class: ['okl-w', i === idx && 'is-q'] }, w.word)), '.'),
          h('p', { class: 'l3-ask' }, 'Hvilken ordklasse er', h('b', null, `“${sen[idx].word}”?`)),
          h('div', { class: 'l3-opts' }, opts.map(t => h('button', { class: ['l3-opt', answered && t === want && 'ok', answered && answered.v === t && t !== want && 'bad'], disabled: !!answered, onclick: () => { answered = { v: t }; mark(st, t === want, store); draw(); } }, B.CLASSES[t]))),
          answered ? h('div', { class: ['l3-fb', answered.v === want ? 'ok' : 'bad'] }, answered.v === want ? 'Rigtigt! ' : `Det er et ${B.CLASSES[want].toLowerCase()}. `, h('span', { class: 'faint' }, { n: 'Navneord er ting, dyr, personer og steder – du kan sætte “en” eller “et” foran.', v: 'Udsagnsord fortæller, hvad nogen gør – du kan sætte “at” foran.', a: 'Tillægsord beskriver, hvordan noget er.', s: 'Stedord står i stedet for et navneord – jeg, du, den, min …', t: 'Talord fortæller antal eller rækkefølge.', f: 'Forholdsord viser, hvor noget er i forhold til noget andet – på, i, over …', b: 'Biord fortæller hvordan, hvornår eller hvor meget.', k: 'Bindeord binder ord og sætninger sammen – og, men, eller.' }[want])) : null,
          answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
    }
    next();
    return page('wordclass', 'Lær', 'Ordklasser', 'Øv ordklasserne i rigtige sætninger: navneord, udsagnsord, tillægsord og resten. Fire niveauer – med en lille forklaring hver gang.', root);
  },
};

// ── Talsystemer ──
export const numsys = {
  title: 'Talsystemer',
  async render() {
    let store;
    try { store = await appState('numsys', { mode: 'conv', level: 1, right: 0, streak: 0, best: 0, n: 42 }); } catch (e) { return loadError('Talsystemer', e); }
    const st = store.data, root = h('div');
    let task = null, answered = null;
    function converter() {
      const fields = {};
      const set = (n, except) => { st.n = n; store.save(); for (const b of [2, 8, 10, 16]) if (b !== except) fields[b].value = n == null ? '' : B.toBase(n, b); drawBits(); };
      const bits = h('div', { class: 'ns-bits' });
      const drawBits = () => { const bin = st.n == null ? '' : B.toBase(st.n, 2).padStart(8, '0'); h(clear(bits), null, [...bin].map((c, i, a) => h('button', { class: ['ns-bit', c === '1' && 'on'], 'aria-label': `Bit med værdi ${2 ** (a.length - 1 - i)}`, onclick: () => set((st.n || 0) ^ (2 ** (a.length - 1 - i))) }, h('b', null, c), h('small', null, String(2 ** (a.length - 1 - i)))))); };
      const row = (b) => { const el = fields[b] = h('input', { class: 'input ns-in', value: st.n == null ? '' : B.toBase(st.n, b), 'aria-label': B.BASES[b], spellcheck: false, autocomplete: 'off' }); el.addEventListener('input', () => { const n = B.fromBase(el.value, b); el.classList.toggle('bad', el.value !== '' && n == null); if (n != null && n <= 0xffffffff) set(n, b); }); return h('label', { class: 'ns-row' }, h('span', null, B.BASES[b], h('small', { class: 'faint' }, ` (${b})`)), el); };
      const out = h('div', { class: 'stack' }, [10, 2, 16, 8].map(row), h('span', { class: 'field-label' }, 'Klik på bittene'), bits);
      drawBits();
      return h('div', { class: 'l3-card', style: { justifyItems: 'stretch' } }, out, h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, 'Computere regner med binære tal – kun 0 og 1. Hver plads er dobbelt så meget værd som den til højre. Hex bruges til farver og adresser, fordi ét hex-ciffer er præcis fire bit.'));
    }
    function quiz() {
      if (!task) task = B.numTask(st.level);
      const input = h('input', { class: 'input l3-typed', 'aria-label': 'Dit svar', autocomplete: 'off', spellcheck: false, disabled: !!answered });
      const check = () => { if (!input.value.trim()) return; const ok = B.fromBase(input.value, task.to) === task.n; answered = { ok }; mark(st, ok, store); draw(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (answered) { task = null; answered = null; draw(); } else check(); } });
      if (!answered) setTimeout(() => input.isConnected && input.focus(), 0);
      return h('div', { class: 'l3-card' }, score(st),
        h('div', { class: 'l3-bar', style: { justifyContent: 'center' } }, segmented([{ value: '1', label: 'Op til 15' }, { value: '2', label: 'Op til 63' }, { value: '3', label: 'Op til 255' }, { value: '4', label: 'Op til 4095' }], String(st.level), (v) => { st.level = Number(v); store.save(); task = null; answered = null; draw(); }, { label: 'Niveau' })),
        h('p', { class: 'l3-ask' }, `Skriv ${B.BASES[task.from].toLowerCase()} ${task.from === 10 ? 'tallet' : ''} som ${B.BASES[task.to].toLowerCase()}`, h('b', { class: 'ns-mono' }, task.ask)),
        h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, answered ? null : h('button', { class: 'btn btn-primary', onclick: check }, 'Tjek')),
        answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Ikke helt. ', h('span', { class: 'ns-mono' }, `${task.ask} (${task.from}) = ${task.answer} (${task.to})`), task.to === 2 || task.from === 2 ? h('span', { class: 'faint' }, ` · ${B.bitValues(B.toBase(task.n, 2)).filter(Boolean).join(' + ')} = ${task.n}`) : null) : null,
        answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: () => { task = null; answered = null; draw(); } }, 'Næste', icon('play')) : null);
    }
    function draw() { h(clear(root), null, h('div', { class: 'l3-bar' }, segmented([{ value: 'conv', label: 'Omregner' }, { value: 'quiz', label: 'Øv dig' }], st.mode, (v) => { st.mode = v; store.save(); draw(); }, { label: 'Visning' })), st.mode === 'conv' ? converter() : quiz()); }
    draw();
    return page('numsys', 'Lær', 'Talsystemer', 'Forstå binære tal og hex, som computere bruger: omregn mellem talsystemer, klik bittene til og fra, og øv dig.', root);
  },
};

// ── Genveje ──
export const shortcuts = {
  title: 'Genveje',
  destroy() { document.removeEventListener('keydown', this._k, true); },
  async render() {
    let store;
    try { store = await appState('shortcuts', { mac: /Mac|iPhone|iPad/.test(navigator.platform || ''), right: 0, streak: 0, best: 0, known: {} }); } catch (e) { return loadError('Genveje', e); }
    const st = store.data, self = this, root = h('div');
    let q = null, answered = null, mode = 'list';
    const keyOf = (x) => (st.mac ? x[2] : x[1]);
    const next = () => { const pool = B.SHORTCUTS.filter(x => !st.known[x[0]]); const src = pool.length ? pool : B.SHORTCUTS; q = src[Math.floor(Math.random() * src.length)]; answered = null; draw(); };
    const pressedOk = (c) => c && c.replace(/\s/g, '').toLowerCase() === keyOf(q).replace(/\s/g, '').toLowerCase();
    function draw() {
      const kbd = (s) => h('span', { class: 'gv-keys' }, s.split('+').map(k => h('kbd', null, k || '+')));
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'list', label: 'Oversigt' }, { value: 'quiz', label: 'Øv dig' }], mode, (v) => { mode = v; if (v === 'quiz') next(); else draw(); }, { label: 'Visning' }),
          segmented([{ value: 'win', label: 'Windows' }, { value: 'mac', label: 'Mac' }], st.mac ? 'mac' : 'win', (v) => { st.mac = v === 'mac'; store.save(); draw(); }, { label: 'System' })),
        mode === 'list' ? h('div', { class: 'gv-list' }, B.SHORTCUTS.map(x => h('div', { class: ['gv-row', st.known[x[0]] && 'is-known'] }, h('span', null, x[0]), kbd(keyOf(x)))))
          : h('div', { class: 'l3-card' }, score(st),
            h('p', { class: 'l3-ask' }, 'Hvilken genvej er', h('b', null, `${q[0]}?`)),
            h('p', { class: 'faint', style: { margin: 0, fontSize: '13px' } }, answered ? '' : 'Tryk tasterne (de fleste virker her) – eller vis svaret.'),
            answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Det er ', kbd(keyOf(q))) : h('button', { class: 'btn', onclick: () => { answered = { ok: false }; mark(st, false, store); draw(); } }, icon('eye'), 'Vis svaret'),
            answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
    }
    document.removeEventListener('keydown', this._k, true);
    this._k = (e) => {
      if (mode !== 'quiz' || answered || !q || !document.body.contains(root)) return;
      const c = B.combo(e, st.mac); if (!c) return;
      if (!(e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key))) return;
      e.preventDefault(); e.stopPropagation();
      const ok = pressedOk(c); answered = { ok }; mark(st, ok, store); if (ok) st.known[q[0]] = true; store.save(); draw();
    };
    document.addEventListener('keydown', this._k, true);
    draw();
    return page('shortcuts', 'Lær', 'Genveje', 'Bliv hurtigere ved computeren: de vigtigste tastaturgenveje til Windows og Mac – og en øvelse, hvor du trykker dem selv.', root);
  },
};

// ── Klaver ──
export const piano = {
  title: 'Klaver',
  destroy() { document.removeEventListener('keydown', this._k); document.removeEventListener('keyup', this._k); clearTimeout(this._t); try { this._ac?.close(); } catch { /* */ } },
  async render() {
    let store;
    try { store = await appState('piano', { sound: 'piano', recs: [] }); } catch (e) { return loadError('Klaver', e); }
    const st = store.data, self = this, root = h('div');
    let ac = null, rec = null, playing = false;
    const audio = () => (ac ||= self._ac = new (window.AudioContext || window.webkitAudioContext)());
    const play = (midi, dur = 0.6) => {
      const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = { piano: 'triangle', orgel: 'square', fløjte: 'sine' }[st.sound] || 'triangle'; o.frequency.value = B.freq(midi);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(st.sound === 'orgel' ? 0.12 : 0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (st.sound === 'orgel' ? dur * 0.9 : dur * 1.6));
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur * 1.7);
      const k = root.querySelector(`[data-m="${midi}"]`); if (k) { k.classList.add('down'); setTimeout(() => k.classList.remove('down'), 160); }
      if (rec) rec.notes.push([midi, Date.now() - rec.t0]);
    };
    const playSeq = async (notes) => { if (playing) return; playing = true; for (const [m, gap] of notes) { if (!document.body.contains(root) || !playing) break; play(m, 0.5); await new Promise(r => { self._t = setTimeout(r, gap); }); } playing = false; };
    const tune = (name) => playSeq(B.TUNES[name].map(([m, b]) => [m, b * 380]));
    const replay = (r) => playSeq(r.notes.map(([m, t], i, a) => [m, (a[i + 1]?.[1] ?? t + 400) - t]));
    function draw() {
      const keys = []; for (let m = 60; m <= 76; m++) keys.push(m);
      const white = keys.filter(m => ![1, 3, 6, 8, 10].includes(m % 12));
      const kb = Object.fromEntries(Object.entries(B.KEYMAP).map(([k, m]) => [m, k.toUpperCase()]));
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'piano', label: 'Klaver' }, { value: 'orgel', label: 'Orgel' }, { value: 'fløjte', label: 'Fløjte' }], st.sound, (v) => { st.sound = v; store.save(); }, { label: 'Lyd' }),
          h('button', { class: ['btn btn-sm', rec && 'btn-primary'], onclick: () => { if (rec) { if (rec.notes.length) { st.recs.unshift({ name: `Optagelse ${new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`, notes: rec.notes.map(([m, t]) => [m, t - rec.notes[0][1]]) }); st.recs = st.recs.slice(0, 10); store.save(); toast('Melodien er gemt', { type: 'ok' }); } rec = null; } else rec = { t0: Date.now(), notes: [] }; draw(); } }, icon(rec ? 'pause' : 'mic'), rec ? 'Stop optagelse' : 'Optag')),
        h('div', { class: 'pn-keys' }, white.map(m => { const black = keys.includes(m + 1) && [1, 3, 6, 8, 10].includes((m + 1) % 12);
          return h('div', { class: 'pn-wrap' }, h('button', { class: 'pn-white', 'data-m': m, 'aria-label': B.noteName(m), onpointerdown: (e) => { e.preventDefault(); play(m); } }, h('small', null, B.NOTE_NAMES[m % 12]), kb[m] ? h('kbd', null, kb[m]) : null),
            black ? h('button', { class: 'pn-black', 'data-m': m + 1, 'aria-label': B.noteName(m + 1), onpointerdown: (e) => { e.preventDefault(); play(m + 1); } }, kb[m + 1] ? h('kbd', null, kb[m + 1]) : null) : null); })),
        h('div', { class: 'grid-2 dc-grid' },
          panel('Lær en melodi', 'music', h('div', { class: 'stack', style: { gap: '6px' } }, Object.keys(B.TUNES).map(n => h('div', { class: 'row', style: { gap: '8px', alignItems: 'center', justifyContent: 'space-between' } }, h('span', null, n), h('span', { class: 'faint pn-notes' }, B.TUNES[n].slice(0, 8).map(([m]) => B.NOTE_NAMES[m % 12]).join(' '), ' …'), h('button', { class: 'btn btn-sm', onclick: () => tune(n) }, icon('play'), 'Hør'))))),
          panel('Dine optagelser', 'mic', st.recs.length ? h('div', { class: 'stack', style: { gap: '6px' } }, st.recs.map(r => h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', { style: { flex: 1 } }, r.name, h('small', { class: 'faint' }, ` · ${r.notes.length} toner`)), h('button', { class: 'btn btn-sm', onclick: () => replay(r) }, icon('play')), h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${r.name}`, onclick: () => { st.recs = st.recs.filter(x => x !== r); store.save(); draw(); } }, icon('trash'))))) : h('p', { class: 'faint' }, 'Tryk “Optag”, spil en melodi, og tryk stop – så gemmes den her.'))));
    }
    document.removeEventListener('keydown', this._k); document.removeEventListener('keyup', this._k);
    const held = new Set();
    this._k = (e) => { if (!document.body.contains(root) || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return; const m = B.KEYMAP[e.key.toLowerCase()]; if (!m) return; if (e.type === 'keyup') { held.delete(m); return; } if (held.has(m)) return; held.add(m); e.preventDefault(); play(m); };
    document.addEventListener('keydown', this._k); document.addEventListener('keyup', this._k);
    draw();
    return page('piano', 'Kreativ', 'Klaver', 'Spil klaver med musen, fingeren eller tastaturet (A-S-D-F-G-H-J-K). Lær en melodi, og optag dine egne.', root);
  },
};

// ── Morgenrutine ──
export const routine = {
  title: 'Morgenrutine',
  async render() {
    let store;
    try { store = await appState('routine', { steps: B.ROUTINE.slice(), done: {}, days: {}, leave: '07:45' }); } catch (e) { return loadError('Morgenrutine', e); }
    const st = store.data, root = h('div');
    function draw() {
      const day = todayKey(), done = st.done[day] || [], all = st.steps.length && st.steps.every(s => done.includes(s));
      const [hh, mm] = (st.leave || '07:45').split(':').map(Number), left = Math.round((new Date().setHours(hh, mm, 0, 0) - Date.now()) / 60000);
      const leave = h('input', { class: 'input', type: 'time', value: st.leave, 'aria-label': 'Vi skal gå kl.', style: { width: '120px' }, onchange: (e) => { st.leave = e.target.value; store.save(); draw(); } });
      const edit = h('textarea', { class: 'textarea', rows: 6, 'aria-label': 'Trin i rutinen' }, st.steps.join('\n'));
      h(clear(root), null,
        h('div', { class: 'rt-top' }, h('div', { class: 'rt-stars' }, h('b', null, `${done.filter(s => st.steps.includes(s)).length}/${st.steps.length}`), h('span', null, all ? 'Klar til at gå! 🎉' : 'trin klaret')),
          h('div', { class: 'rt-stars' }, h('b', null, `${B.streak(st.days, day)} 🔥`), h('span', null, 'morgener i træk')),
          h('div', { class: 'rt-stars' }, h('b', null, left > 0 && left < 600 ? `${left} min.` : '–'), h('span', null, 'til vi skal gå'))),
        h('div', { class: 'rt-list' }, st.steps.map((s, i) => { const on = done.includes(s);
          return h('button', { class: ['rt-step', on && 'is-done'], 'aria-pressed': String(on), onclick: () => { const d = st.done[day] = (st.done[day] || []).filter(x => st.steps.includes(x)); on ? d.splice(d.indexOf(s), 1) : d.push(s); const complete = st.steps.every(x => d.includes(x)); if (complete) { st.days[day] = true; toast('Hele rutinen er klaret – flot! ⭐', { type: 'xp' }); } else delete st.days[day]; for (const k of Object.keys(st.done)) if (k < todayKey(Date.now() - 14 * 86400000)) delete st.done[k]; store.save(); draw(); } },
            h('span', { class: 'rt-num' }, on ? '⭐' : String(i + 1)), h('span', null, s)); })),
        h('details', { class: 'panel', style: { padding: '12px 14px' } }, h('summary', null, 'Ret rutinen'), h('div', { class: 'stack', style: { marginTop: '10px' } }, h('label', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', null, 'Vi skal gå kl.'), leave), edit,
          h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: () => { st.steps = edit.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 20); store.save(); toast('Rutinen er gemt', { type: 'ok' }); draw(); } }, icon('check'), 'Gem')))));
    }
    draw();
    return page('routine', 'Hjemme', 'Morgenrutine', 'En tjekliste til morgenen – stjerner for hvert trin, en nedtælling til I skal gå, og en stribe for hver morgen hele rutinen klares.', root);
  },
};
