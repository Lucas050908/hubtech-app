/** Shared UI primitives: toasts, dialogs, states, loading buttons. */
import { h, clear, $$ } from './dom.js';
import { icon } from './icons.js';

let toastHost;
function host() {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'region', 'aria-live': 'polite', 'aria-label': 'Notifikationer' });
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

/** toast('Gemt', { text, type: 'ok'|'bad'|'warn'|'xp', icon, ms, action: {label, onClick} }) */
export function toast(title, opts = {}) {
  const type = opts.type || 'info';
  const ic = opts.icon || { ok: 'checkCircle', bad: 'alert', warn: 'alert', xp: 'sparkles' }[type] || 'info';
  const el = h('div', { class: ['toast', type], role: type === 'bad' ? 'alert' : 'status' },
    h('div', { class: 'toast-icon' }, icon(ic)),
    h('div', { class: 'toast-body' },
      h('div', { class: 'toast-title' }, title),
      opts.text ? h('div', { class: 'toast-text' }, opts.text) : null,
      opts.action ? h('button', { class: 'btn btn-sm btn-ghost', style: { marginTop: '6px', marginLeft: '-12px' }, onclick: () => { opts.action.onClick(); dismiss(); } }, opts.action.label) : null),
    h('button', { class: 'icon-btn', style: { width: '28px', height: '28px', marginTop: '-4px', marginRight: '-6px' }, 'aria-label': 'Luk', onclick: () => dismiss() }, icon('x')));
  if (opts.action) el.dataset.action = '1';
  host().appendChild(el);
  // at most 4 at a time: the oldest without a button goes first, so "Skift tilbage", "Opdatér nu" … stay
  const kids = [...host().children];
  if (kids.length > 4) (kids.find(k => !k.dataset.action) || kids[0]).remove();
  let gone = false;
  function dismiss() {
    if (gone) return; gone = true;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 260);
  }
  setTimeout(dismiss, opts.ms || (type === 'bad' ? 6500 : 3800));
  return dismiss;
}

export function errorToast(err, fallback = 'Noget gik galt') {
  toast(fallback, { type: 'bad', text: err?.message || String(err) });
}

/** Accessible modal dialog. Returns { el, close }. Focus is trapped and restored. */
const openModals = new Set();
/** Close every open dialog (when the page changes, dialogs of the old page must not stay on top). */
export function closeAllModals() { [...openModals].forEach(c => { try { c(); } catch { /* */ } }); }

export function modal({ title, body, actions = [], onClose, size, label }) {
  const prev = document.activeElement;
  const titleId = 'm' + Math.random().toString(36).slice(2, 8);
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: size ? { width: `min(${size}px, 100%)` } : null },
    h('div', { class: 'modal-head' },
      h('div', null, label ? h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, label) : null, h('h2', { id: titleId }, title)),
      h('button', { class: 'icon-btn', 'aria-label': 'Luk dialog', onclick: () => close() }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, actions) : null);
  const back = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === back) close(); } }, box);
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', box).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }
  let closed = false;
  function close(result) {
    if (closed) return; closed = true;
    openModals.delete(close);
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    prev?.focus?.();
    onClose?.(result);
  }
  document.addEventListener('keydown', onKey, true);
  openModals.add(close);
  document.body.appendChild(back);
  requestAnimationFrame(() => {
    const first = box.querySelector('[autofocus], input, select, textarea, .modal-actions .btn-primary, .modal-actions .btn');
    (first || box).focus?.();
  });
  return { el: box, close };
}

export function confirmDialog({ title, text, confirmLabel = 'Bekræft', danger = false }) {
  return new Promise(resolve => {
    let m;
    m = modal({
      title, body: h('p', { class: 'muted' }, text),
      actions: [
        h('button', { class: 'btn', onclick: () => m.close(false) }, 'Annuller'),
        h('button', { class: ['btn', danger ? 'btn-danger' : 'btn-primary'], onclick: () => m.close(true) }, confirmLabel),
      ],
      onClose: (r) => resolve(!!r),
    });
  });
}

/** Empty / error / pending / locked state block */
export function stateBlock({ icon: ic = 'sparkles', title, text, actions = [], kind = '', app }) {
  return h('div', { class: ['state', kind && `is-${kind}`], style: app ? { '--app': app } : null },
    h('div', { class: 'state-art' }, icon(ic)),
    h('h3', null, title),
    text ? h('p', null, text) : null,
    actions.length ? h('div', { class: 'state-actions' }, actions) : null);
}

export function skeletonRows(n = 4) {
  return h('div', { 'aria-busy': 'true', 'aria-label': 'Indlæser' }, Array.from({ length: n }, () => h('div', { class: 'skel skel-row' })));
}

/** Wrap an async click handler: disables the button and shows a spinner meanwhile. */
export function busy(btn, fn) {
  return async (...args) => {
    if (btn.classList.contains('is-loading')) return;
    btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
    const sp = h('span', { class: 'spinner', 'aria-hidden': 'true' });
    btn.appendChild(sp);
    try { return await fn(...args); }
    finally { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); sp.remove(); }
  };
}

export function progressBar(pct, { app, lg, label } = {}) {
  return h('div', { class: ['progress', lg && 'progress-lg'], role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct), 'aria-label': label || `${Math.round(pct)} % fuldført`, style: app ? { '--app': app } : null },
    h('i', { style: { '--v': `${Math.max(0, Math.min(100, pct))}%` } }));
}

export function setRangeFill(input) {
  const min = Number(input.min || 0), max = Number(input.max || 100);
  input.style.setProperty('--pct', `${((Number(input.value) - min) / (max - min)) * 100}%`);
}

export function switchControl({ checked, onChange, label, id }) {
  const inp = h('input', { type: 'checkbox', id, checked: !!checked, role: 'switch', 'aria-label': label, onchange: (e) => onChange?.(e.target.checked) });
  return h('span', { class: 'switch' }, inp, h('span', { class: 'switch-track', 'aria-hidden': 'true' }));
}

export function segmented(options, value, onChange, { label } = {}) {
  const wrap = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const render = (v) => {
    clear(wrap);
    for (const o of options) {
      wrap.appendChild(h('button', {
        type: 'button', 'aria-pressed': String(o.value === v),
        onclick: () => { render(o.value); onChange(o.value); },
      }, o.icon ? icon(o.icon) : null, o.label));
    }
  };
  render(value);
  wrap.setValue = render;
  return wrap;
}
