/** Pure helpers for the assistant's action proposals (no browser APIs – unit tested in tests/ai.test.mjs). */
const pad = (n) => String(n).padStart(2, '0');

// ── actions ──
const PAGES = { kalender: '/apps/calendar', noter: '/apps/notes', opgaver: '/apps/tasks', kodestumper: '/learn/snippets', kunder: '/apps/customers', 'fællesskab': '/apps/community', faellesskab: '/apps/community', kodeskolen: '/learn/codeschool', indstillinger: '/settings', servicehjælp: '/apps/servicehelp', lager: '/apps/inventory', tidsregistrering: '/apps/timesheet' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{1,2}[:.]\d{2}$/;
const t5 = (s) => { if (!s || !TIME_RE.test(String(s).trim())) return null; const [h, m] = String(s).trim().split(/[:.]/); return `${pad(Math.min(23, +h))}:${m}`; };

/** Find <handling>{…}</handling> (or ```json blocks with a "type") in the answer. Returns { text, actions }. */
export function parseActions(answer) {
  const actions = [];
  const take = (raw) => {
    try {
      const j = JSON.parse(raw.replace(/[“”]/g, '"').replace(/,\s*}/g, '}'));
      const a = normalizeAction(j);
      if (a) actions.push(a);
      return true;
    } catch { return false; }
  };
  let text = String(answer || '').replace(/<handling>\s*([\s\S]*?)\s*<\/handling>/gi, (m, j) => (take(j) ? '' : m));
  text = text.replace(/```(?:json|handling)?\s*(\{[\s\S]*?"type"[\s\S]*?\})\s*```/gi, (m, j) => (take(j) ? '' : m));
  text = text.replace(/<handling>[\s\S]*$/i, '').trim();   // half-written action at the end of a stream
  return { text, actions };
}

export function normalizeAction(j) {
  if (!j || typeof j !== 'object') return null;
  const type = String(j.type || '').toLowerCase();
  const title = String(j.titel || j.title || '').trim().slice(0, 160);
  if (type === 'aftale' || type === 'event') {
    const date = String(j.dato || j.date || '').trim();
    if (!DATE_RE.test(date) || !title) return null;
    const start = t5(j.start), end = t5(j.slut || j.end);
    return { type: 'event', title, date, start, end: start ? end : null, location: String(j.sted || j.location || '').slice(0, 200), notes: String(j.noter || j.notes || '').slice(0, 2000) };
  }
  if (type === 'opgave' || type === 'task') {
    if (!title) return null;
    const due = String(j.frist || j.due || '').trim();
    return { type: 'task', title, due: DATE_RE.test(due) ? due : null, notes: String(j.noter || j.notes || '').slice(0, 2000) };
  }
  if (type === 'note') {
    const body = String(j.tekst || j.text || j.body || '').slice(0, 20000);
    if (!title && !body) return null;
    return { type: 'note', title: title || body.split('\n')[0].slice(0, 80), body };
  }
  if (type === 'åbn' || type === 'aabn' || type === 'open') {
    const side = String(j.side || j.page || '').toLowerCase().trim();
    const path = PAGES[side];
    return path ? { type: 'open', page: side, path } : null;
  }
  return null;
}

export function describe(a) {
  if (a.type === 'event') return { icon: 'calendar', title: `Ny aftale: ${a.title}`, text: `${new Date(a.date + 'T12:00').toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })}${a.start ? ` kl. ${a.start}${a.end ? '–' + a.end : ''}` : ' (hele dagen)'}${a.location ? ' · ' + a.location : ''}`, label: 'Læg i kalenderen' };
  if (a.type === 'task') return { icon: 'kanban', title: `Ny opgave: ${a.title}`, text: a.due ? `Frist ${new Date(a.due + 'T12:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'long' })}` : 'Ingen frist', label: 'Opret opgaven' };
  if (a.type === 'note') return { icon: 'note', title: `Ny note: ${a.title}`, text: a.body.slice(0, 140), label: 'Gem noten' };
  return { icon: 'arrowRight', title: `Åbn ${a.page}`, text: '', label: 'Åbn' };
}

/** In teacher mode: longer code blocks are hidden behind a button so the assistant can't just hand over a solution. */
export function guardCode(text, maxLines = 3) {
  const hidden = [];
  const out = String(text).replace(/```([a-z0-9+#-]*)\n?([\s\S]*?)```/gi, (m, lang, code) => {
    if (code.trim().split('\n').length <= maxLines) return m;
    hidden.push({ lang, code });
    return `\n[[skjult-kode-${hidden.length - 1}]]\n`;
  });
  return { text: out, hidden };
}

/**
 * App-værkstedet: complete files in the answer, written as ```html index.html … ```.
 * A block without a file name is mapped by language (html → index.html, css → style.css, js → app.js).
 * Returns { text (with [[fil-N]] placeholders), files: [{ name, lang, code }] }.
 */
const DEFAULT_FILE = { html: 'index.html', css: 'style.css', js: 'app.js', javascript: 'app.js', json: 'data.json' };
const FILE_NAME = /^[A-Za-z0-9_-]{1,40}\.(html|css|js|json|md|txt|svg)$/;
export function extractFiles(text) {
  const files = [];
  const out = String(text || '').replace(/```[ \t]*([a-z0-9+#._-]*)[ \t]*([^\s`]*)[ \t]*\n([\s\S]*?)```/gi, (m, lang, name, code) => {
    lang = lang.toLowerCase();
    if (!name && FILE_NAME.test(lang)) { name = lang; lang = lang.split('.').pop(); }   // ```index.html
    const first = code.match(/^\s*(?:<!--\s*|\/\*\s*|\/\/\s*)([A-Za-z0-9_-]{1,40}\.(?:html|css|js|json))\s*(?:-->|\*\/)?\s*\n/);
    if (!name && first) { name = first[1]; }
    name = FILE_NAME.test(name || '') ? name : DEFAULT_FILE[lang];
    if (!name) return m;
    files.push({ name, lang: lang || name.split('.').pop(), code: code.replace(/\n$/, '') });
    return `\n[[fil-${files.length - 1}]]\n`;
  });
  return { text: out, files };
}
