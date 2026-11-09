/**
 * What the user is looking at right now, for the AI assistant. Pages call setAiContext() (cheap – no AI code is loaded)
 * and clear it in destroy(). Kodeskolen sets { kind: 'exercise', … } which switches the assistant to teacher mode.
 */
let current = null;
const subs = new Set();
export function setAiContext(ctx) { current = ctx ? { ...ctx, at: Date.now() } : null; subs.forEach(f => { try { f(current); } catch { /* */ } }); }
export function getAiContext() { return current; }
export function onAiContext(fn) { subs.add(fn); return () => subs.delete(fn); }
