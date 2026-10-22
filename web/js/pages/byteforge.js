/** ByteForge app: connector to the user's own ByteForge server + the ByteForge guide. */
import { h, clear } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { api } from '../core/api.js';
import { store, logActivity } from '../core/store.js';
import { busy, toast, errorToast, segmented } from '../core/ui.js';
import { GUIDES } from '../data/guides.js';
import { guideCard } from './learn.js';
import { invalidateIntegrations } from '../core/services.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { appById } from '../core/registry.js';

const FEATURES = [
  ['gamepad', 'Game servers', 'Minecraft Vanilla, Paper, Spigot, Forge, Fabric, FiveM, Terraria og custom. CPU/RAM-grænser pr. server.'],
  ['server', 'NAS storage', 'Del filer på tværs af enheder via NFS og Samba.'],
  ['shield', 'RAID-beskyttelse', 'RAID 1-spejling duplikerer data på to diske.'],
  ['folder', 'Fil-manager', 'Ikon-grid, forhåndsvisning, drag-and-drop upload.'],
  ['users', 'Multi-user', 'Profiler med adgangsniveauer og 2FA.'],
  ['layers', 'Docker apps', 'Jellyfin, Nextcloud, Bitwarden, Pi-hole, WireGuard, Grafana.'],
  ['globe', 'Proxy & SSL', 'Nginx Proxy Manager med domæner og certifikater.'],
  ['sparkles', 'AI Assistant', 'Spørg om din server, analysér logs og få tips.'],
];

const INSTALL = {
  linux: [['Download og udpak', 'unzip ByteForge.zip && cd ByteForge'], ['Kør installeren', 'sudo ./install.sh'], ['Åbn browseren', 'http://127.0.0.1:8080']],
  windows: [['Download og udpak', 'Højreklik → "Udpak alt"'], ['Start serveren', 'Dobbeltklik på: start.bat'], ['Log ind', 'http://127.0.0.1:8080']],
  macos: [['Download og udpak', 'unzip ByteForge.zip && cd ByteForge'], ['Kør installeren', './install.sh'], ['Åbn browseren', 'http://127.0.0.1:8080']],
};

let pollTimer = null;

export default {
  title: 'ByteForge',
  destroy() { clearTimeout(pollTimer); },
  render(ctx) {
    const user = store.get('user');
    const owner = user.role === 'owner';
    const conn = h('div', { class: 'bf-conn' }, h('div', { class: 'skel', style: { height: '64px' } }));
    let url = '';

    const panelSlot = h('div');
    const stStatus = h('span', null, h('span', { class: 'status-dot' }), 'Tjekker…');
    const stUrl = h('span', { class: 'mono', style: { fontSize: '.86rem' } }, '—');
    const stMode = h('span', null, '—');
    const heroStats = (r) => {
      const map = { online: ['ok', 'Online'], starting: ['warn', 'Starter…'], offline: ['bad', 'Offline'], not_configured: ['warn', 'Ikke sat op'], error: ['bad', 'Fejl'] };
      const [dot, label] = map[r.state] || map.error;
      stStatus.replaceChildren(h('span', { class: ['status-dot', dot, dot === 'ok' && 'pulse'] }), label);
      stUrl.textContent = (r.url || '—').replace(/^https?:\/\//, '');
      stMode.textContent = r.runner?.managed ? 'Indbygget' : r.runner?.bundled ? 'Indbygget (stoppet)' : 'Ekstern';
    };
    async function check(quiet) {
      if (!quiet) clear(conn).appendChild(h('div', { class: 'bf-state' }, h('span', { class: 'spinner' }), h('span', null, 'Tjekker forbindelsen…')));
      clearTimeout(pollTimer);
      try {
        const r = await api.get('/api/integrations/byteforge/check');
        url = r.url || '';
        heroStats(r);
        draw(r);
        drawPanel(r);
        if (r.state === 'starting' || (r.state === 'offline' && r.runner?.managed)) pollTimer = setTimeout(() => check(true), 1500);
      } catch (e) { heroStats({ state: 'error', url }); draw({ state: 'error', reason: e.message, url }); }
    }

    function drawPanel(r) {
      clear(panelSlot);
      if (r.state === 'online') {
        const frame = h('iframe', { class: 'site-frame', src: r.url + '/?ht=1', title: 'ByteForge-panel' });
        panelSlot.appendChild(h('section', { class: 'bf-panel glass' },
          h('div', { class: 'panel-head', style: { padding: '12px 16px', margin: 0 } },
            h('h2', { class: 'panel-title' }, icon('server'), 'ByteForge-panelet'),
            h('div', { class: 'bf-actions' },
              h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Log ind med ADMIN og din ByteForge-adgangskode'),
              h('a', { class: 'btn btn-sm btn-ghost', href: r.url, target: '_blank', rel: 'noopener' }, icon('external'), 'Nyt vindue'))),
          h('div', { class: 'site-frame-wrap', style: { borderRadius: 0, border: 0, borderTop: '1px solid var(--line)' } }, frame)));
        logActivity('byteforge', 'open', 'ByteForge-panel', 'Panel åbnet');
      }
    }

    function draw(r) {
      clear(conn);
      const states = {
        online: ['ok', 'ByteForge er online', r.runner?.managed ? `Startet af HUBTECH og kører på ${r.url}.` : `Serveren svarer på ${r.url}.`],
        starting: ['warn', 'ByteForge starter…', 'HUBTECH starter den medfølgende ByteForge-server. Det tager et par sekunder.'],
        offline: ['bad', 'ByteForge svarer ikke', r.runner?.lastError || (r.runner?.bundled ? `Ingen forbindelse til ${r.url}. Klik “Start ByteForge” for at starte den medfølgende server.` : `Ingen forbindelse til ${r.url}. Start ByteForge med start.bat / ./start.sh.`)],
        not_configured: ['warn', 'Ingen ByteForge-adresse', 'Angiv adressen på din ByteForge-server.'],
        error: ['bad', 'Kunne ikke tjekke', r.reason || ''],
      };
      const [dot, title, text] = states[r.state] || states.error;
      const recheck = h('button', { class: 'btn btn-sm' }, icon('refresh'), 'Tjek igen');
      recheck.addEventListener('click', busy(recheck, check));
      conn.append(
        h('div', { class: 'bf-state' }, h('span', { class: ['status-dot', dot, dot === 'ok' && 'pulse'] }),
          h('div', null, h('b', null, title), h('div', { class: 'faint', style: { fontSize: 'var(--fs-sm)' } }, text))),
        h('div', { class: 'bf-actions' },
          r.state === 'offline' && r.runner?.bundled && owner ? (() => {
            const b = h('button', { class: 'btn btn-primary' }, icon('play'), 'Start ByteForge');
            b.addEventListener('click', busy(b, async () => {
              try { await api.post('/api/integrations/byteforge/start'); setTimeout(() => check(true), 1200); }
              catch (e) { errorToast(e, 'Kunne ikke starte ByteForge'); }
            }));
            return b;
          })() : null,
          r.state === 'online' ? h('a', { class: 'btn', href: r.url, target: '_blank', rel: 'noopener' }, icon('external'), 'Åbn i nyt vindue') : null,
          recheck));
      if (owner) {
        const inp = h('input', { class: 'input', value: r.url || '', placeholder: 'http://127.0.0.1:8080', 'aria-label': 'ByteForge-adresse' });
        const save = h('button', { class: 'btn' }, 'Gem adresse');
        save.addEventListener('click', busy(save, async () => {
          try { await api.put('/api/integrations/byteforge/url', { url: inp.value.trim() }); invalidateIntegrations(); toast('Adresse gemt', { type: 'ok', ms: 1600 }); await check(); }
          catch (e) { errorToast(e, 'Kunne ikke gemme'); }
        }));
        conn.appendChild(h('div', { class: 'bf-url' }, inp, save));
      }
    }
    check();

    const osBox = h('div');
    const drawOs = (os) => {
      clear(osBox).appendChild(h('ol', { class: 'g-steps' }, INSTALL[os].map(([t, c], i) => h('li', { class: 'g-step' }, h('span', { class: 'g-step-n' }, String(i + 1)), h('div', null, h('h3', null, t), h('pre', { class: 'code' }, c))))));
    };
    const ua = navigator.userAgent;
    const defOs = /Windows/.test(ua) ? 'windows' : /Mac/.test(ua) ? 'macos' : 'linux';
    drawOs(defOs);

    return h('div', { class: 'page bf-page', style: { '--app': 'var(--hue-byteforge)' } },
      appHero(appById('byteforge'), {
        eyebrow: 'Selvhostet homelab', title: 'ByteForge',
        lead: 'Selvhostet: serveren, data og kontrol bliver hos jer. ByteForge følger med HUBTECH og startes automatisk – panelet kører direkte her.',
        actions: [
          heroBtn('Original guide', 'book', { href: 'sites/byteforge-guide/index.html', target: '_blank', rel: 'noopener' }),
          heroGhost('GitHub', 'code', { href: 'https://github.com/Lucas050908/ByteForge', target: '_blank', rel: 'noopener' }),
          heroGhost('Rapportér fejl', 'alert', { href: 'https://github.com/Lucas050908/ByteForge/issues', target: '_blank', rel: 'noopener' })],
        stats: [
          { icon: 'server', label: 'Server-status', value: stStatus },
          { icon: 'globe', label: 'Adresse', value: stUrl },
          { icon: 'plug', label: 'Kører som', value: stMode },
          { icon: 'layers', label: 'Funktioner', value: String(FEATURES.length) }],
      }),
      panelSlot,
      h('div', { class: 'grid-2', style: { marginTop: '18px' } },
        h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('plug'), 'Forbindelse')), conn,
          h('p', { class: 'field-hint', style: { marginTop: '12px' } }, owner ? 'Status tjekkes af HUBTECH-serveren, så den virker også når ByteForge kører på en anden maskine i dit netværk.' : 'Kun ejeren kan ændre adressen.')),
        h('section', { class: 'glass panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, icon('download'), 'Kom i gang på 3 minutter'),
          segmented([{ value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }], defOs, drawOs, { label: 'Styresystem' })),
          osBox, h('p', { class: 'field-hint' }, 'Kræver Python 3.8+. Game servers og app store kræver Docker.'))),
      h('section', { style: { marginTop: '24px' } }, h('h2', { class: 'guide-cat' }, icon('sparkles'), 'Hvad kan ByteForge?'),
        h('div', { class: 'bf-features' }, FEATURES.map(([ic, t, d]) => h('div', { class: 'bf-feature glass', style: { '--app': 'var(--hue-byteforge)' } }, h('span', { class: 'row-icon solid' }, icon(ic)), h('div', null, h('h3', null, t), h('p', { class: 'muted' }, d)))))),
      h('section', { style: { marginTop: '24px' } }, h('h2', { class: 'guide-cat' }, icon('book'), 'ByteForge-guiden'),
        h('div', { class: 'guide-grid' }, GUIDES.filter(g => g.category === 'byteforge').map(guideCard))));
  },
};
