/**
 * Global client state with change subscriptions.
 * - Server is the source of truth for everything user-related (profile, prefs, favorites, progress).
 * - localStorage only mirrors *device* conveniences (world look before login, sidebar state).
 */
import { api } from './api.js';
import { debounce } from './dom.js';

const LOCAL_KEY = 'hubtech.device.v1';

export const DEFAULT_WORLD = {
  seasonMode: 'auto',      // auto | manual
  season: 'summer',        // spring | summer | autumn | winter (manual choice)
  timeMode: 'auto',        // auto | dawn | day | dusk | night
  intensity: 0.7,          // 0..1 animation intensity
  brightness: 0.85,        // 0.4..1.1 background brightness
  weather: 'auto',         // auto | clear | rain | snow | fog
  motion: 'system',        // system | full | reduced
  parallax: true,
  meteors: 'auto',         // auto (night and dusk) | on | off – shooting stars
  cloudShadows: true,      // shadows of clouds drifting over the land
  useLocation: false,      // hemisphere/daylight from geolocation (opt-in)
  lat: null,
  landscape: 'valley',     // valley | highlands | fjord | alps | hills | coast | lakes
  quality: 'normal',       // normal | high (sharper on big / high-dpi screens)
  source: 'landscape',     // landscape | image (your own picture as the background)
  image: null,             // { url, name } – uploaded to /api/office/files
};

export const DEFAULT_PREFS = {
  theme: 'dark',           // dark | light | system
  world: DEFAULT_WORLD,
  pinnedApps: ['hubtech', 'byteforge', 'cursor'],
  savedGuides: [],
  dashboard: { showWorldCard: true },
};

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; }
}
function writeLocal(v) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch { /* private mode etc. */ }
}

const listeners = new Map();
const state = {
  user: null,
  prefs: structuredClone(DEFAULT_PREFS),
  summary: null,
  favorites: [],
  integrations: null,
  authStatus: null,
  device: readLocal(),
};
if (state.device.world) state.prefs.world = { ...DEFAULT_WORLD, ...state.device.world };
if (state.device.theme) state.prefs.theme = state.device.theme;

export const store = {
  get: (k) => state[k],
  set(k, v) { state[k] = v; emit(k, v); },
  on(k, fn) {
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k).add(fn);
    return () => listeners.get(k)?.delete(fn);
  },
  device(k, v) {
    if (v === undefined) return state.device[k];
    state.device[k] = v; writeLocal(state.device);
  },
};
function emit(k, v) { listeners.get(k)?.forEach(fn => { try { fn(v); } catch (e) { console.error(e); } }); }

// ── prefs ────────────────────────────────────────────────────────────────
let pendingPatch = {};
const pushPrefs = debounce(async () => {
  const patch = pendingPatch;
  pendingPatch = {};
  if (!state.user || !Object.keys(patch).length) return;
  try { await api.put('/api/me/prefs', patch); } catch (e) { console.warn('Kunne ikke gemme indstillinger', e); }
}, 600);

export function setPref(key, value) {
  state.prefs = { ...state.prefs, [key]: value };
  if (key === 'world' || key === 'theme') {
    state.device[key] = value; writeLocal(state.device);
  }
  emit('prefs', state.prefs);
  pendingPatch[key] = value;
  pushPrefs();
}
export function flushPrefs() { pushPrefs.flush(); }

export function setWorld(patch) { setPref('world', { ...state.prefs.world, ...patch }); }

export async function loadUserData() {
  const [prefsRes, favRes] = await Promise.all([
    api.get('/api/me/prefs').catch(() => ({ prefs: {} })),
    api.get('/api/favorites').catch(() => ({ favorites: [] })),
  ]);
  const server = prefsRes.prefs || {};
  const merged = { ...structuredClone(DEFAULT_PREFS), ...server };
  merged.world = { ...DEFAULT_WORLD, ...(server.world || state.prefs.world || {}) };
  if (!server.theme && state.prefs.theme) merged.theme = state.prefs.theme;
  state.prefs = merged;
  state.device.world = merged.world; state.device.theme = merged.theme; writeLocal(state.device);
  // first login on this account: upload the look this device already had
  if (!server.world) api.put('/api/me/prefs', { world: merged.world, theme: merged.theme }).catch(() => {});
  state.favorites = favRes.favorites || [];
  emit('prefs', state.prefs);
  emit('favorites', state.favorites);
  refreshSummary();
}

export async function refreshSummary() {
  if (!state.user) return null;
  try {
    const s = await api.get('/api/me/summary');
    store.set('summary', s);
    return s;
  } catch { return null; }
}

export function isFavorite(kind, ref) { return state.favorites.some(f => f.kind === kind && f.ref === ref); }

export async function toggleFavorite(kind, ref) {
  const was = isFavorite(kind, ref);
  // optimistic
  state.favorites = was ? state.favorites.filter(f => !(f.kind === kind && f.ref === ref))
    : [...state.favorites, { kind, ref, createdAt: Date.now() / 1000 }];
  emit('favorites', state.favorites);
  try {
    await api.post('/api/favorites', { kind, ref, on: !was });
  } catch (e) {
    state.favorites = was ? [...state.favorites, { kind, ref }] : state.favorites.filter(f => !(f.kind === kind && f.ref === ref));
    emit('favorites', state.favorites);
    throw e;
  }
  return !was;
}

export function logActivity(app, kind, title, detail = '', ref = '') {
  if (!state.user) return;
  api.post('/api/activity', { app, kind, title, detail, ref }).catch(() => {});
}

export function resetSessionState() {
  state.user = null;
  state.summary = null;
  state.favorites = [];
  state.integrations = null;
  emit('user', null);
}
