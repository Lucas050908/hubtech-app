/** HUBTECH Office – Dokumenter: a word processor on a paper page. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, modal, errorToast } from '../core/ui.js';
import { htmlToDocx } from './docx.js';
import { sanitizeHtml, textOf, escapeHtml } from './sanitize.js';
import { autosaver, download, safeName, readFile, imageToDataUrl, uploadImage, inlineImages } from './store.js';
import { editorFrame, toolBtn, toolSep, printNode } from './frame.js';

const STYLES = [['p', 'Normal tekst'], ['h1', 'Overskrift 1'], ['h2', 'Overskrift 2'], ['h3', 'Overskrift 3'], ['blockquote', 'Citat'], ['pre', 'Kode']];
const SIZES = [['2', 'Lille'], ['3', 'Normal'], ['4', 'Stor'], ['5', 'Større'], ['6', 'Meget stor']];

/** Very small Markdown → HTML for imports. */
export function mdToHtml(md) {
  const esc = escapeHtml;
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of String(md).split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)/i))) { if (list !== 'ul data-check="1"') { close(); out.push('<ul data-check="1">'); list = 'ul data-check="1"'; } out.push(`<li><input type="checkbox"${m[1].toLowerCase() === 'x' ? ' checked' : ''}> ${inline(m[2])}</li>`); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^>\s?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^\s*(---|\*\*\*)\s*$/.test(line)) { close(); out.push('<hr>'); }
    else if (!line.trim()) { close(); }
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join('\n').replace(/<\/ul data-check="1">/g, '</ul>');
}
export const textToHtml = (t) => String(t).split(/\r?\n\r?\n/).map(p => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('');

/** Word opens HTML saved with these namespaces as a normal document. */
function wordHtml(title, html) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5}h1{font-size:20pt}h2{font-size:15pt}h3{font-size:12.5pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4pt 6pt}blockquote{border-left:3pt solid #ccc;margin-left:0;padding-left:10pt;color:#555}</style>
</head><body>${html}</body></html>`;
}

export function docEditor(doc, ctx) {
  const page = h('div', { class: 'ofx-page doc-page', contenteditable: 'true', spellcheck: 'true', lang: 'da', 'aria-label': 'Dokumentets indhold', role: 'textbox', 'aria-multiline': 'true' });
  page.innerHTML = sanitizeHtml(doc.data?.html || '<p><br></p>');
  const words = h('span'), chars = h('span');
  const getData = () => {
    const html = sanitizeHtml(page.innerHTML);
    return { data: { html }, preview: textOf(html).slice(0, 220) };
  };
  const frame = editorFrame(doc, ctx, { getData, onPrint: () => printNode(page, frame.title()), exportMenu: [
    ['Word (.docx)', 'file', async () => {
      try { download(`${safeName(frame.title())}.docx`, await htmlToDocx(page.innerHTML, frame.title())); toast('Word-fil hentet', { type: 'ok' }); }
      catch (e) { errorToast(e, 'Kunne ikke lave Word-filen'); }
    }],
    ['Ældre Word (.doc)', 'file', async () => download(`${safeName(frame.title())}.doc`, wordHtml(frame.title(), sanitizeHtml(await inlineImages(page.innerHTML))), 'application/msword')],
    ['Webside (.html)', 'globe', async () => download(`${safeName(frame.title())}.html`, `<!doctype html><meta charset="utf-8"><title>${escapeHtml(frame.title())}</title>${sanitizeHtml(await inlineImages(page.innerHTML))}`, 'text/html;charset=utf-8')],
    ['Ren tekst (.txt)', 'note', () => download(`${safeName(frame.title())}.txt`, page.innerText)],
    ['PDF / udskriv', 'download', () => printNode(page, frame.title())],
  ] });
  const saver = frame.saver;

  // ── formatting ──
  const exec = (cmd, val = null) => { page.focus(); try { document.execCommand('styleWithCSS', false, cmd === 'foreColor' || cmd === 'hiliteColor'); } catch { /* */ } document.execCommand(cmd, false, val); changed(); refreshState(); };
  const style = h('select', { class: 'select ofx-select', 'aria-label': 'Typografi', title: 'Typografi' }, STYLES.map(([v, l]) => h('option', { value: v }, l)));
  style.addEventListener('change', () => exec('formatBlock', `<${style.value}>`));
  const size = h('select', { class: 'select ofx-select ofx-narrow', 'aria-label': 'Skriftstørrelse', title: 'Skriftstørrelse' }, SIZES.map(([v, l]) => h('option', { value: v, selected: v === '3' }, l)));
  size.addEventListener('change', () => exec('fontSize', size.value));
  const color = h('input', { type: 'color', value: '#e5484d', class: 'ofx-color', title: 'Tekstfarve', 'aria-label': 'Tekstfarve' });
  color.addEventListener('input', () => exec('foreColor', color.value));
  const mark = h('input', { type: 'color', value: '#fff3a3', class: 'ofx-color is-mark', title: 'Overstregning (highlight)', 'aria-label': 'Fremhævningsfarve' });
  mark.addEventListener('input', () => exec('hiliteColor', mark.value));
  const stateBtns = {};
  const tb = (ic, label, cmd, val) => { const b = toolBtn(ic, label, () => exec(cmd, val)); if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(cmd)) stateBtns[cmd] = b; return b; };

  const linkBtn = toolBtn('link', 'Indsæt link (Ctrl+K)', () => insertLink());
  const imgInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  imgInput.addEventListener('change', async () => {
    const f = imgInput.files[0]; imgInput.value = '';
    if (!f) return;
    try { const url = await uploadImage(f); page.focus(); restoreSel(); document.execCommand('insertImage', false, url); changed(); }
    catch (e) { toast('Billedet kunne ikke indsættes', { type: 'bad', text: e.message }); }
  });
  let savedRange = null;
  const keepSel = () => { const s = getSelection(); if (s.rangeCount && page.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); };
  const restoreSel = () => { if (!savedRange) return; const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); };
  const imgBtn = toolBtn('image', 'Indsæt billede', () => { keepSel(); imgInput.click(); });
  const tableBtn = toolBtn('grid', 'Indsæt tabel', () => insertTable());
  const checkBtn = toolBtn('checkCircle', 'Tjekliste', () => {
    page.focus();
    document.execCommand('insertHTML', false, '<ul data-check="1"><li><input type="checkbox"> </li></ul>');
    changed();
  });

  function insertLink() {
    keepSel();
    const sel = getSelection().toString();
    const url = h('input', { class: 'input', placeholder: 'https://…', value: 'https://' });
    const txt = h('input', { class: 'input', placeholder: 'Tekst', value: sel });
    let m;
    const ok = () => {
      const u = url.value.trim();
      if (!/^(https?:\/\/|mailto:)/i.test(u)) { url.focus(); return; }
      m.close(); page.focus(); restoreSel();
      if (getSelection().toString()) document.execCommand('createLink', false, u);
      else document.execCommand('insertHTML', false, `<a href="${escapeHtml(u)}">${escapeHtml(txt.value || u)}</a>`);
      changed();
    };
    m = modal({ title: 'Indsæt link', body: h('div', { class: 'stack', style: { gap: '10px' } }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Adresse'), url), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tekst'), txt)),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: ok }, 'Indsæt')] });
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    setTimeout(() => { url.focus(); url.select(); }, 40);
  }
  function insertTable() {
    keepSel();
    const rows = h('input', { class: 'input', type: 'number', min: 1, max: 30, value: 3 });
    const cols = h('input', { class: 'input', type: 'number', min: 1, max: 10, value: 3 });
    const head = h('input', { type: 'checkbox', checked: true });
    let m;
    m = modal({ title: 'Indsæt tabel', body: h('div', { class: 'grid-2', style: { gap: '10px' } },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Rækker'), rows), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Kolonner'), cols),
      h('label', { class: 'check', style: { gridColumn: '1/-1' } }, head, ' Første række er overskrift')),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: () => {
      const r = Math.max(1, Math.min(30, +rows.value || 3)), c = Math.max(1, Math.min(10, +cols.value || 3));
      const row = (tag) => `<tr>${Array.from({ length: c }, () => `<${tag}><br></${tag}>`).join('')}</tr>`;
      const html = `<table><tbody>${head.checked ? row('th') : ''}${Array.from({ length: head.checked ? r - 1 : r }, () => row('td')).join('')}</tbody></table><p><br></p>`;
      m.close(); page.focus(); restoreSel(); document.execCommand('insertHTML', false, html); changed();
    } }, 'Indsæt')] });
  }

  frame.toolbar.append(
    toolBtn('undo', 'Fortryd (Ctrl+Z)', () => exec('undo')), toolBtn('redo', 'Gentag (Ctrl+Y)', () => exec('redo')), toolSep(),
    style, size, toolSep(),
    tb('bold', 'Fed (Ctrl+B)', 'bold'), tb('italic', 'Kursiv (Ctrl+I)', 'italic'), tb('underline', 'Understreget (Ctrl+U)', 'underline'), tb('strike', 'Gennemstreget', 'strikeThrough'),
    color, mark, toolSep(),
    tb('alignLeft', 'Venstrestil', 'justifyLeft'), tb('alignCenter', 'Centrér', 'justifyCenter'), tb('alignRight', 'Højrestil', 'justifyRight'), tb('alignJustify', 'Lige margener', 'justifyFull'), toolSep(),
    tb('list', 'Punktliste', 'insertUnorderedList'), tb('listOl', 'Nummereret liste', 'insertOrderedList'), checkBtn,
    tb('outdent', 'Formindsk indrykning', 'outdent'), tb('indent', 'Forøg indrykning', 'indent'), toolSep(),
    linkBtn, imgBtn, tableBtn, tb('minus', 'Vandret linje', 'insertHorizontalRule'), toolSep(),
    tb('eraser', 'Ryd formatering', 'removeFormat'), imgInput);

  function refreshState() {
    for (const [cmd, b] of Object.entries(stateBtns)) { let on = false; try { on = document.queryCommandState(cmd); } catch { /* */ } b.setAttribute('aria-pressed', String(on)); }
    let block = ''; try { block = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, ''); } catch { /* */ }
    style.value = STYLES.some(([v]) => v === block) ? block : 'p';
  }
  function count() {
    const t = page.innerText.trim();
    const w = t ? t.split(/\s+/).length : 0;
    words.textContent = `${w.toLocaleString('da-DK')} ord`;
    chars.textContent = `${t.length.toLocaleString('da-DK')} tegn`;
  }
  function changed() { saver.touch(); count(); }

  page.addEventListener('input', changed);
  document.addEventListener('selectionchange', onSel);
  function onSel() { if (page.isConnected && page.contains(getSelection().anchorNode)) refreshState(); }
  page.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) { e.target.toggleAttribute('checked', e.target.checked); changed(); } });
  page.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener'); });
  page.addEventListener('paste', (e) => {
    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain');
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); keepSel(); uploadImage(files[0]).then(u => { page.focus(); restoreSel(); document.execCommand('insertImage', false, u); changed(); }).catch(err => toast('Billedet kunne ikke indsættes', { type: 'bad', text: err.message })); return; }
    if (html) { e.preventDefault(); document.execCommand('insertHTML', false, sanitizeHtml(html.replace(/<!--[\s\S]*?-->/g, ''))); changed(); }
    else if (text) { e.preventDefault(); document.execCommand('insertText', false, text); changed(); }
  });
  page.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); insertLink(); }
    if (e.key === 'Tab' && !e.shiftKey && getSelection().anchorNode?.parentElement?.closest('li')) { e.preventDefault(); exec('indent'); }
    if (e.key === 'Tab' && e.shiftKey && getSelection().anchorNode?.parentElement?.closest('li')) { e.preventDefault(); exec('outdent'); }
  });

  frame.status.append(words, h('span', { class: 'ofx-dot' }, '·'), chars);
  frame.body.append(h('div', { class: 'doc-scroll' }, page));
  count();
  setTimeout(() => { page.focus(); try { const r = document.createRange(); r.selectNodeContents(page); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* */ } }, 60);

  return {
    el: frame.el,
    destroy() { document.removeEventListener('selectionchange', onSel); frame.destroy(); },
  };
}

/** Import a text/html/markdown file as HTML for a new document. */
export async function importAsDocHtml(file) {
  const name = file.name.toLowerCase();
  const text = await readFile(file);
  if (/\.(html?|htm)$/.test(name)) return sanitizeHtml(new DOMParser().parseFromString(text, 'text/html').body.innerHTML);
  if (/\.(md|markdown)$/.test(name)) return mdToHtml(text);
  return textToHtml(text);
}
export { clear };
