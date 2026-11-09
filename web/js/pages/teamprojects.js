/**
 * Projekter – a room for each project: the conversation, a call with the whole team (also from the other PCs),
 * tasks, a note, a shared folder where every change carries a description (a person or an AI can look it through
 * first), and a website made from the folder. The server keeps a copy on every PC a member uses (server/projects.py).
 */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal, confirmDialog, segmented, switchControl } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { store } from '../core/store.js';
import { appById } from '../core/registry.js';
import { setAiContext } from '../ai/context.js';
import { copy } from '../features/appkit.js';
import { diffLines, hunks, countChanges, unified } from '../features/linediff.js';
import { currentCall } from '../features/calls.js';

const COLORS = ['#e8763a', '#8fb3d9', '#8fcf9b', '#c4a7e7', '#e8b46a', '#7fc4c4', '#e57b6a'];
const TABS = [['samtale', 'Samtale'], ['opgaver', 'Opgaver'], ['kode', 'Kode'], ['aendringer', 'Ændringer'], ['noter', 'Noter'], ['side', 'Hjemmeside'], ['indstillinger', 'Indstillinger']];
export const COMMIT_TEMPLATE = 'Hvad: \nHvorfor: \nSådan testes: ';
const P = (pid, sub = '') => `/api/pj/${pid}${sub}`;
const me = () => store.get('user');
const hueOf = (s = '') => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (n = '') => (String(n).trim()[0] || '?').toUpperCase();
const clock = (ms) => new Date(ms).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (ms) => { const d = new Date(ms), t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'I dag'; if (d.toDateString() === y.toDateString()) return 'I går';
  return d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }); };

/** A message's text split into paragraphs and code blocks (```lang … ```). Pure – tested. */
export function parseBlocks(text = '') {
  const out = [];
  const re = /```([\w+#.-]*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'p', text: text.slice(last, m.index).replace(/^\n+|\n+$/g, '') });
    out.push({ type: 'code', lang: m[1] || '', text: m[2].replace(/\n$/, '') });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: 'p', text: text.slice(last).replace(/^\n+|\n+$/g, '') });
  return out.filter(b => b.type === 'code' || b.text);
}

/** Inline pieces of a paragraph: text, `code`, @name and links. Pure – tested. */
export function parseInline(text = '') {
  const out = [];
  const re = /(`[^`\n]+`)|(@[a-z0-9._-]{2,64})|(https?:\/\/[^\s<>()]+[^\s<>().,!?])/gi;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) });
    if (m[1]) out.push({ t: 'code', s: m[1].slice(1, -1) });
    else if (m[2]) out.push({ t: 'mention', s: m[2].slice(1).toLowerCase() });
    else out.push({ t: 'link', s: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
  return out;
}

/** What the AI is asked when it looks through a change before it is handed in (pure – tested). */
export function aiReviewPrompt(title, diffs) {
  const body = diffs.join('\n\n').slice(0, 12000);
  return `Gennemgå denne ændring, før den bliver indsendt${title ? ` (“${title}”)` : ''}. Peg på fejl, sikkerhedshuller, `
    + `kode der kan gå i stykker, og test der mangler – med filnavn og linje. Vær kort. Er der intet at rette, så sig det.\n\n${body}`;
}

/** Is the description good enough to hand in? '' when it is, otherwise what is missing (pure – tested). */
export function commitProblem(title, descr) {
  if (String(title || '').trim().length < 3) return 'Giv ændringen en titel.';
  const d = String(descr || '').replace(/^(Hvad|Hvorfor|Sådan testes):\s*$/gim, '').trim();
  if (d.length < 10) return 'Beskriv, hvad du har ændret, og hvorfor.';
  return '';
}

function avatar(username, name, size = 34) {
  const card = (S.cur?.members || []).find(m => m.username === username);
  const el = h('span', { class: 'pj-ava', style: { '--c': hueOf(username), width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * .38)}px` } });
  if (card?.avatar && String(card.avatar).startsWith('/api/avatars/')) el.append(ava(card.avatar)); else el.textContent = initials(name || username);
  return el;
}

function richText(text) {
  return parseBlocks(text).map(b => b.type === 'code'
    ? h('div', { class: 'pj-code' }, h('pre', null, h('code', null, b.text)), h('button', { type: 'button', class: 'pj-code-copy', 'aria-label': 'Kopiér koden', onclick: () => copy(b.text, 'Koden er kopieret') }, icon('copy')))
    : h('p', { class: 'pj-p' }, parseInline(b.text).map(x => x.t === 'code' ? h('code', null, x.s)
      : x.t === 'mention' ? h('span', { class: ['pj-mention', x.s === me()?.username?.toLowerCase() && 'is-me'] }, `@${x.s}`)
        : x.t === 'link' ? h('a', { href: x.s, target: '_blank', rel: 'noopener noreferrer' }, x.s) : x.s)));
}

// ── page state ──
const S = { list: [], cur: null, tab: 'samtale', events: [], lastSeq: 0, deleted: new Set(), cleanup: [], root: null, listEl: null, mainEl: null, files: [], base: {}, ed: null, people: null };

async function loadList() {
  try { S.list = (await api.get('/api/pj')).projects; } catch { /* keep */ }
  drawList();
}
async function loadProject(pid) {
  S.cur = (await api.get(P(pid))).project;
  return S.cur;
}

function drawList() {
  if (!S.listEl) return;
  const active = S.list.filter(p => !p.archived), old = S.list.filter(p => p.archived);
  const item = (p) => h('a', { class: ['pj-li', S.cur?.id === p.id && 'is-on'], href: `#/apps/projects/${p.id}`, 'aria-current': S.cur?.id === p.id ? 'page' : null },
    h('span', { class: 'pj-li-dot', style: { background: p.color || hueOf(p.id) } }),
    h('span', { class: 'pj-li-main' },
      h('b', null, p.name),
      h('small', null, [p.customer, `${p.members.length} ${p.members.length === 1 ? 'person' : 'personer'}`].filter(Boolean).join(' · '))),
    p.call?.length ? h('span', { class: 'pj-li-call', title: `${p.call.join(', ')} i opkald` }, icon('phone'), String(p.call.length)) : null,
    p.unread ? h('span', { class: 'pj-badge', 'aria-label': `${p.unread} nye` }, String(p.unread > 99 ? '99+' : p.unread)) : null);
  const people = new Map();
  for (const p of active) for (const m of p.members) if (m.username !== me()?.username?.toLowerCase()) people.set(m.username, m);
  h(clear(S.listEl), null,
    h('div', { class: 'pj-list-h' }, h('h1', null, 'Projekter'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Nyt projekt', title: 'Nyt projekt', onclick: newProject }, icon('plus'))),
    active.length ? h('nav', { class: 'pj-lis', 'aria-label': 'Dine projekter' }, active.map(item))
      : h('div', { class: 'pj-empty-small' }, h('p', null, 'Ingen projekter endnu.'), h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: newProject }, icon('plus'), 'Nyt projekt')),
    people.size ? h('div', { class: 'pj-people' }, h('p', { class: 'pj-cap' }, 'Holdet'),
      [...people.values()].slice(0, 12).map(m => h('div', { class: 'pj-person' }, h('span', { class: 'pj-ava-wrap' }, avatar(m.username, m.name, 28), h('i', { class: ['pj-dot', m.online && 'is-on'] })),
        h('span', null, m.name, h('small', null, m.online ? 'online' : m.here ? 'ikke online' : 'på en anden pc'))))) : null,
    old.length ? h('details', { class: 'pj-old' }, h('summary', null, `Afsluttede (${old.length})`), h('nav', { class: 'pj-lis' }, old.map(item))) : null,
    h('p', { class: 'pj-private' }, icon('shield'), 'Beskeder og opkald går direkte mellem jeres pc’er – intet lægges i en sky.'));
}

function askText(title, value, hint) {
  return new Promise((resolve) => {
    const inp = h('input', { class: 'input', value, 'aria-label': title, maxlength: 160 });
    let done = false, m;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(inp.value.trim()); } });
    m = modal({ title, size: 440, body: h('div', { class: 'stack', style: { gap: '8px' } }, inp, hint ? h('p', { class: 'faint', style: { margin: 0 } }, hint) : null),
      actions: [h('button', { type: 'button', class: 'btn', onclick: () => finish('') }, 'Annuller'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => finish(inp.value.trim()) }, 'OK')],
      onClose: () => finish('') });
    requestAnimationFrame(() => { inp.focus(); inp.select(); });
  });
}

async function people() {
  if (!S.people) try { S.people = (await api.get('/api/pj/people')).people; } catch { S.people = []; }
  return S.people;
}

async function newProject() {
  const list = await people();
  const name = h('input', { class: 'input', maxlength: 80, placeholder: 'Fx Kontorflytning', 'aria-label': 'Navn' });
  const customer = h('input', { class: 'input', maxlength: 80, placeholder: 'Fx Hansen ApS (valgfrit)', 'aria-label': 'Kunde' });
  const deadline = h('input', { class: 'input', type: 'date', 'aria-label': 'Deadline' });
  let kind = 'work';
  const picked = new Set();
  const err = h('div', { class: 'field-error', role: 'alert' });
  const box = h('div', { class: 'pj-pick' }, list.length ? list.map(p => h('label', { class: 'pj-pick-row' },
    h('input', { type: 'checkbox', onchange: (e) => e.target.checked ? picked.add(p.username) : picked.delete(p.username) }), avatar(p.username, p.name, 26), h('span', null, p.name, h('small', null, `@${p.username}`))))
    : h('p', { class: 'faint' }, 'Der er ingen andre her endnu. Du kan tilføje folk senere – også fra jeres andre pc’er.'));
  let m;
  const go = async () => {
    err.textContent = '';
    if (!name.value.trim()) { name.focus(); err.textContent = 'Giv projektet et navn.'; return; }
    try {
      const r = await api.post('/api/pj', { name: name.value.trim(), kind, customer: customer.value.trim(), deadline: deadline.value, members: [...picked] });
      m.close(); S.list.unshift(r.project); location.hash = `#/apps/projects/${r.project.id}`;
    } catch (e) { err.textContent = e.message; }
  };
  m = modal({ title: 'Nyt projekt', size: 520,
    body: h('div', { class: 'stack', style: { gap: '12px' } },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Slags'), segmented([{ value: 'work', label: 'Arbejde' }, { value: 'code', label: 'Kode' }], kind, (v) => { kind = v; }, { label: 'Slags projekt' })),
      h('div', { class: 'pj-two' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Kunde'), customer), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Deadline'), deadline)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Hvem er med?'), box), err),
    actions: [h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { type: 'button', class: 'btn btn-primary', onclick: go }, 'Opret projekt')] });
  requestAnimationFrame(() => name.focus());
}

// ── the room ──
function callButton(p) {
  const inCall = p.call?.length;
  const mine = currentCall()?.id === `p${p.id}`;
  return h('button', { type: 'button', class: ['btn', inCall && !mine ? 'pj-join' : 'btn-primary'], onclick: () => joinCall(p) },
    icon('phone'), mine ? 'I opkaldet' : inCall ? 'Deltag i opkaldet' : 'Ring til holdet');
}
async function joinCall(p) {
  const m = await import('../features/calls.js');
  await m.joinProjectCall(p.id, p.name);
}

function header(p) {
  const tabs = TABS.filter(([id]) => id !== 'side' || p.kind === 'code' || p.site).map(([id, label]) => h('button', { type: 'button', role: 'tab', class: 'pj-tab', 'aria-selected': String(S.tab === id), onclick: () => setTab(id) },
    id === 'kode' && p.kind !== 'code' ? 'Filer' : label,
    id === 'opgaver' && p.tasks.open ? h('small', null, String(p.tasks.open)) : null,
    id === 'aendringer' && p.pending ? h('small', { class: 'is-hot' }, String(p.pending)) : null));
  return h('header', { class: 'pj-head' },
    h('div', { class: 'pj-head-row' },
      h('a', { class: 'icon-btn pj-back', href: '#/apps/projects', 'aria-label': 'Til projekterne' }, icon('arrowLeft')),
      h('div', { class: 'pj-head-t' },
        h('p', { class: 'pj-cap' }, [p.kind === 'code' ? 'Kodeprojekt' : 'Projekt', p.customer, p.deadline && `deadline ${new Date(`${p.deadline}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · ')),
        h('h2', null, p.name)),
      h('div', { class: 'pj-stack', 'aria-label': `${p.members.length} personer` }, p.members.slice(0, 5).map(m => avatar(m.username, m.name, 30))),
      callButton(p)),
    p.call?.length && currentCall()?.id !== `p${p.id}` ? h('div', { class: 'pj-callbar' }, h('i', { class: 'pj-live' }), h('span', null, h('b', null, `${p.call.join(' og ')} ${p.call.length === 1 ? 'er' : 'er'} i opkald`)),
      h('button', { type: 'button', class: 'btn btn-sm pj-join', onclick: () => joinCall(p) }, 'Deltag')) : null,
    h('div', { class: 'pj-tabs', role: 'tablist', 'aria-label': 'Projektet' }, tabs));
}

function setTab(id) {
  S.tab = id;
  try { history.replaceState(null, '', `#/apps/projects/${S.cur.id}${id === 'samtale' ? '' : `/${id}`}`); } catch { /* */ }
  drawRoom();
}

function drawRoom() {
  const p = S.cur;
  if (!S.mainEl) return;
  S.ed?.destroy?.(); S.ed = null;
  if (!p) {
    h(clear(S.mainEl), null, h('div', { class: 'pj-welcome' },
      h('h2', null, 'Vælg et projekt'),
      h('p', null, 'Hvert projekt har sin egen samtale, opkald med holdet, opgaver, noter og en fælles mappe til kode og filer.'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: newProject }, icon('plus'), 'Nyt projekt')));
    S.root?.classList.remove('has-room');
    return;
  }
  S.root?.classList.add('has-room');
  const body = h('div', { class: 'pj-body' });
  h(clear(S.mainEl), null, header(p), body);
  ({ samtale: drawChat, opgaver: drawTasks, kode: drawCode, aendringer: drawChanges, noter: drawNote, side: drawSite, indstillinger: drawSettings }[S.tab] || drawChat)(body, p);
  setAiContext({ kind: 'project', title: p.name, lesson: `Projektet ${p.name}`,
    getCode: () => S.ed?.get?.() || S.events.filter(e => e.kind === 'msg').slice(-15).map(e => `${e.name}: ${e.body.text}`).join('\n'), getOutput: () => '' });
}

// ── Samtale ──
function eventNode(e) {
  const b = e.body || {};
  const sys = (ic, ...parts) => h('div', { class: 'pj-sys' }, icon(ic), h('span', null, ...parts), h('time', null, clock(e.ts)));
  if (e.kind === 'msg') {
    if (S.deleted.has(e.id)) return null;
    const mine = e.author === me()?.username?.toLowerCase();
    return h('article', { class: ['pj-msg', mine && 'is-mine'], dataset: { id: e.id } }, avatar(e.author, e.name),
      h('div', { class: 'pj-msg-b' },
        h('div', { class: 'pj-msg-h' }, h('b', null, e.name || e.author), h('time', null, clock(e.ts)),
          mine ? h('button', { type: 'button', class: 'icon-btn btn-sm pj-del', 'aria-label': 'Slet beskeden', onclick: async () => {
            if (!await confirmDialog({ title: 'Slet beskeden?', text: 'Den forsvinder for alle i projektet.', confirmLabel: 'Slet', danger: true })) return;
            try { await api.del(P(S.cur.id, `/messages/${e.id}`)); S.deleted.add(e.id); drawRoom(); } catch (err) { toast(err.message, { type: 'bad' }); } } }, icon('trash')) : null),
        ...richText(b.text || ''),
        b.code ? h('div', { class: 'pj-code' }, h('pre', null, h('code', null, b.code.text))) : null));
  }
  if (e.kind === 'task') {
    if (b.done === true && b.title && Object.keys(b).length <= 3) return sys('checkCircle', h('b', null, e.name), ' lukkede opgaven ', h('b', null, b.title));
    if ('title' in b && 'assignee' in b && b.done === false) return sys('list', h('b', null, e.name), ' lavede opgaven ', h('b', null, b.title), b.assignee ? ` til ${memberName(b.assignee)}` : '');
    return null;
  }
  if (e.kind === 'commit') {
    const add = b.files.reduce((a, f) => a + (f.add || 0), 0), del = b.files.reduce((a, f) => a + (f.del || 0), 0);
    return h('div', { class: 'pj-commit-card' }, icon('commit'),
      h('div', null, h('div', null, h('b', null, e.name), ' indsendte ', h('b', null, b.title)),
        h('small', null, `${b.files.length} ${b.files.length === 1 ? 'fil' : 'filer'} · `, h('span', { class: 'pj-add' }, `+${add}`), ' ', h('span', { class: 'pj-rem' }, `−${del}`),
          b.needsReview ? ' · venter på godkendelse' : '', b.aiChecked ? ' · gennemgået af AI' : '')),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { S.openCommit = b.cid; setTab('aendringer'); } }, 'Se ændringen'));
  }
  if (e.kind === 'review') return sys(b.state === 'approved' ? 'checkCircle' : 'alert', h('b', null, e.name), b.state === 'approved' ? ' godkendte ' : ' bad om ændringer til ', h('b', null, b.title || 'en ændring'), b.text ? `: “${b.text}”` : '');
  if (e.kind === 'member') return sys(b.op === 'remove' ? 'logout' : 'userPlus', h('b', null, e.name), b.op === 'remove' ? (b.username === e.author ? ' forlod projektet' : ` fjernede ${memberName(b.username)}`) : ` tilføjede ${b.name || b.username}`);
  if (e.kind === 'call') return sys('phone', h('b', null, e.name), ' startede et opkald');
  if (e.kind === 'project') return sys('sparkles', h('b', null, e.name), ' oprettede projektet');
  return null;
}
const memberName = (u) => (S.cur?.members || []).find(m => m.username === u)?.name || u;

function drawEvents(listEl) {
  const nodes = [];
  let day = '';
  for (const e of S.events) {
    if (e.kind === 'msg-del') { S.deleted.add(e.body.target); continue; }
  }
  for (const e of S.events) {
    if (e.kind === 'msg-del') continue;
    const n = eventNode(e);
    if (!n) continue;
    const d = dayLabel(e.ts);
    if (d !== day) { day = d; nodes.push(h('div', { class: 'pj-day' }, h('span', null, d))); }
    nodes.push(n);
  }
  h(clear(listEl), null, nodes.length ? nodes : h('div', { class: 'pj-chat-empty' }, icon('chat'), h('p', null, 'Skriv den første besked – fx hvad projektet går ud på.')));
  listEl.scrollTop = listEl.scrollHeight;
}

async function drawChat(body, p) {
  const listEl = h('div', { class: 'pj-chat', 'aria-live': 'polite' });
  const ta = h('textarea', { class: 'pj-compose-in', rows: 1, maxlength: 4000, placeholder: `Skriv til ${p.name} … (@ for at nævne, \`\`\` for kode)`, 'aria-label': 'Besked' });
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(200, ta.scrollHeight)}px`; };
  const send = async () => {
    const text = ta.value.trim(); if (!text) return;
    ta.value = ''; grow();
    try { const r = await api.post(P(p.id, '/messages'), { text }); if (!S.events.some(x => x.seq === r.event.seq)) { S.events.push(r.event); S.lastSeq = Math.max(S.lastSeq, r.event.seq); } drawEvents(listEl); }
    catch (e) { ta.value = text; toast(e.message, { type: 'bad' }); }
  };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !ta.value.trimStart().startsWith('```') || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); send(); } });
  const codeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Indsæt kodeblok', title: 'Kodeblok', onclick: () => { const s = ta.selectionStart; ta.setRangeText('```\n\n```', s, ta.selectionEnd, 'end'); ta.selectionStart = ta.selectionEnd = s + 4; ta.focus(); grow(); } }, icon('code'));
  h(body, null, listEl, h('form', { class: 'pj-compose', onsubmit: (e) => { e.preventDefault(); send(); } }, ta, codeBtn, h('button', { type: 'submit', class: 'pj-send', 'aria-label': 'Send' }, icon('send'))));
  drawEvents(listEl);
  S.chatList = listEl;
  if (!S.events.length) {
    try { const r = await api.get(P(p.id, '/events?limit=120')); S.events = r.events; S.lastSeq = r.events.at(-1)?.seq || 0; } catch { /* */ }
    drawEvents(listEl);
  }
  markRead();
  requestAnimationFrame(() => ta.focus());
}
let readT = 0;
function markRead() {
  clearTimeout(readT);
  readT = setTimeout(() => { if (S.cur && S.lastSeq) api.post(P(S.cur.id, '/read'), { seq: S.lastSeq }).then(() => { const x = S.list.find(l => l.id === S.cur?.id); if (x && x.unread) { x.unread = 0; drawList(); } }).catch(() => {}); }, 400);
}
async function fetchNew() {
  if (!S.cur) return;
  try {
    const r = await api.get(P(S.cur.id, `/events?after=${S.lastSeq}&limit=200`));
    for (const e of r.events) if (!S.events.some(x => x.seq === e.seq)) S.events.push(e);
    S.lastSeq = Math.max(S.lastSeq, r.events.at(-1)?.seq || 0);
    if (S.tab === 'samtale' && S.chatList?.isConnected) { drawEvents(S.chatList); markRead(); }
  } catch { /* */ }
}

// ── Opgaver ──
function drawTasks(body, p) {
  const title = h('input', { class: 'input', maxlength: 200, placeholder: 'Ny opgave …', 'aria-label': 'Ny opgave' });
  const who = h('select', { class: 'select', 'aria-label': 'Hvem' }, h('option', { value: '' }, 'Ingen'), p.members.map(m => h('option', { value: m.username }, m.name)));
  const due = h('input', { class: 'input', type: 'date', 'aria-label': 'Deadline' });
  const add = async () => {
    if (!title.value.trim()) return title.focus();
    try { await api.post(P(p.id, '/tasks'), { title: title.value.trim(), assignee: who.value, due: due.value }); title.value = ''; await refreshProject(); } catch (e) { toast(e.message, { type: 'bad' }); }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const open = p.tasksList.filter(t => !t.done), done = p.tasksList.filter(t => t.done);
  const row = (t) => h('li', { class: ['pj-task', t.done && 'is-done'] },
    h('input', { type: 'checkbox', checked: t.done, 'aria-label': t.title, onchange: async (e) => { try { await api.patch(P(p.id, `/tasks/${t.id}`), { done: e.target.checked }); await refreshProject(); } catch (err) { toast(err.message, { type: 'bad' }); } } }),
    h('span', { class: 'pj-task-t' }, t.title, h('small', null, [t.assignee && memberName(t.assignee), t.due && new Date(`${t.due}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ') || 'Ingen ansvarlig')),
    h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Slet ${t.title}`, onclick: async () => { try { await api.patch(P(p.id, `/tasks/${t.id}`), { gone: true }); await refreshProject(); } catch (err) { toast(err.message, { type: 'bad' }); } } }, icon('trash')));
  const total = p.tasksList.length;
  h(body, null, h('div', { class: 'pj-pane' },
    h('div', { class: 'pj-progress' }, h('span', null, h('i', { style: { width: `${total ? Math.round(done.length / total * 100) : 0}%` } })), h('small', null, `${done.length} af ${total} klar`)),
    h('div', { class: 'pj-task-add' }, title, who, due, h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj')),
    open.length ? h('ul', { class: 'pj-tasks' }, open.map(row)) : h('p', { class: 'faint' }, 'Ingen åbne opgaver.'),
    done.length ? h('details', { class: 'pj-done' }, h('summary', null, `Klaret (${done.length})`), h('ul', { class: 'pj-tasks' }, done.map(row))) : null));
}

// ── Kode / Filer: a working copy on this device, handed in with a description ──
const workKey = (pid) => `hubtech.pj.work.${pid}`;
const getWork = (pid) => { try { return JSON.parse(localStorage.getItem(workKey(pid)) || '{}'); } catch { return {}; } };
const setWork = (pid, w) => { try { localStorage.setItem(workKey(pid), JSON.stringify(w)); } catch { toast('Arbejdskopien er for stor til at blive gemt i browseren – indsend snart.', { type: 'warn' }); } };
async function baseOf(pid, path) {
  if (!(path in S.base)) {
    if (!S.files.some(f => f.path === path)) S.base[path] = null;
    else { try { S.base[path] = (await api.get(P(pid, `/file?path=${encodeURIComponent(path)}`))).content; } catch { S.base[path] = null; } }
  }
  return S.base[path];
}
async function changes(pid) {
  const w = getWork(pid), out = [];
  for (const [path, x] of Object.entries(w)) {
    const base = await baseOf(pid, path);
    if (x.del) { if (base !== null) out.push({ path, del: true, base }); continue; }
    if (x.binary || base !== x.content) out.push({ path, content: x.content, binary: !!x.binary, base });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
const langOf = (path) => import('./codepad.js').then(m => m.langOfFile(path));

async function drawCode(body, p) {
  const tree = h('ul', { class: 'pj-tree', role: 'list' });
  const edHost = h('div', { class: 'pj-ed' }, h('p', { class: 'faint', style: { padding: '16px' } }, 'Vælg en fil – eller lav en ny.'));
  const fileBar = h('div', { class: 'pj-filebar' });
  const side = h('aside', { class: 'pj-submit' });
  let open = null;
  try { S.files = (await api.get(P(p.id, '/files'))).files; } catch { S.files = []; }
  const drawTree = async () => {
    const w = getWork(p.id);
    const paths = new Set([...S.files.map(f => f.path), ...Object.keys(w).filter(k => !w[k].del)]);
    const ch = new Map((await changes(p.id)).map(c => [c.path, c]));
    h(clear(tree), null, [...paths].sort().map(path => h('li', null, h('button', { type: 'button', class: ['pj-file', open === path && 'is-on'], onclick: () => openFile(path) },
      h('span', { class: 'pj-file-n' }, path), ch.has(path) ? h('span', { class: ch.get(path).base === null ? 'pj-new' : 'pj-mod', title: ch.get(path).base === null ? 'Ny' : 'Ændret' }, ch.get(path).base === null ? 'Ny' : 'Æ') : null))),
    [...ch.values()].filter(c => c.del).map(c => h('li', null, h('span', { class: 'pj-file is-del' }, h('span', { class: 'pj-file-n' }, c.path), h('span', { class: 'pj-rem' }, 'Slet')))));
    if (!paths.size) tree.append(h('li', { class: 'faint', style: { padding: '8px' } }, 'Mappen er tom.'));
    drawSubmit([...ch.values()]);
  };
  const saveDraft = (path, text) => { if (!path || S.quiet) return; const w = getWork(p.id); w[path] = { content: text }; setWork(p.id, w); clearTimeout(S.treeT); S.treeT = setTimeout(drawTree, 500); };
  const blank = () => { S.quiet = true; try { S.ed?.set(''); } finally { S.quiet = false; } };
  async function openFile(path) {
    open = path;
    const w = getWork(p.id);
    const meta = S.files.find(f => f.path === path);
    if (meta?.binary || w[path]?.binary) {
      S.ed?.destroy?.(); S.ed = null;
      h(clear(edHost), null, h('p', { class: 'faint', style: { padding: '16px' } }, `${path} er en billed- eller binær fil og kan ikke redigeres her.`));
    } else {
      const text = w[path] && !w[path].del ? w[path].content : await baseOf(p.id, path) ?? '';
      const lang = await langOf(path);
      if (!S.ed) {
        clear(edHost);
        try {
          const CM = await import(new URL('/vendor/codemirror/codemirror.min.js', location.origin).href);
          S.ed = CM.createEditor(edHost, { doc: text, lang, onChange: (t) => saveDraft(open, t), label: `Kode: ${path}` });
        } catch {
          const ta = h('textarea', { class: 'textarea pj-ta', spellcheck: 'false', 'aria-label': `Kode: ${path}` }); ta.value = text;
          ta.addEventListener('input', () => saveDraft(open, ta.value));
          edHost.append(ta);
          S.ed = { get: () => ta.value, set: (v) => { ta.value = v; }, setLang() {}, destroy() {} };
        }
      } else { S.quiet = true; try { S.ed.set(text); } finally { S.quiet = false; } S.ed.setLang(lang); if (getWork(p.id)[path]?.content === text && (await baseOf(p.id, path)) === text) { const w2 = getWork(p.id); delete w2[path]; setWork(p.id, w2); } }
    }
    h(clear(fileBar), null, h('span', { class: 'pj-path' }, path),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => discard(path) }, icon('undo'), 'Fortryd mine ændringer'),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => removeFile(path) }, icon('trash'), 'Slet fil'));
    drawTree();
  }
  async function discard(path) {
    const w = getWork(p.id); delete w[path]; setWork(p.id, w);
    if (open === path) { const base = await baseOf(p.id, path); if (base === null) { open = null; blank(); } else { S.quiet = true; try { S.ed?.set(base); } finally { S.quiet = false; } } }
    drawTree();
  }
  function removeFile(path) {
    const w = getWork(p.id);
    if (S.files.some(f => f.path === path)) w[path] = { del: true }; else delete w[path];
    setWork(p.id, w); open = null; blank(); clear(fileBar); drawTree();
  }
  const newFile = async () => {
    const { cleanName } = await import('./codepad.js');
    const name = await askText('Ny fil', p.kind === 'code' ? 'README.md' : 'noter.md', 'Brug / til mapper, fx src/app.py eller site/index.html. Endelsen bestemmer sproget.');
    const path = String(name || '').split('/').map(cleanName).filter(Boolean).join('/');
    if (!path) return;
    const w = getWork(p.id); w[path] = { content: '' }; setWork(p.id, w); openFile(path);
  };
  const upload = h('input', { type: 'file', multiple: true, hidden: true, onchange: async () => {
    const w = getWork(p.id);
    for (const f of upload.files) {
      if (f.size > 512 * 1024) { toast(`${f.name} er for stor (højst 512 KB)`, { type: 'bad' }); continue; }
      const textish = /^text\/|json|xml|javascript|svg/.test(f.type) || /\.(py|js|ts|md|txt|html|css|sql|sh|ps1|json|yml|yaml|toml|ini|c|h|cpp|java|cs|go|rs|lua)$/i.test(f.name);
      if (textish) w[f.name] = { content: await f.text() };
      else { const buf = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); w[f.name] = { content: btoa(s), binary: true }; }
    }
    setWork(p.id, w); upload.value = ''; drawTree();
  } });

  function drawSubmit(list) {
    // what you have written survives when the list of files is drawn again (fx while you type in the editor)
    const form = S.form ||= { title: '', descr: COMMIT_TEMPLATE, task: '', aiChecked: false };
    const title = h('input', { class: 'input', maxlength: 120, placeholder: 'Fx Ret login-fejl på lageret', 'aria-label': 'Titel på ændringen', value: form.title, oninput: (e) => { form.title = e.target.value; } });
    const descr = h('textarea', { class: 'textarea', rows: 6, maxlength: 4000, 'aria-label': 'Beskrivelse af ændringen', oninput: (e) => { form.descr = e.target.value; } }); descr.value = form.descr;
    const task = h('select', { class: 'select', 'aria-label': 'Lukker opgave', onchange: (e) => { form.task = e.target.value; } }, h('option', { value: '' }, 'Ingen opgave'), p.tasksList.filter(t => !t.done).map(t => h('option', { value: t.id, selected: t.id === form.task }, t.title)));
    const err = h('div', { class: 'field-error', role: 'alert' });
    const aiNote = h('p', { class: 'faint pj-ai-note' }, form.aiChecked ? 'Gnist har kigget på ændringen. Den får mærket “gennemgået af AI”, når du indsender.' : 'Valgfrit: lad en AI kigge ændringen igennem for fejl, før du indsender. Svaret kommer i Gnist – du vælger selv, om du vil rette noget.');
    const review = async () => {
      const diffs = list.map(c => c.del ? `--- ${c.path}\n(slettes)` : c.binary ? `+++ ${c.path} (billede/binær)` : unified(c.path, c.base ?? '', c.content));
      form.aiChecked = true; aiNote.textContent = 'Gnist kigger på ændringen nu. Ændringen får mærket “gennemgået af AI”, når du indsender.';
      const m = await import('../ai/panel.js'); m.askAssistant(aiReviewPrompt(title.value.trim(), diffs));
    };
    const submit = async (btn) => {
      err.textContent = commitProblem(title.value, descr.value);
      if (err.textContent) return;
      btn.disabled = true;
      try {
        list = await changes(p.id);   // what is in the working copy right now – also what was typed a moment ago
        if (!list.length) { err.textContent = 'Der er ingen ændringer at indsende.'; return; }
        await api.post(P(p.id, '/commits'), { title: title.value.trim(), descr: descr.value.trim(), task: task.value, aiChecked: form.aiChecked,
          files: list.map(c => c.del ? { path: c.path, delete: true } : { path: c.path, content: c.content, binary: c.binary }) });
        const w = getWork(p.id); list.forEach(c => delete w[c.path]); setWork(p.id, w);
        S.base = {}; S.form = null; toast(p.review ? 'Ændringen er sendt til godkendelse' : 'Ændringen er lagt i den fælles mappe', { type: 'ok' });
        S.files = (await api.get(P(p.id, '/files'))).files; open = null; blank(); clear(fileBar); refreshProject(false); drawTree();
      } catch (e) { err.textContent = e.message; } finally { btn.disabled = false; }
    };
    const total = list.reduce((a, c) => { if (c.del || c.binary) return a; const x = countChanges(diffLines(c.base ?? '', c.content)); return { add: a.add + x.add, del: a.del + x.del }; }, { add: 0, del: 0 });
    h(clear(side), null, h('h3', null, 'Indsend ændring'),
      list.length ? h('p', { class: 'pj-sum' }, `${list.length} ${list.length === 1 ? 'fil' : 'filer'} · `, h('span', { class: 'pj-add' }, `+${total.add}`), ' ', h('span', { class: 'pj-rem' }, `−${total.del}`))
        : h('p', { class: 'faint' }, 'Ingen ændringer endnu. Ret i en fil, lav en ny, eller hent filer ind.'),
      list.length ? [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel ', h('small', { class: 'faint' }, '– kort, i bydeform')), title),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Beskrivelse ', h('small', { class: 'faint' }, '– hvad og hvorfor')), descr),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Lukker opgave'), task),
        h('div', { class: 'pj-ai' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: review }, icon('sparkles'), 'Lad en AI gennemgå ændringen'), aiNote),
        err,
        (() => { const b = h('button', { type: 'button', class: 'btn btn-primary btn-block' }, p.review ? 'Indsend til godkendelse' : 'Indsend ændring'); b.addEventListener('click', () => submit(b)); return b; })(),
        h('p', { class: 'faint pj-small' }, 'Ændringen vises i samtalen. Den gamle version gemmes i historikken, så I kan gå tilbage.'),
      ] : null);
  }

  h(body, null, h('div', { class: 'pj-code-grid' },
    h('aside', { class: 'pj-files' }, h('div', { class: 'pj-files-h' }, h('b', null, 'Fælles mappe'),
      h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Ny fil', title: 'Ny fil', onclick: newFile }, icon('plus')),
      h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': 'Hent filer ind', title: 'Hent filer ind', onclick: () => upload.click() }, icon('upload'))), tree, upload),
    h('section', { class: 'pj-edwrap' }, fileBar, edHost),
    side));
  drawTree();
}

// ── Ændringer ──
async function drawChanges(body, p) {
  const listEl = h('ul', { class: 'pj-commits', role: 'list' });
  const detail = h('section', { class: 'pj-commit' });
  h(body, null, h('div', { class: 'pj-changes' }, listEl, detail));
  let list = [];
  try { list = (await api.get(P(p.id, '/commits'))).commits; } catch (e) { listEl.append(h('li', { class: 'faint' }, e.message)); return; }
  const state = (c) => c.merged ? (c.needsReview ? ['Godkendt', 'ok'] : ['I mappen', 'ok']) : c.changesBy.length ? ['Ændringer ønsket', 'warn'] : ['Venter på godkendelse', 'warn'];
  const open = async (cid) => {
    S.openCommit = cid;
    for (const li of listEl.children) li.classList.toggle('is-on', li.dataset.id === cid);
    let c; try { c = (await api.get(P(p.id, `/commits/${cid}`))).commit; } catch (e) { h(clear(detail), null, h('p', { class: 'faint' }, e.message)); return; }
    const [st, cls] = state(c);
    const reviewText = h('input', { class: 'input', maxlength: 2000, placeholder: 'Kommentar (valgfri)', 'aria-label': 'Kommentar' });
    const act = async (s) => { try { await api.post(P(p.id, `/commits/${cid}/review`), { state: s, text: reviewText.value.trim() }); toast(s === 'approved' ? 'Godkendt' : 'Du har bedt om ændringer', { type: 'ok' }); drawRoom(); } catch (e) { toast(e.message, { type: 'bad' }); } };
    const mine = c.author === me()?.username?.toLowerCase();
    h(clear(detail), null,
      h('div', { class: 'pj-commit-h' }, h('span', { class: `pj-state is-${cls}` }, st), c.aiChecked ? h('span', { class: 'pj-state' }, icon('sparkles'), 'Gennemgået af AI') : null),
      h('h3', null, c.title),
      h('p', { class: 'faint' }, `${c.name || c.author} · ${new Date(c.ts).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
        c.approvedBy.length ? ` · godkendt af ${c.approvedBy.map(memberName).join(', ')}` : ''),
      h('div', { class: 'pj-descr' }, ...richText(c.descr)),
      !mine && !c.merged ? h('div', { class: 'pj-review' }, reviewText, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => act('approved') }, icon('check'), 'Godkend'), h('button', { type: 'button', class: 'btn btn-sm', onclick: () => act('changes') }, 'Bed om ændringer')) : null,
      c.files.map(f => h('details', { class: 'pj-diff', open: c.files.length <= 4 },
        h('summary', null, h('span', { class: 'pj-path' }, f.path), f.op === 'del' ? h('span', { class: 'pj-rem' }, 'slettet') : f.binary ? h('span', { class: 'faint' }, 'billede/binær') : [h('span', { class: 'pj-add' }, `+${f.add}`), ' ', h('span', { class: 'pj-rem' }, `−${f.del}`)]),
        f.op === 'del' || f.binary ? null : diffView(f.old, f.new))),
      c.merged ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: async () => {
        if (!await confirmDialog({ title: 'Gå tilbage?', text: `Filerne fra “${c.title}” sættes tilbage til, som de var før. Det bliver en ny ændring, så intet forsvinder.`, confirmLabel: 'Gå tilbage' })) return;
        try { await api.post(P(p.id, `/commits/${cid}/restore`)); toast('Filerne er sat tilbage', { type: 'ok' }); drawRoom(); } catch (e) { toast(e.message, { type: 'bad' }); } } }, icon('undo'), 'Gå tilbage til før denne ændring') : null);
  };
  h(clear(listEl), null, list.length ? list.map(c => { const [st, cls] = state(c); const add = c.files.reduce((a, f) => a + f.add, 0), del = c.files.reduce((a, f) => a + f.del, 0);
    return h('li', { dataset: { id: c.id } }, h('button', { type: 'button', onclick: () => open(c.id) },
      h('b', null, c.title), h('small', null, `${c.name || c.author} · ${new Date(c.ts).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })} · `, h('span', { class: 'pj-add' }, `+${add}`), ' ', h('span', { class: 'pj-rem' }, `−${del}`)),
      h('span', { class: `pj-state is-${cls}` }, st))); })
    : h('li', { class: 'pj-empty-small' }, h('p', null, 'Ingen ændringer endnu. Under Kode ret du filer og indsender dem med en beskrivelse.')));
  if (S.openCommit && list.some(c => c.id === S.openCommit)) open(S.openCommit);
  else if (list[0]) open(list[0].id);
}
function diffView(oldText, newText) {
  const hs = hunks(diffLines(oldText ?? '', newText ?? ''), 3);
  if (!hs.length) return h('p', { class: 'faint', style: { padding: '8px 12px' } }, 'Ingen forskel.');
  return h('div', { class: 'pj-diffbody' }, hs.map(hk => h('div', { class: 'pj-hunk' }, hk.lines.map(d => h('div', { class: `pj-dl is-${d.t === '+' ? 'add' : d.t === '-' ? 'rem' : 'ctx'}` },
    h('span', { class: 'pj-ln' }, d.t === '+' ? '' : String(d.a ?? '')), h('span', { class: 'pj-ln' }, d.t === '-' ? '' : String(d.b ?? '')), h('code', null, `${d.t === ' ' ? ' ' : d.t} ${d.s}`))))));
}

// ── Noter ──
function drawNote(body, p) {
  const ta = h('textarea', { class: 'textarea pj-note', rows: 18, maxlength: 20000, placeholder: 'Fælles noter for projektet: adresser, koder til udstyr (ikke adgangskoder!), aftaler, huskeliste …', 'aria-label': 'Projektets noter' });
  ta.value = p.note || '';
  const st = h('small', { class: 'faint' }, p.noteBy ? `Senest ændret af ${p.noteBy}` : 'Alle i projektet kan skrive her.');
  let t = 0;
  ta.addEventListener('input', () => { st.textContent = 'Gemmer …'; clearTimeout(t); t = setTimeout(async () => { try { await api.put(P(p.id, '/note'), { text: ta.value }); p.note = ta.value; st.textContent = 'Gemt'; } catch (e) { st.textContent = e.message; } }, 800); });
  h(body, null, h('div', { class: 'pj-pane' }, ta, st));
}

// ── Hjemmeside ──
function drawSite(body, p) {
  const url = `${location.origin}/side/${p.slug}/`;
  const dir = h('input', { class: 'input', maxlength: 120, value: p.siteDir || '', placeholder: 'fx site (tom = hele mappen)', 'aria-label': 'Mappe der udgives' });
  const save = async (patch) => { try { S.cur = (await api.patch(P(p.id), patch)).project; drawRoom(); } catch (e) { toast(e.message, { type: 'bad' }); } };
  h(body, null, h('div', { class: 'pj-site' },
    h('div', { class: 'pj-pane' },
      h('div', { class: 'pj-site-on' }, h('div', null, h('b', null, p.site ? 'Hjemmesiden er udgivet' : 'Udgiv en hjemmeside fra mappen'), h('p', { class: 'faint' }, 'Som GitHub Pages: filerne i den fælles mappe bliver en hjemmeside. index.html er forsiden.')),
        switchControl({ checked: p.site, label: 'Udgiv hjemmesiden', onChange: (v) => save({ site: v }) })),
      p.site ? [
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Hvem kan se den?'), segmented([{ value: 'team', label: 'Kun holdet' }, { value: 'all', label: 'Alle med linket' }], p.sitePublic ? 'all' : 'team', (v) => save({ sitePublic: v === 'all' }), { label: 'Hvem kan se hjemmesiden' })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Mappe der udgives'), h('div', { class: 'row', style: { gap: '8px' } }, dir, h('button', { type: 'button', class: 'btn', onclick: () => save({ siteDir: dir.value.trim().replace(/^\/+|\/+$/g, '') }) }, 'Gem'))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Adresse'), h('div', { class: 'pj-url' }, h('code', null, url), h('button', { type: 'button', class: 'btn btn-sm', onclick: () => copy(url, 'Adressen er kopieret') }, icon('copy'), 'Kopiér'), h('a', { class: 'btn btn-sm', href: url, target: '_blank', rel: 'noopener' }, icon('external'), 'Åbn'))),
        h('p', { class: 'faint pj-small' }, 'På jeres netværk virker adressen med det samme. Til internettet: slå den offentlige adresse til under Indstillinger → Om → Netværk – så virker /side/', p.slug, '/ også derfra. Siden ligger på jeres egne pc’er: ingen reklamer, ingen sporing.'),
      ] : null),
    p.site ? h('div', { class: 'pj-preview' }, h('div', { class: 'pj-preview-bar' }, h('span', null, `…/side/${p.slug}/`)), h('iframe', { src: url, title: 'Forhåndsvisning af hjemmesiden', sandbox: 'allow-scripts allow-forms', loading: 'lazy' })) : null));
}

// ── Indstillinger ──
async function drawSettings(body, p) {
  const name = h('input', { class: 'input', maxlength: 80, value: p.name, 'aria-label': 'Navn' });
  const customer = h('input', { class: 'input', maxlength: 80, value: p.customer, 'aria-label': 'Kunde' });
  const deadline = h('input', { class: 'input', type: 'date', value: p.deadline, 'aria-label': 'Deadline' });
  let color = p.color;
  const sw = h('div', { class: 'pj-swatches', role: 'radiogroup', 'aria-label': 'Farve' }, COLORS.map(c => h('button', { type: 'button', role: 'radio', 'aria-checked': String(c === color), 'aria-label': c, style: { background: c }, onclick: (e) => { color = c; for (const b of sw.children) b.setAttribute('aria-checked', String(b === e.currentTarget)); } })));
  const save = async (patch) => { try { S.cur = (await api.patch(P(p.id), patch)).project; toast('Gemt', { type: 'ok', ms: 1200 }); loadList(); drawRoom(); } catch (e) { toast(e.message, { type: 'bad' }); } };
  const list = await people();
  const others = list.filter(x => !p.members.some(m => m.username === x.username));
  const addSel = h('select', { class: 'select', 'aria-label': 'Tilføj en person' }, h('option', { value: '' }, 'Vælg en person …'), others.map(x => h('option', { value: x.username }, `${x.name} (@${x.username})`)));
  const addName = h('input', { class: 'input', placeholder: 'eller skriv brugernavn', 'aria-label': 'Brugernavn', maxlength: 64 });
  h(body, null, h('div', { class: 'pj-settings' },
    h('div', { class: 'pj-pane' }, h('h3', null, 'Projektet'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name),
      h('div', { class: 'pj-two' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Kunde'), customer), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Deadline'), deadline)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Farve'), sw),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => save({ name: name.value.trim(), customer: customer.value.trim(), deadline: deadline.value, color }) }, 'Gem'),
      h('div', { class: 'pj-switchrow' }, h('div', null, h('b', null, 'Kræv godkendelse af ændringer'), h('p', { class: 'faint' }, 'En anden i holdet skal godkende en ændring, før den kommer i den fælles mappe – som en pull request.')),
        switchControl({ checked: p.review, label: 'Kræv godkendelse', onChange: (v) => save({ review: v }) }))),
    h('div', { class: 'pj-pane' }, h('h3', null, `Holdet (${p.members.length})`),
      h('ul', { class: 'pj-members', role: 'list' }, p.members.map(m => h('li', null, avatar(m.username, m.name, 30), h('span', null, m.name, h('small', null, `@${m.username}${m.role === 'owner' ? ' · startede projektet' : ''}${m.here ? '' : ' · på en anden pc'}`)),
        m.username !== me()?.username?.toLowerCase() ? h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Fjern ${m.name}`, onclick: async () => {
          if (!await confirmDialog({ title: `Fjern ${m.name}?`, text: 'Personen kan ikke længere se projektet.', confirmLabel: 'Fjern', danger: true })) return;
          try { await api.del(P(p.id, `/members/${m.username}`)); await refreshProject(); } catch (e) { toast(e.message, { type: 'bad' }); } } }, icon('x')) : null))),
      h('div', { class: 'pj-add-member' }, addSel, addName, h('button', { type: 'button', class: 'btn', onclick: async () => {
        const un = addSel.value || addName.value.trim().toLowerCase(); if (!un) return;
        try { S.cur = (await api.post(P(p.id, '/members'), { username: un })).project; S.people = null; drawRoom(); toast('Tilføjet', { type: 'ok' }); } catch (e) { toast(e.message, { type: 'bad' }); } } }, icon('userPlus'), 'Tilføj')),
      h('p', { class: 'faint pj-small' }, 'Folk fra jeres andre pc’er kan tilføjes med brugernavn, når de har logget ind her én gang (Teamnet).')),
    h('div', { class: 'pj-pane pj-danger' },
      h('button', { type: 'button', class: 'btn', onclick: () => save({ archived: !p.archived }) }, icon(p.archived ? 'restore' : 'box'), p.archived ? 'Åbn projektet igen' : 'Afslut projektet'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
        if (!await confirmDialog({ title: 'Forlad projektet?', text: 'Du kan ikke længere se det, før nogen tilføjer dig igen.', confirmLabel: 'Forlad', danger: true })) return;
        try { await api.del(P(p.id, `/members/${me().username.toLowerCase()}`)); location.hash = '#/apps/projects'; } catch (e) { toast(e.message, { type: 'bad' }); } } }, icon('logout'), 'Forlad projektet'))));
}

async function refreshProject(redraw = true) {
  if (!S.cur) return;
  try { await loadProject(S.cur.id); } catch { return; }
  if (redraw) drawRoom();
  loadList();
}

export default {
  title: 'Projekter',
  destroy() { S.cleanup.forEach(f => { try { f(); } catch { /* */ } }); S.cleanup = []; S.ed?.destroy?.(); S.ed = null; setAiContext(null); },
  async render(ctx) {
    this.destroy();
    const pid = ctx?.params?.sub && /^[0-9a-f]{16}$/.test(ctx.params.sub) ? ctx.params.sub : null;
    const tab = ctx?.params?.id;
    S.tab = TABS.some(([id]) => id === tab) ? tab : 'samtale';
    S.events = []; S.lastSeq = 0; S.deleted = new Set(); S.base = {}; S.files = []; S.cur = null; S.openCommit = null; S.form = null;
    S.listEl = h('aside', { class: 'pj-list', 'aria-label': 'Projekter' });
    S.mainEl = h('section', { class: 'pj-main' });
    S.root = h('div', { class: 'page pj-page', style: { '--app': appById('projects')?.hue || 'var(--accent)' } }, S.listEl, S.mainEl);
    await loadList();
    api.post('/api/pj/sync').then(() => { loadList(); if (S.cur) fetchNew(); }).catch(() => {});   // what the other PCs have now
    if (pid) {
      try { await loadProject(pid); } catch (e) { h(S.mainEl, null, h('div', { class: 'pj-welcome' }, h('h2', null, 'Projektet kunne ikke åbnes'), h('p', null, e.message))); return S.root; }
    }
    drawList(); drawRoom();
    let t = 0;
    S.cleanup.push(onLive('pj', (ev) => {
      if (S.cur && ev.project === S.cur.id) {
        fetchNew();
        if (ev.kind !== 'msg') { clearTimeout(t); t = setTimeout(() => refreshProject(S.tab !== 'samtale' && S.tab !== 'kode' && S.tab !== 'noter'), 600); }
      } else { const x = S.list.find(l => l.id === ev.project); if (x && ev.kind === 'msg' && ev.author !== me()?.username?.toLowerCase()) { x.unread = (x.unread || 0) + 1; drawList(); } else loadList(); }
    }));
    S.cleanup.push(onLive('pj-call', (ev) => {
      const x = S.list.find(l => l.id === ev.project); if (x) x.call = ev.people;
      if (S.cur?.id === ev.project) { S.cur.call = ev.people; const head = S.mainEl.querySelector('.pj-head'); if (head) head.replaceWith(header(S.cur)); }
      drawList();
    }));
    return S.root;
  },
};
