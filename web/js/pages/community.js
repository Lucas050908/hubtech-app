/**
 * Fællesskab — HUBTECH's own chat: servers with channels, roles and rules (like Discord), friends, private messages,
 * snaps and stories (like Snapchat), and music rooms where everyone listens together. Everything stays on this
 * HUBTECH server; live updates come through core/live.js.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal, confirmDialog, stateBlock, segmented } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { chatView, fmtTime } from '../community/chat.js';
import { musicView } from '../community/music.js';
import { sendSnap, openSnap, storyStrip } from '../community/snaps.js';
import { reportDialog, memberCard, inviteDialog, serverSettings, reportsView, ROLE_DA, RANK } from '../community/admin.js';
import { callUser, callGroup, pickFriends, joinVoice, currentCall } from '../features/calls.js';

const BASE = '/apps/community';
const SERVER_ICONS = ['🔧', '💻', '🎮', '🎵', '📚', '⚡', '🏠', '⚽', '🚀', '🧪', '🎨', '🍕'];
const COLORS = ['#5865f2', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#0ea5e9', '#14b8a6', '#64748b'];

let cleanup = [];

export default {
  title: 'Fællesskab',
  destroy() { cleanup.forEach(f => { try { f(); } catch { /* */ } }); cleanup = []; },
  async render(ctx) {
    this.destroy();
    let me;
    try { me = await api.get('/api/cm/me'); }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Fællesskab kunne ikke åbnes', text: e.message })); }
    const page = h('div', { class: 'page cm-page', style: { '--app': 'var(--hue-community, #5865f2)' } });
    if (!me.ageOk) { page.appendChild(ageGate(me, () => location.reload())); return page; }
    page.appendChild(buildApp({ me }, ctx.params || {}));
    return page;
  },
};

function ageGate(me, done) {
  const year = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1900, max: new Date().getFullYear(), placeholder: 'Fx 2004', 'aria-label': 'Fødselsår', style: { maxWidth: '160px' } });
  const ok = h('input', { type: 'checkbox' });
  const err = h('div', { class: 'field-error', role: 'alert' });
  const go = async () => {
    err.textContent = '';
    try { await api.post('/api/cm/me/age', { birthYear: Number(year.value), acceptRules: ok.checked }); done(); }
    catch (e) { err.textContent = e.message; }
  };
  year.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('section', { class: 'cm-gate glass panel' },
    h('div', { class: 'cm-gate-ic' }, icon('chat')),
    h('div', { class: 'eyebrow' }, 'Fællesskab'),
    h('h1', null, 'Snak, del og lyt til musik sammen'),
    h('p', null, 'Opret servere med kanaler til dine venner, kollegaer eller klassen. Send beskeder og snaps, del stories i 24 timer, og lyt til musik sammen. Du kan dele noter, aftaler og kodestumper direkte fra dine andre apps.'),
    h('ul', { class: 'cm-gate-list' },
      h('li', null, icon('shield'), `Fællesskab er for brugere på ${me.minAge} år og derover.`),
      h('li', null, icon('flag'), 'Du kan altid anmelde og blokere andre. Moderatorer kan gøre folk tavse, smide dem ud og udelukke dem.'),
      h('li', null, icon('lock'), 'Snaps kan kun åbnes én gang og sendes kun mellem venner.')),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Dit fødselsår'), year),
    h('label', { class: 'cal-pcheck' }, ok, h('span', null, 'Jeg accepterer ', h('a', { href: '/legal/regler.html', target: '_blank', rel: 'noopener' }, 'reglerne for Fællesskab'), ' og har læst ', h('a', { href: '/legal/privatliv.html', target: '_blank', rel: 'noopener' }, 'privatlivspolitikken'), '.')),
    err,
    h('button', { class: 'btn btn-primary btn-lg', onclick: go }, icon('arrowRight'), 'Kom i gang'));
}

function buildApp(cm, params) {
  const rail = h('nav', { class: 'cm-rail', 'aria-label': 'Servere' });
  const side = h('aside', { class: 'cm-side' });
  const main = h('main', { class: 'cm-main', id: 'cm-main' });
  const membersEl = h('aside', { class: 'cm-members', 'aria-label': 'Medlemmer' });
  const shell = h('div', { class: 'cm-app glass', dataset: { pane: 'list' } }, rail, side, main, membersEl);

  const S = { servers: [], dms: [], friends: null, detail: null, view: null, chat: null, music: null, strip: null, reports: null, showMembers: matchMedia('(min-width: 1180px)').matches };
  const debounce = (fn, ms) => { let t = 0; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

  // ── navigation inside Fællesskab (no full page re-render) ──
  function go(path, { push = true } = {}) {
    const url = `#${BASE}${path}`;
    if (location.hash !== url) push ? history.pushState(null, '', url) : history.replaceState(null, '', url);
    route(path);
  }
  function setPane(p) { shell.dataset.pane = p; }

  async function loadServers() { try { S.servers = (await api.get('/api/cm/servers')).servers; } catch { /* */ } drawRail(); }
  async function loadDms() { try { S.dms = (await api.get('/api/cm/dms')).dms; } catch { /* */ } if (!S.detail) drawSide(); drawRail(); }
  async function loadFriends() { try { S.friends = await api.get('/api/cm/friends'); } catch { /* */ } if (!S.detail) drawSide(); drawRail(); }
  const reloadServers = debounce(loadServers, 400), reloadDms = debounce(loadDms, 400);

  // ── rail ──
  function drawRail() {
    const current = S.detail?.server.id;
    const homeUnread = S.dms.reduce((n, d) => n + d.unread + d.snaps, 0) + (S.friends?.incoming.length || 0);
    const badge = (n) => n ? h('span', { class: 'cm-badge', 'aria-label': `${n} ulæste` }, n > 99 ? '99+' : String(n)) : null;
    h(clear(rail), null,
      h('button', { class: ['cm-rail-btn is-home', !current && 'is-active'], title: 'Venner og beskeder', 'aria-label': 'Venner og beskeder', onclick: () => go('') }, icon('chat'), badge(homeUnread)),
      h('div', { class: 'cm-rail-sep', role: 'separator' }),
      S.servers.map(s => h('button', { class: ['cm-rail-btn', current === s.id && 'is-active'], style: { '--sc': s.color }, title: s.name, 'aria-label': `${s.name}${s.unread ? `, ${s.unread} ulæste` : ''}`, 'aria-current': current === s.id ? 'true' : null, onclick: () => go(`/s/${s.id}`) },
        s.icon || s.name.slice(0, 2).toUpperCase(), badge(s.unread))),
      h('button', { class: 'cm-rail-btn is-add', title: 'Opret en server', 'aria-label': 'Opret en server', onclick: createServer }, icon('plus')),
      h('button', { class: ['cm-rail-btn is-add', S.view === 'discover' && 'is-active'], title: 'Opdag servere', 'aria-label': 'Opdag servere', onclick: () => go('/discover') }, icon('compass')));
  }

  // ── side panel ──
  function drawSide() {
    if (S.detail) return drawServerSide();
    const item = (path, ic, label, n, key) => h('button', { class: ['cm-nav', S.view === key && 'is-active'], onclick: () => go(path) }, icon(ic), h('span', null, label), n ? h('span', { class: 'cm-badge' }, String(n)) : null);
    h(clear(side), null,
      h('header', { class: 'cm-side-h' }, h('span', { class: 'cm-ava' }, cm.me.user.avatar), h('div', null, h('b', null, cm.me.user.name), h('div', { class: 'faint' }, `@${cm.me.user.username}`))),
      h('div', { class: 'cm-side-body' },
        item('', 'users', 'Venner', S.friends?.incoming.length, 'friends'),
        item('/snaps', 'camera', 'Snaps', S.dms.reduce((n, d) => n + d.snaps, 0), 'snaps'),
        item('/discover', 'compass', 'Opdag servere', 0, 'discover'),
        item('/reports', 'shield', 'Anmeldelser', 0, 'reports'),
        h('div', { class: 'cm-side-sec' }, h('span', null, 'Private beskeder')),
        S.dms.length ? S.dms.map(d => h('button', { class: ['cm-dm', S.view === d.channel && 'is-active', d.unread && 'is-unread'], onclick: () => go(`/dm/${d.channel}`) },
          h('span', { class: ['cm-ava', d.user.online && 'is-online'] }, d.user.avatar),
          h('span', { class: 'cm-dm-t' }, h('b', null, d.user.name), h('span', { class: 'faint' }, d.snaps ? `📸 ${d.snaps} ny snap` : d.last ? `${d.last.mine ? 'Dig: ' : ''}${d.last.body}` : 'Sig hej 👋')),
          d.unread ? h('span', { class: 'cm-badge' }, String(d.unread)) : null))
          : h('p', { class: 'faint cm-side-empty' }, 'Når du har venner, kan I skrive sammen her.')));
  }
  function drawServerSide() {
    const d = S.detail, s = d.server;
    const myRank = RANK[d.me.role];
    const menu = h('div', { class: 'cm-menu', hidden: true, role: 'menu' },
      myRank >= 2 ? h('button', { role: 'menuitem', onclick: () => { menu.hidden = true; inviteDialog(s); } }, icon('userPlus'), 'Invitér folk') : null,
      myRank >= 3 ? h('button', { role: 'menuitem', onclick: () => { menu.hidden = true; serverSettings(cm, d, { onChanged: () => openServer(s.id, S.view), onDeleted: () => { toast('Serveren er slettet', { type: 'ok' }); S.detail = null; loadServers(); go(''); } }); } }, icon('settings'), 'Indstillinger') : null,
      h('button', { role: 'menuitem', onclick: () => { menu.hidden = true; rulesDialog(d); } }, icon('book'), 'Regler'),
      d.me.role !== 'owner' ? h('button', { role: 'menuitem', onclick: async () => { menu.hidden = true; if (await confirmDialog({ title: `Forlad ${s.name}?`, confirmLabel: 'Forlad', danger: true })) { try { await api.post(`/api/cm/servers/${s.id}/leave`); S.detail = null; loadServers(); go(''); } catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); } } } }, icon('logout'), 'Forlad serveren') : null,
      d.me.role !== 'owner' ? h('button', { role: 'menuitem', onclick: () => { menu.hidden = true; reportDialog({ kind: 'server', ref: s.id, what: s.name }); } }, icon('flag'), 'Anmeld serveren') : null);
    const head = h('button', { class: 'cm-side-h is-server', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => { menu.hidden = !menu.hidden; e.currentTarget.setAttribute('aria-expanded', String(!menu.hidden)); } },
      h('span', { class: 'cm-srv-ic', style: { '--sc': s.color } }, s.icon || s.name.slice(0, 2).toUpperCase()), h('b', null, s.name), icon('chevronDown'));
    const chans = d.channels.map(c => c.kind === 'voice'
      ? h('div', { class: 'cm-voice' },
        h('button', { class: ['cm-chan', currentCall()?.id === c.id && 'is-active'], title: 'Deltag i talekanalen', onclick: () => joinVoice(c.id, c.name) }, icon('volume'), h('span', null, c.name),
          (d.voice?.[c.id] || []).length ? h('span', { class: 'cm-voice-n' }, String(d.voice[c.id].length)) : null),
        (d.voice?.[c.id] || []).map(u => h('div', { class: 'cm-voice-u' }, h('span', { class: 'cm-ava cm-ava-sm' }, u.avatar), h('span', null, u.name))))
      : h('button', { class: ['cm-chan', S.view === c.id && 'is-active', c.unread && 'is-unread'], onclick: () => go(`/c/${c.id}`) },
        icon(c.kind === 'music' ? 'music' : c.postRole !== 'member' ? 'lock' : 'hash'), h('span', null, c.name), c.unread && S.view !== c.id ? h('span', { class: 'cm-badge' }, String(c.unread)) : null));
    h(clear(side), null, h('div', { class: 'cm-side-hw' }, head, menu),
      h('div', { class: 'cm-side-body' },
        s.description ? h('p', { class: 'faint cm-srv-desc' }, s.description) : null,
        h('div', { class: 'cm-side-sec' }, h('span', null, 'Kanaler'), myRank >= 3 ? h('button', { class: 'icon-btn', 'aria-label': 'Ny kanal', title: 'Ny kanal', onclick: () => serverSettings(cm, d, { onChanged: () => openServer(s.id, S.view) }) }, icon('plus')) : null),
        chans));
    const offMenu = (e) => { if (!head.parentNode?.contains(e.target)) menu.hidden = true; };
    document.addEventListener('pointerdown', offMenu, true);
    cleanup.push(() => document.removeEventListener('pointerdown', offMenu, true));
  }
  function drawMembers() {
    const d = S.detail;
    membersEl.hidden = !d || !S.showMembers;
    shell.classList.toggle('has-members', !membersEl.hidden);
    if (membersEl.hidden) return;
    const groups = ['owner', 'admin', 'moderator', 'member'].map(r => [r, d.members.filter(m => m.role === r)]).filter(([, l]) => l.length);
    h(clear(membersEl), null, groups.map(([r, l]) => h('section', null, h('div', { class: 'cm-side-sec' }, h('span', null, `${r === 'member' ? 'Medlemmer' : ROLE_DA[r] + (r === 'owner' ? '' : 'e')} – ${l.length}`)),
      l.map(m => h('button', { class: ['cm-member', !m.online && 'is-off'], onclick: () => openUser(m) }, h('span', { class: ['cm-ava', m.online && 'is-online'] }, m.avatar),
        h('span', null, m.name), r === 'owner' ? icon('crown') : null, m.muted ? h('span', { class: 'faint', title: 'Gjort tavs' }, icon('mute')) : null)))));
  }

  // ── main views ──
  function teardownView() { S.chat?.destroy(); S.music?.destroy(); S.chat = S.music = S.strip = S.reports = null; }
  function header(ic, title, sub, tools = []) {
    return h('header', { class: 'cm-main-h' },
      h('button', { class: 'icon-btn cm-back', 'aria-label': 'Tilbage', onclick: () => { setPane('list'); } }, icon('chevronLeft')),
      h('span', { class: 'cm-main-ic' }, icon(ic)), h('div', { class: 'cm-main-t' }, h('h1', null, title), sub ? h('p', { class: 'faint' }, sub) : null),
      h('div', { class: 'cm-main-tools' }, tools));
  }
  function openUser(u) { memberCard(cm, u, { server: S.detail, myRole: S.detail?.me.role, onChanged: () => { if (S.detail) openServer(S.detail.server.id, S.view); loadFriends(); loadDms(); }, openDm: (x) => go(`/dm/${dmId(x.id)}`) }); }
  const dmId = (other) => { const a = cm.me.user.id; return `dm-${Math.min(a, other)}-${Math.max(a, other)}`; };

  async function friendsView() {
    S.view = 'friends'; S.detail = null; drawRail(); drawSide(); drawMembers();
    const strip = storyStrip(cm, { onReport: reportDialog });
    S.strip = strip;
    let tab = S.friends?.incoming.length ? 'incoming' : 'friends';
    const body = h('div', { class: 'cm-pane-body' });
    const add = h('input', { class: 'input', placeholder: 'Skriv et brugernavn', 'aria-label': 'Brugernavn', autocapitalize: 'off', spellcheck: 'false', autocomplete: 'off' });
    const sugg = h('div', { class: 'cm-sugg', role: 'listbox', hidden: true });
    const addFriend = async (name) => {
      try { const r = await api.post('/api/cm/friends', { username: name || add.value.trim() }); toast(r.status === 'friends' ? 'I er nu venner' : 'Venneanmodning sendt', { type: 'ok' }); add.value = ''; sugg.hidden = true; await loadFriends(); draw(); }
      catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); }
    };
    let qt = 0;
    add.addEventListener('input', () => {
      clearTimeout(qt);
      qt = setTimeout(async () => {
        const q = add.value.trim();
        if (q.length < 2) { sugg.hidden = true; return; }
        try {
          const r = await api.get(`/api/cm/users?q=${encodeURIComponent(q)}`);
          h(clear(sugg), null, r.users.map(u => h('button', { type: 'button', role: 'option', class: 'sc-item', onclick: () => addFriend(u.username) }, h('span', { class: 'cm-ava' }, u.avatar), h('span', null, h('b', null, u.name), h('span', { class: 'faint' }, `@${u.username}`)))));
          sugg.hidden = !r.users.length;
        } catch { sugg.hidden = true; }
      }, 220);
    });
    add.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFriend(); });
    const row = (u, actions) => h('div', { class: 'cm-frow' }, h('button', { class: ['cm-ava', u.online && 'is-online'], 'aria-label': `Profil: ${u.name}`, onclick: () => openUser(u) }, u.avatar),
      h('span', { class: 'cm-frow-t' }, h('b', null, u.name), h('span', { class: 'faint' }, `@${u.username} · ${u.online ? 'online' : 'offline'}`)), h('div', { class: 'cm-frow-a' }, actions));
    const draw = () => {
      const f = S.friends || { friends: [], incoming: [], outgoing: [], blocked: [] };
      const seg = segmented([{ value: 'friends', label: `Venner (${f.friends.length})` }, { value: 'incoming', label: `Anmodninger${f.incoming.length ? ` (${f.incoming.length})` : ''}` }, { value: 'blocked', label: 'Blokerede' }], tab, (v) => { tab = v; draw(); }, { label: 'Vis' });
      let content;
      if (tab === 'friends') content = f.friends.length ? f.friends.map(u => row(u, [
        h('button', { class: 'icon-btn', title: 'Send besked', 'aria-label': `Skriv til ${u.name}`, onclick: () => go(`/dm/${dmId(u.id)}`) }, icon('chat')),
        h('button', { class: 'icon-btn', title: 'Ring op', 'aria-label': `Ring til ${u.name}`, onclick: () => callUser(u) }, icon('phone')),
        h('button', { class: 'icon-btn', title: 'Send snap', 'aria-label': `Send snap til ${u.name}`, onclick: () => sendSnap(cm, [u.id]) }, icon('camera')),
        h('button', { class: 'icon-btn', title: 'Fjern ven', 'aria-label': `Fjern ${u.name} som ven`, onclick: async () => { if (await confirmDialog({ title: `Fjern ${u.name} som ven?`, confirmLabel: 'Fjern', danger: true })) { await api.del(`/api/cm/friends/${u.id}`).catch(() => {}); await loadFriends(); loadDms(); draw(); } } }, icon('x'))]))
        : [stateBlock({ icon: 'users', title: 'Ingen venner endnu', text: 'Skriv et brugernavn ovenfor for at sende en venneanmodning. Venner kan skrive privat og sende snaps til hinanden.' })];
      else if (tab === 'incoming') content = [...f.incoming.map(u => row(u, [
        h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { await api.post(`/api/cm/friends/${u.id}/accept`).catch(e => toast(e.message, { type: 'bad' })); await loadFriends(); loadDms(); draw(); } }, icon('check'), 'Accepter'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await api.del(`/api/cm/friends/${u.id}`).catch(() => {}); await loadFriends(); draw(); } }, 'Afvis')])),
        ...f.outgoing.map(u => row(u, [h('span', { class: 'faint' }, 'Sendt'), h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await api.del(`/api/cm/friends/${u.id}`).catch(() => {}); await loadFriends(); draw(); } }, 'Fortryd')]))];
      else content = f.blocked.map(u => row(u, [h('button', { class: 'btn btn-sm', onclick: async () => { await api.del(`/api/cm/blocks/${u.id}`).catch(() => {}); await loadFriends(); draw(); } }, 'Fjern blokering')]));
      if (!content.length) content = [h('p', { class: 'faint' }, tab === 'incoming' ? 'Ingen ventende anmodninger.' : 'Du har ikke blokeret nogen.')];
      h(clear(body), null, h('div', { class: 'cm-addf' }, h('div', { class: 'cm-addf-in' }, add, sugg), h('button', { class: 'btn btn-primary', onclick: () => addFriend() }, icon('userPlus'), 'Tilføj ven')),
        h('div', { class: 'cm-pane-tools' }, seg), content);
    };
    const groupCall = async () => { const f = S.friends?.friends || []; const pick = await pickFriends(f); if (pick?.length) callGroup(pick); };
    h(clear(main), null, header('users', 'Venner', 'Stories, venner og anmodninger', [h('button', { class: 'btn btn-sm', onclick: groupCall }, icon('phone'), 'Gruppeopkald'), h('button', { class: 'btn btn-sm', onclick: () => sendSnap(cm) }, icon('camera'), 'Snap')]), h('div', { class: 'cm-scroll' }, strip.el, body));
    draw();
    if (!S.friends) { await loadFriends(); draw(); }
  }

  async function snapsView() {
    S.view = 'snaps'; S.detail = null; drawRail(); drawSide(); drawMembers();
    const body = h('div', { class: 'cm-pane-body' }, h('p', { class: 'faint' }, 'Henter …'));
    const load = async () => {
      let d;
      try { d = await api.get('/api/cm/snaps'); } catch (e) { h(clear(body), null, h('p', { class: 'field-error' }, e.message)); return; }
      h(clear(body), null,
        h('button', { class: 'cm-snapcta', onclick: () => sendSnap(cm) }, icon('camera'), h('span', null, h('b', null, 'Tag en snap'), h('span', { class: 'faint' }, 'Kun venner kan modtage den – og den kan kun åbnes én gang'))),
        h('h2', { class: 'cm-h2' }, `Modtaget (${d.inbox.length})`),
        d.inbox.length ? d.inbox.map(s => h('button', { class: 'cm-snaprow is-new', onclick: () => openSnap(s, () => { load(); loadDms(); }) }, h('span', { class: 'cm-snapbox', 'aria-hidden': 'true' }),
          h('span', null, h('b', null, s.from.name), h('span', { class: 'faint' }, `Tryk for at se · ${fmtTime(s.at)}`)))) : h('p', { class: 'faint' }, 'Ingen nye snaps.'),
        h('h2', { class: 'cm-h2' }, 'Sendt'),
        d.sent.length ? d.sent.map(s => h('div', { class: 'cm-snaprow' }, h('span', { class: ['cm-snapbox is-sent', s.opened && 'is-opened'], 'aria-hidden': 'true' }),
          h('span', null, h('b', null, s.to.name), h('span', { class: 'faint' }, `${s.opened ? `Åbnet ${fmtTime(s.opened)}` : 'Leveret'} · sendt ${fmtTime(s.at)}`)))) : h('p', { class: 'faint' }, 'Du har ikke sendt nogen snaps endnu.'));
    };
    S.reloadSnaps = load;
    h(clear(main), null, header('camera', 'Snaps', 'Billeder, der forsvinder, når de er set'), h('div', { class: 'cm-scroll' }, body));
    load();
  }

  async function discoverView() {
    S.view = 'discover'; S.detail = null; drawRail(); drawSide(); drawMembers();
    const q = h('input', { class: 'input', placeholder: 'Søg efter servere', 'aria-label': 'Søg efter servere' });
    const code = h('input', { class: 'input', placeholder: 'Invitationskode eller -link', 'aria-label': 'Invitationskode', autocapitalize: 'off', spellcheck: 'false' });
    const grid = h('div', { class: 'cm-disc-grid' });
    const load = async () => {
      try {
        const d = await api.get(`/api/cm/discover?q=${encodeURIComponent(q.value.trim())}`);
        h(clear(grid), null, d.servers.length ? d.servers.map(s => h('article', { class: 'cm-disc glass-soft', style: { '--sc': s.color } },
          h('div', { class: 'cm-disc-ic' }, s.icon || s.name.slice(0, 2)), h('h3', null, s.name), h('p', { class: 'faint' }, s.description || 'Ingen beskrivelse.'),
          h('div', { class: 'cm-disc-f' }, h('span', { class: 'faint' }, icon('users'), ` ${s.members} medlemmer`),
            s.joined ? h('button', { class: 'btn btn-sm', onclick: () => go(`/s/${s.id}`) }, 'Åbn') : h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { try { await api.post(`/api/cm/servers/${s.id}/join`); await loadServers(); go(`/s/${s.id}`); } catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); } } }, 'Tilslut'))))
          : h('p', { class: 'faint' }, 'Ingen offentlige servere fundet. Opret din egen – og slå “Vis under Opdag” til i indstillingerne.'));
      } catch (e) { grid.textContent = e.message; }
    };
    let t = 0; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
    const join = () => { const c = code.value.trim().split('/').pop(); if (c) go(`/invite/${c}`); };
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    h(clear(main), null, header('compass', 'Opdag servere', 'Find et fællesskab – eller start dit eget'),
      h('div', { class: 'cm-scroll' }, h('div', { class: 'cm-pane-body' },
        h('div', { class: 'cm-addf' }, h('div', { class: 'cm-addf-in' }, code), h('button', { class: 'btn', onclick: join }, icon('link'), 'Tilslut med kode'), h('button', { class: 'btn btn-primary', onclick: createServer }, icon('plus'), 'Opret server')),
        q, grid)));
    load();
  }

  async function reportsPane() {
    S.view = 'reports'; S.detail = null; drawRail(); drawSide(); drawMembers();
    S.reports = reportsView(cm, {});
    h(clear(main), null, header('shield', 'Anmeldelser', 'For moderatorer: anmeldt indhold fra dine servere'), h('div', { class: 'cm-scroll' }, S.reports.el));
  }

  async function inviteView(code) {
    S.view = 'invite'; S.detail = null; drawRail(); drawSide(); drawMembers();
    h(clear(main), null, header('userPlus', 'Invitation', ''), h('div', { class: 'cm-scroll' }, h('p', { class: 'faint', style: { padding: '20px' } }, 'Henter invitationen …')));
    try {
      const d = await api.get(`/api/cm/invites/${encodeURIComponent(code)}`);
      const s = d.server;
      h(clear(main), null, header('userPlus', 'Invitation', ''), h('div', { class: 'cm-scroll' }, h('section', { class: 'cm-invite glass-soft', style: { '--sc': s.color } },
        h('div', { class: 'cm-disc-ic' }, s.icon || s.name.slice(0, 2)), h('p', { class: 'faint' }, 'Du er inviteret til'), h('h2', null, s.name), s.description ? h('p', null, s.description) : null,
        h('p', { class: 'faint' }, icon('users'), ` ${s.members} medlemmer`),
        d.joined ? h('button', { class: 'btn btn-primary', onclick: () => go(`/s/${s.id}`) }, 'Åbn serveren')
          : h('button', { class: 'btn btn-primary btn-lg', onclick: async () => { try { await api.post(`/api/cm/invites/${encodeURIComponent(code)}/join`); await loadServers(); go(`/s/${s.id}`, { push: false }); } catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); } } }, 'Tilslut serveren'))));
    } catch (e) { h(clear(main), null, header('userPlus', 'Invitation', ''), stateBlock({ icon: 'alert', title: 'Invitationen virker ikke', text: e.message, actions: [h('button', { class: 'btn', onclick: () => go('/discover') }, 'Opdag servere')] })); }
  }

  async function dmView(cid) {
    if (!alive) return;
    S.view = cid; S.detail = null; drawRail(); drawSide(); drawMembers();
    const other = S.dms.find(d => d.channel === cid)?.user;
    const name = other?.name || 'Privat samtale';
    const chat = chatView(cm, { channelId: cid, title: name, dm: true, placeholder: `Skriv til ${name}`, canWrite: () => true, onReport: reportDialog, onUser: openUser, onRead: () => { const d = S.dms.find(x => x.channel === cid); if (d && d.unread) { d.unread = 0; drawSide(); drawRail(); } } });
    S.chat = chat;
    h(clear(main), null, header('chat', name, other ? `@${other.username} · ${other.online ? 'online' : 'offline'}` : '', other ? [
      h('button', { class: 'icon-btn', title: 'Ring op', 'aria-label': `Ring til ${name}`, onclick: () => callUser(other) }, icon('phone')),
      h('button', { class: 'icon-btn', title: 'Videoopkald', 'aria-label': `Videoopkald med ${name}`, onclick: () => callUser(other, { video: true }) }, icon('video')),
      h('button', { class: 'icon-btn', title: 'Send snap', 'aria-label': 'Send snap', onclick: () => sendSnap(cm, [other.id]) }, icon('camera')),
      h('button', { class: 'icon-btn', title: 'Profil', 'aria-label': 'Profil', onclick: () => openUser(other) }, icon('user'))] : []), chat.el);
    setTimeout(() => chat.focus(), 50);
  }

  function rulesDialog(d) {
    const m = modal({ title: `Regler for ${d.server.name}`, label: 'Fællesskab', size: 560, body: h('div', { class: 'cm-rules' }, d.server.rules),
      actions: [h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Luk')] });
  }

  async function openServer(sid, channelId) {
    let d;
    try { d = await api.get(`/api/cm/servers/${sid}`); }
    catch (e) {
      S.detail = null; drawRail(); drawSide();
      h(clear(main), null, header('alert', 'Serveren kan ikke åbnes', ''), stateBlock({ icon: 'alert', title: 'Serveren kan ikke åbnes', text: e.message, actions: [h('button', { class: 'btn', onclick: () => go('') }, 'Til Venner')] }));
      setPane('main');
      return;
    }
    if (!alive) return;
    const sameChat = S.detail?.server.id === sid && S.view === channelId && S.chat;
    S.detail = d;
    const s0 = S.servers.find(x => x.id === sid);
    if (!s0) loadServers();
    const c = d.channels.find(x => x.id === channelId && x.kind !== 'voice') || d.channels.find(x => x.kind === 'text' && RANK[d.me.role] >= RANK[x.postRole]) || d.channels.find(x => x.kind === 'text') || d.channels[0];
    if (!c) return;
    if (c.id !== channelId) history.replaceState(null, '', `#${BASE}/c/${c.id}`);
    S.view = c.id;
    drawRail(); drawSide(); drawMembers();
    if (sameChat) { S.chat.refreshComposer(); return; }
    teardownView();
    S.view = c.id;
    const canWrite = () => !!S.detail?.me.rulesAccepted && S.detail.me.mutedUntil * 1000 < Date.now() && RANK[S.detail.me.role] >= RANK[c.postRole];
    const gate = () => {
      if (S.detail?.me.rulesAccepted) return null;
      return h('div', { class: 'cm-rulesgate' }, h('div', { class: 'eyebrow' }, icon('book'), ' Serverens regler'), h('div', { class: 'cm-rules' }, S.detail.server.rules),
        h('button', { class: 'btn btn-primary', onclick: async () => { try { await api.post(`/api/cm/servers/${sid}/rules`); S.detail.me.rulesAccepted = true; S.chat?.refreshComposer(); toast('Velkommen! Nu kan du skrive.', { type: 'ok' }); } catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); } } }, icon('check'), 'Jeg accepterer reglerne'));
    };
    const readOnlyText = () => S.detail.me.mutedUntil * 1000 > Date.now() ? `Du er gjort tavs indtil ${new Date(S.detail.me.mutedUntil * 1000).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}.` : `Kun ${ROLE_DA[c.postRole].toLowerCase()}e og højere kan skrive i #${c.name}.`;
    const chat = chatView(cm, { channelId: c.id, title: c.name, topic: c.topic, canWrite, gate, readOnlyText, onReport: reportDialog, onUser: openUser,
      canModerate: () => RANK[S.detail?.me.role] >= 2, placeholder: c.kind === 'music' ? `Snak om musikken i #${c.name}` : `Skriv i #${c.name}`,
      onRead: () => { const ch = S.detail?.channels.find(x => x.id === c.id); if (ch && ch.unread) { const srv = S.servers.find(x => x.id === sid); if (srv) srv.unread = Math.max(0, srv.unread - ch.unread); ch.unread = 0; drawSide(); drawRail(); } } });
    S.chat = chat;
    let musicEl = null;
    if (c.kind === 'music') { S.music = musicView(cm, { channelId: c.id, canControl: () => !!S.detail?.me.rulesAccepted && S.detail.me.mutedUntil * 1000 < Date.now(), canModerate: () => RANK[S.detail?.me.role] >= 2 }); musicEl = S.music.el; }
    const myRank = RANK[d.me.role];
    h(clear(main), null,
      header(c.kind === 'music' ? 'music' : 'hash', c.name, c.topic || d.server.name, [
        myRank >= 2 ? h('button', { class: 'icon-btn', title: 'Invitér folk', 'aria-label': 'Invitér folk', onclick: () => inviteDialog(d.server) }, icon('userPlus')) : null,
        h('button', { class: 'icon-btn', title: 'Medlemmer', 'aria-label': 'Vis medlemmer', 'aria-pressed': String(S.showMembers), onclick: (e) => { S.showMembers = !S.showMembers; e.currentTarget.setAttribute('aria-pressed', String(S.showMembers)); if (matchMedia('(max-width: 900px)').matches) { S.showMembers = false; membersSheet(); } drawMembers(); } }, icon('users'))]),
      musicEl, chat.el);
    setPane('main');
    if (d.me.rulesAccepted) setTimeout(() => chat.focus(), 50);
  }
  function membersSheet() {
    const d = S.detail;
    const m = modal({ title: `Medlemmer – ${d.members.length}`, label: d.server.name, size: 420,
      body: h('div', { class: 'sc-list' }, d.members.map(x => h('button', { class: 'sc-item', onclick: () => { m.close(); openUser(x); } }, h('span', { class: ['cm-ava', x.online && 'is-online'] }, x.avatar), h('span', null, h('b', null, x.name), h('span', { class: 'faint' }, `${ROLE_DA[x.role]} · ${x.online ? 'online' : 'offline'}`))))),
      actions: [h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Luk')] });
  }

  async function findServerOf(cid) {
    if (S.detail?.channels.some(c => c.id === cid)) return S.detail.server.id;
    if (!S.servers.length) await loadServers();
    for (const s of S.servers) {
      try { const d = await api.get(`/api/cm/servers/${s.id}`); if (d.channels.some(c => c.id === cid)) return s.id; } catch { /* */ }
    }
    return null;
  }

  function createServer() {
    let ic = SERVER_ICONS[0], color = COLORS[0];
    const name = h('input', { class: 'input', maxlength: 50, placeholder: `${cm.me.user.name}s server`, 'aria-label': 'Navn' });
    const icons = h('div', { class: 'cm-iconpick', role: 'group', 'aria-label': 'Ikon' });
    const cols = h('div', { class: 'cal-swatches', role: 'group', 'aria-label': 'Farve' });
    const draw = () => {
      h(clear(icons), null, SERVER_ICONS.map(x => h('button', { type: 'button', class: 'cm-iconbtn', 'aria-pressed': String(x === ic), onclick: () => { ic = x; draw(); } }, x)));
      h(clear(cols), null, COLORS.map(c => h('button', { type: 'button', class: 'cal-swatch', style: { '--sw': c }, 'aria-label': c, 'aria-pressed': String(c === color), onclick: () => { color = c; draw(); } })));
    };
    draw();
    const err = h('div', { class: 'field-error' });
    const go2 = async () => {
      try { const r = await api.post('/api/cm/servers', { name: name.value.trim() || `${cm.me.user.name}s server`, icon: ic, color }); m.close(); await loadServers(); go(`/s/${r.server.id}`); toast('Serveren er oprettet', { type: 'ok', text: 'Invitér folk via menuen øverst til venstre.' }); }
      catch (e) { err.textContent = e.message; }
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go2(); });
    const m = modal({ title: 'Opret en server', label: 'Fællesskab', size: 520,
      body: h('div', { class: 'stack', style: { gap: '12px' } }, h('p', { class: 'faint', style: { margin: 0 } }, 'Du får kanalerne #velkommen, #generelt og en musikkanal – og du kan tilføje flere. Serveren er privat, indtil du vælger andet.'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ikon'), icons), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Farve'), cols), err),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: go2 }, 'Opret')] });
    setTimeout(() => name.focus(), 50);
  }

  // ── routing ──
  async function route(path) {
    const [, sub, id] = path.split('/');
    const keepServer = sub === 'c' && S.detail?.channels.some(c => c.id === id);
    if (!keepServer) teardownView();
    if (!sub) { await friendsView(); setPane(params._first ? 'list' : 'main'); params._first = false; return; }
    if (sub === 'friends') { await friendsView(); setPane('main'); return; }
    if (sub === 'snaps') { await snapsView(); setPane('main'); return; }
    if (sub === 'discover') { await discoverView(); setPane('main'); return; }
    if (sub === 'reports') { await reportsPane(); setPane('main'); return; }
    if (sub === 'invite' && id) { await inviteView(id); setPane('main'); return; }
    if (sub === 'dm' && id) { if (!S.dms.length) await loadDms(); await dmView(id); setPane('main'); return; }
    if (sub === 's' && id) { await openServer(id); return; }
    if (sub === 'c' && id) {
      const sid = await findServerOf(id);
      if (!sid) { toast('Kanalen findes ikke længere', { type: 'warn' }); go('', { push: false }); return; }
      await openServer(sid, id); return;
    }
    go('', { push: false });
  }
  // the browser's back button changes the hash, so the router renders the page again for that address
  let alive = true;
  cleanup.push(() => { alive = false; teardownView(); });

  // ── live updates ──
  cleanup.push(onLive('*', (ev) => {
    switch (ev.type) {
      case 'msg':
        if (S.chat && S.view === ev.channel) { S.chat.onLive(ev); if (ev.channel.startsWith('dm-')) reloadDms(); break; }
        if (ev.channel.startsWith('dm-')) { reloadDms(); break; }
        if (ev.message.user.id === cm.me.user.id) break;
        if (S.detail?.server.id === ev.server) { const ch = S.detail.channels.find(c => c.id === ev.channel); if (ch) { ch.unread = (ch.unread || 0) + 1; drawSide(); } }
        { const srv = S.servers.find(s => s.id === ev.server); if (srv) { srv.unread = (srv.unread || 0) + 1; drawRail(); } else reloadServers(); }
        break;
      case 'msg-edit': case 'msg-delete': case 'msg-react': case 'typing':
        if (S.chat && S.view === ev.channel) S.chat.onLive(ev);
        break;
      case 'music': S.music?.onLive(ev); break;
      case 'voice': if (S.detail?.server.id === ev.server) { S.detail.voice = { ...(S.detail.voice || {}), [ev.channel]: ev.users }; drawSide(); } break;
      case 'server':
        reloadServers();
        if (S.detail?.server.id === ev.server) openServer(ev.server, S.view);
        break;
      case 'server-gone':
        loadServers();
        if (S.detail?.server.id === ev.server) { toast(ev.reason === 'ban' ? 'Du er blevet udelukket fra serveren' : ev.reason === 'kick' ? 'Du er blevet smidt ud af serveren' : 'Serveren findes ikke længere', { type: 'warn' }); S.detail = null; go('', { push: false }); }
        break;
      case 'friends': loadFriends().then(() => { if (S.view === 'friends') friendsView(); }); loadDms(); break;
      case 'snap': case 'snap-opened': reloadDms(); if (S.view === 'snaps') S.reloadSnaps?.(); break;
      case 'stories': S.strip?.reload(); break;
      case 'reset':
        loadServers(); loadDms(); loadFriends();
        if (S.chat) S.chat.reload();
        S.music?.onLive(ev);
        break;
      default: break;
    }
  }));

  // ── start ──
  drawRail(); drawSide();
  Promise.all([loadServers(), loadDms(), loadFriends()]).then(() => { if (!S.detail) drawSide(); });
  const { sub, id } = params;
  params._first = !sub;
  route(sub ? `/${sub}${id ? '/' + id : ''}` : '');
  return shell;
}
