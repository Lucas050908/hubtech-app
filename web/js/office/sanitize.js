/** Whitelist HTML sanitizer for documents (pasted/imported content can never run script). */
const TAGS = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'MARK', 'FONT',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'CODE', 'UL', 'OL', 'LI', 'A', 'IMG', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'FIGURE', 'FIGCAPTION', 'INPUT', 'LABEL']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'HEAD', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'FORM', 'BUTTON', 'SELECT', 'TEXTAREA']);
const STYLE_OK = /^(color|background-color|text-align|font-weight|font-style|text-decoration|font-size|width|margin-left|padding-left|vertical-align)$/;

function cleanStyle(v) {
  return String(v || '').split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf(':'); if (i < 0) return null;
    const k = s.slice(0, i).trim().toLowerCase(), val = s.slice(i + 1).trim();
    if (!STYLE_OK.test(k) || /url\(|expression|javascript:/i.test(val)) return null;
    return `${k}: ${val}`;
  }).filter(Boolean).join('; ');
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const walk = (node) => {
    for (const el of [...node.children]) {
      if (DROP.has(el.tagName)) { el.remove(); continue; }
      if (!TAGS.has(el.tagName)) { walk(el); el.replaceWith(...el.childNodes); continue; }
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase(), v = a.value;
        const keep = (n === 'href' && el.tagName === 'A' && /^(https?:|mailto:|#)/i.test(v.trim()))
          || (n === 'src' && el.tagName === 'IMG' && /^(data:image\/(png|jpe?g|gif|webp);|https?:|\/api\/office\/files\/[A-Za-z0-9_-]+$)/i.test(v.trim()))
          || (n === 'style') || (n === 'colspan' || n === 'rowspan') || (n === 'alt' || n === 'title')
          || (n === 'type' && el.tagName === 'INPUT' && v === 'checkbox') || (n === 'checked' && el.tagName === 'INPUT')
          || (n === 'data-check') || ((n === 'color' || n === 'size') && el.tagName === 'FONT') || (n === 'align');
        if (!keep) el.removeAttribute(a.name);
        else if (n === 'style') { const c = cleanStyle(v); c ? el.setAttribute('style', c) : el.removeAttribute('style'); }
      }
      if (el.tagName === 'INPUT' && el.getAttribute('type') !== 'checkbox') { el.remove(); continue; }
      if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      walk(el);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export const textOf = (html) => { const d = new DOMParser().parseFromString(`<body>${String(html || '').replace(/(<\/(p|h\d|li|div|tr|td|th|blockquote|pre)>|<br\s*\/?>)/gi, '$1 ')}</body>`, 'text/html'); return (d.body.textContent || '').replace(/\s+/g, ' ').trim(); };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
