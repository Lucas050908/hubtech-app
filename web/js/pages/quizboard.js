/**
 * Quizbrættet – a board of categories with questions for 100–500 points.
 * On one screen (take turns and choose between four answers, or a quizmaster reads aloud and gives the points),
 * online (everyone answers at the same time – the host's browser runs the game and only it knows the answers),
 * and your own boards.
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
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher } from '../features/gameroom.js';
import * as Q from '../features/quizboard.js';
import { QB_CATEGORIES } from '../data/quizboard.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const PCOL = ['#f97316', '#22c55e', '#3b82f6', '#ec4899', '#eab308', '#a855f7', '#14b8a6', '#ef4444'];

export default {
  title: 'Quizbrættet',
  destroy() { clearInterval(this._iv); this._off?.(); this._offAct?.(); this._unwatch?.(); },
  async render(ctx) {
    const app = appById('quizboard');
    let store;
    try { store = await appState('quizboard', { game: null, key: null, boards: [], keys: {}, setup: null }); } catch (e) { return loadError('Quizbrættet', e); }
    const st = store.data, self = this;
    st.boards = st.boards || []; st.keys = st.keys || {};
    const root = h('div');
    let mode = ctx?.params?.sub === 'online' ? 'online' : ctx?.params?.sub === 'boards' ? 'boards' : 'local';
    let room = null, ctl = null, syncT = 0, shownAt = 0, shownKey = '', myPick = null;
    const myName = () => (appStore.get('user')?.name || 'Dig').split(' ')[0].slice(0, 16);

    // where the questions come from: random built-in categories or one of your own boards
    function sourceCats(src) {
      if (src?.board) {
        const b = st.boards.find(x => x.id === src.board);
        if (b) return b.cats;
      }
      return Q.pickCategories(QB_CATEGORIES, src?.count || 5, Math.random, src?.chosen);
    }

    const localCtl = () => ({
      s: st.game, online: false, host: true,
      mine: (seat) => st.game.mode === 'master' || seat === st.game.chooser,
      act(name, args = []) {
        const s = st.game; let ok = false;
        if (name === 'pick') ok = Q.pick(s, s.chooser, args[0], args[1]);
        else if (name === 'answer') { ok = Q.answer(s, s.cur?.by, args[0]); if (ok && Q.allAnswered(s)) Q.reveal(s, st.key); }
        else if (name === 'reveal') ok = Q.reveal(s, st.key);
        else if (name === 'judge') ok = Q.judge(s, args[0], args[1]);
        else if (name === 'next') ok = Q.next(s);
        if (ok) { store.save(); draw(); }
      },
    });
    const onlineCtl = () => {
      const s = room.state.blob, host = room.host === me(), mySeat = s.players.findIndex(p => p.uid === me());
      return {
        s, online: true, host, mySeat,
        mine: (seat) => seat === mySeat && !isWatcher(room),
        act(name, args = []) {
          if (name === 'answer') myPick = args[0];
          if (host) { if (applyOnline(s, mySeat, name, args)) { push(); draw(); } }
          else { api.post(`/api/games/rooms/${room.id}/act`, { name, args }).catch(e => toast(e.message, { type: 'warn' })); draw(); }
        },
      };
    };
    function applyOnline(s, seat, name, args) {
      if (seat < 0) return false;
      if (name === 'pick') { const ok = Q.pick(s, seat, Number(args[0]), Number(args[1])); if (ok) s.cur.hostStart = Date.now(); return ok; }
      if (name === 'answer') return Q.answer(s, seat, Number(args[0]));
      return false;
    }
    function push() {
      clearTimeout(syncT);
      const r = room, blob = room.state.blob;
      syncT = setTimeout(() => api.post(`/api/games/rooms/${r.id}/sync`, { blob: { ...blob, phase: blob.phase } }).catch(() => {}), 50);
    }
    // the host moves the game on: time is up / everyone has answered → show the answer; after a while → back to the board
    clearInterval(self._iv);
    self._iv = setInterval(() => {
      if (!ctl || !document.body.contains(root)) return;
      const s = ctl.s;
      if (ctl.online && ctl.host) {
        const key = st.keys[room.id];
        if (s.phase === 'question' && key && (Q.allAnswered(s) || Date.now() - s.cur.hostStart >= Q.ANSWER_SECS * 1000)) { Q.reveal(s, key); s.cur.revealedAt = Date.now(); push(); draw(); return; }
        if (s.phase === 'reveal' && Date.now() - (s.cur.revealedAt || 0) > 5000) { Q.next(s); if (s.phase === 'over') { delete st.keys[room.id]; store.save(); } push(); draw(); return; }
      }
      const bar = root.querySelector('.qb-timer i'), num = root.querySelector('.qb-timer b');
      if (bar && s.phase === 'question') {
        const left = Math.max(0, Q.ANSWER_SECS - (Date.now() - shownAt) / 1000);
        bar.style.width = `${(left / Q.ANSWER_SECS) * 100}%`;
        if (num) num.textContent = String(Math.ceil(left));
      }
    }, 200);

    // ── setup on one screen ──
    function setup() {
      const o = st.setup || { src: 'random', board: null, chosen: [], mode: 'turn', players: [{ name: myName() }, { name: 'Spiller 2' }] };
      const players = o.players.map(p => ({ ...p }));
      const own = st.boards.filter(b => !Q.checkBoard(b).length);
      const srcSel = h('select', { class: 'select', 'aria-label': 'Bræt' },
        h('option', { value: 'random', selected: o.src === 'random' }, 'Tilfældige kategorier'),
        own.map(b => h('option', { value: b.id, selected: o.src === b.id }, `Dit bræt: ${b.title}`)));
      const chips = h('div', { class: 'qb-chips' });
      const drawChips = () => h(clear(chips), { hidden: srcSel.value !== 'random' }, h('span', { class: 'faint' }, 'Vælg op til 6 kategorier – eller lad dem være tomme for 5 tilfældige:'),
        QB_CATEGORIES.map(c => h('button', { class: ['chip-btn', o.chosen.includes(c.id) && 'is-on'], 'aria-pressed': String(o.chosen.includes(c.id)), onclick: () => {
          o.chosen = o.chosen.includes(c.id) ? o.chosen.filter(x => x !== c.id) : o.chosen.length < 6 ? [...o.chosen, c.id] : o.chosen; drawChips();
        } }, c.name)));
      srcSel.addEventListener('change', () => { o.src = srcSel.value; drawChips(); });
      drawChips();
      const modeSegL = segmented([{ value: 'turn', label: 'På skift – vælg mellem 4 svar', icon: 'list' }, { value: 'master', label: 'Quizmaster læser op', icon: 'users' }], o.mode, (v) => { o.mode = v; }, { label: 'Svarmåde' });
      const list = h('div', { class: 'pg-setup-list' });
      const drawList = () => {
        clear(list);
        players.forEach((p, i) => {
          const name = h('input', { class: 'input', value: p.name, maxlength: 20, 'aria-label': `Navn på spiller eller hold ${i + 1}` });
          name.addEventListener('input', () => { p.name = name.value.trim() || `Spiller ${i + 1}`; });
          list.append(h('div', { class: 'pg-setup-row' }, h('span', { class: 'qb-dot', style: { '--pc': PCOL[i] } }), name,
            players.length > 1 ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern', onclick: () => { players.splice(i, 1); drawList(); } }, icon('x')) : null));
        });
        addBtn.disabled = players.length >= 8;
      };
      const addBtn = h('button', { class: 'btn btn-sm', onclick: () => { players.push({ name: `Spiller ${players.length + 1}` }); drawList(); } }, icon('plus'), 'Tilføj spiller eller hold');
      drawList();
      h(clear(root), null, panel('Nyt spil på denne skærm', 'grid',
        h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Bræt'), srcSel), chips,
        h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Svarmåde'), modeSegL),
        h('p', { class: 'faint', style: { marginTop: 0 } }, 'Quizmaster: én læser spørgsmålet op (fx på en storskærm i klassen), viser svaret og giver point til de hold, der svarede rigtigt.'),
        list, h('div', { class: 'row-actions' }, addBtn),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          const cats = sourceCats(o.src === 'random' ? { chosen: o.chosen, count: Math.max(5, o.chosen.length) } : { board: o.src });
          let m = o.mode;
          if (m === 'turn' && !cats.every(c => c.qs.slice(0, 5).every(Q.hasChoices))) { m = 'master'; toast('Quizmaster-tilstand', { type: 'info', text: 'Brættet har ikke forkerte svar til alle spørgsmål, så en quizmaster bedømmer svarene.' }); }
          st.setup = { ...o, players };
          const { board, key } = Q.buildBoard(cats);
          st.game = Q.newGame(board, players, m); st.key = key;
          store.save(); ctl = localCtl(); draw();
        } }, icon('play'), 'Start spillet'))), rules());
    }
    const rules = () => panel('Sådan spiller man', 'help', h('ul', { class: 'pg-rules' },
      h('li', null, 'Den, der har tur, vælger en kategori og et beløb. Jo højere beløb, jo sværere spørgsmål.'),
      h('li', null, 'Et af felterne gemmer på en joker – den giver dobbelt point.'),
      h('li', null, 'På skift: svarer du forkert, mister du det halve beløb, og turen går videre. Quizmaster: rigtigt giver beløbet, forkert trækker det fra.'),
      h('li', null, 'Online svarer alle på samme tid. Alle med rigtigt svar får point, og den hurtigste vælger næste felt.')));

    // ── the board and the questions ──
    function draw() {
      const s = ctl.s;
      if (s.phase === 'question') {
        const k = `${s.cur.c}-${s.cur.r}`;
        if (shownKey !== k) { shownKey = k; shownAt = Date.now(); myPick = null; }
      }
      const scores = h('div', { class: 'qb-scores' }, s.players.map((p, i) => h('div', { class: ['qb-score', i === s.chooser && s.phase === 'pick' && s.mode !== 'master' && 'is-turn', ctl.online && i === ctl.mySeat && 'is-me'], style: { '--pc': PCOL[i % PCOL.length] } },
        h('span', { class: 'qb-dot' }), h('span', { class: 'qb-name' }, p.name), h('b', { class: p.score < 0 && 'is-neg' }, p.score.toLocaleString('da-DK')))));
      let stage;
      if (s.phase === 'pick' || s.phase === 'over') {
        const canPick = s.phase === 'pick' && (s.mode === 'master' || ctl.mine(s.chooser));
        stage = h('div', { class: 'qb-board', style: { '--cols': s.cats.length }, role: 'grid', 'aria-label': 'Quizbræt' },
          s.cats.map(c => h('div', { class: 'qb-cat', role: 'columnheader' }, c)),
          Q.VALUES.map((_, r) => s.cats.map((c, ci) => {
            const t = s.tiles[ci][r];
            return h('button', { class: ['qb-tile', t.done && 'is-done'], disabled: t.done || !canPick, dataset: { c: ci, r }, 'aria-label': `${c} for ${t.v}${t.done ? ' (brugt)' : ''}`,
              onclick: () => ctl.act('pick', [ci, r]) }, t.done ? '' : String(t.v));
          })).flat());
      } else {
        const cur = s.cur, t = s.tiles[cur.c][cur.r], rev = s.phase === 'reveal';
        const iAnswer = s.mode === 'all' ? ctl.mine(ctl.mySeat) : s.mode === 'turn' && (!ctl.online);
        const myAns = s.mode === 'all' ? (cur.answers[ctl.mySeat]?.opt ?? myPick) : cur.answers[cur.by]?.opt;
        const who = (i) => Object.entries(cur.answers).filter(([, a]) => a.opt === i).map(([seat]) => s.players[seat]?.name);
        const opts = t.opts && s.mode !== 'master' ? h('div', { class: 'qb-opts' }, t.opts.map((o, i) => h('button', {
          class: ['qb-opt', rev && i === cur.correct && 'is-right', rev && i !== cur.correct && myAns === i && 'is-wrong', !rev && myAns === i && 'is-picked'],
          disabled: rev || !iAnswer || myAns != null, dataset: { i }, onclick: () => ctl.act('answer', [i]) },
          h('span', { class: 'qb-letter' }, LETTERS[i]), h('span', null, o), rev && s.mode === 'all' && who(i).length ? h('small', null, who(i).join(', ')) : null))) : null;
        const masterBox = s.mode === 'master' ? h('div', { class: 'qb-master' },
          rev ? h('div', { class: 'qb-answer' }, h('span', { class: 'faint' }, 'Svar'), h('b', null, cur.answer)) : h('button', { class: 'btn btn-primary btn-lg', onclick: () => ctl.act('reveal') }, icon('eye'), 'Vis svaret'),
          t.opts ? h('details', { class: 'qb-hint' }, h('summary', null, 'Vis svarmulighederne'), h('ol', { type: 'A' }, t.opts.map(o => h('li', null, o)))) : null,
          h('div', { class: 'qb-judge' }, h('span', { class: 'faint' }, 'Hvem svarede rigtigt?'), s.players.map((p, i) => {
            const done = cur.right.includes(i) ? 'right' : cur.wrong.includes(i) ? 'wrong' : null;
            return h('div', { class: ['qb-judge-row', done && `is-${done}`], style: { '--pc': PCOL[i % PCOL.length] } }, h('span', { class: 'qb-dot' }), h('span', null, p.name),
              done ? h('b', null, done === 'right' ? `+${cur.v}` : `−${cur.v}`)
                : [h('button', { class: 'btn btn-sm', 'aria-label': `${p.name} svarede rigtigt`, onclick: () => ctl.act('judge', [i, true]) }, icon('check')),
                  h('button', { class: 'btn btn-sm btn-ghost', 'aria-label': `${p.name} svarede forkert`, onclick: () => ctl.act('judge', [i, false]) }, icon('x'))]);
          }))) : null;
        const result = rev && s.mode !== 'master' ? h('p', { class: 'qb-result' }, cur.right.length ? `${cur.right.map(i => s.players[i].name).join(', ')} svarede rigtigt: +${cur.v}` : `Svaret var: ${cur.answer}`) : null;
        stage = h('div', { class: ['qb-question', cur.joker && 'is-joker'] },
          h('div', { class: 'qb-q-head' }, h('span', null, s.cats[cur.c]), h('b', null, `${cur.v} point`), cur.joker ? h('span', { class: 'qb-joker' }, '★ Joker – dobbelt point') : null),
          h('p', { class: 'qb-q' }, t.q),
          s.mode === 'all' && !rev ? h('div', { class: 'qb-timer', role: 'timer' }, h('i'), h('b', null, String(Q.ANSWER_SECS))) : null,
          s.mode === 'turn' && !rev ? h('p', { class: 'faint', style: { margin: 0 } }, `${s.players[cur.by].name} svarer`) : null,
          opts, masterBox, result,
          rev && (!ctl.online) ? h('button', { class: 'btn btn-primary', onclick: () => ctl.act('next') }, 'Tilbage til brættet', icon('arrowRight')) : null,
          rev && ctl.online ? h('p', { class: 'faint', style: { margin: 0 } }, 'Brættet kommer igen om et øjeblik …') : null);
      }
      const over = s.phase === 'over' ? (() => {
        const w = Q.winners(s);
        return h('div', { class: 'qb-over' }, icon('trophy'), h('b', null, w.length > 1 ? `Uafgjort: ${w.map(i => s.players[i].name).join(' og ')}` : `${s.players[w[0]].name} vinder med ${s.players[w[0]].score.toLocaleString('da-DK')} point!`));
      })() : null;
      const status = s.phase === 'pick' ? h('p', { class: 'qb-status' }, s.mode === 'master' ? 'Quizmaster: vælg et felt' : ctl.mine(s.chooser) ? (ctl.online ? 'Din tur – vælg et felt' : `${s.players[s.chooser].name}: vælg et felt`) : `${s.players[s.chooser].name} vælger …`) : null;
      const watcher = ctl.online && isWatcher(room);
      h(clear(root), null,
        h('div', { class: 'row-actions', style: { marginTop: 0 } },
          ctl.online ? h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil')
            : h('button', { class: 'btn btn-sm', onclick: async () => { if (s.phase !== 'over' && Q.left(s) < s.tiles.flat().length && !await confirmDialog({ title: 'Start et nyt spil?', text: 'Spillet, I er i gang med, forsvinder.', confirmLabel: 'Nyt spil' })) return; st.game = null; st.key = null; store.save(); ctl = null; setup(); } }, icon('plus'), 'Nyt spil'),
          watcher ? h('span', { class: 'chip chip-info' }, icon('eye'), 'Du ser med') : null,
          ctl.online && s.phase === 'over' && ctl.host ? h('button', { class: 'btn btn-sm btn-primary', onclick: rematch }, icon('refresh'), 'Spil igen') : null,
          !ctl.online && s.phase === 'over' ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => { st.game = null; store.save(); setup(); } }, icon('refresh'), 'Spil igen') : null),
        over, scores, status, stage);
    }

    // ── online ──
    function openRoom(r) {
      self._off?.(); self._offAct?.(); self._unwatch?.(); self._unwatch = null;
      room = r; ctl = null; shownKey = '';
      if (!r) { history.replaceState(null, '', '#/apps/quizboard/online'); return drawOnline(); }
      if (isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
      history.replaceState(null, '', `#/apps/quizboard/online/${r.id}`);
      self._off = watchRoom(r.id, (nr) => {
        if (!nr) { toast('Spillet er lukket', { type: 'info' }); openRoom(null); return; }
        const keep = ctl?.host && room?.state?.blob && nr.status === 'playing' ? room.state.blob : null;
        room = nr;
        if (keep) room.state.blob = keep;
        hostCheckSeats();
        drawOnline();
      });
      self._offAct = onLive('game-act', (ev) => {
        if (!room || ev.id !== room.id || room.host !== me() || !room.state.blob) return;
        const s = room.state.blob, seat = s.players.findIndex(p => p.uid === ev.from);
        if (applyOnline(s, seat, ev.name, ev.args || [])) { push(); drawOnline(); }
      });
      drawOnline();
    }
    function hostCheckSeats() {      // someone left: they just stop getting points; if it was their turn to pick, the next one picks
      const s = room?.state?.blob;
      if (!s || room.host !== me()) return;
      const ids = new Set(room.players.map(p => p.id));
      if (s.phase === 'pick' && s.players[s.chooser]?.uid && !ids.has(s.players[s.chooser].uid)) {
        const n = s.players.findIndex(p => ids.has(p.uid));
        if (n >= 0) { s.chooser = n; push(); }
      }
      // the leavers don't block "everyone has answered"
      s.players.forEach((p, i) => { if (s.phase === 'question' && !ids.has(p.uid) && !s.cur.answers[i]) s.cur.answers[i] = { opt: -1, ms: 1e9 }; });
    }
    async function rematch() { try { openRoom(await roomApi.rematch(room.id)); } catch (e) { toast(e.message, { type: 'warn' }); } }
    function drawOnline() {
      if (!room) {
        h(clear(root), null, lobbyPanel({ game: 'quizboard', multi: true, title: 'Spil Quizbrættet online', text: 'Invitér op til 7 af dem, der har HUBTECH. Alle svarer på samme tid på deres egen enhed – rigtigt svar giver point, og den hurtigste vælger næste felt.', onOpen: openRoom }), rules());
        return;
      }
      if (room.state.blob && (room.status === 'playing' || room.status === 'done')) { ctl = onlineCtl(); draw(); return; }
      const host = room.host === me(), watcher = isWatcher(room);
      const pick = st.online || (st.online = { src: 'random' });
      const own = st.boards.filter(b => !Q.checkBoard(b).length && b.cats.every(c => c.qs.slice(0, 5).every(Q.hasChoices)));
      const srcSel = h('select', { class: 'select', 'aria-label': 'Bræt' }, h('option', { value: 'random' }, 'Tilfældige kategorier'), own.map(b => h('option', { value: b.id, selected: pick.src === b.id }, `Dit bræt: ${b.title}`)));
      srcSel.addEventListener('change', () => { pick.src = srcSel.value; store.save(); });
      const start = async () => {
        if (room.players.length < 2) return toast('Vent på, at mindst én har sagt ja', { type: 'warn' });
        const cats = sourceCats(pick.src === 'random' ? null : { board: pick.src });
        const { board, key } = Q.buildBoard(cats);
        const seats = room.players.slice(0, 8).map(p => ({ name: (p.name || 'Spiller').split(' ')[0].slice(0, 16), uid: p.id }));
        const blob = Q.newGame(board, seats, 'all');
        blob.chooser = Math.floor(Math.random() * seats.length);
        st.keys[room.id] = key; store.save(); await store.flush?.();      // only the host knows the answers
        try {
          await roomApi.start(room.id);
          room.state.blob = blob; room.status = 'playing';
          await api.post(`/api/games/rooms/${room.id}/sync`, { blob });
          drawOnline();
        } catch (e) { toast(e.message, { type: 'warn' }); }
      };
      h(clear(root), null, panel('Klar til Quizbrættet', 'users',
        h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
          !watcher ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), 'Forlad') : null),
        h('div', { class: 'tr-lobby' }, room.players.map(p => person(p, h('span', { class: 'chip chip-ok' }, 'Klar'))), room.invited.map(p => person(p, h('span', { class: 'chip' }, 'Inviteret')))),
        host ? [h('div', { class: 'ch-setup-row' }, h('span', { class: 'faint' }, 'Bræt'), srcSel),
          h('button', { class: 'btn btn-primary btn-lg', disabled: room.players.length < 2, onclick: start }, icon('play'), 'Start spillet'),
          h('p', { class: 'faint' }, room.players.length < 2 ? 'Spillet kan starte, når mindst én har sagt ja.' : 'Du er vært: spillet kører på din enhed, så hold HUBTECH åben. Du spiller selv med.')]
          : h('p', { class: 'muted' }, `${room.players.find(p => p.id === room.host)?.name || 'Værten'} starter spillet, når alle er klar.`)));
    }

    // ── your own boards ──
    function boardsView() {
      const list = st.boards.map(b => {
        const errs = Q.checkBoard(b), choices = !errs.length && b.cats.every(c => c.qs.every(Q.hasChoices));
        return h('div', { class: 'qb-own' }, h('div', { class: 'qb-own-t' }, h('b', null, b.title || 'Uden titel'),
          h('span', { class: 'faint' }, errs.length ? `Ikke færdigt: ${errs[0]}` : `${b.cats.length} kategorier · ${choices ? 'kan spilles online' : 'quizmaster (mangler forkerte svar til online)'}`)),
          h('button', { class: 'btn btn-sm', onclick: () => editBoard(b) }, icon('edit'), 'Ret'),
          !errs.length ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => { st.setup = { ...(st.setup || { players: [{ name: myName() }, { name: 'Spiller 2' }], mode: 'turn', chosen: [] }), src: b.id }; store.save(); switchMode('local', true); } }, icon('play'), 'Spil') : null,
          h('button', { class: 'icon-btn', 'aria-label': `Slet ${b.title}`, onclick: async () => { if (await confirmDialog({ title: `Slet “${b.title || 'Uden titel'}”?`, confirmLabel: 'Slet', danger: true })) { st.boards = st.boards.filter(x => x !== b); store.save(); boardsView(); } } }, icon('trash')));
      });
      h(clear(root), null, panel('Dine brætter', 'grid',
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Lav dit eget quizbræt – fx til en klasse, en fødselsdag eller et firmaarrangement. Skriv tre forkerte svar til hvert spørgsmål, så kan brættet også spilles online og på skift.'),
        list.length ? h('div', { class: 'qb-own-list' }, list) : h('p', { class: 'faint' }, 'Du har ikke lavet nogen brætter endnu.'),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: () => editBoard(null) }, icon('plus'), 'Nyt bræt'),
          h('button', { class: 'btn', onclick: () => { const c = Q.pickCategories(QB_CATEGORIES, 3); editBoard({ ...Q.emptyBoard(), title: 'Kopi af indbyggede spørgsmål', cats: structuredClone(c.map(x => ({ name: x.name, qs: x.qs }))) }, true); } }, icon('copy'), 'Start ud fra indbyggede spørgsmål'))));
    }
    function editBoard(b0, isNew = !b0) {
      const b = structuredClone(b0 || Q.emptyBoard());
      const err = h('div', { class: 'field-error' });
      const body = h('div', { class: 'qb-edit' });
      const title = h('input', { class: 'input', value: b.title, maxlength: 60, placeholder: 'Fx Julequiz 7.B', 'aria-label': 'Brættets titel' });
      title.addEventListener('input', () => { b.title = title.value; });
      function drawCats() {
        clear(body);
        b.cats.forEach((c, ci) => {
          const name = h('input', { class: 'input qb-edit-cat', value: c.name, maxlength: 30, placeholder: `Kategori ${ci + 1}`, 'aria-label': `Navn på kategori ${ci + 1}` });
          name.addEventListener('input', () => { c.name = name.value; });
          const rows = c.qs.map((q, k) => {
            const inp = (val, ph, label, set, cls = '') => { const i = h('input', { class: `input ${cls}`, value: val || '', placeholder: ph, maxlength: 200, 'aria-label': label }); i.addEventListener('input', () => set(i.value)); return i; };
            q.w = q.w || ['', '', ''];
            return h('div', { class: 'qb-edit-q' }, h('b', { class: 'qb-edit-v' }, String(Q.VALUES[k])),
              inp(q.q, 'Spørgsmål', `${c.name || `Kategori ${ci + 1}`} ${Q.VALUES[k]}: spørgsmål`, (v) => { q.q = v; }, 'qb-edit-qq'),
              inp(q.a, 'Rigtigt svar', `${Q.VALUES[k]}: rigtigt svar`, (v) => { q.a = v; }, 'qb-edit-a'),
              h('details', { class: 'qb-edit-w' }, h('summary', null, `Forkerte svar (${q.w.filter(x => String(x).trim()).length}/3)`),
                [0, 1, 2].map(n => inp(q.w[n], `Forkert svar ${n + 1}`, `${Q.VALUES[k]}: forkert svar ${n + 1}`, (v) => { q.w[n] = v; }))));
          });
          body.append(h('section', { class: 'qb-edit-sec' }, h('div', { class: 'row', style: { gap: '8px' } }, name,
            b.cats.length > 2 ? h('button', { class: 'icon-btn', 'aria-label': `Fjern kategori ${ci + 1}`, onclick: () => { b.cats.splice(ci, 1); drawCats(); } }, icon('trash')) : null), rows));
        });
        addCat.disabled = b.cats.length >= 6;
      }
      const addCat = h('button', { class: 'btn', onclick: () => { b.cats.push({ name: '', qs: Q.VALUES.map(() => ({ q: '', a: '', w: ['', '', ''] })) }); drawCats(); } }, icon('plus'), 'Tilføj kategori');
      drawCats();
      h(clear(root), null, panel(isNew ? 'Nyt bræt' : 'Ret bræt', 'edit',
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), title), body,
        h('div', { class: 'row-actions' }, addCat),
        err,
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn', onclick: boardsView }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: () => {
            const errs = Q.checkBoard(b);
            if (errs.length) { err.textContent = errs.slice(0, 3).join(' '); return; }
            const i = st.boards.findIndex(x => x.id === b.id);
            if (i >= 0) st.boards[i] = b; else st.boards.push(b);
            store.save(); toast('Brættet er gemt', { type: 'ok' }); boardsView();
          } }, icon('check'), 'Gem brættet'))));
    }

    function switchMode(v, updateSeg = false) {
      mode = v; self._off?.(); self._offAct?.(); self._unwatch?.();
      if (updateSeg) modeSeg.setValue?.(v);
      if (v === 'local') { history.replaceState(null, '', '#/apps/quizboard'); room = null; if (st.game) { ctl = localCtl(); draw(); } else { ctl = null; setup(); } }
      else if (v === 'boards') { history.replaceState(null, '', '#/apps/quizboard/boards'); room = null; ctl = null; boardsView(); }
      else openRoom(null);
    }
    const modeSeg = segmented([{ value: 'local', label: 'På denne skærm', icon: 'monitor' }, { value: 'online', label: 'Online', icon: 'globe' }, { value: 'boards', label: 'Dine brætter', icon: 'edit' }], mode, (v) => switchMode(v), { label: 'Hvor' });
    if (mode === 'online') {
      if (ctx?.params?.id) roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
        .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
      else openRoom(null);
    } else if (mode === 'boards') boardsView();
    else if (st.game && st.key) { ctl = localCtl(); draw(); } else setup();
    return h('div', { class: 'page gm-page qb-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Quizbrættet', lead: 'Vælg en kategori og et beløb – jo højere, jo sværere. Spil på skift, med en quizmaster for hele klassen eller online.', compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, modeSeg), root);
  },
};
