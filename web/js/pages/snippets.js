/** Kodestumper — a personal library of code, commands and configs: language, tags, search, one-click copy. */
import { h, clear, debounce, timeAgo } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, confirmDialog, stateBlock } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn } from '../features/apphero.js';
import { saveBlob } from '../core/files.js';
import { highlight } from '../features/highlight.js';

const LANGS = [['bash', 'Bash / terminal'], ['powershell', 'PowerShell'], ['python', 'Python'], ['javascript', 'JavaScript'], ['html', 'HTML'], ['css', 'CSS'], ['sql', 'SQL'],
  ['json', 'JSON'], ['yaml', 'YAML'], ['cpp', 'C / C++ / Arduino'], ['docker', 'Docker'], ['git', 'Git'], ['text', 'Tekst']];
const EXT = { bash: 'sh', powershell: 'ps1', python: 'py', javascript: 'js', html: 'html', css: 'css', sql: 'sql', json: 'json', yaml: 'yml', cpp: 'cpp', docker: 'Dockerfile', git: 'txt', text: 'txt' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const langName = (k) => (LANGS.find(l => l[0] === k) || [k, k])[1];

const SAMPLE = () => [
  { title: 'Find hvad der bruger en port (Windows)', lang: 'powershell', tags: ['netværk', 'windows'], code: 'Get-NetTCPConnection -LocalPort 8090 | Select-Object OwningProcess\nGet-Process -Id <PID>' },
  { title: 'Python: lille webserver i mappen', lang: 'bash', tags: ['python', 'server'], code: 'python -m http.server 8000' },
  { title: 'Arduino: blink', lang: 'cpp', tags: ['arduino', 'elektronik'], code: 'void setup() {\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(500);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(500);\n}' },
].map(x => ({ id: uid(), created: Date.now(), updated: Date.now(), uses: 0, ...x }));

let st = null, sel = null;

export default {
  title: 'Kodestumper',
  destroy() { flushState('snippets'); },
  async render() {
    const app = appById('snippets');
    try { st = (await getState('snippets', { force: true })) || null; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Kodestumperne kunne ikke hentes', text: e.message })); }
    const fresh = !st;
    if (!st || !Array.isArray(st.items)) st = { items: fresh ? SAMPLE() : [] };
    sel = st.items[0]?.id || null;
    const persist = () => { saveState('snippets', st, { onError: () => toast('Kunne ikke gemme', { type: 'bad' }) }); stats(); };
    const v = { n: h('span'), langs: h('span'), tags: h('span'), uses: h('span') };
    function stats() {
      v.n.textContent = String(st.items.length);
      v.langs.textContent = String(new Set(st.items.map(s => s.lang)).size);
      v.tags.textContent = String(new Set(st.items.flatMap(s => s.tags || [])).size);
      v.uses.textContent = String(st.items.reduce((a, s) => a + (s.uses || 0), 0));
    }

    const f = { q: '', tag: '' };
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg titel, kode eller #tag…', 'aria-label': 'Søg i kodestumper' });
    search.addEventListener('input', debounce(() => { f.q = search.value.trim().toLowerCase(); drawList(); }, 100));
    const tagBar = h('div', { class: 'sn-tags', role: 'group', 'aria-label': 'Tags' });
    const list = h('div', { class: 'sn-list', role: 'list', 'aria-label': 'Kodestumper' });
    const editor = h('div', { class: 'sn-editor glass' });
    const match = (s) => (!f.tag || (s.tags || []).includes(f.tag)) && (!f.q || (f.q.startsWith('#') ? (s.tags || []).some(t => t.startsWith(f.q.slice(1))) : [s.title, s.code, langName(s.lang), ...(s.tags || [])].join(' ').toLowerCase().includes(f.q)));

    async function copy(s) {
      try { await navigator.clipboard.writeText(s.code); s.uses = (s.uses || 0) + 1; persist(); toast('Kopieret', { type: 'ok', ms: 1200, text: s.title }); }
      catch { toast('Kunne ikke kopiere', { type: 'bad', text: 'Markér teksten og brug Ctrl+C.' }); }
    }
    function drawTags() {
      const tags = [...new Set(st.items.flatMap(s => s.tags || []))].sort((a, b) => a.localeCompare(b, 'da'));
      h(clear(tagBar), null, tags.length ? [h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!f.tag), onclick: () => { f.tag = ''; drawTags(); drawList(); } }, 'Alle'),
        ...tags.map(t => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.tag === t), onclick: () => { f.tag = f.tag === t ? '' : t; drawTags(); drawList(); } }, `#${t}`))] : null);
    }
    function drawList() {
      clear(list);
      const items = st.items.filter(match).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      if (!items.length) { list.appendChild(h('p', { class: 'faint', style: { padding: '12px' } }, st.items.length ? 'Intet matcher søgningen.' : 'Ingen kodestumper endnu.')); return; }
      for (const s of items) {
        const pick = () => { sel = s.id; drawList(); drawEditor(); };
        list.appendChild(h('div', { class: ['sn-item', s.id === sel && 'is-active'], role: 'listitem' },
          h('button', { type: 'button', class: 'sn-pick', 'aria-current': s.id === sel ? 'true' : null, onclick: pick },
            h('b', null, s.title || 'Uden titel'),
            h('span', { class: 'sn-meta' }, h('span', { class: 'sn-lang' }, langName(s.lang)), (s.tags || []).slice(0, 3).map(t => h('span', { class: 'faint' }, `#${t}`))),
            h('code', { class: 'sn-peek' }, (s.code || '').split('\n').find(l => l.trim()) || '')),
          h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Kopiér ${s.title || 'kodestump'}`, title: 'Kopiér', onclick: () => copy(s) }, icon('copy'))));
      }
    }
    function drawEditor() {
      clear(editor);
      const s = st.items.find(x => x.id === sel);
      if (!s) { editor.appendChild(stateBlock({ app: app.hue, icon: 'code', title: 'Vælg eller opret en kodestump', text: 'Kommandoer du altid skal slå op, konfigurationer, små scripts – gem dem her.', actions: [h('button', { class: 'btn app-solid', onclick: add }, icon('plus'), 'Ny kodestump')] })); return; }
      const touch = () => { s.updated = Date.now(); persist(); };
      const relist = debounce(() => { drawList(); drawTags(); }, 400);
      const title = h('input', { class: 'sn-title', value: s.title, maxlength: 160, placeholder: 'Titel', 'aria-label': 'Titel' });
      title.addEventListener('input', () => { s.title = title.value; touch(); relist(); });
      const lang = h('select', { class: 'select', 'aria-label': 'Sprog' }, LANGS.map(([k, l]) => h('option', { value: k, selected: s.lang === k }, l)));
      const tags = h('input', { class: 'input', value: (s.tags || []).join(', '), placeholder: 'tags, adskilt med komma', 'aria-label': 'Tags' });
      tags.addEventListener('change', () => { s.tags = [...new Set(tags.value.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 12); touch(); drawTags(); drawList(); });
      // editable code with a highlighted layer underneath (textarea on top, transparent text)
      const pre = h('pre', { class: 'sn-hl', 'aria-hidden': 'true' });
      const code = h('textarea', { class: 'sn-code', spellcheck: 'false', 'aria-label': 'Kode', wrap: 'off' }); code.value = s.code || '';
      const paint = () => { pre.innerHTML = highlight(code.value, lang.value) + '\n'; };
      code.addEventListener('input', () => { s.code = code.value; paint(); touch(); relist(); });
      code.addEventListener('scroll', () => { pre.scrollTop = code.scrollTop; pre.scrollLeft = code.scrollLeft; });
      code.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); document.execCommand('insertText', false, '  '); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); copy(s); }
      });
      lang.addEventListener('change', () => { s.lang = lang.value; paint(); touch(); drawList(); });
      paint();
      const lines = h('span', { class: 'faint' }, `${(s.code || '').split('\n').length} linjer`);
      code.addEventListener('input', () => { lines.textContent = `${code.value.split('\n').length} linjer`; });
      const del = h('button', { class: 'icon-btn', 'aria-label': 'Slet', title: 'Slet' }, icon('trash'));
      del.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'Slet kodestump?', text: `“${s.title || 'Uden titel'}” slettes.`, confirmLabel: 'Slet', danger: true })) return;
        st.items = st.items.filter(x => x !== s); persist(); sel = st.items[0]?.id || null; drawTags(); drawList(); drawEditor();
      });
      const dl = h('button', { class: 'icon-btn', 'aria-label': 'Hent som fil', title: 'Hent som fil' }, icon('download'));
      dl.addEventListener('click', () => { const ext = EXT[s.lang] || 'txt'; const name = ext === 'Dockerfile' ? 'Dockerfile' : `${(s.title || 'kode').replace(/[^\wæøåÆØÅ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'kode'}.${ext}`; saveBlob(name, new Blob([s.code || ''], { type: 'text/plain;charset=utf-8' })); });
      editor.append(
        h('div', { class: 'sn-head' }, title, h('button', { class: 'btn app-solid btn-sm', onclick: () => copy(s), title: 'Kopiér (Ctrl+Enter)' }, icon('copy'), 'Kopiér'), h('button', { class: 'icon-btn', 'aria-label': 'Del kodestumpen i Fællesskab', title: 'Del i en chat', onclick: () => import('../features/sharechat.js').then(x => x.shareToChat({ kind: 'snippet', title: s.title || 'Kodestump', lang: s.lang || '', code: String(s.code || '').slice(0, 6000) })) }, icon('share')), dl, del),
        h('div', { class: 'sn-opts' }, lang, tags),
        h('div', { class: 'sn-codewrap' }, pre, code),
        h('div', { class: 'sn-foot' }, lines, h('span', null, '·'), h('span', { class: 'faint' }, `Ændret ${timeAgo((s.updated || s.created) / 1000)}`), h('span', { style: { flex: 1 } }), h('span', { class: 'faint' }, `Kopieret ${s.uses || 0} gange`)));
    }
    function add() {
      const s = { id: uid(), title: '', lang: 'bash', tags: [], code: '', created: Date.now(), updated: Date.now(), uses: 0 };
      st.items.unshift(s); sel = s.id; persist(); drawList(); drawEditor();
      logActivity('snippets', 'new', 'Ny kodestump', 'Kodestump oprettet');
      setTimeout(() => editor.querySelector('.sn-title')?.focus(), 30);
    }

    if (fresh) persist();
    stats(); drawTags(); drawList(); drawEditor();
    return h('div', { class: 'page snippets-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Udvikling', title: 'Kodestumper', lead: 'Kommandoer, konfigurationer og små scripts, du ellers skal google igen og igen – gemt, søgbare og klar til at kopiere.',
        actions: [heroBtn('Ny kodestump', 'plus', { onclick: add })],
        stats: [
          { icon: 'code', label: 'Kodestumper', value: v.n },
          { icon: 'terminal', label: 'Sprog', value: v.langs },
          { icon: 'tag', label: 'Tags', value: v.tags },
          { icon: 'copy', label: 'Gange kopieret', value: v.uses }],
      }),
      h('div', { class: 'sn-layout' },
        h('aside', { class: 'glass panel sn-side' },
          h('div', { class: 'note-side-head' }, h('div', { class: 'pt-search' }, icon('search'), search), h('button', { class: 'icon-btn', 'aria-label': 'Ny kodestump', onclick: add }, icon('plus'))),
          tagBar, list),
        editor));
  },
};
