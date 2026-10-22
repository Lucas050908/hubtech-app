/** Fire på stribe – against the computer (three levels) or two players on the same screen. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher } from '../features/gameroom.js';
import { c4Empty, c4Drop, c4Winner, c4Valid, c4Best, C4_LEVELS, C4_ROWS, C4_COLS } from '../features/gamelogic.js';

export default {
  title: 'Fire på stribe',
  destroy() { clearTimeout(this._t); removeEventListener('keydown', this._k); this._off?.(); this._unwatch?.(); },
  async render(ctx) {
    const app = appById('connect4');
    let store;
    try { store = await appState('connect4', { mode: 'cpu', level: 'medium', stats: {} }); } catch (e) { return loadError('Fire på stribe', e); }
    const st = store.data, self = this;
    let board, turn, over, win, thinking = false, hover = 3;
    const boardEl = h('div', { class: 'c4-board', role: 'grid', 'aria-label': 'Spillebræt' });
    const status = h('div', { class: 'c4-status', 'aria-live': 'polite' });
    const statsEl = h('div', { class: 'c4-stats' });
    const statKey = () => (st.mode === 'cpu' ? st.level : 'two');
    if (ctx?.params?.sub === 'online') st.mode = 'online';
    let room = null;                                    // the online game being shown
    const onlineBox = h('div', { class: 'stack c4-online' });
    const localBox = h('div', { class: 'c4-local' });

    function reset() { board = c4Empty(); turn = 1; over = false; win = null; thinking = false; clearTimeout(self._t); draw(); }
    function play(col) {
      if (over || thinking || (st.mode === 'cpu' && turn !== 1)) return;
      if (!move(col)) return;
      if (!over && st.mode === 'cpu') {
        thinking = true; draw();
        self._t = setTimeout(() => { thinking = false; move(c4Best(board, 2, C4_LEVELS[st.level].depth)); }, 380);
      }
    }
    function move(col) {
      if (col < 0 || c4Drop(board, col, turn) < 0) return false;
      win = c4Winner(board);
      if (win || !c4Valid(board).length) {
        over = true;
        const s = (st.stats[statKey()] ||= { w: 0, l: 0, d: 0 });
        if (!win) s.d++; else if (st.mode === 'two' || win.player === 1) s.w++; else s.l++;
        store.save();
        if (st.mode === 'cpu' && win?.player === 1) toast('Du vandt!', { type: 'xp', text: `Mod computeren på ${C4_LEVELS[st.level].label.toLowerCase()}` });
      } else turn = turn === 1 ? 2 : 1;
      draw(); return true;
    }
    const name = (p) => (st.mode === 'cpu' ? (p === 1 ? 'Du' : 'Computeren') : (p === 1 ? 'Rød' : 'Gul'));
    function draw() {
      clear(boardEl);
      const winSet = new Set((win?.cells || []).map(([r, c]) => `${r},${c}`));
      for (let c = 0; c < C4_COLS; c++) {
        const col = h('button', { class: ['c4-col', c === hover && !over && 'is-hover'], 'aria-label': `Kolonne ${c + 1}`, disabled: over || board[0][c] !== 0, dataset: { c },
          onclick: () => play(c), onmouseenter: () => { hover = c; boardEl.querySelectorAll('.c4-col').forEach(x => x.classList.toggle('is-hover', Number(x.dataset.c) === c && !over)); } });
        for (let r = 0; r < C4_ROWS; r++) col.append(h('i', { class: ['c4-cell', board[r][c] && `p${board[r][c]}`, winSet.has(`${r},${c}`) && 'is-win'] }));
        boardEl.append(col);
      }
      status.className = `c4-status p${turn}`;
      status.textContent = over ? (win ? (st.mode === 'cpu' ? (win.player === 1 ? 'Du vandt! 🎉' : 'Computeren vandt') : `${name(win.player)} vandt! 🎉`) : 'Uafgjort – brættet er fyldt')
        : thinking ? 'Computeren tænker …' : st.mode === 'cpu' ? 'Din tur – vælg en kolonne' : `${name(turn)}s tur`;
      const s = st.stats[statKey()] || { w: 0, l: 0, d: 0 };
      h(clear(statsEl), null, st.mode === 'cpu'
        ? [h('span', null, 'Vundet ', h('b', null, String(s.w))), h('span', null, 'Tabt ', h('b', null, String(s.l))), h('span', null, 'Uafgjort ', h('b', null, String(s.d)))]
        : [h('span', null, 'Spil ', h('b', null, String(s.w + s.d))), h('span', null, 'Uafgjort ', h('b', null, String(s.d)))]);
    }
    this._k = (e) => {
      if (st.mode === 'online' || !document.body.contains(boardEl) || e.target.closest?.('input, textarea, select')) return;
      if (/^[1-7]$/.test(e.key)) { e.preventDefault(); hover = Number(e.key) - 1; play(hover); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); hover = (hover + (e.key === 'ArrowLeft' ? 6 : 1)) % 7; draw(); }
      else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button')) { e.preventDefault(); play(hover); }
    };
    addEventListener('keydown', this._k);
    const levelSeg = segmented(Object.entries(C4_LEVELS).map(([value, l]) => ({ value, label: l.label })), st.level, (v) => { st.level = v; store.save(); reset(); }, { label: 'Sværhedsgrad' });
    const modeSeg = segmented([{ value: 'cpu', label: 'Mod computeren', icon: 'bot' }, { value: 'two', label: 'To på én skærm', icon: 'users' }, { value: 'online', label: 'Online', icon: 'globe' }], st.mode,
      (v) => { st.mode = v; if (v !== 'online') { store.save(); location.hash !== '#/apps/connect4' && history.replaceState(null, '', '#/apps/connect4'); } showMode(); }, { label: 'Spillere' });

    // ── online: against someone else on this HUBTECH ──
    const myIdx = () => room ? room.players.findIndex(p => p.id === me()) : -1;
    function openRoom(r) {
      self._off?.(); self._unwatch?.(); self._unwatch = null;
      if (r && isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
      room = r;
      if (!r) { history.replaceState(null, '', '#/apps/connect4/online'); return drawOnline(); }
      history.replaceState(null, '', `#/apps/connect4/online/${r.id}`);
      self._off = watchRoom(r.id, (nr) => { if (!nr) { toast('Spillet er lukket', { type: 'info' }); room = null; self._off?.(); drawOnline(); return; }
        const was = room?.state?.winner; room = nr; drawOnline();
        if (nr.status === 'done' && was == null && nr.state.winner != null && nr.state.winner === myIdx() + 1) toast('Du vandt!', { type: 'xp', text: 'Fire på stribe online' }); });
      drawOnline();
    }
    function drawOnline() {
      clear(onlineBox);
      if (!room) { onlineBox.append(lobbyPanel({ game: 'connect4', text: 'Vælg en, der har HUBTECH, og send en udfordring. De får en besked og kan spille med med det samme – også på telefonen.', onOpen: openRoom })); return; }
      const S = room.state, mi = myIdx();
      const red = room.players[0], yellow = room.players[1];
      let msg;
      if (room.status === 'invite') msg = `Venter på, at ${room.invited.map(p => p.name).join(', ') || 'modstanderen'} siger ja …`;
      else if (room.status === 'done') msg = S.winner === 0 ? 'Uafgjort!' : S.gaveUp ? (S.gaveUp === me() ? 'Du gav op' : 'Modstanderen gav op – du vandt') : S.winner === mi + 1 ? 'Du vandt! 🎉' : `${room.players[S.winner - 1]?.name || 'Modstanderen'} vandt`;
      else msg = S.turn === mi ? 'Din tur – vælg en kolonne' : `${room.players[S.turn]?.name || 'Modstanderen'}s tur …`;
      if (mi < 0 && room.status === 'done') msg = S.winner === 0 ? 'Uafgjort!' : `${room.players[S.winner - 1]?.name || 'Ukendt'} vandt`;
      const winSet = new Set((S.cells || []).map(([r, c]) => `${r},${c}`));
      const b = h('div', { class: 'c4-board', role: 'grid', 'aria-label': 'Spillebræt' });
      const canMove = room.status === 'playing' && S.turn === mi;
      for (let c = 0; c < C4_COLS; c++) {
        const col = h('button', { class: 'c4-col', 'aria-label': `Kolonne ${c + 1}`, disabled: !canMove || S.board[0][c] !== 0,
          onclick: async () => { try { room = await roomApi.move(room.id, c); drawOnline(); } catch (e) { toast(e.message, { type: 'warn' }); } } });
        for (let r = 0; r < C4_ROWS; r++) col.append(h('i', { class: ['c4-cell', S.board[r][c] && `p${S.board[r][c]}`, winSet.has(`${r},${c}`) && 'is-win', S.last && S.last[0] === r && S.last[1] === c && 'is-last'] }));
        b.append(col);
      }
      onlineBox.append(panel(null, null,
        h('div', { class: 'c4-vs' }, h('span', { class: 'c4-side p1' }, h('i'), person(red || room.invited[0]), h('b', null, String(S.score?.[0] || 0))), h('span', { class: 'faint' }, 'mod'),
          h('span', { class: 'c4-side p2' }, h('i'), person(yellow || room.invited[0]), h('b', null, String(S.score?.[1] || 0)))),
        h('div', { class: ['c4-status', room.status === 'playing' && `p${S.turn + 1}`] }, msg),
        h('div', { class: 'c4-wrap' }, b),
        h('div', { class: 'row-actions', style: { justifyContent: 'center' } },
          mi < 0 ? h('span', { class: 'chip' }, icon('eye'), `Du ser med${room.watchers > 1 ? ` sammen med ${room.watchers - 1} andre` : ''}`) : null,
          mi >= 0 && room.status === 'done' && room.players.length === 2 ? h('button', { class: 'btn btn-primary', onclick: async () => { try { room = await roomApi.rematch(room.id); drawOnline(); } catch (e) { toast(e.message, { type: 'warn' }); } } }, icon('refresh'), 'Spil igen') : null,
          h('button', { class: 'btn', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
          mi >= 0 && room.status !== 'done' ? h('button', { class: 'btn btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); self._off?.(); room = null; openRoom(null); } }, icon('x'), room.status === 'playing' ? 'Giv op' : 'Annullér') : null)));
    }
    function showMode() {
      levelSeg.hidden = st.mode !== 'cpu';
      localBox.hidden = st.mode === 'online'; onlineBox.hidden = st.mode !== 'online';
      if (st.mode === 'online') {
        if (ctx?.params?.id && !room) roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
          .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
        else drawOnline();
      } else reset();
    }
    reset(); showMode();
    return h('div', { class: 'page gm-page c4-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Fire på stribe', lead: 'Få fire i træk – vandret, lodret eller på skrå. Klik på en kolonne, eller tryk 1–7.', compact: true }),
      h('div', { class: 'cmd-filters c4-filters', style: { margin: '16px 0' } }, modeSeg, levelSeg),
      h(localBox, null, panel(null, null, status,
        h('div', { class: 'c4-wrap' }, boardEl),
        h('div', { class: 'gm-top', style: { marginTop: '14px' } }, statsEl, h('button', { class: 'btn btn-sm', onclick: reset }, icon('refresh'), 'Nyt spil')))),
      onlineBox);
  },
};
