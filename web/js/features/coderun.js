/**
 * Runs learner code for Kodeskolen – always isolated from HUBTECH itself:
 *  - Python: Pyodide in a Web Worker (first start downloads ~13 MB once, then it is cached)
 *  - JavaScript: a Web Worker without network or page access
 *  - HTML/CSS: a sandboxed iframe without scripts
 * Endless loops are stopped after a time limit by throwing the worker away.
 */
const workers = {};
let seq = 0;

function worker(kind) {
  if (!workers[kind]) {
    const w = new Worker({ python: '/js/workers/py-worker.js', sql: '/js/workers/sql-worker.js' }[kind] || '/js/workers/js-worker.js');
    workers[kind] = { w, ready: kind !== 'python' ? Promise.resolve() : null };
  }
  return workers[kind];
}
function kill(kind) { try { workers[kind]?.w.terminate(); } catch { /* */ } delete workers[kind]; }

function call(kind, msg, ms) {
  const wk = worker(kind);
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = ms ? setTimeout(() => { kill(kind); resolve({ id, out: '', ok: false, error: `Stoppet efter ${Math.round(ms / 1000)} sekunder – har du en løkke, der aldrig slutter?`, timeout: true }); }, ms) : 0;
    const onMsg = (e) => { if (e.data?.id !== id) return; clearTimeout(timer); wk.w.removeEventListener('message', onMsg); resolve(e.data); };
    wk.w.addEventListener('message', onMsg);
    wk.w.addEventListener('error', (e) => { clearTimeout(timer); kill(kind); resolve({ id, ok: false, out: '', error: e.message || 'Fejl i kodekøreren' }); }, { once: true });
    wk.w.postMessage({ ...msg, id });
  });
}

/** Load Python ahead of time (shows "Starter Python …" only once). */
export function warmPython() {
  const wk = worker('python');
  if (!wk.ready) wk.ready = call('python', { warm: true }, 0);
  return wk.ready;
}
export async function runPython(code, { test = '', stdin = '' } = {}) {
  await warmPython();
  return call('python', { code, test, stdin }, 10000);
}
export function runJs(code, { test = '' } = {}) { return call('javascript', { code, test }, 5000); }
/** SQL on a fresh SQLite database: `setup` builds the tables, `test` is read afterwards, `reference` (the solution) is run on its own copy. */
export function runSql(code, { setup = '', test = '', reference = '' } = {}) { return call('sql', { code, setup, test, reference }, 5000); }

/** Compare two result sets (lists of {columns, values}); order matters only when `ordered`. Returns an error text or null. */
export function compareTables(got, want, { ordered = false } = {}) {
  const g = got?.[got.length - 1], w = want?.[want.length - 1];
  if (!w) return null;
  if (!g) return 'Din forespørgsel gav ingen rækker.';
  if (g.columns.length !== w.columns.length) return `Forventede ${w.columns.length} kolonne${w.columns.length === 1 ? '' : 'r'} (${w.columns.join(', ')}), fik ${g.columns.length}.`;
  if (g.total !== w.total) return `Forventede ${w.total} række${w.total === 1 ? '' : 'r'}, fik ${g.total}.`;
  const key = (r) => JSON.stringify(r.map(v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  const a = g.values.map(key), b = w.values.map(key);
  if (!ordered) { a.sort(); b.sort(); }
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return ordered && [...a].sort().join() === [...b].sort().join() ? 'Rækkerne er rigtige, men rækkefølgen passer ikke – tjek ORDER BY.' : ordered ? `Række ${i + 1} passer ikke med det forventede.` : 'Mindst én række har andre værdier end forventet – tjek WHERE, SET og stavningen af tekst.';
  return null;
}

/** Render HTML into a sandboxed iframe (no scripts) and run the lesson's checks on it. */
export function renderHtml(frame, code) {
  return new Promise((resolve) => {
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.addEventListener('load', () => resolve(frame), { once: true });
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:16px;color:#111;background:#fff}</style>${code}`;
  });
}
export function checkHtml(frame, check = {}) {
  const doc = frame.contentDocument, win = frame.contentWindow;
  if (!doc) return 'Siden kunne ikke læses.';
  for (const [sel, text] of check.sel || []) {
    const el = doc.querySelector(sel);
    if (!el) return `Fandt ikke ${sel}.`;
    if (text && el.textContent.trim() !== text) return `${sel} skal indeholde “${text}” (fandt “${el.textContent.trim().slice(0, 40)}”).`;
  }
  for (const [sel, prop, want] of check.css || []) {
    const el = doc.querySelector(sel);
    if (!el) return `Fandt ikke ${sel}.`;
    const got = win.getComputedStyle(el).getPropertyValue(prop).trim();
    if (got !== want) return `${sel} skal have ${prop}: ${want} (lige nu: ${got || 'ikke sat'}).`;
  }
  return null;
}

/** Plain-language help for the most common errors (shown under the message). */
export function explainError(msg = '') {
  const m = String(msg);
  const rules = [
    [/\b(fetch|XMLHttpRequest|WebSocket|importScripts)\b/, 'Netværk er slået fra i Kodeskolen – din kode kører isoleret og kan ikke hente noget fra internettet.'],
    [/SyntaxError|unexpected EOF|invalid syntax|Unexpected token/i, 'Syntaksfejl: tjek parenteser, anførselstegn, kolon efter if/for/def og (i JavaScript) krøllede parenteser.'],
    [/IndentationError|unindent|expected an indented block/i, 'Indrykningsfejl: kode inde i if/for/def skal rykkes 4 mellemrum ind – og ens hele vejen.'],
    [/NameError|is not defined/i, 'Et navn kendes ikke: er variablen stavet rigtigt (store/små bogstaver tæller), og er den lavet, før du bruger den?'],
    [/TypeError/i, 'Typefejl: du blander typer – fx tekst og tal. Brug int(), float() eller str() (Python) eller Number()/String() (JavaScript).'],
    [/ValueError/i, 'Værdifejl: typen er rigtig, men værdien kan ikke bruges – fx int("abc").'],
    [/ZeroDivisionError/i, 'Division med 0 – tjek nævneren, før du dividerer.'],
    [/IndexError|out of range/i, 'Indeks uden for listen: husk at første element er [0], og sidste er [len-1].'],
    [/KeyError/i, 'Nøglen findes ikke i ordbogen – tjek stavningen, eller brug .get().'],
    [/no such table/i, 'Tabellen findes ikke – tjek stavningen. Tabellerne hedder kunder, opgaver og dele.'],
    [/no such column/i, 'Kolonnen findes ikke – tjek stavningen, eller om du mangler tabelnavnet foran (fx kunder.navn).'],
    [/near ".*": syntax error|incomplete input/i, 'SQL-syntaksfejl: tjek kommaer mellem kolonner, anførselstegn om tekst (\'åben\') og rækkefølgen SELECT … FROM … WHERE … ORDER BY.'],
    [/EOFError/i, 'Programmet bad om input, men der var ikke flere linjer i Input-feltet.'],
  ];
  return rules.find(([re]) => re.test(m))?.[1] || null;
}
