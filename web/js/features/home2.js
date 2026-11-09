/** Logic for Fødselsdage, Pakkeliste, Udlån and Plantepasser (pure, unit-tested). */

const DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// ── Fødselsdage ──
/** next birthday on or after `today` for a 'YYYY-MM-DD' (or '--MM-DD' with no year); 29 Feb falls on 1 Mar in other years */
export function nextBirthday(date, today = new Date()) {
  const mt = /^(\d{4}|-)-(\d{2})-(\d{2})$/.exec(date || ''); if (!mt) return null;
  const [, y, m, d] = mt;
  const t = startOfDay(today), mm = Number(m) - 1, dd = Number(d);
  const on = (yr) => { const x = new Date(yr, mm, dd); if (x.getMonth() !== mm) return new Date(yr, mm + 1, 1); return x; };
  let next = on(t.getFullYear()); if (next < t) next = on(t.getFullYear() + 1);
  const days = Math.round((next - t) / DAY), born = /^\d{4}$/.test(y) ? Number(y) : null;
  return { date: next, days, turns: born ? next.getFullYear() - born : null };
}
export const ageOn = (date, today = new Date()) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); if (!m) return null;
  const t = startOfDay(today); let a = t.getFullYear() - Number(m[1]);
  if (t.getMonth() + 1 < Number(m[2]) || (t.getMonth() + 1 === Number(m[2]) && t.getDate() < Number(m[3]))) a--;
  return a;
};
export const ZODIAC = [['Stenbukken', 1, 19], ['Vandmanden', 2, 18], ['Fiskene', 3, 20], ['Vædderen', 4, 19], ['Tyren', 5, 20], ['Tvillingerne', 6, 20], ['Krebsen', 7, 22], ['Løven', 8, 22], ['Jomfruen', 9, 22], ['Vægten', 10, 22], ['Skorpionen', 11, 21], ['Skytten', 12, 21], ['Stenbukken', 12, 31]];
export function zodiac(date) { const m = /(\d{2})-(\d{2})$/.exec(date); if (!m) return null; const mm = Number(m[1]), dd = Number(m[2]); for (const [n, M, D] of ZODIAC) if (mm < M || (mm === M && dd <= D)) return n; return 'Stenbukken'; }
export const ROUND = (n) => n != null && (n % 10 === 0 || n === 18 || n === 25 || n === 15);

// ── Pakkeliste ──
export const PACK_TEMPLATES = {
  basis: { label: 'Altid', items: ['Telefon', 'Oplader', 'Pung / kort', 'Nøgler', 'Tandbørste', 'Tandpasta', 'Medicin', 'Undertøj', 'Sokker', 'Pyjamas'] },
  sommer: { label: 'Sommerferie', items: ['Badetøj', 'Håndklæde', 'Solcreme', 'Solbriller', 'Kasket', 'Shorts', 'T-shirts', 'Sandaler', 'Vandflaske'] },
  vinter: { label: 'Vinterferie', items: ['Skibukser', 'Jakke', 'Hue', 'Vanter', 'Halsedisse', 'Uldundertøj', 'Skibriller', 'Læbepomade', 'Varme sokker'] },
  lejr: { label: 'Lejr / spejder', items: ['Sovepose', 'Liggeunderlag', 'Lommelygte', 'Regntøj', 'Gummistøvler', 'Drikkedunk', 'Madpakke', 'Kniv', 'Myggebalsam'] },
  fly: { label: 'Flyrejse', items: ['Pas', 'Boardingkort', 'Hovedtelefoner', 'Nakkepude', 'Snacks', 'Rejseadapter', 'Powerbank'] },
  sport: { label: 'Sport / træning', items: ['Sportstøj', 'Sko', 'Drikkedunk', 'Håndklæde', 'Shampoo', 'Skiftetøj'] },
  skole: { label: 'Skoletaske', items: ['Computer', 'Oplader', 'Penalhus', 'Bøger', 'Madpakke', 'Drikkedunk', 'Idrætstøj'] },
};
/** merge templates into a list without duplicates (case-insensitive), keeping already ticked state */
export function mergeItems(list, names) {
  const have = new Set(list.map(i => i.name.toLowerCase())), out = list.slice();
  for (const n of names) if (!have.has(n.toLowerCase())) { have.add(n.toLowerCase()); out.push({ name: n, done: false }); }
  return out;
}
export const packProgress = (list) => ({ done: list.filter(i => i.done).length, total: list.length });

// ── Udlån ──
/** status of a loan: 'back' (returned), 'late' (past due), 'soon' (due within 3 days) or 'out' */
export function loanStatus(l, now = Date.now()) {
  if (l.back) return 'back';
  if (!l.due) return 'out';
  const days = Math.round((startOfDay(l.due) - startOfDay(now)) / DAY);
  return days < 0 ? 'late' : days <= 3 ? 'soon' : 'out';
}
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

// ── Plantepasser ──
export const PLANTS = [
  { name: 'Monstera', every: 7, light: 'Lyst, ikke direkte sol', tip: 'Tør jorden de øverste par cm før vanding.' },
  { name: 'Gummitræ', every: 10, light: 'Lyst', tip: 'Tør bladene af med en fugtig klud.' },
  { name: 'Kaktus', every: 21, light: 'Fuld sol', tip: 'Næsten ingen vand om vinteren.' },
  { name: 'Sukkulent', every: 14, light: 'Fuld sol', tip: 'Vand grundigt, men sjældent.' },
  { name: 'Fredslilje', every: 5, light: 'Halvskygge', tip: 'Hænger med bladene, når den er tørstig.' },
  { name: 'Pengetræ', every: 14, light: 'Lyst', tip: 'Tåler godt at blive glemt.' },
  { name: 'Orkidé', every: 7, light: 'Lyst, ikke direkte sol', tip: 'Dyp rødderne i vand i 10 minutter.' },
  { name: 'Basilikum', every: 2, light: 'Fuld sol', tip: 'Vand nedefra, og knib toppen af.' },
  { name: 'Guldranke', every: 7, light: 'Halvskygge', tip: 'Kan vokse i et glas vand.' },
  { name: 'Svigermors tunge', every: 21, light: 'Alt fra skygge til sol', tip: 'Den sværeste plante at slå ihjel.' },
  { name: 'Aloe vera', every: 14, light: 'Fuld sol', tip: 'Gelen i bladene kan bruges på solskoldning.' },
  { name: 'Bregne', every: 3, light: 'Halvskygge', tip: 'Elsker fugtig luft – sprøjt på bladene.' },
];
/** days until the plant needs water (negative = overdue) */
export function waterDue(p, now = Date.now()) {
  if (!p.watered) return 0;
  return daysBetween(now, p.watered + p.every * DAY);
}
export const dueText = (d) => d < -1 ? `${-d} dage for sent` : d === -1 ? 'i går' : d === 0 ? 'i dag' : d === 1 ? 'i morgen' : `om ${d} dage`;
