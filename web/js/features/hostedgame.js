/**
 * A turn-based game that can be played on one screen (against the computer or each other) or online with the
 * others on HUBTECH. The game itself is a pure module: newGame(seats) → state, apply(state, seat, name, args) → bool,
 * aiMove(state, seat) → { name, args } | null. Online, the host's browser runs the game (like Yatzy and Skak):
 * the others send their moves to the host, and the host syncs the state to everybody.
 * State conventions: s.players = [{ name, uid?, ai }], s.turn = seat whose turn it is, s.phase === 'over' at the end.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented, confirmDialog } from '../core/ui.js';
import { api } from '../core/api.js';
import { onLive } from '../core/live.js';
import { store as appStore } from '../core/store.js';
import { panel } from './appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher } from './gameroom.js';

const myName = () => (appStore.get('user')?.displayName || 'Dig').split(' ')[0].slice(0, 16);

/**
 * opts: { page, game, appId, title, store (appState result, uses store.data.game), minPlayers, maxPlayers, allowHotseat,
 *         newGame(seats), apply(s, seat, name, args), aiMove(s, seat), render(ctl, el), rules?(), onOver?(s, ctl), onlineText,
 *         aiDelay(s, seat, move) ms }
 * Returns { el, destroy }.
 */
export function hostedGame(opts) {
  const { game, page, store, minPlayers = 2, maxPlayers = 2, allowHotseat = true } = opts;
  const st = store.data;
  const root = h('div');
  const board = h('div');
  let mode = location.hash.includes(`/apps/${page}/online`) ? 'online' : 'local';
  let room = null, ctl = null, syncT = 0, aiT = 0, offs = [], dead = false;

  // ── controllers ──
  const localCtl = () => ({
    s: st.game, online: false, host: true, mySeat: st.game.turn,
    canAct: (seat) => !st.game.players[seat]?.ai,
    isMe: (seat) => !st.game.players[seat]?.ai,
    act(name, args = []) { if (opts.apply(st.game, this.actor ?? st.game.turn, name, args)) { store.save(); after(); return true; } return false; },
    actAs(seat, name, args = []) { if (opts.apply(st.game, seat, name, args)) { store.save(); after(); return true; } return false; },
  });
  const onlineCtl = () => {
    const s = room.state.blob, mySeat = s.players.findIndex(p => p.uid === me()), host = room.host === me();
    return {
      s, online: true, host, mySeat,
      canAct: (seat) => seat === mySeat && !isWatcher(room),
      isMe: (seat) => seat === mySeat,
      act(name, args = []) { return this.actAs(mySeat, name, args); },
      actAs(seat, name, args = []) {
        if (seat !== mySeat) return false;
        if (host) { if (opts.apply(s, mySeat, name, args)) { push(); after(); return true; } return false; }
        api.post(`/api/games/rooms/${room.id}/act`, { name, args }).catch(e => toast(e.message, { type: 'warn' }));
        return true;
      },
    };
  };
  function push() {
    clearTimeout(syncT);
    const r = room, blob = room.state.blob;
    syncT = setTimeout(() => api.post(`/api/games/rooms/${r.id}/sync`, { blob }).catch(() => {}), 50);
  }
  function after() { draw(); scheduleAi(); }

  // the computer plays its seats (locally, or on the host's device online)
  function scheduleAi() {
    clearTimeout(aiT);
    const s = mode === 'online' ? room?.state?.blob : st.game;
    if (!s || s.phase === 'over' || dead) return;
    if (mode === 'online' && room?.host !== me()) return;
    for (let seat = 0; seat < s.players.length; seat++) {
      if (!s.players[seat].ai) continue;
      const mv = opts.aiMove(s, seat);
      if (!mv) continue;
      aiT = setTimeout(() => {
        if (dead) return;
        const cur = mode === 'online' ? room?.state?.blob : st.game;
        if (cur !== s) { if (cur) { draw(); scheduleAi(); } return; }   // the game was reloaded meanwhile (fx synced from another device): carry on with that one
        if (opts.apply(s, seat, mv.name, mv.args || [])) { if (mode === 'online') push(); else store.save(); after(); }
      }, opts.aiDelay ? opts.aiDelay(s, seat, mv) : 700);
      return;
    }
  }

  function draw() {
    if (dead) return;
    if (!ctl) return;
    ctl = mode === 'online' ? onlineCtl() : localCtl();
    const s = ctl.s;
    if (s.phase === 'over' && !s._counted && (mode === 'local' || ctl.host)) { s._counted = true; opts.onOver?.(s, ctl); if (mode === 'local') store.save(); }
    h(clear(board), null, opts.render(ctl));
  }

  // ── local: setup ──
  function setup() {
    ctl = null;
    const players = (st.setup?.players || [{ name: myName(), ai: false }, { name: 'Computer', ai: true }]).slice(0, maxPlayers);
    const list = h('div', { class: 'pg-setup-list' });
    const drawList = () => {
      h(clear(list), null, players.map((p, i) => {
        const name = h('input', { class: 'input', value: p.name, maxlength: 16, 'aria-label': `Navn på spiller ${i + 1}` });
        name.addEventListener('input', () => { p.name = name.value.trim() || `Spiller ${i + 1}`; });
        return h('div', { class: 'pg-setup-row' }, h('span', { class: 'yz-seat', style: opts.seatColor ? { background: opts.seatColor(i) } : null }, String(i + 1)), name,
          allowHotseat || i > 0 ? segmented([{ value: 'h', label: 'Menneske' }, { value: 'ai', label: 'Computer' }], p.ai ? 'ai' : 'h', (v) => { p.ai = v === 'ai'; if (p.ai && /^Spiller/.test(p.name)) p.name = 'Computer'; drawList(); }, { label: `Spiller ${i + 1}` }) : h('span'),
          players.length > minPlayers ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern spiller', onclick: () => { players.splice(i, 1); drawList(); } }, icon('x')) : h('span'));
      }), players.length < maxPlayers ? h('button', { class: 'btn btn-sm', onclick: () => { players.push({ name: `Computer ${players.length}`, ai: true }); drawList(); } }, icon('plus'), 'Tilføj spiller') : null);
    };
    drawList();
    h(clear(board), null, panel('Nyt spil', 'users', opts.setupExtra?.(st) || null, list,
      h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
        if (!players.some(p => !p.ai)) return toast('Mindst én skal være et menneske', { type: 'warn' });
        st.setup = { players: players.map(p => ({ ...p })) };
        st.game = opts.newGame(players.map(p => ({ name: p.name, ai: !!p.ai })), st);
        store.save(); ctl = localCtl(); after();
      } }, icon('play'), 'Start'))), opts.rules?.() || null);
  }

  // ── online ──
  function openRoom(r) {
    offs.forEach(f => f()); offs = [];
    room = r; ctl = null;
    if (!r) { history.replaceState(null, '', `#/apps/${page}/online`); return drawOnline(); }
    if (isWatcher(r)) { const id = r.id; offs.push(() => roomApi.unwatch(id)); }
    history.replaceState(null, '', `#/apps/${page}/online/${r.id}`);
    offs.push(watchRoom(r.id, (nr) => {
      if (!nr) { toast('Spillet er lukket', { type: 'info' }); openRoom(null); return; }
      const keep = room?.host === me() && room?.state?.blob && nr.status === 'playing' ? room.state.blob : null;
      room = nr;
      if (keep) room.state.blob = keep;
      hostCheckSeats();
      drawOnline();
    }));
    offs.push(onLive('game-act', (ev) => {
      if (!room || ev.id !== room.id || room.host !== me() || !room.state.blob) return;
      const s = room.state.blob, seat = s.players.findIndex(p => p.uid === ev.from);
      if (seat >= 0 && opts.apply(s, seat, ev.name, ev.args || [])) { push(); after(); }
    }));
    drawOnline();
  }
  function hostCheckSeats() {
    if (!room?.state?.blob || room.host !== me()) return;
    const s = room.state.blob, ids = new Set(room.players.map(p => p.id));
    let changed = false;
    s.players.forEach(p => { if (p.uid && !p.ai && !ids.has(p.uid)) { p.ai = true; p.name = `${p.name} (computer)`; changed = true; } });
    if (changed) { push(); scheduleAi(); }
  }
  function drawOnline() {
    if (!room) {
      h(clear(board), null, lobbyPanel({ game, byLink: true, multi: maxPlayers > 2, title: `Spil ${opts.title} online`, text: opts.onlineText || 'Invitér en af dem, der har HUBTECH. I spiller hver på jeres egen enhed.', onOpen: openRoom }), opts.rules?.() || null);
      return;
    }
    if (room.state.blob && (room.status === 'playing' || room.status === 'done')) {
      const first = !ctl; ctl = onlineCtl(); draw(); if (first) scheduleAi(); return;
    }
    const host = room.host === me(), watcher = isWatcher(room);
    let bots = 0;
    const botSel = maxPlayers > 2 ? h('select', { class: 'select', 'aria-label': 'Computerspillere' }, Array.from({ length: maxPlayers - 1 }, (_, n) => h('option', { value: n }, n ? `+ ${n} computer${n > 1 ? 'e' : ''}` : 'Ingen computere'))) : null;
    botSel?.addEventListener('change', () => { bots = Number(botSel.value); });
    const startBtn = h('button', { class: 'btn btn-primary btn-lg', disabled: room.players.length < 2 && !(maxPlayers > 2), onclick: async () => {
      const seats = room.players.slice(0, maxPlayers).map(p => ({ name: (p.name || 'Spiller').split(' ')[0].slice(0, 16), uid: p.id, ai: false }));
      for (let n = 0; n < bots && seats.length < maxPlayers; n++) seats.push({ name: `Computer ${n + 1}`, ai: true });
      if (seats.length < minPlayers) return toast(`Der skal være mindst ${minPlayers} spillere`, { type: 'warn' });
      try {
        await roomApi.start(room.id);
        room.state.blob = opts.newGame(seats, st); room.status = 'playing';
        await api.post(`/api/games/rooms/${room.id}/sync`, { blob: room.state.blob });
        drawOnline();
      } catch (e) { toast(e.message, { type: 'warn' }); }
    } }, icon('play'), 'Start spillet');
    h(clear(board), null, panel(`Klar til ${opts.title}`, 'users',
      h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
        !watcher ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), 'Forlad') : null),
      h('div', { class: 'tr-lobby' }, room.players.map(p => person(p, h('span', { class: 'chip chip-ok' }, 'Klar'))), room.invited.map(p => person(p, h('span', { class: 'chip' }, 'Inviteret')))),
      room.code && room.players.length < maxPlayers ? inviteLinks(room) : null,
      host ? [botSel ? h('div', { class: 'row-actions' }, botSel) : null, startBtn, h('p', { class: 'faint' }, 'Du er vært: spillet kører på din enhed, så hold HUBTECH åben, mens I spiller.')]
        : h('p', { class: 'muted' }, `${room.players.find(p => p.id === room.host)?.name || 'Værten'} starter spillet, når alle er klar.`)));
  }

  /** links to this table: one for people here, one for each connected HUBTECH */
  function inviteLinks(r) {
    const path = `/apps/${page}/online/${r.id}?k=${r.code}`, box = h('div', { class: 'stack gml-links', style: { gap: '6px' } });
    const row = (label, url, icn) => h('div', { class: 'gml-link', dataset: { url } }, icon(icn), h('span', null, label), h('button', { class: 'btn btn-sm', onclick: () => import('./appkit.js').then(m => m.copy(url, 'Linket er kopieret – send det til din ven')) }, icon('copy'), 'Kopiér link'),
      navigator.share ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Del', onclick: () => navigator.share({ title: `Spil ${opts.title} med mig`, url }).catch(() => {}) }, icon('share')) : null);
    h(box, null, h('b', { style: { fontSize: '14px' } }, 'Invitér med et link'), row('Til nogen på denne HUBTECH', `${location.origin}/#${path}`, 'link'));
    api.get('/api/hublink').then(hi => { for (const l of hi.links) box.append(row(`Til en ven på ${l.name}`, `${l.url}/#/hub-go/${hi.id}?next=${encodeURIComponent(path)}`, 'home')); }).catch(() => {});
    return box;
  }

  /** buttons under the board: new game / leave */
  const controls = () => mode === 'online'
    ? [h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
      room && !isWatcher(room) && ctl?.s.phase !== 'over' ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Forlad spillet?', text: room.host === me() ? 'Du er vært – spillet slutter for alle.' : 'Computeren tager over for dig.', confirmLabel: 'Forlad', danger: true })) { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } } }, icon('x'), 'Forlad') : null,
      room && ctl?.s.phase === 'over' ? h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { try { openRoom(await roomApi.rematch(room.id)); } catch (e) { toast(e.message, { type: 'warn' }); } } }, icon('refresh'), 'Spil igen') : null]
    : [h('button', { class: ['btn btn-sm', ctl?.s.phase === 'over' && 'btn-primary'], onclick: async () => { if (ctl?.s.phase === 'over' || await confirmDialog({ title: 'Start et nyt spil?', text: 'Det igangværende spil slutter.', confirmLabel: 'Nyt spil' })) { st.game = null; store.save(); setup(); } } }, icon('refresh'), 'Nyt spil')];

  const modeSeg = segmented([{ value: 'local', label: 'På denne skærm', icon: 'monitor' }, { value: 'online', label: 'Online', icon: 'globe' }], mode, (v) => {
    mode = v; offs.forEach(f => f()); offs = []; clearTimeout(aiT);
    if (v === 'local') { history.replaceState(null, '', `#/apps/${page}`); room = null; if (st.game) { ctl = localCtl(); after(); } else setup(); }
    else openRoom(null);
  }, { label: 'Hvor' });

  const id = location.hash.split('?')[0].split('/')[4];
  if (mode === 'online') {
    const k = new URLSearchParams(location.hash.split('?')[1] || '').get('k');
    if (id && k) roomApi.join(id, k).then(openRoom).catch((e) => { toast('Kunne ikke komme med i spillet', { type: 'warn', text: e.message }); openRoom(null); });
    else if (id) roomApi.get(id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
      .catch(() => roomApi.watch(id).then(openRoom).catch(() => openRoom(null)));
    else openRoom(null);
  } else if (st.game) { ctl = localCtl(); queueMicrotask(after); } else setup();   // after the page has its handle on us (render may use it)

  h(root, null, h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, modeSeg), board);
  return { el: root, controls, redraw: () => draw(), destroy() { dead = true; clearTimeout(aiT); clearTimeout(syncT); offs.forEach(f => f()); offs = []; } };
}
