/** Meyer – the Danish bluffing dice game. Against computers or online with friends. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import * as M from '../features/meyer.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n) => h('span', { class: 'ld-die my-die' }, Array.from({ length: 9 }, (_, i) => h('i', { class: n && PIPS[n].includes(i) ? 'on' : '' })));

export default {
  title: 'Meyer',
  destroy() { this._g?.destroy(); },
  async render() {
    const app = appById('meyer');
    let store;
    try { store = await appState('meyer', { game: null, setup: { players: [{ name: 'Dig', ai: false }, { name: 'Gnist', ai: true }, { name: 'Gnist 2', ai: true }] }, wins: 0, played: 0 }); } catch (e) { return loadError('Meyer', e); }
    const st = store.data;
    const g = this._g = hostedGame({
      page: 'meyer', game: 'meyer', title: 'Meyer', store, minPlayers: 2, maxPlayers: 6,
      onlineText: 'Invitér op til 5 af dem, der har HUBTECH. Kun den, der slår, kan se terningerne.',
      newGame: (seats) => M.newGame(seats), apply: M.apply, aiMove: M.aiMove, aiDelay: (s, seat, mv) => (mv.name === 'roll' ? 700 : 1300),
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (!s.players[s.winner].ai) st.wins++; } },
      rules: () => panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Slå med to terninger i hemmelighed, og sig hvad du har – eller noget højere. Det skal altid være højere end det, der blev sagt før.'),
        h('li', null, 'Den næste tror på dig og slår selv – eller løfter bægeret. Har du løjet, mister du et liv. Talte du sandt, mister den, der løftede.'),
        h('li', null, 'Rækkefølgen: Meyer (21), lille Meyer (31), par 66 til 11, og derefter 65, 64 … ned til 32. Meyer koster to liv.'),
        h('li', null, 'Den sidste med liv tilbage vinder.'))),
      render(ctl) {
        const s = ctl.s, my = ctl.canAct(s.turn) && s.phase !== 'over', seeDice = ctl.isMe(s.turn) || (!ctl.online && !s.players[s.turn].ai);
        const r = s.reveal && Date.now() - s.reveal.at < 4000 ? s.reveal : null;
        if (r) setTimeout(() => g.redraw(), 4050 - (Date.now() - r.at));
        const opts = my && s.phase === 'announce' ? M.canSay(s) : [];
        const status = s.phase === 'over' ? `${s.players[s.winner].name} vandt! 🎉` : my ? (s.phase === 'roll' ? (s.said ? `Du skal slå højere end ${M.NAME(s.said)}` : 'Din tur – slå med terningerne') : s.phase === 'announce' ? 'Hvad siger du?' : `${s.players[s.by]?.name} siger ${M.NAME(s.said)}. Tror du på det?`) : `${s.players[s.turn].name} ${s.phase === 'respond' ? 'tænker …' : s.phase === 'announce' ? 'kigger på terningerne …' : 'slår …'}`;
        return h('div', { class: 'my-wrap' },
          h('div', { class: 'my-players' }, s.players.map((p, i) => h('div', { class: ['dm-player', s.turn === i && s.phase !== 'over' && 'is-turn', !s.lives[i] && 'is-out'] }, h('b', null, p.name), h('span', { class: 'my-lives' }, '❤️'.repeat(s.lives[i]) || 'ude')))),
          h('div', { class: 'my-table' },
            r ? h('div', { class: ['my-reveal', r.lied ? 'bad' : 'ok'] }, h('div', { class: 'my-dice' }, r.dice.map(die)), h('b', null, r.lied ? `Snyd! ${s.players[r.by].name} havde kun ${M.NAME(r.roll)}` : `Sandt! ${s.players[r.by].name} havde ${M.NAME(r.roll)}`))
              : h('div', { class: 'my-cup' }, s.dice && seeDice && s.phase === 'announce' ? h('div', { class: 'my-dice' }, s.dice.map(die), h('span', null, `Du har ${M.NAME(s.roll)}`)) : h('span', { class: 'my-cupicon' }, '🎲'),
                s.said ? h('div', { class: 'my-said' }, h('small', null, 'Sidst sagt'), h('b', null, M.NAME(s.said))) : null)),
          h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', my && 'is-mine'] }, status),
          my && s.phase === 'roll' ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => ctl.act('roll') }, icon('cube'), 'Slå') : null,
          my && s.phase === 'respond' ? h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, h('button', { class: 'btn btn-primary btn-lg', onclick: () => ctl.act('believe') }, 'Tror på det – slå'), h('button', { class: 'btn btn-lg', onclick: () => ctl.act('lift') }, 'Løft bægeret!')) : null,
          opts.length ? h('div', { class: 'my-say' }, opts.slice().reverse().map(v => h('button', { class: ['my-val', v === s.roll && 'truth'], onclick: () => ctl.act('announce', [v]) }, M.NAME(v)))) : null,
          h('div', { class: 'row-actions' }, g.controls()),
          s.log?.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 5).map(l => h('li', null, l))) : null);
      },
    });
    return h('div', { class: 'page dm-page my-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Meyer', lead: 'Det klassiske danske terningespil med bluff: sig hvad du har slået – eller lyv dig højere op. Tør de andre løfte bægeret?', compact: true }), g.el);
  },
};
