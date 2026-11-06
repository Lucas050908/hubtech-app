/** Sænke slagskibe – place your fleet and sink theirs. Against the computer, two on one screen, or online. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import * as B from '../features/battleship.js';

const COLS = 'ABCDEFGHIJ';
const cellName = (i) => `${COLS[i % 10]}${Math.floor(i / 10) + 1}`;

export default {
  title: 'Sænke slagskibe',
  destroy() { this._g?.destroy(); },
  async render() {
    const app = appById('battleship');
    let store;
    try { store = await appState('battleship', { game: null, setup: null, wins: 0, played: 0 }); } catch (e) { return loadError('Sænke slagskibe', e); }
    const st = store.data;
    let placing = null, dir = 'h', pick = 0, revealed = null, hover = null;

    function grid(kind, view, { ships = [], onCell, preview = [], bad = false } = {}) {
      const shipSet = new Set(ships.flat()), prev = new Set(preview);
      return h('div', { class: ['bs-grid', `bs-${kind}`] },
        h('span'), [...COLS].map(c => h('span', { class: 'bs-lab' }, c)),
        Array.from({ length: 10 }, (_, r) => [h('span', { class: 'bs-lab' }, String(r + 1)), Array.from({ length: 10 }, (_, c) => {
          const i = r * 10 + c, v = view?.[i];
          return h('button', { class: ['bs-cell', shipSet.has(i) && 'ship', v && `is-${v}`, prev.has(i) && (bad ? 'prev-bad' : 'prev')], disabled: !onCell, 'aria-label': `${cellName(i)}${v === 'hit' ? ', ramt' : v === 'sunk' ? ', sænket' : v === 'miss' ? ', vand' : ''}`,
            onclick: () => onCell?.(i), onpointerenter: () => { if (kind === 'place' && hover !== i) { hover = i; g.redraw(); } }   /* only when the square changes – a redraw puts a new cell under the pointer */ }, v === 'miss' ? '•' : v ? '✕' : '');
        })]));
    }

    const g = this._g = hostedGame({
      page: 'battleship', game: 'battleship', title: 'Sænke slagskibe', store, minPlayers: 2, maxPlayers: 2,
      newGame: (seats) => B.newGame(seats), apply: B.apply, aiMove: (s, seat) => B.aiMove(s, seat),
      aiDelay: (s, seat, mv) => (mv.name === 'place' ? 200 : 750),
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (!s.players[s.winner].ai && s.players.some(p => p.ai)) st.wins++; } },
      rules,
      render(ctl) {
        const s = ctl.s;
        const humans = s.players.map((p, i) => (!p.ai ? i : -1)).filter(i => i >= 0);
        let me = ctl.online ? ctl.mySeat : s.phase === 'place' ? humans.find(i => !s.fleets[i]) ?? humans[0] : (!s.players[s.turn].ai ? s.turn : humans[0]);
        if (!ctl.online && humans.length > 1 && s.phase !== 'over' && revealed !== me) {
          return h('div', { class: 'ot-cover' }, h('div', { class: 'qz-big' }, '⚓'), h('h2', null, `Giv skærmen til ${s.players[me].name}`), h('p', { class: 'muted' }, 'Den anden må ikke kigge!'), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { revealed = me; g.redraw(); } }, 'Jeg er klar'), h('div', { class: 'row-actions' }, g.controls()));
        }
        if (me < 0) me = 0;
        const opp = 1 - me;
        // ── placing ──
        if (s.phase === 'place') {
          if (s.fleets[me]) return h('div', { class: 'ot-cover' }, h('div', { class: 'qz-big qz-spin' }, '⏳'), h('h2', null, 'Din flåde er klar'), h('p', { class: 'muted' }, `Venter på ${s.players[opp].name} …`), h('div', { class: 'row-actions' }, g.controls()));
          placing ||= B.FLEET.map((len) => ({ len, start: null, dir: 'h' }));
          const placedShips = placing.filter(p => p.start != null).map(p => B.shipCells(p.start, p.len, p.dir));
          const cur = placing[pick];
          const pv = cur && hover != null ? B.shipCells(hover, cur.len, dir) : null;
          const others = placing.filter((p, k) => k !== pick && p.start != null).map(p => B.shipCells(p.start, p.len, p.dir));
          const pvOk = pv && touchOk([...others, pv]);
          const allDone = placing.every(p => p.start != null);
          return h('div', { class: 'bs-wrap' },
            h('div', { class: 'stack' }, h('h3', { class: 'gr-h' }, 'Placér din flåde'),
              grid('place', null, { ships: placedShips, preview: pv || [], bad: pv && !pvOk,
                onCell: (i) => { const cells = B.shipCells(i, cur.len, dir); if (!cells || !touchOk([...others, cells])) return toast('Skibet kan ikke ligge der', { type: 'warn', text: 'Skibe må ikke røre hinanden.' }); cur.start = i; cur.dir = dir; const nxt = placing.findIndex(p => p.start == null); pick = nxt >= 0 ? nxt : pick; g.redraw(); } })),
            h('div', { class: 'dm-side' },
              h('div', { class: 'bs-ships' }, placing.map((p, k) => h('button', { class: ['bs-shipbtn', k === pick && 'is-on', p.start != null && 'is-placed'], onclick: () => { pick = k; g.redraw(); } }, h('span', { class: 'bs-bar' }, Array.from({ length: p.len }, () => h('i'))), B.SHIP_NAMES[p.len]))),
              h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
                h('button', { class: 'btn btn-sm', onclick: () => { dir = dir === 'h' ? 'v' : 'h'; g.redraw(); } }, icon('refresh'), dir === 'h' ? 'Vandret' : 'Lodret'),
                h('button', { class: 'btn btn-sm', onclick: () => { placing = B.randomFleet().map(p => ({ ...p })); g.redraw(); } }, icon('cube'), 'Tilfældigt'),
                h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { placing = null; pick = 0; g.redraw(); } }, 'Ryd')),
              h('button', { class: 'btn btn-primary btn-lg', disabled: !allDone, onclick: () => { const code = B.encode(placing); placing = null; pick = 0; revealed = null; ctl.actAs(me, 'place', [code]); } }, icon('check'), 'Klar'),
              h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Vælg et skib, og klik hvor det skal ligge. Skibe må ikke røre hinanden – heller ikke på hjørnerne.'),
              h('div', { class: 'row-actions' }, g.controls())));
        }
        // ── firing ──
        const myTurn = s.phase === 'play' && s.turn === me && ctl.canAct(me);
        const last = s.last;
        const status = s.phase === 'over' ? (s.winner === me ? 'Du vandt! Hele flåden er sænket 🎉' : `${s.players[s.winner].name} vandt!`)
          : myTurn ? (last?.seat === me && last.hit ? (last.sunk ? 'Sænket! Skyd igen' : 'Ramt! Skyd igen') : 'Din tur – skyd') : `${s.players[s.turn].name} sigter …`;
        return h('div', { class: 'bs-wrap bs-play' },
          h('div', { class: 'stack' }, h('h3', { class: 'gr-h' }, `${s.players[opp].name}s farvand`, h('span', { class: 'faint' }, ` · ${B.sunkCount(s, opp)}/5 sænket`)),
            grid('enemy', B.seaView(s, opp), { ships: s.phase === 'over' ? s.fleets[opp] : [], onCell: myTurn ? (i) => { if (B.seaView(s, opp)[i]) return; if (!ctl.online) revealed = null; ctl.actAs(me, 'fire', [i]); } : null })),
          h('div', { class: 'stack' }, h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', myTurn && 'is-mine'] }, status),
            h('h3', { class: 'gr-h' }, 'Din flåde', h('span', { class: 'faint' }, ` · ${5 - B.sunkCount(s, me)} skibe tilbage`)),
            grid('own', B.seaView(s, me), { ships: s.fleets[me] || [] }),
            h('div', { class: 'row-actions' }, g.controls()),
            s.log?.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 5).map(l => h('li', null, l))) : null));
      },
    });
    function touchOk(ships) {
      const taken = new Set();
      for (const sh of ships) {
        for (const c of sh) { const r = Math.floor(c / 10), cc = c % 10; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, c2 = cc + dc; if (rr >= 0 && rr <= 9 && c2 >= 0 && c2 <= 9 && taken.has(rr * 10 + c2)) return false; } }
        sh.forEach(c => taken.add(c));
      }
      return true;
    }
    function rules() {
      return panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Placér fem skibe: hangarskib (5), slagskib (4), to krydsere (3) og en ubåd (2). De må ikke røre hinanden.'),
        h('li', null, 'Skyd på et felt i modstanderens farvand. Rammer du, må du skyde igen.'),
        h('li', null, 'Den, der først sænker hele den andens flåde, vinder.')));
    }
    return h('div', { class: 'page dm-page bs-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Sænke slagskibe', lead: 'Placér din flåde i hemmelighed og find modstanderens skibe. Mod computeren, to ved samme skærm eller online.', compact: true }), g.el);
  },
};
