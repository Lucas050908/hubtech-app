/** Ro – pure functions (unit-tested in tests/apps.test.mjs): breathing rhythms, a sleep timer that fades out, and your quiet minutes. */
export const BREATHS = {
  rolig: { name: 'Rolig vejrtrækning', text: 'Ind og ud i samme rolige tempo. Godt til at lande.', phases: [['in', 5], ['out', 5]] },
  boks: { name: 'Boksen (4-4-4-4)', text: 'Ind, hold, ud, hold – fire sekunder hver. Giver ro og fokus.', phases: [['in', 4], ['hold', 4], ['out', 4], ['rest', 4]] },
  sove: { name: '4-7-8 før søvn', text: 'Ind i 4, hold i 7, pust langsomt ud i 8. Lang udånding falder til ro.', phases: [['in', 4], ['hold', 7], ['out', 8]] },
  sukket: { name: 'Det dobbelte suk', text: 'To korte indåndinger gennem næsen og et langt suk ud gennem munden.', phases: [['in', 2], ['in2', 1], ['out', 6], ['rest', 2]] },
};
export const PHASE_TEXT = { in: 'Træk vejret ind', in2: 'Lidt mere ind', hold: 'Hold vejret', out: 'Pust langsomt ud', rest: 'Hvil' };
export const cycleSecs = (b) => b.phases.reduce((s, [, d]) => s + d, 0);
/** where you are at second t: { phase, left (seconds), progress 0..1 in the phase, cycle no., scale 0..1 for the circle } */
export function phaseAt(b, t) {
  const total = cycleSecs(b), cycle = Math.floor(t / total);
  let x = t - cycle * total, scale = 0;
  for (const [phase, d] of b.phases) {
    if (x < d) {
      const p = x / d;
      const before = b.phases.slice(0, b.phases.findIndex(q => q[0] === phase));
      const startScale = before.reduce((s, [ph]) => (ph === 'in' ? 0.8 : ph === 'in2' ? 1 : ph === 'out' ? 0 : s), 0);
      scale = phase === 'in' ? p * 0.8 : phase === 'in2' ? 0.8 + p * 0.2 : phase === 'out' ? startScale * (1 - p) : startScale;
      return { phase, left: Math.ceil(d - x), progress: p, cycle, scale: Math.round(scale * 1000) / 1000 };
    }
    x -= d;
  }
  return { phase: b.phases[0][0], left: b.phases[0][1], progress: 0, cycle: cycle + 1, scale: 0 };
}
/** sleep timer: full volume until the last minute, then a soft fade to silence */
export function fadeAt(elapsed, total, fade = 60) {
  if (!total) return 1;
  const left = total - elapsed;
  if (left <= 0) return 0;
  return left >= fade ? 1 : Math.round((left / fade) ** 2 * 1000) / 1000;
}
/** history { 'YYYY-MM-DD': minutes } → today, this week, total and days in a row */
export function summary(history, today) {
  const days = Object.keys(history).filter(d => history[d] > 0).sort();
  const prev = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10); };
  let streak = 0, d = history[today] > 0 ? today : prev(today);
  while (history[d] > 0) { streak++; d = prev(d); }
  const week = []; let w = today; for (let i = 0; i < 7; i++) { week.unshift({ day: w, min: Math.round(history[w] || 0) }); w = prev(w); }
  return { today: Math.round(history[today] || 0), total: Math.round(days.reduce((s, x) => s + history[x], 0)), streak, days: days.length, week };
}

/** short guided relaxations – one sentence at a time */
export const GUIDES = {
  krop: { name: 'Kropsscanning', mins: 5, steps: [
    'Find en god stilling, siddende eller liggende. Luk øjnene, hvis det føles rart.',
    'Mærk hvor kroppen rører underlaget. Lad den blive tung.',
    'Flyt opmærksomheden til fødderne. Bare mærk dem – du behøver ikke ændre noget.',
    'Mærk læggene og knæene. Slip spændinger, du opdager.',
    'Mærk lårene og hofterne. Lad dem synke lidt ned.',
    'Mærk maven. Den hæver sig, når du ånder ind, og synker, når du ånder ud.',
    'Mærk brystet og ryggen. Lad skuldrene falde væk fra ørerne.',
    'Mærk armene og hænderne. Lad fingrene ligge helt stille.',
    'Mærk nakken, kæben og panden. Slip kæben, og lad tungen hvile.',
    'Mærk hele kroppen på én gang. Træk vejret roligt.',
    'Når du er klar, så bevæg fingre og tæer lidt, og åbn øjnene.',
  ] },
  sanser: { name: '5-4-3-2-1', mins: 3, steps: [
    'Denne øvelse hjælper dig med at lande her og nu, når tankerne kører.',
    'Se dig omkring. Find fem ting, du kan se. Sig dem stille for dig selv.',
    'Find fire ting, du kan mærke – fx stolen, tøjet, luften mod huden.',
    'Lyt efter tre ting, du kan høre – tæt på og langt væk.',
    'Find to ting, du kan lugte – eller to lugte, du godt kan lide.',
    'Find én ting, du kan smage – eller tag en tår vand.',
    'Træk vejret dybt ind og langsomt ud. Godt gået.',
  ] },
  tak: { name: 'Tre gode ting', mins: 3, steps: [
    'Sæt dig godt til rette, og træk vejret roligt et par gange.',
    'Tænk på én ting, der gik godt i dag – stor eller lille.',
    'Hvad gjorde den god? Bliv lidt i følelsen.',
    'Tænk på en person, du er glad for at have i dit liv.',
    'Tænk på noget, du glæder dig til.',
    'Træk vejret dybt ind, og smil lidt, hvis du har lyst.',
  ] },
};
