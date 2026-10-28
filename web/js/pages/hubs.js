/**
 * Forbindelser – connect this HUBTECH with a friend's, and visit it with your own account.
 * Everyone sees the connected HUBTECHs and a “Besøg” button; the owner can invite, paste a code and manage them.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast, confirmDialog, switchControl, busy } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { copy } from '../features/appkit.js';

const ago = (t) => { if (!t) return 'aldrig'; const s = Date.now() / 1000 - t; return s < 120 ? 'lige nu' : s < 3600 ? `${Math.round(s / 60)} min. siden` : s < 86400 ? `${Math.round(s / 3600)} timer siden` : `${Math.round(s / 86400)} dage siden`; };
const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };

/** send the browser to the other HUBTECH, logged in as yourself */
export async function visit(link, { remoteId } = {}) {
  try {
    const r = await api.post(remoteId ? `/api/hublink/to/${remoteId}/go` : `/api/hublink/links/${link.id}/go`, {});
    toast(r.home ? 'Du går hjem igen …' : `Du går til ${r.name || link?.name || 'den anden HUBTECH'} …`, { type: 'info', ms: 1500 });
    location.href = r.url;
  } catch (e) { toast('Kunne ikke åbne den anden HUBTECH', { type: 'bad', text: e.message }); }
}

function step(n, title, text, ...body) {
  return h('div', { class: 'hl-step' }, h('span', { class: 'hl-num' }, String(n)), h('div', { class: 'hl-step-b' }, h('b', null, title), text ? h('p', { class: 'faint' }, text) : null, ...body));
}

export default {
  title: 'Forbindelser',
  async render() {
    const root = h('div', { class: 'stack' });
    let info;
    async function load() {
      try { info = await api.get('/api/hublink'); } catch (e) { h(clear(root), null, h('div', { class: 'callout bad' }, icon('alert'), h('div', null, e.message))); return; }
      draw();
    }
    function linksBox() {
      if (!info.links.length) return h('div', { class: 'hl-empty' }, h('span', { class: 'hl-big' }, '🔗'), h('b', null, 'Ingen forbundne HUBTECH’er endnu'),
        h('span', { class: 'faint' }, info.owner ? 'Forbind med en vens HUBTECH herunder – så kan I besøge hinanden og spille sammen med jeres egne konti.' : 'Bed ejeren af denne HUBTECH om at forbinde den med en vens.'));
      return h('div', { class: 'hl-list' }, info.links.map(l => h('div', { class: ['hl-card', !l.allowLogin && 'is-off'] },
        h('div', { class: 'hl-card-h' }, h('span', { class: 'hl-logo' }, '🏠'), h('div', null, h('b', null, l.name), h('span', { class: 'faint' }, hostOf(l.url))), (() => { const dot = h('span', { class: 'hl-dot', title: 'Tjekker …' }); api.get(`/api/hublink/links/${l.id}/ping`).then(r => { dot.classList.add(r.online ? 'on' : 'off'); dot.title = r.online ? 'Online' : 'Kan ikke nås lige nu'; dot.textContent = r.online ? 'Online' : 'Ikke tændt'; }).catch(() => {}); return dot; })()),
        info.owner ? h('div', { class: 'faint hl-meta' }, `Brugt ${ago(l.lastUsed)}${l.visitors ? ` · ${l.visitors} ${l.visitors === 1 ? 'gæst' : 'gæster'} herfra har besøgt dig` : ''}`) : null,
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
          info.visitorFrom && info.visitorFrom.url === l.url ? h('button', { class: 'btn btn-primary', onclick: () => visit(l) }, icon('home'), 'Tilbage til min HUBTECH')
            : info.visitorFrom ? null : h('button', { class: 'btn btn-primary', onclick: () => visit(l) }, icon('external'), `Besøg ${l.name}`),
          info.owner ? h('label', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, switchControl({ checked: l.allowLogin, label: 'Folk derfra må komme på besøg', onChange: async (v) => { await api.patch(`/api/hublink/links/${l.id}`, { allowLogin: v }).catch(e => toast(e.message, { type: 'bad' })); load(); } }), h('span', { class: 'faint', style: { fontSize: '13px' } }, 'Må besøge mig')) : null,
          info.owner ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: `Fjern forbindelsen til ${l.name}?`, text: 'Gæster derfra bliver logget ud her. Du kan altid forbinde igen med en ny kode.', confirmLabel: 'Fjern', danger: true })) { await api.del(`/api/hublink/links/${l.id}`); toast('Forbindelsen er fjernet', { type: 'ok' }); load(); } } }, icon('trash'), 'Fjern') : null))));
    }
    function inviteBox() {
      const out = h('div');
      const urls = info.urls || [];
      let chosen = urls[0]?.url || '';
      const pick = urls.length > 1 ? h('div', { class: 'hl-urls' }, urls.map(u => h('label', { class: 'hl-url' }, h('input', { type: 'radio', name: 'hl-url', checked: u.url === chosen, onchange: () => { chosen = u.url; } }), h('span', null, h('b', null, u.label), h('small', { class: 'faint' }, hostOf(u.url)))))) : null;
      const btn = h('button', { class: 'btn btn-primary' }, icon('link'), 'Lav en kode');
      btn.addEventListener('click', busy(btn, async () => {
        try {
          const r = await api.post('/api/hublink/invite', { url: chosen });
          const qr = h('span', { class: 'hl-qr' });
          import('../features/qr.js').then(m => m.qrSvg(r.code, 180)).then(svg => qr.append(svg)).catch(() => {});
          const share = navigator.share ? h('button', { class: 'btn', onclick: () => navigator.share({ title: 'Forbind med min HUBTECH', text: `Indsæt koden i din HUBTECH under Forbindelser:\n${r.code}` }).catch(() => {}) }, icon('share'), 'Del') : null;
          h(clear(out), null, h('div', { class: 'hl-code' }, qr, h('div', { class: 'stack', style: { gap: '8px', minWidth: 0 } },
            h('span', { class: 'faint', style: { fontSize: '13px' } }, 'Send koden til din ven – fx i en besked. Den virker én gang i 24 timer.'),
            h('textarea', { class: 'textarea hl-codetext', readonly: true, rows: 3, 'aria-label': 'Forbindelseskode', onfocus: (e) => e.target.select() }, r.code),
            h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn btn-primary', onclick: () => copy(r.code, 'Koden er kopieret') }, icon('copy'), 'Kopiér koden'), share))));
        } catch (e) { toast('Kunne ikke lave en kode', { type: 'bad', text: e.message }); }
      }));
      const own = h('input', { class: 'input', placeholder: 'fx https://min-hubtech.dk', 'aria-label': 'Egen adresse', oninput: (e) => { chosen = e.target.value.trim() || urls[0]?.url || ''; btn.hidden = !chosen; } });
      btn.hidden = !chosen;
      return h('div', { class: 'stack' }, urls.length ? null : h('div', { class: 'callout warn' }, icon('alert'), h('div', null, 'Din HUBTECH kan kun nås fra denne computer. Slå adgang fra netværket eller over internettet til under ', h('a', { href: '#/settings/about' }, 'Indstillinger → Om → Netværk'), ' først – eller skriv adressen selv herunder.')),
        pick, h('details', { class: 'hl-how', open: !urls.length }, h('summary', null, 'Bruger du en anden adresse?'), h('div', { style: { marginTop: '8px' } }, own)), h('div', { class: 'row' }, btn), out);
    }
    function joinBox() {
      const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Indsæt koden, du har fået – den starter med HUB1-', 'aria-label': 'Indsæt forbindelseskode' });
      const out = h('div');
      const btn = h('button', { class: 'btn btn-primary' }, icon('check'), 'Tjek koden');
      btn.addEventListener('click', busy(btn, async () => {
        try {
          const p = await api.post('/api/hublink/peek', { code: ta.value });
          const go = h('button', { class: 'btn btn-primary btn-lg' }, icon('link'), `Forbind med ${p.name}`);
          go.addEventListener('click', busy(go, async () => {
            try { const r = await api.post('/api/hublink/join', { code: ta.value, url: myUrl.value.trim() || (info.urls || [])[0]?.url }); toast(`Forbundet med ${r.link.name}! 🎉`, { type: 'ok', text: 'I kan nu besøge hinanden.' }); load(); }
            catch (e) { h(clear(out), null, h('div', { class: 'callout bad' }, icon('alert'), h('div', null, e.message))); }
          }));
          h(clear(out), null, h('div', { class: 'hl-peek' }, h('span', { class: 'hl-logo' }, '🏠'), h('div', null, h('b', null, p.name), h('span', { class: 'faint' }, hostOf(p.url)), p.known ? h('span', { class: 'chip' }, 'Allerede forbundet – forbinder igen') : null), go));
        } catch (e) { h(clear(out), null, h('div', { class: 'callout bad' }, icon('alert'), h('div', null, e.message))); }
      }));
      ta.addEventListener('paste', () => setTimeout(() => btn.click(), 50));
      const myUrl = h('input', { class: 'input', placeholder: (info.urls || [])[0]?.url || 'fx https://min-hubtech.dk', 'aria-label': 'Min adresse' });
      return h('div', { class: 'stack' }, ta, h('details', { class: 'hl-how', open: !(info.urls || []).length }, h('summary', null, 'Den adresse, din vens HUBTECH skal bruge for at nå din'), h('div', { style: { marginTop: '8px' } }, myUrl)), h('div', { class: 'row' }, btn), out);
    }
    function nameBox() {
      const inp = h('input', { class: 'input', value: info.name, maxlength: 40, 'aria-label': 'Navnet på din HUBTECH' });
      inp.addEventListener('change', async () => { try { await api.put('/api/hublink/name', { name: inp.value.trim() || info.name }); toast('Navnet er gemt', { type: 'ok', ms: 1200 }); } catch (e) { toast(e.message, { type: 'bad' }); } });
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Din HUBTECH hedder'), inp, h('span', { class: 'field-hint' }, 'Det er det navn, dine venner ser.'));
    }
    function friendBox() {
      const out = h('div'), list = h('div');
      const base = () => (info.urls || [])[0]?.url || location.origin;
      const drawList = async () => { try { const r = await api.get('/api/users/invites'); h(clear(list), null, r.invites.length ? h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, `${r.invites.length} ${r.invites.length === 1 ? 'invitation venter' : 'invitationer venter'} på svar.`, ' ', h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { for (const i of r.invites) await api.del(`/api/users/invites/${i.id}`); toast('Invitationerne er trukket tilbage', { type: 'ok' }); drawList(); h(clear(out)); } }, 'Træk dem tilbage')) : null); } catch { /* */ } };
      const btn = h('button', { class: 'btn btn-primary' }, icon('user'), 'Lav et invitationslink');
      btn.addEventListener('click', busy(btn, async () => {
        try {
          const r = await api.post('/api/users/invites', { days: 7, uses: 1 });
          const url = `${base()}/#/signup?invite=${r.token}`, qr = h('span', { class: 'hl-qr' });
          import('../features/qr.js').then(m => m.qrSvg(url, 180)).then(svg => qr.append(svg)).catch(() => {});
          h(clear(out), null, h('div', { class: 'hl-code' }, qr, h('div', { class: 'stack', style: { gap: '8px', minWidth: 0 } },
            h('span', { class: 'faint', style: { fontSize: '13px' } }, 'Send linket til din ven, eller lad dem scanne QR-koden med telefonen. Det virker én gang i 7 dage – også selv om andre ikke selv kan oprette en konto.'),
            h('input', { class: 'input hl-codetext', readonly: true, value: url, 'aria-label': 'Invitationslink', onfocus: (e) => e.target.select() }),
            h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn btn-primary', onclick: () => copy(url, 'Linket er kopieret') }, icon('copy'), 'Kopiér linket'),
              navigator.share ? h('button', { class: 'btn', onclick: () => navigator.share({ title: 'Kom med på min HUBTECH', url }).catch(() => {}) }, icon('share'), 'Del') : null))));
          drawList();
        } catch (e) { toast('Kunne ikke lave et link', { type: 'bad', text: e.message }); }
      }));
      drawList();
      return h('div', { class: 'stack' }, h('div', { class: 'row' }, btn), out, list);
    }
    function draw() {
      h(clear(root), null,
        info.visitorFrom ? h('div', { class: 'callout hl-visitor' }, icon('home'), h('div', null, h('strong', null, `Du er på besøg fra ${info.visitorFrom.name}. `), 'Du kan spille, chatte og dele med folk her – dine egne ting ligger stadig på din egen HUBTECH.')) : null,
        h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('link'), 'Forbundne HUBTECH’er'), linksBox()),
        info.owner ? h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('user'), 'Invitér en ven, der ikke har en HUBTECH'),
          h('p', { class: 'faint', style: { marginTop: 0 } }, 'Din ven får sin egen konto her på din HUBTECH – og I bliver venner med det samme.'), friendBox()) : null,
        info.owner ? h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, icon('plus'), 'Forbind med en vens HUBTECH'),
          h('p', { class: 'faint', style: { marginTop: 0 } }, 'Det tager tre trin. Kun én af jer skal lave en kode.'),
          step(1, 'Giv din HUBTECH et navn', null, nameBox()),
          step(2, 'Lav en kode og send den til din ven', 'Din ven indsætter den i sin HUBTECH under Forbindelser.', inviteBox()),
          step(3, '… eller indsæt den kode, du har fået', 'Har din ven sendt dig en kode? Indsæt den her.', joinBox()),
          h('details', { class: 'hl-how' }, h('summary', null, 'Hvordan virker det – og er det sikkert?'),
            h('ul', null, h('li', null, 'Når to HUBTECH’er er forbundet, kan folk på den ene besøge den anden med deres egen konto – uden at oprette en ny eller huske en adgangskode.'),
              h('li', null, 'Intet flyttes mellem jer: dine data bliver på din HUBTECH, og deres bliver på deres.'),
              h('li', null, 'Besøgende bliver almindelige brugere – aldrig ejere eller administratorer – og du kan slå besøg fra eller fjerne forbindelsen når som helst.'),
              h('li', null, 'Den anden HUBTECH skal kunne nås fra din: på samme wifi eller over internettet med Tailscale (Indstillinger → Om → Netværk).')))) : null);
    }
    load();
    return h('div', { class: 'page hubs-page' },
      h('div', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Fællesskab'), h('h1', null, 'Forbindelser'), h('p', { class: 'muted' }, 'Forbind din HUBTECH med dine venners – så kan I besøge hinanden, spille sammen og dele, med jeres egne konti.'))),
      root);
  },
};

/** #/hub/<ticket> – arriving from a connected HUBTECH */
export async function renderArrive(ticket) {
  const box = h('div', { class: 'auth-wrap page' }, h('div', { class: 'auth-card glass glass-strong hl-arrive' }, h('span', { class: 'hl-big' }, '🔗'), h('h1', { class: 'auth-title' }, 'Et øjeblik …'), h('p', { class: 'muted' }, 'Du logges ind med din konto fra din egen HUBTECH.')));
  try {
    const r = await api.post('/api/hublink/sso', { ticket });
    const { onAuthenticated } = await import('../features/auth.js');
    toast(`Velkommen, ${r.user.displayName}!`, { type: 'ok', text: `Du er på besøg fra ${r.from}.` });
    history.replaceState(null, '', '#/');
    await onAuthenticated(r.user);
  } catch (e) {
    h(clear(box.firstChild), null, h('span', { class: 'hl-big' }, '😕'), h('h1', { class: 'auth-title' }, 'Det virkede ikke'), h('p', { class: 'muted' }, e.message),
      h('a', { class: 'btn btn-primary btn-block', href: '#/login' }, 'Til login'));
  }
  return box;
}

/** #/hub-go/<id> – the login page of a connected HUBTECH sent you home to get a ticket */
export async function renderGo(rid) {
  if (!store.get('user')) { navigate(`/login?next=${encodeURIComponent(`/hub-go/${rid}`)}`, { replace: true }); return h('div'); }
  const box = h('div', { class: 'auth-wrap page' }, h('div', { class: 'auth-card glass glass-strong hl-arrive' }, h('span', { class: 'hl-big' }, '🔗'), h('h1', { class: 'auth-title' }, 'Du sendes videre …')));
  visit(null, { remoteId: rid });
  return box;
}

/** on the login page: “Kommer du fra en anden HUBTECH?” */
export async function loginLinks() {
  let r;
  try { r = await api.get('/api/hublink/public'); } catch { return null; }
  if (!r.links?.length) return null;
  return h('div', { class: 'hl-login' }, h('span', { class: 'faint' }, 'Har du en konto på en anden HUBTECH?'),
    h('div', { class: 'stack', style: { gap: '6px' } }, r.links.map(l => h('a', { class: 'btn btn-block', href: `${l.url}/#/hub-go/${r.id}` }, icon('home'), `Log ind med ${l.name}`))));
}
