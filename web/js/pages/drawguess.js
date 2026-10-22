/**
 * Tegn og gæt – one draws, the others guess in the chat. Everyone draws twice. Points for guessing fast,
 * and the one drawing gets points for every right guess. Played online with the others on HUBTECH (2–8).
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast } from '../core/ui.js';
import { onLive, serverNow } from '../core/live.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel } from '../features/appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher } from '../features/gameroom.js';

const COLORS = ['#111827', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e'];
const W = 800, H = 560;

export default {
  title: 'Tegn og gæt',
  destroy() { this._off?.(); this._unwatch?.(); this._offs?.forEach(f => f()); clearInterval(this._iv); },
  async render(ctx) {
    const app = appById('drawguess');
    const self = this;
    const box = h('div', { class: 'stack' });
    let room = null, word = null, turn = -1;
    let cv, g, chatEl, timeEl, hintEl, scoresEl, pending = [], flushT = 0, color = COLORS[0], size = 6, eraser = false;
    self._offs = [];

    // ── drawing ──
    function paint(sk) {
      if (!g) return;
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = sk.e ? '#ffffff' : sk.c; g.lineWidth = sk.w * (sk.e ? 3 : 1);
      g.beginPath();
      for (let i = 0; i < sk.p.length; i += 2) { const x = sk.p[i] * W, y = sk.p[i + 1] * H; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      if (sk.p.length === 2) g.lineTo(sk.p[0] * W + 0.1, sk.p[1] * H + 0.1);
      g.stroke(); g.restore();
    }
    const wipe = () => { if (g) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); } };
    const flush = () => { flushT = 0; if (!pending.length || !room) return; const strokes = pending; pending = []; api.post(`/api/games/rooms/${room.id}/draw`, { strokes }).catch(() => {}); };
    const queue = (sk) => { pending.push(sk); if (!flushT) flushT = setTimeout(flush, 120); };
    function canvasFor(drawing) {
      cv = h('canvas', { class: ['dg-canvas', drawing && 'is-drawing'], width: W, height: H, 'aria-label': drawing ? 'Tegn her' : 'Tegningen' });
      g = cv.getContext('2d'); wipe();
      if (!drawing) return cv;
      let cur = null;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); cur = { c: color, w: size, e: eraser, p: [x, y] }; paint(cur); });
      cv.addEventListener('pointermove', (e) => {
        if (!cur) return;
        const [x, y] = pos(e); const n = cur.p.length;
        if (Math.hypot(x - cur.p[n - 2], y - cur.p[n - 1]) < 0.003) return;
        cur.p.push(+x.toFixed(4), +y.toFixed(4));
        paint({ ...cur, p: cur.p.slice(-4) });
        if (cur.p.length > 160) { queue(cur); cur = { ...cur, p: cur.p.slice(-2) }; }
      });
      const up = () => { if (cur) { queue(cur); cur = null; } };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      return cv;
    }
    const tools = () => h('div', { class: 'dg-tools' },
      COLORS.map(c => { const b = h('button', { class: ['dr-sw', c === color && !eraser && 'is-on'], style: { background: c }, 'aria-label': `Farve ${c}` }); b.addEventListener('click', () => { color = c; eraser = false; b.parentNode.querySelectorAll('.dr-sw').forEach(x => x.classList.toggle('is-on', x === b)); }); return b; }),
      (() => { const r = h('input', { type: 'range', class: 'range', min: 2, max: 30, value: size, 'aria-label': 'Tykkelse' }); r.addEventListener('input', () => { size = Number(r.value); }); return r; })(),
      h('button', { class: 'btn btn-sm', onclick: (e) => { eraser = !eraser; e.currentTarget.classList.toggle('btn-primary', eraser); } }, icon('eraser'), 'Viskelæder'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { pending = []; wipe(); api.post(`/api/games/rooms/${room.id}/draw`, { strokes: [], clear: true }).catch(() => {}); } }, icon('trash'), 'Ryd'));

    // ── the game ──
    async function openRoom(r) {
      self._off?.(); self._unwatch?.(); self._unwatch = null; clearInterval(self._iv);
      room = r; word = null; turn = -1;
      if (!r) { history.replaceState(null, '', '#/apps/drawguess'); return drawLobby(); }
      if (isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
      history.replaceState(null, '', `#/apps/drawguess/online/${r.id}`);
      self._off = watchRoom(r.id, (nr) => {
        if (!nr) { toast('Spillet er lukket', { type: 'info' }); openRoom(null); return; }
        const newTurn = nr.state.turn !== room?.state?.turn || nr.status !== room?.status;
        room = nr;
        if (newTurn) full(); else update();
      });
      await full();
      self._iv = setInterval(() => {
        if (!room || !document.body.contains(box)) return;
        const S = room.state;
        if (timeEl && S.ends) { const left = Math.max(0, Math.ceil((S.ends - serverNow()) / 1000)); timeEl.textContent = String(left); timeEl.classList.toggle('is-low', left <= 10);
          if (left === 0 && room.status === 'playing' && !self._ticking) { self._ticking = true; api.post(`/api/games/rooms/${room.id}/tick`, {}).catch(() => {}).finally(() => setTimeout(() => { self._ticking = false; }, 1500)); } }
      }, 400);
    }
    async function full() {
      try { const d = await api.get(`/api/games/rooms/${room.id}/draw`); room = d.room; word = d.word; turn = room.state.turn; draw(); (d.strokes || []).forEach(paint); }
      catch { openRoom(null); }
    }
    function update() {   // chat, points, hint – without touching the drawing
      if (!chatEl) return draw();
      drawChat(); drawScores(); if (hintEl) hintEl.textContent = room.state.drawer === me() ? (word || '') : room.state.hint;
    }
    function drawChat() {
      if (!chatEl) return;
      const names = Object.fromEntries(room.players.map(p => [p.id, p.name]));
      clear(chatEl).append(...room.state.chat.map(m => h('div', { class: ['dg-msg', `k-${m.k}`] }, m.k === 'guess' ? [h('b', null, `${names[m.u] || '?'}: `), m.t] : m.t)));
      chatEl.scrollTop = chatEl.scrollHeight;
    }
    function drawScores() {
      if (!scoresEl) return;
      const S = room.state;
      const list = [...room.players].sort((a, b) => (S.scores[b.id] || 0) - (S.scores[a.id] || 0));
      clear(scoresEl).append(...list.map(p => h('div', { class: ['dg-score', p.id === S.drawer && 'is-drawer', S.guessed.includes(p.id) && 'is-right'] },
        person(p), p.id === S.drawer ? icon('edit') : S.guessed.includes(p.id) ? icon('check') : null, h('b', null, String(S.scores[p.id] || 0)))));
    }
    function draw() {
      clear(box); chatEl = timeEl = hintEl = scoresEl = null; g = null;
      const S = room.state, host = room.host === me(), watcher = isWatcher(room);
      const head = h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
        watcher ? h('span', { class: 'chip' }, icon('eye'), 'Du ser med') : h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), 'Forlad'));
      if (room.status === 'invite' || room.status === 'lobby') {
        box.append(panel('Klar til at tegne', 'users', head,
          h('div', { class: 'tr-lobby' }, room.players.map(p => person(p, h('span', { class: 'chip chip-ok' }, 'Klar'))), room.invited.map(p => person(p, h('span', { class: 'chip' }, 'Inviteret')))),
          watcher ? h('p', { class: 'muted' }, 'Du ser med.') : host ? h('button', { class: 'btn btn-primary btn-lg', disabled: room.players.length < 2, onclick: async () => { try { await roomApi.start(room.id); } catch (e) { toast(e.message, { type: 'warn' }); } } }, icon('play'), room.players.length < 2 ? 'Venter på, at nogen er med' : 'Start spillet')
            : h('p', { class: 'muted' }, `${room.players.find(p => p.id === room.host)?.name || 'Værten'} starter, når alle er klar.`)));
        return;
      }
      const drawing = S.drawer === me() && room.status === 'playing';
      const drawerName = room.players.find(p => p.id === S.drawer)?.name;
      scoresEl = h('div', { class: 'dg-scores' });
      chatEl = h('div', { class: 'dg-chat', 'aria-live': 'polite' });
      timeEl = h('b', { class: 'dg-time' }, '–');
      hintEl = h('span', { class: 'dg-hint' }, drawing ? (word || '') : S.hint);
      const input = h('input', { class: 'input', placeholder: drawing ? 'Du tegner – de andre gætter' : S.guessed.includes(me()) ? 'Du har gættet det!' : 'Skriv dit gæt …', maxlength: 60, disabled: drawing || watcher || room.status !== 'playing', 'aria-label': 'Dit gæt' });
      const send = async () => { const t = input.value.trim(); if (!t) return; input.value = ''; try { const r = await api.post(`/api/games/rooms/${room.id}/guess`, { text: t }); if (r.right) toast('Rigtigt! 🎉', { type: 'xp' }); } catch (e) { toast(e.message, { type: 'warn' }); } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      const top = room.status === 'done'
        ? h('div', { class: 'dg-top' }, h('b', null, 'Spillet er slut'), host ? h('button', { class: 'btn btn-primary btn-sm', onclick: () => roomApi.rematch(room.id).catch(e => toast(e.message, { type: 'warn' })) }, icon('refresh'), 'Spil igen') : null)
        : h('div', { class: 'dg-top' }, h('span', { class: 'faint' }, `Runde ${Math.floor(S.turn / room.players.length) + 1}/${S.rounds}`),
          drawing ? h('span', null, 'Tegn: ', hintEl) : h('span', null, `${drawerName || '?'} tegner: `, hintEl), h('span', { class: 'dg-clock' }, icon('clock'), timeEl));
      box.append(panel(null, null, head, top,
        h('div', { class: 'dg-layout' },
          h('div', { class: 'dg-stage' }, canvasFor(drawing), drawing ? tools() : null),
          h('div', { class: 'dg-side' }, scoresEl, chatEl, h('div', { class: 'dg-guess' }, input, h('button', { class: 'btn btn-primary', disabled: input.disabled, onclick: send }, icon('send')))))));
      drawChat(); drawScores();
      if (!drawing && !watcher && room.status === 'playing') setTimeout(() => input.focus(), 50);
    }
    function drawLobby() {
      clear(box).append(lobbyPanel({ game: 'draw', multi: true, title: 'Tegn og gæt', text: 'Invitér 1–7 andre. Alle tegner to gange, og I gætter i chatten. Jo hurtigere du gætter, jo flere point.', onOpen: openRoom }));
    }
    // strokes from the one drawing, and the word when it is your turn
    self._offs.push(onLive('game-draw', (ev) => {
      if (!room || ev.id !== room.id || ev.turn !== room.state.turn) return;
      if (ev.clear) wipe();
      ev.strokes.forEach(paint);
    }));
    self._offs.push(onLive('game-word', (ev) => { if (room && ev.id === room.id) { word = ev.word; if (hintEl && room.state.drawer === me()) hintEl.textContent = word; toast(`Du skal tegne: ${ev.word}`, { type: 'info', icon: 'edit' }); } }));
    self._offs.push(onLive('game-close', (ev) => { if (room && ev.id === room.id) toast(`“${ev.text}” er tæt på!`, { type: 'info' }); }));

    if (ctx?.params?.sub === 'online' && ctx.params.id) {
      roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
        .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
    } else drawLobby();
    return h('div', { class: 'page gm-page dg-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Tegn og gæt', lead: 'Én tegner, de andre gætter. Spil med dine venner på HUBTECH – på computer og telefon.', compact: true }),
      box);
  },
};
