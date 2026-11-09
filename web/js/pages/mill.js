/** Mølle – three in a row along a line takes a piece. */
import { boardGamePage, h } from './boardgames2.js';
import * as M from '../features/mill.js';

let sel = null;
const LINES = '<svg class="ml-lines" viewBox="0 0 6 6" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".06"><rect x="0" y="0" width="6" height="6"/><rect x="1" y="1" width="4" height="4"/><rect x="2" y="2" width="2" height="2"/><path d="M3 0V2M3 4V6M0 3H2M4 3H6"/></g></svg>';
function linesSvg() { const d = document.createElement('div'); d.className = 'ml-svgwrap'; d.innerHTML = LINES; return d; }
export default boardGamePage({
  id: 'mill', title: 'Mølle', mod: M, level: true, aiDelay: 700,
  lead: 'Det klassiske strategispil: placér dine ni brikker, flyt dem langs stregerne og lav møller for at tage modstanderens. Mod computeren, ved samme skærm eller online.',
  scoreOf: (s, i) => (s.hand[i] ? `${s.hand[i]} at placere · ${M.pieces(s.board, i)} på brættet` : `${M.pieces(s.board, i)} brikker`),
  yourTurn: (s) => (s.remove ? 'Mølle! Tag en af modstanderens brikker' : s.hand[s.turn] ? 'Placér en brik' : M.pieces(s.board, s.turn) === 3 ? 'Du må hoppe hvorhen du vil' : 'Flyt en brik langs en streg'),
  rules: ['Først placerer I skiftevis jeres ni brikker på de tomme punkter.', 'Derefter flytter I en brik ad gangen langs en streg til et tomt nabopunkt.', 'Tre på stribe langs en streg er en mølle: så tager du en af modstanderens brikker (helst ikke én i en mølle).', 'Har man kun tre brikker, må man hoppe. Har man to – eller kan man ikke flytte – har man tabt.'],
  renderBoard(ctl, g, s, my) {
    const op = my ? M.options(s, s.turn) : {};
    const can = new Set(op.place || op.remove || (op.move || []).map(([f]) => f));
    const dests = new Set(sel != null ? (op.move || []).filter(([f]) => f === sel).map(([, t]) => t) : []);
    if (sel != null && !(op.move || []).some(([f]) => f === sel)) sel = null;
    const pos = (p) => ({ left: `${7 + (M.XY[p][1] / 6) * 86}%`, top: `${7 + (M.XY[p][0] / 6) * 86}%` });
    const click = (p) => {
      if (op.remove) return ctl.act('remove', [p]);
      if (op.place) return ctl.act('place', [p]);
      if (dests.has(p)) { const f = sel; sel = null; return ctl.act('move', [f, p]); }
      sel = can.has(p) && sel !== p ? p : null; g.redraw();
    };
    return h('div', { class: 'ml-board' },
      linesSvg(),
      M.XY.map((_, p) => h('button', { class: ['ml-pt', s.board[p] >= 0 && `p${s.board[p]}`, can.has(p) && (op.remove ? 'can-take' : 'can'), sel === p && 'is-sel', dests.has(p) && 'is-dest', (s.last?.to === p) && 'is-last', M.inMill(s.board, p) && 'in-mill'],
        style: pos(p), disabled: !(can.has(p) || dests.has(p)), 'aria-label': `Punkt ${p + 1}${s.board[p] >= 0 ? `, ${s.players[s.board[p]].name}` : ''}`, onclick: () => click(p) })));
  },
});
