/**
 * Ejendomskongen – a big property game for 2–6 players on one screen; any of them can be the computer.
 * Our own board, streets and lykkekort. The game is saved on the account, so you can continue another day.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import * as P from '../features/property.js';
import { store as appStore } from '../core/store.js';

const kr = (n) => `${Math.round(n).toLocaleString('da-DK')} kr.`;
const PCOL = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
/** grid row/column for field i on an 11 × 11 board (START bottom right, going clockwise to the left) */
function cellPos(i) {
  if (i <= 10) return [11, 11 - i];
  if (i <= 20) return [11 - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), 11];
}
const side = (i) => (i % 10 === 0 ? 'corner' : i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right');

export default {
  title: 'Ejendomskongen',
  destroy() { clearTimeout(this._t); },
  async render() {
    const app = appById('property');
    let store;
    try { store = await appState('property', { game: null, setup: null }); } catch (e) { return loadError('Ejendomskongen', e); }
    const st = store.data, self = this;
    const root = h('div');
    let sel = null;   // field shown in the info card

    // ── setup ──
    function setup() {
      const me = (appStore.get('user')?.name || appStore.get('user')?.displayName || 'Dig').split(' ')[0].slice(0, 16);
      const players = st.setup?.players || [{ name: me, ai: false, token: P.TOKENS[0] }, { name: 'Computer 1', ai: true, token: P.TOKENS[1] }, { name: 'Computer 2', ai: true, token: P.TOKENS[2] }];
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
      const roundSel = h('select', { class: 'select', 'aria-label': 'Hvor længe' }, [[25, 'Kort spil – 25 runder'], [40, 'Normalt – 40 runder'], [70, 'Langt – 70 runder'], [0, 'Til én står tilbage']].map(([v, l]) => h('option', { value: v, selected: v === rounds }, l)));
      roundSel.addEventListener('change', () => { rounds = Number(roundSel.value); });
      drawList();
      h(clear(root), null, panel('Nyt spil', 'users',
        h('p', { class: 'muted', style: { marginTop: 0 } }, '2–6 spillere på samme skærm. Hver spiller kan være et menneske eller computeren. I skiftes til at bruge musen eller telefonen.'),
        list, h('div', { class: 'row-actions' }, addBtn, roundSel),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => {
          if (!players.some(p => !p.ai)) return toast('Mindst én skal være et menneske', { type: 'warn' });
          st.setup = { players: players.map(p => ({ ...p })), rounds };
          st.game = P.newGame(players, { rounds }); sel = null; save(); game();
        } }, icon('play'), 'Start spillet'))),
        panel('Sådan spiller man', 'help', h('ul', { class: 'pg-rules' },
          h('li', null, 'Slå med terningerne, og ryk rundt. Lander du på en ledig grund, kan du købe den.'),
          h('li', null, 'Lander andre på din grund, betaler de leje. Ejer du hele farvegruppen, er lejen dobbelt – og du kan bygge huse og til sidst et hotel.'),
          h('li', null, `Passerer du START, får du ${kr(P.PASS_START)}. To ens = slå igen. Tre gange to ens = fængsel.`),
          h('li', null, `I fængsel: slå to ens, brug et løsladelseskort, eller betal ${kr(P.JAIL_FINE)}.`),
          h('li', null, 'Mangler du penge, sælges huse og grunde pantsættes automatisk. Er det ikke nok, er du gået fallit.'),
          h('li', null, 'Den sidste, der ikke er gået fallit, vinder – eller den rigeste, når runderne er brugt.'))));
    }
    const save = () => store.save();

    // ── the game ──
    function game() {
      const s = st.game;
      const board = h('div', { class: 'pg-board' });
      for (let i = 0; i < 40; i++) {
        const f = P.BOARD[i], [r, c] = cellPos(i), o = s.owner[i];
        const here = s.players.map((p, pi) => (!p.out && p.pos === i ? pi : -1)).filter(x => x >= 0);
        const hs = s.houses[i] || 0;
        board.append(h('button', { class: ['pg-cell', `is-${side(i)}`, `t-${f.type}`, s.mort[i] && 'is-mort', sel === i && 'is-sel', s.players[s.turn]?.pos === i && 'is-here'],
          style: { gridRow: r, gridColumn: c, '--g': f.group != null ? P.GROUPS[f.group].color : 'transparent', '--o': o != null ? PCOL[o] : 'transparent' },
          'aria-label': `${f.name}${o != null ? `, ejes af ${s.players[o].name}` : ''}`, onclick: () => { sel = sel === i ? null : i; game(); } },
          f.type === 'prop' ? h('i', { class: 'pg-bar' }, hs === 5 ? '🏨' : hs ? '🏠'.repeat(hs) : '') : null,
          h('span', { class: 'pg-name' }, f.type === 'chance' ? '❓' : f.type === 'station' ? '🚉' : f.type === 'util' ? (i === 12 ? '💡' : '🚰') : f.type === 'tax' ? '💰' : f.type === 'start' ? '➡️' : f.type === 'jail' ? '🔒' : f.type === 'park' ? '🅿️' : f.type === 'gojail' ? '👮' : '', ' ', f.name),
          f.price ? h('span', { class: 'pg-price' }, o != null ? '' : kr(f.price)) : null,
          o != null ? h('i', { class: 'pg-owner' }) : null,
          here.length ? h('span', { class: 'pg-tokens' }, here.map(pi => h('b', { style: { '--pc': PCOL[pi] } }, s.players[pi].token))) : null));
      }
      board.append(h('div', { class: 'pg-center' }, center(s)));
      const players = h('div', { class: 'pg-players' }, s.players.map((p, pi) => h('div', { class: ['pg-player', pi === s.turn && s.phase !== 'over' && 'is-turn', p.out && 'is-out'], style: { '--pc': PCOL[pi] } },
        h('span', { class: 'pg-tok' }, p.token), h('div', { class: 'pg-pinfo' }, h('b', null, p.name, p.ai ? h('small', null, ' · computer') : null), h('span', null, p.out ? 'Gået fallit' : `${kr(p.money)}${p.jail ? ' · i fængsel' : ''}${p.free ? ' · 🎫' : ''}`),
          h('div', { class: 'pg-props' }, Object.keys(s.owner).filter(k => s.owner[k] === pi).map(Number).sort((a, b) => a - b).map(k => h('button', { class: ['pg-chip', s.mort[k] && 'is-mort'], style: { '--g': P.BOARD[k].group != null ? P.GROUPS[P.BOARD[k].group].color : '#94a3b8' }, title: P.BOARD[k].name, onclick: () => { sel = k; game(); } })))))));
      h(clear(root), null, h('div', { class: 'pg-wrap' }, board, h('div', { class: 'pg-side' }, players, info(s), h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Afslut spillet?', text: 'Spillet slettes, og I starter forfra.', confirmLabel: 'Afslut', danger: true })) { st.game = null; save(); setup(); } } }, icon('x'), 'Afslut spil')))));
      scheduleAI();
    }
    function center(s) {
      const p = s.players[s.turn], human = !p.ai && s.phase !== 'over';
      const act = (fn) => () => { fn(s); save(); game(); };
      let buttons = [];
      if (s.phase === 'over') buttons = [h('button', { class: 'btn btn-primary', onclick: () => { st.game = null; save(); setup(); } }, icon('refresh'), 'Nyt spil')];
      else if (human && s.phase === 'roll') {
        buttons = [h('button', { class: 'btn btn-primary btn-lg pg-roll', onclick: act((x) => P.roll(x)) }, '🎲 Slå')];
        if (p.jail) buttons.push(h('button', { class: 'btn', onclick: act(P.payJail), disabled: !p.free && p.money < P.JAIL_FINE }, p.free ? 'Brug løsladelseskort' : `Betal ${kr(P.JAIL_FINE)}`));
      } else if (human && s.phase === 'buy') {
        const f = P.BOARD[s.pending.field];
        buttons = [h('button', { class: 'btn btn-primary', disabled: p.money < f.price, onclick: act(P.buy) }, `Køb ${f.name} for ${kr(f.price)}`), h('button', { class: 'btn', onclick: act(P.skipBuy) }, 'Køb ikke')];
      } else if (human && s.phase === 'end') buttons = [h('button', { class: 'btn btn-primary', onclick: act(P.endTurn) }, s.dice[0] === s.dice[1] && s.dice[0] && !p.jail && !s.noAgain ? '🎲 Slå igen' : 'Afslut tur')];
      return [
        h('div', { class: 'pg-logo' }, 'EJENDOMS', h('b', null, 'KONGEN')),
        h('div', { class: 'pg-dice' }, s.dice[0] ? [h('span', null, DIE[s.dice[0]]), h('span', null, DIE[s.dice[1]])] : null),
        s.phase === 'over' ? h('div', { class: 'pg-turn' }, `🏆 ${s.players[s.winner]?.name} har vundet!`) : h('div', { class: 'pg-turn', style: { '--pc': PCOL[s.turn] } }, `${p.token} ${p.name}s tur`, s.rounds ? h('small', null, ` · runde ${s.round}/${s.rounds}`) : null),
        s.lastCard ? h('div', { class: 'pg-card' }, h('small', null, 'Lykkekort'), s.lastCard) : null,
        h('div', { class: 'pg-actions' }, buttons),
        h('ol', { class: 'pg-log', reversed: true }, s.log.slice(0, 6).map(l => h('li', null, l))),
      ];
    }
    function info(s) {
      if (sel == null) return panel(null, null, h('p', { class: 'faint', style: { margin: 0 } }, 'Klik på et felt på brættet for at se leje, eller for at bygge og pantsætte på dine egne grunde.'));
      const f = P.BOARD[sel], o = s.owner[sel], pi = s.turn, mine = o === pi && !s.players[pi].ai && s.phase !== 'over';
      const rows = [];
      if (f.type === 'prop') {
        const b = P.baseRent(f), steps = [1, 5, 15, 45, 80, 125];
        rows.push(['Leje', kr(b)], ['Hele gruppen', kr(b * 2)], ...[1, 2, 3, 4].map(n => [`${n} ${n === 1 ? 'hus' : 'huse'}`, kr(b * steps[n])]), ['Hotel', kr(b * steps[5])], ['Pris pr. hus', kr(P.GROUPS[f.group].house)]);
      } else if (f.type === 'station') rows.push(['1 station', kr(500)], ['2 stationer', kr(1000)], ['3 stationer', kr(2000)], ['4 stationer', kr(4000)]);
      else if (f.type === 'util') rows.push(['Ét værk', 'terningerne × 100 kr.'], ['Begge værker', 'terningerne × 250 kr.']);
      else if (f.type === 'tax') rows.push(['Skat', kr(f.amount)]);
      const act = (fn) => () => { fn(s, pi, sel); save(); game(); };
      return panel(f.name, 'home',
        f.group != null ? h('i', { class: 'pg-info-bar', style: { '--g': P.GROUPS[f.group].color } }) : null,
        f.price ? h('p', { style: { margin: '0 0 8px' } }, `Pris ${kr(f.price)} · ${o != null ? `ejes af ${s.players[o].name}${s.mort[sel] ? ' (pantsat)' : ''}` : 'til salg'}`) : null,
        rows.length ? h('table', { class: 'pg-table' }, h('tbody', null, rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b))))) : h('p', { class: 'faint' }, { start: `Få ${kr(P.PASS_START)}, hver gang du passerer.`, chance: 'Træk et lykkekort.', jail: 'På besøg – eller i fængsel.', park: 'Hvil dig – der sker ingenting.', gojail: 'Gå direkte i fængsel.' }[f.type] || ''),
        mine ? h('div', { class: 'row-actions' },
          f.type === 'prop' ? h('button', { class: 'btn btn-sm btn-primary', disabled: !P.canBuild(s, pi, sel), onclick: act(P.build) }, icon('home'), (s.houses[sel] || 0) === 4 ? 'Byg hotel' : 'Byg hus') : null,
          f.type === 'prop' ? h('button', { class: 'btn btn-sm', disabled: !P.canSell(s, pi, sel), onclick: act(P.sell) }, 'Sælg hus') : null,
          s.mort[sel] ? h('button', { class: 'btn btn-sm', disabled: s.players[pi].money < P.unmortgageCost(sel), onclick: act(P.unmortgage) }, `Indfri (${kr(P.unmortgageCost(sel))})`)
            : h('button', { class: 'btn btn-sm', onclick: act(P.mortgage) }, `Pantsæt (+${kr(f.price / 2)})`)) : null);
    }
    function scheduleAI() {
      clearTimeout(self._t);
      const s = st.game;
      if (!s || s.phase === 'over' || !s.players[s.turn].ai) return;
      self._t = setTimeout(() => { if (!document.body.contains(root)) return; P.aiStep(s); save(); game(); }, s.phase === 'roll' ? 700 : 900);
    }

    if (st.game) game(); else setup();
    return h('div', { class: 'page gm-page pg-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Ejendomskongen', lead: 'Køb gader, byg huse og hoteller, og gør de andre fallit. 2–6 spillere – mennesker eller computeren.', compact: true }),
      root);
  },
};
