/** Tegnebræt – sketch a network, explain something to a customer, or just draw. Pen, highlighter, eraser, undo, gallery on the account, download as PNG. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';

const W = 1600, H = 1000;
const COLORS = ['#111827', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
const MAX_BYTES = 3_200_000;

export default {
  title: 'Tegnebræt',
  async render() {
    const app = appById('draw');
    let store;
    try { store = await appState('draw', { gallery: [] }); } catch (e) { return loadError('Tegnebræt', e); }
    const st = store.data;
    const cv = h('canvas', { class: 'dr-canvas', width: W, height: H, 'aria-label': 'Tegneflade' });
    const ctx = cv.getContext('2d');
    let tool = 'pen', color = COLORS[0], size = 6, bg = 'white', drawing = false, last = null, currentId = null;
    const undo = [], redo = [];
    const snap = () => { undo.push(ctx.getImageData(0, 0, W, H)); if (undo.length > 30) undo.shift(); redo.length = 0; };
    function paintBg() {
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = bg === 'dark' ? '#0f172a' : '#ffffff'; ctx.fillRect(0, 0, W, H);
      if (bg === 'grid') { ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
      ctx.restore();
    }
    paintBg();
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    function stroke(a, b, pressure) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (tool === 'eraser') { ctx.strokeStyle = bg === 'dark' ? '#0f172a' : '#ffffff'; ctx.lineWidth = size * 4; }
      else if (tool === 'marker') { ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = size * 3; }
      else { ctx.strokeStyle = color; ctx.lineWidth = size * (0.5 + (pressure || 0.5)); }
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.restore();
    }
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); snap(); drawing = true; last = pos(e); stroke(last, [last[0] + 0.1, last[1] + 0.1], e.pressure); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); stroke(last, p, e.pressure); last = p; });
    const up = () => { drawing = false; last = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    const toolBtn = (id, ic, label) => {
      const b = h('button', { class: ['btn btn-sm', id === tool && 'btn-primary'], 'aria-pressed': String(id === tool), dataset: { tool: id } }, icon(ic), label);
      b.addEventListener('click', () => { tool = id; tools.querySelectorAll('[data-tool]').forEach(x => { const on = x.dataset.tool === id; x.classList.toggle('btn-primary', on); x.setAttribute('aria-pressed', String(on)); }); });
      return b;
    };
    const swatches = h('div', { class: 'dr-colors', role: 'radiogroup', 'aria-label': 'Farve' }, COLORS.map(c => {
      const b = h('button', { class: ['dr-sw', c === color && 'is-on'], style: { background: c }, role: 'radio', 'aria-checked': String(c === color), 'aria-label': `Farve ${c}` });
      b.addEventListener('click', () => { color = c; if (tool === 'eraser') tools.querySelector('[data-tool="pen"]').click(); swatches.querySelectorAll('.dr-sw').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', String(x === b)); }); });
      return b;
    }));
    const sizeIn = h('input', { type: 'range', class: 'range', min: 1, max: 24, value: size, 'aria-label': 'Stregtykkelse' });
    sizeIn.addEventListener('input', () => { size = Number(sizeIn.value); });
    const bgSel = h('select', { class: 'select', 'aria-label': 'Baggrund' }, [['white', 'Hvid'], ['grid', 'Ternet'], ['dark', 'Mørk']].map(([v, l]) => h('option', { value: v }, l)));
    bgSel.addEventListener('change', async () => { if (!await confirmDialog({ title: 'Skift baggrund?', text: 'Tegningen ryddes, når baggrunden skiftes.', confirmLabel: 'Skift' })) { bgSel.value = bg; return; } snap(); bg = bgSel.value; paintBg(); });
    const doUndo = () => { if (!undo.length) return; redo.push(ctx.getImageData(0, 0, W, H)); ctx.putImageData(undo.pop(), 0, 0); };
    const doRedo = () => { if (!redo.length) return; undo.push(ctx.getImageData(0, 0, W, H)); ctx.putImageData(redo.pop(), 0, 0); };
    const doClear = async () => { if (await confirmDialog({ title: 'Ryd tegnebrættet?', confirmLabel: 'Ryd', danger: true })) { snap(); paintBg(); currentId = null; } };
    const download = () => { const a = h('a', { href: cv.toDataURL('image/png'), download: `tegning-${new Date().toISOString().slice(0, 10)}.png` }); document.body.append(a); a.click(); a.remove(); };

    const gallery = h('div', { class: 'dr-gallery' });
    function save() {
      const url = cv.toDataURL('image/webp', 0.8);
      const item = { id: currentId || uid(), at: Date.now(), bg, img: url.startsWith('data:image/webp') ? url : cv.toDataURL('image/jpeg', 0.8) };
      st.gallery = [item, ...st.gallery.filter(g => g.id !== item.id)];
      while (JSON.stringify(st.gallery).length > MAX_BYTES && st.gallery.length > 1) st.gallery.pop();
      currentId = item.id; store.save(); drawGallery(); toast('Tegningen er gemt', { type: 'ok', text: 'Den ligger på din konto under Mine tegninger.' });
    }
    function open(g) {
      const im = new Image();
      im.onload = () => { snap(); bg = g.bg || 'white'; bgSel.value = bg; ctx.drawImage(im, 0, 0, W, H); currentId = g.id; };
      im.src = g.img;
      cv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function drawGallery() {
      clear(gallery);
      if (!st.gallery.length) { gallery.append(h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen gemte tegninger endnu.')); return; }
      st.gallery.forEach(g => {
        const del = h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet tegning' }, icon('trash'));
        del.addEventListener('click', async (e) => { e.stopPropagation(); if (await confirmDialog({ title: 'Slet tegningen?', confirmLabel: 'Slet', danger: true })) { st.gallery = st.gallery.filter(x => x.id !== g.id); if (currentId === g.id) currentId = null; store.save(); drawGallery(); } });
        gallery.append(h('div', { class: 'dr-thumb' }, h('button', { class: 'dr-thumb-open', 'aria-label': 'Åbn tegning', onclick: () => open(g) }, h('img', { src: g.img, alt: '' })),
          h('div', { class: 'dr-thumb-bar' }, h('span', { class: 'faint' }, new Date(g.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })), del)));
      });
    }
    const keys = (e) => { if (!document.body.contains(cv)) return removeEventListener('keydown', keys); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } };
    addEventListener('keydown', keys);
    const tools = h('div', { class: 'dr-tools' },
      toolBtn('pen', 'edit', 'Pen'), toolBtn('marker', 'paint', 'Overstreger'), toolBtn('eraser', 'eraser', 'Viskelæder'),
      swatches, h('label', { class: 'dr-size' }, h('span', { class: 'faint' }, 'Tykkelse'), sizeIn), bgSel,
      h('div', { class: 'dr-acts' },
        h('button', { class: 'icon-btn', 'aria-label': 'Fortryd', title: 'Fortryd (Ctrl+Z)', onclick: doUndo }, icon('undo')),
        h('button', { class: 'icon-btn', 'aria-label': 'Gentag', title: 'Gentag (Ctrl+Shift+Z)', onclick: doRedo }, icon('redo')),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: doClear }, icon('trash'), 'Ryd'),
        h('button', { class: 'btn btn-sm', onclick: download }, icon('download'), 'Hent som billede'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: save }, icon('check'), 'Gem')));
    drawGallery();
    return h('div', { class: 'page dr-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Arbejdsrum', title: 'Tegnebræt', lead: 'Tegn et netværk, forklar noget for en kunde, eller lav en hurtig skitse. Virker med mus, finger og pen.', compact: true }),
      panel(null, null, tools, h('div', { class: 'dr-stage' }, cv)),
      panel('Mine tegninger', 'image', gallery));
  },
};
