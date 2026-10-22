/** Bit-spil – learn binary by flipping bits until the number matches. Levels: 4 bit, 8 bit and hex. 60 seconds per game. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';

const LEVELS = { b4: { label: '4 bit', bits: 4 }, b8: { label: '8 bit', bits: 8 }, hex: { label: 'Hex', bits: 8, hex: true } };
const GAME_MS = 60000;

export default {
  title: 'Bit-spil',
  destroy() { if (this._t) clearInterval(this._t); },
  async render() {
    const app = appById('bits');
    let store;
    try { store = await appState('bits', { best: {} }); } catch (e) { return loadError('Bit-spil', e); }
    const st = store.data;
    const self = this;
    let level = 'b4', target = 0, value = 0, score = 0, endAt = 0, running = false;
    const bitsRow = h('div', { class: 'bt-bits' });
    const targetEl = h('div', { class: 'bt-target' });
    const valueEl = h('div', { class: 'bt-value' });
    const timeEl = h('b'), scoreEl = h('b');
    const startBtn = h('button', { class: 'btn btn-primary' }, icon('play'), 'Start spillet');
    const bestEl = h('span');
    const L = () => LEVELS[level];
    const fmtT = (n) => (L().hex ? n.toString(16).toUpperCase().padStart(2, '0') : String(n));

    function newTarget() { let t; do { t = Math.floor(Math.random() * 2 ** L().bits); } while (t === target || t === 0); target = t; value = 0; draw(); }
    function draw() {
      targetEl.textContent = running ? fmtT(target) : '?';
      valueEl.textContent = `= ${L().hex ? fmtT(value) : value}`;
      clear(bitsRow);
      for (let i = L().bits - 1; i >= 0; i--) {
        const on = (value >> i) & 1;
        const b = h('button', { class: ['bt-bit', on && 'is-on'], disabled: !running, 'aria-pressed': String(!!on), 'aria-label': `Bit med værdien ${2 ** i}` },
          h('span', { class: 'bt-v' }, String(2 ** i)), h('b', null, on ? '1' : '0'));
        b.addEventListener('click', () => { value ^= 1 << i; if (value === target) { score++; scoreEl.textContent = String(score); flash(); newTarget(); } else draw(); });
        bitsRow.append(b);
      }
      bestEl.textContent = String(st.best[level] || 0);
    }
    function flash() { bitsRow.classList.remove('is-hit'); void bitsRow.offsetWidth; bitsRow.classList.add('is-hit'); }
    function tick() {
      const left = running ? Math.max(0, endAt - Date.now()) : GAME_MS;
      timeEl.textContent = `${Math.ceil(left / 1000)} s`;
      if (running && left <= 0) stop();
    }
    function start() { running = true; score = 0; scoreEl.textContent = '0'; endAt = Date.now() + GAME_MS; startBtn.hidden = true; newTarget(); tick(); }
    function stop() {
      running = false; startBtn.hidden = false;
      const record = score > (st.best[level] || 0);
      if (record) { st.best[level] = score; store.save(); toast('Ny rekord!', { type: 'xp', text: `${score} tal på ét minut` }); }
      else toast(`${score} tal på ét minut`, { type: 'info', icon: 'chip' });
      draw();
    }
    startBtn.addEventListener('click', start);
    self._t = setInterval(tick, 200);
    const seg = segmented(Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.label })), level, (v) => { level = v; if (running) stop(); value = 0; draw(); }, { label: 'Niveau' });
    timeEl.textContent = '60 s'; scoreEl.textContent = '0';
    draw();
    return h('div', { class: 'page bt-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Læring', title: 'Bit-spil', lead: 'Computere tæller med 0 og 1. Tænd de bits, der tilsammen giver tallet – så hurtigt du kan på ét minut.',
        stats: [{ icon: 'trophy', label: 'Rekord på niveauet', value: bestEl }, { icon: 'chip', label: 'Niveauer', value: '3' }] }),
      panel(null, null, h('div', { class: 'cmd-filters' }, seg),
        h('div', { class: 'bt-stage' },
          h('div', { class: 'bt-goal' }, h('span', { class: 'faint' }, 'Lav dette tal:'), targetEl, valueEl),
          bitsRow,
          h('div', { class: 'ty-live' }, h('span', null, timeEl, ' tilbage'), h('span', null, scoreEl, ' point'), startBtn))),
      panel('Sådan virker det', 'info', h('p', { class: 'muted', style: { margin: 0 } }, 'Hver bit har en værdi: 1, 2, 4, 8, 16 … og dobbelt så meget for hver plads til venstre. Tallet er summen af de bits, der er tændt. 13 = 8 + 4 + 1 = 1101. I hex står ét tegn for fire bits: F = 1111 = 15, og FF = 255.')));
  },
};
