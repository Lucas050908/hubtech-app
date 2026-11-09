/** A small code editor: a textarea over a highlighted copy (Kodeskolen and App-værkstedet). */
import { h } from '../core/dom.js';
import { highlight } from './highlight.js';

export function codeEditor(lang, value, onInput, { rows = 14, label = 'Kode' } = {}) {
  const pre = h('pre', { class: 'sn-hl', 'aria-hidden': 'true' });
  const ta = h('textarea', { class: 'sn-code', spellcheck: 'false', wrap: 'off', 'aria-label': label, autocapitalize: 'off', autocomplete: 'off' });
  ta.value = value || '';
  const paint = () => { pre.innerHTML = highlight(ta.value, lang === 'git' ? 'bash' : lang) + '\n'; };
  ta.addEventListener('input', () => { paint(); onInput?.(ta.value); });
  ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); document.execCommand('insertText', false, lang === 'python' ? '    ' : '  '); }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {   // keep the indentation of the current line
      const before = ta.value.slice(0, ta.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      let ind = (line.match(/^\s*/) || [''])[0];
      if (/[:{(\[]\s*$/.test(line)) ind += lang === 'python' ? '    ' : '  ';
      e.preventDefault();
      document.execCommand('insertText', false, '\n' + ind);
    }
  });
  paint();
  const wrap = h('div', { class: 'sn-codewrap cs-codewrap', style: { minHeight: `${rows * 1.6 * 13.5 + 28}px` } }, pre, ta);
  return { el: wrap, ta, get: () => ta.value, set: (v) => { ta.value = v; paint(); onInput?.(v); } };
}
