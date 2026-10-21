/**
 * Admin – the platform's control room. Only the owner and the people the owner gives access can open it.
 * Tabs: Overblik · Brugere · Anmeldelser · Besked til alle · Log. Only the owner can change who has access.
 */
import { h, clear, timeAgo, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast, busy, errorToast, confirmDialog, stateBlock, segmented, switchControl } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';

const TABS = [
  { value: 'overview', label: 'Overblik', icon: 'dashboard' },
  { value: 'users', label: 'Brugere', icon: 'users' },
  { value: 'reports', label: 'Anmeldelser', icon: 'flag' },
  { value: 'announce', label: 'Besked til alle', icon: 'bell' },
  { value: 'errors', label: 'Fejl', icon: 'alert' },
  { value: 'log', label: 'Log', icon: 'clock' },
];
const ACTION = { 'access-on': 'gav adgang til Admin', 'access-off': 'fjernede adgang til Admin', logout: 'loggede ud', announce: 'sendte beskeden', minecraft: 'ændrede Minecraft-serveren', 'errors-clear': 'ryddede fejllisten' };
const mb = (b) => (b == null ? '–' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const dur = (s) => (s < 3600 ? `${Math.round(s / 60)} min.` : s < 86400 ? `${Math.floor(s / 3600)} t. ${Math.round((s % 3600) / 60)} min.` : `${Math.floor(s / 86400)} d. ${Math.floor((s % 86400) / 3600)} t.`);
const date = (t) => (t ? new Date(t * 1000).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

function tile(ic, label, value, hint) {
  return h('div', { class: 'adm-tile glass' }, h('span', { class: 'adm-tile-icon' }, icon(ic)),
    h('div', null, h('div', { class: 'adm-tile-value' }, String(value)), h('div', { class: 'adm-tile-label' }, label), hint ? h('div', { class: 'faint adm-tile-hint' }, hint) : null));
}

async function overviewTab(box) {
  const o = await api.get('/api/admin/overview');
  box.append(
    h('div', { class: 'adm-tiles' },
      tile('users', 'Brugere', o.users, `${o.newUsers7d} nye de sidste 7 dage`),
      tile('globe', 'Online nu', o.online),
      tile('user', 'Logget ind i dag', o.logins24h),
      tile('chat', 'Beskeder i dag', o.messages24h, `${o.servers} servere i Fællesskab`),
      tile('flag', 'Åbne anmeldelser', o.openReports),
      tile('code', 'Apps i App-værkstedet', o.studioApps),
      tile('file', 'Dokumenter i Office', o.documents),
      tile('bell', 'Enheder med notifikationer', o.pushDevices, o.mailReady ? 'Mail er sat op' : 'Mail er ikke sat op')),
    h('section', { class: 'glass panel' },
      h('h2', { class: 'panel-title' }, 'Serveren'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Version'), h('dd', null, `HUBTECH ${o.version}${o.storeApp ? ' (Microsoft Store)' : ''}`),
        h('dt', null, 'Kører på'), h('dd', null, `${o.os} · Python ${o.python}`),
        h('dt', null, 'Oppe i'), h('dd', null, dur(o.uptime)),
        h('dt', null, 'Database'), h('dd', null, mb(o.dbBytes)),
        h('dt', null, 'Ledig plads'), h('dd', null, mb(o.diskFree)),
        h('dt', null, 'Administratorer'), h('dd', null, String(o.admins)))));
}

async function usersTab(box) {
  const r = await api.get('/api/admin/users');
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Søg efter navn eller brugernavn', 'aria-label': 'Søg brugere' });
  const list = h('div', { class: 'adm-users' });
  const draw = () => {
    clear(list);
    const s = q.value.trim().toLowerCase();
    const rows = r.users.filter(u => !s || u.name.toLowerCase().includes(s) || u.username.toLowerCase().includes(s));
    if (!rows.length) { list.append(h('p', { class: 'faint' }, 'Ingen brugere matcher.')); return; }
    for (const u of rows) {
      const owner = u.role === 'owner';
      const access = owner ? h('span', { class: 'chip chip-ok' }, icon('crown'), 'Ejer')
        : r.isOwner ? h('label', { class: 'adm-access' }, switchControl({ checked: u.admin, label: `Adgang til Admin for ${u.name}`, onChange: async (v) => {
          try { await api.put(`/api/admin/access/${u.id}`, { admin: v }); u.admin = v; toast(v ? `${u.name} har nu adgang til Admin` : `${u.name} har ikke længere adgang`, { type: 'ok' }); }
          catch (e) { errorToast(e); draw(); }
        } }), h('span', null, 'Admin'))
          : u.admin ? h('span', { class: 'chip' }, icon('shield'), 'Admin') : null;
      const out = u.id !== r.me && !(owner && !r.isOwner) && u.sessions ? h('button', { class: 'btn btn-sm btn-ghost', title: 'Log ud på alle enheder' }, icon('logout'), 'Log ud') : null;
      out?.addEventListener('click', busy(out, async () => {
        if (!await confirmDialog({ title: `Log ${u.name} ud?`, text: `${u.name} bliver logget ud på alle enheder (${u.sessions}) og skal logge ind igen.`, confirmLabel: 'Log ud', danger: true })) return;
        try { const x = await api.post(`/api/admin/users/${u.id}/logout`, {}); u.sessions = 0; toast(`${u.name} er logget ud`, { type: 'ok', text: `${x.sessions} enhed(er).` }); draw(); }
        catch (e) { errorToast(e); }
      }));
      list.append(h('div', { class: 'adm-user glass' },
        h('span', { class: ['cm-ava', u.online && 'is-online'] }, ava(u.avatar)),
        h('div', { class: 'adm-user-text' }, h('b', null, u.name), h('div', { class: 'faint' }, `@${u.username}${u.email ? ` · ${u.email}` : ''}`),
          h('div', { class: 'faint' }, u.online ? 'Online nu' : u.lastLoginAt ? `Sidst logget ind ${timeAgo(u.lastLoginAt)}` : 'Har aldrig logget ind', ` · oprettet ${date(u.createdAt)}`)),
        h('div', { class: 'adm-user-actions' }, access, out)));
    }
  };
  q.addEventListener('input', draw);
  draw();
  box.append(h('section', { class: 'glass panel' },
    h('div', { class: 'adm-head' }, h('h2', { class: 'panel-title' }, `${r.users.length} brugere`), q),
    r.isOwner ? h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'Slå “Admin” til for dem, der skal kunne åbne denne app. Kun du som ejer kan ændre det. Nye brugere opretter du under Indstillinger → Brugere.') : null,
    list));
}

async function reportsTab(box) {
  let show = 'open';
  const list = h('div', { class: 'adm-reports' });
  const load = async () => {
    clear(list);
    const r = await api.get(`/api/cm/reports?show=${show}`);
    if (!r.reports.length) { list.append(stateBlock({ icon: 'check', title: show === 'open' ? 'Ingen åbne anmeldelser' : 'Ingen anmeldelser endnu', text: 'Når nogen anmelder en besked, en story eller en bruger i Fællesskab, kommer det her.' })); return; }
    for (const rep of r.reports) {
      const act = (a, label, cls) => {
        const b = h('button', { class: ['btn', 'btn-sm', cls] }, label);
        b.addEventListener('click', busy(b, async () => { try { await api.post(`/api/cm/reports/${rep.id}/handle`, { action: a }); toast('Anmeldelsen er behandlet', { type: 'ok' }); load(); } catch (e) { errorToast(e); } }));
        return b;
      };
      list.append(h('div', { class: 'adm-report glass' },
        h('div', { class: 'adm-report-top' }, h('span', { class: 'chip' }, { message: 'Besked', story: 'Story', user: 'Bruger', server: 'Server' }[rep.kind] || rep.kind),
          rep.server ? h('span', { class: 'faint' }, `på ${rep.server.name}`) : null, h('span', { class: 'faint' }, timeAgo(rep.at))),
        rep.snapshot ? h('blockquote', { class: 'adm-snap' }, rep.snapshot) : null,
        h('div', { class: 'faint' }, `Anmeldt af ${rep.reporter?.name || '?'}${rep.target ? ` · gælder ${rep.target.name}` : ''}${rep.reason ? ` · “${rep.reason}”` : ''}`),
        rep.handled ? h('div', { class: 'chip chip-ok' }, icon('check'), `${rep.handled.by}: ${{ dismiss: 'afvist', delete: 'slettet', resolved: 'løst' }[rep.handled.action] || rep.handled.action}`)
          : h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, ['message', 'story'].includes(rep.kind) ? act('delete', 'Slet indholdet', 'btn-danger') : null, act('resolved', 'Løst'), act('dismiss', 'Afvis', 'btn-ghost'))));
    }
  };
  box.append(h('section', { class: 'glass panel' },
    h('div', { class: 'adm-head' }, h('h2', { class: 'panel-title' }, 'Anmeldelser i Fællesskab'),
      segmented([{ value: 'open', label: 'Åbne' }, { value: 'all', label: 'Alle' }], show, (v) => { show = v; load().catch(errorToast); }, { label: 'Vis' })),
    list));
  await load();
}

function announceTab(box) {
  const title = h('input', { class: 'input', maxlength: 80, placeholder: 'Fx “Ny version af HUBTECH”', 'aria-label': 'Overskrift' });
  const text = h('textarea', { class: 'input', rows: 4, maxlength: 300, placeholder: 'Hvad skal alle vide?', 'aria-label': 'Besked' });
  const send = h('button', { class: 'btn btn-primary' }, icon('send'), 'Send til alle');
  send.addEventListener('click', busy(send, async () => {
    if (!title.value.trim()) { toast('Skriv en overskrift', { type: 'warn' }); title.focus(); return; }
    if (!await confirmDialog({ title: 'Send til alle brugere?', text: `“${title.value.trim()}” sendes til alle – i appen, som notifikation på deres enheder og på mail til dem, der har slået det til.`, confirmLabel: 'Send' })) return;
    try { const r = await api.post('/api/admin/announce', { title: title.value, text: text.value }); toast('Beskeden er sendt', { type: 'ok', text: `Til ${r.sent} brugere.` }); title.value = ''; text.value = ''; }
    catch (e) { errorToast(e); }
  }));
  box.append(h('section', { class: 'glass panel adm-announce' },
    h('h2', { class: 'panel-title' }, 'Besked til alle'),
    h('p', { class: 'muted', style: { margin: '4px 0 12px' } }, 'En kort besked til alle brugere: nyheder, planlagt nedetid eller nye regler. Den kommer i appen, som notifikation på telefonen og på mail til dem, der har slået mails til.'),
    h('div', { class: 'set-stack' }, title, text, h('div', null, send))));
}

async function errorsTab(box) {
  const r = await api.get('/api/admin/errors');
  const clearBtn = h('button', { class: 'btn btn-sm btn-ghost' }, icon('trash'), 'Ryd listen');
  clearBtn.addEventListener('click', busy(clearBtn, async () => { await api.del('/api/admin/errors'); toast('Listen er ryddet', { type: 'ok' }); navigate('/apps/admin/errors', { replace: true }); }));
  const KIND = { 'ai-load': 'AI: start', 'ai-chat': 'AI: svar', js: 'Script', promise: 'Script' };
  box.append(h('section', { class: 'glass panel' },
    h('div', { class: 'adm-head' }, h('h2', { class: 'panel-title' }, 'Fejl fra brugernes enheder'), r.errors.length ? clearBtn : null),
    h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'Tekniske fejl, som browserne har sendt – fx når AI-assistenten ikke kan starte. Der gemmes ingen samtaler eller indtastninger.'),
    r.errors.length ? h('div', { class: 'adm-log' }, r.errors.map(x => h('div', { class: 'adm-err' },
      h('div', { class: 'adm-report-top' }, h('span', { class: 'chip' }, KIND[x.kind] || x.kind), h('span', { class: 'faint' }, `${x.user || 'Ikke logget ind'} · ${timeAgo(x.at)}${x.page ? ` · ${x.page}` : ''}`)),
      h('div', { class: 'mono adm-err-msg' }, x.message),
      Object.keys(x.extra || {}).length ? h('div', { class: 'faint adm-err-extra' }, Object.entries(x.extra).map(([k, v]) => `${k}: ${v}`).join(' · ')) : null)))
      : stateBlock({ icon: 'check', title: 'Ingen fejl', text: 'Der er ikke kommet nogen fejl fra brugernes enheder.' })));
}

async function logTab(box) {
  const r = await api.get('/api/admin/log');
  box.append(h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Hvad administratorerne har gjort'),
    r.log.length ? h('div', { class: 'adm-log' }, r.log.map(l => h('div', { class: 'adm-log-row' },
      h('span', { class: 'cm-ava' }, ava(l.avatar)), h('div', null, h('b', null, l.user), ` ${ACTION[l.action] || l.action}`, l.detail ? h('span', null, ` “${l.detail}”`) : null),
      h('span', { class: 'faint' }, timeAgo(l.at)))))
      : h('p', { class: 'faint' }, 'Intet endnu.')));
}

export default {
  title: 'Admin',
  render(ctx) {
    const app = appById('admin');
    const user = store.get('user');
    const tab = TABS.some(t => t.value === ctx.params?.sub) ? ctx.params.sub : 'overview';
    const box = h('div', { class: 'adm-body stack' });
    const run = { overview: overviewTab, users: usersTab, reports: reportsTab, announce: announceTab, errors: errorsTab, log: logTab }[tab];
    Promise.resolve(run(box)).catch((e) => box.append(stateBlock({ kind: 'error', icon: 'alert', title: 'Kunne ikke hentes', text: e.message })));
    return h('div', { class: 'page admin-page' },
      appHero(app, { eyebrow: user.role === 'owner' ? 'Du er ejer' : 'Du er administrator', lead: 'Styr platformen: brugere, anmeldelser og beskeder til alle.', compact: true }),
      h('nav', { class: 'adm-tabs', 'aria-label': 'Admin' }, segmented(TABS, tab, (v) => navigate(`/apps/admin/${v}`), { label: 'Admin' })),
      box);
  },
};
