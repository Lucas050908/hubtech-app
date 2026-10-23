/**
 * Booking – a page where others book a time with you: tutoring, a haircut, a repair, a meeting with the teacher.
 * You set the days and hours; they pick a free time on your link – no account needed – and you get notified.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError, copy } from '../features/appkit.js';
import { sh, onShared, ago, emptyState, pubUrl, shareDialog } from '../features/shared.js';
import { ics } from '../features/sharedlogic.js';

const PAGE = 'booking';
const WD = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];      // Monday = 0, like the server
const dayLong = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
const addMin = (t, m) => { const [a, b] = t.split(':').map(Number), x = a * 60 + b + m; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const icsFor = (doc, b) => ics({ title: doc.title, start: new Date(`${b.date}T${b.time}`).toISOString(), end: new Date(`${b.date}T${addMin(b.time, doc.data.length || 30)}`).toISOString(), place: doc.data.place || '', desc: b.note || '', uid: `${doc.id}-${b.date}-${b.time}` });
const download = (name, text) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/calendar' })), download: name }); document.body.append(a); a.click(); setTimeout(() => a.remove(), 1000); };

/** the booking flow: day → time → your details → done (used on the public link) */
function bookFlow(doc, days, taken, { onBook }) {
  const box = h('div', { class: 'bk2-flow' });
  const isTaken = (date, time) => taken.some(t => t.data.date === date && t.data.time === time);
  let day = days.find(d => d.times.some(t => !isTaken(d.date, t)))?.date || null, time = null;
  const draw = () => {
    const cur = days.find(d => d.date === day);
    h(clear(box), null,
      h('span', { class: 'field-label' }, '1. Vælg en dag'),
      days.length ? h('div', { class: 'bk2-days', role: 'listbox', 'aria-label': 'Dage' }, days.map(d => {
        const free = d.times.filter(t => !isTaken(d.date, t)).length, x = new Date(`${d.date}T12:00`);
        return h('button', { class: ['bk2-day', d.date === day && 'is-on'], disabled: !free, 'aria-selected': String(d.date === day), onclick: () => { day = d.date; time = null; draw(); } },
          h('small', null, x.toLocaleDateString('da-DK', { weekday: 'short' }).replace('.', '')), h('b', null, String(x.getDate())), h('small', null, x.toLocaleDateString('da-DK', { month: 'short' }).replace('.', '')),
          h('span', { class: 'bk2-free' }, free ? `${free} ledige` : 'Fuldt'));
      })) : h('p', { class: 'muted' }, 'Der er ingen ledige tider lige nu.'),
      cur ? [h('span', { class: 'field-label' }, `2. Vælg en tid – ${dayLong(cur.date)}`),
        h('div', { class: 'bk2-times' }, cur.times.map(t => h('button', { class: ['bk2-time', t === time && 'is-on'], disabled: isTaken(cur.date, t), onclick: () => { time = t; draw(); box.querySelector('.bk2-form input')?.focus(); } }, t)))] : null,
      time ? form() : null);
  };
  const form = () => {
    const name = h('input', { class: 'input', maxlength: 60, placeholder: 'Dit navn', 'aria-label': 'Dit navn', autocomplete: 'name' });
    const email = h('input', { class: 'input', type: 'email', maxlength: 120, placeholder: 'navn@eksempel.dk', 'aria-label': 'E-mail', autocomplete: 'email' });
    const phone = doc.data.askPhone ? h('input', { class: 'input', type: 'tel', maxlength: 20, placeholder: 'Telefon', 'aria-label': 'Telefon', autocomplete: 'tel' }) : null;
    const note = h('textarea', { class: 'textarea', rows: 2, maxlength: 600, placeholder: doc.data.notePrompt || 'Er der noget, jeg skal vide? (valgfrit)', 'aria-label': 'Besked' });
    const err = h('div', { class: 'field-error' });
    const btn = h('button', { class: 'btn btn-primary btn-lg', onclick: async () => {
      if (!name.value.trim()) { err.textContent = 'Skriv dit navn.'; name.focus(); return; }
      if (email.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) { err.textContent = 'Skriv en gyldig e-mail.'; return; }
      if (phone && !phone.value.trim()) { err.textContent = 'Skriv dit telefonnummer.'; return; }
      btn.disabled = true;
      const b = { date: day, time, name: name.value.trim(), email: email.value.trim(), phone: phone?.value.trim() || '', note: note.value.trim() };
      try { await onBook(b); done(b); }
      catch (e) { err.textContent = e.message; btn.disabled = false; if (e.code === 'taken') { taken.push({ data: { date: day, time } }); time = null; setTimeout(draw, 1200); } }
    } }, icon('check'), `Book ${time}`);
    return h('div', { class: 'bk2-form stack' }, h('span', { class: 'field-label' }, '3. Dine oplysninger'),
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, name, email, phone), note, err, h('div', { class: 'row-actions' }, btn));
  };
  const done = (b) => h(clear(box), null, h('div', { class: 'pub-done' }, icon('checkCircle'), h('h2', null, 'Du er booket!'),
    h('p', null, h('b', null, `${dayLong(b.date)} kl. ${b.time}`), doc.data.place ? ` · ${doc.data.place}` : ''),
    doc.data.confirm ? h('p', { class: 'muted' }, doc.data.confirm) : null,
    h('button', { class: 'btn', onclick: () => download(`${doc.title}.ics`, icsFor(doc, b)) }, icon('calendar'), 'Læg i min kalender')));
  draw();
  return box;
}

export async function publicView(data, token) {
  const { doc, entries, days = [] } = data;
  const card = h('div', { class: 'pub-card bk2-pub' },
    h('div', { class: 'bk2-head' }, h('span', { class: 'bk2-ic' }, icon('calendar')), h('div', null, h('h1', null, doc.title),
      h('div', { class: 'sh-meta' }, doc.owner?.name ? h('span', null, doc.owner.name) : null, h('span', null, icon('clock'), ` ${doc.data.length || 30} min.`), doc.data.place ? h('span', null, icon('mapPin'), ` ${doc.data.place}`) : null, doc.data.price ? h('span', null, doc.data.price) : null))),
    doc.data.desc ? h('p', { class: 'muted bk2-desc' }, doc.data.desc) : null,
    doc.data.closed ? h('p', { class: 'muted' }, 'Der er lukket for booking lige nu.') : bookFlow(doc, days, entries.filter(e => e.kind === 'booking'), { onBook: (b) => sh.pubAdd(token, 'booking', b) }));
  return card;
}

export default {
  title: 'Booking',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('booking');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');

    async function list() {
      self._off?.(); self._off = onShared('booking', () => { if (document.body.contains(root)) list(); });
      let docs;
      try { docs = (await sh.list('booking', true)); } catch (e) { h(clear(root), null, loadError('Booking', e)); return; }
      const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'sh-card-h' }, h('b', null, d.title), d.data.closed ? h('span', { class: 'chip' }, 'Lukket') : h('span', { class: 'chip chip-ok' }, icon('link'), 'Åben')),
        h('div', { class: 'sh-meta' }, h('span', null, icon('clock'), ` ${d.data.length || 30} min.`), h('span', null, `${(d.data.weekdays || [0, 1, 2, 3, 4]).map(i => WD[i]).join(', ')} · ${d.data.from || '09:00'}–${d.data.to || '16:00'}`), h('span', null, icon('calendar'), ` ${d.counts.booking || 0} bookinger`)));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary', onclick: () => editor(null) }, icon('plus'), 'Ny bookingside')),
        docs.length ? h('div', { class: 'sh-list' }, docs.map(card)) : emptyState('calendar', 'Ingen bookingsider endnu', 'Lav en side, hvor andre kan booke en tid hos dig: lektiehjælp, frisør, computerhjælp, forældresamtaler … Du vælger dage og tider – de vælger en ledig tid via et link.', h('button', { class: 'btn btn-primary', onclick: () => editor(null) }, icon('plus'), 'Lav den første')));
    }

    function editor(doc) {
      const d = { length: 30, gap: 0, from: '09:00', to: '16:00', weekdays: [0, 1, 2, 3, 4], daysAhead: 21, closedDays: [], ...(doc?.data || {}) };
      const f = (l, el, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, l), el, hint ? h('span', { class: 'faint', style: { fontSize: '12px' } }, hint) : null);
      const title = h('input', { class: 'input', maxlength: 100, value: doc?.title || '', placeholder: 'Fx Lektiehjælp i matematik', 'aria-label': 'Navn' });
      const desc = h('textarea', { class: 'textarea', rows: 2, maxlength: 1000, placeholder: 'Hvad kan man booke? Hvad skal man have med?', 'aria-label': 'Beskrivelse' }); desc.value = d.desc || '';
      const place = h('input', { class: 'input', maxlength: 120, value: d.place || '', placeholder: 'Adresse, lokale eller “Online”', 'aria-label': 'Sted' });
      const price = h('input', { class: 'input', maxlength: 40, value: d.price || '', placeholder: 'Fx Gratis eller 100 kr.', 'aria-label': 'Pris' });
      const length = h('select', { class: 'select', 'aria-label': 'Varighed' }, [10, 15, 20, 30, 45, 60, 90, 120].map(m => h('option', { value: m, selected: m === Number(d.length) }, `${m} min.`)));
      const gap = h('select', { class: 'select', 'aria-label': 'Pause mellem tider' }, [0, 5, 10, 15, 30].map(m => h('option', { value: m, selected: m === Number(d.gap) }, m ? `${m} min.` : 'Ingen')));
      const from = h('input', { class: 'input', type: 'time', value: d.from, 'aria-label': 'Fra kl.' });
      const to = h('input', { class: 'input', type: 'time', value: d.to, 'aria-label': 'Til kl.' });
      const ahead = h('input', { class: 'input', type: 'number', min: 1, max: 365, value: d.daysAhead, 'aria-label': 'Dage frem', style: { width: '100px' } });
      const askPhone = h('input', { type: 'checkbox', checked: !!d.askPhone });
      const confirm = h('input', { class: 'input', maxlength: 300, value: d.confirm || '', placeholder: 'Fx Husk at tage din bog med!', 'aria-label': 'Besked efter booking' });
      const wds = new Set(d.weekdays);
      const wdBox = h('div', { class: 'bk2-wd' });
      const drawWd = () => h(clear(wdBox), null, WD.map((n, i) => h('button', { class: ['sh-tag', wds.has(i) && 'is-on'], 'aria-pressed': String(wds.has(i)), onclick: () => { wds.has(i) ? wds.delete(i) : wds.add(i); drawWd(); } }, n)));
      drawWd();
      const closed = [...(d.closedDays || [])];
      const cBox = h('div', { class: 'wl-tags' }), cIn = h('input', { class: 'input', type: 'date', 'aria-label': 'Lukket dag', style: { width: 'auto' } });
      const drawC = () => h(clear(cBox), null, closed.sort().map((c, i) => h('span', { class: 'chip' }, new Date(`${c}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern', onclick: () => { closed.splice(i, 1); drawC(); } }, icon('x')))));
      drawC();
      const err = h('div', { class: 'field-error' });
      h(clear(root), null, panel(doc ? 'Ret bookingside' : 'Ny bookingside', 'calendar', h('div', { class: 'stack' },
        f('Navn', title), desc, h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, h('div', { style: { flex: 2, minWidth: '200px' } }, f('Sted', place)), h('div', { style: { flex: 1, minWidth: '140px' } }, f('Pris (valgfrit)', price))),
        h('span', { class: 'field-label' }, 'Hvilke dage?'), wdBox,
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, f('Fra kl.', from), f('Til kl.', to), f('Varighed', length), f('Pause imellem', gap), f('Hvor langt frem', ahead, 'dage')),
        h('div', null, h('span', { class: 'field-label' }, 'Lukkede dage (ferie, fridage)'), h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } }, cIn, h('button', { class: 'btn btn-sm', onclick: () => { if (cIn.value && !closed.includes(cIn.value)) { closed.push(cIn.value); drawC(); } } }, icon('plus'), 'Tilføj')), cBox),
        h('label', { class: 'cal-pcheck' }, askPhone, h('span', null, 'Spørg efter telefonnummer')),
        f('Besked efter booking (valgfrit)', confirm), err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (doc ? detail(doc.id) : list()) }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: async () => {
          if (!title.value.trim()) { err.textContent = 'Giv siden et navn.'; return; }
          if (!wds.size) { err.textContent = 'Vælg mindst én dag.'; return; }
          if (from.value >= to.value) { err.textContent = '“Til kl.” skal være efter “Fra kl.”.'; return; }
          const data = { ...d, desc: desc.value.trim(), place: place.value.trim(), price: price.value.trim(), length: Number(length.value), gap: Number(gap.value), from: from.value, to: to.value, weekdays: [...wds].sort(), daysAhead: Math.max(1, Math.min(365, Number(ahead.value) || 21)), closedDays: closed, askPhone: askPhone.checked, confirm: confirm.value.trim() };
          try {
            if (doc) { await sh.update(doc.id, { title: title.value.trim(), data }); detail(doc.id); }
            else { const n = await sh.create('booking', { title: title.value.trim(), data, visibility: 'private', public: true }); location.hash = `#/apps/${PAGE}/d/${n.id}`; }
          } catch (e) { err.textContent = e.message; }
        } }, icon('check'), doc ? 'Gem' : 'Opret siden')))));
      title.focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id); } catch { h(clear(root), null, emptyState('alert', 'Siden findes ikke', '', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle bookingsider'))); return; }
      const { doc, entries } = res;
      if (!['owner', 'editor'].includes(doc.role)) { location.hash = `#/p/${qs.get('t') || ''}`; return; }
      self._off?.(); self._off = onShared('booking', () => { if (document.body.contains(root)) detail(id); }, id);
      const today = new Date().toISOString().slice(0, 10);
      const all = entries.filter(e => e.kind === 'booking').sort((a, b) => `${a.data.date} ${a.data.time}`.localeCompare(`${b.data.date} ${b.data.time}`));
      let tab = 'next';
      const body = h('div');
      const row = (b) => h('div', { class: 'bk2-row' },
        h('span', { class: 'bk2-t' }, b.data.time), h('div', { class: 'bk2-row-b' }, h('b', null, b.data.name || b.guest || b.user?.name || 'Ukendt'),
          h('span', { class: 'faint' }, [b.data.email, b.data.phone].filter(Boolean).join(' · ') || `booket ${ago(b.at)}`), b.data.note ? h('span', { class: 'bk2-note' }, `“${b.data.note}”`) : null),
        h('div', { class: 'row', style: { gap: '2px' } },
          b.data.email ? h('a', { class: 'icon-btn btn-sm', href: `mailto:${b.data.email}?subject=${encodeURIComponent(doc.title)}`, 'aria-label': 'Skriv en mail' }, icon('mail')) : null,
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Hent til kalender', onclick: () => download(`${doc.title}.ics`, icsFor(doc, b.data)) }, icon('calendar')),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Aflys tiden', onclick: async () => { if (await confirmDialog({ title: 'Aflys tiden?', text: `${b.data.name} – ${dayLong(b.data.date)} kl. ${b.data.time}. Husk at give besked.`, confirmLabel: 'Aflys', danger: true })) { await sh.remove(b.id); detail(id); } } }, icon('x'))));
      const draw = () => {
        const shown = tab === 'next' ? all.filter(b => b.data.date >= today) : all.filter(b => b.data.date < today).reverse();
        const groups = [];
        for (const b of shown) { const g = groups.at(-1); if (g?.date === b.data.date) g.items.push(b); else groups.push({ date: b.data.date, items: [b] }); }
        h(clear(body), null, groups.length ? groups.map(g => h('div', { class: 'ex-day' }, h('span', { class: 'field-label' }, g.date === today ? `I dag – ${dayLong(g.date)}` : dayLong(g.date)), g.items.map(row)))
          : emptyState('calendar', tab === 'next' ? 'Ingen bookinger endnu' : 'Ingen tidligere bookinger', tab === 'next' ? 'Del linket – så kommer bookingerne her.' : ''));
      };
      draw();
      const url = pubUrl(doc);
      const todayN = all.filter(b => b.data.date === today).length, nextN = all.filter(b => b.data.date >= today).length;
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title),
          h('button', { class: 'btn btn-sm', onclick: () => editor(doc) }, icon('edit'), 'Indstillinger'),
          h('button', { class: 'btn btn-sm', onclick: async () => { await sh.update(doc.id, { data: { ...doc.data, closed: !doc.data.closed } }); detail(id); } }, icon(doc.data.closed ? 'unlock' : 'lock'), doc.data.closed ? 'Åbn for booking' : 'Luk for booking'),
          h('button', { class: 'icon-btn', 'aria-label': 'Slet siden', onclick: async () => { if (await confirmDialog({ title: 'Slet bookingsiden og alle bookinger?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash'))),
        h('div', { class: 'fm-sumbar' }, h('div', null, h('b', null, String(todayN)), h('span', { class: 'faint' }, 'i dag')), h('div', null, h('b', null, String(nextN)), h('span', { class: 'faint' }, 'kommende')),
          doc.public ? h('div', { class: 'fm-linkbox' }, icon('link'), h('span', { class: 'fm-url' }, url), h('button', { class: 'btn btn-sm', onclick: () => copy(url, 'Linket er kopieret') }, icon('copy'), 'Kopiér'), h('a', { class: 'btn btn-sm btn-ghost', href: url, target: '_blank', rel: 'noopener' }, icon('external'), 'Se siden'))
            : h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: 'Link til bookingsiden', publicOk: true, publicText: 'Alle med linket kan booke en tid – også uden en konto.' })) detail(id); } }, icon('link'), 'Slå linket til')),
        h('div', { class: 'cmd-filters', style: { margin: '12px 0' } }, [['next', 'Kommende'], ['past', 'Tidligere']].map(([v, l]) => h('button', { class: ['btn btn-sm', tab === v && 'btn-primary'], onclick: (e) => { tab = v; e.currentTarget.parentNode.querySelectorAll('.btn').forEach(x => x.classList.toggle('btn-primary', x === e.currentTarget)); draw(); } }, l))),
        panel(null, null, body));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page bk2-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Del ud', title: 'Booking', lead: 'Lad andre booke en tid hos dig – lektiehjælp, frisør, computerhjælp eller samtaler. Du vælger dage og tider, de vælger via et link.', compact: true }), root);
  },
};
