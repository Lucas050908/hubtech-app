/**
 * Kunder — one page per customer that gathers everything HUBTECH knows about them
 * (time from Tidsregistrering, appointments from Kalender, reports from Servicehjælp, tasks),
 * plus invoice drafts built from unbilled time and parts from Lager, exported as PDF.
 */
import { h, clear, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, modal, confirmDialog, stateBlock, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { saveBlob } from '../core/files.js';
import { navigate } from '../core/router.js';
import { matchesCustomer, norm, hoursOf, quarter, totals, lineTotal, linesFromEntries, invoiceState, invoiceNo, isoDate, daDate, addDays, kr } from '../features/invoice.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const svc = (s) => { try { return JSON.parse(s?.v || '[]'); } catch { return []; } };
const hrs = (h) => h.toLocaleString('da-DK', { maximumFractionDigits: 2 });
let st = null, D = null, view = 'customers';

const persist = () => saveState('customers', st, { onError: () => toast('Kunderne kunne ikke gemmes', { type: 'bad' }) });
const persistTs = () => saveState('timesheet', D.ts, { onError: () => toast('Tidsregistreringen kunne ikke opdateres', { type: 'bad' }) });
const persistInv = () => saveState('inventory', D.inv, { onError: () => toast('Lageret kunne ikke opdateres', { type: 'bad' }) });

async function loadAll() {
  const [c, ts, cal, tasks, scust, slog, inv] = await Promise.all(['customers', 'timesheet', 'calendar', 'tasks', 'svc-cust', 'svc-log', 'inventory'].map(k => getState(k, { force: true }).catch(() => null)));
  st = c && Array.isArray(c.customers) ? c : { customers: [], invoices: [], company: {}, nextNo: 1 };
  st.invoices ||= []; st.company ||= {}; st.nextNo ||= 1;
  D = { ts: ts || { entries: [], rate: 450 }, events: cal?.events || [], tasks: tasks?.tasks || [], svcCust: svc(scust), svcLog: svc(slog), inv: inv || { items: [] } };
  D.ts.entries ||= [];
}

// ── what belongs to a customer ──
function about(c) {
  const m = (t) => matchesCustomer(c.name, t);
  const time = D.ts.entries.filter(e => m(e.project));
  const unbilled = time.filter(e => e.end && e.billable !== false && !e.invoice);
  const events = D.events.filter(e => m(e.title) || m(e.location) || m(e.notes));
  const reports = D.svcLog.filter(r => m(r.k));
  const tasks = D.tasks.filter(t => m(t.title) || m(t.notes));
  const invoices = st.invoices.filter(i => i.customer === c.id);
  const rate = Number(c.rate) || D.ts.rate || 0;
  const last = Math.max(0, ...time.map(e => e.end || e.start), ...events.filter(e => e.date <= isoDate()).map(e => Date.parse(e.date) || 0), ...reports.map(r => Date.parse(r.d) || 0));
  return { time, unbilled, events, reports, tasks, invoices, rate, last, unbilledHours: unbilled.reduce((a, e) => a + quarter(hoursOf(e)), 0) };
}

function suggestions() {
  const have = new Set(st.customers.map(c => norm(c.name)));
  const found = new Map();
  const add = (name, extra = {}) => { const k = norm(name); if (!k || have.has(k)) return; found.set(k, { ...(found.get(k) || {}), name: String(name).trim(), ...extra }); };
  D.svcCust.forEach(x => add(x.k, { contact: x.kp || '', address: x.a || '', phone: x.t || '', from: 'Servicehjælp' }));
  D.ts.entries.forEach(e => e.project && add(e.project, { from: found.get(norm(e.project))?.from || 'Tidsregistrering' }));
  D.svcLog.forEach(r => r.k && add(r.k, { from: found.get(norm(r.k))?.from || 'Servicehjælp' }));
  return [...found.values()];
}
const newCustomer = (x) => ({ id: uid(), name: x.name, contact: x.contact || '', phone: x.phone || '', email: x.email || '', address: x.address || '', cvr: x.cvr || '', notes: '', rate: '', created: Date.now() });

function field(label, input) { return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input); }
function inputs(defs, obj) {
  const els = {};
  const body = h('div', { class: 'cu-form' }, defs.map(([k, label, attrs = {}]) => {
    const el = h('input', { class: 'input', ...attrs });
    el.value = obj?.[k] ?? '';
    els[k] = el;
    return field(label, el);
  }));
  return { body, els, read: () => Object.fromEntries(Object.entries(els).map(([k, el]) => [k, el.value.trim()])) };
}

function customerDialog(c, after) {
  const f = inputs([['name', 'Navn *', { autocomplete: 'organization' }], ['contact', 'Kontaktperson'], ['phone', 'Telefon', { type: 'tel', autocomplete: 'tel' }], ['email', 'E-mail', { type: 'email', autocomplete: 'email' }],
    ['address', 'Adresse'], ['cvr', 'CVR-nr.', { inputmode: 'numeric' }], ['rate', 'Egen timepris (kr.)', { type: 'number', min: 0, step: 25, placeholder: `Standard: ${D.ts.rate || 450}` }]], c);
  let m;
  const save = () => {
    const v = f.read();
    if (!v.name) { f.els.name.focus(); return; }
    if (st.customers.some(x => x !== c && norm(x.name) === norm(v.name))) { toast('Der findes allerede en kunde med det navn', { type: 'warn' }); return; }
    if (c) Object.assign(c, v); else { c = newCustomer(v); Object.assign(c, v); st.customers.push(c); logActivity('customers', 'create', c.name, 'Ny kunde'); }
    persist(); m.close(); after?.(c);
  };
  m = modal({ title: c ? 'Redigér kunde' : 'Ny kunde', size: 560, body: f.body,
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: save }, c ? 'Gem' : 'Opret kunde')] });
  m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') save(); });
}

function companyDialog(after) {
  const f = inputs([['name', 'Firmanavn'], ['address', 'Adresse'], ['zip', 'Postnr.', { inputmode: 'numeric' }], ['city', 'By'], ['cvr', 'CVR-nr.', { inputmode: 'numeric' }], ['phone', 'Telefon', { type: 'tel' }], ['email', 'E-mail', { type: 'email' }],
    ['reg', 'Reg.nr.', { inputmode: 'numeric' }], ['account', 'Kontonr.', { inputmode: 'numeric' }], ['payDays', 'Betalingsfrist (dage)', { type: 'number', min: 0, step: 1 }], ['vat', 'Moms (%)', { type: 'number', min: 0, step: 1 }]],
  { payDays: 8, vat: 25, ...st.company });
  let m;
  m = modal({ title: 'Firmaoplysninger', label: 'Vises på fakturaen', size: 620, body: h('div', null, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Udfyld én gang – så kommer det med på alle fakturaer.'), f.body),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: () => { st.company = f.read(); persist(); m.close(); after?.(); toast('Firmaoplysninger gemt', { type: 'ok' }); } }, 'Gem')] });
}

function createInvoice(c, entries) {
  const a = about(c);
  const company = st.company || {};
  const date = isoDate();
  const inv = { id: uid(), no: st.nextNo++, customer: c.id, date, due: addDays(date, Number(company.payDays ?? 8) || 0), status: 'draft', vat: Number(company.vat ?? 25), note: '', lines: linesFromEntries(entries ?? a.unbilled, a.rate), created: Date.now() };
  for (const e of entries ?? a.unbilled) e.invoice = inv.id;
  st.invoices.push(inv);
  persist(); persistTs();
  logActivity('customers', 'invoice', `Faktura ${invoiceNo(inv.no)}`, c.name);
  return inv;
}

function statusChip(inv) { const s = invoiceState(inv); return h('span', { class: ['chip', 'cu-status', `is-${s.key}`] }, s.label); }

// ── overview ──
function overview(app) {
  const all = st.customers.map(c => ({ c, a: about(c) }));
  const unbilledKr = all.reduce((s, x) => s + x.a.unbilledHours * x.a.rate, 0);
  const open = st.invoices.filter(i => i.status === 'sent');
  const openKr = open.reduce((s, i) => s + totals(i.lines, i.vat).gross, 0);
  const sug = suggestions();
  let q = '';
  const list = h('div');
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg kunde, telefon, adresse…', 'aria-label': 'Søg i kunder' });
  search.addEventListener('input', debounce(() => { q = norm(search.value); draw(); }, 100));
  const draw = () => {
    if (view === 'invoices') {
      const invs = st.invoices.slice().sort((a, b) => b.no - a.no);
      h(clear(list), null, invs.length ? h('div', { class: 'cu-table-wrap glass panel' }, h('table', { class: 'cu-table' },
        h('thead', null, h('tr', null, ['Nr.', 'Kunde', 'Dato', 'Forfald', 'Beløb inkl. moms', 'Status'].map((t, i) => h('th', { scope: 'col', class: i === 4 ? 'num' : '' }, t)))),
        h('tbody', null, invs.map(i => { const c = st.customers.find(x => x.id === i.customer); return h('tr', null,
          h('td', null, h('a', { href: `#/apps/customers/invoice/${i.id}` }, invoiceNo(i.no))), h('td', null, c?.name || '–'), h('td', null, daDate(i.date)), h('td', null, daDate(i.due)),
          h('td', { class: 'num' }, kr(totals(i.lines, i.vat).gross)), h('td', null, statusChip(i))); }))))
        : stateBlock({ icon: 'file', title: 'Ingen fakturaer endnu', text: 'Åbn en kunde og tryk “Fakturaudkast” – ufakturerede timer kommer automatisk med.' }));
      return;
    }
    const rows = all.filter(({ c }) => !q || norm([c.name, c.contact, c.phone, c.email, c.address, c.cvr].join(' ')).includes(q))
      .sort((x, y) => (y.a.last - x.a.last) || x.c.name.localeCompare(y.c.name, 'da'));
    h(clear(list), null, rows.length ? h('div', { class: 'cu-list' }, rows.map(({ c, a }) => h('a', { class: 'cu-row glass', href: `#/apps/customers/c/${c.id}` },
      h('span', { class: 'cu-avatar', 'aria-hidden': 'true' }, c.name.trim().slice(0, 1).toUpperCase()),
      h('span', { class: 'cu-row-main' }, h('b', null, c.name), h('span', { class: 'faint' }, [c.contact, c.phone, c.address].filter(Boolean).join(' · ') || 'Ingen kontaktoplysninger')),
      h('span', { class: 'cu-row-chips' },
        a.unbilledHours ? h('span', { class: 'chip chip-app' }, icon('clock'), `${hrs(a.unbilledHours)} t ufaktureret`) : null,
        a.reports.length ? h('span', { class: 'chip' }, `${a.reports.length} rapport${a.reports.length === 1 ? '' : 'er'}`) : null,
        a.last ? h('span', { class: 'faint cu-last' }, `Senest ${daDate(isoDate(a.last))}`) : null),
      icon('arrowRight'))))
      : stateBlock({ icon: 'users', title: q ? 'Ingen kunder matcher' : 'Ingen kunder endnu', text: q ? '' : 'Opret din første kunde – eller importér dem, HUBTECH har fundet i dine andre apps.' }));
  };
  const importBox = sug.length ? h('div', { class: 'callout cu-import' }, icon('sparkles'),
    h('div', null, h('strong', null, `${sug.length} kunde${sug.length === 1 ? '' : 'r'} fundet i dine andre apps. `), sug.slice(0, 6).map(s => s.name).join(', ') + (sug.length > 6 ? ' …' : '')),
    h('button', { class: 'btn btn-sm app-solid', onclick: () => { for (const s of sug) st.customers.push(newCustomer(s)); persist(); toast(`${sug.length} kunder importeret`, { type: 'ok' }); navigate(location.hash, { replace: true }); } }, 'Importér alle')) : null;
  const seg = segmented([{ value: 'customers', label: `Kunder (${st.customers.length})` }, { value: 'invoices', label: `Fakturaer (${st.invoices.length})` }], view, (v) => { view = v; search.hidden = v !== 'customers'; draw(); }, { label: 'Visning' });
  search.hidden = view !== 'customers';
  draw();
  return h('div', { class: 'page customers-page', style: { '--app': app.hue } },
    appHero(app, {
      eyebrow: 'Arbejdsrum', title: 'Kunder', lead: 'Alt om hver kunde ét sted: timer, aftaler, servicerapporter og opgaver – og fakturaudkast lavet direkte af dine ufakturerede timer.',
      actions: [heroBtn('Ny kunde', 'plus', { onclick: () => customerDialog(null, (c) => navigate(`/apps/customers/c/${c.id}`)) }), heroGhost('Firmaoplysninger', 'settings', { onclick: () => companyDialog() })],
      stats: [
        { icon: 'users', label: 'Kunder', value: String(st.customers.length) },
        { icon: 'clock', label: 'Ufaktureret', value: kr(unbilledKr) },
        { icon: 'file', label: 'Udestående fakturaer', value: kr(openKr) },
        { icon: 'alert', label: 'Forfaldne', value: String(open.filter(i => invoiceState(i).key === 'overdue').length) }],
    }),
    importBox,
    h('div', { class: 'cu-toolbar' }, seg, search),
    list);
}

// ── one customer ──
function customerPage(app, c) {
  const a = about(c);
  const today = isoDate();
  const section = (title, ic, body, extra) => h('section', { class: 'glass panel cu-sec' }, h('div', { class: 'cu-sec-head' }, h('h2', null, icon(ic), title), extra || null), body);
  const empty = (t) => h('p', { class: 'faint cu-empty' }, t);
  const notes = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Noter om kunden – adgang, kodeord til gæstenet, faste aftaler …', 'aria-label': 'Noter om kunden' });
  notes.value = c.notes || '';
  notes.addEventListener('input', debounce(() => { c.notes = notes.value; persist(); }, 500));
  const startTimer = () => {
    if (D.ts.running) { toast('Uret kører allerede', { text: D.ts.running.project || D.ts.running.desc || '', action: { label: 'Åbn', onClick: () => navigate('/apps/timesheet') } }); return; }
    D.ts.running = { start: Date.now(), desc: '', project: c.name, billable: true }; persistTs(); flushState('timesheet');
    toast(`Uret kører på ${c.name}`, { type: 'ok', action: { label: 'Åbn Tidsregistrering', onClick: () => navigate('/apps/timesheet') } });
  };
  const upcoming = a.events.filter(e => (e.endDate || e.date) >= today).sort((x, y) => (x.date + (x.start || '')).localeCompare(y.date + (y.start || '')));
  const past = a.events.filter(e => (e.endDate || e.date) < today).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5);
  const evRow = (e) => h('li', null, h('b', null, `${daDate(e.date)}${e.start ? ` kl. ${e.start}` : ''}`), h('span', null, e.title), e.location ? h('span', { class: 'faint' }, e.location) : null);
  const time = a.time.slice().sort((x, y) => y.start - x.start);
  const invoiceBtn = h('button', { class: 'btn app-solid', disabled: !a.unbilled.length, onclick: () => { const inv = createInvoice(c); navigate(`/apps/customers/invoice/${inv.id}`); } }, icon('file'), a.unbilled.length ? `Fakturaudkast (${hrs(a.unbilledHours)} t)` : 'Ingen ufakturerede timer');

  return h('div', { class: 'page customers-page', style: { '--app': app.hue } },
    appHero(app, {
      eyebrow: 'Kunde', title: c.name, compact: true, back: { href: '#/apps/customers', label: 'Tilbage til Kunder' },
      lead: [c.contact, c.phone, c.email, c.address, c.cvr && `CVR ${c.cvr}`].filter(Boolean).join(' · ') || 'Ingen kontaktoplysninger endnu',
      actions: [heroBtn('Start ur', 'play', { onclick: startTimer }), heroGhost('Redigér', 'edit', { onclick: () => customerDialog(c, () => navigate(location.hash, { replace: true })) })],
      stats: [
        { icon: 'clock', label: 'Timer i alt', value: `${hrs(a.time.reduce((s, e) => s + hoursOf(e), 0))} t` },
        { icon: 'file', label: 'Ufaktureret', value: kr(a.unbilledHours * a.rate) },
        { icon: 'tool', label: 'Servicerapporter', value: String(a.reports.length) },
        { icon: 'calendar', label: 'Kommende aftaler', value: String(upcoming.length) }],
    }),
    h('div', { class: 'cu-actions' }, invoiceBtn,
      c.phone ? h('a', { class: 'btn', href: `tel:${c.phone.replace(/\s/g, '')}` }, icon('chat'), 'Ring op') : null,
      c.email ? h('a', { class: 'btn', href: `mailto:${c.email}` }, icon('mail'), 'Skriv mail') : null,
      h('a', { class: 'btn btn-ghost', href: '#/apps/calendar' }, icon('calendar'), 'Ny aftale i Kalender')),
    h('div', { class: 'cu-grid' },
      section('Tid', 'stopwatch', time.length ? h('ul', { class: 'cu-items' }, time.slice(0, 12).map(e => h('li', null,
        h('b', null, daDate(isoDate(e.start))), h('span', null, e.desc || 'Arbejde'),
        h('span', { class: 'cu-item-end' }, h('span', { class: 'mono' }, `${hrs(hoursOf(e))} t`),
          e.invoice ? h('span', { class: 'chip chip-ok' }, 'Faktureret') : e.billable === false ? h('span', { class: 'chip' }, 'Ikke fakturerbar') : e.end ? h('span', { class: 'chip chip-app' }, 'Ufaktureret') : h('span', { class: 'chip chip-warn' }, 'Kører'))))) : empty('Ingen tid registreret. Tryk “Start ur” – kundens navn bruges som projekt i Tidsregistrering.'),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/apps/timesheet' }, 'Tidsregistrering')),
      section('Aftaler', 'calendar', upcoming.length || past.length ? h('div', null,
        upcoming.length ? h('ul', { class: 'cu-items' }, upcoming.slice(0, 6).map(evRow)) : null,
        past.length ? h('details', { class: 'cu-past' }, h('summary', null, `Tidligere (${past.length})`), h('ul', { class: 'cu-items' }, past.map(evRow))) : null) : empty('Ingen aftaler. Aftaler med kundens navn i titel eller sted vises her.')),
      section('Servicerapporter', 'tool', a.reports.length ? h('ul', { class: 'cu-items' }, a.reports.slice(0, 8).map(r => h('li', { class: 'cu-report' },
        h('b', null, /^\d{4}-\d{2}-\d{2}$/.test(r.d || '') ? daDate(r.d) : String(r.d || '')), h('span', null, r.e || 'Rapport'),
        r.t ? h('details', null, h('summary', null, 'Vis'), h('pre', { class: 'cu-pre' }, r.t)) : null))) : empty('Ingen rapporter fra Servicehjælp med denne kunde.'),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/apps/servicehelp' }, 'Servicehjælp')),
      section('Opgaver', 'kanban', a.tasks.length ? h('ul', { class: 'cu-items' }, a.tasks.slice(0, 8).map(t => h('li', null,
        h('span', { class: ['status-dot', t.status === 'done' ? 'ok' : t.status === 'doing' ? 'warn' : ''] }), h('span', null, t.title), t.due ? h('span', { class: 'faint' }, daDate(t.due)) : null))) : empty('Ingen opgaver med kundens navn.'),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/apps/tasks' }, 'Opgaver')),
      section('Fakturaer', 'file', a.invoices.length ? h('ul', { class: 'cu-items' }, a.invoices.slice().sort((x, y) => y.no - x.no).map(i => h('li', null,
        h('a', { href: `#/apps/customers/invoice/${i.id}` }, `Nr. ${invoiceNo(i.no)}`), h('span', null, daDate(i.date)), h('span', { class: 'cu-item-end' }, h('span', { class: 'mono' }, kr(totals(i.lines, i.vat).gross)), statusChip(i))))) : empty('Ingen fakturaer endnu.')),
      section('Noter', 'note', notes)),
    h('div', { class: 'cu-danger' }, h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
      if (!(await confirmDialog({ title: `Slet ${c.name}?`, text: 'Kunden og dens fakturaer slettes i Kunder. Tid, aftaler og rapporter i de andre apps bliver liggende.', confirmLabel: 'Slet kunde', danger: true }))) return;
      for (const i of a.invoices) for (const e of D.ts.entries) if (e.invoice === i.id) delete e.invoice;
      st.invoices = st.invoices.filter(i => i.customer !== c.id); st.customers = st.customers.filter(x => x !== c); persist(); persistTs(); navigate('/apps/customers');
    } }, icon('trash'), 'Slet kunde')));
}

// ── invoice editor ──
function invoicePage(app, inv) {
  const c = st.customers.find(x => x.id === inv.customer) || { name: 'Ukendt kunde' };
  const locked = inv.status !== 'draft';
  const body = h('tbody');
  const sums = h('div', { class: 'cu-totals' });
  const save = debounce(() => persist(), 400);
  const paintTotals = () => { const t = totals(inv.lines, inv.vat); h(clear(sums), null, h('div', null, h('span', null, 'Subtotal'), h('b', null, kr(t.net))), h('div', null, h('span', null, `Moms ${inv.vat} %`), h('b', null, kr(t.vat))), h('div', { class: 'is-total' }, h('span', null, 'I alt'), h('b', null, kr(t.gross)))); };
  const unmark = (l) => { if (l.src?.kind === 'time') { const e = D.ts.entries.find(x => x.id === l.src.id); if (e && e.invoice === inv.id) { delete e.invoice; persistTs(); } } };
  const drawLines = () => {
    h(clear(body), null, inv.lines.map((l, i) => {
      const cell = (k, attrs) => { const el = h('input', { class: 'input', value: l[k] ?? '', disabled: locked, 'aria-label': `${{ text: 'Beskrivelse', qty: 'Antal', unit: 'Enhed', price: 'Pris' }[k]} – linje ${i + 1}`, ...attrs }); el.addEventListener('input', () => { l[k] = attrs?.type === 'number' ? Number(el.value) || 0 : el.value; sum.textContent = kr(lineTotal(l)); paintTotals(); save(); }); return el; };
      const sum = h('span', { class: 'mono' }, kr(lineTotal(l)));
      return h('tr', null,
        h('td', { class: 'cu-l-text' }, cell('text')), h('td', { class: 'cu-l-qty' }, cell('qty', { type: 'number', step: 0.25, min: 0 })), h('td', { class: 'cu-l-unit' }, cell('unit')),
        h('td', { class: 'cu-l-price' }, cell('price', { type: 'number', step: 1, min: 0 })), h('td', { class: 'num' }, sum),
        h('td', null, locked ? null : h('button', { class: 'icon-btn', 'aria-label': `Fjern linje ${i + 1}`, onclick: () => { unmark(l); inv.lines.splice(i, 1); persist(); drawLines(); } }, icon('x'))));
    }));
    paintTotals();
  };
  const addPart = () => {
    const items = (D.inv.items || []).slice().sort((x, y) => x.name.localeCompare(y.name, 'da'));
    if (!items.length) { toast('Lageret er tomt', { text: 'Tilføj dele i Lager først.' }); return; }
    const sel = h('select', { class: 'select', 'aria-label': 'Del fra lageret' }, items.map(it => h('option', { value: it.id }, `${it.name} – ${it.qty} på lager${it.price ? ` · ${kr(it.price)}` : ''}`)));
    const qty = h('input', { class: 'input', type: 'number', min: 1, step: 1, value: 1, 'aria-label': 'Antal' });
    let m;
    m = modal({ title: 'Del fra lageret', size: 520, body: h('div', { class: 'cu-form' }, field('Del', sel), field('Antal', qty), h('p', { class: 'faint' }, 'Antallet trækkes fra lageret, når fakturaen markeres som sendt.')),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: () => {
        const it = items.find(x => x.id === sel.value);
        inv.lines.push({ text: it.name + (it.sku ? ` (${it.sku})` : ''), qty: Math.max(1, Number(qty.value) || 1), unit: 'stk.', price: Number(it.price) || 0, src: { kind: 'part', id: it.id } });
        persist(); drawLines(); m.close();
      } }, 'Tilføj')] });
  };
  const addTime = () => {
    const rest = about(c).unbilled;
    if (!rest.length) { toast('Ingen ufakturerede timer tilbage'); return; }
    inv.lines.push(...linesFromEntries(rest, about(c).rate)); rest.forEach(e => { e.invoice = inv.id; });
    persist(); persistTs(); drawLines(); toast(`${rest.length} registrering${rest.length === 1 ? '' : 'er'} tilføjet`, { type: 'ok' });
  };
  const meta = (label, el) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);
  const date = h('input', { class: 'input', type: 'date', value: inv.date, disabled: locked }); date.addEventListener('change', () => { inv.date = date.value; persist(); });
  const due = h('input', { class: 'input', type: 'date', value: inv.due, disabled: locked }); due.addEventListener('change', () => { inv.due = due.value; persist(); });
  const vat = h('input', { class: 'input', type: 'number', min: 0, step: 1, value: inv.vat, disabled: locked }); vat.addEventListener('input', () => { inv.vat = Number(vat.value) || 0; paintTotals(); save(); });
  const note = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Fx “Tak for samarbejdet”', disabled: locked }); note.value = inv.note || ''; note.addEventListener('input', () => { inv.note = note.value; save(); });

  const pdf = async (btn) => {
    btn.disabled = true;
    try {
      const { invoicePdf } = await import('../features/invoicepdf.js');
      const blob = await invoicePdf(inv, st.company, c);
      await saveBlob(`Faktura ${invoiceNo(inv.no)} – ${c.name.replace(/[\\/:*?"<>|]/g, '')}.pdf`, blob);
    } catch (e) { toast('PDF kunne ikke laves', { type: 'bad', text: e.message }); }
    finally { btn.disabled = false; }
  };
  const setStatus = async (s) => {
    if (s === 'sent' && !inv.stockDone) {
      const parts = inv.lines.filter(l => l.src?.kind === 'part');
      for (const l of parts) { const it = (D.inv.items || []).find(x => x.id === l.src.id); if (it) { it.qty = Math.max(0, (it.qty || 0) - (Number(l.qty) || 0)); it.updated = Date.now(); } }
      if (parts.length) { persistInv(); toast(`${parts.length} del${parts.length === 1 ? '' : 'e'} trukket fra lageret`); }
      inv.stockDone = true;
    }
    inv.status = s; if (s === 'paid') inv.paidAt = isoDate();
    persist(); navigate(location.hash, { replace: true });
  };
  const del = async () => {
    if (!(await confirmDialog({ title: `Slet faktura ${invoiceNo(inv.no)}?`, text: 'Timerne bliver ufakturerede igen, så de kan komme med på en ny faktura.', confirmLabel: 'Slet', danger: true }))) return;
    inv.lines.forEach(unmark); st.invoices = st.invoices.filter(x => x !== inv); persist(); navigate(`/apps/customers/c/${c.id}`);
  };
  const companyMissing = !st.company?.name;
  const pdfBtn = h('button', { class: 'btn app-solid', onclick: () => pdf(pdfBtn) }, icon('download'), 'Hent PDF');
  drawLines();
  return h('div', { class: 'page customers-page', style: { '--app': app.hue } },
    appHero(app, { eyebrow: `Faktura · ${c.name}`, title: `Faktura ${invoiceNo(inv.no)}`, compact: true, back: { href: c.id ? `#/apps/customers/c/${c.id}` : '#/apps/customers', label: 'Tilbage til kunden' },
      stats: [{ icon: 'file', label: 'Status', value: invoiceState(inv).label }, { icon: 'calendar', label: 'Forfald', value: daDate(inv.due) }, { icon: 'sparkles', label: 'I alt inkl. moms', value: kr(totals(inv.lines, inv.vat).gross) }] }),
    companyMissing ? h('div', { class: 'callout' }, icon('info'), h('div', null, h('strong', null, 'Firmaoplysninger mangler. '), 'Navn, CVR og bankkonto skal stå på fakturaen.'), h('button', { class: 'btn btn-sm', onclick: () => companyDialog(() => navigate(location.hash, { replace: true })) }, 'Udfyld')) : null,
    h('section', { class: 'glass panel cu-invoice' },
      h('div', { class: 'cu-inv-meta' }, meta('Fakturadato', date), meta('Forfaldsdato', due), meta('Moms (%)', vat), h('div', { class: 'cu-inv-status' }, statusChip(inv))),
      h('div', { class: 'cu-table-wrap' }, h('table', { class: 'cu-table cu-lines' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Beskrivelse'), h('th', { scope: 'col' }, 'Antal'), h('th', { scope: 'col' }, 'Enhed'), h('th', { scope: 'col' }, 'Pris (kr.)'), h('th', { scope: 'col', class: 'num' }, 'Beløb'), h('th', null, h('span', { class: 'sr-only' }, 'Fjern')))),
        body)),
      locked ? null : h('div', { class: 'cu-add' },
        h('button', { class: 'btn btn-sm', onclick: () => { inv.lines.push({ text: '', qty: 1, unit: 'stk.', price: 0 }); persist(); drawLines(); body.lastElementChild?.querySelector('input')?.focus(); } }, icon('plus'), 'Linje'),
        h('button', { class: 'btn btn-sm', onclick: addPart }, icon('box'), 'Del fra lager'),
        h('button', { class: 'btn btn-sm', onclick: addTime }, icon('clock'), 'Ufakturerede timer')),
      h('div', { class: 'cu-inv-foot' }, meta('Note på fakturaen', note), sums)),
    h('div', { class: 'cu-actions' }, pdfBtn,
      inv.status === 'draft' ? h('button', { class: 'btn', onclick: () => setStatus('sent') }, icon('mail'), 'Markér som sendt') : null,
      inv.status === 'sent' ? h('button', { class: 'btn', onclick: () => setStatus('paid') }, icon('checkCircle'), 'Markér som betalt') : null,
      inv.status !== 'draft' ? h('button', { class: 'btn btn-ghost', onclick: () => setStatus('draft') }, icon('edit'), 'Tilbage til kladde') : null,
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn btn-ghost', onclick: del }, icon('trash'), 'Slet faktura')));
}

export default {
  title: 'Kunder',
  destroy() { flushState('customers'); flushState('timesheet'); flushState('inventory'); },
  async render(ctx) {
    const app = appById('customers');
    try { await loadAll(); }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Kunderne kunne ikke hentes', text: e.message })); }
    const { sub, id } = ctx.params || {};
    const gone = (t) => h('div', { class: 'page' }, stateBlock({ icon: 'alert', title: t, actions: [h('a', { class: 'btn', href: '#/apps/customers' }, 'Til Kunder')] }));
    if (sub === 'c') { const c = st.customers.find(x => x.id === id); return c ? customerPage(app, c) : gone('Kunden findes ikke'); }
    if (sub === 'invoice') { const inv = st.invoices.find(x => x.id === id); return inv ? invoicePage(app, inv) : gone('Fakturaen findes ikke'); }
    return overview(app);
  },
};

