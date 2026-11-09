/** Hemmelige koder: Cæsar (Danish alphabet), Morse, binary, A1Z29 numbers, reversed and the "pig pen"-free Atbash. */
export const ABC = 'abcdefghijklmnopqrstuvwxyzæøå';
const keepCase = (orig, ch) => (orig === orig.toUpperCase() && orig !== orig.toLowerCase() ? ch.toUpperCase() : ch);
export function caesar(text, shift) {
  return [...text].map(c => { const i = ABC.indexOf(c.toLowerCase()); return i < 0 ? c : keepCase(c, ABC[((i + shift) % 29 + 29) % 29]); }).join('');
}
export const atbash = (text) => [...text].map(c => { const i = ABC.indexOf(c.toLowerCase()); return i < 0 ? c : keepCase(c, ABC[28 - i]); }).join('');
export const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', æ: '.-.-', ø: '---.', å: '.--.-', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--' };
const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
export const toMorse = (t) => t.toLowerCase().split(' ').map(w => [...w].map(c => MORSE[c] || '').filter(Boolean).join(' ')).filter(Boolean).join(' / ');
export const fromMorse = (m) => m.trim().split(/\s*\/\s*|\s{3,}/).map(w => w.split(/\s+/).map(c => FROM_MORSE[c] || (c ? '?' : '')).join('')).join(' ');
export const toBinary = (t) => [...new TextEncoder().encode(t)].map(b => b.toString(2).padStart(8, '0')).join(' ');
export function fromBinary(b) { const bytes = b.trim().split(/\s+/).filter(x => /^[01]{1,8}$/.test(x)).map(x => parseInt(x, 2)); try { return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)); } catch { return ''; } }
export const toNumbers = (t) => t.toLowerCase().split(' ').map(w => [...w].map(c => ABC.indexOf(c) + 1).filter(n => n > 0).join('-')).filter(Boolean).join(' / ');
export const fromNumbers = (s) => s.split('/').map(w => w.trim().split(/[-\s]+/).map(n => ABC[Number(n) - 1] || '').join('')).join(' ');
export const reverse = (t) => [...t].reverse().join('');
/** guess the Cæsar shift by letter frequency (Danish: e, r, n, t, d, a …) */
export function crackCaesar(text) {
  const freq = { e: 15, r: 9, n: 8, t: 7, d: 6, a: 6, i: 6, s: 6, l: 5, g: 4, o: 4, k: 3, m: 3, f: 2, v: 2, u: 2, b: 2, h: 2, p: 2, å: 1, æ: 1, ø: 1 };
  let best = 0, bestS = -Infinity;
  for (let s = 0; s < 29; s++) { const t = caesar(text.toLowerCase(), -s); let sc = 0; for (const c of t) sc += freq[c] || 0; if (sc > bestS) { bestS = sc; best = s; } }
  return best;
}
