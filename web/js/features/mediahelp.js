/**
 * The microphone or camera is blocked: say exactly where to allow it on THIS device – and open the right settings
 * page where we can (the Android app, the Windows app).
 */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { modal } from '../core/ui.js';
import { isAndroidApp, openAppSettings } from '../core/android.js';

function where() {
  const ua = navigator.userAgent;
  if (isAndroidApp()) return 'android-app';
  if (window.hubtechDesktop && window.chrome?.webview) return 'windows-app';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android-browser';
  if (/Windows/.test(ua)) return 'windows-browser';
  return 'browser';
}

let open = false;
/** kind: 'mic' or 'cam'. */
export function showMediaHelp(kind = 'mic') {
  if (open) return;
  const what = kind === 'cam' ? 'kameraet' : 'mikrofonen', What = kind === 'cam' ? 'Kamera' : 'Mikrofon';
  const env = where();
  const winSteps = [h('li', null, 'Åbn ', h('b', null, 'Start → Indstillinger → Beskyttelse af personlige oplysninger og sikkerhed → ' + What), '.'),
    h('li', null, 'Slå ', h('b', null, `${What}adgang`), ' til.'),
    h('li', null, 'Slå også ', h('b', null, `Giv skrivebordsapps adgang til ${what}`), ' til (nederst på siden).')];
  const steps = {
    'android-app': [h('li', null, 'Tryk ', h('b', null, 'Åbn indstillinger'), ' herunder.'), h('li', null, 'Vælg ', h('b', null, 'Tilladelser'), ' → ', h('b', null, What), ' → ', h('b', null, 'Tillad kun, mens appen er i brug'), '.'), h('li', null, 'Gå tilbage til HUBTECH, og prøv igen.')],
    'windows-app': [...winSteps, h('li', null, 'Gå tilbage til HUBTECH, og prøv igen.')],
    'windows-browser': [h('li', null, 'Klik på ', h('b', null, 'ikonet til venstre for adressen'), ' (låsen eller skyderne) → ', h('b', null, What), ' → ', h('b', null, 'Tillad'), ', og genindlæs siden.'), h('li', null, 'Hjælper det ikke, så er det Windows, der blokerer:'), ...winSteps],
    'android-browser': [h('li', null, 'Tryk på ', h('b', null, 'ikonet til venstre for adressen'), ' → ', h('b', null, 'Tilladelser'), ' → ', h('b', null, What), ' → ', h('b', null, 'Tillad'), '.'), h('li', null, 'Genindlæs siden, og prøv igen.')],
    ios: [h('li', null, 'Åbn telefonens ', h('b', null, 'Indstillinger → Safari → ' + What), ', og vælg ', h('b', null, 'Spørg'), ' eller ', h('b', null, 'Tillad'), '.'), h('li', null, 'Genindlæs siden, og prøv igen.')],
    browser: [h('li', null, 'Klik på ', h('b', null, 'ikonet til venstre for adressen'), ' → ', h('b', null, What), ' → ', h('b', null, 'Tillad'), '.'), h('li', null, 'Genindlæs siden, og prøv igen.')],
  }[env];
  const actions = [];
  if (env === 'android-app') actions.push(h('button', { class: 'btn btn-primary', onclick: () => { openAppSettings(); m.close(); } }, icon('settings'), 'Åbn indstillinger'));
  if (env === 'windows-app') actions.push(h('button', { class: 'btn btn-primary', onclick: () => { try { window.chrome.webview.postMessage('hubtech-open:ms-settings:privacy-' + (kind === 'cam' ? 'webcam' : 'microphone')); } catch { /* */ } } }, icon('settings'), 'Åbn Windows-indstillinger'));
  actions.unshift(h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Luk'));
  open = true;
  const m = modal({
    title: `HUBTECH må ikke bruge ${what}`, label: What, size: 480,
    body: h('div', { class: 'stack', style: { display: 'grid', gap: '10px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, `${env === 'android-app' ? 'Telefonen' : env.startsWith('windows') ? 'Windows eller browseren' : 'Browseren'} har blokeret ${what}. Sådan giver du lov:`),
      h('ol', { class: 'dl-steps', style: { margin: 0 } }, steps)),
    actions,
    onClose: () => { open = false; },
  });
}
