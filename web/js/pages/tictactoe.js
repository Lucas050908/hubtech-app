/** Kryds og bolle – against the computer (the hard one never loses), two on one screen, or online against the others on HUBTECH. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher } from '../features/gameroom.js';
import { tttWinner, tttBest } from '../features/gamelogic.js';

const LEVELS = { easy: 'Let', medium: 'Middel', hard: 'Umulig' };
const MARK = { 1: '✕', 2: '◯' };

export default {
  title: 'Kryds og bolle',
  destroy() { clearTimeout(this._t); this._off?.(); this._unwatch?.(); },
  async render(ctx) {
    const app = appById('tictactoe');
    let store;
    try { store = await appState('tictactoe', { mode: 'cpu', level: 'medium', stats: {} }); } catch (e) { return loadError('Kryds og bolle', e); }
    const st = store.data, self = this;
    if (ctx?.params?.sub === 'online') st.mode = 'online';
    let board, turn, over, win, thinking;
    const localBox = h('div', { class: 'ttt-local' }), onlineBox = h('div', { class: 'stack ttt-online' });
    const statKey = () => (st.mode === 'cpu' ? st.level : 'two');

    function grid(b, { cells = [], last = null, onClick, disabled }) {
      return h('div', { class: 'ttt-board', role: 'grid', 'aria-label': 'Spillebræt' }, b.map((v, i) => h('button', {
        class: ['ttt-cell', v && `p${v}`, cells.includes(i) && 'is-win', last === i && 'is-last'], disabled: disabled || !!v,
        'aria-label': `Felt ${i + 1}: ${v ? (v === 1 ? 'kryds' : 'bolle') : 'tomt'}`, onclick: () => onClick(i) }, v ? MARK[v] : '')));
    }

    // ── on this screen ──
    function reset() { board = Array(9).fill(0); turn = 1; over = false; win = null; thinking = false; clearTimeout(self._t); drawLocal(); }
    function put(i) {
      if (over || board[i]) return;
      board[i] = turn;
      win = tttWinner(board);
      if (win || board.every(Boolean)) {
        over = true;
        const s = (st.stats[statKey()] ||= { w: 0, l: 0, d: 0 });
        if (!win) s.d++; else if (st.mode === 'two' || win.player === 1) s.w++; else s.l++;
        store.save();
        if (st.mode === 'cpu' && win?.player === 1) toast('Du vandt!', { type: 'xp', text: `Mod computeren på ${LEVELS[st.level].toLowerCase()}` });
      } else turn = turn === 1 ? 2 : 1;
      drawLocal();
      if (!over && st.mode === 'cpu' && turn === 2) { thinking = true; self._t = setTimeout(() => { thinking = false; put(tttBest(board, 2, st.level)); }, 420); }
    }
    function drawLocal() {
      const s = st.stats[statKey()] || { w: 0, l: 0, d: 0 };
      const msg = over ? (win ? (st.mode === 'cpu' ? (win.player === 1 ? 'Du vandt! 🎉' : 'Computeren vandt') : `${MARK[win.player]} vandt! 🎉`) : 'Uafgjort')
        : thinking ? 'Computeren tænker …' : st.mode === 'cpu' ? 'Din tur – du er ✕' : `${MARK[turn]}s tur`;
      h(clear(localBox), null, panel(null, null, h('div', { class: 'c4-status' }, msg),
        grid(board, { cells: win?.cells || [], onClick: (i) => { if (st.mode === 'cpu' && turn !== 1) return; put(i); }, disabled: over || thinking }),
        h('div', { class: 'gm-top', style: { marginTop: '14px' } }, h('span', null, 'Vundet ', h('b', null, String(s.w))), st.mode === 'cpu' ? h('span', null, 'Tabt ', h('b', null, String(s.l))) : null,
          h('span', null, 'Uafgjort ', h('b', null, String(s.d))), h('button', { class: 'btn btn-sm', onclick: reset }, icon('refresh'), 'Nyt spil'))));
    }

    // ── online ──
    let room = null;
    const myIdx = () => (room ? room.players.findIndex(p => p.id === me()) : -1);
    function openRoom(r) {
      self._off?.(); self._unwatch?.(); self._unwatch = null; room = r;
      if (r && isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
      if (!r) { history.replaceState(null, '', '#/apps/tictactoe/online'); return drawOnline(); }
      history.replaceState(null, '', `#/apps/tictactoe/online/${r.id}`);
      self._off = watchRoom(r.id, (nr) => { if (!nr) { toast('Spillet er lukket', { type: 'info' }); room = null; self._off?.(); drawOnline(); return; }
        const was = room?.state?.winner; room = nr; drawOnline();
        if (nr.status === 'done' && was == null && nr.state.winner && nr.state.winner === myIdx() + 1) toast('Du vandt!', { type: 'xp', text: 'Kryds og bolle online' }); });
      drawOnline();
    }
    function drawOnline() {
      clear(onlineBox);
      if (!room) { onlineBox.append(lobbyPanel({ game: 'ttt', text: 'Udfordr en, der har HUBTECH. Den, der starter, skifter hver gang I spiller igen.', onOpen: openRoom })); return; }
      const S = room.state, mi = myIdx();
      let msg;
      if (room.status === 'invite') msg = `Venter på, at ${room.invited.map(p => p.name).join(', ') || 'modstanderen'} siger ja …`;
      else if (room.status === 'done') msg = S.winner === 0 ? 'Uafgjort!' : S.gaveUp ? (S.gaveUp === me() ? 'Du gav op' : mi < 0 ? `${room.players[S.winner - 1]?.name} vandt` : 'Modstanderen gav op – du vandt') : S.winner === mi + 1 ? 'Du vandt! 🎉' : `${room.players[S.winner - 1]?.name || 'Modstanderen'} vandt`;
      else msg = S.turn === mi ? `Din tur – du er ${MARK[mi + 1]}` : `${room.players[S.turn]?.name || 'Modstanderen'}s tur …`;
      const canMove = room.status === 'playing' && S.turn === mi;
      onlineBox.append(panel(null, null,
        h('div', { class: 'c4-vs' }, [0, 1].map(i => h('span', { class: 'c4-side ttt-side' }, h('b', { class: `ttt-mark p${i + 1}` }, MARK[i + 1]), person(room.players[i] || room.invited[0]), h('b', null, String(S.score?.[i] || 0))))),
        h('div', { class: 'c4-status' }, msg),
        grid(S.board, { cells: S.cells || [], last: S.last, disabled: !canMove, onClick: async (i) => { try { room = await roomApi.move(room.id, undefined, i); drawOnline(); } catch (e) { toast(e.message, { type: 'warn' }); } } }),
        h('div', { class: 'row-actions', style: { justifyContent: 'center' } },
          mi < 0 ? h('span', { class: 'chip' }, icon('eye'), 'Du ser med') : null,
          mi >= 0 && room.status === 'done' && room.players.length === 2 ? h('button', { class: 'btn btn-primary', onclick: async () => { try { room = await roomApi.rematch(room.id); drawOnline(); } catch (e) { toast(e.message, { type: 'warn' }); } } }, icon('refresh'), 'Spil igen') : null,
          h('button', { class: 'btn', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
          mi >= 0 && room.status !== 'done' ? h('button', { class: 'btn btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), room.status === 'playing' ? 'Giv op' : 'Annullér') : null)));
    }

    const levelSeg = segmented(Object.entries(LEVELS).map(([value, label]) => ({ value, label })), st.level, (v) => { st.level = v; store.save(); reset(); }, { label: 'Sværhedsgrad' });
    function showMode() {
      levelSeg.hidden = st.mode !== 'cpu';
      localBox.hidden = st.mode === 'online'; onlineBox.hidden = st.mode !== 'online';
      if (st.mode === 'online') {
        if (ctx?.params?.id && !room) roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
          .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
        else drawOnline();
      } else reset();
    }
    const modeSeg = segmented([{ value: 'cpu', label: 'Mod computeren', icon: 'bot' }, { value: 'two', label: 'To på én skærm', icon: 'users' }, { value: 'online', label: 'Online', icon: 'globe' }], st.mode,
      (v) => { st.mode = v; if (v !== 'online') { store.save(); history.replaceState(null, '', '#/apps/tictactoe'); } showMode(); }, { label: 'Spillere' });
    showMode();
    return h('div', { class: 'page gm-page ttt-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Kryds og bolle', lead: 'Tre på stribe – vandret, lodret eller på skrå. Kan du slå den umulige computer?', compact: true }),
      h('div', { class: 'cmd-filters c4-filters', style: { margin: '16px 0' } }, modeSeg, levelSeg), localBox, onlineBox);
  },
};
