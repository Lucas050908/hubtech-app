/**
 * Dagbog – a few lines a day, how you feel, and three good things. A month calendar coloured by mood,
 * a streak, prompts when you don't know what to write, and search. Only you can see it.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, todayKey } from '../features/appkit.js';
import { streak, addDays } from '../features/sharedlogic.js';

const MOODS = [[1, '😞', 'Dårlig'], [2, '😕', 'Ikke så god'], [3, '😐', 'Okay'], [4, '🙂', 'God'], [5, '😄', 'Super']];
const MOOD_COLOR = { 1: '#f87171', 2: '#fb923c', 3: '#facc15', 4: '#a3e635', 5: '#4ade80' };
const PROMPTS = ['Hvad fik dig til at smile i dag?', 'Hvad lærte du i dag?', 'Hvem var du glad for at se i dag?', 'Hvad glæder du dig til i morgen?', 'Hvad var svært i dag – og hvordan klarede du det?', 'Hvad er du stolt af lige nu?', 'Hvis i dag var en film, hvad ville den hedde?', 'Hvad ville du gøre anderledes, hvis du kunne gøre dagen om?', 'Hvad har du brugt mest tid på i dag?', 'Beskriv et øjeblik fra i dag med tre ord.', 'Hvad har du lyst til at blive bedre til?', 'Hvad gjorde du for en anden i dag?'];

export default {
  title: 'Dagbog',
  async render() {
    const app = appById('journal');
    let store;
    try { store = await appState('journal', { days: {} }); } catch (e) { return loadError('Dagbog', e); }
    const st = store.data;
    let day = todayKey(), month = day.slice(0, 7), query = '';
    const editor = h('div'), cal = h('div'), side = h('div', { class: 'stack' });
    let t = null;
    const save = () => { clearTimeout(t); t = setTimeout(() => { store.save(); drawCal(); drawSide(); }, 500); };

    function drawEditor() {
      const d = st.days[day] || { text: '', mood: 0, good: ['', '', ''] };
      const ensure = () => { st.days[day] = d; };
      const label = new Date(`${day}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const prompt = PROMPTS[(new Date(`${day}T12:00`).getDate() + new Date(`${day}T12:00`).getMonth()) % PROMPTS.length];
      const text = h('textarea', { class: 'textarea jr-text', rows: 9, maxlength: 20000, placeholder: prompt, 'aria-label': 'Dagens tekst' }); text.value = d.text || '';
      text.addEventListener('input', () => { d.text = text.value; ensure(); save(); words.textContent = `${(text.value.trim().match(/\S+/g) || []).length} ord`; });
      const words = h('span', { class: 'faint' }, `${((d.text || '').trim().match(/\S+/g) || []).length} ord`);
      h(clear(editor), null,
        h('div', { class: 'jr-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Dagen før', onclick: () => { day = addDays(day, -1); month = day.slice(0, 7); drawAll(); } }, icon('chevronLeft')),
          h('h2', null, label), h('button', { class: 'icon-btn', 'aria-label': 'Dagen efter', disabled: day >= todayKey(), onclick: () => { day = addDays(day, 1); month = day.slice(0, 7); drawAll(); } }, icon('chevronRight')),
          day !== todayKey() ? h('button', { class: 'btn btn-sm', onclick: () => { day = todayKey(); month = day.slice(0, 7); drawAll(); } }, 'I dag') : null),
        h('span', { class: 'field-label' }, 'Hvordan har du det?'),
        h('div', { class: 'jr-moods', role: 'radiogroup', 'aria-label': 'Humør' }, MOODS.map(([v, e, l]) => h('button', { class: ['jr-mood', d.mood === v && 'is-on'], role: 'radio', 'aria-checked': String(d.mood === v), 'aria-label': l, title: l, style: { '--c': MOOD_COLOR[v] }, onclick: () => { d.mood = d.mood === v ? 0 : v; ensure(); store.save(); drawEditor(); drawCal(); drawSide(); } }, e, h('small', null, l)))),
        h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('span', { class: 'field-label' }, 'Dagens tekst'), words),
        text,
        h('span', { class: 'field-label' }, 'Tre gode ting ved i dag'),
        h('div', { class: 'jr-good' }, [0, 1, 2].map(i => { const inp = h('input', { class: 'input', maxlength: 140, value: d.good?.[i] || '', placeholder: ['Fx Frokost med Ida', 'Fx Jeg fik en god karakter', 'Fx Solen skinnede'][i], 'aria-label': `God ting ${i + 1}` }); inp.addEventListener('input', () => { d.good ||= ['', '', '']; d.good[i] = inp.value; ensure(); save(); }); return h('div', { class: 'jr-goodrow' }, h('span', null, `${i + 1}.`), inp); })),
        h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, icon('lock'), ' Kun du kan se din dagbog. Den gemmes automatisk.'));
      if (day === todayKey() && !d.text) text.focus();
    }

    function drawCal() {
      const [y, m] = month.split('-').map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), pad = (first.getDay() + 6) % 7;
      const cells = [];
      for (let k = 0; k < pad; k++) cells.push(h('span'));
      for (let dd = 1; dd <= days; dd++) {
        const key = `${month}-${String(dd).padStart(2, '0')}`, e = st.days[key], fut = key > todayKey();
        cells.push(h('button', { class: ['jr-day', key === day && 'is-sel', key === todayKey() && 'is-today', e?.text && 'has-text'], disabled: fut, style: e?.mood ? { '--c': MOOD_COLOR[e.mood] } : null, 'aria-label': `${dd}.${e?.mood ? ` ${MOODS[e.mood - 1][2]}` : ''}${e?.text ? ', skrevet' : ''}`, onclick: () => { day = key; drawAll(); } }, String(dd)));
      }
      const shift = (n) => { const d = new Date(y, m - 1 + n, 1); month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; drawCal(); };
      h(clear(cal), null, h('div', { class: 'jr-calhead' }, h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Forrige måned', onclick: () => shift(-1) }, icon('chevronLeft')),
        h('b', null, first.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' })), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Næste måned', disabled: month >= todayKey().slice(0, 7), onclick: () => shift(1) }, icon('chevronRight'))),
        h('div', { class: 'jr-cal' }, ['M', 'T', 'O', 'T', 'F', 'L', 'S'].map(x => h('span', { class: 'jr-wd' }, x)), cells));
    }

    function drawSide() {
      const keys = Object.keys(st.days).filter(k => st.days[k].text || st.days[k].mood).sort();
      const str = streak(keys, todayKey());
      const last30 = Array.from({ length: 30 }, (_, i) => addDays(todayKey(), i - 29)).map(k => st.days[k]?.mood || 0);
      const avg = last30.filter(Boolean); const mean = avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length) : 0;
      const q = query.toLowerCase();
      const hits = q ? keys.filter(k => (st.days[k].text || '').toLowerCase().includes(q) || (st.days[k].good || []).join(' ').toLowerCase().includes(q)).reverse().slice(0, 20) : [];
      const search = h('input', { class: 'input', type: 'search', value: query, placeholder: 'Søg i din dagbog', 'aria-label': 'Søg i din dagbog' });
      search.addEventListener('input', () => { query = search.value; clearTimeout(t2); t2 = setTimeout(() => { drawSide(); side.querySelector('input[type=search]')?.focus(); }, 250); });
      h(clear(side), null,
        h('div', { class: 'jr-stats' }, h('div', null, h('b', null, String(str)), h('span', { class: 'faint' }, str === 1 ? 'dag i træk' : 'dage i træk')), h('div', null, h('b', null, String(keys.length)), h('span', { class: 'faint' }, 'dage skrevet')), h('div', null, h('b', null, mean ? MOODS[Math.round(mean) - 1][1] : '–'), h('span', { class: 'faint' }, 'humør (30 dage)'))),
        panel('Humør de sidste 30 dage', 'chart', h('div', { class: 'jr-chart' }, last30.map((v, i) => h('i', { style: { height: v ? `${v * 20}%` : '4%', background: v ? MOOD_COLOR[v] : 'var(--line)' }, title: addDays(todayKey(), i - 29) })))),
        panel('Kalender', 'calendar', cal),
        panel('Søg', 'search', search, q ? (hits.length ? h('div', { class: 'jr-hits' }, hits.map(k => h('button', { class: 'jr-hit', onclick: () => { day = k; month = k.slice(0, 7); drawAll(); } }, h('b', null, new Date(`${k}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })), h('span', { class: 'faint' }, (st.days[k].text || '').slice(0, 80))))) : h('p', { class: 'faint' }, 'Intet fundet.')) : null));
    }
    let t2 = null;
    function drawAll() { drawEditor(); drawCal(); drawSide(); }
    drawAll();
    if (Object.keys(st.days).length === 0) setTimeout(() => toast('Velkommen til din dagbog', { type: 'info', text: 'Skriv bare et par linjer om dagen – det tæller.' }), 300);
    return h('div', { class: 'page jr-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'For dig', title: 'Dagbog', lead: 'Et par linjer om dagen, dit humør og tre gode ting. Kun du kan se den.', compact: true }),
      h('div', { class: 'ev-wrap jr-wrap' }, panel(null, null, editor), side));
  },
};
