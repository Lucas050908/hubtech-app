/**
 * Spillecontroller: brug HUBTECH og spillene med en controller (Xbox, PlayStation og lignende).
 *  - D-pad / venstre pind: flyt rundt (i et spil: piletasterne)
 *  - A / ×: vælg (i et spil: mellemrum)        - B / ○: tilbage (Escape)
 *  - Y / △: søg (Ctrl+K)                        - X / □: Gnist (Ctrl+J)
 *  - LB / RB: forrige / næste app i docken        - Start: fuld skærm
 * Only listens once a controller is plugged in; nothing runs before that.
 */
const PRESS = 0.5, STICK = 0.55, REPEAT_FIRST = 380, REPEAT = 110;
let raf = 0, last = {}, held = {}, toastShown = false;

const keyName = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: ' ', b: 'Escape' };
const codeName = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'Space', b: 'Escape' };

/** Which buttons are down (pure – the standard mapping). */
export function readPad(p) {
  const b = (i) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > PRESS);
  const ax = p.axes || [];
  return {
    a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), start: b(9),
    up: b(12) || ax[1] < -STICK, down: b(13) || ax[1] > STICK, left: b(14) || ax[0] < -STICK, right: b(15) || ax[0] > STICK,
  };
}

function fire(type, key, code, target = document.activeElement || document.body, extra = {}) {
  const ev = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
}

const focusables = () => [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; });

/** Move focus to the nearest element in a direction (pure geometry – tested). */
export function nearest(from, list, dir) {
  const c = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const o = c(from);
  let best = null, bestD = Infinity;
  for (const el of list) {
    const p = c(el.rect);
    const dx = p.x - o.x, dy = p.y - o.y;
    const ok = dir === 'up' ? dy < -4 : dir === 'down' ? dy > 4 : dir === 'left' ? dx < -4 : dx > 4;
    if (!ok) continue;
    const main = dir === 'up' || dir === 'down' ? Math.abs(dy) : Math.abs(dx);
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const d = main + side * 2.2;
    if (d < bestD) { bestD = d; best = el; }
  }
  return best;
}

function move(dir) {
  const cur = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const list = focusables();
  if (!list.length) return;
  if (!cur) { list[0].focus(); return; }
  const next = nearest(cur.getBoundingClientRect(), list.filter(el => el !== cur).map(el => ({ el, rect: el.getBoundingClientRect() })), dir);
  if (next) { next.el.focus(); next.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  else window.scrollBy({ top: dir === 'down' ? 240 : dir === 'up' ? -240 : 0, behavior: 'smooth' });
}

function dockStep(n) {
  const items = [...document.querySelectorAll('.dock .dock-item')];
  if (!items.length) return;
  const i = Math.max(0, items.findIndex(a => a.getAttribute('aria-current') === 'page'));
  items[(i + n + items.length) % items.length].click();
}

function down(name) {
  const el = document.activeElement;
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  if (keyName[name]) {
    // the page (a game) gets the key first; if it doesn't use it, the controller moves around HUBTECH
    const used = fire('keydown', keyName[name], codeName[name]);
    if (used) return;
    if (name === 'a') { if (el && el !== document.body && !typing) el.click(); return; }
    if (name === 'b') { if (!document.querySelector('.modal')) history.back(); return; }
    if (!typing) move(name);
    return;
  }
  if (name === 'y') fire('keydown', 'k', 'KeyK', document.body, { ctrlKey: true });
  if (name === 'x') fire('keydown', 'j', 'KeyJ', document.body, { ctrlKey: true });
  if (name === 'lb') dockStep(-1);
  if (name === 'rb') dockStep(1);
  if (name === 'start') import('../core/desktop.js').then(m => m.toggleFullscreen?.()).catch(() => {});
}
function up(name) { if (keyName[name]) fire('keyup', keyName[name], codeName[name]); }

function loop(t) {
  raf = 0;
  const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  if (!pads.length) return;
  const now = pads.map(readPad).reduce((a, p) => { for (const k in p) a[k] = a[k] || p[k]; return a; }, {});
  for (const k in now) {
    if (now[k] && !last[k]) { held[k] = t + REPEAT_FIRST; down(k); }
    else if (now[k] && ['up', 'down', 'left', 'right'].includes(k) && t >= held[k]) { held[k] = t + REPEAT; down(k); }
    else if (!now[k] && last[k]) up(k);
  }
  last = now;
  document.documentElement.classList.add('pad-on');
  raf = requestAnimationFrame(loop);
}

export function initGamepad() {
  if (!('getGamepads' in navigator)) return;
  addEventListener('gamepadconnected', (e) => {
    if (!toastShown) {
      toastShown = true;
      import('../core/ui.js').then(m => m.toast('Controller tilsluttet', { type: 'ok', text: 'Pind/D-pad flytter, A vælger, B går tilbage, LB/RB skifter app, Y søger, X åbner Gnist.' }));
    }
    if (!raf) raf = requestAnimationFrame(loop);
  });
  addEventListener('gamepaddisconnected', () => { if (![...(navigator.getGamepads?.() || [])].some(Boolean)) { document.documentElement.classList.remove('pad-on'); last = {}; } });
}
