/** HUBTECH Office – client side of /api/office/docs, with debounced autosave. */
import { api } from '../core/api.js';
import { saveBlob } from '../core/files.js';

export const KINDS = {
  doc: { label: 'Dokument', plural: 'Dokumenter', icon: 'file', hue: '#3b82f6', route: 'doc', ext: 'Word-agtigt' },
  sheet: { label: 'Regneark', plural: 'Regneark', icon: 'grid', hue: '#22c55e', route: 'sheet', ext: 'Excel-agtigt' },
  slides: { label: 'Præsentation', plural: 'Præsentationer', icon: 'monitor', hue: '#f59e0b', route: 'slides', ext: 'PowerPoint-agtigt' },
};

export const listDocs = () => api.get('/api/office/docs').then(r => r.docs);
export const getDoc = (id) => api.get(`/api/office/docs/${encodeURIComponent(id)}`).then(r => r.doc);
export const createDoc = (kind, title, data, preview = '') => api.post('/api/office/docs', { kind, title, data, preview }).then(r => r.doc);
export const updateDoc = (id, patch) => api.put(`/api/office/docs/${encodeURIComponent(id)}`, patch).then(r => r.doc);
export const deleteDoc = (id) => api.del(`/api/office/docs/${encodeURIComponent(id)}`);
export const duplicateDoc = (id) => api.post(`/api/office/docs/${encodeURIComponent(id)}/duplicate`).then(r => r.doc);
export const docHref = (d) => `#/apps/hubtech/${KINDS[d.kind].route}/${d.id}`;

/**
 * Autosaver: call .touch() after every change; it saves `get()` 900 ms after the last change.
 * onState(state) receives 'saving' | 'saved' | 'error'.
 */
export function autosaver(id, get, onState) {
  let timer = null, inflight = null, dirty = false, dead = false;
  const run = async () => {
    if (dead && !dirty) return;
    if (inflight) { await inflight.catch(() => {}); }
    if (!dirty) return;
    dirty = false;
    onState?.('saving');
    inflight = updateDoc(id, get());
    try { await inflight; onState?.(dirty ? 'saving' : 'saved'); }
    catch (e) { dirty = true; onState?.('error', e); clearTimeout(timer); timer = setTimeout(run, 6000); }
    finally { inflight = null; }
  };
  return {
    touch() { if (dead) return; dirty = true; onState?.('dirty'); clearTimeout(timer); timer = setTimeout(run, 900); },
    flush() { clearTimeout(timer); return run(); },
    stop() { dead = true; clearTimeout(timer); return run(); },
    get dirty() { return dirty; },
  };
}

/** Trigger a file download of text content. */
export function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  return saveBlob(name, blob);
}
export const safeName = (s) => (s || 'dokument').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'dokument';

/** Read a File chosen by the user as text or data URL. */
export const readFile = (file, as = 'text') => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result); r.onerror = () => rej(r.error);
  as === 'dataurl' ? r.readAsDataURL(file) : as === 'buffer' ? r.readAsArrayBuffer(file) : r.readAsText(file);
});

/** Downscale an image file to a data URL (keeps documents small). */
export async function imageToDataUrl(file, max = 1400) {
  const url = await readFile(file, 'dataurl');
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  if (k === 1 && url.length < 600000) return url;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
}

/** Shrink an image (longest side ≤ max px) → Blob. PNGs with transparency stay PNG; everything else becomes JPEG. */
export async function shrinkImage(file, max = 2000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Billedet kunne ikke læses')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && file.size < 1.5 * 1024 * 1024 && /^image\/(png|jpeg|gif|webp)$/.test(file.type)) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return await new Promise((res) => c.toBlob((b) => res(b || file), type, 0.85));
  } finally { URL.revokeObjectURL(url); }
}

/** Upload an image to the user's HUBTECH account → its URL (/api/office/files/…). Falls back to a data URL offline. */
export async function uploadImage(file, max = 2000) {
  const blob = await shrinkImage(file, max);
  try {
    const res = await fetch('/api/office/files', { method: 'POST', credentials: 'same-origin', body: blob,
      headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name || 'billede') } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.error || 'Upload mislykkedes'), { status: res.status });
    return j.file.url;
  } catch (e) {
    if (e.status && e.status !== 503) throw e;
    return imageToDataUrl(file, Math.min(max, 1400));   // server not reachable: keep the picture inside the document
  }
}

/** Fetch an image URL → data URL (exports need the bytes). Data URLs are returned unchanged. */
export async function toDataUrl(src) {
  if (!src || src.startsWith('data:')) return src;
  const res = await fetch(src, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Billedet kunne ikke hentes');
  const blob = await res.blob();
  return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
}
/** Replace uploaded-image URLs in HTML with data URLs (for self-contained exports). */
export async function inlineImages(html) {
  const urls = [...new Set([...String(html).matchAll(/\/api\/office\/files\/[A-Za-z0-9_-]+/g)].map(m => m[0]))];
  let out = String(html);
  for (const u of urls) { try { out = out.split(u).join(await toDataUrl(u)); } catch { /* keep link */ } }
  return out;
}

// ── version history ──
export const listVersions = (id) => api.get(`/api/office/docs/${encodeURIComponent(id)}/versions`);
export const getVersion = (id, vid) => api.get(`/api/office/docs/${encodeURIComponent(id)}/versions/${vid}`).then(r => r.version);
export const restoreVersion = (id, vid) => api.post(`/api/office/docs/${encodeURIComponent(id)}/versions/${vid}/restore`, {}).then(r => r.doc);

/** Lazy-load a bundled library from web/vendor (only when a user actually imports/exports). */
const loaded = new Map();
export function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res(globalName ? window[globalName] : true);
      s.onerror = () => { loaded.delete(src); rej(new Error(`Kunne ikke indlæse ${src}`)); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}
export const loadXlsx = () => loadScript('vendor/xlsx.full.min.js', 'XLSX');
export const loadMammoth = () => loadScript('vendor/mammoth.browser.min.js', 'mammoth');
export const loadPptx = () => loadScript('vendor/pptxgen.bundle.js', 'PptxGenJS');
export const loadJsZip = () => loadScript('vendor/jszip.min.js', 'JSZip');
