/** Password generator and strength check for the Kodeord app (unit-tested in tests/apps.test.mjs). Nothing here leaves the device. */

export const SETS = { lower: 'abcdefghijkmnopqrstuvwxyz', upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits: '23456789', symbols: '!#%&*+-=?@_' };
// look-alike characters (l, I, O, 0, 1) are left out on purpose, so the password can be read aloud and typed from paper

/** Danish words for passphrases – short, common and easy to spell. */
export const WORDS = ('abe agurk ager alarm and anker appel arm asfalt bad bage bakke balkon banan bank bark basun bavian bjerg blad blomst blyant bog bold bord borg bro brød bryst bus by bænk bær båd cykel dag dal dans dejlig dessert digt dino dobbelt dok drage drøm due dyne dæk dør eg elg elv emne eng ensom fabrik fakkel fe fiol fisk fjeld fjer flag flamingo flod fløjte fod fold fond fort frost frø fugl fyr fyrtårn får gade gaffel garn gave ged gips glas glød gnist gran gren gryde gul gulv gøg hammer hane hav have hest himmel hjem hjort hoppe horn hund hus hvede hvid hytte hæl hær høne høst igle is isbjørn jakke jern jord juice jul kage kaffe kakao kamel kanal kanin kano kasse kat kegle kirke kiste klokke klud knap knude kok komet kompas kop kort kost kran krone krukke kuffert kugle kul kurv kyst kælder kø lager lagkage lam lampe land lanterne lejr lilla linje lom lomme lov lyng lys læbe lærke løve maler mand mark mast mel melon mos motor mus mynte mælk måge måne nat net nisse nord nøgle nød ost otter ovn padde palme pande papir park pebber pels pen pil pind pipe pirat planet plante plov pude pumpe pære rabarber radio ravn regn rejse ris robot rose rude rug ræv rød rør sadel salat salt sand saks savl sejl sild skab skal skib skov sky slange slot smør snegl sne sol sommer spade spejl spor stald stav sten stjerne stol storm strand strøm sukker svamp svane sø søm tag tand tang tavle telt tiger time tog tomat torden tov tranebær tromme træ tråd tulipan tunnel tårn uge ugle uld ur vandre vant varme vase vej vind vindue vinter vogn vulkan væg æble ælling ærme øje ø øl ørn østers åben ål å').split(' ');

const rand = (n) => { const a = new Uint32Array(1); const lim = Math.floor(2 ** 32 / n) * n; do crypto.getRandomValues(a); while (a[0] >= lim); return a[0] % n; };

export function makePassword({ length = 16, lower = true, upper = true, digits = true, symbols = true } = {}) {
  const sets = Object.entries({ lower, upper, digits, symbols }).filter(([, on]) => on).map(([k]) => SETS[k]);
  if (!sets.length) sets.push(SETS.lower);
  const n = Math.max(sets.length, Math.min(128, length | 0));
  const all = sets.join('');
  const out = sets.map(s => s[rand(s.length)]);            // at least one of each kind
  while (out.length < n) out.push(all[rand(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rand(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

export function makePassphrase({ words = 5, sep = '-', capital = true, number = true } = {}) {
  const w = Array.from({ length: Math.max(3, Math.min(12, words | 0)) }, () => WORDS[rand(WORDS.length)]);
  if (capital) { const i = rand(w.length); w[i] = w[i][0].toUpperCase() + w[i].slice(1); }
  if (number) w.push(String(rand(90) + 10));
  return w.join(sep);
}

const COMMON = ['123456', '12345678', '123456789', 'password', 'qwerty', 'qwertyuiop', 'asdfgh', 'abc123', '111111', '000000', 'iloveyou', 'letmein', 'welcome', 'admin', 'monkey', 'dragon',
  'kodeord', 'adgangskode', 'hejhej', 'hej123', 'sommer', 'vinter', 'foraar', 'efteraar', 'danmark', 'kobenhavn', 'velkommen', 'fodbold', 'kaereste', 'hemmelig', 'test', 'login', 'master', 'football', 'princess'];
const SEQS = ['abcdefghijklmnopqrstuvwxyzæøå', '01234567890', 'qwertyuiopå', 'asdfghjklæø', 'zxcvbnm'];

/** Guesses per second for an offline attack on a fast hash – deliberately pessimistic. */
export const GUESSES_PER_SEC = 1e10;

/** { bits, score 0–4, label, crack (seconds), warnings[] } */
export function strength(pw) {
  const s = String(pw || '');
  if (!s) return { bits: 0, score: 0, label: 'Ingen kode', crack: 0, warnings: [] };
  const warnings = [];
  let pool = 0;
  if (/[a-zæøå]/.test(s)) pool += 29;
  if (/[A-ZÆØÅ]/.test(s)) pool += 29;
  if (/\d/.test(s)) pool += 10;
  if (/[^a-zA-ZæøåÆØÅ0-9]/.test(s)) pool += 33;
  let bits = s.length * Math.log2(Math.max(pool, 2));
  const low = s.toLowerCase().replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!]/g, 'i').replace(/0/g, 'o').replace(/\$/g, 's').replace(/ae/g, 'æ');
  const plain = low.replace(/[^a-zæøå]/g, '');
  const hit = COMMON.find(c => low.includes(c) || (plain.length >= 4 && c.includes(plain) && plain.length >= c.length - 2));
  if (hit) { bits = Math.min(bits, 10 + Math.max(0, s.length - hit.length) * 4); warnings.push('Indeholder en af de mest brugte koder eller ord.'); }
  if (/(.)\1{2,}/.test(s)) { bits -= 8; warnings.push('Samme tegn flere gange i træk.'); }
  for (const q of SEQS) for (let i = 0; i + 4 <= q.length; i++) if (s.toLowerCase().includes(q.slice(i, i + 4))) { bits -= 10; warnings.push('Indeholder en række som “abcd”, “1234” eller “qwer”.'); i = q.length; break; }
  if (/(19|20)\d\d/.test(s)) { bits -= 6; warnings.push('Et årstal er nemt at gætte.'); }
  if (/^[A-ZÆØÅ][a-zæøå]+\d{1,4}[!.?]?$/.test(s)) { bits = Math.min(bits, 28); warnings.push('Ord med stort forbogstav og tal bagefter er det mønster, angribere prøver først.'); }
  if (s.length < 8) warnings.push('For kort – brug mindst 12 tegn.');
  bits = Math.max(0, Math.round(bits));
  const crack = 2 ** bits / GUESSES_PER_SEC / 2;
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4;
  return { bits, score, label: ['Meget svag', 'Svag', 'Middel', 'Stærk', 'Meget stærk'][score], crack, warnings: [...new Set(warnings)] };
}

/** "under et sekund", "3 timer", "400 år", "mere end en million år" */
export function crackText(sec) {
  if (sec < 1) return 'under et sekund';
  const units = [['år', 31557600], ['dage', 86400], ['timer', 3600], ['minutter', 60], ['sekunder', 1]];
  if (sec > 31557600 * 1e6) return 'mere end en million år';
  for (const [u, n] of units) if (sec >= n) { const v = Math.round(sec / n); return `${v.toLocaleString('da-DK')} ${v === 1 ? { år: 'år', dage: 'dag', timer: 'time', minutter: 'minut', sekunder: 'sekund' }[u] : u}`; }
  return 'under et sekund';
}
