/** Vend – enclose and turn the other's pieces. */
import { boardGamePage, h } from './boardgames2.js';
import * as R from '../features/reversi.js';

export default boardGamePage({
  id: 'reversi', title: 'Vend', mod: R,
  lead: 'Læg dine brikker, så de omringer modstanderens – så vender de og bliver dine. Mod computeren, ved samme skærm eller online.',
  scoreOf: (s, i) => `${R.count(s.board)[i]} brikker`,
  yourTurn: () => 'Din tur – læg hvor prikken er',
  rules: ['Læg en brik, så en eller flere af modstanderens brikker ligger på række mellem den og en af dine egne.', 'Alle de omringede brikker vendes – i alle otte retninger.', 'Kan du ikke lægge nogen steder, står du over.', 'Når ingen kan lægge mere, vinder den med flest brikker.'],
  renderBoard(ctl, g, s, my) {
    const legal = new Set(my ? R.legal(s.board, s.turn) : []), flipped = new Set(s.last?.flipped || []);
    return h('div', { class: 'rv-board' }, s.board.map((v, i) => h('button', { class: ['rv-cell', legal.has(i) && 'can', s.last?.cell === i && 'is-last'], disabled: !legal.has(i), 'aria-label': `Felt ${'abcdefgh'[i % 8]}${Math.floor(i / 8) + 1}${v ? (v === 1 ? ', sort' : ', hvid') : ''}`, onclick: () => ctl.act('place', [i]) },
      v ? h('span', { class: ['rv-disc', v === 1 ? 'b' : 'w', flipped.has(i) && 'flip'] }) : legal.has(i) ? h('span', { class: 'rv-hint' }) : null)));
  },
});
