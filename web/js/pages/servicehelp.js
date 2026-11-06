/**
 * Servicehjælp – a part of HUBTECH: servicerapporter med fotos og PDF, kørebog, udgifter, garantier, vidensbank og statistik.
 * Kunder and Kalender are HUBTECH's own (a new customer on a report goes into Kunder, follow-ups into Kalender).
 * The data is on the account in the same states as before, so everything made in the old Servicehjælp is still here.
 */
import { h, clear, debounce, raw } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity, store } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, modal, confirmDialog, stateBlock, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn } from '../features/apphero.js';
import { saveBlob } from '../core/files.js';
import { copy } from '../features/appkit.js';
import { chartSvg } from '../ai/charts.js';
import * as SV from '../features/service.js';

const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const thisMonth = () => today().slice(0, 7);
const norm = (s) => String(s || '').trim().toLowerCase();
let S = null, root = null, view = 'reports', form = null, editId = null, q = '', folder = '', month = thisMonth(), kbQ = '', kbType = '';

const VIEWS = [
  { value: 'reports', label: 'Rapporter', icon: 'file' },
  { value: 'new', label: 'Ny rapport', icon: 'plus' },
  { value: 'drv', label: 'Kørebog', icon: 'car' },
  { value: 'exp', label: 'Udgifter', icon: 'wallet' },
  { value: 'gar', label: 'Garanti', icon: 'shield' },
  { value: 'kb', label: 'Viden', icon: 'book' },
  { value: 'stats', label: 'Statistik', icon: 'chart' },
];

function save(key) {
  saveState(SV.KEYS[key], SV.wrap(S[key]), { onError: () => toast('Servicehjælp kunne ikke gemme', { type: 'bad', text: 'Tjek at HUBTECH-serveren kører – ændringen gemmes igen, når den er tilbage.' }) });
}
const saveDraft = debounce(() => { if (form) { S.draft = { o: form, e: editId }; save('draft'); } }, 600);

async function load() {
  const keys = Object.entries(SV.KEYS);
  const got = await Promise.all([...keys.map(([, k]) => getState(k, { force: true }).catch(() => null)), getState('customers').catch(() => null), getState('calendar').catch(() => null)]);
  S = {};
  keys.forEach(([name], i) => { S[name] = SV.unwrap(got[i], ['drvp', 'drvr', 'tek'].includes(name) ? '' : name === 'draft' ? null : []); });
  ['log', 'drv', 'gar', 'exp', 'kb'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
  S.customers = got[keys.length] && Array.isArray(got[keys.length].customers) ? got[keys.length] : { customers: [], invoices: [], company: {}, nextNo: 1 };
  S.calendar = got[keys.length + 1] && Array.isArray(got[keys.length + 1].events) ? got[keys.length + 1] : { events: [] };
  if (S.draft?.o?.f) { form = S.draft.o; editId = S.draft.e || null; } else form = SV.emptyReport(S.tek);
}

// ── small form helpers ──
const field = (label, control, hint) => h('label', { class: 'field sv-field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint faint' }, hint) : null);
const input = (attrs) => h('input', { class: 'input', ...attrs });
const select = (opts, value, attrs = {}) => { const s = h('select', { class: 'select', ...attrs }, opts.map(o => h('option', { value: o }, o))); s.value = value || opts[0]; return s; };
const chip = (text, kind = '') => h('span', { class: ['chip', 'sv-chip', kind && `is-${kind}`] }, text);
const empty = (title, text, action) => stateBlock({ icon: 'tool', title, text, actions: action ? [action] : [] });

/** Every customer HUBTECH knows (Kunder first, then old Servicehjælp customers and names from reports). */
function knownCustomers() {
  const out = new Map();
  for (const c of S.customers.customers) if (c.name) out.set(norm(c.name), { name: c.name, contact: c.contact, phone: c.phone, address: c.address });
  for (const r of S.log) if (r.k && r.k !== '-' && !out.has(norm(r.k))) out.set(norm(r.k), { name: r.k, contact: r.f?.f?.r8, phone: r.f?.f?.r10, address: r.f?.f?.r9 });
  return [...out.values()];
}
/** A customer typed on a report that Kunder doesn't know yet is added there. */
function rememberCustomer(f) {
  const name = (f.r1 || '').trim();
  if (!name || S.customers.customers.some(c => norm(c.name) === norm(name))) return;
  S.customers.customers.push({ id: uid('c'), name, contact: f.r8 || '', phone: f.r10 || '', email: '', address: f.r9 || '', cvr: '', notes: 'Oprettet fra Servicehjælp', rate: '', created: Date.now() });
  saveState('customers', S.customers, { onError: () => toast('Kunden kunne ikke gemmes i Kunder', { type: 'warn' }) });
}

// ── photos: resized here, uploaded once as an image file (the report keeps only its address) ──
async function addPhotos(files) {
  for (const file of [...files].slice(0, 8 - form.p.length)) {
    const img = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = fr.result; }; fr.readAsDataURL(file); });
    if (!img) continue;
    const s = Math.min(1, 1280 / Math.max(img.width, img.height)), w = Math.round(img.width * s), hh = Math.round(img.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = hh; c.getContext('2d').drawImage(img, 0, 0, w, hh);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.78));
    let u = null;
    try {
      const r = await fetch('/api/office/files', { method: 'POST', credentials: 'same-origin', body: blob, headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/octet-stream', 'X-File-Name': 'servicerapport.jpg' } });
      if (r.ok) u = (await r.json()).file.url;
    } catch { /* offline: keep it in the report for now */ }
    form.p.push({ u: u || c.toDataURL('image/jpeg', 0.6), c: form.p.length % 2 ? 'Efter' : 'Før', w, h: hh });
  }
  saveDraft(); draw();
}

// ── views ──
function reportsView() {
  const list = SV.searchReports(S.log, q).filter(r => !folder || (r.f?.f?.r17 || '').trim() === folder);
  const fs = SV.folders(S.log);
  const upcoming = S.calendar.events.filter(e => e.date >= today()).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))).slice(0, 4);
  const search = input({ type: 'search', placeholder: 'Søg kunde, model, serienummer, mappe …', value: q, 'aria-label': 'Søg i rapporter', oninput: debounce((e) => { q = e.target.value; draw(); setTimeout(() => root.querySelector('.sv-search input')?.focus(), 0); }, 250) });
  return h('div', { class: 'sv-grid' },
    h('section', { class: 'glass panel sv-main' },
      h('div', { class: 'sv-search' }, search),
      fs.length ? h('div', { class: 'sv-folders', role: 'group', 'aria-label': 'Mapper' }, [['', 'Alle'], ...fs.map(x => [x, x])].map(([val, label]) => h('button', { type: 'button', class: ['chip', folder === val && 'is-on'], 'aria-pressed': String(folder === val), onclick: () => { folder = val; draw(); } }, val ? icon('folder') : null, label))) : null,
      list.length ? h('ul', { class: 'sv-list' }, list.map(r => {
        const res = r.f?.f?.r15, ok = /udbedt$/i.test(res || '');
        return h('li', { class: 'sv-item' },
          h('div', { class: 'sv-item-main' }, h('b', null, r.k || '–'), h('span', { class: 'faint' }, [r.d, r.e !== '-' && r.e, r.s && `SN ${r.s}`, r.f?.f?.r17 && `📁 ${r.f.f.r17}`].filter(Boolean).join(' · ')),
            res ? chip(res, ok ? 'ok' : 'warn') : r.f ? null : chip('Ældre rapport')),
          h('div', { class: 'sv-item-acts' },
            r.f ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { form = JSON.parse(JSON.stringify(r.f)); form.q ||= SV.CHECKS.map(() => false); form.p ||= []; editId = r.id; view = 'new'; draw(); } }, icon('edit'), 'Åbn') : null,
            r.f ? h('button', { type: 'button', class: 'btn btn-sm', onclick: (e) => pdf(r, e.currentTarget) }, icon('download'), 'PDF') : h('button', { type: 'button', class: 'btn btn-sm', onclick: () => copy(r.t || '', 'Rapporten er kopieret') }, icon('copy'), 'Kopiér'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Slet rapporten for ${r.k}`, onclick: async () => { if (await confirmDialog({ title: 'Slet rapporten?', text: `${r.k} · ${r.d}`, confirmLabel: 'Slet', danger: true })) { S.log = S.log.filter(x => x !== r); save('log'); draw(); } } }, icon('trash'))),
          !r.f && r.t ? h('details', { class: 'sv-old' }, h('summary', null, 'Vis rapport'), h('pre', null, r.t)) : null);
      })) : empty(S.log.length ? 'Ingen rapporter passer' : 'Ingen rapporter endnu', S.log.length ? 'Prøv et andet søgeord eller en anden mappe.' : 'Lav din første servicerapport – med fotos, reservedele og PDF til kunden.', h('button', { class: 'btn btn-primary', onclick: () => { view = 'new'; draw(); } }, icon('plus'), 'Ny rapport'))),
    h('aside', { class: 'stack' },
      h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('calendar'), 'Kommende aftaler'),
        upcoming.length ? h('ul', { class: 'sv-mini' }, upcoming.map(e => h('li', null, h('b', null, e.title), h('span', { class: 'faint' }, [SV.parseDate(e.date)?.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' }), e.start].filter(Boolean).join(' kl. '))))) : h('p', { class: 'faint' }, 'Ingen aftaler i kalenderen.'),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/apps/calendar' }, icon('calendar'), 'Åbn Kalender')),
      h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('users'), 'Kunder'),
        h('p', { class: 'faint' }, `${S.customers.customers.length} ${S.customers.customers.length === 1 ? 'kunde' : 'kunder'} i HUBTECH. Nye kunder på en rapport kommer automatisk i Kunder.`),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/apps/customers' }, icon('users'), 'Åbn Kunder'))));
}

function editorView() {
  const f = form.f;
  const known = knownCustomers();
  const set = (id) => (e) => { f[id] = e.target.value; if (id === 'r14') { S.tek = e.target.value; save('tek'); } saveDraft(); };
  const control = (x) => {
    if (x.options) return select(x.options, f[x.id], { 'data-f': x.id, onchange: set(x.id) });
    if (x.area) return h('textarea', { class: 'input', rows: x.id === 'r6' ? 3 : 3, 'data-f': x.id, oninput: set(x.id) }, f[x.id] || '');
    const el = input({ type: x.type || 'text', value: f[x.id] || '', 'data-f': x.id, oninput: set(x.id), placeholder: x.hint || '', list: x.id === 'r1' ? 'sv-customers' : null });
    if (x.id === 'r1') el.addEventListener('change', () => {   // a known customer fills in the contact details
      const c = known.find(k => norm(k.name) === norm(el.value));
      if (c) { for (const [id, key] of [['r8', 'contact'], ['r9', 'address'], ['r10', 'phone']]) if (!f[id] && c[key]) f[id] = c[key]; draw(); }
    });
    if (x.scan) return h('div', { class: 'sv-scan' }, el, h('button', { type: 'button', class: 'btn', title: 'Scan serienummeret med kameraet', onclick: async () => {
      const { scan } = await import('../features/scanner.js');
      const v = await scan({ title: 'Scan serienummeret', hint: 'Stregkoden eller QR-koden på maskinens typeskilt.' });
      if (v) { f[x.id] = v; saveDraft(); draw(); }
    } }, icon('camera'), 'Scan'));
    return el;
  };
  const parts = SV.parseParts(f.r6);
  const photoInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { addPhotos(e.target.files); e.target.value = ''; } });
  return h('div', { class: 'sv-editor' },
    h('datalist', { id: 'sv-customers' }, known.map(c => h('option', { value: c.name }))),
    editId ? h('p', { class: 'sv-note' }, icon('edit'), 'Du redigerer en gemt rapport. Kladden gemmes automatisk.') : h('p', { class: 'sv-note faint' }, icon('save'), 'Kladden gemmes automatisk på din konto, mens du skriver.'),
    SV.GROUPS.map(([g, title]) => h('section', { class: 'glass panel sv-group' }, h('h2', { class: 'panel-title' }, title),
      h('div', { class: 'sv-fields' }, SV.FIELDS.filter(x => x.group === g).map(x => field(x.label, control(x)))),
      g === 'arbejde' ? h('fieldset', { class: 'sv-checks' }, h('legend', { class: 'field-label' }, 'Tjekliste'), SV.CHECKS.map((t, i) => h('label', { class: 'sv-check' }, h('input', { type: 'checkbox', checked: !!form.q[i], onchange: (e) => { form.q[i] = e.target.checked; saveDraft(); } }), h('span', null, t)))) : null,
      g === 'dele' && parts.rows.length ? h('p', { class: 'sv-parts faint' }, `${parts.rows.length} reservedel${parts.rows.length > 1 ? 'e' : ''}${parts.total ? ` · i alt ${SV.kr(parts.total)}` : ''}`) : null)),
    h('section', { class: 'glass panel sv-group' }, h('h2', { class: 'panel-title' }, 'Billeder'),
      h('div', { class: 'sv-photos' }, form.p.map((p, i) => h('figure', { class: 'sv-photo' }, h('img', { src: p.u, alt: p.c || `Billede ${i + 1}` }),
        input({ value: p.c || '', placeholder: 'Billedtekst', 'aria-label': `Billedtekst ${i + 1}`, oninput: (e) => { p.c = e.target.value; saveDraft(); } }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Fjern billede ${i + 1}`, onclick: () => { form.p.splice(i, 1); saveDraft(); draw(); } }, icon('x')))),
        form.p.length < 8 ? h('label', { class: 'sv-photo-add' }, icon('camera'), h('span', null, 'Tag eller vælg billeder'), photoInput) : null)),
    h('div', { class: 'sv-actions' },
      h('button', { type: 'button', class: 'btn btn-primary sv-save', onclick: saveReport }, icon('save'), editId ? 'Gem ændringer' : 'Gem rapport'),
      h('button', { type: 'button', class: 'btn', onclick: (e) => pdf(SV.makeRecord(form, { id: editId || undefined, date: S.log.find(r => r.id === editId)?.d }), e.currentTarget) }, icon('download'), 'Hent PDF'),
      h('button', { type: 'button', class: 'btn', onclick: () => copy(SV.reportText(form), 'Rapporten er kopieret') }, icon('copy'), 'Kopiér tekst'),
      h('button', { type: 'button', class: 'btn', onclick: followUp }, icon('calendar'), 'Planlæg opfølgning'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Start en ny rapport?', text: 'Den du er i gang med, ryddes (gemte rapporter bliver liggende).', confirmLabel: 'Ny rapport' })) { form = SV.emptyReport(S.tek); editId = null; S.draft = null; save('draft'); draw(); } } }, icon('plus'), 'Ny tom rapport')));
}

function saveReport() {
  if (!(form.f.r1 || '').trim()) { toast('Skriv kundens navn først', { type: 'warn' }); root.querySelector('[data-f=r1]')?.focus(); return; }
  const old = S.log.find(r => r.id === editId);
  const rec = SV.makeRecord(form, { id: editId || undefined, date: old?.d });
  S.log = old ? S.log.map(r => (r === old ? rec : r)) : [rec, ...S.log];
  editId = rec.id;
  save('log'); rememberCustomer(form.f);
  S.draft = { o: form, e: editId }; save('draft');
  logActivity('servicehelp', 'report', 'Servicerapport', rec.k);
  toast(old ? 'Rapporten er opdateret' : 'Rapporten er gemt', { type: 'ok', text: `${rec.k} · ${rec.d}` });
  draw();
}
async function pdf(rec, btn) {
  if (btn) btn.disabled = true;
  try { const { reportPdf } = await import('../features/servicepdf.js'); const { name, blob } = await reportPdf(rec); await saveBlob(name, blob); }
  catch (e) { console.error(e); toast('PDF\'en kunne ikke laves', { type: 'bad', text: 'Prøv igen – eller brug Kopiér tekst.' }); }
  finally { if (btn) btn.disabled = false; }
}
function followUp() {
  const f = form.f, date = input({ type: 'date', value: today() }), time = input({ type: 'time', value: '09:00' }), title = input({ value: `Opfølgning: ${f.r1 || 'kunde'}${f.r2 ? ` (${f.r2})` : ''}` });
  let m = null;
  const add = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
    S.calendar.events.push({ id: uid('e'), title: title.value.trim() || 'Opfølgning', date: date.value || today(), allDay: !time.value, start: time.value || undefined, notes: [f.r9, f.r10, f.r13].filter(Boolean).join('\n') });
    saveState('calendar', S.calendar, { onError: () => toast('Aftalen kunne ikke gemmes', { type: 'bad' }) });
    flushState('calendar');
    m?.close(); toast('Opfølgningen ligger i Kalender', { type: 'ok' });
  } }, icon('calendar'), 'Læg i Kalender');
  m = modal({ title: 'Planlæg opfølgning', body: h('div', { class: 'stack' }, field('Titel', title), h('div', { class: 'grid-2' }, field('Dato', date), field('Tidspunkt', time))),
    actions: [h('button', { type: 'button', class: 'btn', onclick: () => m?.close() }, 'Annullér'), add] });
}

function drvView() {
  const m = SV.tripMonth(S.drv, month, S.drvr);
  const months = [...new Set([thisMonth(), ...S.drv.map(t => String(t.d || '').slice(0, 7)).filter(Boolean)])].sort().reverse();
  const f = { d: input({ type: 'date', value: today() }), f: input({ placeholder: 'Fra' }), t: input({ placeholder: 'Til' }), p: input({ placeholder: 'Formål / kunde' }), s: input({ type: 'number', inputmode: 'numeric', placeholder: 'Start' }), e: input({ type: 'number', inputmode: 'numeric', placeholder: 'Slut' }), km: input({ inputmode: 'decimal', placeholder: 'km' }), ty: select(SV.TRIP_TYPES, 'Erhverv') };
  const num = (v) => Number(String(v).trim().replace(/\s/g, '').replace(',', '.')) || 0;   // "32,5" as well as "32.5"
  const add = () => {
    const km = SV.tripKm(+f.s.value || 0, +f.e.value || 0, num(f.km.value));
    if (!(km > 0)) { toast('Skriv antal km eller kilometerstand', { type: 'warn' }); return; }
    S.drv.push({ id: uid('d'), d: f.d.value || today(), f: f.f.value.trim(), t: f.t.value.trim(), p: f.p.value.trim(), s: +f.s.value || 0, e: +f.e.value || 0, km: Math.round(km * 10) / 10, ty: f.ty.value });
    month = (f.d.value || today()).slice(0, 7); save('drv'); draw();
  };
  return h('div', { class: 'sv-grid' },
    h('section', { class: 'glass panel sv-main' },
      h('div', { class: 'sv-row' }, field('Måned', select(months.map(SV.monthLabel), SV.monthLabel(month), { onchange: (e) => { month = months[e.target.selectedIndex]; draw(); } })),
        h('div', { class: 'sv-kpis' }, kpi('Erhverv', `${m.work.toLocaleString('da-DK')} km`), kpi('Privat', `${m.priv.toLocaleString('da-DK')} km`), kpi('Godtgørelse', SV.kr(m.amount)))),
      m.trips.length ? h('ul', { class: 'sv-list' }, m.trips.map(t => h('li', { class: 'sv-item' },
        h('div', { class: 'sv-item-main' }, h('b', null, [t.f, t.t].filter(Boolean).join(' → ') || t.p || 'Tur'), h('span', { class: 'faint' }, [SV.parseDate(t.d)?.toLocaleDateString('da-DK'), t.p, t.s ? `${t.s} → ${t.e}` : ''].filter(Boolean).join(' · ')), chip(`${String(t.km).replace('.', ',')} km · ${t.ty || 'Erhverv'}`, t.ty === 'Privat' ? '' : 'ok')),
        h('div', { class: 'sv-item-acts' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Slet turen', onclick: () => { S.drv = S.drv.filter(x => x !== t); save('drv'); draw(); } }, icon('trash')))))) : empty('Ingen ture i denne måned', 'Skriv dine ture ind til højre – så regner HUBTECH km og godtgørelse ud.'),
      m.amount ? h('button', { type: 'button', class: 'btn', onclick: () => { S.exp.push({ id: uid('x'), d: `${month}-${String(new Date(+month.slice(0, 4), +month.slice(5), 0).getDate()).padStart(2, '0')}`, t: 'Kørsel (egen bil)', a: m.amount, n: `Erhvervskørsel ${SV.monthLabel(month)} – ${m.work} km`, c: '', km: m.work, s: 0 }); save('exp'); toast('Udgiften er lagt i Udgifter', { type: 'ok' }); } }, icon('wallet'), 'Lav udgift af månedens kørsel') : null),
    h('aside', { class: 'stack' },
      h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('plus'), 'Ny tur'),
        field('Dato', f.d), h('div', { class: 'grid-2' }, field('Fra', f.f), field('Til', f.t)), field('Formål / kunde', f.p),
        h('div', { class: 'grid-2' }, field('Km-stand start', f.s), field('Km-stand slut', f.e)), field('Eller antal km', f.km), field('Type', f.ty),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, icon('plus'), 'Gem tur')),
      h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('car'), 'Bilen'),
        field('Nummerplade', input({ value: S.drvp || '', oninput: (e) => { S.drvp = e.target.value; save('drvp'); } })),
        field('Sats pr. km (kr.)', input({ type: 'number', inputmode: 'decimal', step: '0.01', value: S.drvr || '', oninput: debounce((e) => { S.drvr = e.target.value; save('drvr'); draw(); }, 500) }), 'Skattefri sats for erhvervskørsel – tjek den på skat.dk hvert år.'))));
}
const kpi = (label, value) => h('div', { class: 'sv-kpi' }, h('span', { class: 'faint' }, label), h('b', null, value));

function expView() {
  const list = S.exp.filter(x => String(x.d || '').startsWith(month)).sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const months = [...new Set([thisMonth(), ...S.exp.map(x => String(x.d || '').slice(0, 7)).filter(Boolean)])].sort().reverse();
  const sum = (s) => list.filter(x => (x.s || 0) === s).reduce((a, x) => a + (Number(x.a) || 0), 0);
  const f = { d: input({ type: 'date', value: today() }), t: select(SV.EXP_TYPES, 'Benzin'), a: input({ inputmode: 'decimal', placeholder: '0,00' }), n: input({ placeholder: 'Note' }), c: input({ placeholder: 'Kunde (valgfri)', list: 'sv-customers2' }) };
  return h('div', { class: 'sv-grid' },
    h('datalist', { id: 'sv-customers2' }, knownCustomers().map(c => h('option', { value: c.name }))),
    h('section', { class: 'glass panel sv-main' },
      h('div', { class: 'sv-row' }, field('Måned', select(months.map(SV.monthLabel), SV.monthLabel(month), { onchange: (e) => { month = months[e.target.selectedIndex]; draw(); } })),
        h('div', { class: 'sv-kpis' }, SV.EXP_STATUS.map((s, i) => kpi(s, SV.kr(sum(i)))))),
      list.length ? h('ul', { class: 'sv-list' }, list.map(x => h('li', { class: 'sv-item' },
        h('div', { class: 'sv-item-main' }, h('b', null, `${x.t} · ${SV.kr(x.a)}`), h('span', { class: 'faint' }, [SV.parseDate(x.d)?.toLocaleDateString('da-DK'), x.c, x.n].filter(Boolean).join(' · '))),
        h('div', { class: 'sv-item-acts' },
          h('button', { type: 'button', class: ['chip', 'sv-chip', ['', 'is-warn', 'is-ok'][x.s || 0]], title: 'Skift status', onclick: () => { x.s = ((x.s || 0) + 1) % 3; save('exp'); draw(); } }, SV.EXP_STATUS[x.s || 0]),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Slet udgiften', onclick: () => { S.exp = S.exp.filter(y => y !== x); save('exp'); draw(); } }, icon('trash')))))) : empty('Ingen udgifter i denne måned', 'Skriv dine arbejdsudgifter ind – benzin, parkering, hotel – og følg dem til de er refunderet.')),
    h('aside', { class: 'stack' }, h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('plus'), 'Ny udgift'),
      field('Dato', f.d), field('Type', f.t), field('Beløb (kr.)', f.a), field('Kunde', f.c), field('Note', f.n),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        const a = Number(String(f.a.value).replace(',', '.'));
        if (!(a > 0)) { toast('Skriv et beløb', { type: 'warn' }); return; }
        S.exp.push({ id: uid('x'), d: f.d.value || today(), t: f.t.value, a, n: f.n.value.trim(), c: f.c.value.trim(), km: 0, s: 0 });
        month = (f.d.value || today()).slice(0, 7); save('exp'); draw();
      } }, icon('plus'), 'Gem udgift'))));
}

function garView() {
  const list = S.gar.map(g => ({ g, st: SV.warrantyStatus(g) })).sort((a, b) => a.st.end - b.st.end);
  const f = { k: input({ placeholder: 'Kunde', list: 'sv-customers3' }), m: input({ placeholder: 'Enhed / model' }), s: input({ placeholder: 'Serienummer' }), t: select(SV.WARRANTY_TYPES, 'Reparationsgaranti'), d: input({ type: 'date', value: today() }), mo: input({ type: 'number', min: 1, value: 12 }), n: input({ placeholder: 'Note' }) };
  return h('div', { class: 'sv-grid' },
    h('datalist', { id: 'sv-customers3' }, knownCustomers().map(c => h('option', { value: c.name }))),
    h('section', { class: 'glass panel sv-main' },
      list.length ? h('ul', { class: 'sv-list' }, list.map(({ g, st }) => h('li', { class: 'sv-item' },
        h('div', { class: 'sv-item-main' }, h('b', null, [g.m, g.k].filter(Boolean).join(' · ') || 'Garanti'), h('span', { class: 'faint' }, [g.t, g.s && `SN ${g.s}`, `til ${st.end.toLocaleDateString('da-DK')}`, g.n].filter(Boolean).join(' · ')),
          chip(st.state === 'udløbet' ? 'Udløbet' : st.state === 'snart' ? `Udløber om ${st.days} dage` : `${st.days} dage tilbage`, st.state === 'aktiv' ? 'ok' : st.state === 'snart' ? 'warn' : '')),
        h('div', { class: 'sv-item-acts' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Slet garantien', onclick: () => { S.gar = S.gar.filter(x => x !== g); save('gar'); draw(); } }, icon('trash')))))) : empty('Ingen garantier endnu', 'Hold styr på fabriks- og reparationsgarantier – du kan se, hvilke der snart udløber.')),
    h('aside', { class: 'stack' }, h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('plus'), 'Ny garanti'),
      field('Kunde', f.k), field('Enhed / model', f.m), field('Serienummer', f.s), field('Type', f.t), h('div', { class: 'grid-2' }, field('Startdato', f.d), field('Måneder', f.mo)), field('Note', f.n),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        if (!f.m.value.trim() && !f.s.value.trim()) { toast('Skriv model eller serienummer', { type: 'warn' }); return; }
        S.gar.push({ id: uid('g'), k: f.k.value.trim(), m: f.m.value.trim(), s: f.s.value.trim(), t: f.t.value, d: f.d.value || today(), mo: +f.mo.value || 12, n: f.n.value.trim() });
        save('gar'); draw();
      } }, icon('plus'), 'Gem garanti'))));
}

function kbView() {
  const list = SV.searchKb(S.kb, kbQ, kbType);
  const f = { t: select(SV.KB_TYPES, 'Fejlkode'), ti: input({ placeholder: 'fx E-04 papirstop' }), m: input({ placeholder: 'Mærke / model' }), c: h('textarea', { class: 'input', rows: 4, placeholder: 'Løsning, værdi eller beskrivelse' }), l: input({ placeholder: 'Link (valgfri)', type: 'url' }) };
  return h('div', { class: 'sv-grid' },
    h('section', { class: 'glass panel sv-main' },
      h('div', { class: 'sv-search' }, input({ type: 'search', placeholder: 'Søg i din viden …', value: kbQ, 'aria-label': 'Søg i viden', oninput: debounce((e) => { kbQ = e.target.value; draw(); setTimeout(() => root.querySelector('.sv-search input')?.focus(), 0); }, 250) })),
      h('div', { class: 'sv-folders', role: 'group', 'aria-label': 'Type' }, ['', ...SV.KB_TYPES].map(t => h('button', { type: 'button', class: ['chip', kbType === t && 'is-on'], 'aria-pressed': String(kbType === t), onclick: () => { kbType = t; draw(); } }, t || 'Alle'))),
      list.length ? h('ul', { class: 'sv-list' }, list.map(x => h('li', { class: 'sv-item' },
        h('div', { class: 'sv-item-main' }, h('b', null, x.ti), h('span', { class: 'faint' }, [x.t, x.m].filter(Boolean).join(' · ')), x.c ? h('p', { class: 'sv-kb-text' }, x.c) : null,
          x.l && /^https?:\/\//i.test(x.l) ? h('a', { href: x.l, target: '_blank', rel: 'noopener' }, icon('external'), 'Åbn link') : null),
        h('div', { class: 'sv-item-acts' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Slet', onclick: () => { S.kb = S.kb.filter(y => y !== x); save('kb'); draw(); } }, icon('trash')))))) : empty(S.kb.length ? 'Intet passer' : 'Din vidensbank er tom', 'Gem fejlkoder, reservedele, måleværdier og manualer, du får brug for igen. Gnist kan også hjælpe – tryk Ctrl+J.')),
    h('aside', { class: 'stack' }, h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('plus'), 'Ny viden'),
      field('Type', f.t), field('Titel', f.ti), field('Mærke / model', f.m), field('Indhold', f.c), field('Link', f.l),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        if (!f.ti.value.trim()) { toast('Skriv en titel', { type: 'warn' }); return; }
        S.kb.push({ id: uid('v'), t: f.t.value, ti: f.ti.value.trim(), m: f.m.value.trim(), c: f.c.value.trim(), l: f.l.value.trim() });
        save('kb'); draw();
      } }, icon('plus'), 'Gem viden'))));
}

function statsView() {
  const st = SV.stats(S.log, S.drv, S.exp);
  const chart = (c, label) => h('figure', { class: 'sv-chart', 'aria-label': label }, raw(chartSvg(c)));
  const has = (arr) => arr.length >= 2;
  return h('div', { class: 'stack' },
    h('div', { class: 'sv-kpis is-big' }, kpi('Rapporter i alt', String(st.total)), kpi('Denne måned', String(st.thisMonth)), kpi('Kunder', String(knownCustomers().length)), kpi('Aktive garantier', String(S.gar.filter(g => SV.warrantyStatus(g).state !== 'udløbet').length))),
    h('div', { class: 'sv-charts' },
      h('section', { class: 'glass panel' }, chart({ type: 'bar', title: 'Rapporter pr. måned', data: st.months.map(m => ({ label: m.label, value: m.reports })) }, 'Rapporter pr. måned')),
      h('section', { class: 'glass panel' }, chart({ type: 'line', title: 'Erhvervskørsel (km)', data: st.months.map(m => ({ label: m.label, value: Math.round(m.km) })) }, 'Kørsel pr. måned')),
      has(st.types) ? h('section', { class: 'glass panel' }, chart({ type: 'pie', title: 'Enhedstyper', data: st.types }, 'Enhedstyper')) : null,
      has(st.results) ? h('section', { class: 'glass panel' }, chart({ type: 'pie', title: 'Resultater', data: st.results }, 'Resultater')) : null,
      has(st.customers) ? h('section', { class: 'glass panel' }, chart({ type: 'bar', title: 'Flest rapporter', data: st.customers }, 'Kunder med flest rapporter')) : null,
      h('section', { class: 'glass panel' }, chart({ type: 'bar', title: 'Udgifter (kr.)', data: st.months.map(m => ({ label: m.label, value: Math.round(m.exp) })) }, 'Udgifter pr. måned'))));
}

function draw() {
  if (!root) return;
  const body = { reports: reportsView, new: editorView, drv: drvView, exp: expView, gar: garView, kb: kbView, stats: statsView }[view]();
  const tabs = h('div', { class: 'sv-tabs', role: 'tablist', 'aria-label': 'Servicehjælp' }, VIEWS.map(v => h('button', { type: 'button', role: 'tab', class: ['sv-tab', view === v.value && 'is-on'], 'aria-selected': String(view === v.value), 'data-view': v.value, onclick: () => { view = v.value; draw(); } }, icon(v.icon), h('span', null, v.label))));
  h(clear(root), null, tabs, body);
}

export default {
  title: 'Servicehjælp',
  destroy() { for (const k of Object.values(SV.KEYS)) { try { flushState(k); } catch { /* */ } } root = null; },
  async render() {
    const app = appById('servicehelp');
    root = h('div', { class: 'sv-root' });
    const page = h('div', { class: 'page sv-page', style: { '--app': app.hue } },
      appHero(app, { compact: true, title: 'Servicehjælp', lead: 'Servicerapporter med fotos og PDF, kørebog, udgifter, garantier og din egen vidensbank – en del af HUBTECH, gemt på din konto.',
        actions: [heroBtn('Ny rapport', 'plus', { onclick: () => { view = 'new'; draw(); } })] }),
      root);
    try { await load(); } catch (e) { console.error(e); h(root, null, stateBlock({ kind: 'error', icon: 'alert', title: 'Servicehjælp kunne ikke hentes', text: 'Tjek at HUBTECH-serveren kører, og prøv igen.' })); return page; }
    const want = (location.hash.split('/')[3] || '').toLowerCase();
    if (VIEWS.some(v => v.value === want)) view = want;
    logActivity('servicehelp', 'open', 'Servicehjælp', 'App åbnet');
    draw();
    return page;
  },
};
