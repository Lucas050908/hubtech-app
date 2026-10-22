/**
 * Kasino – Blackjack, roulette and a slot machine, played with points only. Never real money, nothing to buy.
 * Run out of points? A new pile of free points every hour. The highest pile you have had goes on the leaderboard.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore } from '../features/gameroom.js';
import { deck, cardEl, bjValue } from '../features/cards.js';

const START = 1000, REFILL = 500, REFILL_MS = 3600e3;
const CHIPS = [10, 25, 50, 100, 250];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SLOT = [['🍒', 30, 5], ['🍋', 25, 8], ['🔔', 18, 12], ['⭐', 12, 20], ['💎', 8, 40], ['7️⃣', 5, 100]];   // symbol, weight, pays (× bet) for three of a kind
const fmt = (n) => n.toLocaleString('da-DK');

export default {
  title: 'Kasino',
  destroy() { this._stop?.(); },
  async render(ctx) {
    const app = appById('casino');
    let store;
    try { store = await appState('casino', { chips: START, peak: START, refillAt: 0, stats: { won: 0, lost: 0 } }); } catch (e) { return loadError('Kasino', e); }
    const st = store.data, self = this;
    const timers = [];
    this._stop = () => timers.forEach(clearTimeout);
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const chipsEl = h('b', null, fmt(st.chips));
    const body = h('div');
    let bet = 25;

    function change(delta) {
      st.chips = Math.max(0, st.chips + delta);
      if (delta > 0) st.stats.won += delta; else st.stats.lost -= delta;
      if (st.chips > (st.peak || 0)) { st.peak = st.chips; if (st.peak >= 2000) submitScore('casino', st.peak); }
      chipsEl.textContent = fmt(st.chips);
      chipsEl.classList.remove('is-up', 'is-down'); void chipsEl.offsetWidth; chipsEl.classList.add(delta >= 0 ? 'is-up' : 'is-down');
      store.save(); drawRefill();
    }
    const refillBox = h('div', { class: 'cs-refill' });
    function drawRefill() {
      clear(refillBox);
      if (st.chips >= 10) return;
      const wait = (st.refillAt || 0) - Date.now();
      if (wait > 0) refillBox.append(h('span', { class: 'faint' }, `Ingen point tilbage. Nye gratis point om ${Math.ceil(wait / 60000)} min.`));
      else refillBox.append(h('button', { class: 'btn btn-primary btn-sm', onclick: () => { st.refillAt = Date.now() + REFILL_MS; change(REFILL); toast(`${REFILL} gratis point`, { type: 'ok' }); } }, icon('plus'), `Få ${REFILL} gratis point`));
    }
    const can = (amount) => { if (amount > st.chips) { toast('Ikke nok point', { type: 'warn' }); return false; } return true; };
    const betPicker = (onPick) => h('div', { class: 'cs-chips', role: 'radiogroup', 'aria-label': 'Indsats' }, CHIPS.map(v => {
      const b = h('button', { class: ['cs-chip', `v${v}`, v === bet && 'is-on'], role: 'radio', 'aria-checked': String(v === bet), onclick: () => { bet = v; b.parentNode.querySelectorAll('.cs-chip').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); }); onPick?.(v); } }, String(v));
      return b;
    }));

    // ── Blackjack ──
    function blackjack() {
      let shoe = deck(6), player = [], dealer = [], stake = 0, phase = 'bet', msg = '';
      const table = h('div', { class: 'cs-table' });
      const draw1 = () => { if (shoe.length < 60) shoe = deck(6); return shoe.pop(); };
      const hand = (cards, hideSecond) => h('div', { class: 'cs-hand' }, cards.map((c, i) => cardEl(c, { up: !(hideSecond && i === 1), cls: 'is-in' })));
      function deal() {
        if (!can(bet)) return;
        stake = bet; change(-stake);
        player = [draw1(), draw1()]; dealer = [draw1(), draw1()]; phase = 'play'; msg = '';
        if (bjValue(player).total === 21) return settle();
        drawT();
      }
      function hit() { player.push(draw1()); if (bjValue(player).total > 21) return settle(); drawT(); }
      function dbl() { if (!can(stake)) return; change(-stake); stake *= 2; player.push(draw1()); settle(); }
      function settle() {
        phase = 'done';
        const p = bjValue(player).total, pBJ = p === 21 && player.length === 2;
        const dealerPlays = p <= 21 && !pBJ;
        const finish = () => {
          const d = bjValue(dealer).total, dBJ = d === 21 && dealer.length === 2;
          let win = 0;
          if (p > 21) msg = `Over 21 – du taber ${fmt(stake)}`;
          else if (pBJ && !dBJ) { win = Math.floor(stake * 2.5); msg = `Blackjack! Du vinder ${fmt(win - stake)}`; }
          else if (dBJ && !pBJ) msg = 'Dealeren har blackjack';
          else if (d > 21 || p > d) { win = stake * 2; msg = `Du vinder ${fmt(stake)}!`; }
          else if (p === d) { win = stake; msg = 'Uafgjort – du får indsatsen tilbage'; }
          else msg = `Dealeren vinder med ${d}`;
          if (win) change(win);
          drawT();
        };
        if (!dealerPlays) return finish();
        const step = () => { const v = bjValue(dealer); if (v.total < 17) { dealer.push(draw1()); drawT(); later(step, 550); } else finish(); };
        drawT(); later(step, 550);
      }
      function drawT() {
        const pv = bjValue(player), dv = bjValue(phase === 'play' ? dealer.slice(0, 1) : dealer);
        h(clear(table), null,
          phase === 'bet' && !player.length ? h('p', { class: 'cs-msg' }, 'Vælg din indsats, og tryk Giv kort. Kom tættest på 21 uden at gå over.') : [
            h('div', { class: 'cs-side' }, h('span', { class: 'faint' }, `Dealer ${phase === 'play' ? dv.total : dv.total}`), hand(dealer, phase === 'play')),
            h('div', { class: 'cs-side' }, h('span', { class: 'faint' }, `Dig ${pv.total}${pv.soft && pv.total < 21 ? ' (blød)' : ''} · indsats ${fmt(stake)}`), hand(player)),
            msg ? h('p', { class: 'cs-msg' }, msg) : null],
          h('div', { class: 'cs-actions' },
            phase === 'play' ? [h('button', { class: 'btn btn-primary', onclick: hit }, 'Kort'), h('button', { class: 'btn', onclick: settle }, 'Stå'),
              player.length === 2 ? h('button', { class: 'btn', onclick: dbl }, 'Doble') : null]
              : [betPicker(), h('button', { class: 'btn btn-primary', onclick: deal }, icon('play'), `Giv kort (${bet})`)]));
      }
      drawT();
      return [panel('Blackjack', 'layers', table, h('p', { class: 'faint', style: { marginBottom: 0 } }, 'Dealeren står på 17. Blackjack betaler 3:2. Doble = dobbelt indsats og præcis ét kort mere.'))];
    }

    // ── Roulette ──
    function roulette() {
      const bets = new Map();     // key → amount
      let spinning = false, last = [];
      const board = h('div', { class: 'rl-board' });
      const result = h('div', { class: 'rl-result' });
      const total = () => [...bets.values()].reduce((a, b) => a + b, 0);
      const color = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');
      const OUTSIDE = [['1-18', '1–18'], ['even', 'Lige'], ['red', 'Rød'], ['black', 'Sort'], ['odd', 'Ulige'], ['19-36', '19–36'], ['d1', '1.–12.'], ['d2', '13.–24.'], ['d3', '25.–36.']];
      const wins = (key, n) => {
        if (/^\d+$/.test(key)) return Number(key) === n ? 36 : 0;
        if (n === 0) return 0;
        return ({ red: REDS.has(n), black: !REDS.has(n), even: n % 2 === 0, odd: n % 2 === 1, '1-18': n <= 18, '19-36': n >= 19, d1: n <= 12, d2: n > 12 && n <= 24, d3: n > 24 }[key] ? (key[0] === 'd' ? 3 : 2) : 0);
      };
      function place(key) {
        if (spinning) return;
        if (total() + bet > st.chips) return toast('Ikke nok point', { type: 'warn' });
        bets.set(key, (bets.get(key) || 0) + bet); drawB();
      }
      function spin() {
        if (!bets.size || spinning) return toast('Læg en indsats først', { type: 'info' });
        const stake = total(); if (!can(stake)) return;
        change(-stake); spinning = true;
        const n = WHEEL[Math.floor(Math.random() * WHEEL.length)];
        let i = 0; const ticks = 22;
        const roll = () => {
          const show = i < ticks ? WHEEL[Math.floor(Math.random() * WHEEL.length)] : n;
          h(clear(result), null, h('span', { class: ['rl-ball', color(show), i >= ticks && 'is-final'] }, String(show)));
          if (i++ < ticks) return later(roll, 40 + i * 9);
          let win = 0; for (const [k, a] of bets) win += a * wins(k, n);
          last = [n, ...last].slice(0, 12);
          if (win) change(win);
          result.append(h('span', { class: 'cs-msg' }, win ? `Du vinder ${fmt(win)}!` : `Ingen gevinst (${fmt(stake)} tabt)`));
          spinning = false; bets.clear(); drawB();
        };
        roll();
      }
      function drawB() {
        const chip = (k) => (bets.get(k) ? h('span', { class: 'rl-bet' }, String(bets.get(k))) : null);
        const cell = (k, label, cls) => h('button', { class: ['rl-cell', cls], onclick: () => place(k), disabled: spinning, 'aria-label': `Sats på ${label}` }, label, chip(k));
        h(clear(board), null,
          h('div', { class: 'rl-grid' }, cell('0', '0', 'green rl-zero'),
            Array.from({ length: 36 }, (_, i) => { const n = (2 - (i % 3)) + Math.floor(i / 3) * 3 + 1; return cell(String(n), String(n), color(n)); })),
          h('div', { class: 'rl-outside' }, OUTSIDE.map(([k, l]) => cell(k, l, k === 'red' ? 'red' : k === 'black' ? 'black' : ''))),
          h('div', { class: 'cs-actions' }, betPicker(), h('span', { class: 'faint' }, `Indsats i alt: ${fmt(total())}`),
            h('button', { class: 'btn btn-ghost', disabled: spinning || !bets.size, onclick: () => { bets.clear(); drawB(); } }, 'Ryd'),
            h('button', { class: 'btn btn-primary', disabled: spinning, onclick: spin }, icon('refresh'), 'Spin')),
          last.length ? h('div', { class: 'rl-last' }, h('span', { class: 'faint' }, 'Sidste: '), last.map(n => h('span', { class: ['rl-mini', color(n)] }, String(n)))) : null);
      }
      h(result, null, h('span', { class: 'faint' }, 'Læg jetoner på bordet, og tryk Spin.'));
      drawB();
      return [panel('Roulette', 'target', result, board, h('p', { class: 'faint', style: { marginBottom: 0 } }, 'Europæisk roulette med ét nul. Tal betaler 35:1, dusin 2:1, rød/sort, lige/ulige og høj/lav 1:1.'))];
    }

    // ── Slot machine ──
    function slots() {
      const total = SLOT.reduce((a, s) => a + s[1], 0);
      const pick = () => { let r = Math.random() * total; for (const s of SLOT) { if ((r -= s[1]) < 0) return s[0]; } return SLOT[0][0]; };
      const reels = [0, 1, 2].map(() => h('div', { class: 'sl-reel' }, '🍒'));
      const msg = h('p', { class: 'cs-msg' }, ' ');
      let spinning = false;
      function spin() {
        if (spinning || !can(bet)) return;
        change(-bet); spinning = true; msg.textContent = ' ';
        const res = [pick(), pick(), pick()];
        reels.forEach((r, i) => {
          r.classList.add('is-spin');
          let n = 0; const roll = () => { r.textContent = SLOT[Math.floor(Math.random() * SLOT.length)][0]; if (n++ < 10 + i * 6) later(roll, 55); else { r.textContent = res[i]; r.classList.remove('is-spin'); if (i === 2) done(); } };
          roll();
        });
        function done() {
          spinning = false;
          let win = 0;
          if (res[0] === res[1] && res[1] === res[2]) win = bet * SLOT.find(s => s[0] === res[0])[2];
          else if (res.filter(x => x === '🍒').length === 2) win = bet * 2;
          else if (res.includes('🍒')) win = Math.floor(bet / 2);
          if (win) change(win);
          msg.textContent = win > bet * 10 ? `JACKPOT! +${fmt(win)}` : win ? `Gevinst: ${fmt(win)}` : 'Ingen gevinst';
          msg.classList.toggle('is-big', win > bet * 10);
        }
      }
      return [panel('Enarmet tyveknægt', 'star', h('div', { class: 'sl-machine' }, reels), msg,
        h('div', { class: 'cs-actions' }, betPicker(), h('button', { class: 'btn btn-primary btn-lg', onclick: spin }, 'Træk i armen')),
        h('div', { class: 'sl-pay' }, SLOT.map(([s, , p]) => h('span', null, `${s}${s}${s} = ×${p}`)), h('span', null, '🍒🍒 = ×2'), h('span', null, '🍒 = ×½')))];
    }

    const TABS = { blackjack, roulette, slots };
    const first = TABS[ctx?.params?.sub] ? ctx.params.sub : 'blackjack';
    const open = (id) => { self._stop(); h(clear(body), null, TABS[id]()); };
    const seg = segmented([{ value: 'blackjack', label: 'Blackjack', icon: 'layers' }, { value: 'roulette', label: 'Roulette', icon: 'target' }, { value: 'slots', label: 'Tyveknægt', icon: 'star' }], first, open, { label: 'Spil' });
    open(first); drawRefill();
    return h('div', { class: 'page gm-page cs-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Brætspil og kort', title: 'Kasino', lead: 'Blackjack, roulette og tyveknægt – kun for sjov. Der spilles om point, aldrig rigtige penge, og intet kan købes.', compact: true }),
      h('div', { class: 'cs-bar glass' }, h('span', null, 'Dine point ', chipsEl), h('span', { class: 'faint' }, `Højeste: ${fmt(st.peak || START)}`), refillBox),
      h('div', { class: 'cmd-filters', style: { margin: '14px 0' } }, seg), body);
  },
};
