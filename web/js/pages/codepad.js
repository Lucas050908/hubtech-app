/**
 * Kode-editor – a real editor (CodeMirror 6, bundled in web/vendor/codemirror and loaded only here) with files,
 * tabs, search, autocomplete, folding and errors on the line they happen. Python, JavaScript, HTML/CSS and SQL run
 * right here; 25 other languages can be written and read. Gnist sits next to it as a teacher and sees the open
 * file, the selection and the result. Everything is saved on the account.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, modal, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { appState, loadError, copy, uid } from '../features/appkit.js';
import { setAiContext } from '../ai/context.js';
import { saveBlob } from '../core/files.js';

export const LANGS = [
  { id: 'python', name: 'Python', ext: 'py', run: true, file: 'netvaerk.py', start: '# Skriv din Python her – tryk Ctrl+Enter for at køre\nimport ipaddress\n\nnet = ipaddress.ip_network("192.168.1.0/28")\nfor host in net.hosts():\n    print(host)\n' },
  { id: 'javascript', name: 'JavaScript', ext: 'js', run: true, file: 'porte.js', start: '// Skriv din JavaScript her – tryk Ctrl+Enter for at køre\nconst ports = { 22: "SSH", 80: "HTTP", 443: "HTTPS" };\nfor (const [port, name] of Object.entries(ports)) {\n  console.log(`${port} er ${name}`);\n}\n' },
  { id: 'html', name: 'HTML/CSS', ext: 'html', run: true, file: 'side.html', start: '<!-- Skriv HTML og CSS – forhåndsvisningen opdateres, når du kører -->\n<style>\n  h1 { color: #ea580c; }\n</style>\n<h1>Hej fra HUBTECH</h1>\n<p>Ret i koden, og tryk Kør.</p>\n' },
  { id: 'sql', name: 'SQL', ext: 'sql', run: true, file: 'kunder.sql', start: '-- En lille database at øve på\nCREATE TABLE kunder (id INTEGER PRIMARY KEY, navn TEXT, by TEXT);\nINSERT INTO kunder (navn, by) VALUES (\'Hansen ApS\', \'Aarhus\'), (\'Jensen El\', \'Odense\'), (\'Skolen\', \'Aarhus\');\n\nSELECT by, COUNT(*) AS antal FROM kunder GROUP BY by;\n' },
  { id: 'bash', name: 'Bash', ext: 'sh', run: false, file: 'ping.sh', start: '#!/bin/bash\n# Bash køres i Linux-terminalen – her kan du skrive og få Gnist til at forklare\nfor ip in 192.168.1.{1..5}; do\n  ping -c 1 -W 1 "$ip" > /dev/null && echo "$ip svarer"\ndone\n' },
];
export const langById = (id) => LANGS.find(l => l.id === id) || LANGS[0];

/** Language id from a file name – the same table as the editor bundle, so pure code and tests can use it. */
const EXT = { py: 'python', js: 'javascript', mjs: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx', html: 'html', htm: 'html', css: 'css', sql: 'sql', json: 'json', md: 'markdown', sh: 'bash', bash: 'bash', ps1: 'powershell', yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'nginx', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', java: 'java', cs: 'csharp', kt: 'kotlin', go: 'go', rs: 'rust', lua: 'lua' };
export function langOfFile(name = '') {
  const n = String(name).toLowerCase();
  if (n === 'dockerfile' || n.endsWith('.dockerfile')) return 'dockerfile';
  return EXT[n.split('.').pop()] || 'text';
}
const NAMES = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX', html: 'HTML', css: 'CSS', sql: 'SQL', json: 'JSON', markdown: 'Markdown', bash: 'Bash', powershell: 'PowerShell', yaml: 'YAML', toml: 'TOML', ini: 'INI', nginx: 'nginx', c: 'C', cpp: 'C++', java: 'Java', csharp: 'C#', kotlin: 'Kotlin', go: 'Go', rust: 'Rust', lua: 'Lua', dockerfile: 'Dockerfile', text: 'Tekst' };
export const langName = (id) => NAMES[id] || 'Tekst';
/** Which runner a language uses here (null = write and read only). */
export const runnerOf = (lang) => ({ python: 'python', javascript: 'javascript', html: 'html', css: 'html', sql: 'sql' }[lang] || null);

/** A safe file name: no folders, no odd characters, at most 60 characters. '' if nothing is left. */
export function cleanName(name) {
  return String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/^[.\-\s]+/, '').slice(0, 60);
}

/** The line an error happened on (1-based), from the runner's message – or 0. */
export function errorLine(lang, msg = '') {
  const s = String(msg || '');
  if (lang === 'python') { const all = [...s.matchAll(/Linje (\d+)/g)]; if (all.length) return +all.at(-1)[1]; const m = s.match(/line (\d+)/); return m ? +m[1] : 0; }
  if (lang === 'javascript') { const m = s.match(/<anonymous>:(\d+):\d+/) || s.match(/\(linje (\d+)\)/i); return m ? Math.max(1, +m[1]) : 0; }
  return 0;
}

/** What Gnist is asked when you press a teacher button (pure – tested). With a selection, she looks at that part. */
export function teacherPrompt(kind, lang, { selection = false } = {}) {
  const L = langName(lang) === 'Tekst' ? langById(lang).name : langName(lang);
  const what = selection ? `den markerede ${L}-kode` : `min ${L}-kode`;
  return {
    bug: `Find fejlen i ${what}. Forklar kort, hvad der er galt og hvorfor – og giv mig et hint, før du viser rettelsen.`,
    explain: `Forklar ${what} linje for linje, enkelt og på dansk.`,
    teach: `Lær mig det vigtigste begreb, ${what} bruger, med et kort eksempel og en lille øvelse.`,
    task: `Giv mig en lille IT-relevant øvelse i ${L} på mit niveau (ud fra min kode). Giv ikke løsningen – kun opgaven og et hint.`,
    test: `Skriv test til ${what}. Forklar kort, hvad hver test tjekker.`,
    better: `Hvordan kan ${what} blive mere læsbar og sikker? Vis små forbedringer og forklar hvorfor.`,
  }[kind] || '';
}

/** The text shown after running (pure – tested). */
export function outputText(res) {
  if (!res) return '';
  if (res.tables && !res.error) return res.tables.map(t => [t.columns.join(' | '), ...t.values.map(r => r.join(' | '))].join('\n')).join('\n\n') || '(ingen rækker)';
  return [res.out, res.error].filter(Boolean).join(res.out && res.error ? '\n' : '') || '(ingen output)';
}

/** The files of an older Kode-editor (one text per language) become real files. Pure – tested. */
export function migrate(d) {
  if (Array.isArray(d.docs) && d.docs.length) return d;
  const docs = LANGS.map(L => ({ id: uid(), name: L.file, text: d.files?.[L.id] ?? L.start, at: Date.now() }));
  const first = docs[Math.max(0, LANGS.findIndex(L => L.id === (d.lang || 'python')))];
  return { ...d, v: 2, docs, open: [first.id], active: first.id };
}

let st = null, ed = null;

function askName(title, value = '') {
  return new Promise((resolve) => {
    const inp = h('input', { class: 'input', value, 'aria-label': 'Filnavn', placeholder: 'fx skript.py', maxlength: 60 });
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(cleanName(inp.value)); } });
    const m = modal({ title, size: 420,
      body: h('div', { class: 'stack', style: { gap: '8px' } }, inp, h('p', { class: 'faint', style: { margin: 0 } }, 'Endelsen bestemmer sproget: .py, .js, .html, .css, .sql, .sh, .ps1, .json, .md, .yml, .go, .rs, .java, .c …')),
      actions: [h('button', { type: 'button', class: 'btn', onclick: () => finish('') }, 'Annuller'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => finish(cleanName(inp.value)) }, 'OK')],
      onClose: () => finish('') });
    requestAnimationFrame(() => { inp.focus(); inp.select(); });
  });
}

export default {
  title: 'Kode-editor',
  destroy() { st?.flush(); ed?.destroy(); ed = null; setAiContext(null); },
  async render() {
    const app = appById('codepad');
    try { st = await appState('codepad', { lang: 'python', files: {} }); } catch (e) { return loadError('Kode-editoren', e); }
    Object.assign(st.data, migrate(st.data));
    const d = st.data;
    d.open = (d.open || []).filter(id => d.docs.some(x => x.id === id));
    if (!d.docs.some(x => x.id === d.active)) d.active = d.docs[0]?.id;
    if (d.active && !d.open.includes(d.active)) d.open.push(d.active);
    const cur = () => d.docs.find(x => x.id === d.active);

    const out = h('pre', { class: 'kx-out', 'aria-live': 'polite' }, 'Tryk Kør (Ctrl+Enter) for at se resultatet.');
    const frame = h('iframe', { class: 'kx-frame', title: 'Forhåndsvisning', hidden: true });
    const cmHost = h('div', { class: 'kx-cm' }, h('p', { class: 'faint kx-loading' }, 'Henter editoren …'));
    const fileList = h('ul', { class: 'kx-filelist', role: 'list' });
    const tabs = h('div', { class: 'kx-tabs', role: 'group', 'aria-label': 'Åbne filer' });
    const pos = h('span', null, 'Linje 1, kol 1');
    const langLbl = h('span');
    const saved = h('span', { class: 'kx-saved' }, 'Gemt');
    const runBtn = h('button', { class: 'btn app-solid', type: 'button', title: 'Kør (Ctrl+Enter)' }, icon('play'), 'Kør');
    let CM = null, saveT = 0;

    const save = () => { saved.textContent = 'Gemt'; st.save(); };
    const changed = (text) => {
      const f = cur(); if (!f) return;
      f.text = text; f.at = Date.now(); saved.textContent = 'Gemmer …';
      clearTimeout(saveT); saveT = setTimeout(save, 600);
    };

    const run = async () => {
      const f = cur(); if (!f) return;
      const lang = langOfFile(f.name), runner = runnerOf(lang);
      ed?.setErrors([]);
      if (!runner) {
        out.classList.remove('is-error');
        out.textContent = lang === 'bash' ? 'Bash køres i Linux-terminalen (Lær og øv → Linux-terminal). Kopiér koden dertil – eller bed Gnist forklare den.'
          : `${langName(lang)} kan skrives og læses her, men ikke køres. Bed Gnist forklare eller tjekke koden.`;
        return;
      }
      runBtn.disabled = true; out.classList.remove('is-error');
      out.textContent = runner === 'python' ? 'Kører … (første gang hentes Python, det tager et øjeblik)' : 'Kører …';
      try {
        const R = await import('../features/coderun.js');
        const code = ed ? ed.get() : f.text;
        if (runner === 'html') {
          // a CSS file is shown on the open HTML page – or on a small test page
          const page = lang === 'css' ? `<style>${code}</style>${(d.docs.find(x => langOfFile(x.name) === 'html')?.text) || '<h1>Overskrift</h1><p>Tekst</p><button>Knap</button>'}` : code;
          frame.hidden = false; await R.renderHtml(frame, page); out.textContent = 'Forhåndsvisningen er opdateret.'; return;
        }
        const res = runner === 'python' ? await R.runPython(code) : runner === 'sql' ? await R.runSql(code) : await R.runJs(code);
        out.textContent = outputText(res);
        out.classList.toggle('is-error', !!res.error);
        if (res.error) {
          const ln = errorLine(lang, res.error);
          if (ln) ed?.setErrors([{ line: ln, message: String(res.error).split('\n').filter(Boolean).at(-1) }]);
          const why = R.explainError(res.error); if (why) out.textContent += `\n\n💡 ${why}`;
        }
      } catch (e) { out.textContent = e.message; out.classList.add('is-error'); }
      finally { runBtn.disabled = false; }
    };
    runBtn.addEventListener('click', run);

    const drawFiles = () => {
      h(clear(fileList), null, d.docs.slice().sort((a, b) => a.name.localeCompare(b.name, 'da')).map(f => h('li', { class: ['kx-file', f.id === d.active && 'is-on'] },
        h('button', { type: 'button', class: 'kx-file-open', onclick: () => openFile(f.id), 'aria-current': f.id === d.active ? 'true' : null },
          h('span', { class: 'kx-dot', 'data-lang': langOfFile(f.name) }), h('span', { class: 'kx-file-name' }, f.name)),
        h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Omdøb ${f.name}`, title: 'Omdøb', onclick: () => rename(f) }, icon('edit')),
        h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Slet ${f.name}`, title: 'Slet', onclick: () => remove(f) }, icon('trash')))));
    };
    const drawTabs = () => {
      h(clear(tabs), null, d.open.map(id => d.docs.find(x => x.id === id)).filter(Boolean).map(f => h('div', { class: ['kx-tab', f.id === d.active && 'is-on'] },
        h('button', { type: 'button', class: 'kx-tab-open', 'aria-current': f.id === d.active ? 'true' : null, onclick: () => openFile(f.id) }, h('span', { class: 'kx-dot', 'data-lang': langOfFile(f.name) }), f.name),
        h('button', { type: 'button', class: 'kx-tab-x', 'aria-label': `Luk ${f.name}`, onclick: () => closeTab(f.id) }, icon('x')))));
    };
    const drawStatus = () => {
      const f = cur(); const lang = f ? langOfFile(f.name) : 'text';
      langLbl.textContent = langName(lang);
      runBtn.hidden = !runnerOf(lang);
      frame.hidden = runnerOf(lang) !== 'html';
    };
    const aiCtx = () => {
      const f = cur(); const lang = f ? langOfFile(f.name) : 'text';
      setAiContext({ kind: 'exercise', course: 'Kode-editor', lang, lesson: `Fri kodning i ${langName(lang)}${f ? ` (${f.name})` : ''}`,
        task: 'Eleven skriver sin egen kode og vil have hjælp til at forstå og rette den.', theory: '',
        getCode: () => { const sel = ed?.selectionText(); return sel ? `${sel}\n\n(markeret i ${f?.name || 'filen'})` : (ed?.get() || f?.text || ''); },
        getOutput: () => out.textContent || '' });
    };
    function openFile(id) {
      if (!d.docs.some(x => x.id === id)) return;
      if (ed && cur()) cur().text = ed.get();
      d.active = id; if (!d.open.includes(id)) d.open.push(id);
      const f = cur();
      if (ed) { ed.set(f.text); ed.setLang(langOfFile(f.name)); ed.setErrors([]); }
      out.textContent = runnerOf(langOfFile(f.name)) ? 'Tryk Kør (Ctrl+Enter) for at se resultatet.' : 'Skriv løs – Gnist kan forklare og tjekke koden.';
      out.classList.remove('is-error');
      drawFiles(); drawTabs(); drawStatus(); aiCtx(); st.save();
      ed?.focus();
    }
    function closeTab(id) {
      d.open = d.open.filter(x => x !== id);
      if (d.active === id) { const next = d.open.at(-1) || d.docs.find(x => x.id !== id)?.id; if (next) openFile(next); else { d.active = null; drawTabs(); } }
      else { drawTabs(); st.save(); }
    }
    async function newFile(text = '', suggested = '') {
      const name = suggested || await askName('Ny fil', 'ny.py');
      if (!name) return;
      if (d.docs.some(x => x.name.toLowerCase() === name.toLowerCase())) { toast('Der findes allerede en fil med det navn', { type: 'error' }); return; }
      const lang = langOfFile(name);
      const f = { id: uid(), name, text: text || LANGS.find(L => L.id === lang)?.start || '', at: Date.now() };
      d.docs.push(f); openFile(f.id);
    }
    async function rename(f) {
      const name = await askName('Omdøb fil', f.name);
      if (!name || name === f.name) return;
      if (d.docs.some(x => x !== f && x.name.toLowerCase() === name.toLowerCase())) { toast('Der findes allerede en fil med det navn', { type: 'error' }); return; }
      f.name = name; if (f.id === d.active) ed?.setLang(langOfFile(name));
      drawFiles(); drawTabs(); drawStatus(); aiCtx(); st.save();
    }
    async function remove(f) {
      if (d.docs.length <= 1) { toast('Der skal være mindst én fil', { type: 'error' }); return; }
      if (!await confirmDialog({ title: `Slet ${f.name}?`, text: 'Filen slettes fra din konto.', confirmLabel: 'Slet', danger: true })) return;
      d.docs = d.docs.filter(x => x !== f); d.open = d.open.filter(x => x !== f.id);
      if (d.active === f.id) openFile(d.open[0] || d.docs[0].id); else { drawFiles(); drawTabs(); st.save(); }
    }
    const upload = h('input', { type: 'file', multiple: true, hidden: true, onchange: async () => {
      for (const file of upload.files) {
        if (file.size > 512 * 1024) { toast(`${file.name} er for stor (højst 512 KB)`, { type: 'error' }); continue; }
        let name = cleanName(file.name) || 'fil.txt';
        while (d.docs.some(x => x.name.toLowerCase() === name.toLowerCase())) name = name.replace(/(\.[^.]*)?$/, (m) => `-2${m || ''}`);
        d.docs.push({ id: uid(), name, text: await file.text(), at: Date.now() });
        openFile(d.docs.at(-1).id);
      }
      upload.value = '';
    } });
    const downloadAll = async () => {
      if (ed && cur()) cur().text = ed.get();
      const JSZip = await import('../office/store.js').then(m => m.loadJsZip()).catch(() => null);
      if (!JSZip) { const f = cur(); if (f) saveBlob(f.name, new Blob([f.text], { type: 'text/plain' })); return; }
      const zip = new JSZip(); d.docs.forEach(f => zip.file(f.name, f.text));
      saveBlob('kode.zip', await zip.generateAsync({ type: 'blob' }));
    };

    const ask = (kind) => {
      const f = cur(); const sel = !!ed?.selectionText();
      import('../ai/panel.js').then(m => m.askAssistant(teacherPrompt(kind, f ? langOfFile(f.name) : 'python', { selection: sel })));
    };
    const teach = h('aside', { class: 'kx-teach', 'aria-label': 'Gnist hjælper' },
      h('div', { class: 'kx-teach-h' }, icon('sparkles'), h('b', null, 'Gnist hjælper'),
        h('button', { type: 'button', class: 'icon-btn btn-sm kx-teach-x', 'aria-label': 'Skjul Gnist', title: 'Skjul', onclick: () => { L.teach = false; layout(); keepUi(); teachBtn.focus(); } }, icon('x')),
        h('span', { class: 'faint' }, 'ser filen, markeringen og resultatet')),
      h('div', { class: 'kx-teach-btns' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ask('bug') }, icon('alert'), 'Find fejlen'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ask('explain') }, icon('info'), 'Forklar koden'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ask('test') }, icon('checkCircle'), 'Skriv test'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ask('better') }, icon('wand'), 'Gør den bedre'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ask('teach') }, icon('book'), 'Lær mig det'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ask('task') }, icon('target'), 'Giv mig en opgave')),
      h('p', { class: 'faint kx-note' }, 'Markér noget kode først, så kigger Gnist kun på det. Hun giver hints før løsninger.'),
      h('details', { class: 'kx-keys' }, h('summary', null, 'Genveje'),
        h('dl', null,
          ...[['Ctrl+Enter', 'Kør'], ['Ctrl+S', 'Gem'], ['Ctrl+F', 'Søg og erstat'], ['Ctrl+/', 'Kommentér linjer'], ['Alt+klik', 'Flere markører'], ['Ctrl+Mellemrum', 'Forslag'], ['Ctrl+Shift+[', 'Fold kode']].flatMap(([k, v]) => [h('dt', null, h('kbd', null, k)), h('dd', null, v)]))));

    // the editor fills the screen: files on the left and Gnist on the right can be folded away (remembered on this
    // device), and the result under the code can be dragged higher or lower
    let ui = {}; try { ui = JSON.parse(localStorage.getItem('hubtech.kx.ui') || '{}') || {}; } catch { /* */ }
    const L = { files: ui.files !== false, teach: ui.teach === true, out: Math.max(90, Math.min(600, Number(ui.out) || 190)) };
    const keepUi = () => { try { localStorage.setItem('hubtech.kx.ui', JSON.stringify(L)); } catch { /* */ } };
    const ide = h('div', { class: 'kx-ide' });
    const filesBtn = h('button', { type: 'button', class: 'icon-btn kx-fold', 'aria-label': 'Vis filer', title: 'Vis eller skjul filerne', onclick: () => { L.files = !L.files; layout(); keepUi(); } }, icon('folder'));
    const teachBtn = h('button', { type: 'button', class: 'btn btn-sm btn-ghost kx-fold', 'aria-label': 'Gnist hjælper', title: 'Vis eller skjul Gnist', onclick: () => { L.teach = !L.teach; layout(); keepUi(); } }, icon('sparkles'), h('span', null, 'Gnist'));
    function layout() {
      ide.classList.toggle('no-files', !L.files); ide.classList.toggle('with-teach', L.teach);
      ide.style.setProperty('--kx-out-h', `${L.out}px`);
      filesBtn.setAttribute('aria-pressed', String(L.files)); teachBtn.setAttribute('aria-pressed', String(L.teach));
      ed?.view?.requestMeasure?.();
    }
    const split = h('div', { class: 'kx-split', role: 'separator', tabindex: '0', 'aria-orientation': 'horizontal', 'aria-label': 'Højden på resultatet – træk, eller brug piletasterne', 'aria-valuemin': '90', 'aria-valuemax': '600' });
    const setOut = (v) => { L.out = Math.round(Math.max(90, Math.min(600, v))); split.setAttribute('aria-valuenow', String(L.out)); layout(); };
    split.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); split.setPointerCapture(e.pointerId); split.classList.add('is-drag');
      const y0 = e.clientY, h0 = L.out;
      const mv = (ev) => setOut(h0 - (ev.clientY - y0));
      const up = () => { split.classList.remove('is-drag'); split.removeEventListener('pointermove', mv); split.removeEventListener('pointerup', up); split.removeEventListener('pointercancel', up); keepUi(); };
      split.addEventListener('pointermove', mv); split.addEventListener('pointerup', up); split.addEventListener('pointercancel', up);
    });
    split.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setOut(L.out + (e.key === 'ArrowUp' ? 30 : -30)); keepUi(); } });

    const tools = h('div', { class: 'kx-bar' }, filesBtn, tabs,
      h('div', { class: 'kx-tools-r' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Søg og erstat (Ctrl+F)', title: 'Søg og erstat (Ctrl+F)', onclick: () => ed?.search() }, icon('search')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kopiér filen', title: 'Kopiér filen', onclick: () => copy(ed?.get() || '', 'Koden er kopieret') }, icon('copy')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Hent filen', title: 'Hent filen', onclick: () => { const f = cur(); if (f) saveBlob(f.name, new Blob([ed?.get() ?? f.text], { type: 'text/plain' })); } }, icon('download')),
        teachBtn, runBtn));

    const side = h('aside', { class: 'kx-files', 'aria-label': 'Filer' },
      h('div', { class: 'kx-files-h' }, h('b', null, 'Filer'),
        h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Ny fil', title: 'Ny fil', onclick: () => newFile() }, icon('plus')),
        h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Åbn filer fra computeren', title: 'Åbn filer fra computeren', onclick: () => upload.click() }, icon('upload'))),
      fileList, upload,
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost kx-zip', onclick: downloadAll }, icon('download'), 'Hent alle'),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { const f = cur(); const L = LANGS.find(x => x.id === langOfFile(f?.name)); if (f && L) { ed?.set(L.start); toast('Eksemplet er sat ind igen', { type: 'ok', ms: 1400 }); } } }, icon('refresh'), 'Eksempel'));

    // the editor itself is loaded when the page opens – a fallback textarea keeps it usable if the bundle fails
    (async () => {
      const f = cur();
      try {
        CM = await import(new URL('/vendor/codemirror/codemirror.min.js', location.origin).href);
        clear(cmHost);
        ed = CM.createEditor(cmHost, { doc: f?.text || '', lang: langOfFile(f?.name), onChange: changed, onRun: run, onSave: () => { clearTimeout(saveT); save(); toast('Gemt', { type: 'ok', ms: 1000 }); }, label: 'Kode' });
        ed.view.dom.addEventListener('keyup', () => { const s = ed.view.state; const p = s.selection.main.head; const ln = s.doc.lineAt(p); pos.textContent = `Linje ${ln.number}, kol ${p - ln.from + 1}`; });
        ed.view.dom.addEventListener('click', () => { const s = ed.view.state; const p = s.selection.main.head; const ln = s.doc.lineAt(p); pos.textContent = `Linje ${ln.number}, kol ${p - ln.from + 1}`; });
      } catch (e) {
        const { codeEditor } = await import('../features/codeeditor.js');
        const fb = codeEditor(runnerOf(langOfFile(f?.name)) || 'python', f?.text || '', changed, { rows: 18, label: 'Kode' });
        h(clear(cmHost), null, fb.el);
        ed = { get: fb.get, set: fb.set, setLang() {}, setErrors() {}, focus: () => fb.ta.focus(), search() {}, selectionText: () => fb.ta.value.slice(fb.ta.selectionStart, fb.ta.selectionEnd), destroy() {}, view: null };
      }
    })();

    drawFiles(); drawTabs(); drawStatus(); aiCtx();

    layout(); setOut(L.out);
    return h('div', { class: 'page kx-page', style: { '--app': app.hue } },
      h(ide, null,
        side,
        h('section', { class: 'kx-center', 'aria-label': 'Editor' },
          tools, cmHost,
          h('div', { class: 'kx-status' }, langLbl, pos, h('span', { class: 'kx-grow' }), saved),
          h('div', { class: 'kx-outpane' }, split, frame,
            h('div', { class: 'kx-out-wrap' }, h('span', { class: 'kx-out-h' }, 'Resultat'), out))),
        teach));
  },
};
