/**
 * Quizbrættet – pure game logic (unit-tested in tests/apps.test.mjs).
 * A board of categories × five questions (100–500 points) and one hidden joker that doubles the points.
 *
 * Three ways to answer:
 *  master – a quizmaster reads aloud, shows the answer and gives points (+) or takes them (−)
 *  turn   – on one screen: the one whose turn it is picks a field and chooses between four answers
 *  all    – online: everyone chooses at the same time; everyone who is right gets the points, the fastest picks next
 *
 * The right answers are kept apart from the board (the "key"), so online only the host knows them until they are shown.
 */
export const VALUES = [100, 200, 300, 400, 500];
export const ANSWER_SECS = 20;
const shuffle = (a, r) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Can this question be answered by choosing (it has three wrong answers)? */
export const hasChoices = (q) => Array.isArray(q.w) && q.w.filter(x => String(x || '').trim()).length >= 3;

/** cats: [{ name, qs: [{ q, a, w? }] × 5 }] → { board, key } */
export function buildBoard(cats, r = Math.random, { joker = true } = {}) {
  const key = [], tiles = [];
  cats.forEach((cat, c) => {
    key.push([]); tiles.push([]);
    cat.qs.slice(0, 5).forEach((q, i) => {
      const opts = hasChoices(q) ? shuffle([q.a, ...q.w.filter(x => String(x || '').trim()).slice(0, 3)], r) : null;
      tiles[c].push({ v: VALUES[i], q: q.q, opts, done: false, joker: false });
      key[c].push({ i: opts ? opts.indexOf(q.a) : -1, a: q.a });
    });
  });
  if (joker && tiles.length) {     // the joker hides in one of the harder fields
    const c = Math.floor(r() * tiles.length), i = 2 + Math.floor(r() * 3);
    if (tiles[c][i]) tiles[c][i].joker = true;
  }
  return { board: { cats: cats.map(c => c.name), tiles }, key };
}

/** players: [{ name, uid? }] */
export function newGame(board, players, mode = 'turn') {
  return { v: 1, mode, cats: [...board.cats], tiles: board.tiles.map(col => col.map(t => ({ ...t, opts: t.opts ? [...t.opts] : null }))), players: players.map(p => ({ name: p.name, uid: p.uid || null, score: 0 })),
    chooser: 0, phase: 'pick', cur: null, log: [], last: null };
}
export const left = (s) => s.tiles.flat().filter(t => !t.done).length;
export const allChoices = (s) => s.tiles.flat().every(t => t.opts);
const worth = (t) => t.v * (t.joker ? 2 : 1);

/** The one whose turn it is picks field (c, r). */
export function pick(s, seat, c, r, now = Date.now()) {
  const t = s.tiles[c]?.[r];
  if (s.phase !== 'pick' || !t || t.done || (s.mode !== 'master' && seat !== s.chooser)) return false;
  t.done = true;
  s.phase = 'question';
  s.cur = { c, r, v: worth(t), joker: t.joker, by: s.chooser, answers: {}, start: now, correct: null, answer: null, right: [], wrong: [] };
  return true;
}
/** An answer: the index of the chosen option. */
export function answer(s, seat, opt, now = Date.now()) {
  const t = s.cur && s.tiles[s.cur.c][s.cur.r];
  if (s.phase !== 'question' || !t?.opts || !(opt >= 0 && opt < t.opts.length) || !s.players[seat]) return false;
  if (s.mode === 'turn' && seat !== s.cur.by) return false;
  if (s.mode === 'master') return false;
  if (s.cur.answers[seat]) return false;
  s.cur.answers[seat] = { opt, ms: Math.max(0, now - s.cur.start) };
  return true;
}
/** Has everyone who should answer done so? */
export function allAnswered(s) {
  if (s.phase !== 'question') return false;
  if (s.mode === 'turn') return !!s.cur.answers[s.cur.by];
  if (s.mode === 'all') return s.players.every((p, i) => s.cur.answers[i]);
  return false;
}
/** Show the right answer and (when answers were chosen) give the points. */
export function reveal(s, key) {
  if (s.phase !== 'question') return false;
  const k = key[s.cur.c][s.cur.r], cur = s.cur;
  cur.correct = k.i; cur.answer = k.a;
  s.phase = 'reveal';
  if (s.mode === 'master') return true;
  const order = Object.entries(cur.answers).sort((x, y) => x[1].ms - y[1].ms);
  for (const [seat, a] of order) {
    const i = Number(seat);
    if (a.opt === k.i) { s.players[i].score += cur.v; cur.right.push(i); } else cur.wrong.push(i);
  }
  if (s.mode === 'turn' && !cur.right.length && cur.answers[cur.by]) s.players[cur.by].score -= Math.round(cur.v / 2);   // a wrong guess costs half
  const who = cur.right.map(i => s.players[i].name);
  s.log = [`${s.cats[cur.c]} for ${cur.v}: ${k.a}${who.length ? ` – ${who.join(', ')} fik point` : ' – ingen fik point'}`, ...s.log].slice(0, 30);
  if (s.mode === 'all' && cur.right.length) s.chooser = cur.right[0];           // the fastest right answer picks next
  if (s.mode === 'turn') s.chooser = (cur.by + 1) % s.players.length;            // on one screen it goes round
  return true;
}
/** Quizmaster: player `seat` was right (true) or wrong (false). Can be used for several players. */
export function judge(s, seat, ok) {
  if (s.mode !== 'master' || (s.phase !== 'reveal' && s.phase !== 'question') || !s.players[seat]) return false;
  const cur = s.cur;
  if (cur.right.includes(seat) || cur.wrong.includes(seat)) return false;
  if (ok) { s.players[seat].score += cur.v; cur.right.push(seat); s.chooser = seat; } else { s.players[seat].score -= cur.v; cur.wrong.push(seat); }
  return true;
}
/** Back to the board – or the end. */
export function next(s) {
  if (s.phase !== 'reveal') return false;
  if (s.mode === 'master') s.log = [`${s.cats[s.cur.c]} for ${s.cur.v}: ${s.cur.answer}${s.cur.right.length ? ` – ${s.cur.right.map(i => s.players[i].name).join(', ')} fik point` : ''}`, ...s.log].slice(0, 30);
  s.last = s.cur; s.cur = null;
  s.phase = left(s) ? 'pick' : 'over';
  return true;
}
export function standings(s) {
  return s.players.map((p, i) => ({ ...p, seat: i })).sort((a, b) => b.score - a.score);
}
export function winners(s) {
  const best = Math.max(...s.players.map(p => p.score));
  return s.players.map((p, i) => i).filter(i => s.players[i].score === best);
}

/** Pick `n` random categories from the bank (or the chosen ones). */
export function pickCategories(bank, n = 5, r = Math.random, chosen = null) {
  const pool = chosen?.length ? bank.filter(c => chosen.includes(c.id)) : bank;
  return shuffle(pool, r).slice(0, n);
}
/** Check a home-made board: 2–6 categories, each with a name and five questions with an answer. */
export function checkBoard(b) {
  const errs = [];
  if (!String(b?.title || '').trim()) errs.push('Giv brættet en titel.');
  const cats = b?.cats || [];
  if (cats.length < 2 || cats.length > 6) errs.push('Et bræt skal have 2–6 kategorier.');
  cats.forEach((c, i) => {
    if (!String(c.name || '').trim()) errs.push(`Kategori ${i + 1} mangler et navn.`);
    (c.qs || []).slice(0, 5).forEach((q, k) => { if (!String(q.q || '').trim() || !String(q.a || '').trim()) errs.push(`${c.name || `Kategori ${i + 1}`} for ${VALUES[k]}: skriv både spørgsmål og svar.`); });
    if ((c.qs || []).length < 5) errs.push(`${c.name || `Kategori ${i + 1}`} skal have fem spørgsmål.`);
  });
  return errs;
}
export const emptyBoard = () => ({ id: Date.now().toString(36), title: '', cats: [0, 1, 2].map(() => ({ name: '', qs: VALUES.map(() => ({ q: '', a: '', w: ['', '', ''] })) })) });
