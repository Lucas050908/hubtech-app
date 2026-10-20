/** HUBTECH Office – Præsentationer: layout-based slides, themes (incl. the living landscape), presenter mode, PDF/PowerPoint export. */
import { h, clear, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, errorToast } from '../core/ui.js';
import { World } from '../world/landscape.js';
import { sanitizeHtml, textOf } from './sanitize.js';
import { uploadImage, toDataUrl, loadPptx, safeName, download } from './store.js';
import { editorFrame, toolBtn, toolSep, popMenu, printNode } from './frame.js';

export const LAYOUTS = {
  title: { label: 'Titeldias', icon: 'layout' },
  content: { label: 'Titel og indhold', icon: 'list' },
  two: { label: 'To kolonner', icon: 'grid' },
  image: { label: 'Tekst og billede', icon: 'image' },
  section: { label: 'Afsnitsoverskrift', icon: 'minus' },
};
export const THEMES = {
  hubtech: { label: 'HUBTECH mørk', bg: '#0b1626', fg: '#f2f7fc', accent: '#3b9bff', sub: '#a9bbd0' },
  light: { label: 'Lys', bg: '#ffffff', fg: '#0c1a2b', accent: '#2563eb', sub: '#51627a' },
  landscape: { label: 'Landskab (sommer)', bg: '#16233a', fg: '#ffffff', accent: '#ffb547', sub: '#e6eef8', scene: { season: 'summer', time: 'dusk' } },
  winter: { label: 'Landskab (vinter)', bg: '#2a3b55', fg: '#ffffff', accent: '#7cc4ff', sub: '#eaf2fb', scene: { season: 'winter', time: 'day' } },
  neon: { label: 'Neon', bg: '#12051f', fg: '#fdf4ff', accent: '#ff2bd6', sub: '#c4b5fd' },
};
const uid = () => Math.random().toString(36).slice(2, 10);
export const TRANSITIONS = [['none', 'Ingen overgang'], ['fade', 'Overgang: Tone'], ['slide', 'Overgang: Skub'], ['zoom', 'Overgang: Zoom']];
export const newSlide = (layout = 'content', title = '', body = '') => ({ id: uid(), layout, title, body, body2: '', image: '', notes: '' });

// landscape backgrounds are rendered once per scene and cached as images
const bgCache = new Map();
function sceneBg(theme) {
  const t = THEMES[theme];
  if (!t?.scene) return null;
  const key = `${t.scene.season}-${t.scene.time}`;
  if (!bgCache.has(key)) {
    try {
      const c = document.createElement('canvas');
      World.renderStill(c, { ...t.scene, landscape: 'valley', w: 640, h: 360, focusX: 0.5, focusY: 0.35, zoom: 0.62 });
      bgCache.set(key, c.toDataURL('image/jpeg', 0.86));
    } catch { bgCache.set(key, null); }
  }
  return bgCache.get(key);
}

/** Render one slide (1280×720). editable → regions are contenteditable and report changes. */
export function renderSlide(slide, theme, { editable = false, onChange, onPickImage, index, total } = {}) {
  const T = THEMES[theme] || THEMES.hubtech;
  const el = h('div', { class: ['sld', `lay-${slide.layout}`, `th-${theme}`], style: { '--s-bg': T.bg, '--s-fg': T.fg, '--s-accent': T.accent, '--s-sub': T.sub } });
  const bg = sceneBg(theme);
  if (bg) el.style.backgroundImage = `linear-gradient(100deg, rgba(5,10,20,.82) 0%, rgba(5,10,20,.45) 55%, rgba(5,10,20,.2) 100%), url("${bg}")`;
  const region = (key, cls, placeholder) => {
    const r = h('div', { class: ['sld-r', cls], dataset: { ph: placeholder } });
    r.innerHTML = sanitizeHtml(slide[key] || '');
    if (editable) {
      r.contentEditable = 'true';
      r.spellcheck = true;
      r.addEventListener('input', () => { slide[key] = sanitizeHtml(r.innerHTML); r.classList.toggle('is-empty', !r.textContent.trim()); onChange?.(); });
      r.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    }
    r.classList.toggle('is-empty', !r.textContent.trim());
    return r;
  };
  const accent = h('span', { class: 'sld-accent', 'aria-hidden': 'true' });
  const brand = h('span', { class: 'sld-brand', 'aria-hidden': 'true' }, 'HUBTECH');
  const num = typeof index === 'number' ? h('span', { class: 'sld-num' }, `${index + 1}${total ? ` / ${total}` : ''}`) : null;
  switch (slide.layout) {
    case 'title':
      el.append(accent, region('title', 'sld-title', 'Klik for at tilføje titel'), region('body', 'sld-sub', 'Undertitel'), brand); break;
    case 'section':
      el.append(h('div', { class: 'sld-sec' }, accent, region('title', 'sld-title', 'Afsnit'), region('body', 'sld-sub', 'Kort beskrivelse')), brand); break;
    case 'two':
      el.append(region('title', 'sld-title', 'Titel'), accent, h('div', { class: 'sld-cols' }, region('body', 'sld-body', 'Venstre kolonne'), region('body2', 'sld-body', 'Højre kolonne')), brand); break;
    case 'image': {
      const img = h('div', { class: ['sld-img', !slide.image && 'is-empty'] });
      if (slide.image && /^(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+|\/api\/office\/files\/[A-Za-z0-9_-]+)$/.test(slide.image)) img.style.backgroundImage = `url("${slide.image}")`;
      if (editable) img.appendChild(h('button', { type: 'button', class: 'sld-imgbtn', onclick: () => onPickImage?.() }, icon('image'), slide.image ? 'Skift billede' : 'Vælg billede'));
      el.append(h('div', { class: 'sld-split' }, h('div', { class: 'sld-left' }, region('title', 'sld-title', 'Titel'), accent, region('body', 'sld-body', 'Tekst')), img), brand); break;
    }
    default:
      el.append(region('title', 'sld-title', 'Titel'), accent, region('body', 'sld-body', 'Klik for at tilføje punkter'), brand);
  }
  if (num) el.appendChild(num);
  return el;
}

/** Fit a 1280×720 slide into a box. */
function fit(box, slideEl, pad = 0) {
  const w = box.clientWidth - pad * 2, hh = box.clientHeight - pad * 2;
  const k = Math.max(0.05, Math.min(w / 1280, hh / 720));
  slideEl.style.transform = `scale(${k})`;
  slideEl.style.left = `${(box.clientWidth - 1280 * k) / 2}px`;
  slideEl.style.top = `${(box.clientHeight - 720 * k) / 2}px`;
}

export function slidesEditor(doc, ctx) {
  const data = doc.data && Array.isArray(doc.data.slides) && doc.data.slides.length ? doc.data : { theme: 'hubtech', slides: [newSlide('title', doc.title, 'Undertitel')] };
  if (!THEMES[data.theme]) data.theme = 'hubtech';
  let cur = 0;
  const preview = () => data.slides.map(s => textOf(s.title)).filter(Boolean).join(' · ').slice(0, 220);
  const presentBtn = h('button', { type: 'button', class: 'btn btn-sm app-solid ofx-present', style: { '--app': '#f59e0b' } }, icon('present'), h('span', null, 'Præsentér'));
  const frame = editorFrame(doc, ctx, {
    getData: () => ({ data, preview: preview() }),
    onPrint: () => printAll(),
    exportMenu: [
      ['PowerPoint (.pptx)', 'present', () => exportPptx()],
      ['PDF / udskriv alle dias', 'download', () => printAll()],
    ],
    extraActions: [presentBtn],
  });
  const saver = frame.saver;

  const list = h('div', { class: 'sl-list', role: 'listbox', 'aria-label': 'Dias' });
  const stage = h('div', { class: 'sl-stage' });
  const notes = h('textarea', { class: 'textarea sl-notes', placeholder: 'Noter til dig selv – vises ikke under præsentationen', 'aria-label': 'Talernoter' });
  const imgInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  let stageSlide = null;

  const thumbFor = (s, i) => {
    const box = h('div', { class: 'sl-thumb-box' });
    const sl = renderSlide(s, data.theme);
    sl.style.transform = 'scale(0.1406)';
    box.appendChild(sl);
    const b = h('button', { type: 'button', class: ['sl-thumb', i === cur && 'is-on'], draggable: 'true', role: 'option', 'aria-selected': String(i === cur), 'aria-label': `Dias ${i + 1}: ${textOf(s.title) || 'uden titel'}`, dataset: { i } },
      h('span', { class: 'sl-n' }, String(i + 1)), box);
    b.addEventListener('click', () => { cur = i; drawAll(); });
    b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); b.classList.add('is-drag'); });
    b.addEventListener('dragend', () => b.classList.remove('is-drag'));
    b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('is-over'); });
    b.addEventListener('dragleave', () => b.classList.remove('is-over'));
    b.addEventListener('drop', (e) => { e.preventDefault(); b.classList.remove('is-over'); const from = Number(e.dataTransfer.getData('text/plain')); if (isFinite(from) && from !== i) { const [m] = data.slides.splice(from, 1); data.slides.splice(i, 0, m); cur = i; saver.touch(); drawAll(); } });
    return b;
  };
  function drawList() {
    clear(list).append(...data.slides.map(thumbFor));
  }
  const refreshThumb = debounce(() => { const old = list.children[cur]; if (old && old.classList.contains('sl-thumb')) old.replaceWith(thumbFor(data.slides[cur], cur)); }, 350);
  function drawStage() {
    clear(stage);
    const s = data.slides[cur];
    stageSlide = renderSlide(s, data.theme, { editable: true, onChange: () => { saver.touch(); refreshThumb(); }, onPickImage: () => imgInput.click(), index: cur, total: data.slides.length });
    stageSlide.classList.add('is-stage');
    stage.appendChild(stageSlide);
    fit(stage, stageSlide, 18);
    notes.value = s.notes || '';
    layoutSel.value = s.layout;
    themeSel.value = data.theme;
  }
  function drawAll() { drawList(); drawStage(); list.children[cur]?.scrollIntoView({ block: 'nearest' }); }
  const ro = new ResizeObserver(() => { if (stageSlide) fit(stage, stageSlide, 18); });
  ro.observe(stage);

  notes.addEventListener('input', () => { data.slides[cur].notes = notes.value; saver.touch(); });
  async function useImage(f) {
    if (!f || !f.type.startsWith('image/')) return;
    const sl = data.slides[cur];
    try {
      const url = await uploadImage(f, 1920);
      if (sl.layout !== 'image') sl.layout = 'image';
      sl.image = url; saver.touch(); drawAll();
      toast('Billedet er sat ind', { type: 'ok', ms: 1400 });
    } catch (e) { toast('Billedet kunne ikke bruges', { type: 'bad', text: e.message }); }
  }
  imgInput.addEventListener('change', () => { const f = imgInput.files[0]; imgInput.value = ''; useImage(f); });
  // drop or paste a picture straight onto the slide
  stage.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); stage.classList.add('is-drop'); } });
  stage.addEventListener('dragleave', () => stage.classList.remove('is-drop'));
  stage.addEventListener('drop', (e) => { stage.classList.remove('is-drop'); const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); useImage(f); } });
  stage.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); useImage(f); } });

  function addMenu(anchor) {
    popMenu(anchor, Object.entries(LAYOUTS).map(([k, l]) => [l.label, l.icon, () => {
      data.slides.splice(cur + 1, 0, newSlide(k)); cur += 1; saver.touch(); drawAll();
      setTimeout(() => stage.querySelector('.sld-title')?.focus(), 30);
    }]));
  }
  const layoutSel = h('select', { class: 'select ofx-select', 'aria-label': 'Layout', title: 'Layout' }, Object.entries(LAYOUTS).map(([k, l]) => h('option', { value: k }, l.label)));
  layoutSel.addEventListener('change', () => { data.slides[cur].layout = layoutSel.value; saver.touch(); drawAll(); });
  const themeSel = h('select', { class: 'select ofx-select', 'aria-label': 'Tema', title: 'Tema' }, Object.entries(THEMES).map(([k, t]) => h('option', { value: k }, t.label)));
  themeSel.addEventListener('change', () => { data.theme = themeSel.value; saver.touch(); drawAll(); });
  const transSel = h('select', { class: 'select ofx-select', 'aria-label': 'Overgang', title: 'Overgang mellem dias' }, TRANSITIONS.map(([k, l]) => h('option', { value: k, selected: (data.transition || 'fade') === k }, l)));
  transSel.addEventListener('change', () => { data.transition = transSel.value; saver.touch(); });
  const exec = (cmd) => { document.execCommand(cmd, false, null); saver.touch(); refreshThumb(); };
  const move = (d) => { const j = cur + d; if (j < 0 || j >= data.slides.length) return; const [m] = data.slides.splice(cur, 1); data.slides.splice(j, 0, m); cur = j; saver.touch(); drawAll(); };
  const addBtn = h('button', { type: 'button', class: 'btn btn-sm ofx-addslide' }, icon('plus'), 'Nyt dias');
  addBtn.addEventListener('click', () => addMenu(addBtn));
  frame.toolbar.append(
    addBtn,
    toolBtn('copy', 'Dupliker dias', () => { const c = JSON.parse(JSON.stringify(data.slides[cur])); c.id = uid(); data.slides.splice(cur + 1, 0, c); cur += 1; saver.touch(); drawAll(); }),
    toolBtn('trash', 'Slet dias', async () => {
      if (data.slides.length === 1) { toast('En præsentation skal have mindst ét dias', { type: 'warn' }); return; }
      const s = data.slides[cur];
      if ((textOf(s.title) || textOf(s.body)) && !await confirmDialog({ title: 'Slet dias?', text: `Dias ${cur + 1} slettes.`, confirmLabel: 'Slet', danger: true })) return;
      data.slides.splice(cur, 1); cur = Math.min(cur, data.slides.length - 1); saver.touch(); drawAll();
    }),
    toolBtn('chevronLeft', 'Flyt dias op', () => move(-1), 'is-rot'), toolBtn('chevronRight', 'Flyt dias ned', () => move(1), 'is-rot'), toolSep(),
    layoutSel, themeSel, transSel, toolSep(),
    toolBtn('bold', 'Fed', () => exec('bold')), toolBtn('italic', 'Kursiv', () => exec('italic')), toolBtn('underline', 'Understreget', () => exec('underline')),
    toolBtn('list', 'Punktliste', () => exec('insertUnorderedList')), toolBtn('listOl', 'Nummereret liste', () => exec('insertOrderedList')), toolSep(),
    toolBtn('image', 'Billede (layoutet “Tekst og billede”)', () => { if (data.slides[cur].layout !== 'image') { data.slides[cur].layout = 'image'; drawAll(); } imgInput.click(); }), imgInput);

  // ── presenter mode ──
  function present(from = cur) {
    let i = from, black = false, showNotes = false, prevI = from;
    const started = Date.now();
    const box = h('div', { class: 'sl-present', tabindex: '0', role: 'dialog', 'aria-label': 'Præsentation' });
    const counter = h('div', { class: 'sl-pcount' });
    const notesBar = h('div', { class: 'sl-pnotes', hidden: true, 'aria-live': 'polite' });
    const hint = h('div', { class: 'sl-phint' }, '← → skift · N noter · S talervisning · B sort skærm · Esc afslut');
    let speaker = null;   // the speaker-view window
    const trans = data.transition || 'fade';
    const show = () => {
      const old = box.querySelector('.sld');
      const s = renderSlide(data.slides[i], data.theme, { index: i, total: data.slides.length });
      s.classList.toggle('is-black', black);
      if (old && trans !== 'none' && prevI !== i) s.classList.add(`tr-${trans}`, i > prevI ? 'tr-fwd' : 'tr-back');
      old?.remove();
      box.prepend(s);
      if (!box.contains(counter)) box.append(counter, notesBar, hint);
      counter.textContent = `${i + 1} / ${data.slides.length}`;
      notesBar.textContent = data.slides[i].notes || 'Ingen noter til dette dias.';
      notesBar.hidden = !showNotes;
      prevI = i;
      requestAnimationFrame(() => fit(box, s));
      drawSpeaker();
    };
    const go = (d) => { const j = Math.max(0, Math.min(data.slides.length - 1, i + d)); if (j !== i) { i = j; show(); } };
    const key = (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') { i = 0; show(); } else if (e.key === 'End') { i = data.slides.length - 1; show(); }
      else if (e.key.toLowerCase() === 'b') { black = !black; show(); }
      else if (e.key.toLowerCase() === 'n') { showNotes = !showNotes; notesBar.hidden = !showNotes; }
      else if (e.key.toLowerCase() === 's') { openSpeaker(); }
      else if (e.key === 'Escape') { e.preventDefault(); end(); }
    };
    // ── speaker view: a second window with current + next slide, notes and a clock ──
    let tick = 0;
    function openSpeaker() {
      if (speaker && !speaker.closed) { speaker.focus(); return; }
      speaker = window.open('', 'hubtech-talervisning', 'width=1100,height=700');
      if (!speaker) { toast('Talervisningen blev blokeret', { type: 'warn', text: 'Tillad pop op-vinduer for HUBTECH, eller brug N for noter.' }); return; }
      const d = speaker.document;
      d.title = `Talervisning – ${frame.title()}`;
      d.documentElement.dataset.theme = 'dark';
      for (const l of document.querySelectorAll('link[rel=stylesheet]')) { const c = d.createElement('link'); c.rel = 'stylesheet'; c.href = l.href; d.head.appendChild(c); }
      d.body.className = 'sv-body';
      d.body.innerHTML = '';
      speaker.addEventListener('keydown', key, true);
      clearInterval(tick);
      tick = setInterval(drawClock, 1000);
      setTimeout(drawSpeaker, 120);
    }
    function drawClock() {
      if (!speaker || speaker.closed) { clearInterval(tick); return; }
      const t = speaker.document.querySelector('.sv-clock');
      if (!t) return;
      const sec = Math.floor((Date.now() - started) / 1000);
      t.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}  ·  ${new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`;
    }
    function drawSpeaker() {
      if (!speaker || speaker.closed) return;
      const d = speaker.document, b = d.body;
      while (b.firstChild) b.firstChild.remove();
      const cur1 = renderSlide(data.slides[i], data.theme, { index: i, total: data.slides.length });
      const nxt = data.slides[i + 1] ? renderSlide(data.slides[i + 1], data.theme, { index: i + 1, total: data.slides.length }) : null;
      const curBox = h('div', { class: 'sv-cur' }, cur1);
      const nextBox = h('div', { class: 'sv-next' }, nxt || h('div', { class: 'sv-end' }, 'Sidste dias'));
      const btn = (label, fn) => { const x = d.createElement('button'); x.className = 'btn'; x.textContent = label; x.onclick = fn; return x; };
      const wrap = h('div', { class: 'sv-wrap' },
        h('div', { class: 'sv-main' }, curBox, h('div', { class: 'sv-notes' }, data.slides[i].notes || 'Ingen noter til dette dias.')),
        h('div', { class: 'sv-side' }, h('div', { class: 'sv-label' }, 'Næste'), nextBox, h('div', { class: 'sv-clock' }), h('div', { class: 'sv-count' }, `Dias ${i + 1} af ${data.slides.length}`)));
      b.appendChild(wrap);
      const nav = h('div', { class: 'sv-nav' });
      nav.append(btn('← Forrige', () => go(-1)), btn('Næste →', () => go(1)), btn('Afslut', () => end()));
      b.appendChild(nav);
      speaker.requestAnimationFrame(() => { fit(curBox, cur1); if (nxt) fit(nextBox, nxt); });
      drawClock();
    }
    const onResize = () => { const s = box.querySelector('.sld'); if (s) fit(box, s); };
    // leaving fullscreen (Esc) ends the show – except when the speaker view opened: browsers drop fullscreen for pop-ups
    const onFs = () => { if (!document.fullscreenElement && !(speaker && !speaker.closed)) end(); };
    const end = () => {
      removeEventListener('keydown', key, true); removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      clearInterval(tick);
      if (speaker && !speaker.closed) speaker.close();
      box.remove(); cur = i; drawAll();
    };
    box.addEventListener('click', (e) => { if (e.target.closest('.sl-pnotes')) return; if (e.clientX < innerWidth * 0.25) go(-1); else go(1); });
    document.body.appendChild(box);
    addEventListener('keydown', key, true);
    addEventListener('resize', onResize);
    show();
    box.focus();
    if (box.requestFullscreen) box.requestFullscreen().then(() => document.addEventListener('fullscreenchange', onFs)).catch(() => {});
  }
  presentBtn.addEventListener('click', () => present(cur));

  // ── export ──
  function printAll() {
    const wrap = h('div', { class: 'print-slides' }, data.slides.map((s, i) => h('div', { class: 'print-slide' }, renderSlide(s, data.theme, { index: i, total: data.slides.length }))));
    printNode(wrap, frame.title(), 'print-landscape');
  }
  async function exportPptx() {
    try { download(`${safeName(frame.title())}.pptx`, await pptxBlob(data, frame.title())); toast('PowerPoint-fil hentet', { type: 'ok' }); }
    catch (e) { errorToast(e, 'Kunne ikke lave PowerPoint-filen'); }
  }

  frame.body.append(h('div', { class: 'sl-layout' }, h('aside', { class: 'sl-side glass' }, list, h('button', { type: 'button', class: 'sl-add', onclick: (e) => addMenu(e.currentTarget) }, icon('plus'), 'Nyt dias')), h('div', { class: 'sl-main' }, h('div', { class: 'sl-stagewrap glass' }, stage), notes)));
  frame.status.append(h('span', { class: 'faint' }, 'Træk diasene for at ændre rækkefølge · Træk et billede ind på diaset · Præsentér: ← → · N noter · S talervisning'));
  drawAll();
  return {
    el: frame.el,
    destroy() { ro.disconnect(); document.querySelector('.sl-present')?.remove(); return frame.destroy(); },
  };
}

/** A real .pptx for a presentation's data. */
export async function pptxBlob(data, title) {
  const Pptx = await loadPptx();
  const T = THEMES[data.theme] || THEMES.hubtech;
  const hex = (c) => c.replace('#', '').toUpperCase();
  const pres = new Pptx();
  pres.layout = 'LAYOUT_WIDE';            // 13.33 × 7.5 in
  pres.title = title;
  const bg = sceneBg(data.theme);
  const lines = (html) => {
    const d = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body;
    const items = [...d.querySelectorAll('li')];
    if (items.length) return items.map(li => ({ text: li.textContent.trim(), options: { bullet: true, breakLine: true } }));
    const t = d.innerText ?? d.textContent;
    return (t || '').split(/\n+/).filter(Boolean).map(x => ({ text: x.trim(), options: { breakLine: true } }));
  };
  for (const s of data.slides) {
    const sl = pres.addSlide();
    if (bg) sl.background = { data: bg }; else sl.background = { color: hex(T.bg) };
    if (bg) sl.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: '05101E', transparency: 45 } });
    const title = textOf(s.title), fg = hex(T.fg), acc = hex(T.accent), sub = hex(T.sub);
    if (s.layout === 'title' || s.layout === 'section') {
      sl.addShape(pres.ShapeType.rect, { x: 0.9, y: s.layout === 'title' ? 2.55 : 2.9, w: 1.2, h: 0.09, fill: { color: acc } });
      sl.addText(title, { x: 0.9, y: s.layout === 'title' ? 2.75 : 3.1, w: 11.5, h: 1.4, fontSize: s.layout === 'title' ? 44 : 38, bold: true, color: fg, fontFace: 'Segoe UI' });
      sl.addText(lines(s.body), { x: 0.9, y: s.layout === 'title' ? 4.2 : 4.5, w: 11.5, h: 1.2, fontSize: 20, color: sub, fontFace: 'Segoe UI' });
    } else {
      sl.addText(title, { x: 0.7, y: 0.45, w: 11.9, h: 1, fontSize: 32, bold: true, color: fg, fontFace: 'Segoe UI' });
      sl.addShape(pres.ShapeType.rect, { x: 0.7, y: 1.45, w: 1, h: 0.07, fill: { color: acc } });
      if (s.layout === 'two') {
        sl.addText(lines(s.body), { x: 0.7, y: 1.8, w: 5.8, h: 5, fontSize: 20, color: fg, valign: 'top', fontFace: 'Segoe UI' });
        sl.addText(lines(s.body2), { x: 6.8, y: 1.8, w: 5.8, h: 5, fontSize: 20, color: fg, valign: 'top', fontFace: 'Segoe UI' });
      } else if (s.layout === 'image') {
        sl.addText(lines(s.body), { x: 0.7, y: 1.8, w: 5.8, h: 5, fontSize: 20, color: fg, valign: 'top', fontFace: 'Segoe UI' });
        if (s.image) sl.addImage({ data: await toDataUrl(s.image).catch(() => null) || s.image, x: 6.9, y: 0.6, w: 5.8, h: 6.3, sizing: { type: 'cover', w: 5.8, h: 6.3 } });
      } else {
        sl.addText(lines(s.body), { x: 0.7, y: 1.8, w: 11.9, h: 5, fontSize: 22, color: fg, valign: 'top', fontFace: 'Segoe UI' });
      }
    }
    if (s.notes) sl.addNotes(s.notes);
  }
  return pres.write({ outputType: 'blob' });
}

