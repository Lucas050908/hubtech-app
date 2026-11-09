/** Pure helpers for Karakterer, Tekstværktøjer (LIX), Lykkehjul og hold, Farver and Sparegris. */

// ── Karakterer: the Danish 7-point scale ──
export const SCALE = [12, 10, 7, 4, 2, 0, -3];
export const ECTS = { 12: 'A', 10: 'B', 7: 'C', 4: 'D', 2: 'E', 0: 'Fx', '-3': 'F' };
export const GRADE_TEXT = { 12: 'Den fremragende præstation', 10: 'Den fortrinlige præstation', 7: 'Den gode præstation', 4: 'Den jævne præstation', 2: 'Den tilstrækkelige præstation', 0: 'Den utilstrækkelige præstation', '-3': 'Den ringe præstation' };
/** weighted average of [{ grade, weight }], rounded to one decimal (as on diplomas) */
export function average(rows) {
  const ok = rows.filter(r => SCALE.includes(Number(r.grade)) && Number(r.weight) > 0);
  const w = ok.reduce((a, r) => a + Number(r.weight), 0);
  if (!w) return null;
  return Math.round(ok.reduce((a, r) => a + Number(r.grade) * Number(r.weight), 0) / w * 10) / 10;
}
/** what grade is needed in the next subject (with weight) to reach a target average */
export function needed(rows, target, weight = 1) {
  const ok = rows.filter(r => SCALE.includes(Number(r.grade)) && Number(r.weight) > 0);
  const w = ok.reduce((a, r) => a + Number(r.weight), 0), sum = ok.reduce((a, r) => a + Number(r.grade) * Number(r.weight), 0);
  const raw = (target * (w + weight) - sum) / weight;
  return SCALE.slice().reverse().find(g => g >= raw - 1e-9) ?? null;     // the lowest grade that is enough, or null if even 12 isn't
}

// ── Tekstværktøjer ──
export function textStats(t) {
  const words = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const sentences = t.split(/[.!?:]+(?=\s|$)|\n{2,}/).filter(s => /[\p{L}\p{N}]/u.test(s));
  const long = words.filter(w => w.length > 6).length;
  const lix = words.length ? Math.round(words.length / Math.max(1, sentences.length) + (long * 100) / words.length) : 0;
  return { chars: t.length, charsNoSpace: t.replace(/\s/g, '').length, words: words.length, sentences: sentences.length, paragraphs: t.split(/\n\s*\n/).filter(p => p.trim()).length, lix, readMin: Math.max(1, Math.round(words.length / 200)), long };
}
export function lixText(lix) {
  if (lix < 25) return 'Let – børnebøger';
  if (lix < 35) return 'Let – ugeblade og skønlitteratur for børn';
  if (lix < 45) return 'Middel – almindelig avistekst og skønlitteratur';
  if (lix < 55) return 'Svær – sagprosa og fagtekster';
  return 'Meget svær – faglitteratur og lovtekster';
}
export const titleCase = (t) => t.toLowerCase().replace(/(^|[\s(“"'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export const sentenceCase = (t) => t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export const uniqueLines = (t) => [...new Set(t.split('\n'))].join('\n');
export const sortLines = (t, desc = false) => t.split('\n').sort((a, b) => a.localeCompare(b, 'da') * (desc ? -1 : 1)).join('\n');
export function topWords(t, n = 10) {
  const stop = new Set('og i at det en den til er som på de med han af for ikke der var mig sig men et har om vi min havde ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind når være dog noget ville jo deres efter ned skulle denne end dette mit også under have dig anden hende mine alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes været thi jer sådan'.split(' '));
  const c = new Map();
  for (const w of (t.toLowerCase().match(/\p{L}[\p{L}'’-]*/gu) || [])) if (w.length > 2 && !stop.has(w)) c.set(w, (c.get(w) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'da')).slice(0, n);
}

// ── Lykkehjul og hold ──
export function shuffle(a, rnd = Math.random) { const t = a.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; }
/** split names into n teams as evenly as possible */
export function teams(names, n, rnd = Math.random) {
  const out = Array.from({ length: Math.max(1, n) }, () => []);
  shuffle(names, rnd).forEach((x, i) => out[i % out.length].push(x));
  return out;
}
/** teams of a given size (the last ones may get one more) */
export function teamsOfSize(names, size, rnd = Math.random) { return teams(names, Math.max(1, Math.floor(names.length / Math.max(1, size))), rnd); }

// ── Farver ──
export function hexToRgb(hex) { const m = String(hex).trim().replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let s = m[1]; if (s.length === 3) s = [...s].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); }
export const rgbToHex = (r, g, b) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; }
  return [Math.round(hh), Math.round(s * 100), Math.round(l * 100)];
}
export function hslToRgb(hh, s, l) {
  s /= 100; l /= 100; const k = (n) => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
const lum = ([r, g, b]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export function contrast(a, b) { const A = lum(hexToRgb(a)), B = lum(hexToRgb(b)); return Math.round(((Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05)) * 100) / 100; }
export const wcag = (ratio) => ({ aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7 });
/** palettes from one colour */
export function palette(hex, kind) {
  const [hh, s, l] = rgbToHsl(...hexToRgb(hex)), H = (d) => rgbToHex(...hslToRgb((hh + d + 360) % 360, s, l));
  if (kind === 'complement') return [hex, H(180)];
  if (kind === 'triad') return [hex, H(120), H(240)];
  if (kind === 'analog') return [H(-30), hex, H(30)];
  if (kind === 'split') return [hex, H(150), H(210)];
  return [90, 75, 60, 45, 30, 15].map(L => rgbToHex(...hslToRgb(hh, s, L)));      // shades
}

// ── Sparegris ──
/** how many weeks until a goal with a weekly amount (0 if reached, null if never) */
export function weeksToGoal(saved, goal, perWeek) { if (saved >= goal) return 0; if (!(perWeek > 0)) return null; return Math.ceil((goal - saved) / perWeek); }
