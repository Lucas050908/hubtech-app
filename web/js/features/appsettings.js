/**
 * Settings for the apps, stored on this device: calls (microphone, camera, speaker …), notifications in
 * Fællesskab, background music, the AI assistant and App-værkstedet. Other modules read them with get*().
 */
const read = (k, d) => { try { return { ...d, ...(JSON.parse(localStorage.getItem(k) || '{}') || {}) }; } catch { return { ...d }; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export const CALL_DEFAULTS = { mic: '', cam: '', speaker: '', noise: true, echo: true, gain: true, camOff: false, mirror: true, ring: true, ringVolume: 0.6, quality: 'auto' };
export const NOTIFY_DEFAULTS = { dm: true, mention: true, friend: true, snap: true, calendar: true, report: true, sound: true };
export const STUDIO_DEFAULTS = { autoRun: true, fontSize: 13.5 };

export const getCall = () => read('hubtech.call', CALL_DEFAULTS);
export const setCall = (patch) => write('hubtech.call', { ...getCall(), ...patch });
export const getNotify = () => read('hubtech.notify', NOTIFY_DEFAULTS);
export const setNotify = (patch) => write('hubtech.notify', { ...getNotify(), ...patch });
export const getStudio = () => read('hubtech.studio', STUDIO_DEFAULTS);
export const setStudio = (patch) => write('hubtech.studio', { ...getStudio(), ...patch });

const VIDEO = { auto: { width: { ideal: 960 }, height: { ideal: 540 } }, low: { width: { ideal: 480 }, height: { ideal: 270 }, frameRate: { ideal: 15 } }, high: { width: { ideal: 1280 }, height: { ideal: 720 } } };

/** getUserMedia constraints from the call settings. */
export function mediaConstraints({ audio = true, video = false, facing = 'user' } = {}) {
  const c = getCall();
  const a = audio ? { echoCancellation: c.echo, noiseSuppression: c.noise, autoGainControl: c.gain, ...(c.mic ? { deviceId: { ideal: c.mic } } : {}) } : false;
  const v = video ? { ...(VIDEO[c.quality] || VIDEO.auto), ...(c.cam ? { deviceId: { ideal: c.cam } } : { facingMode: facing }) } : false;
  return { audio: a, video: v };
}

/** Play call sound on the chosen speaker (Chrome/Edge/Android; Safari ignores it). */
export function applySpeaker(el) {
  const id = getCall().speaker;
  if (id && typeof el.setSinkId === 'function') el.setSinkId(id).catch(() => {});
}

// a short, soft "pling" for notifications
export function pling() {
  if (!getNotify().sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.35);
      o.connect(g).connect(ctx.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch { /* */ }
}
