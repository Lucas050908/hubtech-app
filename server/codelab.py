"""Kodeudfordringer: the sandbox that runs the user's JavaScript against the tests.

The page is served with `sandbox allow-scripts` (no allow-same-origin), so the code runs in an opaque origin:
it can't read HUBTECH cookies or call the API. Each run happens in a Web Worker that is stopped after two
seconds, so an endless loop can't hang anything. Results go back to the parent page with postMessage.
"""
import re

RUN_CSP = ("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; "
           "connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts")

RUNNER = r"""<!doctype html><html lang="da"><head><meta charset="utf-8"><title>Kørsel</title></head><body><script>
(function(){
var HARNESS = function(){
  var logs = [];
  var fmt = function(x){ if (typeof x === 'string') return x; try { return JSON.stringify(x); } catch (e) { return String(x); } };
  console.log = console.info = console.warn = console.error = function(){ if (logs.length < 100) logs.push([].map.call(arguments, fmt).join(' ').slice(0, 500)); };
  var same = function(a, b){
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9 || (isNaN(a) && isNaN(b));
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (!same(a[ka[i]], b[ka[i]])) return false;
    return true;
  };
  self.onmessage = function(e){
    var d = e.data, f;
    try { f = new Function(d.code + '\n;return typeof ' + d.fn + ' === "function" ? ' + d.fn + ' : undefined;')(); }
    catch (err) { postMessage({ error: (err && err.name === 'SyntaxError' ? 'Syntaksfejl: ' : '') + (err && err.message || String(err)), logs: logs }); return; }
    if (!f) { postMessage({ error: 'Der er ingen funktion, der hedder ' + d.fn + '.', logs: logs }); return; }
    var res = d.tests.map(function(t){
      try { var got = f.apply(null, JSON.parse(JSON.stringify(t.args))); return { ok: same(got, t.expect), got: fmt(got) }; }
      catch (err) { return { ok: false, error: err && err.message || String(err) }; }
    });
    postMessage({ res: res, logs: logs });
  };
};
var src = URL.createObjectURL(new Blob(['(' + HARNESS.toString() + ')()'], { type: 'text/javascript' }));
addEventListener('message', function(e){
  var d = e.data; if (!d || !d.__code) return;
  var w = new Worker(src), done = false;
  var t = setTimeout(function(){ if (done) return; done = true; w.terminate(); parent.postMessage({ __code: 1, id: d.id, error: 'Koden tog for lang tid (over 2 sekunder). Er der en løkke, der aldrig stopper?' }, '*'); }, 2000);
  w.onmessage = function(m){ if (done) return; done = true; clearTimeout(t); w.terminate(); parent.postMessage(Object.assign({ __code: 1, id: d.id }, m.data), '*'); };
  w.onerror = function(err){ if (done) return; done = true; clearTimeout(t); w.terminate(); parent.postMessage({ __code: 1, id: d.id, error: err.message || 'Fejl' }, '*'); err.preventDefault && err.preventDefault(); };
  w.postMessage({ code: String(d.code).slice(0, 50000), fn: String(d.fn).replace(/[^\w$]/g, ''), tests: d.tests });
});
parent.postMessage({ __code: 1, ready: true }, '*');
})();
</script></body></html>"""


def runner(req, params):
    return 200, RUNNER.encode("utf-8"), {"Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": RUN_CSP, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}


ROUTES = [("GET", r"/api/code/runner", runner)]


def install(api_module):
    if not getattr(api_module, "_codelab_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._codelab_installed = True
