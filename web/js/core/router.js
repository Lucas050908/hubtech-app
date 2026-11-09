/** Hash router with lazy page modules, auth guards and page transitions. */
const routes = [];
let current = null;
let handler = null;

export function route(pattern, opts) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ pattern, rx, keys, ...opts });
}

export function match(path) {
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

export function currentPath() {
  const h = location.hash.replace(/^#/, '') || '/';
  return h.split('?')[0];
}

export function query() {
  const h = location.hash;
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}

export function navigate(to, { replace = false } = {}) {
  const target = to.startsWith('#') ? to : '#' + to;
  if (replace) history.replaceState(null, '', target);
  else if (location.hash !== target) { location.hash = target; return; }
  handler?.();
}

export function startRouter(onRoute) {
  handler = () => {
    const path = currentPath();
    const m = match(path) || match('/404');
    current = { path, ...m };
    onRoute(current);
  };
  addEventListener('hashchange', handler);
  handler();
}

export function getCurrent() { return current; }
