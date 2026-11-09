/**
 * "Hent HUBTECH" – the page the owner sends to friends (#/hent). No login needed. It works out which device the
 * visitor has and shows one big button for it: Microsoft Store on Windows, the app on Android – and always the
 * way to just use HUBTECH in the browser.
 */
import { h } from '../core/dom.js';
import { icon, logo } from '../core/icons.js';
import { api } from '../core/api.js';
import { qrSvg } from '../features/qr.js';

const device = () => {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
};

export async function renderDownload() {
  let d = {};
  try { d = await api.get('/api/download'); } catch { /* still show the browser option */ }
  const here = d.webUrl || location.origin;
  const dev = device();
  const big = (href, ic, title, sub, primary) => h('a', { class: ['dl-btn', primary && 'is-primary'], href, target: href.startsWith('#') ? null : '_blank', rel: 'noopener' },
    icon(ic), h('span', null, h('b', null, title), h('small', null, sub)));
  const windows = d.storeUrl ? big(d.storeUrl, 'monitor', 'Hent til Windows', 'Gratis i Microsoft Store', dev === 'windows') : null;
  const android = d.apkUrl ? big(d.apkUrl, 'smartphone', 'Hent til Android', 'Installér appen på telefonen', dev === 'android') : null;
  const browser = big(here + '/#/login', 'globe', 'Brug den i browseren', dev === 'ios' ? 'På iPhone: Del → “Føj til hjemmeskærm”' : 'Ingen installation – virker med det samme', !(dev === 'windows' && windows) && !(dev === 'android' && android));
  const order = dev === 'android' ? [android, windows, browser] : dev === 'windows' ? [windows, android, browser] : [browser, windows, android];
  const steps = h('ol', { class: 'dl-steps' },
    h('li', null, 'Hent HUBTECH herover – eller brug den i browseren.'),
    d.webUrl ? h('li', null, 'Vælg “Forbind til en vens HUBTECH” og skriv ', h('b', { class: 'mono' }, d.webUrl), '.') : null,
    h('li', null, d.signupOpen ? 'Opret en konto – eller log ind med den, du har fået.' : 'Log ind med den konto, du har fået af ejeren.'));
  // on a computer: scan with the phone. One code gets the app, the other updates an older app (data stays).
  const phone = dev === 'android' || dev === 'ios';
  const qrBox = (url, title, text) => {
    const box = h('div', { class: 'dl-qr' }, h('div', { class: 'dl-qr-code' }), h('b', null, title), h('small', null, text));
    qrSvg(url, 150).then(el => box.querySelector('.dl-qr-code').append(el)).catch(() => box.remove());
    return box;
  };
  const qrs = !phone ? h('div', { class: 'dl-qrs' },
    qrBox(`${here}/#/hent`, 'Hent på mobilen', 'Scan med telefonens kamera'),
    d.latestApk ? qrBox(d.latestApk, 'Opdatér en ældre app', 'Android: installerer den nyeste – dine data bliver') : null) : null;
  const update = phone && dev === 'android' && d.latestApk
    ? h('p', { class: 'auth-alt' }, 'Har du en ældre HUBTECH-app? ', h('a', { href: d.latestApk, target: '_blank', rel: 'noopener' }, 'Hent den nyeste version'), ' – den installeres oven på den gamle, og dine data bliver.') : null;
  return h('div', { class: 'auth-wrap page dl-page' },
    h('div', { class: 'auth-card glass glass-strong dl-card' },
      h('div', { class: 'dl-brand' }, logo(52), h('span', { class: 'brand-name' }, 'HUB', h('b', null, 'TECH'))),
      h('h1', { class: 'auth-title' }, 'Hent HUBTECH'),
      h('p', { class: 'muted auth-sub' }, 'Skriv, ring og arbejd sammen – uanset hvor I er.'),
      h('div', { class: 'dl-btns' }, order.filter(Boolean)),
      steps, qrs, update,
      h('p', { class: 'auth-alt' }, h('a', { href: '#/login' }, 'Har du allerede HUBTECH? Log ind'))));
}
