/** JSON API client. All requests are same-origin, cookie-authenticated and carry the CSRF header. */
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `HTTP ${status}`);
    this.status = status;
    this.code = data?.code;
    this.field = data?.field;
    this.data = data || {};
  }
}

import { cacheable, queueable, remember, recall, enqueue, markOnline, markOffline, setOfflineUser } from './offline.js';

const listeners = new Set();
export function onUnauthorized(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function request(method, path, body, { signal, quiet401 = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'hubtech',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // offline: answer from this device's copy, or queue the change until the server is back
    const clean = path.split('?')[0];
    try {
      if (cacheable(method, path)) { const hit = await recall(path); if (hit) { markOffline(); return structuredClone(hit); } }
      else if (queueable(method, clean)) return await enqueue(method, clean, body);
    } catch { /* fall through to the error */ }
    throw new ApiError(0, { error: 'Kunne ikke kontakte serveren. Kører HUBTECH-serveren?', code: 'network' });
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (res.status === 401 && !quiet401) listeners.forEach(fn => fn(err));
    throw err;
  }
  markOnline();
  if (data?.user?.id && /^\/api\/(auth\/(status|login|register)|me)$/.test(path)) setOfflineUser(data.user);
  if (cacheable(method, path)) remember(path, data).catch(() => {});
  return data;
}

export const api = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b = {}, o) => request('POST', p, b, o),
  put: (p, b = {}, o) => request('PUT', p, b, o),
  patch: (p, b = {}, o) => request('PATCH', p, b, o),
  del: (p, b = {}, o) => request('DELETE', p, b, o),
};
