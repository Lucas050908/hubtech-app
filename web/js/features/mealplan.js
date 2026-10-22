/** Madplan – pure functions (unit-tested in tests/apps.test.mjs): ingredient lines, scaling, weeks and the shopping list. */

// unit → [base, factor]; weights become grams, volumes millilitres, the rest stays as it is
const UNIT = {
  g: ['g', 1], gram: ['g', 1], kg: ['g', 1000],
  ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000], liter: ['ml', 1000],
  tsk: ['tsk', 1], spsk: ['spsk', 1], stk: ['stk', 1], fed: ['fed', 1], 'dåse': ['dåse', 1], 'dåser': ['dåse', 1],
  pk: ['pk', 1], pakke: ['pk', 1], pakker: ['pk', 1], bdt: ['bdt', 1], bundt: ['bdt', 1], skive: ['skiver', 1], skiver: ['skiver', 1], knivspids: ['knivspids', 1],
};
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** "1 ½ dl mælk", "500 g hakket oksekød", "2 løg", "salt og peber" → { amount, unit, name } */
export function parseIngredient(line) {
  let t = String(line || '').trim().replace(/^[-•*]\s*/, '');
  if (!t) return null;
  let amount = null;
  const fr = /^(?:(\d+)\s+)?(\d+)\/(\d+)\s*/.exec(t);              // "1/2" or "1 1/2"
  const m = /^(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔])?\s*/.exec(t);
  if (fr && Number(fr[3])) { amount = (fr[1] ? Number(fr[1]) : 0) + Number(fr[2]) / Number(fr[3]); t = t.slice(fr[0].length); }
  else if (m && (m[1] || m[2])) { amount = (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? FRAC[m[2]] : 0); t = t.slice(m[0].length); }
  let unit = '';
  const u = /^([a-zæøå]+)\.?\s+/i.exec(t);
  if (amount != null && u && UNIT[u[1].toLowerCase()]) { unit = u[1].toLowerCase(); t = t.slice(u[0].length); }
  return { amount, unit, name: t.trim() };
}
/** an ingredient back to text, with the amount multiplied by `k` */
export function formatIngredient(ing, k = 1) {
  if (ing.amount == null) return ing.name;
  return `${fmtAmount(ing.amount * k, ing.unit)}${ing.unit ? ` ${ing.unit}` : ''} ${ing.name}`.trim();
}
export function fmtAmount(n, unit = '') {
  if (['g', 'ml'].includes(unit) && n >= 10) return String(Math.round(n / 5) * 5);
  const whole = Math.floor(n), rest = n - whole;
  const frac = Math.abs(rest - 0.5) < 0.02 ? '½' : Math.abs(rest - 0.25) < 0.02 ? '¼' : Math.abs(rest - 0.75) < 0.02 ? '¾' : null;
  if (frac && n < 20) return whole ? `${whole} ${frac}` : frac;
  return (Math.round(n * 10) / 10).toLocaleString('da-DK');
}
/** grams/millilitres shown in the nicest unit */
export function nice(amount, base) {
  if (base === 'g' && amount >= 1000) return [amount / 1000, 'kg'];
  if (base === 'ml' && amount >= 1000) return [amount / 1000, 'l'];
  if (base === 'ml' && amount >= 100 && amount % 50 === 0) return [amount / 100, 'dl'];
  return [amount, base];
}

// ── weeks ──
export const DAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** the Monday of the week that `date` is in (YYYY-MM-DD) */
export function weekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
export function addDays(isoDate, n) { const [y, m, d] = isoDate.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); }
/** ISO week number */
export function weekNo(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

// ── shopping ──
const AISLES = [
  ['Frugt og grønt', /løg|hvidløg|gulerod|gulerødder|kartof|porre|tomat|agurk|salat|broccoli|blomkål|peberfrugt|squash|citron|lime|æble|banan|pære|bær|spinat|kål|persille|dild|purløg|basilikum|ingefær|champignon|svampe|majs|ærter|bønner|avocado|selleri|rødbede|pastinak|frugt/i],
  ['Kød og fisk', /kød|kylling|svin|okse|kalv|lam|bacon|pølse|skinke|laks|torsk|fisk|rejer|tun|filet|frikadelle|hakket/i],
  ['Mejeri og æg', /mælk|fløde|smør|ost|yoghurt|skyr|creme fraiche|cremefraiche|æg\b|æg$|kvark|parmesan|mozzarella|feta/i],
  ['Brød og kolonial', /mel|sukker|ris|pasta|spaghetti|nudler|brød|tortilla|havregryn|bouillon|olie|eddike|ketchup|sennep|krydderi|karry|paprika|oregano|kanel|bagepulver|gær|dåse|pure|puré|soja|honning|syltetøj|nødder|rosiner/i],
];
const PLURAL = { 'gulerødder': 'gulerod', 'tomater': 'tomat', 'æbler': 'æble', 'citroner': 'citron', 'agurker': 'agurk', 'peberfrugter': 'peberfrugt', 'kartofler': 'kartoffel', 'bananer': 'banan' };
const PLURAL_OF = Object.fromEntries(Object.entries(PLURAL).map(([p, one]) => [one, p]));
/** "2 gulerødder" and "1 gulerod" end up on the same line */
export const singular = (name) => name.split(' ').map(w => PLURAL[w] || w).join(' ');
export const PANTRY = /^(salt|peber|salt og peber|vand|olie|olivenolie|smør til stegning)$/i;
export function aisleOf(name) {
  for (const [a, rx] of AISLES) if (rx.test(name)) return a;
  return 'Andet';
}
/**
 * The shopping list for a week.
 * recipes: [{ id, servings, ingredients: [line] }], plan: { 0..6: { id, servings } }
 * → [{ key, name, text, aisle, pantry, from: [recipe names] }]
 */
export function shoppingList(recipes, plan) {
  const map = new Map();
  for (const day of Object.values(plan || {})) {
    const r = recipes.find(x => x.id === day?.id);
    if (!r) continue;
    const k = (day.servings || r.servings || 4) / (r.servings || 4);
    for (const line of r.ingredients || []) {
      const ing = parseIngredient(line);
      if (!ing || !ing.name) continue;
      const [base, f] = ing.unit ? UNIT[ing.unit] : ['', 1];
      const name = singular(ing.name.toLowerCase().replace(/\s+/g, ' '));
      const key = `${name}|${ing.amount == null ? '-' : base}`;
      const it = map.get(key) || { key, name: ing.name, base, amount: ing.amount == null ? null : 0, from: [] };
      if (ing.amount != null) it.amount += ing.amount * k * f;
      if (!it.from.includes(r.name)) it.from.push(r.name);
      map.set(key, it);
    }
  }
  return [...map.values()].map(it => {
    let text = it.name;
    if (it.amount != null) {
      const [a, u] = nice(it.amount, it.base);
      const name = !u && a > 1 ? it.name.split(' ').map(w => PLURAL_OF[singular(w.toLowerCase())] || w).join(' ') : it.name;
      text = `${fmtAmount(a, u)}${u ? ` ${u}` : ''} ${name}`;
    }
    return { key: it.key, name: it.name, text, aisle: aisleOf(it.name), pantry: PANTRY.test(it.name), from: it.from };
  }).sort((a, b) => a.aisle.localeCompare(b.aisle, 'da') || a.name.localeCompare(b.name, 'da'));
}
/** recipes to fill the empty days with – no repeats until all are used */
export function fillWeek(recipes, plan, r = Math.random, servings = 4) {
  const out = { ...plan };
  const used = new Set(Object.values(out).map(d => d?.id));
  let pool = recipes.filter(x => !used.has(x.id));
  for (let i = 0; i < 7; i++) {
    if (out[i]?.id) continue;
    if (!pool.length) pool = [...recipes];
    if (!pool.length) break;
    const pick = pool.splice(Math.floor(r() * pool.length), 1)[0];
    out[i] = { id: pick.id, servings };
  }
  return out;
}
