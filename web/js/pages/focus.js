/**
 * Fokus — a pomodoro timer. The timer lives at module level, so it keeps running
 * while you use the rest of HUBTECH; sessions are stored on the server per user.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, segmented, switchControl, stateBlock } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';

const MODES = { focus: 'Fokus', short: 'Kort pause', long: 'Lang pause' };
const DEFAULTS = { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true };
const LS_TIMER = 'hubtech.focus.timer';
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

let st = null;                       // { settings, sessions: [{at, minutes, label}] }
let T = { mode: 'focus', running: false, endAt: 0, remaining: 0, label: '', cycle: 0 };
let tick = null;
let view = null;                     // callbacks of the mounted page (null when not on the page)

try { const saved = JSON.parse(localStorage.getItem(LS_TIMER) || 'null'); if (saved) T = { ...T, ...saved }; } catch { /* */ }
const keep = () => { try { localStorage.setItem(LS_TIMER, JSON.stringify(T)); } catch { /* */ } };
const settings = () => ({ ...DEFAULTS, ...(st?.settings || {}) });
const total = (mode) => settings()[mode] * 60000;
const left = () => (T.running ? T.endAt - Date.now() : (T.remaining || total(T.mode)));

function beep() {
  if (!settings().sound) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, ac.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d + 0.2);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + d); o.stop(ac.currentTime + d + 0.22);
    });
    setTimeout(() => ac.close(), 1200);
  } catch { /* audio not available */ }
}

async function complete() {
  stop();
  const wasFocus = T.mode === 'focus';
  if (wasFocus) {
    const minutes = settings().focus;
    if (!st) { try { st = (await getState('focus')) || {}; } catch { st = {}; } }
    st.sessions = [...(st.sessions || []), { at: Date.now(), minutes, label: T.label || '' }].slice(-1000);
    saveState('focus', st);
    logActivity('focus', 'session', T.label || 'Fokusblok', `${minutes} min fokus`);
    T.cycle = (T.cycle || 0) + 1;
  }
  beep();
  const next = wasFocus ? (T.cycle % settings().longEvery === 0 ? 'long' : 'short') : 'focus';
  toast(wasFocus ? 'Fokusblok færdig – tid til en pause' : 'Pausen er slut', { type: 'ok', icon: 'timer', text: wasFocus ? (T.label || `${settings().focus} min fokus gemt`) : 'Klar til næste fokusblok?', ms: 6000 });
  setMode(next);
  if (settings().autoStart) start();
  view?.refresh();
}

function loop() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!T.running) { clearInterval(tick); return; }
    if (T.endAt - Date.now() <= 0) { complete(); return; }
    view?.frame();
  }, 250);
}
function start() { if (T.running) return; T.endAt = Date.now() + left(); T.running = true; T.remaining = 0; keep(); loop(); view?.refresh(); }
function stop() { if (!T.running) return; T.remaining = Math.max(0, T.endAt - Date.now()); T.running = false; keep(); clearInterval(tick); view?.refresh(); }
function reset() { T.running = false; T.remaining = 0; keep(); clearInterval(tick); view?.refresh(); }
function setMode(m) { T.mode = m; T.running = false; T.remaining = 0; keep(); clearInterval(tick); }

// resume a timer that was running before a reload
if (T.running) { if (T.endAt <= Date.now()) setTimeout(complete, 1500); else loop(); }

export default {
  title: 'Fokus',
  destroy() { view = null; flushState('focus'); document.title = 'Fokus · HUBTECH'; },
  async render() {
    const app = appById('focus');
    try { st = (await getState('focus', { force: true })) || {}; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Fokus kunne ikke hentes', text: e.message })); }
    if (!Array.isArray(st.sessions)) st.sessions = [];

    // ── stats ──
    const v = { today: h('span'), week: h('span'), streak: h('span'), total: h('span') };
    const statsNow = () => {
      const now = Date.now(), tk = dayKey(now);
      const todays = st.sessions.filter(s => dayKey(s.at) === tk);
      v.today.textContent = `${todays.length} · ${todays.reduce((a, s) => a + s.minutes, 0)} min`;
      v.week.textContent = `${st.sessions.filter(s => now - s.at < 7 * 86400000).reduce((a, s) => a + s.minutes, 0)} min`;
      const days = new Set(st.sessions.map(s => dayKey(s.at)));
      let streak = 0; for (let d = new Date(); days.has(dayKey(d)); d.setDate(d.getDate() - 1)) streak++;
      v.streak.textContent = `${streak} dag${streak === 1 ? '' : 'e'}`;
      v.total.textContent = String(st.sessions.length);
    };

    // ── timer UI ──
    const R = 120, C = 2 * Math.PI * R;
    const ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const ring = h('div', { class: 'fx-ring' });
    ring.innerHTML = `<svg viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="${R}" class="fx-track"/></svg>`;
    Object.entries({ cx: 140, cy: 140, r: R, class: 'fx-prog', 'stroke-dasharray': C, transform: 'rotate(-90 140 140)' }).forEach(([k, val]) => ringFg.setAttribute(k, val));
    ring.querySelector('svg').appendChild(ringFg);
    const time = h('div', { class: 'fx-time', role: 'timer', 'aria-live': 'off' });
    const modeLbl = h('div', { class: 'fx-mode' });
    ring.append(h('div', { class: 'fx-center' }, modeLbl, time));

    const modeSeg = segmented(Object.entries(MODES).map(([value, label]) => ({ value, label })), T.mode, (m) => { setMode(m); refresh(); }, { label: 'Tilstand' });
    const label = h('input', { class: 'input', placeholder: 'Hvad arbejder du på?', value: T.label || '', maxlength: 120, list: 'fx-tasks', 'aria-label': 'Hvad arbejder du på?' });
    label.addEventListener('input', () => { T.label = label.value; keep(); });
    const dl = h('datalist', { id: 'fx-tasks' });
    getState('tasks').then(ts => { (ts?.tasks || []).filter(t => t.status === 'doing' || t.status === 'todo').slice(0, 30).forEach(t => dl.appendChild(h('option', { value: t.title }))); }).catch(() => {});
    const main = h('button', { class: 'btn app-solid fx-main' });
    main.addEventListener('click', () => (T.running ? stop() : start()));
    const resetB = h('button', { class: 'btn', onclick: reset }, icon('refresh'), 'Nulstil');
    const skipB = h('button', { class: 'btn btn-ghost', onclick: () => { T.endAt = Date.now(); if (!T.running) { T.running = true; } complete(); } }, icon('arrowRight'), 'Spring over');

    const hist = h('div', { class: 'list' });
    const week = h('div', { class: 'fx-week', 'aria-label': 'Fokusminutter de sidste 7 dage' });

    function frame() {
      const l = left(), tot = total(T.mode);
      time.textContent = fmt(l);
      ringFg.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0, Math.min(1, l / tot)))));
      if (view) document.title = `${T.running ? '▶ ' : ''}${fmt(l)} · ${MODES[T.mode]} · HUBTECH`;
    }
    function refresh() {
      ring.dataset.mode = T.mode;
      modeLbl.textContent = MODES[T.mode] + (T.mode === 'focus' ? ` · blok ${(T.cycle % settings().longEvery) + 1}/${settings().longEvery}` : '');
      modeSeg.setValue(T.mode);
      h(clear(main), null, icon(T.running ? 'pause' : 'play'), T.running ? 'Pause' : (T.remaining ? 'Fortsæt' : 'Start'));
      frame(); statsNow(); drawHistory();
    }
    function drawHistory() {
      clear(hist);
      const tk = dayKey(Date.now());
      const todays = st.sessions.filter(s => dayKey(s.at) === tk).reverse();
      if (!todays.length) hist.appendChild(h('p', { class: 'faint', style: { fontSize: 'var(--fs-sm)' } }, 'Ingen fokusblokke endnu i dag. Tryk Start for den første.'));
      todays.slice(0, 8).forEach(s => hist.appendChild(h('div', { class: 'row' },
        h('span', { class: 'row-icon solid' }, icon('timer')),
        h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, s.label || 'Fokusblok'), h('div', { class: 'row-sub' }, `${s.minutes} min · kl. ${new Date(s.at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`)))));
      clear(week);
      const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
      const mins = days.map(d => st.sessions.filter(s => dayKey(s.at) === dayKey(d)).reduce((a, s) => a + s.minutes, 0));
      const max = Math.max(25, ...mins);
      days.forEach((d, i) => week.appendChild(h('div', { class: ['fx-bar', i === 6 && 'is-today'], title: `${mins[i]} min` },
        h('span', { class: 'fx-bar-v' }, mins[i] ? String(mins[i]) : ''),
        h('i', { style: { height: `${Math.round(mins[i] / max * 100)}%` } }),
        h('span', { class: 'fx-bar-d' }, d.toLocaleDateString('da-DK', { weekday: 'short' }).replace('.', '')))));
    }

    // ── settings ──
    const num = (key, lbl, min, max) => {
      const inp = h('input', { class: 'input', type: 'number', min, max, value: settings()[key], 'aria-label': lbl, style: { width: '84px' } });
      inp.addEventListener('change', () => {
        const n = Math.max(min, Math.min(max, Math.round(Number(inp.value) || DEFAULTS[key])));
        inp.value = n; st.settings = { ...settings(), [key]: n }; saveState('focus', st);
        if (!T.running) { T.remaining = 0; keep(); } refresh();
      });
      return h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('b', null, lbl)), inp);
    };
    const sw = (key, lbl, hint) => h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('b', null, lbl), h('span', { class: 'faint' }, hint)),
      switchControl({ checked: settings()[key], label: lbl, onChange: (c) => { st.settings = { ...settings(), [key]: c }; saveState('focus', st); } }));

    view = { frame, refresh };
    const page = h('div', { class: 'page focus-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Arbejdsrum', title: 'Fokus', lead: 'Arbejd i blokke med pauser imellem. Timeren kører videre, mens du bruger resten af HUBTECH, og du får besked, når tiden er gået.',
        stats: [
          { icon: 'timer', label: 'I dag', value: v.today },
          { icon: 'calendar', label: 'Sidste 7 dage', value: v.week },
          { icon: 'flame', label: 'Stime', value: v.streak },
          { icon: 'trophy', label: 'Fokusblokke i alt', value: v.total }],
      }),
      h('div', { class: 'focus-layout' },
        h('section', { class: 'glass panel fx-panel' }, modeSeg, ring, h('div', { class: 'fx-label' }, icon('target'), label, dl), h('div', { class: 'fx-actions' }, resetB, main, skipB)),
        h('div', { class: 'stack' },
          h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('clock'), 'I dag')), hist),
          h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('dashboard'), 'Sidste 7 dage')), week),
          h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('settings'), 'Indstillinger')),
            num('focus', 'Fokus (min)', 1, 120), num('short', 'Kort pause (min)', 1, 60), num('long', 'Lang pause (min)', 1, 90), num('longEvery', 'Lang pause efter … blokke', 2, 12),
            sw('autoStart', 'Start næste automatisk', 'Pause og fokus skifter selv'), sw('sound', 'Lyd', 'En kort klokke, når tiden er gået')))));
    refresh();
    return page;
  },
};
