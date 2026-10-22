/**
 * Spil sammen – the shared pieces for online games: pick who to play with, the list of your games and invites,
 * and following one room live (the server pushes every change over the live bus).
 */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { store } from '../core/store.js';
import { panel } from './appkit.js';

export const me = () => store.get('user')?.id;
export const roomApi = {
  players: () => api.get('/api/games/players').then(r => r.players),
  mine: () => api.get('/api/games/rooms').then(r => r.rooms),
  get: (id) => api.get(`/api/games/rooms/${id}`).then(r => r.room),
  create: (game, invite) => api.post('/api/games/rooms', { game, invite }).then(r => r.room),
  join: (id) => api.post(`/api/games/rooms/${id}/join`, {}).then(r => r.room),
  leave: (id) => api.post(`/api/games/rooms/${id}/leave`, {}),
  move: (id, col, cell) => api.post(`/api/games/rooms/${id}/move`, col !== undefined ? { col } : { cell }).then(r => r.room),
  rematch: (id) => api.post(`/api/games/rooms/${id}/rematch`, {}).then(r => r.room),
  start: (id) => api.post(`/api/games/rooms/${id}/start`, {}).then(r => r.room),
  live: () => api.get('/api/games/live').then(r => r.rooms),
  watch: (id) => api.post(`/api/games/rooms/${id}/watch`, {}).then(r => r.room),
  unwatch: (id) => api.post(`/api/games/rooms/${id}/unwatch`, {}).catch(() => {}),
  progress: (id, typed, errors) => api.post(`/api/games/rooms/${id}/progress`, { typed, errors }),
};

/** Follow a room: fn(room) on every change, fn(null) when it is gone. Returns an unsubscribe function. */
export function watchRoom(id, fn) {
  let last = -1;
  const off1 = onLive('game', (ev) => { if (ev.room?.id === id && ev.room.version > last) { last = ev.room.version; fn(ev.room); } });
  const off2 = onLive('game-gone', (ev) => { if (ev.id === id) fn(null); });
  const off3 = onLive('reset', () => roomApi.get(id).then(r => { last = r.version; fn(r); }).catch(() => fn(null)));
  return () => { off1(); off2(); off3(); };
}

/** Am I only watching this room? */
export const isWatcher = (r) => !!r && !r.players.some(p => p.id === me()) && !r.invited.some(p => p.id === me());

export const person = (p, extra) => h('span', { class: 'gr-person' }, h('span', { class: 'avatar avatar-sm' }, ava(p?.avatar)), h('span', null, p?.name || 'Ukendt'), extra || null);

/**
 * The "play with someone" panel: everyone on this HUBTECH (online first) + your open games and invites.
 * opts: { game, multi (several players), title, onOpen(room) }
 */
export function lobbyPanel({ game, multi = false, title = 'Spil mod en anden', text, onOpen }) {
  const list = h('div', { class: 'gr-players' });
  const games = h('div', { class: 'gr-games' });
  const watching = h('div', { class: 'gr-games' });
  const chosen = new Set();
  const go = h('button', { class: 'btn btn-primary', disabled: true }, icon('send'), multi ? 'Invitér' : 'Udfordr');
  let filter = '';
  let all = [];
  const search = h('input', { class: 'input', placeholder: 'Søg efter navn', 'aria-label': 'Søg efter en spiller' });
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); drawPlayers(); });

  function drawPlayers() {
    clear(list);
    const shown = all.filter(p => !filter || p.name.toLowerCase().includes(filter) || p.username.toLowerCase().includes(filter));
    if (!all.length) { list.append(h('p', { class: 'faint', style: { margin: 0 } }, 'Der er ingen andre på denne HUBTECH endnu. Når en ven har oprettet en konto, kan I spille sammen her.')); return; }
    if (!shown.length) { list.append(h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen fundet.')); return; }
    for (const p of shown.slice(0, 40)) {
      const on = chosen.has(p.id);
      list.append(h('button', { class: ['gr-player', on && 'is-on'], 'aria-pressed': String(on), dataset: { uid: p.id },
        onclick: () => { if (!multi) chosen.clear(); on ? chosen.delete(p.id) : chosen.add(p.id); go.disabled = !chosen.size; drawPlayers(); } },
        h('span', { class: 'avatar avatar-sm' }, ava(p.avatar)), h('span', { class: 'gr-name' }, p.name, h('small', null, `@${p.username}`)),
        h('span', { class: ['gr-dot', p.online && 'is-on'], title: p.online ? 'Online' : 'Offline' }), on ? icon('check') : null));
    }
  }
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { const r = await roomApi.create(game, [...chosen]); chosen.clear(); drawPlayers(); toast('Invitationen er sendt', { type: 'ok', text: 'Spillet starter, når de siger ja.' }); onOpen(r); }
    catch (e) { toast('Kunne ikke invitere', { type: 'bad', text: e.message }); go.disabled = false; }
  });

  async function drawGames() {
    let rooms = [];
    try { rooms = (await roomApi.mine()).filter(r => r.game === game); } catch { /* */ }
    clear(games);
    if (!rooms.length) return;
    games.append(h('h3', { class: 'gr-h' }, 'Dine spil og invitationer'));
    for (const r of rooms) {
      const mineIn = r.players.some(p => p.id === me());
      const others = [...r.players, ...r.invited].filter(p => p.id !== me());
      const label = !mineIn ? 'Inviterer dig' : r.status === 'invite' || r.status === 'lobby' ? 'Venter' : r.status === 'playing' ? 'I gang' : 'Færdig';
      games.append(h('div', { class: 'gr-game' },
        h('div', { class: 'gr-game-who' }, others.slice(0, 3).map(p => person(p)), others.length > 3 ? h('span', { class: 'faint' }, `+${others.length - 3}`) : null),
        h('span', { class: ['chip', !mineIn && 'chip-info', r.status === 'playing' && 'chip-ok'] }, label),
        mineIn ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => onOpen(r) }, 'Åbn')
          : h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { try { onOpen(await roomApi.join(r.id)); } catch (e) { toast('Kunne ikke være med', { type: 'bad', text: e.message }); drawGames(); } } }, icon('play'), 'Spil med'),
        h('button', { class: 'icon-btn btn-sm', 'aria-label': mineIn ? 'Forlad spillet' : 'Afvis', title: mineIn ? 'Forlad spillet' : 'Afvis', onclick: async () => { await roomApi.leave(r.id).catch(() => {}); drawGames(); } }, icon('x'))));
    }
  }
  async function drawLive() {
    let rooms = [];
    try { rooms = (await roomApi.live()).filter(r => r.game === game); } catch { /* */ }
    clear(watching);
    if (!rooms.length) return;
    watching.append(h('h3', { class: 'gr-h' }, 'Spil i gang lige nu – se med'));
    for (const r of rooms.slice(0, 8)) {
      watching.append(h('div', { class: 'gr-game' },
        h('div', { class: 'gr-game-who' }, r.players.map(p => person(p))),
        h('span', { class: ['chip', r.status === 'playing' && 'chip-ok'] }, r.status === 'playing' ? 'I gang' : 'Venter på start'),
        r.watchers ? h('span', { class: 'faint', style: { fontSize: '13px' } }, `${r.watchers} ser med`) : null,
        h('button', { class: 'btn btn-sm', onclick: async () => { try { onOpen(await roomApi.watch(r.id)); } catch (e) { toast('Kunne ikke se med', { type: 'bad', text: e.message }); drawLive(); } } }, icon('eye'), 'Se med')));
    }
  }
  const off = onLive('game', () => { if (document.body.contains(games)) drawGames(); else off(); });
  const liveIv = setInterval(() => { if (document.body.contains(watching)) drawLive(); else clearInterval(liveIv); }, 15000);
  drawLive();
  roomApi.players().then(p => { all = p; drawPlayers(); }).catch(e => list.append(h('p', { class: 'faint' }, e.message)));
  drawGames();
  return panel(title, 'users', text ? h('p', { class: 'muted', style: { marginTop: 0 } }, text) : null, games, watching, search, list, h('div', { class: 'row-actions' }, go));
}

/** A small leaderboard table. */
export function boardTable(b, { unit = '', fmt = (v) => String(v) } = {}) {
  if (!b?.rows?.length) return h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen resultater endnu – bliv den første på listen!');
  return h('ol', { class: 'lb-list' }, b.rows.map(r => h('li', { class: ['lb-row', r.me && 'is-me', r.place <= 3 && `top${r.place}`] },
    h('span', { class: 'lb-place' }, r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : String(r.place)),
    person(r.user), h('b', { class: 'lb-score' }, `${fmt(r.score)}${unit ? ` ${unit}` : ''}`))));
}

/** Report a result to a leaderboard (Snake, 2048, Minestryger, Sudoku). Quiet if it fails. */
export async function submitScore(game, score) {
  try {
    const r = await api.post(`/api/games/boards/${game}`, { score: Math.round(score) });
    const mine = r.board.rows.find(x => x.me);
    if (r.record && mine && mine.place <= 3 && r.board.players > 1) toast(`Du er nr. ${mine.place} på toplisten!`, { type: 'xp', action: { label: 'Se listen', onClick: () => { location.hash = '#/apps/typerace/top'; } } });
    return r;
  } catch { return null; }
}

/** "Spil med …" – challenge one person to an online game (from a chat or the friends list). */
const CHALLENGES = [
  ['connect4', 'Fire på stribe', 'apps', 'connect4'], ['ttt', 'Kryds og bolle', 'x', 'tictactoe'], ['draw', 'Tegn og gæt', 'paint', 'drawguess'],
  ['typing', 'Fart-tast (løb)', 'timer', 'typerace'], ['property', 'Ejendomskongen', 'home', 'property'],
  ['chess', 'Skak', 'crown', 'chess'], ['yatzy', 'Yatzy', 'cube', 'yatzy'], ['quizboard', 'Quizbrættet', 'grid', 'quizboard'],
];
export function challengeDialog(user) {
  let close;
  const pick = async (game, app) => {
    try {
      const r = await roomApi.create(game, [user.id]);
      close?.();
      toast(`Invitation sendt til ${user.name}`, { type: 'ok' });
      location.hash = `#/apps/${app}/online/${r.id}`;
    } catch (e) { toast('Kunne ikke invitere', { type: 'bad', text: e.message }); }
  };
  const m = modal({ title: `Spil med ${user.name}`, label: 'Spil sammen', size: 420,
    body: h('div', { class: 'gr-challenge' }, CHALLENGES.map(([game, name, ic, app]) => h('button', { class: 'pd-problem', onclick: () => pick(game, app) },
      h('span', { class: 'row-icon' }, icon(ic)), h('span', null, h('b', null, name)), icon('chevronRight')))) });
  close = m.close;
}
