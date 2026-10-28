/** Gloser, Robotvej, Solsystemet, Køleskabet, Opsparing, Kassemand, Juveler og Rumforsvar (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';
import * as B from '../features/batch8.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const lbPanel = (game, unit) => { const el = h('div'); const load = () => api.get(`/api/games/boards/${game}`).then(r => h(clear(el), null, boardTable(r.board || r, { unit }))).catch(() => {}); load(); return { el: panel('Topliste', 'award', el), reload: load }; };
const kr = (n) => `${Math.round(n).toLocaleString('da-DK')} kr.`;
const say = (t, lang) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = lang; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* */ } };

// ── Gloser ──
export const vocab = {
  title: 'Gloser',
  async render() {
    let store;
    try { store = await appState('vocab', { set: 'en-dyr', dir: 'da', progress: {}, own: [], streak: 0, right: 0 }); } catch (e) { return loadError('Gloser', e); }
    const st = store.data, root = h('div');
    const sets = () => ({ ...B.VOCAB, ...(st.own.length ? { own: { lang: 'Egne', name: 'Mine gloser', words: st.own } } : {}) });
    let queue = [], cur = null, answered = null;
    const set = () => sets()[st.set] || B.VOCAB['en-dyr'];
    const prog = () => (st.progress[st.set] ||= {});
    const next = () => { if (!queue.length) queue = B.dueCards(set().words, prog()); cur = queue.shift() || null; answered = null; draw(); };
    const langCode = () => (set().lang === 'Tysk' ? 'de-DE' : 'en-GB');
    function draw() {
      const s = set(), p = prog(), learned = s.words.filter((_, i) => (p[i]?.box || 0) >= 3).length;
      const ask = cur ? (st.dir === 'da' ? cur.w[0] : cur.w[1]) : null, want = cur ? (st.dir === 'da' ? cur.w[1] : cur.w[0]) : null;
      const input = h('input', { class: 'input l3-typed', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: st.dir === 'da' ? `På ${s.lang.toLowerCase()} …` : 'På dansk …', 'aria-label': 'Dit svar', disabled: !!answered });
      const check = () => { if (!input.value.trim()) return; const ok = B.vocabMatch(want, input.value); p[cur.i] = B.review(p[cur.i], ok); if (ok) { st.right++; st.streak++; } else { st.streak = 0; queue.push(cur); } answered = { ok, v: input.value }; store.save(); draw(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (answered) next(); else check(); } });
      const own = h('textarea', { class: 'textarea', rows: 6, 'aria-label': 'Egne gloser', placeholder: 'Én glose pr. linje: dansk = fremmedsprog\nhund = dog\nat løbe = to run' }, st.own.map(w => `${w[0]} = ${w[1]}`).join('\n'));
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Glosesæt', onchange: (e) => { st.set = e.target.value; store.save(); queue = []; next(); } },
          Object.entries(sets()).map(([k, v]) => h('option', { value: k, selected: k === st.set }, `${v.lang}: ${v.name}`))),
          segmented([{ value: 'da', label: 'Dansk → fremmed' }, { value: 'fo', label: 'Fremmed → dansk' }], st.dir, (v) => { st.dir = v; store.save(); queue = []; next(); }, { label: 'Retning' })),
        h('div', { class: 'l3-card' },
          h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(learned)), ` af ${s.words.length} lært`), h('span', null, h('b', null, String(st.streak)), ' i træk')),
          h('div', { class: 'vc-boxes', 'aria-label': 'Kasser' }, B.BOX_DAYS.map((_, b) => h('span', { class: 'vc-box', title: `Kasse ${b + 1}` }, h('b', null, String(s.words.filter((_, i) => (p[i]?.box || 0) === b).length)), h('small', null, b === 0 ? 'ny' : `${B.BOX_DAYS[b]} d`)))),
          cur ? [h('p', { class: 'l3-ask' }, st.dir === 'da' ? `Hvad hedder det på ${s.lang.toLowerCase()}?` : 'Hvad betyder det?', h('b', null, ask)),
            h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, answered ? null : h('button', { class: 'btn btn-primary', onclick: check }, 'Tjek')),
            answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Det hedder ', h('b', null, want), s.lang !== 'Egne' ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Hør udtalen', style: { marginLeft: '6px' }, onclick: () => say(cur.w[1], langCode()) }, icon('volume')) : null) : null,
            answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null]
            : [h('span', { class: 'qz-big' }, '🎉'), h('p', { class: 'l3-ask' }, 'Du er færdig for nu!', h('b', null, 'Kom igen i morgen')), h('span', { class: 'faint' }, 'Gloserne kommer igen, når det er tid til at øve dem – jo bedre du kan dem, jo længere går der.'),
              h('button', { class: 'btn', onclick: () => { queue = s.words.map((w, i) => ({ w, i, p: p[i] })).sort(() => Math.random() - 0.5).slice(0, 10); next(); } }, 'Øv alligevel')]),
        panel('Mine gloser', 'edit', h('p', { class: 'faint', style: { fontSize: '13px', margin: '0 0 6px' } }, 'Skriv ugens gloser fra skolen – så øver du dem på samme måde.'), own,
          h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: () => { st.own = own.value.split('\n').map(l => l.split(/\s*[=:–-]\s*/)).filter(x => x.length >= 2 && x[0].trim() && x[1].trim()).map(x => [x[0].trim().slice(0, 60), x.slice(1).join(' ').trim().slice(0, 60)]).slice(0, 200); st.progress.own = {}; st.set = st.own.length ? 'own' : 'en-dyr'; store.save(); queue = []; toast(`${st.own.length} gloser gemt`, { type: 'ok' }); next(); } }, icon('check'), 'Gem og øv'))));
      if (cur && !answered) setTimeout(() => input.isConnected && input.focus(), 0);
      if (answered) setTimeout(() => root.querySelector('.l3-next')?.focus(), 0);
    }
    next();
    return page('vocab', 'Lær', 'Gloser', 'Lær engelske og tyske gloser med huskekasser: de ord du kan, kommer sjældnere – dem du glemmer, kommer igen. Du kan også skrive dine egne.', root);
  },
};

// ── Robotvej ──
const OPS = { fwd: ['▲', 'Frem'], left: ['↶', 'Drej til venstre'], right: ['↷', 'Drej til højre'] };
export const robot = {
  title: 'Robotvej',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('robot', { level: 0, done: {} }); } catch (e) { return loadError('Robotvej', e); }
    const st = store.data, self = this, root = h('div');
    let prog = [], target = null, run = null, frame = 0;
    const lv = () => B.ROBOT_LEVELS[st.level];
    const listAt = (path) => path.reduce((l, k) => l[k].body, prog);
    const add = (ins) => { if (B.programSize(prog) >= lv().max) return toast(`Programmet må højst have ${lv().max} brikker`, { type: 'warn', ms: 1500 }); (target ? listAt(target) : prog).push(ins); run = null; draw(); };
    const play = () => {
      run = B.runRobot(lv(), prog); frame = 0; clearInterval(self._iv);
      self._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); frame++; drawBoard(); if (frame >= run.steps.length - 1) { clearInterval(self._iv); finish(); } }, 320);
    };
    const finish = () => {
      if (run.won) { st.done[st.level] = Math.min(st.done[st.level] || 99, B.programSize(prog)); store.save(); toast(st.level < B.ROBOT_LEVELS.length - 1 ? 'Robotten nåede målet! 🤖' : 'Du har klaret alle baner! 🏆', { type: 'xp' }); }
      draw();
    };
    let boardEl;
    function drawBoard() {
      const L = lv(), P = B.parseLevel(L), s = run ? run.steps[Math.min(frame, run.steps.length - 1)] : { x: P.start[0], y: P.start[1], dir: 1 };
      const visited = new Set(run ? run.steps.slice(0, frame + 1).map(p => `${p.x},${p.y}`) : []);
      h(clear(boardEl), null, L.map.flatMap((row, y) => [...row].map((ch, x) => h('span', { class: ['rb-cell', ch === '#' && 'wall', visited.has(`${x},${y}`) && 'trail'] },
        ch === 'G' ? h('i', { class: 'rb-goal' }, '🏁') : ch === '*' && !(run && run.steps.slice(0, frame + 1).some(p => p.x === x && p.y === y)) ? h('i', null, '⭐') : null,
        s.x === x && s.y === y ? h('i', { class: ['rb-bot', s.crash && 'crash'], style: { transform: `rotate(${s.dir * 90}deg)` } }, '➤') : null))));
      boardEl.style.gridTemplateColumns = `repeat(${L.map[0].length}, 1fr)`;
    }
    function block(list, path) {
      return h('div', { class: ['rb-prog', target && path.join() === target.join() && 'is-target'] }, list.length ? list.map((ins, i) => ins.op === 'repeat'
        ? h('div', { class: 'rb-rep' }, h('div', { class: 'rb-rep-h' }, h('span', null, 'Gentag'), h('select', { class: 'rb-n', 'aria-label': 'Antal gange', onchange: (e) => { ins.n = Number(e.target.value); run = null; } }, [2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => h('option', { value: n, selected: n === ins.n }, `${n}×`))),
          h('button', { class: ['btn btn-sm', target && [...path, i].join() === target.join() && 'btn-primary'], onclick: () => { target = target && [...path, i].join() === target.join() ? null : [...path, i]; draw(); } }, target && [...path, i].join() === target.join() ? 'Færdig' : 'Læg i'),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern gentag', onclick: () => { list.splice(i, 1); target = null; run = null; draw(); } }, icon('x'))), block(ins.body, [...path, i]))
        : h('button', { class: 'rb-ins', title: `${OPS[ins.op][1]} – klik for at fjerne`, onclick: () => { list.splice(i, 1); run = null; draw(); } }, OPS[ins.op][0])) : h('span', { class: 'faint', style: { fontSize: '13px' } }, path.length ? 'Tom – læg brikker i' : 'Tryk på brikkerne herunder for at bygge et program'));
    }
    function draw() {
      const L = lv(), size = B.programSize(prog);
      boardEl = h('div', { class: 'rb-board' });
      h(clear(root), null,
        h('div', { class: 'ng-picks' }, B.ROBOT_LEVELS.map((x, i) => h('button', { class: ['sh-tag', i === st.level && 'is-on'], disabled: i > 0 && st.done[i - 1] == null && st.done[i] == null && i !== st.level, onclick: () => { st.level = i; prog = []; target = null; run = null; store.save(); draw(); } }, st.done[i] != null ? `✓ ${i + 1}` : String(i + 1)))),
        h('div', { class: 'rb-wrap' },
          h('div', { class: 'stack' }, h('b', null, `Bane ${st.level + 1}: ${L.name}`), boardEl, L.hint ? h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, L.hint) : null),
          h('div', { class: 'stack' },
            h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('b', null, 'Program'), h('span', { class: ['faint', size >= L.max && 'bad'] }, `${size} / ${L.max} brikker`)),
            block(prog, []),
            h('div', { class: 'rb-palette' }, Object.entries(OPS).map(([op, [sym, label]]) => h('button', { class: 'rb-ins', 'aria-label': label, title: label, onclick: () => add({ op }) }, sym)),
              h('button', { class: 'btn btn-sm', onclick: () => add({ op: 'repeat', n: 2, body: [] }) }, '⟳ Gentag')),
            h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn btn-primary', disabled: !prog.length, onclick: play }, icon('play'), 'Kør'), h('button', { class: 'btn', onclick: () => { prog = []; target = null; run = null; clearInterval(self._iv); draw(); } }, icon('refresh'), 'Ryd')),
            run && frame >= run.steps.length - 1 ? h('div', { class: ['l3-fb', run.won ? 'ok' : 'bad'] }, run.won ? 'Målet er nået! ' : run.crash ? 'Av – robotten kørte ind i en mur. ' : !run.atGoal ? 'Robotten nåede ikke målet. ' : `Du mangler ${run.total - run.stars} stjerne(r). `,
              run.won && st.level < B.ROBOT_LEVELS.length - 1 ? h('button', { class: 'btn btn-sm btn-primary', style: { marginLeft: '8px' }, onclick: () => { st.level++; prog = []; target = null; run = null; store.save(); draw(); } }, 'Næste bane') : null) : null)));
      drawBoard();
    }
    draw();
    return page('robot', 'Lær', 'Robotvej', 'Lær at programmere: byg et program af brikker, der får robotten frem til flaget. Brug “gentag” for at gøre programmet kort – sådan tænker en programmør.', root);
  },
};

// ── Solsystemet ──
export const solar = {
  title: 'Solsystemet',
  destroy() { cancelAnimationFrame(this._raf); },
  async render() {
    let store;
    try { store = await appState('solar', { age: 12, pick: 2 }); } catch (e) { return loadError('Solsystemet', e); }
    const st = store.data, self = this, root = h('div');
    const S = 520, canvas = h('canvas', { class: 'so-canvas', width: S, height: S, 'aria-label': 'Planeterne i kredsløb om solen' }), ctx = canvas.getContext('2d');
    const t0 = performance.now();
    const loop = () => {
      if (!document.body.contains(canvas)) return;
      const t = (performance.now() - t0) / 1000; ctx.clearRect(0, 0, S, S); ctx.save(); ctx.translate(S / 2, S / 2);
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 26); g.addColorStop(0, '#fff7cc'); g.addColorStop(1, '#f59e0b'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      B.PLANETS.forEach((p, i) => { const r = 34 + i * 28, a = t * (2 * Math.PI) / (p.days / 60) + i; ctx.strokeStyle = i === st.pick ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        const sz = Math.max(3, Math.min(11, Math.sqrt(p.km) / 30)); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, sz, 0, Math.PI * 2); ctx.fill();
        if (p.name === 'Saturn') { ctx.strokeStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, sz + 5, 3, 0.4, 0, Math.PI * 2); ctx.stroke(); }
        if (i === st.pick) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, sz + 4, 0, Math.PI * 2); ctx.stroke(); } });
      ctx.restore(); self._raf = requestAnimationFrame(loop);
    };
    function draw() {
      const p = B.PLANETS[st.pick], ageIn = h('input', { class: 'input', type: 'number', min: 1, max: 120, value: st.age, 'aria-label': 'Din alder', style: { width: '80px' } });
      ageIn.addEventListener('change', () => { st.age = Math.max(1, Math.min(120, Number(ageIn.value) || 12)); store.save(); draw(); });
      const earth = B.PLANETS[2], maxKm = Math.max(...B.PLANETS.map(x => x.km));
      h(clear(root), null,
        h('div', { class: 'so-wrap' }, h('div', { class: 'so-stage' }, canvas, h('div', { class: 'so-picks' }, B.PLANETS.map((x, i) => h('button', { class: ['sh-tag', i === st.pick && 'is-on'], onclick: () => { st.pick = i; store.save(); draw(); } }, x.name)))),
          h('div', { class: 'l3-card so-card', style: { justifyItems: 'stretch' } },
            h('div', { class: 'so-head' }, h('span', { class: 'so-ball', style: { background: p.color } }), h('div', null, h('h2', null, p.name), h('span', { class: 'faint' }, `Planet nr. ${st.pick + 1} fra solen`))),
            h('p', { style: { margin: 0 } }, p.fact),
            h('dl', { class: 'so-facts' },
              h('dt', null, 'Diameter'), h('dd', null, `${p.km.toLocaleString('da-DK')} km (${(p.km / earth.km).toLocaleString('da-DK', { maximumFractionDigits: 1 })} × Jorden)`),
              h('dt', null, 'Afstand til solen'), h('dd', null, `${p.au.toLocaleString('da-DK')} AE – lyset er ${B.lightMinutes(p.au).toLocaleString('da-DK')} min. om at nå frem`),
              h('dt', null, 'Et år'), h('dd', null, p.days < 1000 ? `${p.days} dage` : `${(p.days / 365.25).toLocaleString('da-DK', { maximumFractionDigits: 1 })} jordår`),
              h('dt', null, 'Måner'), h('dd', null, String(p.moons)), h('dt', null, 'Temperatur'), h('dd', null, p.temp)),
            h('div', { class: 'so-age' }, h('span', null, 'Er du'), ageIn, h('span', null, 'år på Jorden, er du'), h('b', null, `${B.planetAge(st.age, p).toLocaleString('da-DK')} år`), h('span', null, `på ${p.name}.`)))),
        panel('Størrelserne ved siden af hinanden', 'globe', h('div', { class: 'so-sizes' }, B.PLANETS.map(x => h('div', { class: 'so-size' }, h('span', { style: { width: `${Math.max(4, x.km / maxKm * 120)}px`, height: `${Math.max(4, x.km / maxKm * 120)}px`, background: x.color } }), h('small', null, x.name))))));
    }
    draw(); this._raf = requestAnimationFrame(loop);
    return page('solar', 'Lær', 'Solsystemet', 'Se planeterne kredse om solen, sammenlign deres størrelser, og regn ud hvor gammel du ville være på Mars eller Jupiter.', root);
  },
};

// ── Køleskabet ──
const FRIDGE_HINT = { mælk: 7, yoghurt: 10, ost: 21, skinke: 5, kylling: 2, hakket: 2, fisk: 1, æg: 21, smør: 30, salat: 5, agurk: 7, tomat: 7, brød: 4, juice: 7, pålæg: 5, rester: 3 };
export const fridge = {
  title: 'Køleskabet',
  async render() {
    let store;
    try { store = await appState('fridge', { items: [], saved: 0, wasted: 0 }); } catch (e) { return loadError('Køleskabet', e); }
    const st = store.data, root = h('div');
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    function draw() {
      const name = h('input', { class: 'input', maxlength: 40, placeholder: 'Fx mælk', 'aria-label': 'Vare', list: 'fr-hints' });
      const date = h('input', { class: 'input', type: 'date', 'aria-label': 'Holdbar til', value: iso(new Date(Date.now() + 5 * 86400000)) });
      name.addEventListener('input', () => { const k = Object.keys(FRIDGE_HINT).find(x => name.value.toLowerCase().startsWith(x)); if (k) date.value = iso(new Date(Date.now() + FRIDGE_HINT[k] * 86400000)); });
      const add = () => { if (!name.value.trim()) return name.focus(); st.items.push({ id: uid(), name: name.value.trim(), date: date.value || null, added: Date.now() }); store.save(); draw(); root.querySelector('input[aria-label="Vare"]')?.focus(); };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const list = st.items.map(i => ({ i, e: B.expiry(i) })).sort((a, b) => (a.e.days ?? 999) - (b.e.days ?? 999));
      const use = (i, eaten) => { st.items = st.items.filter(x => x !== i); if (eaten) st.saved++; else st.wasted++; store.save(); toast(eaten ? `${i.name} er brugt – godt!` : `${i.name} er smidt ud`, { type: eaten ? 'ok' : 'info', ms: 1500 }); draw(); };
      const urgent = list.filter(x => x.e.state === 'today' || x.e.state === 'old');
      h(clear(root), null,
        urgent.length ? h('div', { class: 'pl-alert fr2-alert' }, h('span', null, '⏰'), h('b', null, `Brug snart: ${urgent.map(x => x.i.name).join(', ')}`)) : null,
        panel('Læg i køleskabet', 'plus', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, name, h('datalist', { id: 'fr-hints' }, Object.keys(FRIDGE_HINT).map(k => h('option', { value: k[0].toUpperCase() + k.slice(1) }))), h('label', { class: 'ln-due' }, h('span', { class: 'faint' }, 'Holdbar til'), date), h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj'))),
        list.length ? h('ul', { class: 'fr2-list' }, list.map(({ i, e }) => h('li', { class: `fr2-item is-${e.state}` },
          h('span', { class: 'fr2-days' }, e.days == null ? '–' : e.days < 0 ? `${-e.days}` : String(e.days), h('small', null, e.days == null ? '' : e.days < 0 ? (e.days === -1 ? 'dag over' : 'dage over') : e.days === 1 ? 'dag' : 'dage')),
          h('div', { class: 'fr2-b' }, h('b', null, i.name), h('span', { class: 'faint' }, e.days == null ? 'Ingen dato' : e.days < 0 ? 'Overskredet – lugt og smag før du smider ud' : e.days === 0 ? 'Sidste dag i dag' : `Holdbar til ${new Date(`${i.date}T12:00`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}`)),
          h('button', { class: 'btn btn-sm', onclick: () => use(i, true) }, icon('check'), 'Brugt'), h('button', { class: 'icon-btn btn-sm', 'aria-label': `Smidt ud: ${i.name}`, title: 'Smidt ud', onclick: () => use(i, false) }, icon('trash'))))) : h('div', { class: 'sh-empty' }, h('span', { class: 'qz-big' }, '🧊'), h('b', null, 'Køleskabet er tomt'), h('span', { class: 'faint' }, 'Skriv hvad du har og hvornår det udløber – så kan du se, hvad der skal spises først, og smide mindre ud.')),
        st.saved + st.wasted ? h('p', { class: 'faint', style: { textAlign: 'center', fontSize: '13px' } }, `Du har brugt ${st.saved} ting og smidt ${st.wasted} ud – ${Math.round(st.saved / (st.saved + st.wasted) * 100)} % reddet fra skraldespanden.`) : null);
    }
    draw();
    return page('fridge', 'Hjemme', 'Køleskabet', 'Hold øje med datoerne i køleskabet: se hvad der skal spises først, og smid mindre mad ud.', root);
  },
};

// ── Opsparing ──
export const savings = {
  title: 'Opsparing',
  async render() {
    let store;
    try { store = await appState('savings', { start: 1000, monthly: 200, rate: 3, years: 10 }); } catch (e) { return loadError('Opsparing', e); }
    const st = store.data, root = h('div');
    function draw() {
      const field = (k, label, opts) => { const el = h('input', { class: 'input', type: 'number', value: st[k], 'aria-label': label, ...opts }); el.addEventListener('input', () => { st[k] = Math.max(0, Number(el.value) || 0); store.save(); calc(); }); return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el); };
      const out = h('div');
      const calc = () => {
        const r = B.savings({ ...st, years: Math.min(60, st.years) }), max = Math.max(1, ...r.rows.map(x => x.balance));
        h(clear(out), null,
          h('div', { class: 'os-big' }, h('span', { class: 'faint' }, `Efter ${st.years} år har du`), h('b', null, kr(r.balance)), h('span', null, `Du har selv sat ${kr(r.paid)} ind – renterne har givet `, h('b', { class: 'ok' }, kr(r.interest)))),
          r.rows.length ? h('div', { class: 'os-chart', role: 'img', 'aria-label': 'Opsparingen år for år' }, r.rows.map(x => h('div', { class: 'os-col', title: `År ${x.year}: ${kr(x.balance)}` }, h('i', { class: 'os-int', style: { height: `${x.interest / max * 100}%` } }), h('i', { class: 'os-paid', style: { height: `${x.paid / max * 100}%` } }), r.rows.length <= 20 || x.year % 5 === 0 ? h('small', null, String(x.year)) : null))) : null,
          h('div', { class: 'os-legend' }, h('span', null, h('i', { class: 'os-paid' }), 'Det du har sat ind'), h('span', null, h('i', { class: 'os-int' }), 'Renter')),
          h('p', { class: 'faint', style: { fontSize: '12px' } }, 'Regnestykket er et eksempel med samme rente hele vejen og renter tilskrevet hver måned. Det er ikke økonomisk rådgivning.'));
      };
      h(clear(root), null, h('div', { class: 'os-wrap' },
        h('div', { class: 'l3-card', style: { justifyItems: 'stretch', alignContent: 'start' } }, field('start', 'Startbeløb (kr.)', { min: 0 }), field('monthly', 'Sparer hver måned (kr.)', { min: 0 }), field('rate', 'Rente pr. år (%)', { min: 0, max: 30, step: 0.1 }), field('years', 'Antal år', { min: 1, max: 60 })),
        h('div', { class: 'l3-card', style: { justifyItems: 'stretch' } }, out)));
      calc();
    }
    draw();
    return page('savings', 'Værktøjer', 'Opsparing', 'Se hvad der sker, når man sparer op hver måned – og hvordan renter på renter får pengene til at vokse over tid.', root);
  },
};

// ── Kassemand ──
export const sokoban = {
  title: 'Kassemand',
  destroy() { document.removeEventListener('keydown', this._k); },
  async render() {
    let store;
    try { store = await appState('sokoban', { level: 0, best: {} }); } catch (e) { return loadError('Kassemand', e); }
    const st = store.data, root = h('div');
    let s = B.sokoParse(B.SOKO[st.level]);
    const move = (dx, dy) => { if (B.sokoWon(s)) return; const n = B.sokoMove(s, dx, dy); if (!n) return; s = n; if (B.sokoWon(s)) { const b = st.best[st.level]; if (!b || s.moves < b) st.best[st.level] = s.moves; store.save(); toast(`Bane ${st.level + 1} klaret på ${s.moves} træk! 📦`, { type: 'xp' }); } draw(); };
    const go = (i) => { st.level = i; store.save(); s = B.sokoParse(B.SOKO[i]); draw(); };
    function draw() {
      const won = B.sokoWon(s);
      h(clear(root), null,
        h('div', { class: 'ng-picks' }, B.SOKO.map((_, i) => h('button', { class: ['sh-tag', i === st.level && 'is-on'], disabled: i > 0 && st.best[i - 1] == null && st.best[i] == null && i !== st.level, onclick: () => go(i) }, st.best[i] != null ? `✓ ${i + 1}` : String(i + 1)))),
        h('div', { class: 'l3-card' },
          h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(s.moves)), ' træk'), h('span', null, h('b', null, String(s.pushes)), ' skub'), st.best[st.level] ? h('span', { class: 'faint' }, `bedste ${st.best[st.level]}`) : null),
          h('div', { class: ['ks-grid', won && 'is-won'], style: { gridTemplateColumns: `repeat(${s.w}, var(--sk))` } }, s.cells.map((c, k) => h('span', { class: ['ks-cell', c === '#' ? 'wall' : 'floor', s.targets.includes(k) && 'target'] },
            s.boxes.includes(k) ? h('i', { class: ['ks-box', s.targets.includes(k) && 'on'] }) : s.player === k ? h('i', { class: 'ks-me' }) : null))),
          h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, h('button', { class: 'btn', disabled: !s.hist.length || won, onclick: () => { s = B.sokoUndo(s); draw(); } }, icon('undo'), 'Fortryd'), h('button', { class: 'btn', onclick: () => go(st.level) }, icon('refresh'), 'Forfra'),
            won && st.level < B.SOKO.length - 1 ? h('button', { class: 'btn btn-primary', onclick: () => go(st.level + 1) }, 'Næste bane', icon('play')) : null),
          h('div', { class: 'lb2-pad ks-pad' }, [['', 0, 0], ['▲', 0, -1], ['', 0, 0], ['◀', -1, 0], ['▼', 0, 1], ['▶', 1, 0]].map(([l, dx, dy]) => (l ? h('button', { class: 'bf-key', 'aria-label': { '▲': 'Op', '▼': 'Ned', '◀': 'Venstre', '▶': 'Højre' }[l], onclick: () => move(dx, dy) }, l) : h('span')))),
          h('p', { class: 'faint', style: { fontSize: '13px', margin: 0, textAlign: 'center' } }, 'Skub alle kasserne ind på de markerede felter. Du kan kun skubbe – ikke trække. Piletaster, WASD og Z for fortryd.')));
    }
    document.removeEventListener('keydown', this._k);
    this._k = (e) => { if (!document.body.contains(root) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return; const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[e.key]; if (m) { e.preventDefault(); move(...m); } if (e.key === 'z' || e.key === 'u') { s = B.sokoUndo(s); draw(); } };
    document.addEventListener('keydown', this._k);
    draw();
    return page('sokoban', 'Spilhal', 'Kassemand', 'Den klassiske lagergåde: skub kasserne på plads uden at køre fast. Otte baner, der bliver sværere og sværere.', root);
  },
};

// ── Juveler ──
const GEM = ['💎', '🔶', '🟢', '🟣', '❤️', '⭐'];
export const gems = {
  title: 'Juveler',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('gems', { best: 0 }); } catch (e) { return loadError('Juveler', e); }
    const st = store.data, self = this, root = h('div'), lb = lbPanel('gems', 'point'), N = 8;
    let board, score, moves, sel = null, busy = false, flash = new Set(), over = false;
    const reset = () => { do { board = B.gemBoard(N); } while (!B.hasMove(board, N)); score = 0; moves = 25; sel = null; over = false; draw(); };
    const cascade = async () => {
      let combo = 0;
      for (;;) { const m = B.findMatches(board, N); if (!m.length) break; combo++; flash = new Set(m); draw(); await new Promise(r => setTimeout(r, 260)); const r = B.collapse(board, N); board = r.board; score += r.removed * 10 * combo; flash = new Set(); draw(); await new Promise(r2 => setTimeout(r2, 120)); }
      if (combo > 1) toast(`Kæde × ${combo}!`, { type: 'xp', ms: 900 });
      if (!B.hasMove(board, N)) { do { board = B.gemBoard(N); } while (!B.hasMove(board, N)); toast('Ingen træk tilbage – brættet blandes', { type: 'info', ms: 1400 }); }
    };
    const click = async (i) => {
      if (busy || over) return;
      if (sel == null) { sel = i; draw(); return; }
      if (sel === i) { sel = null; draw(); return; }
      if (!B.adjacent(sel, i, N)) { sel = i; draw(); return; }
      const t = B.swap(board, sel, i);
      if (!B.findMatches(t, N).length) { const a = sel; sel = null; root.querySelector(`[data-i="${a}"]`)?.classList.add('shake'); root.querySelector(`[data-i="${i}"]`)?.classList.add('shake'); setTimeout(draw, 300); return; }
      busy = true; board = t; sel = null; moves--; await cascade(); busy = false;
      if (moves <= 0) { over = true; const best = score > st.best; if (best) { st.best = score; store.save(); } if (score) submitScore('gems', score); lb.reload(); }
      draw();
    };
    function draw() {
      h(clear(root), null, h('div', { class: 'l3-card' },
        h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(score)), ' point'), h('span', null, h('b', null, String(moves)), ' træk tilbage'), h('span', { class: 'faint' }, `rekord ${st.best}`)),
        h('div', { class: 'jw-grid', style: { '--n': N } }, board.map((g, i) => h('button', { class: ['jw-cell', sel === i && 'is-sel', flash.has(i) && 'is-pop'], 'data-i': i, 'aria-label': `Juvel ${i + 1}`, onclick: () => click(i) }, GEM[g]))),
        over ? h('div', { class: 'l3-fb ok' }, `Slut! ${score} point${score >= st.best ? ' – ny rekord!' : ''}`, h('button', { class: 'btn btn-primary btn-sm', style: { marginLeft: '10px' }, onclick: reset }, 'Spil igen'))
          : h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, 'Byt om på to juveler ved siden af hinanden, så der kommer tre eller flere ens på række. 25 træk.')), lb.el);
    }
    reset();
    return page('gems', 'Spilhal', 'Juveler', 'Byt juvelerne, så tre eller flere ens kommer på række – og få kædereaktioner for ekstra point. Hvor mange point får du på 25 træk?', root);
  },
};

// ── Rumforsvar ──
export const invaders = {
  title: 'Rumforsvar',
  destroy() { cancelAnimationFrame(this._raf); document.removeEventListener('keydown', this._k); document.removeEventListener('keyup', this._k); },
  async render() {
    let store;
    try { store = await appState('invaders', { best: 0 }); } catch (e) { return loadError('Rumforsvar', e); }
    const st = store.data, self = this, W = 640, H = 520, lb = lbPanel('invaders', 'point'), keys = {};
    const canvas = h('canvas', { class: 'jp-canvas iv-canvas', width: W, height: H, 'aria-label': 'Rumforsvar' }), ctx = canvas.getContext('2d'), msg = h('div', { class: 'bf-msg' });
    let x, shots, bombs, aliens, dir, speed, score, lives, wave, running = false, cool = 0, frame = 0, shields;
    const newWave = () => { aliens = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) aliens.push({ x: 60 + c * 54, y: 50 + r * 40, row: r, alive: true }); dir = 1; speed = 0.5 + wave * 0.25; };
    const reset = () => { x = W / 2; shots = []; bombs = []; score = 0; lives = 3; wave = 1; running = true; msg.hidden = true; shields = [0, 1, 2, 3].map(i => ({ x: 90 + i * 150, hp: 8 })); newWave(); };
    const over = () => { running = false; const best = score > st.best; if (best) { st.best = score; store.save(); } if (score) submitScore('invaders', score); lb.reload(); msg.hidden = false; h(clear(msg), null, h('b', null, lives <= 0 ? 'Jorden er faldet!' : 'Invasionen nåede ned!'), h('span', null, `${score} point${best ? ' – ny rekord!' : ''}`), h('button', { class: 'btn btn-primary btn-lg', onclick: reset }, icon('play'), 'Forsvar igen')); };
    const step = () => {
      if (!running) return; frame++;
      if (keys.ArrowLeft || keys.a) x -= 5; if (keys.ArrowRight || keys.d) x += 5; x = Math.max(24, Math.min(W - 24, x));
      if (cool > 0) cool--; if (keys[' '] && cool === 0) { shots.push({ x, y: H - 50 }); cool = 18; }
      for (const s of shots) s.y -= 8; shots = shots.filter(s => s.y > -10);
      const live = aliens.filter(a => a.alive); let edge = false;
      for (const a of live) { a.x += dir * speed * (1 + (36 - live.length) / 30); if (a.x < 20 || a.x > W - 20) edge = true; }
      if (edge) { dir = -dir; for (const a of live) a.y += 16; }
      if (frame % Math.max(18, 60 - wave * 6) === 0 && live.length) { const a = live[Math.floor(Math.random() * live.length)]; bombs.push({ x: a.x, y: a.y + 10 }); }
      for (const b of bombs) b.y += 3.5 + wave * 0.3;
      for (const s of shots) for (const a of live) if (a.alive && Math.abs(s.x - a.x) < 16 && Math.abs(s.y - a.y) < 12) { a.alive = false; s.y = -99; score += (4 - a.row) * 10; }
      for (const sh of shields) { if (sh.hp <= 0) continue; for (const b of bombs) if (Math.abs(b.x - sh.x) < 30 && b.y > H - 110 && b.y < H - 90) { sh.hp--; b.y = H + 99; } for (const s of shots) if (Math.abs(s.x - sh.x) < 30 && s.y > H - 110 && s.y < H - 90) { s.y = -99; } }
      for (const b of bombs) if (Math.abs(b.x - x) < 20 && b.y > H - 44 && b.y < H - 20) { b.y = H + 99; lives--; if (lives <= 0) return over(); }
      bombs = bombs.filter(b => b.y < H);
      if (live.some(a => a.y > H - 120)) return over();
      if (!aliens.some(a => a.alive)) { wave++; score += 100; newWave(); }
    };
    const alien = (a) => { ctx.fillStyle = ['#f472b6', '#a78bfa', '#38bdf8', '#4ade80'][a.row]; const f = Math.floor(frame / 20) % 2; ctx.fillRect(a.x - 12, a.y - 6, 24, 12); ctx.fillRect(a.x - 16, a.y - (f ? 2 : -2), 4, 8); ctx.fillRect(a.x + 12, a.y - (f ? 2 : -2), 4, 8); ctx.fillStyle = '#0b1020'; ctx.fillRect(a.x - 7, a.y - 3, 4, 4); ctx.fillRect(a.x + 3, a.y - 3, 4, 4); };
    const draw = () => {
      ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 50; i++) ctx.fillRect((i * 131) % W, (i * 71 + frame * 0.2) % H, 1.5, 1.5);
      for (const a of aliens || []) if (a.alive) alien(a);
      for (const sh of shields || []) if (sh.hp > 0) { ctx.fillStyle = `rgba(74, 222, 128, ${0.25 + sh.hp / 10})`; ctx.fillRect(sh.x - 30, H - 110, 60, 20); }
      ctx.fillStyle = '#fde047'; for (const s of shots || []) ctx.fillRect(s.x - 1.5, s.y - 8, 3, 10);
      ctx.fillStyle = '#f87171'; for (const b of bombs || []) ctx.fillRect(b.x - 2, b.y - 6, 4, 10);
      ctx.fillStyle = '#38bdf8'; const px = x ?? W / 2; ctx.beginPath(); ctx.moveTo(px, H - 46); ctx.lineTo(px + 20, H - 24); ctx.lineTo(px - 20, H - 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e2e8f0'; ctx.font = '700 17px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${score ?? 0} point · bølge ${wave ?? 1} · ${'▲'.repeat(Math.max(0, lives ?? 3))}`, 12, 24);
    };
    const loop = () => { if (!document.body.contains(canvas)) return; step(); draw(); self._raf = requestAnimationFrame(loop); };
    document.removeEventListener('keydown', this._k); document.removeEventListener('keyup', this._k);
    this._k = (e) => { if (!document.body.contains(canvas)) return; if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'd'].includes(e.key)) { e.preventDefault(); keys[e.key] = e.type === 'keydown'; } };
    document.addEventListener('keydown', this._k); document.addEventListener('keyup', this._k);
    const pad = h('div', { class: 'bf-pad', style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, [['ArrowLeft', '◀'], [' ', 'Skyd'], ['ArrowRight', '▶']].map(([k, l]) => h('button', { class: 'bf-key', onpointerdown: () => { keys[k] = true; }, onpointerup: () => { keys[k] = false; }, onpointerleave: () => { keys[k] = false; } }, l)));
    msg.hidden = false; h(msg, null, h('b', null, 'Rumforsvar'), h('span', null, `Rekord: ${st.best}`), h('button', { class: 'btn btn-primary btn-lg', onclick: reset }, icon('play'), 'Start'));
    this._raf = requestAnimationFrame(loop);
    return page('invaders', 'Spilhal', 'Rumforsvar', 'Rumvæsnerne kommer! Skyd dem ned, før de når jorden, og gem dig bag skjoldene. ← → for at flytte, mellemrum for at skyde.', h('div', { class: 'bo-wrap' }, h('div', { class: 'bf-stage' }, canvas, msg)), pad, lb.el);
  },
};
