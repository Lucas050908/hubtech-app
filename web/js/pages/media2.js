/** Verdensur, Læs op, Optager, Fotobås, Metronom og stemmeapparat, Diagrammer (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid } from '../features/appkit.js';

const page = (id, eyebrow, title, lead, body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), body);
const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };

// ── Verdensur ──
const CITIES = [['København', 'Europe/Copenhagen'], ['London', 'Europe/London'], ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney'], ['Dubai', 'Asia/Dubai'], ['Beijing', 'Asia/Shanghai'], ['Delhi', 'Asia/Kolkata'], ['Nuuk', 'America/Nuuk'], ['Tórshavn', 'Atlantic/Faroe'], ['Reykjavik', 'Atlantic/Reykjavik'], ['Paris', 'Europe/Paris'], ['Istanbul', 'Europe/Istanbul'], ['Moskva', 'Europe/Moscow'], ['Kairo', 'Africa/Cairo'], ['Nairobi', 'Africa/Nairobi'], ['São Paulo', 'America/Sao_Paulo'], ['Mexico City', 'America/Mexico_City'], ['Toronto', 'America/Toronto'], ['Bangkok', 'Asia/Bangkok'], ['Singapore', 'Asia/Singapore'], ['Seoul', 'Asia/Seoul'], ['Honolulu', 'Pacific/Honolulu'], ['Auckland', 'Pacific/Auckland']];
export const tzOffset = (tz, d = new Date()) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d).reduce((o, x) => ({ ...o, [x.type]: x.value }), {}); const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute); return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000); };
export const worldclock = {
  title: 'Verdensur',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('worldclock', { zones: ['Europe/Copenhagen', 'America/New_York', 'Asia/Tokyo'] }); } catch (e) { return loadError('Verdensur', e); }
    const st = store.data, self = this, root = h('div');
    let planHour = new Date().getHours();
    const nameOf = (tz) => CITIES.find(c => c[1] === tz)?.[0] || tz.split('/').pop().replace(/_/g, ' ');
    function draw() {
      const now = new Date(), here = tzOffset(Intl.DateTimeFormat().resolvedOptions().timeZone, now);
      const add = h('select', { class: 'select', 'aria-label': 'Tilføj by', style: { width: 'auto' } }, h('option', { value: '' }, '+ Tilføj en by'), CITIES.filter(c => !st.zones.includes(c[1])).map(([n, tz]) => h('option', { value: tz }, n)));
      add.addEventListener('change', () => { if (add.value) { st.zones.push(add.value); store.save(); draw(); } });
      const slider = h('input', { type: 'range', min: 0, max: 23, value: planHour, 'aria-label': 'Klokken hos dig', class: 'wc-slider' });
      slider.addEventListener('input', () => { planHour = Number(slider.value); drawPlan(); });
      const plan = h('div', { class: 'wc-plan' });
      const drawPlan = () => {
        const base = new Date(); base.setHours(planHour, 0, 0, 0);
        h(clear(plan), null, h('b', null, `Når klokken er ${String(planHour).padStart(2, '0')}:00 hos dig …`), st.zones.map(tz => { const t = base.toLocaleTimeString('da-DK', { timeZone: tz, hour: '2-digit', minute: '2-digit' }), hh = Number(t.slice(0, 2)); return h('div', { class: 'wc-prow' }, h('span', null, nameOf(tz)), h('b', { class: hh >= 8 && hh < 22 ? 'ok' : 'night' }, t, hh >= 22 || hh < 7 ? ' 😴' : '')); }));
      };
      drawPlan();
      h(clear(root), null, h('div', { class: 'wc-grid' }, st.zones.map((tz, i) => {
        const t = now.toLocaleTimeString('da-DK', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }), d = now.toLocaleDateString('da-DK', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'short' });
        const diff = (tzOffset(tz, now) - here) / 60, hh = Number(t.slice(0, 2));
        return h('div', { class: ['wc-card', hh >= 6 && hh < 18 ? 'day' : 'night'], dataset: { tz } }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', null, nameOf(tz)), h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${nameOf(tz)}`, onclick: () => { st.zones.splice(i, 1); store.save(); draw(); } }, icon('x'))),
          h('div', { class: 'wc-time' }, t), h('span', { class: 'faint' }, d), h('span', { class: 'wc-diff' }, diff === 0 ? 'Samme tid som dig' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} t.`), h('span', { class: 'wc-sun' }, hh >= 6 && hh < 18 ? '☀️' : '🌙'));
      })), h('div', { class: 'row', style: { margin: '12px 0' } }, add), panel('Find et godt tidspunkt', 'clock', slider, plan));
    }
    draw();
    clearInterval(this._iv); this._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); root.querySelectorAll('.wc-card').forEach(c => { c.querySelector('.wc-time').textContent = new Date().toLocaleTimeString('da-DK', { timeZone: c.dataset.tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }); }, 1000);
    return page('worldclock', 'Værktøj', 'Verdensur', 'Se klokken i hele verden – og find et tidspunkt, hvor det passer for både dig og vennerne i New York eller familien i Nuuk.', root);
  },
};

// ── Læs op ──
export const tts = {
  title: 'Læs op',
  destroy() { try { speechSynthesis.cancel(); } catch { /* */ } },
  async render() {
    let store;
    try { store = await appState('tts', { text: '', rate: 1, voice: '' }); } catch { store = { data: { text: '', rate: 1, voice: '' }, save() {} }; }
    const st = store.data, root = h('div');
    if (!('speechSynthesis' in window)) return page('tts', 'Værktøj', 'Læs op', 'Få tekst læst højt.', panel(null, null, h('p', null, 'Din browser kan desværre ikke læse tekst op.')));
    const ta = h('textarea', { class: 'textarea tx-in', rows: 10, maxlength: 20000, placeholder: 'Skriv eller indsæt den tekst, der skal læses op …', 'aria-label': 'Tekst' }); ta.value = st.text || '';
    ta.addEventListener('input', () => { st.text = ta.value; store.save(); });
    const voiceSel = h('select', { class: 'select', 'aria-label': 'Stemme' });
    const fillVoices = () => { const vs = speechSynthesis.getVoices(), da = vs.filter(v => v.lang?.toLowerCase().startsWith('da')), list = da.length ? [...da, ...vs.filter(v => !da.includes(v))] : vs; h(clear(voiceSel), null, list.map(v => h('option', { value: v.name, selected: v.name === st.voice }, `${v.name} (${v.lang})`))); };
    fillVoices(); speechSynthesis.onvoiceschanged = fillVoices;
    voiceSel.addEventListener('change', () => { st.voice = voiceSel.value; store.save(); });
    const rate = h('input', { type: 'range', min: 0.5, max: 1.8, step: 0.1, value: st.rate, 'aria-label': 'Hastighed' }), rateLbl = h('b', null, `${st.rate}×`);
    rate.addEventListener('input', () => { st.rate = Number(rate.value); rateLbl.textContent = `${st.rate}×`; store.save(); });
    const reading = h('div', { class: 'ts-reading', 'aria-live': 'polite' });
    const speak = () => {
      speechSynthesis.cancel(); if (!ta.value.trim()) return toast('Skriv noget først', { type: 'warn' });
      const u = new SpeechSynthesisUtterance(ta.value); u.rate = st.rate; u.lang = 'da-DK';
      const v = speechSynthesis.getVoices().find(x => x.name === voiceSel.value); if (v) { u.voice = v; u.lang = v.lang; }
      const text = ta.value;
      u.onboundary = (e) => { if (e.name && e.name !== 'word') return; const end = text.indexOf(' ', e.charIndex + 1); h(clear(reading), null, text.slice(0, e.charIndex), h('mark', null, text.slice(e.charIndex, end < 0 ? undefined : end)), end < 0 ? '' : text.slice(end)); };
      u.onend = () => { clear(reading); };
      speechSynthesis.speak(u);
    };
    h(root, null, h('div', { class: 'ev-wrap' }, panel(null, null, ta, reading,
      h('div', { class: 'row', style: { gap: '8px', marginTop: '10px', flexWrap: 'wrap' } }, h('button', { class: 'btn btn-primary btn-lg', onclick: speak }, icon('play'), 'Læs op'), h('button', { class: 'btn', onclick: () => speechSynthesis.pause() }, icon('pause'), 'Pause'), h('button', { class: 'btn', onclick: () => speechSynthesis.resume() }, 'Fortsæt'), h('button', { class: 'btn btn-ghost', onclick: () => { speechSynthesis.cancel(); clear(reading); } }, icon('x'), 'Stop'))),
      panel('Indstillinger', 'settings', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Stemme'), voiceSel), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hastighed '), rateLbl, rate),
        h('p', { class: 'faint', style: { fontSize: '13px' } }, 'God til lektier, lange tekster og til at høre om dit eget skriv lyder rigtigt. Teksten bliver på din enhed.'))));
    return page('tts', 'Værktøj', 'Læs op', 'Få en tekst læst højt med en dansk stemme – i dit eget tempo, og med ordet der læses fremhævet.', root);
  },
};

// ── Optager ──
const DB = 'hubtech-recorder';
const idb = () => new Promise((ok, bad) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('clips', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
const clipsAll = async () => { const db = await idb(); return new Promise((ok) => { const out = []; const c = db.transaction('clips').objectStore('clips').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else ok(out.sort((a, b) => b.at - a.at)); }; }); };
const clipPut = async (v) => { const db = await idb(); return new Promise((ok) => { const t = db.transaction('clips', 'readwrite'); t.objectStore('clips').put(v); t.oncomplete = ok; }); };
const clipDel = async (id) => { const db = await idb(); return new Promise((ok) => { const t = db.transaction('clips', 'readwrite'); t.objectStore('clips').delete(id); t.oncomplete = ok; }); };
export const recorder = {
  title: 'Optager',
  destroy() { this._stop?.(); },
  async render() {
    const root = h('div'), self = this;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return page('recorder', 'Værktøj', 'Optager', 'Optag lyd.', panel(null, null, h('p', null, 'Din browser kan desværre ikke optage lyd.')));
    let rec = null, chunks = [], t0 = 0, raf = 0, stream = null;
    const time = h('div', { class: 'rc-time' }, '0:00'), canvas = h('canvas', { class: 'rc-wave', width: 600, height: 90 }), list = h('div', { class: 'rc-list' });
    const btn = h('button', { class: 'rc-btn', 'aria-label': 'Start optagelse', onclick: () => (rec ? stop() : start()) }, h('span'));
    self._stop = () => { try { rec?.stop(); } catch { /* */ } stream?.getTracks().forEach(t => t.stop()); cancelAnimationFrame(raf); };
    async function start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('Ingen adgang til mikrofonen', { type: 'bad', text: 'Giv browseren lov til at bruge mikrofonen.' }); }
      chunks = []; rec = new MediaRecorder(stream); rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => { const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); const dur = Math.round((Date.now() - t0) / 1000); rec = null; stream.getTracks().forEach(t => t.stop()); cancelAnimationFrame(raf); btn.classList.remove('is-rec'); btn.setAttribute('aria-label', 'Start optagelse'); await clipPut({ id: uid(), at: Date.now(), name: `Optagelse ${new Date().toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, blob, dur, type: blob.type }); drawList(); };
      rec.start(); t0 = Date.now(); btn.classList.add('is-rec'); btn.setAttribute('aria-label', 'Stop optagelse');
      const ac = new AudioContext(), an = ac.createAnalyser(); ac.createMediaStreamSource(stream).connect(an); an.fftSize = 512; const data = new Uint8Array(an.fftSize), ctx = canvas.getContext('2d');
      const loop = () => { if (!rec) { ac.close(); return; } an.getByteTimeDomainData(data); ctx.clearRect(0, 0, 600, 90); ctx.strokeStyle = getComputedStyle(root).getPropertyValue('--app') || '#f87171'; ctx.lineWidth = 2; ctx.beginPath(); data.forEach((v, i) => { const x = i / data.length * 600, y = (v / 255) * 90; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); const s = Math.floor((Date.now() - t0) / 1000); time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; raf = requestAnimationFrame(loop); };
      loop();
    }
    function stop() { rec?.stop(); }
    async function drawList() {
      const clips = await clipsAll().catch(() => []);
      h(clear(list), null, clips.length ? clips.map(c => { const url = URL.createObjectURL(c.blob); const name = h('input', { class: 'input', value: c.name, maxlength: 60, 'aria-label': 'Navn' }); name.addEventListener('change', () => { c.name = name.value || 'Optagelse'; clipPut(c); });
        return h('div', { class: 'rc-clip' }, name, h('audio', { controls: true, src: url, preload: 'metadata' }), h('div', { class: 'row', style: { gap: '4px' } }, h('span', { class: 'faint' }, `${Math.floor(c.dur / 60)}:${String(c.dur % 60).padStart(2, '0')}`), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Hent', onclick: () => download(c.blob, `${c.name}.${(c.type || '').includes('ogg') ? 'ogg' : (c.type || '').includes('mp4') ? 'm4a' : 'webm'}`) }, icon('download')), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet', onclick: async () => { if (await confirmDialog({ title: 'Slet optagelsen?', confirmLabel: 'Slet', danger: true })) { await clipDel(c.id); drawList(); } } }, icon('trash')))); })
        : h('p', { class: 'faint' }, 'Ingen optagelser endnu. De gemmes kun her på din enhed.'));
    }
    drawList();
    h(root, null, h('div', { class: 'ev-wrap' }, panel(null, null, h('div', { class: 'rc-stage' }, btn, time, canvas, h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Tryk på den røde knap for at optage. Tryk igen for at stoppe.'))), panel('Dine optagelser', 'list', list)));
    return page('recorder', 'Værktøj', 'Optager', 'Optag stemme, musik eller noter fra timen. Optagelserne gemmes på din enhed, og du kan hente dem som lydfil.', root);
  },
};

// ── Fotobås ──
const FILTERS = { normal: 'none', sh: 'grayscale(1) contrast(1.15)', sepia: 'sepia(.85) contrast(1.05)', varm: 'saturate(1.4) hue-rotate(-12deg) brightness(1.05)', kold: 'saturate(1.2) hue-rotate(18deg)', pop: 'saturate(2) contrast(1.25)', drøm: 'blur(1px) brightness(1.15) saturate(1.3)' };
const FILTER_NAMES = { normal: 'Normal', sh: 'Sort-hvid', sepia: 'Gammel', varm: 'Varm', kold: 'Kold', pop: 'Pop', 'drøm': 'Drøm' };
/** frequency → { note, octave, cents } (A4 = 440 Hz) */
export function noteOf(f) { const n = 12 * Math.log2(f / 440) + 69, r = Math.round(n); return { note: NOTE_NAMES[((r % 12) + 12) % 12], octave: Math.floor(r / 12) - 1, cents: Math.round((n - r) * 100), midi: r }; }
/** simple autocorrelation pitch detection */
export function detectPitch(buf, rate) {
  let rms = 0; for (const v of buf) rms += v * v; rms = Math.sqrt(rms / buf.length); if (rms < 0.01) return null;
  let best = -1, bestC = 0; const min = Math.floor(rate / 1200), max = Math.floor(rate / 60);
  for (let lag = min; lag <= max; lag++) { let c = 0; for (let i = 0; i < buf.length - lag; i++) c += buf[i] * buf[i + lag]; if (c > bestC) { bestC = c; best = lag; } }
  return best > 0 ? rate / best : null;
}
// ── Diagrammer ──
export const charts = {
  title: 'Diagrammer',
  async render() {
    let store;
    try { store = await appState('charts', { title: 'Yndlingsfrugt i 8.B', kind: 'bar', rows: [['Æble', 8], ['Banan', 5], ['Jordbær', 11], ['Pære', 3]] }); } catch { store = { data: { title: '', kind: 'bar', rows: [] }, save() {} }; }
    const st = store.data, root = h('div');
    const COLORS = ['#60a5fa', '#f472b6', '#4ade80', '#facc15', '#a78bfa', '#fb923c', '#22d3ee', '#f87171', '#a3e635', '#e879f9'];
    const canvas = h('canvas', { class: 'chx-canvas', width: 900, height: 560, 'aria-label': 'Diagram' });
    function paint() {
      const x = canvas.getContext('2d'), W = 900, H = 560, rows = st.rows.filter(r => r[0] && isFinite(r[1])), max = Math.max(1, ...rows.map(r => r[1])), total = rows.reduce((a, r) => a + Math.max(0, r[1]), 0);
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#111827'; x.font = '800 28px system-ui'; x.textAlign = 'center'; x.fillText(st.title || '', W / 2, 44);
      x.font = '600 16px system-ui';
      if (st.kind === 'pie' && total > 0) {
        let a = -Math.PI / 2; const cx = 300, cy = 310, R = 200;
        rows.forEach((r, i) => { const s = Math.max(0, r[1]) / total * Math.PI * 2; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a, a + s); x.closePath(); x.fillStyle = COLORS[i % 10]; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke(); a += s; });
        rows.forEach((r, i) => { x.fillStyle = COLORS[i % 10]; x.fillRect(560, 120 + i * 34, 22, 22); x.fillStyle = '#111827'; x.textAlign = 'left'; x.fillText(`${r[0]} – ${r[1]} (${Math.round(Math.max(0, r[1]) / total * 100)} %)`, 592, 138 + i * 34); });
        return;
      }
      const L = 70, B = H - 70, T = 80, Rr = W - 30, n = Math.max(1, rows.length);
      x.strokeStyle = '#e5e7eb'; x.lineWidth = 1; x.fillStyle = '#6b7280'; x.textAlign = 'right';
      for (let k = 0; k <= 5; k++) { const v = max * k / 5, y = B - (B - T) * k / 5; x.beginPath(); x.moveTo(L, y); x.lineTo(Rr, y); x.stroke(); x.fillText(String(Math.round(v * 10) / 10), L - 8, y + 5); }
      const slot = (Rr - L) / n;
      if (st.kind === 'line') {
        x.strokeStyle = COLORS[0]; x.lineWidth = 4; x.beginPath(); rows.forEach((r, i) => { const px = L + slot * (i + 0.5), py = B - (B - T) * r[1] / max; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
        rows.forEach((r, i) => { const px = L + slot * (i + 0.5), py = B - (B - T) * r[1] / max; x.fillStyle = COLORS[0]; x.beginPath(); x.arc(px, py, 7, 0, Math.PI * 2); x.fill(); x.fillStyle = '#111827'; x.textAlign = 'center'; x.fillText(String(r[1]), px, py - 14); });
      } else rows.forEach((r, i) => { const bw = slot * 0.62, px = L + slot * i + (slot - bw) / 2, bh = (B - T) * Math.max(0, r[1]) / max; x.fillStyle = COLORS[i % 10]; x.fillRect(px, B - bh, bw, bh); x.fillStyle = '#111827'; x.textAlign = 'center'; x.fillText(String(r[1]), px + bw / 2, B - bh - 8); });
      x.fillStyle = '#111827'; x.textAlign = 'center'; rows.forEach((r, i) => x.fillText(String(r[0]).slice(0, 14), L + slot * (i + 0.5), B + 26));
    }
    const rowsBox = h('div', { class: 'stack', style: { gap: '6px' } });
    function drawRows() {
      h(clear(rowsBox), null, st.rows.map((r, i) => { const a = h('input', { class: 'input', value: r[0], maxlength: 30, placeholder: 'Navn', 'aria-label': `Navn ${i + 1}` }), b = h('input', { class: 'input', type: 'number', value: r[1], 'aria-label': `Værdi ${i + 1}`, style: { width: '100px' } });
        a.addEventListener('input', () => { r[0] = a.value; store.save(); paint(); }); b.addEventListener('input', () => { r[1] = Number(b.value) || 0; store.save(); paint(); });
        return h('div', { class: 'row', style: { gap: '6px' } }, a, b, h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern række', onclick: () => { st.rows.splice(i, 1); store.save(); drawRows(); paint(); } }, icon('x'))); }),
        st.rows.length < 20 ? h('button', { class: 'btn btn-sm', onclick: () => { st.rows.push(['', 0]); store.save(); drawRows(); paint(); } }, icon('plus'), 'Tilføj række') : null);
    }
    const title = h('input', { class: 'input', value: st.title, maxlength: 60, 'aria-label': 'Titel' }); title.addEventListener('input', () => { st.title = title.value; store.save(); paint(); });
    const paste = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Eller indsæt fra Excel: navn og tal på hver linje', 'aria-label': 'Indsæt data' });
    paste.addEventListener('change', () => { const rows = paste.value.split('\n').map(l => l.split(/\t|;|,(?=\s*-?\d)/)).filter(p => p.length >= 2 && isFinite(Number(String(p[1]).replace(',', '.')))).map(p => [p[0].trim(), Number(String(p[1]).replace(',', '.'))]); if (rows.length) { st.rows = rows.slice(0, 20); store.save(); drawRows(); paint(); paste.value = ''; toast(`${rows.length} rækker hentet`, { type: 'ok' }); } });
    drawRows();
    h(root, null, h('div', { class: 'ev-wrap' },
      panel(null, null, segmented([{ value: 'bar', label: 'Søjler' }, { value: 'line', label: 'Linje' }, { value: 'pie', label: 'Lagkage' }], st.kind, (v) => { st.kind = v; store.save(); paint(); }, { label: 'Diagramtype' }), canvas,
        h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } }, h('button', { class: 'btn btn-primary', onclick: () => canvas.toBlob(b => download(b, `${st.title || 'diagram'}.png`)) }, icon('download'), 'Hent som billede'))),
      panel('Data', 'list', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), title), rowsBox, paste)));
    setTimeout(paint, 0);
    return page('charts', 'Skole', 'Diagrammer', 'Lav søjle-, linje- og lagkagediagrammer til opgaver og fremlæggelser – skriv tallene eller indsæt fra et regneark, og hent diagrammet som billede.', root);
  },
};
