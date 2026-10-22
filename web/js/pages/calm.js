/**
 * Ro – a place to relax: mix your own soundscape (rain, sea, forest, fire, wind, calm piano) with a sleep timer,
 * breathe along with a slow circle, or follow a short relaxation. Every sound is made in the browser.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { todayISO } from '../features/gamelogic.js';
import * as R from '../features/calm.js';
import * as Piano from '../features/piano.js';

const SOUNDS = [
  ['rain', 'Regn', '🌧️'], ['sea', 'Havet', '🌊'], ['forest', 'Skov og fugle', '🌲'], ['fire', 'Pejs', '🔥'], ['wind', 'Vind', '🍃'], ['brown', 'Brun støj', '🟤'],
];
const TIMERS = [[0, 'Ingen'], [10, '10 min.'], [20, '20 min.'], [30, '30 min.'], [45, '45 min.'], [60, '1 time']];

// ── the soundscape engine ──
function makeNoise(ctx, kind, secs = 4) {
  const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'pink') { b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w; d[i] = (b0 + b1 + b2 + w * 0.1) * 0.9; }
    else d[i] = w;
  }
  return b;
}
function loop(ctx, buf, out) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.connect(out); s.start(ctx.currentTime, Math.random() * 3); return s; }
function filt(ctx, type, f, q = 0.7) { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
function lfo(ctx, rate, depth, param, base) { param.value = base; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; }

class Soundscape {
  constructor() { this.ctx = null; this.layers = {}; this.master = null; this.timers = []; }
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 1; this.master.connect(this.ctx.destination);
      this.white = makeNoise(this.ctx, 'white'); this.pink = makeNoise(this.ctx, 'pink'); this.brown = makeNoise(this.ctx, 'brown');
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  layer(id) {
    if (this.layers[id]) return this.layers[id];
    const c = this.ensure(), g = c.createGain(); g.gain.value = 0; g.connect(this.master);
    const L = { gain: g, nodes: [] };
    if (id === 'rain') {
      const hp = filt(c, 'highpass', 500), lp = filt(c, 'lowpass', 5000); hp.connect(lp); lp.connect(g);
      L.nodes.push(loop(c, this.pink, hp));
      const drops = () => {            // single drops on the window
        if (!this.layers.rain || g.gain.value < 0.01) return;
        const t = c.currentTime + Math.random() * 0.3, s = c.createBufferSource(), f = filt(c, 'bandpass', 1500 + Math.random() * 3000, 8), e = c.createGain();
        s.buffer = this.white; e.gain.setValueAtTime(0.25 * Math.random(), t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        s.connect(f); f.connect(e); e.connect(g); s.start(t, Math.random()); s.stop(t + 0.08);
      };
      this.timers.push(setInterval(drops, 140));
    }
    if (id === 'sea') {
      const lp = filt(c, 'lowpass', 700), swell = c.createGain(); lp.connect(swell); swell.connect(g);
      L.nodes.push(loop(c, this.brown, lp), lfo(c, 0.09, 0.45, swell.gain, 0.55), lfo(c, 0.05, 300, lp.frequency, 700));
    }
    if (id === 'wind') {
      const bp = filt(c, 'bandpass', 600, 1.2); bp.connect(g);
      L.nodes.push(loop(c, this.pink, bp), lfo(c, 0.07, 350, bp.frequency, 650));
    }
    if (id === 'brown') { const lp = filt(c, 'lowpass', 900); lp.connect(g); L.nodes.push(loop(c, this.brown, lp)); }
    if (id === 'fire') {
      const lp = filt(c, 'lowpass', 400), rumble = c.createGain(); rumble.gain.value = 0.6; lp.connect(rumble); rumble.connect(g);
      L.nodes.push(loop(c, this.brown, lp));
      const crackle = () => {
        if (!this.layers.fire || g.gain.value < 0.01) return;
        const n = 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          const t = c.currentTime + Math.random() * 0.2, s = c.createBufferSource(), f = filt(c, 'highpass', 2000 + Math.random() * 4000), e = c.createGain();
          s.buffer = this.white; e.gain.setValueAtTime(0.5 * Math.random(), t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.01 + Math.random() * 0.03);
          s.connect(f); f.connect(e); e.connect(g); s.start(t, Math.random()); s.stop(t + 0.06);
        }
      };
      this.timers.push(setInterval(crackle, 180));
    }
    if (id === 'forest') {
      const bp = filt(c, 'bandpass', 500, 0.6), bed = c.createGain(); bed.gain.value = 0.35; bp.connect(bed); bed.connect(g);
      L.nodes.push(loop(c, this.pink, bp), lfo(c, 0.05, 200, bp.frequency, 500));
      const bird = () => {        // a little bird: a few quick chirps
        if (!this.layers.forest || g.gain.value < 0.01 || Math.random() < 0.55) return;
        const base = 2200 + Math.random() * 2200, notes = 2 + Math.floor(Math.random() * 4), pan = c.createStereoPanner ? c.createStereoPanner() : null;
        if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(g); }
        for (let k = 0; k < notes; k++) {
          const t = c.currentTime + 0.05 + k * (0.09 + Math.random() * 0.05), o = c.createOscillator(), e = c.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(base * (1 + Math.random() * 0.15), t); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.06);
          e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.07, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
          o.connect(e); e.connect(pan || g); o.start(t); o.stop(t + 0.1);
        }
      };
      this.timers.push(setInterval(bird, 900));
    }
    this.layers[id] = L;
    return L;
  }
  set(id, v) { const L = this.layer(id); L.gain.gain.setTargetAtTime(v * v * 0.8, this.ctx.currentTime, 0.25); }
  setMaster(v) { if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5); }
  tone(f, dur = 1.6, vol = 0.05) {            // a soft bell for the breathing
    const c = this.ensure(), t = c.currentTime, o = c.createOscillator(), e = c.createGain();
    o.type = 'sine'; o.frequency.value = f; e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + 0.05); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(c.destination); o.start(t); o.stop(t + dur + 0.1);
  }
  close() { this.timers.forEach(clearInterval); this.timers = []; try { this.ctx?.close(); } catch { /* */ } this.ctx = null; this.layers = {}; }
}

export default {
  title: 'Ro',
  destroy() { this._sound?.close(); cancelAnimationFrame(this._raf); clearInterval(this._iv); clearInterval(this._guide); },
  async render(ctx) {
    const app = appById('calm');
    let store;
    try { store = await appState('calm', { mix: {}, timer: 0, history: {}, breath: 'rolig', mins: 3, bell: true }); } catch (e) { return loadError('Ro', e); }
    const st = store.data, self = this;
    st.mix = st.mix || {}; st.history = st.history || {};
    const sound = self._sound = new Soundscape();
    let tab = ['sounds', 'breathe', 'relax'].includes(ctx?.params?.sub) ? ctx.params.sub : 'sounds';
    let playing = false, timerStart = 0, breathing = null, guiding = null;
    const body = h('div', { class: 'stack' });
    const sumBox = h('div', { class: 'ro-sum' });

    // quiet minutes: count while something is going on
    function drawSum() {
      const s = R.summary(st.history, todayISO());
      const max = Math.max(5, ...s.week.map(d => d.min));
      h(clear(sumBox), null,
        h('div', null, h('b', null, `${s.today} min.`), h('span', { class: 'faint' }, 'ro i dag')),
        h('div', null, h('b', null, String(s.streak)), h('span', { class: 'faint' }, s.streak === 1 ? 'dag i træk' : 'dage i træk')),
        h('div', { class: 'ro-week', 'aria-label': 'Minutter de sidste 7 dage' }, s.week.map(d => h('i', { style: { height: `${Math.max(4, (d.min / max) * 100)}%` }, title: `${d.day}: ${d.min} min.` }))));
    }
    clearInterval(self._iv);
    let secs = 0;
    self._iv = setInterval(() => {
      if (!document.body.contains(body)) return;
      const active = playing || breathing || guiding;
      if (active) {
        secs++;
        if (secs % 15 === 0) { const d = todayISO(); st.history[d] = (st.history[d] || 0) + 0.25; store.save(); drawSum(); }
      }
      if (playing && st.timer) {
        const el = (Date.now() - timerStart) / 1000, total = st.timer * 60, f = R.fadeAt(el, total);
        sound.setMaster(f);
        const left = Math.max(0, Math.ceil(total - el));
        const tl = body.querySelector('.ro-timeleft'); if (tl) tl.textContent = `Slukker om ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (f === 0) { stopAll(); toast('Sov godt', { type: 'info', text: 'Lydene er slukket.' }); }
      }
    }, 1000);

    // ── sounds ──
    function startAll() {
      sound.ensure(); playing = true; timerStart = Date.now(); sound.setMaster(1);
      for (const [id] of SOUNDS) if (st.mix[id]) sound.set(id, st.mix[id]);
      if (!Object.values(st.mix).some(v => v > 0)) { st.mix.rain = 0.6; store.save(); sound.set('rain', 0.6); open('sounds'); return; }
      open('sounds');
    }
    function stopAll() { playing = false; for (const [id] of SOUNDS) if (sound.layers[id]) sound.set(id, 0); open(tab); }
    function soundsTab() {
      const pianoOn = Piano.isPlaying();
      const cards = SOUNDS.map(([id, name, emoji]) => {
        const v = st.mix[id] || 0;
        const slider = h('input', { type: 'range', class: 'range', min: 0, max: 100, value: Math.round(v * 100), 'aria-label': `${name}: lydstyrke` });
        const card = h('div', { class: ['ro-sound', v > 0 && 'is-on'] },
          h('button', { class: 'ro-sound-btn', 'aria-pressed': String(v > 0), onclick: () => { const nv = st.mix[id] > 0 ? 0 : 0.6; st.mix[id] = nv; store.save(); if (!playing && nv) { startAll(); return; } if (playing) sound.set(id, nv); open('sounds'); } },
            h('span', { class: 'ro-emoji', 'aria-hidden': 'true' }, emoji), h('span', null, name)),
          slider);
        slider.addEventListener('input', () => { const nv = Number(slider.value) / 100; st.mix[id] = nv; card.classList.toggle('is-on', nv > 0); store.save(); if (playing) sound.set(id, nv); else if (nv > 0) startAll(); });
        return card;
      });
      const timerSel = h('select', { class: 'select', 'aria-label': 'Sovetimer' }, TIMERS.map(([v, l]) => h('option', { value: v, selected: v === st.timer }, l)));
      timerSel.addEventListener('change', () => { st.timer = Number(timerSel.value); timerStart = Date.now(); sound.setMaster?.(1); store.save(); open('sounds'); });
      return [h('div', { class: 'ro-player' },
          h('button', { class: ['btn btn-lg ro-play', playing ? 'is-on' : 'btn-primary'], onclick: () => (playing ? stopAll() : startAll()) }, icon(playing ? 'pause' : 'play'), playing ? 'Stop lydene' : 'Afspil'),
          h('label', { class: 'ro-timer' }, icon('moon'), h('span', null, 'Sovetimer'), timerSel),
          playing && st.timer ? h('span', { class: 'faint ro-timeleft' }, '') : null),
        h('div', { class: 'ro-sounds' }, cards,
          h('div', { class: ['ro-sound', pianoOn && 'is-on'] },
            h('button', { class: 'ro-sound-btn', 'aria-pressed': String(pianoOn), onclick: async () => { if (Piano.isPlaying()) Piano.stop(); else await Piano.start('rolig'); setTimeout(() => open('sounds'), 200); } },
              h('span', { class: 'ro-emoji', 'aria-hidden': 'true' }, '🎹'), h('span', null, 'Rolig klaver')),
            h('span', { class: 'faint', style: { fontSize: '12px' } }, pianoOn ? 'Spiller – fortsætter i baggrunden' : 'Spilles med HUBTECHs egen baggrundsmusik'))),
        h('p', { class: 'faint' }, 'Bland lydene, som du vil. Alle lyde laves i browseren – der hentes ingenting. Med sovetimeren bliver lyden langsomt svagere det sidste minut.')];
    }

    // ── breathing ──
    function breatheTab() {
      const b = R.BREATHS[st.breath] || R.BREATHS.rolig;
      const circle = h('div', { class: 'ro-circle' }, h('div', { class: 'ro-ring' }), h('div', { class: 'ro-core' }, h('b', { class: 'ro-phase' }, 'Klar?'), h('span', { class: 'ro-left' }, '')));
      const sel = segmented(Object.entries(R.BREATHS).map(([value, x]) => ({ value, label: x.name })), st.breath, (v) => { st.breath = v; store.save(); stopBreath(); open('breathe'); }, { label: 'Øvelse' });
      const mins = h('select', { class: 'select', 'aria-label': 'Hvor længe' }, [1, 3, 5, 10].map(n => h('option', { value: n, selected: n === st.mins }, `${n} min.`)));
      mins.addEventListener('change', () => { st.mins = Number(mins.value); store.save(); });
      const bell = h('input', { type: 'checkbox', checked: st.bell !== false, onchange: (e) => { st.bell = e.target.checked; store.save(); } });
      const btn = h('button', { class: 'btn btn-primary btn-lg', onclick: () => (breathing ? stopBreath() : startBreath()) }, icon('play'), 'Start');
      let lastPhase = '';
      function frame() {
        if (!breathing || !document.body.contains(circle)) return;
        const t = (performance.now() - breathing.t0) / 1000;
        if (t >= breathing.total) { stopBreath(); toast('Godt gået', { type: 'ok', text: `${st.mins} minutters rolig vejrtrækning.` }); return; }
        const p = R.phaseAt(b, t);
        circle.style.setProperty('--s', String(0.55 + p.scale * 0.45));
        circle.dataset.phase = p.phase;
        circle.querySelector('.ro-phase').textContent = R.PHASE_TEXT[p.phase];
        circle.querySelector('.ro-left').textContent = String(p.left);
        if (p.phase !== lastPhase) { if (st.bell !== false) sound.tone(p.phase.startsWith('in') ? 392 : p.phase === 'out' ? 294 : 330, 1.4, 0.04); lastPhase = p.phase; }
        self._raf = requestAnimationFrame(frame);
      }
      function startBreath() { sound.ensure(); breathing = { t0: performance.now(), total: st.mins * 60 }; lastPhase = ''; h(clear(btn), null, icon('pause'), 'Stop'); frame(); }
      function stopBreath() {
        breathing = null; cancelAnimationFrame(self._raf);
        if (document.body.contains(circle)) { circle.style.setProperty('--s', '0.55'); circle.dataset.phase = ''; circle.querySelector('.ro-phase').textContent = 'Klar?'; circle.querySelector('.ro-left').textContent = ''; h(clear(btn), null, icon('play'), 'Start'); }
      }
      return [h('div', { class: 'cm-seg-scroll' }, sel), h('p', { class: 'muted', style: { margin: 0 } }, b.text),
        h('div', { class: 'ro-breathe' }, circle,
          h('div', { class: 'row-actions', style: { justifyContent: 'center' } }, btn, mins, h('label', { class: 'cal-pcheck' }, bell, h('span', null, 'Blid klokke')))),
        h('p', { class: 'faint', style: { textAlign: 'center' } }, 'Følg cirklen: den vokser, når du ånder ind, og bliver mindre, når du puster ud. Bliver du svimmel, så træk bare vejret normalt.')];
    }

    // ── relaxation ──
    function relaxTab() {
      const box = h('div', { class: 'ro-guide' });
      const list = h('div', { class: 'ro-guides' }, Object.entries(R.GUIDES).map(([id, g]) => h('button', { class: 'ro-guide-btn', onclick: () => startGuide(id) }, h('b', null, g.name), h('span', { class: 'faint' }, `ca. ${g.mins} min.`))));
      function startGuide(id) {
        const g = R.GUIDES[id], per = (g.mins * 60) / g.steps.length;
        let i = 0;
        guiding = id;
        const draw = () => h(clear(box), null,
          h('div', { class: 'ro-guide-bar' }, h('i', { style: { width: `${((i + 1) / g.steps.length) * 100}%` } })),
          h('p', { class: 'ro-guide-text', 'aria-live': 'polite' }, g.steps[i]),
          h('div', { class: 'row-actions', style: { justifyContent: 'center' } },
            h('button', { class: 'btn btn-sm', disabled: i === 0, onclick: () => { i--; restart(); } }, icon('chevronLeft'), 'Forrige'),
            h('button', { class: 'btn btn-sm', onclick: () => { clearInterval(self._guide); guiding = null; clear(box); } }, 'Stop'),
            h('button', { class: 'btn btn-sm', onclick: () => next() }, i === g.steps.length - 1 ? 'Færdig' : 'Næste', icon('chevronRight'))));
        const next = () => { if (i >= g.steps.length - 1) { clearInterval(self._guide); guiding = null; h(clear(box), null, h('p', { class: 'ro-guide-text' }, 'Godt gået. Tag den ro med dig videre.')); return; } i++; restart(); };
        const restart = () => { clearInterval(self._guide); self._guide = setInterval(next, per * 1000); draw(); };
        restart();
      }
      return [h('p', { class: 'muted', style: { margin: 0 } }, 'Korte øvelser, der guider dig en sætning ad gangen. Tænd gerne en rolig lyd under Lyde først.'), list, box,
        h('a', { class: 'ro-game', href: '#/apps/huegame' }, h('span', { class: 'ro-emoji', 'aria-hidden': 'true' }, '🎨'), h('span', null, h('b', null, 'Farvebølge'), h('span', { class: 'faint' }, 'Et roligt farvepuslespil uden tid – godt sammen med regnlyde.')), icon('arrowRight'))];
    }

    const TABS = { sounds: soundsTab, breathe: breatheTab, relax: relaxTab };
    function open(id) {
      if (id !== tab && breathing) { breathing = null; cancelAnimationFrame(self._raf); }
      tab = id; seg.setValue(id); history.replaceState(null, '', `#/apps/calm${id === 'sounds' ? '' : `/${id}`}`);
      h(clear(body), null, TABS[id]());
    }
    const seg = segmented([{ value: 'sounds', label: 'Lyde', icon: 'music' }, { value: 'breathe', label: 'Vejrtrækning', icon: 'wind' }, { value: 'relax', label: 'Afspænding', icon: 'leaf' }], tab, (v) => open(v), { label: 'Vælg' });
    drawSum(); open(tab);
    return h('div', { class: 'page ro-page', style: { '--app': app.hue } },
      h('div', { class: 'ro-sky', 'aria-hidden': 'true' }),
      appHero(app, { eyebrow: 'Velvære', title: 'Ro', lead: 'Sæt tempoet ned. Bland dine egne naturlyde, træk vejret med cirklen, eller tag en kort afspænding.', compact: true }),
      sumBox,
      h('div', { class: 'cmd-filters', style: { marginBottom: '16px' } }, seg), body);
  },
};
