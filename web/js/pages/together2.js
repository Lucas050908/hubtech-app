/**
 * Shared apps 2: Fordeling (hvem tager hvad), Find en dato, Pligter og Sangønsker.
 * Each is a shared document (server/shared.py) with a list view, a detail view that updates live, and a public view for the link.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { store as appStore } from '../core/store.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError, uid } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState } from '../features/shared.js';

const DAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const fmtOpt = (o) => { const [d, t] = String(o).split(' '); const x = new Date(`${d}T12:00`); return { day: DAYS[x.getDay()], date: `${x.getDate()}/${x.getMonth() + 1}`, time: t || '' }; };
const who = (e) => (e.user || e.guest ? (e.user?.name || e.guest).split(' ')[0] : 'En deltager');
const weekStart = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime() / 1000; };

/** the list / detail / share skeleton every shared app here uses */
function scaffold(cfg) {
  return {
    title: cfg.title,
    destroy() { this._off?.(); },
    async render(ctx) {
      const app = appById(cfg.page), root = h('div'), self = this;
      const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
      let askShare = qs.get('share') === '1';
      async function list() {
        self._off?.(); self._off = onShared(cfg.app, () => { if (document.body.contains(root) && !ctx?.params?.id) list(); });
        let docs;
        try { docs = await sh.list(cfg.app); } catch (e) { h(clear(root), null, loadError(cfg.title, e)); return; }
        const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${cfg.page}/d/${d.id}` },
          h('div', { class: 'sh-card-h' }, h('b', null, d.title), cfg.chip?.(d) || null),
          h('div', { class: 'sh-meta' }, cfg.meta(d), d.role === 'owner' ? visChip(d) : person(d.owner), h('span', null, ago(d.updated))));
        h(clear(root), null,
          h('div', { class: 'sh-top' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary', onclick: () => editor() }, icon('plus'), cfg.newLabel)),
          docs.length ? h('div', { class: 'sh-list' }, docs.map(card)) : emptyState(cfg.icon, cfg.emptyTitle, cfg.emptyText, h('button', { class: 'btn btn-primary', onclick: () => editor() }, icon('plus'), cfg.newLabel)));
      }
      function editor(doc = null) {
        const title = h('input', { class: 'input', maxlength: 80, value: doc?.title || '', placeholder: cfg.titleHint, 'aria-label': 'Titel' });
        const form = cfg.editor(doc?.data || {});
        const err = h('div', { class: 'field-error' });
        h(clear(root), null, panel(doc ? 'Ret' : cfg.newLabel, cfg.icon,
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), title), form.el, err,
          h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (doc ? detail(doc.id) : list()) }, 'Annuller'),
            h('button', { class: 'btn btn-primary', onclick: async () => {
              const data = form.read(); if (typeof data === 'string') { err.textContent = data; return; }
              if (!title.value.trim()) { err.textContent = 'Skriv en titel.'; title.focus(); return; }
              try {
                if (doc) { await sh.update(doc.id, { title: title.value.trim(), data: { ...doc.data, ...data } }); detail(doc.id); }
                else { const d = await sh.create(cfg.app, { title: title.value.trim(), data, visibility: 'private', public: !!cfg.publicOk }); location.hash = `#/apps/${cfg.page}/d/${d.id}?share=1`; }
              } catch (e) { err.textContent = e.message; }
            } }, icon('check'), doc ? 'Gem' : 'Opret'))));
        title.focus();
      }
      async function detail(id) {
        let res;
        try { res = await sh.get(id, token); } catch {
          if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
          if (!res) { h(clear(root), null, emptyState('alert', 'Det findes ikke', 'Det er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${cfg.page}` }, 'Til oversigten'))); return; }
        }
        let { doc, entries } = res;
        const owner = doc.role === 'owner' || doc.role === 'editor';
        const body = h('div');
        const reload = async () => { const r = await sh.get(id).catch(() => null); if (r) { doc = r.doc; entries = r.entries; draw(); } };
        self._off?.(); self._off = onShared(cfg.app, (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${cfg.page}`; return; } if (document.body.contains(root) && !root.querySelector(':focus-within input:not([type=checkbox]), :focus-within textarea')) reload(); }, id);
        if (askShare && doc.role === 'owner') { askShare = false; history.replaceState(null, '', `#/apps/${cfg.page}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: cfg.shareTitle, publicOk: !!cfg.publicOk, publicText: cfg.publicText })) reload(); }, 50); }
        const draw = () => h(clear(body), null, cfg.detail({ doc, entries, owner, reload, add: async (kind, data) => { try { await sh.add(doc.id, kind, data); await reload(); return true; } catch (e) { toast(e.message, { type: 'warn' }); await reload(); return false; } }, remove: async (eid) => { await sh.remove(eid).catch(e => toast(e.message, { type: 'warn' })); reload(); }, save: async (data) => { await sh.update(doc.id, { data: { ...doc.data, ...data } }).catch(e => toast(e.message, { type: 'bad' })); reload(); } }));
        h(clear(root), null,
          h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${cfg.page}` }, icon('arrowLeft'), 'Oversigt'), h('h2', null, doc.title), h('span', { style: { flex: 1 } }),
            doc.role === 'owner' ? h('button', { class: 'btn btn-sm', onclick: () => editor(doc) }, icon('edit'), 'Ret') : null,
            doc.role === 'owner' ? h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: cfg.shareTitle, publicOk: !!cfg.publicOk, publicText: cfg.publicText })) reload(); } }, icon('users'), 'Del') : null,
            doc.role === 'owner' ? h('button', { class: 'icon-btn', 'aria-label': 'Slet', onclick: async () => { if (await confirmDialog({ title: `Slet “${doc.title}”?`, confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${cfg.page}`; } } }, icon('trash')) : null),
          doc.data.desc ? h('p', { class: 'muted' }, doc.data.desc) : null, body);
        draw();
      }
      if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
      return h('div', { class: `page t2-page ${cfg.page}-page`, style: { '--app': app.hue } }, appHero(app, { eyebrow: 'Sammen', title: cfg.title, lead: cfg.lead, compact: true }), root);
    },
  };
}
const descField = (data) => h('textarea', { class: 'textarea', rows: 2, maxlength: 600, placeholder: 'Beskrivelse (valgfri)', 'aria-label': 'Beskrivelse' }, data.desc || '');

// ── Fordeling ──
const parseSlots = (txt, old = []) => txt.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 60).map(l => {
  const m = /^(.*?)(?:\s*[x×*]\s*(\d+))?$/i.exec(l), text = m[1].trim().slice(0, 80), need = Math.max(1, Math.min(99, Number(m[2]) || 1));
  const prev = old.find(o => o.text === text); return { id: prev?.id || uid(), text, need };
});
function slotsView({ doc, entries, claimFor, canClaim, mineFn, canRemove = () => false, onRemove = null }) {
  const claims = entries.filter(e => e.kind === 'claim'), slots = doc.data.slots || [];
  const full = slots.filter(s => claims.filter(c => c.data.slot === s.id).length >= s.need).length;
  return h('div', { class: 'stack' },
    h('div', { class: 'su-sum' }, h('div', { class: 'ch-prog' }, h('i', { style: { width: `${slots.length ? Math.round(full / slots.length * 100) : 0}%` } })), h('span', { class: 'faint' }, `${full} af ${slots.length} er dækket`)),
    h('ul', { class: 'su-list' }, slots.map(s => {
      const cs = claims.filter(c => c.data.slot === s.id), left = s.need - cs.length, mine = cs.find(mineFn);
      return h('li', { class: ['su-slot', left <= 0 && 'is-full', mine && 'is-mine'] },
        h('div', { class: 'su-b' }, h('b', null, s.text), h('span', { class: 'faint' }, s.need > 1 ? `${cs.length} af ${s.need}` : cs.length ? 'Taget' : 'Ledig'),
          cs.length ? h('div', { class: 'su-names' }, cs.map(c => h('span', { class: 'chip' }, who(c), canRemove(c) && !mineFn(c) && onRemove ? h('button', { class: 'su-x', 'aria-label': `Fjern ${who(c)}`, onclick: () => onRemove(c) }, '×') : null))) : null),
        mine ? (onRemove ? h('button', { class: 'btn btn-sm', onclick: () => onRemove(mine) }, 'Fortryd') : h('span', { class: 'chip chip-ok' }, icon('check'), 'Din')) : left > 0 && canClaim ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => claimFor(s) }, icon('check'), 'Jeg tager den') : null);
    })));
}
function dateGrid({ doc, entries, me, onCell }) {
  const opts = doc.data.options || [], picks = entries.filter(e => e.kind === 'pick');
  const score = opts.map((_, i) => picks.reduce((a, p) => a + ((p.data.yes || []).includes(i) ? 2 : (p.data.maybe || []).includes(i) ? 1 : 0), 0));
  const best = Math.max(0, ...score), mine = me ? picks.find(p => p.mine) : null;
  const val = (p, i) => ((p?.data.yes || []).includes(i) ? 'yes' : (p?.data.maybe || []).includes(i) ? 'maybe' : 'no');
  const SYM = { yes: '✓', maybe: '?', no: '' };
  return h('div', { class: 'dp-wrap' }, h('table', { class: 'dp-table' },
    h('thead', null, h('tr', null, h('th', null, ''), opts.map((o, i) => { const f = fmtOpt(o); return h('th', { class: [score[i] === best && best > 0 && 'is-best'] }, h('small', null, f.day), h('b', null, f.date), f.time ? h('small', null, f.time) : null); }))),
    h('tbody', null,
      picks.filter(p => !(me && p.mine)).map(p => h('tr', null, h('td', { class: 'dp-name' }, who(p)), opts.map((_, i) => h('td', { class: `dp-c is-${val(p, i)}` }, SYM[val(p, i)])))),
      me ? h('tr', { class: 'dp-me' }, h('td', { class: 'dp-name' }, 'Dig'), opts.map((_, i) => h('td', null, h('button', { class: `dp-btn is-${val(mine, i)}`, 'aria-label': `${fmtOpt(opts[i]).date}: ${val(mine, i) === 'yes' ? 'kan' : val(mine, i) === 'maybe' ? 'måske' : 'kan ikke'}`, onclick: () => onCell(i, val(mine, i), mine) }, SYM[val(mine, i)] || '·')))) : null),
    h('tfoot', null, h('tr', null, h('td', { class: 'dp-name faint' }, 'Point'), score.map((s, i) => h('td', { class: [score[i] === best && best > 0 && 'is-best'] }, String(s)))))),
  h('p', { class: 'faint', style: { fontSize: '13px' } }, me ? 'Tryk på dine felter: ✓ kan, ? måske, tom kan ikke. ' : '', `${picks.length} har svaret. Den bedste dato er markeret (✓ = 2 point, ? = 1).`));
}
const cyc = { no: 'yes', yes: 'maybe', maybe: 'no' };
const nextPick = (mine, i, cur) => { const yes = new Set(mine?.data.yes || []), maybe = new Set(mine?.data.maybe || []); yes.delete(i); maybe.delete(i); const n = cyc[cur]; if (n === 'yes') yes.add(i); if (n === 'maybe') maybe.add(i); return { yes: [...yes], maybe: [...maybe] }; };

export const datepoll = scaffold({
  app: 'datepoll', page: 'datepoll', title: 'Find en dato', icon: 'calendar', newLabel: 'Ny datoafstemning', titleHint: 'Fx Hvornår holder vi klassefest?', publicOk: true, shareTitle: 'Hvem skal svare?', publicText: 'Alle med linket kan svare – også uden en konto.',
  lead: 'Find den dag, hvor flest kan: foreslå nogle datoer, og lad alle krydse af, hvornår de kan. Den bedste dato lyser op.',
  emptyTitle: 'Ingen datoafstemninger endnu', emptyText: 'Skal I finde en dag til fødselsdagen, holdmødet eller klassefesten? Foreslå datoer og lad alle svare.',
  meta: (d) => h('span', null, icon('calendar'), ` ${(d.data.options || []).length} datoer · ${d.counts.pick || 0} svar`),
  chip: (d) => (d.mine.pick?.length ? h('span', { class: 'chip chip-ok' }, icon('check'), 'Du har svaret') : d.role === 'owner' ? null : h('span', { class: 'chip chip-info' }, 'Svar nu')),
  editor(data) {
    const desc = descField(data), opts = (data.options || []).slice(), box = h('div', { class: 'stack', style: { gap: '6px' } });
    const date = h('input', { class: 'input', type: 'date', 'aria-label': 'Dato' }), time = h('input', { class: 'input', type: 'time', 'aria-label': 'Tidspunkt (valgfrit)' });
    const draw = () => h(clear(box), null, opts.length ? opts.slice().sort().map(o => { const f = fmtOpt(o); return h('div', { class: 'dp-opt' }, h('b', null, `${f.day} ${f.date}`), f.time ? h('span', { class: 'faint' }, f.time) : null, h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${f.date}`, onclick: () => { opts.splice(opts.indexOf(o), 1); draw(); } }, icon('x'))); }) : h('p', { class: 'faint' }, 'Ingen datoer endnu.'));
    draw();
    return { el: h('div', { class: 'stack' }, desc, h('span', { class: 'field-label' }, 'Foreslåede datoer'), box,
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, date, time, h('button', { class: 'btn', onclick: () => { if (!date.value) return date.focus(); const v = `${date.value}${time.value ? ` ${time.value}` : ''}`; if (!opts.includes(v) && opts.length < 30) opts.push(v); draw(); } }, icon('plus'), 'Tilføj dato'))),
      read: () => (opts.length >= 2 ? { desc: desc.value.trim(), options: opts.slice().sort() } : 'Foreslå mindst to datoer.') };
  },
  detail: ({ doc, entries, add }) => dateGrid({ doc, entries, me: true, onCell: (i, cur, mine) => add('pick', nextPick(mine, i, cur)) }),
});

// ── the public link for all four ──
export async function publicView(data, token) {
  const { doc } = data; let entries = data.entries;
  const box = h('div');
  const reload = async () => { const r = await sh.pub(token).catch(() => null); if (r) { entries = r.entries; draw(); } };
  const nameIn = h('input', { class: 'input', maxlength: 40, placeholder: 'Dit navn', 'aria-label': 'Dit navn' });
  let mine = []; try { mine = JSON.parse(localStorage.getItem(`hubtech.pub.${doc.id}`) || '[]'); } catch { /* */ }
  const remember = (id) => { mine.push(id); try { localStorage.setItem(`hubtech.pub.${doc.id}`, JSON.stringify(mine)); } catch { /* */ } };
  const pubAdd = async (kind, d) => { try { const r = await sh.pubAdd(token, kind, d); if (r?.id) remember(r.id); await reload(); return true; } catch (e) { toast(e.message, { type: 'warn' }); await reload(); return false; } };
  const needName = () => { if (!nameIn.value.trim()) { nameIn.focus(); toast('Skriv dit navn først', { type: 'warn' }); return null; } return nameIn.value.trim(); };
  function draw() {
    let body;
    if (doc.app === 'datepoll') {
      const picked = { yes: new Set(), maybe: new Set() };
      const opts = doc.data.options || [];
      const grid = h('div', { class: 'dp-pub' }, opts.map((o, i) => { const f = fmtOpt(o), b = h('button', { class: 'dp-btn is-no', 'aria-label': f.date, onclick: () => { const cur = picked.yes.has(i) ? 'yes' : picked.maybe.has(i) ? 'maybe' : 'no', n = cyc[cur]; picked.yes.delete(i); picked.maybe.delete(i); if (n !== 'no') picked[n].add(i); b.className = `dp-btn is-${n}`; b.textContent = n === 'yes' ? '✓' : n === 'maybe' ? '?' : '·'; } }, '·'); return h('div', { class: 'dp-pubopt' }, h('span', null, `${f.day} ${f.date}`, f.time ? ` ${f.time}` : ''), b); }));
      body = [dateGrid({ doc, entries, me: false }), panel('Dit svar', 'check', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Dit navn'), nameIn), grid,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: async () => { const n = needName(); if (n && await pubAdd('pick', { name: n, yes: [...picked.yes], maybe: [...picked.maybe] })) toast('Tak for dit svar!', { type: 'ok' }); } }, icon('send'), 'Send svar')))];
    }
    else body = [h('p', { class: 'muted' }, 'Log ind for at se mere.')];
    h(clear(box), null, ...body);
  }
  draw();
  return h('div', { class: `pub-card t2-pub ${doc.app}-pub`, style: { '--app': appById({ signup: 'signup', datepoll: 'datepoll', songs: 'songs', chores: 'chores' }[doc.app])?.hue } }, h('h1', null, doc.title), doc.data.desc ? h('p', { class: 'muted' }, doc.data.desc) : null, box);
}
