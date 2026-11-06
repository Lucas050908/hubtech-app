/** Dam – draughts against the computer, with someone on the same screen, or online. */
import { h } from '../core/dom.js';
import { icon, gnist } from '../core/icons.js';
import { segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import * as D from '../features/checkers.js';

const LEVELS = [['1', 'Let'], ['2', 'Middel'], ['3', 'Svær']];

export default {
  title: 'Dam',
  destroy() { this._g?.destroy(); },
  async render() {
    const app = appById('checkers');
    let store;
    try { store = await appState('checkers', { game: null, setup: null, level: 2, wins: 0, played: 0 }); } catch (e) { return loadError('Dam', e); }
    const st = store.data;
    let sel = null;
    const g = this._g = hostedGame({
      page: 'checkers', game: 'checkers', title: 'Dam', store, minPlayers: 2, maxPlayers: 2,
      seatColor: (i) => (i ? '#1f2937' : '#f8fafc'),
      newGame: (seats) => Object.assign(D.newGame(seats), { level: st.level }),
      apply: D.apply, aiMove: D.aiMove, aiDelay: () => 650,
      setupExtra: () => h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', marginBottom: '10px' } }, h('span', { class: 'field-label' }, 'Computerens niveau'),
        segmented(LEVELS.map(([v, l]) => ({ value: v, label: l })), String(st.level), (v) => { st.level = Number(v); store.save(); }, { label: 'Niveau' })),
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (s.winner != null && !s.players[s.winner].ai && s.players.some(p => p.ai)) st.wins++; } },
      rules,
      render(ctl) {
        const s = ctl.s, my = ctl.canAct(s.turn) && s.phase === 'play';
        const legal = my ? D.legalMoves(s.board, s.turn) : [];
        const flip = ctl.online ? ctl.mySeat === 1 : (s.players[0].ai && !s.players[1].ai);
        const from = new Set(legal.map(m => m.path[0])), to = sel != null ? legal.filter(m => m.path[0] === sel) : [];
        const mustCap = legal.some(m => m.caps.length);
        const lastSet = new Set(s.last ? [s.last.path[0], s.last.path.at(-1)] : []);
        const tip = !ctl.online && st.coach && my ? D.advice(s, s.turn) : null;   // "Gnist forklarer" – only when turned on
        const cells = [];
        for (let k = 0; k < 64; k++) {
          const i = flip ? 63 - k : k, v = s.board[i], dest = to.find(m => m.path.at(-1) === i);
          cells.push(h('button', {
            class: ['dm-cell', D.dark(i) && 'is-dark', from.has(i) && 'can', sel === i && 'is-sel', dest && 'is-dest', lastSet.has(i) && 'is-last', tip && (tip.from === i || tip.to === i) && 'is-hint'],
            disabled: !D.dark(i), 'aria-label': `Felt ${'abcdefgh'[i & 7]}${8 - (i >> 3)}${v ? (v > 0 ? ', hvid' : ', sort') + (Math.abs(v) === 2 ? ' dam' : '') : ''}`,
            onclick: () => {
              if (dest) { const f = sel; sel = null; ctl.act('move', [f, i]); return; }
              sel = from.has(i) && sel !== i ? i : null; g.redraw();
            },
          }, v ? h('span', { class: ['dm-piece', v > 0 ? 'w' : 'b', Math.abs(v) === 2 && 'king'] }, Math.abs(v) === 2 ? '♛' : '') : null, dest ? h('span', { class: 'dm-dot' }) : null));
        }
        const c = D.count(s.board);
        const status = s.phase === 'over' ? (s.winner == null ? 'Uafgjort!' : `${s.players[s.winner].name} vandt! 🎉`)
          : my ? (mustCap ? 'Din tur – du skal slå!' : 'Din tur') : `${s.players[s.turn].name} tænker …`;
        const board = h('div', { class: 'dm-board' }, cells);
        return h('div', { class: 'dm-wrap' },
          h('div', { class: 'dm-side' },
            s.players.map((p, i) => h('div', { class: ['dm-player', s.turn === i && s.phase === 'play' && 'is-turn'] }, h('span', { class: ['dm-piece', 'mini', i ? 'b' : 'w'] }), h('b', null, p.name), h('span', { class: 'faint' }, `${i ? c.black : c.white} brikker`))),
            h('div', { class: ['dm-status', s.phase === 'over' && 'is-over'] }, status),
            tip ? h('div', { class: 'gn-play dm-coach', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'gn-play-mark' }, gnist(36)), h('p', { class: 'gn-play-say' }, h('b', null, 'Gnist: '), tip.text)) : null,
            !ctl.online ? h('button', { class: ['btn btn-sm dm-coach-btn', st.coach && 'btn-primary'], 'aria-pressed': String(!!st.coach), onclick: () => { st.coach = !st.coach; store.save(); g.redraw(); } }, icon('sparkles'), 'Gnist forklarer') : null,
            my ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => ctl.act('resign') }, icon('flag'), 'Giv op') : null,
            h('div', { class: 'row-actions' }, g.controls()),
            s.log?.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 6).map(l => h('li', null, l))) : null,
            !ctl.online ? h('p', { class: 'faint', style: { fontSize: '13px' } }, `Du har vundet ${st.wins} af ${st.played} spil.`) : null),
          board);
      },
    });
    function rules() {
      return panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Brikkerne flyttes skråt på de mørke felter – almindelige brikker ét felt fremad.'),
        h('li', null, 'Du slår ved at hoppe over en modstanders brik. Det er tvunget at slå – og man fortsætter, så længe man kan.'),
        h('li', null, 'Når en brik når den modsatte kant, bliver den en dam, der kan flytte og slå langt skråt i alle retninger.'),
        h('li', null, 'Den, der ikke kan flytte, har tabt.')));
    }
    return h('div', { class: 'page dm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Dam', lead: 'Klassisk dam på 8×8 felter: tvunget slag, flere hop i træk og flyvende damer. Mod computeren, ved samme skærm eller online.', compact: true }), g.el);
  },
};
