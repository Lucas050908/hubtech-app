/** Share a note, event, task or code snippet from your own apps into a Fællesskab chat (DM or server channel). */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { modal, toast } from '../core/ui.js';
import { navigate } from '../core/router.js';

const KIND_DA = { note: 'Note', event: 'Aftale', task: 'Opgave', snippet: 'Kodestump', calendar: 'Kalender' };

export async function shareToChat(attach) {
  let me;
  try { me = await api.get('/api/cm/me'); } catch (e) { toast('Fællesskab kan ikke nås', { type: 'bad', text: e.message }); return; }
  if (!me.ageOk) {
    toast('Slå Fællesskab til først', { type: 'warn', text: 'Åbn Fællesskab, og bekræft din alder én gang.', action: { label: 'Åbn', onClick: () => navigate('/apps/community') } });
    return;
  }
  const list = h('div', { class: 'sc-list', role: 'listbox', 'aria-label': 'Hvor skal det deles?' }, h('p', { class: 'faint' }, 'Henter …'));
  const note = h('input', { class: 'input', maxlength: 500, placeholder: 'Skriv en besked med (valgfri)', 'aria-label': 'Besked' });
  let target = null;
  const send = async () => {
    if (!target) { toast('Vælg, hvor det skal deles', { type: 'warn' }); return; }
    try {
      await api.post(`/api/cm/channels/${target.id}/messages`, { body: note.value.trim(), attach });
      m.close();
      toast('Delt', { type: 'ok', text: target.label, action: { label: 'Åbn chatten', onClick: () => navigate(target.path) } });
    } catch (e) { toast('Kunne ikke dele', { type: 'bad', text: e.message }); }
  };
  const pick = (t, el) => { target = t; list.querySelectorAll('.sc-item').forEach(x => x.setAttribute('aria-selected', String(x === el))); };
  const m = modal({ title: `Del ${(KIND_DA[attach.kind] || 'indhold').toLowerCase()}`, label: 'Fællesskab', size: 520,
    body: h('div', { class: 'stack', style: { gap: '12px' } },
      h('div', { class: 'sc-preview' }, icon(attach.kind === 'event' ? 'calendar' : attach.kind === 'snippet' ? 'code' : attach.kind === 'task' ? 'kanban' : 'note'), h('b', null, attach.title || KIND_DA[attach.kind])),
      list, note),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: send }, icon('send'), 'Del')] });
  try {
    const [dms, servers] = await Promise.all([api.get('/api/cm/dms'), api.get('/api/cm/servers')]);
    const item = (t, label, sub, ava) => {
      const el = h('button', { type: 'button', class: 'sc-item', role: 'option', 'aria-selected': 'false', onclick: () => pick(t, el) }, h('span', { class: 'cm-ava' }, ava), h('span', null, h('b', null, label), sub ? h('span', { class: 'faint' }, sub) : null));
      return el;
    };
    clear(list);
    if (dms.dms.length) list.appendChild(h('div', { class: 'sc-group' }, 'Venner'));
    dms.dms.forEach(d => list.appendChild(item({ id: d.channel, label: d.user.name, path: `/apps/community/dm/${d.channel}` }, d.user.name, `@${d.user.username}`, ava(d.user.avatar))));
    for (const s of servers.servers) {
      const srv = await api.get(`/api/cm/servers/${s.id}`).catch(() => null);
      const chans = (srv?.channels || []).filter(c => c.kind === 'text');
      if (!chans.length) continue;
      list.appendChild(h('div', { class: 'sc-group' }, s.icon ? `${s.icon} ${s.name}` : s.name));
      chans.forEach(c => list.appendChild(item({ id: c.id, label: `#${c.name} på ${s.name}`, path: `/apps/community/c/${c.id}` }, `#${c.name}`, c.topic, '#')));
    }
    if (!list.children.length) list.appendChild(h('p', { class: 'faint' }, 'Du har ingen venner eller servere endnu. Åbn Fællesskab for at komme i gang.'));
  } catch (e) { h(clear(list), null, h('p', { class: 'field-error' }, e.message)); }
}
