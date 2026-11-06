/**
 * Gnist teaches chess: she explains your moves (good ideas, loose pieces, missed captures), says why a hint is good,
 * and has small lessons with a board that shows where each piece can go. Pure – no page code here.
 */
import * as C from './chess.js';

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const DEF = { p: 'bonden', n: 'springeren', b: 'løberen', r: 'tårnet', q: 'dronningen', k: 'kongen' };
const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
const other = (c) => (c === 'w' ? 'b' : 'w');
const low = (p) => p.toLowerCase();
const clone = (s) => ({ ...s, board: [...s.board], moves: [...s.moves], reps: { ...s.reps }, clock: s.clock ? { ...s.clock } : s.clock, result: null });
const CENTER = ['e4', 'd4', 'e5', 'd5'].map(C.sqIndex);
const backRank = (c) => (c === 'w' ? 7 : 0);
export const pieceAt = (p, i) => `${DEF[low(p)]} på ${C.sqName(i)}`;

/** Who can take the piece on square i right now (legal moves of the other side), cheapest first. */
function attackers(s, i) {
  const p = s.board[i];
  if (!p) return [];
  const t = clone(s); t.turn = other(colorOf(p)); t.ep = -1;
  try { return C.legalMoves(t).filter(m => m.to === i).sort((a, b) => VAL[low(t.board[a.from])] - VAL[low(t.board[b.from])]); } catch { return []; }
}

/** Pieces of colour c that can be won: attacked and not defended, or attacked by something cheaper. */
export function loosePieces(s, c) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p || colorOf(p) !== c || low(p) === 'k') continue;
    const at = attackers(s, i);
    if (!at.length) continue;
    const cheapest = VAL[low(s.board[at[0].from])];
    const defended = C.attacked(s.board, i, c);
    if (!defended || cheapest < VAL[low(p)]) out.push({ sq: i, p, by: s.board[at[0].from], defended });
  }
  return out.sort((a, b) => VAL[low(b.p)] - VAL[low(a.p)]);
}

/**
 * What Gnist says about the move just made by `me`. before = the position before it, after = after it (after.last is the move).
 * Returns { kind: 'good'|'warn'|'tip'|'win', text }.
 */
export function explainMove(before, after, me) {
  const mv = after.last;
  if (!mv) return null;
  const p = mv.piece, kind = low(p), opp = other(me), early = before.full <= 8;
  if (after.result?.why === 'mate') return { kind: 'win', text: 'Skakmat! Kongen kan ikke slippe væk – flot spillet! 🎉' };
  // the piece that just moved can be taken for free
  const loose = loosePieces(after, me);
  const moved = loose.find(x => x.sq === mv.to);
  if (moved && VAL[kind] >= 3 && !(mv.cap && VAL[low(mv.cap)] >= VAL[kind])) {
    return { kind: 'warn', text: `Pas på: ${pieceAt(p, mv.to)} kan slås af ${DEF[low(moved.by)]}${moved.defended ? ', og den er mere værd' : ', og ingen forsvarer den'}. Tjek altid, om feltet er sikkert, før du flytter.` };
  }
  // you could have won a piece but did something else
  const free = loosePieces(before, opp).filter(x => VAL[low(x.p)] >= 3 && !x.defended);
  if (free.length && !(mv.cap && VAL[low(mv.cap)] >= VAL[low(free[0].p)])) {
    return { kind: 'tip', text: `Du kunne have slået ${pieceAt(free[0].p, free[0].sq)} gratis – ingen forsvarede den. Kig efter løse brikker hver gang!` };
  }
  const newLoose = loose.find(x => VAL[low(x.p)] >= 3 && !loosePieces(before, me).some(y => y.sq === x.sq));
  if (newLoose) return { kind: 'warn', text: `Godt træk, men nu står ${pieceAt(newLoose.p, newLoose.sq)} truet. Kan du redde den næste gang?` };
  if (mv.san.startsWith('O-O')) return { kind: 'good', text: 'Rokade! Kongen står sikkert, og tårnet kommer med i spillet. 👍' };
  if (mv.san.includes('+')) return { kind: 'good', text: 'Skak! Nu skal modstanderen flytte kongen, dække eller slå den brik, der giver skak.' };
  if (mv.cap) return { kind: 'good', text: `Godt – du slog ${DEF[low(mv.cap)]} (${VAL[low(mv.cap)]} ${VAL[low(mv.cap)] === 1 ? 'point' : 'point'}).` };
  if (early && kind === 'p' && CENTER.includes(mv.to)) return { kind: 'good', text: 'Godt åbningstræk: bonden tager kontrol over midten, og dine brikker får plads.' };
  if (early && (kind === 'n' || kind === 'b') && Math.floor(mv.from / 8) === backRank(me)) return { kind: 'good', text: `Fint – du udvikler ${DEF[kind]}. Få springere og løbere ud tidligt, og lav så rokade.` };
  if (before.full <= 5 && kind === 'q') return { kind: 'tip', text: 'Tip: vent lidt med dronningen – den kan blive jagtet rundt. Udvikl springere og løbere først.' };
  if (early && kind === 'k') return { kind: 'tip', text: 'Tip: kongen er sikrest efter en rokade. Flyt den helst ikke selv i starten.' };
  if (early && kind === 'p' && (mv.from % 8 === 0 || mv.from % 8 === 7)) return { kind: 'tip', text: 'Kantbønder gør ikke meget i åbningen. Prøv i stedet at tage midten eller udvikle en brik.' };
  const tips = ['Godt. Spørg dig selv efter hvert træk: hvad truer modstanderen nu?', 'Fint træk. Står alle dine brikker dækket?', 'Godt. Kan nogen af dine brikker komme bedre i spil?'];
  return { kind: 'ok', text: tips[before.moves.length % tips.length] };
}

/** What Gnist says about her own move as the opponent – mostly a warning when she now threatens something. */
export function explainReply(after, me) {
  const mv = after.last;
  if (!mv) return null;
  if (after.result?.why === 'mate') return { kind: 'warn', text: 'Skakmat – jeg vandt denne gang. Brug Fortryd og se, om du kan finde et bedre forsvar!' };
  const head = `Jeg flyttede ${DEF[low(mv.piece)]} til ${C.sqName(mv.to)}${mv.cap ? ` og slog ${DEF[low(mv.cap)]}` : ''}.`;
  if (mv.san.includes('+')) return { kind: 'warn', text: `${head} Skak! Din konge er angrebet – flyt den, dæk den, eller slå min brik.` };
  const threat = loosePieces(after, me)[0];
  if (threat) return { kind: 'warn', text: `${head} Nu truer jeg ${pieceAt(threat.p, threat.sq)}!` };
  return { kind: 'ok', text: head };
}

/** Why a suggested move (from the engine) is good – in plain words. s is the position before it. */
export function hintWhy(s, m) {
  const p = s.board[m.from];
  if (!p) return '';
  const target = s.board[m.to], me = colorOf(p), kind = low(p);
  const t = clone(s);
  C.play(t, m.from, m.to, m.promo || 'q');
  const where = `${DEF[kind]} fra ${C.sqName(m.from)} til ${C.sqName(m.to)}`;
  if (t.result?.why === 'mate') return `Flyt ${where} – det er skakmat!`;
  if (target) return `Slå ${pieceAt(target, m.to)} med ${DEF[kind]}${C.attacked(s.board, m.to, other(me)) ? '' : ' – den er ikke dækket'}.`;
  if (kind === 'k' && Math.abs(m.to - m.from) === 2) return 'Lav rokade: kongen kommer i sikkerhed, og tårnet kommer i spil.';
  if (loosePieces(s, me).some(x => x.sq === m.from)) return `Red ${pieceAt(p, m.from)} – den er truet. Flyt den til ${C.sqName(m.to)}.`;
  if (C.inCheck(t)) return `Giv skak: flyt ${where}.`;
  if (loosePieces(t, other(me)).length > loosePieces(s, other(me)).length) return `Flyt ${where} – så truer du ${pieceAt(loosePieces(t, other(me))[0].p, loosePieces(t, other(me))[0].sq)}.`;
  if (s.full <= 8 && kind === 'p' && CENTER.includes(m.to)) return `Flyt ${where} – den tager kontrol over midten.`;
  if (s.full <= 10 && (kind === 'n' || kind === 'b')) return `Flyt ${where} – få dine brikker i spil.`;
  return `Flyt ${where} – det forbedrer din stilling.`;
}

/** Small lessons: a position and (maybe) the piece whose moves are shown on the board. */
export const LESSONS = [
  { t: 'Brættet', text: 'Skak spilles på 64 felter. Hvid starter, og I skiftes til at flytte én brik. Hvert felt har et navn – et bogstav og et tal, fx e4.', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { t: 'Tårnet', text: 'Tårnet går lige frem, tilbage og til siden – så langt det vil, indtil en brik står i vejen. Det er 5 point værd.', fen: 'k7/8/8/8/3R4/8/8/7K w - - 0 1', from: 'd4' },
  { t: 'Løberen', text: 'Løberen går på skrå og bliver altid på sin egen farve. Den er 3 point værd.', fen: 'k7/8/8/8/3B4/8/8/7K w - - 0 1', from: 'd4' },
  { t: 'Dronningen', text: 'Dronningen er den stærkeste brik: hun går som tårn og løber på én gang. 9 point værd – pas godt på hende.', fen: 'k7/8/8/8/3Q4/8/8/7K w - - 0 1', from: 'd4' },
  { t: 'Springeren', text: 'Springeren hopper i et L: to felter den ene vej og ét til siden. Den er den eneste, der kan springe over andre brikker. 3 point værd.', fen: 'k7/8/8/8/3N4/8/8/7K w - - 0 1', from: 'd4' },
  { t: 'Kongen', text: 'Kongen går ét felt i alle retninger. Den må aldrig stå, hvor den kan slås – og bliver den sat skakmat, er spillet tabt.', fen: 'k7/8/8/8/3K4/8/8/8 w - - 0 1', from: 'd4' },
  { t: 'Bonden', text: 'Bonden går ét felt frem (to fra start) men slår skråt fremad. Når den når den anden ende, bliver den til en dronning eller en anden brik.', fen: '7k/8/8/8/8/3p4/4P3/K7 w - - 0 1', from: 'e2' },
  { t: 'Skak og mat', text: 'Er kongen angrebet, står den i skak. Kan den ikke komme ud af skak, er den skakmat. Her sætter tårnet til a8 mat – kongen er spærret inde af sine egne bønder.', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', from: 'a1' },
  { t: 'Gnists 4 gode råd', text: '1) Tag kontrol over midten med bønderne. 2) Få springere og løbere ud tidligt. 3) Lav rokade, så kongen er sikker. 4) Spørg efter hvert træk: hvad truer modstanderen?', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4' },
];

/** The squares a lesson's piece can go to (shown as dots). */
export function lessonTargets(lesson) {
  if (!lesson.from) return [];
  const s = C.fromFEN(lesson.fen);
  return C.legalMoves(s, C.sqIndex(lesson.from)).map(m => m.to);
}
