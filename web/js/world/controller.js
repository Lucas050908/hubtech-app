/** Connects user preferences to the World renderer and resolves "auto" season / time / weather. */
// the landscape renderer (landscape.js) is only loaded when an old still needs it – HUBTECH shows the high-rises, so it stays out of memory
let LandMod = null;
const landscape = () => (LandMod ||= import('./landscape.js'));
import { seasonForDate, timeForDate, SEASON_LABEL, TIME_LABEL } from './palettes.js';
import { store, setWorld } from '../core/store.js';
import { SCENES } from './scenes.js';

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
  // clarity: solid panels and stronger contrast – by choice, or when the system asks for less transparency / more contrast
  const sysClear = matchMedia('(prefers-reduced-transparency: reduce)').matches || matchMedia('(prefers-contrast: more)').matches;
  document.documentElement.dataset.clarity = w.clarity === 'solid' || (w.clarity !== 'normal' && sysClear) ? 'solid' : 'normal';
  document.documentElement.dataset.season = r.season;
  document.documentElement.dataset.time = r.time;
  const useImage = false;
  const styleWanted = w.style && w.style !== 'auto' ? w.style : SCENES.desert.style;
  const rolig = styleWanted === 'rolig';   // design D: flat and calm – no background scene is drawn (lighter, too)
  const useScene = rolig ? null : 'desert';   // the other looks keep Højhuse om natten
  document.documentElement.dataset.worldSource = useImage ? 'image' : useScene ? 'scene' : rolig ? 'none' : 'landscape';
  showImage(useImage ? w.image.url : null, w.brightness, reduced);
  showScene(useScene, { time: r.time, intensity: w.intensity, reduced, hq: w.quality === 'high', brightness: w.brightness });
  // the look of buttons and colours: chosen, or following the theme
  const style = rolig ? 'orken' : styleWanted;
  if (style === 'standard') delete document.documentElement.dataset.style; else document.documentElement.dataset.style = style;
  if (rolig) document.documentElement.dataset.look = 'rolig'; else delete document.documentElement.dataset.look;
  world.configure({
    season: r.season, time: r.time, weather: r.weather, landscape: r.landscape,
    intensity: w.intensity, brightness: w.brightness, parallax: w.parallax && !reduced,
    reduced: reduced || !!useImage || !!useScene || rolig,   // own picture or a theme scene: the landscape stays still (and hidden) – no CPU spent
    hq: w.quality === 'high',
    meteors: w.meteors || 'auto', cloudShadows: w.cloudShadows !== false,
    focus,
  });
  // UI readability scrim: lighter on the landing page, stronger inside dense app screens
  // vivid on Hjem/forside (like the mockup), calmer behind dense working screens
  const base = useScene ? ({ minimal: 0.04, silk: 0.06 }[useScene] ?? 0.12) : (useImage ? 0.14 : 0) + ({ day: 0.22, dawn: 0.16, dusk: 0.14, night: 0.08 }[r.time] ?? 0.15);
  document.documentElement.style.setProperty('--scrim', String(Math.min(0.85, base + focus * 0.3)));
}

/** A theme scene (cityscape.js) on a canvas of its own, loaded only when used. */
let sceneEl = null, scene = null, sceneLoading = null;
async function showScene(name, opt) {
  if (!name) {
    if (scene) { scene.stop(); }
    if (sceneEl) sceneEl.hidden = true;
    return;
  }
  if (!sceneEl) {
    sceneEl = document.createElement('canvas');
    sceneEl.id = 'world-scene';
    sceneEl.setAttribute('aria-hidden', 'true');
    document.getElementById('world')?.after(sceneEl);
  }
  sceneEl.hidden = false;
  sceneEl.style.filter = `brightness(${Math.min(1.1, opt.brightness + 0.1)})`;
  if (!scene) {
    sceneLoading ||= import('./cityscape.js').then(m => { scene = new m.CityScene(sceneEl); window.__hubtechScene = scene; });
    await sceneLoading;
  }
  scene.configure({ scene: name, time: opt.time, intensity: opt.intensity, reduced: opt.reduced, hq: opt.hq, light: document.documentElement.dataset.theme === 'light' });
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
  // one background (Højhuse om natten, cityscape.js): no landscape engine, no extra full-screen canvas in memory
  if (canvas) { canvas.width = 1; canvas.height = 1; canvas.hidden = true; }
  world = { configure() {}, quality: 0 };
  apply();
  store.on('prefs', apply);
  for (const q of ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)']) matchMedia(q).addEventListener?.('change', apply);
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
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
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

// the desert design: every picture (app cards, heroes, learning tiles) shows the same desert – one look across the app.
// Settings previews of the other landscapes pass keep: true.
let cityMod = null;
const desertLook = () => { const w = store.get('prefs')?.world; return w?.source === 'scene' && w?.scene === 'desert'; };
function desertStill(canvas, opts) {
  const run = () => {
    cityMod.paintScene(canvas, 'desert-full', { time: opts.time, light: document.documentElement.dataset.theme === 'light' });
    if (opts.tint) {   // a soft wash of the app's own colour keeps the cards apart
      const c = canvas.getContext('2d'), g = c.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, opts.tint + '55'); g.addColorStop(0.6, opts.tint + '00');
      c.globalCompositeOperation = 'soft-light'; c.fillStyle = g; c.fillRect(0, 0, canvas.width, canvas.height); c.globalCompositeOperation = 'source-over';
    }
  };
  if (cityMod) return run();
  import('./cityscape.js').then(m => { cityMod = m; if (canvas.isConnected) run(); });
}

export function paintStill(canvas, opts) {
  if (desertLook() && !opts?.keep) {
    const tint = /^#[0-9a-f]{6}$/i.test(opts?.tint || '') ? opts.tint : null;
    const t = ['day', 'dusk', 'night', 'dawn'].includes(opts?.time) ? opts.time : 'dusk';
    opts = { desert: true, time: t, tint };
  }
  const w = canvas.clientWidth | 0, hgt = canvas.clientHeight | 0;
  if (!w || !hgt) { requestAnimationFrame(() => { if (canvas.isConnected && canvas.clientWidth) paintStill(canvas, opts); }); return; }
  const key = JSON.stringify(opts) + `@${w}x${hgt}`;
  const mem = memCache.get(key);
  if (mem) { drawImageTo(canvas, mem); return; }
  let stored = null;
  try { stored = localStorage.getItem(storageKey(key)); } catch { /* storage unavailable */ }
  if (stored) {
    const img = new Image();
    img.onload = () => { memCache.set(key, img); if (memCache.size > 24) memCache.delete(memCache.keys().next().value); if (canvas.isConnected) drawImageTo(canvas, img); };
    img.src = stored;
    return;
  }
  queue.push({
    canvas,
    run: () => {
      const done = memCache.get(key);
      if (done) { drawImageTo(canvas, done); return; }
      if (opts.desert) {
        if (!cityMod) { import('./cityscape.js').then(m => { cityMod = m; queue.push({ canvas, run: () => paintStill(canvas, opts) }); pump(); }); return; }
        desertStill(canvas, opts);
      } else { landscape().then(m => { if (canvas.isConnected) m.World.renderStill(canvas, opts); }); return; }
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      memCache.set(key, copy);
      if (memCache.size > 24) memCache.delete(memCache.keys().next().value);   // keep the picture cache small – it was growing without end
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
