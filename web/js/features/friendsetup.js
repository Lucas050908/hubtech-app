/**
 * "Venner på andre netværk": HUBTECH sets up Tailscale Funnel by itself, step by step (install → start → log in →
 * allow public access), so friends anywhere can open HUBTECH on this computer. Used in Indstillinger → Om and as a
 * one-time question right after the owner's first start.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal, errorToast } from '../core/ui.js';
import { store } from '../core/store.js';
import { currentPath } from '../core/router.js';
import { isAndroidApp } from '../core/android.js';

const ASKED = 'hubtech.friendsAsked';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const publicInfo = () => api.get('/api/system/public-access');

/** The wizard. onDone(url) is called when HUBTECH has its public address. */
export function friendWizard({ onDone, compact = false } = {}) {
  const box = h('div', { class: 'fw', 'aria-live': 'polite' });
  let running = false, opened = new Set(), stopped = false;
  const openOnce = (url) => { if (url && !opened.has(url)) { opened.add(url); try { window.open(url, '_blank', 'noopener'); } catch { /* popup blocked: the button is there */ } } };
  const line = (ic, text, extra = null, cls = '') => h('div', { class: ['fw-step', cls] }, icon(ic), h('div', null, h('span', null, text), extra));

  function showDone(url) {
    const copy = h('button', { class: 'btn btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Adressen er kopieret', { type: 'ok' }); } catch { /* */ } } }, icon('copy'), 'Kopiér');
    h(clear(box), null,
      line('checkCircle', 'HUBTECH kan nu nås fra alle netværk:', h('div', { class: 'fw-url' }, h('b', { class: 'mono' }, url), copy), 'is-ok'),
      h('p', { class: 'faint small', style: { margin: '6px 0 0' } }, 'Send adressen til dine venner, og lav en konto til hver af dem under Brugere. De åbner adressen i en browser – eller i HUBTECH-appen under “Forbind til en vens HUBTECH”. Computeren skal være tændt, mens I bruger den.'));
    onDone?.(url);
  }

  function showStart(info) {
    const go = h('button', { class: ['btn btn-primary', compact ? 'btn-sm' : null] }, icon('globe'), 'Sæt det op for mig');
    go.addEventListener('click', () => { box.dataset.started = '1'; run(); });
    const notes = [];
    if (!info.tailscale.installed) notes.push(info.canInstall ? 'HUBTECH installerer Tailscale (gratis). Windows spørger om lov – klik “Ja”. Ved at fortsætte accepterer du Tailscales vilkår.' : 'Først skal Tailscale (gratis) installeres – HUBTECH viser hvor.');
    notes.push('Du logger ind på Tailscale én gang (fx med Google, Microsoft eller GitHub) og tillader offentlig adgang. Resten klarer HUBTECH.');
    h(clear(box), null, h('div', { class: 'fw-actions' }, go), ...notes.map(t => h('p', { class: 'faint small', style: { margin: '6px 0 0' } }, t)));
  }

  async function run() {
    if (running) return;
    running = true;
    const deadline = Date.now() + 20 * 60000;
    let last = '';
    try {
      while (!stopped && Date.now() < deadline) {
        const info = await publicInfo();
        const ts = info.tailscale, job = info.job;
        if (ts.running && ts.funnel && ts.url) { showDone(ts.url); return; }
        const busy = job && !job.done;
        if (busy) {
          if (job.kind === 'install') h(clear(box), null, line('download', 'Installerer Tailscale … Windows spørger om lov – klik “Ja”.', null, 'is-busy'));
          else if (job.kind === 'login') {
            openOnce(job.url);
            h(clear(box), null, line('user', 'Log ind på Tailscale i browseren, der lige åbnede.', job.url ? h('a', { class: 'btn btn-sm', href: job.url, target: '_blank', rel: 'noopener' }, icon('link'), 'Åbn login igen') : null, 'is-busy'));
          } else if (job.kind === 'funnel') {
            openOnce(job.url);
            h(clear(box), null, job.url
              ? line('lock', 'Tillad offentlig adgang (“Funnel”) på siden, der lige åbnede – det skal kun gøres første gang.', h('a', { class: 'btn btn-sm', href: job.url, target: '_blank', rel: 'noopener' }, icon('link'), 'Åbn siden igen'), 'is-busy')
              : line('globe', 'Laver HUBTECHs offentlige adresse …', null, 'is-busy'));
          }
          await sleep(2000);
          continue;
        }
        if (job?.done && !job.ok && job.kind !== 'start' && last === job.kind) {
          h(clear(box), null, line('alert', job.kind === 'install' ? 'Tailscale blev ikke installeret.' : 'Det lykkedes ikke.', h('p', { class: 'faint small', style: { margin: '4px 0 0' } }, job.error || '')),
            h('div', { class: 'fw-actions' }, h('button', { class: 'btn btn-sm', onclick: () => { last = ''; running = false; run(); } }, icon('refresh'), 'Prøv igen'),
              h('a', { class: 'btn btn-sm btn-ghost', href: info.download, target: '_blank', rel: 'noopener' }, icon('download'), 'Hent Tailscale selv')));
          return;
        }
        const r = await api.post('/api/system/public-access', {});
        if (r.step === 'done') continue;
        if (r.step === 'manual') {
          h(clear(box), null, line('download', 'Installér Tailscale (gratis), og kom tilbage hertil.', h('div', { class: 'fw-actions' },
            h('a', { class: 'btn btn-sm btn-primary', href: info.download, target: '_blank', rel: 'noopener' }, icon('download'), 'Hent Tailscale'),
            h('button', { class: 'btn btn-sm', onclick: () => { running = false; run(); } }, 'Jeg har installeret det'))));
          return;
        }
        if (r.step === 'start') h(clear(box), null, line('refresh', 'Starter Tailscale …', null, 'is-busy'));
        if (last === r.step && r.step === 'start') await sleep(4000);
        last = r.step;
        await sleep(1500);
      }
      if (!stopped) h(clear(box), null, line('alert', 'Det tog for lang tid.', h('button', { class: 'btn btn-sm', onclick: () => { running = false; run(); } }, icon('refresh'), 'Prøv igen')));
    } catch (e) {
      if (e?.status === 403 || e?.status === 404) h(clear(box), null, h('p', { class: 'faint' }, 'Det kan kun sættes op på den computer, HUBTECH kører på.'));
      else { errorToast(e, 'Kunne ikke sætte det op'); showStart({ tailscale: { installed: true }, canInstall: false }); }
    } finally { running = false; }
  }

  publicInfo().then((info) => {
    const ts = info.tailscale;
    if (ts.running && ts.funnel && ts.url) showDone(ts.url);
    else if (info.job && !info.job.done) run();
    else showStart(info);
  }).catch(() => h(clear(box), null, h('p', { class: 'faint' }, 'Det kan kun sættes op på den computer, HUBTECH kører på.')));
  box.stop = () => { stopped = true; };
  return box;
}

/** Once, the first time the owner uses HUBTECH (after the introduction): ask if friends elsewhere should join. */
let tried = false;
export async function maybeOfferFriends() {
  const u = store.get('user');
  if (tried || !u || u.role !== 'owner' || !u.onboarding?.done) return;
  if (currentPath() !== '/' || document.querySelector('.modal, .tour-card')) return;
  tried = true;
  try { if (localStorage.getItem(ASKED)) return; } catch { return; }
  if (isAndroidApp()) return;
  let info;
  try { info = await publicInfo(); } catch { return; }          // not on the computer HUBTECH runs on
  const answered = () => { try { localStorage.setItem(ASKED, '1'); } catch { /* */ } };
  if (info.tailscale.funnel || info.enabled) { answered(); return; }
  if (currentPath() !== '/' || document.querySelector('.modal, .tour-card')) return;
  const wiz = friendWizard({ onDone: () => { later.textContent = 'Luk'; } });
  const later = h('button', { class: 'btn btn-ghost' }, 'Ikke nu');
  const m = modal({
    title: 'Skal venner på andre netværk kunne være med?', label: 'Venner', size: 520,
    body: h('div', { class: 'stack', style: { display: 'grid', gap: '10px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, 'Så kan dine venner skrive, ringe og bruge HUBTECH sammen med dig – også når de er hjemme hos sig selv eller på mobilnet. HUBTECH sætter det op for dig med Tailscale (gratis, krypteret). Alle skal stadig logge ind.'),
      wiz),
    actions: [later],
    onClose: () => { wiz.stop?.(); removeEventListener('hashchange', away); if (!leftPage || wiz.dataset.started) answered(); },
  });
  // went to another page without answering: close it, and ask again another time
  let leftPage = false;
  const away = () => { leftPage = true; m.close(); };
  addEventListener('hashchange', away);
  later.addEventListener('click', () => { m.close(); if (later.textContent === 'Ikke nu') toast('Du kan altid gøre det senere', { text: 'Indstillinger → Om → Netværk → “Venner på andre netværk”.' }); });
}

/** In the Windows or Android app: is it possible to switch to another HUBTECH from here? */
export function canConnectToFriend() {
  return !!(window.hubtechDesktop && window.chrome?.webview) || isAndroidApp();
}

/** The friend's side: use the owner's HUBTECH instead of creating one's own (first screen in the app). */
export function connectToFriendDialog() {
  const urlIn = h('input', { class: 'input', type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://vens-pc.tailnet.ts.net', 'aria-label': 'Adressen på din vens HUBTECH' });
  const err = h('p', { class: 'field-error', style: { margin: 0 }, 'aria-live': 'polite' });
  const go = h('button', { class: 'btn btn-primary' }, icon('link'), 'Forbind');
  const wv = window.chrome?.webview;
  const onMsg = (e) => { if (typeof e.data === 'string' && e.data.startsWith('hubtech-server-error:')) { err.textContent = e.data.slice(21); go.disabled = false; go.classList.remove('is-loading'); } };
  wv?.addEventListener('message', onMsg);
  go.addEventListener('click', async () => {
    err.textContent = '';
    const v = urlIn.value.trim();
    if (!v) { err.textContent = 'Skriv adressen, din ven har sendt dig.'; return; }
    go.disabled = true; go.classList.add('is-loading');
    if (wv && window.hubtechDesktop) { wv.postMessage('hubtech-server:' + v); setTimeout(() => { go.disabled = false; go.classList.remove('is-loading'); }, 12000); return; }
    const droid = await import('../core/android.js');
    const r = await droid.setServerUrl(v);
    go.disabled = false; go.classList.remove('is-loading');
    if (r !== 'ok') err.textContent = r;
  });
  urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
  const m = modal({
    title: 'Forbind til en vens HUBTECH', label: 'Venner', size: 480,
    body: h('div', { class: 'stack', style: { display: 'grid', gap: '10px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, 'Har en ven sendt dig en adresse (…ts.net)? Skriv den her, så bruger appen din vens HUBTECH – I kan skrive og ringe sammen, uanset hvor I er. Log derefter ind med den konto, din ven har lavet til dig.'),
      urlIn, err),
    actions: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annullér'), go],
    onClose: () => wv?.removeEventListener('message', onMsg),
  });
  setTimeout(() => urlIn.focus(), 60);
}
