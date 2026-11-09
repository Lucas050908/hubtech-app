/** Elværkstedet – HUBTECH's own electronics app: simulator, calculations, fault finding and components. */
import { h, clear, svgEl as S } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { logActivity, refreshSummary } from '../core/store.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, todayKey } from '../features/appkit.js';
import * as E from '../features/electro.js';

const TABS = [['overview', 'Oversigt', 'home'], ['sim', 'Simulator', 'circuit'], ['calc', 'Regneopgaver', 'calculator'], ['faults', 'Fejlfinding', 'search'], ['parts', 'Komponenter', 'chip']];
const field = (label, el) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);

// ── schematic: battery on the left, resistors on top, LED and switch on the right ──
function schematic(c, res) {
  const W = 560, H = 260, on = c.closed !== false && res.i > 0 && Number.isFinite(res.i);
  const wire = (pts) => S('polyline', { points: pts, class: ['el-wire', on && 'is-live'] });
  const box = (x, y, label, hot) => [S('rect', { x: x - 34, y: y - 12, width: 68, height: 24, rx: 4, class: ['el-r', hot && 'is-hot'] }), S('text', { x, y: y + 4, class: 'el-t' }, label)];
  const g = [];
  // battery
  g.push(S('line', { x1: 40, y1: 118, x2: 80, y2: 118, class: 'el-bat-l' }), S('line', { x1: 50, y1: 134, x2: 70, y2: 134, class: 'el-bat-s' }), S('text', { x: 92, y: 132, class: 'el-t el-t-l' }, `${String(c.v).replace('.', ',')} V`));
  g.push(wire('60,118 60,40 140,40'), wire('60,134 60,220 500,220 500,180'));
  const rs = (c.rs || []).filter(r => r > 0), lbl = (k) => `${E.fmt(rs[k], 'Ω', 3)}`, hot = (k) => res.parts[k]?.hot;
  if (res.mode === 'series' || rs.length < 2) {
    const n = rs.length, xs = n === 1 ? [260] : n === 2 ? [200, 330] : [175, 270, 365];
    let x0 = 140;
    rs.forEach((_, k) => { g.push(wire(`${x0},40 ${xs[k] - 34},40`), ...box(xs[k], 40, lbl(k), hot(k))); x0 = xs[k] + 34; });
    g.push(wire(`${x0},40 500,40 500,70`));
  } else if (res.mode === 'parallel') {
    const ys = rs.length === 2 ? [40, 92] : [30, 72, 114];
    g.push(wire(`140,40 200,40`), wire(`200,${ys[0]} 200,${ys[ys.length - 1]}`), wire(`380,${ys[0]} 380,${ys[ys.length - 1]}`), wire('380,40 500,40 500,70'));
    rs.forEach((_, k) => g.push(wire(`200,${ys[k]} 256,${ys[k]}`), ...box(290, ys[k], lbl(k), hot(k)), wire(`324,${ys[k]} 380,${ys[k]}`)));
  } else {      // mixed: R1 then R2 || R3
    g.push(wire('140,40 166,40'), ...box(200, 40, lbl(0), hot(0)), wire('234,40 270,40'), wire('270,20 270,72'), wire('430,20 430,72'),
      wire('270,20 316,20'), ...box(350, 20, lbl(1), hot(1)), wire('384,20 430,20'), wire('270,72 316,72'), ...box(350, 72, lbl(2), hot(2)), wire('384,72 430,72'), wire('430,40 500,40 500,70'));
  }
  // LED (or plain wire) between y 70 and 130 on the right
  const L = c.led ? E.LEDS[c.led] : null;
  if (L) {
    const glow = res.ledState === 'on' || res.ledState === 'dim' ? res.brightness : 0;
    g.push(wire('500,70 500,86'), S('polygon', { points: '486,86 514,86 500,106', class: ['el-led', res.ledState === 'burnt' && 'is-burnt'], style: `--led:${L.color};--glow:${glow.toFixed(2)}` }), S('line', { x1: 486, y1: 106, x2: 514, y2: 106, class: 'el-led-bar' }), wire('500,106 500,130'),
      glow ? S('circle', { cx: 500, cy: 96, r: 22 + 14 * glow, class: 'el-glow', style: `--led:${L.color};opacity:${(0.25 + 0.55 * glow).toFixed(2)}` }) : null,
      res.ledState === 'burnt' ? S('text', { x: 530, y: 100, class: 'el-t el-t-l el-t-bad' }, '💥') : null);
  } else g.push(wire('500,70 500,130'));
  // switch between y 130 and 180
  g.push(S('circle', { cx: 500, cy: 134, r: 3.5, class: 'el-dot' }), S('circle', { cx: 500, cy: 176, r: 3.5, class: 'el-dot' }),
    S('line', { x1: 500, y1: 134, x2: c.closed === false ? 528 : 500, y2: c.closed === false ? 168 : 176, class: ['el-wire', on && 'is-live'] }),
    S('text', { x: 518, y: 160, class: 'el-t el-t-l' }, c.closed === false ? 'Slukket' : 'Tændt'));
  // current arrow
  if (on) g.push(S('text', { x: 100, y: 34, class: 'el-t el-t-l el-t-i' }, `I = ${E.fmt(res.i, 'A')}`));
  return S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'el-schematic', role: 'img', 'aria-label': `Diagram: ${c.v} volt, ${rs.length} modstand(e) ${res.mode === 'parallel' ? 'parallelt' : res.mode === 'mixed' ? 'blandet' : 'i serie'}${L ? `, ${L.name.toLowerCase()} LED` : ''}, kontakten er ${c.closed === false ? 'slukket' : 'tændt'}` }, g);
}

export default {
  title: 'Elværkstedet',
  async render(ctx) {
    const app = appById('electro');
    let store;
    try { store = await appState('electro', { xp: 0, achievements: [], stats: {}, faults: {}, sim: null }); } catch (e) { return loadError('Elværkstedet', e); }
    const st = store.data;
    const tab = TABS.some(t => t[0] === ctx?.params?.sub) ? ctx.params.sub : 'overview';
    this.title = tab === 'overview' ? 'Elværkstedet' : `${TABS.find(t => t[0] === tab)[1]} · Elværkstedet`;
    const lvl = () => E.levelOf(st.xp || 0);
    const xpChip = h('span', { class: 'chip chip-app' });
    const drawXp = () => { const L = lvl(); xpChip.textContent = `Level ${L.level} · ${L.name} · ${st.xp || 0} XP`; };
    function gain(n, why) {
      const before = lvl().level;
      st.xp = (st.xp || 0) + n; E.touchDay(st, todayKey());
      const got = E.awardBadges(st);
      store.save(); drawXp();
      toast(`+${n} XP`, { type: 'xp', text: why, ms: 1600 });
      for (const b of got) setTimeout(() => toast(`Nyt badge: ${b.name}`, { type: 'xp', icon: b.icon }), 600);
      if (lvl().level > before) setTimeout(() => toast(`Level ${lvl().level}: ${lvl().name}`, { type: 'xp', text: 'Du er rykket op!' }), 1200);
      setTimeout(refreshSummary, 800);
    }
    drawXp();

    // ── overview ──
    function overview() {
      const L = lvl(), s = st.stats || {};
      const tiles = [['sim', 'Simulator', 'Byg et kredsløb med batteri, modstande, LED og kontakt – og se strøm og spænding live.', 'circuit'],
        ['calc', 'Regneopgaver', 'Ohms lov, effekt, LED-formodstand, serie, parallel og mere – nye tal hver gang.', 'calculator'],
        ['faults', 'Fejlfinding', `Mål med voltmeteret og find fejlen. ${Object.keys(st.faults || {}).length} af ${E.FAULTS.length} fundet.`, 'search'],
        ['parts', 'Komponenter', 'Modstand, kondensator, diode, LED, transistor, relæ, sikring og potentiometer – og hvordan du tester dem.', 'chip']];
      return h('div', { class: 'el-overview' },
        h('div', { class: 'guide-grid' }, tiles.map(([id, t, d, ic]) => h('a', { class: 'guide-card glass', href: `#/learn/electro/${id}`, 'data-tab': id }, h('span', { class: 'row-icon' }, icon(ic)), h('div', { class: 'gc-main' }, h('h3', null, t), h('p', { class: 'muted' }, d)), icon('arrowRight')))),
        h('div', { class: 'lab-cols' },
          panel('Dit niveau', 'trophy',
            h('div', { class: 'ch-rating' }, h('span', { class: 'ch-rank-icon', 'aria-hidden': 'true' }, icon('circuit')), h('div', null, h('b', { class: 'ch-rating-n' }, `Level ${L.level}`), h('div', null, L.name), h('div', { class: 'faint' }, `${st.xp || 0} XP · ${s.right || 0} rigtige udregninger · ${s.streakDays || 0} dage i træk`))),
            L.next ? h('div', { class: 'ch-next' }, h('div', { class: 'ch-row-sb' }, h('span', { class: 'faint' }, `Næste: ${E.LEVEL_NAMES[L.level] || ''}`), h('span', { class: 'faint' }, `${L.next - (st.xp || 0)} XP`)), h('div', { class: 'lab-bar-track' }, h('span', { style: { width: `${L.pct}%` } }))) : null),
          panel('Badges', 'award', h('div', { class: 'el-badges' }, E.BADGES.map(b => { const has = (st.achievements || []).includes(b.id); return h('div', { class: ['el-badge', has && 'is-on'], title: has ? 'Optjent' : 'Ikke optjent endnu' }, icon(b.icon), h('span', null, b.name)); })),
            h('p', { class: 'faint', style: { margin: '10px 0 0' } }, 'Vil du læse teorien først? ', h('a', { href: '#/learn/course/elektronik' }, 'Kurset Elektronik fra bunden'), '.'))));
    }

    // ── simulator ──
    function simulator() {
      const c = st.sim || (st.sim = { v: 9, rs: [330, 0, 0], mode: 'series', led: 'red', closed: true });
      const out = h('div'), pic = h('div', { class: 'el-pic' }), readings = h('div', { class: 'lab-stats' }), warn = h('div', { 'aria-live': 'polite' });
      const v = h('input', { type: 'range', class: 'lab-range', min: 1, max: 24, step: 0.5, value: c.v, 'aria-label': 'Spænding i volt' });
      const vOut = h('b', { class: 'el-vout' });
      const rIn = [0, 1, 2].map(k => { const s = h('select', { class: 'input', 'aria-label': `Modstand R${k + 1}` }, [h('option', { value: 0 }, k ? 'Ingen' : 'Ingen (kortslutning!)'), ...[10, 47, 100, 150, 220, 330, 470, 680, 1000, 2200, 4700, 10000].map(r => h('option', { value: r, selected: c.rs[k] === r }, E.fmt(r, 'Ω')))]); if (!c.rs[k]) s.value = '0'; return s; });
      const mode = h('div'), ledSel = h('select', { class: 'input', 'aria-label': 'LED' }, [h('option', { value: '' }, 'Ingen LED'), ...Object.entries(E.LEDS).map(([k, L]) => h('option', { value: k, selected: c.led === k }, `${L.name} (${String(L.vf).replace('.', ',')} V)`))]);
      if (!c.led) ledSel.value = '';
      const sw = h('button', { class: 'btn', 'aria-pressed': String(c.closed !== false) });
      const drawMode = () => mode.replaceChildren(segmented([{ value: 'series', label: 'Serie' }, { value: 'parallel', label: 'Parallel' }, { value: 'mixed', label: 'R1 + (R2 ∥ R3)' }], c.mode, (m) => { c.mode = m; run(); }, { label: 'Kobling' }));
      let counted = false;
      function run() {
        c.v = +v.value; c.rs = rIn.map(s => +s.value); c.led = ledSel.value || null;
        vOut.textContent = `${String(c.v).replace('.', ',')} V`;
        h(clear(sw), null, icon('power'), c.closed === false ? 'Tænd kontakten' : 'Sluk kontakten'); sw.setAttribute('aria-pressed', String(c.closed !== false));
        const res = E.solveCircuit(c);
        pic.replaceChildren(schematic(c, res));
        const stat = (l, val) => h('div', { class: 'lab-stat' }, h('span', { class: 'faint' }, l), h('b', null, val));
        readings.replaceChildren(stat('Strøm', E.fmt(res.i, 'A')), stat('Samlet modstand', res.req ? E.fmt(res.req, 'Ω') : '0 Ω'), stat('LED', c.led ? { on: 'Lyser', dim: 'Lyser svagt', off: 'Slukket', burnt: 'Brændt af' }[res.ledState] : '–'),
          ...res.parts.map(p => stat(`${p.name}: spænding · effekt`, `${E.fmt(p.v, 'V')} · ${E.fmt(p.p, 'W')}`)));
        warn.className = res.warnings.length ? 'lab-result is-warn' : 'lab-result is-ok';
        warn.replaceChildren(res.warnings.length ? h('ul', { class: 'g-list' }, res.warnings.map(w => h('li', null, w))) : h('b', null, c.closed === false ? 'Kontakten er slukket – der løber ingen strøm.' : 'Alt er inden for grænserne.'));
        const s = st.stats || (st.stats = {});
        s.sims = (s.sims || 0) + (counted ? 0 : 1); counted = true;
        if (res.ledState === 'on' && !s.ledOk) { s.ledOk = true; gain(25, 'LED’en lyser – uden at brænde af'); }
        else if (res.ledState === 'burnt' && !s.ledBurnt) { s.ledBurnt = true; gain(5, 'Nu ved du, hvorfor LED’er skal have en formodstand'); }
        else { E.awardBadges(st); store.save(); }
      }
      [v].forEach(x => x.addEventListener('input', run));
      [...rIn, ledSel].forEach(x => x.addEventListener('change', run));
      sw.addEventListener('click', () => { c.closed = c.closed === false; run(); });
      drawMode(); run();
      return h('div', { class: 'lab-cols' },
        panel('Byg kredsløbet', 'settings', field('Spænding', h('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, v, vOut)), field('R1', rIn[0]), field('R2', rIn[1]), field('R3', rIn[2]), field('Kobling', mode), field('LED', ledSel), sw),
        h('div', { class: 'stack' }, panel('Diagram', 'circuit', pic), panel('Målinger', 'chart', readings), panel('Advarsler', 'alert', warn),
          panel('Prøv selv', 'target', h('ul', { class: 'g-list' }, h('li', null, 'Find den mindste modstand, hvor en rød LED på 9 V ikke brænder af.'), h('li', null, 'Sæt to ens modstande parallelt. Hvad sker der med den samlede modstand?'), h('li', null, 'Hvorfor bliver R1 varmest i den blandede kobling?')))));
    }

    // ── calculations ──
    function calc() {
      let kind = st.calcKind || null, p = E.makeProblem(kind), tries = 0;
      const q = h('p', { class: 'el-q' }), input = h('input', { class: 'input el-ans', inputmode: 'decimal', 'aria-label': 'Dit svar', autocomplete: 'off' }), unit = h('span', { class: 'faint' });
      const fb = h('div', { 'aria-live': 'polite' }), hintEl = h('p', { class: 'faint' });
      const score = h('span', { class: 'chip' });
      const drawScore = () => { const s = st.stats || {}; score.textContent = `${s.right || 0} rigtige · stime ${s.streak || 0} (bedste ${s.bestStreak || 0})`; };
      const kinds = h('select', { class: 'input', 'aria-label': 'Opgavetype' }, [h('option', { value: '' }, 'Blandet'), ...E.PROBLEM_KINDS.map(k => h('option', { value: k, selected: kind === k }, E.KIND_LABEL[k]))]);
      kinds.addEventListener('change', () => { kind = kinds.value || null; st.calcKind = kind; store.save(); next(); });
      function next() { p = E.makeProblem(kind); tries = 0; q.textContent = p.q; unit.textContent = p.unit; input.value = ''; fb.replaceChildren(); fb.className = ''; hintEl.textContent = ''; input.focus(); }
      function check() {
        if (!input.value.trim()) return;
        const ok = E.checkAnswer(p, input.value), s = st.stats || (st.stats = {});
        tries++;
        if (ok) {
          s.right = (s.right || 0) + 1; s.streak = (s.streak || 0) + 1; s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
          fb.className = 'lab-result is-ok'; fb.replaceChildren(h('b', null, 'Rigtigt!'), h('p', null, p.how), h('button', { class: 'btn btn-primary', onclick: next }, 'Næste opgave', icon('arrowRight')));
          gain(tries === 1 ? 15 : 8, E.KIND_LABEL[p.kind]);
        } else {
          s.streak = 0; store.save();
          fb.className = 'lab-result is-bad';
          fb.replaceChildren(h('b', null, tries >= 2 ? `Ikke rigtigt. Svaret er ${String(p.answer).replace('.', ',')} ${p.unit}` : 'Ikke helt – prøv igen'), tries >= 2 ? h('p', null, p.how) : h('p', null, p.hint), tries >= 2 ? h('button', { class: 'btn', onclick: next }, 'Ny opgave', icon('refresh')) : null);
        }
        drawScore();
      }
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      next(); drawScore();
      return h('div', { class: 'lab-cols' },
        panel('Opgave', 'calculator', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } }, kinds, score), q,
          h('div', { class: 'row el-ans-row' }, input, unit, h('button', { class: 'btn btn-primary', onclick: check }, icon('check'), 'Tjek')),
          h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { hintEl.textContent = p.hint; } }, icon('help'), 'Hint'), h('button', { class: 'btn btn-sm btn-ghost', onclick: next }, icon('refresh'), 'Spring over')),
          hintEl, fb),
        h('div', { class: 'stack' }, panel('Formler', 'book', h('ul', { class: 'g-list mono el-formulas' },
          h('li', null, 'U = R × I   ·   I = U / R   ·   R = U / I'), h('li', null, 'P = U × I   ·   P = I² × R   ·   P = U² / R'), h('li', null, 'Serie: R = R1 + R2 + …'), h('li', null, 'Parallel: 1/R = 1/R1 + 1/R2'), h('li', null, 'LED: R = (U − Uf) / I'), h('li', null, 'Spændingsdeler: Uud = Uind × R2 / (R1 + R2)'), h('li', null, 'τ = R × C   ·   timer = mAh / mA'))),
          panel('Sådan skriver du svaret', 'info', h('p', { class: 'muted', style: { margin: 0 } }, 'Skriv kun tallet i den enhed, der står ved feltet – fx 46,8 for 46,8 mA. Komma og punktum virker begge. Små afrundinger (2 %) godkendes.'))));
    }

    // ── fault finding ──
    function faults() {
      const wrap = h('div');
      function list() {
        wrap.replaceChildren(h('div', { class: 'guide-grid' }, E.FAULTS.map(f => h('button', { class: 'guide-card glass lab-case', onclick: () => open(f), 'data-fault': f.id },
          h('span', { class: 'row-icon' }, icon(st.faults?.[f.id] ? 'checkCircle' : 'search')),
          h('div', { class: 'gc-main' }, h('h3', null, f.title), h('p', { class: 'muted' }, f.setup), st.faults?.[f.id] ? h('div', { class: 'gc-meta' }, h('span', { class: 'chip chip-ok' }, `${st.faults[f.id]} XP`)) : null), icon('arrowRight')))));
      }
      function open(f) {
        const used = new Set(), results = h('div', { class: 'stack' }), fb = h('div', { 'aria-live': 'polite' });
        const meter = h('div', { class: 'el-meter', 'aria-live': 'polite' }, h('span', { class: 'faint' }, 'Multimeter'), h('b', null, '– – –'));
        const pts = h('div', { class: 'lab-tests' }, f.points.map(([label, val], i) => h('button', { class: 'btn lab-test', onclick: (e) => {
          meter.lastChild.textContent = val;
          if (!used.has(i)) { used.add(i); results.append(h('div', { class: 'lab-finding glass' }, h('b', null, label), h('p', null, val))); }
          e.currentTarget.classList.add('is-done');
        } }, icon('plug'), label)));
        const opts = h('div', { class: 'lab-answers' }, f.options.map((o, i) => h('button', { class: 'btn lab-answer', onclick: () => {
          const ok = i === f.a, pts2 = E.faultScore(ok, used.size);
          opts.querySelectorAll('button').forEach((b, k) => { b.disabled = true; if (k === f.a) b.classList.add('is-right'); else if (k === i) b.classList.add('is-wrong'); });
          fb.className = `lab-result is-${ok ? 'ok' : 'bad'}`;
          fb.replaceChildren(h('b', null, ok ? `Rigtigt – ${pts2} XP` : `Ikke rigtigt. Fejlen er: ${f.options[f.a]}`), h('p', null, f.why),
            h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn', onclick: () => open(f) }, icon('refresh'), 'Prøv igen'), h('button', { class: 'btn btn-primary', onclick: list }, 'Flere fejl', icon('arrowRight'))));
          if (ok && !(st.faults?.[f.id] >= pts2)) { st.faults = { ...(st.faults || {}), [f.id]: pts2 }; gain(pts2, f.title); }
          logActivity('learning', 'electro', 'Elværkstedet', `${f.title}: ${ok ? 'fundet' : 'forkert'}`, `electro:fault:${f.id}`);
        } }, o)));
        wrap.replaceChildren(h('button', { class: 'btn btn-sm btn-ghost', onclick: list }, icon('arrowLeft'), 'Alle fejl'),
          h('div', { class: 'lab-cols' },
            h('div', { class: 'stack' }, panel(f.title, 'alert', h('p', null, f.setup)), panel('Mål med voltmeteret', 'plug', meter, h('p', { class: 'faint' }, 'De første to målinger giver fuld XP – derefter 10 XP mindre pr. måling.'), pts)),
            h('div', { class: 'stack' }, panel('Dine målinger', 'list', results), panel('Hvad er fejlen?', 'help', opts, fb))));
      }
      list();
      return wrap;
    }

    // ── components ──
    function parts() {
      return h('div', { class: 'guide-grid el-parts' }, E.COMPONENTS.map(c => h('article', { class: 'glass panel el-part' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('chip'), c.name), h('span', { class: 'chip' }, c.unit)),
        h('p', null, c.what), h('dl', { class: 'el-dl' }, h('dt', null, 'Bruges til'), h('dd', null, c.use), h('dt', null, 'Sådan tester du den'), h('dd', null, c.test), h('dt', null, 'Pas på'), h('dd', null, c.watch)))));
    }

    const views = { overview, sim: simulator, calc, faults, parts };
    logActivity('learning', 'electro', 'Elværkstedet', TABS.find(t => t[0] === tab)[1], `electro:${tab}`);
    return h('div', { class: 'page lab-page el-page', style: { '--app': app.hue } },
      appHero(app, { compact: tab !== 'overview', eyebrow: 'Læring · elektronik', title: 'Elværkstedet', lead: 'Byg kredsløb, regn på dem, find fejl med voltmeteret og lær komponenterne at kende – alt på dansk.', stats: tab === 'overview' ? [{ icon: 'trophy', label: 'Level', value: String(lvl().level) }, { icon: 'award', label: 'Badges', value: `${(st.achievements || []).length}/${E.BADGES.length}` }, { icon: 'flame', label: 'Dage i træk', value: String(st.stats?.streakDays || 0) }] : [] }),
      h('div', { class: 'lab-tabs' }, TABS.map(([id, label, ic]) => h('a', { class: ['chip', id === tab && 'chip-app'], href: id === 'overview' ? '#/learn/electro' : `#/learn/electro/${id}`, 'aria-current': id === tab ? 'page' : null }, icon(ic), label)), xpChip),
      views[tab]());
  },
};
