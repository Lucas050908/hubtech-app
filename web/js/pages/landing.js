/** Public landing page — presents the universe and the way in. */
import { h } from '../core/dom.js';
import { canConnectToFriend, connectToFriendDialog } from '../features/friendsetup.js';
import { icon, logo } from '../core/icons.js';
import { store, setWorld } from '../core/store.js';
import { APPS } from '../core/registry.js';
import { paintStill, describeWorld } from '../world/controller.js';
import { SEASONS, SEASON_LABEL, SEASON_ICON } from '../world/palettes.js';

const TEAM = [
  ['Lucas Valentin', 'AI / HTML / CSS'], ['Magnus Froberg', 'AI / HTML / CSS'], ['Mathias Ejstrup', 'Design / Grafik'],
  ['Ronja Helander', 'Design / Grafik'], ['Sebastian Elgaard', 'AI / Design'],
];

export default {
  render() {
    const status = store.get('authStatus') || {};
    const first = status.firstRun;
    const cur = describeWorld();
    const showcase = APPS.filter(a => ['hubtech', 'byteforge', 'circuitpilot', 'cursor'].includes(a.id));

    const seasonBtns = h('div', { class: 'landing-seasons', role: 'radiogroup', 'aria-label': 'Prøv årstiderne' },
      SEASONS.map(s => {
        const b = h('button', { class: 'chip', role: 'radio', 'aria-checked': String(cur.season === s), 'aria-pressed': String(cur.season === s), dataset: { s } }, icon(SEASON_ICON[s]), SEASON_LABEL[s]);
        b.addEventListener('click', () => {
          setWorld({ seasonMode: 'manual', season: s });
          seasonBtns.querySelectorAll('button').forEach(x => { const on = x.dataset.s === s; x.setAttribute('aria-checked', String(on)); x.setAttribute('aria-pressed', String(on)); });
        });
        return b;
      }));

    const appTiles = showcase.map(app => {
      const cv = h('canvas', { 'aria-hidden': 'true' });
      requestAnimationFrame(() => paintStill(cv, app.art));
      return h('article', { class: 'land-app glass', style: { '--app': app.hue } },
        h('div', { class: 'land-app-art' }, cv, h('span', { class: 'app-card-icon' }, icon(app.icon))),
        h('div', { class: 'land-app-body' }, h('h3', null, app.name), h('p', null, app.description)));
    });

    const features = [
      ['cube', 'Rigtige projekter', 'Læser dine faktiske Cursor-projekter og git-status lokalt og åbner dem i Cursor med ét klik. Ingen demo-data forklædt som dine.'],
      ['graduation', 'Læring der huskes', 'Opstartskurset og CircuitPilot gemmer fremdrift, noter og resultater på din konto – og samler XP i ét level.'],
      ['mountain', 'En levende verden', 'Fire årstider, tid på dagen og vejr i et håndmalet landskab, der aldrig står i vejen for arbejdet.'],
      ['shield', 'Dine data, din maskine', 'Kører på din egen computer med krypterede adgangskoder, sikre sessioner og ingen cloud.'],
    ];

    return h('div', { class: 'public landing' },
      h('header', { class: 'public-nav' },
        h('a', { class: 'brand', href: '#/' }, logo(38), h('span', { class: 'brand-name' }, 'HUB', h('b', null, 'TECH'))),
        h('nav', { 'aria-label': 'Offentlig menu' },
          h('a', { href: '#apps', onclick: (e) => { e.preventDefault(); document.getElementById('apps')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Apps'),
          h('a', { href: '#features', onclick: (e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Platformen'),
          h('a', { href: '#team', onclick: (e) => { e.preventDefault(); document.getElementById('team')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Holdet'),
          first ? null : h('a', { class: 'btn btn-ghost', href: '#/login' }, 'Log ind'),
          h('a', { class: 'btn btn-primary', href: first ? '#/signup' : status.signupAllowed ? '#/signup' : '#/login' }, first ? 'Opsæt platformen' : 'Kom i gang', icon('arrowRight')))),
      h('section', { class: 'landing-hero' },
        h('div', { class: 'landing-hero-inner' },
          h('div', { class: 'eyebrow' }, 'HUBTECH · ByteForge · CircuitPilot · Cursor'),
          h('h1', { class: 'landing-title' }, 'Ét univers til alt, du ', h('span', { class: 'grad-text' }, 'bygger'), ', lærer og udforsker.'),
          h('p', { class: 'landing-lead' }, 'Dine apps, Cursor-projekter, kurser og elektronik-lab samlet i ét personligt arbejdsrum – på din egen maskine.'),
          h('div', { class: 'landing-cta' },
            h('a', { class: 'btn btn-primary btn-lg', href: first ? '#/signup' : status.signupAllowed ? '#/signup' : '#/login' }, first ? 'Opret ejerkonto' : 'Kom i gang', icon('arrowRight')),
            first ? null : h('a', { class: 'btn btn-lg', href: '#/login' }, 'Log ind')),
          first ? h('p', { class: 'landing-note' }, icon('sparkles'), 'Første gang? Den første konto bliver platformens ejer.') : null,
          canConnectToFriend() ? h('p', { class: 'landing-note' }, icon('users'), 'Skal du være med på en vens HUBTECH? ',
            h('button', { class: 'link-btn', type: 'button', onclick: () => connectToFriendDialog() }, 'Forbind til en vens HUBTECH')) : null,
          h('div', { class: 'landing-try' }, h('span', { class: 'faint' }, 'Prøv verdenen:'), seasonBtns)),
        h('button', { class: 'scroll-cue', 'aria-label': 'Rul ned', onclick: () => document.getElementById('apps')?.scrollIntoView({ behavior: 'smooth' }) }, icon('chevronDown'))),
      h('section', { class: 'landing-section', id: 'apps' },
        h('div', { class: 'section-head' }, h('div', { class: 'eyebrow' }, 'Fire verdener'), h('h2', null, 'Ét produkt. Én identitet.'), h('p', { class: 'muted' }, 'Hver app har sin egen farve og sit eget formål – men deler login, profil, søgning, guides og den samme levende verden.')),
        h('div', { class: 'land-apps' }, appTiles)),
      h('section', { class: 'landing-section', id: 'features' },
        h('div', { class: 'section-head' }, h('div', { class: 'eyebrow' }, 'Platformen'), h('h2', null, 'Smuk – og ærlig om, hvad der virker.')),
        h('div', { class: 'land-features' }, features.map(([ic, t, d]) => h('div', { class: 'land-feature glass' }, h('span', { class: 'row-icon' }, icon(ic)), h('h3', null, t), h('p', { class: 'muted' }, d))))),
      h('footer', { class: 'landing-foot', id: 'team' },
        h('div', { class: 'glass panel foot-card' },
          h('div', null, h('div', { class: 'eyebrow' }, 'Folkene bag HUBTECH'), h('ul', { class: 'team' }, TEAM.map(([n, r]) => h('li', null, h('b', null, n), h('span', { class: 'faint' }, r))))),
          h('div', { class: 'foot-links' },
            h('a', { class: 'btn', href: '#/login?next=%2Fapps%2Fcommunity' }, icon('chat'), 'Support i Fællesskab'),
            h('a', { class: 'btn', href: 'mailto:HUBTECH2025@proton.me' }, icon('mail'), 'Skriv til os'),
            h('a', { class: 'btn', href: 'https://github.com/Lucas050908/ByteForge', target: '_blank', rel: 'noopener' }, icon('code'), 'ByteForge på GitHub'))),
        h('p', { class: 'faint foot-copy' }, '© HUBTECH · Kører lokalt · Dine data bliver hos dig')));
  },
};
