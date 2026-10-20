/**
 * Scan QR codes and barcodes (serial numbers, part numbers) with the camera.
 * Uses the browser's BarcodeDetector when it exists; otherwise ZXing (web/vendor/zxing.min.js, Apache-2.0),
 * loaded only when you scan. Resolves with the text, or null when cancelled.
 */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { modal } from '../core/ui.js';
import { loadScript } from '../office/store.js';

const FORMATS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'itf'];

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter(f => supported.includes(f));
    if (!formats.length) return null;
    const d = new window.BarcodeDetector({ formats });
    return async (video) => { const r = await d.detect(video); return r[0]?.rawValue || null; };
  } catch { return null; }
}

async function zxingDetector() {
  const Z = await loadScript('vendor/zxing.min.js', 'ZXing');
  const hints = new Map();
  const F = Z.BarcodeFormat;
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.DATA_MATRIX, F.ITF]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth, hh = video.videoHeight;
    if (!w || !hh) return null;
    const k = Math.min(1, 900 / w);
    canvas.width = Math.round(w * k); canvas.height = Math.round(hh * k);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return reader.decode(bmp).getText();
    } catch { return null; }   // NotFoundException: nothing in this frame
    finally { reader.reset(); }
  };
}

export function scan({ title = 'Scan stregkode eller QR-kode', hint = 'Hold koden inden for rammen – det går af sig selv.' } = {}) {
  return new Promise((resolve) => {
    let stream = null, stopped = false, done = false, timer = 0, track = null;
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true, 'aria-label': 'Kamerabillede' });
    video.muted = true; video.setAttribute('playsinline', '');
    const status = h('p', { class: 'scan-status', role: 'status' }, 'Starter kameraet …');
    const manual = h('input', { class: 'input', placeholder: 'Eller skriv koden her', 'aria-label': 'Skriv koden', autocapitalize: 'off', spellcheck: 'false' });
    const torchBtn = h('button', { class: 'btn btn-sm btn-ghost', hidden: true, type: 'button' }, icon('sun'), 'Lys');
    const finish = (val) => {
      if (done) return; done = true; stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
      m.close();
      resolve(val ? String(val).trim() : null);
    };
    manual.addEventListener('keydown', (e) => { if (e.key === 'Enter' && manual.value.trim()) finish(manual.value); });
    const m = modal({ title, size: 520, label: 'Scanner',
      body: h('div', { class: 'scan-box' }, h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-target', 'aria-hidden': 'true' }), h('div', { class: 'scan-line', 'aria-hidden': 'true' })), status,
        h('p', { class: 'faint', style: { margin: 0 } }, hint), h('div', { class: 'scan-manual' }, manual, torchBtn)),
      actions: [h('button', { class: 'btn', onclick: () => finish(null) }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: () => manual.value.trim() ? finish(manual.value) : manual.focus() }, 'Brug koden')],
      onClose: () => { if (!done) { done = true; stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); resolve(null); } } });
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Kameraet kan ikke bruges her. Skriv koden i stedet.'; manual.focus(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        status.textContent = e.name === 'NotAllowedError' ? 'Kameraet er ikke tilladt. Tillad det i browseren/telefonen – eller skriv koden.' : 'Der blev ikke fundet noget kamera. Skriv koden i stedet.';
        manual.focus(); return;
      }
      if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay */ }
      track = stream.getVideoTracks()[0];
      try {
        if (track.getCapabilities?.().torch) {
          let on = false;
          torchBtn.hidden = false;
          torchBtn.onclick = async () => { on = !on; try { await track.applyConstraints({ advanced: [{ torch: on }] }); } catch { /* */ } torchBtn.classList.toggle('is-on', on); };
        }
      } catch { /* */ }
      const detect = (await nativeDetector()) || (await zxingDetector().catch(() => null));
      if (!detect) { status.textContent = 'Kunne ikke starte genkendelsen. Skriv koden i stedet.'; return; }
      status.textContent = 'Leder efter en kode …';
      const tick = async () => {
        if (stopped) return;
        let v = null;
        try { v = await detect(video); } catch { /* */ }
        if (v) { try { navigator.vibrate?.(60); } catch { /* */ } finish(v); return; }
        timer = setTimeout(tick, 180);
      };
      tick();
    })();
  });
}
