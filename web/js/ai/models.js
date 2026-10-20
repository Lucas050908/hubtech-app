/** Language models the assistant can run on the device, and how much memory they need. */
export const MODELS = [
  { id: 'qwen05', name: 'Qwen 2.5 · 0,5B', size: 491400032, params: 0.5, repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    kvPerToken: 12288, note: 'Mindst og hurtigst – til telefoner og ældre computere. Kan følge enkle opgaver.' },
  { id: 'llama1b', name: 'Llama 3.2 · 1B', size: 807694464, params: 1.2, repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF', file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    kvPerToken: 32768, note: 'God balance på nyere telefoner.' },
  { id: 'qwen15', name: 'Qwen 2.5 · 1,5B', size: 1117320736, params: 1.5, repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    kvPerToken: 28672, note: 'Bedre til dansk og kode. Anbefalet på computere.' },
  { id: 'llama3b', name: 'Llama 3.2 · 3B', size: 1928200736, params: 3.2, repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF', file: 'Llama-3.2-3B-Instruct-Q4_K_S.gguf',
    kvPerToken: 114688, note: 'Klogest – kræver en computer med god plads i hukommelsen.' },
];
export const CTX_STEPS = [1024, 2048, 4096, 8192];
const OVERHEAD = 180 * 1024 * 1024;   // runtime, buffers and the browser's own share

/** Estimated memory (bytes) for a model at a context length. */
export function ramFor(model, ctx) { return model.size + model.kvPerToken * ctx + OVERHEAD + ctx * 4096; }

/** The best model + context that fits within a memory limit (bytes). */
export function pickFor(limit) {
  let best = null;
  for (const m of MODELS) for (const c of CTX_STEPS) {
    if (c < 2048 && m.id !== 'qwen05') continue;
    const r = ramFor(m, c);
    if (r <= limit && (!best || m.params > best.model.params || (m.params === best.model.params && c > best.ctx))) best = { model: m, ctx: c, ram: r };
  }
  return best || { model: MODELS[0], ctx: 1024, ram: ramFor(MODELS[0], 1024), tooSmall: true };
}

export const gb = (b) => `${(b / 1073741824).toLocaleString('da-DK', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GB`;
export const mb = (b) => b >= 1073741824 ? gb(b) : `${Math.round(b / 1048576)} MB`;

/** A guess at the device's memory (navigator.deviceMemory is rounded and only in Chromium). */
export function deviceRam() {
  const dm = navigator.deviceMemory;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  // phones: browsers allow a tab far less memory than the phone has (iPhone ≈ 1–1,5 GB), and small models answer faster
  return { gb: dm || null, mobile, suggest: (mobile ? Math.min(dm ? dm / 4 : 1, 1.25) : Math.min(dm ? dm / 4 : 2, 2)) * 1073741824 };
}
