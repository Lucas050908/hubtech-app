/** Lær og værktøjer: Hovedstæder, Klokken, Brøker, Stavning, Omregner, Terninger, Tæller og Billedgåder (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy, uid } from '../features/appkit.js';
import * as L from '../features/learn3.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const say = (t) => { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'da-DK'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch { return false; } };
const score = (st) => h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(st.right)), ' rigtige'), h('span', null, h('b', null, String(st.streak)), ' i træk'), h('span', { class: 'faint' }, `rekord ${st.best}`));
const mark = (st, ok, store) => { if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.wrong++; st.streak = 0; } store.save(); };

// ── Hovedstæder ──
export const capitals = {
  title: 'Hovedstæder',
  async render() {
    let store;
    try { store = await appState('capitals', { region: 'Europa', way: 'capital', typed: false, right: 0, wrong: 0, streak: 0, best: 0, missed: {} }); } catch (e) { return loadError('Hovedstæder', e); }
    const st = store.data, root = h('div');
    let q = null, answered = null;
    const pool = () => (st.region === 'alle' ? L.CAPITALS : st.region === 'fejl' ? L.CAPITALS.filter(c => st.missed[c[0]]) : L.CAPITALS.filter(c => c[2] === st.region));
    const next = () => { const p = pool(); if (!p.length) { st.region = 'Europa'; store.save(); return next(); } q = L.capitalQ(p, st.way); answered = null; draw(); };
    const answer = (v) => {
      if (answered) return;
      const ok = L.norm(v) === L.norm(q.answer); answered = { v, ok }; mark(st, ok, store);
      if (ok) delete st.missed[q.q[0]]; else st.missed[q.q[0]] = (st.missed[q.q[0]] || 0) + 1; store.save(); draw();
    };
    function draw() {
      const missed = Object.keys(st.missed).length;
      const regions = [...L.REGIONS.map(r => ({ value: r, label: r === 'Rigsfællesskabet' ? 'Rigsfæll.' : r })), { value: 'alle', label: 'Hele verden' }, ...(missed ? [{ value: 'fejl', label: `Mine fejl (${missed})` }] : [])];
      const input = h('input', { class: 'input l3-typed', placeholder: st.way === 'capital' ? 'Skriv hovedstaden …' : 'Skriv landet …', 'aria-label': 'Dit svar', disabled: !!answered });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) answer(input.value); });
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented(regions, st.region, (v) => { st.region = v; store.save(); next(); }, { label: 'Verdensdel' })),
        h('div', { class: 'l3-bar' }, segmented([{ value: 'capital', label: 'Land → hovedstad' }, { value: 'country', label: 'Hovedstad → land' }], st.way, (v) => { st.way = v; store.save(); next(); }, { label: 'Retning' }),
          segmented([{ value: 'pick', label: 'Vælg' }, { value: 'type', label: 'Skriv selv' }], st.typed ? 'type' : 'pick', (v) => { st.typed = v === 'type'; store.save(); draw(); }, { label: 'Svar' })),
        h('div', { class: 'l3-card' }, score(st),
          h('p', { class: 'l3-ask' }, st.way === 'capital' ? 'Hvad er hovedstaden i' : 'Hvilket land har hovedstaden', h('b', null, `${q.ask}?`)),
          st.typed ? h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, h('button', { class: 'btn btn-primary', disabled: !!answered, onclick: () => input.value.trim() && answer(input.value) }, 'Svar'))
            : h('div', { class: 'l3-opts' }, q.options.map(o => h('button', { class: ['l3-opt', answered && o === q.answer && 'ok', answered && o === answered.v && !answered.ok && 'bad'], disabled: !!answered, onclick: () => answer(o) }, o))),
          answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : `Næsten – det er ${q.answer}. `, h('span', { class: 'faint' }, `${q.q[1]} er hovedstad i ${q.q[0]} (${q.q[2]}).`)) : null,
          answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
      if (st.typed && !answered) setTimeout(() => input.isConnected && input.focus(), 0);
      if (answered) setTimeout(() => root.querySelector('.l3-next')?.focus(), 0);
    }
    next();
    return page('capitals', 'Lær', 'Hovedstæder', 'Lær hovedstæderne i Europa og resten af verden – vælg mellem fire svar eller skriv selv. De lande du tager fejl af, kan du øve igen.', root);
  },
};

// ── Klokken ──
function clockFace(h0, m0, opts = {}) {
  const ns = 'http://www.w3.org/2000/svg', el = (t, a) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el('svg', { viewBox: '0 0 200 200', class: 'ck-face', role: 'img', 'aria-label': `Urskive der viser ${L.digital(h0, m0)}` });
  svg.append(el('circle', { cx: 100, cy: 100, r: 94, class: 'ck-rim' }));
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, big = i % 5 === 0, r1 = big ? 80 : 86; svg.append(el('line', { x1: 100 + Math.sin(a) * r1, y1: 100 - Math.cos(a) * r1, x2: 100 + Math.sin(a) * 90, y2: 100 - Math.cos(a) * 90, class: big ? 'ck-tick big' : 'ck-tick' })); }
  for (let n = 1; n <= 12; n++) { const a = n / 12 * Math.PI * 2, t = el('text', { x: 100 + Math.sin(a) * 66, y: 100 - Math.cos(a) * 66 + 6, class: 'ck-num' }); t.textContent = String(n); svg.append(t); }
  const hand = (deg, len, cls) => { const l = el('line', { x1: 100, y1: 100, x2: 100, y2: 100 - len, class: cls, transform: `rotate(${deg} 100 100)` }); svg.append(l); return l; };
  const hh = hand(((h0 % 12) + m0 / 60) * 30, 46, 'ck-h'), mh = hand(m0 * 6, 70, 'ck-m');
  svg.append(el('circle', { cx: 100, cy: 100, r: 5, class: 'ck-dot' }));
  if (opts.onSet) {
    let drag = null;
    const angle = (e) => { const r = svg.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360; };
    let H = h0, M = m0;
    const set = () => { hh.setAttribute('transform', `rotate(${((H % 12) + M / 60) * 30} 100 100)`); mh.setAttribute('transform', `rotate(${M * 6} 100 100)`); opts.onSet(H, M); };
    svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); const a = angle(e), dm = Math.abs(((a - M * 6 + 540) % 360) - 180), dh = Math.abs(((a - ((H % 12) + M / 60) * 30 + 540) % 360) - 180); drag = dh < dm - 8 ? 'h' : 'm'; });
    svg.addEventListener('pointermove', (e) => { if (!drag) return; const a = angle(e); if (drag === 'm') { const nm = Math.round(a / 6) % 60; if (M > 45 && nm < 15) H = H % 12 + 1; else if (M < 15 && nm > 45) H = (H + 10) % 12 + 1; M = nm; } else { H = Math.floor(a / 30) || 12; } set(); });
    svg.addEventListener('pointerup', () => { drag = null; });
    svg.style.touchAction = 'none'; svg.style.cursor = 'grab';
  }
  return svg;
}
export const clock = {
  title: 'Klokken',
  async render() {
    let store;
    try { store = await appState('clock', { level: 2, mode: 'read', right: 0, wrong: 0, streak: 0, best: 0 }); } catch (e) { return loadError('Klokken', e); }
    const st = store.data, root = h('div');
    let t = null, answered = null, set = { h: 12, m: 0 };
    const next = () => { t = L.randomTime(st.level); answered = null; set = { h: 12, m: 0 }; draw(); };
    function draw() {
      const words = L.clockWords(t.h, t.m);
      let body;
      if (st.mode === 'read') {
        const opts = new Set([words]); let guard = 0; while (opts.size < 4 && guard++ < 50) { const o = L.randomTime(st.level); opts.add(L.clockWords(o.h, o.m)); }
        const list = L.shuffle([...opts]);
        body = h('div', { class: 'ck-play' }, clockFace(t.h, t.m), h('div', { class: 'l3-opts ck-opts' }, list.map(o => h('button', { class: ['l3-opt', answered && o === words && 'ok', answered && answered.v === o && !answered.ok && 'bad'], disabled: !!answered, onclick: () => { answered = { v: o, ok: o === words }; mark(st, answered.ok, store); draw(); } }, o))));
      } else {
        body = h('div', { class: 'ck-play' }, h('div', { class: 'stack', style: { justifyItems: 'center' } }, clockFace(set.h, set.m, { onSet: (H, M) => { set = { h: H, m: M }; } }), h('small', { class: 'faint' }, 'Træk i viserne – den lange er minutviseren')),
          h('div', { class: 'stack', style: { justifyItems: 'center' } }, h('p', { class: 'l3-ask' }, 'Stil uret til', h('b', null, words)),
            h('button', { class: 'btn btn-primary btn-lg', disabled: !!answered, onclick: () => { const ok = (set.h % 12) === (t.h % 12) && set.m === t.m; answered = { ok }; mark(st, ok, store); draw(); } }, icon('check'), 'Tjek')));
      }
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'read', label: 'Hvad er klokken?' }, { value: 'set', label: 'Stil uret' }], st.mode, (v) => { st.mode = v; store.save(); next(); }, { label: 'Øvelse' }),
          segmented([{ value: '1', label: 'Hele og halve' }, { value: '2', label: 'Kvarter' }, { value: '3', label: '5 minutter' }, { value: '4', label: 'Minutter' }], String(st.level), (v) => { st.level = Number(v); store.save(); next(); }, { label: 'Niveau' })),
        h('div', { class: 'l3-card' }, score(st), body,
          answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Ikke helt. ', h('span', null, `Klokken er ${words} – digitalt ${L.digital(t.h, t.m)} eller ${L.digital(t.h + 12, t.m)}.`)) : null,
          answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
    }
    next();
    return page('clock', 'Lær', 'Klokken', 'Lær at læse uret – og at sige det på dansk: kvart over, halv, fem minutter i halv … Aflæs urskiven, eller stil viserne selv.', root);
  },
};

// ── Brøker ──
const fracView = ([n, d]) => h('span', { class: 'fr-frac' }, h('b', null, String(n)), h('i'), h('b', null, String(d)));
function pie([n, d]) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'fr-pie');
  for (let i = 0; i < d; i++) {
    const a0 = i / d * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / d * Math.PI * 2 - Math.PI / 2, p = document.createElementNS(ns, 'path');
    p.setAttribute('d', `M50 50 L${50 + 46 * Math.cos(a0)} ${50 + 46 * Math.sin(a0)} A46 46 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${50 + 46 * Math.cos(a1)} ${50 + 46 * Math.sin(a1)} Z`);
    p.setAttribute('class', i < n ? 'on' : ''); svg.append(p);
  }
  return svg;
}
export const fractions = {
  title: 'Brøker',
  async render() {
    let store;
    try { store = await appState('fractions', { kind: 'shade', right: 0, wrong: 0, streak: 0, best: 0 }); } catch (e) { return loadError('Brøker', e); }
    const st = store.data, root = h('div');
    let t = null, answered = null;
    const next = () => { t = L.fracTask(st.kind); answered = null; draw(); };
    function draw() {
      const input = h('input', { class: 'input fr-in', placeholder: 'fx 3/4', 'aria-label': 'Dit svar', disabled: !!answered, inputmode: 'text' });
      const check = () => { const v = L.parseFrac(input.value); if (!v) return toast('Skriv en brøk som 3/4', { type: 'warn', ms: 1500 }); const ok = L.feq(v, t.answer) && (st.kind !== 'simplify' || (v[0] === t.answer[0] && v[1] === t.answer[1])); answered = { ok, v }; mark(st, ok, store); draw(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      let q;
      if (t.kind === 'shade') q = h('div', { class: 'fr-q' }, pie(t.frac), h('p', { class: 'l3-ask' }, 'Hvor stor en del er farvet?'));
      else if (t.kind === 'simplify') q = h('div', { class: 'fr-q' }, h('p', { class: 'l3-ask' }, 'Forkort brøken så meget som muligt'), h('div', { class: 'fr-line' }, fracView(t.frac), h('span', null, '=')));
      else if (t.kind === 'compare') q = h('div', { class: 'fr-q' }, h('p', { class: 'l3-ask' }, 'Hvilken er størst?'), h('div', { class: 'fr-line' }, h('div', { class: 'fr-cmp' }, pie(t.a), fracView(t.a)), h('div', { class: 'fr-cmp' }, pie(t.b), fracView(t.b))));
      else q = h('div', { class: 'fr-q' }, h('p', { class: 'l3-ask' }, 'Regn ud – og forkort svaret'), h('div', { class: 'fr-line' }, fracView(t.a), h('span', null, t.op), fracView(t.b), h('span', null, '=')));
      const ans = t.kind === 'compare'
        ? h('div', { class: 'l3-opts', style: { gridTemplateColumns: '1fr 1fr' } }, [['>', 'Den venstre'], ['<', 'Den højre']].map(([v, l]) => h('button', { class: ['l3-opt', answered && v === t.answer && 'ok', answered && answered.v === v && !answered.ok && 'bad'], disabled: !!answered, onclick: () => { answered = { v, ok: v === t.answer }; mark(st, answered.ok, store); draw(); } }, l)))
        : h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, h('button', { class: 'btn btn-primary', disabled: !!answered, onclick: check }, 'Svar'));
      const right = t.kind === 'compare' ? `${L.fstr(t.answer === '>' ? t.a : t.b)} er størst (${(t.a[0] / t.a[1]).toLocaleString('da-DK', { maximumFractionDigits: 3 })} mod ${(t.b[0] / t.b[1]).toLocaleString('da-DK', { maximumFractionDigits: 3 })}).` : `Svaret er ${L.fstr(t.answer)}.`;
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'shade', label: 'Se brøken' }, { value: 'simplify', label: 'Forkort' }, { value: 'compare', label: 'Sammenlign' }, { value: 'add', label: 'Plus' }, { value: 'mul', label: 'Gange' }], st.kind, (v) => { st.kind = v; store.save(); next(); }, { label: 'Opgavetype' })),
        h('div', { class: 'l3-card' }, score(st), q, ans,
          answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Ikke helt. ', right, answered.ok || t.kind !== 'simplify' || !answered.v || !L.feq(answered.v, t.answer) ? '' : ' Din brøk er rigtig, men kan forkortes mere.') : null,
          answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
      if (!answered && t.kind !== 'compare') setTimeout(() => input.isConnected && input.focus(), 0);
    }
    next();
    return page('fractions', 'Lær', 'Brøker', 'Forstå brøker med lagkagediagrammer: se hvor meget der er farvet, forkort, sammenlign og regn med dem.', root);
  },
};

// ── Stavning ──
export const spelling = {
  title: 'Stavning',
  async render() {
    let store;
    try { store = await appState('spelling', { level: 1, right: 0, wrong: 0, streak: 0, best: 0, own: [] }); } catch (e) { return loadError('Stavning', e); }
    const st = store.data, root = h('div');
    let word = null, answered = null, last = null;
    const pool = () => (st.level === 0 ? st.own : L.SPELL[st.level]);
    const next = () => { const p = pool(); if (!p.length) { word = null; draw(); return; } do { word = p[Math.floor(Math.random() * p.length)]; } while (p.length > 1 && word === last); last = word; answered = null; draw(); setTimeout(() => say(word), 250); };
    function draw() {
      const input = h('input', { class: 'input sp2-in', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Skriv ordet …', 'aria-label': 'Skriv ordet', disabled: !!answered || !word });
      const check = () => { if (!input.value.trim()) return; const ok = input.value.trim().toLowerCase() === word.toLowerCase(); answered = { ok, v: input.value }; mark(st, ok, store); draw(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      const own = h('textarea', { class: 'input', rows: 3, placeholder: 'Skriv dine egne ord adskilt af komma eller linjeskift – fx ugens ord fra skolen', 'aria-label': 'Egne ord' }, st.own.join(', '));
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: '1', label: 'Lette' }, { value: '2', label: 'Mellem' }, { value: '3', label: 'Svære' }, { value: '4', label: 'Meget svære' }, { value: '0', label: `Mine ord (${st.own.length})` }], String(st.level), (v) => { st.level = Number(v); store.save(); next(); }, { label: 'Niveau' })),
        word ? h('div', { class: 'l3-card' }, score(st),
          h('button', { class: 'sp2-hear', 'aria-label': 'Hør ordet igen', onclick: () => { if (!say(word)) toast('Din browser kan ikke læse op', { type: 'warn' }); } }, icon('volume'), h('span', null, 'Hør ordet')),
          h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, h('button', { class: 'btn btn-primary', disabled: !!answered, onclick: check }, 'Tjek')),
          answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? h('span', null, 'Rigtigt stavet! ', h('b', null, word)) : h('div', null, h('span', null, 'Sådan staves det: '), h('span', { class: 'sp2-diff' }, L.spellDiff(word, answered.v).map(x => h('span', { class: x.ok ? 'ok' : 'bad' }, x.ch || '·'))))) : null,
          answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste ord', icon('play')) : null)
          : h('div', { class: 'sh-empty' }, h('span', { class: 'qz-big' }, '✏️'), h('b', null, 'Ingen egne ord endnu'), h('span', { class: 'faint' }, 'Skriv dine ord herunder – så læser HUBTECH dem op, og du staver.')),
        st.level === 0 ? panel('Mine ord', 'edit', own, h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: () => { st.own = [...new Set(own.value.split(/[\n,;]+/).map(w => w.trim()).filter(w => w && w.length <= 40))].slice(0, 200); store.save(); toast(`${st.own.length} ord gemt`, { type: 'ok' }); next(); } }, icon('check'), 'Gem ordene'))) : null);
      if (word && !answered) setTimeout(() => input.isConnected && input.focus(), 0);
    }
    next();
    return page('spelling', 'Lær', 'Stavning', 'Hør ordet og stav det. Fire niveauer med svære danske ord – eller skriv ugens ord fra skolen ind selv.', root);
  },
};

// ── Omregner ──
export const units = {
  title: 'Omregner',
  async render() {
    let store;
    try { store = await appState('units', { kind: 'length', from: 'km', to: 'm', v: 1 }); } catch (e) { return loadError('Omregner', e); }
    const st = store.data, root = h('div');
    function draw() {
      const U = L.UNITS[st.kind], names = Object.keys(U.units);
      if (!names.includes(st.from)) st.from = names[0]; if (!names.includes(st.to)) st.to = names[1] || names[0];
      const val = h('input', { class: 'input om-in', type: 'number', step: 'any', value: st.v, 'aria-label': 'Værdi' });
      const sel = (v, label, on) => h('select', { class: 'input', 'aria-label': label, onchange: (e) => on(e.target.value) }, names.map(n => h('option', { value: n, selected: n === v }, n)));
      const out = h('output', { class: 'om-out' }), table = h('div', { class: 'om-all' });
      const calc = () => {
        const v = Number(val.value); st.v = v; store.save();
        out.textContent = `${L.nice(L.convert(st.kind, v, st.from, st.to))} ${st.to}`;
        h(clear(table), null, names.filter(n => n !== st.from).map(n => h('button', { class: ['om-row', n === st.to && 'is-on'], onclick: () => { st.to = n; store.save(); draw(); } }, h('span', null, n), h('b', null, L.nice(L.convert(st.kind, v, st.from, n))))));
      };
      val.addEventListener('input', calc);
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented(Object.entries(L.UNITS).map(([k, u]) => ({ value: k, label: u.label })), st.kind, (v) => { st.kind = v; st.from = null; st.to = null; st.v = 1; store.save(); draw(); }, { label: 'Hvad vil du omregne?' })),
        h('div', { class: 'l3-card om-card' },
          h('div', { class: 'om-line' }, val, sel(st.from, 'Fra', (v) => { st.from = v; store.save(); draw(); }),
            h('button', { class: 'icon-btn', 'aria-label': 'Byt om', onclick: () => { [st.from, st.to] = [st.to, st.from]; store.save(); draw(); } }, icon('refresh')),
            sel(st.to, 'Til', (v) => { st.to = v; store.save(); draw(); })),
          h('div', { class: 'om-res' }, out, h('button', { class: 'btn btn-sm', onclick: () => copy(out.textContent.split(' ')[0]) }, icon('copy'), 'Kopiér'))),
        panel(`${L.nice(Number(st.v))} ${st.from} er også`, 'list', table));
      calc();
    }
    draw();
    return page('units', 'Værktøjer', 'Omregner', 'Omregn længde, vægt, rumfang, areal, fart, tid, data og temperatur – også tommer, pund, spiseskefulde og tønder land.', root);
  },
};

// ── Terninger ──
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const dice = {
  title: 'Terninger',
  async render() {
    let store;
    try { store = await appState('dice', { n: 2, sides: 6, hist: [], coin: { kr: 0, plat: 0 } }); } catch (e) { return loadError('Terninger', e); }
    const st = store.data, root = h('div');
    let last = null, coin = null, rolling = false;
    const roll = (expr) => {
      const r = L.rollDice(expr || `${st.n}d${st.sides}`); if (!r) return toast('Skriv fx 3d6+2', { type: 'warn' });
      rolling = true; last = r; draw(); setTimeout(() => { rolling = false; st.hist.unshift({ e: `${r.n}d${r.sides}${r.mod ? (r.mod > 0 ? '+' : '') + r.mod : ''}`, r: r.rolls, t: r.total }); st.hist = st.hist.slice(0, 12); store.save(); draw(); }, 450);
    };
    const flip = () => { coin = Math.random() < 0.5 ? 'kr' : 'plat'; st.coin[coin]++; store.save(); draw(); };
    function draw() {
      const custom = h('input', { class: 'input', placeholder: 'fx 3d6+2 eller d20', 'aria-label': 'Eget terningslag', style: { width: '160px' } });
      custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') roll(custom.value); });
      const die = (v) => (last.sides === 6 ? h('span', { class: ['ld-die', 'dc-die', rolling && 'is-rolling'] }, Array.from({ length: 9 }, (_, i) => h('i', { class: PIPS[v].includes(i) ? 'on' : '' }))) : h('span', { class: ['dc-poly', rolling && 'is-rolling'] }, h('b', null, String(v)), h('small', null, `d${last.sides}`)));
      h(clear(root), null,
        h('div', { class: 'l3-card dc-card' },
          h('div', { class: 'dc-row' }, h('span', { class: 'faint' }, 'Antal'), segmented([1, 2, 3, 4, 5, 6].map(n => ({ value: String(n), label: String(n) })), String(st.n), (v) => { st.n = Number(v); store.save(); draw(); }, { label: 'Antal terninger' })),
          h('div', { class: 'dc-row' }, h('span', { class: 'faint' }, 'Sider'), segmented([4, 6, 8, 10, 12, 20, 100].map(n => ({ value: String(n), label: `d${n}` })), String(st.sides), (v) => { st.sides = Number(v); store.save(); draw(); }, { label: 'Antal sider' })),
          h('div', { class: 'dc-table', onclick: () => roll() }, last ? h('div', { class: 'dc-dice' }, last.rolls.map(die)) : h('span', { class: 'faint' }, 'Tryk for at slå'),
            last && !rolling ? h('b', { class: 'dc-total' }, last.rolls.length > 1 || last.mod ? `I alt ${last.total}` : '') : null),
          h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => roll() }, icon('cube'), 'Slå'), custom, h('button', { class: 'btn', onclick: () => roll(custom.value) }, 'Slå det'))),
        h('div', { class: 'grid-2 dc-grid' },
          panel('Plat eller krone', 'circle', h('div', { class: 'dc-coinwrap' }, h('button', { class: ['dc-coin', coin && `is-${coin}`], onclick: flip, 'aria-label': 'Slå plat eller krone' }, coin === 'kr' ? 'Krone' : coin === 'plat' ? 'Plat' : '?'),
            h('span', { class: 'faint' }, `Krone ${st.coin.kr} · Plat ${st.coin.plat}`))),
          panel('Seneste slag', 'list', st.hist.length ? h('ul', { class: 'dc-hist' }, st.hist.map(x => h('li', null, h('span', { class: 'faint' }, x.e), h('span', null, x.r.join(' + ')), h('b', null, String(x.t))))) : h('p', { class: 'faint' }, 'Ingen slag endnu.'))));
    }
    draw();
    return page('dice', 'Værktøjer', 'Terninger', 'Slå med op til seks terninger – almindelige eller rollespilsterninger fra d4 til d100 – eller slå plat og krone.', root);
  },
};

// ── Tæller ──
export const tally = {
  title: 'Tæller',
  async render() {
    let store;
    try { store = await appState('tally', { counters: [{ id: 'a', name: 'Tæller', n: 0, step: 1, goal: 0 }] }); } catch (e) { return loadError('Tæller', e); }
    const st = store.data, root = h('div');
    const bump = (c, d) => { c.n = Math.max(c.min ?? -1e9, c.n + d); store.save(); try { navigator.vibrate?.(10); } catch { /* */ } if (c.goal && c.n === c.goal && d > 0) toast(`${c.name}: målet på ${c.goal} er nået! 🎉`, { type: 'xp' }); draw(); };
    function draw() {
      h(clear(root), null,
        h('div', { class: 'tl2-grid' }, st.counters.map(c => {
          const name = h('input', { class: 'tl2-name', value: c.name, maxlength: 30, 'aria-label': 'Navn på tæller' });
          name.addEventListener('change', () => { c.name = name.value.trim() || 'Tæller'; store.save(); });
          const pct = c.goal ? Math.min(100, Math.round(c.n / c.goal * 100)) : null;
          return h('div', { class: 'tl2-card' },
            h('div', { class: 'tl2-top' }, name, h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${c.name}`, onclick: async () => { if (st.counters.length === 1) { c.n = 0; store.save(); return draw(); } if (await confirmDialog({ title: `Slet “${c.name}”?`, confirmLabel: 'Slet', danger: true })) { st.counters = st.counters.filter(x => x !== c); store.save(); draw(); } } }, icon('trash'))),
            h('button', { class: 'tl2-big', 'aria-label': `Læg ${c.step} til ${c.name}`, onclick: () => bump(c, c.step) }, h('b', null, String(c.n)), pct != null ? h('small', null, `${pct}% af ${c.goal}`) : h('small', null, `+${c.step}`)),
            pct != null ? h('div', { class: 'ch-prog' }, h('i', { style: { width: `${pct}%` } })) : null,
            h('div', { class: 'tl2-row' }, h('button', { class: 'btn btn-sm', 'aria-label': `Træk ${c.step} fra ${c.name}`, onclick: () => bump(c, -c.step) }, '−'),
              h('select', { class: 'input tl2-sel', 'aria-label': 'Skridt', onchange: (e) => { c.step = Number(e.target.value); store.save(); draw(); } }, [1, 2, 5, 10, 100].map(n => h('option', { value: String(n), selected: n === c.step }, `±${n}`))),
              h('input', { class: 'input tl2-sel', type: 'number', min: 0, placeholder: 'Mål', value: c.goal || '', 'aria-label': `Mål for ${c.name}`, onchange: (e) => { c.goal = Math.max(0, Number(e.target.value) || 0); store.save(); draw(); } }),
              h('button', { class: 'btn btn-sm', onclick: () => { c.n = 0; store.save(); draw(); } }, icon('refresh'), 'Nul')));
        }),
        st.counters.length < 12 ? h('button', { class: 'tl2-add', onclick: () => { st.counters.push({ id: uid(), name: `Tæller ${st.counters.length + 1}`, n: 0, step: 1, goal: 0 }); store.save(); draw(); } }, icon('plus'), 'Ny tæller') : null),
        h('p', { class: 'faint', style: { fontSize: '13px', textAlign: 'center' } }, 'Tæl point i et spil, armbøjninger, glas vand, fugle på foderbrættet – eller hvad som helst. Tryk på tallet for at tælle op.'));
    }
    draw();
    return page('tally', 'Værktøjer', 'Tæller', 'Tæl hvad som helst med et tryk – flere tællere på én gang, med skridt og mål.', root);
  },
};

// ── Billedgåder ──
export const nonogram = {
  title: 'Billedgåder',
  async render() {
    let store;
    try { store = await appState('nonogram', { idx: 0, cells: null, done: {} }); } catch (e) { return loadError('Billedgåder', e); }
    const st = store.data, root = h('div');
    let tool = 1, painting = null;
    const pz = () => L.NONOGRAMS[st.idx] || L.NONOGRAMS[0];
    const fresh = () => Array.from({ length: pz().size }, () => Array(pz().size).fill(0));
    if (!st.cells || st.cells.length !== pz().size) st.cells = fresh();
    function draw() {
      const p = pz(), n = p.size, rc = L.rowClues(p.grid), cc = L.colClues(p.grid), win = L.solved(p.grid, st.cells);
      const lineDone = (want, have) => want.join() === L.clues(have.map(v => (v === 1 ? 1 : 0))).join();
      const grid = h('div', { class: ['ng-grid', win && 'is-won'], style: { '--n': n } },
        h('span', { class: 'ng-corner' }),
        cc.map((c, j) => h('span', { class: ['ng-cc', lineDone(c, st.cells.map(r => r[j])) && 'done'] }, c.map(x => h('b', null, String(x))))),
        ...st.cells.flatMap((row, i) => [h('span', { class: ['ng-rc', lineDone(rc[i], row) && 'done'] }, rc[i].map(x => h('b', null, String(x)))),
          ...row.map((v, j) => h('button', { class: ['ng-cell', v === 1 && 'on', v === 2 && 'x', (j + 1) % 5 === 0 && j < n - 1 && 'r5', (i + 1) % 5 === 0 && i < n - 1 && 'b5'], 'aria-label': `Række ${i + 1}, kolonne ${j + 1}`, 'data-i': i, 'data-j': j }))]));
      const paint = (el) => { if (!el?.classList?.contains('ng-cell') || win) return; const i = Number(el.dataset.i), j = Number(el.dataset.j); if (painting == null) painting = st.cells[i][j] === tool ? 0 : tool; if (st.cells[i][j] !== painting) { st.cells[i][j] = painting; el.className = ['ng-cell', painting === 1 && 'on', painting === 2 && 'x', (j + 1) % 5 === 0 && j < n - 1 && 'r5', (i + 1) % 5 === 0 && i < n - 1 && 'b5'].filter(Boolean).join(' '); } };
      grid.addEventListener('pointerdown', (e) => { e.preventDefault(); painting = null; paint(e.target); grid.setPointerCapture?.(e.pointerId); });
      grid.addEventListener('pointermove', (e) => { if (painting != null) paint(document.elementFromPoint(e.clientX, e.clientY)); });
      grid.addEventListener('pointerup', () => { if (painting == null) return; painting = null; store.save(); if (L.solved(p.grid, st.cells)) { st.done[p.name] = true; store.save(); toast(`Du løste “${p.name}”! 🎉`, { type: 'xp' }); } draw(); });
      grid.addEventListener('contextmenu', (e) => e.preventDefault());
      h(clear(root), null,
        h('div', { class: 'ng-picks' }, L.NONOGRAMS.map((q, i) => h('button', { class: ['sh-tag', i === st.idx && 'is-on'], onclick: () => { st.idx = i; st.cells = fresh(); store.save(); draw(); } }, st.done[q.name] ? `✓ ${q.name}` : `${q.size}×${q.size} · ${i + 1}`))),
        h('div', { class: 'l3-card ng-card' },
          h('div', { class: 'l3-bar', style: { justifyContent: 'center' } }, segmented([{ value: '1', label: '■ Udfyld' }, { value: '2', label: '✕ Kryds' }], String(tool), (v) => { tool = Number(v); }, { label: 'Værktøj' }),
            h('button', { class: 'btn btn-sm', onclick: () => { st.cells = fresh(); store.save(); draw(); } }, icon('refresh'), 'Ryd')),
          grid,
          win ? h('div', { class: 'l3-fb ok' }, `Løst! Billedet er: ${p.name}`, st.idx < L.NONOGRAMS.length - 1 ? h('button', { class: 'btn btn-primary btn-sm', style: { marginLeft: '10px' }, onclick: () => { st.idx++; st.cells = fresh(); store.save(); draw(); } }, 'Næste gåde') : null)
            : h('p', { class: 'faint', style: { fontSize: '13px', textAlign: 'center' } }, 'Tallene fortæller hvor mange felter i træk der skal udfyldes i hver række og kolonne, i rækkefølge. Sæt kryds hvor du ved, der er tomt.')));
    }
    draw();
    return page('nonogram', 'Spilhal', 'Billedgåder', 'Logikgåder der bliver til et billede: brug tallene ved rækker og kolonner til at finde ud af, hvilke felter der skal farves.', root);
  },
};
