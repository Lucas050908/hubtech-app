/**
 * Voice and video calls (WebRTC) – private calls between friends and voice channels in servers.
 * The HUBTECH server only relays the connection messages (server/calls.py); sound and picture go directly
 * between the devices. Uses the "perfect negotiation" pattern, so either side may add a camera or a screen later.
 */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { store } from '../core/store.js';
import { getCall, mediaConstraints, applySpeaker } from './appsettings.js';

let active = null;      // the current Call
let ringing = null;     // incoming ring UI
let started = false;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const me = () => store.get('user')?.id;

// ── ringtone (generated – no sound files) ──
let tone = null;
function playTone(kind) {
  stopTone();
  const cfg = getCall();
  if (kind === 'in' && !cfg.ring) { try { navigator.vibrate?.([300, 200, 300]); } catch { /* */ } return; }
  const vol = 0.2 * (cfg.ringVolume ?? 0.6);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      const t = ctx.currentTime;
      [0, 0.22].forEach((d, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = kind === 'out' ? 440 : i ? 660 : 880;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
        o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.2);
      });
      try { if (kind === 'in') navigator.vibrate?.([300, 200, 300]); } catch { /* */ }
    };
    beep();
    tone = { ctx, timer: setInterval(beep, kind === 'out' ? 3000 : 1600) };
  } catch { /* no audio */ }
}
function stopTone() { if (tone) { clearInterval(tone.timer); tone.ctx.close().catch(() => {}); tone = null; } try { navigator.vibrate?.(0); } catch { /* */ } }

export function supported() { return !!(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia); }

async function getMedia(video) {
  let s;
  try { s = await navigator.mediaDevices.getUserMedia(mediaConstraints({ video })); }
  catch (e) {
    if (video) { try { s = await navigator.mediaDevices.getUserMedia(mediaConstraints({ video: false })); toast('Kameraet kunne ikke bruges', { type: 'warn', text: 'Opkaldet fortsætter med lyd.' }); return s; } catch { /* */ } }
    throw new Error(e.name === 'NotAllowedError' ? 'Mikrofonen er ikke tilladt. Tillad den i browseren eller telefonens indstillinger.' : 'Der blev ikke fundet nogen mikrofon.');
  }
  // "start video calls with the camera off" (Indstillinger → Apps → Opkald)
  if (video && getCall().camOff) s.getVideoTracks().forEach(t => { t.enabled = false; });
  return s;
}

// used until the server's list arrives (e.g. a signal that comes before our own join answer)
const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
/** 'direct' (same network or a direct route found by STUN) or 'relay' (through a TURN server). */
async function routeOf(pc) {
  try {
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
    if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
    const local = pair && stats.get(pair.localCandidateId);
    return local?.candidateType === 'relay' ? 'relay' : 'direct';
  } catch { return 'direct'; }
}

// per-person volume in calls, remembered on this device
const VOL_KEY = 'hubtech.callvol';
function volumeFor(uid) { try { const v = JSON.parse(localStorage.getItem(VOL_KEY) || '{}')[uid]; return typeof v === 'number' ? v : 1; } catch { return 1; } }
function saveVolume(uid, v) { try { const all = JSON.parse(localStorage.getItem(VOL_KEY) || '{}'); all[uid] = v; localStorage.setItem(VOL_KEY, JSON.stringify(all)); } catch { /* */ } }

class Call {
  constructor({ id, kind, title, video, ice }) {
    Object.assign(this, { id, kind, title, video, ice, peers: new Map(), local: null, startedAt: 0, ended: false, mic: true, cam: false, screen: null, facing: 'user', mix: null, music: null, queue: [], nowPlaying: null });
    this.build();
  }

  // ── connections ──
  peer(uid, card) {
    let p = this.peers.get(uid);
    if (p) { if (card) p.card = card; return p; }
    const pc = new RTCPeerConnection({ iceServers: this.ice?.length ? this.ice : FALLBACK_ICE });
    p = { pc, card: card || { id: uid, name: 'Deltager', avatar: '👤' }, polite: me() > uid, makingOffer: false, ignoreOffer: false, stream: new MediaStream(), tile: null, volume: volumeFor(uid) };
    this.peers.set(uid, p);
    for (const t of this.sendTracks()) pc.addTrack(t, this.local);
    pc.onnegotiationneeded = async () => {
      try { p.makingOffer = true; await pc.setLocalDescription(); this.signal(uid, { description: pc.localDescription.toJSON() }); }
      catch (e) { console.warn('negotiation', e); } finally { p.makingOffer = false; }
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.signal(uid, { candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track); e.track.onunmute = () => this.drawTiles(); e.track.onended = () => this.drawTiles(); this.drawTiles(); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') { if (!this.startedAt) { this.startedAt = Date.now(); stopTone(); } if (p.lost) toast(`Forbindelsen til ${p.card.name} er tilbage`, { type: 'ok', ms: 2500 }); p.lost = false; clearTimeout(p.retry); clearTimeout(p.slow); routeOf(pc).then((r) => { p.route = r; this.drawTiles(); }); }
      // a short drop (wifi → mobile data, a tunnel …): wait a moment, then ask for a new route
      if (st === 'disconnected') { p.lost = true; clearTimeout(p.retry); p.retry = setTimeout(() => { if (pc.connectionState !== 'connected') { try { pc.restartIce(); } catch { /* */ } } }, 4000); }
      if (st === 'failed') {
        p.lost = true;
        try { pc.restartIce(); } catch { /* */ }
        this.warnRoute(p);
      }
      this.drawStatus(); this.drawTiles();
    };
    // two different networks that never find each other: say why instead of "Forbinder …" forever
    p.slow = setTimeout(() => { if (!this.ended && pc.connectionState !== 'connected' && this.peers.get(uid) === p) this.warnRoute(p); }, 20000);
    this.drawTiles();
    return p;
  }

  warnRoute(p) {
    if (p.warned) return;
    p.warned = true;
    const relay = (this.ice || []).some(s => [].concat(s.urls || []).some(u => /^turns?:/.test(u)));
    toast(`Kan ikke få forbindelse til ${p.card.name}`, { type: 'warn', ms: 14000,
      text: relay ? 'Prøver igen … Tjek internetforbindelsen hos jer begge. Hjælper det ikke, så tjek TURN-serveren under Indstillinger → Apps og opkald.'
        : 'I er sikkert på to netværk, der blokerer direkte forbindelser (fx mobilnet, skole- eller arbejds-wifi). Ejeren af HUBTECH kan tilføje en TURN-server under Indstillinger → Apps og opkald – så virker opkald mellem alle netværk.' });
  }

  async onSignal(from, data) {
    const p = this.peer(from);
    const pc = p.pc;
    try {
      if (data.description) {
        const d = data.description;
        const collision = d.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(d);
        if (d.type === 'offer') { await pc.setLocalDescription(); this.signal(from, { description: pc.localDescription.toJSON() }); }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!p.ignoreOffer) console.warn('ice', e); }
      }
    } catch (e) { console.warn('signal', e); }
  }

  /** What goes out to the others: the microphone (or the microphone mixed with music) and the camera/screen. */
  sendTracks() {
    const audio = this.mix ? [this.mix.track] : this.local?.getAudioTracks() || [];
    const video = this.screen ? this.screen.getVideoTracks() : this.local?.getVideoTracks() || [];
    return [...audio, ...video];
  }

  // ── music: played here and mixed into the sound everyone in the call hears ──
  ensureMix() {
    if (this.mix) return this.mix;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const mic = this.local.getAudioTracks()[0];
    const micGain = ctx.createGain();
    if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(micGain);
    micGain.connect(dest);
    const musicGain = ctx.createGain(); musicGain.gain.value = 0.55; musicGain.connect(dest);
    const monitor = ctx.createGain(); monitor.gain.value = 0.7; musicGain.connect(monitor); monitor.connect(ctx.destination);
    const track = dest.stream.getAudioTracks()[0];
    for (const p of this.peers.values()) {
      const sender = p.pc.getSenders().find(x => x.track && x.track.kind === 'audio');
      if (sender) sender.replaceTrack(track); else p.pc.addTrack(track, this.local);
    }
    this.mix = { ctx, dest, micGain, musicGain, monitor, track };
    return this.mix;
  }

  addMusic(files) {
    for (const f of files) if (f.type.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|flac|aac|webm)$/i.test(f.name)) this.queue.push({ file: f, title: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ') });
    if (!this.music) this.nextTrack();
    this.drawMusic();
  }

  nextTrack() {
    const m = this.ensureMix();
    if (this.music) { this.music.el.pause(); this.music.piano?.stop(); if (this.music.el.src) URL.revokeObjectURL(this.music.el.src); this.music = null; }
    const item = this.queue.shift();
    if (!item) { this.nowPlaying = null; api.post(`/api/cm/calls/${this.id}/info`, { music: null }).catch(() => {}); this.drawMusic(); this.drawStatus(); return; }
    const el = new Audio(URL.createObjectURL(item.file));
    const src = m.ctx.createMediaElementSource(el);
    src.connect(m.musicGain);
    el.onended = () => this.nextTrack();
    m.ctx.resume?.();
    el.play().catch(() => toast('Musikken kunne ikke afspilles', { type: 'bad' }));
    this.music = { el, src, title: item.title };
    this.nowPlaying = { title: item.title, by: 'dig' };
    api.post(`/api/cm/calls/${this.id}/info`, { music: item.title.slice(0, 150) }).catch(() => {});
    this.drawMusic(); this.drawStatus();
  }

  async playPiano() {
    const m = this.ensureMix();
    if (this.music) { this.music.el?.pause(); this.music.piano?.stop(); this.music = null; }
    this.queue = [];
    const { output } = await import('./piano.js');
    const p = output(m.ctx);
    p.node.connect(m.musicGain);
    m.ctx.resume?.();
    const self = this;
    this.music = { piano: p, title: 'Klavermusik af HUBTECH', paused: false, el: { get paused() { return self.music?.paused; }, pause() { p.node.gain.value = 0; self.music.paused = true; }, play() { p.node.gain.value = 1; self.music.paused = false; return Promise.resolve(); } } };
    this.nowPlaying = { title: this.music.title, by: 'dig' };
    api.post(`/api/cm/calls/${this.id}/info`, { music: this.music.title }).catch(() => {});
    this.drawMusic(); this.drawStatus();
  }

  pauseMusic() { if (!this.music) return; this.music.el.paused ? this.music.el.play() : this.music.el.pause(); this.drawMusic(); }

  stopMusic() { this.queue = []; this.nextTrack(); }

  musicPanel() {
    const fileIn = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true, onchange: (e) => { this.addMusic([...e.target.files]); e.target.value = ''; } });
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: this.mix ? this.mix.musicGain.gain.value : 0.55, 'aria-label': 'Musikkens lydstyrke for alle',
      oninput: (e) => { this.ensureMix().musicGain.gain.value = Number(e.target.value); } });
    this.musicEl = h('div', { class: 'call-music', hidden: true },
      h('div', { class: 'call-music-h' }, icon('music'), h('b', null, 'Musik til alle i opkaldet'), h('button', { class: 'icon-btn', 'aria-label': 'Luk', onclick: () => { this.musicEl.hidden = true; } }, icon('x'))),
      this.musicNow = h('div', { class: 'call-music-now' }),
      h('div', { class: 'call-music-b' },
        h('button', { class: 'btn btn-sm', onclick: () => fileIn.click() }, icon('upload'), 'Vælg lydfiler'),
        h('button', { class: 'btn btn-sm', onclick: () => this.playPiano() }, icon('music'), 'Klaver (uden ophavsret)'),
        this.musicPause = h('button', { class: 'btn btn-sm', onclick: () => this.pauseMusic() }, icon('pause'), 'Pause'),
        h('button', { class: 'btn btn-sm', onclick: () => this.nextTrack() }, icon('skip'), 'Næste'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => this.stopMusic() }, icon('x'), 'Stop')),
      h('label', { class: 'call-music-vol' }, icon('volume'), vol),
      this.musicQueue = h('ol', { class: 'call-music-q' }),
      h('p', { class: 'call-music-note' }, 'Musikken spilles fra din enhed og blandes med din mikrofon, så alle hører den. Del kun musik, du må dele.'), fileIn);
    return this.musicEl;
  }

  drawMusic() {
    if (!this.musicEl) return;
    const playing = this.music && !this.music.el.paused;
    this.musicNow.textContent = this.music ? `${playing ? '▶' : '⏸'} ${this.music.title}` : 'Der spiller ikke noget. Vælg lydfiler fra din enhed.';
    h(clear(this.musicPause), null, icon(playing ? 'pause' : 'play'), playing ? 'Pause' : 'Spil');
    this.musicPause.disabled = !this.music;
    h(clear(this.musicQueue), null, this.queue.map(q => h('li', null, q.title)));
    this.drawControls();
  }

  async invite() {
    let friends = [];
    try { friends = (await api.get('/api/cm/friends')).friends; } catch (e) { toast('Kunne ikke hente venner', { type: 'bad', text: e.message }); return; }
    const here = new Set([...this.peers.keys(), me()]);
    const pick = await pickFriends(friends.filter(f => !here.has(f.id)), 'Invitér til opkaldet', 'Ring op');
    if (!pick?.length) return;
    try { const r = await api.post(`/api/cm/calls/${this.id}/invite`, { to: pick.map(f => f.id) }); this.kind = 'group'; toast(`Ringer til ${r.invited} mere`, { icon: 'phone' }); this.drawControls(); }
    catch (e) { toast('Kunne ikke invitere', { type: 'bad', text: e.message }); }
  }

  signal(to, data) { if (!this.ended) api.post(`/api/cm/calls/${this.id}/signal`, { to, data }).catch(() => {}); }

  drop(uid) {
    const p = this.peers.get(uid);
    if (!p) return;
    clearTimeout(p.slow); clearTimeout(p.retry);
    try { p.pc.close(); } catch { /* */ }
    this.peers.delete(uid);
    this.drawTiles(); this.drawStatus();
  }

  async start({ join = true } = {}) {
    this.local = await getMedia(this.video);
    this.cam = this.local.getVideoTracks().some(t => t.enabled);
    if (join) {
      const r = await api.post(`/api/cm/calls/${this.id}/join`);
      this.ice = r.ice; this.video = r.video;
      for (const m of r.members) this.peer(m.id, m);   // the newcomer calls everyone who is already there
      if (r.music) this.nowPlaying = r.music;
      if (this.kind === 'voice' && !r.members.length) this.startedAt = Date.now();
    }
    this.drawControls(); this.drawTiles(); this.drawStatus();
  }

  async hangup(reason) {
    if (this.ended) return;
    this.ended = true;
    stopTone();
    api.post(`/api/cm/calls/${this.id}/leave`).catch(() => {});
    for (const uid of [...this.peers.keys()]) this.drop(uid);
    this.local?.getTracks().forEach(t => t.stop());
    this.screen?.getTracks().forEach(t => t.stop());
    if (this.music) { this.music.el.pause(); this.music.piano?.stop(); this.music = null; }
    this.mix?.ctx.close().catch(() => {});
    clearInterval(this.timer);
    this.el.remove();
    document.body.classList.remove('in-call');
    if (active === this) active = null;
    const dur = this.startedAt ? ` (${fmt((Date.now() - this.startedAt) / 1000)})` : '';
    const msg = { declined: 'Opkaldet blev afvist', missed: 'Intet svar', offline: 'Forbindelsen blev afbrudt', busy: 'Personen er optaget' }[reason];
    toast(msg || (this.kind === 'voice' ? `Du forlod ${this.title}` : 'Opkaldet er slut') + dur, { icon: 'phoneOff' });
    window.dispatchEvent(new CustomEvent('hubtech-call', { detail: { active: false } }));
  }

  // ── controls ──
  toggleMic() { this.mic = !this.mic; this.local?.getAudioTracks().forEach(t => { t.enabled = this.mic; }); this.drawControls(); this.drawTiles(); }

  async toggleCam() {
    const vt = this.local.getVideoTracks()[0];
    if (vt) { vt.enabled = !vt.enabled; this.cam = vt.enabled; this.drawControls(); this.drawTiles(); return; }
    try {   // audio call: add the camera now (renegotiates automatically)
      const s = await navigator.mediaDevices.getUserMedia({ video: mediaConstraints({ audio: false, video: true, facing: this.facing }).video });
      const t = s.getVideoTracks()[0];
      this.local.addTrack(t);
      for (const p of this.peers.values()) p.pc.addTrack(t, this.local);
      this.cam = true; this.drawControls(); this.drawTiles();
    } catch { toast('Kameraet kunne ikke startes', { type: 'bad' }); }
  }

  async flipCam() {
    const old = this.local.getVideoTracks()[0];
    if (!old) return;
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: this.facing } } });
      const t = s.getVideoTracks()[0];
      for (const p of this.peers.values()) p.pc.getSenders().find(x => x.track === old)?.replaceTrack(t);
      this.local.removeTrack(old); old.stop(); this.local.addTrack(t);
      this.drawTiles();
    } catch { this.facing = this.facing === 'user' ? 'environment' : 'user'; toast('Der er kun ét kamera', { type: 'warn' }); }
  }

  async toggleScreen() {
    if (this.screen) { this.stopScreen(); return; }
    try {
      this.screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const t = this.screen.getVideoTracks()[0];
      t.onended = () => this.stopScreen();
      const cam = this.local.getVideoTracks()[0];
      for (const p of this.peers.values()) {
        const s = cam && p.pc.getSenders().find(x => x.track === cam);
        if (s) s.replaceTrack(t); else p.pc.addTrack(t, this.local);
      }
      this.drawControls(); this.drawTiles();
    } catch { /* cancelled */ }
  }

  stopScreen() {
    const t = this.screen?.getVideoTracks()[0];
    const cam = this.local.getVideoTracks()[0];
    for (const p of this.peers.values()) {
      const s = p.pc.getSenders().find(x => x.track === t);
      if (s) { if (cam) s.replaceTrack(cam); else p.pc.removeTrack(s); }
    }
    this.screen?.getTracks().forEach(x => x.stop());
    this.screen = null;
    this.drawControls(); this.drawTiles();
  }

  // ── window ──
  build() {
    this.statusEl = h('span', { class: 'call-status' });
    this.tilesEl = h('div', { class: 'call-tiles' });
    this.ctlEl = h('div', { class: 'call-ctl', role: 'toolbar', 'aria-label': 'Opkald' });
    const min = h('button', { class: 'icon-btn', 'aria-label': 'Gør lille', title: 'Gør lille', onclick: () => this.el.classList.toggle('is-min') }, icon('minimize'));
    this.el = h('section', { class: 'call glass', role: 'dialog', 'aria-label': `Opkald: ${this.title}` },
      h('header', { class: 'call-h' }, h('span', { class: 'call-dot', 'aria-hidden': 'true' }), h('div', { class: 'call-t' }, h('b', null, this.title), this.statusEl), min),
      this.tilesEl, this.musicPanel(), this.ctlEl);
    this.el.addEventListener('click', (e) => { if (this.el.classList.contains('is-min') && !e.target.closest('button')) this.el.classList.remove('is-min'); });
    document.body.appendChild(this.el);
    document.body.classList.add('in-call');
    this.timer = setInterval(() => this.drawStatus(), 1000);
    window.dispatchEvent(new CustomEvent('hubtech-call', { detail: { active: true, id: this.id } }));
  }

  drawStatus() {
    const n = this.peers.size;
    const connected = [...this.peers.values()].some(p => p.pc.connectionState === 'connected');
    const music = this.nowPlaying ? ` · 🎵 ${this.nowPlaying.title}${this.nowPlaying.by !== 'dig' ? ` (${this.nowPlaying.by})` : ''}` : '';
    this.statusEl.textContent = (this.startedAt ? `${fmt((Date.now() - this.startedAt) / 1000)}${this.kind !== 'dm' ? ` · ${n + 1} med` : ''}`
      : this.kind !== 'voice' ? (n && !connected ? 'Forbinder …' : 'Ringer op …') : 'Forbinder …') + music;
    this.el.classList.toggle('is-live', !!this.startedAt);
  }

  tile(stream, card, { self = false, mic = true, peer = null } = {}) {
    const hasVideo = stream.getVideoTracks().some(t => t.readyState === 'live' && (self ? t.enabled : !t.muted));
    const v = h('video', { autoplay: true, playsinline: true, class: ['call-video', self && this.facing === 'user' && !this.screen && getCall().mirror && 'is-mirror'], hidden: !hasVideo });
    v.srcObject = stream; v.muted = self; v.setAttribute('playsinline', '');
    if (!self) applySpeaker(v);
    if (peer) v.volume = peer.volume;
    v.play?.().catch(() => {});
    // the volume of this one person (only on this device – remembered for next time)
    const vol = peer ? h('label', { class: 'call-vol', title: `Lydstyrke for ${card.name}` }, icon(peer.volume ? 'volume' : 'mute'),
      h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: peer.volume, 'aria-label': `Lydstyrke for ${card.name}`,
        oninput: (e) => { peer.volume = Number(e.target.value); v.volume = peer.volume; saveVolume(card.id, peer.volume); } })) : null;
    const state = peer?.lost ? h('span', { class: 'call-state' }, 'Genopretter forbindelsen …') : peer && peer.pc.connectionState !== 'connected' ? h('span', { class: 'call-state' }, 'Forbinder …')
      : peer?.route === 'relay' ? h('span', { class: 'call-state is-relay', title: 'Jeres netværk tillader ikke en direkte forbindelse, så opkaldet går via TURN-serveren.' }, 'Via relæ') : null;
    return h('div', { class: ['call-tile', self && 'is-self', !hasVideo && 'is-audio', peer?.lost && 'is-lost'] }, v,
      hasVideo ? null : h('span', { class: 'call-ava' }, ava(card.avatar, '👤')),
      state,
      h('span', { class: 'call-name' }, self ? 'Dig' : card.name, mic ? null : icon('micOff')), vol);
  }

  drawTiles() {
    if (this.ended) return;
    const tiles = [...this.peers.values()].map(p => this.tile(p.stream, p.card, { peer: p }));
    const myCard = { name: 'Dig', avatar: store.get('user')?.avatar };
    const selfStream = this.screen ? new MediaStream([...this.screen.getVideoTracks(), ...(this.local?.getAudioTracks() || [])]) : this.local || new MediaStream();
    h(clear(this.tilesEl), null, tiles.length ? tiles : h('div', { class: 'call-wait' }, h('span', { class: 'call-ava call-pulse' }, this.kind === 'dm' ? (ava(this.peerCard?.avatar, '👤')) : '🔊'),
      h('span', null, this.kind === 'dm' ? `Ringer til ${this.title} …` : this.kind === 'group' ? 'Ringer op … Dem, der tager imod, kommer med her.' : 'Du er den eneste her. Andre kan deltage fra kanallisten.')),
    this.local ? this.tile(selfStream, myCard, { self: true, mic: this.mic }) : null);
    this.tilesEl.dataset.n = String(tiles.length);
  }

  drawControls() {
    const b = (ic, label, on, fn, cls) => h('button', { class: ['call-btn', on && 'is-on', cls], 'aria-label': label, title: label, 'aria-pressed': on == null ? null : String(!!on), onclick: fn }, icon(ic));
    const hasCam = this.local?.getVideoTracks().length;
    h(clear(this.ctlEl), null,
      b(this.mic ? 'mic' : 'micOff', this.mic ? 'Slå mikrofonen fra' : 'Slå mikrofonen til', !this.mic, () => this.toggleMic()),
      b(this.cam ? 'video' : 'videoOff', this.cam ? 'Slå kameraet fra' : 'Slå kameraet til', this.cam, () => this.toggleCam()),
      hasCam && /Android|iPhone|iPad/i.test(navigator.userAgent) ? b('refresh', 'Skift kamera', null, () => this.flipCam()) : null,
      navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent) ? b('screen', this.screen ? 'Stop skærmdeling' : 'Del skærm', !!this.screen, () => this.toggleScreen()) : null,
      b('music', 'Musik til alle', !!this.music, () => { this.musicEl.hidden = !this.musicEl.hidden; this.drawMusic(); }),
      this.kind !== 'voice' ? b('userPlus', 'Invitér flere', null, () => this.invite()) : null,
      b('phoneOff', this.kind === 'voice' ? 'Forlad kanalen' : 'Læg på', null, () => this.hangup(), 'is-end'));
  }
}

// ── public API ──
export async function callUser(user, { video = false } = {}) {
  if (!supported()) { toast('Opkald virker ikke i denne browser', { type: 'bad' }); return; }
  if (active) { toast('Du er allerede i et opkald', { type: 'warn' }); return; }
  let r;
  try { r = await api.post('/api/cm/calls', { to: user.id, video }); }
  catch (e) { toast('Kunne ikke ringe op', { type: 'bad', text: e.message }); return; }
  active = new Call({ id: r.id, kind: 'dm', title: user.name, video, ice: r.ice });
  active.peerCard = user;
  try { await active.start({ join: false }); playTone('out'); }
  catch (e) { toast('Opkaldet kunne ikke starte', { type: 'bad', text: e.message }); active?.hangup(); }
}

/** Pick friends (checkboxes). Resolves with the chosen ones, or null. */
export function pickFriends(friends, title = 'Gruppeopkald', okLabel = 'Ring op') {
  return new Promise((resolve) => {
    if (!friends.length) { toast('Ingen venner at vælge', { type: 'warn', text: 'Tilføj venner under Fællesskab → Venner.' }); resolve(null); return; }
    const chosen = new Set();
    let done = false;
    const list = h('div', { class: 'sn-pick' }, friends.map(f => h('label', { class: 'sn-friend' },
      h('input', { type: 'checkbox', onchange: (e) => { e.target.checked ? chosen.add(f) : chosen.delete(f); } }),
      h('span', { class: ['cm-ava', f.online && 'is-online', f.presence === 'busy' && 'is-busy'] }, ava(f.avatar)), h('span', null, f.name, f.online ? '' : ' (offline)'))));
    const m = modal({ title, label: 'Opkald', size: 440, body: h('div', { class: 'stack', style: { gap: '10px' } }, list, h('p', { class: 'faint', style: { margin: 0 } }, `Højst 7 andre. Det ringer kun hos venner, der har HUBTECH åben.`)),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: () => { done = true; m.close(); resolve([...chosen]); } }, icon('phone'), okLabel)],
      onClose: () => { if (!done) resolve(null); } });
  });
}

/** Ring several friends at once. */
export async function callGroup(users, { video = false } = {}) {
  if (!supported()) { toast('Opkald virker ikke i denne browser', { type: 'bad' }); return; }
  if (active) { toast('Du er allerede i et opkald', { type: 'warn' }); return; }
  if (!users?.length) return;
  let r;
  try { r = await api.post('/api/cm/calls', { to: users.map(u => u.id), video }); }
  catch (e) { toast('Kunne ikke ringe op', { type: 'bad', text: e.message }); return; }
  active = new Call({ id: r.id, kind: 'group', title: users.length === 1 ? users[0].name : `Gruppeopkald (${users.length + 1})`, video, ice: r.ice });
  try { await active.start({ join: false }); playTone('out'); }
  catch (e) { toast('Opkaldet kunne ikke starte', { type: 'bad', text: e.message }); active?.hangup(); }
}

export async function joinVoice(channelId, title) {
  if (!supported()) { toast('Talekanaler virker ikke i denne browser', { type: 'bad' }); return; }
  if (active?.id === channelId) { active.el.classList.remove('is-min'); return; }
  if (active) await active.hangup();
  active = new Call({ id: channelId, kind: 'voice', title: `🔊 ${title}`, video: false, ice: [] });
  try { await active.start(); }
  catch (e) { toast('Kunne ikke deltage', { type: 'bad', text: e.message }); active?.hangup(); }
}

export const currentCall = () => active;

function showRing(ev) {
  if (active) { api.post(`/api/cm/calls/${ev.id}/leave`).catch(() => {}); return; }   // busy
  closeRing();
  const accept = async (video) => {
    const r = ringing; closeRing();
    active = new Call({ id: ev.id, kind: ev.group ? 'group' : 'dm', title: ev.group ? `Gruppeopkald med ${ev.from.name}` : ev.from.name, video, ice: [] });
    active.peerCard = ev.from;
    try { await active.start(); } catch (e) { toast('Kunne ikke tage imod', { type: 'bad', text: e.message }); active?.hangup(); }
    void r;
  };
  const el = h('div', { class: 'ring glass', role: 'alertdialog', 'aria-label': `${ev.from.name} ringer` },
    h('span', { class: 'call-ava call-pulse' }, ava(ev.from.avatar, '👤')),
    h('div', { class: 'ring-t' }, h('b', null, ev.from.name), h('span', { class: 'faint' }, `${ev.group ? 'Gruppeopkald' : ev.video ? 'Videoopkald' : 'Ringer'}${ev.others?.length ? ` med ${ev.others.join(', ')}` : ''} …`)),
    h('div', { class: 'ring-b' },
      h('button', { class: 'call-btn is-end', 'aria-label': 'Afvis', title: 'Afvis', onclick: () => { api.post(`/api/cm/calls/${ev.id}/leave`).catch(() => {}); closeRing(); } }, icon('phoneOff')),
      h('button', { class: 'call-btn is-accept', 'aria-label': 'Tag imod', title: 'Tag imod', onclick: () => accept(false) }, icon('phone')),
      ev.video ? h('button', { class: 'call-btn is-accept', 'aria-label': 'Tag imod med video', title: 'Tag imod med video', onclick: () => accept(true) }, icon('video')) : null));
  document.body.appendChild(el);
  ringing = { el, id: ev.id, timer: setTimeout(closeRing, 46000) };
  playTone('in');
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { const n = new Notification(`${ev.from.name} ringer`, { body: ev.video ? 'Videoopkald i HUBTECH' : 'Opkald i HUBTECH', tag: 'call-' + ev.id, requireInteraction: true }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* */ }
  }
}
function closeRing() { if (!ringing) return; clearTimeout(ringing.timer); ringing.el.remove(); ringing = null; stopTone(); }

export function initCalls() {
  if (started) return;
  started = true;
  onLive('call-ring', showRing);
  onLive('call-signal', (ev) => { if (active?.id === ev.id) active.onSignal(ev.from, ev.data); });
  onLive('call-join', (ev) => { if (active?.id === ev.id) { stopTone(); active.peer(ev.user.id, ev.user); if (!active.startedAt && active.kind === 'voice') active.startedAt = Date.now(); toast(`${ev.user.name} er med`, { icon: 'phone', ms: 2500 }); } });
  onLive('call-leave', (ev) => { if (active?.id === ev.id) { const n = active.peers.get(ev.user)?.card?.name; active.drop(ev.user); if (n) toast(`${n} forlod opkaldet`, { icon: 'phoneOff', ms: 2500 }); } });
  onLive('call-decline', (ev) => { if (active?.id === ev.id) toast('En af dem, du ringede til, afviste', { icon: 'phoneOff', ms: 2500 }); });
  onLive('call-group', (ev) => { if (active?.id === ev.id && active.kind === 'dm') { active.kind = 'group'; active.drawControls(); } });
  onLive('call-info', (ev) => { if (active?.id === ev.id) { active.nowPlaying = ev.music; active.drawStatus(); } });
  onLive('call-end', (ev) => { if (ringing?.id === ev.id) closeRing(); if (active?.id === ev.id) active.hangup(ev.reason); });
  // a call that is still ringing when the page (re)loads
  api.get('/api/cm/calls').then(r => { if (r.ringing) showRing(r.ringing); }).catch(() => {});
  addEventListener('pagehide', () => { if (active) fetch(`/api/cm/calls/${active.id}/leave`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'X-Requested-With': 'hubtech' } }).catch(() => {}); });
  store.on('user', (u) => { if (!u) { active?.hangup(); closeRing(); } });
}
