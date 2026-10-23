/** Ludo – 2–4 players against the computer, on one screen or online. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import * as L from '../features/ludo.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n, rolling) => h('span', { class: ['ld-die', rolling && 'is-rolling'], 'aria-label': n ? `Terning: ${n}` : 'Terning' }, Array.from({ length: 9 }, (_, i) => h('i', { class: n && PIPS[n].includes(i) ? 'on' : '' })));

export default {
  title: 'Ludo',
  destroy() { this._g?.destroy(); },
  async render() {
    const app = appById('ludo');
    let store;
    try { store = await appState('ludo', { game: null, setup: null, wins: 0, played: 0 }); } catch (e) { return loadError('Ludo', e); }
    const st = store.data;
    let lastRoll = 0;
    const g = this._g = hostedGame({
      page: 'ludo', game: 'ludo', title: 'Ludo', store, minPlayers: 2, maxPlayers: 4,
      seatColor: (i) => L.COLORS[i]?.hex,
      onlineText: 'Invitér op til 3 af dem, der har HUBTECH – og fyld op med computere, hvis I vil.',
      newGame: (seats) => L.newGame(seats), apply: L.apply, aiMove: L.aiMove,
      aiDelay: (s, seat, mv) => (mv.name === 'roll' ? 650 : 550),
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (s.winner != null && !s.players[s.winner].ai) st.wins++; } },
      rules,
      render(ctl) {
        const s = ctl.s, my = ctl.canAct(s.turn) && s.phase !== 'over';
        const can = my && s.phase === 'move' ? L.movable(s, s.turn) : [];
        const rolling = s.last?.roll && s.last.at !== lastRoll && Date.now() - s.last.at < 1500;
        if (rolling) { lastRoll = s.last.at; setTimeout(() => g.redraw(), 420); }
        const cells = [];
        // the coloured corners, arms and centre
        L.COLORS.forEach((c, k) => {
          const [r0, c0] = [[0, 0], [0, 9], [9, 9], [9, 0]][k];
          cells.push(h('div', { class: 'ld-yard', style: { gridRow: `${r0 + 1} / span 6`, gridColumn: `${c0 + 1} / span 6`, '--c': c.hex } }, h('div', { class: 'ld-yard-in' })));
          L.homeRow(k).forEach(([r, cc]) => cells.push(h('div', { class: 'ld-cell ld-home', style: { gridRow: r + 1, gridColumn: cc + 1, '--c': c.hex } })));
        });
        for (let sq = 0; sq < 52; sq++) {
          const [r, c] = L.trackCell(sq), startOf = [0, 13, 26, 39].indexOf(sq);
          cells.push(h('div', { class: ['ld-cell', startOf >= 0 && 'ld-start'], style: { gridRow: r + 1, gridColumn: c + 1, ...(startOf >= 0 ? { '--c': L.COLORS[startOf].hex } : {}) } }, startOf >= 0 ? '★' : ''));
        }
        cells.push(h('div', { class: 'ld-center', style: { gridRow: '7 / span 3', gridColumn: '7 / span 3' } }));
        // pieces (pieces on the same square are nudged apart)
        const seen = {};
        s.pieces.forEach((ps, seat) => ps.forEach((pos, i) => {
          const [r, c] = L.cellOf(s, seat, i), key = `${r},${c}`, k = seen[key] = (seen[key] || 0) + 1;
          const ok = seat === s.turn && can.includes(i);
          const pv = ok ? L.preview(s, seat, i) : null;
          cells.push(h('button', { class: ['ld-piece', ok && 'can', pv?.hits.length && 'hits'], disabled: !ok, style: { gridRow: r + 1, gridColumn: c + 1, '--c': L.COLORS[s.players[seat].color].hex, '--dx': `${(k - 1) * 5}px`, '--dy': `${(k - 1) * -5}px` },
            'aria-label': `${s.players[seat].name}s brik ${i + 1}${ok ? ' – kan flyttes' : ''}`, onclick: () => ctl.act('move', [i]) }));
        }));
        const cur = s.players[s.turn], curColor = L.COLORS[cur.color];
        const status = s.phase === 'over' ? `${s.players[s.winner].name} vandt! 🎉` : my ? (s.phase === 'roll' ? 'Din tur – slå med terningen' : 'Vælg en brik, der skal flytte') : `${cur.name}s tur …`;
        return h('div', { class: 'ld-wrap' },
          h('div', { class: 'ld-board', style: { '--turn': curColor.hex } }, cells),
          h('div', { class: 'dm-side' },
            h('div', { class: 'ld-turn', style: { '--c': curColor.hex } }, die(rolling ? 1 + Math.floor(Math.random() * 6) : s.die || s.last?.roll, rolling),
              h('div', null, h('b', null, status), s.tries && s.phase === 'roll' ? h('span', { class: 'faint' }, ` Forsøg ${s.tries + 1} af 3`) : null)),
            my && s.phase === 'roll' ? h('button', { class: 'btn btn-primary btn-lg ld-roll', onclick: () => ctl.act('roll') }, icon('cube'), 'Slå') : null,
            s.players.map((p, i) => h('div', { class: ['dm-player', s.turn === i && s.phase !== 'over' && 'is-turn'] }, h('span', { class: 'ld-dot', style: { background: L.COLORS[p.color].hex } }), h('b', null, p.name),
              h('span', { class: 'faint' }, s.finished.includes(i) ? `nr. ${s.finished.indexOf(i) + 1} 🏁` : `${s.pieces[i].filter(x => x === L.GOAL).length}/4 i mål`))),
            h('div', { class: 'row-actions' }, g.controls()),
            s.log?.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 6).map(l => h('li', null, l))) : null));
      },
    });
    function rules() {
      return panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Slå en 6\'er for at få en brik ud. En 6\'er giver også et ekstra slag.'),
        h('li', null, 'Lander du på en enlig modstander, ryger den hjem – og du får et ekstra slag. Stjernefelterne er sikre.'),
        h('li', null, 'Efter en tur rundt går brikken ind ad sin egen farvede vej. Den skal ramme målet præcist.'),
        h('li', null, 'Har du alle brikker hjemme, får du tre forsøg til at slå en 6\'er.')));
    }
    return h('div', { class: 'page dm-page ld-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Ludo', lead: 'Det klassiske terningespil for 2–4 – mod computeren, ved samme skærm eller online med vennerne.', compact: true }), g.el);
  },
};
