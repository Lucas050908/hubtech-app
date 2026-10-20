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
  }

  reset() { this.nextTime = this.ctx.currentTime + 0.1; this.step = 0; this.bar = 0; this.last = null; }

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

  run() { clearInterval(this.timer); this.reset(); this.timer = setInterval(() => this.schedule(), 120); this.schedule(); }
  halt() { clearInterval(this.timer); this.timer = 0; }
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
