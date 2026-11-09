/**
 * The small widgets in the top bar (weather, streak, online) and "Tilpas": the user chooses which widgets –
 * and which cards on Hjem – are shown, and what information each one shows. Saved in prefs.widgets on the profile.
 */
import { h, clear, ava } from '../core/dom.js';
import { icon, tileIcon } from '../core/icons.js';
import { store, setPref } from '../core/store.js';
import { api } from '../core/api.js';
import { modal, switchControl, segmented } from '../core/ui.js';
import { dayStreak, winStreak, HOME_CARDS, WIDGET_DEFAULTS, LOOK_VERSION, DOCK_DEFAULT, DOCK_MIN, DOCK_MAX, dockIds } from './widgetlogic.js';
import { APPS, appById, access, visible, isLearnApp } from '../core/registry.js';
import { shortcutEntry } from './shortcuts.js';
export { dayStreak, winStreak, HOME_CARDS, WIDGET_DEFAULTS, LOOK_VERSION };

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

/** The weather for Hjem's clock: calls fn now and whenever it changes; returns a function that stops it. */
export function onWeather(fn) {
  const f = () => fn(data.weather, data.weatherErr);
  listeners.add(f); startData(); f();
  return () => listeners.delete(f);
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
  const href = mode === 'chess' ? '#/dashboard' : mode === 'active' ? '#/dashboard' : '#/learn';
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
  const row = h('div', { class: 'top-widgets', role: 'group', 'aria-label': 'Widgets', dataset: { tour: 'widgets' } });
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
  return h('button', { class: 'icon-btn tw-customize', dataset: { tour: 'customize' }, 'aria-label': 'Tilpas topbar og forside', title: 'Tilpas topbar og forside', onclick: () => openCustomize() }, icon('sliders'));
}

/** The "Tilpas" dialog: everything changes right away and is saved on the profile. */
const PLACES = { home: ['Hjem', 'home', '#f97316'], learn: ['Læring', 'graduation', '#22c55e'], apps: ['Alle apps', 'apps', '#57534e'] };

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
      dockSection(),
      h('h3', { class: 'tw-sec' }, 'Kort på Hjem'),
      h('div', { class: 'tw-cards' }, HOME_CARDS.map(([k, label]) => h('label', { class: 'tw-card' },
        switchControl({ checked: cur.home[k], label, onChange: (v) => { setWidgets({ home: { ...w().home, [k]: v } }); } }), h('span', null, label)))),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm tw-reset', onclick: () => { setPref('widgets', { ...WIDGET_DEFAULTS }); draw(); } }, icon('restore'), 'Nulstil til standard'));
  }
  // ── the dock: how many apps, which ones and in which order ──
  function dockSection() {
    const u = store.get('user');
    const cur = w();
    const list = Array.isArray(cur.dock) && cur.dock.length ? [...cur.dock] : [...DOCK_DEFAULT];
    const n = dockIds(cur).length;
    const save = (patch) => { setWidgets(patch); draw(); };
    const sc = (id) => shortcutEntry(id, cur);
    const label = (id) => PLACES[id]?.[0] || appById(id)?.name || sc(id)?.label || id;
    const ic = (id) => PLACES[id]?.[1] || appById(id)?.icon || sc(id)?.icon || 'apps';
    const hue = (id) => PLACES[id]?.[2] || appById(id)?.hue || sc(id)?.hue || 'var(--accent)';
    const count = h('input', { type: 'range', class: 'tw-range', min: DOCK_MIN, max: Math.min(DOCK_MAX, Math.max(list.length, DOCK_MIN)), step: 1, value: Math.min(n, list.length), 'aria-label': 'Antal fastgjorte apps' });
    const out = h('b', { class: 'tw-count' }, String(Math.min(n, list.length)));
    count.addEventListener('input', () => { out.textContent = count.value; });
    count.addEventListener('change', () => save({ dockCount: Number(count.value), dock: list }));
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; save({ dock: list, dockCount: n }); };
    const remove = (i) => { if (list.length <= DOCK_MIN) return; list.splice(i, 1); save({ dock: list, dockCount: Math.min(n, list.length) }); };
    const choices = [['home', 'Hjem'], ['learn', 'Læring'], ['apps', 'Alle apps'],
      ...APPS.filter(a => a.page && visible(a, u) && access(a, u).ok && !a.suite).map(a => [a.id, a.name]).sort((x, y) => x[1].localeCompare(y[1], 'da'))]
      .filter(([id]) => !list.includes(id));
    const add = h('select', { class: 'select tw-add', 'aria-label': 'Fastgør en app' }, h('option', { value: '' }, 'Fastgør en app …'), choices.map(([id, name]) => h('option', { value: id }, name)));
    add.addEventListener('change', () => { if (!add.value || list.length >= DOCK_MAX) return; list.splice(Math.min(n, list.length), 0, add.value); save({ dock: list, dockCount: Math.min(DOCK_MAX, n + 1) }); });   // shown right away: it goes in as the last visible app
    return h('div', { class: 'tw-dock' },
      h('h3', { class: 'tw-sec' }, 'Fastgjorte apps'),
      h('p', { class: 'faint tw-dock-note' }, 'Ligger i menuen til venstre og øverst i Alle apps – og i bunden på en telefon.'),
      h('div', { class: 'tw-dock-count' }, h('span', null, 'Antal'), count, out),
      h('ol', { class: 'tw-dock-list' }, list.map((id, i) => h('li', { class: ['tw-dock-item', i >= n && 'is-hidden'], style: { '--app': hue(id) } },
        h('span', { class: 'tw-dock-ic' }, tileIcon(ic(id))), h('span', { class: 'tw-dock-name' }, label(id), i >= n ? h('small', { class: 'faint' }, ' – vises ikke') : null),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Flyt ${label(id)} op`, disabled: i === 0, onclick: () => move(i, -1) }, icon('chevronUp')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Flyt ${label(id)} ned`, disabled: i === list.length - 1, onclick: () => move(i, 1) }, icon('chevronDown')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Fjern ${label(id)} fra de fastgjorte`, disabled: list.length <= DOCK_MIN, onclick: () => remove(i) }, icon('x'))))),
      list.length < DOCK_MAX ? add : h('p', { class: 'faint' }, `Du kan højst fastgøre ${DOCK_MAX} apps.`));
  }
  draw();
  const m = modal({ title: 'Tilpas topbar og forside', label: 'Widgets', size: 560, body,
    actions: [h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Færdig')] });
  return m;
}
