/** Otter – eights are wild. Against the computer, around one screen, or online with up to five others. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { modal } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import * as O from '../features/otter.js';

const cardEl = (c, attrs = {}) => h('button', { class: ['ot-card', O.isRed(c) && 'red', attrs.class], disabled: attrs.disabled, onclick: attrs.onclick, 'aria-label': `${O.SUIT_NAME[O.suitOf(c)]} ${O.VAL[O.valOf(c)] || O.valOf(c)}` },
  h('span', { class: 'ot-tl' }, O.VAL[O.valOf(c)] || O.valOf(c), h('br'), O.SUITS[O.suitOf(c)]), h('span', { class: 'ot-mid' }, O.SUITS[O.suitOf(c)]));
const pickSuit = () => new Promise((resolve) => {
  let done = false;
  const m = modal({ title: 'Vælg en kulør', label: 'Du spillede en 8\'er', size: 420, body: h('div', { class: 'ot-suits' }, Object.entries(O.SUITS).map(([k, v]) => h('button', { class: ['ot-suit', 'HD'.includes(k) && 'red'], onclick: () => { done = true; m.close(); resolve(k); } }, h('b', null, v), h('span', null, O.SUIT_NAME[k])))),
    onClose: () => { if (!done) resolve(null); } });
});

export default {
  title: 'Otter',
  destroy() { this._g?.destroy(); },
  async render() {
    const app = appById('otter');
    let store;
    try { store = await appState('otter', { game: null, setup: null, wins: 0, played: 0 }); } catch (e) { return loadError('Otter', e); }
    const st = store.data;
    let revealed = null;          // hot seat: which human may see their cards right now
    const g = this._g = hostedGame({
      page: 'otter', game: 'otter', title: 'Otter', store, minPlayers: 2, maxPlayers: 6,
      onlineText: 'Invitér op til 5 af dem, der har HUBTECH. Alle ser kun deres egne kort.',
      newGame: (seats) => O.newGame(seats), apply: O.apply, aiMove: O.aiMove, aiDelay: () => 800,
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (!s.players[s.winner].ai) st.wins++; } },
      rules,
      render(ctl) {
        const s = ctl.s;
        const humans = s.players.map((p, i) => (!p.ai ? i : -1)).filter(i => i >= 0);
        const viewer = ctl.online ? ctl.mySeat : (!s.players[s.turn].ai ? s.turn : humans[0]);
        // hot seat with more than one person: hide the hand until the right person is ready
        if (!ctl.online && humans.length > 1 && s.phase === 'play' && revealed !== s.turn && !s.players[s.turn].ai) {
          return h('div', { class: 'ot-cover' }, h('div', { class: 'qz-big' }, '🂠'), h('h2', null, `Giv skærmen til ${s.players[s.turn].name}`), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { revealed = s.turn; g.redraw(); } }, 'Jeg er klar – vis mine kort'), h('div', { class: 'row-actions' }, g.controls()));
        }
        const my = viewer >= 0 && ctl.canAct(viewer) && s.turn === viewer && s.phase === 'play';
        const hand = viewer >= 0 ? s.hands[viewer] : [];
        const ok = my ? O.playable(s, viewer) : [];
        const sorted = hand.slice().sort((a, b) => 'SHCD'.indexOf(O.suitOf(a)) - 'SHCD'.indexOf(O.suitOf(b)) || O.valOf(a) - O.valOf(b));
        const play = async (c) => {
          let suit;
          if (O.valOf(c) === 8) { suit = await pickSuit(); if (!suit) return; }
          if (!ctl.online) revealed = null;
          ctl.act('play', suit ? [c, suit] : [c]);
        };
        const status = s.phase === 'over' ? `${s.players[s.winner].name} vandt! 🎉` : my ? (s.drew ? 'Du trak et kort, der passer – spil det eller stå over' : ok.length ? 'Din tur – spil et kort' : 'Din tur – du skal trække') : `${s.players[s.turn].name}s tur …`;
        return h('div', { class: 'ot-wrap' },
          h('div', { class: 'ot-others' }, s.players.map((p, i) => i === viewer ? null : h('div', { class: ['ot-opp', s.turn === i && s.phase === 'play' && 'is-turn'] }, h('b', null, p.name),
            h('div', { class: 'ot-backs' }, Array.from({ length: Math.min(12, s.hands[i].length) }, () => h('i'))), h('span', { class: 'faint' }, `${s.hands[i].length} kort${s.phase === 'over' ? ` · ${s.score[i]} point` : ''}`)))),
          h('div', { class: 'ot-table' },
            h('button', { class: 'ot-deck', disabled: !my || !!s.drew, 'aria-label': `Træk et kort (${s.deck.length} tilbage)`, onclick: () => ctl.act('draw') }, h('span', null, String(s.deck.length))),
            h('div', { class: 'ot-pile' }, cardEl(O.top(s), { class: 'is-top', disabled: true })),
            h('div', { class: ['ot-suitnow', 'HD'.includes(s.suit) && 'red'] }, h('small', null, 'Kulør'), h('b', null, O.SUITS[s.suit]))),
          h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', my && 'is-mine'] }, status,
            my && s.drew ? h('button', { class: 'btn btn-sm', style: { marginLeft: '10px' }, onclick: () => { if (!ctl.online) revealed = null; ctl.act('pass'); } }, 'Stå over') : null),
          viewer >= 0 ? h('div', { class: 'ot-hand', style: { '--n': sorted.length } }, sorted.map(c => cardEl(c, { class: ok.includes(c) ? 'can' : my ? 'no' : '', disabled: !ok.includes(c), onclick: () => play(c) }))) : h('p', { class: 'muted' }, 'Du ser med.'),
          h('div', { class: 'row-actions' }, g.controls()),
          s.log?.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 5).map(l => h('li', null, l))) : null);
      },
    });
    function rules() {
      return panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Spil et kort i samme kulør eller med samme værdi som det øverste kort.'),
        h('li', null, 'En 8\'er kan altid spilles – og så bestemmer du kuløren.'),
        h('li', null, 'Kan du ikke spille, trækker du et kort. Passer det, må du spille det med det samme.'),
        h('li', null, 'Den første uden kort vinder. De andre får point for kortene på hånden (8 = 50, billedkort = 10).')));
    }
    return h('div', { class: 'page dm-page ot-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Otter', lead: 'Kortspillet hvor 8\'erne er jokere. For 2–6 – mod computeren, rundt om én skærm eller online.', compact: true }), g.el);
  },
};
