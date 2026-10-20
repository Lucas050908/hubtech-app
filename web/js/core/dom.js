/**
 * Tiny DOM toolkit. `h()` builds elements without innerHTML, so user data is always
 * inserted as text. Use `raw()` only for trusted, static markup (icons).
 */
const RAW = Symbol('raw');

export function raw(html) { return { [RAW]: true, html }; }

export function h(tag, props, ...children) {
  const el = tag instanceof Element ? tag : document.createElement(tag);
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props) || props[RAW])) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv === undefined || sv === null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'ref' && typeof v === 'function') v(el);
      else if (k === 'html') el.innerHTML = v; // trusted static markup only
      else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false || c === true) continue;
    if (c instanceof Node) el.appendChild(c);
    else if (c[RAW]) el.insertAdjacentHTML('beforeend', c.html);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function mount(el, ...children) { clear(el); return append(el, children); }

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Relative Danish time: "2 timer siden" */
export function timeAgo(sec) {
  if (!sec) return '—';
  const d = Math.max(0, Date.now() / 1000 - sec);
  if (d < 45) return 'lige nu';
  if (d < 3600) { const m = Math.round(d / 60); return `${m} min. siden`; }
  if (d < 86400) { const h = Math.round(d / 3600); return `${h} ${h === 1 ? 'time' : 'timer'} siden`; }
  if (d < 86400 * 2) return 'i går';
  if (d < 86400 * 30) return `${Math.round(d / 86400)} dage siden`;
  return new Date(sec * 1000).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function animateNumber(el, to, ms = 900) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (prefersReducedMotion() || from === to) { el.textContent = to.toLocaleString('da-DK'); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('da-DK');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
