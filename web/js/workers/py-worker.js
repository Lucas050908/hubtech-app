/* Kodeskolen: runs Python with Pyodide (CPython compiled to WebAssembly) – entirely in this browser tab. */
/* global loadPyodide */
let py = null;
async function boot() {
  if (py) return py;
  importScripts('/vendor/pyodide/pyodide.js');
  py = await loadPyodide({ indexURL: '/vendor/pyodide/' });
  return py;
}
/** Keep only the learner's own frames ("<exec>") and the error itself – hide Pyodide internals. */
function cleanTrace(msg) {
  const res = [];
  let keep = true;
  for (const line of msg.split('\n')) {
    const f = line.match(/^\s*File "([^"]+)", line (\d+)(?:, in (.+))?/);
    if (f) {
      keep = f[1] === '<exec>';
      if (keep) res.push(`  Linje ${f[2]}${f[3] && f[3] !== '<module>' ? ` (i ${f[3]})` : ''}`);
      continue;
    }
    if (/^\s/.test(line)) { if (keep) res.push(line); continue; }
    keep = true;
    res.push(line.replace(/^Traceback \(most recent call last\):$/, 'Fejl (sidste kald nederst):'));
  }
  return res.join('\n').trim();
}
self.onmessage = async (e) => {
  const { id, code, test, stdin, warm } = e.data || {};
  let out = '', ok = true, error = null, testError = null;
  try {
    const p = await boot();
    if (warm) { self.postMessage({ id, ready: true }); return; }
    const lines = String(stdin || '').split('\n');
    let li = 0;
    p.setStdout({ batched: (s) => { out += s + '\n'; } });
    p.setStderr({ batched: (s) => { out += s + '\n'; } });
    p.setStdin({ stdin: () => (li < lines.length ? lines[li++] : null) });
    const ns = p.globals.get('dict')();
    try {
      await p.runPythonAsync(code, { globals: ns });
    } catch (err) {
      ok = false;
      error = cleanTrace(String(err.message || err));
    }
    if (ok && test) {
      try { await p.runPythonAsync(test, { globals: ns }); }
      catch (err) { const m = String(err.message || err).trim().split('\n'); testError = m[m.length - 1].replace(/^AssertionError:?\s*/, '') || 'Testen fejlede'; }
    }
    ns.destroy();
  } catch (err) {
    ok = false; error = 'Python kunne ikke starte: ' + (err.message || err);
  }
  self.postMessage({ id, out: out.replace(/\n$/, ''), ok, error, testError });
};
