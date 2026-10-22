/**
 * Beatboks – pure logic (unit-tested in tests/apps.test.mjs): the pattern, timing with swing, presets and share codes.
 * All sounds are synthesised in the browser (see pages/beats.js) – no samples, nothing copyrighted.
 */
export const STEPS = 16;
export const DRUMS = [
  { id: 'kick', name: 'Stortromme' }, { id: 'snare', name: 'Lilletromme' }, { id: 'clap', name: 'Klap' }, { id: 'hat', name: 'Hihat' },
  { id: 'open', name: 'Åben hihat' }, { id: 'tom', name: 'Tam' }, { id: 'rim', name: 'Kant' }, { id: 'cow', name: 'Koklokke' },
];
// melody: two octaves of A minor pentatonic (MIDI), highest first like a piano roll
export const MELODY = [84, 81, 79, 76, 74, 72, 69, 67, 64, 62, 60, 57].map(n => n);
export const BASS = [45, 43, 40, 38, 36, 33];
export const noteName = (m) => `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'][m % 12]}${Math.floor(m / 12) - 1}`;
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export function emptyPattern() {
  return { bpm: 100, swing: 0, kit: 'classic', synth: 'pluk',
    drums: Object.fromEntries(DRUMS.map(d => [d.id, Array(STEPS).fill(0)])),
    melody: MELODY.map(() => Array(STEPS).fill(0)), bass: BASS.map(() => Array(STEPS).fill(0)) };
}
/** when step i starts, in seconds from the start of the bar; swing pushes every second 16th later */
export function stepTime(i, bpm, swing = 0) {
  const d = 60 / bpm / 4;
  return i * d + (i % 2 ? d * Math.min(0.6, Math.max(0, swing)) * 0.5 : 0);
}
export const barSecs = (bpm) => (60 / bpm) * 4;
/** what plays on step i → { drums: [ids], melody: [midi], bass: [midi] } */
export function hits(p, i) {
  return {
    drums: DRUMS.filter(d => p.drums[d.id]?.[i]).map(d => d.id),
    melody: MELODY.filter((_, r) => p.melody[r]?.[i]),
    bass: BASS.filter((_, r) => p.bass[r]?.[i]),
  };
}
export const countNotes = (p) => Object.values(p.drums).flat().filter(Boolean).length + p.melody.flat().filter(Boolean).length + p.bass.flat().filter(Boolean).length;

// ── presets (simple, generic grooves) ──
const row = (s) => [...s].map(c => (c === 'x' ? 1 : 0));
function preset(bpm, swing, d, mel = [], bass = []) {
  const p = emptyPattern(); p.bpm = bpm; p.swing = swing;
  for (const [id, s] of Object.entries(d)) p.drums[id] = row(s);
  mel.forEach(([note, s]) => { const r = MELODY.indexOf(note); if (r >= 0) p.melody[r] = row(s); });
  bass.forEach(([note, s]) => { const r = BASS.indexOf(note); if (r >= 0) p.bass[r] = row(s); });
  return p;
}
export const PRESETS = {
  boom: { name: 'Hiphop', make: () => preset(90, 0.3, { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, [[69, 'x.......'.padEnd(16, '.')], [72, '...x....'.padEnd(16, '.')], [76, '......x.........'], [74, '..........x.....']], [[33, 'x.........x.....'], [36, '......x.........']]) },
  house: { name: 'House', make: () => preset(124, 0, { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', open: '..x.......x.....' }, [[72, '..x...x.....x...'], [76, '..x...x.....x...']], [[33, 'x..x..x.x..x..x.']]) },
  rock: { name: 'Rock', make: () => preset(112, 0, { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', tom: '..............xx' }, [], [[33, 'x.x.x.x.'.padEnd(16, '.')], [40, '........x.x.x.x.']]) },
  lofi: { name: 'Lofi', make: () => { const p = preset(76, 0.45, { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', rim: '...........x....' }, [[76, 'x...............'], [72, '....x...........'], [74, '........x.......'], [69, '............x...']], [[33, 'x...............'], [38, '........x.......']]); p.kit = 'lofi'; p.synth = 'blød'; return p; } },
  dance: { name: 'Latin', make: () => preset(96, 0.1, { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.', cow: 'x..x..x...x..x..' }, [[79, '...x..x....x..x.'], [76, 'x.........x.....']], [[33, 'x..x..x.x..x..x.']]) },
};

// ── share codes: everything in one short text you can send to a friend ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function bitsToText(bits) { let s = ''; for (let i = 0; i < bits.length; i += 6) { let v = 0; for (let k = 0; k < 6; k++) v = v * 2 + (bits[i + k] ? 1 : 0); s += B64[v]; } return s; }
function textToBits(s, n) { const bits = []; for (const c of s) { const v = B64.indexOf(c); if (v < 0) throw new Error('bad'); for (let k = 5; k >= 0; k--) bits.push((v >> k) & 1); } return bits.slice(0, n); }
const KITS = ['classic', 'lofi', 'elektro'], SYNTHS = ['pluk', 'blød', 'bly'];
export function encode(p) {
  const bits = [...DRUMS.flatMap(d => p.drums[d.id]), ...p.melody.flat(), ...p.bass.flat()];
  return `1.${p.bpm}.${Math.round(p.swing * 100)}.${Math.max(0, KITS.indexOf(p.kit))}${Math.max(0, SYNTHS.indexOf(p.synth))}.${bitsToText(bits)}`;
}
/** → a pattern, or null if the code is broken */
export function decode(code) {
  try {
    const [v, bpm, swing, ks, data] = String(code || '').trim().split('.');
    if (v !== '1' || !data) return null;
    const n = (DRUMS.length + MELODY.length + BASS.length) * STEPS, bits = textToBits(data, n);
    if (bits.length < n) return null;
    const p = emptyPattern();
    p.bpm = Math.min(200, Math.max(50, Number(bpm) || 100)); p.swing = Math.min(0.6, Math.max(0, (Number(swing) || 0) / 100));
    p.kit = KITS[Number(ks?.[0])] || 'classic'; p.synth = SYNTHS[Number(ks?.[1])] || 'pluk';
    let k = 0;
    DRUMS.forEach(d => { p.drums[d.id] = bits.slice(k, k + STEPS); k += STEPS; });
    p.melody = MELODY.map(() => { const r = bits.slice(k, k + STEPS); k += STEPS; return r; });
    p.bass = BASS.map(() => { const r = bits.slice(k, k + STEPS); k += STEPS; return r; });
    return p;
  } catch { return null; }
}
/** WAV file bytes from mono float samples (for "Gem som lydfil") */
export function wav(samples, rate = 44100) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Uint8Array(buf);
}
