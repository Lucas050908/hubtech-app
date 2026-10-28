/** Prik til prik, Talrækker, Bogstaver, Tælleleg, Tegneserie, Emojigåder, Puslespil, Dagens plan, Talhukommelse og Ordsprog (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';
import * as B from '../features/batch11.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const score = (st) => h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(st.right)), ' rigtige'), h('span', null, h('b', null, String(st.streak)), ' i træk'), h('span', { class: 'faint' }, `rekord ${st.best}`));
const mark = (st, ok, store) => { if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.streak = 0; } store.save(); };
const say = (t) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'da-DK'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch { return false; } };
const svgEl = (t, a = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', t); for (const k in a) e.setAttribute(k, a[k]); return e; };

// ── Prik til prik ──
export const dotdot = {
  title: 'Prik til prik',
  async render() {
    let store;
    try { store = await appState('dotdot', { idx: 0, done: {} }); } catch (e) { return loadError('Prik til prik', e); }
    const st = store.data, root = h('div');
    let next = 0;
    function draw() {
      const p = B.DOT_PICS[st.idx], n = p.pts.length, finished = next >= n;
      const svg = svgEl('svg', { viewBox: '-6 -6 112 112', class: 'dd-svg', role: 'img', 'aria-label': `Prik til prik: ${finished ? p.name : 'ukendt billede'}` });
      if (finished && p.close) svg.append(svgEl('polygon', { points: p.pts.map(q => q.join(',')).join(' '), class: 'dd-fill' }));
      for (let i = 1; i < Math.min(next, n); i++) svg.append(svgEl('line', { x1: p.pts[i - 1][0], y1: p.pts[i - 1][1], x2: p.pts[i][0], y2: p.pts[i][1], class: 'dd-line' }));
      if (finished && p.close) svg.append(svgEl('line', { x1: p.pts[n - 1][0], y1: p.pts[n - 1][1], x2: p.pts[0][0], y2: p.pts[0][1], class: 'dd-line' }));
      p.pts.forEach(([x, y], i) => {
        const g = svgEl('g', { class: `dd-dot${i < next ? ' done' : ''}${i === next ? ' next' : ''}`, tabindex: '0', role: 'button', 'aria-label': `Prik ${i + 1}` });
        g.append(svgEl('circle', { cx: x, cy: y, r: 4.2 }));
        const t = svgEl('text', { x: x + 5, y: y - 4 }); t.textContent = String(i + 1); g.append(t);
        const hit = () => { if (i === next) { next++; if (next === n) { st.done[p.name] = true; store.save(); toast(`Det er en ${p.name.toLowerCase()}! 🎉`, { type: 'xp' }); } draw(); } else if (i > next) toast(`Find prik nummer ${next + 1}`, { type: 'info', ms: 1000 }); };
        g.addEventListener('click', hit); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') hit(); });
        svg.append(g);
      });
      h(clear(root), null,
        h('div', { class: 'ng-picks' }, B.DOT_PICS.map((q, i) => h('button', { class: ['sh-tag', i === st.idx && 'is-on'], onclick: () => { st.idx = i; next = 0; store.save(); draw(); } }, st.done[q.name] ? `✓ ${q.name}` : `Billede ${i + 1}`))),
        h('div', { class: 'l3-card' }, h('p', { class: 'l3-ask' }, finished ? 'Færdig!' : 'Tryk på prikkerne i rækkefølge', h('b', null, finished ? p.name : `Nummer ${next + 1}`)), svg,
          finished ? h('button', { class: 'btn btn-primary', onclick: () => { st.idx = (st.idx + 1) % B.DOT_PICS.length; next = 0; store.save(); draw(); } }, 'Næste billede', icon('play')) : null));
    }
    draw();
    return page('dotdot', 'For de mindste', 'Prik til prik', 'Tryk på prikkerne i den rigtige rækkefølge – 1, 2, 3 … – og se, hvilket billede der kommer frem.', root);
  },
};

// ── Talrækker ──
export const sequences = {
  title: 'Talrækker',
  async render() {
    let store;
    try { store = await appState('sequences', { level: 1, right: 0, streak: 0, best: 0 }); } catch (e) { return loadError('Talrækker', e); }
    const st = store.data, root = h('div');
    let q, answered;
    const next = () => { q = B.sequence(st.level); answered = null; draw(); };
    function draw() {
      const input = h('input', { class: 'input l3-typed', type: 'number', 'aria-label': 'Næste tal', disabled: !!answered });
      const check = () => { if (input.value === '') return; const ok = Number(input.value) === q.answer; answered = { ok }; mark(st, ok, store); draw(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (answered) next(); else check(); } });
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: '1', label: 'Let' }, { value: '2', label: 'Mellem' }, { value: '3', label: 'Svær' }], String(st.level), (v) => { st.level = Number(v); store.save(); next(); }, { label: 'Niveau' })),
        h('div', { class: 'l3-card' }, score(st),
          h('div', { class: 'sq-row' }, q.shown.map(n => h('span', { class: 'sq-n' }, String(n))), h('span', { class: ['sq-n', 'sq-q', answered && (answered.ok ? 'ok' : 'bad')] }, answered ? String(q.answer) : '?')),
          h('p', { class: 'l3-ask' }, 'Hvilket tal kommer så?'),
          h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, answered ? null : h('button', { class: 'btn btn-primary', onclick: check }, 'Tjek')),
          answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : `Det er ${q.answer}. `, h('span', { class: 'faint' }, `Mønstret: ${q.rule}.`)) : null,
          answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
      if (!answered) setTimeout(() => input.isConnected && input.focus(), 0); else setTimeout(() => root.querySelector('.l3-next')?.focus(), 0);
    }
    next();
    return page('sequences', 'Lær', 'Talrækker', 'Find mønstret i talrækken og gæt det næste tal. Plus og minus, gange, kvadrattal og rækker, hvor tallene lægges sammen.', root);
  },
};

// ── Bogstaver ──
export const letters = {
  title: 'Bogstaver',
  async render() {
    let store;
    try { store = await appState('letters', { n: 4, right: 0, streak: 0, best: 0, mode: 'find' }); } catch (e) { return loadError('Bogstaver', e); }
    const st = store.data, root = h('div');
    let q, answered;
    const next = () => { q = B.letterRound(st.n); answered = null; draw(); setTimeout(() => say(q.target), 200); };
    function draw() {
      if (st.mode === 'abc') {
        h(clear(root), null, h('div', { class: 'l3-bar' }, segmented([{ value: 'find', label: 'Find bogstavet' }, { value: 'abc', label: 'Alfabetet' }], st.mode, (v) => { st.mode = v; store.save(); v === 'find' ? next() : draw(); }, { label: 'Øvelse' })),
          h('div', { class: 'bgs-abc' }, B.ALPHABET.map(l => h('button', { class: 'bgs-card', onclick: () => say(`${l}. ${l} som i ${B.LETTER_WORDS[l]}`) }, h('b', null, l), h('small', null, l.toLowerCase()), h('span', null, B.LETTER_WORDS[l])))));
        return;
      }
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'find', label: 'Find bogstavet' }, { value: 'abc', label: 'Alfabetet' }], st.mode, (v) => { st.mode = v; store.save(); v === 'find' ? next() : draw(); }, { label: 'Øvelse' }),
          segmented([{ value: '3', label: '3' }, { value: '4', label: '4' }, { value: '6', label: '6' }], String(st.n), (v) => { st.n = Number(v); store.save(); next(); }, { label: 'Antal bogstaver' })),
        h('div', { class: 'l3-card' }, score(st),
          h('button', { class: 'sp2-hear', onclick: () => { if (!say(q.target)) toast('Din browser kan ikke læse op', { type: 'warn' }); } }, icon('volume'), h('span', null, 'Hør bogstavet')),
          h('div', { class: 'bgs-opts' }, q.options.map(l => h('button', { class: ['bgs-opt', answered && l === q.target && 'ok', answered && answered.v === l && l !== q.target && 'bad'], disabled: !!answered, 'aria-label': `Bogstavet ${l}`, onclick: () => { const ok = l === q.target; answered = { v: l }; mark(st, ok, store); say(ok ? `Rigtigt! ${l} som i ${B.LETTER_WORDS[l]}` : `Det var ${l}. Prøv igen`); draw(); if (ok) setTimeout(() => document.body.contains(root) && next(), 1800); } }, l))),
          answered && answered.v !== q.target ? h('div', { class: 'l3-fb bad' }, `Det var ${answered.v}. Vi ledte efter `, h('b', null, q.target), ` som i ${B.LETTER_WORDS[q.target]}.`, h('button', { class: 'btn btn-sm btn-primary', style: { marginLeft: '8px' }, onclick: next }, 'Næste')) : null,
          answered && answered.v === q.target ? h('div', { class: 'l3-fb ok' }, `Rigtigt! ${q.target} som i ${B.LETTER_WORDS[q.target]}`) : null));
    }
    if (st.mode === 'find') next(); else draw();
    return page('letters', 'For de mindste', 'Bogstaver', 'Hør et bogstav og find det – eller tryk dig gennem alfabetet fra A til Å og hør et ord til hvert bogstav.', root);
  },
};

// ── Tælleleg ──
export const counting = {
  title: 'Tælleleg',
  async render() {
    let store;
    try { store = await appState('counting', { max: 10, right: 0, streak: 0, best: 0 }); } catch (e) { return loadError('Tælleleg', e); }
    const st = store.data, root = h('div');
    let q, answered;
    const next = () => { q = B.countRound(st.max); answered = null; draw(); };
    function draw() {
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: '5', label: 'Op til 5' }, { value: '10', label: 'Op til 10' }, { value: '20', label: 'Op til 20' }], String(st.max), (v) => { st.max = Number(v); store.save(); next(); }, { label: 'Op til' })),
        h('div', { class: 'l3-card' }, score(st),
          h('p', { class: 'l3-ask' }, 'Hvor mange er der?'),
          h('div', { class: 'cnt-things' }, Array.from({ length: q.n }, () => h('span', null, q.thing))),
          h('div', { class: 'bgs-opts' }, q.options.map(o => h('button', { class: ['bgs-opt', answered && o === q.n && 'ok', answered && answered.v === o && o !== q.n && 'bad'], disabled: !!answered, onclick: () => { const ok = o === q.n; answered = { v: o }; mark(st, ok, store); say(ok ? `Rigtigt! ${q.n}` : `Der er ${q.n}`); draw(); setTimeout(() => document.body.contains(root) && next(), ok ? 1300 : 2200); } }, String(o)))),
          answered ? h('div', { class: ['l3-fb', answered.v === q.n ? 'ok' : 'bad'] }, answered.v === q.n ? `Rigtigt – der er ${q.n}!` : `Der er ${q.n}.`) : null));
    }
    next();
    return page('counting', 'For de mindste', 'Tælleleg', 'Tæl tingene og tryk på det rigtige tal. Fra 5 til 20 – og HUBTECH siger, om det er rigtigt.', root);
  },
};

// ── Tegneserie ──
export const comic = {
  title: 'Tegneserie',
  async render() {
    let store;
    try { store = await appState('comic', { comic: null }); } catch (e) { return loadError('Tegneserie', e); }
    const st = store.data, root = h('div');
    if (!st.comic) st.comic = B.newComic();
    const c = st.comic;
    let sel = { p: 0, c: 0 };
    const W = 360, H = 300;
    const paint = (ctx, p, x0) => {
      ctx.save(); ctx.translate(x0, 0);
      const sky = { by: '#bae6fd', skov: '#bbf7d0', strand: '#fde68a', rummet: '#1e1b4b', skole: '#e9d5ff', nat: '#1e293b' }[p.scene] || '#e2e8f0';
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H); ctx.fillStyle = p.scene === 'rummet' || p.scene === 'nat' ? '#334155' : '#86efac'; ctx.fillRect(0, H - 50, W, 50);
      ctx.font = '40px system-ui'; ctx.textAlign = 'center'; (B.SCENES[p.scene] || []).forEach((e, i) => ctx.fillText(e, 60 + i * 120, H - 70 - (i % 2) * 30));
      p.chars.forEach((ch, i) => {
        const cx = i ? W - 90 : 90; ctx.font = '86px system-ui'; ctx.fillText(ch.e, cx, H - 26);
        if (ch.text) { const lines = B.wrapText(ch.text, 16).slice(0, 4); ctx.font = '600 15px system-ui'; const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20, bh = lines.length * 19 + 14, bx = Math.max(6, Math.min(W - bw - 6, cx - bw / 2)), by = 14 + i * 18;
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx - 8, by + bh); ctx.lineTo(cx, by + bh + 16); ctx.lineTo(cx + 8, by + bh); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#111827'; lines.forEach((l, k) => ctx.fillText(l, bx + bw / 2, by + 22 + k * 19)); }
      });
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4); ctx.restore();
    };
    function draw() {
      const p = c.panels[sel.p], ch = p.chars[sel.c];
      const canvas = h('canvas', { class: 'tsr-canvas', width: W * 3 + 40, height: H + 60, 'aria-label': 'Tegneserien' }), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#111827'; ctx.font = '800 26px system-ui'; ctx.textAlign = 'left'; ctx.fillText(c.title, 12, 36);
      ctx.save(); ctx.translate(10, 50); c.panels.forEach((pp, i) => paint(ctx, pp, i * (W + 10))); ctx.restore();
      canvas.addEventListener('click', (e) => { const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * canvas.width / r.width - 10, i = Math.floor(x / (W + 10)); if (i >= 0 && i < 3) { const lx = x - i * (W + 10); sel = { p: i, c: lx > W / 2 ? 1 : 0 }; draw(); } });
      const text = h('input', { class: 'input', maxlength: 70, value: ch.text, placeholder: 'Hvad siger figuren?', 'aria-label': 'Taleboble' });
      text.addEventListener('input', () => { ch.text = text.value; store.save(); const cv = root.querySelector('.tsr-canvas'); if (cv) { const cx = cv.getContext('2d'); cx.save(); cx.translate(10, 50); paint(cx, p, sel.p * (W + 10)); cx.restore(); } });
      const title = h('input', { class: 'input', maxlength: 40, value: c.title, 'aria-label': 'Titel på tegneserien', style: { maxWidth: '280px' } });
      title.addEventListener('change', () => { c.title = title.value.trim() || 'Min tegneserie'; store.save(); draw(); });
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, title, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-sm', onclick: async () => { if (await confirmDialog({ title: 'Start forfra?', confirmLabel: 'Ryd', danger: true })) { Object.assign(c, B.newComic()); store.save(); sel = { p: 0, c: 0 }; draw(); } } }, icon('refresh'), 'Ny'),
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `${c.title || 'tegneserie'}.png`; a.click(); } }, icon('download'), 'Gem billede')),
        h('div', { class: 'tsr-wrap' }, canvas),
        h('div', { class: 'tsr-edit' },
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, h('b', null, `Rude ${sel.p + 1}`), segmented([0, 1, 2].map(i => ({ value: String(i), label: String(i + 1) })), String(sel.p), (v) => { sel = { p: Number(v), c: 0 }; draw(); }, { label: 'Rude' }),
            h('span', { class: 'faint' }, 'Baggrund'), segmented(Object.keys(B.SCENES).map(k => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })), p.scene, (v) => { p.scene = v; store.save(); draw(); }, { label: 'Baggrund' })),
          h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, segmented([{ value: '0', label: 'Figur til venstre' }, { value: '1', label: 'Figur til højre' }], String(sel.c), (v) => { sel.c = Number(v); draw(); }, { label: 'Figur' })),
          h('div', { class: 'tsr-chars' }, B.CHARACTERS.map(e => h('button', { class: ['tsr-char', ch.e === e && 'is-on'], 'aria-label': `Figur ${e}`, onclick: () => { ch.e = e; store.save(); draw(); } }, e))),
          text));
    }
    draw();
    return page('comic', 'Kreativ', 'Tegneserie', 'Lav din egen tegneserie i tre ruder: vælg baggrund og figurer, skriv hvad de siger – og gem den som billede.', root);
  },
};

// ── Emojigåder ──
export const emojiquiz = {
  title: 'Emojigåder',
  async render() {
    let store;
    try { store = await appState('emojiquiz', { right: 0, streak: 0, best: 0, solved: {} }); } catch (e) { return loadError('Emojigåder', e); }
    const st = store.data, root = h('div');
    let q, answered, hint = 0;
    const next = () => { const pool = B.EMOJI_PUZZLES.filter(p => !st.solved[p[1]]); const src = pool.length ? pool : B.EMOJI_PUZZLES; q = src[Math.floor(Math.random() * src.length)]; answered = null; hint = 0; draw(); };
    function draw() {
      const input = h('input', { class: 'input l3-typed', 'aria-label': 'Dit gæt', autocomplete: 'off', disabled: !!answered, placeholder: `${q[1].length} bogstaver` });
      const check = () => { if (!input.value.trim()) return; const ok = B.emojiMatch(q[1], input.value); if (!ok && !answered) { input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); st.streak = 0; store.save(); return; } answered = { ok }; mark(st, ok, store); st.solved[q[1]] = true; store.save(); draw(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (answered) next(); else check(); } });
      h(clear(root), null, h('div', { class: 'l3-card' }, score(st),
        h('div', { class: 'eq-emoji' }, q[0]),
        h('p', { class: 'l3-ask' }, 'Hvilket ord gemmer sig her?'),
        hint ? h('div', { class: 'eq-hint' }, [...q[1]].map((ch, i) => h('span', null, i < hint ? ch.toUpperCase() : '_'))) : null,
        h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, input, answered ? null : h('button', { class: 'btn btn-primary', onclick: check }, 'Gæt'),
          answered ? null : h('button', { class: 'btn', disabled: hint >= q[1].length - 1, onclick: () => { hint++; draw(); } }, 'Hint'), answered ? null : h('button', { class: 'btn btn-ghost', onclick: () => { answered = { ok: false }; mark(st, false, store); draw(); } }, 'Giv op')),
        answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Det var ', h('b', null, q[1])) : null,
        answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null,
        h('span', { class: 'faint', style: { fontSize: '13px' } }, `${Object.keys(st.solved).length} af ${B.EMOJI_PUZZLES.length} gåder klaret`)));
      if (!answered) setTimeout(() => input.isConnected && input.focus(), 0);
    }
    next();
    return page('emojiquiz', 'Spilhal', 'Emojigåder', 'Hvilket ord gemmer sig i emojierne? ☀️ + 🌻 = …? Gæt ordet – og brug et hint, hvis du sidder fast.', root);
  },
};

// ── Puslespil ──
export const jigsaw = {
  title: 'Puslespil',
  async render() {
    let store;
    try { store = await appState('jigsaw', { n: 3, img: null, best: {} }); } catch (e) { return loadError('Puslespil', e); }
    const st = store.data, root = h('div');
    let tiles, sel = null, moves = 0, src = st.img;
    const art = () => { const c = document.createElement('canvas'); c.width = c.height = 480; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 480, 480); const hue = Math.floor(Math.random() * 360); g.addColorStop(0, `hsl(${hue},80%,60%)`); g.addColorStop(1, `hsl(${(hue + 120) % 360},80%,45%)`); x.fillStyle = g; x.fillRect(0, 0, 480, 480);
      for (let i = 0; i < 14; i++) { x.fillStyle = `hsla(${(hue + i * 40) % 360},90%,${50 + (i % 3) * 12}%,.85)`; x.beginPath(); x.arc(Math.random() * 480, Math.random() * 480, 20 + Math.random() * 70, 0, Math.PI * 2); x.fill(); }
      x.font = '160px system-ui'; x.textAlign = 'center'; x.fillText(['🦊', '🐢', '🚀', '🌻', '🐳', '🦄'][Math.floor(Math.random() * 6)], 240, 300); return c.toDataURL('image/jpeg', 0.85); };
    const start = () => { if (!src) src = art(); tiles = B.jigsaw(st.n); moves = 0; sel = null; draw(); };
    function draw() {
      const n = st.n, done = B.jigsawDone(tiles);
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: '3', label: '9 brikker' }, { value: '4', label: '16 brikker' }, { value: '5', label: '25 brikker' }], String(n), (v) => { st.n = Number(v); store.save(); start(); }, { label: 'Antal brikker' }),
          h('button', { class: 'btn btn-sm', onclick: () => { src = art(); st.img = null; store.save(); start(); } }, icon('sparkles'), 'Nyt billede'),
          h('label', { class: 'btn btn-sm' }, icon('image'), 'Brug dit eget billede', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => { const c = document.createElement('canvas'), s = Math.min(img.width, img.height); c.width = c.height = 480; c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 480, 480); src = c.toDataURL('image/jpeg', 0.8); try { st.img = src.length < 400000 ? src : null; store.save(); } catch { /* */ } start(); }; img.src = URL.createObjectURL(f); } }))),
        h('div', { class: 'l3-card' },
          h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(moves)), ' byt'), st.best[n] ? h('span', { class: 'faint' }, `bedste ${st.best[n]}`) : null),
          h('div', { class: ['jg-grid', done && 'is-done'], style: { '--n': n } }, tiles.map((t, i) => h('button', { class: ['jg-tile', sel === i && 'is-sel', t === i && 'is-right'], 'aria-label': `Brik ${i + 1}`, style: { backgroundImage: `url(${src})`, backgroundSize: `${n * 100}% ${n * 100}%`, backgroundPosition: `${(t % n) / (n - 1) * 100}% ${Math.floor(t / n) / (n - 1) * 100}%` }, disabled: done,
            onclick: () => { if (sel == null) { sel = i; draw(); return; } if (sel !== i) { tiles = B.jigsawSwap(tiles, sel, i); moves++; if (B.jigsawDone(tiles)) { if (!st.best[n] || moves < st.best[n]) st.best[n] = moves; store.save(); toast(`Puslespillet er lagt på ${moves} byt! 🧩`, { type: 'xp' }); } } sel = null; draw(); } }))),
          done ? h('button', { class: 'btn btn-primary', onclick: start }, 'Bland igen', icon('refresh')) : h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, 'Tryk på to brikker for at bytte dem. Brikker på den rigtige plads får en grøn kant.')),
        h('details', { class: 'panel', style: { padding: '10px 14px' } }, h('summary', null, 'Se det færdige billede'), h('img', { src, alt: 'Det færdige billede', style: { width: '160px', borderRadius: '10px', marginTop: '8px' } })));
    }
    start();
    return page('jigsaw', 'Spilhal', 'Puslespil', 'Byt brikkerne, til billedet er helt. Brug et af HUBTECHs billeder – eller dit eget foto.', root);
  },
};

// ── Dagens plan ──
export const dayplan = {
  title: 'Dagens plan',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('dayplan', { items: B.DEFAULT_PLAN.map(x => x.slice()), done: {} }); } catch (e) { return loadError('Dagens plan', e); }
    const st = store.data, self = this, root = h('div');
    let edit = false;
    const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const today = () => new Date().toDateString();
    function draw() {
      st.items.sort((a, b) => a[0].localeCompare(b[0]));
      const now = B.nowIndex(st.items, hhmm()), done = st.done[today()] || [];
      if (edit) {
        const rows = st.items.map((it, i) => { const t = h('input', { class: 'input', type: 'time', value: it[0], 'aria-label': `Tid ${i + 1}`, style: { width: '110px' } }), x = h('input', { class: 'input', value: it[2], maxlength: 30, 'aria-label': `Hvad ${i + 1}` });
          t.addEventListener('change', () => { it[0] = t.value; store.save(); }); x.addEventListener('input', () => { it[2] = x.value; store.save(); });
          return h('div', { class: 'dp2-edit' }, t, h('select', { class: 'input', 'aria-label': `Billede ${i + 1}`, style: { width: '70px' }, onchange: (e) => { it[1] = e.target.value; store.save(); } }, B.PLAN_ICONS.map(ic => h('option', { value: ic, selected: ic === it[1] }, ic))), x, h('button', { class: 'icon-btn', 'aria-label': 'Fjern', onclick: () => { st.items.splice(i, 1); store.save(); draw(); } }, icon('x'))); });
        h(clear(root), null, panel('Ret planen', 'edit', h('div', { class: 'stack', style: { gap: '6px' } }, rows), h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', onclick: () => { st.items.push(['12:00', '⭐', 'Noget nyt']); store.save(); draw(); } }, icon('plus'), 'Tilføj'), h('button', { class: 'btn btn-primary', onclick: () => { edit = false; draw(); } }, icon('check'), 'Færdig'))));
        return;
      }
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, h('b', { class: 'dp2-clock' }, hhmm()), h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-sm', onclick: () => { edit = true; draw(); } }, icon('edit'), 'Ret planen')),
        h('ol', { class: 'dp2-list' }, st.items.map((it, i) => h('li', { class: ['dp2-item', i === now && 'is-now', i < now && 'is-past', done.includes(i) && 'is-done'] },
          h('span', { class: 'dp2-time' }, it[0]), h('span', { class: 'dp2-icon' }, it[1]), h('b', null, it[2]), i === now ? h('span', { class: 'chip chip-info' }, 'Nu') : null,
          h('button', { class: ['dp2-check', done.includes(i) && 'on'], 'aria-label': `Færdig: ${it[2]}`, 'aria-pressed': String(done.includes(i)), onclick: () => { const d = st.done[today()] = (st.done[today()] || []); d.includes(i) ? d.splice(d.indexOf(i), 1) : d.push(i); for (const k of Object.keys(st.done)) if (k !== today()) delete st.done[k]; store.save(); draw(); } }, done.includes(i) ? '✓' : '')))));
      setTimeout(() => root.querySelector('.dp2-item.is-now')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
    clearInterval(this._iv); this._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); if (!edit) draw(); }, 60000);
    draw();
    return page('dayplan', 'Hjemme', 'Dagens plan', 'Et overskueligt dagsskema med billeder – så alle kan se, hvad der sker nu, og hvad der kommer bagefter. Godt for børn, der har brug for overblik.', root);
  },
};

// ── Talhukommelse ──
export const digitspan = {
  title: 'Talhukommelse',
  destroy() { clearTimeout(this._t); },
  async render() {
    let store;
    try { store = await appState('digitspan', { best: 0 }); } catch (e) { return loadError('Talhukommelse', e); }
    const st = store.data, self = this, root = h('div'), lbEl = h('div');
    const loadLb = () => api.get('/api/games/boards/digitspan').then(r => h(clear(lbEl), null, boardTable(r.board || r, { unit: 'cifre' }))).catch(() => {});
    let n = 3, cur = '', phase = 'start';
    const show = () => { cur = B.digits(n); phase = 'show'; draw(); clearTimeout(self._t); self._t = setTimeout(() => { phase = 'type'; draw(); }, B.showMs(n)); };
    function draw() {
      let body;
      if (phase === 'start') body = [h('span', { class: 'qz-big' }, '🔢'), h('p', { class: 'l3-ask' }, 'Et tal vises kort. Skriv det bagefter.', h('b', null, 'Hvor mange cifre kan du huske?')), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { n = 3; show(); } }, icon('play'), 'Start'), st.best ? h('span', { class: 'faint' }, `Din rekord er ${st.best} cifre`) : null];
      else if (phase === 'show') body = [h('p', { class: 'l3-ask' }, `${n} cifre`), h('div', { class: 'ds-num' }, cur), h('div', { class: 'ds-timer', style: { animationDuration: `${B.showMs(n)}ms` } })];
      else if (phase === 'type') { const inp = h('input', { class: 'input l3-typed ds-in', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Tallet' }); const go = () => { if (inp.value.trim() === cur) { if (n > st.best) { st.best = n; store.save(); } n++; show(); } else { phase = 'over'; submitScore('digitspan', n - 1); setTimeout(loadLb, 600); draw(); } }; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); setTimeout(() => inp.focus(), 0); body = [h('p', { class: 'l3-ask' }, 'Hvad var tallet?'), h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, inp, h('button', { class: 'btn btn-primary', onclick: go }, 'OK'))]; }
      else body = [h('p', { class: 'l3-ask' }, `Tallet var ${cur}`, h('b', null, `Du huskede ${n - 1} cifre`)), h('span', { class: 'faint' }, 'De fleste voksne kan huske 7 cifre, plus eller minus 2.'), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { n = 3; show(); } }, icon('refresh'), 'Igen')];
      h(clear(root), null, h('div', { class: 'l3-card km-card' }, body), panel('Topliste', 'award', lbEl));
    }
    draw(); loadLb();
    return page('digitspan', 'Spilhal', 'Talhukommelse', 'Et tal blinker kort på skærmen – kan du huske det? For hver runde bliver tallet ét ciffer længere.', root);
  },
};

// ── Ordsprog ──
export const proverbs = {
  title: 'Ordsprog',
  async render() {
    let store;
    try { store = await appState('proverbs', { right: 0, streak: 0, best: 0 }); } catch (e) { return loadError('Ordsprog', e); }
    const st = store.data, root = h('div');
    let q, answered;
    const next = () => { q = B.proverbQ(); answered = null; draw(); };
    function draw() {
      h(clear(root), null, h('div', { class: 'l3-card' }, score(st),
        h('p', { class: 'l3-ask' }, 'Hvordan slutter ordsproget?', h('b', null, `“${q.p[0]} …”`)),
        h('div', { class: 'l3-opts', style: { gridTemplateColumns: '1fr' } }, q.options.map(o => h('button', { class: ['l3-opt', answered && o === q.p[1] && 'ok', answered && answered.v === o && o !== q.p[1] && 'bad'], disabled: !!answered, onclick: () => { answered = { v: o }; mark(st, o === q.p[1], store); draw(); } }, `… ${o}`))),
        answered ? h('div', { class: ['l3-fb', answered.v === q.p[1] ? 'ok' : 'bad'] }, h('b', null, `${q.p[0]} ${q.p[1]}. `), h('span', { class: 'faint' }, `Det betyder: ${q.p[2]}`)) : null,
        answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
    }
    next();
    return page('proverbs', 'Lær', 'Ordsprog', 'Kender du de gamle danske ordsprog? Gæt slutningen – og lær, hvad de betyder.', root);
  },
};
