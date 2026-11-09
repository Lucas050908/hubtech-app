/**
 * Fællesskab: listen to music together. Everyone in the channel hears the same track at the same position.
 * The server keeps the queue and when the current track started (server time); each listener plays the uploaded
 * file locally and corrects drift every few seconds. Browsers need one click ("Lyt med") before sound may play.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast } from '../core/ui.js';
import { serverNow, noteServerTime } from '../core/live.js';
import { uploadFile } from './chat.js';

const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const VOL_KEY = 'hubtech.cm.volume';

function duration(file) {
  return new Promise((resolve) => {
    const a = new Audio(); const url = URL.createObjectURL(file);
    const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
    a.preload = 'metadata'; a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0); a.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    a.src = url;
  });
}

export function musicView(cm, { channelId, canControl, canModerate }) {
  let state = { queue: [], current: null }, listening = false, endedFor = null, busy = false;
  const audio = new Audio();
  audio.preload = 'auto';
  let vol = 0.8;
  try { vol = Math.min(1, Math.max(0, Number(localStorage.getItem(VOL_KEY) ?? 0.8))); } catch { /* */ }
  audio.volume = vol;

  const pos = () => { const c = state.current; if (!c) return 0; return c.paused ? c.pausedAt : (serverNow() - c.startedAt) / 1000; };
  const act = async (action, extra = {}) => {
    if (busy) return; busy = true;
    try { apply(await api.post(`/api/cm/channels/${channelId}/music`, { action, ...extra })); }
    catch (e) { toast('Musikken kunne ikke styres', { type: 'bad', text: e.message }); }
    finally { busy = false; }
  };

  const fileIn = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true });
  fileIn.addEventListener('change', async () => {
    const files = [...fileIn.files]; fileIn.value = '';
    for (const f of files) {
      const t = toast(`Uploader ${f.name} …`, { icon: 'upload', ms: 120000 });
      try {
        const [d, up] = await Promise.all([duration(f), uploadFile(f)]);
        if (up.kind !== 'audio') throw new Error('Filen er ikke en lydfil.');
        await act('add', { fileId: up.id, title: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim(), duration: d });
      } catch (e) { toast('Nummeret kunne ikke tilføjes', { type: 'bad', text: e.message }); }
      finally { t(); }
    }
  });

  const title = h('div', { class: 'mu-title' });
  const by = h('div', { class: 'mu-by faint' });
  const bar = h('input', { type: 'range', class: 'mu-bar', min: 0, max: 100, step: 0.1, value: 0, 'aria-label': 'Position i nummeret' });
  const tNow = h('span', { class: 'mu-t' }, '0:00'), tLen = h('span', { class: 'mu-t' }, '0:00');
  const playBtn = h('button', { class: 'mu-play', 'aria-label': 'Afspil' }, icon('play'));
  const skipBtn = h('button', { class: 'icon-btn', 'aria-label': 'Næste nummer', title: 'Spring over', onclick: () => act('skip') }, icon('skip'));
  const stopBtn = h('button', { class: 'icon-btn', 'aria-label': 'Stop og tøm køen', title: 'Stop og tøm køen', onclick: () => act('stop') }, icon('x'));
  const listenBtn = h('button', { class: 'btn btn-primary mu-listen' }, icon('volume'), 'Lyt med');
  const volIn = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: vol, class: 'mu-vol', 'aria-label': 'Lydstyrke' });
  const queueEl = h('ol', { class: 'mu-queue', 'aria-label': 'Kø' });
  const disc = h('div', { class: 'mu-disc', 'aria-hidden': 'true' }, icon('music'));
  const eventEl = h('div', { class: 'mu-event faint', 'aria-live': 'polite' });
  let seeking = false;
  bar.addEventListener('input', () => { seeking = true; const len = state.current?.item.duration || 0; tNow.textContent = fmt(len * bar.value / 100); });
  bar.addEventListener('change', () => { seeking = false; const len = state.current?.item.duration || 0; if (len && canControl()) act('seek', { position: len * bar.value / 100 }); });
  volIn.addEventListener('input', () => { audio.volume = Number(volIn.value); audio.muted = false; try { localStorage.setItem(VOL_KEY, volIn.value); } catch { /* */ } });
  playBtn.addEventListener('click', () => { if (!state.current) return; act(state.current.paused ? 'resume' : 'pause'); });
  listenBtn.addEventListener('click', () => { listening = !listening; sync(true); drawControls(); });
  audio.addEventListener('ended', () => { const c = state.current; if (c && endedFor !== c.item.id) { endedFor = c.item.id; act('ended', { itemId: c.item.id }); } });
  audio.addEventListener('loadedmetadata', () => { if (state.current && !state.current.item.duration) tLen.textContent = fmt(audio.duration); });

  function sync(force) {
    const c = state.current;
    if (!c || !listening) { audio.pause(); return; }
    if (!audio.src.endsWith(c.item.url)) { audio.src = c.item.url; force = true; }
    const p = pos();
    const len = c.item.duration || audio.duration || 0;
    if (len && p > len + 1) { if (endedFor !== c.item.id) { endedFor = c.item.id; act('ended', { itemId: c.item.id }); } return; }
    if (force || Math.abs(audio.currentTime - p) > 1.5) { try { audio.currentTime = Math.max(0, p); } catch { /* not seekable yet */ } }
    if (c.paused) audio.pause();
    else audio.play().catch(() => { listening = false; drawControls(); toast('Tryk på “Lyt med” for at høre musikken', { icon: 'volume' }); });
  }
  function drawControls() {
    const c = state.current;
    playBtn.disabled = !c || !canControl(); skipBtn.disabled = !c || !canControl();
    stopBtn.hidden = !canModerate() && !(c && c.item.by.id === cm.me.user.id);
    stopBtn.disabled = !c;
    bar.disabled = !c || !canControl() || !c.item.duration;
    h(clear(playBtn), null, icon(c && !c.paused ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', c && !c.paused ? 'Pause for alle' : 'Afspil for alle');
    h(clear(listenBtn), null, icon(listening ? 'mute' : 'volume'), listening ? 'Lyt ikke med' : 'Lyt med');
    listenBtn.classList.toggle('btn-primary', !listening);
    disc.classList.toggle('is-spinning', !!(c && !c.paused && listening));
  }
  function drawQueue() {
    const c = state.current;
    title.textContent = c ? c.item.title : 'Der spiller ikke noget';
    by.textContent = c ? `Lagt i køen af ${c.item.by.name}${c.paused ? ' · på pause' : ''}` : 'Upload en lydfil for at starte musikken – alle i kanalen hører den samtidig.';
    tLen.textContent = fmt(c?.item.duration);
    h(clear(queueEl), null, state.queue.length ? state.queue.map((q, i) => h('li', { class: 'mu-q' },
      h('span', { class: 'mu-qn' }, String(i + 1)), h('span', { class: 'mu-qt' }, h('b', null, q.title), h('span', { class: 'faint' }, `${q.by.name}${q.duration ? ' · ' + fmt(q.duration) : ''}`)),
      i > 0 && canControl() ? h('button', { class: 'icon-btn mu-up', 'aria-label': `Flyt ${q.title} op`, title: 'Flyt op', onclick: () => act('move', { itemId: q.id, to: i - 1 }) }, icon('chevronDown')) : null,
      q.by.id === cm.me.user.id || canModerate() ? h('button', { class: 'icon-btn', 'aria-label': `Fjern ${q.title}`, title: 'Fjern fra køen', onclick: () => act('remove', { itemId: q.id }) }, icon('trash')) : null))
      : h('li', { class: 'mu-empty faint' }, 'Køen er tom.'));
    drawControls();
  }
  function apply(s, ev) {
    if (!s) return;
    if (s.now) noteServerTime(s.now);
    const changed = s.current?.item.id !== state.current?.item.id;
    state = { queue: s.queue || [], current: s.current || null };
    if (changed) endedFor = null;
    drawQueue();
    sync(changed);
    if (ev?.text) { eventEl.textContent = `${ev.user} ${ev.text}`; }
  }
  const tick = setInterval(() => {
    const c = state.current;
    if (!c) { bar.value = 0; tNow.textContent = '0:00'; return; }
    const len = c.item.duration || audio.duration || 0, p = Math.min(pos(), len || pos());
    if (!seeking) { bar.value = len ? (p / len) * 100 : 0; tNow.textContent = fmt(p); }
    if (listening && !c.paused) sync(false);
    else if (!listening && !c.paused && len && p > len + 3 && endedFor !== c.item.id) { endedFor = c.item.id; act('ended', { itemId: c.item.id }); }
  }, 1000);

  api.get(`/api/cm/channels/${channelId}/music`).then(s => apply(s)).catch(e => { title.textContent = e.message; });

  const el = h('section', { class: 'mu glass-soft', 'aria-label': 'Musik sammen' },
    h('div', { class: 'mu-now' }, disc,
      h('div', { class: 'mu-info' }, h('div', { class: 'eyebrow' }, icon('music'), ' Spiller nu'), title, by,
        h('div', { class: 'mu-prog' }, tNow, bar, tLen),
        h('div', { class: 'mu-ctl' }, playBtn, skipBtn, stopBtn, listenBtn, h('label', { class: 'mu-vol-w', title: 'Lydstyrke' }, icon('volume'), volIn)),
        eventEl)),
    h('div', { class: 'mu-side' },
      h('div', { class: 'mu-qh' }, h('b', null, 'Kø'), h('button', { class: 'btn btn-sm', onclick: () => canControl() ? fileIn.click() : toast('Accepter serverens regler først', { type: 'warn' }) }, icon('upload'), 'Tilføj lydfil'), fileIn),
      queueEl,
      h('p', { class: 'faint mu-note' }, 'Del kun musik, du selv har rettighederne til. Filerne gemmes på denne HUBTECH-server.')));
  drawQueue();
  return {
    el,
    onLive(ev) { if (ev.type === 'music' && ev.channel === channelId) apply(ev.state, ev.event); if (ev.type === 'reset') api.get(`/api/cm/channels/${channelId}/music`).then(s => apply(s)).catch(() => {}); },
    destroy() { clearInterval(tick); audio.pause(); audio.removeAttribute('src'); audio.load(); },
  };
}
