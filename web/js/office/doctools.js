/** Extra tools for the document editor: find & replace, Markdown-style shortcuts while typing, an outline, and table editing. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toolBtn } from './frame.js';

import { shortcutFor, findAll, keepCase } from './doctext.js';
export { shortcutFor, findAll };

// ── find & replace ──
export function findBar(page, { changed, toolbar }) {
  const q = h('input', { class: 'input', placeholder: 'Find …', 'aria-label': 'Find', spellcheck: 'false' });
  const r = h('input', { class: 'input', placeholder: 'Erstat med …', 'aria-label': 'Erstat med', spellcheck: 'false' });
  const exact = h('input', { type: 'checkbox', 'aria-label': 'Skeln mellem store og små bogstaver' });
  const count = h('span', { class: 'faint ofx-find-n', 'aria-live': 'polite' });
  let hits = [], cur = -1;
  const canHl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  function search() {
    hits = [];
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const i of findAll(n.data, q.value, exact.checked)) { const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + q.value.length); hits.push(rg); }
    }
    if (cur >= hits.length) cur = hits.length - 1;
    paint();
  }
  function paint() {
    if (canHl) {
      CSS.highlights.set('ofx-find', new Highlight(...hits));
      if (hits[cur]) CSS.highlights.set('ofx-find-cur', new Highlight(hits[cur])); else CSS.highlights.delete('ofx-find-cur');
    }
    count.textContent = !q.value ? '' : hits.length ? `${cur + 1 || '–'} af ${hits.length}` : 'Ingen fundet';
  }
  function go(dir) {
    search();
    if (!hits.length) return;
    cur = (cur + dir + hits.length) % hits.length;
    const rg = hits[cur];
    const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
    (rg.startContainer.parentElement || page).scrollIntoView({ block: 'center', behavior: 'smooth' });
    paint();
  }
  function replaceOne() {
    if (!hits[cur]) { go(1); return; }
    const rg = hits[cur];
    const was = rg.toString(); rg.deleteContents(); rg.insertNode(document.createTextNode(exact.checked ? r.value : keepCase(was, r.value)));
    page.normalize(); changed(); cur -= 1; go(1);
  }
  function replaceAll() {
    search();
    const n = hits.length;
    for (let i = hits.length - 1; i >= 0; i--) { const was = hits[i].toString(); hits[i].deleteContents(); hits[i].insertNode(document.createTextNode(exact.checked ? r.value : keepCase(was, r.value))); }
    page.normalize(); changed(); cur = -1; search();
    count.textContent = n ? `${n} erstattet` : 'Ingen fundet';
  }
  q.addEventListener('input', () => { cur = -1; search(); });
  exact.addEventListener('change', () => { cur = -1; search(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') close(); });
  r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } if (e.key === 'Escape') close(); });
  const replRow = h('div', { class: 'ofx-find-row' }, r,
    h('button', { type: 'button', class: 'btn btn-sm', onclick: replaceOne }, 'Erstat'),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: replaceAll }, 'Erstat alle'));
  const bar = h('div', { class: 'ofx-find glass', hidden: true, role: 'search', 'aria-label': 'Find og erstat' },
    h('div', { class: 'ofx-find-row' }, icon('search'), q, count,
      h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Forrige', title: 'Forrige (Shift+Enter)', onclick: () => go(-1) }, icon('chevronUp')),
      h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Næste', title: 'Næste (Enter)', onclick: () => go(1) }, icon('chevronDown')),
      h('label', { class: 'ofx-find-case', title: 'Skeln mellem store og små bogstaver' }, exact, 'Aa'),
      h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Luk', title: 'Luk (Esc)', onclick: () => close() }, icon('x'))),
    replRow);
  function open(withReplace) {
    bar.hidden = false; replRow.hidden = !withReplace && !r.value;
    const sel = getSelection().toString();
    if (sel && sel.length < 80 && !sel.includes('\n')) q.value = sel;
    q.focus(); q.select(); cur = -1; search();
  }
  function close() { bar.hidden = true; hits = []; if (canHl) { CSS.highlights.delete('ofx-find'); CSS.highlights.delete('ofx-find-cur'); } page.focus(); }
  toolbar.append(toolBtn('search', 'Find og erstat (Ctrl+F / Ctrl+H)', () => open(true)));
  return { el: bar, open, close, refresh: () => { if (!bar.hidden && q.value) search(); } };
}

// ── typing shortcuts ──
export function typingShortcuts(page, exec) {
  page.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
    const s = getSelection();
    if (!s.isCollapsed || !s.anchorNode || s.anchorNode.nodeType !== 3) return;
    const block = s.anchorNode.parentElement?.closest('p, div, h1, h2, h3');
    if (!block || !page.contains(block) || block === page || block.closest('li, td, th, pre')) return;
    const rg = document.createRange(); rg.setStart(block, 0); rg.setEnd(s.anchorNode, s.anchorOffset);
    const what = shortcutFor(rg.toString());
    if (!what) return;
    e.preventDefault();
    rg.deleteContents();
    if (!block.textContent) block.innerHTML = '<br>';
    const c = document.createRange(); c.selectNodeContents(block); c.collapse(true); s.removeAllRanges(); s.addRange(c);
    if (what[0] === 'block') exec('formatBlock', `<${what[1]}>`);
    else if (what[0] === 'ul') exec('insertUnorderedList');
    else if (what[0] === 'ol') exec('insertOrderedList');
    else exec('insertHTML', '<ul data-check="1"><li><input type="checkbox"> </li></ul>');
  });
}

// ── outline ──
export function outline(page) {
  const list = h('nav', { class: 'ofx-outline', 'aria-label': 'Overblik over overskrifter' });
  function draw() {
    const hs = [...page.querySelectorAll('h1, h2, h3')].filter(x => x.textContent.trim());
    h(clear(list), null, h('b', { class: 'ofx-outline-t' }, 'Overblik'),
      hs.length ? hs.map(x => h('button', { type: 'button', class: `ofx-ol-${x.tagName.toLowerCase()}`, onclick: () => { x.scrollIntoView({ block: 'start', behavior: 'smooth' }); const r = document.createRange(); r.selectNodeContents(x); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); page.focus({ preventScroll: true }); } }, x.textContent.trim().slice(0, 60)))
        : h('p', { class: 'faint' }, 'Overskrifter vises her. Skriv “# ” i starten af en linje for at lave en.'));
  }
  draw();
  return { el: list, draw };
}

// ── tables ──
export function tableTools(page, changed) {
  const cellAt = () => { const n = getSelection().anchorNode; const el = n?.nodeType === 3 ? n.parentElement : n; const c = el?.closest?.('td, th'); return c && page.contains(c) ? c : null; };
  const blank = (tag) => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };
  const ops = {
    rowAbove(c) { const tr = c.parentElement, n = document.createElement('tr'); [...tr.children].forEach(() => n.append(blank('td'))); tr.before(n); },
    rowBelow(c) { const tr = c.parentElement, n = document.createElement('tr'); [...tr.children].forEach(() => n.append(blank('td'))); tr.after(n); },
    colLeft(c) { const i = [...c.parentElement.children].indexOf(c); c.closest('table').querySelectorAll('tr').forEach(tr => tr.children[i]?.before(blank(tr.children[i].tagName.toLowerCase()))); },
    colRight(c) { const i = [...c.parentElement.children].indexOf(c); c.closest('table').querySelectorAll('tr').forEach(tr => tr.children[i]?.after(blank(tr.children[i].tagName.toLowerCase()))); },
    delRow(c) { const t = c.closest('table'); c.parentElement.remove(); if (!t.querySelector('tr')) t.remove(); },
    delCol(c) { const i = [...c.parentElement.children].indexOf(c), t = c.closest('table'); t.querySelectorAll('tr').forEach(tr => tr.children[i]?.remove()); if (!t.querySelector('td, th')) t.remove(); },
    delTable(c) { c.closest('table').remove(); },
  };
  const run = (k) => { const c = cellAt(); if (!c) return; ops[k](c); changed(); sync(); };
  const box = h('div', { class: 'ofx-tabletools', hidden: true, role: 'group', 'aria-label': 'Tabel' },
    h('span', { class: 'ofx-tt-l' }, icon('grid'), 'Tabel'),
    toolBtn('arrowUp', 'Indsæt række over', () => run('rowAbove')), toolBtn('arrowDown', 'Indsæt række under', () => run('rowBelow')),
    toolBtn('arrowLeft', 'Indsæt kolonne til venstre', () => run('colLeft')), toolBtn('arrowRight', 'Indsæt kolonne til højre', () => run('colRight')),
    h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onmousedown: (e) => e.preventDefault(), onclick: () => run('delRow') }, 'Slet række'),
    h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onmousedown: (e) => e.preventDefault(), onclick: () => run('delCol') }, 'Slet kolonne'),
    h('button', { type: 'button', class: 'btn btn-sm btn-ghost', style: { color: 'var(--bad)' }, onmousedown: (e) => e.preventDefault(), onclick: () => run('delTable') }, 'Slet tabel'));
  function sync() { box.hidden = !cellAt(); }
  // Tab in the last cell adds a row, like in Word
  page.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const c = cellAt(); if (!c) return;
    e.preventDefault();
    const cells = [...c.closest('table').querySelectorAll('td, th')], i = cells.indexOf(c);
    let next = cells[i + (e.shiftKey ? -1 : 1)];
    if (!next && !e.shiftKey) { ops.rowBelow(c); changed(); next = c.parentElement.nextElementSibling.firstElementChild; }
    if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  }, true);
  return { el: box, sync };
}
