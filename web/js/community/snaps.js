/** Fællesskab: snaps (a picture a friend can open once) and stories (visible to friends for 24 hours). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, modal, confirmDialog } from '../core/ui.js';
import { uploadFile, fmtTime } from './chat.js';

/** Downscale a picture to a JPEG blob (keeps snaps and stories small and strips camera metadata). */
async function toJpeg(src, max = 1600) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Billedet kunne ikke læses.')); i.src = src; });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.86));
}

/** Camera (front/back) or a picked picture → resolves with a JPEG blob, or null. */
export function capture({ title = 'Tag et billede' } = {}) {
  return new Promise((resolve) => {
    let stream = null, facing = 'environment', done = false, shot = null;
    const video = h('video', { class: 'sn-video', playsinline: true, muted: true, autoplay: true, 'aria-label': 'Kamera' });
    video.muted = true; video.setAttribute('playsinline', '');
    const preview = h('img', { class: 'sn-shot', alt: 'Dit billede', hidden: true });
    const status = h('p', { class: 'faint', role: 'status', style: { margin: 0 } }, 'Starter kameraet …');
    const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const stop = () => stream?.getTracks().forEach(t => t.stop());
    const finish = (v) => { if (done) return; done = true; stop(); m.close(); resolve(v); };
    async function start() {
      stop();
      if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Kameraet kan ikke bruges her – vælg et billede i stedet.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (done) { stop(); return; }
        video.srcObject = stream; await video.play().catch(() => {});
        status.textContent = '';
        video.classList.toggle('is-front', facing === 'user');
      } catch (e) { status.textContent = e.name === 'NotAllowedError' ? 'Kameraet er ikke tilladt. Vælg et billede i stedet.' : 'Der blev ikke fundet noget kamera. Vælg et billede i stedet.'; }
    }
    const snapBtn = h('button', { class: 'sn-shutter', 'aria-label': 'Tag billedet', onclick: async () => {
      if (!video.videoWidth) { pick.click(); return; }
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      const g = c.getContext('2d');
      if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
      g.drawImage(video, 0, 0);
      shot = await toJpeg(c.toDataURL('image/jpeg', 0.92));
      preview.src = URL.createObjectURL(shot); preview.hidden = false; video.hidden = true; stop();
      useBtn.hidden = false; retake.hidden = false; snapBtn.hidden = true; flip.hidden = true;
    } });
    const flip = h('button', { class: 'icon-btn', 'aria-label': 'Skift kamera', title: 'Skift kamera', onclick: () => { facing = facing === 'user' ? 'environment' : 'user'; start(); } }, icon('refresh'));
    const retake = h('button', { class: 'btn', hidden: true, onclick: () => { shot = null; preview.hidden = true; video.hidden = false; useBtn.hidden = true; retake.hidden = true; snapBtn.hidden = false; flip.hidden = false; start(); } }, 'Tag igen');
    const useBtn = h('button', { class: 'btn btn-primary', hidden: true, onclick: () => finish(shot) }, icon('check'), 'Brug billedet');
    pick.addEventListener('change', async () => {
      const f = pick.files[0]; pick.value = '';
      if (!f) return;
      try { const url = URL.createObjectURL(f); shot = await toJpeg(url); URL.revokeObjectURL(url); finish(shot); }
      catch (e) { toast('Billedet kunne ikke bruges', { type: 'bad', text: e.message }); }
    });
    const m = modal({ title, label: 'Fællesskab', size: 560,
      body: h('div', { class: 'sn-cam' }, h('div', { class: 'sn-frame' }, video, preview), status,
        h('div', { class: 'sn-cam-ctl' }, h('button', { class: 'btn btn-ghost', onclick: () => pick.click() }, icon('image'), 'Vælg billede'), snapBtn, flip), pick),
      actions: [h('button', { class: 'btn', onclick: () => finish(null) }, 'Annuller'), retake, useBtn],
      onClose: () => { if (!done) { done = true; stop(); resolve(null); } } });
    start();
  });
}

/** Full-screen viewer with a countdown; used for snaps (once) and stories. */
function viewer({ src, caption, seconds, from, at, onNext, onPrev, onClose, extra }) {
  let left = seconds * 1000, last = performance.now(), raf = 0, paused = false, closed = false;
  const ring = h('div', { class: 'sv-bar' }, h('i'));
  const close = () => { if (closed) return; closed = true; cancelAnimationFrame(raf); el.remove(); document.removeEventListener('keydown', key); onClose?.(); };
  const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') { close(); onNext?.(); } if (e.key === 'ArrowLeft') { close(); onPrev?.(); } };
  const el = h('div', { class: 'sv', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Fra ${from?.name || ''}` },
    ring,
    h('div', { class: 'sv-head' }, h('span', { class: 'cm-ava' }, from?.avatar || '👤'), h('b', null, from?.name || ''), h('span', { class: 'faint' }, at ? fmtTime(at) : ''), extra || null,
      h('button', { class: 'icon-btn', 'aria-label': 'Luk', onclick: close }, icon('x'))),
    h('img', { class: 'sv-img', src, alt: caption || 'Billede', draggable: 'false' }),
    caption ? h('div', { class: 'sv-cap' }, caption) : null,
    h('button', { class: 'sv-tap sv-prev', 'aria-label': 'Forrige', onclick: () => { close(); onPrev ? onPrev() : null; } }),
    h('button', { class: 'sv-tap sv-next', 'aria-label': 'Næste', onclick: () => { close(); onNext?.(); } }));
  el.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) paused = true; });
  el.addEventListener('pointerup', () => { paused = false; last = performance.now(); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', key);
  document.body.appendChild(el);
  el.querySelector('.sv-head .icon-btn:last-child')?.focus();
  const step = (t) => {
    if (!paused) left -= t - last;
    last = t;
    ring.firstChild.style.width = `${Math.max(0, 100 - (left / (seconds * 1000)) * 100)}%`;
    if (left <= 0) { close(); onNext?.(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { close };
}

export async function openSnap(s, onDone) {
  let d;
  try { d = await api.post(`/api/cm/snaps/${s.id}/open`); } catch (e) { toast('Snappen kan ikke åbnes', { type: 'warn', text: e.message }); onDone?.(); return; }
  viewer({ src: d.image, caption: d.caption, seconds: d.seconds, from: d.from, at: d.at, onClose: () => onDone?.() });
}

export async function sendSnap(cm, preselect = []) {
  const blob = await capture({ title: 'Ny snap' });
  if (!blob) return;
  let friends = [];
  try { friends = (await api.get('/api/cm/friends')).friends; } catch (e) { toast('Kunne ikke hente dine venner', { type: 'bad', text: e.message }); return; }
  if (!friends.length) { toast('Du har ingen venner endnu', { type: 'warn', text: 'Snaps kan kun sendes til venner. Tilføj nogen under Venner.' }); return; }
  const chosen = new Set(preselect);
  const caption = h('input', { class: 'input', maxlength: 200, placeholder: 'Tekst på billedet (valgfri)', 'aria-label': 'Tekst' });
  const secs = h('select', { class: 'select', 'aria-label': 'Hvor længe kan den ses' }, [3, 5, 8, 10, 15].map(n => h('option', { value: n, selected: n === 8 }, `${n} sekunder`)));
  const list = h('div', { class: 'sn-pick', role: 'group', 'aria-label': 'Send til' }, friends.map(f => {
    const cb = h('input', { type: 'checkbox', checked: chosen.has(f.id), onchange: (e) => { e.target.checked ? chosen.add(f.id) : chosen.delete(f.id); } });
    return h('label', { class: 'sn-friend' }, cb, h('span', { class: 'cm-ava' }, f.avatar), h('span', null, f.name));
  }));
  const go = async (btn) => {
    if (!chosen.size) { toast('Vælg mindst én ven', { type: 'warn' }); return; }
    btn.disabled = true;
    try {
      const up = await uploadFile(new File([blob], 'snap.jpg', { type: 'image/jpeg' }), 'snap');
      const r = await api.post('/api/cm/snaps', { to: [...chosen], fileId: up.id, caption: caption.value.trim(), seconds: Number(secs.value) });
      m.close(); toast(`Snap sendt til ${r.sent} ${r.sent === 1 ? 'ven' : 'venner'}`, { type: 'ok' });
    } catch (e) { toast('Snappen blev ikke sendt', { type: 'bad', text: e.message }); btn.disabled = false; }
  };
  const sendBtn = h('button', { class: 'btn btn-primary', onclick: () => go(sendBtn) }, icon('send'), 'Send');
  const m = modal({ title: 'Send snap', label: 'Fællesskab', size: 520,
    body: h('div', { class: 'stack', style: { gap: '12px' } },
      h('img', { class: 'sn-prev', src: URL.createObjectURL(blob), alt: 'Din snap' }), caption,
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Kan ses i'), secs),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Send til'), list),
      h('p', { class: 'faint', style: { margin: 0 } }, 'Snappen kan åbnes én gang og slettes derefter fra serveren. Skærmbilleder kan ikke forhindres – send kun det, du er tryg ved.')),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), sendBtn] });
  void cm;
}

export async function postStory() {
  const blob = await capture({ title: 'Ny story' });
  if (!blob) return false;
  const caption = h('input', { class: 'input', maxlength: 200, placeholder: 'Tekst (valgfri)', 'aria-label': 'Tekst' });
  return new Promise((resolve) => {
    let ok = false;
    const go = async (btn) => {
      btn.disabled = true;
      try {
        const up = await uploadFile(new File([blob], 'story.jpg', { type: 'image/jpeg' }), 'story');
        await api.post('/api/cm/stories', { fileId: up.id, caption: caption.value.trim() });
        ok = true; m.close(); toast('Din story er delt', { type: 'ok', text: 'Dine venner kan se den i 24 timer.' });
      } catch (e) { toast('Storyen blev ikke delt', { type: 'bad', text: e.message }); btn.disabled = false; }
    };
    const b = h('button', { class: 'btn btn-primary', onclick: () => go(b) }, icon('send'), 'Del story');
    const m = modal({ title: 'Del din story', label: 'Fællesskab', size: 480,
      body: h('div', { class: 'stack', style: { gap: '12px' } }, h('img', { class: 'sn-prev', src: URL.createObjectURL(blob), alt: 'Din story' }), caption,
        h('p', { class: 'faint', style: { margin: 0 } }, 'Kun dine venner kan se den, og den forsvinder efter 24 timer.')),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), b], onClose: () => resolve(ok) });
  });
}

/** Play a person's stories in a row (starting with the first unseen). */
export function playStories(groups, gi, { onReport, onChange }) {
  const g = groups[gi];
  if (!g) { onChange?.(); return; }
  let si = Math.max(0, g.stories.findIndex(s => !s.seen));
  const show = () => {
    const s = g.stories[si];
    if (!s) { playStories(groups, gi + 1, { onReport, onChange }); return; }
    if (!g.mine) api.post(`/api/cm/stories/${s.id}/view`).then(() => { s.seen = true; }).catch(() => {});
    const extra = g.mine
      ? [h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { v.close(); await views(s); } }, icon('eye'), String(s.views || 0)),
        h('button', { class: 'icon-btn', 'aria-label': 'Slet story', onclick: async () => { v.close(); if (await confirmDialog({ title: 'Slet din story?', confirmLabel: 'Slet', danger: true })) { await api.del(`/api/cm/stories/${s.id}`).catch(() => {}); onChange?.(); } } }, icon('trash'))]
      : [h('button', { class: 'icon-btn', 'aria-label': 'Anmeld story', title: 'Anmeld', onclick: () => { v.close(); onReport({ kind: 'story', ref: s.id, what: `storyen fra ${g.user.name}` }); } }, icon('flag'))];
    const v = viewer({ src: s.url, caption: s.caption, seconds: 6, from: g.user, at: s.at, extra,
      onNext: () => { si++; show(); }, onPrev: () => { si = Math.max(0, si - 1); show(); }, onClose: () => onChange?.() });
  };
  show();
}

async function views(s) {
  let d;
  try { d = await api.get(`/api/cm/stories/${s.id}/views`); } catch (e) { toast('Kunne ikke hente visninger', { type: 'bad', text: e.message }); return; }
  const m = modal({ title: `Set af ${d.views.length}`, label: 'Din story', size: 420,
    body: d.views.length ? h('div', { class: 'sc-list' }, d.views.map(x => h('div', { class: 'sc-item' }, h('span', { class: 'cm-ava' }, x.user.avatar), h('span', null, h('b', null, x.user.name), h('span', { class: 'faint' }, fmtTime(x.at)))))) : h('p', { class: 'faint' }, 'Ingen har set den endnu.'),
    actions: [h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Luk')] });
}

/** The strip of story rings shown at the top of Hjem. */
export function storyStrip(cm, { onReport }) {
  const el = h('div', { class: 'st-strip', role: 'list', 'aria-label': 'Stories' });
  let groups = [];
  const load = async () => {
    try { groups = (await api.get('/api/cm/stories')).groups; } catch { groups = []; }
    const mine = groups.find(g => g.mine);
    h(clear(el), null,
      h('button', { class: 'st-ring is-add', role: 'listitem', onclick: async () => { if (mine) playStories(groups, groups.indexOf(mine), { onReport, onChange: load }); else if (await postStory()) load(); } },
        h('span', { class: 'st-ava' }, cm.me.user.avatar, mine ? null : h('i', { class: 'st-plus' }, '+')), h('span', null, mine ? 'Din story' : 'Tilføj story')),
      mine ? h('button', { class: 'st-ring is-new', role: 'listitem', 'aria-label': 'Tilføj en story mere', onclick: async () => { if (await postStory()) load(); } }, h('span', { class: 'st-ava' }, '+'), h('span', null, 'Ny')) : null,
      groups.filter(g => !g.mine).map(g => h('button', { class: ['st-ring', g.unseen && 'is-unseen'], role: 'listitem', 'aria-label': `Stories fra ${g.user.name}${g.unseen ? ', nye' : ''}`, onclick: () => playStories(groups, groups.indexOf(g), { onReport, onChange: load }) },
        h('span', { class: 'st-ava' }, g.user.avatar), h('span', null, g.user.name))));
  };
  load();
  return { el, reload: load };
}
