/**
 * The local language model, run with wllama (llama.cpp compiled to WebAssembly, web/vendor/wllama, MIT).
 * Everything runs in a worker on this device; only the model file itself is downloaded (once, then cached by the browser).
 */
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
  if (/JSPI|suspended|crashed|unreachable|RuntimeError/i.test(msg)) return 'AI-motoren gik ned. Prøv igen – hvis det sker igen, så vælg en mindre model eller genindlæs siden.';
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
 * load({ model, ctx, file, url, gpu }, onProgress)
 *   model: an entry from models.js (downloaded from Hugging Face), or file: a local .gguf, or url: a direct .gguf link
 */
export async function load({ model, ctx = 2048, file = null, url = null, gpu = true }) {
  const key = `${file ? 'file:' + file.name + file.size : url || model?.id}|${ctx}|${gpu}`;
  if (loadedKey === key && W) return;
  if (loading) await loading.catch(() => {});
  if (loadedKey === key && W) return;
  loading = (async () => {
    await unload();
    set({ status: 'loading', progress: 0, error: null, model: file ? { name: file.name } : url ? { name: url.split('/').pop() } : model, ctx });
    const { Wllama } = await wllama();
    W = new Wllama({ default: abs('/vendor/wllama/wllama.wasm') }, { suppressNativeLog: true, logger: quiet, allowOffline: true, parallelDownloads: 3 });
    W.setCompat(COMPAT, 'always');
    let lastTick = Date.now();
    const params = { n_ctx: ctx, n_batch: 512, warmup: false, progressCallback: ({ loaded, total }) => { lastTick = Date.now(); set({ progress: total ? loaded / total : 0 }); } };
    // not enough room to keep the model in the browser: load it straight into memory (downloaded again next time)
    const need = file ? 0 : model?.size || 0;
    const free = need ? await freeSpace() : null;
    if (need && free != null && free < need * 1.08) { params.useCache = false; set({ noCache: true }); }
    if (!gpu) params.n_gpu_layers = 0;
    // a watchdog: some failures inside the library never report back – don't let "Indlæser…" spin forever
    const watch = (pr) => new Promise((resolve, reject) => {
      lastTick = Date.now();
      const t = setInterval(() => {
        if (Date.now() - lastTick > STALL_MS) { clearInterval(t); reject(new Error('Indlæsningen gik i stå. Tjek internetforbindelsen og den ledige plads, og prøv igen – eller vælg en mindre model.')); }
      }, 5000);
      pr.then((v) => { clearInterval(t); resolve(v); }, (e) => { clearInterval(t); reject(e); });
    });
    const doLoad = async (p) => {
      // after the download, reading the model into memory has no progress events: allow it extra time
      const fetchOrRead = file ? W.loadModel([file], p)
        : p.useCache === false ? fetchToFile(url || hfUrl(model), (url || model.file).split('/').pop().split('?')[0], p.progressCallback).then((f) => W.loadModel([f], p))
          : url ? W.loadModelFromUrl(url, p) : W.loadModelFromHF({ repo: model.repo, file: model.file }, p);
      const slow = setInterval(() => { if (state.progress >= 1) lastTick = Date.now() - STALL_MS / 2; }, 60000);
      try { await watch(fetchOrRead); } finally { clearInterval(slow); }
      // wllama resolves even when llama.cpp could not read the file – check what actually got loaded
      const info = W.getLoadedContextInfo?.();
      if (info && (info.success === false || !info.n_vocab)) throw new Error('Modelfilen kunne ikke indlæses. Er det en gyldig GGUF-chatmodel?');
    };
    try {
      try { await doLoad(params); }
      catch (e) {
        // saving to the browser's storage failed (full, private window …): try once more without saving
        if (params.useCache === false || file || !/QuotaExceeded|quota|storage|OPFS|NoModificationAllowed/i.test(String(e?.message || e))) throw e;
        try { await W.exit(); } catch { /* */ }
        W = new Wllama({ default: abs('/vendor/wllama/wllama.wasm') }, { suppressNativeLog: true, logger: quiet, allowOffline: true, parallelDownloads: 3 });
        W.setCompat(COMPAT, 'always');
        params.useCache = false; set({ noCache: true, progress: 0 });
        await doLoad(params);
      }
      const meta = W.getModelMetadata?.()?.meta || {};
      if (!meta['tokenizer.chat_template']) {   // models without a chat template: fall back to ChatML
        await W.exit();
        W = new Wllama({ default: abs('/vendor/wllama/wllama.wasm') }, { suppressNativeLog: true, logger: quiet, allowOffline: true, parallelDownloads: 3 });
        W.setCompat(COMPAT, 'always');
        await doLoad({ ...params, chat_template: 'chatml' });
      }
    } catch (e) {
      console.error('[AI] load failed', e);
      try { await W?.exit(); } catch { /* */ }
      W = null; loadedKey = null;
      const nice = niceError(e);
      reportError('load', e, { model: model?.id || (url ? 'url' : 'file'), ctx, compat: !WebAssembly.Suspending });
      set({ status: 'error', error: nice });
      throw new Error(nice);
    }
    loadedKey = key;
    const real = W.getLoadedContextInfo?.()?.n_ctx;   // llama.cpp caps the context at what the model was trained for
    set({ status: 'ready', progress: 1, ctx: real || ctx });
  })();
  try { await loading; } finally { loading = null; }
}

export async function unload() {
  const w = W; W = null; loadedKey = null;
  if (w) { try { await w.exit(); } catch { /* */ } }
  if (state.status !== 'error') set({ status: 'idle', progress: 0 });
}

/** Errors go to the server log (no conversation text), so problems on users' devices can be found and fixed. */
function reportError(where, e, extra) {
  try {
    fetch('/api/client-errors', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hubtech' },
      body: JSON.stringify({ kind: 'ai-' + where, message: String(e?.message || e).slice(0, 500), extra: { ...extra, jspi: !!WebAssembly.Suspending, ua: navigator.userAgent.slice(0, 160) } }) }).catch(() => {});
  } catch { /* */ }
}

export const isReady = () => !!W && state.status === 'ready';

/** Stream a chat answer. onToken(textSoFar). Returns the full text. */
export async function chat(messages, { onToken, signal, maxTokens = 512, temperature = 0.4 } = {}) {
  if (!W) throw new Error('Modellen er ikke indlæst.');
  let text = '';
  set({ status: 'thinking' });
  try {
    await W.createChatCompletion({
      messages, max_tokens: maxTokens, temperature, top_p: 0.9, top_k: 40, penalty_repeat: 1.1, stream: true, abortSignal: signal,
      onData: (chunk) => { const d = chunk?.choices?.[0]?.delta?.content; if (d) { text += d; onToken?.(text); } },
    });
  } catch (e) {
    if (e?.name !== 'WllamaAbortError' && e?.name !== 'AbortError' && !signal?.aborted) {
      set({ status: 'ready' });
      if (/kv_cache_full|context/i.test(String(e?.message || e?.type))) throw Object.assign(new Error('Samtalen er blevet for lang til modellens hukommelse. Start en ny samtale, eller vælg mere hukommelse i indstillingerne.'), { code: 'context' });
      reportError('chat', e, {});
      if (/crashed|RuntimeError|unreachable|JSPI/i.test(String(e?.message || e))) { try { await W?.exit(); } catch { /* */ } W = null; loadedKey = null; set({ status: 'idle' }); }
      throw new Error(niceError(e));
    }
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
