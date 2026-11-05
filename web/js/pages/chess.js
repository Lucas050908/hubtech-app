/**
 * Skak – against seven bots with a rating (400–2200), two on the same screen, or online with someone on HUBTECH.
 * Rated games against bots and online move your own rating (Elo) and rank, like on the big chess sites.
 * The engine thinks in a worker, so the board never freezes.
 * Online the host's browser checks the moves, the server keeps the position and passes the other player's moves on.
 */
import { h, clear, svgEl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, confirmDialog, segmented, modal } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher } from '../features/gameroom.js';
import * as C from '../features/chess.js';

const COLOR = { w: 'Hvid', b: 'Sort' };

// the engine runs in a worker (falls back to the page if workers are not available)
let worker = null, wid = 0;
const waiting = new Map();
function think(s, level) {
  try {
    if (!worker) {
      worker = new Worker(new URL('../features/chessworker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const f = waiting.get(e.data.id); waiting.delete(e.data.id); f?.(e.data.move); };
      worker.onerror = () => { worker = null; for (const [id, f] of waiting) { waiting.delete(id); f(undefined); } };
    }
    const id = ++wid;
    return new Promise((res) => { waiting.set(id, (m) => res(m === undefined ? C.bestMove(s, level) : m)); worker.postMessage({ id, s: JSON.parse(JSON.stringify(s)), level }); });
  } catch { return Promise.resolve(C.bestMove(s, level)); }
}
const botOf = (G) => C.botById(G?.bot) || C.botById(C.LEVEL_BOT[G?.level]) || C.botById('karl');
const rankChip = (r) => { const k = C.rankOf(r); return h('span', { class: 'chip ch-rankchip', title: k.name }, h('b', null, k.icon), ` ${k.name}`); };
const pieceName = (p) => `${p === p.toUpperCase() ? 'hvid' : 'sort'} ${C.NAMES[p.toLowerCase()]}`;
/** Replay a list of moves from the start (used for take-backs). */
function replay(line) {
  const s = C.newGame();
  for (const [f, t, pr] of line) C.play(s, f, t, pr);
  return s;
}

export default {
  title: 'Skak',
  destroy() { clearTimeout(this._t); clearInterval(this._iv); this._off?.(); this._offAct?.(); this._unwatch?.(); },
  async render(ctx) {
    const app = appById('chess');
    let store;
    try { store = await appState('chess', { game: null, setup: { vs: 'ai', bot: 'karl', rated: true, color: 'w' }, stats: {}, flip: false, rating: null, ratedRooms: [] }); } catch (e) { return loadError('Skak', e); }
    const st = store.data, self = this;
    const root = h('div');
    let mode = ctx?.params?.sub === 'online' ? 'online' : 'local';
    let room = null, ctl = null, sel = -1, syncT = 0, hint = null;
    let recvAt = Date.now();      // when the guest last got the host's position (the clock counts from there)

    // A controller hides the difference between one screen and online.
    const localCtl = () => {
      const G = st.game;
      return {
        s: G.s, online: false, host: true, G,
        myColor: G.vs === 'ai' ? G.color : G.s.turn,
        bottom: G.vs === 'ai' ? G.color : (st.flip ? 'b' : 'w'),
        canMove: () => !G.s.result && (G.vs !== 'ai' || G.s.turn === G.color),
        name: (c) => (G.vs === 'ai' ? (c === G.color ? `Dig${st.rating?.games ? ` (${st.rating.r})` : ''}` : `${botOf(G).avatar} ${botOf(G).name} (${botOf(G).rating})`) : COLOR[c]),
        move(f, t, pr) { if (C.play(G.s, f, t, pr)) { G.line.push([f, t, pr]); finishLocal(); store.save(); draw(); } },
        resign() { C.resign(G.s, G.vs === 'ai' ? G.color : G.s.turn); finishLocal(); store.save(); draw(); },
        draw() { C.agreeDraw(G.s); store.save(); draw(); },
        left: (c) => C.clockLeft(G.s, c),
        save: () => store.save(),
      };
    };
    const onlineCtl = () => {
      const B = room.state.blob, host = room.host === me();
      const myColor = B.w === me() ? 'w' : B.b === me() ? 'b' : null;
      return {
        s: B.s, online: true, host, B, myColor, bottom: myColor || 'w',
        canMove: () => !B.s.result && myColor === B.s.turn && !isWatcher(room),
        name: (c) => B.names[c] || COLOR[c],
        move(f, t, pr) {
          if (host) { if (applyOnline(B, me(), 'move', [f, t, pr])) { push(); draw(); } }
          else { optimistic(f, t, pr); api.post(`/api/games/rooms/${room.id}/act`, { name: 'move', args: [f, t, pr] }).catch(e => toast(e.message, { type: 'warn' })); }
        },
        resign() { this.send('resign', []); },
        send(name, args) {
          if (host) { if (applyOnline(B, me(), name, args)) { push(); draw(); } }
          else api.post(`/api/games/rooms/${room.id}/act`, { name, args }).catch(e => toast(e.message, { type: 'warn' }));
        },
        // the host's clock is the truth; a guest counts from when the position arrived, so the devices' clocks needn't agree
        left: (c) => (host ? C.clockLeft(B.s, c) : C.clockLeft(B.s, c, B.s.clock?.since != null ? B.s.clock.since + (Date.now() - recvAt) : Date.now())),
        save: () => push(),
      };
    };
    function optimistic(f, t, pr) {      // show the guest's own move at once; the host's copy arrives a moment later
      const copy = structuredClone(room.state.blob.s);
      const now = copy.clock?.since != null ? copy.clock.since + (Date.now() - recvAt) : Date.now();
      if (C.play(copy, f, t, pr, now)) { room.state.blob = { ...room.state.blob, s: copy, drawOffer: null }; recvAt = Date.now(); ctl = onlineCtl(); sel = -1; draw(); }
    }
    function applyOnline(B, uid, name, args) {
      const c = B.w === uid ? 'w' : B.b === uid ? 'b' : null;
      if (!c || B.s.result) return false;
      if (name === 'resign') C.resign(B.s, c);
      else if (name === 'move') {
        if (B.s.turn !== c) return false;
        const [f, t, pr] = args.map((x, i) => (i < 2 ? Number(x) : String(x || 'q')));
        if (!C.play(B.s, f, t, pr)) { if (B.s.result) { B.phase = 'over'; return true; } return false; }
        if (B.drawOffer && B.drawOffer !== c) B.drawOffer = null;      // moving instead of answering says no
      } else if (name === 'offerDraw') {
        if (B.drawOffer || B.s.moves.length < 2) return false;
        B.drawOffer = c;
      } else if (name === 'answerDraw') {
        if (!B.drawOffer || B.drawOffer === c) return false;
        if (args[0]) C.agreeDraw(B.s);
        B.drawLog = args[0] ? null : `${B.names[c]} sagde nej til remis`;
        B.drawOffer = null;
      } else return false;
      if (B.s.result) B.phase = 'over';
      return true;
    }
    function push() {
      clearTimeout(syncT);
      const r = room, blob = room.state.blob;
      syncT = setTimeout(() => api.post(`/api/games/rooms/${r.id}/sync`, { blob }).catch(() => {}), 40);
    }
    function finishLocal() {
      const G = st.game, res = G.s.result;
      if (!res || G.vs !== 'ai' || G.counted) return;
      G.counted = true;
      const bot = botOf(G), key = bot.id;
      const k = st.stats[key] || (st.stats[key] = { w: 0, l: 0, d: 0 });
      const score = !res.winner ? 0.5 : res.winner === G.color ? 1 : 0;
      if (score === 0.5) k.d++; else if (score === 1) k.w++; else k.l++;
      if (G.rated) {
        const before = st.rating?.games ? st.rating.r : C.START_RATING, rankBefore = C.rankOf(before).index;
        st.rating = C.applyResult(st.rating, bot.rating, score, bot.name);
        const d = st.rating.r - before;
        toast(score === 1 ? 'Du vandt!' : score === 0.5 ? 'Remis' : 'Du tabte', { type: score === 1 ? 'xp' : 'info', text: `Rating ${st.rating.r} (${d >= 0 ? '+' : ''}${d}) mod ${bot.name}` });
        const rk = C.rankOf(st.rating.r);
        if (rk.index > rankBefore) setTimeout(() => toast(`Ny rang: ${rk.icon} ${rk.name}`, { type: 'xp', text: 'Godt spillet – du er rykket op!' }), 900);
      } else if (score === 1) toast('Du vandt!', { type: 'xp', text: `Mod ${bot.name} (uden rating)` });
    }

    // ── setup on one screen ──
    function setup() {
      const o = { vs: 'ai', bot: 'karl', rated: true, color: 'w', ...st.setup };
      if (!C.botById(o.bot)) o.bot = C.LEVEL_BOT[o.level] || 'karl';
      const levelRow = h('div'), clockRow = h('div');
      const vsSeg = segmented([{ value: 'ai', label: 'Mod en bot', icon: 'bot' }, { value: 'two', label: 'To på samme skærm', icon: 'users' }], o.vs, (v) => { o.vs = v; levelRow.hidden = v !== 'ai'; clockRow.hidden = v === 'ai'; }, { label: 'Modstander' });
      o.clock = o.clock || 'none';
      h(clockRow, { hidden: o.vs === 'ai' }, h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Skakur'), clockSeg(o.clock, (v) => { o.clock = v; })));
      const my = st.rating?.games ? st.rating.r : C.START_RATING;
      const bots = h('div', { class: 'ch-bots', role: 'radiogroup', 'aria-label': 'Vælg en bot' });
      const drawBots = () => bots.replaceChildren(...C.BOTS.map(b => {
        const k = st.stats[b.id], diff = b.rating - my;
        return h('button', { class: ['ch-bot', o.bot === b.id && 'is-on'], role: 'radio', 'aria-checked': String(o.bot === b.id), dataset: { bot: b.id }, onclick: () => { o.bot = b.id; drawBots(); } },
          h('span', { class: 'ch-bot-av', 'aria-hidden': 'true' }, b.avatar),
          h('span', { class: 'ch-bot-main' }, h('b', null, b.name), h('span', { class: 'faint' }, b.about),
            k && k.w + k.d + k.l ? h('span', { class: 'ch-bot-rec' }, `${k.w} sejre · ${k.d} remis · ${k.l} tab`) : null),
          h('span', { class: 'ch-bot-r' }, h('b', null, String(b.rating)), h('span', { class: 'faint' }, diff > 250 ? 'Svær for dig' : diff < -250 ? 'Let for dig' : 'Lige op')));
      }));
      drawBots();
      const ratedSeg = segmented([{ value: 'y', label: 'Med rating' }, { value: 'n', label: 'Uden rating' }], o.rated === false ? 'n' : 'y', (v) => { o.rated = v === 'y'; }, { label: 'Rating' });
      const colSeg = segmented([{ value: 'w', label: 'Hvid' }, { value: 'b', label: 'Sort' }, { value: 'r', label: 'Tilfældig' }], o.color, (v) => { o.color = v; }, { label: 'Din farve' });
      h(levelRow, { hidden: o.vs !== 'ai' }, bots,
        h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Partiet'), ratedSeg),
        h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Du spiller'), colSeg));
      h(clear(root), null, h('div', { class: 'ch-setup-wrap' },
        panel('Nyt parti', 'play',
          h('div', { class: 'ch-setup-row' }, vsSeg), levelRow, clockRow,
          h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
            st.setup = o;
            const color = o.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : o.color;
            st.game = { s: C.newGame(), line: [], vs: o.vs, bot: o.bot, rated: o.vs === 'ai' && o.rated !== false, color };
            if (o.vs === 'two') C.setClock(st.game.s, o.clock);
            sel = -1; hint = null; store.save(); ctl = localCtl(); draw();
          } }, icon('play'), 'Start partiet'))),
        h('div', { class: 'stack' }, ratingPanel(), ladderPanel(), rules())));
    }
    function ratingPanel() {
      const R = st.rating?.games ? st.rating : null, r = R ? R.r : C.START_RATING, k = C.rankOf(r);
      const prog = k.next ? Math.round((r - k.min) / (k.next.min - k.min) * 100) : 100;
      const hist = (R?.hist || []).slice(-20);
      let spark = null;
      if (hist.length > 1) {
        const vs = hist.map(x => x.r), lo = Math.min(...vs) - 10, hi = Math.max(...vs) + 10, W = 220, H = 48;
        const pts = vs.map((v, i) => `${(i / (vs.length - 1) * W).toFixed(1)},${(H - (v - lo) / (hi - lo) * H).toFixed(1)}`).join(' ');
        spark = svgEl('svg', { class: 'ch-spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Rating over de sidste ${hist.length} partier` }, svgEl('polyline', { points: pts, fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
      }
      return panel('Din rating', 'trophy',
        h('div', { class: 'ch-rating' }, h('span', { class: 'ch-rank-icon', 'aria-hidden': 'true' }, k.icon),
          h('div', null, h('b', { class: 'ch-rating-n' }, R ? String(r) : `${r}?`), h('div', null, k.name), h('div', { class: 'faint' }, R ? `${R.games} partier · ${R.w} sejre · ${R.d} remis · ${R.l} tab${R.games < 20 ? ' · foreløbig' : ''}` : 'Spil et parti med rating for at få din første rating.'))),
        k.next ? h('div', { class: 'ch-next' }, h('div', { class: 'ch-row-sb' }, h('span', { class: 'faint' }, `Næste rang: ${k.next.icon} ${k.next.name}`), h('span', { class: 'faint' }, `${k.toNext} point`)), h('div', { class: 'lab-bar-track' }, h('span', { style: { width: `${prog}%` } }))) : h('p', { class: 'faint' }, 'Du har den højeste rang.'),
        spark, R?.best ? h('p', { class: 'faint', style: { margin: 0 } }, `Bedste rating: ${R.best}`) : null);
    }
    function ladderPanel() {
      const list = h('ol', { class: 'ch-ladder' }, h('li', { class: 'faint' }, 'Henter …'));
      api.get('/api/chess/ratings').then(d => {
        const es = d.entries || [];
        list.replaceChildren(...(es.length ? es.slice(0, 10).map((e, i) => h('li', { class: e.me ? 'is-me' : null }, h('span', { class: 'ch-ladder-n' }, String(i + 1)), h('span', { class: 'ch-ladder-k', title: C.rankOf(e.r).name }, C.rankOf(e.r).icon), h('b', null, e.u), h('span', { class: 'mono' }, String(e.r))))
          : [h('li', { class: 'faint' }, 'Ingen har en rating endnu – bliv den første.')]));
      }).catch(() => list.replaceChildren(h('li', { class: 'faint' }, 'Ranglisten kunne ikke hentes.')));
      return panel('Rangliste', 'award', list, h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)', margin: '8px 0 0' } }, 'Rang: ♟ Bonde · ♞ Springer 600 · ♝ Løber 900 · ♜ Tårn 1200 · ♛ Dronning 1500 · ♚ Konge 1800 · 🏆 Skakmester 2100'));
    }
    const clockSeg = (val, fn) => segmented(C.CLOCKS.map(c => ({ value: c.id, label: c.label })), val, fn, { label: 'Skakur' });
    const rules = () => panel('Godt at vide', 'help', h('ul', { class: 'pg-rules' },
      h('li', null, 'Klik på en brik for at se, hvor den kan gå hen, og klik så på feltet. Ulovlige træk kan ikke laves.'),
      h('li', null, 'Rokade: flyt kongen to felter mod tårnet. En passant og bondeforvandling er også med – du vælger selv, hvad bonden bliver til.'),
      h('li', null, 'Partiet er uafgjort ved pat, når samme stilling kommer tre gange, efter 50 træk uden slag eller bondetræk, eller hvis ingen kan sætte mat.'),
      h('li', null, 'Skakur: dit ur går, mens det er din tur. Løber tiden ud, har du tabt – medmindre modstanderen kun har kongen tilbage. Uret starter, når hvid har lavet første træk.'),
      h('li', null, 'Notation: K konge, D dronning, T tårn, L løber, S springer. + er skak, # er skakmat.')));

    // ── the board ──
    function pickPromo(f, t) {
      let close;
      const m = modal({ title: 'Bonden forvandles', label: 'Vælg brik', size: 360,
        body: h('div', { class: 'ch-promo' }, ['q', 'r', 'b', 'n'].map(p => {
          const glyph = `${C.GLYPH[p]}\uFE0E`;
          return h('button', { class: ['ch-promo-btn', ctl.s.turn], 'aria-label': C.NAMES[p], onclick: () => { close?.(); ctl.move(f, t, p); } }, h('span', null, glyph), h('small', null, C.NAMES[p]));
        })) });
      close = m.close;
    }
    function clickSq(i) {
      const s = ctl.s;
      if (!ctl.canMove()) return;
      const p = s.board[i];
      if (sel >= 0 && sel !== i) {
        const ms = C.legalMoves(s, sel).filter(m => m.to === i);
        if (ms.length) { const f = sel; sel = -1; if (ms[0].promo) pickPromo(f, i); else ctl.move(f, i, 'q'); return; }
      }
      sel = p && (p === p.toUpperCase() ? 'w' : 'b') === s.turn && sel !== i ? i : -1;
      draw();
    }
    function draw() {
      const s = ctl.s, bottom = ctl.bottom;
      scheduleAI();
      const targets = sel >= 0 ? C.legalMoves(s, sel) : [];
      const chk = C.inCheck(s) ? C.kingSq(s.board, s.turn) : -1;
      const order = [...Array(64).keys()];
      if (bottom === 'b') order.reverse();
      const board = h('div', { class: ['ch-board', bottom === 'b' && 'is-flipped'], role: 'grid', 'aria-label': 'Skakbræt' }, order.map(i => {
        const p = s.board[i], r = Math.floor(i / 8), c = i % 8, t = targets.find(m => m.to === i);
        const pos = order.indexOf(i);
        return h('button', {
          class: ['ch-sq', (r + c) % 2 ? 'dark' : 'light', i === sel && 'is-sel', t && (p || t.ep ? 'is-cap' : 'is-target'), s.last && (s.last.from === i || s.last.to === i) && 'is-last', i === chk && 'is-check', hint && (hint.from === i || hint.to === i) && 'is-hint'],
          role: 'gridcell', dataset: { sq: C.sqName(i) }, 'aria-label': `${C.sqName(i)}${p ? `: ${pieceName(p)}` : ''}`, onclick: () => clickSq(i) },
          p ? h('span', { class: ['ch-piece', p === p.toUpperCase() ? 'w' : 'b'] }, `${C.GLYPH[p.toLowerCase()]}\uFE0E`) : null,
          pos % 8 === 0 ? h('i', { class: 'ch-rank' }, String(8 - r)) : null,
          pos >= 56 ? h('i', { class: 'ch-file' }, C.FILES[c]) : null);
      }));
      const cap = C.captured(s);
      const bar = (c) => h('div', { class: ['ch-player', s.turn === c && !s.result && 'is-turn'] },
        h('span', { class: ['ch-dot', c] }), h('b', null, ctl.name(c)),
        h('span', { class: 'ch-caps' }, cap[c].map(p => `${C.GLYPH[p.toLowerCase()]}\uFE0E`).join('')),
        s.clock ? h('span', { class: ['ch-clock', c === s.turn && s.clock.since != null && !s.result && 'is-on', ctl.left(c) < 20e3 && 'is-low'], dataset: { c }, 'aria-label': `${COLOR[c]}s tid` }, C.fmtClock(ctl.left(c))) : null);
      if (hint && hint.n !== s.moves.length) hint = null;
      const res = s.result;
      if (ctl.online && res && ctl.myColor && room && !(st.ratedRooms || []).includes(room.id) && s.moves.length >= 2) rateOnline(room.id, ctl.B, ctl.myColor, res);
      const status = res
        ? h('div', { class: 'ch-status is-over' }, icon('trophy'), h('div', null, h('b', null, res.winner ? `${ctl.name(res.winner)} vinder` : 'Uafgjort'), h('span', { class: 'faint' }, C.RESULT_TEXT[res.why] || '')))
        : h('div', { class: 'ch-status' }, h('b', null, ctl.canMove() ? (ctl.online || st.game?.vs === 'ai' ? 'Dit træk' : `${COLOR[s.turn]} trækker`) : `${ctl.name(s.turn)} tænker …`),
          C.inCheck(s) ? h('span', { class: 'chip chip-bad' }, 'Skak!') : null);
      const B = ctl.online ? ctl.B : null;
      const offer = B && !res && B.drawOffer
        ? (B.drawOffer !== ctl.myColor && ctl.myColor
          ? h('div', { class: 'ch-offer' }, h('b', null, `${ctl.name(B.drawOffer)} tilbyder remis`),
            h('div', { class: 'row-actions', style: { margin: 0 } },
              h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctl.send('answerDraw', [true]) }, icon('check'), 'Tag imod'),
              h('button', { class: 'btn btn-sm', onclick: () => ctl.send('answerDraw', [false]) }, icon('x'), 'Nej tak')))
          : h('div', { class: 'ch-offer' }, h('span', { class: 'faint' }, ctl.myColor ? 'Du har tilbudt remis – venter på svar …' : `${ctl.name(B.drawOffer)} har tilbudt remis`)))
        : B?.drawLog && !res ? h('p', { class: 'faint', style: { margin: 0 } }, B.drawLog) : null;
      const pairs = [];
      for (let k = 0; k < s.moves.length; k += 2) pairs.push(h('li', null, h('span', { class: 'faint' }, `${k / 2 + 1}.`), h('span', null, s.moves[k]), h('span', null, s.moves[k + 1] || '')));
      const moves = h('ol', { class: 'ch-moves', 'aria-label': 'Træk' }, pairs);
      const watcher = ctl.online && isWatcher(room);
      const G = st.game;
      const acts = h('div', { class: 'row-actions' },
        ctl.online ? h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil')
          : h('button', { class: 'btn btn-sm', onclick: async () => {
            const ratedLoss = !res && G?.rated && s.moves.length >= 2;
            if (!res && s.moves.length > 2 && !await confirmDialog({ title: 'Start et nyt parti?', text: ratedLoss ? 'Partiet tæller som tabt i din rating.' : 'Partiet, du er i gang med, forsvinder.', confirmLabel: 'Nyt parti' })) return;
            if (ratedLoss) { C.resign(G.s, G.color); finishLocal(); }
            st.game = null; store.save(); ctl = null; sel = -1; setup();
          } }, icon('plus'), 'Nyt parti'),
        !ctl.online && !res && G.vs === 'ai' && ctl.canMove() ? h('button', { class: 'btn btn-sm', onclick: () => {
          if (G.rated) { G.rated = false; toast('Partiet tæller ikke længere i din rating', { type: 'info', text: 'Hints og fortryd gør partiet uden rating.' }); }
          think(s, 'holger').then(m => { if (!m || st.game !== G || G.s.moves.length !== s.moves.length) return; hint = { ...m, n: s.moves.length }; G.hints = (G.hints || 0) + 1; store.save(); draw(); });
        } }, icon('sparkles'), 'Hint') : null,
        !ctl.online && !res && G.line.length && !s.clock ? h('button', { class: 'btn btn-sm', onclick: () => {
          if (G.rated) { G.rated = false; toast('Partiet tæller ikke længere i din rating', { type: 'info' }); }
          const back = G.vs === 'ai' ? (G.s.turn === G.color ? 2 : 1) : 1;
          G.line = G.line.slice(0, Math.max(0, G.line.length - back)); G.s = replay(G.line); sel = -1; ctl = localCtl(); store.save(); draw();
        } }, icon('undo'), 'Fortryd') : null,
        !ctl.online && G?.vs === 'two' ? h('button', { class: 'btn btn-sm', onclick: () => { st.flip = !st.flip; store.save(); ctl = localCtl(); draw(); } }, icon('refresh'), 'Vend brættet') : null,
        !res && G?.vs === 'two' && !ctl.online && s.moves.length >= 2 ? h('button', { class: 'btn btn-sm', onclick: async () => {
          if (await confirmDialog({ title: 'Remis?', text: 'Er I begge enige om, at partiet ender uafgjort?', confirmLabel: 'Ja, remis' })) ctl.draw();
        } }, icon('users'), 'Remis') : null,
        !res && ctl.online && ctl.myColor && !B.drawOffer && s.moves.length >= 2 ? h('button', { class: 'btn btn-sm', onclick: () => ctl.send('offerDraw', []) }, icon('users'), 'Tilbyd remis') : null,
        !res && !watcher && (!ctl.online || ctl.myColor) ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
          if (await confirmDialog({ title: 'Opgiv partiet?', text: 'Modstanderen vinder.', confirmLabel: 'Opgiv', danger: true })) ctl.resign();
        } }, icon('flag'), 'Opgiv') : null,
        watcher ? h('span', { class: 'chip chip-info' }, icon('eye'), 'Du ser med') : null,
        ctl.online && res && ctl.host ? h('button', { class: 'btn btn-sm btn-primary', onclick: rematch }, icon('refresh'), 'Spil igen') : null,
        !ctl.online && res ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => {
          const color = G.vs === 'ai' && st.setup.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : G.color;
          st.game = { s: C.setClock(C.newGame(), G.s.clock?.id), line: [], vs: G.vs, bot: botOf(G).id, rated: G.vs === 'ai' && st.setup.rated !== false, color }; sel = -1; hint = null; store.save(); ctl = localCtl(); draw();
        } }, icon('refresh'), 'Spil igen') : null);
      const top = bottom === 'w' ? 'b' : 'w';
      h(clear(root), null, h('div', { class: 'ch-wrap' },
        h('div', { class: 'ch-main' }, bar(top), board, bar(bottom)),
        h('div', { class: 'ch-side' }, status, offer, acts, h('h3', { class: 'gr-h' }, 'Træk'), s.moves.length ? moves : h('p', { class: 'faint', style: { margin: 0 } }, 'Hvid starter.'))));
      moves.scrollTop = moves.scrollHeight;
    }
    /** An online game is over: move my rating against the opponent's (from the ranking). Each player updates their own. */
    function rateOnline(id, B, mine, res) {
      st.ratedRooms = [...(st.ratedRooms || []), id].slice(-60); store.save();
      const opp = mine === 'w' ? B.b : B.w, oppName = B.names?.[mine === 'w' ? 'b' : 'w'] || 'modstander';
      api.get('/api/chess/ratings').then(d => d.entries || []).catch(() => []).then(es => {
        const or = es.find(e => e.id === opp)?.r || C.START_RATING;
        const score = !res.winner ? 0.5 : res.winner === mine ? 1 : 0;
        const before = st.rating?.games ? st.rating.r : C.START_RATING;
        st.rating = C.applyResult(st.rating, or, score, oppName); store.save();
        const dlt = st.rating.r - before;
        toast(`Rating ${st.rating.r} (${dlt >= 0 ? '+' : ''}${dlt})`, { type: score === 1 ? 'xp' : 'info', text: `Online mod ${oppName}` });
      });
    }
    function scheduleAI() {
      clearTimeout(self._t);
      const G = st.game;
      if (ctl?.online || !G || G.vs !== 'ai' || G.s.result || G.s.turn === G.color) return;
      const s = G.s;
      const n = s.moves.length;
      self._t = setTimeout(async () => {
        if (!document.body.contains(root) || st.game?.s !== s) return;
        const m = await think(s, botOf(G).id);
        if (!document.body.contains(root) || st.game?.s !== s || s.moves.length !== n) return;     // a take-back or a new game meanwhile
        if (m && C.play(s, m.from, m.to, m.promo)) { G.line.push([m.from, m.to, m.promo]); finishLocal(); store.save(); }
        if (ctl && !ctl.online) draw();
      }, 350);
    }

    // ── online ──
    function openRoom(r) {
      self._off?.(); self._offAct?.(); self._unwatch?.(); self._unwatch = null; clearTimeout(self._t);
      room = r; ctl = null; sel = -1;
      if (!r) { history.replaceState(null, '', '#/apps/chess/online'); return drawOnline(); }
      if (isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
      history.replaceState(null, '', `#/apps/chess/online/${r.id}`);
      self._off = watchRoom(r.id, (nr) => {
        if (!nr) { toast('Spillet er lukket', { type: 'info' }); openRoom(null); return; }
        const keep = ctl?.host && room?.state?.blob && nr.status === 'playing' ? room.state.blob : null;
        room = nr;
        if (keep) room.state.blob = keep; else recvAt = Date.now();
        hostCheckSeats();
        drawOnline();
      });
      self._offAct = onLive('game-act', (ev) => {
        if (!room || ev.id !== room.id || room.host !== me() || !room.state.blob) return;
        if (applyOnline(room.state.blob, ev.from, ev.name, ev.args || [])) { push(); drawOnline(); }
      });
      drawOnline();
    }
    function hostCheckSeats() {     // the other player left during the game: they resign
      const B = room?.state?.blob;
      if (!B || room.host !== me() || B.s.result) return;
      const ids = new Set(room.players.map(p => p.id));
      for (const c of ['w', 'b']) if (B[c] && !ids.has(B[c])) { C.resign(B.s, c); B.phase = 'over'; push(); toast(`${B.names[c]} har forladt partiet`, { type: 'info' }); return; }
    }
    async function rematch() {
      try { openRoom(await roomApi.rematch(room.id)); } catch (e) { toast(e.message, { type: 'warn' }); }
    }
    function drawOnline() {
      if (!room) {
        h(clear(root), null, lobbyPanel({ game: 'chess', title: 'Spil skak online', text: 'Udfordr en af dem, der har HUBTECH. I spiller hver på jeres egen enhed, og andre kan se med.', onOpen: openRoom }), rules());
        return;
      }
      if (room.state.blob && (room.status === 'playing' || room.status === 'done')) { ctl = onlineCtl(); draw(); return; }
      const host = room.host === me(), watcher = isWatcher(room);
      const pick = st.online || (st.online = { color: 'r', clock: '10+0' });      // remembered, also when the lobby redraws
      const colSeg = segmented([{ value: 'w', label: 'Hvid' }, { value: 'b', label: 'Sort' }, { value: 'r', label: 'Tilfældig' }], pick.color, (v) => { pick.color = v; store.save(); }, { label: 'Din farve' });
      const start = async () => {
        const other = room.players.find(p => p.id !== me());
        if (!other) return toast('Vent på, at din modstander siger ja', { type: 'warn' });
        const mine = pick.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pick.color;
        const short = (p) => (p.name || 'Spiller').split(' ')[0].slice(0, 16);
        const meP = room.players.find(p => p.id === me());
        const B = { s: C.setClock(C.newGame(), pick.clock), phase: 'play', drawOffer: null, w: mine === 'w' ? me() : other.id, b: mine === 'b' ? me() : other.id, names: {} };
        B.names.w = short(B.w === me() ? meP : other); B.names.b = short(B.b === me() ? meP : other);
        try {
          await roomApi.start(room.id);
          room.state.blob = B; room.status = 'playing';
          await api.post(`/api/games/rooms/${room.id}/sync`, { blob: B });
          drawOnline();
        } catch (e) { toast(e.message, { type: 'warn' }); }
      };
      h(clear(root), null, panel('Klar til skak', 'users',
        h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
          !watcher ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), 'Forlad') : null),
        h('div', { class: 'tr-lobby' }, room.players.map(p => person(p, h('span', { class: 'chip chip-ok' }, 'Klar'))), room.invited.map(p => person(p, h('span', { class: 'chip' }, 'Inviteret')))),
        host ? [h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Du spiller'), colSeg),
          h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Skakur'), clockSeg(pick.clock, (v) => { pick.clock = v; store.save(); })),
          h('button', { class: 'btn btn-primary btn-lg', disabled: room.players.length < 2, onclick: start }, icon('play'), 'Start partiet'),
          h('p', { class: 'faint' }, room.players.length < 2 ? 'Partiet kan starte, når din modstander har sagt ja.' : 'Du er vært: partiet kører på din enhed, så hold HUBTECH åben, mens I spiller.')]
          : h('p', { class: 'muted' }, `${room.players.find(p => p.id === room.host)?.name || 'Værten'} starter partiet og vælger farver.`)));
    }

    // the clock: update the numbers a few times a second; the host (or this screen) ends the game when time runs out
    clearInterval(self._iv);
    self._iv = setInterval(() => {
      if (!ctl || !document.body.contains(root)) return;
      const s = ctl.s;
      if (!s.clock) return;
      if (ctl.host && C.checkFlag(s)) {
        if (ctl.online) { ctl.B.phase = 'over'; push(); } else store.save();
        draw(); return;
      }
      root.querySelectorAll('.ch-clock').forEach(el => {
        const c = el.dataset.c, ms = ctl.left(c);
        el.textContent = C.fmtClock(ms);
        el.classList.toggle('is-on', c === s.turn && s.clock.since != null && !s.result);
        el.classList.toggle('is-low', ms < 20e3);
      });
    }, 200);
    const modeSeg = segmented([{ value: 'local', label: 'På denne skærm', icon: 'monitor' }, { value: 'online', label: 'Online', icon: 'globe' }], mode, (v) => {
      mode = v; self._off?.(); self._offAct?.(); self._unwatch?.(); clearTimeout(self._t); sel = -1;
      if (v === 'local') { history.replaceState(null, '', '#/apps/chess'); room = null; if (st.game) { C.resumeClock(st.game.s); ctl = localCtl(); draw(); } else { ctl = null; setup(); } }
      else openRoom(null);
    }, { label: 'Hvor' });
    if (mode === 'online') {
      if (ctx?.params?.id) roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
        .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
      else openRoom(null);
    } else if (st.game) { C.resumeClock(st.game.s); ctl = localCtl(); draw(); } else setup();
    return h('div', { class: 'page gm-page ch-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Skak', lead: 'Spil mod syv bots fra 400 til 2200 i rating, to på samme skærm eller online – og stig i rang.', compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, modeSeg), root);
  },
};
