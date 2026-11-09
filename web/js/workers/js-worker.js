/* Kodeskolen: runs a learner's JavaScript in an isolated worker (no page, no cookies, no network). */
const fmt = (v, seen = new Set()) => {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return `[Function ${v.name || 'anonym'}]`;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'object' && v !== null) {
    if (seen.has(v)) return '[Cirkulær]';
    seen.add(v);
    try { return Array.isArray(v) ? `[ ${v.map(x => typeof x === 'string' ? JSON.stringify(x) : fmt(x, seen)).join(', ')} ]` : JSON.stringify(v, null, 0).replace(/^\{"/, '{ "').replace(/\}$/, ' }').replace(/","/g, '", "').replace(/":/g, '": ').replace(/,"/g, ', "'); } catch { return String(v); }
  }
  return String(v);
};
// no network or other scripts from learner code
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches']) {
  try { Object.defineProperty(self, k, { value: undefined, configurable: false }); } catch { /* */ }
}
let lines = [];
const log = (...a) => { lines.push(a.map(x => fmt(x)).join(' ')); };
self.console = { log, info: log, warn: (...a) => log('⚠', ...a), error: (...a) => log('✖', ...a), table: (x) => log(x) };
// track timers so we can wait for setTimeout/Promise based code to finish (max 2 s)
let pending = 0;
const _st = setTimeout.bind(self);
self.setTimeout = (fn, ms, ...args) => { pending++; return _st(() => { pending--; try { fn(...args); } catch (err) { log('✖', err); } }, Math.min(ms || 0, 1500)); };
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
self.onmessage = async (e) => {
  const { id, code, test } = e.data || {};
  lines = [];
  let error = null, testError = null;
  const body = `"use strict";\n${code}\n;\n` + (test ? `try { await (async () => {\n${test}\n})(); } catch (__e) { throw { __fromTest: true, message: (__e && __e.message) || String(__e) }; }` : '');
  try {
    await new AsyncFn(body)();
    const t0 = Date.now();
    while (pending > 0 && Date.now() - t0 < 2000) await new Promise(r => _st(r, 20));
  } catch (err) {
    if (err && err.__fromTest) testError = err.message;
    else error = `${err && err.name ? err.name + ': ' : ''}${err && err.message ? err.message : err}`;
  }
  self.postMessage({ id, out: lines.join('\n'), ok: !error, error, testError });
};
