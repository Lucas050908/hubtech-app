/** Netværksberegner – subnets (IPv4), how long a download takes, and bits/bytes. Everything is worked out on the device. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, copy } from '../features/appkit.js';
import * as N from '../features/netcalc.js';

const EXAMPLES = ['192.168.1.10/24', '10.0.0.50 255.255.0.0', '172.16.5.4/20', '100.101.102.103/32'];
const SIZE_UNITS = ['MB', 'GB', 'TB', 'MiB', 'GiB'];
const PRESETS = [['Film i HD', 4, 'GB'], ['Windows-opdatering', 900, 'MB'], ['Spil', 80, 'GB'], ['Foto', 5, 'MB'], ['Fuld backup', 1, 'TB']];
const SPEEDS = [[10, 'Langsom ADSL'], [50, 'Almindelig 4G'], [100, 'Bredbånd'], [500, 'Hurtig fiber'], [1000, 'Gigabit']];

export default {
  title: 'Netværksberegner',
  async render(ctx) {
    const app = appById('netcalc');
    const first = ['subnet', 'speed', 'units'].includes(ctx?.params?.sub) ? ctx.params.sub : 'subnet';
    const body = h('div', { class: 'stack' });
    const row = (label, value, mono = true) => h('div', { class: 'nc-row' }, h('span', { class: 'faint' }, label),
      h('b', { class: mono ? 'nc-mono' : '' }, value),
      mono ? h('button', { class: 'icon-btn btn-sm', 'aria-label': `Kopiér ${label.toLowerCase()}`, title: 'Kopiér', onclick: () => copy(value, `${label} er kopieret`) }, icon('copy')) : h('span'));

    function subnetTab() {
      const input = h('input', { class: 'input nc-input', value: '192.168.1.10/24', 'aria-label': 'IP-adresse og præfiks eller netmaske', spellcheck: 'false', autocomplete: 'off' });
      const out = h('div', { class: 'nc-out', 'aria-live': 'polite' });
      const splitOut = h('div');
      const other = h('input', { class: 'input nc-input', placeholder: 'fx 192.168.1.200', 'aria-label': 'En anden adresse', spellcheck: 'false' });
      const sameOut = h('p', { class: 'nc-same', 'aria-live': 'polite' });
      const parts = h('select', { class: 'select', 'aria-label': 'Antal delnet' }, [2, 4, 8, 16, 32].map(n => h('option', { value: n }, `${n} delnet`)));
      const need = h('input', { class: 'input', type: 'number', min: 1, max: 16777214, value: 50, 'aria-label': 'Antal enheder', style: { width: '110px' } });
      const needOut = h('span', { class: 'faint' });
      let net = null;
      function calc() {
        net = N.parseCidr(input.value);
        if (net.error) { h(clear(out), null, h('p', { class: 'field-error', style: { margin: 0 } }, net.error)); clear(splitOut); sameOut.textContent = ''; return; }
        h(clear(out), null,
          h('div', { class: 'nc-grid' },
            row('Netværk', `${N.intToIp(net.network)}/${net.prefix}`), row('Netmaske', N.intToIp(net.mask)),
            row('Første adresse', N.intToIp(net.first)), row('Sidste adresse', N.intToIp(net.last)),
            row('Broadcast', net.prefix >= 31 ? '– (ingen ved /31 og /32)' : N.intToIp(net.broadcast), net.prefix < 31),
            row('Wildcard', N.intToIp(net.wildcard)),
            row('Enheder', net.hosts.toLocaleString('da-DK'), false), row('Type', net.kind, false)),
          h('details', { class: 'nc-bin' }, h('summary', null, 'Vis som binært'),
            h('pre', null, `Adresse  ${N.toBinary(net.ip)}\nMaske    ${N.toBinary(net.mask)}\nNetværk  ${N.toBinary(net.network)}`),
            h('p', { class: 'faint' }, `De første ${net.prefix} bit er netværket (maskens 1-taller), de sidste ${32 - net.prefix} bit er enhederne. Klasse ${net.cls} efter den gamle inddeling.`)));
        drawSplit(); same();
      }
      function drawSplit() {
        if (!net || net.error) return;
        const sp = N.split(net, Number(parts.value));
        if (sp.error) { h(clear(splitOut), null, h('p', { class: 'faint' }, sp.error)); return; }
        h(clear(splitOut), null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl nc-table' },
          h('thead', null, h('tr', null, ['Delnet', 'Første', 'Sidste', 'Broadcast', 'Enheder'].map(t => h('th', null, t)))),
          h('tbody', null, sp.list.map(s => h('tr', null, h('td', { class: 'nc-mono' }, `${N.intToIp(s.network)}/${s.prefix}`), h('td', { class: 'nc-mono' }, N.intToIp(s.first)), h('td', { class: 'nc-mono' }, N.intToIp(s.last)),
            h('td', { class: 'nc-mono' }, s.prefix >= 31 ? '–' : N.intToIp(s.broadcast)), h('td', null, s.hosts.toLocaleString('da-DK'))))))));
      }
      function same() {
        if (!net || net.error || !other.value.trim()) { sameOut.textContent = ''; sameOut.className = 'nc-same'; return; }
        const b = N.ipToInt(other.value);
        if (b == null) { sameOut.textContent = 'Det er ikke en gyldig IPv4-adresse.'; sameOut.className = 'nc-same'; return; }
        const ok = N.sameSubnet(net.ip, b, net.prefix);
        sameOut.className = `nc-same ${ok ? 'is-ok' : 'is-bad'}`;
        sameOut.textContent = ok ? `Ja – ${other.value.trim()} er på samme net og kan snakke direkte med ${N.intToIp(net.ip)}.` : `Nej – ${other.value.trim()} er på et andet net. Trafikken skal gennem en router (gateway).`;
      }
      const needCalc = () => { const n = Number(need.value); if (!(n >= 1)) { needOut.textContent = ''; return; } const p = N.prefixFor(n); needOut.textContent = `Brug /${p} (${N.intToIp(N.prefixToMask(p))}) – plads til ${(2 ** (32 - p) - 2).toLocaleString('da-DK')} enheder.`; };
      input.addEventListener('input', calc); parts.addEventListener('change', drawSplit); other.addEventListener('input', same); need.addEventListener('input', needCalc);
      calc(); needCalc();
      return [panel('Subnet', 'globe',
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'IP-adresse med /præfiks eller netmaske'), input),
        h('div', { class: 'nc-examples' }, h('span', { class: 'faint' }, 'Prøv:'), EXAMPLES.map(e => h('button', { class: 'chip-btn', onclick: () => { input.value = e; calc(); } }, e))),
        out),
      panel('Er de på samme net?', 'link', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Typisk fejl: printeren har fået en fast adresse på et andet net end computerne.'), other, sameOut),
      panel('Hvor stort et net skal jeg bruge?', 'users', h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, need, h('span', null, 'enheder'), needOut)),
      panel('Del nettet op', 'layers', h('div', { class: 'row', style: { gap: '10px', marginBottom: '10px' } }, h('span', { class: 'faint' }, 'Del i'), parts), splitOut)];
    }

    function speedTab() {
      const size = h('input', { class: 'input', type: 'number', min: 0, step: 'any', value: 4, 'aria-label': 'Filstørrelse', style: { width: '120px' } });
      const unit = h('select', { class: 'select', 'aria-label': 'Enhed' }, SIZE_UNITS.map(u => h('option', { value: u, selected: u === 'GB' }, u)));
      const speed = h('input', { class: 'input', type: 'number', min: 0, step: 'any', value: 100, 'aria-label': 'Hastighed i Mbit/s', style: { width: '120px' } });
      const out = h('div', { class: 'nc-big', 'aria-live': 'polite' });
      const table = h('div');
      function calc() {
        const s = Number(size.value), v = Number(speed.value);
        const secs = N.downloadSecs(s, unit.value, v);
        h(clear(out), null, h('span', { class: 'faint' }, `${N.fmtNum(s)} ${unit.value} med ${N.fmtNum(v)} Mbit/s tager`), h('b', null, N.fmtDuration(secs)),
          h('span', { class: 'faint' }, `I praksis lidt længere – der går typisk 5–10 % til styring af forbindelsen. ${N.fmtNum(v)} Mbit/s er ${N.fmtNum(N.convert(v, 'Mbit', 'MB'), 1)} MB i sekundet.`));
        h(clear(table), null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl nc-table' },
          h('thead', null, h('tr', null, h('th', null, ''), SPEEDS.map(([sp, l]) => h('th', null, `${sp} Mbit/s`, h('small', null, l))))),
          h('tbody', null, PRESETS.map(([name, n, u]) => h('tr', null, h('th', { scope: 'row' }, `${name} (${n} ${u})`), SPEEDS.map(([sp]) => h('td', null, N.fmtDuration(N.downloadSecs(n, u, sp))))))))));
      }
      [size, unit, speed].forEach(x => x.addEventListener('input', calc));
      calc();
      return [panel('Hvor lang tid tager det?', 'timer',
        h('div', { class: 'nc-speed' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Størrelse'), h('div', { class: 'row', style: { gap: '6px' } }, size, unit)),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hastighed (Mbit/s)'), speed)),
        h('div', { class: 'nc-examples' }, h('span', { class: 'faint' }, 'Hastighed:'), SPEEDS.map(([sp, l]) => h('button', { class: 'chip-btn', title: l, onclick: () => { speed.value = sp; calc(); } }, `${sp} Mbit/s`))),
        out),
      panel('Typiske ventetider', 'clock', table)];
    }

    function unitsTab() {
      const val = h('input', { class: 'input', type: 'number', step: 'any', value: 1, 'aria-label': 'Værdi', style: { width: '140px' } });
      const from = h('select', { class: 'select', 'aria-label': 'Fra enhed' }, Object.keys(N.UNITS).map(u => h('option', { value: u, selected: u === 'GiB' }, u)));
      const out = h('div', { class: 'nc-units' });
      function calc() {
        const v = Number(val.value);
        h(clear(out), null, Object.keys(N.UNITS).filter(u => u !== from.value).map(u => h('div', { class: 'nc-unit' }, h('b', null, N.fmtNum(N.convert(v, from.value, u), 4)), h('span', { class: 'faint' }, u))));
      }
      [val, from].forEach(x => x.addEventListener('input', calc));
      calc();
      return [panel('Bit og bytes', 'database', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, val, from), out),
        panel('Godt at vide', 'help', h('ul', { class: 'pg-rules' },
          h('li', null, '1 byte = 8 bit. Internethastighed måles i bit (Mbit/s), filer i bytes (MB).'),
          h('li', null, 'kB, MB og GB går i tusinder (1 GB = 1.000.000.000 byte). KiB, MiB og GiB går i 1024 – det er dem, Windows viser, men kalder “GB”.'),
          h('li', null, 'Derfor viser Windows en “1 TB”-disk som ca. 931 GB – der mangler ikke noget.')))];
    }

    const TABS = { subnet: subnetTab, speed: speedTab, units: unitsTab };
    const open = (id) => { history.replaceState(null, '', `#/apps/netcalc${id === 'subnet' ? '' : `/${id}`}`); h(clear(body), null, TABS[id]()); };
    const seg = segmented([{ value: 'subnet', label: 'Subnet', icon: 'globe' }, { value: 'speed', label: 'Downloadtid', icon: 'timer' }, { value: 'units', label: 'Bit og bytes', icon: 'database' }], first, open, { label: 'Vælg' });
    h(body, null, TABS[first]());
    return h('div', { class: 'page nc-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'IT-support', title: 'Netværksberegner', lead: 'Regn subnet ud, se om to enheder er på samme net, og find ud af hvor lang tid en download tager.', compact: true }),
      h('div', { class: 'cmd-filters' }, seg), body);
  },
};
