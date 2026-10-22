/**
 * Skak – against the computer (four levels), two on the same screen, or online with someone on HUBTECH.
 * Online the host's browser checks the moves, the server keeps the position and passes the other player's moves on.
 */
import { h, clear } from '../core/dom.js';
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
    try { store = await appState('chess', { game: null, setup: { vs: 'ai', level: 'medium', color: 'w' }, stats: {}, flip: false }); } catch (e) { return loadError('Skak', e); }
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
        name: (c) => (G.vs === 'ai' ? (c === G.color ? 'Dig' : `Computer (${C.LEVELS[G.level].label.toLowerCase()})`) : COLOR[c]),
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
      const k = st.stats[G.level] || (st.stats[G.level] = { w: 0, l: 0, d: 0 });
      if (!res.winner) k.d++; else if (res.winner === G.color) { k.w++; toast('Du vandt!', { type: 'xp', text: `Mod computeren på ${C.LEVELS[G.level].label.toLowerCase()}` }); } else k.l++;
    }

    // ── setup on one screen ──
    function setup() {
      const o = { ...st.setup };
      const levelRow = h('div'), clockRow = h('div');
      const vsSeg = segmented([{ value: 'ai', label: 'Mod computeren', icon: 'bot' }, { value: 'two', label: 'To på samme skærm', icon: 'users' }], o.vs, (v) => { o.vs = v; levelRow.hidden = v !== 'ai'; clockRow.hidden = v === 'ai'; }, { label: 'Modstander' });
      o.clock = o.clock || 'none';
      h(clockRow, { hidden: o.vs === 'ai' }, h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Skakur'), clockSeg(o.clock, (v) => { o.clock = v; })));
      const lvSeg = segmented(Object.entries(C.LEVELS).map(([value, l]) => ({ value, label: l.label })), o.level, (v) => { o.level = v; }, { label: 'Sværhedsgrad' });
      const colSeg = segmented([{ value: 'w', label: 'Hvid' }, { value: 'b', label: 'Sort' }, { value: 'r', label: 'Tilfældig' }], o.color, (v) => { o.color = v; }, { label: 'Din farve' });
      h(levelRow, { hidden: o.vs !== 'ai' }, h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Sværhedsgrad'), lvSeg), h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Du spiller'), colSeg));
      const stats = Object.entries(C.LEVELS).map(([id, l]) => { const k = st.stats[id]; return k && k.w + k.l + k.d ? h('span', { class: 'chip' }, `${l.label}: ${k.w} sejre · ${k.d} remis · ${k.l} tab`) : null; }).filter(Boolean);
      h(clear(root), null, panel('Nyt parti', 'play',
        h('div', { class: 'ch-setup-row' }, vsSeg), levelRow, clockRow,
        stats.length ? h('div', { class: 'ch-stats' }, h('span', { class: 'faint' }, 'Dine resultater mod computeren:'), stats) : null,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          st.setup = o;
          const color = o.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : o.color;
          st.game = { s: C.newGame(), line: [], vs: o.vs, level: o.level, color };
          if (o.vs === 'two') C.setClock(st.game.s, o.clock);
          sel = -1; hint = null; store.save(); ctl = localCtl(); draw();
        } }, icon('play'), 'Start partiet'))), rules());
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
            if (!res && s.moves.length > 2 && !await confirmDialog({ title: 'Start et nyt parti?', text: 'Partiet, du er i gang med, forsvinder.', confirmLabel: 'Nyt parti' })) return;
            st.game = null; store.save(); ctl = null; sel = -1; setup();
          } }, icon('plus'), 'Nyt parti'),
        !ctl.online && !res && G.vs === 'ai' && ctl.canMove() ? h('button', { class: 'btn btn-sm', onclick: () => {
          const m = C.bestMove(s, 'hard'); if (!m) return;
          hint = { ...m, n: s.moves.length }; G.hints = (G.hints || 0) + 1; store.save(); draw();
        } }, icon('sparkles'), 'Hint') : null,
        !ctl.online && !res && G.line.length && !s.clock ? h('button', { class: 'btn btn-sm', onclick: () => {
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
          st.game = { s: C.setClock(C.newGame(), G.s.clock?.id), line: [], vs: G.vs, level: G.level, color }; sel = -1; hint = null; store.save(); ctl = localCtl(); draw();
        } }, icon('refresh'), 'Spil igen') : null);
      const top = bottom === 'w' ? 'b' : 'w';
      h(clear(root), null, h('div', { class: 'ch-wrap' },
        h('div', { class: 'ch-main' }, bar(top), board, bar(bottom)),
        h('div', { class: 'ch-side' }, status, offer, acts, h('h3', { class: 'gr-h' }, 'Træk'), s.moves.length ? moves : h('p', { class: 'faint', style: { margin: 0 } }, 'Hvid starter.'))));
      moves.scrollTop = moves.scrollHeight;
    }
    function scheduleAI() {
      clearTimeout(self._t);
      const G = st.game;
      if (ctl?.online || !G || G.vs !== 'ai' || G.s.result || G.s.turn === G.color) return;
      const s = G.s;
      self._t = setTimeout(() => {
        if (!document.body.contains(root) || st.game?.s !== s) return;
        const m = C.bestMove(s, G.level);
        if (m && C.play(s, m.from, m.to, m.promo)) { G.line.push([m.from, m.to, m.promo]); finishLocal(); store.save(); }
        if (ctl && !ctl.online) draw();
      }, 450);
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
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Skak', lead: 'Spil mod computeren på fire niveauer, to på samme skærm eller online mod en ven.', compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, modeSeg), root);
  },
};
