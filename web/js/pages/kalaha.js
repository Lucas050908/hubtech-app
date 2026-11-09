/** Kalaha – sow the stones and fill your store. */
import { boardGamePage, h } from './boardgames2.js';
import * as K from '../features/kalaha.js';

export default boardGamePage({
  id: 'kalaha', title: 'Kalaha', mod: K,
  lead: 'Det gamle stenspil: så stenene rundt, fang modstanderens og fyld din kalaha. Mod computeren, ved samme skærm eller online.',
  sizes: [[3, '3 sten'], [4, '4 sten'], [6, '6 sten']], sizeLabel: 'Sten pr. hul', newArgs: (st) => [st.size || 4],
  scoreOf: (s, i) => `${s.board[K.STORE[i]]} i kalahaen`,
  yourTurn: () => 'Din tur – vælg et af dine huller',
  rules: ['Vælg et af dine huller. Stenene sås én ad gangen mod uret – også i din egen kalaha, men ikke i modstanderens.',
    'Lander den sidste sten i din kalaha, får du en tur mere.',
    'Lander den sidste sten i et tomt hul på din side, fanger du den og stenene overfor.',
    'Når den ene side er tom, er spillet slut. Flest sten vinder.'],
  renderBoard(ctl, g, s, my) {
    const me = ctl.online ? Math.max(0, ctl.mySeat) : (s.players[0].ai && !s.players[1].ai ? 1 : 0);
    const legal = my ? K.legal(s.board, s.turn) : [];
    const path = new Set(s.last?.path || []);
    const pit = (i) => h('button', { class: ['kl-pit', legal.includes(i) && 'can', path.has(i) && 'is-hit', s.last?.pit === i && 'is-from'], disabled: !legal.includes(i), 'aria-label': `Hul med ${s.board[i]} sten`, onclick: () => ctl.act('sow', [i]) },
      h('span', { class: 'kl-stones' }, Array.from({ length: Math.min(s.board[i], 18) }, (_, k) => h('i', { style: { '--k': k } }))), h('b', null, String(s.board[i])));
    const top = K.pitsOf(1 - me).slice().reverse(), bottom = K.pitsOf(me);
    return h('div', { class: 'kl-board' },
      h('div', { class: 'kl-store' }, h('b', null, String(s.board[K.STORE[1 - me]])), h('small', null, s.players[1 - me].name)),
      h('div', { class: 'kl-rows' }, h('div', { class: 'kl-row' }, top.map(pit)), h('div', { class: 'kl-row' }, bottom.map(pit))),
      h('div', { class: 'kl-store mine' }, h('b', null, String(s.board[K.STORE[me]])), h('small', null, s.players[me].name)));
  },
});
