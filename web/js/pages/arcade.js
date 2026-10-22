/**
 * Spilhal – the overview: invitations and games going on, Dagens sudoku, the top of the leaderboards and every game.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { onLive } from '../core/live.js';
import { appById, SUITES } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel } from '../features/appkit.js';
import { appCard } from '../features/widgets.js';
import { roomApi, person, me, boardTable } from '../features/gameroom.js';
import { todayISO } from '../features/gamelogic.js';

const APP = { connect4: 'connect4', ttt: 'tictactoe', typing: 'typerace', draw: 'drawguess', property: 'property' };
const NAME = { connect4: 'Fire på stribe', ttt: 'Kryds og bolle', typing: 'Fart-tast', draw: 'Tegn og gæt', property: 'Ejendomskongen' };
const fmtSecs = (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;

export default {
  title: 'Spilhal',
  destroy() { this._off?.(); },
  async render() {
    const app = appById('arcade');
    const online = h('div', { class: 'stack' });
    const tops = h('div', { class: 'lb-grid' });
    const daily = h('div');

    async function drawOnline() {
      let mine = [], live = [];
      try { [mine, live] = await Promise.all([roomApi.mine(), roomApi.live()]); } catch { /* */ }
      clear(online);
      const invites = mine.filter(r => r.invited.some(p => p.id === me()));
      const going = mine.filter(r => r.players.some(p => p.id === me()) && r.status !== 'done');
      const row = (r, label, btn) => h('div', { class: 'gr-game' },
        h('span', { class: 'chip chip-app' }, NAME[r.game] || r.game),
        h('div', { class: 'gr-game-who' }, [...r.players, ...r.invited].filter(p => p.id !== me()).slice(0, 3).map(p => person(p))),
        label ? h('span', { class: 'faint', style: { fontSize: '13px' } }, label) : null,
        h('a', { class: 'btn btn-sm btn-primary', href: `#/apps/${APP[r.game]}/online/${r.id}` }, btn));
      if (invites.length) online.append(h('h3', { class: 'gr-h' }, 'Invitationer til dig'), ...invites.map(r => row(r, null, 'Spil med')));
      if (going.length) online.append(h('h3', { class: 'gr-h' }, 'Dine spil'), ...going.map(r => row(r, r.status === 'playing' ? 'I gang' : 'Venter', 'Åbn')));
      if (live.length) online.append(h('h3', { class: 'gr-h' }, 'Andre spiller lige nu'), ...live.slice(0, 5).map(r => row(r, r.watchers ? `${r.watchers} ser med` : null, 'Se med')));
      online.append(h('div', { class: 'ac-start' }, Object.entries(NAME).map(([g, n]) => h('a', { class: 'btn', href: `#/apps/${APP[g]}/online` }, icon({ connect4: 'apps', ttt: 'x', typing: 'timer', draw: 'paint', property: 'home' }[g]), n))));
      if (!invites.length && !going.length && !live.length) online.prepend(h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen spil i gang lige nu. Start et og invitér en ven:'));
    }
    async function drawTops() {
      try {
        const { boards } = await api.get('/api/games/boards');
        clear(tops);
        const pick = boards.filter(b => b.rows.length && !b.game.startsWith('daily-')).slice(0, 6);
        if (!pick.length) tops.append(h('p', { class: 'faint' }, 'Ingen på toplisterne endnu – vær den første!'));
        for (const b of pick) {
          const top3 = { ...b, rows: b.rows.filter(r => r.place <= 3 || r.me) };
          tops.append(panel(b.label, 'trophy', boardTable(top3, { unit: b.game === 'typing' ? 'ord/min' : b.higher ? '' : '', fmt: b.higher ? (v) => v.toLocaleString('da-DK') : fmtSecs })));
        }
        const today = boards.find(b => b.game === `daily-sudoku-${todayISO()}`);
        const mineRow = today?.rows.find(r => r.me);
        h(clear(daily), null, h('div', { class: 'ac-daily' }, h('span', { class: 'ac-daily-ic' }, icon('calendar')),
          h('div', null, h('b', null, 'Dagens sudoku'), h('span', { class: 'faint' }, mineRow ? `Du er nr. ${mineRow.place} af ${today.players} i dag (${fmtSecs(mineRow.score)})` : today?.players ? `${today.players} har løst den i dag – kan du slå dem?` : 'Samme opgave for alle i dag. Bliv den første på listen!')),
          h('a', { class: 'btn btn-primary', href: '#/apps/sudoku' }, mineRow ? 'Se listen' : 'Spil nu', icon('arrowRight'))));
      } catch { /* */ }
    }
    this._off = onLive('game', () => { if (document.body.contains(online)) drawOnline(); else this._off?.(); });
    drawOnline(); drawTops();
    const solo = SUITES.find(s => s.id === 'games').members.filter(id => id !== 'arcade').map(appById).filter(Boolean);
    const together = SUITES.find(s => s.id === 'boards').members.map(appById).filter(Boolean);
    return h('div', { class: 'page gm-page ac-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Spilhal', lead: 'Alle spillene ét sted: spil alene, udfordr en ven, og se hvem der fører på toplisterne.' }),
      daily,
      panel('Spil med andre', 'users', online),
      panel('Toplister', 'trophy', tops, h('a', { class: 'btn btn-sm', href: '#/apps/typerace/top', style: { marginTop: '12px' } }, 'Alle toplister', icon('arrowRight'))),
      panel('Spil alene', 'gamepad', h('div', { class: 'ac-grid' }, solo.map(a => appCard(a, { compact: true })))),
      panel('Brætspil og kort', 'layers', h('div', { class: 'ac-grid' }, together.map(a => appCard(a, { compact: true })))));
  },
};
