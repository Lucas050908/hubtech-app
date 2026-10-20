/** Connects user preferences to the World renderer and resolves "auto" season / time / weather. */
import { World } from './landscape.js';
import { seasonForDate, timeForDate, SEASON_LABEL, TIME_LABEL } from './palettes.js';
import { store, setWorld } from '../core/store.js';

let world = null;
let focus = 0;
let clockTimer = null;

export function resolved(w = store.get('prefs').world) {
  const now = new Date();
  const lat = w.useLocation && typeof w.lat === 'number' ? w.lat : null;
  const season = w.seasonMode === 'auto' ? seasonForDate(now, lat) : w.season;
  let time = w.timeMode === 'auto' ? timeForDate(now, lat, season) : w.timeMode;
  // light theme + automatic time: show the valley in daylight so the light UI and the world agree
  if (w.timeMode === 'auto' && document.documentElement.dataset.theme === 'light' && time === 'night') time = 'dusk';
  return { season, time, weather: w.weather || 'auto', landscape: w.landscape || 'valley' };
}

function reducedMotion(w) {
  if (w.motion === 'reduced') return true;
  if (w.motion === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function apply() {
  if (!world) return;
  const w = store.get('prefs').world;
  const r = resolved(w);
  const reduced = reducedMotion(w);
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  document.documentElement.dataset.season = r.season;
  document.documentElement.dataset.time = r.time;
  const useImage = w.source === 'image' && w.image?.url;
  document.documentElement.dataset.worldSource = useImage ? 'image' : 'landscape';
  showImage(useImage ? w.image.url : null, w.brightness, reduced);
  world.configure({
    season: r.season, time: r.time, weather: r.weather, landscape: r.landscape,
    intensity: w.intensity, brightness: w.brightness, parallax: w.parallax && !reduced,
    reduced: reduced || !!useImage,          // own picture: the landscape stays still (and hidden) – no CPU spent
    hq: w.quality === 'high',
    focus,
  });
  // UI readability scrim: lighter on the landing page, stronger inside dense app screens
  // vivid on Hjem/forside (like the mockup), calmer behind dense working screens
  const base = (useImage ? 0.14 : 0) + ({ day: 0.22, dawn: 0.16, dusk: 0.14, night: 0.08 }[r.time] ?? 0.15);
  document.documentElement.style.setProperty('--scrim', String(Math.min(0.85, base + focus * 0.3)));
}

/** Your own background picture (e.g. made with an AI image generator), shown instead of the landscape. */
let imgEl = null;
function showImage(url, brightness, reduced) {
  if (!url) { if (imgEl) imgEl.hidden = true; return; }
  if (!imgEl) {
    imgEl = document.createElement('div');
    imgEl.id = 'world-image';
    imgEl.setAttribute('aria-hidden', 'true');
    document.getElementById('world')?.after(imgEl);
  }
  if (imgEl.dataset.url !== url) {
    imgEl.dataset.url = url;
    const pre = new Image();
    pre.onload = () => { imgEl.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`; imgEl.classList.add('is-loaded'); };
    pre.src = url;
  }
  imgEl.hidden = false;
  imgEl.classList.toggle('is-still', !!reduced);
  imgEl.style.filter = `brightness(${brightness}) saturate(${0.9 + brightness * 0.12})`;
}

export function initWorld(canvas) {
  world = new World(canvas);
  window.__hubtechWorld = world; // handy for debugging performance in devtools
  apply();
  store.on('prefs', apply);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', apply);
  // auto season/time re-evaluated every 5 minutes
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const w = store.get('prefs').world;
    if (w.seasonMode === 'auto' || w.timeMode === 'auto') apply();
  }, 5 * 60 * 1000);
  return world;
}

/** 0 = showcase (landing/home hero), 1 = working screen (calmer, darker scrim, fewer particles) */
export function setFocus(level) {
  if (focus === level) return;
  focus = level;
  apply();
}

export function describeWorld() {
  const r = resolved();
  return { ...r, seasonLabel: SEASON_LABEL[r.season], timeLabel: TIME_LABEL[r.time] };
}

/** Opt-in geolocation: only the latitude (rounded) is kept, to pick hemisphere & day length. */
export function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Din browser understøtter ikke placering.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 10) / 10;
        setWorld({ useLocation: true, lat });
        resolve(lat);
      },
      (err) => reject(new Error(err.code === 1 ? 'Adgang til placering blev afvist.' : 'Placeringen kunne ikke bestemmes.')),
      { maximumAge: 24 * 3600 * 1000, timeout: 10000, enableHighAccuracy: false },
    );
  });
}

// ── stills (thumbnails) ──
// Rendering a still costs ~0.1 s, so they are (1) cached in memory, (2) cached across visits in
// localStorage as small WebP images, and (3) rendered one at a time in idle periods.
const STILL_VERSION = 'v7';
const memCache = new Map();
const queue = [];
let pumping = false;

function storageKey(key) { return `hubtech.still.${STILL_VERSION}.${key}`; }

function drawImageTo(canvas, img) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round((canvas.clientWidth || img.width) * dpr);
  canvas.height = Math.round((canvas.clientHeight || img.height) * dpr);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
}

function pump() {
  if (pumping) return;
  pumping = true;
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 16));
  const step = () => {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    if (job.canvas.isConnected) { try { job.run(); } catch (e) { console.warn('Miniature kunne ikke tegnes', e); } }
    idle(step, { timeout: 300 });
  };
  idle(step, { timeout: 300 });
}

export function paintStill(canvas, opts) {
  const w = canvas.clientWidth | 0, hgt = canvas.clientHeight | 0;
  if (!w || !hgt) { requestAnimationFrame(() => { if (canvas.isConnected && canvas.clientWidth) paintStill(canvas, opts); }); return; }
  const key = JSON.stringify(opts) + `@${w}x${hgt}`;
  const mem = memCache.get(key);
  if (mem) { drawImageTo(canvas, mem); return; }
  let stored = null;
  try { stored = localStorage.getItem(storageKey(key)); } catch { /* storage unavailable */ }
  if (stored) {
    const img = new Image();
    img.onload = () => { memCache.set(key, img); if (canvas.isConnected) drawImageTo(canvas, img); };
    img.src = stored;
    return;
  }
  queue.push({
    canvas,
    run: () => {
      const done = memCache.get(key);
      if (done) { drawImageTo(canvas, done); return; }
      World.renderStill(canvas, opts);
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      memCache.set(key, copy);
      try {
        const prefix = 'hubtech.still.';
        const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
        if (keys.length > 60) keys.forEach(k => localStorage.removeItem(k)); // sizes change with the viewport – keep it bounded
        localStorage.setItem(storageKey(key), canvas.toDataURL('image/webp', 0.82));
      } catch { /* quota or private mode – the memory cache still works */ }
    },
  });
  pump();
}
