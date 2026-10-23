/**
 * Tidslinjen – put history in order. You get an event and place it on your timeline: before, between or after
 * the ones you have. Three mistakes and the game is over. How long can your timeline get?
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { EVENTS, yearText, fits } from '../data/timeline.js';

export default {
  title: 'Tidslinjen',
  async render() {
    const app = appById('timeline');
    let store;
    try { store = await appState('timeline', { best: 0, played: 0 }); } catch (e) { return loadError('Tidslinjen', e); }
    const st = store.data;
    const root = h('div');

    function start() {
      const deck = EVENTS.slice().sort(() => Math.random() - 0.5);
      const line = [deck.pop()];
      let card = deck.pop(), lives = 3, placed = 0, flash = null;
      const draw = () => {
        const slot = (i) => h('button', { class: 'tl-slot', 'aria-label': i === 0 ? 'Placér før alle' : i === line.length ? 'Placér efter alle' : `Placér mellem ${line[i - 1][1]} og ${line[i][1]}`, onclick: () => place(i) }, icon('plus'));
        h(clear(root), null,
          h('div', { class: 'tl-top' }, h('span', null, '❤️'.repeat(lives) + '🤍'.repeat(3 - lives)), h('b', null, `${placed} placeret`), h('span', { class: 'faint' }, `Rekord: ${st.best}`)),
          card ? h('div', { class: 'tl-card tl-new' }, h('small', null, 'Hvornår skete det?'), h('b', null, card[1])) : null,
          flash ? h('div', { class: ['tl-flash', flash.ok ? 'ok' : 'bad'] }, flash.ok ? `Rigtigt! ${yearText(flash.e[0], flash.e[2])}` : `Forkert – det var ${yearText(flash.e[0], flash.e[2])}`) : null,
          h('div', { class: 'tl-line' }, slot(0), line.map((e, i) => [h('div', { class: ['tl-card', flash?.e === e && (flash.ok ? 'is-new-ok' : 'is-new-bad')] }, h('span', { class: 'tl-year' }, yearText(e[0], e[2])), h('span', null, e[1])), slot(i + 1)])));
      };
      const place = (i) => {
        const ok = fits(line, card[0], i);
        const e = card;
        if (ok) { line.splice(i, 0, card); placed++; }
        else { lives--; const k = line.findIndex(x => x[0] > card[0]); line.splice(k < 0 ? line.length : k, 0, card); }
        flash = { ok, e };
        card = deck.pop();
        if (!lives || !card) return over();
        draw();
      };
      const over = () => {
        st.played++; const best = placed > st.best; if (best) st.best = placed; store.save();
        h(clear(root), null, panel(null, null, h('div', { class: 'pub-done' }, h('div', { class: 'qz-big' }, best ? '🏆' : '📜'), h('h2', null, `${placed} begivenheder i rigtig rækkefølge`), best ? h('p', null, 'Ny rekord!') : h('p', { class: 'muted' }, `Din rekord er ${st.best}.`),
          h('button', { class: 'btn btn-primary', onclick: start }, icon('refresh'), 'Spil igen'))),
          panel('Din tidslinje', 'clock', h('div', { class: 'tl-line tl-done' }, line.map(e => h('div', { class: 'tl-card' }, h('span', { class: 'tl-year' }, yearText(e[0], e[2])), h('span', null, e[1]))))));
      };
      draw();
    }
    h(root, null, panel(null, null, h('div', { class: 'pub-done' }, h('div', { class: 'qz-big' }, '📜'), h('h2', null, 'Sæt historien i rækkefølge'),
      h('p', { class: 'muted' }, 'Du får en begivenhed ad gangen. Placér den på din tidslinje – før, mellem eller efter dem, du har. Tre fejl, og spillet er slut.'),
      h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('play'), 'Start'), st.best ? h('p', { class: 'faint' }, `Din rekord: ${st.best}`) : null)));
    return h('div', { class: 'page tl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Skole', title: 'Tidslinjen', lead: 'Hvad kom først – trykpressen eller Columbus? Placér begivenheder fra historien, videnskaben og Danmark i den rigtige rækkefølge.', compact: true }), root);
  },
};
