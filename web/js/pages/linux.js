/**
 * Linux-terminal – a real Linux (Buildroot, Linux 6.8, BusyBox) running in v86 on this device, shown in xterm.js.
 * Like Termux: a shell to play in, with an extra key row. The machine is saved in the browser (IndexedDB) per user,
 * so files and history are still there next time. It has no access to the computer or the network.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, modal } from '../core/ui.js';
import { store, logActivity } from '../core/store.js';
import { appHero } from '../features/apphero.js';
import { appById } from '../core/registry.js';
import { EXTRA_KEYS, keySeq, TRY } from '../features/termkeys.js';

const V = '/vendor/linux/', MEM = 64 * 1024 * 1024;
const enc = new TextEncoder();

// ── the saved machine, per user, in IndexedDB (gzip when the browser can) ──
const DB = 'hubtech-linux', OS = 'machines';
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(OS); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(OS, mode); const q = fn(tx.objectStore(OS)); tx.oncomplete = () => { db.close(); res(q?.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; });
}
const zip = async (buf) => (typeof CompressionStream === 'function' ? { gz: true, data: await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer() } : { gz: false, data: buf });
const unzip = async (rec) => (rec.gz ? new Response(new Blob([rec.data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : rec.data);
const keyFor = () => `user-${store.get('user')?.id || 'x'}`;
async function loadSaved() { try { const rec = await idbDo('readonly', s => s.get(keyFor())); return rec ? { ...rec, state: await unzip(rec) } : null; } catch { return null; } }
async function saveMachine(state) { const z = await zip(state); await idbDo('readwrite', s => s.put({ ...z, at: Date.now(), size: z.data.byteLength }, keyFor())); return z.data.byteLength; }
async function forgetMachine() { try { await idbDo('readwrite', s => s.delete(keyFor())); } catch { /* */ } }

function cssOnce() {
  if (document.getElementById('xterm-css')) return;
  document.head.appendChild(h('link', { id: 'xterm-css', rel: 'stylesheet', href: '/vendor/xterm/xterm.css' }));
}
const hm = (t) => new Date(t).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });

export default {
  title: 'Linux-terminal',
  async render() {
    cssOnce();
    const app = appById('linux');
    const status = h('span', { class: 'chip lx-status' }, icon('power'), 'Starter …');
    const host = h('div', { class: 'lx-term', 'aria-label': 'Linux-terminal' });
    const boot = h('div', { class: 'lx-boot', 'aria-live': 'polite' }, h('div', { class: 'lx-boot-spin', 'aria-hidden': 'true' }), h('b', null, 'Starter Linux …'), h('span', { class: 'faint lx-boot-line' }, 'Første gang tager det 10–30 sekunder.'));
    const sticky = { ctrl: false, alt: false };
    const keyRow = h('div', { class: 'lx-keys', role: 'toolbar', 'aria-label': 'Ekstra taster' });
    const page = h('div', { class: 'page lx-page' });
    let emu = null, term = null, fit = null, dirty = false, ready = false, savedAt = null, saving = false, tail = '', alive = true;
    const decoder = new TextDecoder();
    let pending = [], raf = 0;

    const setStatus = (txt, kind) => { h(clear(status), null, icon(kind === 'ok' ? 'check' : kind === 'busy' ? 'refresh' : 'power'), txt); status.classList.toggle('is-ok', kind === 'ok'); };
    const drawStatus = () => setStatus(ready ? `Kører · Linux 6.8${savedAt ? ` · gemt kl. ${hm(savedAt)}` : ''}${dirty ? ' · ændringer' : ''}` : 'Starter …', ready ? 'ok' : 'busy');
    const send = (s) => { if (!emu) return; const b = enc.encode(s); let bin = ''; for (const x of b) bin += String.fromCharCode(x); emu.serial0_send(bin); dirty = true; };

    async function save(quiet) {
      if (!emu || !ready || saving) return;
      saving = true; setStatus('Gemmer maskinen …', 'busy');
      try {
        const st = await emu.save_state();
        const n = await saveMachine(st);
        savedAt = Date.now(); dirty = false;
        if (!quiet) toast('Maskinen er gemt', { type: 'ok', text: `Dine filer er der næste gang (${Math.round(n / 1048576)} MB i browseren).` });
      } catch (e) { if (!quiet) toast('Kunne ikke gemme maskinen', { type: 'bad', text: e.message }); }
      finally { saving = false; if (alive) drawStatus(); }
    }

    async function start({ fresh = false } = {}) {
      ready = false; drawStatus();
      boot.hidden = false;
      try { emu?.destroy(); } catch { /* */ }
      const [{ V86 }, { Terminal }, { FitAddon }] = await Promise.all([import(V + 'libv86.mjs'), import('/vendor/xterm/xterm.mjs'), import('/vendor/xterm/addon-fit.mjs')]);
      if (!term) {
        term = new Terminal({ cursorBlink: true, fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace", fontSize: matchMedia('(max-width: 640px)').matches ? 13 : 15, scrollback: 4000, convertEol: false,
          theme: { background: '#0c0a09', foreground: '#e7e5e4', cursor: '#f97316', cursorAccent: '#0c0a09', selectionBackground: 'rgba(249,115,22,.35)', black: '#1c1917', red: '#f87171', green: '#4ade80', yellow: '#fbbf24', blue: '#60a5fa', magenta: '#e879f9', cyan: '#67e8f9', white: '#e7e5e4', brightBlack: '#78716c', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#f0abfc', brightCyan: '#a5f3fc', brightWhite: '#fafaf9' } });
        fit = new FitAddon(); term.loadAddon(fit);
        term.open(host);
        term.onData((d) => {
          if ((sticky.ctrl || sticky.alt) && d.length === 1) { d = keySeq(d, sticky); sticky.ctrl = sticky.alt = false; drawKeys(); }
          send(d);
        });
        fitNow();
      }
      const saved = fresh ? null : await loadSaved();
      if (!alive) return;
      if (saved) { savedAt = saved.at; h(clear(boot.querySelector('.lx-boot-line')), null, 'Henter din gemte maskine …'); }
      emu = new V86({
        wasm_path: V + 'v86.wasm', bios: { url: V + 'seabios.bin' }, vga_bios: { url: V + 'vgabios.bin' },
        bzimage: saved ? undefined : { url: V + 'linux.bin' }, cmdline: 'tsc=reliable mitigations=off random.trust_cpu=on console=ttyS0',
        initial_state: saved ? { buffer: saved.state } : undefined,
        memory_size: MEM, autostart: true, disable_keyboard: true, disable_mouse: true, disable_speaker: true,
      });
      emu.add_listener('serial0-output-byte', (b) => {
        pending.push(b);
        if (!raf) raf = requestAnimationFrame(flush);
      });
      if (saved) emu.add_listener('emulator-ready', () => { ready = true; boot.hidden = true; drawStatus(); setTimeout(() => { send('\n'); dirty = false; sizeShell(); term.focus(); }, 250); });
    }
    function flush() {
      raf = 0;
      if (!pending.length || !term) return;
      const bytes = new Uint8Array(pending); pending = [];
      const text = decoder.decode(bytes, { stream: true });
      term.write(text);
      tail = (tail + text).slice(-200);
      if (!ready) {
        const line = tail.split(/\r?\n/).filter(Boolean).pop() || '';
        const el = boot.querySelector('.lx-boot-line'); if (el && line) el.textContent = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').slice(0, 90);
        if (/login:\s*$/.test(tail)) send('root\n');
        if (/[#%$] $/.test(tail)) { ready = true; boot.hidden = true; drawStatus(); sizeShell(true); term.focus(); logActivity('linux', 'open', 'Linux-terminal', 'Startede en rigtig Linux'); }
      }
    }
    // the serial line doesn't know the window size: tell the shell, so less, top and vi fill the terminal
    let sized = '';
    function sizeShell(clearAfter) {
      if (!term || !ready) return;
      const k = `${term.cols}x${term.rows}`;
      if (k === sized) return;
      sized = k;
      send(`stty cols ${term.cols} rows ${term.rows}${clearAfter ? '; clear' : ''}\n`);
    }
    function fitNow() { try { fit?.fit(); } catch { /* */ } }
    const ro = new ResizeObserver(() => { fitNow(); clearTimeout(ro.t); ro.t = setTimeout(() => { if (/[#%$] $/.test(tail)) sizeShell(); }, 400); });
    ro.observe(host);

    function drawKeys() {
      h(clear(keyRow), null, EXTRA_KEYS.map(([k, label]) => h('button', { type: 'button', class: ['lx-key', (k === 'ctrl' && sticky.ctrl) || (k === 'alt' && sticky.alt) ? 'is-on' : null], 'aria-pressed': k === 'ctrl' ? String(sticky.ctrl) : k === 'alt' ? String(sticky.alt) : null,
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => {
          if (k === 'ctrl' || k === 'alt') { sticky[k] = !sticky[k]; drawKeys(); }
          else { send(keySeq(k, sticky)); sticky.ctrl = sticky.alt = false; drawKeys(); }
          term?.focus();
        } }, label)));
    }
    drawKeys();

    const tryList = h('ul', { class: 'lx-try' }, TRY.map(([cmd, what]) => h('li', null, h('button', { type: 'button', class: 'lx-try-btn', onclick: () => { if (!ready) return; send(cmd); term.focus(); } }, h('code', null, cmd), h('span', { class: 'faint' }, what)))));
    const full = h('button', { class: 'btn btn-ghost', 'aria-pressed': 'false', onclick: () => { const on = !page.classList.contains('is-full'); page.classList.toggle('is-full', on); full.setAttribute('aria-pressed', String(on)); h(clear(full), null, icon(on ? 'minimize' : 'maximize'), on ? 'Normal visning' : 'Fuld skærm'); setTimeout(fitNow, 60); term?.focus(); } }, icon('maximize'), 'Fuld skærm');
    const actions = h('div', { class: 'lx-actions' },
      status,
      h('button', { class: 'btn btn-primary', onclick: () => save(false) }, icon('save'), 'Gem maskinen'),
      full,
      h('button', { class: 'btn btn-ghost', onclick: () => {
        const ok = h('button', { class: 'btn btn-danger' }, 'Nulstil'), no = h('button', { class: 'btn btn-ghost' }, 'Annullér');
        const m = modal({ title: 'Start en helt ny maskine?', label: 'Linux-terminal', size: 460, body: h('p', null, 'Den gemte maskine slettes fra denne browser – også filerne i den. Linux starter forfra.'), actions: [no, ok] });
        no.onclick = () => m.close();
        ok.onclick = async () => { m.close(); await forgetMachine(); savedAt = null; sized = ''; tail = ''; term?.reset(); start({ fresh: true }); };
      } }, icon('refresh'), 'Nulstil'));

    const autosave = setInterval(() => { if (dirty && ready && !document.hidden) save(true); }, 120000);
    const onHide = () => { if (document.visibilityState === 'hidden' && dirty) save(true); };
    document.addEventListener('visibilitychange', onHide);
    this._stop = async () => {
      alive = false; clearInterval(autosave); ro.disconnect(); document.removeEventListener('visibilitychange', onHide);
      if (dirty && ready) { try { await save(true); } catch { /* */ } }
      try { emu?.destroy(); } catch { /* */ }
      try { term?.dispose(); } catch { /* */ }
      emu = null; term = null;
    };

    h(page, null,
      appHero(app, { compact: true, eyebrow: 'Læring · Linux', title: 'Linux-terminal', lead: 'En rigtig Linux at lege i – lige som Termux. Skriv kommandoer, lav filer, skriv scripts og prøv vi og top.' }),
      actions,
      h('div', { class: 'lx-wrap' },
        h('div', { class: 'lx-main glass' }, h('div', { class: 'lx-screen' }, host, boot), keyRow),
        h('aside', { class: 'lx-side glass' },
          h('h2', { class: 'lx-side-h' }, icon('sparkles'), 'Prøv'),
          tryList,
          h('p', { class: 'faint lx-note' }, icon('lock'), 'Det er en rigtig Linux (Buildroot · Linux 6.8 · BusyBox), der kører i en lukket maskine på din enhed. Den kan ikke se dine filer eller komme på internettet, så du kan ikke ødelægge noget. Maskinen gemmes i browseren, når du forlader siden, og med Gem maskinen.'))));
    start().catch((e) => { boot.hidden = false; h(clear(boot), null, icon('alert'), h('b', null, 'Linux kunne ikke starte'), h('span', { class: 'faint' }, e.message)); setStatus('Fejl', 'bad'); });
    return page;
  },
  destroy() { this._stop?.(); },
};
