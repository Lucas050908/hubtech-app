/**
 * Skoleskema – your timetable with "now and next", A/B weeks, homework per subject and a printable week.
 * Personal (saved on your account); a class can share one by sending a code.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, modal, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid, copy } from '../features/appkit.js';
import { nowNext, dayLessons, weekLetter, isoWeek, todayIso, addDays } from '../features/sharedlogic.js';

const DAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag'];
const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#f87171', '#a3e635', '#e879f9', '#94a3b8'];
const DEFAULT_SLOTS = [['08:00', '08:45'], ['08:45', '09:30'], ['09:50', '10:35'], ['10:35', '11:20'], ['12:00', '12:45'], ['12:45', '13:30'], ['13:40', '14:25']].map(([from, to]) => ({ from, to }));
const SUBJECTS = ['Dansk', 'Matematik', 'Engelsk', 'Tysk', 'Fransk', 'Historie', 'Kristendom', 'Samfundsfag', 'Fysik/kemi', 'Biologi', 'Geografi', 'Idræt', 'Musik', 'Billedkunst', 'Håndværk og design', 'Madkundskab', 'Valgfag', 'Klassens tid'];
const emptyWeek = (n) => Array.from({ length: 5 }, () => Array.from({ length: n }, () => null));
const colorOf = (st, subject) => st.colors[subject] || (st.colors[subject] = COLORS[Object.keys(st.colors).length % COLORS.length]);

/** the schedule as a short code a classmate can paste in */
const encode = (st) => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, slots: st.slots, weeks: st.weeks, abWeeks: st.abWeeks, aParity: st.aParity, colors: st.colors }))));
const decode = (code) => { const o = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!o || o.v !== 1 || !Array.isArray(o.slots)) throw new Error('Koden virker ikke'); return o; };

export default {
  title: 'Skoleskema',
  destroy() { clearInterval(this._tick); },
  async render() {
    const app = appById('schedule');
    let store;
    try { store = await appState('schedule', { slots: DEFAULT_SLOTS, weeks: { A: emptyWeek(7), B: emptyWeek(7) }, abWeeks: false, aParity: 1, colors: {}, homework: [] }); }
    catch (e) { return loadError('Skoleskema', e); }
    const st = store.data, self = this;
    const save = () => store.save();
    let wk = weekLetter(new Date(), st.abWeeks, st.aParity) || 'A', editing = false;
    const fix = () => { for (const k of ['A', 'B']) { st.weeks[k] ||= emptyWeek(st.slots.length); for (const d of st.weeks[k]) { while (d.length < st.slots.length) d.push(null); d.length = st.slots.length; } } };
    fix();
    const nowBox = h('div', { class: 'sk-now' }), grid = h('div', { class: 'sk-gridwrap' }), hwBox = h('div');

    function drawNow() {
      const nn = nowNext(st), todays = dayLessons(st, new Date());
      const card = (label, x, sub) => h('div', { class: 'sk-nowcard', style: { '--c': colorOf(st, x.lesson.subject) } }, h('small', null, label), h('b', null, x.lesson.subject), h('span', { class: 'faint' }, [x.lesson.room && `Lokale ${x.lesson.room}`, x.lesson.teacher].filter(Boolean).join(' · ') || `${x.slot.from}–${x.slot.to}`), sub ? h('span', { class: 'sk-sub' }, sub) : null);
      const hwToday = st.homework.filter(x => !x.done && x.due === todayIso());
      h(clear(nowBox), null,
        nn.now ? card('Nu', nn.now, `${nn.minsLeft} min. tilbage`) : null,
        nn.next ? card(nn.now ? 'Bagefter' : 'Næste', nn.next, `om ${nn.minsTo < 60 ? `${nn.minsTo} min.` : `${Math.floor(nn.minsTo / 60)} t. ${nn.minsTo % 60} min.`}`) : null,
        !nn.now && !nn.next ? h('div', { class: 'sk-nowcard sk-free' }, h('small', null, 'I dag'), h('b', null, todays.length ? 'Fri for i dag 🎉' : [0, 6].includes(new Date().getDay()) ? 'Weekend 🎉' : 'Ingen timer'), h('span', { class: 'faint' }, nn.done ? `${todays.length} timer klaret` : '')) : null,
        h('div', { class: 'sk-nowcard sk-hw' }, h('small', null, 'Lektier til i dag'), h('b', null, String(hwToday.length)), h('span', { class: 'faint' }, hwToday.map(x => x.subject).join(', ') || 'Ingen')));
    }

    function editLesson(d, i) {
      const cur = st.weeks[wk][d][i] || {};
      const subj = h('input', { class: 'input', value: cur.subject || '', list: 'sk-subjects', maxlength: 40, placeholder: 'Fag', 'aria-label': 'Fag' });
      const room = h('input', { class: 'input', value: cur.room || '', maxlength: 20, placeholder: 'Fx 12', 'aria-label': 'Lokale' });
      const teacher = h('input', { class: 'input', value: cur.teacher || '', maxlength: 40, placeholder: 'Fx Lone', 'aria-label': 'Lærer' });
      const known = [...new Set([...SUBJECTS, ...Object.keys(st.colors)])];
      const m = modal({ title: `${DAYS[d]} · ${st.slots[i].from}–${st.slots[i].to}`, label: st.abWeeks ? `${wk}-uge` : 'Skoleskema', size: 440,
        body: h('div', { class: 'stack', style: { gap: '10px' } }, h('datalist', { id: 'sk-subjects' }, known.map(s => h('option', { value: s }))),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fag'), subj),
          h('div', { class: 'wl-tags' }, known.slice(0, 12).map(s => h('button', { class: 'sh-tag', onclick: () => { subj.value = s; } }, s))),
          h('div', { class: 'row', style: { gap: '10px' } }, h('label', { class: 'field', style: { flex: 1 } }, h('span', { class: 'field-label' }, 'Lokale'), room), h('label', { class: 'field', style: { flex: 2 } }, h('span', { class: 'field-label' }, 'Lærer'), teacher))),
        actions: [cur.subject ? h('button', { class: 'btn btn-ghost', onclick: () => { st.weeks[wk][d][i] = null; save(); m.close(); draw(); } }, icon('trash'), 'Ryd') : null,
          h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: () => { const s = subj.value.trim(); st.weeks[wk][d][i] = s ? { subject: s, room: room.value.trim(), teacher: teacher.value.trim() } : null; if (s) colorOf(st, s); save(); m.close(); draw(); } }, icon('check'), 'Gem')].filter(Boolean) });
      subj.focus();
    }

    function drawGrid() {
      const today = (new Date().getDay() + 6) % 7, thisWk = (weekLetter(new Date(), st.abWeeks, st.aParity) || 'A') === wk;
      const nn = nowNext(st);
      h(clear(grid), null, h('div', { class: 'sk-grid', style: { gridTemplateColumns: `78px repeat(5, minmax(0, 1fr))` } },
        h('div', { class: 'sk-corner' }), DAYS.map((n, d) => h('div', { class: ['sk-day', thisWk && d === today && 'is-today'] }, h('span', { class: 'sk-dlong' }, n), h('span', { class: 'sk-dshort' }, n.slice(0, 3)))),
        st.slots.map((s, i) => [
          h('div', { class: 'sk-time' }, editing ? [h('input', { class: 'input sk-tin', type: 'time', value: s.from, 'aria-label': `Time ${i + 1} start`, onchange: (e) => { s.from = e.target.value; save(); } }), h('input', { class: 'input sk-tin', type: 'time', value: s.to, 'aria-label': `Time ${i + 1} slut`, onchange: (e) => { s.to = e.target.value; save(); } })]
            : [h('b', null, `${i + 1}.`), h('small', null, `${s.from}–${s.to}`)]),
          DAYS.map((_, d) => {
            const l = st.weeks[wk][d][i], isNow = thisWk && d === today && nn.now?.i === i;
            const hw = l ? st.homework.filter(x => !x.done && x.subject === l.subject).length : 0;
            return h('button', { class: ['sk-cell', l && 'has', isNow && 'is-now'], style: l ? { '--c': colorOf(st, l.subject) } : null, 'aria-label': l ? `${DAYS[d]} ${i + 1}. time: ${l.subject}` : `${DAYS[d]} ${i + 1}. time: tom`, onclick: () => editLesson(d, i) },
              l ? [h('b', null, l.subject), h('small', null, [l.room, l.teacher].filter(Boolean).join(' · ')), hw ? h('span', { class: 'sk-hwdot', title: `${hw} lektier` }, String(hw)) : null] : h('span', { class: 'sk-plus' }, '+'));
          })]),
      ), editing ? h('div', { class: 'row', style: { gap: '6px', marginTop: '8px' } },
        h('button', { class: 'btn btn-sm', onclick: () => { const last = st.slots.at(-1) || { to: '08:00' }; const [a, b] = last.to.split(':').map(Number), t = a * 60 + b + 45; st.slots.push({ from: last.to, to: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }); fix(); save(); draw(); } }, icon('plus'), 'Tilføj time'),
        st.slots.length > 1 ? h('button', { class: 'btn btn-sm', onclick: () => { st.slots.pop(); fix(); save(); draw(); } }, icon('minus'), 'Fjern sidste time') : null) : null);
    }

    function drawHomework() {
      const subjects = [...new Set(Object.values(st.weeks).flat(2).filter(Boolean).map(l => l.subject))];
      const subj = h('select', { class: 'select', 'aria-label': 'Fag til lektien' }, (subjects.length ? subjects : SUBJECTS).map(s => h('option', { value: s }, s)));
      const text = h('input', { class: 'input', maxlength: 200, placeholder: 'Fx Læs s. 24–30', 'aria-label': 'Lektie' });
      // due date: the next day with that subject
      const nextDay = (s) => { for (let k = 1; k <= 14; k++) { const iso = addDays(todayIso(), k), d = new Date(`${iso}T12:00`); if (dayLessons(st, d).some(x => x.lesson.subject === s)) return iso; } return addDays(todayIso(), 1); };
      const due = h('input', { class: 'input', type: 'date', value: nextDay(subj.value), 'aria-label': 'Til hvornår', style: { width: 'auto' } });
      subj.addEventListener('change', () => { due.value = nextDay(subj.value); });
      const add = () => { if (!text.value.trim()) return text.focus(); st.homework.push({ id: uid(), subject: subj.value, text: text.value.trim(), due: due.value || addDays(todayIso(), 1), done: false }); save(); text.value = ''; drawHomework(); drawNow(); drawGrid(); };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const open = st.homework.filter(x => !x.done).sort((a, b) => a.due.localeCompare(b.due)), done = st.homework.filter(x => x.done).slice(-5).reverse();
      const label = (iso) => { const t = todayIso(); return iso < t ? 'For sent!' : iso === t ? 'I dag' : iso === addDays(t, 1) ? 'I morgen' : new Date(`${iso}T12:00`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' }); };
      const row = (x) => h('div', { class: ['sk-hwrow', x.done && 'is-done', !x.done && x.due < todayIso() && 'is-late'] },
        h('input', { type: 'checkbox', checked: x.done, 'aria-label': `Færdig: ${x.text}`, onchange: () => { x.done = !x.done; if (x.done) toast('Godt klaret! ✓', { type: 'ok', ms: 1600 }); save(); drawHomework(); drawNow(); drawGrid(); } }),
        h('span', { class: 'sk-hwsub', style: { '--c': colorOf(st, x.subject) } }, x.subject), h('span', { class: 'sk-hwtext' }, x.text), h('span', { class: 'faint sk-hwdue' }, label(x.due)),
        h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet lektie', onclick: () => { st.homework = st.homework.filter(y => y !== x); save(); drawHomework(); drawNow(); } }, icon('x')));
      h(clear(hwBox), null, h('div', { class: 'sk-hwadd' }, subj, text, due, h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj')),
        open.length ? h('div', { class: 'sk-hwlist' }, open.map(row)) : h('p', { class: 'faint' }, 'Ingen lektier – nyd det! 😎'),
        done.length ? h('details', { class: 'sk-done' }, h('summary', { class: 'faint' }, 'Senest klaret'), done.map(row)) : null);
      if (st.homework.length > 200) st.homework = st.homework.filter(x => !x.done).concat(st.homework.filter(x => x.done).slice(-50));
    }

    const shareDialog = () => {
      const code = encode(st), inp = h('textarea', { class: 'textarea', rows: 3, 'aria-label': 'Skema-kode' });
      const m = modal({ title: 'Del eller hent et skema', size: 520, body: h('div', { class: 'stack', style: { gap: '10px' } },
        h('p', { class: 'muted', style: { margin: 0 } }, 'Send koden til dine klassekammerater, så de kan hente det samme skema. Lektier kommer ikke med.'),
        h('div', { class: 'row', style: { gap: '6px' } }, h('input', { class: 'input', readonly: true, value: code, 'aria-label': 'Din skema-kode', onfocus: (e) => e.target.select() }), h('button', { class: 'btn', onclick: () => copy(code, 'Koden er kopieret') }, icon('copy'), 'Kopiér')),
        h('span', { class: 'field-label' }, 'Hent et skema fra en kode'), inp),
        actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Luk'), h('button', { class: 'btn btn-primary', onclick: async () => {
          try { const o = decode(inp.value); if (!(await confirmDialog({ title: 'Erstat dit skema?', text: 'Dine lektier bliver liggende.', confirmLabel: 'Erstat' }))) return; Object.assign(st, { slots: o.slots, weeks: o.weeks, abWeeks: !!o.abWeeks, aParity: o.aParity ?? 1, colors: o.colors || {} }); fix(); save(); m.close(); draw(); toast('Skemaet er hentet', { type: 'ok' }); }
          catch { toast('Koden virker ikke', { type: 'bad' }); }
        } }, icon('download'), 'Hent skema')] });
    };

    const head = h('div', { class: 'sh-top' });
    function draw() {
      h(clear(head), null,
        st.abWeeks ? segmented([{ value: 'A', label: 'A-uge' }, { value: 'B', label: 'B-uge' }], wk, (v) => { wk = v; drawGrid(); }, { label: 'Uge' }) : null,
        h('span', { class: 'faint' }, `Uge ${isoWeek()}${st.abWeeks ? ` · nu er det ${weekLetter(new Date(), true, st.aParity)}-uge` : ''}`),
        h('span', { style: { flex: 1 } }),
        h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: st.abWeeks, onchange: (e) => { st.abWeeks = e.target.checked; save(); draw(); } }), h('span', null, 'A/B-uger')),
        st.abWeeks ? h('button', { class: 'btn btn-sm btn-ghost', title: 'Skift hvilken uge der er A', onclick: () => { st.aParity = st.aParity ? 0 : 1; save(); wk = weekLetter(new Date(), true, st.aParity); draw(); } }, 'Byt A/B') : null,
        h('button', { class: ['btn btn-sm', editing && 'btn-primary'], onclick: () => { editing = !editing; draw(); } }, icon('clock'), editing ? 'Færdig' : 'Ret tider'),
        st.abWeeks && wk === 'B' ? h('button', { class: 'btn btn-sm', onclick: () => { st.weeks.B = structuredClone(st.weeks.A); save(); drawGrid(); toast('B-ugen er nu en kopi af A-ugen', { type: 'ok' }); } }, icon('copy'), 'Kopiér A') : null,
        h('button', { class: 'btn btn-sm', onclick: shareDialog }, icon('share'), 'Del'),
        h('button', { class: 'btn btn-sm', onclick: () => window.print() }, icon('printer'), 'Udskriv'));
      drawNow(); drawGrid(); drawHomework();
    }
    draw();
    clearInterval(this._tick); this._tick = setInterval(() => { if (!document.body.contains(nowBox)) return clearInterval(self._tick); drawNow(); }, 30000);
    return h('div', { class: 'page sk-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Skole', title: 'Skoleskema', lead: 'Dit skema med “nu og næste”, A/B-uger og lektier pr. fag. Del det med klassen med en kode.', compact: true }),
      nowBox, panel('Skema', 'calendar', head, grid), panel('Lektier', 'book', hwBox));
  },
};
