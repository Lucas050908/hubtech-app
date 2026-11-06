/** Gnist as the opponent in games: her names, what she says during the game, and the little strip above the board. */
import { h } from '../core/dom.js';
import { gnist } from '../core/icons.js';

/** The computer players are Gnist – "Gnist" for the first, "Gnist 2", "Gnist 3" … for the rest. */
export const botName = (n = 1) => (n <= 1 ? 'Gnist' : `Gnist ${n}`);

/** Old saved games and setups called them "Computer", "Computer 1" … – give those the new names (in place). */
export function renameBots(players) {
  if (!Array.isArray(players)) return players;
  let n = 0;
  for (const p of players) {
    if (!p?.ai) continue;
    n++;
    if (/^Computer( \d+)?$/.test(p.name || '')) p.name = botName(n);
  }
  return players;
}

export const LINES = {
  you: ['Din tur – jeg holder øje med dig 👀', 'Tag dig god tid. Jeg venter spændt.', 'Hvad gør du nu?', 'Jeg tror, jeg har gennemskuet dig …', 'Godt træk sidst – lad os se, om du kan gøre det igen.'],
  think: ['Hmm, lad mig tænke …', 'Øjeblik – jeg regner på det.', 'Jeg har vist et godt træk på vej …', 'Ingen kigger i mine kort!', 'Mine kredsløb summer …'],
  won: ['Jeg vandt! Godt spillet – revanche?', 'Ha, den tog jeg! Vil du prøve igen?', 'Den gik min vej i dag. En til?'],
  lost: ['Du slog mig – flot spillet! 🎉', 'Av! Du var for god denne gang.', 'Godt gået! Næste gang tager jeg revanche.'],
  other: ['Godt spillet, alle sammen!', 'Spillet er slut – det var sjovt!'],
};

// the same state always gives the same line, so a redraw does not make her change her mind
const pick = (list, key) => { let x = 0; for (const c of String(key)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return list[x % list.length]; };

/**
 * What Gnist says right now – or null when she isn't playing.
 * s: { players: [{ name, ai }], turn, phase, winner?, log? }, canAct(seat) tells whether the person here can move.
 */
export function gnistSays(s, canAct = (seat) => !s.players[seat]?.ai) {
  if (!s?.players?.some(p => p?.ai)) return null;
  const key = `${s.turn}|${s.log?.length || 0}|${s.log?.[0] || ''}|${s.phase}`;
  if (s.phase === 'over') {
    const w = typeof s.winner === 'number' ? s.players[s.winner] : null;
    if (!w) return { mood: 'idle', text: pick(LINES.other, key) };
    if (w.ai) return { mood: 'wave', text: pick(LINES.won, key) };
    return { mood: 'wave', text: canAct(s.winner) ? pick(LINES.lost, key) : `${w.name} vandt – flot spillet!` };
  }
  if (s.players[s.turn]?.ai) return { mood: 'think', text: pick(LINES.think, key) };
  return { mood: 'idle', text: canAct(s.turn) ? pick(LINES.you, key) : `${s.players[s.turn]?.name || 'Næste'} har turen.` };
}

/** The strip above the board: Gnist's mark and a speech bubble. */
export function gnistStrip(said) {
  if (!said) return null;
  return h('div', { class: ['gn-play', `is-${said.mood}`], role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'gn-play-mark' }, gnist(36, { mood: said.mood })),
    h('p', { class: 'gn-play-say' }, h('b', null, 'Gnist: '), said.text));
}

/** Games where you can play against Gnist – shown in her own app. */
export const GAMES = [
  ['ludo', 'Ludo'], ['chess', 'Skak'], ['checkers', 'Dam'], ['yatzy', 'Yatzy'], ['connect4', 'Fire på stribe'],
  ['tictactoe', 'Kryds og bolle'], ['hearts', 'Hjerterfri'], ['gomoku', 'Fem på stribe'], ['nim', 'Tændstikker'],
];
