/** Fællesskab: one chat (a server channel or a private conversation) – messages, composer, typing, reactions. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, confirmDialog, modal } from '../core/ui.js';
import { getState, saveState, flushState } from '../core/services.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const EXTRA_EMOJI = ['😀', '😁', '😅', '🤣', '😊', '😍', '😎', '🤔', '😴', '🥳', '😭', '😡', '👋', '👏', '💪', '🙌', '🤝', '💯', '⭐', '⚡', '🔧', '💻', '📱', '🎮', '🎵', '☕', '🍕', '🚀'];

export function fmtTime(sec) {
  const d = new Date(sec * 1000), now = new Date();
  const t = d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  const day = (x) => x.toDateString();
  if (day(d) === day(now)) return `i dag ${t}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(d) === day(y)) return `i går ${t}`;
  return `${d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })} ${t}`;
}

/** text → DOM: ```code```, `code`, **fed**, links and @omtaler. Never HTML. */
export function fmtBody(text, meName) {
  const out = [];
  const parts = String(text || '').split(/```(?:[a-z0-9+#-]*\n)?([\s\S]*?)```/i);
  parts.forEach((p, i) => {
    if (i % 2) { out.push(h('pre', { class: 'cm-code', tabindex: '0', role: 'region', 'aria-label': 'Kode' }, h('code', null, p.replace(/\n$/, '')))); return; }
    const rx = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|`([^`\n]+)`|\*\*([^*\n]+)\*\*|(^|\s)@([A-Za-z0-9._-]{3,32})/g;
    let last = 0, m;
    while ((m = rx.exec(p))) {
      if (m.index > last) out.push(p.slice(last, m.index));
      if (m[1]) out.push(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[1].length > 60 ? m[1].slice(0, 57) + '…' : m[1]));
      else if (m[2]) out.push(h('code', { class: 'cm-ic' }, m[2]));
      else if (m[3]) out.push(h('b', null, m[3]));
      else { out.push(m[4]); out.push(h('span', { class: ['cm-mention', meName && m[5].toLowerCase() === meName.toLowerCase() && 'is-me'] }, '@' + m[5])); }
      last = rx.lastIndex;
    }
    if (last < p.length) out.push(p.slice(last));
  });
  return out;
}

const KIND = { note: ['note', 'Note'], event: ['calendar', 'Aftale'], task: ['kanban', 'Opgave'], snippet: ['code', 'Kodestump'], calendar: ['calendar', 'Kalender'] };

/** Save a shared note / event / task / snippet into my own apps. */
async function keep(a) {
  try {
    const now = Date.now();
    if (a.kind === 'note') {
      const st = (await getState('notes', { force: true })) || {}; st.notes ||= [];
      st.notes.unshift({ id: uid(), title: a.title || 'Delt note', body: a.body || '', pinned: false, color: '', created: now, updated: now });
      saveState('notes', st); flushState('notes'); toast('Gemt i Noter', { type: 'ok', text: a.title });
    } else if (a.kind === 'event') {
      const st = (await getState('calendar', { force: true })) || {}; st.events ||= [];
      st.events.push({ id: uid(), title: a.title || 'Aftale', date: a.date, endDate: a.endDate || null, allDay: !!a.allDay || !a.start, start: a.start || null, end: a.end || null, location: a.location || '', notes: a.body || '', color: '#38bdf8', remind: 'm15' });
      saveState('calendar', st); flushState('calendar'); toast('Lagt i din kalender', { type: 'ok', text: a.title });
    } else if (a.kind === 'task') {
      const st = (await getState('tasks', { force: true })) || {}; st.tasks ||= [];
      st.tasks.unshift({ id: uid(), title: a.title || 'Opgave', notes: a.body || '', status: 'todo', prio: 'med', due: a.due || null, project: null, remind: 'none', created: now, updated: now });
      saveState('tasks', st); flushState('tasks'); toast('Lagt i Opgaver', { type: 'ok', text: a.title });
    } else if (a.kind === 'snippet') {
      const st = (await getState('snippets', { force: true })) || {}; st.items ||= [];
      st.items.unshift({ id: uid(), title: a.title || 'Delt kodestump', lang: a.lang || 'bash', tags: ['delt'], code: a.code || '', created: now, updated: now, uses: 0 });
      saveState('snippets', st); flushState('snippets'); toast('Gemt i Kodestumper', { type: 'ok', text: a.title });
    }
  } catch (e) { toast('Kunne ikke gemme', { type: 'bad', text: e.message }); }
}

function attachCard(a) {
  const [ic, label] = KIND[a.kind] || ['file', 'Delt'];
  const when = a.date ? `${new Date(a.date + 'T12:00').toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${a.allDay || !a.start ? '' : ` kl. ${a.start}${a.end ? '–' + a.end : ''}`}` : '';
  const saveLabel = { note: 'Gem som note', event: 'Læg i min kalender', task: 'Lav en opgave', snippet: 'Gem kodestump' }[a.kind];
  return h('div', { class: ['cm-attach', `is-${a.kind}`] },
    h('div', { class: 'cm-attach-h' }, icon(ic), h('span', { class: 'cm-attach-k' }, label), h('b', null, a.title || label)),
    when ? h('div', { class: 'cm-attach-when' }, icon('clock'), when, a.location ? [' · ', icon('mapPin'), a.location] : null) : null,
    a.body ? h('div', { class: 'cm-attach-b' }, a.body.length > 400 ? a.body.slice(0, 400) + '…' : a.body) : null,
    a.code ? h('pre', { class: 'cm-code', tabindex: '0', role: 'region', 'aria-label': 'Kode' }, h('code', null, a.code)) : null,
    saveLabel ? h('button', { class: 'btn btn-sm', onclick: () => keep(a) }, icon('download'), saveLabel) : null);
}

/** Pick something from my own apps to share in the chat. */
async function pickFromApps() {
  const [notes, cal, tasks, snips] = await Promise.all(['notes', 'calendar', 'tasks', 'snippets'].map(k => getState(k, { force: true }).catch(() => null)));
  const items = [
    ...(notes?.notes || []).map(n => ({ kind: 'note', title: n.title || 'Note uden titel', body: (n.body || '').replace(/<[^>]+>/g, ' ').slice(0, 3000), sub: 'Note' })),
    ...(cal?.events || []).filter(e => e.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).map(e => ({ kind: 'event', title: e.title, date: e.date, endDate: e.endDate || '', start: e.allDay ? '' : e.start || '', end: e.allDay ? '' : e.end || '', allDay: !!e.allDay, location: e.location || '', body: e.notes || '', sub: `Aftale · ${e.date}` })),
    ...(tasks?.tasks || []).filter(t => t.status !== 'done').map(t => ({ kind: 'task', title: t.title, body: t.notes || '', due: t.due || '', sub: `Opgave${t.due ? ' · ' + t.due : ''}` })),
    ...(snips?.items || []).map(s => ({ kind: 'snippet', title: s.title || 'Kodestump', code: s.code || '', lang: s.lang || '', sub: `Kodestump · ${s.lang || ''}` })),
  ];
  return new Promise((resolve) => {
    let done = false;
    const q = h('input', { class: 'input', placeholder: 'Søg i noter, aftaler, opgaver og kodestumper', 'aria-label': 'Søg' });
    const list = h('div', { class: 'sc-list' });
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const hits = items.filter(x => !t || `${x.title} ${x.sub}`.toLowerCase().includes(t)).slice(0, 60);
      h(clear(list), null, hits.length ? hits.map(x => h('button', { type: 'button', class: 'sc-item', onclick: () => { done = true; m.close(); resolve(x); } },
        h('span', { class: 'cm-ava' }, icon(KIND[x.kind][0])), h('span', null, h('b', null, x.title), h('span', { class: 'faint' }, x.sub)))) : h('p', { class: 'faint' }, 'Intet fundet.'));
    };
    q.addEventListener('input', draw);
    const m = modal({ title: 'Del fra dine apps', label: 'Fællesskab', size: 520, body: h('div', { class: 'stack', style: { gap: '10px' } }, q, list),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller')], onClose: () => { if (!done) resolve(null); } });
    draw();
    setTimeout(() => q.focus(), 50);
  });
}

export async function uploadFile(file, purpose = '') {
  const r = await fetch('/api/cm/files', { method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/octet-stream', 'X-Purpose': purpose, 'X-File-Name': encodeURIComponent((file.name || 'fil').slice(0, 100)) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Upload mislykkedes (${r.status})`);
  return d.file;
}

/**
 * chatView(cm, { channelId, title, canWrite, gate, readOnlyText, onReport, onUser })
 * Returns { el, onLive(ev), destroy() }.
 */
export function chatView(cm, opt) {
  const cid = opt.channelId;
  const meName = cm.me.user.username;
  let messages = [], more = false, loading = false, replyTo = null, editing = null, readTimer = 0, lastTyping = 0;
  const typers = new Map();
  const list = h('div', { class: 'cm-msgs', role: 'log', 'aria-live': 'polite', 'aria-label': `Beskeder i ${opt.title}`, tabindex: '0' });
  const typingEl = h('div', { class: 'cm-typing', 'aria-live': 'polite' });
  const replyBar = h('div', { class: 'cm-replybar', hidden: true });
  const input = h('textarea', { class: 'cm-input', rows: 1, maxlength: 2000, placeholder: opt.placeholder || `Skriv i ${opt.title}`, 'aria-label': 'Besked', enterkeyhint: 'send' });
  const fileIn = h('input', { type: 'file', accept: 'image/*,audio/*', hidden: true });
  const emojiPop = h('div', { class: 'cm-emoji-pop', hidden: true, role: 'dialog', 'aria-label': 'Vælg emoji' },
    [...cm.me.emoji, ...EXTRA_EMOJI].map(e => h('button', { type: 'button', class: 'cm-emoji', onclick: () => { insert(e); emojiPop.hidden = true; input.focus(); } }, e)));
  const sendBtn = h('button', { class: 'cm-send', 'aria-label': 'Send', title: 'Send (Enter)', onclick: () => send() }, icon('send'));

  const insert = (t) => { const s = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, s) + t + input.value.slice(input.selectionEnd ?? s); input.selectionStart = input.selectionEnd = s + t.length; autosize(); };
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; };
  input.addEventListener('input', () => {
    autosize();
    if (input.value.trim() && Date.now() - lastTyping > 3000) { lastTyping = Date.now(); api.post(`/api/cm/channels/${cid}/typing`).catch(() => {}); }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { setReply(null); stopEdit(); }
    if (e.key === 'ArrowUp' && !input.value) { const mine = [...messages].reverse().find(m => m.user.id === cm.me.user.id && !m.deleted && m.body); if (mine) { e.preventDefault(); startEdit(mine); } }
  });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    const t = toast('Sender filen …', { icon: 'upload', ms: 60000 });
    try { const up = await uploadFile(f); await post({ body: input.value.trim(), fileId: up.id }); input.value = ''; autosize(); }
    catch (e) { toast('Filen kunne ikke sendes', { type: 'bad', text: e.message }); }
    finally { t(); }
  });

  function setReply(m) {
    replyTo = m;
    replyBar.hidden = !m;
    if (m) h(clear(replyBar), null, icon('reply'), h('span', null, 'Svarer ', h('b', null, m.user.name), ': ', (m.body || 'fil').slice(0, 80)),
      h('button', { class: 'icon-btn', 'aria-label': 'Annuller svar', onclick: () => setReply(null) }, icon('x')));
    if (m) input.focus();
  }
  function startEdit(m) {
    editing = m; setReply(null);
    input.value = m.body; autosize(); input.focus();
    replyBar.hidden = false;
    h(clear(replyBar), null, icon('edit'), h('span', null, 'Retter din besked – Esc for at annullere'), h('button', { class: 'icon-btn', 'aria-label': 'Annuller', onclick: stopEdit }, icon('x')));
  }
  function stopEdit() { if (!editing) return; editing = null; input.value = ''; autosize(); replyBar.hidden = true; }

  async function post(body) {
    const r = await api.post(`/api/cm/channels/${cid}/messages`, { ...body, replyTo: replyTo?.id || null });
    setReply(null);
    add(r.message);
    return r.message;
  }
  async function send() {
    const body = input.value.trim();
    if (!body) return;
    sendBtn.disabled = true;
    try {
      if (editing) { const r = await api.patch(`/api/cm/messages/${editing.id}`, { body }); replace(r.message); stopEdit(); }
      else { input.value = ''; autosize(); await post({ body }); }
    } catch (e) {
      if (!editing) input.value = body;
      toast(e.code === 'slowmode' ? 'Langsom tilstand' : 'Beskeden blev ikke sendt', { type: e.code === 'slowmode' ? 'warn' : 'bad', text: e.message });
    } finally { sendBtn.disabled = false; input.focus(); }
  }

  // ── rendering ──
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const toBottom = () => { list.scrollTop = list.scrollHeight; };
  function react(m, emoji) {
    api.post(`/api/cm/messages/${m.id}/react`, { emoji }).then(r => replace(r.message)).catch(e => toast('Det mislykkedes', { type: 'bad', text: e.message }));
  }
  function reactMenu(m, anchor) {
    const pop = h('div', { class: 'cm-react-pop', role: 'menu' }, cm.me.emoji.map(e => h('button', { type: 'button', role: 'menuitem', class: 'cm-emoji', 'aria-label': `Reagér med ${e}`, onclick: () => { pop.remove(); react(m, e); } }, e)));
    anchor.closest('.cm-msg').appendChild(pop);
    const off = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true));
    pop.querySelector('button')?.focus();
  }
  function msgEl(m, grouped) {
    const mine = m.user.id === cm.me.user.id;
    const canMod = opt.canModerate?.();
    const tools = m.deleted ? null : h('div', { class: 'cm-tools', role: 'toolbar', 'aria-label': 'Handlinger' },
      opt.canWrite() ? h('button', { class: 'icon-btn', title: 'Reagér', 'aria-label': 'Reagér', onclick: (e) => reactMenu(m, e.currentTarget) }, icon('smile')) : null,
      opt.canWrite() ? h('button', { class: 'icon-btn', title: 'Svar', 'aria-label': 'Svar', onclick: () => setReply(m) }, icon('reply')) : null,
      mine && m.body ? h('button', { class: 'icon-btn', title: 'Ret', 'aria-label': 'Ret', onclick: () => startEdit(m) }, icon('edit')) : null,
      mine || canMod ? h('button', { class: 'icon-btn', title: 'Slet', 'aria-label': 'Slet', onclick: async () => {
        if (!await confirmDialog({ title: 'Slet besked?', text: mine ? 'Beskeden slettes for alle.' : `Beskeden fra ${m.user.name} slettes for alle (logges som moderatorhandling).`, confirmLabel: 'Slet', danger: true })) return;
        try { await api.del(`/api/cm/messages/${m.id}`); replace({ ...m, deleted: true, body: '', file: null, attach: null, reactions: [] }); } catch (e) { toast('Kunne ikke slette', { type: 'bad', text: e.message }); }
      } }, icon('trash')) : null,
      !mine ? h('button', { class: 'icon-btn', title: 'Anmeld', 'aria-label': 'Anmeld besked', onclick: () => opt.onReport({ kind: 'message', ref: String(m.id), what: `beskeden fra ${m.user.name}` }) }, icon('flag')) : null);
    const f = m.file;
    const el = h('article', { class: ['cm-msg', grouped && 'is-grouped', mine && 'is-mine', m.deleted && 'is-deleted', (m.body || '').toLowerCase().includes('@' + meName.toLowerCase()) && 'is-mention'], dataset: { id: m.id }, 'aria-label': `${m.user.name}, ${fmtTime(m.at)}` },
      grouped ? h('span', { class: 'cm-msg-gt', 'aria-hidden': 'true' }, new Date(m.at * 1000).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }))
        : h('button', { type: 'button', class: 'cm-ava cm-ava-lg', 'aria-label': `Profil: ${m.user.name}`, onclick: () => opt.onUser?.(m.user) }, m.user.avatar || '👤'),
      h('div', { class: 'cm-msg-b' },
        grouped ? null : h('div', { class: 'cm-msg-h' }, h('button', { type: 'button', class: 'cm-name', onclick: () => opt.onUser?.(m.user) }, m.user.name), h('time', { class: 'faint', datetime: new Date(m.at * 1000).toISOString() }, fmtTime(m.at))),
        m.reply ? h('button', { type: 'button', class: 'cm-reply', onclick: () => list.querySelector(`[data-id="${m.reply.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, icon('reply'), h('b', null, m.reply.user), ' ', m.reply.body) : null,
        m.deleted ? h('p', { class: 'cm-text faint' }, h('i', null, 'Beskeden er slettet')) : m.body ? h('p', { class: 'cm-text' }, fmtBody(m.body, meName), m.edited ? h('span', { class: 'cm-edited faint', title: fmtTime(m.edited) }, ' (rettet)') : null) : null,
        f && f.kind === 'image' ? h('a', { class: 'cm-img', href: f.url, target: '_blank', rel: 'noopener' }, h('img', { src: f.url, alt: f.name || 'Billede', loading: 'lazy' })) : null,
        f && f.kind === 'audio' ? h('div', { class: 'cm-audio' }, icon('music'), h('span', null, f.name || 'Lydfil'), h('audio', { src: f.url, controls: true, preload: 'none' })) : null,
        m.attach ? attachCard(m.attach) : null,
        m.reactions?.length ? h('div', { class: 'cm-reacts' }, m.reactions.map(r => h('button', { type: 'button', class: ['cm-react', r.me && 'is-me'], 'aria-pressed': String(r.me), 'aria-label': `${r.emoji} ${r.count}`, onclick: () => opt.canWrite() && react(m, r.emoji) }, r.emoji, h('span', null, String(r.count))))) : null),
      tools);
    // touch screens: tap a message to show its actions
    el.addEventListener('click', (e) => {
      if (!matchMedia('(pointer: coarse)').matches || e.target.closest('a, button, audio, pre, .cm-react-pop')) return;
      list.querySelectorAll('.cm-msg.is-touch-open').forEach(x => { if (x !== el) x.classList.remove('is-touch-open'); });
      el.classList.toggle('is-touch-open');
    });
    return el;
  }
  function draw(keep = 'bottom') {
    const prevH = list.scrollHeight, prevTop = list.scrollTop;
    clear(list);
    if (more) list.appendChild(h('button', { class: 'btn btn-sm btn-ghost cm-older', onclick: older }, 'Hent ældre beskeder'));
    else list.appendChild(h('div', { class: 'cm-start' }, h('div', { class: 'cm-start-ic' }, icon(opt.dm ? 'chat' : 'hash')), h('h3', null, opt.dm ? `Starten på din samtale med ${opt.title}` : `Velkommen til #${opt.title}`), opt.topic ? h('p', { class: 'faint' }, opt.topic) : null));
    let prev = null, lastDay = '';
    for (const m of messages) {
      const day = new Date(m.at * 1000).toDateString();
      if (day !== lastDay) { list.appendChild(h('div', { class: 'cm-day', role: 'separator' }, h('span', null, new Date(m.at * 1000).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })))); lastDay = day; prev = null; }
      const grouped = prev && prev.user.id === m.user.id && m.at - prev.at < 300 && !m.reply && !prev.deleted;
      list.appendChild(msgEl(m, grouped));
      prev = m;
    }
    if (keep === 'bottom') toBottom();
    else if (keep === 'older') list.scrollTop = list.scrollHeight - prevH + prevTop;
    else list.scrollTop = prevTop;
  }
  function markRead() {
    clearTimeout(readTimer);
    readTimer = setTimeout(() => { const last = messages[messages.length - 1]; if (last && !document.hidden) { api.post(`/api/cm/channels/${cid}/read`, { lastId: last.id }).catch(() => {}); opt.onRead?.(); } }, 600);
  }
  function add(m) {
    if (messages.some(x => x.id === m.id)) return;
    const stick = nearBottom() || m.user.id === cm.me.user.id;
    messages.push(m);
    if (messages.length > 400) messages = messages.slice(-300);
    draw(stick ? 'bottom' : 'keep');
    markRead();
  }
  function replace(m) {
    const i = messages.findIndex(x => x.id === m.id);
    if (i < 0) return;
    messages[i] = m;
    const el = list.querySelector(`.cm-msg[data-id="${m.id}"]`);
    if (el) el.replaceWith(msgEl(m, el.classList.contains('is-grouped')));
  }
  async function older() {
    if (loading || !messages.length) return;
    loading = true;
    try { const r = await api.get(`/api/cm/channels/${cid}/messages?before=${messages[0].id}&limit=50`); messages = [...r.messages, ...messages]; more = r.more; draw('older'); }
    catch (e) { toast('Kunne ikke hente ældre beskeder', { type: 'bad', text: e.message }); }
    finally { loading = false; }
  }
  list.addEventListener('scroll', () => { if (list.scrollTop < 40 && more && !loading) older(); });

  async function load() {
    try { const r = await api.get(`/api/cm/channels/${cid}/messages?limit=50`); messages = r.messages; more = r.more; draw(); markRead(); }
    catch (e) { h(clear(list), null, h('p', { class: 'field-error', style: { padding: '20px' } }, e.message)); }
  }
  function drawTyping() {
    const now = Date.now();
    for (const [k, v] of typers) if (now - v.at > 6000) typers.delete(k);
    const names = [...typers.values()].map(v => v.name);
    typingEl.textContent = names.length ? `${names.slice(0, 3).join(', ')} ${names.length === 1 ? 'skriver' : 'skriver'} …` : '';
  }
  const typingTick = setInterval(drawTyping, 2000);

  const composer = h('div', { class: 'cm-composer-wrap' });
  function drawComposer() {
    const g = opt.gate?.();
    if (g) { h(clear(composer), null, g); return; }
    if (!opt.canWrite()) { h(clear(composer), null, h('div', { class: 'cm-readonly' }, icon('lock'), opt.readOnlyText?.() || 'Du kan ikke skrive her.')); return; }
    h(clear(composer), null, replyBar,
      h('div', { class: 'cm-composer' },
        h('button', { class: 'icon-btn', title: 'Send et billede eller en lydfil', 'aria-label': 'Vedhæft fil', onclick: () => fileIn.click() }, icon('paperclip')),
        h('button', { class: 'icon-btn', title: 'Del en note, aftale, opgave eller kodestump', 'aria-label': 'Del fra dine apps', onclick: async () => {
          const a = await pickFromApps();
          if (!a) return;
          const { sub, ...attach } = a; void sub;
          try { await post({ body: input.value.trim(), attach }); input.value = ''; autosize(); } catch (e) { toast('Kunne ikke dele', { type: 'bad', text: e.message }); }
        } }, icon('share')),
        input,
        h('div', { class: 'cm-emoji-wrap' }, h('button', { class: 'icon-btn', 'aria-label': 'Emoji', 'aria-expanded': 'false', onclick: (e) => { emojiPop.hidden = !emojiPop.hidden; e.currentTarget.setAttribute('aria-expanded', String(!emojiPop.hidden)); } }, icon('smile')), emojiPop),
        sendBtn, fileIn),
      typingEl);
  }
  drawComposer();
  load();

  const el = h('div', { class: 'cm-chat' }, list, composer);
  return {
    el,
    focus: () => input.focus(),
    refreshComposer: drawComposer,
    reload: load,
    onLive(ev) {
      if (ev.channel !== cid) return;
      if (ev.type === 'msg') { typers.delete(ev.message.user.id); drawTyping(); add(ev.message); }
      else if (ev.type === 'msg-edit') replace(ev.message);
      else if (ev.type === 'msg-delete') { const m = messages.find(x => x.id === ev.id); if (m) replace({ ...m, deleted: true, body: '', file: null, attach: null, reactions: [] }); }
      else if (ev.type === 'msg-react') { const m = messages.find(x => x.id === ev.id); if (m) replace({ ...m, reactions: ev.reactions.map(r => ({ ...r, me: ev.by === cm.me.user.id ? r.me : (m.reactions.find(o => o.emoji === r.emoji)?.me || false) })) }); }
      else if (ev.type === 'typing') { typers.set(ev.user.id, { name: ev.user.name, at: Date.now() }); drawTyping(); }
    },
    destroy() { clearInterval(typingTick); clearTimeout(readTimer); },
  };
}
