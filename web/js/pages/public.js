/**
 * The public link (#/p/<token>) – a form, a booking page, a personal page, a poll or a tournament that someone shared.
 * Works without an account. Each app supplies its own view (publicView in its page module).
 * At the bottom: an invitation to make your own on HUBTECH.
 */
import { h } from '../core/dom.js';
import { icon, logo } from '../core/icons.js';
import { store } from '../core/store.js';
import { sh } from '../features/shared.js';

const VIEWS = {
  form: () => import('./forms.js'), booking: () => import('./booking.js'), page: () => import('./pages-builder.js'),
  poll: () => import('./polls.js'), tournament: () => import('./tournaments.js'), event: () => import('./events.js'),
  wiki: () => import('./wiki.js'), album: () => import('./albums.js'), expense: () => import('./expenses.js'), challenge: () => import('./challenges.js'), board: () => import('./board.js'), wishlist: () => import('./wishlist.js'),
  signup: () => import('./together2.js'), datepoll: () => import('./together2.js'), songs: () => import('./together2.js'), chores: () => import('./together2.js'),
};
const PAGE = { poll: 'polls', event: 'events', form: 'forms', album: 'albums', expense: 'expenses', wiki: 'wiki', challenge: 'challenges', booking: 'booking', page: 'pages', board: 'board', tournament: 'tournaments', wishlist: 'wishlist', shoplist: 'shopping', signup: 'signup', datepoll: 'datepoll', songs: 'songs', chores: 'chores' };
const MAKE = { form: 'Lav din egen formular', booking: 'Lav din egen bookingside', page: 'Lav din egen side', poll: 'Lav din egen afstemning', tournament: 'Lav din egen turnering', event: 'Lav dit eget arrangement', wishlist: 'Lav din egen ønskeseddel', album: 'Lav dit eget fotoalbum', wiki: 'Lav din egen wiki', signup: 'Lav din egen fordeling', datepoll: 'Find en dato med dine venner', songs: 'Lav din egen ønskeliste til festen' };

export async function renderPublic(token) {
  const wrap = (body, app) => h('div', { class: 'pub-page' },
    h('header', { class: 'pub-head' }, h('a', { class: 'pub-brand', href: '#/' }, logo(), h('span', null, 'HUBTECH'))),
    h('main', { class: 'pub-main' }, body),
    h('footer', { class: 'pub-foot' }, h('span', null, app && MAKE[app] ? `${MAKE[app]} – gratis på HUBTECH.` : 'Lavet med HUBTECH.'),
      store.get('user') ? h('a', { class: 'btn btn-sm', href: '#/' }, 'Åbn HUBTECH') : h('a', { class: 'btn btn-sm btn-primary', href: '#/hent' }, icon('sparkles'), 'Prøv HUBTECH')));
  let data;
  try { data = await sh.pub(token); } catch (e) {
    return wrap(h('div', { class: 'pub-card pub-missing' }, icon('link'), h('h1', null, 'Linket virker ikke'), h('p', { class: 'muted' }, e.status === 404 ? 'Det er måske blevet slettet, eller ejeren har lukket for linket.' : e.message)));
  }
  const app = data.doc.app;
  if (data.signedIn && ['owner', 'editor', 'member'].includes(data.doc.role) && !['form', 'booking', 'page'].includes(app)) {
    location.hash = `#/apps/${PAGE[app] || app}/d/${data.doc.id}?t=${token}`;
  }
  const mod = await (VIEWS[app] || VIEWS.form)();
  const view = await mod.publicView(data, token);
  document.title = `${data.doc.title || 'HUBTECH'} · HUBTECH`;
  return wrap(view, app);
}
