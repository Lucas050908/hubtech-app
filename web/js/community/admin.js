/** Fællesskab: reporting, member cards (moderation), invitations, server settings and the reports queue. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal, confirmDialog, segmented } from '../core/ui.js';
import { fmtTime } from './chat.js';

export const ROLE_DA = { owner: 'Ejer', admin: 'Admin', moderator: 'Moderator', member: 'Medlem' };
export const RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };

export function reportDialog({ kind, ref, what }) {
  const reasons = ['Chikane eller mobning', 'Hadefuld tale', 'Spam eller svindel', 'Seksuelt eller voldeligt indhold', 'Deler personlige oplysninger', 'Andet'];
  let reason = reasons[0];
  const more = h('textarea', { class: 'textarea', rows: 3, maxlength: 400, placeholder: 'Fortæl kort, hvad der er galt (valgfri)', 'aria-label': 'Uddybning' });
  const radios = h('div', { class: 'stack', role: 'radiogroup', 'aria-label': 'Årsag', style: { gap: '6px' } }, reasons.map((r, i) =>
    h('label', { class: 'cal-pcheck' }, h('input', { type: 'radio', name: 'rep', checked: i === 0, onchange: () => { reason = r; } }), h('span', null, r))));
  const go = async () => {
    try { await api.post('/api/cm/reports', { kind, ref, reason: `${reason}${more.value.trim() ? ': ' + more.value.trim() : ''}` }); m.close(); toast('Tak – anmeldelsen er sendt', { type: 'ok', text: 'Moderatorerne kigger på den. Du kan også blokere brugeren.' }); }
    catch (e) { toast('Anmeldelsen blev ikke sendt', { type: 'bad', text: e.message }); }
  };
  const m = modal({ title: `Anmeld ${what}`, label: 'Fællesskab', size: 480, body: h('div', { class: 'stack', style: { gap: '12px' } }, radios, more,
    h('p', { class: 'faint', style: { margin: 0 } }, 'Er nogen i fare, så kontakt politiet på 112. Børn og unge kan ringe til BørneTelefonen på 116 111.')),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: go }, icon('flag'), 'Anmeld')] });
}

/** Profile card for a user – friend/DM/block for everyone; role, mute, kick and ban for moderators. */
export async function memberCard(cm, user, { server, myRole, onChanged, openDm }) {
  if (user.id === cm.me.user.id) { toast('Det er dig', { text: `@${user.username}` }); return; }
  const target = server ? (server.members || []).find(x => x.id === user.id) : null;
  const canMod = server && target && RANK[myRole] >= 2 && RANK[target.role] < RANK[myRole];
  let fr = null;
  try { fr = await api.get('/api/cm/friends'); } catch { /* */ }
  const isFriend = fr?.friends.some(f => f.id === user.id), incoming = fr?.incoming.some(f => f.id === user.id), outgoing = fr?.outgoing.some(f => f.id === user.id), blocked = fr?.blocked.some(f => f.id === user.id);
  const err = h('div', { class: 'field-error' });
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok, { type: 'ok' }); m.close(); onChanged?.(); } catch (e) { err.textContent = e.message; } };
  const sid = server?.server?.id;
  const btns = [];
  if (isFriend) btns.push(h('button', { class: 'btn btn-primary', onclick: () => { m.close(); openDm(user); } }, icon('chat'), 'Send besked'),
    h('button', { class: 'btn', onclick: () => { m.close(); import('../features/calls.js').then(c => c.callUser(user)); } }, icon('phone'), 'Ring op'));
  else if (incoming) btns.push(h('button', { class: 'btn btn-primary', onclick: () => run(() => api.post(`/api/cm/friends/${user.id}/accept`), 'I er nu venner') }, icon('check'), 'Accepter venneanmodning'));
  else if (outgoing) btns.push(h('button', { class: 'btn', disabled: true }, icon('clock'), 'Anmodning sendt'));
  else if (!blocked) btns.push(h('button', { class: 'btn btn-primary', onclick: () => run(() => api.post('/api/cm/friends', { username: user.username }), 'Venneanmodning sendt') }, icon('userPlus'), 'Tilføj ven'));
  btns.push(blocked
    ? h('button', { class: 'btn', onclick: () => run(() => api.del(`/api/cm/blocks/${user.id}`), 'Blokering fjernet') }, icon('unlock'), 'Fjern blokering')
    : h('button', { class: 'btn', onclick: async () => { if (await confirmDialog({ title: `Blokér ${user.name}?`, text: 'I kan ikke skrive privat, I fjernes som venner, og du ser ikke vedkommendes beskeder.', confirmLabel: 'Blokér', danger: true })) run(() => api.post(`/api/cm/blocks/${user.id}`), 'Brugeren er blokeret'); } }, icon('ban'), 'Blokér'));
  btns.push(h('button', { class: 'btn btn-ghost', onclick: () => { m.close(); reportDialog({ kind: 'user', ref: String(user.id), what: user.name }); } }, icon('flag'), 'Anmeld'));
  let modBox = null;
  if (canMod) {
    const roles = ['member', 'moderator', 'admin'].filter(r => RANK[r] < RANK[myRole]);
    const roleSel = h('select', { class: 'select', 'aria-label': 'Rolle' }, roles.map(r => h('option', { value: r, selected: target.role === r }, ROLE_DA[r])));
    const mins = h('select', { class: 'select', 'aria-label': 'Tavs i' }, [[10, '10 minutter'], [60, '1 time'], [1440, '1 døgn'], [10080, '1 uge'], [0, 'Ophæv tavshed']].map(([v, l]) => h('option', { value: v }, l)));
    const reason = h('input', { class: 'input', maxlength: 300, placeholder: 'Årsag (vises i loggen)', 'aria-label': 'Årsag' });
    modBox = h('div', { class: 'cm-modbox' },
      h('div', { class: 'eyebrow' }, icon('shield'), ' Moderering'),
      RANK[myRole] >= 3 ? h('div', { class: 'cm-modrow' }, roleSel, h('button', { class: 'btn btn-sm', onclick: () => run(() => api.post(`/api/cm/servers/${sid}/members/${user.id}/role`, { role: roleSel.value }), 'Rollen er ændret') }, 'Skift rolle')) : null,
      h('div', { class: 'cm-modrow' }, mins, h('button', { class: 'btn btn-sm', onclick: () => run(() => api.post(`/api/cm/servers/${sid}/members/${user.id}/mute`, { minutes: Number(mins.value) }), Number(mins.value) ? 'Brugeren er gjort tavs' : 'Tavshed ophævet') }, icon('mute'), 'Gør tavs')),
      h('div', { class: 'cm-modrow' }, reason),
      h('div', { class: 'cm-modrow' },
        h('button', { class: 'btn btn-sm', onclick: async () => { if (await confirmDialog({ title: `Smid ${user.name} ud?`, text: 'Brugeren kan komme tilbage med en ny invitation.', confirmLabel: 'Smid ud', danger: true })) run(() => api.post(`/api/cm/servers/${sid}/members/${user.id}/kick`), 'Brugeren er smidt ud'); } }, icon('logout'), 'Smid ud'),
        h('button', { class: 'btn btn-sm', style: { color: 'var(--bad)' }, onclick: async () => { if (await confirmDialog({ title: `Udeluk ${user.name}?`, text: 'Brugeren fjernes og kan ikke komme ind igen, før udelukkelsen ophæves. Beskeder fra det seneste døgn slettes.', confirmLabel: 'Udeluk', danger: true })) run(() => api.post(`/api/cm/servers/${sid}/members/${user.id}/ban`, { reason: reason.value.trim(), deleteHours: 24 }), 'Brugeren er udelukket'); } }, icon('ban'), 'Udeluk')),
      myRole === 'owner' ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: `Gør ${user.name} til ejer?`, text: 'Du bliver selv admin. Det kan kun den nye ejer gøre om.', confirmLabel: 'Overdrag ejerskab', danger: true })) run(() => api.post(`/api/cm/servers/${sid}/members/${user.id}/role`, { role: 'owner' }), 'Ejerskabet er overdraget'); } }, icon('crown'), 'Overdrag ejerskab') : null);
  }
  const m = modal({ title: user.name, label: `@${user.username}`, size: 460,
    body: h('div', { class: 'stack', style: { gap: '12px' } },
      h('div', { class: 'cm-card-h' }, h('span', { class: 'cm-ava cm-ava-xl' }, user.avatar || '👤'),
        h('div', null, h('b', null, user.name), h('div', { class: 'faint' }, `@${user.username}`), target ? h('span', { class: ['chip', `cm-role-${target.role}`] }, ROLE_DA[target.role]) : null,
          h('div', { class: ['cm-online', user.online && 'is-on'] }, user.online ? 'Online' : 'Offline'))),
      h('div', { class: 'cm-card-btns' }, btns), modBox, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Luk')] });
}

export async function inviteDialog(server) {
  const out = h('div', { class: 'stack', style: { gap: '10px' } });
  const hours = h('select', { class: 'select', 'aria-label': 'Udløber' }, [[1, '1 time'], [24, '1 døgn'], [168, '7 dage'], [720, '30 dage'], [0, 'Aldrig']].map(([v, l]) => h('option', { value: v, selected: v === 168 }, l)));
  const uses = h('select', { class: 'select', 'aria-label': 'Antal brug' }, [[0, 'Ubegrænset'], [1, '1 gang'], [5, '5 gange'], [25, '25 gange'], [100, '100 gange']].map(([v, l]) => h('option', { value: v }, l)));
  const make = async () => {
    try {
      const r = await api.post(`/api/cm/servers/${server.id}/invites`, { hours: Number(hours.value), maxUses: Number(uses.value) });
      const link = `${location.origin}/#/apps/community/invite/${r.code}`;
      const inp = h('input', { class: 'input', value: link, readonly: true, 'aria-label': 'Invitationslink', onfocus: (e) => e.target.select() });
      h(clear(out), null, h('div', { class: 'cal-inv-row' }, inp, h('button', { class: 'btn btn-primary', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Linket er kopieret', { type: 'ok' }); } catch { inp.select(); } } }, icon('copy'), 'Kopiér')),
        h('p', { class: 'faint', style: { margin: 0 } }, `Koden er ${r.code}. Den kan også skrives under “Tilslut med kode”.`));
    } catch (e) { toast('Kunne ikke lave en invitation', { type: 'bad', text: e.message }); }
  };
  const m = modal({ title: `Invitér til ${server.name}`, label: 'Fællesskab', size: 520,
    body: h('div', { class: 'stack', style: { gap: '12px' } }, h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Udløber efter'), hours), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Kan bruges'), uses)), out),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Luk'), h('button', { class: 'btn btn-primary', onclick: make }, icon('link'), 'Lav link')] });
}

/** Server settings for admins: overview, rules, channels, word filter, bans and the moderation log. */
export function serverSettings(cm, detail, { onChanged, onDeleted }) {
  const s = detail.server, me = detail.me;
  let tab = 'general';
  const body = h('div', { class: 'cm-settings' });
  const err = h('div', { class: 'field-error' });
  const save = async (patch, msg = 'Gemt') => { err.textContent = ''; try { await api.patch(`/api/cm/servers/${s.id}`, patch); toast(msg, { type: 'ok' }); onChanged?.(); } catch (e) { err.textContent = e.message; } };
  function general() {
    const name = h('input', { class: 'input', value: s.name, maxlength: 50, 'aria-label': 'Navn' });
    const ic = h('input', { class: 'input', value: s.icon, maxlength: 8, placeholder: '🔧', 'aria-label': 'Ikon (emoji)', style: { width: '90px' } });
    const desc = h('textarea', { class: 'textarea', rows: 2, maxlength: 300, 'aria-label': 'Beskrivelse' }); desc.value = s.description || '';
    const disc = h('input', { type: 'checkbox', checked: s.discoverable });
    return [h('div', { class: 'cal-inv-row' }, h('label', { class: 'field', style: { flex: 1 } }, h('span', { class: 'field-label' }, 'Navn'), name), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ikon'), ic)),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Beskrivelse'), desc),
      h('label', { class: 'cal-pcheck' }, disc, h('span', null, 'Vis serveren under “Opdag”, så alle brugere kan finde og tilslutte sig den')),
      h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn btn-primary', onclick: () => save({ name: name.value.trim(), icon: ic.value.trim(), description: desc.value.trim(), discoverable: disc.checked }) }, 'Gem'),
        me.role === 'owner' ? h('button', { class: 'btn btn-ghost', style: { marginLeft: 'auto', color: 'var(--bad)' }, onclick: async () => {
          if (!await confirmDialog({ title: `Slet ${s.name}?`, text: 'Alle kanaler og beskeder slettes for alle medlemmer. Det kan ikke fortrydes.', confirmLabel: 'Slet serveren', danger: true })) return;
          try { await api.del(`/api/cm/servers/${s.id}`); m.close(); onDeleted?.(); } catch (e) { err.textContent = e.message; }
        } }, icon('trash'), 'Slet serveren') : null)];
  }
  function rules() {
    const r = h('textarea', { class: 'textarea', rows: 10, maxlength: 4000, 'aria-label': 'Regler' }); r.value = s.rules || '';
    const wf = h('input', { class: 'input', value: detail.server.wordFilter || '', placeholder: 'ord1, ord2, ord3', 'aria-label': 'Ordfilter' });
    return [h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Regler (skal accepteres af alle, før de kan skrive)'), r),
      h('button', { class: 'btn btn-primary', onclick: () => save({ rules: r.value.trim() }, 'Reglerne er gemt – medlemmerne skal acceptere dem igen') }, 'Gem regler'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ordfilter: ord, der skjules med •••• i beskeder (adskil med komma)'), wf),
      h('button', { class: 'btn', onclick: () => save({ wordFilter: wf.value }) }, 'Gem ordfilter')];
  }
  function channels() {
    const wrap = h('div', { class: 'stack', style: { gap: '8px' } });
    detail.channels.forEach(c => {
      const nm = h('input', { class: 'input', value: c.name, 'aria-label': 'Kanalnavn' });
      const topic = h('input', { class: 'input', value: c.topic, placeholder: 'Emne', 'aria-label': 'Emne' });
      const slow = h('select', { class: 'select', 'aria-label': 'Langsom tilstand' }, [[0, 'Ingen ventetid'], [5, '5 sek.'], [30, '30 sek.'], [60, '1 min.'], [300, '5 min.']].map(([v, l]) => h('option', { value: v, selected: c.slow === v }, l)));
      const post = h('select', { class: 'select', 'aria-label': 'Hvem må skrive' }, ['member', 'moderator', 'admin'].map(r => h('option', { value: r, selected: c.postRole === r }, r === 'member' ? 'Alle kan skrive' : `Kun ${ROLE_DA[r].toLowerCase()}e+`)));
      wrap.appendChild(h('div', { class: 'cm-chanrow' }, h('span', { class: 'cm-chan-ic' }, icon(c.kind === 'music' ? 'music' : c.kind === 'voice' ? 'volume' : 'hash')), nm, topic, slow, post,
        h('button', { class: 'btn btn-sm', onclick: async () => { try { await api.patch(`/api/cm/channels/${c.id}`, { name: nm.value, topic: topic.value, slow: Number(slow.value), postRole: post.value }); toast('Kanalen er gemt', { type: 'ok' }); onChanged?.(); } catch (e) { err.textContent = e.message; } } }, 'Gem'),
        h('button', { class: 'icon-btn', 'aria-label': `Slet #${c.name}`, onclick: async () => { if (await confirmDialog({ title: `Slet #${c.name}?`, text: 'Alle beskeder i kanalen slettes.', confirmLabel: 'Slet', danger: true })) { try { await api.del(`/api/cm/channels/${c.id}`); onChanged?.(); m.close(); } catch (e) { err.textContent = e.message; } } } }, icon('trash'))));
    });
    const nn = h('input', { class: 'input', placeholder: 'ny-kanal', 'aria-label': 'Ny kanal' });
    let kind = 'text';
    const k = segmented([{ value: 'text', label: 'Tekst', icon: 'hash' }, { value: 'voice', label: 'Tale', icon: 'volume' }, { value: 'music', label: 'Musik', icon: 'music' }], kind, (v) => { kind = v; }, { label: 'Type' });
    wrap.appendChild(h('div', { class: 'cm-chanrow is-new' }, nn, k, h('button', { class: 'btn btn-primary btn-sm', onclick: async () => { try { await api.post(`/api/cm/servers/${s.id}/channels`, { name: nn.value, kind }); onChanged?.(); m.close(); toast('Kanalen er oprettet', { type: 'ok' }); } catch (e) { err.textContent = e.message; } } }, icon('plus'), 'Opret')));
    return [wrap];
  }
  function bans() {
    const box = h('div', { class: 'stack', style: { gap: '8px' } }, h('p', { class: 'faint' }, 'Henter …'));
    const log = h('div', { class: 'cm-log' });
    api.get(`/api/cm/servers/${s.id}/bans`).then(d => h(clear(box), null, d.bans.length ? d.bans.map(b => h('div', { class: 'cm-chanrow' }, h('span', { class: 'cm-ava' }, b.user?.avatar || '👤'), h('span', { style: { flex: 1 } }, h('b', null, b.user?.name || '?'), h('span', { class: 'faint' }, ` · ${b.reason || 'ingen årsag'} · af ${b.by || '?'} ${fmtTime(b.at)}`)),
      h('button', { class: 'btn btn-sm', onclick: async () => { await api.del(`/api/cm/servers/${s.id}/bans/${b.user.id}`); toast('Udelukkelsen er ophævet', { type: 'ok' }); m.close(); } }, 'Ophæv'))) : h('p', { class: 'faint' }, 'Ingen er udelukket.'))).catch(e => { box.textContent = e.message; });
    const ACT = { mute: 'gjorde tavs', unmute: 'ophævede tavshed for', kick: 'smed ud', ban: 'udelukkede', unban: 'ophævede udelukkelse af', delete: 'slettede en besked fra' };
    api.get(`/api/cm/servers/${s.id}/log`).then(d => h(clear(log), null, d.log.length ? d.log.slice(0, 60).map(x => h('div', { class: 'cm-logrow' }, h('span', { class: 'faint' }, fmtTime(x.at)), ` ${x.by} ${ACT[x.action] || x.action} ${x.target}`, x.detail ? h('span', { class: 'faint' }, ` – ${x.detail}`) : null)) : h('p', { class: 'faint' }, 'Ingen handlinger endnu.'))).catch(() => {});
    return [h('div', { class: 'field-label' }, 'Udelukkede'), box, h('div', { class: 'field-label', style: { marginTop: '10px' } }, 'Moderatorlog'), log];
  }
  const tabs = { general: ['Oversigt', general], rules: ['Regler og filter', rules], channels: ['Kanaler', channels], bans: ['Udelukkede og log', bans] };
  const draw = () => h(clear(body), null, tabs[tab][1]());
  const seg = segmented(Object.entries(tabs).map(([v, [l]]) => ({ value: v, label: l })), tab, (v) => { tab = v; draw(); }, { label: 'Indstillinger' });
  draw();
  const m = modal({ title: `Indstillinger for ${s.name}`, label: 'Fællesskab', size: 760, body: h('div', { class: 'stack', style: { gap: '14px' } }, h('div', { class: 'cm-seg-scroll' }, seg), body, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Luk')] });
}

/** Reports for moderators (their servers) and the platform owner (everything). */
export function reportsView(cm, { openChannel }) {
  const el = h('div', { class: 'cm-pane-body' });
  let show = 'open';
  const KIND_DA = { message: 'Besked', user: 'Bruger', server: 'Server', story: 'Story', snap: 'Snap' };
  async function load() {
    let d;
    try { d = await api.get(`/api/cm/reports?show=${show}`); } catch (e) { h(clear(el), null, h('p', { class: 'field-error' }, e.message)); return; }
    const handle = async (r, action) => { try { await api.post(`/api/cm/reports/${r.id}/handle`, { action }); toast('Behandlet', { type: 'ok' }); load(); } catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); } };
    h(clear(el), null,
      h('div', { class: 'cm-pane-tools' }, segmented([{ value: 'open', label: 'Åbne' }, { value: 'all', label: 'Alle' }], show, (v) => { show = v; load(); }, { label: 'Vis' })),
      !d.canModerate ? h('p', { class: 'faint' }, 'Du er ikke moderator nogen steder. Anmeldelser fra dine servere vises her, når du bliver det.')
        : d.reports.length ? d.reports.map(r => h('article', { class: 'cm-report glass-soft' },
          h('div', { class: 'cm-report-h' }, h('span', { class: 'chip' }, KIND_DA[r.kind] || r.kind), r.server ? h('span', { class: 'faint' }, r.server.name) : null, h('span', { class: 'faint', style: { marginLeft: 'auto' } }, fmtTime(r.at))),
          h('p', null, h('b', null, r.reporter?.name || '?'), ' anmeldte ', h('b', null, r.target?.name || '?'), ': ', r.reason),
          r.snapshot ? h('blockquote', { class: 'cm-snap' }, r.snapshot) : null,
          r.handled ? h('p', { class: 'faint' }, `Behandlet af ${r.handled.by} ${fmtTime(r.handled.at)} (${r.handled.action})`)
            : h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
              ['message', 'story'].includes(r.kind) ? h('button', { class: 'btn btn-sm', style: { color: 'var(--bad)' }, onclick: () => handle(r, 'delete') }, icon('trash'), 'Slet indholdet') : null,
              h('button', { class: 'btn btn-sm', onclick: () => handle(r, 'resolved') }, icon('check'), 'Løst'),
              h('button', { class: 'btn btn-sm btn-ghost', onclick: () => handle(r, 'dismiss') }, 'Afvis'),
              r.kind === 'message' && openChannel ? null : null)))
          : h('p', { class: 'faint' }, show === 'open' ? 'Ingen åbne anmeldelser. 🎉' : 'Ingen anmeldelser.'));
  }
  load();
  return { el, reload: load };
}
