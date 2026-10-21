/** Indstillinger: profile, security, appearance & world, integrations, users, about. */
import { h, clear, timeAgo, ava } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { qrSvg } from '../features/qr.js';
import { logout } from '../features/auth.js';
import { friendWizard } from '../features/friendsetup.js';
import { deleteUserDialog } from '../features/userdelete.js';
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
import { getCall, setCall, getNotify, setNotify, getStudio, setStudio, mediaConstraints, applySpeaker } from '../features/appsettings.js';
import * as piano from '../features/piano.js';
import { SCENES, STYLES } from '../world/scenes.js';
import { SCALES, BACKDROPS, getScale, setScale, getBackdrop, setBackdrop, canBeTransparent, autoZoom } from '../core/display.js';

const AVATARS = ['⚡', '🦊', '🐺', '🦁', '🐯', '🐻', '🦅', '🐉', '🔧', '💡', '🛸', '🔬', '🎯', '🚀', '🏆', '🌊', '🤖', '🔌', '🧠', '🌲', '🏔️', '🍂', '❄️', '🌸', '☀️'];
const TABS = [
  { id: 'profile', label: 'Profil', icon: 'user' },
  { id: 'security', label: 'Sikkerhed', icon: 'lock' },
  { id: 'world', label: 'Verden & udseende', icon: 'mountain' },
  { id: 'apps', label: 'Apps og opkald', icon: 'phone' },
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
  // ── profile picture from this device ──
  const photoBox = h('div', { class: 'photo-box' });
  const drawPhoto = () => {
    const cur = store.get('user').avatar;
    const pic = String(cur || '').startsWith('/api/avatars/');
    const pick = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', hidden: true, id: 'avatar-file' });
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'user', hidden: true, id: 'avatar-cam' });
    const onFile = async (inp) => {
      const f = inp.files?.[0]; inp.value = '';
      if (!f) return;
      try {
        const { cropAvatar } = await import('../features/avatarcrop.js');
        const blob = await cropAvatar(f);
        if (!blob) return;
        const r = await fetch('/api/me/avatar', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type, 'X-Requested-With': 'hubtech' }, credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Billedet kunne ikke gemmes.');
        store.set('user', d.user); avatar = d.user.avatar;
        toast('Profilbilledet er gemt', { type: 'ok', text: 'Det vises nu overalt i HUBTECH – også for dine venner.' });
        drawPhoto();
      } catch (e) { toast('Billedet kunne ikke bruges', { type: 'bad', text: e.message }); }
    };
    pick.addEventListener('change', () => onFile(pick));
    cam.addEventListener('change', () => onFile(cam));
    const remove = h('button', { class: 'btn btn-sm btn-ghost' }, icon('trash'), 'Fjern billede');
    remove.addEventListener('click', busy(remove, async () => {
      try { const { user } = await api.del('/api/me/avatar'); store.set('user', user); avatar = user.avatar; toast('Profilbilledet er fjernet', { type: 'ok' }); drawPhoto(); }
      catch (e) { toast('Kunne ikke fjerne billedet', { type: 'bad', text: e.message }); }
    }));
    h(clear(photoBox), null,
      h('span', { class: 'avatar avatar-photo' }, ava(cur)),
      h('div', { class: 'set-stack' },
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
          h('label', { class: 'btn btn-sm btn-primary', for: 'avatar-file' }, icon('upload'), pic ? 'Skift billede' : 'Upload billede'),
          matchMedia('(pointer: coarse)').matches ? h('label', { class: 'btn btn-sm', for: 'avatar-cam' }, icon('camera'), 'Tag et billede') : null,
          pic ? remove : null),
        h('p', { class: 'faint', style: { margin: 0 } }, 'JPG, PNG eller WebP fra din computer, tablet eller telefon. Du kan beskære det, før det gemmes.')),
      pick, cam);
  };
  drawPhoto();
  const save = h('button', { class: 'btn btn-primary' }, 'Gem profil');
  save.addEventListener('click', busy(save, async () => {
    if (!name.value.trim()) return fName.setError('Skriv dit navn.');
    try {
      const body = { displayName: name.value.trim(), email: email.value.trim() };
      if (avatar && !String(avatar).startsWith('/api/avatars/')) body.avatar = avatar;   // a picture is saved by itself when uploaded
      const { user } = await api.patch('/api/me', body);
      store.set('user', user);
      toast('Profil gemt', { type: 'ok' });
    } catch (e) { (e.field === 'email' ? fEmail : fName).setError(e.message); }
  }));
  return h('div', { class: 'stack' },
    h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title', style: { marginBottom: '16px' } }, 'Din profil'),
      h('div', { class: 'grid-2' }, fName, fEmail),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Profilbillede'), photoBox),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Eller vælg en figur'), grid),
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
  const outBtn = h('button', { class: 'btn btn-primary' }, icon('logout'), 'Log ud');
  outBtn.addEventListener('click', () => logout());
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
    h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Log ud'), outBtn), h('p', { class: 'muted', style: { margin: 0 } }, 'Log ud af HUBTECH på denne enhed. Dine data bliver liggende – du logger bare ind igen næste gang.')),
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
      const on = (w().source || 'landscape') === 'landscape' && (w().landscape || 'valley') === k;
      const b = h('button', { type: 'button', class: ['land-tile', on && 'is-on'], role: 'radio', 'aria-checked': String(on), onclick: () => { setWorld({ landscape: k, source: 'landscape' }); drawLands(); drawScenes(); drawSource(); refresh(); drawStyle(); } }, cv, h('span', null, label));
      requestAnimationFrame(() => paintStill(cv, { season: d.season, time: d.time, landscape: k, focusX: 0.5, focusY: 0.4 }));
      return b;
    }));
  };
  // ── theme scenes: cities, Japan, minimal, elegant ──
  const sceneGrid = h('div', { class: 'land-grid theme-grid', role: 'radiogroup', 'aria-label': 'Temaer' });
  const drawScenes = () => {
    const d = describeWorld();
    h(clear(sceneGrid), null, Object.entries(SCENES).map(([k, sc]) => {
      const cv = h('canvas', { 'aria-hidden': 'true' });
      const on = w().source === 'scene' && w().scene === k;
      const b = h('button', { type: 'button', class: ['land-tile', on && 'is-on'], role: 'radio', 'aria-checked': String(on), title: sc.desc,
        onclick: () => { setWorld({ source: 'scene', scene: k }); drawScenes(); drawLands(); drawSource(); refresh(); drawStyle(); } }, cv, h('span', null, sc.name));
      requestAnimationFrame(() => import('../world/cityscape.js').then(m => m.paintScene(cv, k, { time: ['tokyo', 'neon', 'future'].includes(k) ? 'night' : d.time, light: document.documentElement.dataset.theme === 'light' })));
      return b;
    }));
  };
  const styleSel = h('select', { class: 'select', 'aria-label': 'Stil' });
  const drawStyle = () => {
    const auto = w().source === 'scene' && SCENES[w().scene] ? SCENES[w().scene].style : 'standard';
    h(clear(styleSel), null, STYLES.map(([v, l]) => h('option', { value: v, selected: (w().style || 'auto') === v }, v === 'auto' ? `${l} (${STYLES.find(x => x[0] === auto)?.[1] || 'Standard'})` : l)));
  };
  styleSel.addEventListener('change', () => { setWorld({ style: styleSel.value }); drawStyle(); });
  drawStyle();
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
  drawLands(); drawScenes(); drawSource();
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
  // ── screen: size (4K etc.) and a see-through window ──
  const scaleSel = h('select', { class: 'select', 'aria-label': 'Størrelse på skærmen' }, SCALES.map(([v, l]) => h('option', { value: v, selected: getScale() === v }, v === 'auto' ? `${l} (${Math.round(autoZoom() * 100)} % her)` : l)));
  scaleSel.addEventListener('change', () => setScale(scaleSel.value));
  const screenInfo = h('p', { class: 'faint', style: { margin: 0 } }, `Skærmen: ${Math.round(screen.width * devicePixelRatio)} × ${Math.round(screen.height * devicePixelRatio)} pixels · Windows/browser-skalering ${Math.round(devicePixelRatio * 100)} %`);
  const transBox = h('div', { class: 'set-stack' });
  const drawTrans = () => {
    clear(transBox);
    if (!canBeTransparent()) {
      transBox.append(switchControl({ checked: false, label: 'Gennemsigtig baggrund', onChange: () => {} }), h('p', { class: 'faint', style: { margin: 0 } }, 'Virker i HUBTECH-appen til Windows. En hjemmeside i en browser kan ikke se dit skrivebord.'));
      transBox.querySelector('input').disabled = true;
      return;
    }
    const cur = getBackdrop();
    transBox.append(switchControl({ checked: cur !== 'off', label: 'Gennemsigtig baggrund', onChange: (v) => { setBackdrop(v ? 'acrylic' : 'off'); drawTrans(); } }));
    if (cur !== 'off') transBox.append(segmented(BACKDROPS.map(([value, label]) => ({ value, label })), cur, (v) => setBackdrop(v), { label: 'Slags gennemsigtighed' }));
  };
  drawTrans();
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
      h('p', { class: 'muted', style: { margin: '4px 0 14px' } }, 'Vælg et tema eller et af de syv landskaber, der følger årstid, tid på dagen og vejr – eller brug dit eget billede. Dine øvrige indstillinger bliver, som de er.'),
      h('h3', { class: 'set-sub' }, 'Temaer'),
      sceneGrid,
      h('h3', { class: 'set-sub' }, 'Landskaber'),
      landGrid,
      row('Stil', 'Farver og former på knapper og paneler. “Følger temaet” skifter med baggrunden.', styleSel),
      row('Eget billede', 'Et foto eller et billede, du har lavet med AI. Gemmes på din konto og synkroniseres.', imgBox),
      row('Billedkvalitet', 'Høj tegner landskabet i fuld skarphed på store og skarpe skærme (bruger lidt mere strøm)', quality)),
    h('section', { class: 'glass panel' },
      h('h2', { class: 'panel-title' }, 'Skærm'),
      row('Størrelse', 'Gør alt større eller mindre på denne skærm. Automatisk gør det større på store skærme som 4K.', h('div', { class: 'set-stack' }, scaleSel, screenInfo)),
      row('Gennemsigtig baggrund', 'Se dit eget skrivebordsbaggrund bag HUBTECH i stedet for landskabet', transBox)),
    h('section', { class: 'glass panel' },
      row('Animationer', 'Mængden af partikler og bevægelse', mkRange('intensity', 0, 1, 0.05, 'Animationernes intensitet')),
      row('Baggrundens lysstyrke', 'Dæmp verdenen for mere ro', mkRange('brightness', 0.4, 1.1, 0.05, 'Lysstyrke')),
      row('Dybdeeffekt', 'Landskabet bevæger sig let med musen', parallax),
      row('Stjerneskud', 'Meteorer, der flyver over himlen – også små stjerneskudsregn', segmented([{ value: 'auto', label: 'Om aftenen og natten' }, { value: 'on', label: 'Altid' }, { value: 'off', label: 'Fra' }], w().meteors || 'auto', (v) => setWorld({ meteors: v }), { label: 'Stjerneskud' })),
      row('Skyernes skygger', 'Bløde skygger, der driver hen over landskabet på klare dage', switchControl({ checked: w().cloudShadows !== false, label: 'Skyernes skygger', onChange: (v) => setWorld({ cloudShadows: v }) })),
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

// ── Apps og opkald ──
const sw = (label, get, set) => switchControl({ checked: get(), label, onChange: set });

function callPanel() {
  const c = getCall();
  const streams = new Set();
  let meterRaf = 0, meterCtx = null;
  const stopAll = () => {
    streams.forEach(s => s.getTracks().forEach(t => t.stop())); streams.clear();
    cancelAnimationFrame(meterRaf); meterCtx?.close().catch(() => {}); meterCtx = null;
  };
  addEventListener('hashchange', stopAll, { once: true });
  addEventListener('pagehide', stopAll, { once: true });

  const can = !!navigator.mediaDevices?.getUserMedia;
  const sel = (label, kind) => {
    const s = h('select', { class: 'select', 'aria-label': label }, h('option', { value: '' }, 'Standard'));
    s.addEventListener('change', () => { setCall({ [kind]: s.value }); if (kind === 'mic' && micBtn.dataset.on) startMic(); if (kind === 'cam' && camBtn.dataset.on) startCam(); if (kind === 'speaker') applySpeaker(sound); });
    return s;
  };
  const micSel = sel('Mikrofon', 'mic'), camSel = sel('Kamera', 'cam'), spkSel = sel('Højttaler', 'speaker');
  const sinkOk = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const fill = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const put = (s, kind, cur, fallback) => {
      const devs = list.filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
      clear(s); s.append(h('option', { value: '' }, 'Standard'));
      devs.forEach((d, i) => s.append(h('option', { value: d.deviceId, selected: d.deviceId === cur }, d.label || `${fallback} ${i + 1}`)));
      if (cur && !devs.some(d => d.deviceId === cur)) s.append(h('option', { value: cur, selected: true }, `${fallback} (ikke tilsluttet)`));
    };
    const cc = getCall();
    put(micSel, 'audioinput', cc.mic, 'Mikrofon'); put(camSel, 'videoinput', cc.cam, 'Kamera'); put(spkSel, 'audiooutput', cc.speaker, 'Højttaler');
    const named = list.some(d => d.label);
    hint.hidden = named;
  };
  const hint = h('p', { class: 'faint', style: { margin: 0 } }, 'Navnene på dine enheder vises, når du har testet mikrofonen eller kameraet én gang.');
  navigator.mediaDevices?.addEventListener?.('devicechange', fill);

  // mic test
  const meter = h('div', { class: 'as-meter', role: 'meter', 'aria-label': 'Mikrofonens lydniveau', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, h('i'));
  const micBtn = h('button', { class: 'btn btn-sm' });
  const drawMicBtn = () => h(clear(micBtn), null, icon(micBtn.dataset.on ? 'micOff' : 'mic'), micBtn.dataset.on ? 'Stop test' : 'Test mikrofonen');
  let micStream = null;
  const stopMic = () => { micStream?.getTracks().forEach(t => t.stop()); streams.delete(micStream); micStream = null; cancelAnimationFrame(meterRaf); meterCtx?.close().catch(() => {}); meterCtx = null; meter.firstChild.style.width = '0'; delete micBtn.dataset.on; drawMicBtn(); };
  async function startMic() {
    stopMic();
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: mediaConstraints().audio, video: false });
      streams.add(micStream); micBtn.dataset.on = '1'; drawMicBtn(); fill();
      meterCtx = new (window.AudioContext || window.webkitAudioContext)();
      const an = meterCtx.createAnalyser(); an.fftSize = 512;
      meterCtx.createMediaStreamSource(micStream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        const pct = Math.min(100, Math.round(peak / 128 * 160));
        meter.firstChild.style.width = `${pct}%`; meter.setAttribute('aria-valuenow', pct);
        meterRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { stopMic(); toast('Mikrofonen kunne ikke bruges', { type: 'warn', text: e.name === 'NotAllowedError' ? 'Tillad mikrofonen i browseren eller telefonens indstillinger.' : 'Der blev ikke fundet nogen mikrofon.' }); }
  }
  micBtn.addEventListener('click', () => (micBtn.dataset.on ? stopMic() : startMic()));
  drawMicBtn();

  // camera preview
  const video = h('video', { class: ['as-preview', c.mirror && 'is-mirror'], autoplay: true, playsinline: true, muted: true, hidden: true });
  video.muted = true; video.setAttribute('playsinline', '');
  const camBtn = h('button', { class: 'btn btn-sm' });
  const drawCamBtn = () => h(clear(camBtn), null, icon(camBtn.dataset.on ? 'videoOff' : 'video'), camBtn.dataset.on ? 'Sluk kameraet' : 'Se kameraet');
  let camStream = null;
  const stopCam = () => { camStream?.getTracks().forEach(t => t.stop()); streams.delete(camStream); camStream = null; video.srcObject = null; video.hidden = true; delete camBtn.dataset.on; drawCamBtn(); };
  async function startCam() {
    stopCam();
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: mediaConstraints({ audio: false, video: true }).video });
      streams.add(camStream); video.srcObject = camStream; video.hidden = false; camBtn.dataset.on = '1'; drawCamBtn(); fill();
    } catch (e) { stopCam(); toast('Kameraet kunne ikke bruges', { type: 'warn', text: e.name === 'NotAllowedError' ? 'Tillad kameraet i browseren eller telefonens indstillinger.' : 'Der blev ikke fundet noget kamera.' }); }
  }
  camBtn.addEventListener('click', () => (camBtn.dataset.on ? stopCam() : startCam()));
  drawCamBtn();

  // speaker test
  const sound = new Audio();
  const spkBtn = h('button', { class: 'btn btn-sm', onclick: () => {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      [523.25, 659.25, 783.99].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); const t = ac.currentTime + i * 0.18; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g).connect(dest); o.start(t); o.stop(t + 0.55); });
      sound.srcObject = dest.stream; applySpeaker(sound); sound.play().catch(() => {});
      setTimeout(() => { ac.close().catch(() => {}); sound.srcObject = null; }, 1300);
    } catch { /* */ }
  } }, icon('volume'), 'Afspil testlyd');

  const quality = h('select', { class: 'select', 'aria-label': 'Videokvalitet' },
    [['auto', 'Automatisk (anbefalet)'], ['low', 'Lav – sparer data'], ['high', 'Høj – 720p']].map(([v, l]) => h('option', { value: v, selected: c.quality === v }, l)));
  quality.addEventListener('change', () => { setCall({ quality: quality.value }); if (camBtn.dataset.on) startCam(); });

  const ringVol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: c.ringVolume, 'aria-label': 'Ringetonens lydstyrke', class: 'range' });
  setRangeFill(ringVol);
  ringVol.addEventListener('input', () => { setCall({ ringVolume: Number(ringVol.value) }); setRangeFill(ringVol); });

  fill();
  const testRows = can ? [
    row('Mikrofon', 'Bruges i opkald og talekanaler', h('div', { class: 'as-test' }, micSel, micBtn, meter)),
    row('Kamera', 'Bruges i videoopkald', h('div', { class: 'as-test' }, camSel, camBtn, video, hint)),
    row('Højttaler', sinkOk ? 'Hvor du hører de andre i opkaldet' : 'Denne browser bruger altid systemets højttaler', h('div', { class: 'as-test' }, sinkOk ? spkSel : null, spkBtn)),
  ] : [row('Mikrofon og kamera', null, h('span', { class: 'faint' }, 'Denne browser kan ikke bruge mikrofon og kamera her. Opkald kræver https eller localhost.'))];
  const re = (k) => (v) => { setCall({ [k]: v }); if (micBtn.dataset.on && ['noise', 'echo', 'gain'].includes(k)) startMic(); };
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Opkald'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, 'Gælder opkald, gruppeopkald og talekanaler i Fællesskab. Gemmes på denne enhed.'),
    ...testRows,
    row('Støjdæmpning', 'Fjerner baggrundsstøj som tastatur og blæser', sw('Støjdæmpning', () => c.noise, re('noise'))),
    row('Ekkodæmpning', 'Undgår at de andre hører sig selv, når du ikke bruger høretelefoner', sw('Ekkodæmpning', () => c.echo, re('echo'))),
    row('Automatisk lydstyrke', 'Justerer mikrofonen, så du lyder lige højt hele tiden', sw('Automatisk lydstyrke', () => c.gain, re('gain'))),
    row('Start videoopkald med kameraet slukket', 'Du kan tænde det, når opkaldet er i gang', sw('Start med kameraet slukket', () => c.camOff, (v) => setCall({ camOff: v }))),
    row('Spejlvend mit billede', 'Kun sådan du selv ser det – de andre ser dig normalt', sw('Spejlvend mit billede', () => c.mirror, (v) => { setCall({ mirror: v }); video.classList.toggle('is-mirror', v); })),
    row('Videokvalitet', 'Lav bruger mindre data på mobilnettet', quality),
    row('Ringetone', 'Når nogen ringer til dig. Slået fra: telefonen vibrerer i stedet', sw('Ringetone', () => c.ring, (v) => setCall({ ring: v }))),
    row('Ringetonens lydstyrke', null, ringVol));
}

function notifyPanel() {
  const n = getNotify();
  const sec = h('section', { class: 'glass panel' });
  let server = null;
  const sync = (k, v) => {
    setNotify({ [k]: v });
    if (k !== 'sound') api.put('/api/notify/prefs', { kinds: { [k === 'calendar' ? 'calendar' : k]: v } }).catch(() => {});
  };
  const t = (k, label, hint) => row(label, hint, sw(label, () => (server?.prefs.kinds[k] ?? n[k] ?? true), (v) => sync(k, v)));

  // this device
  const devBox = h('div', { class: 'set-stack' });
  const drawDev = async () => {
    const { pushState, enablePush, disablePush } = await import('../features/push.js');
    const st = await pushState();
    clear(devBox);
    const test = h('button', { class: 'btn btn-sm' }, icon('bell'), 'Send en test');
    test.addEventListener('click', busy(test, async () => {
      try { await api.post('/api/notify/test', {}); toast('Testen er sendt', { type: 'ok', text: droid.isAndroidApp() ? 'Den kommer, næste gang appen tjekker i baggrunden (højst 15 min.), eller med det samme, når appen er i baggrunden.' : 'Luk eller skjul HUBTECH – så kommer den som en rigtig notifikation om lidt.' }); }
      catch (e) { errorToast(e); }
    }));
    const on = h('button', { class: 'btn btn-primary btn-sm' }, icon('bell'), 'Slå notifikationer til');
    on.addEventListener('click', busy(on, async () => {
      try { const r = await enablePush(); if (r === 'denied') toast('Notifikationer blev ikke tilladt', { type: 'warn', text: 'Tillad dem for HUBTECH i browserens eller telefonens indstillinger.' }); else toast('Notifikationer er slået til på denne enhed', { type: 'ok' }); }
      catch (e) { toast('Notifikationer kunne ikke slås til', { type: 'warn', text: e.message }); }
      drawDev();
    }));
    const note = (txt) => h('p', { class: 'faint', style: { margin: 0 } }, txt);
    if (st === 'android') {
      const granted = droid.notificationState() === 'granted';
      const bg = droid.backgroundNotify();
      if (!granted) devBox.append(on, note('Telefonen skal tillade notifikationer fra HUBTECH.'));
      else devBox.append(switchControl({ checked: bg, label: 'Tjek for nyt, mens appen er lukket', onChange: (v) => { droid.setBackgroundNotify(v); drawDev(); } }),
        note(droid.serverUrl() ? 'Appen tjekker den fælles server for nyt ca. hvert 15. minut, også når den er lukket. Når appen er åben i baggrunden, kommer de med det samme.' : 'Appen bruger sin egen server på telefonen. Forbind til en fælles server under Om → Telefonen, så får du besked, når venner skriver eller ringer.'),
        granted && bg ? test : null);
    } else if (st === 'on') devBox.append(h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, h('span', { class: 'chip chip-ok' }, icon('check'), 'Slået til'), test,
      h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await disablePush(); drawDev(); } }, 'Slå fra')), note('Du får besked, også når HUBTECH er lukket – så længe serveren kører.'));
    else if (st === 'ready') devBox.append(on, note('Virker i Chrome, Edge og Firefox – også på Android.'));
    else if (st === 'denied') devBox.append(note('Notifikationer er blokeret for HUBTECH. Tillad dem i browserens indstillinger for siden (låsen ved adressen), og kom tilbage hertil.'));
    else if (st === 'ios-home') devBox.append(note('På iPhone og iPad: tryk på Del-knappen i Safari → “Føj til hjemmeskærm”, og åbn HUBTECH derfra. Så kan du slå notifikationer til her.'));
    else if (st === 'insecure') devBox.append(note('Rigtige notifikationer kræver, at HUBTECH åbnes via https:// (eller på selve computeren). Brug fx “tailscale serve” – se Om → Netværk.'));
    else devBox.append(note('Denne browser kan ikke vise notifikationer, når HUBTECH er lukket.'));
  };

  // e-mail
  const mailBox = h('div', { class: 'set-stack' });
  const drawMail = () => {
    clear(mailBox);
    if (!server) return;
    const me = store.get('user');
    if (!server.email) { mailBox.append(h('p', { class: 'faint', style: { margin: 0 } }, 'Skriv din e-mailadresse under ', h('a', { href: '#/settings/profile' }, 'Profil'), ' først.')); return; }
    if (!server.mailReady) { mailBox.append(h('p', { class: 'faint', style: { margin: 0 } }, me.role === 'owner' ? 'Sæt en mailserver op nedenfor først.' : 'Ejeren af HUBTECH skal sætte en mailserver op først.')); return; }
    const delay = h('select', { class: 'select', 'aria-label': 'Hvornår der sendes mail', disabled: !server.prefs.email },
      [[5, 'efter 5 minutter'], [15, 'efter 15 minutter'], [60, 'efter 1 time'], [240, 'efter 4 timer']].map(([v, l]) => h('option', { value: v, selected: server.prefs.emailDelay === v }, `Når jeg har været væk ${l}`)));
    delay.addEventListener('change', () => api.put('/api/notify/prefs', { emailDelay: Number(delay.value) }).then(r => { server.prefs = r.prefs; }).catch(errorToast));
    mailBox.append(switchControl({ checked: server.prefs.email, label: 'Send mig en mail om det, jeg har misset', onChange: async (v) => {
      try { server.prefs = (await api.put('/api/notify/prefs', { email: v })).prefs; drawMail(); } catch (e) { errorToast(e); drawMail(); }
    } }), delay, h('p', { class: 'faint', style: { margin: 0 } }, `Til ${server.email}. Højst én mail pr. kvarter, og kun om det, du ikke allerede har set i appen.`));
  };

  api.get('/api/notify/prefs').then((r) => { server = r; drawMail(); }).catch(() => {});
  // who may send friend requests (Fællesskab)
  const contactRow = h('div', { hidden: true });
  api.get('/api/cm/me').then((me) => {
    if (!me.ageOk) return;
    const sel = h('select', { class: 'select', 'aria-label': 'Hvem må sende dig venneanmodninger' },
      [['everyone', 'Alle'], ['fof', 'Kun venners venner'], ['nobody', 'Ingen']].map(([v, l]) => h('option', { value: v, selected: me.contact === v }, l)));
    sel.addEventListener('change', () => api.patch('/api/cm/me', { contact: sel.value }).then(() => toast('Gemt', { type: 'ok' })).catch(errorToast));
    contactRow.replaceWith(row('Venneanmodninger fra', 'Hvem der kan finde dig og sende en anmodning i Fællesskab. Opkald kommer altid kun fra dine venner.', sel));
  }).catch(() => {});
  drawDev();
  return h(sec, null,
    h('h2', { class: 'panel-title' }, 'Notifikationer'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, 'Hvad HUBTECH skal give besked om – i appen, som notifikation på telefonen og på mail.'),
    row('På denne enhed', 'Rigtige notifikationer, også når HUBTECH er lukket', devBox),
    row('På mail', 'En kort opsummering, når du ikke har været inde', mailBox),
    contactRow,
    t('dm', 'Direkte beskeder', 'Når en ven skriver til dig'),
    t('mention', 'Omtaler', 'Når nogen skriver @dig i en kanal'),
    t('call', 'Opkald', 'Når nogen ringer, og ubesvarede opkald'),
    t('friend', 'Venneanmodninger', 'Nye anmodninger og når nogen siger ja'),
    t('snap', 'Snaps', 'Når du får en snap'),
    t('calendar', 'Kalenderinvitationer', 'Når nogen deler en kalender eller aftale med dig'),
    t('report', 'Anmeldelser', 'Når der kommer en anmeldelse på en server, du styrer'),
    t('announce', 'Beskeder fra administratorerne', 'Nyheder og vigtige beskeder til alle brugere'),
    row('Lyd i appen', 'Et blødt pling, når HUBTECH er åben', sw('Lyd ved notifikationer', () => n.sound, (v) => setNotify({ sound: v }))));
}

/** Owner only: TURN server so calls work between all kinds of networks (not just the ones STUN can open). */
export function relayPanel() {
  if (store.get('user').role !== 'owner') return null;
  const urls = h('input', { class: 'input', autocapitalize: 'off', spellcheck: 'false', placeholder: 'turn:turn.example.com:3478, turns:turn.example.com:443?transport=tcp', 'aria-label': 'TURN-adresser' });
  const user = h('input', { class: 'input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Brugernavn' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'Adgangskode' });
  const status = h('p', { class: 'faint', style: { margin: 0 }, 'aria-live': 'polite' });
  let fromEnv = false;
  api.get('/api/cm/calls/ice-config').then((c) => {
    fromEnv = c.fromEnv;
    urls.value = (c.urls || []).join(', '); user.value = c.username || '';
    pass.placeholder = c.hasCredential ? '•••••••• (gemt – skriv for at ændre)' : '';
    status.textContent = c.fromEnv ? 'HUBTECH_ICE_SERVERS i .env bruges og vinder over det, der står her.' : c.urls?.length ? 'TURN-serveren er sat op – opkald virker også mellem netværk, der blokerer direkte forbindelser.' : 'Ingen TURN-server endnu. Opkald virker mellem de fleste hjemmenetværk, men ikke altid fra mobilnet, skole- eller arbejds-wifi.';
  }).catch(() => {});
  const save = h('button', { class: 'btn btn-primary btn-sm' }, icon('check'), 'Gem');
  save.addEventListener('click', busy(save, async () => {
    const b = { urls: urls.value.trim(), username: user.value.trim() };
    if (pass.value) b.credential = pass.value;
    try {
      const r = await api.put('/api/cm/calls/ice-config', b);
      pass.value = ''; pass.placeholder = r.hasCredential ? '•••••••• (gemt – skriv for at ændre)' : '';
      status.textContent = r.urls.length ? 'Gemt. Gælder fra næste opkald.' : 'TURN-serveren er fjernet.';
      toast(r.urls.length ? 'TURN-serveren er gemt' : 'TURN-serveren er fjernet', { type: 'ok' });
    } catch (e) { errorToast(e); }
  }));
  const test = h('button', { class: 'btn btn-sm' }, icon('refresh'), 'Test forbindelsen');
  test.addEventListener('click', busy(test, async () => {
    status.textContent = 'Tester … (op til 10 sekunder)';
    const list = urls.value.split(/[\s,]+/).filter(Boolean);
    const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
    if (list.length) servers.push({ urls: list, username: user.value.trim(), credential: pass.value || undefined });
    if (list.length && !pass.value && !fromEnv) status.textContent = 'Tester … (skriv adgangskoden igen for at teste TURN – den gemte vises ikke her)';
    const found = await gatherTypes(servers);
    const msg = found.has('relay') ? '✓ TURN-serveren virker – opkald kan gå via relæ, når direkte forbindelse ikke kan lade sig gøre.'
      : found.has('srflx') ? (list.length ? '⚠ Direkte forbindelser (STUN) virker, men TURN-serveren svarede ikke. Tjek adresse, brugernavn og adgangskode.' : '✓ Direkte forbindelser (STUN) virker fra dette netværk. Tilføj en TURN-server for at være sikker på alle netværk.')
      : '✗ Hverken STUN eller TURN svarede. Netværket her blokerer måske UDP – prøv en turns:…:443?transport=tcp-adresse.';
    status.textContent = msg;
  }));
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Opkald mellem netværk'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, 'Når I ringer fra hver jeres netværk, finder HUBTECH selv en direkte vej (STUN). Nogle netværk – mobilnet, skole- og arbejds-wifi – blokerer det. Så skal opkaldet sendes via en TURN-server. Du kan bruge en TURN-tjeneste (flere har en gratis kvote) eller din egen. Kun du som ejer ser denne boks.'),
    row('TURN-adresser', 'Én eller flere, adskilt med komma', urls),
    row('Brugernavn', null, user),
    row('Adgangskode', 'Gemmes i HUBTECH-databasen på denne computer. Deles med brugerne, når de ringer (sådan virker TURN).', pass),
    row('', null, h('div', { class: 'set-stack' }, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, save, test), status)));
}

/** Which kinds of ICE candidates these servers give from this network: host, srflx (STUN) and/or relay (TURN). */
async function gatherTypes(iceServers) {
  const types = new Set();
  let pc;
  try { pc = new RTCPeerConnection({ iceServers }); } catch { return types; }
  pc.createDataChannel('test');
  await new Promise((resolve) => {
    const done = setTimeout(resolve, 10000);
    pc.onicecandidate = (e) => {
      if (!e.candidate) { clearTimeout(done); resolve(); return; }
      const m = / typ (\w+)/.exec(e.candidate.candidate); if (m) types.add(m[1]);
      if (types.has('relay')) { clearTimeout(done); resolve(); }
    };
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => { clearTimeout(done); resolve(); });
  });
  try { pc.close(); } catch { /* */ }
  return types;
}

export function mailServerPanel() {
  if (store.get('user').role !== 'owner') return null;
  const f = { host: h('input', { class: 'input', placeholder: 'smtp.gmail.com', autocapitalize: 'off', spellcheck: 'false' }),
    port: h('input', { class: 'input', type: 'number', min: 1, max: 65535, placeholder: '587' }),
    security: h('select', { class: 'select' }, [['starttls', 'STARTTLS (port 587)'], ['ssl', 'SSL/TLS (port 465)'], ['none', 'Ingen kryptering']].map(([v, l]) => h('option', { value: v }, l))),
    user: h('input', { class: 'input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'dig@gmail.com' }),
    password: h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'App-adgangskode' }),
    sender: h('input', { class: 'input', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Samme som brugernavnet' }),
    baseUrl: h('input', { class: 'input', type: 'url', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://min-pc.tailnet.ts.net' }) };
  const status = h('p', { class: 'faint', style: { margin: 0 } });
  api.get('/api/notify/smtp').then((c) => {
    for (const k of ['host', 'port', 'security', 'user', 'sender', 'baseUrl']) f[k].value = c[k] ?? '';
    f.password.placeholder = c.hasPassword ? '•••••••• (gemt – skriv for at ændre)' : 'App-adgangskode';
    status.textContent = c.fromEnv ? 'Nogle værdier kommer fra HUBTECH_SMTP_* i .env og vinder over det, der står her.' : c.host ? 'Mailserveren er sat op.' : 'Ingen mailserver endnu.';
  }).catch(() => {});
  const save = h('button', { class: 'btn btn-primary btn-sm' }, icon('check'), 'Gem');
  save.addEventListener('click', busy(save, async () => {
    const b = { host: f.host.value.trim(), port: f.port.value, security: f.security.value, user: f.user.value.trim(), sender: f.sender.value.trim(), baseUrl: f.baseUrl.value.trim() };
    if (f.password.value) b.password = f.password.value;
    try { await api.put('/api/notify/smtp', b); f.password.value = ''; f.password.placeholder = '•••••••• (gemt – skriv for at ændre)'; status.textContent = 'Gemt.'; toast('Mailserveren er gemt', { type: 'ok' }); }
    catch (e) { errorToast(e); }
  }));
  const test = h('button', { class: 'btn btn-sm' }, icon('send'), 'Send testmail til mig');
  test.addEventListener('click', busy(test, async () => {
    try { const r = await api.post('/api/notify/test', { email: true }); toast('Testmailen er sendt', { type: 'ok', text: `Se efter i ${r.to}.` }); }
    catch (e) { errorToast(e); }
  }));
  f.security.addEventListener('change', () => { if (!f.port.value || ['587', '465', '25'].includes(f.port.value)) f.port.value = f.security.value === 'ssl' ? 465 : 587; });
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Mailserver'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, 'Så HUBTECH kan sende mails til brugerne. Med Gmail: slå totrinsbekræftelse til, lav en app-adgangskode på myaccount.google.com/apppasswords, og brug smtp.gmail.com, port 587. Kun du som ejer ser denne boks.'),
    row('Server', null, h('div', { class: 'set-stack' }, f.host, h('div', { class: 'row', style: { gap: '8px' } }, f.security, f.port))),
    row('Brugernavn', null, f.user),
    row('Adgangskode', 'Gemmes i HUBTECH-databasen på denne computer', f.password),
    row('Afsender', 'Valgfri', f.sender),
    row('HUBTECH-adresse', 'Valgfri – bruges til “Åbn HUBTECH”-knappen i mails', f.baseUrl),
    row('', null, h('div', { class: 'set-stack' }, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, save, test), status)));
}

function musicPanel() {
  const st = { playing: piano.isPlaying(), mood: piano.getMood(), volume: piano.getVolume() };
  const play = h('button', { class: 'btn btn-sm' });
  const drawPlay = () => h(clear(play), null, icon(st.playing ? 'pause' : 'play'), st.playing ? 'Sæt på pause' : 'Afspil');
  play.addEventListener('click', () => piano.toggle());
  const moodSel = h('select', { class: 'select', 'aria-label': 'Stemning' }, Object.entries(piano.MOODS).map(([id, m]) => h('option', { value: id, selected: id === st.mood }, m.name)));
  moodSel.addEventListener('change', () => piano.setMood(moodSel.value));
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.volume, class: 'range', 'aria-label': 'Musikkens lydstyrke' });
  setRangeFill(vol);
  vol.addEventListener('input', () => { piano.setVolume(vol.value); setRangeFill(vol); });
  const off = piano.onPiano((s) => { Object.assign(st, s); drawPlay(); moodSel.value = s.mood; });
  addEventListener('hashchange', off, { once: true });
  drawPlay();
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Baggrundsmusik'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, 'Rolig klaver, som HUBTECH selv komponerer i browseren – ingen ophavsret. Den er slået fra, til du starter den, og holder pause under opkald.'),
    row('Musik', 'Kan også styres med nodeknappen i toppen', play),
    row('Stemning', null, moodSel),
    row('Lydstyrke', null, vol));
}

function aiPanel() {
  const ai = () => import('../ai/panel.js');
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'AI-assistent'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, 'Assistenten kører helt lokalt i browseren. Model, RAM-grænse og hvilke data den må læse, vælger du i dens egne indstillinger.'),
    row('Model, RAM og datakilder', null, h('button', { class: 'btn btn-sm', onclick: () => ai().then(m => m.openAssistantSettings()) }, icon('sparkles'), 'Åbn assistentens indstillinger')),
    row('Samtalen', 'Slet beskederne, som er gemt på denne enhed', h('button', { class: 'btn btn-sm', onclick: () => ai().then(m => { toast(m.clearAssistantChat() ? 'Samtalen er slettet' : 'Vent til assistenten er færdig med at svare', { type: 'ok' }); }) }, icon('trash'), 'Slet samtalen')));
}

function studioPanel() {
  const s = getStudio();
  const size = h('select', { class: 'select', 'aria-label': 'Skriftstørrelse i editoren' }, [[12, 'Lille'], [13.5, 'Normal'], [15, 'Stor'], [17, 'Meget stor']].map(([v, l]) => h('option', { value: v, selected: Number(s.fontSize) === v }, l)));
  size.addEventListener('change', () => setStudio({ fontSize: Number(size.value) }));
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'App-værksted'),
    row('Kør automatisk', 'Vis ændringer med det samme, når appen gemmes', sw('Kør automatisk', () => s.autoRun, (v) => setStudio({ autoRun: v }))),
    row('Skriftstørrelse i editoren', null, size));
}

function appsTab() {
  return h('div', { class: 'stack', style: { display: 'grid', gap: '16px' } }, callPanel(), relayPanel(), notifyPanel(), mailServerPanel(), musicPanel(), aiPanel(), studioPanel());
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
      const { users, signupMode, signupFromEnv } = await api.get('/api/users');
      clear(list);
      if (signupFromEnv) list.appendChild(h('div', { class: 'callout', style: { marginBottom: '12px' } }, icon('info'), h('div', null, h('strong', null, `Tilmelding: ${{ open: 'åben for alle', first: 'kun via ejeren', closed: 'lukket' }[signupMode]}. `), 'Styres med HUBTECH_SIGNUP i .env.')));
      else list.appendChild(row('Alle kan oprette en konto', signupMode === 'open' ? 'Login-siden viser “Opret en konto”. Nye konti er altid almindelige medlemmer – kun du er ejer.' : 'Kun du opretter konti (her nedenfor). Slå til, hvis venner selv skal kunne oprette sig – eller du vil lave en testkonto.',
        switchControl({ checked: signupMode === 'open', label: 'Alle kan oprette en konto', onChange: async (on) => {
          try { await api.put('/api/users/signup', { mode: on ? 'open' : 'first' }); toast(on ? 'Alle kan nu oprette en konto' : 'Kun du kan oprette konti', { type: 'ok', text: on ? 'Nye konti bliver almindelige medlemmer.' : '' }); }
          catch (e) { errorToast(e); draw(); }
        } })));
      users.forEach(u => list.appendChild(h('div', { class: 'row', style: { border: '1px solid var(--line)' } },
        h('span', { class: 'avatar' }, ava(u.avatar)),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, u.displayName), h('div', { class: 'row-sub' }, `@${u.username} · ${u.lastLoginAt ? 'sidst aktiv ' + timeAgo(u.lastLoginAt) : 'aldrig logget ind'}`)),
        h('span', { class: ['chip', u.role === 'owner' ? 'chip-info' : ''] }, u.role === 'owner' ? 'Ejer' : 'Medlem'),
        u.role === 'owner' ? null : h('button', { class: 'btn btn-sm btn-ghost', title: 'Slet kontoen', 'aria-label': `Slet ${u.displayName}s konto`,
          onclick: () => deleteUserDialog({ id: u.id, name: u.displayName, username: u.username }, draw) }, icon('trash')))));
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

export function backupPanel() {
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

export { qrSvg } from '../features/qr.js';

export function networkPanel() {
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
    // friends somewhere else: HUBTECH sets up a public https address (Tailscale Funnel) by itself
    const manual = h('details', { class: 'net-manual' }, h('summary', null, 'Gør det selv i en terminal'),
      h('ol', { class: 'net-steps' },
        h('li', null, 'Installér ', h('b', null, 'Tailscale'), ' på denne computer og log ind (dine venner skal ', h('b', null, 'ikke'), ' have Tailscale).'),
        h('li', null, 'Kør: ', h('code', { class: 'net-cmd' }, `tailscale funnel --bg ${n.port}`)),
        h('li', null, 'Slå det fra igen med: ', h('code', { class: 'net-cmd' }, 'tailscale funnel reset'))));
    const offBtn = h('button', { class: 'btn btn-sm btn-ghost' }, icon('x'), 'Slå adgang udefra fra');
    offBtn.addEventListener('click', busy(offBtn, async () => {
      if (!await confirmDialog({ title: 'Slå adgang udefra fra?', text: 'Venner på andre netværk kan ikke længere nå HUBTECH, før du slår det til igen.', confirmLabel: 'Slå fra', danger: true })) return;
      try { await api.post('/api/system/public-access', { on: false }); toast('Adgang udefra er slået fra', { type: 'ok' }); draw(); } catch (e) { errorToast(e); }
    }));
    offBtn.hidden = !ts.funnel;
    const wiz = friendWizard({ compact: true, onDone: () => { offBtn.hidden = false; } });
    rows.push(h('details', { class: 'net-https', open: true }, h('summary', null, icon('globe'), ' Venner på andre netværk (over internettet)'),
      h('p', { class: 'faint small' }, 'Dine venner kan skrive, ringe og bruge HUBTECH med dig – hjemme hos sig selv eller på mobilnet. HUBTECH sætter det op med Tailscale (gratis, krypteret, https). Alle skal logge ind, og computeren skal være tændt.'),
      wiz, h('div', { class: 'fw-actions' }, offBtn), manual,
      h('p', { class: 'faint small' }, 'Virker opkald ikke fra et bestemt netværk (fx skole- eller arbejds-wifi), så tilføj en TURN-server under Apps og opkald.')));
    if (n.open && n.signup === 'open') rows.push(h('div', { class: 'callout warn' }, icon('alert'), h('div', null, 'Tilmelding er åben (HUBTECH_SIGNUP=open). Alle på netværket kan oprette en konto. Overvej “first”.')));
    h(clear(body), null, rows);
  }
  draw();
  return panel;
}

export function updatePanel() {
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
  const serverBox = h('div', { class: 'set-stack' });
  const cur = droid.serverUrl();
  const urlIn = h('input', { class: 'input', type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://min-pc.tailnet.ts.net', value: cur, 'aria-label': 'Adressen på HUBTECH-serveren' });
  const useBtn = h('button', { class: 'btn btn-primary btn-sm' }, icon('link'), 'Forbind');
  const err = h('p', { class: 'field-error', style: { margin: 0 } });
  useBtn.addEventListener('click', busy(useBtn, async () => {
    err.textContent = '';
    const r = await droid.setServerUrl(urlIn.value.trim());
    if (r !== 'ok') err.textContent = r;
  }));
  serverBox.append(urlIn, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, useBtn,
    cur ? h('button', { class: 'btn btn-sm', onclick: () => droid.useLocalServer() }, icon('phone'), 'Brug appens egen server') : null), err,
    h('p', { class: 'faint', style: { margin: 0 } }, 'Adressen skal være https://. Du skal logge ind på den anden server med en konto dér. Data på telefonens egen server bliver liggende, til du skifter tilbage.'));
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
    row('Server', droid.serverUrl() ? `Appen bruger ${droid.serverUrl()}. Alle dine data og venner ligger dér.` : 'Appen bruger sin egen server på telefonen. Skriv adressen på en anden HUBTECH (fx din computer eller en vens), så kan I skrive og ringe sammen.', serverBox),
    row('Påmindelser', 'Deadlines og aftaler som notifikationer – også når appen er lukket', notifyBox),
    row('App-lås', 'Fingeraftryk, ansigt eller telefonens kode, når du åbner HUBTECH', lock),
    row('Opdatering', 'Nye versioner bygges på GitHub og kan installeres herfra', upBox),
    row('Widget og genveje', 'Hold fingeren på HUBTECH-ikonet for “Start ur”, “Ny opgave”, “Ny note” og “Kalender”. Widgetten “I dag” finder du under widgets på hjemmeskærmen.', h('span', { class: 'chip' }, icon('apps'), 'Indbygget')),
    row('Del til HUBTECH', 'Del tekst, links og billeder fra andre apps – vælg HUBTECH i delemenuen', h('span', { class: 'chip' }, icon('upload'), 'Indbygget')));
}

/** Only in the Windows app: use HUBTECH on this computer, or connect to another HUBTECH (a friend's, over the internet). */
function winServerPanel() {
  const d = window.hubtechDesktop, wv = window.chrome?.webview;
  if (!d || !wv) return null;
  const cur = d.server || '';
  const urlIn = h('input', { class: 'input', type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://vens-pc.tailnet.ts.net', value: cur, 'aria-label': 'Adressen på den anden HUBTECH' });
  const err = h('p', { class: 'field-error', style: { margin: 0 }, 'aria-live': 'polite' });
  const go = h('button', { class: 'btn btn-primary btn-sm' }, icon('link'), 'Forbind');
  const onMsg = (e) => { if (typeof e.data === 'string' && e.data.startsWith('hubtech-server-error:')) { err.textContent = e.data.slice(21); go.disabled = false; go.classList.remove('is-loading'); } };
  wv.addEventListener('message', onMsg);
  addEventListener('hashchange', () => wv.removeEventListener('message', onMsg), { once: true });
  go.addEventListener('click', () => {
    err.textContent = '';
    const v = urlIn.value.trim();
    if (!v) { err.textContent = 'Skriv adressen på den anden HUBTECH.'; return; }
    go.disabled = true; go.classList.add('is-loading');
    wv.postMessage('hubtech-server:' + v);
    setTimeout(() => { go.disabled = false; go.classList.remove('is-loading'); }, 12000);
  });
  urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
  const back = cur ? h('button', { class: 'btn btn-sm', onclick: async () => {
    if (await confirmDialog({ title: 'Brug HUBTECH på denne computer?', text: 'Appen skifter tilbage til sin egen server. Dine data på den anden server bliver liggende dér.', confirmLabel: 'Skift' })) wv.postMessage('hubtech-server:');
  } }, icon('home'), 'Brug HUBTECH på denne computer') : null;
  return h('section', { class: 'glass panel' },
    h('h2', { class: 'panel-title' }, 'Server'),
    h('p', { class: 'muted', style: { margin: '4px 0 6px' } }, cur ? `Appen er forbundet til ${cur}. Du skriver og ringer med alle, der bruger den server.` : 'Appen bruger sin egen HUBTECH på denne computer. Vil du skrive og ringe med venner, der bruger en anden HUBTECH, så forbind til deres server – de finder adressen under Om → Netværk → “Venner på andre netværk”.'),
    row(cur ? 'Skift server' : 'Forbind til en anden HUBTECH', 'Adressen skal starte med https://. Du logger ind med en konto på den anden server.', h('div', { class: 'set-stack' }, urlIn, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, go, back), err)));
}

function aboutTab() {
  return h('div', { class: 'stack', style: { display: 'grid', gap: '16px' } },
    phonePanel(),
    winServerPanel(),
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
    const body = { profile: profileTab, security: securityTab, world: worldTab, apps: appsTab, integrations: integrationsTab, users: usersTab, data: dataTab, about: aboutTab }[tab]();
    return h('div', { class: 'page settings' },
      h('div', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Indstillinger'), h('h1', null, TABS.find(t => t.id === tab).label))),
      h('div', { class: 'settings-layout' },
        h('nav', { class: 'settings-nav glass', 'aria-label': 'Indstillinger' }, tabs.map(t => h('a', { class: 'nav-item', href: `#/settings/${t.id}`, 'aria-current': t.id === tab ? 'page' : null }, icon(t.icon), h('span', null, t.label)))),
        h('div', { class: 'settings-body' }, body)));
  },
};
