/**
 * Hemmelige koder – write secret messages in Cæsar, Morse, binary, numbers, Atbash or backwards, decode the
 * ones you get, crack a Cæsar code automatically, hear Morse as beeps – and solve code puzzles.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy } from '../features/appkit.js';
import * as C from '../features/ciphers.js';

const KINDS = {
  caesar: { name: 'Cæsar', enc: (t, k) => C.caesar(t, k), dec: (t, k) => C.caesar(t, -k), key: true, about: 'Hvert bogstav flyttes et antal pladser i alfabetet. Julius Cæsar brugte den til sine breve.' },
  morse: { name: 'Morse', enc: C.toMorse, dec: C.fromMorse, about: 'Prikker og streger – brugt til telegrafer og radio. Mellemrum mellem bogstaver, / mellem ord.' },
  binary: { name: 'Binær', enc: C.toBinary, dec: C.fromBinary, about: 'Sådan gemmer computeren tekst: hvert tegn bliver til bytes af 0 og 1.' },
  numbers: { name: 'Tal', enc: C.toNumbers, dec: C.fromNumbers, about: 'a = 1, b = 2 … å = 29. Bogstaver adskilles med -, ord med /.' },
  atbash: { name: 'Atbash', enc: C.atbash, dec: C.atbash, about: 'Alfabetet vendes om: a bliver til å, b til ø … En af de ældste koder.' },
  reverse: { name: 'Baglæns', enc: C.reverse, dec: C.reverse, about: 'Teksten skrives bagfra. Simpelt – men overraskende svært at læse hurtigt.' },
};
const PUZZLES = [
  ['caesar', 'Ghu hu hq khppholj ehvnhg', 3, 'Der er en hemmelig besked'], ['morse', '.... ..- -... - . -.-. ....', 0, 'hubtech'],
  ['numbers', '11-15-4-5 / 5-18 / 19-10-15-22', 0, 'kode er sjov'], ['atbash', 'Nuddå', 0, 'Pizza'], ['reverse', 'naoj re nah', 0, 'han er joan'],
  ['binary', '01101000 01100101 01101010', 0, 'hej'], ['caesar', 'Vmkxmk kshx', 4, 'Rigtig godt'],
];

function beep(morse) {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)(), u = 0.08; let t = ac.currentTime + 0.05;
    for (const ch of morse) {
      if (ch === '.' || ch === '-') { const o = ac.createOscillator(), g = ac.createGain(), d = ch === '.' ? u : 3 * u; o.frequency.value = 650; g.gain.setValueAtTime(0.25, t); g.gain.setValueAtTime(0, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.01); t += d + u; }
      else if (ch === ' ') t += 2 * u; else if (ch === '/') t += 4 * u;
    }
    setTimeout(() => ac.close(), (t - ac.currentTime) * 1000 + 300);
  } catch { /* no sound */ }
}

export default {
  title: 'Hemmelige koder',
  async render() {
    const app = appById('ciphers');
    let store;
    try { store = await appState('ciphers', { solved: [] }); } catch (e) { return loadError('Hemmelige koder', e); }
    const st = store.data;
    let kind = 'caesar', key = 3, dir = 'enc', mode = 'tool';
    const root = h('div');

    function tool() {
      const K = KINDS[kind];
      const input = h('textarea', { class: 'textarea cp-in', rows: 4, maxlength: 2000, placeholder: dir === 'enc' ? 'Skriv din hemmelige besked …' : 'Indsæt koden, du har fået …', 'aria-label': 'Tekst ind' });
      const out = h('div', { class: 'cp-out', 'aria-live': 'polite' });
      const keyIn = h('input', { type: 'range', min: 1, max: 28, value: key, 'aria-label': 'Flyt antal pladser' });
      const keyLbl = h('b', null, String(key));
      const run = () => { const v = input.value; out.textContent = v ? (dir === 'enc' ? K.enc(v, key) : K.dec(v, key)) : ''; };
      input.addEventListener('input', run);
      keyIn.addEventListener('input', () => { key = Number(keyIn.value); keyLbl.textContent = String(key); run(); });
      return h('div', { class: 'stack' },
        h('div', { class: 'cp-kinds' }, Object.entries(KINDS).map(([k, v]) => h('button', { class: ['sh-tag', kind === k && 'is-on'], onclick: () => { kind = k; draw(); } }, v.name))),
        h('p', { class: 'muted', style: { margin: 0 } }, K.about),
        segmented([{ value: 'enc', label: 'Lav kode', icon: 'lock' }, { value: 'dec', label: 'Afkod', icon: 'unlock' }], dir, (v) => { dir = v; draw(); }, { label: 'Retning' }),
        K.key ? h('label', { class: 'cp-key' }, h('span', null, 'Flyt '), keyLbl, h('span', null, ' pladser'), keyIn,
          dir === 'dec' ? h('button', { class: 'btn btn-sm', onclick: () => { if (!input.value.trim()) return toast('Indsæt en kode først', { type: 'warn' }); key = C.crackCaesar(input.value); keyIn.value = key; keyLbl.textContent = String(key); run(); toast(`Gættet: flyt ${key}`, { type: 'info' }); } }, icon('sparkles'), 'Knæk koden') : null) : null,
        input,
        h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('span', { class: 'field-label' }, dir === 'enc' ? 'Din kode' : 'Beskeden'),
          h('div', { class: 'row', style: { gap: '4px' } }, kind === 'morse' ? h('button', { class: 'btn btn-sm', onclick: () => beep(dir === 'enc' ? out.textContent : input.value) }, icon('play'), 'Afspil') : null,
            h('button', { class: 'btn btn-sm', onclick: () => out.textContent && copy(out.textContent, 'Kopieret') }, icon('copy'), 'Kopiér'))),
        out,
        kind === 'morse' ? h('details', { class: 'cl-hint' }, h('summary', null, 'Morsealfabetet'), h('div', { class: 'cp-table' }, Object.entries(C.MORSE).filter(([k]) => /[a-zæøå]/.test(k)).map(([k, v]) => h('span', null, h('b', null, k.toUpperCase()), ` ${v}`)))) : null);
    }
    function puzzles() {
      return h('div', { class: 'stack' }, h('p', { class: 'muted', style: { margin: 0 } }, `Knæk koderne! Brug værktøjet, hvis du sidder fast. Du har løst ${st.solved.length} af ${PUZZLES.length}.`),
        PUZZLES.map(([k, code, shift, answer], i) => {
          const done = st.solved.includes(i);
          const inp = h('input', { class: 'input', maxlength: 80, placeholder: 'Hvad står der?', 'aria-label': `Svar på kode ${i + 1}`, value: done ? answer : '', disabled: done });
          const check = () => { const ok = inp.value.trim().toLowerCase().replace(/\s+/g, ' ') === answer.toLowerCase(); if (ok) { st.solved = [...new Set([...st.solved, i])]; store.save(); toast('Knækket! 🔓', { type: 'ok' }); draw(); } else toast('Ikke helt – prøv igen', { type: 'warn' }); };
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
          return h('div', { class: ['cp-puzzle', done && 'is-done'] }, h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', { class: 'chip' }, KINDS[k].name, shift ? ` · flyt ${shift}` : ''), done ? h('span', { class: 'chip chip-ok' }, icon('check'), 'Løst') : null),
            h('code', { class: 'cp-code' }, code), h('div', { class: 'row', style: { gap: '6px' } }, inp, !done ? h('button', { class: 'btn btn-primary', onclick: check }, 'Tjek') : null));
        }));
    }
    function draw() {
      h(clear(root), null, h('div', { class: 'cmd-filters', style: { marginBottom: '12px' } }, segmented([{ value: 'tool', label: 'Værktøj', icon: 'lock' }, { value: 'puzzles', label: 'Kodeopgaver', icon: 'help' }], mode, (v) => { mode = v; draw(); }, { label: 'Visning' })),
        panel(null, null, mode === 'tool' ? tool() : puzzles()));
    }
    draw();
    return h('div', { class: 'page cp-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Skole', title: 'Hemmelige koder', lead: 'Skriv hemmelige beskeder i Cæsar, morse, binær og flere – afkod dem du får, hør morse som bip og knæk kodeopgaverne.', compact: true }), root);
  },
};
