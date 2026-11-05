/** Øvelseslab – simulators and practice labs: laser, network terminal, service cases and 3D-print settings. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { logActivity } from '../core/store.js';
import { navigate } from '../core/router.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import * as L from '../features/labs.js';

const LABS = [
  { id: 'laser', title: 'Lasersimulator', icon: 'flame', hue: '#f97316', lead: 'Vælg laser, materiale, effekt og hastighed – og se, om den graverer, skærer igennem eller brænder. Med materialetest som i LightBurn.' },
  { id: 'network', title: 'Netværkslab', icon: 'terminal', hue: '#06b6d4', lead: 'En computer med en skjult netværksfejl. Brug ipconfig, ping, nslookup og tracert i terminalen, og find fejlen.' },
  { id: 'cases', title: 'Fejlfindingslab', icon: 'tool', hue: '#eab308', lead: 'Rigtige servicesager: vælg hvilke test du laver, læs resultaterne, og find årsagen med så få test som muligt.' },
  { id: 'print3d', title: '3D-print-lab', icon: 'cube', hue: '#22c55e', lead: 'Skru på lagtykkelse, vægge, fyld, hastighed og temperatur – og se printtid, filament, styrke og kvalitet ændre sig.' },
];

const SHORT = { none: '–', score: 'Ridse', partial: 'Næsten', cut: 'Igennem', overcut: 'Brændt kant', light: 'Svag', engrave: 'Pæn', deep: 'Dyb', burn: 'Brændt', mark: 'Mærke', banned: 'Forbudt' };
const field = (label, el) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);
const select = (opts, value, label) => { const s = h('select', { class: 'input', 'aria-label': label }, opts.map(([v, t]) => h('option', { value: v, selected: v === value }, t))); return s; };
const range = (min, max, step, value, label) => h('input', { type: 'range', class: 'lab-range', min, max, step, value, 'aria-label': label });

// ── laser ──
function laserLab(st, save) {
  const laser = select(Object.entries(L.LASERS).map(([k, v]) => [k, v.name]), st.laser?.l || 'diode10', 'Laser');
  const mat = select(Object.entries(L.MATERIALS).map(([k, v]) => [k, v.name]), st.laser?.m || 'ply3', 'Materiale');
  let mode = st.laser?.mode || 'cut';
  const power = range(5, 100, 5, st.laser?.p ?? 80, 'Effekt i procent');
  const speed = range(1, 400, 1, st.laser?.s ?? 8, 'Hastighed i mm/s');
  const passes = range(1, 5, 1, st.laser?.n ?? 1, 'Antal gennemløb');
  const out = h('div', { class: 'lab-result', 'aria-live': 'polite' });
  const vals = h('div', { class: 'lab-vals' });
  const grid = h('div', { class: 'lab-grid-wrap' });
  const modeSeg = h('div');
  const drawMode = () => modeSeg.replaceChildren(segmented([{ value: 'engrave', label: 'Gravér' }, { value: 'cut', label: 'Skær' }], mode, (v) => { mode = v; run(); drawMode(); }, { label: 'Bearbejdning' }));
  function run() {
    const opt = { mode, power: +power.value, speed: +speed.value, passes: +passes.value };
    const r = L.laserRun(laser.value, mat.value, opt);
    vals.replaceChildren(h('span', null, `Effekt ${opt.power} %`), h('span', null, `${opt.speed} mm/s`), h('span', null, `${opt.passes} gennemløb`));
    out.className = `lab-result is-${r.tone}`;
    out.replaceChildren(h('b', null, r.title), h('p', null, r.text),
      r.energy != null ? h('div', { class: 'faint mono lab-meta' }, `Energi i materialet: ${r.energy} J/mm${r.needed ? ` · nødvendigt for at skære: ${r.needed} J/mm` : ''}`) : null);
    st.laser = { l: laser.value, m: mat.value, mode, p: opt.power, s: opt.speed, n: opt.passes }; save();
  }
  function test() {
    const g = L.laserGrid(laser.value, mat.value, mode);
    const speeds = g[0].map(c => c.speed);
    grid.replaceChildren(h('div', { class: 'lab-grid', style: { '--cols': speeds.length } },
      h('span', { class: 'lab-gh' }, '%  \\  mm/s'), ...speeds.map(s => h('span', { class: 'lab-gh' }, String(s))),
      ...g.flatMap(row => [h('span', { class: 'lab-gh' }, `${row[0].power} %`), ...row.map(c => h('button', { class: `lab-cell is-${c.tone} lv-${c.level}`, title: `${c.power} % · ${c.speed} mm/s: ${c.title}`, 'aria-label': `${c.power} procent, ${c.speed} millimeter i sekundet: ${c.title}`, onclick: () => { power.value = c.power; speed.value = c.speed; passes.value = 1; run(); } }, SHORT[c.level] || c.title))])),
    h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Klik på et felt for at bruge indstillingen. Grøn = godt, gul = næsten/for meget, rød = brændt eller forbudt, grå = intet sker.'));
  }
  [laser, mat].forEach(x => x.addEventListener('change', () => { run(); if (grid.firstChild) test(); }));
  [power, speed, passes].forEach(x => x.addEventListener('input', run));
  drawMode(); run();
  return h('div', { class: 'lab-cols' },
    panel('Opsætning', 'settings', field('Laser', laser), field('Materiale', mat), field('Bearbejdning', modeSeg),
      field('Effekt (%)', power), field('Hastighed (mm/s)', speed), field('Gennemløb', passes), vals),
    h('div', { class: 'stack' },
      panel('Resultat', 'target', out),
      panel('Materialetest', 'grid', h('p', { class: 'muted' }, 'Kør en test med 25 felter – som før du laser et nyt materiale for alvor.'), h('button', { class: 'btn', onclick: test }, icon('play'), 'Kør materialetest'), grid),
      panel('Husk', 'shield', h('ul', { class: 'g-list' }, h('li', null, 'Modellen er forenklet – brug altid en rigtig materialetest på maskinen.'), h('li', null, 'Efterlad aldrig en laser, der kører.'), h('li', null, 'PVC og vinyl må aldrig lases.')))));
}

// ── network ──
function networkLab(st, save) {
  let sc = L.netScenario();
  const term = h('div', { class: 'lab-term', role: 'log', 'aria-live': 'polite', 'aria-label': 'Terminal' });
  const input = h('input', { class: 'lab-term-in mono', 'aria-label': 'Kommando', placeholder: 'Skriv en kommando, fx ipconfig', autocomplete: 'off', spellcheck: 'false' });
  const hist = []; let hi = 0;
  const write = (lines, cls) => { for (const l of lines) term.append(h('div', { class: cls }, l || '\u00a0')); term.scrollTop = term.scrollHeight; };
  const prompt = () => 'C:\\Users\\Kunde>';
  const start = () => { clear(term); write(['Microsoft Windows [Version 10.0]', 'Laboratorium: kunden siger “internettet virker ikke”. Find ud af hvorfor.', 'Skriv help for at se kommandoerne.', '']); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && hist.length) { hi = Math.max(0, hi - 1); input.value = hist[hi]; e.preventDefault(); return; }
    if (e.key === 'ArrowDown' && hist.length) { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    const c = input.value; input.value = '';
    if (c.trim()) { hist.push(c); hi = hist.length; }
    write([`${prompt()}${c}`], 'lab-term-cmd');
    if (c.trim().toLowerCase() === 'cls') { clear(term); return; }
    write([...L.netCommand(sc, c), '']);
  });
  const quick = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, ['ipconfig', 'ipconfig /all', 'ping 192.168.1.1', 'ping 8.8.8.8', 'ping google.com', 'nslookup google.com', 'tracert 8.8.8.8'].map(c =>
    h('button', { class: 'chip', onclick: () => { input.value = c; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); input.focus(); } }, c)));
  const answer = h('div', { class: 'lab-answers' });
  const fb = h('div', { 'aria-live': 'polite' });
  const score = h('span', { class: 'chip' });
  const drawScore = () => { score.textContent = `${st.net?.right || 0} af ${st.net?.tries || 0} rigtige`; };
  const drawAnswers = () => answer.replaceChildren(...L.NET_FAULTS.map(f => h('button', { class: 'btn lab-answer', onclick: () => {
    const ok = f.id === sc.fault, right = L.NET_FAULTS.find(x => x.id === sc.fault);
    st.net = { tries: (st.net?.tries || 0) + 1, right: (st.net?.right || 0) + (ok ? 1 : 0) }; save(); drawScore();
    fb.className = `lab-result is-${ok ? 'ok' : 'bad'}`;
    fb.replaceChildren(h('b', null, ok ? 'Rigtigt!' : `Ikke helt – fejlen var: ${right.label}`), h('p', null, right.why),
      h('button', { class: 'btn btn-primary', onclick: () => { sc = L.netScenario(); fb.replaceChildren(); fb.className = ''; start(); input.focus(); } }, icon('refresh'), 'Ny computer'));
    if (ok) toast('Fejlen er fundet', { type: 'xp', text: right.label });
    logActivity('learning', 'lab', 'Netværkslab', ok ? 'Fandt fejlen' : 'Prøvede en sag', `labs:network`);
  } }, f.label)));
  start(); drawAnswers(); drawScore();
  setTimeout(() => input.focus(), 50);
  return h('div', { class: 'lab-cols' },
    h('div', { class: 'stack' }, panel('Terminal', 'terminal', term, input, quick)),
    h('div', { class: 'stack' }, panel('Hvad er fejlen?', 'help', score, answer, fb),
      panel('Fremgangsmåde', 'list', h('ol', { class: 'g-list' }, h('li', null, 'ipconfig: har computeren en adresse og en gateway?'), h('li', null, 'ping gatewayen: svarer routeren?'), h('li', null, 'ping 8.8.8.8: er der internet?'), h('li', null, 'ping google.com: virker navneopslag (DNS)?'), h('li', null, 'tracert: hvor stopper det?')))));
}

// ── cases ──
function casesLab(st, save) {
  const wrap = h('div');
  const done = () => st.cases?.done || {};
  function list() {
    const total = Object.values(done()).reduce((a, b) => a + b, 0);
    wrap.replaceChildren(
      h('div', { class: 'row', style: { gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } }, h('span', { class: 'chip' }, `${Object.keys(done()).length} af ${L.CASES.length} sager løst`), h('span', { class: 'chip chip-app' }, `${total} point`)),
      h('div', { class: 'guide-grid' }, L.CASES.map(c => h('button', { class: 'guide-card glass lab-case', onclick: () => open(c) },
        h('span', { class: 'row-icon' }, icon(done()[c.id] ? 'checkCircle' : 'tool')),
        h('div', { class: 'gc-main' }, h('h3', null, c.title), h('p', { class: 'muted' }, c.symptom), h('div', { class: 'gc-meta' }, h('span', { class: 'chip' }, c.area), done()[c.id] ? h('span', { class: 'chip chip-ok' }, `${done()[c.id]} point`) : null)),
        icon('arrowRight')))));
  }
  function open(c) {
    const used = new Set();
    const results = h('div', { class: 'stack' });
    const tests = h('div', { class: 'lab-tests' }, c.tests.map(([label, res], i) => {
      const b = h('button', { class: 'btn lab-test' }, icon('search'), label);
      b.addEventListener('click', () => { if (used.has(i)) return; used.add(i); b.disabled = true; results.append(h('div', { class: 'lab-finding glass' }, h('b', null, label), h('p', null, res))); });
      return b;
    }));
    const fb = h('div', { 'aria-live': 'polite' });
    const opts = h('div', { class: 'lab-answers' }, c.options.map((o, i) => h('button', { class: 'btn lab-answer', onclick: () => {
      const ok = i === c.a, pts = L.caseScore(ok, used.size);
      if (ok) { const d = { ...done() }; d[c.id] = Math.max(d[c.id] || 0, pts); st.cases = { done: d }; save(); toast(`+${pts} point`, { type: 'xp', text: c.title }); }
      opts.querySelectorAll('button').forEach((b, k) => { b.disabled = true; if (k === c.a) b.classList.add('is-right'); else if (k === i) b.classList.add('is-wrong'); });
      fb.className = `lab-result is-${ok ? 'ok' : 'bad'}`;
      fb.replaceChildren(h('b', null, ok ? `Rigtigt – ${pts} point (${used.size} test)` : `Ikke rigtigt. Svaret er: ${c.options[c.a]}`), h('p', null, c.why),
        h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn', onclick: () => open(c) }, icon('refresh'), 'Prøv igen'), h('button', { class: 'btn btn-primary', onclick: list }, 'Flere sager', icon('arrowRight'))));
      logActivity('learning', 'lab', 'Fejlfindingslab', `${c.title}: ${ok ? 'løst' : 'forkert'}`, `labs:cases:${c.id}`);
    } }, o)));
    wrap.replaceChildren(
      h('button', { class: 'btn btn-sm btn-ghost', onclick: list }, icon('arrowLeft'), 'Alle sager'),
      h('div', { class: 'lab-cols' },
        h('div', { class: 'stack' }, panel(c.title, 'alert', h('span', { class: 'chip' }, c.area), h('p', null, c.symptom)), panel('Vælg test', 'search', h('p', { class: 'faint' }, 'Hver test koster tid. De første to er gratis – derefter 10 point pr. test.'), tests)),
        h('div', { class: 'stack' }, panel('Resultater', 'list', results), panel('Hvad er årsagen?', 'help', opts, fb))));
  }
  list();
  return wrap;
}

// ── 3D print ──
function printLab(st, save) {
  const s0 = st.print || {};
  const fil = select(Object.entries(L.FILAMENTS).map(([k, v]) => [k, v.name]), s0.filament || 'pla', 'Filament');
  const layer = select([['0.08', '0.08 mm (meget fin)'], ['0.12', '0.12 mm (fin)'], ['0.16', '0.16 mm'], ['0.2', '0.20 mm (standard)'], ['0.24', '0.24 mm'], ['0.28', '0.28 mm (grov, hurtig)']], String(s0.layer || '0.2'), 'Lagtykkelse');
  const walls = range(1, 6, 1, s0.walls ?? 2, 'Antal vægge');
  const infill = range(0, 100, 5, s0.infill ?? 15, 'Fyld i procent');
  const speed = range(10, 300, 10, s0.speed ?? 100, 'Hastighed i mm/s');
  const temp = range(180, 260, 5, s0.temp ?? 210, 'Dysetemperatur');
  const sup = h('input', { type: 'checkbox', checked: !!s0.supports, 'aria-label': 'Support' });
  const vals = h('div', { class: 'lab-vals' });
  const stats = h('div', { class: 'lab-stats' });
  const warn = h('div', { 'aria-live': 'polite' });
  const bar = (label, v) => h('div', { class: 'lab-bar' }, h('div', { class: 'lab-bar-row' }, h('span', null, label), h('b', null, `${v}/100`)), h('div', { class: 'lab-bar-track' }, h('span', { style: { width: `${v}%` } })));
  function run() {
    const o = { filament: fil.value, layer: +layer.value, walls: +walls.value, infill: +infill.value, speed: +speed.value, temp: +temp.value, supports: sup.checked };
    const r = L.printEstimate(o);
    vals.replaceChildren(h('span', null, `${o.walls} vægge`), h('span', null, `${o.infill} % fyld`), h('span', null, `${o.speed} mm/s`), h('span', null, `${o.temp} °C`));
    const t = r.minutes >= 60 ? `${Math.floor(r.minutes / 60)} t ${r.minutes % 60} min` : `${r.minutes} min`;
    stats.replaceChildren(
      h('div', { class: 'lab-stat' }, h('span', { class: 'faint' }, 'Printtid'), h('b', null, t)),
      h('div', { class: 'lab-stat' }, h('span', { class: 'faint' }, 'Filament'), h('b', null, `${String(r.grams).replace('.', ',')} g`)),
      h('div', { class: 'lab-stat' }, h('span', { class: 'faint' }, 'Flow'), h('b', null, `${String(r.flow).replace('.', ',')} mm³/s`)),
      bar('Styrke', r.strength), bar('Kvalitet', r.quality));
    warn.className = r.warnings.length ? 'lab-result is-warn' : 'lab-result is-ok';
    warn.replaceChildren(r.warnings.length ? h('ul', { class: 'g-list' }, r.warnings.map(w => h('li', null, w))) : h('b', null, 'Ingen advarsler – det her print bør lykkes.'));
    st.print = o; save();
  }
  [fil, layer, sup].forEach(x => x.addEventListener('change', run));
  [walls, infill, speed, temp].forEach(x => x.addEventListener('input', run));
  run();
  return h('div', { class: 'lab-cols' },
    panel('Indstillinger', 'settings', h('p', { class: 'faint' }, 'Emne: et beslag på 60 × 40 × 20 mm med et overhæng.'), field('Filament', fil), field('Lagtykkelse', layer),
      field('Vægge', walls), field('Fyld (%)', infill), field('Hastighed (mm/s)', speed), field('Dysetemperatur (°C)', temp),
      h('label', { class: 'cal-pcheck' }, sup, h('span', null, 'Support')), vals),
    h('div', { class: 'stack' }, panel('Resultat', 'chart', stats), panel('Advarsler', 'alert', warn),
      panel('Prøv selv', 'target', h('ul', { class: 'g-list' }, h('li', null, 'Hvor meget hurtigere bliver det med 0,28 mm lag – og hvad sker der med kvaliteten?'), h('li', null, 'Hvad giver mest styrke: 4 vægge eller 40 % fyld?'), h('li', null, 'Sæt TPU til 150 mm/s. Hvad siger laboratoriet?')))));
}

const VIEWS = { laser: laserLab, network: networkLab, cases: casesLab, print3d: printLab };

export default {
  title: 'Øvelseslab',
  async render(ctx) {
    const app = appById('labs');
    let store;
    try { store = await appState('labs', { laser: null, net: null, cases: null, print: null }); } catch (e) { return loadError('Øvelseslab', e); }
    const st = store.data, save = () => store.save();
    const lab = LABS.find(x => x.id === ctx?.params?.sub);
    if (lab) {
      this.title = `${lab.title} · Øvelseslab`;
      logActivity('learning', 'lab', lab.title, 'Åbnede laboratoriet', `labs:${lab.id}`);
      return h('div', { class: 'page lab-page', style: { '--app': lab.hue } },
        appHero(app, { compact: true, eyebrow: 'Øvelseslab', title: lab.title, lead: lab.lead, back: { href: '#/learn/labs', label: 'Alle laboratorier' } }),
        h('div', { class: 'lab-tabs' }, LABS.map(x => h('a', { class: ['chip', x.id === lab.id && 'chip-app'], href: `#/learn/labs/${x.id}` }, icon(x.icon), x.title))),
        VIEWS[lab.id](st, save));
    }
    if (ctx?.params?.sub) { navigate('/learn/labs'); }
    const solved = Object.keys(st.cases?.done || {}).length;
    return h('div', { class: 'page lab-page' },
      appHero(app, { eyebrow: 'Læring · simulatorer', title: 'Øvelseslab', lead: 'Øv dig uden at kunne ødelægge noget: simulatorer og laboratorier til laser, netværk, fejlfinding og 3D-print.',
        stats: [{ icon: 'tool', label: 'Sager løst', value: `${solved}/${L.CASES.length}` }, { icon: 'terminal', label: 'Netværksfejl fundet', value: String(st.net?.right || 0) }] }),
      h('div', { class: 'guide-grid lab-index' }, LABS.map(x => h('a', { class: 'guide-card glass', href: `#/learn/labs/${x.id}`, style: { '--app': x.hue }, 'data-lab': x.id },
        h('span', { class: 'row-icon' }, icon(x.icon)),
        h('div', { class: 'gc-main' }, h('h3', null, x.title), h('p', { class: 'muted' }, x.lead)),
        icon('arrowRight')))));
  },
};
