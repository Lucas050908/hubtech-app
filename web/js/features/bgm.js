/** The background-music button in the top bar: play/pause, mood and volume for HUBTECH's own piano music. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as piano from './piano.js';

let pop = null, btn = null;

function draw() {
  if (!btn) return;
  const on = piano.isPlaying();
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Klavermusik spiller – klik for at styre den' : 'Baggrundsmusik (klaver)';
  if (pop) fill();
}

function fill() {
  const on = piano.isPlaying();
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: piano.getVolume(), 'aria-label': 'Lydstyrke', oninput: (e) => piano.setVolume(e.target.value) });
  h(clear(pop), null,
    h('div', { class: 'bgm-h' }, h('span', { class: 'bgm-ic' }, icon('music')), h('div', null, h('b', null, 'Baggrundsmusik'), h('span', { class: 'faint' }, 'Klaver, komponeret live af HUBTECH'))),
    h('button', { class: ['btn', on ? '' : 'btn-primary', 'bgm-play'], onclick: () => piano.toggle() }, icon(on ? 'pause' : 'play'), on ? 'Pause' : 'Spil'),
    h('div', { class: 'bgm-moods', role: 'radiogroup', 'aria-label': 'Stemning' }, Object.entries(piano.MOODS).map(([id, m]) =>
      h('button', { type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(piano.getMood() === id), onclick: () => { piano.setMood(id); if (!piano.isPlaying()) piano.start(id); } }, m.name))),
    h('label', { class: 'bgm-vol' }, icon('volume'), vol),
    h('p', { class: 'faint bgm-note' }, 'Ingen optagelser eller kendte numre – hver tone skabes her, så der er ingen ophavsret. Musikken er slået fra, til du selv tænder den, og holder pause under opkald.'));
}

function close() { pop?.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); btn?.setAttribute('aria-expanded', 'false'); }
function outside(e) { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); }

export function bgmButton() {
  btn = h('button', { class: 'icon-btn bgm-btn', 'aria-label': 'Baggrundsmusik', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-pressed': 'false' }, icon('music'));
  btn.addEventListener('click', () => {
    if (pop) { close(); return; }
    pop = h('div', { class: 'menu glass glass-strong bgm-pop', role: 'dialog', 'aria-label': 'Baggrundsmusik' });
    fill();
    btn.parentElement.appendChild(pop);
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
  });
  piano.onPiano(draw);
  draw();
  return h('div', { class: 'pop-anchor' }, btn);
}

/** Browsers only allow sound after a click – if the user had the music on last time, it continues at the first click. */
export function initBgm() {
  if (piano.wanted()) {
    const go = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); if (piano.wanted() && !inCall) piano.start(); };
    addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
  }
  let inCall = false;
  addEventListener('hubtech-call', (e) => {
    inCall = !!e.detail?.active;
    if (inCall && piano.isPlaying()) piano.stop({ remember: false });
    else if (!inCall && piano.wanted()) piano.start();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) close(); });
}
