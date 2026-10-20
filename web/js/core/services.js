/** Data services shared by pages (with light in-memory caching). */
import { api } from './api.js';
import { debounce } from './dom.js';

let projectsCache = null, projectsAt = 0, projectsInflight = null;

export async function getProjects({ force = false } = {}) {
  if (!force && projectsCache && Date.now() - projectsAt < 30_000) return projectsCache;
  if (projectsInflight && !force) return projectsInflight;
  projectsInflight = api.get('/api/projects' + (force ? '?refresh=1' : ''))
    .then((d) => { projectsCache = d; projectsAt = Date.now(); return d; })
    .catch((e) => { if (e.status === 403) return { restricted: true, projects: [], status: null }; throw e; })
    .finally(() => { projectsInflight = null; });
  return projectsInflight;
}

export function patchProjectCache(id, meta) {
  if (!projectsCache) return;
  const p = projectsCache.projects.find(x => x.id === id);
  if (p) p.meta = meta;
}

const stateCache = new Map();
// Local change counters: `changed` grows with every saveState, `saved` is the newest version the server confirmed.
const changed = new Map(), saved = new Map();
const hasUnsaved = (appId) => (changed.get(appId) || 0) > (saved.get(appId) || 0);
export async function getState(appId, { force = false } = {}) {
  // Local changes that are still on their way to the server are newer than what the server has.
  if ((!force || hasUnsaved(appId)) && stateCache.has(appId)) return stateCache.get(appId);
  const { state } = await api.get(`/api/state/${appId}`);
  stateCache.set(appId, state);
  return state;
}

const savers = new Map();
/** Debounced save; returns a promise-less fire-and-forget. Use flushState() before leaving. */
export function saveState(appId, state, { onError } = {}) {
  stateCache.set(appId, state);
  if (!savers.has(appId)) {
    savers.set(appId, debounce(async (s) => {
      const v = changed.get(appId) || 0;
      try { await api.put(`/api/state/${appId}`, { state: s }); saved.set(appId, Math.max(saved.get(appId) || 0, v)); }
      catch (e) { onError?.(e); console.warn('Kunne ikke gemme', appId, e); }
    }, 500));
  }
  changed.set(appId, (changed.get(appId) || 0) + 1);
  savers.get(appId)(state);
}
export function flushState(appId) { const s = savers.get(appId); if (s && stateCache.has(appId)) s.flush(stateCache.get(appId)); }

let integrations = null, integrationsAt = 0;
export async function getIntegrations({ force = false } = {}) {
  if (!force && integrations && Date.now() - integrationsAt < 30_000) return integrations;
  integrations = await api.get('/api/integrations');
  integrationsAt = Date.now();
  return integrations;
}
export function invalidateIntegrations() { integrations = null; }

export function clearCaches() { projectsCache = null; stateCache.clear(); changed.clear(); saved.clear(); integrations = null; }

// ── derived learning progress ──
import { COURSE } from '../data/course-servicetekniker.js';
export function courseProgress(state) {
  const days = COURSE.days;
  let tasks = 0, done = 0, daysDone = 0;
  days.forEach((d, i) => {
    const s = state?.days?.[i];
    tasks += d.d.length;
    const n = (s?.tasks || []).filter(Boolean).length;
    done += n;
    if (s?.complete) daysDone++;
  });
  const last = typeof state?.lastDay === 'number' ? state.lastDay : 0;
  return { tasks, done, daysDone, totalDays: days.length, pct: tasks ? Math.round(done / tasks * 100) : 0, lastDay: last, started: done > 0 || !!state?.startedAt };
}

export function cpLevel(xp = 0) {
  const LEVELS = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 12000, 18000]; // = CircuitPilot LEVELS
  let l = 1;
  LEVELS.forEach((x, i) => { if (xp >= x) l = i + 1; });
  return l;
}
