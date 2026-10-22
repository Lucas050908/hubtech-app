/** Login, sign-up and logout. Credentials only ever go to the server over the same origin. */
import { h, clear } from '../core/dom.js';
import { icon, logo, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { store, loadUserData, resetSessionState, flushPrefs } from '../core/store.js';
import { toast, busy } from '../core/ui.js';
import { navigate, query } from '../core/router.js';

export function passwordScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 16) s = Math.max(s, 3);
  return Math.min(4, s);
}

function field({ id, label, type = 'text', autocomplete, hint, value = '', extra, required = true, maxlength }) {
  const input = h('input', { class: 'input', id, name: id, type, autocomplete, value, required, maxlength, 'aria-describedby': `${id}-err ${id}-hint` });
  let wrapInput = input;
  if (type === 'password') {
    const toggle = h('button', { type: 'button', class: 'icon-btn input-action', 'aria-label': 'Vis adgangskode', 'aria-pressed': 'false' }, icon('eye'));
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Skjul adgangskode' : 'Vis adgangskode');
      toggle.innerHTML = svg(show ? 'eyeOff' : 'eye');
    });
    wrapInput = h('div', { class: 'input-wrap' }, input, toggle);
  }
  const err = h('div', { class: 'field-error', id: `${id}-err`, role: 'alert' });
  const el = h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label, extra || null),
    wrapInput,
    hint ? h('div', { class: 'field-hint', id: `${id}-hint` }, hint) : null,
    err);
  el.input = input;
  el.setError = (msg) => { err.textContent = msg || ''; input.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
  input.addEventListener('input', () => el.setError(''));
  return el;
}

function showErr(box, msg) {
  box.hidden = false;
  clear(box);
  box.append(h('span', { html: svg('alert'), style: { display: 'contents' } }), h('div', null, msg));
}

function authCard(children) {
  return h('div', { class: 'auth-wrap page' },
    h('div', { class: 'auth-card glass glass-strong' },
      h('a', { class: 'brand auth-brand', href: '#/' }, logo(40), h('span', { class: 'brand-name' }, 'HUB', h('b', null, 'TECH'))),
      children));
}

export async function renderLogin() {
  const status = store.get('authStatus') || await api.get('/api/auth/status');
  if (status.firstRun) { navigate('/signup', { replace: true }); return h('div'); }
  const user = field({ id: 'login-user', label: 'Brugernavn eller e-mail', autocomplete: 'username', maxlength: 254 });
  const pass = field({ id: 'login-pass', label: 'Adgangskode', type: 'password', autocomplete: 'current-password' });
  const formErr = h('div', { class: 'callout bad', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, h('span', null, 'Log ind'), icon('arrowRight'));
  const form = h('form', { novalidate: true, 'aria-labelledby': 'login-title' },
    h('h1', { id: 'login-title', class: 'auth-title' }, 'Velkommen tilbage'),
    h('p', { class: 'muted auth-sub' }, 'Log ind på dit personlige arbejdsrum.'),
    query().get('expired') ? h('div', { class: 'callout warn', style: { marginBottom: '16px' } }, icon('clock'), h('div', null, h('strong', null, 'Din session er udløbet. '), 'Log ind igen for at fortsætte, hvor du slap.')) : null,
    formErr, user, pass, submit,
    status.signupAllowed ? h('p', { class: 'auth-alt' }, 'Ny her? ', h('a', { href: '#/signup' }, 'Opret en konto')) :
      h('p', { class: 'auth-alt faint' }, 'Nye konti oprettes af platformens ejer under Indstillinger → Brugere.'));
  form.addEventListener('submit', (e) => { e.preventDefault(); doLogin(); });
  const doLogin = busy(submit, async () => {
    formErr.hidden = true;
    let bad = false;
    if (!user.input.value.trim()) { user.setError('Skriv dit brugernavn.'); bad = true; }
    if (!pass.input.value) { pass.setError('Skriv din adgangskode.'); bad = true; }
    if (bad) return;
    try {
      const { user: u } = await api.post('/api/auth/login', { username: user.input.value.trim(), password: pass.input.value }, { quiet401: true });
      await onAuthenticated(u);
    } catch (err) {
      showErr(formErr, err.message);
      pass.input.select();
    }
  });
  // focus the first field – but never steal focus from a field the person already went to
  requestAnimationFrame(() => { if (!form.contains(document.activeElement)) user.input.focus(); });
  return authCard(form);
}

export async function renderSignup() {
  const status = await api.get('/api/auth/status');
  store.set('authStatus', status);
  if (!status.signupAllowed) {
    return authCard(h('div', null,
      h('h1', { class: 'auth-title' }, 'Oprettelse er lukket'),
      h('p', { class: 'muted auth-sub' }, 'Denne HUBTECH-installation tillader ikke, at nye brugere opretter sig selv. Bed platformens ejer om at oprette en konto til dig.'),
      h('a', { class: 'btn btn-primary btn-block btn-lg', href: '#/login' }, 'Til login')));
  }
  const first = status.firstRun;
  const display = field({ id: 'su-name', label: 'Dit navn', autocomplete: 'name', hint: 'Vises i dit dashboard.', maxlength: 60 });
  const user = field({ id: 'su-user', label: 'Brugernavn', autocomplete: 'username', hint: '3–32 tegn: bogstaver, tal, punktum, bindestreg eller _', maxlength: 32 });
  const email = field({ id: 'su-email', label: 'E-mail', type: 'email', autocomplete: 'email', required: false, extra: h('span', { class: 'faint' }, 'valgfri'), maxlength: 254 });
  const meter = h('div', { class: 'pw-meter', 'data-score': '0', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  const pass = field({ id: 'su-pass', label: 'Adgangskode', type: 'password', autocomplete: 'new-password', hint: 'Mindst 10 tegn med store og små bogstaver og et tal – eller en passphrase på 16+ tegn.' });
  pass.insertBefore(meter, pass.querySelector('.field-hint'));
  pass.input.addEventListener('input', () => meter.setAttribute('data-score', String(passwordScore(pass.input.value))));
  const pass2 = field({ id: 'su-pass2', label: 'Gentag adgangskode', type: 'password', autocomplete: 'new-password' });
  const formErr = h('div', { class: 'callout bad', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, h('span', null, first ? 'Opret ejerkonto' : 'Opret konto'), icon('arrowRight'));
  const form = h('form', { novalidate: true },
    h('h1', { class: 'auth-title' }, first ? 'Sæt dit univers op' : 'Opret din konto'),
    h('p', { class: 'muted auth-sub' }, first ? 'Du er den første bruger. Kontoen bliver platformens ejer og får adgang til lokale projekter og integrationer.' : 'Få dit eget arbejdsrum med apps, projekter og læring.'),
    first ? h('div', { class: 'callout', style: { marginBottom: '16px' } }, icon('shield'), h('div', null, h('strong', null, 'Dine data bliver hos dig. '), 'Konti, fremdrift og indstillinger gemmes i en lokal database på denne maskine. Adgangskoder gemmes kun som scrypt-hash.')) : null,
    formErr, display, user, email, pass, pass2, submit,
    !first ? h('p', { class: 'auth-alt' }, 'Har du allerede en konto? ', h('a', { href: '#/login' }, 'Log ind')) : null);
  const fields = { username: user, displayName: display, email, password: pass };
  form.addEventListener('submit', (e) => { e.preventDefault(); doSignup(); });
  const doSignup = busy(submit, async () => {
    formErr.hidden = true;
    let bad = false;
    if (!user.input.value.trim()) { user.setError('Vælg et brugernavn.'); bad = true; }
    if (!pass.input.value) { pass.setError('Vælg en adgangskode.'); bad = true; }
    if (pass.input.value && pass.input.value !== pass2.input.value) { pass2.setError('Adgangskoderne er ikke ens.'); bad = true; }
    if (bad) return;
    try {
      const { user: u } = await api.post('/api/auth/register', {
        username: user.input.value.trim(), displayName: display.input.value.trim(), email: email.input.value.trim(), password: pass.input.value,
      });
      toast(first ? 'Dit univers er klar' : 'Konto oprettet', { type: 'ok', text: `Velkommen, ${u.displayName}!` });
      await onAuthenticated(u);
    } catch (err) {
      const f = err.field && fields[err.field];
      if (f) { f.setError(err.message); f.input.focus(); }
      else showErr(formErr, err.message);
    }
  });
  requestAnimationFrame(() => display.input.focus());
  return authCard(form);
}

async function onAuthenticated(user) {
  store.set('user', user);
  store.set('authStatus', { ...(store.get('authStatus') || {}), authenticated: true, firstRun: false, user });
  await loadUserData();
  const next = query().get('next');
  navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
}

export async function logout() {
  flushPrefs();
  try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
  try { const { clearOffline } = await import('../core/offline.js'); await clearOffline(); } catch { /* */ }
  resetSessionState();
  toast('Du er logget ud', { type: 'ok', text: 'Vi ses snart.' });
  navigate('/', { replace: true });
}
