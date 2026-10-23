/** Prikker og streger – draw lines, close boxes. */
import { boardGamePage, h } from './boardgames2.js';
import * as P from '../features/dots.js';

export default boardGamePage({
  id: 'dots', title: 'Prikker og streger', mod: P, level: true,
  lead: 'Tegn streger mellem prikkerne. Lukker du en firkant, er den din – og du må tegne igen. Mod computeren, ved samme skærm eller online.',
  sizes: [[3, '3×3'], [4, '4×4'], [5, '5×5'], [6, '6×6']], sizeLabel: 'Bræt', newArgs: (st) => [st.size || 4, st.size || 4],
  scoreOf: (s, i) => `${P.score(s)[i]} firkanter`,
  yourTurn: () => 'Din tur – tegn en streg',
  rules: ['Skiftes til at tegne en streg mellem to prikker ved siden af hinanden.', 'Tegner du den fjerde side i en firkant, får du firkanten – og en tur mere.', 'Når alle streger er tegnet, vinder den med flest firkanter.', 'Pas på med at tegne den tredje side – så kan den anden tage firkanten!'],
  renderBoard(ctl, g, s, my) {
    const { n, m } = s, cells = [];
    for (let r = 0; r <= 2 * n; r++) for (let c = 0; c <= 2 * m; c++) {
      if (r % 2 === 0 && c % 2 === 0) cells.push(h('span', { class: 'dt-dot' }));
      else if (r % 2 === 0) { const l = P.H(s, r / 2, (c - 1) / 2); cells.push(line(l, 'h')); }
      else if (c % 2 === 0) { const l = P.V(s, (r - 1) / 2, c / 2); cells.push(line(l, 'v')); }
      else { const b = ((r - 1) / 2) * m + (c - 1) / 2, o = s.boxes[b]; cells.push(h('span', { class: ['dt-box', o >= 0 && `p${o}`] }, o >= 0 ? s.players[o].name.slice(0, 1).toUpperCase() : '')); }
    }
    function line(l, d) { const o = s.lines[l]; return h('button', { class: ['dt-line', d, o >= 0 && `p${o}`, s.last?.line === l && 'is-last'], disabled: !my || o >= 0, 'aria-label': `Streg ${l + 1}`, onclick: () => ctl.act('line', [l]) }); }
    return h('div', { class: 'dt-board', style: { gridTemplateColumns: Array.from({ length: 2 * m + 1 }, (_, i) => (i % 2 ? '1fr' : '14px')).join(' '), gridTemplateRows: Array.from({ length: 2 * n + 1 }, (_, i) => (i % 2 ? '1fr' : '14px')).join(' '), aspectRatio: `${m} / ${n}` } }, cells);
  },
});
