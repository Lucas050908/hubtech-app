/**
 * Elværkstedet – HUBTECH's own electronics app (replaces CircuitPilot). No DOM here, so it is tested in node:
 *  - solveCircuit: a battery, up to three resistors (series, parallel or mixed), an optional LED and a switch
 *  - makeProblem: random calculation problems with a worked answer
 *  - FAULTS: fault finding by measuring voltages at points in a circuit
 *  - COMPONENTS: the common components, how they work and how to test them
 *  - XP, levels and badges
 */

// ── circuit simulator ─────────────────────────────────────────────────
export const LEDS = {
  red: { name: 'Rød', vf: 2.0, color: '#ef4444' }, yellow: { name: 'Gul', vf: 2.1, color: '#facc15' },
  green: { name: 'Grøn', vf: 2.2, color: '#22c55e' }, blue: { name: 'Blå', vf: 3.0, color: '#3b82f6' }, white: { name: 'Hvid', vf: 3.1, color: '#f8fafc' },
};
export const LED_MAX = 0.03;          // 30 mA: above this a normal 5 mm LED burns out
export const LED_NOMINAL = 0.02;      // 20 mA: full brightness
export const R_WATT = 0.25;           // ordinary ¼ W resistors

const par = (...rs) => 1 / rs.reduce((a, r) => a + 1 / r, 0);
/**
 * c = { v, rs: [ohm…] (1–3), mode: 'series' | 'parallel' | 'mixed' (R1 + (R2 || R3)), led: null | colour, closed: bool }
 * Returns { req, i, vLed, ledState, parts: [{ name, r, v, i, p, hot }], warnings[] }.
 */
export function solveCircuit(c) {
  const rs = (c.rs || []).filter(r => r > 0).slice(0, 3);
  const mode = rs.length < 2 ? 'series' : rs.length < 3 && c.mode === 'mixed' ? 'series' : c.mode || 'series';
  const req = !rs.length ? 0 : mode === 'series' ? rs.reduce((a, r) => a + r, 0) : mode === 'parallel' ? par(...rs) : rs[0] + par(rs[1], rs[2]);
  const led = c.led ? LEDS[c.led] : null;
  const warnings = [];
  let i = 0;
  if (c.closed !== false) {
    if (!rs.length && !led) { warnings.push('Kortslutning! Uden modstand løber der en enorm strøm – batteriet bliver varmt, og ledningerne kan brænde.'); i = Infinity; }
    else if (led && !rs.length) { i = c.v > led.vf ? Infinity : 0; if (i) warnings.push('LED uden formodstand: strømmen bliver alt for stor, og LED’en brænder af med det samme.'); }
    else i = Math.max(0, (c.v - (led ? led.vf : 0)) / req);
  }
  const vLed = led && i > 0 ? led.vf : 0;
  const vNet = Number.isFinite(i) ? i * req : 0;
  const parts = [];
  if (Number.isFinite(i)) {
    if (mode === 'series') rs.forEach((r, k) => parts.push({ name: `R${k + 1}`, r, i, v: i * r }));
    else if (mode === 'parallel') rs.forEach((r, k) => parts.push({ name: `R${k + 1}`, r, v: vNet, i: vNet / r }));
    else {
      const v1 = i * rs[0], v23 = vNet - v1;
      parts.push({ name: 'R1', r: rs[0], i, v: v1 }, { name: 'R2', r: rs[1], v: v23, i: v23 / rs[1] }, { name: 'R3', r: rs[2], v: v23, i: v23 / rs[2] });
    }
    for (const p of parts) { p.p = p.v * p.i; p.hot = p.p > R_WATT; if (p.hot) warnings.push(`${p.name} afsætter ${fmt(p.p, 'W')} – mere end en almindelig ¼ W-modstand kan tåle. Den bliver meget varm.`); }
  }
  let ledState = null;
  if (led) {
    ledState = c.closed === false ? 'off' : !Number.isFinite(i) || i > LED_MAX ? 'burnt' : c.v <= led.vf ? 'off' : i < 0.001 ? 'dim' : i < LED_NOMINAL * 0.6 ? 'dim' : 'on';
    if (ledState === 'burnt' && Number.isFinite(i)) warnings.push(`${fmt(i, 'A')} gennem LED’en – over 30 mA brænder den af. Brug en større formodstand.`);
    if (c.closed !== false && c.v <= led.vf) warnings.push(`Spændingen (${c.v} V) er lavere end LED’ens ledespænding (${led.vf} V) – den lyser ikke.`);
  }
  return { req, i, vLed, ledState, parts, mode, warnings, brightness: led && ledState !== 'burnt' && Number.isFinite(i) ? Math.min(1, i / LED_NOMINAL) : 0 };
}

/** 0.0468 A → "46,8 mA", 1500 Ω → "1,5 kΩ". */
export function fmt(x, unit = '', digits = 3) {
  if (!Number.isFinite(x)) return '∞';
  if (x === 0) return `0 ${unit}`.trim();
  const P = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ']];
  const ax = Math.abs(x);
  const [f, p] = P.find(([f]) => ax >= f) || P[P.length - 1];
  const v = x / f;
  return `${Number(v.toPrecision(digits)).toString().replace('.', ',')} ${p}${unit}`.trim();
}
const nice = (x) => Number(x.toPrecision(3));

// ── calculation problems ──────────────────────────────────────────────
const pick = (r, a) => a[Math.floor(r() * a.length)];
const E12 = [100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820];
/** Each kind returns { kind, q, answer, unit, tol (relative), hint, how }. */
const KINDS = {
  ohmI: (r) => { const v = pick(r, [3, 5, 9, 12, 24]), R = pick(r, E12); return { q: `Et ${v} V batteri sidder over en modstand på ${R} Ω. Hvor stor er strømmen i mA?`, answer: nice(v / R * 1000), unit: 'mA', hint: 'I = U / R – og gang med 1000 for at få mA.', how: `I = ${v} / ${R} = ${fmt(v / R, 'A')}` }; },
  ohmU: (r) => { const i = pick(r, [10, 20, 25, 40, 50]), R = pick(r, E12); return { q: `Der løber ${i} mA gennem en modstand på ${R} Ω. Hvor stor er spændingen over den i V?`, answer: nice(i / 1000 * R), unit: 'V', hint: 'U = R × I (husk at mA skal være A).', how: `U = ${R} × ${i / 1000} = ${nice(i / 1000 * R)} V` }; },
  power: (r) => { const v = pick(r, [5, 12, 24, 230]), i = pick(r, [0.1, 0.5, 1, 2, 4]); return { q: `Et apparat på ${v} V trækker ${String(i).replace('.', ',')} A. Hvor stor er effekten i W?`, answer: nice(v * i), unit: 'W', hint: 'P = U × I.', how: `P = ${v} × ${i} = ${nice(v * i)} W` }; },
  current230: (r) => { const p = pick(r, [460, 1150, 2000, 2300, 3000]); return { q: `En elkedel på ${p} W tilsluttes 230 V. Hvor mange ampere trækker den?`, answer: nice(p / 230), unit: 'A', hint: 'I = P / U.', how: `I = ${p} / 230 = ${nice(p / 230)} A` }; },
  led: (r) => { const v = pick(r, [5, 9, 12]), c = pick(r, Object.keys(LEDS)), i = 20; const L = LEDS[c]; return { q: `En ${L.name.toLowerCase()} LED (Uf = ${String(L.vf).replace('.', ',')} V, ${i} mA) skal sidde på ${v} V. Hvor stor formodstand i Ω?`, answer: nice((v - L.vf) / (i / 1000)), unit: 'Ω', hint: 'R = (U − Uf) / I – I skal være i A.', how: `R = (${v} − ${L.vf}) / 0,02 = ${nice((v - L.vf) / 0.02)} Ω` }; },
  series: (r) => { const a = pick(r, E12), b = pick(r, E12) * 10; return { q: `${a} Ω og ${b} Ω sidder i serie. Hvad er den samlede modstand i Ω?`, answer: a + b, unit: 'Ω', hint: 'I serie lægges modstandene sammen.', how: `${a} + ${b} = ${a + b} Ω` }; },
  parallel: (r) => { const a = pick(r, E12), b = pick(r, E12); return { q: `${a} Ω og ${b} Ω sidder parallelt. Hvad er den samlede modstand i Ω?`, answer: nice(par(a, b)), unit: 'Ω', hint: 'To parallelle: R = (R1 × R2) / (R1 + R2).', how: `(${a} × ${b}) / (${a} + ${b}) = ${nice(par(a, b))} Ω` }; },
  divider: (r) => { const vin = pick(r, [5, 9, 12]), r1 = pick(r, E12) * 10, r2 = pick(r, E12) * 10; return { q: `Spændingsdeler: Uind = ${vin} V, R1 = ${r1} Ω (øverst), R2 = ${r2} Ω (nederst). Hvad er Uud over R2 i V?`, answer: nice(vin * r2 / (r1 + r2)), unit: 'V', hint: 'Uud = Uind × R2 / (R1 + R2).', how: `${vin} × ${r2} / ${r1 + r2} = ${nice(vin * r2 / (r1 + r2))} V` }; },
  rc: (r) => { const R = pick(r, [1, 4.7, 10, 22, 47]), C = pick(r, [10, 47, 100, 220]); return { q: `R = ${String(R).replace('.', ',')} kΩ og C = ${C} µF. Hvad er tidskonstanten τ i sekunder?`, answer: nice(R * 1000 * C / 1e6), unit: 's', hint: 'τ = R × C (i ohm og farad).', how: `τ = ${R * 1000} × ${C / 1e6} = ${nice(R * C / 1000)} s` }; },
  battery: (r) => { const mah = pick(r, [1000, 2000, 2500, 5000, 10000]), ma = pick(r, [50, 100, 200, 250, 500]); return { q: `En powerbank på ${mah} mAh driver et apparat, der bruger ${ma} mA. Hvor mange timer holder den (teoretisk)?`, answer: nice(mah / ma), unit: 'timer', hint: 'Timer = kapacitet (mAh) / strøm (mA).', how: `${mah} / ${ma} = ${nice(mah / ma)} timer` }; },
};
export const PROBLEM_KINDS = Object.keys(KINDS);
export const KIND_LABEL = { ohmI: 'Ohms lov (strøm)', ohmU: 'Ohms lov (spænding)', power: 'Effekt', current230: 'Strøm på 230 V', led: 'LED-formodstand', series: 'Serie', parallel: 'Parallel', divider: 'Spændingsdeler', rc: 'RC-tidskonstant', battery: 'Batteritid' };
export function makeProblem(kind = null, r = Math.random) { const k = kind && KINDS[kind] ? kind : pick(r, PROBLEM_KINDS); return { kind: k, tol: 0.02, ...KINDS[k](r) }; }
/** "46,8", "0.0468", "4k7" (not for these units), with or without unit. */
export function parseAnswer(s) {
  let t = String(s ?? '').trim().replace(/[^0-9.,\-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');            // Danish: 1.150,5
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');      // 1.150 = one thousand one hundred and fifty
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
export const checkAnswer = (p, input) => { const n = parseAnswer(input); return n !== null && Math.abs(n - p.answer) <= Math.max(Math.abs(p.answer) * p.tol, 0.0005); };

// ── fault finding with a voltmeter ────────────────────────────────────
/** points: [label, reading]; options; a = right one. */
export const FAULTS = [
  { id: 'lamp-wire', title: 'Lampen lyser ikke', setup: '9 V batteri → kontakt → ledning → pære → tilbage til batteriet. Kontakten er tændt.',
    points: [['Over batteriet', '9,1 V'], ['Over kontakten (tændt)', '0 V'], ['Fra kontakt til pærens stik', '9,1 V'], ['Over pæren', '0 V']],
    options: ['Batteriet er fladt', 'Kontakten er i stykker', 'Afbrydelse i ledningen mellem kontakt og pære', 'Pæren er sprunget'], a: 2,
    why: 'Hele spændingen ligger over et stykke ledning – så er der en afbrydelse netop dér. Over en hel ledning skal der være ca. 0 V.' },
  { id: 'lamp-bulb', title: 'Lampen lyser stadig ikke', setup: 'Samme kredsløb: 9 V → kontakt → pære. Kontakten er tændt.',
    points: [['Over batteriet', '9,1 V'], ['Over kontakten (tændt)', '0 V'], ['Over pæren', '9,1 V'], ['Modstand i pæren (strøm slukket)', '∞ (OL)']],
    options: ['Pæren er sprunget', 'Kontakten er i stykker', 'Batteriet er fladt', 'Kortslutning'], a: 0,
    why: 'Fuld spænding over pæren, men den lyser ikke, og den måler uendelig modstand: glødetråden er brændt over.' },
  { id: 'switch', title: 'Ventilatoren starter ikke', setup: '12 V forsyning → kontakt → motor. Kontakten er tændt.',
    points: [['Over forsyningen', '12,0 V'], ['Over kontakten (tændt)', '12,0 V'], ['Over motoren', '0 V']],
    options: ['Motoren er brændt af', 'Kontakten leder ikke', 'Forsyningen er død', 'Sikringen er sprunget'], a: 1,
    why: 'En tændt kontakt skal have ca. 0 V over sig. 12 V over den betyder, at den ikke slutter – kontakten er defekt.' },
  { id: 'flat', title: 'Lommelygten er svag', setup: 'To AA-batterier i serie (nominelt 3 V) → LED med formodstand.',
    points: [['Over batterierne uden belastning', '2,6 V'], ['Over batterierne med lygten tændt', '2,1 V'], ['Over LED’en', '2,0 V']],
    options: ['Batterierne er ved at være flade', 'LED’en er i stykker', 'Formodstanden er for lille', 'Kontakten er snavset'], a: 0,
    why: 'Nye AA-batterier giver ca. 1,5 V hver (3,0–3,2 V i alt). 2,6 V og et stort fald under belastning betyder flade batterier.' },
  { id: 'led-backward', title: 'LED’en lyser ikke', setup: '5 V → 150 Ω → LED → stel. Alt er nyt.',
    points: [['Over forsyningen', '5,0 V'], ['Over modstanden', '0 V'], ['Over LED’en', '5,0 V'], ['Diodetest på LED’en (rød på anoden)', 'Lyser svagt']],
    options: ['Modstanden er brændt over', 'LED’en sidder omvendt', 'Forsyningen er for lav', 'LED’en er brændt af'], a: 1,
    why: 'Hele spændingen ligger over LED’en, og der løber ingen strøm. Diodetesten viser, at den virker – den sidder bare omvendt (det lange ben er plus).' },
  { id: 'resistor-open', title: 'Ingen strøm i kredsen', setup: '12 V → R1 (1 kΩ) → R2 (1 kΩ) → stel. Man forventer 6 V over hver.',
    points: [['Over forsyningen', '12,0 V'], ['Over R1', '12,0 V'], ['Over R2', '0 V']],
    options: ['R1 er brændt over (afbrudt)', 'R2 er kortsluttet', 'Forsyningen er i stykker', 'Ledningen til stel mangler'], a: 0,
    why: 'Når en modstand i en seriekreds er afbrudt, ligger hele spændingen over netop den, og der er 0 V over resten.' },
  { id: 'resistor-short', title: 'Spændingen er forkert', setup: '12 V → R1 (1 kΩ) → R2 (1 kΩ) → stel. Man forventer 6 V over hver.',
    points: [['Over forsyningen', '12,0 V'], ['Over R1', '0 V'], ['Over R2', '12,0 V'], ['Modstand over R1 (strøm slukket)', '0,2 Ω']],
    options: ['R1 er kortsluttet', 'R2 er afbrudt', 'Forsyningen giver for meget', 'Multimeteret er forkert indstillet'], a: 0,
    why: '0 V over R1 og næsten 0 Ω betyder kortslutning (fx en tinbro). Hele spændingen havner så over R2.' },
  { id: 'fuse', title: 'Intet virker i bilradioen', setup: '12 V fra bilen → sikring 5 A → radio.',
    points: [['Over bilens batteri', '12,6 V'], ['Over sikringen', '12,6 V'], ['Over radioen', '0 V']],
    options: ['Radioen er død', 'Sikringen er sprunget', 'Batteriet er fladt', 'Antennen er knækket'], a: 1,
    why: 'En hel sikring har ca. 0 V over sig. Fuld spænding over sikringen betyder, at den er sprunget. Find årsagen, før du skifter den.' },
];
export const faultScore = (right, measured) => (right ? Math.max(30, 60 - Math.max(0, measured - 2) * 10) : 0);

// ── components ────────────────────────────────────────────────────────
export const COMPONENTS = [
  { id: 'r', name: 'Modstand', sym: 'resistor', unit: 'ohm (Ω)', what: 'Begrænser strømmen og deler spændingen. Værdien står som farvekode.', use: 'Formodstand til LED, spændingsdeler, strømbegrænsning.', test: 'Mål modstanden med multimeteret, mens kredsløbet er slukket – helst med det ene ben løftet.', watch: 'Effekten (P = U × I) må ikke overstige modstandens watt-tal.' },
  { id: 'c', name: 'Kondensator', sym: 'capacitor', unit: 'farad (µF, nF, pF)', what: 'Gemmer elektrisk ladning. Udglatter spænding og bruges til timing.', use: 'Afkobling ved IC’er, udglatning i strømforsyninger, RC-tidskreds.', test: 'Mange multimetre kan måle kapacitet. Aflad den først! Elektrolytter kan bule ud, når de er slidte.', watch: 'Elektrolytkondensatorer har polaritet – sidder de omvendt, kan de eksplodere.' },
  { id: 'd', name: 'Diode', sym: 'diode', unit: 'ledespænding ca. 0,7 V (silicium)', what: 'Leder kun strøm i én retning.', use: 'Ensretter, beskyttelse mod forkert polaritet, frihjulsdiode over relæspoler.', test: 'Diodetest: ca. 0,5–0,7 V den ene vej og OL den anden.', watch: 'Stregen på dioden er katoden (minus).' },
  { id: 'led', name: 'LED', sym: 'led', unit: 'Uf 1,8–3,3 V, typisk 20 mA', what: 'En diode, der lyser. Farven afgør ledespændingen.', use: 'Indikatorer, belysning, displays.', test: 'Diodetest – mange multimetre får LED’en til at lyse svagt.', watch: 'Altid formodstand. Det lange ben er plus (anode).' },
  { id: 'npn', name: 'Transistor (NPN)', sym: 'npn', unit: 'forstærkning β ca. 50–300', what: 'En lille basisstrøm styrer en stor strøm fra kollektor til emitter. Bruges som kontakt eller forstærker.', use: 'Tænde relæer, motorer og LED-strips fra en mikrocontroller.', test: 'Diodetest fra basis til kollektor og fra basis til emitter: begge ca. 0,6–0,7 V.', watch: 'Husk modstand til basis, og frihjulsdiode ved spoler.' },
  { id: 'relay', name: 'Relæ', sym: 'relay', unit: 'spolespænding fx 5 V / 12 V', what: 'En elektrisk styret kontakt: en spole trækker kontakterne sammen.', use: 'Styre 230 V eller store strømme fra et lille signal.', test: 'Mål spolens modstand, og lyt efter klik, når den får spænding.', watch: 'Spolen giver en spændingsspids, når den slukkes – brug en diode over den.' },
  { id: 'fuse', name: 'Sikring', sym: 'fuse', unit: 'ampere (A)', what: 'Brænder over, hvis strømmen bliver for stor – og beskytter ledninger og apparater.', use: 'I alle strømforsyninger, biler og eltavler.', test: 'Gennemgangstest: en hel sikring bipper (ca. 0 Ω).', watch: 'Skift altid til samme værdi – og find årsagen, før du skifter.' },
  { id: 'pot', name: 'Potentiometer', sym: 'pot', unit: 'ohm (Ω)', what: 'En justerbar modstand med en glider – en spændingsdeler, du kan dreje på.', use: 'Volumenknapper, lysdæmpere, indstilling af kredsløb.', test: 'Mål mellem et yderben og midterbenet, mens du drejer – værdien skal ændre sig jævnt.', watch: 'Krasler det i en lydknap, er sporet slidt eller snavset.' },
];

// ── XP, levels, badges ────────────────────────────────────────────────
export const LEVELS = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 12000, 18000];
export const LEVEL_NAMES = ['Lærling', 'Loddekolbe', 'Kredsløbsbygger', 'Fejlfinder', 'Tekniker', 'Elektroniker', 'Specialist', 'Ekspert', 'Mester', 'Legende'];
export function levelOf(xp = 0) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1]) i++;
  const next = LEVELS[i + 1];
  return { level: i + 1, name: LEVEL_NAMES[i], from: LEVELS[i], next: next ?? null, pct: next ? Math.round((xp - LEVELS[i]) / (next - LEVELS[i]) * 100) : 100 };
}
export const BADGES = [
  { id: 'first-circuit', name: 'Første kredsløb', icon: 'plug', test: (s) => (s.stats?.sims || 0) >= 1 },
  { id: 'led-safe', name: 'LED’en overlevede', icon: 'sun', test: (s) => !!s.stats?.ledOk },
  { id: 'burnt', name: 'Det lugter brændt', icon: 'flame', test: (s) => !!s.stats?.ledBurnt },
  { id: 'calc10', name: '10 rigtige udregninger', icon: 'calculator', test: (s) => (s.stats?.right || 0) >= 10 },
  { id: 'calc50', name: '50 rigtige udregninger', icon: 'trophy', test: (s) => (s.stats?.right || 0) >= 50 },
  { id: 'streak5', name: '5 i træk', icon: 'sparkles', test: (s) => (s.stats?.bestStreak || 0) >= 5 },
  { id: 'faults3', name: 'Fejlfinder', icon: 'search', test: (s) => Object.keys(s.faults || {}).length >= 3 },
  { id: 'faultsAll', name: 'Alle fejl fundet', icon: 'award', test: (s) => Object.keys(s.faults || {}).length >= FAULTS.length },
  { id: 'days3', name: '3 dage i træk', icon: 'calendar', test: (s) => (s.stats?.streakDays || 0) >= 3 },
];
/** New badges after a change (ids), and the state's badge list updated. */
export function awardBadges(s) {
  const have = new Set(s.achievements || []), got = [];
  for (const b of BADGES) if (!have.has(b.id) && b.test(s)) { have.add(b.id); got.push(b); }
  s.achievements = [...have];
  return got;
}
/** Count today for the day streak. */
export function touchDay(s, today) {
  const st = s.stats || (s.stats = {});
  if (st.lastDay === today) return;
  const y = new Date(new Date(`${today}T12:00`).getTime() - 86400000).toISOString().slice(0, 10);
  st.streakDays = st.lastDay === y ? (st.streakDays || 0) + 1 : 1;
  st.lastDay = today;
}
