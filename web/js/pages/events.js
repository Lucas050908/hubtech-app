/** Arrangementer – plan a party, a LAN, a class trip or a meeting: invite people, see who's coming, talk about it. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { getState, saveState, flushState } from '../core/services.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState, commentBox, pickImages } from '../features/shared.js';
import { rsvps, whenText, ics } from '../features/sharedlogic.js';

const PAGE = 'events';
const iso = (d) => `${d.date}T${d.start || '00:00'}`;
const endIso = (d) => (d.end ? `${d.endDate || d.date}T${d.end}` : null);
const dayText = (d) => { const x = new Date(`${d.date}T12:00`); return x.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: x.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }); };
const timeText = (d) => (d.start ? `kl. ${d.start.replace(':', '.')}${d.end ? `–${d.end.replace(':', '.')}` : ''}` : 'Hele dagen');
const ANSWERS = [['yes', 'Kommer', 'checkCircle'], ['maybe', 'Måske', 'help'], ['no', 'Kan ikke', 'x']];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function calendarBadge(d) {
  const x = new Date(`${d.date}T12:00`);
  return h('div', { class: 'ev-badge' }, h('small', null, x.toLocaleDateString('da-DK', { month: 'short' }).replace('.', '')), h('b', null, String(x.getDate())));
}
async function toMyCalendar(doc) {
  const st = (await getState('calendar', { force: true })) || {}; st.events ||= [];
  if (st.events.some(e => e.sharedId === doc.id)) return toast('Den ligger allerede i din kalender', { type: 'info' });
  st.events.push({ id: uid(), sharedId: doc.id, title: doc.title, date: doc.data.date, endDate: doc.data.endDate || null, allDay: !doc.data.start, start: doc.data.start || null, end: doc.data.end || null, location: doc.data.place || '', notes: doc.data.desc || '', color: '#f472b6', remind: 'h1' });
  saveState('calendar', st); flushState('calendar');
  toast('Lagt i din kalender', { type: 'ok', text: 'Du får en påmindelse en time før.' });
}
function downloadIcs(doc) {
  const blob = new Blob([ics({ title: doc.title, start: new Date(iso(doc.data)).toISOString(), end: endIso(doc.data) ? new Date(endIso(doc.data)).toISOString() : null, place: doc.data.place, desc: doc.data.desc, uid: doc.id })], { type: 'text/calendar' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${doc.title.replace(/[^\wæøåÆØÅ -]+/g, '') || 'arrangement'}.ics` });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export async function publicView(data, token) {
  const { doc, entries } = data, r = rsvps(entries);
  return h('div', { class: 'pub-card ev-pub' }, doc.data.cover ? h('img', { class: 'ev-cover', src: doc.data.cover, alt: '' }) : null,
    h('h1', null, doc.title), h('p', { class: 'muted' }, `${dayText(doc.data)} · ${timeText(doc.data)}${doc.data.place ? ` · ${doc.data.place}` : ''}`),
    doc.data.desc ? h('p', null, doc.data.desc) : null, h('p', { class: 'faint' }, `${r.guests} kommer`),
    h('div', { class: 'row-actions' }, h('a', { class: 'btn btn-primary', href: `#/login?next=${encodeURIComponent(`/p/${token}`)}` }, icon('user'), 'Log ind for at svare'), h('button', { class: 'btn', onclick: () => downloadIcs(doc) }, icon('calendar'), 'Gem i kalender')));
}

export default {
  title: 'Arrangementer',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('events');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1', view = 'coming';

    async function list() {
      self._off?.(); self._off = onShared('event', () => { if (document.body.contains(root)) list(); });
      let docs;
      try { docs = await sh.list('event'); } catch (e) { h(clear(root), null, loadError('Arrangementer', e)); return; }
      const now = new Date();
      const past = (d) => new Date(endIso(d.data) || `${d.data.date}T23:59`) < now;
      const shown = docs.filter(d => (view === 'coming' ? !past(d) : view === 'past' ? past(d) : d.role === 'owner'))
        .sort((a, b) => (view === 'past' ? -1 : 1) * iso(a.data).localeCompare(iso(b.data)));
      const card = (d) => {
        const ans = d.mine.rsvp?.[0]?.answer;
        return h('a', { class: 'sh-card ev-card', href: `#/apps/${PAGE}/d/${d.id}` }, calendarBadge(d.data),
          h('div', { class: 'ev-card-b' },
            h('div', { class: 'sh-card-h' }, h('b', null, d.title), ans ? h('span', { class: ['chip', ans === 'yes' && 'chip-ok', ans === 'no' && 'chip-bad'] }, ANSWERS.find(a => a[0] === ans)[1]) : h('span', { class: 'chip chip-info' }, 'Svar')),
            h('div', { class: 'sh-meta' }, h('span', null, icon('clock'), ` ${whenText(iso(d.data), endIso(d.data))} · ${timeText(d.data)}`), d.data.place ? h('span', null, icon('mapPin'), ` ${d.data.place}`) : null,
              h('span', null, icon('users'), ` ${d.counts.rsvp || 0} har svaret`), person(d.owner))));
      };
      const seg = segmented([{ value: 'coming', label: 'Kommende' }, { value: 'past', label: 'Har været' }, { value: 'mine', label: 'Mine' }], view, (v) => { view = v; list(); }, { label: 'Vis' });
      h(clear(root), null, h('div', { class: 'sh-top' }, seg, h('button', { class: 'btn btn-primary', style: { marginLeft: 'auto' }, onclick: () => editor(null) }, icon('plus'), 'Nyt arrangement')),
        shown.length ? h('div', { class: 'sh-list' }, shown.map(card)) : emptyState('calendar', view === 'past' ? 'Ingen tidligere arrangementer' : 'Ingen arrangementer på vej', 'Lav en fest, en LAN-aften, en klassetur eller et møde – og invitér dem, der skal med.', h('button', { class: 'btn btn-primary', onclick: () => editor(null) }, icon('plus'), 'Nyt arrangement')));
    }

    function editor(doc) {
      const d = doc ? { ...doc.data } : { date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), start: '18:00', end: '22:00', place: '', desc: '', capacity: 0, cover: '', allowPlus: true };
      const title = h('input', { class: 'input', value: doc?.title || '', maxlength: 120, placeholder: 'Fx Fødselsdagsfest, LAN-aften, Klassetur', 'aria-label': 'Navn' });
      const date = h('input', { class: 'input', type: 'date', value: d.date, 'aria-label': 'Dato' });
      const start = h('input', { class: 'input', type: 'time', value: d.start || '', 'aria-label': 'Starter' });
      const end = h('input', { class: 'input', type: 'time', value: d.end || '', 'aria-label': 'Slutter' });
      const place = h('input', { class: 'input', value: d.place || '', maxlength: 160, placeholder: 'Adresse eller sted', 'aria-label': 'Sted' });
      const desc = h('textarea', { class: 'textarea', rows: 4, maxlength: 3000, placeholder: 'Hvad skal der ske? Hvad skal man have med?', 'aria-label': 'Beskrivelse' }); desc.value = d.desc || '';
      const cap = h('input', { class: 'input', type: 'number', min: 0, max: 10000, value: d.capacity || '', placeholder: 'Ingen grænse', 'aria-label': 'Antal pladser', style: { width: '140px' } });
      const plus = h('input', { type: 'checkbox', checked: d.allowPlus !== false });
      const coverBox = h('div', { class: 'ev-cover-pick' });
      const drawCover = () => h(clear(coverBox), null, d.cover ? h('img', { src: d.cover, alt: 'Forsidebillede' }) : null,
        h('button', { class: 'btn btn-sm', onclick: async () => { const [u] = await pickImages({ multiple: false }); if (u) { d.cover = u; drawCover(); } } }, icon('image'), d.cover ? 'Skift billede' : 'Tilføj forsidebillede'),
        d.cover ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { d.cover = ''; drawCover(); } }, 'Fjern') : null);
      drawCover();
      const err = h('div', { class: 'field-error' });
      const f = (label, el) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);
      h(clear(root), null, panel(doc ? 'Ret arrangement' : 'Nyt arrangement', 'calendar',
        f('Navn', title), h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, f('Dato', date), f('Starter', start), f('Slutter', end)),
        f('Sted', place), f('Beskrivelse', desc), coverBox,
        h('div', { class: 'row', style: { gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' } }, f('Antal pladser', cap), h('label', { class: 'cal-pcheck' }, plus, h('span', null, 'Man må tage gæster med'))),
        err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (doc ? detail(doc.id) : list()) }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: async () => {
            if (!title.value.trim()) { err.textContent = 'Giv arrangementet et navn.'; return; }
            if (!date.value) { err.textContent = 'Vælg en dato.'; return; }
            const data = { ...d, date: date.value, start: start.value || null, end: end.value || null, place: place.value.trim(), desc: desc.value.trim(), capacity: Number(cap.value) || 0, allowPlus: plus.checked };
            try {
              if (doc) { await sh.update(doc.id, { title: title.value.trim(), data }); detail(doc.id); }
              else { const n = await sh.create('event', { title: title.value.trim(), data, visibility: 'private' }); location.hash = `#/apps/${PAGE}/d/${n.id}?share=1`; }
            } catch (e) { err.textContent = e.message; }
          } }, icon('check'), doc ? 'Gem' : 'Opret og invitér'))));
      title.focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Arrangementet findes ikke', 'Det er måske aflyst, eller du er ikke inviteret.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle arrangementer'))); return; }
      }
      const { doc, entries } = res, d = doc.data, r = rsvps(entries), owner = ['owner', 'editor'].includes(doc.role);
      self._off?.(); self._off = onShared('event', (ev) => { if (ev.what === 'gone') { toast('Arrangementet er aflyst', { type: 'info' }); location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root)) detail(id); }, id);
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: 'Invitér', publicOk: true, publicText: 'Alle med linket kan se arrangementet (men skal logge ind for at svare).', editorsOk: true })) detail(id); }, 50); }
      const mine = entries.find(e => e.kind === 'rsvp' && e.mine);
      const full = d.capacity && r.guests >= d.capacity;
      const answer = async (a, plus = mine?.data.plus || 0) => { try { await sh.add(doc.id, 'rsvp', { answer: a, plus }); detail(id); if (a === 'yes') toast('Fedt – du er tilmeldt', { type: 'ok', action: { label: 'Læg i kalender', onClick: () => toMyCalendar(doc) } }); } catch (e) { toast('Kunne ikke svare', { type: 'bad', text: e.message }); } };
      const plusSel = d.allowPlus !== false && mine?.data.answer === 'yes' ? h('select', { class: 'select', 'aria-label': 'Gæster med', style: { width: 'auto' } }, [0, 1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: n === (mine.data.plus || 0) }, n ? `+ ${n} gæst${n > 1 ? 'er' : ''}` : 'Ingen gæster'))) : null;
      plusSel?.addEventListener('change', () => answer('yes', Number(plusSel.value)));
      const group = (key, label) => r[key].length ? h('div', { class: 'ev-group' }, h('span', { class: 'field-label' }, `${label} (${r[key].length})`), h('div', { class: 'ev-people' }, r[key].map(e => person(e.user, e.data.plus ? h('small', { class: 'faint' }, ` +${e.data.plus}`) : null)))) : null;
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title), visChip(doc),
          owner ? [h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: 'Invitér', publicOk: true, publicText: 'Alle med linket kan se arrangementet (men skal logge ind for at svare).', editorsOk: true })) detail(id); } }, icon('userPlus'), 'Invitér'),
            h('button', { class: 'btn btn-sm', onclick: () => editor(doc) }, icon('edit'), 'Ret'),
            doc.role === 'owner' ? h('button', { class: 'icon-btn', 'aria-label': 'Aflys', title: 'Aflys og slet', onclick: async () => { if (await confirmDialog({ title: 'Aflys arrangementet?', text: 'Det slettes for alle.', confirmLabel: 'Aflys', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null] : null),
        d.cover ? h('img', { class: 'ev-cover', src: d.cover, alt: '' }) : null,
        h('div', { class: 'ev-wrap' },
          h('div', { class: 'stack' },
            panel(null, null, h('div', { class: 'ev-facts' }, calendarBadge(d),
              h('div', null, h('b', null, dayText(d)), h('span', { class: 'faint' }, `${timeText(d)} · ${whenText(iso(d), endIso(d))}`),
                d.place ? h('a', { href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(d.place)}`, target: '_blank', rel: 'noopener' }, icon('mapPin'), ` ${d.place}`) : null)),
              d.desc ? h('p', { class: 'ev-desc' }, d.desc) : null,
              h('div', { class: 'sh-meta' }, h('span', null, 'Arrangeret af'), person(doc.owner))),
            panel('Snak om det', 'chat', commentBox(doc, entries, { onChange: () => detail(id) }))),
          h('div', { class: 'stack' },
            panel('Kommer du?', 'users', h('div', { class: 'ev-answers' }, ANSWERS.map(([a, l, ic]) => h('button', { class: ['btn', mine?.data.answer === a && 'btn-primary'], disabled: a === 'yes' && full && mine?.data.answer !== 'yes', onclick: () => answer(a) }, icon(ic), l))),
              plusSel, full ? h('p', { class: 'faint' }, 'Alle pladser er taget.') : d.capacity ? h('p', { class: 'faint' }, `${d.capacity - r.guests} pladser tilbage`) : null,
              h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm btn-ghost', onclick: () => toMyCalendar(doc) }, icon('calendar'), 'Læg i min kalender'), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => downloadIcs(doc) }, icon('download'), '.ics'))),
            panel(`${r.guests} kommer`, 'checkCircle', group('yes', 'Kommer'), group('maybe', 'Måske'), group('no', 'Kan ikke'),
              !entries.some(e => e.kind === 'rsvp') ? h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen har svaret endnu.') : null))));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id);
    else list();
    return h('div', { class: 'page ev-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Arrangementer', lead: 'Lav en fest, en LAN-aften eller en klassetur. Invitér folk, se hvem der kommer, og snak om det.', compact: true }), root);
  },
};
