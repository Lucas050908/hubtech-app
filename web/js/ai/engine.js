/**
 * The local language model, run with wllama (llama.cpp compiled to WebAssembly, web/vendor/wllama, MIT).
 * Everything runs in a worker on this device; only the model file itself is downloaded (once, then cached by the browser).
 */
import { stripThink } from './models.js';

const abs = (p) => new URL(p, location.origin).href;
let W = null, loadedKey = null, loading = null, lib = null;
const listeners = new Set();
export const state = { status: 'idle', progress: 0, model: null, ctx: 0, error: null, compat: false };
function set(patch) { Object.assign(state, patch); listeners.forEach(f => { try { f(state); } catch { /* */ } }); }
export function onEngine(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// the build for browsers without JSPI/Memory64 (Safari, Firefox, older Chrome/Android) – served from HUBTECH itself
const COMPAT = { worker: abs('/vendor/wllama/compat/wllama.js'), wasm: abs('/vendor/wllama/compat/wllama.wasm') };
const STALL_MS = 120000;          // no progress for 2 minutes while downloading/loading = stuck

/** Free space for saving the model in the browser (bytes), or null if unknown. Asks to keep the files. */
async function freeSpace() {
  try {
    if (!navigator.storage?.estimate) return null;
    try { await navigator.storage.persist?.(); } catch { /* */ }
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    return quota ? quota - usage : null;
  } catch { return null; }
}

/** Download a model straight into memory (when the browser has no room to keep it). */
async function fetchToFile(url, name, onProgress) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download status ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader(), parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    onProgress?.({ loaded, total });
  }
  return new File(parts, name, { type: 'application/octet-stream' });
}
const hfUrl = (m) => `https://huggingface.co/${m.repo}/resolve/main/${m.file}`;

/** Danish message for an error from the model library. */
export function niceError(e) {
  const msg = String(e?.message || e || '');
  if (/QuotaExceeded|quota|storage|NoModificationAllowed/i.test(msg)) return 'Der er ikke plads nok i browserens lager til at gemme modellen. Frigør plads på disken, eller vælg en mindre model.';
  if (/memory|Out of memory|allocation|RangeError|Aborted\(\)|OOM/i.test(msg)) return 'Der var ikke hukommelse nok. Vælg en lavere RAM-grænse eller en mindre model under Indstillinger i assistenten.';
  if (/Failed to fetch|NetworkError|network|download|ERR_|Load failed|status (4|5)\d\d/i.test(msg)) return 'Modellen kunne ikke hentes. Tjek internetforbindelsen – første gang skal modellen downloades (og firewall eller annonceblokering må ikke blokere huggingface.co).';
  if (/gik i stå/.test(msg)) return msg;
  if (/\(ABORT\)|abort\(|JSPI|suspended|crashed|unreachable|RuntimeError/i.test(msg)) return 'AI-motoren gik ned. Prøv igen – hvis det sker igen, så vælg en mindre model eller genindlæs siden.';
  if (/compat|WebAssembly|SIMD|exception handling/i.test(msg)) return 'Din browser kan ikke køre den lokale AI. Opdatér browseren (Chrome, Edge, Firefox eller Safari 16.4+).';
  return msg || 'Ukendt fejl i AI-motoren.';
}

const quiet = { debug() {}, log() {}, warn() {}, error: (...a) => console.error('[AI]', ...a) };

async function wllama() {
  lib ||= await import(abs('/vendor/wllama/wllama.min.js'));
  return lib;
}

export function supported() {
  try {
    if (typeof WebAssembly !== 'object' || typeof Worker !== 'function') return 'Din browser kan ikke køre WebAssembly i baggrunden.';
    // SIMD + exception handling are required by llama.cpp's build
    const simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    if (!simd) return 'Din browser mangler WebAssembly SIMD. Opdatér browseren (Chrome, Edge, Safari 16.4+ eller Firefox).';
  } catch { return 'Din browser kan ikke køre den lokale AI.'; }
  return null;
}

/**
 * Only one load runs at a time, on its own instance – it becomes the active one (W) when the model is in.
 * Every load and unload takes a number; a load that is no longer the newest stops quietly ("superseded"):
 * a second click on Væk Gnist, a new choice of model or "Lad Gnist sove" while a model is on its way.
 */
let gen = 0, pending = null;
const superseded = () => Object.assign(new Error('Indlæsningen blev afbrudt, fordi noget andet blev valgt.'), { code: 'superseded' });
async function fresh() {
  const { Wllama } = await wllama();
  const w = new Wllama({ default: abs('/vendor/wllama/wllama.wasm') }, { suppressNativeLog: true, logger: quiet, allowOffline: true, parallelDownloads: 3 });
  w.setCompat(COMPAT, 'always');
  return w;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
// putting an instance away must never hang the app: a model that is busy can be slow to answer "exit"
const drop = async (w) => { if (!w) return; try { await Promise.race([w.exit(), wait(4000)]); } catch { /* already gone */ } };
// the answer that is being written right now – it is asked to stop before its model is put away or replaced
let talking = null;
const hush = async () => { const t = talking; if (t) { t.abort(); await Promise.race([t.done, wait(2500)]); } };

/**
 * load({ model, ctx, file, url, gpu })
 *   model: an entry from models.js (downloaded from Hugging Face), or file: a local .gguf, or url: a direct .gguf link
 */
export async function load({ model, ctx = 2048, file = null, url = null, gpu = true }) {
  const key = `${file ? 'file:' + file.name + file.size : url || model?.id}|${ctx}|${gpu}`;
  if (loadedKey === key && W) return;
  if (loading?.key === key) return loading.promise;   // the same model is already on its way: wait for that one
  const mine = ++gen, before = loading;
  const stale = () => mine !== gen;
  const promise = (async () => {
    // stop what is on its way and let it finish stopping; then put the active model away
    const p0 = pending; pending = null; await drop(p0);
    if (before) await before.promise.catch(() => {});
    if (stale()) throw superseded();
    external = null;
    await hush();
    const old = W; W = null; loadedKey = null; await drop(old);
    if (stale()) throw superseded();
    set({ status: 'loading', progress: 0, error: null, model: file ? { name: file.name } : url ? { name: url.split('/').pop() } : model, ctx, noCache: false });
    let inst = null;
    let lastTick = Date.now();
    const params = { n_ctx: ctx, n_batch: 512, warmup: false, progressCallback: ({ loaded, total }) => { lastTick = Date.now(); if (!stale()) set({ progress: total ? loaded / total : 0 }); } };
    // a watchdog: some failures inside the library never report back – don't let "Indlæser…" spin forever
    const watch = (pr) => new Promise((resolve, reject) => {
      lastTick = Date.now();
      const t = setInterval(() => {
        if (stale()) { clearInterval(t); reject(superseded()); return; }
        if (Date.now() - lastTick > STALL_MS) { clearInterval(t); reject(new Error('Indlæsningen gik i stå. Tjek internetforbindelsen og den ledige plads, og prøv igen – eller vælg en mindre model.')); }
      }, 1000);
      pr.then((v) => { clearInterval(t); resolve(v); }, (e) => { clearInterval(t); reject(e); });
    });
    const open = async () => { await drop(inst); inst = await fresh(); if (stale()) { await drop(inst); throw superseded(); } pending = inst; };
    const doLoad = async (p) => {
      // after the download, reading the model into memory has no progress events: allow it extra time
      const w = inst;
      const fetchOrRead = file ? w.loadModel([file], p)
        : p.useCache === false ? fetchToFile(url || hfUrl(model), (url || model.file).split('/').pop().split('?')[0], p.progressCallback).then((f) => { if (stale()) throw superseded(); return w.loadModel([f], p); })
          : url ? w.loadModelFromUrl(url, p) : w.loadModelFromHF({ repo: model.repo, file: model.file }, p);
      const slow = setInterval(() => { if (state.progress >= 1) lastTick = Date.now() - STALL_MS / 2; }, 60000);
      try { await watch(fetchOrRead); } finally { clearInterval(slow); }
      if (stale()) throw superseded();
      // wllama resolves even when llama.cpp could not read the file – check what actually got loaded
      const info = w.getLoadedContextInfo?.();
      if (info && (info.success === false || !info.n_vocab)) throw new Error('Modelfilen kunne ikke indlæses. Er det en gyldig GGUF-chatmodel?');
    };
    try {
      // not enough room to keep the model in the browser: load it straight into memory (downloaded again next time)
      const need = file ? 0 : model?.size || 0;
      const free = need ? await freeSpace() : null;
      if (stale()) throw superseded();
      if (need && free != null && free < need * 1.08) { params.useCache = false; set({ noCache: true }); }
      if (!gpu) params.n_gpu_layers = 0;
      await open();
      try { await doLoad(params); }
      catch (e) {
        // saving to the browser's storage failed (full, private window …): try once more without saving
        if (stale() || e?.code === 'superseded' || params.useCache === false || file || !/QuotaExceeded|quota|storage|OPFS|NoModificationAllowed/i.test(String(e?.message || e))) throw e;
        await open();
        params.useCache = false; set({ noCache: true, progress: 0 });
        await doLoad(params);
      }
      const meta = inst.getModelMetadata?.()?.meta || {};
      if (!meta['tokenizer.chat_template']) {   // models without a chat template: fall back to ChatML
        await open();
        await doLoad({ ...params, chat_template: 'chatml' });
      }
    } catch (e) {
      const mineStill = !stale();
      if (pending === inst) pending = null;
      await drop(inst);
      if (!mineStill || e?.code === 'superseded') throw superseded();   // someone chose something else: no error on the screen
      console.error('[AI] load failed', e);
      const nice = niceError(e);
      reportError('load', e, { model: model?.id || (url ? 'url' : 'file'), ctx, compat: !WebAssembly.Suspending });
      set({ status: 'error', error: nice });
      throw new Error(nice);
    }
    if (stale()) { if (pending === inst) pending = null; await drop(inst); throw superseded(); }
    W = inst; pending = null; loadedKey = key;
    const real = inst.getLoadedContextInfo?.()?.n_ctx;   // llama.cpp caps the context at what the model was trained for
    let threads = 1; try { threads = inst.getNumThreads?.() || 1; } catch { /* */ }
    set({ status: 'ready', progress: 1, ctx: real || ctx, threads });
  })();
  const entry = { key, promise };
  loading = entry;
  try { await promise; } finally { if (loading === entry) loading = null; }
}

/** A big model in Ollama/LM Studio on this computer, reached through HUBTECH (nothing to download in the browser). */
export async function loadExternal(name) {
  await unload();
  const mine = gen;
  const cloud = name.startsWith('cloud:');
  set({ status: 'loading', progress: 0.5, error: null, model: { id: 'ext:' + name, name, think: !cloud && /qwen3|deepseek-r1|qwq/i.test(name), external: true, cloud }, ctx: cloud ? 100000 : 16384, noCache: false });
  try {
    const res = await fetch('/api/ai/external', { headers: { 'X-Requested-With': 'hubtech' } });
    const r = await res.json().catch(() => ({}));
    if (mine !== gen) throw superseded();
    if (!res.ok) throw new Error(`HUBTECH kunne ikke slå modellerne op (fejl ${res.status}). Genstart HUBTECH, og prøv igen.`);
    if (cloud) {
      if (!(r.cloud || []).some(m => m.id === name)) throw new Error('Den AI-tjeneste er ikke sat op (længere). Ejeren kan tilføje en nøgle under «Claude og andre AI’er».');
    } else {
      if (!r.ok) throw new Error('Ollama/LM Studio svarer ikke. Start programmet på computeren, eller vælg en model i browseren.');
      if (!(r.models || []).some(m => m.id === name)) throw new Error(`Modellen ${name} er ikke hentet i Ollama endnu. Hent den under Store modeller.`);
    }
    external = name;
    set({ status: 'ready', progress: 1, threads: 0 });
  } catch (e) {
    if (e?.code === 'superseded' || mine !== gen) throw superseded();
    external = null; set({ status: 'error', error: e.message }); throw e;
  }
}
let external = null;

export async function unload() {
  gen++;   // a load that is on its way stops by itself
  external = null;
  await hush();
  const p0 = pending, w = W; pending = null; W = null; loadedKey = null;
  await drop(p0); await drop(w);
  if (state.status !== 'error') set({ status: 'idle', progress: 0 });
}

/** Errors go to the server log (no conversation text), so problems on users' devices can be found and fixed. */
function reportError(where, e, extra) {
  try {
    fetch('/api/client-errors', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hubtech' },
      body: JSON.stringify({ kind: 'ai-' + where, message: String(e?.message || e).slice(0, 500), extra: { ...extra, jspi: !!WebAssembly.Suspending, ua: navigator.userAgent.slice(0, 160) } }) }).catch(() => {});
  } catch { /* */ }
}

export const isReady = () => (!!W || !!external) && state.status === 'ready';

/** Stream a chat answer. onToken(textSoFar). Returns the full text. */
export async function chat(messages, opts = {}) {
  if (external) return chatExternal(messages, opts);
  const { onToken, signal, temperature = 0.4 } = opts;
  let { maxTokens = 512 } = opts;
  if (!W) throw new Error('Modellen er ikke indlæst.');
  const w = W;   // the model this answer runs on – it can be put away or replaced while we wait
  const inner = new AbortController(), onAbort = () => inner.abort();
  if (signal?.aborted) inner.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  let finish; const mine = { abort: () => inner.abort(), done: new Promise(r => { finish = r; }) };
  talking = mine;
  let text = '', raw = '';
  // Qwen 3: answer straight away (no long "thinking" first) – faster on a small device
  const think = !!state.model?.think || /qwen3/i.test(state.model?.name || '');
  if (think) {
    messages = messages.map((m, i) => (i === messages.length - 1 && m.role === 'user' ? { ...m, content: m.content + ' /no_think' } : m));
    maxTokens += 40;
  }
  set({ status: 'thinking' });
  try {
    await w.createChatCompletion({
      messages, max_tokens: maxTokens, temperature, top_p: 0.9, top_k: 40, penalty_repeat: 1.1, stream: true, abortSignal: inner.signal,
      onData: (chunk) => { const d = chunk?.choices?.[0]?.delta?.content; if (d) { raw += d; const t = think ? stripThink(raw) : raw; if (t !== text) { text = t; onToken?.(text); } } },
    });
  } catch (e) {
    if (W !== w) return text;   // put away or replaced while she was answering: what came so far is the answer, and no error
    if (e?.name !== 'WllamaAbortError' && e?.name !== 'AbortError' && !inner.signal.aborted) {
      set({ status: 'ready' });
      if (/kv_cache_full|context/i.test(String(e?.message || e?.type))) throw Object.assign(new Error('Samtalen er blevet for lang til modellens hukommelse. Start en ny samtale, eller vælg mere hukommelse i indstillingerne.'), { code: 'context' });
      reportError('chat', e, {});
      const crash = /\(ABORT\)|abort\(|crashed|RuntimeError|unreachable|JSPI/i.test(String(e?.message || e));
      if (crash) { if (W === w) { W = null; loadedKey = null; } await drop(w); set({ status: 'idle' }); }
      throw Object.assign(new Error(niceError(e)), crash ? { code: 'crash' } : {});
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (talking === mine) talking = null;
    finish();
  }
  if (W === w) set({ status: 'ready' });
  return text;
}

async function chatExternal(messages, { onToken, signal, maxTokens = 1024, temperature = 0.4 } = {}) {
  const think = !!state.model?.think;
  if (think) messages = messages.map((m, i) => (i === messages.length - 1 && m.role === 'user' ? { ...m, content: m.content + ' /no_think' } : m));
  set({ status: 'thinking' });
  let raw = '', text = '';
  try {
    const res = await fetch('/api/ai/external/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hubtech' },
      body: JSON.stringify({ model: external, messages, max_tokens: maxTokens + (think ? 60 : 0), temperature }) });
    if (!res.ok) { let m = ''; try { m = (await res.json()).error; } catch { /* */ } throw new Error(m || `Fejl ${res.status}`); }
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += dec.decode(value, { stream: true });
      const t = think ? stripThink(raw) : raw;
      if (t !== text) { text = t; onToken?.(text); }
    }
  } catch (e) {
    if (e?.name !== 'AbortError' && !signal?.aborted) { set({ status: 'ready' }); throw new Error(e.message || 'Modellen svarede ikke.'); }
  }
  set({ status: 'ready' });
  return text;
}

/** Remove downloaded models from the browser's storage. */
export async function clearDownloads() {
  const { Wllama } = await wllama();
  const w = W || new Wllama({ default: abs('/vendor/wllama/wllama.wasm') }, { logger: quiet });
  await w.modelManager.clear();
  if (w !== W) { try { await w.exit(); } catch { /* */ } }
}

/** Which models are already downloaded (by URL). */
export async function downloaded() {
  try {
    const { Wllama } = await wllama();
    const w = W || new Wllama({ default: abs('/vendor/wllama/wllama.wasm') }, { logger: quiet });
    const ms = await w.modelManager.getModels();
    return ms.map(m => ({ url: m.url, size: m.size }));
  } catch { return []; }
}
