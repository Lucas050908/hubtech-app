/**
 * Pixelværksted – draw pixel art: pen, fill, eraser, colour picker, mirror drawing, frames for small animations,
 * save as PNG (sharp, scaled up) or use the picture as your profile picture.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { store as appStore } from '../core/store.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import * as P from '../features/pixels.js';

const TOOLS = [['pen', 'Blyant', 'edit'], ['fill', 'Fyld', 'paint'], ['erase', 'Viskelæder', 'eraser'], ['pick', 'Pipette', 'eye']];
/** draw frame → canvas (scale = pixel size) */
function render(cv, w, hh, px, scale, { grid = false, bg = true, onion = null } = {}) {
  cv.width = w * scale; cv.height = hh * scale;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  if (bg) for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { g.fillStyle = (x + y) % 2 ? '#2a2f3a' : '#353b48'; g.fillRect(x * scale, y * scale, scale, scale); }
  if (onion) { g.globalAlpha = 0.25; onion.forEach((c, i) => { if (c) { g.fillStyle = c; g.fillRect((i % w) * scale, Math.floor(i / w) * scale, scale, scale); } }); g.globalAlpha = 1; }
  px.forEach((c, i) => { if (c) { g.fillStyle = c; g.fillRect((i % w) * scale, Math.floor(i / w) * scale, scale, scale); } });
  if (grid && scale >= 8) {
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.beginPath();
    for (let k = 1; k < w; k++) { g.moveTo(k * scale + 0.5, 0); g.lineTo(k * scale + 0.5, cv.height); }
    for (let k = 1; k < hh; k++) { g.moveTo(0, k * scale + 0.5); g.lineTo(cv.width, k * scale + 0.5); }
    g.stroke();
  }
}
const toBlob = (cv) => new Promise(r => cv.toBlob(r, 'image/png'));

export default {
  title: 'Pixelværksted',
  destroy() { clearInterval(this._play); removeEventListener('keydown', this._k); removeEventListener('pointerup', this._up); },
  async render() {
    const app = appById('pixels');
    let store;
    try { store = await appState('pixels', { current: null, gallery: [], color: '#ff004d', recent: [] }); } catch (e) { return loadError('Pixelværksted', e); }
    const st = store.data, self = this;
    st.gallery = st.gallery || []; st.recent = st.recent || [];
    let art = P.unpack(st.current?.art) || { w: 16, h: 16, fps: 6, frames: [P.blank(16)] };
    let name = st.current?.name || '', id = st.current?.id || null;
    let frame = 0, tool = 'pen', color = st.color || '#ff004d', mirror = false, grid = true, onion = false;
    let undo = [], redo = [], down = false, lastI = -1;
    const persist = () => { st.current = { id, name, art: P.pack(art) }; st.color = color; store.save(); };
    const px = () => art.frames[frame];
    const setPx = (np) => { art.frames[frame] = np; };
    const snap = () => { undo.push(JSON.stringify({ frames: art.frames, frame })); if (undo.length > 60) undo.shift(); redo = []; };
    const restore = (s) => { const o = JSON.parse(s); art.frames = o.frames; frame = Math.min(o.frame, art.frames.length - 1); };

    const cv = h('canvas', { class: 'px-canvas', role: 'img', 'aria-label': 'Tegneflade', style: { touchAction: 'none' } });
    const SCALE = () => Math.floor(Math.min(560, Math.max(260, innerWidth - 60)) / art.w);
    function draw() { render(cv, art.w, art.h, px(), SCALE(), { grid, onion: onion && frame > 0 ? art.frames[frame - 1] : null }); drawFrames(); drawPreview(); }
    function idx(e) {
      const r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * art.w), y = Math.floor((e.clientY - r.top) / r.height * art.h);
      return x < 0 || y < 0 || x >= art.w || y >= art.h ? -1 : y * art.w + x;
    }
    function apply(i) {
      if (i < 0) return;
      if (tool === 'pick') { const c = px()[i]; if (c) { setColor(c); toolSeg.setValue('pen'); tool = 'pen'; } return; }
      if (tool === 'fill') { setPx(P.fill(px(), art.w, art.h, i, color)); if (mirror) setPx(P.fill(px(), art.w, art.h, P.mirrorOf(i, art.w), color)); persist(); draw(); return; }
      const c = tool === 'erase' ? '' : color;
      const cells = lastI >= 0 ? P.line(lastI, i, art.w) : [i];
      let next = px();
      for (const k of cells) next = P.paint(next, art.w, k, c, mirror);
      setPx(next); lastI = i; draw();
    }
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); snap(); down = true; lastI = -1; apply(idx(e)); if (tool !== 'pen' && tool !== 'erase') down = false; });
    cv.addEventListener('pointermove', (e) => { if (down) apply(idx(e)); });
    self._up = () => { if (down) { down = false; lastI = -1; persist(); if (tool !== 'pick') rememberColor(); } };
    addEventListener('pointerup', self._up);

    // ── colours ──
    const colorIn = h('input', { type: 'color', value: color, 'aria-label': 'Vælg en farve' });
    const pal = h('div', { class: 'px-pal' });
    function rememberColor() { if (tool === 'erase' || P.PALETTE.includes(color)) return; st.recent = [color, ...st.recent.filter(c => c !== color)].slice(0, 8); store.save(); drawPal(); }
    function setColor(c) { color = c; colorIn.value = c; if (tool === 'erase' || tool === 'pick') { tool = 'pen'; toolSeg.setValue('pen'); } drawPal(); }
    function drawPal() {
      h(clear(pal), null, [...P.PALETTE, ...st.recent].map(c => h('button', { class: ['px-swatch', c === color && 'is-on'], style: { background: c }, 'aria-label': `Farve ${c}`, title: c, onclick: () => setColor(c) })),
        h('label', { class: 'px-swatch px-custom', title: 'Egen farve' }, icon('plus'), colorIn));
    }
    colorIn.addEventListener('input', () => setColor(colorIn.value));

    // ── frames ──
    const framesBox = h('div', { class: 'px-frames' });
    const preview = h('canvas', { class: 'px-preview', 'aria-label': 'Forhåndsvisning af animationen' });
    let pf = 0;
    function drawPreview() { if (art.frames.length < 2) render(preview, art.w, art.h, px(), 4, { bg: false }); }
    function drawFrames() {
      h(clear(framesBox), null, art.frames.map((f, i) => {
        const c = h('canvas', { class: 'px-thumb' }); render(c, art.w, art.h, f, 3);
        return h('button', { class: ['px-frame', i === frame && 'is-on'], 'aria-label': `Billede ${i + 1}`, onclick: () => { frame = i; draw(); } }, c, h('span', null, String(i + 1)));
      }),
      art.frames.length < 12 ? h('button', { class: 'px-frame is-add', 'aria-label': 'Nyt billede (kopi)', title: 'Nyt billede – en kopi af det, du er på', onclick: () => { snap(); art.frames.splice(frame + 1, 0, [...px()]); frame++; persist(); draw(); } }, icon('plus')) : null);
    }
    clearInterval(self._play);
    self._play = setInterval(() => {
      if (!document.body.contains(cv) || art.frames.length < 2) return;
      pf = (pf + 1) % art.frames.length; render(preview, art.w, art.h, art.frames[pf], 4, { bg: false });
    }, 1000 / 6);
    const fpsSel = h('select', { class: 'select', 'aria-label': 'Billeder pr. sekund' }, [2, 4, 6, 8, 12].map(n => h('option', { value: n, selected: n === art.fps }, `${n} billeder/sek.`)));
    fpsSel.addEventListener('change', () => { art.fps = Number(fpsSel.value); clearInterval(self._play); self._play = setInterval(() => { if (!document.body.contains(cv) || art.frames.length < 2) return; pf = (pf + 1) % art.frames.length; render(preview, art.w, art.h, art.frames[pf], 4, { bg: false }); }, 1000 / art.fps); persist(); });

    // ── tools ──
    const toolSeg = segmented(TOOLS.map(([value, label, ic]) => ({ value, label, icon: ic })), tool, (v) => { tool = v; }, { label: 'Værktøj' });
    const toggle = (label, ic, get, set) => { const b = h('button', { class: ['btn btn-sm', get() && 'btn-primary'], 'aria-pressed': String(get()), onclick: () => { set(!get()); b.classList.toggle('btn-primary', get()); b.setAttribute('aria-pressed', String(get())); draw(); } }, icon(ic), label); return b; };
    const act = (label, ic, fn, title) => h('button', { class: 'btn btn-sm', title: title || label, onclick: fn }, icon(ic), label);
    const doUndo = () => { if (!undo.length) return; redo.push(JSON.stringify({ frames: art.frames, frame })); restore(undo.pop()); persist(); draw(); };
    const doRedo = () => { if (!redo.length) return; undo.push(JSON.stringify({ frames: art.frames, frame })); restore(redo.pop()); persist(); draw(); };
    self._k = (e) => {
      if (!document.body.contains(cv) || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
      const k = { b: 'pen', f: 'fill', e: 'erase', i: 'pick' }[e.key.toLowerCase()];
      if (k && !e.ctrlKey && !e.metaKey) { tool = k; toolSeg.setValue(k); }
    };
    addEventListener('keydown', self._k);

    // ── save, export, profile picture ──
    const nameIn = h('input', { class: 'input', value: name, maxlength: 40, placeholder: 'Navn på tegningen', 'aria-label': 'Navn på tegningen' });
    nameIn.addEventListener('input', () => { name = nameIn.value; persist(); });
    const gallery = h('div', { class: 'px-gallery' });
    function drawGallery() {
      h(clear(gallery), null, st.gallery.length ? st.gallery.map(g => {
        const a = P.unpack(g.art); if (!a) return null;
        const c = h('canvas', { class: 'px-gthumb' }); render(c, a.w, a.h, a.frames[0], Math.max(2, Math.floor(64 / a.w)), { bg: false });
        return h('div', { class: 'px-gitem' }, h('button', { class: 'px-gopen', 'aria-label': `Åbn ${g.name}`, onclick: () => { art = a; name = g.name; id = g.id; nameIn.value = name; frame = 0; undo = []; redo = []; fpsSel.value = String(a.fps); persist(); draw(); scrollTo({ top: 0, behavior: 'smooth' }); } }, c, h('span', null, g.name), a.frames.length > 1 ? h('small', { class: 'faint' }, `${a.frames.length} billeder`) : null),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${g.name}`, onclick: async () => { if (await confirmDialog({ title: `Slet “${g.name}”?`, confirmLabel: 'Slet', danger: true })) { st.gallery = st.gallery.filter(x => x !== g); store.save(); drawGallery(); } } }, icon('trash')));
      }) : h('p', { class: 'faint', style: { margin: 0 } }, 'Gem dine tegninger, så kommer de her.'));
    }
    function saveArt() {
      name = nameIn.value.trim() || `Tegning ${st.gallery.length + 1}`; nameIn.value = name;
      id = id || Date.now().toString(36);
      const entry = { id, name, art: P.pack(art), at: Date.now() };
      st.gallery = [entry, ...st.gallery.filter(x => x.id !== id)].slice(0, 60);
      persist(); drawGallery(); toast(`“${name}” er gemt`, { type: 'ok' });
    }
    async function download(all) {
      const scale = Math.max(8, Math.floor(512 / art.w)), list = all ? art.frames : [px()];
      const c = document.createElement('canvas');
      if (all && list.length > 1) {      // a sprite sheet: all frames side by side
        c.width = art.w * scale * list.length; c.height = art.h * scale;
        const g = c.getContext('2d'), one = document.createElement('canvas');
        list.forEach((f, i) => { render(one, art.w, art.h, f, scale, { bg: false }); g.drawImage(one, i * art.w * scale, 0); });
      } else render(c, art.w, art.h, list[0], scale, { bg: false });
      const blob = await toBlob(c);
      const a = h('a', { href: URL.createObjectURL(blob), download: `${(name || 'pixelkunst').replace(/[^\wæøåÆØÅ -]+/g, '').trim() || 'pixelkunst'}${all && list.length > 1 ? '-alle-billeder' : ''}.png` });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    async function asAvatar() {
      if (!px().some(Boolean)) { toast('Tegn noget først', { type: 'warn' }); return; }
      if (!await confirmDialog({ title: 'Brug som profilbillede?', text: 'Tegningen bliver dit profilbillede overalt i HUBTECH. Gennemsigtige felter bliver mørkeblå.', confirmLabel: 'Brug den' })) return;
      const c = document.createElement('canvas'), scale = Math.floor(256 / art.w);
      render(c, art.w, art.h, px(), scale, { bg: false });
      const out = document.createElement('canvas'); out.width = out.height = 256;
      const g = out.getContext('2d'); g.fillStyle = '#1d2b53'; g.fillRect(0, 0, 256, 256); g.imageSmoothingEnabled = false;
      g.drawImage(c, Math.floor((256 - c.width) / 2), Math.floor((256 - c.height) / 2));
      try {
        const r = await fetch('/api/me/avatar', { method: 'POST', body: await toBlob(out), headers: { 'Content-Type': 'image/png', 'X-Requested-With': 'hubtech' }, credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Det mislykkedes');
        appStore.set('user', d.user); toast('Dit nye profilbillede er klar', { type: 'ok' });
      } catch (e) { toast('Kunne ikke skifte profilbillede', { type: 'bad', text: e.message }); }
    }
    async function newArt(size) {
      if (art.frames.some(f => f.some(Boolean)) && !await confirmDialog({ title: 'Start en ny tegning?', text: 'Gem den, du er i gang med, først, hvis du vil beholde den.', confirmLabel: 'Ny tegning' })) return;
      art = { w: size, h: size, fps: 6, frames: [P.blank(size)] }; frame = 0; name = ''; id = null; nameIn.value = ''; undo = []; redo = []; persist(); draw();
    }

    drawPal(); draw(); drawGallery();
    return h('div', { class: 'page px-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Kreativt', title: 'Pixelværksted', lead: 'Tegn pixelkunst og små animationer. Gem som PNG, eller brug tegningen som dit profilbillede.', compact: true }),
      h('div', { class: 'px-wrap' },
        h('div', { class: 'px-stage' },
          h('div', { class: 'px-tools' }, toolSeg,
            toggle('Spejl', 'layers', () => mirror, (v) => { mirror = v; }),
            toggle('Gitter', 'grid', () => grid, (v) => { grid = v; }),
            toggle('Løgskind', 'eye', () => onion, (v) => { onion = v; })),
          h('div', { class: 'px-canvas-wrap' }, cv),
          pal,
          h('div', { class: 'px-tools' },
            act('Fortryd', 'undo', doUndo, 'Fortryd (Ctrl+Z)'), act('Gentag', 'redo', doRedo, 'Gentag (Ctrl+Y)'),
            act('Vend', 'refresh', () => { snap(); setPx(P.flipH(px(), art.w)); persist(); draw(); }, 'Vend vandret'),
            act('', 'arrowLeft', () => { snap(); setPx(P.shift(px(), art.w, art.h, -1, 0)); persist(); draw(); }, 'Flyt til venstre'),
            act('', 'arrowRight', () => { snap(); setPx(P.shift(px(), art.w, art.h, 1, 0)); persist(); draw(); }, 'Flyt til højre'),
            act('Ryd', 'trash', async () => { if (await confirmDialog({ title: 'Ryd billedet?', confirmLabel: 'Ryd', danger: true })) { snap(); setPx(P.blank(art.w, art.h)); persist(); draw(); } }))),
        h('div', { class: 'px-side' },
          panel('Animation', 'play', framesBox, h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' } }, preview, fpsSel,
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { if (art.frames.length < 2) return; snap(); art.frames.splice(frame, 1); frame = Math.max(0, frame - 1); persist(); draw(); } }, icon('trash'), 'Slet billede'))),
          panel('Gem', 'download', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, nameIn, h('button', { class: 'btn btn-primary', onclick: saveArt }, icon('check'), 'Gem')),
            h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', onclick: () => download(false) }, icon('image'), 'PNG'),
              h('button', { class: 'btn btn-sm', onclick: () => download(true) }, icon('layers'), 'Alle billeder'),
              h('button', { class: 'btn btn-sm', onclick: asAvatar }, icon('user'), 'Brug som profilbillede')),
            h('div', { class: 'row-actions' }, h('span', { class: 'faint' }, 'Ny:'), P.SIZES.map(s => h('button', { class: 'btn btn-sm btn-ghost', onclick: () => newArt(s) }, `${s} × ${s}`)))),
          panel('Dine tegninger', 'image', gallery))));
  },
};
