/**
 * Arbejdstilstand – easier on the eyes: warmer light (less blue, three strengths), softer contrast (no glaring white
 * on pitch black, paper instead of white in the light theme), fewer distractions (widgets, animations and sounds
 * off), and it can switch itself on in the evening. Saved with your profile (prefs.work), so it follows you.
 * The pure parts are tested in tests/apps.test.mjs.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store, setPref } from '../core/store.js';

export const WORK_DEFAULTS = { on: false, warm: 2, soft: true, calm: true, auto: false, from: '20:00', to: '07:00' };
export const WARMTH = [['0', 'Fra'], ['1', 'Let'], ['2', 'Mellem'], ['3', 'Kraftig']];
const TINT = [0, 0.07, 0.12, 0.18];
const TIME = /^\d\d:\d\d$/;

export function workPrefs(prefs = store.get('prefs')) {
  const w = { ...WORK_DEFAULTS, ...(prefs?.work && typeof prefs.work === 'object' ? prefs.work : {}) };
  w.warm = Math.max(0, Math.min(3, Math.round(Number(w.warm) || 0)));
  if (!TIME.test(w.from)) w.from = WORK_DEFAULTS.from;
  if (!TIME.test(w.to)) w.to = WORK_DEFAULTS.to;
  return w;
}
const mins = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
/** Is it on right now – switched on, or the evening hours when it comes on by itself? */
export function workActive(w, now = new Date()) {
  if (w.on) return true;
  if (!w.auto) return false;
  const m = now.getHours() * 60 + now.getMinutes(), a = mins(w.from), b = mins(w.to);
  return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b;
}

let tint = null, timer = 0, started = false;
const listeners = new Set();
export function onWork(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Puts the look on the page (called when prefs change and every minute, for the evening hours). */
export function applyWork() {
  const w = workPrefs(), on = workActive(w), root = document.documentElement;
  root.classList.toggle('work-on', on);
  root.classList.toggle('work-soft', on && w.soft);
  root.classList.toggle('work-calm', on && w.calm);
  if (!tint) { tint = h('div', { class: 'work-tint', 'aria-hidden': 'true' }); document.body.append(tint); }
  tint.style.opacity = on ? String(TINT[w.warm]) : '0';
  if (on && w.calm) import('./piano.js').then(m => { if (m.isPlaying?.()) m.stop?.({ remember: false }); }).catch(() => {});
  listeners.forEach(fn => { try { fn(on, w); } catch { /* */ } });
}

export function initWork() {
  if (started) return; started = true;
  store.on('prefs', applyWork);
  clearInterval(timer); timer = setInterval(applyWork, 60_000);
  applyWork();
}

const save = (patch) => setPref('work', { ...workPrefs(), ...patch });

/** The button in the top bar: a click opens the little panel with the switch and the choices. */
export function workButton() {
  const btn = h('button', { type: 'button', class: 'tb-work', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Arbejdstilstand – lettere for øjnene', onclick: () => openWork(btn) });
  const draw = (on = workActive(workPrefs())) => {
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-label', on ? 'Arbejdstilstand er slået til – indstillinger' : 'Arbejdstilstand – lettere for øjnene');
    h(clear(btn), null, icon('eye'), h('span', { class: 'tb-work-l' }, on ? 'Arbejde' : ''));
  };
  draw();
  onWork((on) => draw(on));
  return btn;
}

let pop = null;
function openWork(btn) {
  if (pop) { pop.close(); return; }
  const box = h('div', { class: 'tb-pop tb-work-pop', role: 'dialog', 'aria-label': 'Arbejdstilstand' });
  const sw = (label, sub, key, val) => {
    const id = `wk-${key}`;
    return h('label', { class: 'tb-sw', for: id }, h('span', null, h('b', null, label), sub ? h('small', { class: 'faint' }, sub) : null),
      h('input', { type: 'checkbox', role: 'switch', id, class: 'tb-switch', checked: !!val, onchange: (e) => save({ [key]: e.target.checked }) }));
  };
  const draw = () => {
    const w = workPrefs(), on = workActive(w);
    const warm = h('div', { class: 'tb-seg', role: 'radiogroup', 'aria-label': 'Varmere lys' }, WARMTH.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(String(w.warm) === v), class: String(w.warm) === v ? 'is-on' : '', onclick: () => save({ warm: Number(v) }) }, l)));
    const t = (key) => h('input', { type: 'time', class: 'input tb-time', value: w[key], 'aria-label': key === 'from' ? 'Fra klokken' : 'Til klokken', onchange: (e) => { if (TIME.test(e.target.value)) save({ [key]: e.target.value }); } });
    const keep = document.activeElement && box.contains(document.activeElement) ? (document.activeElement.id || document.activeElement.getAttribute('aria-label') || document.activeElement.textContent) : null;
    h(clear(box), null,
      h('div', { class: 'tb-pop-h' }, h('span', { class: 'tb-pop-ic' }, icon('eye')), h('div', null, h('b', null, 'Arbejdstilstand'), h('small', { class: 'faint' }, on && !w.on ? 'Slået til af sig selv lige nu' : 'Lettere for øjnene, når du arbejder længe'))),
      h('button', { type: 'button', class: ['btn', on ? 'btn-ghost' : 'btn-primary', 'tb-work-go'], onclick: () => save({ on: !on }) }, icon(on ? 'x' : 'eye'), on ? 'Slå fra' : 'Slå til'),
      h('div', { class: 'tb-pop-sec' }, h('span', { class: 'tb-pop-l' }, 'Varmere lys'), h('small', { class: 'faint tb-pop-sub' }, 'Mindre blåt lys over hele skærmen'), warm),
      sw('Blødere kontrast', 'Ikke skarp hvid på kulsort – papir i stedet for hvidt', 'soft', w.soft),
      sw('Færre forstyrrelser', 'Widgets, animationer og lyde slukkes', 'calm', w.calm),
      sw('Automatisk om aftenen', null, 'auto', w.auto),
      w.auto ? h('div', { class: 'tb-auto' }, h('span', { class: 'faint' }, 'Fra'), t('from'), h('span', { class: 'faint' }, 'til'), t('to')) : null);
    if (keep) [...box.querySelectorAll('button, input')].find(e => (e.id || e.getAttribute('aria-label') || e.textContent) === keep)?.focus();
  };
  const off = onWork(() => draw());
  const offP = store.on('prefs', () => draw());
  let done = false;
  const close = ({ refocus = true } = {}) => {
    if (done) return; done = true; pop = null; off(); offP();
    removeEventListener('pointerdown', outside, true); removeEventListener('keydown', key, true); removeEventListener('hashchange', hc);
    btn.setAttribute('aria-expanded', 'false'); box.remove();
    if (refocus && btn.isConnected) btn.focus();
  };
  const outside = (e) => { if (!box.contains(e.target) && !btn.contains(e.target)) close({ refocus: false }); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const hc = () => close({ refocus: false });
  draw();
  btn.after(box);
  btn.setAttribute('aria-expanded', 'true');
  addEventListener('pointerdown', outside, true); addEventListener('keydown', key, true); addEventListener('hashchange', hc);
  pop = { close };
  box.querySelector('.tb-work-go')?.focus();
}
