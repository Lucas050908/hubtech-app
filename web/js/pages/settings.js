/** Indstillinger: profile, security, appearance & world, integrations, users, about. */
import { h, clear, timeAgo } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { store, setPref, setWorld, resetSessionState } from '../core/store.js';
import { toast, busy, errorToast, segmented, switchControl, setRangeFill, confirmDialog, modal } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { describeWorld, requestLocation, paintStill } from '../world/controller.js';
import { SEASONS, SEASON_LABEL, SEASON_ICON, TIME_LABEL, WEATHER_LABEL } from '../world/palettes.js';
import { getIntegrations, invalidateIntegrations } from '../core/services.js';
import { passwordScore } from '../features/auth.js';
import { startOnboarding } from '../features/onboarding.js';
import { saveBlob } from '../core/files.js';
import { isAppWindow, canInstall, promptInstall, onInstallChange, systemInfo, shutdown } from '../core/desktop.js';
import * as droid from '../core/android.js';

const AVATARS = ['⚡', '🦊', '🐺', '🦁', '🐯', '🐻', '🦅', '🐉', '🔧', '💡', '🛸', '🔬', '🎯', '🚀', '🏆', '🌊', '🤖', '🔌', '🧠', '🌲', '🏔️', '🍂', '❄️', '🌸', '☀️'];
const TABS = [
  { id: 'profile', label: 'Profil', icon: 'user' },
  { id: 'security', label: 'Sikkerhed', icon: 'lock' },
  { id: 'world', label: 'Verden & udseende', icon: 'mountain' },
  { id: 'integrations', label: 'Integrationer', icon: 'plug' },
  { id: 'users', label: 'Brugere', icon: 'users', owner: true },
  { id: 'data', label: 'Data & sikkerhedskopi', icon: 'database' },
  { id: 'about', label: 'Om', icon: 'info' },
];

function row(label, hint, control) {
  return h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('b', null, label), hint ? h('div', { class: 'faint' }, hint) : null), h('div', { class: 'set-control' }, control));
}

function fieldEl(label, input, hint) {
  const err = h('div', { class: 'field-error' });
  if (!input.id) input.id = `f-${Math.random().toString(36).slice(2, 9)}`;
  const f = h('div', { class: 'field' }, h('label', { class: 'field-label', for: input.id }, label), input, hint ? h('div', { class: 'field-hint' }, hint) : null, err);
  f.setError = (m) => { err.textContent = m || ''; input.setAttribute('aria-invalid', m ? 'true' : 'false'); };
  input.addEventListener('input', () => f.setError(''));
  return f;
}

// ── tabs ───────────────────────────────────────────────────────────────
function profileTab() {
  const u = store.get('user');
  const name = h('input', { class: 'input', value: u.displayName, maxlength: 60, autocomplete: 'name' });
  const email = h('input', { class: 'input', type: 'email', value: u.email, maxlength: 254, autocomplete: 'email', placeholder: 'valgfri' });
  const fName = fieldEl('Navn', name), fEmail = fieldEl('E-mail', email, 'Kan bruges til at logge ind.');
  let avatar = u.avatar;
  const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Avatar' }, AVATARS.map(a => {
    const b = h('button', { class: 'avatar-opt', role: 'radio', 'aria-checked': String(a === avatar), 'aria-label': `Avatar ${a}` }, a);
    b.addEventListener('click', () => { avatar = a; grid.querySelectorAll('.avatar-opt').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
    return b;
  }));
  const save = h('button', { class: 'btn btn-primary' }, 'Gem profil');
  save.addEventListener('click', busy(save, async () => {
    if (!name.value.trim()) return fName.setError('Skriv dit navn.');
    try {
      const { user } = await api.patch('/api/me', { displayName: name.value.trim(), email: email.value.trim(), avatar });
      store.set('user', user);
      toast('Profil gemt', { type: 'ok' });
    } catch (e) { (e.field === 'email' ? fEmail : fName).setError(e.message); }
  }));
  return h('div', { class: 'stack' },
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '16px' } }, 'Din profil'),
      h('div', { class: 'grid-2' }, fName, fEmail),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Avatar'), grid),
      h('dl', { class: 'kv', style: { margin: '8px 0 18px' } }, h('dt', null, 'Brugernavn'), h('dd', { class: 'mono' }, u.username), h('dt', null, 'Rolle'), h('dd', null, u.role === 'owner' ? 'Ejer (adgang til lokale projekter og integrationer)' : 'Medlem'), h('dt', null, 'Oprettet'), h('dd', null, new Date(u.createdAt * 1000).toLocaleDateString('da-DK', { dateStyle: 'long' }))),
      save),
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '12px' } }, 'Introduktion'),
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, u.onboarding.done ? 'Du har gennemført introduktionen. Start den igen, hvis du vil have en rundvisning.' : 'Du har ikke gennemført introduktionen endnu.'),
      h('button', { class: 'btn', onclick: () => { navigate('/'); setTimeout(() => startOnboarding({ restart: true }), 500); } }, icon('sparkles'), 'Start introduktionen')));
}

function securityTab() {
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const nw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const nw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const meter = h('div', { class: 'pw-meter', 'data-score': '0', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  nw.addEventListener('input', () => meter.dataset.score = String(passwordScore(nw.value)));
  const fCur = fieldEl('Nuværende adgangskode', cur), fNew = fieldEl('Ny adgangskode', nw, 'Mindst 10 tegn med store og små bogstaver og et tal – eller en passphrase på 16+ tegn.'), fNew2 = fieldEl('Gentag ny adgangskode', nw2);
  fNew.insertBefore(meter, fNew.querySelector('.field-hint'));
  const save = h('button', { class: 'btn btn-primary' }, 'Skift adgangskode');
  save.addEventListener('click', busy(save, async () => {
    if (nw.value !== nw2.value) return fNew2.setError('Adgangskoderne er ikke ens.');
    try {
      await api.post('/api/me/password', { current: cur.value, new: nw.value });
      cur.value = nw.value = nw2.value = ''; meter.dataset.score = '0';
      toast('Adgangskoden er ændret', { type: 'ok', text: 'Andre enheder er logget ud.' });
      drawSessions();
    } catch (e) { (e.field === 'current' ? fCur : fNew).setError(e.message); }
  }));
  const sessions = h('div', { class: 'list' });
  async function drawSessions() {
    try {
      const { sessions: ss } = await api.get('/api/me/sessions');
      clear(sessions);
      ss.forEach(s => sessions.appendChild(h('div', { class: 'row', style: { border: '1px solid var(--line)' } },
        h('span', { class: 'row-icon' }, icon(/Mobile|Android|iPhone/.test(s.userAgent) ? 'chat' : 'monitor')),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, browserName(s.userAgent)), h('div', { class: 'row-sub' }, `Aktiv ${timeAgo(s.lastSeen)} · oprettet ${timeAgo(s.createdAt)}`)),
        s.current ? h('span', { class: 'chip chip-ok' }, 'Denne enhed') : null)));
    } catch { clear(sessions).appendChild(h('p', { class: 'faint' }, 'Kunne ikke hente sessioner.')); }
  }
  drawSessions();
  const revoke = h('button', { class: 'btn' }, icon('logout'), 'Log ud på alle andre enheder');
  revoke.addEventListener('click', busy(revoke, async () => { await api.post('/api/me/sessions/revoke'); toast('Andre enheder er logget ud', { type: 'ok' }); drawSessions(); }));
  const delBtn = h('button', { class: 'btn btn-danger' }, icon('trash'), 'Slet min konto');
  delBtn.addEventListener('click', () => {
    const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Adgangskode' });
    const go = h('button', { class: 'btn btn-danger' }, 'Slet permanent');
    let m;
    go.addEventListener('click', busy(go, async () => {
      try { await api.del('/api/me', { password: pw.value }); m.close(); resetSessionState(); toast('Kontoen er slettet', { type: 'ok' }); navigate('/', { replace: true }); }
      catch (e) { toast('Kunne ikke slette', { type: 'bad', text: e.message }); }
    }));
    m = modal({ title: 'Slet konto', label: 'Kan ikke fortrydes', body: h('div', null, h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Profil, indstillinger, fremdrift, favoritter og projektorganisering slettes permanent fra databasen. Dine projektmapper på disken berøres ikke.'), fieldEl('Bekræft med din adgangskode', pw)), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), go] });
  });
  return h('div', { class: 'stack' },
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '16px' } }, 'Adgangskode'), fCur, h('div', { class: 'grid-2' }, fNew, fNew2), save),
    h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Aktive sessioner'), revoke), sessions),
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '8px' } }, 'Farezone'), h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Sletning af kontoen fjerner alle dine data fra denne HUBTECH-installation.'), delBtn));
}

function browserName(ua = '') {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} på ${os}` : b;
}

function worldTab() {
  const w = () => store.get('prefs').world;
  const preview = h('canvas', { class: 'world-preview', 'aria-hidden': 'true' });
  const drawPreview = () => {
    const im = w().source === 'image' && w().image?.url;
    if (im) {
      const img = new Image();
      img.onload = () => { const r = devicePixelRatio || 1; preview.width = preview.clientWidth * r; preview.height = preview.clientHeight * r; const c = preview.getContext('2d'); const k = Math.max(preview.width / img.width, preview.height / img.height); c.drawImage(img, (preview.width - img.width * k) / 2, (preview.height - img.height * k) / 2, img.width * k, img.height * k); };
      img.src = im; return;
    }
    const d = describeWorld(); paintStill(preview, { season: d.season, time: d.time, landscape: d.landscape, weather: w().weather === 'auto' ? (d.season === 'winter' ? 'snow' : 'clear') : w().weather, focusX: 0.55 });
  };
  const status = h('div', { class: 'faint', style: { fontSize: 'var(--fs-sm)' } });
  const drawStatus = () => { const d = describeWorld(); status.textContent = `Lige nu: ${d.seasonLabel} · ${d.timeLabel} · ${WEATHER_LABEL[w().weather]}`; };
  const refresh = () => { drawStatus(); requestAnimationFrame(drawPreview); };
  const theme = segmented([{ value: 'dark', label: 'Mørk', icon: 'moon' }, { value: 'light', label: 'Lys', icon: 'sun' }, { value: 'system', label: 'System', icon: 'monitor' }], store.get('prefs').theme, (v) => setPref('theme', v), { label: 'Tema' });
  const seasonMode = segmented([{ value: 'auto', label: 'Automatisk', icon: 'calendar' }, { value: 'manual', label: 'Manuel', icon: 'edit' }], w().seasonMode, (v) => { setWorld({ seasonMode: v, season: describeWorld().season }); seasonPick.style.display = v === 'manual' ? '' : 'none'; refresh(); }, { label: 'Årstid' });
  const seasonPick = segmented(SEASONS.map(s => ({ value: s, label: SEASON_LABEL[s], icon: SEASON_ICON[s] })), describeWorld().season, (v) => { setWorld({ season: v }); refresh(); }, { label: 'Vælg årstid' });
  seasonPick.style.display = w().seasonMode === 'manual' ? '' : 'none';
  const time = segmented([{ value: 'auto', label: 'Auto' }, ...['dawn', 'day', 'dusk', 'night'].map(t => ({ value: t, label: TIME_LABEL[t] }))], w().timeMode, (v) => { setWorld({ timeMode: v }); refresh(); }, { label: 'Tid på dagen' });
  const weather = h('select', { class: 'select', 'aria-label': 'Vejr' }, Object.entries(WEATHER_LABEL).map(([k, v]) => h('option', { value: k, selected: w().weather === k }, v)));
  weather.addEventListener('change', () => { setWorld({ weather: weather.value }); refresh(); });
  const mkRange = (key, min, max, step, label) => {
    const r = h('input', { class: 'range', type: 'range', min, max, step, value: w()[key], 'aria-label': label });
    setRangeFill(r);
    r.addEventListener('input', () => { setRangeFill(r); setWorld({ [key]: Number(r.value) }); });
    return r;
  };
  const motion = segmented([{ value: 'system', label: 'Følg system' }, { value: 'full', label: 'Fuld' }, { value: 'reduced', label: 'Reduceret' }], w().motion, (v) => setWorld({ motion: v }), { label: 'Bevægelse' });
  // ── background: one of the landscapes, or your own picture ──
  const LANDS = [['valley', 'Dalen'], ['highlands', 'Højlandet'], ['fjord', 'Fjorden'], ['alps', 'Alperne'], ['hills', 'Bakkerne'], ['coast', 'Kysten'], ['lakes', 'Søerne']];
  const landGrid = h('div', { class: 'land-grid', role: 'radiogroup', 'aria-label': 'Landskab' });
  const drawLands = () => {
    const d = describeWorld();
    h(clear(landGrid), null, LANDS.map(([k, label]) => {
      const cv = h('canvas', { 'aria-hidden': 'true' });
      const on = w().source !== 'image' && (w().landscape || 'valley') === k;
      const b = h('button', { type: 'button', class: ['land-tile', on && 'is-on'], role: 'radio', 'aria-checked': String(on), onclick: () => { setWorld({ landscape: k, source: 'landscape' }); drawLands(); drawSource(); refresh(); } }, cv, h('span', null, label));
      requestAnimationFrame(() => paintStill(cv, { season: d.season, time: d.time, landscape: k, focusX: 0.5, focusY: 0.4 }));
      return b;
    }));
  };
  const imgBox = h('div', { class: 'own-image' });
  const PROMPT = 'Et roligt, malerisk landskab i bredformat (16:9, 3840×2160): bjerge, en sø og blød morgentåge i dæmpede farver. Ingen tekst, ingen personer, ingen logoer. Motivet må gerne være lidt mørkt foroven og nederst, så hvid tekst kan læses ovenpå.';
  const upload = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr-only', id: 'world-upload' });
  upload.addEventListener('change', async () => {
    const f = upload.files[0]; upload.value = '';
    if (!f) return;
    try {
      const { uploadImage } = await import('../office/store.js');
      const url = await uploadImage(f, 3840);
      if (!url || url.startsWith('data:')) throw new Error('Billedet kunne ikke gemmes på serveren.');
      setWorld({ source: 'image', image: { url, name: f.name.slice(0, 80) } });
      toast('Baggrundsbillede sat', { type: 'ok' });
      drawSource(); drawLands(); refresh();
    } catch (e) { toast('Billedet kunne ikke bruges', { type: 'bad', text: e.message }); }
  });
  const drawSource = () => {
    clear(imgBox);
    const img = w().image;
    if (img?.url) {
      const on = w().source === 'image';
      imgBox.append(h('button', { type: 'button', class: ['own-thumb', on && 'is-on'], 'aria-pressed': String(on), title: on ? 'Bruges som baggrund' : 'Brug som baggrund', onclick: () => { setWorld({ source: 'image' }); drawSource(); drawLands(); refresh(); }, style: { backgroundImage: `url("${img.url}")` } }, h('span', null, on ? 'I brug' : 'Brug billedet')),
        h('div', { class: 'own-actions' }, h('label', { class: 'btn btn-sm', for: 'world-upload' }, icon('upload'), 'Skift billede'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { setWorld({ source: 'landscape', image: null }); drawSource(); drawLands(); refresh(); } }, icon('trash'), 'Fjern')));
    } else imgBox.append(h('label', { class: 'btn', for: 'world-upload' }, icon('image'), 'Vælg dit eget billede'));
    imgBox.append(upload, h('details', { class: 'own-ai' }, h('summary', null, 'Lav et billede med AI (fx Gemini)'),
      h('p', { class: 'faint' }, 'Kopiér teksten, indsæt den i Gemini eller en anden billedgenerator, gem billedet, og vælg det her. Billeder over 3840 px bliver gjort mindre.'),
      h('pre', { class: 'own-prompt' }, PROMPT),
      h('button', { class: 'btn btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(PROMPT); toast('Kopieret', { type: 'ok', ms: 1400 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } } }, icon('copy'), 'Kopiér prompt')));
  };
  drawLands(); drawSource();
  const quality = segmented([{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'Høj' }], w().quality || 'normal', (v) => setWorld({ quality: v }), { label: 'Billedkvalitet' });
  const locBox = h('div');
  const drawLoc = () => {
    clear(locBox);
    if (w().useLocation && typeof w().lat === 'number') {
      locBox.append(h('span', { class: 'chip chip-ok' }, icon('mapPin'), `Breddegrad ${w().lat}°`), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { setWorld({ useLocation: false, lat: null }); drawLoc(); refresh(); } }, 'Glem placering'));
    } else {
      const b = h('button', { class: 'btn btn-sm' }, icon('mapPin'), 'Brug min placering');
      b.addEventListener('click', busy(b, async () => {
        try { const lat = await requestLocation(); toast('Placering gemt', { type: 'ok', text: `Kun breddegraden (${lat}°) gemmes – til halvkugle og dagslængde.` }); drawLoc(); refresh(); }
        catch (e) { toast('Ingen placering', { type: 'warn', text: e.message }); }
      }));
      locBox.appendChild(b);
    }
  };
  drawLoc();
  refresh();
  const parallax = switchControl({ checked: w().parallax, label: 'Dybdeeffekt (parallax)', onChange: (v) => setWorld({ parallax: v }) });
  return h('div', { class: 'stack', dataset: { tour: 'world-settings' } },
    h('section', { class: 'glass panel world-hero' }, preview, h('div', { class: 'world-hero-text' }, h('h2', { class: 'panel-title' }, 'Den levende verden'), status)),
    h('section', { class: 'glass panel' },
      row('Tema', 'Lys eller mørk brugerflade', theme),
      row('Årstid', 'Automatisk følger datoen (og evt. din placering)', h('div', { class: 'set-stack' }, seasonMode, seasonPick)),
      row('Placering', 'Valgfrit. Kun den afrundede breddegrad gemmes på din konto.', locBox),
      row('Tid på dagen', 'Auto følger dit ur', time),
      row('Vejr', 'Regn, sne og tåge', weather)),
    h('section', { class: 'glass panel' },
      h('h2', { class: 'panel-title' }, 'Baggrund'),
      h('p', { class: 'muted', style: { margin: '4px 0 14px' } }, 'Syv landskaber, der alle følger årstid, tid på dagen og vejr – eller dit eget billede.'),
      landGrid,
      row('Eget billede', 'Et foto eller et billede, du har lavet med AI. Gemmes på din konto og synkroniseres.', imgBox),
      row('Billedkvalitet', 'Høj tegner landskabet i fuld skarphed på store og skarpe skærme (bruger lidt mere strøm)', quality)),
    h('section', { class: 'glass panel' },
      row('Animationer', 'Mængden af partikler og bevægelse', mkRange('intensity', 0, 1, 0.05, 'Animationernes intensitet')),
      row('Baggrundens lysstyrke', 'Dæmp verdenen for mere ro', mkRange('brightness', 0.4, 1.1, 0.05, 'Lysstyrke')),
      row('Dybdeeffekt', 'Landskabet bevæger sig let med musen', parallax),
      row('Bevægelse', 'Reduceret viser et stillbillede og slår overgange fra', motion),
      row('Ydeevne', 'Telefoner og langsomme computere starter i let tilstand, og verdenen skruer selv ned (til sidst et stillbillede), hvis den bliver for tung.', perfControl())));
}

function perfControl() {
  const wrap = h('div', { class: 'set-control' });
  const draw = () => {
    const q = window.__hubtechWorld?.quality ?? 0;
    const label = ['Fuld kvalitet', 'Let reduceret', 'Let tilstand', 'Let tilstand (lav)', 'Stillbillede'][q] || 'Fuld kvalitet';
    clear(wrap);
    wrap.append(h('span', { class: ['chip', q === 0 ? 'chip-ok' : 'chip-warn'] }, label));
    if (q > 0) wrap.append(h('button', { class: 'btn btn-sm', onclick: () => {
      const w = window.__hubtechWorld;
      if (!w) return;
      w.quality = 0; w.saveQuality(); w._frames = 0; w._ema = null; w.rebuild(true); w.startLoop();
      toast('Fuld kvalitet slået til igen', { type: 'ok', text: 'Verdenen skruer selv ned igen, hvis det bliver for tungt.' });
      draw();
    } }, 'Prøv fuld kvalitet'));
  };
  draw();
  return wrap;
}

function integrationsTab() {
  const box = h('div', { class: 'stack' }, h('div', { class: 'skel', style: { height: '160px', borderRadius: 'var(--r-lg)' } }));
  const owner = store.get('user').role === 'owner';
  async function draw() {
    let d;
    try { d = await getIntegrations({ force: true }); } catch (e) { clear(box).appendChild(h('p', { class: 'faint' }, e.message)); return; }
    clear(box);
    const c = d.cursor;
    if (c.restricted) box.appendChild(h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('cube'), 'Cursor'), h('p', { class: 'muted', style: { marginTop: '8px' } }, 'Kun platformens ejer kan se og konfigurere lokale projekter.')));
    else {
      const ta = h('textarea', { class: 'textarea mono', rows: 4, placeholder: '~/Projects\n~/code' });
      ta.value = c.roots.map(r => r.path).join('\n');
      const save = h('button', { class: 'btn btn-primary' }, 'Gem projektmapper');
      save.addEventListener('click', busy(save, async () => {
        try { await api.put('/api/integrations/cursor', { roots: ta.value.split('\n').map(s => s.trim()).filter(Boolean) }); invalidateIntegrations(); toast('Projektmapper gemt', { type: 'ok' }); draw(); }
        catch (e) { errorToast(e, 'Kunne ikke gemme'); }
      }));
      box.appendChild(h('section', { class: 'glass panel' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('cube'), 'Cursor'), h('span', { class: ['chip', c.cursorInstalled ? 'chip-ok' : 'chip-warn'] }, h('span', { class: ['status-dot', c.cursorInstalled ? 'ok' : 'warn'] }), c.cursorInstalled ? 'Forbundet' : 'Ikke fundet')),
        h('dl', { class: 'kv', style: { marginBottom: '16px' } },
          h('dt', null, 'Cursor-data'), h('dd', { class: 'mono' }, c.userDir || `Ikke fundet (søgte i ${c.searched.join(', ')})`),
          h('dt', null, 'cursor-kommando'), h('dd', { class: 'mono' }, c.cli || 'Ikke fundet – bruger cursor://-links'),
          h('dt', null, 'Styresystem'), h('dd', null, c.platform)),
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Ekstra projektmapper (én pr. linje)'), ta, h('div', { class: 'field-hint' }, 'Scannes to niveauer ned efter git-repos og projekter.')),
        save, h('a', { class: 'btn btn-ghost', href: '#/learn/guide/cursor-setup', style: { marginLeft: '8px' } }, icon('help'), 'Opsætningsguide')));
    }
    const urlBlock = (title, ic, key, url, hint) => {
      const inp = h('input', { class: 'input', value: url || '', placeholder: key === 'byteforge' ? 'http://127.0.0.1:8080' : 'https://dit-hubtech-site.dk', disabled: !owner });
      const save = h('button', { class: 'btn', disabled: !owner }, 'Gem');
      save.addEventListener('click', busy(save, async () => {
        try { await api.put(`/api/integrations/${key}/url`, { url: inp.value.trim() }); invalidateIntegrations(); toast('Adresse gemt', { type: 'ok', ms: 1500 }); }
        catch (e) { errorToast(e, 'Kunne ikke gemme'); }
      }));
      return h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '12px' } }, icon(ic), title), h('p', { class: 'muted', style: { marginBottom: '12px' } }, hint), h('div', { class: 'bf-url' }, inp, save));
    };
    box.appendChild(urlBlock('ByteForge', 'anvil', 'byteforge', d.byteforge.url, 'Adressen på din ByteForge-server. Status tjekkes fra HUBTECH-serveren.'));
    box.appendChild(urlBlock('HUBTECH-site', 'hubtech', 'hubtech-site', d.hubtechSite.url, 'Hvor de oprindelige HUBTECH-moduler (Pingochat, GameHub, Kalender …) ligger.'));
  }
  draw();
  return box;
}

function usersTab() {
  const list = h('div', { class: 'list' });
  async function draw() {
    try {
      const { users, signupMode } = await api.get('/api/users');
      clear(list);
      list.appendChild(h('div', { class: 'callout', style: { marginBottom: '12px' } }, icon('info'), h('div', null, h('strong', null, `Tilmelding: ${{ open: 'åben for alle', first: 'kun via ejeren', closed: 'lukket' }[signupMode]}. `), 'Styres med HUBTECH_SIGNUP i .env (open, first eller closed).')));
      users.forEach(u => list.appendChild(h('div', { class: 'row', style: { border: '1px solid var(--line)' } },
        h('span', { class: 'avatar' }, u.avatar),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, u.displayName), h('div', { class: 'row-sub' }, `@${u.username} · ${u.lastLoginAt ? 'sidst aktiv ' + timeAgo(u.lastLoginAt) : 'aldrig logget ind'}`)),
        h('span', { class: ['chip', u.role === 'owner' ? 'chip-info' : ''] }, u.role === 'owner' ? 'Ejer' : 'Medlem'))));
    } catch (e) { clear(list).appendChild(h('p', { class: 'faint' }, e.message)); }
  }
  draw();
  const un = h('input', { class: 'input', autocomplete: 'off', maxlength: 32 }), dn = h('input', { class: 'input', maxlength: 60 }), pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const fUn = fieldEl('Brugernavn', un), fDn = fieldEl('Navn', dn), fPw = fieldEl('Midlertidig adgangskode', pw, 'Del den sikkert. Brugeren kan ændre den under Sikkerhed.');
  const create = h('button', { class: 'btn btn-primary' }, icon('plus'), 'Opret bruger');
  create.addEventListener('click', busy(create, async () => {
    try { await api.post('/api/users', { username: un.value.trim(), displayName: dn.value.trim(), password: pw.value }); un.value = dn.value = pw.value = ''; toast('Bruger oprettet', { type: 'ok' }); draw(); }
    catch (e) { ({ username: fUn, password: fPw }[e.field] || fDn).setError(e.message); }
  }));
  return h('div', { class: 'stack' },
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '12px' } }, 'Brugere'), list),
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '12px' } }, 'Opret en bruger'), h('div', { class: 'grid-2' }, fUn, fDn), fPw, create));
}

const fmtBytes = (n) => n >= 1048576 ? `${(n / 1048576).toLocaleString('da-DK', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;
const BACKUP_KIND = { auto: 'Automatisk', manual: 'Manuel', 'before-restore': 'Før gendannelse', 'before-update': 'Før opdatering' };
const stamp = () => new Date().toISOString().slice(0, 10);

function pickFile(accept) {
  return new Promise((res) => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); }, { once: true });
    document.body.appendChild(inp); inp.click();
  });
}

function myDataPanel() {
  const exportBtn = h('button', { class: 'btn btn-primary' }, icon('download'), 'Eksportér alle mine data');
  exportBtn.addEventListener('click', busy(exportBtn, async () => {
    try {
      const data = await api.get('/api/me/export');
      saveBlob(`hubtech-${data.user.username}-${stamp()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
      toast('Dine data er hentet', { type: 'ok', text: `${data.office.length} Office-filer og ${Object.keys(data.states).length} app-data.` });
    } catch (e) { errorToast(e, 'Eksporten mislykkedes'); }
  }));
  const importBtn = h('button', { class: 'btn' }, icon('upload'), 'Gendan fra eksport');
  importBtn.addEventListener('click', busy(importBtn, async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast('Filen kunne ikke læses', { type: 'bad', text: 'Vælg en .json-fil, som HUBTECH har lavet.' }); return; }
    if (data?.format !== 'hubtech-export') { toast('Ikke en HUBTECH-eksport', { type: 'bad' }); return; }
    if (!await confirmDialog({ title: 'Gendan dine data?', text: `Indstillinger, app-data og ${data.office?.length || 0} Office-filer fra ${new Date((data.exportedAt || 0) * 1000).toLocaleString('da-DK')} lægges ind på din konto. Data med samme navn bliver overskrevet – intet andet slettes.`, confirmLabel: 'Gendan' })) return;
    try {
      const r = await api.post('/api/me/import', data);
      toast('Data gendannet', { type: 'ok', text: `${r.imported.office} Office-filer, ${r.imported.states} app-data.` });
      setTimeout(() => location.reload(), 900);
    } catch (e) { errorToast(e, 'Gendannelsen mislykkedes'); }
  }));
  const zipBtn = h('button', { class: 'btn' }, icon('office'), 'Hent Office-filer som .zip');
  const zipNote = h('div', { class: 'faint small', 'aria-live': 'polite' });
  zipBtn.addEventListener('click', busy(zipBtn, async () => {
    try {
      const { officeZip } = await import('../office/exportall.js');
      const r = await officeZip((i, n, t) => { zipNote.textContent = `Pakker ${i} af ${n}: ${t}`; });
      zipNote.textContent = '';
      if (!r.count && !r.failed.length) { toast('Ingen Office-filer endnu', { text: 'Opret et dokument i HUBTECH Office først.' }); return; }
      saveBlob(`HUBTECH Office ${stamp()}.zip`, r.blob);
      toast('Office-filer hentet', { type: r.failed.length ? 'warn' : 'ok', text: r.failed.length ? `${r.count} filer – kunne ikke pakke: ${r.failed.join(', ')}` : `${r.count} filer som .docx, .xlsx og .pptx.` });
    } catch (e) { zipNote.textContent = ''; errorToast(e, 'Kunne ikke pakke filerne'); }
  }));
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Mine data'),
    h('p', { class: 'muted', style: { margin: '4px 0 14px' } }, 'Tag dine indstillinger, app-data (Opgaver, Noter, Servicehjælp …) og Office-filer med dig – eller læg dem tilbage igen.'),
    h('div', { class: 'desk-actions' }, exportBtn, importBtn, zipBtn), zipNote);
}

function backupPanel() {
  const list = h('div', { class: 'bk-list' }, h('p', { class: 'muted' }, 'Henter…'));
  const info = h('p', { class: 'muted', style: { margin: '4px 0 14px' } });
  async function draw() {
    try {
      const r = await api.get('/api/system/backups');
      info.textContent = `HUBTECH tager automatisk en sikkerhedskopi hver dag og gemmer de ${r.keepAuto} nyeste. Mappe: ${r.folder}`;
      if (!r.backups.length) { h(clear(list), null, h('p', { class: 'muted' }, 'Ingen sikkerhedskopier endnu.')); return; }
      h(clear(list), null, r.backups.map(b => h('div', { class: 'bk-row' },
        h('div', { class: 'bk-main' }, h('b', null, new Date(b.createdAt * 1000).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' })),
          h('span', { class: 'faint' }, `${BACKUP_KIND[b.kind] || b.kind} · ${fmtBytes(b.size)}`)),
        h('a', { class: 'btn btn-sm', href: `/api/system/backups/${encodeURIComponent(b.name)}`, download: b.name, title: 'Hent filen' }, icon('download'), h('span', { class: 'hide-sm' }, 'Hent')),
        h('button', { class: 'btn btn-sm', onclick: () => restore({ name: b.name }, new Date(b.createdAt * 1000).toLocaleString('da-DK')) }, icon('restore'), h('span', { class: 'hide-sm' }, 'Gendan')))));
    } catch (e) { h(clear(list), null, h('p', { class: 'faint' }, e.message)); }
  }
  async function restore(src, label) {
    if (!await confirmDialog({ title: 'Gendan hele HUBTECH?', text: `Alle brugeres data bliver sat tilbage til ${label}. HUBTECH tager først en sikkerhedskopi af, hvordan det ser ud nu, så du kan fortryde. Du skal måske logge ind igen.`, confirmLabel: 'Gendan', danger: true })) return;
    try {
      let r;
      if (src.file) {
        const res = await fetch('/api/system/restore', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/octet-stream' }, body: src.file });
        r = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(r.error || 'Gendannelsen mislykkedes'), { status: res.status });
      } else r = await api.post('/api/system/restore', { name: src.name });
      toast('HUBTECH er gendannet', { type: 'ok', text: 'Siden genindlæses.' });
      setTimeout(() => location.reload(), 1200);
    } catch (e) { errorToast(e, 'Gendannelsen mislykkedes'); }
  }
  const now = h('button', { class: 'btn btn-primary' }, icon('plus'), 'Lav sikkerhedskopi nu');
  now.addEventListener('click', busy(now, async () => {
    try { await api.post('/api/system/backups', {}); toast('Sikkerhedskopi gemt', { type: 'ok' }); draw(); } catch (e) { errorToast(e, 'Kunne ikke tage sikkerhedskopi'); }
  }));
  const fromFile = h('button', { class: 'btn' }, icon('upload'), 'Gendan fra fil …');
  fromFile.addEventListener('click', async () => {
    const f = await pickFile('.db,.sqlite,application/vnd.sqlite3,application/octet-stream');
    if (f) restore({ file: f }, `filen “${f.name}”`);
  });
  draw();
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Sikkerhedskopier af hele HUBTECH'), info,
    h('div', { class: 'desk-actions', style: { marginBottom: '14px' } }, now, fromFile), list);
}

function syncPanel() {
  const url = h('input', { class: 'input', type: 'url', placeholder: 'https://min-pc.tailnet.ts.net eller http://192.168.1.20:8090', spellcheck: 'false', autocomplete: 'url' });
  const user = h('input', { class: 'input', value: store.get('user').username, autocomplete: 'username', spellcheck: 'false' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const fU = fieldEl('Adresse på den anden HUBTECH', url), fN = fieldEl('Brugernavn dér', user), fP = fieldEl('Adgangskode dér', pass, 'Bruges kun nu og gemmes ikke.');
  api.get('/api/sync').then(r => { if (r.url && !url.value) url.value = r.url; }).catch(() => {});
  const IV = [{ value: 5, label: '5 min' }, { value: 15, label: '15 min' }, { value: 60, label: '1 time' }];
  let interval = 15;
  const auto = h('div', { class: 'sync-auto' }, h('p', { class: 'muted' }, 'Henter status…'));
  const onceFields = h('div');
  const when = (t) => t ? new Date(t * 1000).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
  const need = () => {
    if (!url.value.trim()) { fU.setError('Skriv adressen.'); return false; }
    if (!pass.value) { fP.setError('Skriv adgangskoden.'); return false; }
    return true;
  };
  const drawAuto = (st) => {
    clear(auto); clear(onceFields);
    if (st.enabled) onceFields.append(fU, h('div', { class: 'grid-2' }, fN, fP));
    if (st.enabled) {
      const l = st.last;
      auto.append(
        h('div', { class: ['desk-status', l && !l.ok ? 'is-bad' : 'is-on'] }, icon(l && !l.ok ? 'alert' : 'checkCircle'),
          h('span', null, h('b', null, 'Automatisk synkronisering er slået til. '), `Med ${st.url}.`)),
        h('p', { class: 'muted sync-last' }, !l ? 'Ikke synkroniseret endnu.' : l.ok ? `Sidst: ${when(l.at)} · ${l.pulled} hentet, ${l.pushed} sendt.` : `Sidste forsøg ${when(l.at)} mislykkedes: ${l.error}`),
        h('div', { class: 'sync-row' }, h('span', { class: 'field-label' }, 'Hvor tit'), segmented(IV, st.interval, async (v) => { try { drawAuto(await api.put('/api/sync/auto', { interval: Number(v) })); } catch (e) { errorToast(e); } }, { label: 'Hvor tit' })),
        h('div', { class: 'desk-actions' }, now, off));
    } else {
      auto.append(
        h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'Telefon og computer holder sig selv opdateret: hver gang appen åbnes og med faste mellemrum hentes det nyeste fra den anden, og dine ændringer sendes derover. Har du rettet samme app begge steder, vinder den nyeste ændring.'),
        fU, h('div', { class: 'grid-2' }, fN, fP),
        h('div', { class: 'sync-row' }, h('span', { class: 'field-label' }, 'Hvor tit'), segmented(IV, interval, (v) => { interval = Number(v); }, { label: 'Hvor tit' })),
        h('div', { class: 'desk-actions' }, on));
    }
  };
  const on = h('button', { class: 'btn btn-primary' }, icon('refresh'), 'Slå automatisk synkronisering til');
  on.addEventListener('click', busy(on, async () => {
    if (!need()) return;
    try {
      const r = await api.post('/api/sync/auto', { url: url.value.trim(), username: user.value.trim(), password: pass.value, interval });
      pass.value = '';
      drawAuto(r);
      const f = r.first || {};
      toast(f.ok ? 'Synkroniseret' : 'Slået til – men første synkronisering fejlede', { type: f.ok ? 'ok' : 'warn', text: f.ok ? `${f.pulled} hentet, ${f.pushed} sendt.` : f.error });
      if (f.ok && f.pulled) setTimeout(() => location.reload(), 1200);
    } catch (e) { (e.data?.field === 'url' ? fU : fP).setError(e.message); }
  }));
  const now = h('button', { class: 'btn btn-primary' }, icon('refresh'), 'Synkronisér nu');
  now.addEventListener('click', busy(now, async () => {
    try {
      const r = await api.post('/api/sync/auto/run', { wait: true });
      toast(r.ok ? 'Synkroniseret' : 'Synkronisering mislykkedes', { type: r.ok ? 'ok' : 'bad', text: r.ok ? `${r.pulled} hentet, ${r.pushed} sendt.` : r.error });
      drawAuto(await api.get('/api/sync/auto'));
      if (r.ok && r.pulled) setTimeout(() => location.reload(), 1200);
    } catch (e) { errorToast(e); }
  }));
  const off = h('button', { class: 'btn btn-ghost' }, icon('x'), 'Slå fra');
  off.addEventListener('click', busy(off, async () => {
    if (!await confirmDialog({ title: 'Slå automatisk synkronisering fra?', text: 'Dine data bliver liggende begge steder. Computeren glemmer denne enheds synkroniseringsnøgle.', confirmLabel: 'Slå fra' })) return;
    try { drawAuto(await api.del('/api/sync/auto')); } catch (e) { errorToast(e); }
  }));
  api.get('/api/sync/auto').then(drawAuto).catch(() => drawAuto({ enabled: false }));

  const run = (dir) => async () => {
    if (!need()) return;
    const ok = await confirmDialog({ title: dir === 'pull' ? 'Hent data herover?' : 'Send data derover?', text: dir === 'pull' ? 'Dine data fra den anden HUBTECH lægges ind her. Data med samme navn bliver overskrevet; intet andet slettes.' : 'Dine data herfra lægges ind på den anden HUBTECH. Data med samme navn bliver overskrevet dér; intet andet slettes.', confirmLabel: dir === 'pull' ? 'Hent' : 'Send' });
    if (!ok) return;
    try {
      const r = await api.post(`/api/sync/${dir}`, { url: url.value.trim(), username: user.value.trim(), password: pass.value });
      pass.value = '';
      const n = r.imported || {};
      toast(dir === 'pull' ? 'Data hentet' : 'Data sendt', { type: 'ok', text: `${n.office || 0} Office-filer, ${n.states || 0} app-data, ${n.files || 0} billeder.` });
      if (dir === 'pull') setTimeout(() => location.reload(), 900);
    } catch (e) { (e.data?.field === 'url' ? fU : fP).setError(e.message); }
  };
  const pull = h('button', { class: 'btn' }, icon('download'), 'Hent alt herover');
  const push = h('button', { class: 'btn' }, icon('upload'), 'Send alt derover');
  pull.addEventListener('click', busy(pull, run('pull')));
  push.addEventListener('click', busy(push, run('push')));
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Synkronisér med en anden HUBTECH'),
    h('p', { class: 'muted', style: { margin: '4px 0 14px' } }, 'Fx din telefon og din computer – adressen finder du på computeren under Indstillinger → Om → Adgang fra andre enheder.'),
    auto,
    h('details', { class: 'sync-once' }, h('summary', null, 'Engangs-overførsel (alt på én gang)'),
      h('p', { class: 'muted' }, 'Henter eller sender alle dine data på én gang. Data med samme navn overskrives på modtagersiden.'), onceFields,
      h('div', { class: 'desk-actions' }, pull, push)));
}

function dataTab() {
  const owner = store.get('user').role === 'owner';
  return h('div', { style: { display: 'grid', gap: '16px' } }, myDataPanel(), syncPanel(), owner ? backupPanel() : null);
}

function desktopPanel() {
  const body = h('div', { class: 'desk-body' }, h('p', { class: 'muted' }, 'Henter…'));
  const panel = h('section', { class: 'glass panel desk-panel' },
    h('div', { class: 'desk-head' },
      h('img', { src: '/assets/icons/app-192.png', alt: '', width: 56, height: 56, class: 'desk-logo' }),
      h('div', null, h('h2', { class: 'panel-title' }, 'HUBTECH som program'),
        h('p', { class: 'muted', style: { margin: '2px 0 0' } }, 'Eget vindue, eget ikon på skrivebordet – ingen browserfaner.'))),
    body);
  let off = () => {};
  const render = (info) => {
    const app = isAppWindow();
    const rows = [];
    rows.push(h('div', { class: ['desk-status', app ? 'is-on' : null] }, icon(app ? 'checkCircle' : 'info'),
      h('span', null, app ? 'Du bruger HUBTECH i sit eget programvindue.' : 'Du bruger HUBTECH i en almindelig browserfane.')));
    const actions = h('div', { class: 'desk-actions' });
    if (!app && canInstall()) {
      actions.append(h('button', { class: 'btn btn-primary', onclick: async () => {
        const r = await promptInstall();
        if (r === 'accepted') toast('HUBTECH er installeret', { type: 'ok', text: 'Du finder ikonet i startmenuen og på skrivebordet.' });
      } }, icon('download'), 'Installér HUBTECH'));
    }
    if (info?.canShutdown || (info?.launcher && app)) {
      actions.append(h('button', { class: 'btn', onclick: async () => {
        if (!await confirmDialog({ title: 'Luk HUBTECH?', text: 'Serveren stopper (ByteForge lukker også). Åbn HUBTECH igen fra ikonet på skrivebordet.', confirmLabel: 'Luk HUBTECH', danger: true })) return;
        try {
          const r = await shutdown(info);
          if (r === 'close-manually') toast('Luk vinduet med krydset', { text: 'Serveren stopper, når vinduet er lukket.' });
          else if (r === 'stopped') toast('HUBTECH lukker…', { text: 'Du kan nu lukke vinduet.' });
        } catch (e) { errorToast(e, 'Kunne ikke lukke HUBTECH'); }
      } }, icon('power'), 'Luk HUBTECH'));
    }
    if (actions.childNodes.length) rows.push(actions);
    rows.push(h('div', { class: 'desk-steps' },
      h('h3', null, 'Sådan får du HUBTECH-ikonet på skrivebordet'),
      h('ol', null,
        h('li', null, 'Åbn mappen ', h('b', null, 'hubtech'), ' og dobbeltklik på ', h('b', null, 'Installer HUBTECH.pyw'), ' (kun første gang).'),
        h('li', null, 'Herefter starter du HUBTECH med ikonet ', h('b', null, 'HUBTECH'), ' på skrivebordet eller i startmenuen.'),
        h('li', null, 'Når du lukker vinduet, lukker serveren automatisk.')),
      h('p', { class: 'muted small' }, 'Kræver Python 3 og Microsoft Edge eller Google Chrome. Uden dem åbner HUBTECH i din normale browser.')));
    h(clear(body), null, rows);
  };
  systemInfo().then((info) => {
    if (info?.android) {   // inside the Android app: it already is an app
      h(clear(body), null, h('div', { class: 'desk-status is-on' }, icon('checkCircle'), h('span', null, `HUBTECH kører som app på din telefon – uden computeren. Version ${info.version}.`)),
        h('p', { class: 'faint small' }, 'Hent eller send dine data til computeren under Indstillinger → Data & sikkerhedskopi → Synkronisér.'));
      return;
    }
    render(info); off = onInstallChange(() => render(info));
  });
  queueMicrotask(() => { const mo = new MutationObserver(() => { if (!panel.isConnected) { off(); mo.disconnect(); } }); mo.observe(document.body, { childList: true, subtree: true }); });
  return panel;
}

async function qrSvg(text, size = 168) {
  const { loadScript } = await import('../office/store.js');
  const qrcode = await loadScript('vendor/qrcode.js', 'qrcode');
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  const n = q.getModuleCount(), cell = size / (n + 8);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${((c + 4) * cell).toFixed(2)} ${((r + 4) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(NS, 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${size} ${size}`); svgEl.setAttribute('width', size); svgEl.setAttribute('height', size);
  svgEl.setAttribute('role', 'img'); svgEl.setAttribute('aria-label', `QR-kode til ${text}`); svgEl.classList.add('qr');
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('rx', 10); bg.setAttribute('fill', '#fff');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#0a1422');
  svgEl.append(bg, p);
  return svgEl;
}

function networkPanel() {
  const body = h('div', { class: 'desk-body' });
  const panel = h('section', { class: 'glass panel', hidden: true },
    h('div', { class: 'desk-head' }, h('span', { class: 'net-ico' }, icon('globe')),
      h('div', null, h('h2', { class: 'panel-title' }, 'HUBTECH på telefonen'),
        h('p', { class: 'muted', style: { margin: '2px 0 0' } }, 'Brug HUBTECH fra din telefon eller tablet – mod serveren her på computeren.'))),
    body);
  async function draw() {
    let n;
    try { n = await api.get('/api/system/network'); } catch { return; }
    panel.hidden = false;
    const sw = switchControl({ checked: n.lanAccess, label: 'Tillad adgang fra andre enheder på netværket', onChange: async (on) => {
      if (on && !await confirmDialog({ title: 'Tillad adgang fra andre enheder?', text: 'HUBTECH kan så nås af alle på samme netværk (de skal stadig logge ind). Brug det kun på netværk, du stoler på – fx dit eget hjemmenetværk. Serveren genstarter.', confirmLabel: 'Tillad' })) { draw(); return; }
      try {
        const r = await api.put('/api/system/network', { lanAccess: on });
        toast(on ? 'Adgang fra netværket slået til' : 'Kun denne computer', { type: 'ok', text: r.restarting ? 'Serveren genstarter …' : 'Genstart HUBTECH, for at det virker.' });
        if (r.restarting) { await new Promise(r2 => setTimeout(r2, 1500)); for (let i = 0; i < 40; i++) { await new Promise(r2 => setTimeout(r2, 700)); try { if ((await fetch('/api/health', { cache: 'no-store' })).ok) break; } catch { /* */ } } draw(); }
      } catch (e) { errorToast(e, 'Kunne ikke ændre indstillingen'); }
    } });
    const rows = [row('Tillad adgang fra andre enheder på netværket', n.hostFromEnv ? 'Styres af HUBTECH_HOST i .env.' : 'Telefoner og tablets på samme wifi kan åbne HUBTECH. De skal logge ind som normalt.', sw)];
    if (n.open && n.urls.length) {
      const qrBox = h('div', { class: 'net-qr' });
      const url = n.urls[0];
      qrSvg(url).then(svgEl => qrBox.prepend(svgEl)).catch(() => {});
      qrBox.append(h('div', null, h('b', null, 'Scan med telefonens kamera'), h('div', { class: 'mono net-url' }, url),
        n.urls.length > 1 ? h('div', { class: 'faint small' }, `Andre adresser: ${n.urls.slice(1).join(' · ')}`) : null,
        h('p', { class: 'faint small' }, 'Virker i telefonens browser. For at installere HUBTECH som app på telefonen (eget ikon, offline) kræver Android HTTPS – se nedenfor.')));
      rows.push(qrBox);
    } else if (n.lanAccess && !n.open) rows.push(h('p', { class: 'faint' }, 'Genstart HUBTECH, så serveren lytter på netværket.'));
    const ts = n.tailscale || {};
    const tsBody = ts.installed && ts.running && ts.url
      ? h('div', { class: 'net-qr' }, h('div', { class: 'net-ts-qr' }), h('div', null,
        h('b', null, 'Din HTTPS-adresse via Tailscale'), h('div', { class: 'mono net-url' }, ts.url),
        h('p', { class: 'faint small' }, 'Har du ikke gjort det endnu, så kør én gang i en terminal på denne computer:'), h('code', { class: 'net-cmd' }, `tailscale serve --bg ${n.port}`),
        h('p', { class: 'faint small' }, 'Åbn adressen i Chrome på telefonen (med Tailscale slået til) og vælg “Installér app” / “Føj til startskærm”.')))
      : h('ol', { class: 'net-steps' },
        h('li', null, 'Installér ', h('b', null, 'Tailscale'), ' (gratis) på computeren og på telefonen, og log ind med samme konto.'),
        h('li', null, 'Kør én gang i en terminal på computeren: ', h('code', { class: 'net-cmd' }, `tailscale serve --bg ${n.port}`)),
        h('li', null, 'Åbn https-adressen, Tailscale viser (…ts.net), i Chrome på telefonen, og vælg “Installér app”.'),
        h('li', null, 'Kom tilbage hertil – så vises adressen og en QR-kode.'));
    if (ts.url) qrSvg(ts.url).then(svgEl => tsBody.querySelector('.net-ts-qr')?.replaceWith(svgEl)).catch(() => {});
    rows.push(h('details', { class: 'net-https', open: !!ts.url }, h('summary', null, icon('lock'), ' Installér HUBTECH som app på telefonen (HTTPS)'), tsBody,
      h('p', { class: 'faint small' }, 'Tailscale giver et rigtigt HTTPS-certifikat og et privat netværk kun for dine egne enheder – også når du ikke er hjemme. Du skal ikke installere certifikater selv, og HUBTECH skal ikke åbnes mod internettet.')));
    if (n.open && n.signup === 'open') rows.push(h('div', { class: 'callout warn' }, icon('alert'), h('div', null, 'Tilmelding er åben (HUBTECH_SIGNUP=open). Alle på netværket kan oprette en konto. Overvej “first”.')));
    h(clear(body), null, rows);
  }
  draw();
  return panel;
}

function updatePanel() {
  const body = h('div', { class: 'desk-body' });
  const panel = h('section', { class: 'glass panel', hidden: true },
    h('h2', { class: 'panel-title' }, 'Opdatering'),
    h('p', { class: 'muted', style: { margin: '4px 0 14px' } }, 'Har du fået en nyere HUBTECH som .zip-fil? Vælg den her. Dine data i .hubtech-mappen bliver ikke rørt, og der tages en sikkerhedskopi før installationen.'),
    body);
  const pick = h('button', { class: 'btn btn-primary' }, icon('upload'), 'Søg efter opdatering i en zip-fil …');
  const note = h('div', { 'aria-live': 'polite' });
  pick.addEventListener('click', async () => {
    const f = await pickFile('.zip,application/zip');
    if (!f) return;
    h(clear(note), null, h('p', { class: 'muted' }, `Tjekker ${f.name} …`));
    try {
      const res = await fetch('/api/system/update/check', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/zip' }, body: f });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(j.error || 'Kunne ikke læse zip-filen'), { status: res.status });
      showCheck(j.update, j.restartable);
    } catch (e) { clear(note); errorToast(e, 'Kunne ikke tjekke opdateringen'); }
  });
  function showCheck(u, restartable) {
    const state = u.newer ? ['checkCircle', `Ny version ${u.version} – du har ${u.current}.`, 'is-on']
      : u.same ? ['info', `Samme version (${u.version}) som du allerede har.`, ''] : ['alert', `Ældre version (${u.version}) – du har ${u.current}.`, ''];
    const install = h('button', { class: ['btn', u.newer ? 'btn-primary' : null] }, icon('download'), u.newer ? 'Installér og genstart' : 'Installér alligevel');
    install.addEventListener('click', busy(install, async () => {
      if (!await confirmDialog({ title: `Installér HUBTECH ${u.version}?`, text: `${u.changed} af ${u.files} filer bliver opdateret. HUBTECH tager først en sikkerhedskopi af databasen og af de gamle programfiler (mappen .update-backup), og ${restartable ? 'genstarter bagefter af sig selv' : 'skal genstartes bagefter'}.`, confirmLabel: 'Installér', danger: !u.newer })) return;
      try {
        const r = await api.post('/api/system/update/install', { id: u.id });
        h(clear(note), null, h('div', { class: 'desk-status is-on' }, icon('refresh'), h('span', null, r.restarting ? `HUBTECH ${r.version} er installeret (${r.written} filer). Genstarter …` : `HUBTECH ${r.version} er installeret. Genstart HUBTECH for at bruge den.`)));
        if (r.restarting) waitForRestart(r.version);
      } catch (e) { errorToast(e, 'Opdateringen mislykkedes'); }
    }));
    h(clear(note), null, h('div', { class: ['desk-status', state[2]] }, icon(state[0]), h('span', null, state[1], h('span', { class: 'faint' }, ` · ${u.changed} ændrede filer`))), h('div', { class: 'desk-actions', style: { marginTop: '10px' } }, install));
  }
  async function waitForRestart(version) {
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try { const r = await fetch('/api/health', { cache: 'no-store' }); if (r.ok && (await r.json()).version === version) { location.reload(); return; } } catch { /* still restarting */ }
    }
    toast('HUBTECH svarer ikke endnu', { type: 'warn', text: 'Start HUBTECH igen fra ikonet på skrivebordet.' });
  }
  systemInfo().then((info) => {
    if (!info?.canShutdown) return;    // owner, on the computer HUBTECH runs on
    panel.hidden = false;
    h(clear(body), null, h('div', { class: 'desk-actions' }, pick), note);
  });
  return panel;
}

/** Only in the Android app: notifications, app lock, updates, widget and shortcuts. */
function phonePanel() {
  if (!droid.isAndroidApp()) return null;
  const info = droid.appInfo();
  const notifyBox = h('div', { class: 'set-control' });
  const drawNotify = () => {
    const st = droid.notificationState();
    clear(notifyBox);
    if (st === 'granted') notifyBox.append(h('span', { class: 'chip chip-ok' }, icon('check'), 'Slået til'));
    else notifyBox.append(h('button', { class: 'btn btn-sm', onclick: async () => { const ok = await droid.requestNotifications(); toast(ok ? 'Notifikationer er slået til' : 'Notifikationer blev ikke tilladt', { type: ok ? 'ok' : 'warn', text: ok ? 'Påmindelser kommer nu, også når appen er lukket.' : 'Du kan slå dem til under Indstillinger → Apps → HUBTECH på telefonen.' }); drawNotify(); } }, icon('bell'), 'Slå notifikationer til'));
  };
  drawNotify();
  const lockOk = droid.lockAvailable();
  const lock = lockOk ? switchControl({ checked: droid.lockEnabled(), label: 'Lås med fingeraftryk eller ansigt', onChange: (v) => { droid.setLock(v); toast(v ? 'App-lås slået til' : 'App-lås slået fra', { type: 'ok', text: v ? 'HUBTECH beder om fingeraftryk, ansigt eller skærmlås, når den har været lukket i mere end 30 sekunder.' : '' }); } })
    : h('span', { class: 'faint' }, 'Kræver at telefonen har skærmlås (og evt. fingeraftryk/ansigt) slået til.');
  const upBox = h('div', { class: 'set-stack' });
  const check = h('button', { class: 'btn btn-sm' }, icon('refresh'), 'Søg efter opdatering');
  check.addEventListener('click', busy(check, async () => {
    try {
      const r = await api.get('/api/system/android-update');
      clear(upBox); upBox.append(check);
      if (!r.ok) { upBox.append(h('p', { class: 'faint', style: { margin: 0 } }, r.error)); return; }
      if (r.versionCode > (info.versionCode || 0)) {
        upBox.append(h('button', { class: 'btn btn-primary btn-sm', onclick: () => { droid.installUpdate(r.apkUrl); } }, icon('download'), `Installér ${r.version} (build ${r.build})`),
          h('p', { class: 'faint', style: { margin: 0 } }, 'Den nye version installeres oven på den gamle – dine data bliver liggende.'));
      } else upBox.append(h('span', { class: 'chip chip-ok' }, icon('check'), 'Du har den nyeste version'));
    } catch (e) { errorToast(e); }
  }));
  upBox.append(check);
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Telefonen'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, `HUBTECH-appen ${info.versionName || ''}`.trim()),
    row('Påmindelser', 'Deadlines og aftaler som notifikationer – også når appen er lukket', notifyBox),
    row('App-lås', 'Fingeraftryk, ansigt eller telefonens kode, når du åbner HUBTECH', lock),
    row('Opdatering', 'Nye versioner bygges på GitHub og kan installeres herfra', upBox),
    row('Widget og genveje', 'Hold fingeren på HUBTECH-ikonet for “Start ur”, “Ny opgave”, “Ny note” og “Kalender”. Widgetten “I dag” finder du under widgets på hjemmeskærmen.', h('span', { class: 'chip' }, icon('apps'), 'Indbygget')),
    row('Del til HUBTECH', 'Del tekst, links og billeder fra andre apps – vælg HUBTECH i delemenuen', h('span', { class: 'chip' }, icon('upload'), 'Indbygget')));
}

function aboutTab() {
  return h('div', { class: 'stack', style: { display: 'grid', gap: '16px' } },
    phonePanel(),
    desktopPanel(),
    networkPanel(),
    updatePanel(),
    h('section', { class: 'glass panel' },
      h('h2', { class: 'panel-title', style: { marginBottom: '12px' } }, 'Om HUBTECH'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Version'), h('dd', null, '1.2.0'),
        h('dt', null, 'Server'), h('dd', null, 'Python (kun standardbiblioteket) · SQLite'),
        h('dt', null, 'Data'), h('dd', null, 'Lokal database (standard: ~/.hubtech/hubtech.db)'),
        h('dt', null, 'Apps'), h('dd', null, 'HUBTECH Office, Servicehjælp, ByteForge, CircuitPilot, Cursor Projekter, Opgaver, Noter, Fokus, Værktøjskasse, Guides & Læring'),
        h('dt', null, 'Skrifttyper'), h('dd', null, 'Sora, Manrope og JetBrains Mono – lokalt hostet (SIL OFL)')),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' } },
        h('a', { class: 'btn', href: '#/learn/guide/privacy' }, icon('shield'), 'Data & privatliv'),
        h('a', { class: 'btn', href: '#/learn/guide/add-app' }, icon('rocket'), 'Tilføj en app'))));
}

export default {
  title: 'Indstillinger',
  render(ctx) {
    const owner = store.get('user').role === 'owner';
    const tabs = TABS.filter(t => !t.owner || owner);
    const tab = tabs.find(t => t.id === ctx.params.tab) ? ctx.params.tab : 'profile';
    const body = { profile: profileTab, security: securityTab, world: worldTab, integrations: integrationsTab, users: usersTab, data: dataTab, about: aboutTab }[tab]();
    return h('div', { class: 'page settings' },
      h('div', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Indstillinger'), h('h1', null, TABS.find(t => t.id === tab).label))),
      h('div', { class: 'settings-layout' },
        h('nav', { class: 'settings-nav glass', 'aria-label': 'Indstillinger' }, tabs.map(t => h('a', { class: 'nav-item', href: `#/settings/${t.id}`, 'aria-current': t.id === tab ? 'page' : null }, icon(t.icon), h('span', null, t.label)))),
        h('div', { class: 'settings-body' }, body)));
  },
};
