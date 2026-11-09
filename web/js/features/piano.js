/**
 * Baggrundsmusik: calm piano music that HUBTECH composes and plays itself, live in the browser (Web Audio).
 * No recordings and no existing songs are used – every note is generated here – so there is nothing copyrighted.
 *
 *   start(mood) / stop() / toggle() / setVolume(0..1) / setMood(id) / isPlaying()
 *   output(ctx) – the same music as a node in another AudioContext (used for music in calls)
 */
export const MOODS = {
  rolig: { name: 'Rolig', bpm: 66, key: 60, prog: [[0, 4, 7, 11], [7, 11, 14, 17], [9, 12, 16, 19], [5, 9, 12, 16]], density: 0.55, scale: [0, 2, 4, 7, 9, 11] },
  drom: { name: 'Drømmende', bpm: 56, key: 57, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]], density: 0.45, scale: [0, 2, 3, 5, 7, 10] },
  fokus: { name: 'Fokus', bpm: 50, key: 62, prog: [[0, 7, 14, 16], [5, 12, 16, 19], [-3, 4, 9, 12], [2, 9, 12, 17]], density: 0.3, scale: [0, 2, 4, 7, 9] },
  aften: { name: 'Aften', bpm: 60, key: 55, prog: [[0, 4, 7, 14], [-3, 0, 4, 9], [5, 9, 12, 16], [7, 11, 14, 17], [0, 4, 7, 12], [-5, -1, 2, 7]], density: 0.5, scale: [0, 2, 4, 5, 7, 9, 11] },
  // ── richer pieces: sections (A/B), melodies that come back and change, left-hand patterns, dynamics and a fuller piano ──
  vals: { name: 'Vals', rich: true, bpm: 132, meter: 3, key: 57, lh: 'waltz', form: 'AABA', density: 0.75, swing: 0, rubato: 0.06, wet: 0.36,
    scale: [0, 2, 3, 5, 7, 8, 11], mel: 69,
    sections: { A: [[0, 3, 7], [-4, 0, 3], [5, 8, 12], [7, 11, 14], [0, 3, 7], [-7, -3, 0], [2, 5, 8, 11], [7, 11, 14, 17]],
      B: [[3, 7, 10], [-2, 2, 5], [3, 7, 10, 14], [-4, 0, 3, 7], [5, 8, 12], [2, 5, 8], [7, 11, 14], [7, 10, 14, 17]] } },
  regn: { name: 'Regnvejr', rich: true, bpm: 72, meter: 4, key: 50, lh: 'lofi', form: 'AABA', density: 0.5, swing: 0.12, rubato: 0.02, wet: 0.42, rain: true,
    scale: [0, 2, 3, 5, 7, 9, 10], mel: 67,
    sections: { A: [[0, 3, 7, 10, 14], [5, 9, 12, 16, 19], [-2, 2, 5, 9, 14], [-5, -1, 2, 5, 9]], B: [[3, 7, 10, 14], [-4, 0, 3, 7, 10], [-2, 2, 5, 9], [7, 10, 14, 17]] } },
  morgen: { name: 'Morgengry', rich: true, bpm: 92, meter: 4, key: 62, lh: 'flow', form: 'ABAB', density: 0.7, swing: 0, rubato: 0.03, wet: 0.32,
    scale: [0, 2, 4, 7, 9, 11], mel: 74,
    sections: { A: [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [7, 11, 14]], B: [[-5, -1, 2, 7], [4, 7, 11, 14], [5, 9, 12], [7, 11, 14, 17]] } },
  nocturne: { name: 'Nocturne', rich: true, bpm: 58, meter: 4, key: 51, lh: 'wide', form: 'AAB', density: 0.6, swing: 0, rubato: 0.08, wet: 0.45,
    scale: [0, 2, 3, 5, 7, 8, 11], mel: 70,
    sections: { A: [[0, 3, 7], [5, 8, 12], [-5, -1, 2, 5], [0, 3, 7]], B: [[-4, 0, 3, 7], [-7, -3, 0, 3], [2, 5, 8], [7, 11, 14, 17]] } },
  stjerner: { name: 'Stjernenat', rich: true, bpm: 52, meter: 4, key: 59, lh: 'sparse', form: 'AB', density: 0.32, swing: 0, rubato: 0.04, wet: 0.55, pad: true,
    scale: [0, 2, 4, 7, 9], mel: 78,
    sections: { A: [[0, 7, 11, 16], [-3, 4, 7, 14], [5, 12, 16, 19], [-5, 2, 7, 11]], B: [[-1, 6, 9, 14], [-3, 4, 7, 11], [2, 9, 14, 17], [-5, 2, 7, 14]] } },
  eventyr: { name: 'Eventyr', rich: true, bpm: 76, meter: 4, key: 53, lh: 'flow', form: 'AABA', density: 0.55, swing: 0, rubato: 0.05, wet: 0.48, pad: true,
    scale: [0, 2, 4, 6, 7, 9, 11], mel: 72,
    sections: { A: [[0, 4, 7, 14], [2, 6, 9, 14], [-1, 2, 7, 11], [-3, 4, 7, 12]], B: [[5, 9, 12, 16], [7, 11, 14, 18], [4, 7, 11, 14], [2, 6, 9, 14]] } },
};

// left-hand patterns: per 8th note, which chord tones to play (index into the chord, octave shift); null = rest
const LH = {
  waltz: [[[0, -2]], null, [[1, -1], [2, -1]], null, [[1, -1], [2, -1]], null],
  lofi: [[[0, -2], [2, -1]], null, null, [[1, -1], [3, -1]], null, [[0, -1]], [[2, -1], [4, -1]], null],
  flow: [[[0, -2]], [[1, -1]], [[2, -1]], [[3, -1]], [[0, 0]], [[3, -1]], [[2, -1]], [[1, -1]]],
  wide: [[[0, -2]], [[2, -2]], [[0, -1]], [[1, -1]], [[2, -1]], [[1, -1]], [[0, -1]], [[2, -2]]],
  sparse: [[[0, -2], [2, -1]], null, null, null, [[1, -1]], null, null, null],
};
// melody rhythms for one bar: [8th position, length in 8ths]
const RHYTHMS = {
  4: [[[0, 2], [2, 1], [3, 1], [4, 4]], [[0, 3], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 3], [7, 1]], [[0, 4], [4, 2], [6, 2]], [[1, 1], [2, 2], [4, 1], [5, 3]]],
  3: [[[0, 2], [2, 1], [3, 1], [4, 2]], [[0, 4], [4, 2]], [[0, 1], [1, 1], [2, 2], [4, 2]], [[0, 3], [3, 3]]],
};

const KEY = 'hubtech.bgm';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...v })); } catch { /* */ } };

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** One composer + piano voice, playing into an AudioContext (the page's own, or a call's). */
class Player {
  constructor(ctx, out) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(out);
    this.master = comp;
    const len = Math.floor(ctx.sampleRate * 3.2), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.wet = ctx.createConvolver(); this.wet.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.32; this.wet.connect(g).connect(out);
    this.timer = 0; this.reset();
    // the richer pieces: a fuller piano with stereo, a longer room and a gentle low cut
    this.light = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // phones: fewer partials
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.connect(comp);
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 7000; shelf.gain.value = -3; shelf.connect(hp);
    this.bus = shelf;
    this.room = ctx.createConvolver(); this.room.buffer = this.roomIR(4.2);
    const pre = ctx.createDelay(0.2); pre.delayTime.value = 0.024;
    this.roomGain = ctx.createGain(); this.roomGain.gain.value = 0.4;
    pre.connect(this.room).connect(this.roomGain).connect(hp);
    this.roomIn = pre;
    this.noise = this.noiseBuf(2);
    this.rainNode = null;
  }

  reset() { this.nextTime = this.ctx.currentTime + 0.1; this.step = 0; this.bar = 0; this.last = null; this.r = null; }

  noiseBuf(sec) {
    const b = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * sec), this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** A stereo room: a few early reflections, then a tail that gets darker as it fades. */
  roomIR(sec) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * sec), buf = this.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, k = 0.15 + 0.8 * t;                 // more damping later in the tail
        lp += (1 - k) * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, 3.2) * 0.9;
      }
      for (const [ms, g] of [[11, 0.5], [19, 0.36], [29, 0.3], [41, 0.22], [57, 0.16]]) {
        const i = Math.floor(sr * (ms + c * 3.7) / 1000); if (i < len) d[i] += g * (c ? -1 : 1);
      }
    }
    return buf;
  }

  /** A fuller piano voice: slightly inharmonic partials that fade at their own speed, two detuned strings,
   *  a soft hammer, brighter when played harder, placed left–right by pitch. */
  richNote(midi, at, vel = 0.6, len = 2.6) {
    const ctx = this.ctx, f = freq(midi);
    const B = midi < 48 ? 0.0006 : 0.00035;
    const decay = len * (midi < 50 ? 1.45 : midi > 78 ? 0.65 : 1);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = Math.max(-0.6, Math.min(0.6, (midi - 62) / 34));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(Math.min(12000, f * (5 + 9 * vel)), at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(260, f * 1.4), at + decay * 0.85);
    lp.connect(pan); pan.connect(this.bus); pan.connect(this.roomIn);
    const amps = [1, 0.5, 0.26, 0.15, 0.08, 0.05, 0.03];
    const n = this.light ? 4 : midi < 60 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const k = i + 1, fk = f * k * Math.sqrt(1 + B * k * k);
      if (fk > 16000) break;
      const g = ctx.createGain();
      const peak = amps[i] * vel * 0.16 * (i ? 0.55 + 0.7 * vel : 1);
      const d = decay / (1 + 0.38 * i);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.005);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.4), at + 0.25 + 0.1 * i);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      g.connect(lp);
      const strings = i < 2 && !this.light ? [-0.9, 0.9] : [0];
      for (const cents of strings) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = fk * Math.pow(2, cents / 1200);
        if (strings.length > 1) { const half = ctx.createGain(); half.gain.value = 0.6; o.connect(half).connect(g); } else o.connect(g);
        o.start(at); o.stop(at + d + 0.05);
      }
    }
    if (!this.light) {                                          // the hammer touching the string
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(7000, f * 3); bp.Q.value = 1.2;
      const hg = ctx.createGain(); hg.gain.setValueAtTime(0.022 * vel, at); hg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      src.connect(bp).connect(hg).connect(lp); src.start(at, Math.random()); src.stop(at + 0.04);
    }
  }

  /** A soft, warm layer under the piano (Stjernenat, Eventyr). */
  pad(notes, at, len) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.018, at + Math.min(1.6, len * 0.4));
    g.gain.setValueAtTime(0.018, at + len * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len + 1.8);
    lp.connect(g); g.connect(this.bus); g.connect(this.roomIn);
    for (const m of notes) for (const c of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq(m) * Math.pow(2, c / 1200);
      o.connect(lp); o.start(at); o.stop(at + len + 2);
    }
  }

  /** Quiet rain behind Regnvejr. */
  rain(on) {
    if (on && !this.rainNode) {
      const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.35;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.014, ctx.currentTime + 3);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.004; lfo.connect(lg).connect(g.gain); lfo.start();
      src.connect(bp).connect(hp).connect(g).connect(this.bus); src.start();
      this.rainNode = { src, g, lfo };
    } else if (!on && this.rainNode) {
      const { src, g, lfo } = this.rainNode, t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      src.stop(t + 1.6); lfo.stop(t + 1.6); this.rainNode = null;
    }
  }

  /** A soft, piano-like voice: a few slightly detuned partials, a quick attack and a long, darkening decay. */
  note(midi, at, vel = 0.6, len = 2.4) {
    const ctx = this.ctx, f = freq(midi);
    const out = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), at + len * 0.9);
    const decay = len * (midi < 52 ? 1.35 : midi > 76 ? 0.7 : 1);
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(vel * 0.22, at + 0.008);
    out.gain.exponentialRampToValueAtTime(vel * 0.08, at + 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    [[1, 1], [2, 0.42], [3, 0.16], [4, 0.08], [5.02, 0.035]].forEach(([mul, amp], i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = f * mul * (1 + 0.0007 * i);
      g.gain.value = amp;
      o.connect(g).connect(lp);
      o.start(at); o.stop(at + decay + 0.05);
    });
    lp.connect(out); out.connect(this.master); out.connect(this.wet);
  }

  /** Composes one 8th note at a time: a bass note on the downbeat, broken chords and a wandering melody on top. */
  schedule() {
    const m = MOODS[mood] || MOODS.rolig;
    const eighth = 60 / m.bpm / 2;
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;   // after a pause in a background tab
    while (this.nextTime < this.ctx.currentTime + 0.6) {
      const t = this.nextTime;
      const chord = m.prog[this.bar % m.prog.length].map(x => x + m.key);
      const pos = this.step % 8;
      const human = (Math.random() - 0.5) * 0.018;
      if (pos === 0) {
        this.note(chord[0] - 24, t, 0.5, 4.2);
        if (Math.random() < 0.7) this.note(chord[0] - 12, t + 0.01, 0.32, 3.6);
      }
      const arp = [1, 2, 3, 2, 1, 2, 3, 2];
      if (pos !== 0 && Math.random() < 0.55 + m.density * 0.4) this.note(chord[arp[pos]] - 12 + (pos > 3 && Math.random() < 0.3 ? 12 : 0), t + human, 0.26 + Math.random() * 0.1, 2.2);
      if ((pos % 2 === 0 || Math.random() < m.density * 0.4) && Math.random() < m.density) {
        const base = m.key + 12, pool = [];
        for (let o = 0; o < 2; o++) for (const sc of m.scale) pool.push(base + sc + o * 12);
        let n;
        if (pos === 0 || this.last == null || Math.random() < 0.15) n = chord[1 + Math.floor(Math.random() * 3)] + 12;   // land on a chord tone
        else {
          const i = pool.reduce((best, x, k) => (Math.abs(x - this.last) < Math.abs(pool[best] - this.last) ? k : best), 0);
          n = pool[Math.max(0, Math.min(pool.length - 1, i + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]))];
        }
        this.last = n;
        this.note(n, t + human, 0.42 + Math.random() * 0.18, pos === 0 ? 3.2 : 2.4);
      }
      this.nextTime += eighth * (pos % 2 ? 0.94 : 1.06);   // a gentle swing
      this.step++;
      if (this.step % 8 === 0) this.bar++;
    }
  }

  /** Composes the richer pieces 8th by 8th: a form of sections (A A B A …), voice-led left hand, and a melody built
   *  from a short motif – stated, moved to the next chord, varied, and brought home on a long note. */
  scheduleRich(m) {
    const r = this.r ||= { sec: 0, bar: 0, step: 0, phrase: null, pBar: 0, lastMel: m.mel, lhCenter: m.key - 7, mood: null };
    if (r.mood !== m) { Object.assign(r, { sec: 0, bar: 0, step: 0, phrase: null, pBar: 0, lastMel: m.mel, lhCenter: m.key - 7, mood: m }); this.rain(!!m.rain); }
    const per = m.meter * 2, eighth = 60 / m.bpm / 2;
    this.roomGain.gain.setTargetAtTime(m.wet ?? 0.4, this.ctx.currentTime, 0.5);
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.6) {
      const t = this.nextTime;
      const secName = m.form[r.sec % m.form.length], prog = m.sections[secName];
      const raw = prog[r.bar % prog.length].map(x => x + m.key);
      // voice leading: put the chord near where the left hand was
      const chord = raw.map(n => n - 12 * Math.round((raw[0] - r.lhCenter) / 12));
      const inPhrase = (r.bar % 4) * per + r.step, phraseLen = 4 * per;
      const arc = 0.78 + 0.22 * Math.sin(Math.PI * inPhrase / phraseLen) + (secName === 'B' ? 0.06 : 0);
      const human = () => (Math.random() - 0.5) * 0.016;
      // left hand
      const pat = LH[m.lh] || LH.flow;
      const cell = pat[r.step % pat.length];
      if (cell) for (const [ci, oct] of cell) {
        const n = chord[ci % chord.length] + 12 * (oct + 1) + (ci >= chord.length ? 12 : 0);
        this.richNote(n, t + human(), (r.step === 0 ? 0.42 : 0.3) * arc + Math.random() * 0.05, r.step === 0 ? 3.8 : 2.6);
      }
      if (r.step === 0 && m.pad) this.pad(chord.slice(0, 3).map(n => n + 12), t, per * eighth);
      // melody: a new phrase plan every 4 bars
      if (r.step === 0 && r.bar % 4 === 0) r.phrase = this.plan(m, per);
      for (const ev of r.phrase.filter(e => e.bar === r.bar % 4 && e.pos === r.step)) {
        if (!ev.keep && Math.random() > 0.35 + m.density * 0.65) continue;
        const n = this.pitch(m, ev.deg, raw, ev.strong);
        r.lastMel = n;
        this.richNote(n, t + human() + (ev.pos % 2 ? m.swing * eighth : 0), Math.min(0.9, (0.48 + Math.random() * 0.12) * arc * (ev.strong ? 1.08 : 1)), Math.max(1.6, ev.len * eighth * 2.4));
      }
      // timing: swing, and a small slowing down at the end of each phrase
      let d = eighth * (m.swing ? (r.step % 2 ? 1 - m.swing : 1 + m.swing) : 1);
      if (inPhrase >= phraseLen - 2) d *= 1 + (m.rubato || 0) * (inPhrase - phraseLen + 3);
      this.nextTime += d * (1 + (Math.random() - 0.5) * (m.rubato || 0) * 0.3);
      r.lhCenter = Math.max(m.key - 12, Math.min(m.key, chord[0]));
      if (++r.step >= per) {
        r.step = 0; r.bar++;
        if (r.bar % prog.length === 0) { r.sec++; r.bar = 0; }
      }
    }
  }

  /** Four bars of melody: motif, the motif moved, a variation, and an ending on a long note. */
  plan(m, per) {
    const rhythms = RHYTHMS[m.meter] || RHYTHMS[4];
    const rh = rhythms[Math.floor(Math.random() * rhythms.length)];
    let deg = Math.floor(Math.random() * 3);
    const shape = rh.map((_, i) => (i === 0 ? 0 : [-2, -1, -1, 1, 1, 2, 3][Math.floor(Math.random() * 7)]));
    const out = [];
    const bar = (b, shift, vary) => {
      let d = deg + shift;
      rh.forEach(([pos, len], i) => {
        d += vary && i > 0 && Math.random() < 0.4 ? -shape[i] : shape[i];
        out.push({ bar: b, pos, len, deg: d, strong: pos === 0 || pos === per / 2, keep: i === 0 });
      });
    };
    bar(0, 0, false);
    bar(1, [1, 2, -1][Math.floor(Math.random() * 3)], false);
    bar(2, 0, true);
    out.push({ bar: 3, pos: 0, len: per - 1, deg: 0, strong: true, keep: true, home: true });   // come home
    if (Math.random() < 0.6) out.push({ bar: 3, pos: per - 2, len: 2, deg: 2, strong: false, keep: false });
    return out;
  }

  /** Scale step → note; on strong beats the nearest chord tone, so the melody fits the harmony. */
  pitch(m, deg, chord, strong) {
    const sc = m.scale, L = sc.length;
    const oct = Math.floor(deg / L), i = ((deg % L) + L) % L;
    let n = m.key + 12 + sc[i] + 12 * oct;
    while (n < m.mel - 9) n += 12;
    while (n > m.mel + 12) n -= 12;
    if (strong) {
      let best = n, bd = 99;
      for (const c of chord) for (let o = -2; o <= 3; o++) { const x = c + 12 * o; if (Math.abs(x - n) < bd && x >= m.mel - 9 && x <= m.mel + 12) { bd = Math.abs(x - n); best = x; } }
      n = best;
    }
    return n;
  }

  tick() {
    const m = MOODS[mood] || MOODS.rolig;
    if (m.rich) this.scheduleRich(m);
    else { if (this.rainNode) this.rain(false); this.schedule(); }
  }

  run() { clearInterval(this.timer); this.reset(); this.timer = setInterval(() => this.tick(), 120); this.tick(); }
  halt() { clearInterval(this.timer); this.timer = 0; this.rain(false); }
}

let ctx = null, out = null, player = null, playing = false;
let mood = read().mood || 'rolig', volume = read().volume ?? 0.35;
const listeners = new Set();
const emit = () => listeners.forEach(f => { try { f({ playing, mood, volume }); } catch { /* */ } });
export const onPiano = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isPlaying = () => playing;
export const getMood = () => mood;
export const getVolume = () => volume;
/** Did the user turn it on last time? (It is never on by default.) */
export const wanted = () => !!read().on;

export async function start(m) {
  if (m && MOODS[m]) { mood = m; save({ mood }); }
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain(); out.gain.value = 0.0001; out.connect(ctx.destination);
    player = new Player(ctx, out);
  }
  try { await ctx.resume(); } catch { /* */ }
  save({ on: true });
  if (playing) { emit(); return; }
  playing = true;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), ctx.currentTime + 2);
  player.run();
  emit();
}

/** Pause. remember=false is used while a call is going (the music comes back afterwards). */
export function stop({ remember = true } = {}) {
  if (remember) save({ on: false });
  if (!playing) { emit(); return; }
  playing = false;
  player.halt();
  const t = ctx.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  emit();
}

export const toggle = () => (playing ? stop() : start());

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v)));
  save({ volume });
  if (ctx && playing) out.gain.setTargetAtTime(Math.max(0.0001, volume), ctx.currentTime, 0.1);
  emit();
}

export function setMood(m) { if (!MOODS[m]) return; mood = m; save({ mood }); emit(); }

/** The piano as a source inside another AudioContext (music in calls). Returns { node, stop }. */
export function output(otherCtx) {
  const g = otherCtx.createGain();
  const p = new Player(otherCtx, g);
  p.run();
  return { node: g, stop: () => { p.halt(); try { g.disconnect(); } catch { /* */ } } };
}
