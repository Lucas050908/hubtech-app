/**
 * First-run tour with a spotlight. Steps whose element is not visible on the current screen
 * are skipped automatically. Progress is stored on the account (/api/me/onboarding).
 */
import { h, clear, rect, viewW, viewH } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { store, refreshSummary } from '../core/store.js';
import { currentPath } from '../core/router.js';
import { toast } from '../core/ui.js';

const STEPS = [
  { id: 'intro', title: 'Velkommen til HUBTECH', text: 'HUBTECH samler apps, spil, kurser og CircuitPilot ét sted. Denne korte rundvisning tager under et minut.', icon: 'sparkles' },
  { id: 'progress', target: 'progress', title: 'Din profil og fremdrift', text: 'Dit level samler XP fra CircuitPilot, kurser og introduktionen. Under Dashboard i menuen finder du hele overblikket: fremdrift, favoritter og integrationer.' },
  { id: 'launcher', target: 'launcher', title: 'App-launcheren', text: 'Dine fastgjorte apps ligger her. “Flere apps” åbner launcheren, hvor du kan fastgøre og stjernemarkere apps.' },
  { id: 'apps', target: 'home-apps', title: 'Én platform, mange apps', text: 'Alle apps deler login, design og data – men har hver deres formål. Det du laver, gemmes på din konto.' },
  { id: 'projects', target: 'projects-preview', owner: true, title: 'Dine rigtige projekter', text: 'Projektoversigten læser dine Cursor-projekter direkte fra computeren, HUBTECH kører på. Er Cursor ikke forbundet, viser den præcis hvad der mangler.' },
  { id: 'learning', target: 'learning-preview', title: 'CircuitPilot og læring', text: 'Fortsæt opstartskurset eller elektronik-akademiet, præcis hvor du slap. Fremdriften gemmes på din konto.' },
  { id: 'search', target: 'search', title: 'Søgning og guides', text: 'Tryk Ctrl+K for at finde apps, guides, kursusdage og projekter – eller køre kommandoer. Alle guides ligger under Guides & Læring.' },
  { id: 'profile', target: 'profile', title: 'Personlige indstillinger', text: 'Her finder du profil, sikkerhed, tema og notifikationer – og kan starte denne introduktion igen.' },
  { id: 'world', target: 'seasons', title: 'Verdenen og årstiderne', text: 'Baggrunden følger årstiden og tiden på dagen. Vælg en årstid her, eller finjustér vejr, bevægelse og lysstyrke under Indstillinger → Verden.' },
];

let active = null;
let shownThisSession = false;

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const st = getComputedStyle(el);
  if (st.visibility === 'hidden' || st.display === 'none') return false;
  // element inside a closed off-canvas drawer?
  if (r.right < 0 || r.left > innerWidth) return false;
  return true;
}

const target = (step) => step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;

export function maybeStartOnboarding() {
  const u = store.get('user');
  if (!u || u.onboarding?.done || shownThisSession || active) return;
  if (currentPath() !== '/') return;
  shownThisSession = true;
  setTimeout(() => {
    if (currentPath() !== '/') { shownThisSession = false; return; } // user navigated away – try again later
    startOnboarding({ resumeAt: u.onboarding?.step || 0 });
  }, 900);
}

export function startOnboarding({ restart = false, resumeAt = 0 } = {}) {
  runTour(STEPS.filter(st => !st.owner || store.get('user')?.role === 'owner'), { persist: true, startAt: restart ? 0 : resumeAt });
}

function runTour(allSteps, { persist, startAt = 0 }) {
  if (active) return;
  const steps = allSteps.filter(s => !s.target || visible(target(s)));
  if (!steps.length) return;
  let i = Math.min(startAt, steps.length - 1);
  const hole = h('div', { class: 'tour-hole', 'aria-hidden': 'true' });
  const card = h('div', { class: 'tour-card glass glass-strong', role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite' });
  const layer = h('div', { class: 'tour-layer' }, hole, card);
  document.body.appendChild(layer);
  active = { close };
  const prevFocus = document.activeElement;

  function place() {
    const step = steps[i];
    const el = target(step);
    clear(card);
    const dots = h('div', { class: 'tour-dots', 'aria-hidden': 'true' }, steps.map((_, j) => h('i', { class: j === i ? 'on' : j < i ? 'done' : '' })));
    const next = h('button', { class: 'btn btn-primary btn-sm' }, i === steps.length - 1 ? 'Afslut' : 'Næste', icon(i === steps.length - 1 ? 'check' : 'arrowRight'));
    next.addEventListener('click', () => go(1));
    card.append(
      h('div', { class: 'tour-head' }, h('span', { class: 'tour-icon', html: svg(step.icon || 'info') }), h('span', { class: 'faint mono', style: { fontSize: 'var(--fs-xs)' } }, `${i + 1} / ${steps.length}`)),
      h('h2', { class: 'tour-title', id: 'tour-t' }, step.title),
      h('p', { class: 'muted' }, step.text),
      h('div', { class: 'tour-foot' }, dots,
        h('div', { class: 'tour-btns' },
          persist ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => finish(false) }, 'Spring over') : null,
          i > 0 ? h('button', { class: 'btn btn-sm', onclick: () => go(-1) }, 'Tilbage') : null,
          next)));
    card.setAttribute('aria-labelledby', 'tour-t');
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setTimeout(() => position(el), 260);
    } else {
      hole.style.cssText = `left:${innerWidth / 2}px;top:${innerHeight / 2}px;width:0;height:0;`;
      layer.classList.add('is-center');
      const cw = Math.min(440, innerWidth - 32);
      card.style.cssText = `width:${cw}px;left:${(innerWidth - cw) / 2}px;top:${Math.max(16, innerHeight * 0.3)}px;`;
      requestAnimationFrame(() => { card.style.top = `${Math.max(16, (innerHeight - card.offsetHeight) / 2)}px`; });
    }
    requestAnimationFrame(() => next.focus());
    if (persist) api.post('/api/me/onboarding', { done: false, step: i }).catch(() => {});
  }

  function position(el) {
    layer.classList.remove('is-center');
    const r = rect(el);
    const pad = 8, vw = viewW(), vh = viewH();
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
    const cw = Math.min(360, vw - 32);
    const ch = card.offsetHeight || 220;
    let left, top;
    if (r.right + 16 + cw < vw) { left = r.right + 16; top = Math.max(16, Math.min(vh - ch - 16, r.top)); }
    else if (r.left - 16 - cw > 0) { left = r.left - 16 - cw; top = Math.max(16, Math.min(vh - ch - 16, r.top)); }
    else if (r.bottom + 16 + ch < vh) { left = Math.max(16, Math.min(vw - cw - 16, r.left)); top = r.bottom + 16; }
    else { left = Math.max(16, Math.min(vw - cw - 16, r.left)); top = Math.max(16, r.top - ch - 16); }
    left = Math.max(12, Math.min(vw - cw - 12, left));
    top = Math.max(12, Math.min(vh - ch - 12, top));
    card.style.cssText = `left:${left}px;top:${top}px;width:${cw}px;`;
  }

  function go(d) {
    i += d;
    if (i >= steps.length) return finish(true);
    if (i < 0) i = 0;
    place();
  }

  async function finish(completed) {
    close();
    if (!persist) return;
    const wasDone = store.get('user')?.onboarding?.done;
    try {
      const { onboarding } = await api.post('/api/me/onboarding', { done: true, step: completed ? steps.length : i });
      store.set('user', { ...store.get('user'), onboarding });
      if (!wasDone) setTimeout(() => import('./friendsetup.js').then(m => m.maybeOfferFriends()).catch(() => {}), 1500);
      if (completed && !wasDone) {
        toast('Introduktion gennemført', { type: 'xp', text: '+50 XP. Du kan altid starte den igen fra brugermenuen.' });
        refreshSummary();
      } else if (!completed) {
        toast('Introduktionen er sprunget over', { text: 'Start den igen når som helst fra brugermenuen øverst til højre.' });
      }
    } catch { /* offline: try again next time */ }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft' && i > 0) go(-1);
  }
  let raf = 0;
  function onResize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { const el = target(steps[i]); if (el) position(el); });
  }

  function close() {
    if (active?.onNav) removeEventListener('hashchange', active.onNav);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    removeEventListener('scroll', onResize);
    layer.remove();
    active = null;
    prevFocus?.focus?.();
  }

  // navigating away pauses the tour (it resumes from the saved step next time on Hjem)
  const onNav = () => { close(); if (persist) shownThisSession = false; };
  addEventListener('hashchange', onNav, { once: true });
  active.onNav = onNav;
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', onResize);
  addEventListener('scroll', onResize, { passive: true });
  place();
}

/** One-off spotlight used by guides ("Vis mig"); never touches onboarding status. */
export function spotlight(targetId, { title, text }) {
  const el = document.querySelector(`[data-tour="${targetId}"]`);
  if (!el || !visible(el)) return false;
  runTour([{ id: 'x', target: targetId, title, text, icon: 'compass' }], { persist: false });
  return true;
}
