/**
 * Shared documents – the client side of server/shared.py, used by the apps people do together
 * (Afstemninger, Arrangementer, Formularer, Væggen, Spørg og svar, Fotoalbum, Fællesudgifter, Wiki, Udfordringer,
 * Booking, Sidebygger, Tavlen, Turneringer): the API, live updates, the share dialog, pictures and small helpers.
 */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal, segmented } from '../core/ui.js';
import { onLive } from '../core/live.js';
import { store } from '../core/store.js';
import { copy } from './appkit.js';

export const me = () => store.get('user')?.id;
export const sh = {
  list: (app, mine = false) => api.get(`/api/sh/${app}${mine ? '?mine=1' : ''}`).then(r => r.docs),
  create: (app, body) => api.post(`/api/sh/${app}`, body).then(r => r.doc),
  get: (id, token) => api.get(`/api/sh/doc/${id}${token ? `?t=${encodeURIComponent(token)}` : ''}`),
  update: (id, body) => api.patch(`/api/sh/doc/${id}`, body).then(r => r.doc),
  del: (id) => api.del(`/api/sh/doc/${id}`),
  join: (id, token) => api.post(`/api/sh/doc/${id}/join`, { token }),
  add: (id, kind, data = {}) => api.post(`/api/sh/doc/${id}/entries`, { kind, data }),
  edit: (eid, data) => api.patch(`/api/sh/entry/${eid}`, { data }),
  remove: (eid) => api.del(`/api/sh/entry/${eid}`),
  pub: (token) => api.get(`/api/pub/${encodeURIComponent(token)}`),
  pubAdd: (token, kind, data) => api.post(`/api/pub/${encodeURIComponent(token)}/entries`, { kind, data }),
  people: () => api.get('/api/games/players').then(r => r.players),
};
/** fn(event) for changes in an app (or one doc). Returns an unsubscribe function. */
export function onShared(app, fn, id = null) {
  return onLive('shared', (ev) => { if (ev.app === app && (!id || ev.id === id)) fn(ev); });
}
export const pubUrl = (doc) => `${location.origin}/#/p/${doc.token}`;
export const docUrl = (page, doc) => `#/apps/${page}/d/${doc.id}`;

/** "for 5 min. siden" */
export function ago(sec) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - sec));
  if (s < 60) return 'lige nu';
  if (s < 3600) return `for ${Math.floor(s / 60)} min. siden`;
  if (s < 86400) return `for ${Math.floor(s / 3600)} t. siden`;
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d === 1 ? 'i går' : `for ${d} dage siden`; }
  return new Date(sec * 1000).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: s > 300 * 86400 ? 'numeric' : undefined });
}
export const person = (u, extra) => h('span', { class: 'sh-person' }, h('span', { class: 'avatar avatar-sm' }, ava(u?.avatar)), h('span', null, u?.name || 'Ukendt'), extra || null);
export const VIS_TEXT = { private: 'Kun dem, du vælger', friends: 'Dine venner', all: 'Alle på HUBTECH' };
export const visChip = (doc) => h('span', { class: 'chip', title: 'Hvem kan se det' }, icon(doc.visibility === 'private' ? 'lock' : doc.visibility === 'friends' ? 'users' : 'globe'), VIS_TEXT[doc.visibility], doc.public ? ' · link' : '');

/**
 * Who may see it: private (chosen people) / friends / everyone, editors, and the public link.
 * opts: { publicOk, publicText, editorsOk, title }. Resolves with the saved doc (or null).
 */
export function shareDialog(doc, { publicOk = false, publicText = 'Alle med linket kan se det – også uden en konto.', editorsOk = false, title = 'Del' } = {}) {
  return new Promise(async (resolve) => {
    let vis = doc.visibility || 'private', pub = !!doc.public, done = false;
    const chosen = new Set((doc.members || []).map(m => m.id)), editors = new Set((doc.members || []).filter(m => m.role === 'editor').map(m => m.id));
    const list = h('div', { class: 'sh-people' }, h('p', { class: 'faint' }, 'Henter …'));
    const search = h('input', { class: 'input', placeholder: 'Søg efter en person', 'aria-label': 'Søg efter en person' });
    let people = [];
    const drawPeople = () => {
      const q = search.value.trim().toLowerCase();
      const shown = people.filter(p => !q || p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)).slice(0, 60);
      h(clear(list), null, shown.length ? shown.map(p => {
        const on = chosen.has(p.id);
        return h('div', { class: ['sh-person-row', on && 'is-on'] },
          h('button', { class: 'sh-person-btn', 'aria-pressed': String(on), onclick: () => { on ? (chosen.delete(p.id), editors.delete(p.id)) : chosen.add(p.id); drawPeople(); } },
            h('span', { class: 'avatar avatar-sm' }, ava(p.avatar)), h('span', null, p.name, h('small', { class: 'faint' }, ` @${p.username}`)), on ? icon('check') : null),
          editorsOk && on ? h('button', { class: ['btn btn-sm', editors.has(p.id) && 'btn-primary'], title: 'Må rette og invitere', onclick: () => { editors.has(p.id) ? editors.delete(p.id) : editors.add(p.id); drawPeople(); } }, editors.has(p.id) ? 'Kan rette' : 'Kan se') : null);
      }) : h('p', { class: 'faint' }, people.length ? 'Ingen fundet.' : 'Der er ingen andre på denne HUBTECH endnu.'));
    };
    search.addEventListener('input', drawPeople);
    sh.people().then(p => { people = p; drawPeople(); }).catch(() => { list.textContent = 'Kunne ikke hente personer.'; });
    const visSeg = segmented(Object.entries(VIS_TEXT).map(([value, label]) => ({ value, label, icon: value === 'private' ? 'lock' : value === 'friends' ? 'users' : 'globe' })), vis, (v) => { vis = v; }, { label: 'Hvem kan se det' });
    const linkBox = h('div', { class: 'sh-link' });
    const drawLink = () => {
      if (!doc.token) { clear(linkBox); return; }
      const url = pubUrl(doc), qr = h('span', { class: 'sh-qr' });
      import('./qr.js').then(m => m.qrSvg(url, 120)).then(svg => qr.append(svg)).catch(() => {});
      h(clear(linkBox), null,
        publicOk ? h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: pub, onchange: (e) => { pub = e.target.checked; } }), h('span', null, publicText)) : h('p', { class: 'faint', style: { margin: 0 } }, 'Med linket kan andre på HUBTECH være med, selv om du ikke har valgt dem.'),
        h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('input', { class: 'input', readonly: true, value: url, 'aria-label': 'Link', onfocus: (e) => e.target.select() }),
          h('button', { class: 'btn', onclick: () => copy(url, 'Linket er kopieret') }, icon('copy'), 'Kopiér')), qr);
    };
    drawLink();
    const m = modal({ title, label: doc.title || 'Del', size: 560,
      body: h('div', { class: 'stack', style: { gap: '12px' } }, h('span', { class: 'field-label' }, 'Hvem kan se og være med?'), h('div', { class: 'cm-seg-scroll' }, visSeg),
        h('span', { class: 'field-label' }, 'Vælg personer'), search, list, h('span', { class: 'field-label' }, 'Link'), linkBox),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'),
        h('button', { class: 'btn btn-primary', onclick: async () => {
          try {
            const saved = await sh.update(doc.id, { visibility: vis, public: pub, members: [...chosen].filter(x => !editors.has(x)), editors: [...editors] });
            done = true; m.close(); toast('Delingen er gemt', { type: 'ok' }); resolve(saved);
          } catch (e) { toast('Kunne ikke gemme', { type: 'bad', text: e.message }); }
        } }, icon('check'), 'Gem')],
      onClose: () => { if (!done) resolve(null); } });
  });
}

/** Pick and upload pictures (made smaller first: at most 1600 px). Resolves with [urls]. */
export function pickImages({ multiple = true, max = 10 } = {}) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple, hidden: true });
    inp.addEventListener('change', async () => {
      const files = [...inp.files].slice(0, max); inp.remove();
      if (!files.length) return resolve([]);
      const t = toast(`Sender ${files.length} billede${files.length > 1 ? 'r' : ''} …`, { icon: 'upload', ms: 120000 });
      const out = [];
      try { for (const f of files) out.push(await uploadImage(f)); }
      catch (e) { toast('Billedet kunne ikke sendes', { type: 'bad', text: e.message }); }
      finally { t(); }
      resolve(out);
    });
    document.body.append(inp); inp.click();
  });
}
export async function uploadImage(file) {
  let blob = file;
  if (file.type !== 'image/gif') {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      if (k < 1 || file.size > 1.5e6) {
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
      }
      URL.revokeObjectURL(url);
    } catch { /* send as it is */ }
  }
  const r = await fetch('/api/sh/files', { method: 'POST', body: blob, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-Requested-With': 'hubtech' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Upload mislykkedes');
  return d.url;
}

/** A list page for an app: header with "new" button, cards for each doc, empty state. */
export function emptyState(ic, title, text, action) {
  return h('div', { class: 'sh-empty' }, icon(ic), h('b', null, title), h('span', { class: 'faint' }, text), action || null);
}
/** comments under a doc */
export function commentBox(doc, entries, { kind = 'comment', onChange, placeholder = 'Skriv en kommentar …', canWrite = true } = {}) {
  const list = entries.filter(e => e.kind === kind);
  const input = h('textarea', { class: 'textarea', rows: 2, maxlength: 2000, placeholder, 'aria-label': 'Kommentar' });
  const send = async () => { const t = input.value.trim(); if (!t) return; try { await sh.add(doc.id, kind, { text: t }); input.value = ''; onChange?.(); } catch (e) { toast('Kunne ikke sende', { type: 'bad', text: e.message }); } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
  return h('div', { class: 'sh-comments' },
    list.map(c => h('div', { class: 'sh-comment' }, person(c.user || { name: c.guest || 'Gæst' }), h('span', { class: 'faint sh-when' }, ago(c.at)),
      h('p', null, c.data.text),
      c.mine || doc.role === 'owner' ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet kommentar', onclick: async () => { await sh.remove(c.id).catch(() => {}); onChange?.(); } }, icon('trash')) : null)),
    canWrite ? h('div', { class: 'sh-comment-new' }, input, h('button', { class: 'btn btn-sm btn-primary', onclick: send }, icon('send'), 'Send')) : null);
}

/** Show pictures big: arrows/swipe to go through them, Esc to close. items: [{ url, caption, by }] */
export function lightbox(items, start = 0, { onIndex } = {}) {
  let i = start, timer = null, x0 = null;
  const img = h('img', { class: 'slb-img', alt: '' });
  const cap = h('div', { class: 'slb-cap' }), count = h('span', { class: 'slb-count' });
  const playBtn = h('button', { class: 'icon-btn', 'aria-label': 'Lysbilledshow', onclick: () => { timer ? stop() : play(); } }, icon('play'));
  const show = () => {
    const it = items[i]; img.src = it.url; img.alt = it.caption || `Billede ${i + 1}`;
    h(clear(cap), null, it.caption ? h('span', null, it.caption) : null, it.by ? h('span', { class: 'faint' }, it.by) : null);
    count.textContent = `${i + 1} / ${items.length}`; onIndex?.(i);
  };
  const go = (d) => { i = (i + d + items.length) % items.length; show(); };
  const play = () => { timer = setInterval(() => go(1), 4000); h(clear(playBtn), null, icon('pause')); playBtn.setAttribute('aria-label', 'Stop lysbilledshow'); };
  const stop = () => { clearInterval(timer); timer = null; h(clear(playBtn), null, icon('play')); playBtn.setAttribute('aria-label', 'Lysbilledshow'); };
  const key = (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'slb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Billeder', onclick: (e) => { if (e.target === wrap || e.target === stage) close(); } });
  const stage = h('div', { class: 'slb-stage' }, img);
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  stage.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 50) go(e.clientX < x0 ? 1 : -1); x0 = null; });
  const close = () => { stop(); document.removeEventListener('keydown', key); wrap.remove(); };
  h(wrap, null, h('div', { class: 'slb-top' }, count, h('span', { style: { flex: 1 } }), items.length > 1 ? playBtn : null,
    h('a', { class: 'icon-btn', 'aria-label': 'Hent billedet', href: '#', onclick: (e) => { e.currentTarget.href = items[i].url; e.currentTarget.download = `billede-${i + 1}.jpg`; } }, icon('download')),
    h('button', { class: 'icon-btn', 'aria-label': 'Luk', onclick: close }, icon('x'))),
    stage, items.length > 1 ? [h('button', { class: 'slb-nav slb-prev', 'aria-label': 'Forrige', onclick: () => go(-1) }, icon('chevronLeft')), h('button', { class: 'slb-nav slb-next', 'aria-label': 'Næste', onclick: () => go(1) }, icon('chevronRight'))] : null, cap);
  document.addEventListener('keydown', key);
  document.body.append(wrap); show();
  return { close };
}
/** text with clickable links and #tags (never innerHTML) */
export function richText(parts, { onTag } = {}) {
  return parts.map(p => p.t === 'link' ? h('a', { href: p.v, target: '_blank', rel: 'noopener nofollow' }, p.v.replace(/^https?:\/\//, '').slice(0, 60))
    : p.t === 'tag' ? h('button', { class: 'sh-tag', onclick: () => onTag?.(p.v) }, `#${p.v}`) : p.v);
}
