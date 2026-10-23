/**
 * Four classic two-player games on the shared engine (hostedgame.js): Kalaha, Vend, Prikker og streger and Mølle.
 * Each page module below exports the same shape; the registry imports them through small wrapper files.
 */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';

const LEVELS = [['1', 'Let'], ['2', 'Middel'], ['3', 'Svær']];
const side = (ctl, g, extra = []) => [h('div', { class: 'row-actions' }, g.controls()), ...extra];
const status = (ctl, s, my, txt) => (s.phase === 'over' ? (s.winner == null ? 'Uafgjort!' : `${s.players[s.winner].name} vandt! 🎉`) : my ? txt : `${s.players[s.turn].name} tænker …`);

/** make a page: def = { id, title, lead, mod (logic), level?, renderBoard(ctl, g, s, my), sideInfo?(s), rules: [..] } */
export function boardGamePage(def) {
  return {
    title: def.title,
    destroy() { this._g?.destroy(); },
    async render() {
      const app = appById(def.id);
      let store;
      try { store = await appState(def.id, { game: null, setup: null, level: 2, wins: 0, played: 0, size: def.sizes?.[1]?.[0] }); } catch (e) { return loadError(def.title, e); }
      const st = store.data;
      const g = this._g = hostedGame({
        page: def.id, game: def.id, title: def.title, store, minPlayers: 2, maxPlayers: 2,
        newGame: (seats) => Object.assign(def.mod.newGame(seats, ...(def.newArgs ? def.newArgs(st) : [])), { level: st.level }),
        apply: def.mod.apply, aiMove: def.mod.aiMove, aiDelay: () => def.aiDelay || 650,
        setupExtra: () => h('div', { class: 'stack', style: { gap: '8px', marginBottom: '10px' } },
          def.mod.bestMove || def.level ? h('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, h('span', { class: 'field-label' }, 'Computerens niveau'), segmented(LEVELS.map(([v, l]) => ({ value: v, label: l })), String(st.level), (v) => { st.level = Number(v); store.save(); }, { label: 'Niveau' })) : null,
          def.sizes ? h('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, h('span', { class: 'field-label' }, def.sizeLabel || 'Størrelse'), segmented(def.sizes.map(([v, l]) => ({ value: String(v), label: l })), String(st.size), (v) => { st.size = Number(v); store.save(); }, { label: def.sizeLabel || 'Størrelse' })) : null),
        onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (s.winner != null && !s.players[s.winner].ai && s.players.some(p => p.ai)) st.wins++; } },
        rules: () => panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' }, def.rules.map(r => h('li', null, r)))),
        render(ctl) {
          const s = ctl.s, my = ctl.canAct(s.turn) && s.phase === 'play';
          return h('div', { class: 'dm-wrap' },
            h('div', { class: 'dm-side' },
              s.players.map((p, i) => h('div', { class: ['dm-player', s.turn === i && s.phase === 'play' && 'is-turn'] }, h('span', { class: `bg-chip bg-${def.id} p${i}` }), h('b', null, p.name), h('span', { class: 'faint' }, def.scoreOf ? def.scoreOf(s, i) : ''))),
              h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', my && 'is-mine'] }, status(ctl, s, my, def.yourTurn ? def.yourTurn(s) : 'Din tur')),
              ...side(ctl, g),
              s.log?.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 5).map(l => h('li', null, l))) : null,
              !ctl.online ? h('p', { class: 'faint', style: { fontSize: '13px' } }, `Du har vundet ${st.wins} af ${st.played} spil.`) : null),
            def.renderBoard(ctl, g, s, my));
        },
      });
      return h('div', { class: `page dm-page bg-page bg-${def.id}-page`, style: { '--app': app.hue } },
        appHero(app, { eyebrow: 'Brætspil og kort', title: def.title, lead: def.lead, compact: true }), g.el);
    },
  };
}
export { h, icon };
