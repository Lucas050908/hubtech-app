/**
 * Yatzy – 1–6 players on one screen (anyone can be the computer, saved on the account) or online with the others
 * on HUBTECH: then the host's browser runs the game, the server keeps the latest state and passes the others' moves on.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { appById } from '../core/registry.js';
import { store as appStore } from '../core/store.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher, submitScore, boardTable } from '../features/gameroom.js';
import * as Y from '../features/yatzy.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieFace = (v) => h('span', { class: 'yz-face', 'aria-hidden': 'true' }, [...Array(9).keys()].map(k => h('i', { class: PIPS[v]?.includes(k) ? 'on' : '' })));

export default {
  title: 'Yatzy',
  destroy() { clearTimeout(this._t); this._off?.(); this._offAct?.(); this._unwatch?.(); },
  async render(ctx) {
    const app = appById('yatzy');
    let store;
    try { store = await appState('yatzy', { game: null, setup: null, best: 0, played: 0 }); } catch (e) { return loadError('Yatzy', e); }
    const st = store.data, self = this;
    const root = h('div');
    let mode = ctx?.params?.sub === 'online' ? 'online' : 'local';
    let room = null, ctl = null, syncT = 0, rolling = false, reported = null;
    const myName = () => (appStore.get('user')?.name || 'Dig').split(' ')[0].slice(0, 16);

    const localCtl = () => ({
      s: st.game, online: false, host: true,
      canAct: (seat) => !st.game.players[seat]?.ai,
      act(name, args = []) { if (Y.applyAction(st.game, st.game.turn, name, args)) { store.save(); after(name); } },
      save: () => store.save(),
    });
    const onlineCtl = () => {
      const s = room.state.blob, mySeat = s.players.findIndex(p => p.uid === me()), host = room.host === me();
      return {
        s, online: true, host, mySeat,
        canAct: (seat) => seat === mySeat && !isWatcher(room),
        act(name, args = []) {
          if (host) { if (Y.applyAction(s, mySeat, name, args)) { push(); after(name); } }
          else api.post(`/api/games/rooms/${room.id}/act`, { name, args }).catch(e => toast(e.message, { type: 'warn' }));
        },
        save: () => push(),
      };
    };
    function push() {
      clearTimeout(syncT);
      const r = room, blob = room.state.blob;
      syncT = setTimeout(() => api.post(`/api/games/rooms/${r.id}/sync`, { blob }).catch(() => {}), 60);
    }
    function after(name) {
      if (name === 'roll') { rolling = true; draw(); setTimeout(() => { rolling = false; if (document.body.contains(root)) draw(); }, 380); }
      else draw();
    }

    // ── one screen: setup ──
    function setup() {
      const players = st.setup?.players || [{ name: myName(), ai: false }, { name: 'Computer', ai: true }];
      const list = h('div', { class: 'pg-setup-list' });
      const drawList = () => {
        clear(list);
        players.forEach((p, i) => {
          const name = h('input', { class: 'input', value: p.name, maxlength: 16, 'aria-label': `Navn på spiller ${i + 1}` });
          name.addEventListener('input', () => { p.name = name.value.trim() || `Spiller ${i + 1}`; });
          list.append(h('div', { class: 'pg-setup-row' }, h('span', { class: 'yz-seat' }, String(i + 1)), name,
            h('button', { class: ['btn btn-sm', p.ai && 'btn-primary'], onclick: () => { p.ai = !p.ai; if (p.ai && /^(Spiller)/.test(p.name)) p.name = 'Computer'; drawList(); } }, icon(p.ai ? 'bot' : 'user'), p.ai ? 'Computer' : 'Menneske'),
            players.length > 1 ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern spiller', onclick: () => { players.splice(i, 1); drawList(); } }, icon('x')) : null));
        });
        addBtn.disabled = players.length >= 6;
      };
      const addBtn = h('button', { class: 'btn btn-sm', onclick: () => { players.push({ name: `Spiller ${players.length + 1}`, ai: false }); drawList(); } }, icon('plus'), 'Tilføj spiller');
      drawList();
      h(clear(root), null, panel('Nyt spil på denne skærm', 'users',
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Spil alene for at slå din rekord, mod computeren eller med op til seks på samme skærm. Vil I spille hver på sin egen enhed, så vælg Online øverst.'),
        list, h('div', { class: 'row-actions' }, addBtn),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          if (!players.some(p => !p.ai)) return toast('Mindst én skal være et menneske', { type: 'warn' });
          st.setup = { players: players.map(p => ({ ...p })) };
          st.game = Y.newGame(players); reported = null; store.save(); ctl = localCtl(); draw();
        } }, icon('play'), 'Start spillet'))), rules(), topPanel());
    }
    const rules = () => panel('Sådan spiller man', 'help', h('ul', { class: 'pg-rules' },
      h('li', null, 'Slå op til tre gange i hver tur. Klik på de terninger, du vil gemme, før du slår igen.'),
      h('li', null, 'Skriv så slaget ind i en tom rubrik – du kan også stryge en rubrik og få 0.'),
      h('li', null, `Får du ${Y.BONUS_AT} eller mere i enere til seksere (tre af hver), får du ${Y.BONUS} i bonus.`),
      h('li', null, 'Et par, to par, tre og fire ens tæller summen af terningerne. Lille straight er 15, stor straight 20, Yatzy 50.')));
    const topBox = h('div');
    const topPanel = () => {
      api.get('/api/games/boards/yatzy').then(b => h(clear(topBox), null, boardTable(b))).catch(() => {});
      return panel('Toplisten', 'trophy', h('p', { class: 'faint', style: { marginTop: 0 } }, 'Din bedste slutsum kommer på listen – både når du spiller alene, mod computeren og online.'), topBox);
    };

    // ── the board ──
    function draw() {
      const s = ctl.s, seat = s.turn, p = s.players[seat], mine = ctl.canAct(seat) && s.phase === 'play';
      scheduleAI();
      if (s.phase === 'over') report(s);
      const dice = h('div', { class: ['yz-dice', rolling && 'is-rolling'] }, s.dice.map((v, i) => h('button', {
        class: ['yz-die', s.held[i] && 'is-held'], disabled: !mine || !s.rolls || s.rolls >= 3,
        'aria-pressed': String(!!s.held[i]), 'aria-label': `Terning ${i + 1}: ${v}${s.held[i] ? ', gemt' : ''}`, dataset: { i },
        onclick: () => ctl.act('hold', [i]) }, s.rolls ? dieFace(v) : h('span', { class: 'yz-face yz-blank' }, '?'), s.held[i] ? h('small', null, 'Gemt') : null)));
      const rollBtn = h('button', { class: 'btn btn-primary btn-lg yz-roll', disabled: !mine || !Y.canRoll(s) || (s.rolls > 0 && s.held.every(Boolean)), onclick: () => ctl.act('roll') },
        icon('refresh'), s.rolls ? `Slå igen (${3 - s.rolls} tilbage)` : 'Slå med terningerne');
      const status = s.phase === 'over'
        ? h('div', { class: 'yz-status is-over' }, icon('trophy'), h('b', null, s.log[0]))
        : h('div', { class: 'yz-status' }, h('b', null, mine ? (s.players.length > 1 ? 'Din tur' : `Runde ${s.round} af 15`) : `${p.name}s tur`),
          h('span', { class: 'faint' }, s.rolls ? `Slag ${s.rolls} af 3${mine ? ' – vælg en rubrik, eller gem terninger og slå igen' : ''}` : mine ? 'Slå for at starte turen' : p.ai ? 'Computeren tænker …' : 'Venter …'));
      // the score card: one column per player, the current player's free boxes show what the dice give
      const head = h('tr', null, h('th', { scope: 'col' }, 'Rubrik'), s.players.map((q, i) => h('th', { scope: 'col', class: [i === seat && s.phase === 'play' && 'is-turn'] }, q.ai ? icon('bot') : null, q.name)));
      const row = (c) => h('tr', { class: [c.id === 'pair' && 'yz-split'] }, h('th', { scope: 'row' }, c.label, c.hint ? h('small', null, c.hint) : null),
        s.players.map((q, i) => {
          const v = q.card[c.id];
          if (v != null) return h('td', { class: ['yz-val', s.last?.seat === i && s.last.cat === c.id && 'is-new', !v && 'is-zero'] }, v ? String(v) : '–');
          if (i === seat && s.rolls && s.phase === 'play') {
            const pts = Y.scoreFor(c.id, s.dice);
            return h('td', null, h('button', { class: ['yz-pick', pts ? 'has' : 'zero'], disabled: !mine, dataset: { cat: c.id },
              'aria-label': `${c.label}: ${pts ? `${pts} point` : 'stryg (0)'}`,
              onclick: async () => {
                if (!pts && !await confirmDialog({ title: `Stryg ${c.label}?`, text: 'Du får 0 point i rubrikken.', confirmLabel: 'Stryg' })) return;
                ctl.act('score', [c.id]);
              } }, pts ? String(pts) : '0'));
          }
          return h('td', { class: 'yz-empty' });
        }));
      const sumRow = (label, fn, cls) => h('tr', { class: cls }, h('th', { scope: 'row' }, label), s.players.map(q => h('td', null, fn(q.card))));
      const card = h('div', { class: 'yz-card-wrap' }, h('table', { class: 'yz-card' }, h('thead', null, head), h('tbody', null,
        Y.CATS.filter(c => c.upper).map(row),
        sumRow('Sum', (cd) => `${Y.upperSum(cd)}`, 'yz-sum'),
        sumRow(`Bonus (${Y.BONUS_AT}+)`, (cd) => (Y.bonusOf(cd) ? String(Y.BONUS) : `${Math.max(0, Y.BONUS_AT - Y.upperSum(cd))} mangler`), 'yz-sum yz-bonus'),
        Y.CATS.filter(c => !c.upper).map(row),
        sumRow('I alt', (cd) => String(Y.totalOf(cd)), 'yz-total'))));
      const watcher = ctl.online && isWatcher(room);
      h(clear(root), null,
        h('div', { class: 'row-actions', style: { marginTop: 0 } },
          ctl.online ? h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil') : h('button', { class: 'btn btn-sm', onclick: async () => {
            if (s.phase === 'play' && s.round > 1 && !await confirmDialog({ title: 'Start et nyt spil?', text: 'Det spil, I er i gang med, forsvinder.', confirmLabel: 'Nyt spil' })) return;
            st.game = null; store.save(); ctl = null; setup();
          } }, icon('plus'), 'Nyt spil'),
          watcher ? h('span', { class: 'chip chip-info' }, icon('eye'), 'Du ser med') : null,
          ctl.online && !watcher && s.phase === 'play' ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Forlad spillet?', text: ctl.host ? 'Du er vært – spillet slutter for alle.' : 'Computeren tager over for dig.', confirmLabel: 'Forlad', danger: true })) { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } } }, icon('x'), 'Forlad') : null,
          ctl.online && s.phase === 'over' && ctl.host ? h('button', { class: 'btn btn-sm btn-primary', onclick: rematch }, icon('refresh'), 'Spil igen') : null,
          !ctl.online && s.phase === 'over' ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => { st.game = Y.newGame(st.setup?.players || s.players); reported = null; store.save(); ctl = localCtl(); draw(); } }, icon('refresh'), 'Spil igen') : null),
        h('div', { class: 'yz-wrap' },
          h('div', { class: 'yz-table' }, status, dice, rollBtn, s.log.length ? h('ul', { class: 'yz-log' }, s.log.slice(0, 6).map(l => h('li', null, l))) : null),
          card));
    }
    function scheduleAI() {
      clearTimeout(self._t);
      const s = ctl?.s;
      if (!s || !ctl.host || s.phase !== 'play' || !s.players[s.turn].ai) return;
      self._t = setTimeout(() => {
        if (!document.body.contains(root) || ctl?.s !== s) return;
        const a = Y.aiStep(s); ctl.save(); after(a);
      }, s.rolls ? 900 : 650);
    }
    function report(s) {       // the leaderboard + your own record, once per game
      const key = `${s.log.length}-${s.players.map(p => Y.totalOf(p.card)).join(',')}`;
      if (reported === key) return;
      reported = key;
      let seat = -1;
      if (ctl.online) seat = ctl.mySeat;
      else { const humans = s.players.map((p, i) => (p.ai ? -1 : i)).filter(i => i >= 0); if (humans.length === 1) seat = humans[0]; }
      if (seat < 0) return;
      const total = Y.totalOf(s.players[seat].card);
      if (!ctl.online) { if (st.game?.counted) return; st.game.counted = true; }
      st.played = (st.played || 0) + 1;
      if (total > (st.best || 0)) { st.best = total; toast('Ny personlig rekord!', { type: 'xp', text: `${total} point i Yatzy` }); }
      store.save();
      submitScore('yatzy', total);
    }

    // ── online ──
    function openRoom(r) {
      self._off?.(); self._offAct?.(); self._unwatch?.(); self._unwatch = null; clearTimeout(self._t);
      room = r; ctl = null; reported = null;
      if (!r) { history.replaceState(null, '', '#/apps/yatzy/online'); return drawOnline(); }
      if (isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
      history.replaceState(null, '', `#/apps/yatzy/online/${r.id}`);
      self._off = watchRoom(r.id, (nr) => {
        if (!nr) { toast('Spillet er lukket', { type: 'info' }); openRoom(null); return; }
        const prevLast = JSON.stringify(room?.state?.blob?.last || null);
        const keep = ctl?.host && room?.state?.blob && nr.status === 'playing' ? room.state.blob : null;
        room = nr;
        if (keep) room.state.blob = keep;
        hostCheckSeats();
        const rolled = !keep && room.state.blob?.last?.roll && JSON.stringify(room.state.blob.last) !== prevLast;
        if (rolled && ctl) { ctl = onlineCtl(); after('roll'); } else drawOnline();
      });
      self._offAct = onLive('game-act', (ev) => {
        if (!room || ev.id !== room.id || room.host !== me() || !room.state.blob) return;
        const s = room.state.blob, seat = s.players.findIndex(p => p.uid === ev.from);
        if (seat >= 0 && Y.applyAction(s, seat, ev.name, ev.args || [])) { push(); ctl = onlineCtl(); after(ev.name); }
      });
      drawOnline();
    }
    function hostCheckSeats() {
      if (!room?.state?.blob || room.host !== me()) return;
      const s = room.state.blob, ids = new Set(room.players.map(p => p.id));
      let changed = false;
      s.players.forEach(p => { if (p.uid && !p.ai && !ids.has(p.uid)) { p.ai = true; s.log = [`${p.name} har forladt spillet – computeren tager over.`, ...s.log]; changed = true; } });
      if (changed) push();
    }
    async function rematch() {
      try {
        const r = await roomApi.rematch(room.id);
        openRoom(r);
      } catch (e) { toast(e.message, { type: 'warn' }); }
    }
    function drawOnline() {
      if (!room) {
        h(clear(root), null, lobbyPanel({ game: 'yatzy', multi: true, title: 'Spil Yatzy online', text: 'Invitér op til 5 af dem, der har HUBTECH. I slår hver på jeres egen enhed og kan følge med i hinandens slag.', onOpen: openRoom }), rules(), topPanel());
        return;
      }
      if (room.state.blob && (room.status === 'playing' || room.status === 'done')) { ctl = onlineCtl(); draw(); return; }
      const host = room.host === me(), watcher = isWatcher(room);
      let bots = 0;
      const botSel = h('select', { class: 'select', 'aria-label': 'Computerspillere' }, [0, 1, 2, 3].map(n => h('option', { value: n }, n ? `+ ${n} computer${n > 1 ? 'e' : ''}` : 'Ingen computere')));
      const startBtn = h('button', { class: 'btn btn-primary btn-lg', disabled: room.players.length < 2, onclick: async () => {
        const seats = room.players.slice(0, 6).map(p => ({ name: (p.name || 'Spiller').split(' ')[0].slice(0, 16), uid: p.id, ai: false }));
        for (let n = 0; n < bots && seats.length < 6; n++) seats.push({ name: `Computer ${n + 1}`, ai: true });
        if (seats.length < 2) return toast('Der skal være mindst to spillere', { type: 'warn' });
        try {
          await roomApi.start(room.id);
          room.state.blob = Y.newGame(seats); room.status = 'playing';
          await api.post(`/api/games/rooms/${room.id}/sync`, { blob: room.state.blob });
          drawOnline();
        } catch (e) { toast(e.message, { type: 'warn' }); }
      } }, icon('play'), 'Start spillet');
      botSel.addEventListener('change', () => { bots = Number(botSel.value); });
      h(clear(root), null, panel('Klar til Yatzy', 'users',
        h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
          !watcher ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), 'Forlad') : null),
        h('div', { class: 'tr-lobby' }, room.players.map(p => person(p, h('span', { class: 'chip chip-ok' }, 'Klar'))), room.invited.map(p => person(p, h('span', { class: 'chip' }, 'Inviteret')))),
        host ? [h('div', { class: 'row-actions' }, botSel), startBtn, h('p', { class: 'faint' }, room.players.length < 2 ? 'Spillet kan starte, når mindst én har sagt ja.' : 'Du er vært: spillet kører på din enhed, så hold HUBTECH åben, mens I spiller.')]
          : h('p', { class: 'muted' }, `${room.players.find(p => p.id === room.host)?.name || 'Værten'} starter spillet, når alle er klar.`)));
    }

    const modeSeg = segmented([{ value: 'local', label: 'På denne skærm', icon: 'monitor' }, { value: 'online', label: 'Online', icon: 'globe' }], mode, (v) => {
      mode = v; self._off?.(); self._offAct?.(); self._unwatch?.(); clearTimeout(self._t);
      if (v === 'local') { history.replaceState(null, '', '#/apps/yatzy'); room = null; if (st.game) { ctl = localCtl(); draw(); } else { ctl = null; setup(); } }
      else openRoom(null);
    }, { label: 'Hvor' });
    if (mode === 'online') {
      if (ctx?.params?.id) roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
        .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
      else openRoom(null);
    } else if (st.game) { ctl = localCtl(); draw(); } else setup();
    return h('div', { class: 'page gm-page yz-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Yatzy', lead: 'Fem terninger, tre slag og 15 rubrikker. Spil alene mod rekorden, mod computeren eller online med de andre.', compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, modeSeg), root);
  },
};
