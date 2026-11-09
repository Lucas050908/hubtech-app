/**
 * "Test opkald" – check calls without needing anyone else:
 *   1. the microphone works
 *   2. this network can find a way out to other networks (STUN)
 *   3. the relay works, if the owner has set one up (TURN)
 *   4. a real call connection can be made (two connections inside this page talk to each other)
 * and tell in plain Danish what it means for calling friends on other networks.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { mediaConstraints } from './appsettings.js';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function micCheck() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, why: window.isSecureContext ? 'nodevice' : 'insecure' };
  try {
    const s = await navigator.mediaDevices.getUserMedia(mediaConstraints({ video: false }));
    s.getTracks().forEach(t => t.stop());
    return { ok: true };
  } catch (e) {
    return { ok: false, why: e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'blocked' : e.name === 'NotReadableError' ? 'busy' : 'nodevice' };
  }
}

/** Which kinds of routes these servers give from this network: host / srflx (STUN) / relay (TURN). */
async function gather(iceServers, policy = 'all') {
  const types = new Set();
  let pc;
  try { pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: policy }); } catch { return types; }
  pc.createDataChannel('t');
  await new Promise((resolve) => {
    const done = setTimeout(resolve, 9000);
    pc.onicecandidate = (e) => {
      if (!e.candidate) { clearTimeout(done); resolve(); return; }
      const m = / typ (\w+)/.exec(e.candidate.candidate); if (m) types.add(m[1]);
    };
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => { clearTimeout(done); resolve(); });
  });
  try { pc.close(); } catch { /* */ }
  return types;
}

/** Two connections in this page call each other – over the relay only, when policy is 'relay'. */
async function loopback(iceServers, policy = 'all') {
  let a, b;
  try {
    a = new RTCPeerConnection({ iceServers, iceTransportPolicy: policy });
    b = new RTCPeerConnection({ iceServers, iceTransportPolicy: policy });
  } catch { return false; }
  a.onicecandidate = (e) => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
  b.onicecandidate = (e) => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
  const ch = a.createDataChannel('t');
  const ok = new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 12000);
    b.ondatachannel = (e) => { e.channel.onmessage = (m) => { if (m.data === 'hej') { clearTimeout(t); resolve(true); } }; };
    ch.onopen = () => ch.send('hej');
  });
  try {
    await a.setLocalDescription(await a.createOffer());
    await b.setRemoteDescription(a.localDescription);
    await b.setLocalDescription(await b.createAnswer());
    await a.setRemoteDescription(b.localDescription);
  } catch { return false; }
  const res = await ok;
  try { a.close(); b.close(); } catch { /* */ }
  return res;
}

/** The "Test opkald" box for Indstillinger → Apps og opkald. */
export function callTestBox() {
  const out = h('div', { class: 'ct-out', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-sm' }, icon('phone'), 'Test opkald');
  const line = (state, text, sub) => h('div', { class: ['ct-line', `is-${state}`] },
    icon(state === 'ok' ? 'checkCircle' : state === 'bad' ? 'alert' : state === 'warn' ? 'info' : 'refresh'),
    h('div', null, h('span', null, text), sub ? h('small', null, sub) : null));
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const rows = [];
    const show = (extra) => h(clear(out), null, ...rows, extra || null);
    try {
      rows.push(line('busy', 'Tester mikrofonen …')); show();
      const mic = await micCheck();
      rows[0] = mic.ok ? line('ok', 'Mikrofonen virker')
        : line('bad', { blocked: 'Mikrofonen er blokeret', busy: 'Mikrofonen bruges af et andet program', insecure: 'Mikrofonen kræver en sikker forbindelse (https)', nodevice: 'Der blev ikke fundet nogen mikrofon' }[mic.why],
          mic.why === 'blocked' ? 'Se hvordan du giver lov i vinduet, der åbnede.' : mic.why === 'insecure' ? 'Åbn HUBTECH via https (fx “Venner på andre netværk”) eller på selve computeren.' : null);
      if (mic.why === 'blocked') import('./mediahelp.js').then(m => m.showMediaHelp('mic')).catch(() => {});
      rows.push(line('busy', 'Tester forbindelsen til andre netværk …')); show();
      let cfg = { ice: [{ urls: ['stun:stun.l.google.com:19302'] }], relay: false };
      try { cfg = await api.get('/api/cm/calls/ice'); } catch { /* use the public STUN server */ }
      const types = await gather(cfg.ice);
      const direct = types.has('srflx');
      rows[1] = direct ? line('ok', 'Din forbindelse kan nå andre netværk', 'Opkald finder selv en direkte vej i de fleste tilfælde.')
        : line('warn', 'Dit netværk blokerer direkte forbindelser udefra', 'Typisk på skole-, arbejds- eller hotel-wifi.');
      let relayOk = null;
      if (cfg.relay) {
        rows.push(line('busy', 'Tester relæet (TURN-serveren) …')); show();
        relayOk = types.has('relay') ? await loopback(cfg.ice, 'relay') : false;
        rows[2] = relayOk ? line('ok', 'Relæet virker', 'Opkald kan altid sendes via TURN-serveren, når en direkte vej ikke findes.')
          : line('bad', 'Relæet (TURN-serveren) svarer ikke', 'Ejeren skal tjekke adresse, brugernavn og adgangskode under Opkald mellem netværk.');
      }
      rows.push(line('busy', 'Laver et prøveopkald …')); show();
      const call = await loopback(cfg.ice);
      rows[rows.length - 1] = call ? line('ok', 'Et prøveopkald kunne forbindes') : line('bad', 'Prøveopkaldet kunne ikke forbindes', 'Browseren eller en firewall blokerer opkald (WebRTC).');
      await wait(50);
      const verdict = !call || !mic.ok ? ['bad', 'Opkald virker ikke endnu – ret det, der er markeret.']
        : relayOk ? ['ok', 'Du kan ringe med alle – også folk på mobilnet, skole- og arbejds-wifi.']
          : direct ? ['ok', cfg.relay ? 'Du kan ringe med folk på de fleste netværk.' : 'Du kan ringe med folk på de fleste netværk. Fra mobilnet, skole- eller arbejds-wifi kan det fejle – en TURN-server løser det.']
            : ['warn', 'Opkald virker kun med folk på samme netværk som dig. En TURN-server (Indstillinger → Apps og opkald) løser det.'];
      show(h('div', { class: ['ct-verdict', `is-${verdict[0]}`] }, h('b', null, verdict[1])));
    } finally { btn.disabled = false; }
  });
  return h('div', { class: 'set-stack ct' }, btn, out);
}
