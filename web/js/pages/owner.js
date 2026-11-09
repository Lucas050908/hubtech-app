/**
 * Ejer – the owner's app: everything only the owner decides, in one place.
 * Tabs: Overblik · Brugere · Adgang · Server · Hent HUBTECH. (Admin is for moderation; the owner is in charge.)
 */
import { h, clear, timeAgo, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast, busy, errorToast, stateBlock, segmented, switchControl, modal } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { deleteUserDialog } from '../features/userdelete.js';
import { relayPanel, mailServerPanel, backupPanel, networkPanel, updatePanel } from './settings.js';
import { qrSvg } from '../features/qr.js';

const TABS = [
  { value: 'overview', label: 'Overblik', icon: 'dashboard' },
  { value: 'users', label: 'Brugere', icon: 'users' },
  { value: 'access', label: 'Adgang', icon: 'globe' },
  { value: 'server', label: 'Server', icon: 'server' },
  { value: 'download', label: 'Hent HUBTECH', icon: 'download' },
];
const mb = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);

/** A password that is easy to read aloud and passes the rules (e.g. "Kage-Sol-4821"). */
function tempPassword() {
  const W = ['Kage', 'Sol', 'Bjerg', 'Hav', 'Skov', 'Ugle', 'Lampe', 'Regn', 'Sne', 'Ræv', 'Pil', 'Stjerne', 'Bølge', 'Mos', 'Kat'];
  const pick = () => W[crypto.getRandomValues(new Uint32Array(1))[0] % W.length];
  return `${pick()}-${pick()}-${pick().toLowerCase()}-${1000 + crypto.getRandomValues(new Uint32Array(1))[0] % 9000}`;
}
const copyBtn = (text, label = 'Kopiér') => h('button', { class: 'btn btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Kopieret', { type: 'ok' }); } catch { /* */ } } }, icon('copy'), label);

function tile(ic, label, value, hint, href) {
  return h(href ? 'a' : 'div', { class: 'adm-tile glass', href }, h('span', { class: 'adm-tile-icon' }, icon(ic)),
    h('div', null, h('div', { class: 'adm-tile-value' }, String(value)), h('div', { class: 'adm-tile-label' }, label), hint ? h('div', { class: 'faint adm-tile-hint' }, hint) : null));
}

async function overviewTab(box) {
  const o = await api.get('/api/owner/overview');
  const todo = [];
  if (!o.publicAccess) todo.push(['globe', 'Lad venner på andre netværk være med', '#/apps/owner/access']);
  if (!o.storeUrl) todo.push(['download', 'Indsæt linket til Microsoft Store, når appen er godkendt', '#/apps/owner/download']);
  if (!o.lastBackup) todo.push(['database', 'Tag en sikkerhedskopi', '#/apps/owner/server']);
  box.append(
    h('div', { class: 'adm-tiles' },
      tile('users', 'Brugere', o.users, `${o.newWeek} nye denne uge`, '#/apps/owner/users'),
      tile('globe', 'Online nu', o.online),
      tile('shield', 'Admins', o.admins, 'Dem, du har givet adgang', '#/apps/owner/users'),
      tile('userPlus', 'Nye konti', o.signupMode === 'open' ? 'Alle' : 'Kun dig', o.signupMode === 'open' ? 'Alle kan oprette sig' : 'Du opretter dem', '#/apps/owner/access'),
      tile('link', 'Venner udefra', o.publicAccess ? 'Til' : 'Fra', o.publicAccess ? 'HUBTECH kan nås fra internettet' : 'Kun dette netværk', '#/apps/owner/access'),
      tile('database', 'Sikkerhedskopi', o.lastBackup ? timeAgo(o.lastBackup) : 'Ingen', `Database: ${mb(o.dbBytes)}`, '#/apps/owner/server')),
    todo.length ? h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Kom godt i gang'),
      h('div', { class: 'own-todo' }, todo.map(([ic, t, href]) => h('a', { class: 'own-todo-row', href }, icon(ic), h('span', null, t), icon('chevronRight')))))
      : h('section', { class: 'glass panel' }, h('div', { class: 'desk-status is-on' }, icon('checkCircle'), h('span', null, `Alt er sat op. HUBTECH ${o.version}.`))));
}

function newPasswordDialog(u) {
  const pw = tempPassword();
  const inp = h('input', { class: 'input mono', value: pw, 'aria-label': 'Ny adgangskode', autocomplete: 'off', spellcheck: 'false' });
  const go = h('button', { class: 'btn btn-primary' }, icon('key'), 'Giv ny adgangskode');
  const err = h('p', { class: 'field-error', style: { margin: 0 } });
  go.addEventListener('click', busy(go, async () => {
    try {
      await api.post(`/api/owner/users/${u.id}/password`, { password: inp.value });
      m.close();
      const sent = inp.value;
      modal({ title: 'Ny adgangskode', label: u.name, size: 440,
        body: h('div', { class: 'stack', style: { display: 'grid', gap: '10px' } },
          h('p', { class: 'muted', style: { margin: 0 } }, `Giv ${u.name} adgangskoden herunder. ${u.name} er logget ud alle steder og kan ændre den under Indstillinger → Sikkerhed.`),
          h('div', { class: 'fw-url' }, h('b', { class: 'mono' }, sent), copyBtn(sent))) });
    } catch (e) { err.textContent = e.message; }
  }));
  const m = modal({ title: `Ny adgangskode til ${u.name}`, label: 'Glemt adgangskode', size: 440,
    body: h('div', { class: 'stack', style: { display: 'grid', gap: '10px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, 'Har personen glemt sin adgangskode? Giv dem en ny. Du kan bruge forslaget eller skrive din egen.'), inp, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annullér'), go] });
}

function transferDialog(u, done) {
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Din adgangskode' });
  const go = h('button', { class: 'btn btn-danger' }, icon('crown'), `Gør ${u.name} til ejer`);
  const err = h('p', { class: 'field-error', style: { margin: 0 } });
  go.addEventListener('click', busy(go, async () => {
    try { await api.post(`/api/owner/users/${u.id}/transfer`, { password: pw.value }); m.close(); toast(`${u.name} er nu ejer`, { type: 'ok', text: 'Du er nu medlem med adgang til Admin.' }); done(); }
    catch (e) { err.textContent = e.message; }
  }));
  const m = modal({ title: `Overdrag ejerskabet til ${u.name}?`, label: 'Ejerskab', size: 460,
    body: h('div', { class: 'stack', style: { display: 'grid', gap: '10px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, `${u.name} bliver ejer og bestemmer over alt. Du bliver et almindeligt medlem med adgang til Admin – og kan kun blive ejer igen, hvis ${u.name} giver dig det tilbage.`),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bekræft med din adgangskode'), pw), err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annullér'), go] });
  setTimeout(() => pw.focus(), 60);
}

function signupSwitch(mode, onChange) {
  return switchControl({ checked: mode === 'open', label: 'Alle kan oprette en konto', onChange: async (on) => {
    try { await api.put('/api/users/signup', { mode: on ? 'open' : 'first' }); toast(on ? 'Alle kan nu oprette en konto' : 'Kun du kan oprette konti', { type: 'ok', text: on ? 'Nye konti bliver almindelige medlemmer.' : '' }); onChange?.(on); }
    catch (e) { errorToast(e); }
  } });
}

async function usersTab(box) {
  const [r, list0] = await Promise.all([api.get('/api/admin/users'), api.get('/api/users')]);
  const list = h('div', { class: 'adm-users' });
  const count = h('h2', { class: 'panel-title' });
  const draw = async (reload) => {
    if (reload) Object.assign(r, await api.get('/api/admin/users'));
    count.textContent = `${r.users.length} brugere`;
    clear(list);
    for (const u of r.users) {
      const owner = u.role === 'owner', me = u.id === r.me;
      const act = (ic, label, fn, cls = '') => h('button', { class: `btn btn-sm btn-ghost ${cls}`, title: label, 'aria-label': `${label}: ${u.name}`, onclick: fn }, icon(ic), h('span', { class: 'own-act-label' }, label));
      list.append(h('div', { class: 'adm-user glass' },
        h('span', { class: ['cm-ava', u.online && 'is-online'] }, ava(u.avatar)),
        h('div', { class: 'adm-user-text' }, h('b', null, u.name, me ? ' (dig)' : ''), h('div', { class: 'faint' }, `@${u.username}${u.email ? ` · ${u.email}` : ''}`),
          h('div', { class: 'faint' }, u.online ? 'Online nu' : u.lastLoginAt ? `Sidst logget ind ${timeAgo(u.lastLoginAt)}` : 'Har aldrig logget ind')),
        h('div', { class: 'adm-user-actions' },
          owner ? h('span', { class: 'chip chip-ok' }, icon('crown'), 'Ejer') : h('label', { class: 'adm-access' }, switchControl({ checked: u.admin, label: `Admin for ${u.name}`, onChange: async (v) => {
            try { await api.put(`/api/admin/access/${u.id}`, { admin: v }); u.admin = v; toast(v ? `${u.name} er nu admin` : `${u.name} er ikke længere admin`, { type: 'ok' }); } catch (e) { errorToast(e); draw(); }
          } }), h('span', null, 'Admin')),
          me ? null : act('key', 'Ny adgangskode', () => newPasswordDialog(u)),
          me || owner ? null : act('crown', 'Gør til ejer', () => transferDialog(u, () => { store.set('user', { ...store.get('user'), role: 'member' }); navigate('/', { replace: true }); })),
          me || owner ? null : act('trash', 'Slet', () => deleteUserDialog(u, () => draw(true)), 'adm-del'))));
    }
  };
  await draw();
  // create someone's account: username, name – and a password HUBTECH suggests
  const un = h('input', { class: 'input', autocomplete: 'off', maxlength: 32, 'aria-label': 'Brugernavn', placeholder: 'fx emma' });
  const dn = h('input', { class: 'input', maxlength: 60, 'aria-label': 'Navn', placeholder: 'fx Emma' });
  const pw = h('input', { class: 'input mono', value: tempPassword(), 'aria-label': 'Adgangskode', autocomplete: 'off', spellcheck: 'false' });
  const result = h('div', { 'aria-live': 'polite' });
  const create = h('button', { class: 'btn btn-primary' }, icon('userPlus'), 'Opret konto');
  create.addEventListener('click', busy(create, async () => {
    try {
      const pass = pw.value;
      await api.post('/api/users', { username: un.value.trim(), displayName: dn.value.trim() || un.value.trim(), password: pass });
      const text = `Hej! Du har fået en konto på HUBTECH.\nBrugernavn: ${un.value.trim()}\nAdgangskode: ${pass}\nHent HUBTECH: ${location.origin}/#/hent`;
      h(clear(result), null, h('div', { class: 'fw-step is-ok' }, icon('checkCircle'), h('div', null, h('span', null, `Kontoen @${un.value.trim()} er oprettet. Send oplysningerne til personen:`), h('pre', { class: 'own-invite mono' }, text), copyBtn(text, 'Kopiér besked'))));
      un.value = dn.value = ''; pw.value = tempPassword();
      draw(true);
    } catch (e) { errorToast(e, 'Kunne ikke oprette kontoen'); }
  }));
  box.append(
    h('section', { class: 'glass panel' }, count,
      h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'Giv nogen admin-adgang, en ny adgangskode, hvis de har glemt den, eller slet deres konto. Du kan også overdrage ejerskabet.'), list),
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Opret en konto til en ven'),
      h('div', { class: 'own-create' }, un, dn, h('div', { class: 'own-pw' }, pw, h('button', { class: 'btn btn-sm btn-ghost', title: 'Nyt forslag', 'aria-label': 'Nyt forslag til adgangskode', onclick: () => { pw.value = tempPassword(); } }, icon('refresh'))), create),
      result,
      list0.signupFromEnv ? null : h('div', { class: 'own-row' }, h('div', null, h('b', null, 'Alle kan oprette en konto'), h('p', { class: 'faint', style: { margin: '2px 0 0' } }, 'Så kan venner selv oprette sig på login-siden. Nye konti er altid almindelige medlemmer.')), signupSwitch(list0.signupMode))));
}

async function accessTab(box) {
  const u = await api.get('/api/users');
  box.append(
    u.signupFromEnv ? null : h('section', { class: 'glass panel' }, h('div', { class: 'own-row' },
      h('div', null, h('h2', { class: 'panel-title' }, 'Hvem kan oprette en konto?'), h('p', { class: 'faint', style: { margin: '2px 0 0' } }, 'Fra: kun du opretter konti (under Brugere). Til: alle kan oprette sig på login-siden – altid som almindelige medlemmer.')),
      signupSwitch(u.signupMode))),
    networkPanel(), relayPanel());
}

function serverTab(box) {
  box.append(mailServerPanel(), backupPanel(), updatePanel());
}

async function downloadTab(box) {
  const d = await api.get('/api/download');
  const page = `${d.webUrl || location.origin}/#/hent`;
  const store = h('input', { class: 'input', type: 'url', value: d.storeUrl || '', placeholder: 'https://apps.microsoft.com/detail/…', 'aria-label': 'Link til Microsoft Store', autocapitalize: 'off', spellcheck: 'false' });
  const apk = h('input', { class: 'input', type: 'url', value: d.apkCustom ? d.apkUrl : '', placeholder: 'https://…/HUBTECH.apk', 'aria-label': 'Link til Android-appen', autocapitalize: 'off', spellcheck: 'false' });
  const save = h('button', { class: 'btn btn-primary btn-sm' }, icon('check'), 'Gem');
  save.addEventListener('click', busy(save, async () => {
    try { await api.put('/api/download', { storeUrl: store.value.trim(), apkUrl: apk.value.trim() }); toast('Gemt', { type: 'ok', text: 'Hent HUBTECH-siden er opdateret.' }); }
    catch (e) { errorToast(e); }
  }));
  const qr = h('div', { class: 'own-qr' });
  qrSvg(page, 180).then(el => qr.append(el)).catch(() => {});
  const upQr = h('div', { class: 'own-qr' });
  qrSvg(d.latestApk, 180).then(el => upQr.append(el)).catch(() => {});
  const share = `Hent HUBTECH her: ${page}`;
  box.append(
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Send denne side til dine venner'),
      h('p', { class: 'muted', style: { margin: '4px 0 12px' } }, 'Siden finder selv ud af, om din ven har Windows, Android eller noget andet, og viser den rigtige knap. Den virker uden login.'),
      h('div', { class: 'own-share' }, qr, h('div', { class: 'stack', style: { display: 'grid', gap: '8px', alignContent: 'start' } },
        h('b', { class: 'mono own-link' }, page),
        h('div', { class: 'fw-actions' }, copyBtn(page, 'Kopiér link'), copyBtn(share, 'Kopiér besked'), h('a', { class: 'btn btn-sm btn-ghost', href: '#/hent', target: '_blank', rel: 'noopener' }, icon('external'), 'Se siden')),
        d.webUrl ? null : h('p', { class: 'faint small', style: { margin: 0 } }, 'Tip: slå “Venner på andre netværk” til under Adgang – så virker linket overalt, ikke kun på dit eget netværk.')))),
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Opdatér en ældre app på mobilen'),
      h('p', { class: 'muted', style: { margin: '4px 0 12px' } }, 'Har nogen en gammel HUBTECH-app på Android? De scanner koden, og den nyeste version installeres oven på den gamle – deres data bliver liggende. Koden peger altid på den nyeste version, så du kan printe den eller gemme den. Appen tjekker også selv efter opdateringer hver dag.'),
      h('div', { class: 'own-share' }, upQr, h('div', { class: 'stack', style: { display: 'grid', gap: '8px', alignContent: 'start' } },
        h('b', { class: 'mono own-link' }, d.latestApk), h('div', { class: 'fw-actions' }, copyBtn(d.latestApk, 'Kopiér link'))))),
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Hvor hentes appen?'),
      h('p', { class: 'muted', style: { margin: '4px 0 12px' } }, 'Når HUBTECH er godkendt i Microsoft Store, så åbn appens side i Store, kopiér linket og sæt det ind her. Android-appen hentes automatisk i den nyeste version fra GitHub.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Microsoft Store (Windows)'), store),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Android-app (valgfri – tomt = den nyeste fra GitHub)'), apk),
      save));
}

export default {
  title: 'Ejer',
  render(ctx) {
    const app = appById('owner');
    const tab = TABS.some(t => t.value === ctx.params?.sub) ? ctx.params.sub : 'overview';
    const box = h('div', { class: 'adm-body stack' });
    const run = { overview: overviewTab, users: usersTab, access: accessTab, server: serverTab, download: downloadTab }[tab];
    Promise.resolve(run(box)).catch((e) => box.append(stateBlock({ kind: 'error', icon: 'alert', title: 'Kunne ikke hentes', text: e.message })));
    return h('div', { class: 'page admin-page owner-page' },
      appHero(app, { eyebrow: 'Kun for dig', lead: 'Alt, kun du som ejer bestemmer over – samlet ét sted.', compact: true }),
      h('nav', { class: 'adm-tabs', 'aria-label': 'Ejer' }, segmented(TABS, tab, (v) => navigate(`/apps/owner/${v}`), { label: 'Ejer' })),
      box);
  },
};
