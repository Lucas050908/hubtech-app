/** Ordjagt – guess the five-letter word in six tries. Pure logic (unit-tested in tests/apps.test.mjs). */
import { seededRandom } from './gamelogic.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ';
export const TRIES = 6;
export const norm = (w) => String(w || '').toUpperCase().trim();
export const validGuess = (w) => norm(w).length === 5 && [...norm(w)].every(c => LETTERS.includes(c));

/** 'ok' right place, 'near' in the word but elsewhere, 'no' not in the word (repeated letters are counted properly) */
export function score(guess, answer) {
  const g = [...norm(guess)], a = [...norm(answer)];
  const res = Array(5).fill('no'), left = {};
  g.forEach((c, i) => { if (c === a[i]) res[i] = 'ok'; else left[a[i]] = (left[a[i]] || 0) + 1; });
  g.forEach((c, i) => { if (res[i] !== 'ok' && left[c]) { res[i] = 'near'; left[c]--; } });
  return res;
}
/** the best thing known about each letter, for the keyboard */
export function keyStates(guesses, answer) {
  const rank = { no: 1, near: 2, ok: 3 }, out = {};
  for (const g of guesses) score(g, answer).forEach((s, i) => { const c = norm(g)[i]; if (!out[c] || rank[s] > rank[out[c]]) out[c] = s; });
  return out;
}
const dayNo = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 864e5); };
/** the same word for everyone on a day – no repeats until the list has been used */
export function dailyWord(words, iso) {
  const r = seededRandom('ordjagt'), order = words.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const n = ((dayNo(iso) % words.length) + words.length) % words.length;
  return norm(words[order[n]]);
}
export const randomWord = (words, r = Math.random) => norm(words[Math.floor(r() * words.length)]);
/** In "hard mode" every hint must be used: green letters stay, yellow ones must be in the guess. */
export function hardModeError(guess, guesses, answer) {
  const g = norm(guess);
  for (const prev of guesses) {
    const s = score(prev, answer), p = norm(prev);
    for (let i = 0; i < 5; i++) if (s[i] === 'ok' && g[i] !== p[i]) return `Bogstav ${i + 1} skal være ${p[i]}`;
    for (let i = 0; i < 5; i++) if (s[i] === 'near' && !g.includes(p[i])) return `Gættet skal indeholde ${p[i]}`;
  }
  return null;
}
export function shareText(guesses, answer, label) {
  const won = norm(guesses.at(-1)) === norm(answer);
  const sq = { ok: '🟩', near: '🟨', no: '⬜' };
  return `Ordjagt ${label} ${won ? guesses.length : 'X'}/${TRIES}\n${guesses.map(g => score(g, answer).map(s => sq[s]).join('')).join('\n')}`;
}
/** streak and spread of guesses from the history { 'YYYY-MM-DD': { won, tries } } */
export function stats(history, today) {
  const days = Object.keys(history).sort();
  const played = days.length, won = days.filter(d => history[d].won).length;
  const dist = [0, 0, 0, 0, 0, 0];
  days.forEach(d => { if (history[d].won) dist[history[d].tries - 1]++; });
  let streak = 0;
  const prev = (iso) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d - 1)); return t.toISOString().slice(0, 10); };
  let d = history[today] ? today : prev(today);
  while (history[d]?.won) { streak++; d = prev(d); }
  let best = 0, run = 0, last = null;
  for (const x of days) { run = history[x].won && last && prev(x) === last ? run + 1 : history[x].won ? 1 : 0; best = Math.max(best, run); last = x; }
  return { played, won, pct: played ? Math.round(won / played * 100) : 0, streak, best, dist };
}
