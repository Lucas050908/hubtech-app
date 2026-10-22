/**
 * Ejendomskongen – a big property game for 2–6 players. On one screen (any seat can be the computer, saved on the
 * account) or online with the others on HUBTECH: then the host's browser runs the game, the server keeps the latest
 * state and passes the others' moves on. Our own board, streets and lykkekort.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, isWatcher } from '../features/gameroom.js';
import * as P from '../features/property.js';
import { store as appStore } from '../core/store.js';

const kr = (n) => `${Math.round(n).toLocaleString('da-DK')} kr.`;
const PCOL = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const ROUNDS = [[25, 'Kort spil – 25 runder'], [40, 'Normalt – 40 runder'], [70, 'Langt – 70 runder'], [0, 'Til én står tilbage']];
/** grid row/column for field i on an 11 × 11 board (START bottom right, going clockwise to the left) */
function cellPos(i) {
  if (i <= 10) return [11, 11 - i];
  if (i <= 20) return [11 - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), 11];
}
const side = (i) => (i % 10 === 0 ? 'corner' : i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right');
const fieldIcon = (f, i) => ({ chance: '❓', station: '🚉', util: i === 12 ? '💡' : '🚰', tax: '💰', start: '➡️', jail: '🔒', park: '🅿️', gojail: '👮' }[f.type] || '');

export default {
  title: 'Ejendomskongen',
  destroy() { clearTimeout(this._t); this._off?.(); this._offAct?.(); this._unwatch?.(); },
  async render(ctx) {
    const app = appById('property');
    let store;
    try { store = await appState('property', { game: null, setup: null }); } catch (e) { return loadError('Ejendomskongen', e); }
    const st = store.data, self = this;
    const root = h('div');
    let sel = null;            // field shown in the info card
    let trading = false;       // the trade panel is open
    let mode = ctx?.params?.sub === 'online' ? 'online' : 'local';
    let room = null;           // online room
    let syncT = 0;
    const myName = () => (appStore.get('user')?.name || appStore.get('user')?.displayName || 'Dig').split(' ')[0].slice(0, 16);

    // A controller hides the difference between one screen and online.
    let ctl = null;
    const localCtl = () => ({
      s: st.game, online: false, host: true,
      canAct: (seat) => seat != null && !!st.game.players[seat] && !st.game.players[seat].ai,
      act(name, args = []) {
        const s = st.game, seat = name === 'answer' ? s.offer?.to : name === 'cancelOffer' ? s.offer?.from : s.turn;
        if (P.applyAction(s, seat, name, args)) { store.save(); draw(); }
      },
      save: () => store.save(),
    });
    const onlineCtl = () => {
      const s = room.state.blob, mySeat = s.players.findIndex(p => p.uid === me()), host = room.host === me();
      return {
        s, online: true, host, mySeat,
        canAct: (seat) => seat != null && seat === mySeat && !isWatcher(room),
        act(name, args = []) {
          if (host) { const seat = name === 'answer' ? s.offer?.to : name === 'cancelOffer' ? s.offer?.from : s.turn; if (seat === mySeat && P.applyAction(s, mySeat, name, args)) { push(); draw(); } }
          else api.post(`/api/games/rooms/${room.id}/act`, { name, args }).catch(e => toast(e.message, { type: 'warn' }));
        },
        save: () => push(),
      };
    };
    function push() {     // host: send the state to everyone
      clearTimeout(syncT);
      const r = room, blob = room.state.blob;
      syncT = setTimeout(() => api.post(`/api/games/rooms/${r.id}/sync`, { blob }).catch(() => {}), 60);
    }

    // ── on one screen: setup ──
    function setup() {
      const players = st.setup?.players || [{ name: myName(), ai: false, token: P.TOKENS[0] }, { name: 'Computer 1', ai: true, token: P.TOKENS[1] }, { name: 'Computer 2', ai: true, token: P.TOKENS[2] }];
      let rounds = st.setup?.rounds ?? 40;
      const list = h('div', { class: 'pg-setup-list' });
      const drawList = () => {
        clear(list);
        players.forEach((p, i) => {
          const name = h('input', { class: 'input', value: p.name, maxlength: 16, 'aria-label': `Navn på spiller ${i + 1}` });
          name.addEventListener('input', () => { p.name = name.value.trim() || `Spiller ${i + 1}`; });
          const tok = h('button', { class: 'pg-token-btn', title: 'Skift brik', style: { '--pc': PCOL[i] }, onclick: () => { const used = players.map(q => q.token); const free = P.TOKENS.filter(t => !used.includes(t)); if (free.length) { p.token = free[0]; drawList(); } } }, p.token);
          const kind = h('button', { class: ['btn btn-sm', p.ai && 'btn-primary'], onclick: () => { p.ai = !p.ai; if (p.ai && /^(Dig|Spiller)/.test(p.name)) p.name = `Computer ${i}`; drawList(); } }, icon(p.ai ? 'bot' : 'user'), p.ai ? 'Computer' : 'Menneske');
          list.append(h('div', { class: 'pg-setup-row' }, tok, name, kind,
            players.length > 2 ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern spiller', onclick: () => { players.splice(i, 1); drawList(); } }, icon('x')) : null));
        });
        addBtn.disabled = players.length >= 6;
      };
      const addBtn = h('button', { class: 'btn btn-sm', onclick: () => { const used = players.map(q => q.token); players.push({ name: `Spiller ${players.length + 1}`, ai: false, token: P.TOKENS.find(t => !used.includes(t)) }); drawList(); } }, icon('plus'), 'Tilføj spiller');
      const roundSel = h('select', { class: 'select', 'aria-label': 'Hvor længe' }, ROUNDS.map(([v, l]) => h('option', { value: v, selected: v === rounds }, l)));
      roundSel.addEventListener('change', () => { rounds = Number(roundSel.value); });
      drawList();
      h(clear(root), null, panel('Nyt spil på denne skærm', 'users',
        h('p', { class: 'muted', style: { marginTop: 0 } }, '2–6 spillere på samme skærm. Hver spiller kan være et menneske eller computeren. Vil I spille hver på sin egen enhed, så vælg Online øverst.'),
        list, h('div', { class: 'row-actions' }, addBtn, roundSel),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          if (!players.some(p => !p.ai)) return toast('Mindst én skal være et menneske', { type: 'warn' });
          st.setup = { players: players.map(p => ({ ...p })), rounds };
          st.game = P.newGame(players, { rounds }); sel = null; store.save(); ctl = localCtl(); draw();
        } }, icon('play'), 'Start spillet'))), rules());
    }
    const rules = () => panel('Sådan spiller man', 'help', h('ul', { class: 'pg-rules' },
      h('li', null, 'Slå med terningerne, og ryk rundt. Lander du på en ledig grund, kan du købe den.'),
      h('li', null, 'Lander andre på din grund, betaler de leje. Ejer du hele farvegruppen, er lejen dobbelt – og du kan bygge huse og til sidst et hotel.'),
      h('li', null, 'Mangler du en enkelt gade i en farve, så lav en handel: tilbyd penge eller dine egne gader. Computeren siger kun ja til en god handel.'),
      h('li', null, `Passerer du START, får du ${kr(P.PASS_START)}. To ens = slå igen. Tre gange to ens = fængsel.`),
      h('li', null, `I fængsel: slå to ens, brug et løsladelseskort, eller betal ${kr(P.JAIL_FINE)}.`),
      h('li', null, 'Mangler du penge, sælges huse og grunde pantsættes automatisk. Er det ikke nok, er du gået fallit.'),
      h('li', null, 'Den sidste, der ikke er gået fallit, vinder – eller den rigeste, når runderne er brugt.')));

    // ── the board ──
    function draw() {
      if (!ctl) return;
      const s = ctl.s;
      const board = h('div', { class: 'pg-board' });
      for (let i = 0; i < 40; i++) {
        const f = P.BOARD[i], [r, c] = cellPos(i), o = s.owner[i];
        const here = s.players.map((p, pi) => (!p.out && p.pos === i ? pi : -1)).filter(x => x >= 0);
        const hs = s.houses[i] || 0;
        board.append(h('button', { class: ['pg-cell', `is-${side(i)}`, `t-${f.type}`, s.mort[i] && 'is-mort', sel === i && 'is-sel', s.players[s.turn]?.pos === i && 'is-here'],
          style: { gridRow: r, gridColumn: c, '--g': f.group != null ? P.GROUPS[f.group].color : 'transparent', '--o': o != null ? PCOL[o] : 'transparent' },
          'aria-label': `${f.name}${o != null ? `, ejes af ${s.players[o].name}` : ''}`, onclick: () => { sel = sel === i ? null : i; trading = false; draw(); } },
          f.type === 'prop' ? h('i', { class: 'pg-bar' }, hs === 5 ? '🏨' : hs ? '🏠'.repeat(hs) : '') : null,
          h('span', { class: 'pg-name' }, fieldIcon(f, i), ' ', f.name),
          f.price ? h('span', { class: 'pg-price' }, o != null ? '' : kr(f.price)) : null,
          o != null ? h('i', { class: 'pg-owner' }) : null,
          here.length ? h('span', { class: 'pg-tokens' }, here.map(pi => h('b', { style: { '--pc': PCOL[pi] } }, s.players[pi].token))) : null));
      }
      board.append(h('div', { class: 'pg-center' }, center(s)));
      const players = h('div', { class: 'pg-players' }, s.players.map((p, pi) => h('div', { class: ['pg-player', pi === s.turn && s.phase !== 'over' && 'is-turn', p.out && 'is-out', ctl.online && pi === ctl.mySeat && 'is-me'], style: { '--pc': PCOL[pi] } },
        h('span', { class: 'pg-tok' }, p.token), h('div', { class: 'pg-pinfo' }, h('b', null, p.name, p.ai ? h('small', null, ' · computer') : ctl.online && pi === ctl.mySeat ? h('small', null, ' · dig') : null),
          h('span', null, p.out ? 'Gået fallit' : `${kr(p.money)}${p.jail ? ' · i fængsel' : ''}${p.free ? ' · 🎫' : ''}`),
          h('div', { class: 'pg-props' }, Object.keys(s.owner).filter(k => s.owner[k] === pi).map(Number).sort((a, b) => a - b).map(k => h('button', { class: ['pg-chip', s.mort[k] && 'is-mort'], style: { '--g': P.BOARD[k].group != null ? P.GROUPS[P.BOARD[k].group].color : '#94a3b8' }, title: P.BOARD[k].name, onclick: () => { sel = k; trading = false; draw(); } })))))));
      const myTurn = ctl.canAct(s.turn) && s.phase !== 'over' && !s.offer;
      const tools = h('div', { class: 'row-actions' },
        myTurn && !trading ? h('button', { class: 'btn btn-sm', onclick: () => { trading = true; draw(); } }, icon('users'), 'Handel') : null,
        ctl.online ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil') : null,
        !ctl.online ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Afslut spillet?', text: 'Spillet slettes, og I starter forfra.', confirmLabel: 'Afslut', danger: true })) { st.game = null; store.save(); ctl = null; setup(); } } }, icon('x'), 'Afslut spil')
          : !isWatcher(room) ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Forlad spillet?', text: ctl.host ? 'Du er vært – spillet slutter for alle.' : 'Computeren tager over for dig.', confirmLabel: 'Forlad', danger: true })) { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } } }, icon('x'), 'Forlad')
            : h('span', { class: 'chip' }, icon('eye'), 'Du ser med'));
      h(clear(root), null, h('div', { class: 'pg-wrap' }, board, h('div', { class: 'pg-side' }, players, trading && myTurn ? tradePanel(s) : info(s), tools)));
      scheduleAI();
    }
    function center(s) {
      const p = s.players[s.turn], mine = ctl.canAct(s.turn) && s.phase !== 'over' && !s.offer;
      const act = (name, ...args) => () => ctl.act(name, args);
      let buttons = [];
      if (s.phase === 'over') buttons = ctl.online ? [h('button', { class: 'btn', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil')] : [h('button', { class: 'btn btn-primary', onclick: () => { st.game = null; store.save(); ctl = null; setup(); } }, icon('refresh'), 'Nyt spil')];
      else if (mine && s.phase === 'roll') {
        buttons = [h('button', { class: 'btn btn-primary btn-lg pg-roll', onclick: act('roll') }, '🎲 Slå')];
        if (p.jail) buttons.push(h('button', { class: 'btn', onclick: act('payJail'), disabled: !p.free && p.money < P.JAIL_FINE }, p.free ? 'Brug løsladelseskort' : `Betal ${kr(P.JAIL_FINE)}`));
      } else if (mine && s.phase === 'buy') {
        const f = P.BOARD[s.pending.field];
        buttons = [h('button', { class: 'btn btn-primary', disabled: p.money < f.price, onclick: act('buy') }, `Køb ${f.name} for ${kr(f.price)}`), h('button', { class: 'btn', onclick: act('skipBuy') }, 'Køb ikke')];
      } else if (mine && s.phase === 'end') buttons = [h('button', { class: 'btn btn-primary', onclick: act('endTurn') }, s.dice[0] === s.dice[1] && s.dice[0] && !p.jail && !s.noAgain ? '🎲 Slå igen' : 'Afslut tur')];
      else if (!s.offer && s.phase !== 'over') buttons = [h('span', { class: 'pg-wait' }, p.ai ? 'Computeren tænker …' : `Venter på ${p.name} …`)];
      return [
        h('div', { class: 'pg-logo' }, 'EJENDOMS', h('b', null, 'KONGEN')),
        h('div', { class: 'pg-dice' }, s.dice[0] ? [h('span', null, DIE[s.dice[0]]), h('span', null, DIE[s.dice[1]])] : null),
        s.phase === 'over' ? h('div', { class: 'pg-turn' }, `🏆 ${s.players[s.winner]?.name} har vundet!`) : h('div', { class: 'pg-turn', style: { '--pc': PCOL[s.turn] } }, `${p.token} ${p.name}s tur`, s.rounds ? h('small', null, ` · runde ${s.round}/${s.rounds}`) : null),
        s.offer ? offerCard(s) : s.lastCard ? h('div', { class: 'pg-card' }, h('small', null, 'Lykkekort'), s.lastCard) : null,
        h('div', { class: 'pg-actions' }, buttons),
        h('ol', { class: 'pg-log', reversed: true }, s.log.slice(0, 6).map(l => h('li', null, l))),
      ];
    }
    const sideText = (side) => [...(side.props || []).map(i => P.BOARD[i].name), side.money ? kr(side.money) : null].filter(Boolean).join(' + ') || 'ingenting';
    function offerCard(s) {
      const o = s.offer, from = s.players[o.from], to = s.players[o.to];
      return h('div', { class: 'pg-card pg-offer' }, h('small', null, 'Tilbud'),
        h('div', null, `${from.name} vil give `, h('b', null, sideText(o.give)), ` for `, h('b', null, sideText(o.get)), ` fra ${to.name}.`),
        ctl.canAct(o.to) ? h('div', { class: 'pg-actions', style: { marginTop: '8px' } },
          h('button', { class: 'btn btn-primary btn-sm', onclick: () => ctl.act('answer', [true]) }, icon('check'), `Ja${ctl.online ? '' : ` (${to.name})`}`),
          h('button', { class: 'btn btn-sm', onclick: () => ctl.act('answer', [false]) }, icon('x'), 'Nej tak'))
          : ctl.canAct(o.from) ? h('div', { class: 'pg-actions', style: { marginTop: '8px' } }, h('span', { class: 'faint' }, `Venter på svar fra ${to.name} …`), h('button', { class: 'btn btn-sm', onclick: () => ctl.act('cancelOffer') }, 'Træk tilbage'))
            : h('div', { class: 'faint', style: { marginTop: '6px' } }, `Venter på svar fra ${to.name} …`));
    }
    function tradePanel(s) {
      const me_ = s.turn;
      const others = s.players.map((p, i) => i).filter(i => i !== me_ && !s.players[i].out);
      let to = others[0];
      const t = { give: { props: [], money: 0 }, get: { props: [], money: 0 } };
      const body = h('div', { class: 'pg-trade' });
      const tradeable = (pi) => Object.keys(s.owner).map(Number).filter(k => s.owner[k] === pi && !(P.BOARD[k].type === 'prop' && P.groupFields(P.BOARD[k].group).some(x => s.houses[x]))).sort((a, b) => a - b);
      const column = (pi, sideObj, label) => {
        const money = h('input', { class: 'input', type: 'number', min: 0, step: 100, max: s.players[pi].money, value: sideObj.money || '', placeholder: '0', 'aria-label': `${label} – penge` });
        money.addEventListener('input', () => { sideObj.money = Math.max(0, Math.round(Number(money.value) || 0)); });
        const props = tradeable(pi);
        return h('div', { class: 'pg-trade-col' }, h('b', null, label),
          props.length ? props.map(k => {
            const c = h('input', { type: 'checkbox', checked: sideObj.props.includes(k) });
            c.addEventListener('change', () => { sideObj.props = c.checked ? [...sideObj.props, k] : sideObj.props.filter(x => x !== k); });
            return h('label', { class: 'pg-trade-prop' }, c, h('i', { style: { background: P.BOARD[k].group != null ? P.GROUPS[P.BOARD[k].group].color : '#94a3b8' } }), P.BOARD[k].name, s.mort[k] ? h('small', null, ' (pantsat)') : null);
          }) : h('span', { class: 'faint' }, 'Ingen gader at handle med'),
          h('label', { class: 'field', style: { marginTop: '6px' } }, h('span', { class: 'field-label' }, `Penge (højst ${kr(s.players[pi].money)})`), money));
      };
      const drawBody = () => {
        t.give = { props: [], money: 0 }; t.get = { props: [], money: 0 };
        h(clear(body), null, h('div', { class: 'pg-trade-cols' }, column(me_, t.give, 'Du giver'), column(to, t.get, `Du får fra ${s.players[to].name}`)));
      };
      const who = h('select', { class: 'select', 'aria-label': 'Handel med' }, others.map(i => h('option', { value: i }, `${s.players[i].token} ${s.players[i].name}${s.players[i].ai ? ' (computer)' : ''}`)));
      who.addEventListener('change', () => { to = Number(who.value); drawBody(); });
      drawBody();
      return panel('Handel', 'users', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Handel med'), who), body,
        s.tradeMsg ? h('p', { class: 'pg-trade-msg' }, s.tradeMsg) : null,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: () => { ctl.act('offer', [to, t]); if (!s.players[to].ai) trading = false; } }, icon('send'), 'Send tilbud'),
          h('button', { class: 'btn btn-ghost', onclick: () => { trading = false; s.tradeMsg = null; draw(); } }, 'Luk')),
        h('p', { class: 'faint', style: { marginBottom: 0, fontSize: '13px' } }, 'Gader med huse i farven kan ikke handles. Computeren siger ja, hvis handlen er god for den – især hvis den får en hel farve.'));
    }
    function info(s) {
      if (sel == null) return panel(null, null, h('p', { class: 'faint', style: { margin: 0 } }, 'Klik på et felt på brættet for at se leje, eller for at bygge og pantsætte på dine egne grunde.'));
      const f = P.BOARD[sel], o = s.owner[sel], pi = s.turn, mine = o === pi && ctl.canAct(pi) && s.phase !== 'over' && !s.offer;
      const rows = [];
      if (f.type === 'prop') {
        const b = P.baseRent(f), steps = [1, 5, 15, 45, 80, 125];
        rows.push(['Leje', kr(b)], ['Hele gruppen', kr(b * 2)], ...[1, 2, 3, 4].map(n => [`${n} ${n === 1 ? 'hus' : 'huse'}`, kr(b * steps[n])]), ['Hotel', kr(b * steps[5])], ['Pris pr. hus', kr(P.GROUPS[f.group].house)]);
      } else if (f.type === 'station') rows.push(['1 station', kr(500)], ['2 stationer', kr(1000)], ['3 stationer', kr(2000)], ['4 stationer', kr(4000)]);
      else if (f.type === 'util') rows.push(['Ét værk', 'terningerne × 100 kr.'], ['Begge værker', 'terningerne × 250 kr.']);
      else if (f.type === 'tax') rows.push(['Skat', kr(f.amount)]);
      const act = (name) => () => ctl.act(name, [sel]);
      return panel(f.name, 'home',
        f.group != null ? h('i', { class: 'pg-info-bar', style: { '--g': P.GROUPS[f.group].color } }) : null,
        f.price ? h('p', { style: { margin: '0 0 8px' } }, `Pris ${kr(f.price)} · ${o != null ? `ejes af ${s.players[o].name}${s.mort[sel] ? ' (pantsat)' : ''}` : 'til salg'}`) : null,
        rows.length ? h('table', { class: 'pg-table' }, h('tbody', null, rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b))))) : h('p', { class: 'faint' }, { start: `Få ${kr(P.PASS_START)}, hver gang du passerer.`, chance: 'Træk et lykkekort.', jail: 'På besøg – eller i fængsel.', park: 'Hvil dig – der sker ingenting.', gojail: 'Gå direkte i fængsel.' }[f.type] || ''),
        mine ? h('div', { class: 'row-actions' },
          f.type === 'prop' ? h('button', { class: 'btn btn-sm btn-primary', disabled: !P.canBuild(s, pi, sel), onclick: act('build') }, icon('home'), (s.houses[sel] || 0) === 4 ? 'Byg hotel' : 'Byg hus') : null,
          f.type === 'prop' ? h('button', { class: 'btn btn-sm', disabled: !P.canSell(s, pi, sel), onclick: act('sell') }, 'Sælg hus') : null,
          s.mort[sel] ? h('button', { class: 'btn btn-sm', disabled: s.players[pi].money < P.unmortgageCost(sel), onclick: act('unmortgage') }, `Indfri (${kr(P.unmortgageCost(sel))})`)
            : h('button', { class: 'btn btn-sm', onclick: act('mortgage') }, `Pantsæt (+${kr(f.price / 2)})`)) : null);
    }
    function scheduleAI() {
      clearTimeout(self._t);
      const s = ctl?.s;
      if (!s || !ctl.host || s.phase === 'over' || !s.players[s.turn].ai || (s.offer && !s.players[s.offer.to].ai)) return;
      self._t = setTimeout(() => { if (!document.body.contains(root) || ctl?.s !== s) return; P.aiStep(s); ctl.save(); draw(); }, s.phase === 'roll' ? 700 : 900);
    }

    // ── online ──
    function openRoom(r) {
      self._off?.(); self._offAct?.(); self._unwatch?.(); self._unwatch = null; clearTimeout(self._t);
      room = r; ctl = null; sel = null; trading = false;
      if (!r) { history.replaceState(null, '', '#/apps/property/online'); return drawOnline(); }
      if (isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
      history.replaceState(null, '', `#/apps/property/online/${r.id}`);
      self._off = watchRoom(r.id, (nr) => {
        if (!nr) { toast('Spillet er lukket', { type: 'info' }); openRoom(null); return; }
        const hadBlob = !!room?.state?.blob;
        const keep = ctl?.host && hadBlob ? room.state.blob : null;      // the host's own copy is the truth
        room = nr;
        if (keep) room.state.blob = keep;
        hostCheckSeats();
        drawOnline();
      });
      // the host applies the others' moves
      self._offAct = onLive('game-act', (ev) => {
        if (!room || ev.id !== room.id || room.host !== me() || !room.state.blob) return;
        const s = room.state.blob, seat = s.players.findIndex(p => p.uid === ev.from);
        if (seat < 0) return;
        if (P.applyAction(s, seat, ev.name, ev.args || [])) { push(); drawOnline(); }
      });
      drawOnline();
    }
    function hostCheckSeats() {    // someone left: the computer takes over their seat
      if (!room?.state?.blob || room.host !== me()) return;
      const s = room.state.blob, ids = new Set(room.players.map(p => p.id));
      let changed = false;
      s.players.forEach(p => { if (p.uid && !p.ai && !ids.has(p.uid)) { p.ai = true; s.log = [`${p.name} har forladt spillet – computeren tager over.`, ...s.log]; changed = true; } });
      if (changed) push();
    }
    function drawOnline() {
      if (!room) {
        h(clear(root), null, lobbyPanel({ game: 'property', multi: true, title: 'Spil Ejendomskongen online', text: 'Invitér op til 5 af dem, der har HUBTECH. I spiller hver på jeres egen computer eller telefon – og værten kan fylde op med computerspillere.', onOpen: openRoom }), rules());
        return;
      }
      if (room.state.blob && (room.status === 'playing' || room.status === 'done')) { ctl = onlineCtl(); draw(); return; }
      const host = room.host === me(), watcher = isWatcher(room);
      let rounds = 40, bots = 0;
      const roundSel = h('select', { class: 'select', 'aria-label': 'Hvor længe' }, ROUNDS.map(([v, l]) => h('option', { value: v, selected: v === rounds }, l)));
      roundSel.addEventListener('change', () => { rounds = Number(roundSel.value); });
      const botSel = h('select', { class: 'select', 'aria-label': 'Computerspillere' }, [0, 1, 2, 3, 4].map(n => h('option', { value: n }, n ? `+ ${n} computer${n > 1 ? 'e' : ''}` : 'Ingen computere')));
      botSel.addEventListener('change', () => { bots = Number(botSel.value); });
      const start = async () => {
        const seats = room.players.slice(0, 6).map((p, i) => ({ name: (p.name || 'Spiller').split(' ')[0].slice(0, 16), uid: p.id, ai: false, token: P.TOKENS[i] }));
        for (let n = 0; n < bots && seats.length < 6; n++) seats.push({ name: `Computer ${n + 1}`, ai: true, token: P.TOKENS[seats.length] });
        if (seats.length < 2) return toast('Der skal være mindst to spillere', { type: 'warn' });
        try {
          await roomApi.start(room.id);
          room.state.blob = P.newGame(seats, { rounds }); room.status = 'playing';
          await api.post(`/api/games/rooms/${room.id}/sync`, { blob: room.state.blob });
          drawOnline();
        } catch (e) { toast(e.message, { type: 'warn' }); }
      };
      h(clear(root), null, panel('Klar til Ejendomskongen', 'users',
        h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle spil'),
          !watcher ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), 'Forlad') : null),
        h('div', { class: 'tr-lobby' }, room.players.map(p => person(p, h('span', { class: 'chip chip-ok' }, 'Klar'))), room.invited.map(p => person(p, h('span', { class: 'chip' }, 'Inviteret')))),
        host ? [h('div', { class: 'row-actions' }, roundSel, botSel),
          h('button', { class: 'btn btn-primary btn-lg', disabled: room.players.length < 2 && !bots, onclick: start }, icon('play'), 'Start spillet'),
          h('p', { class: 'faint' }, 'Du er vært: spillet kører på din enhed, så hold HUBTECH åben, mens I spiller.')]
          : h('p', { class: 'muted' }, `${room.players.find(p => p.id === room.host)?.name || 'Værten'} starter spillet, når alle er klar.`)));
      botSel.addEventListener('change', () => { const b = root.querySelector('.btn-lg'); if (b) b.disabled = room.players.length < 2 && !bots; });
    }

    const modeSeg = segmented([{ value: 'local', label: 'På denne skærm', icon: 'monitor' }, { value: 'online', label: 'Online', icon: 'globe' }], mode, (v) => {
      mode = v; self._off?.(); self._offAct?.(); self._unwatch?.(); clearTimeout(self._t);
      if (v === 'local') { history.replaceState(null, '', '#/apps/property'); room = null; if (st.game) { ctl = localCtl(); draw(); } else { ctl = null; setup(); } }
      else openRoom(null);
    }, { label: 'Hvor' });
    if (mode === 'online') {
      if (ctx?.params?.id) roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
        .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
      else openRoom(null);
    } else if (st.game) { ctl = localCtl(); draw(); } else setup();
    return h('div', { class: 'page gm-page pg-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Ejendomskongen', lead: 'Køb gader, byg huse og hoteller, handl med de andre – og gør dem fallit. 2–6 spillere på én skærm eller online.', compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, modeSeg), root);
  },
};
