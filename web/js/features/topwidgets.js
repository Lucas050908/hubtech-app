/**
 * The small widgets in the top bar (weather, streak, online) and "Tilpas": the user chooses which widgets –
 * and which cards on Hjem – are shown, and what information each one shows. Saved in prefs.widgets on the profile.
 */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store, setPref } from '../core/store.js';
import { api } from '../core/api.js';
import { modal, switchControl, segmented } from '../core/ui.js';
import { dayStreak, winStreak, HOME_CARDS, WIDGET_DEFAULTS } from './widgetlogic.js';
export { dayStreak, winStreak, HOME_CARDS, WIDGET_DEFAULTS };

export function widgetPrefs() {
  const w = store.get('prefs')?.widgets || {};
  return { ...WIDGET_DEFAULTS, ...w, home: { ...WIDGET_DEFAULTS.home, ...(w.home || {}) } };
}
export function setWidgets(patch) { setPref('widgets', { ...widgetPrefs(), ...patch }); }

// ── data (fetched lazily, refreshed now and then) ──
const data = { weather: null, weatherErr: '', weatherCity: null, players: null, hubs: null, active: null, chess: null };
const listeners = new Set();
const changed = () => listeners.forEach(f => f());

async function loadWeather() {
  const city = widgetPrefs().city || 'København';
  data.weatherCity = city;
  try {
    const r = await api.get(`/api/weather?city=${encodeURIComponent(city)}`);
    data.weather = r.ok ? r : null; data.weatherErr = r.ok ? '' : r.error;
  }
  catch (e) { data.weather = null; data.weatherErr = e.message || 'Vejret kunne ikke hentes.'; }
  changed();
}
async function loadOnline() {
  const [p, hl] = await Promise.all([api.get('/api/games/players').catch(() => null), api.get('/api/hublink').catch(() => null)]);
  if (p) data.players = p.players.filter(x => x.online);
  if (hl) data.hubs = hl.links || [];
  changed();
}
async function loadStreaks() {
  const [a, c] = await Promise.all([api.get('/api/activity?limit=100').catch(() => null), api.get('/api/state/chess').catch(() => null)]);
  if (a) data.active = dayStreak(a.activity.map(x => x.at));
  data.chess = winStreak(c?.state?.rating?.hist || []);
  changed();
}

let timers = [];
function startData() {
  if (timers.length) return;
  loadWeather(); loadOnline(); loadStreaks();
  timers = [setInterval(loadWeather, 15 * 60_000), setInterval(loadOnline, 60_000), setInterval(loadStreaks, 5 * 60_000)];
}

function weatherChip(w) {
  if (!w.weather) return null;
  if (data.weatherCity !== (w.city || 'København')) { loadWeather(); }
  const x = data.weather;
  if (!x) return h('span', { class: 'tw-chip tw-weather is-dim', title: data.weatherErr || 'Henter vejret …' }, icon('cloud'), h('span', null, '–'));
  return h('span', { class: 'tw-chip tw-weather', title: `${x.city}: ${x.temp} °C, ${x.text.toLowerCase()}`, 'aria-label': `Vejret i ${x.city}: ${x.temp} grader, ${x.text.toLowerCase()}` },
    icon(x.icon), h('b', null, `${x.temp} °C`), w.weatherMode === 'full' ? h('span', { class: 'tw-text' }, x.text) : null);
}

function streakChip(w) {
  if (!w.streak) return null;
  const mode = w.streakMode;
  const n = mode === 'chess' ? data.chess : mode === 'active' ? data.active : store.get('summary')?.streak;
  const label = mode === 'chess' ? 'skaksejre i træk' : mode === 'active' ? 'dage i træk på HUBTECH' : 'dage i træk med læring';
  const href = mode === 'chess' ? '#/apps/chess' : mode === 'active' ? '#/dashboard' : '#/learn';
  return h('a', { class: ['tw-chip', 'tw-streak', n > 0 && 'is-hot'], href, title: `${n ?? 0} ${label}`, 'aria-label': `${n ?? 0} ${label}` },
    icon(mode === 'chess' ? 'crown' : 'flame'), h('b', null, String(n ?? '–')));
}

function onlineChip(w) {
  if (!w.online) return null;
  if (w.onlineMode === 'hubs') {
    const n = data.hubs?.length ?? 0;
    return h('a', { class: 'tw-chip tw-online', href: '#/hubs', title: n ? data.hubs.map(l => l.name).join(', ') : 'Ingen forbundne HUBTECH’er endnu', 'aria-label': `${n} forbundne HUBTECH’er` },
      icon('hubtech'), h('b', null, String(n)), h('span', { class: 'tw-text' }, n === 1 ? 'forbundet' : 'forbundne'));
  }
  const on = data.players || [];
  const names = on.map(p => p.name).join(', ');
  return h('a', { class: 'tw-chip tw-online', href: '#/hubs', title: on.length ? `Online nu: ${names}` : 'Ingen andre er online lige nu', 'aria-label': `${on.length} andre online` },
    w.onlineMode === 'avatars' && on.length ? h('span', { class: 'tw-faces', 'aria-hidden': 'true' }, on.slice(0, 3).map(p => h('span', { class: 'avatar' }, ava(p.avatar)))) : h('span', { class: ['tw-dot', on.length && 'is-on'], 'aria-hidden': 'true' }),
    h('b', null, String(on.length)), h('span', { class: 'tw-text' }, 'online'));
}

/** The widgets row for the top bar. `music` is the existing music button; it is shown or hidden from the same prefs. */
export function topWidgets(music) {
  const row = h('div', { class: 'top-widgets', role: 'group', 'aria-label': 'Widgets' });
  const draw = () => {
    const w = widgetPrefs();
    h(clear(row), null, weatherChip(w), streakChip(w), onlineChip(w));
    if (music) { music.hidden = !w.music; music.classList.toggle('with-title', w.musicMode === 'title'); }
  };
  let seen = false;
  const offs = [store.on('prefs', () => draw()), store.on('summary', () => draw())];
  const guard = () => { if (row.isConnected) seen = true; else if (seen) { listeners.delete(guard); offs.forEach(f => typeof f === 'function' && f()); return; } draw(); };
  listeners.add(guard);
  offs.length = 0;
  offs.push(store.on('prefs', guard), store.on('summary', guard));
  startData();
  draw();
  return row;
}

export function customizeButton() {
  return h('button', { class: 'icon-btn tw-customize', 'aria-label': 'Tilpas topbar og forside', title: 'Tilpas topbar og forside', onclick: () => openCustomize() }, icon('sliders'));
}

/** The "Tilpas" dialog: everything changes right away and is saved on the profile. */
export function openCustomize() {
  const w = () => widgetPrefs();
  const line = (title, sub, key, extra) => h('div', { class: 'tw-row' },
    h('div', { class: 'tw-row-main' },
      h('label', { class: 'tw-row-head' }, switchControl({ checked: w()[key], label: title, onChange: (v) => { setWidgets({ [key]: v }); draw(); body.querySelector(`input[aria-label="${title}"]`)?.focus(); } }), h('span', null, h('b', null, title), sub ? h('small', { class: 'faint' }, sub) : null)),
      w()[key] && extra ? h('div', { class: 'tw-row-extra' }, extra()) : null));
  const seg = (key, opts, label) => segmented(opts.map(([value, l]) => ({ value, label: l })), w()[key], (v) => setWidgets({ [key]: v }), { label });
  const city = () => {
    const inp = h('input', { class: 'input', value: w().city, placeholder: 'København', 'aria-label': 'By til vejret', maxlength: 60 });
    const save = () => { if (inp.value.trim() !== w().city) setWidgets({ city: inp.value.trim() }); };
    inp.addEventListener('change', save);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    return h('label', { class: 'tw-city' }, h('span', { class: 'faint' }, 'By'), inp);
  };
  const body = h('div', { class: 'tw-dialog' });
  function draw() {
    const cur = w();
    h(clear(body), null,
      h('h3', { class: 'tw-sec' }, 'Topbar'),
      line('Vejr', 'Ved siden af søgefeltet', 'weather', () => h('div', { class: 'tw-opts' }, seg('weatherMode', [['full', 'Grader og vejr'], ['temp', 'Kun grader']], 'Hvad vejret viser'), city())),
      line('Streak', 'Hvor mange dage eller sejre i træk', 'streak', () => seg('streakMode', [['learn', 'Læring'], ['active', 'Brug af HUBTECH'], ['chess', 'Skaksejre']], 'Hvad streak tæller')),
      line('Online', 'Hvem der er her lige nu', 'online', () => seg('onlineMode', [['avatars', 'Ansigter og antal'], ['count', 'Kun antal'], ['hubs', 'Forbundne HUBTECH’er']], 'Hvad online viser')),
      line('Musik', 'Klaveret i topbaren', 'music', () => seg('musicMode', [['compact', 'Kun knappen'], ['title', 'Knap og stemning']], 'Hvad musikken viser')),
      h('h3', { class: 'tw-sec' }, 'Kort på Hjem'),
      h('div', { class: 'tw-cards' }, HOME_CARDS.map(([k, label]) => h('label', { class: 'tw-card' },
        switchControl({ checked: cur.home[k], label, onChange: (v) => { setWidgets({ home: { ...w().home, [k]: v } }); } }), h('span', null, label)))),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm tw-reset', onclick: () => { setPref('widgets', { ...WIDGET_DEFAULTS }); draw(); } }, icon('restore'), 'Nulstil til standard'));
  }
  draw();
  const m = modal({ title: 'Tilpas topbar og forside', label: 'Widgets', size: 560, body,
    actions: [h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Færdig')] });
  return m;
}
