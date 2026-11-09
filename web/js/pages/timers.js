/**
 * Stopur og æggeur – a stopwatch with laps and as many named countdowns as you like, running at the same time.
 * Timers keep running if you leave the page (they remember when they end) and ring with a sound and a message.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, uid } from '../features/appkit.js';

const KEY = 'hubtech.timers';
const PRESETS = [['Blødkogt æg', 6.5 * 60], ['Hårdkogt æg', 9 * 60], ['Pasta', 10 * 60], ['Ris', 12 * 60], ['Te', 4 * 60], ['Pizza i ovnen', 12 * 60], ['Pause', 5 * 60], ['Lektier', 25 * 60]];
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { timers: [], sw: { start: null, acc: 0, laps: [] } }; } catch { return { timers: [], sw: { start: null, acc: 0, laps: [] } }; } };
export const fmt = (ms, tenths = false) => {
  const neg = ms < 0; ms = Math.abs(ms);
  const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${neg ? '−' : ''}${hh ? `${hh}:${String(mm).padStart(2, '0')}` : mm}:${String(ss).padStart(2, '0')}${tenths ? `,${Math.floor((ms % 1000) / 100)}` : ''}`;
};
function ring() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7, 1.4, 1.75, 2.1].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.28); o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.3); });
    setTimeout(() => ac.close(), 3000);
  } catch { /* no sound */ }
}

/** rings timers that end while you're on another page (started from main.js) */
export function watchTimers() {
  setInterval(() => {
    if (document.querySelector('.tm-page')) return;          // the page itself handles it
    let st; try { st = JSON.parse(localStorage.getItem(KEY)); } catch { return; }
    if (!st?.timers?.length) return;
    let changed = false;
    for (const t of st.timers) if (t.end && t.end <= Date.now() && !t.rang) {
      t.rang = true; changed = true; ring();
      toast(`⏰ ${t.name} er færdig!`, { type: 'info', ms: 10000, action: { label: 'Åbn', onClick: () => { location.hash = '#/apps/timers'; } } });
      try { if (document.hidden && Notification.permission === 'granted') new Notification(`${t.name} er færdig!`); } catch { /* */ }
    }
    if (changed) try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* */ }
  }, 1000);
}

export default {
  title: 'Stopur',
  destroy() { clearInterval(this._iv); },
  async render() {
    const app = appById('timers');
    const st = load();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* */ } };
    const swBox = h('div'), tBox = h('div', { class: 'tm-list' }), addBox = h('div');
    const swNow = () => st.sw.acc + (st.sw.start ? Date.now() - st.sw.start : 0);

    function drawSw() {
      const running = !!st.sw.start, laps = st.sw.laps;
      const best = laps.length > 1 ? Math.min(...laps.map(l => l.split)) : null, worst = laps.length > 1 ? Math.max(...laps.map(l => l.split)) : null;
      h(clear(swBox), null,
        h('div', { class: 'tm-sw' }, fmt(swNow(), true)),
        h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } },
          h('button', { class: ['btn btn-lg', running ? '' : 'btn-primary'], onclick: () => { if (running) { st.sw.acc = swNow(); st.sw.start = null; } else st.sw.start = Date.now(); save(); drawSw(); } }, icon(running ? 'pause' : 'play'), running ? 'Stop' : st.sw.acc ? 'Fortsæt' : 'Start'),
          running ? h('button', { class: 'btn btn-lg', onclick: () => { const total = swNow(), prev = laps[0]?.total || 0; laps.unshift({ total, split: total - prev }); save(); drawSw(); } }, icon('flag'), 'Omgang')
            : st.sw.acc ? h('button', { class: 'btn btn-lg', onclick: () => { st.sw = { start: null, acc: 0, laps: [] }; save(); drawSw(); } }, icon('refresh'), 'Nulstil') : null),
        laps.length ? h('ol', { class: 'tm-laps', reversed: true }, laps.map((l, i) => h('li', { class: [l.split === best && 'best', l.split === worst && 'worst'] }, h('span', null, `Omgang ${laps.length - i}`), h('b', null, fmt(l.split, true)), h('span', { class: 'faint' }, fmt(l.total, true))))) : null);
    }
    function timerRow(t) {
      const left = t.end ? t.end - Date.now() : t.left;
      const pct = Math.max(0, Math.min(100, (1 - left / (t.total * 1000)) * 100));
      const done = left <= 0;
      return h('div', { class: ['tm-timer', done && 'is-done', t.end && 'is-running'], dataset: { id: t.id } },
        h('div', { class: 'tm-ring', style: { '--p': pct } }, h('b', { class: 'tm-left' }, done ? '0:00' : fmt(left))),
        h('div', { class: 'tm-tb' }, h('b', null, t.name), h('span', { class: 'faint' }, done ? 'Færdig!' : t.end ? `Færdig kl. ${new Date(t.end).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}` : 'Sat på pause'),
          h('div', { class: 'row', style: { gap: '4px', marginTop: '6px' } },
            !done ? h('button', { class: 'btn btn-sm', onclick: () => { if (t.end) { t.left = t.end - Date.now(); t.end = null; } else { t.end = Date.now() + t.left; } save(); drawTimers(); } }, icon(t.end ? 'pause' : 'play'), t.end ? 'Pause' : 'Fortsæt') : null,
            h('button', { class: 'btn btn-sm', onclick: () => { t.total += 60; if (t.end) t.end = Math.max(Date.now(), t.end) + 60000; else t.left = Math.max(0, t.left) + 60000; t.rang = false; save(); drawTimers(); } }, '+1 min'),
            done ? h('button', { class: 'btn btn-sm', onclick: () => { t.end = Date.now() + t.total * 1000; t.rang = false; save(); drawTimers(); } }, icon('refresh'), 'Igen') : null,
            h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${t.name}`, onclick: () => { st.timers = st.timers.filter(x => x !== t); save(); drawTimers(); } }, icon('x')))));
    }
    function drawTimers() { h(clear(tBox), null, st.timers.length ? st.timers.map(timerRow) : h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen nedtællinger. Vælg en herunder – du kan have flere i gang på én gang.')); }
    const addTimer = (name, secs) => { st.timers.push({ id: uid(), name, total: secs, end: Date.now() + secs * 1000, left: secs * 1000, rang: false }); save(); drawTimers(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); };
    const nameIn = h('input', { class: 'input', maxlength: 30, placeholder: 'Navn (valgfrit)', 'aria-label': 'Navn på nedtælling' });
    const minIn = h('input', { class: 'input', type: 'number', min: 0, max: 600, value: 5, 'aria-label': 'Minutter', style: { width: '90px' } });
    const secIn = h('input', { class: 'input', type: 'number', min: 0, max: 59, value: 0, 'aria-label': 'Sekunder', style: { width: '80px' } });
    h(addBox, null, h('div', { class: 'wl-tags' }, PRESETS.map(([n, s]) => h('button', { class: 'sh-tag', onclick: () => addTimer(n, s) }, `${n} · ${fmt(s * 1000)}`))),
      h('div', { class: 'row', style: { gap: '6px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' } }, nameIn, minIn, h('span', { class: 'faint' }, 'min'), secIn, h('span', { class: 'faint' }, 'sek'),
        h('button', { class: 'btn btn-primary', onclick: () => { const s = Math.round((Number(minIn.value) || 0) * 60 + (Number(secIn.value) || 0)); if (s < 1) return toast('Vælg en tid', { type: 'warn' }); addTimer(nameIn.value.trim() || `Nedtælling ${st.timers.length + 1}`, s); nameIn.value = ''; } }, icon('plus'), 'Start')));
    drawSw(); drawTimers();
    clearInterval(this._iv);
    this._iv = setInterval(() => {
      if (!document.body.contains(swBox)) return clearInterval(this._iv);
      if (st.sw.start) { const el = swBox.querySelector('.tm-sw'); if (el) el.textContent = fmt(swNow(), true); }
      let redraw = false;
      for (const t of st.timers) {
        if (t.end && t.end - Date.now() <= 0 && !t.rang) { t.rang = true; redraw = true; ring(); toast(`⏰ ${t.name} er færdig!`, { type: 'info', ms: 10000 }); try { if (document.hidden && Notification.permission === 'granted') new Notification(`${t.name} er færdig!`); } catch { /* */ } save(); }
        const row = tBox.querySelector(`[data-id="${t.id}"]`);
        if (row && t.end) { const left = t.end - Date.now(); row.querySelector('.tm-left').textContent = left <= 0 ? '0:00' : fmt(left); row.querySelector('.tm-ring').style.setProperty('--p', Math.max(0, Math.min(100, (1 - left / (t.total * 1000)) * 100))); }
      }
      if (redraw) drawTimers();
    }, 100);
    return h('div', { class: 'page tm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Værktøj', title: 'Stopur og æggeur', lead: 'Stopur med omgange og så mange nedtællinger, du vil – på én gang. De ringer, også selvom du går til en anden side.', compact: true }),
      h('div', { class: 'ev-wrap' }, panel('Stopur', 'clock', swBox), h('div', { class: 'stack' }, panel('Nedtællinger', 'bell', tBox), panel('Ny nedtælling', 'plus', addBox))));
  },
};
