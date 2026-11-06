/** Hjerterfri – the trick-taking game where you avoid hearts and the queen of spades. With computers or online. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import * as Hh from '../features/hearts.js';

const card = (c, attrs = {}) => h('button', { class: ['ot-card', 'HD'.includes(c[0]) && 'red', attrs.class], disabled: attrs.disabled, onclick: attrs.onclick, 'aria-label': `${Hh.NAMES[c[0]]} ${Hh.label(c).slice(1)}` },
  h('span', { class: 'ot-tl' }, Hh.label(c).slice(1), h('br'), Hh.SUITS[c[0]]), h('span', { class: 'ot-mid' }, Hh.SUITS[c[0]]));

export default {
  title: 'Hjerterfri',
  destroy() { this._g?.destroy(); },
  async render() {
    const app = appById('hearts');
    let store;
    try { store = await appState('hearts', { game: null, setup: { players: [{ name: 'Dig', ai: false }, { name: 'Gnist', ai: true }, { name: 'Gnist 2', ai: true }, { name: 'Gnist 3', ai: true }] }, wins: 0, played: 0 }); } catch (e) { return loadError('Hjerterfri', e); }
    const st = store.data;
    let picked = new Set();
    const g = this._g = hostedGame({
      page: 'hearts', game: 'hearts', title: 'Hjerterfri', store, minPlayers: 2, maxPlayers: 4,
      onlineText: 'Invitér op til 3 af dem, der har HUBTECH – de tomme pladser fyldes med computere.',
      newGame: (seats) => Hh.newGame(seats), apply: Hh.apply, aiMove: Hh.aiMove,
      aiDelay: (s, seat, mv) => (mv.name === 'pass' ? 250 : mv.name === 'next' ? 2500 : 650),
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (!s.players[s.winner].ai) st.wins++; } },
      rules: () => panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Inden hver runde giver du tre kort videre (til venstre, højre, over for dig – og hver fjerde runde ingen bytte).'),
        h('li', null, 'Den med klør 2 starter. Du skal bekende kulør. Hjerter må ikke spilles ud, før de er “brudt”.'),
        h('li', null, 'Hvert hjerter giver 1 point, spar dame 13. Tager du alle 26 point, får de andre 26 i stedet – det hedder at skyde månen.'),
        h('li', null, 'Når nogen når 100 point, vinder den med færrest.'))),
      render(ctl) {
        const s = ctl.s, me = ctl.online ? Math.max(0, ctl.mySeat) : s.players.findIndex(p => !p.ai);
        const order = [0, 1, 2, 3].map(k => (me + k) % 4);       // me at the bottom, then clockwise
        const pos = ['bottom', 'left', 'top', 'right'];
        const legal = Hh.legal(s, me);
        const hand = Hh.sortHand(s.hands[me]);
        const passing = s.phase === 'pass' && !s.passing?.[me];
        const status = s.phase === 'over' ? `${s.players[s.winner].name} vandt med ${s.scores[s.winner]} point! 🎉`
          : s.phase === 'scored' ? 'Runden er slut' : passing ? `Vælg 3 kort, du vil give ${Hh.PASS_TEXT[[0, 1, 3, 2].indexOf(s.passDir)] || ''}`
            : s.phase === 'pass' ? 'Venter på de andre …' : s.turn === me ? (s.tricks === 0 && !s.trick.length ? 'Du starter med klør 2' : 'Din tur') : `${s.players[s.turn].name}s tur …`;
        const trickCards = s.trick.length ? s.trick : (s.lastTrick && Date.now() - s.lastTrick.at < 1400 ? s.lastTrick.cards : []);
        if (!s.trick.length && s.lastTrick && Date.now() - s.lastTrick.at < 1400) setTimeout(() => g.redraw(), 1450 - (Date.now() - s.lastTrick.at));
        return h('div', { class: 'hr-wrap' },
          h('div', { class: 'hr-table' },
            order.slice(1).map((seat, k) => h('div', { class: ['hr-seat', pos[k + 1], s.turn === seat && s.phase === 'play' && 'is-turn'] }, h('b', null, s.players[seat].name), h('span', { class: 'faint' }, `${s.scores[seat]} point · ${s.hands[seat].length} kort`))),
            h('div', { class: 'hr-trick' }, trickCards.map(t => h('div', { class: `hr-tc ${pos[order.indexOf(t.seat)]}` }, card(t.card, { disabled: true })))),
            h('div', { class: ['hr-seat', 'bottom', s.turn === me && s.phase === 'play' && 'is-turn'] }, h('b', null, s.players[me].name), h('span', { class: 'faint' }, `${s.scores[me]} point`))),
          h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', (s.turn === me || passing) && 'is-mine'] }, status,
            passing ? h('button', { class: 'btn btn-sm btn-primary', style: { marginLeft: '10px' }, disabled: picked.size !== 3, onclick: () => { const cs = [...picked]; picked = new Set(); ctl.actAs(me, 'pass', [cs]); } }, `Giv ${picked.size}/3 videre`) : null,
            s.phase === 'scored' ? h('button', { class: 'btn btn-sm btn-primary', style: { marginLeft: '10px' }, onclick: () => ctl.actAs(me, 'next') }, 'Næste runde') : null),
          s.phase === 'scored' || s.phase === 'over' ? h('table', { class: 'tn-table hr-score' }, h('thead', null, h('tr', null, h('th', null, 'Spiller'), h('th', null, 'Runden'), h('th', null, 'I alt'))),
            h('tbody', null, s.players.map((p, i) => h('tr', { class: s.phase === 'over' && i === s.winner ? 'is-top' : '' }, h('td', null, p.name), h('td', null, `+${s.roundPoints?.[i] ?? 0}`), h('td', null, h('b', null, String(s.scores[i]))))))) : null,
          h('div', { class: 'ot-hand hr-hand', style: { '--n': hand.length } }, hand.map(c => card(c, {
            class: [passing && picked.has(c) && 'picked', !passing && legal.includes(c) && 'can', s.received?.[me]?.includes(c) && s.tricks === 0 && 'new'].filter(Boolean).join(' '),
            disabled: passing ? false : !legal.includes(c),
            onclick: () => { if (passing) { picked.has(c) ? picked.delete(c) : picked.size < 3 && picked.add(c); g.redraw(); } else ctl.actAs(me, 'play', [c]); },
          }))),
          h('div', { class: 'row-actions' }, g.controls()),
          s.log?.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 4).map(l => h('li', null, l))) : null);
      },
    });
    return h('div', { class: 'page dm-page hr-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Hjerterfri', lead: 'Undgå hjerterne og spar dame – eller tag dem alle og skyd månen. Fire spillere med computere eller venner online.', compact: true }), g.el);
  },
};
