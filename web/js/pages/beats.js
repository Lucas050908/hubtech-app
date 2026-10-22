/**
 * Beatboks – a step sequencer: drums, melody and bass on a 16-step grid, played live in the browser.
 * Every sound is synthesised with Web Audio (no samples). Share a beat as a link, or save it as a WAV file.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy } from '../features/appkit.js';
import * as B from '../features/beats.js';

// ── the sounds ──
let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}
function env(ctx, out, t, peak, decay, attack = 0.002) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out); return g;
}
function osc(ctx, type, f, t, dur, to) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6); o.start(t); o.stop(t + dur + 0.05); return o; }
function noiseSrc(ctx, t, dur) { const s = ctx.createBufferSource(); s.buffer = noise(ctx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return s; }
function filt(ctx, type, f, q = 1) { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
function drum(ctx, out, id, t, kit) {
  const el = kit === 'elektro';
  if (id === 'kick') { osc(ctx, 'sine', el ? 180 : 150, t, el ? 0.5 : 0.35, 42).connect(env(ctx, out, t, 1, el ? 0.5 : 0.35)); return; }
  if (id === 'snare') { const f = filt(ctx, 'highpass', 1200); noiseSrc(ctx, t, 0.2).connect(f); f.connect(env(ctx, out, t, 0.6, 0.18)); osc(ctx, 'triangle', 190, t, 0.1, 150).connect(env(ctx, out, t, 0.5, 0.08)); return; }
  if (id === 'clap') { const f = filt(ctx, 'bandpass', 1500, 0.8); f.connect(out); [0, 0.011, 0.022].forEach((d, i) => { const g = env(ctx, f, t + d, i === 2 ? 0.9 : 0.6, i === 2 ? 0.16 : 0.01); noiseSrc(ctx, t + d, 0.2).connect(g); }); return; }
  if (id === 'hat' || id === 'open') { const f = filt(ctx, 'highpass', el ? 9000 : 7000); noiseSrc(ctx, t, 0.4).connect(f); f.connect(env(ctx, out, t, id === 'open' ? 0.3 : 0.25, id === 'open' ? 0.32 : el ? 0.03 : 0.05)); return; }
  if (id === 'tom') { osc(ctx, 'sine', 210, t, 0.3, 110).connect(env(ctx, out, t, 0.7, 0.3)); return; }
  if (id === 'rim') { const f = filt(ctx, 'bandpass', 1800, 4); osc(ctx, 'square', 1700, t, 0.04).connect(f); f.connect(env(ctx, out, t, 0.35, 0.035)); return; }
  if (id === 'cow') { const f = filt(ctx, 'bandpass', 800, 2); osc(ctx, 'square', 540, t, 0.3).connect(f); osc(ctx, 'square', 800, t, 0.3).connect(f); f.connect(env(ctx, out, t, 0.25, 0.28)); }
}
function note(ctx, out, midi, t, dur, kind) {
  const f = B.midiToHz(midi);
  if (kind === 'bass') { const lp = filt(ctx, 'lowpass', 700, 2); osc(ctx, 'sawtooth', f, t, dur).connect(lp); lp.connect(env(ctx, out, t, 0.45, dur, 0.005)); return; }
  if (kind === 'blød') { const g = env(ctx, out, t, 0.18, dur * 1.6, 0.04); osc(ctx, 'sine', f, t, dur * 1.8).connect(g); osc(ctx, 'triangle', f * 2, t, dur * 1.8).connect(env(ctx, out, t, 0.05, dur * 1.2, 0.04)); return; }
  if (kind === 'bly') { const lp = filt(ctx, 'lowpass', 2400, 3); osc(ctx, 'square', f, t, dur).connect(lp); lp.connect(env(ctx, out, t, 0.12, dur, 0.01)); return; }
  const lp = filt(ctx, 'lowpass', 3000, 1); lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);    // 'pluk'
  osc(ctx, 'sawtooth', f, t, 0.6).connect(lp); osc(ctx, 'triangle', f, t, 0.6).connect(lp); lp.connect(env(ctx, out, t, 0.2, 0.45));
}
function playStep(ctx, out, p, i, t) {
  const x = B.hits(p, i), d = 60 / p.bpm / 4;
  x.drums.forEach(id => drum(ctx, out, id, t, p.kit));
  x.melody.forEach(m => note(ctx, out, m, t, d * 1.8, p.synth));
  x.bass.forEach(m => note(ctx, out, m, t, d * 1.6, 'bass'));
}
function chain(ctx, kit, vol) {
  const master = ctx.createGain(); master.gain.value = vol;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  if (kit === 'lofi') { const lp = filt(ctx, 'lowpass', 3200, 0.7); master.connect(lp); lp.connect(comp); } else master.connect(comp);
  comp.connect(ctx.destination);
  return master;
}

export default {
  title: 'Beatboks',
  destroy() { this._stop?.(); removeEventListener('keydown', this._k); removeEventListener('pointerup', this._up); },
  async render(ctx) {
    const app = appById('beats');
    let store;
    try { store = await appState('beats', { current: null, saved: [], vol: 0.8, name: '' }); } catch (e) { return loadError('Beatboks', e); }
    const st = store.data, self = this;
    st.saved = st.saved || [];
    if (ctx?.params?.sub === 'b' && ctx.params.id) {
      const shared = B.decode(ctx.params.id);
      if (shared) { st.current = shared; st.name = 'Delt beat'; store.save(); toast('Et delt beat er åbnet', { type: 'ok', text: 'Tryk på afspil – og lav det om, hvis du vil.' }); }
      else toast('Linket til beatet virker ikke', { type: 'warn' });
      history.replaceState(null, '', '#/apps/beats');
    }
    if (!st.current) st.current = B.PRESETS.boom.make();
    let p = st.current;
    let actx = null, master = null, timer = 0, raf = 0, nextStep = 0, nextTime = 0, queue = [], playing = false, paint = null;
    const save = () => { st.current = p; store.save(); };

    // ── playback ──
    function ensureCtx() {
      if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      if (actx.state === 'suspended') actx.resume();
      if (!master || master._kit !== p.kit) { try { master?.disconnect(); } catch { /* */ } master = chain(actx, p.kit, st.vol ?? 0.8); master._kit = p.kit; }
      return actx;
    }
    function tick() {
      const c = actx, d = 60 / p.bpm / 4;
      while (nextTime < c.currentTime + 0.12) {
        const t = nextTime + (nextStep % 2 ? d * Math.min(0.6, p.swing) * 0.5 : 0);
        playStep(c, master, p, nextStep, t);
        queue.push({ step: nextStep, t });
        nextTime += d; nextStep = (nextStep + 1) % B.STEPS;
      }
    }
    function draw() {
      const now = actx.currentTime;
      let cur = null;
      while (queue.length && queue[0].t <= now) cur = queue.shift();
      if (cur) grid.querySelectorAll('.bt-cell.is-now').forEach(x => x.classList.remove('is-now')), grid.querySelectorAll(`[data-step="${cur.step}"]`).forEach(x => x.classList.add('is-now'));
      raf = requestAnimationFrame(draw);
    }
    function play() {
      ensureCtx(); playing = true; nextStep = 0; nextTime = actx.currentTime + 0.06; queue = [];
      clearInterval(timer); timer = setInterval(tick, 25); tick(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
      playBtn.classList.add('is-on'); playBtn.setAttribute('aria-pressed', 'true'); h(clear(playBtn), null, icon('pause'), 'Stop');
    }
    function stop() {
      playing = false; clearInterval(timer); cancelAnimationFrame(raf);
      grid.querySelectorAll('.bt-cell.is-now').forEach(x => x.classList.remove('is-now'));
      playBtn.classList.remove('is-on'); playBtn.setAttribute('aria-pressed', 'false'); h(clear(playBtn), null, icon('play'), 'Afspil');
    }
    self._stop = () => { stop(); try { actx?.close(); } catch { /* */ } };
    const preview = (fn) => { const c = ensureCtx(); fn(c, master, c.currentTime + 0.01); };

    // ── the grid ──
    const grid = h('div', { class: 'bt-grid' });
    function rowEl(label, cells, onPreview, cls, set) {
      return h('div', { class: ['bt-row', cls] },
        h('button', { class: 'bt-label', title: 'Hør lyden', onclick: onPreview }, label),
        h('div', { class: 'bt-cells' }, cells.map((v, i) => h('button', {
          class: ['bt-cell', v && 'is-on', i % 4 === 0 && 'is-beat'], dataset: { step: i }, 'aria-pressed': String(!!v), 'aria-label': `${label}, trin ${i + 1}`,
          onpointerdown: (e) => { e.preventDefault(); paint = cells[i] ? 0 : 1; set(i, paint); },
          onpointerenter: () => { if (paint != null) set(i, paint); },
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(i, cells[i] ? 0 : 1); } } }))));
    }
    function drawGrid() {
      const cellUpdate = (arr, i, v, rowIdx, kind) => {
        if (arr[i] === v) return; arr[i] = v; save();
        const r = grid.querySelectorAll(`.bt-row.${kind}`)[rowIdx]?.querySelectorAll('.bt-cell')[i];
        if (r) { r.classList.toggle('is-on', !!v); r.setAttribute('aria-pressed', String(!!v)); }
        if (v && !playing) preview((c, out, t) => (kind === 'k-drum' ? drum(c, out, B.DRUMS[rowIdx].id, t, p.kit) : note(c, out, (kind === 'k-mel' ? B.MELODY : B.BASS)[rowIdx], t, 0.25, kind === 'k-mel' ? p.synth : 'bass')));
      };
      h(clear(grid), null,
        h('div', { class: 'bt-sec' }, 'Trommer'),
        B.DRUMS.map((d, r) => rowEl(d.name, p.drums[d.id], () => preview((c, out, t) => drum(c, out, d.id, t, p.kit)), 'k-drum', (i, v) => cellUpdate(p.drums[d.id], i, v, r, 'k-drum'))),
        h('div', { class: 'bt-sec' }, 'Melodi'),
        B.MELODY.map((m, r) => rowEl(B.noteName(m), p.melody[r], () => preview((c, out, t) => note(c, out, m, t, 0.3, p.synth)), 'k-mel', (i, v) => cellUpdate(p.melody[r], i, v, r, 'k-mel'))),
        h('div', { class: 'bt-sec' }, 'Bas'),
        B.BASS.map((m, r) => rowEl(B.noteName(m), p.bass[r], () => preview((c, out, t) => note(c, out, m, t, 0.3, 'bass')), 'k-bass', (i, v) => cellUpdate(p.bass[r], i, v, r, 'k-bass'))));
    }
    self._up = () => { paint = null; };
    addEventListener('pointerup', self._up);

    // ── controls ──
    const playBtn = h('button', { class: 'btn btn-primary btn-lg bt-play', 'aria-pressed': 'false', onclick: () => (playing ? stop() : play()) }, icon('play'), 'Afspil');
    const bpmVal = h('b', null, String(p.bpm)), swingVal = h('b', null, `${Math.round(p.swing * 100)} %`);
    const bpm = h('input', { type: 'range', class: 'range', min: 60, max: 180, value: p.bpm, 'aria-label': 'Tempo (BPM)' });
    bpm.addEventListener('input', () => { p.bpm = Number(bpm.value); bpmVal.textContent = bpm.value; save(); });
    const swing = h('input', { type: 'range', class: 'range', min: 0, max: 60, value: Math.round(p.swing * 100), 'aria-label': 'Swing' });
    swing.addEventListener('input', () => { p.swing = Number(swing.value) / 100; swingVal.textContent = `${swing.value} %`; save(); });
    const vol = h('input', { type: 'range', class: 'range', min: 0, max: 100, value: Math.round((st.vol ?? 0.8) * 100), 'aria-label': 'Lydstyrke' });
    vol.addEventListener('input', () => { st.vol = Number(vol.value) / 100; if (master) master.gain.value = st.vol; store.save(); });
    const sel = (label, value, opts, fn) => { const s = h('select', { class: 'select', 'aria-label': label }, opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))); s.addEventListener('change', () => fn(s.value)); return s; };
    const kitSel = sel('Trommesæt', p.kit, [['classic', 'Klassisk'], ['elektro', 'Elektro'], ['lofi', 'Lofi (dæmpet)']], (v) => { p.kit = v; save(); if (actx) ensureCtx(); });
    const synthSel = sel('Melodilyd', p.synth, [['pluk', 'Pluk'], ['blød', 'Blød'], ['bly', 'Skarp']], (v) => { p.synth = v; save(); });
    const presetSel = sel('Start fra', '', [['', 'Start fra en rytme …'], ...Object.entries(B.PRESETS).map(([k, x]) => [k, x.name])], async (v) => {
      if (!v) return;
      if (B.countNotes(p) && !await confirmDialog({ title: 'Erstat dit beat?', text: 'Det, du har lavet, bliver erstattet. Gem det først, hvis du vil beholde det.', confirmLabel: 'Erstat' })) { presetSel.value = ''; return; }
      load(B.PRESETS[v].make()); presetSel.value = '';
    });
    function load(np) {
      p = np; save(); bpm.value = p.bpm; bpmVal.textContent = String(p.bpm); swing.value = Math.round(p.swing * 100); swingVal.textContent = `${swing.value} %`;
      kitSel.value = p.kit; synthSel.value = p.synth; if (actx) ensureCtx(); drawGrid();
    }
    const name = h('input', { class: 'input', value: st.name || '', maxlength: 40, placeholder: 'Navn på dit beat', 'aria-label': 'Navn på dit beat' });
    name.addEventListener('input', () => { st.name = name.value; store.save(); });
    const savedBox = h('div', { class: 'bt-saved' });
    function drawSaved() {
      h(clear(savedBox), null, st.saved.length ? st.saved.map(b => h('div', { class: 'bt-saved-item' },
        h('button', { class: 'bt-saved-name', onclick: () => { const x = B.decode(b.code); if (x) { load(x); st.name = b.name; name.value = b.name; store.save(); toast(`“${b.name}” er åbnet`, { type: 'ok' }); } } }, icon('music'), b.name),
        h('button', { class: 'icon-btn btn-sm', 'aria-label': `Kopiér link til ${b.name}`, title: 'Kopiér link', onclick: () => copy(`${location.origin}/#/apps/beats/b/${b.code}`, 'Linket er kopieret – send det til en ven') }, icon('link')),
        h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${b.name}`, onclick: async () => { if (await confirmDialog({ title: `Slet “${b.name}”?`, confirmLabel: 'Slet', danger: true })) { st.saved = st.saved.filter(x => x !== b); store.save(); drawSaved(); } } }, icon('trash')))) : h('p', { class: 'faint', style: { margin: 0 } }, 'Dine gemte beats kommer her.'));
    }
    async function exportWav() {
      const loops = 4, rate = 44100, secs = B.barSecs(p.bpm) * loops + 1;
      const off = new OfflineAudioContext(1, Math.ceil(rate * secs), rate), out = chain(off, p.kit, 0.9), d = 60 / p.bpm / 4;
      for (let n = 0; n < B.STEPS * loops; n++) { const i = n % B.STEPS; playStep(off, out, p, i, n * d + (i % 2 ? d * Math.min(0.6, p.swing) * 0.5 : 0) + 0.02); }
      const t = toast('Laver lydfilen …', { icon: 'music', ms: 30000 });
      try {
        const buf = await off.startRendering();
        const blob = new Blob([B.wav(buf.getChannelData(0), rate)], { type: 'audio/wav' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `${(st.name || 'beat').replace(/[^\wæøåÆØÅ -]+/g, '').trim() || 'beat'}.wav` });
        document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      } finally { t(); }
    }
    self._k = (e) => {
      if (!document.body.contains(grid) || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
    };
    addEventListener('keydown', self._k);
    drawGrid(); drawSaved();
    return h('div', { class: 'page bt-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Kreativt', title: 'Beatboks', lead: 'Byg dit eget beat: klik i gitteret for trommer, melodi og bas. Mellemrum starter og stopper. Al lyd laves i browseren.', compact: true }),
      h('div', { class: 'bt-bar' }, playBtn,
        h('label', { class: 'bt-ctl' }, h('span', { class: 'faint' }, 'Tempo'), bpm, bpmVal),
        h('label', { class: 'bt-ctl' }, h('span', { class: 'faint' }, 'Swing'), swing, swingVal),
        h('label', { class: 'bt-ctl' }, icon('volume'), vol),
        kitSel, synthSel, presetSel,
        h('button', { class: 'btn btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Ryd hele beatet?', confirmLabel: 'Ryd', danger: true })) { const e = B.emptyPattern(); e.bpm = p.bpm; e.kit = p.kit; e.synth = p.synth; load(e); } } }, icon('trash'), 'Ryd')),
      h('div', { class: 'bt-scroll' }, grid),
      panel('Gem og del', 'music',
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, name,
          h('button', { class: 'btn btn-primary', onclick: () => { const n = name.value.trim() || `Beat ${st.saved.length + 1}`; st.saved = [{ id: Date.now().toString(36), name: n, code: B.encode(p) }, ...st.saved.filter(x => x.name !== n)].slice(0, 40); st.name = n; name.value = n; store.save(); drawSaved(); toast(`“${n}” er gemt`, { type: 'ok' }); } }, icon('check'), 'Gem'),
          h('button', { class: 'btn', onclick: () => copy(`${location.origin}/#/apps/beats/b/${B.encode(p)}`, 'Linket er kopieret – send det til en ven i Fællesskab') }, icon('link'), 'Kopiér link'),
          h('button', { class: 'btn', onclick: exportWav }, icon('download'), 'Gem som lydfil')),
        savedBox));
  },
};
