/**
 * Minecraft-server: everything about HUBTECH's Minecraft server on one page – address with a copy button, live
 * status (online, players, version, ping), how to join, rules, links and news.
 * The owner and the admins can change all of it (“Rediger”).
 */
import { h, clear, timeAgo } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, busy, errorToast, stateBlock, segmented, switchControl, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';

let timer = 0;
const EDITIONS = { java: 'Java Edition', bedrock: 'Bedrock (telefon, konsol, Windows)', both: 'Java og Bedrock' };

async function copy(text, what = 'Adressen') {
  try { await navigator.clipboard.writeText(text); toast(`${what} er kopieret`, { type: 'ok', text }); }
  catch { toast('Kunne ikke kopiere', { type: 'warn', text }); }
}

function addrBlock(label, addr, port, def) {
  const full = port && port !== def ? `${addr}:${port}` : addr;
  return h('div', { class: 'mc-addr' },
    h('div', { class: 'faint' }, label),
    h('button', { class: 'mc-addr-btn', title: 'Klik for at kopiere', onclick: () => copy(full) }, h('span', { class: 'mono' }, full), icon('copy')),
    port && port !== def ? null : h('div', { class: 'faint mc-port' }, `Port ${def} (standard – behøver ikke skrives)`));
}

function statusCard(s, st) {
  const box = h('section', { class: 'glass panel mc-status' });
  const draw = (data) => {
    clear(box);
    box.append(h('div', { class: 'adm-head' }, h('h2', { class: 'panel-title' }, 'Status'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: async (e) => { e.currentTarget.disabled = true; await load(); } }, icon('refresh'), 'Opdatér')));
    if (!data) { box.append(h('p', { class: 'faint' }, 'Status vises ikke for denne server.')); return; }
    const rows = [];
    for (const [k, label] of [['java', 'Java'], ['bedrock', 'Bedrock']]) {
      const x = data[k];
      if (!x) continue;
      rows.push(h('div', { class: 'mc-st-row' },
        h('span', { class: ['mc-dot', x.online ? 'is-on' : 'is-off'] }),
        h('div', { class: 'mc-st-main' },
          h('b', null, `${s.edition === 'both' ? label + ': ' : ''}${x.online ? 'Online' : 'Offline lige nu'}`),
          x.online ? h('div', { class: 'faint' }, [x.version && `Version ${x.version}`, `${x.ping} ms`].filter(Boolean).join(' · ')) : h('div', { class: 'faint' }, 'Serveren svarer ikke. Den kan være slukket eller ved at genstarte.'),
          x.online && x.motd ? h('div', { class: 'mc-motd' }, x.motd) : null),
        x.online ? h('div', { class: 'mc-players' }, h('b', null, `${x.players}/${x.max}`), h('span', { class: 'faint' }, 'spillere')) : null));
      if (x.online && x.names?.length) rows.push(h('div', { class: 'mc-names' }, x.names.map(n => h('span', { class: 'chip' }, '🧱 ', n))));
    }
    box.append(...rows, h('p', { class: 'faint', style: { margin: '6px 0 0', fontSize: '12px' } }, `Tjekket ${timeAgo(data.checkedAt)}`));
  };
  const load = async () => { try { draw((await api.get('/api/mc/status')).status); } catch (e) { clear(box); box.append(stateBlock({ kind: 'error', icon: 'alert', title: 'Status kunne ikke hentes', text: e.message })); } };
  box.append(h('div', { class: 'skel', style: { height: '90px', borderRadius: '12px' } }));
  load();
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden && box.isConnected) load(); }, 30000);
  return box;
}

function view(root, s, canEdit, onEdit) {
  const app = appById('minecraft');
  const joinSteps = s.howTo ? s.howTo.split('\n').filter(Boolean)
    : s.edition === 'bedrock' ? ['Åbn Minecraft og vælg Spil → Servere.', 'Tryk Tilføj server, og skriv adressen og porten herover.', 'Gem, og tryk på serveren for at komme ind.']
      : ['Åbn Minecraft Java Edition' + (s.version ? ` (version ${s.version})` : '') + '.', 'Vælg Multiplayer → Add Server.', 'Indsæt adressen herover under Server Address, og tryk Done.', 'Dobbeltklik på serveren for at komme ind.'];
  h(clear(root), null,
    appHero(app, { eyebrow: EDITIONS[s.edition], title: s.name, lead: s.description, compact: true,
      actions: [heroBtn('Kopiér adresse', 'copy', { onclick: () => copy(s.port ? `${s.address}:${s.port}` : s.address) }), canEdit ? heroGhost('Rediger', 'edit', { onclick: onEdit }) : null].filter(Boolean),
      stats: [s.version ? { icon: 'tag', label: 'Version', value: s.version } : null, { icon: 'globe', label: 'Udgave', value: { java: 'Java', bedrock: 'Bedrock', both: 'Java + Bedrock' }[s.edition] }] }),
    h('div', { class: 'mc-grid' },
      h('div', { class: 'stack' },
        h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Adresse'),
          s.edition !== 'bedrock' && s.address ? addrBlock(s.edition === 'both' ? 'Java' : 'Server-adresse', s.address, s.port, 25565) : null,
          s.edition !== 'java' ? addrBlock(s.edition === 'both' ? 'Bedrock' : 'Server-adresse', s.bedrockAddress || s.address, s.bedrockPort, 19132) : null),
        s.showStatus ? statusCard(s) : null,
        h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Sådan kommer du ind'), h('ol', { class: 'mc-steps' }, joinSteps.map(x => h('li', null, x))))),
      h('div', { class: 'stack' },
        s.rules.length ? h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Regler'), h('ul', { class: 'mc-rules' }, s.rules.map(r => h('li', null, r)))) : null,
        s.links.length ? h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Links'), h('div', { class: 'mc-links' }, s.links.map(l => h('a', { class: 'btn', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), l.label)))) : null,
        h('section', { class: 'glass panel' }, h('h2', { class: 'panel-title' }, 'Nyheder'),
          s.news.length ? h('div', { class: 'mc-news' }, [...s.news].sort((a, b) => b.at - a.at).map(n => h('article', null, h('b', null, n.title), h('div', { class: 'faint' }, timeAgo(n.at)), n.text ? h('p', null, n.text) : null)))
            : h('p', { class: 'faint' }, canEdit ? 'Ingen nyheder endnu – tilføj en under Rediger.' : 'Ingen nyheder endnu.')))));
}

function editor(root, s, onDone) {
  const app = appById('minecraft');
  const f = (v, attrs = {}) => h('input', { class: 'input', value: v ?? '', ...attrs });
  const name = f(s.name, { maxlength: 60, 'aria-label': 'Navn' });
  let edition = s.edition;
  const address = f(s.address, { placeholder: 'fx play.mitnavn.dk', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Adresse (Java)' });
  const port = f(s.port || '', { type: 'number', min: 1, max: 65535, placeholder: '25565', 'aria-label': 'Port (Java)' });
  const baddr = f(s.bedrockAddress, { placeholder: 'Samme som Java', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Adresse (Bedrock)' });
  const bport = f(s.bedrockPort || '', { type: 'number', min: 1, max: 65535, placeholder: '19132', 'aria-label': 'Port (Bedrock)' });
  const version = f(s.version, { maxlength: 40, placeholder: 'fx 1.21.8', 'aria-label': 'Version' });
  const desc = h('textarea', { class: 'input', rows: 3, maxlength: 600, 'aria-label': 'Beskrivelse' }, s.description);
  const howTo = h('textarea', { class: 'input', rows: 4, maxlength: 1500, placeholder: 'Ét trin pr. linje. Tomt = HUBTECH skriver selv en vejledning.', 'aria-label': 'Sådan kommer du ind' }, s.howTo);
  const rules = h('textarea', { class: 'input', rows: 5, 'aria-label': 'Regler' }, s.rules.join('\n'));
  const links = h('textarea', { class: 'input', rows: 3, placeholder: 'Discord | https://discord.gg/…', 'aria-label': 'Links' }, s.links.map(l => `${l.label} | ${l.url}`).join('\n'));
  let showStatus = s.showStatus;
  const news = [...s.news];
  const newsBox = h('div', { class: 'mc-news-edit' });
  const drawNews = () => {
    clear(newsBox);
    news.sort((a, b) => b.at - a.at).forEach((n, i) => newsBox.append(h('div', { class: 'mc-news-row' }, h('div', null, h('b', null, n.title), h('div', { class: 'faint' }, timeAgo(n.at))),
      h('button', { class: 'icon-btn', 'aria-label': `Slet nyheden ${n.title}`, onclick: () => { news.splice(i, 1); drawNews(); } }, icon('trash')))));
  };
  drawNews();
  const nt = f('', { maxlength: 120, placeholder: 'Overskrift', 'aria-label': 'Nyhedens overskrift' });
  const nx = h('textarea', { class: 'input', rows: 2, maxlength: 1000, placeholder: 'Tekst (valgfri)', 'aria-label': 'Nyhedens tekst' });
  const addNews = h('button', { class: 'btn btn-sm', onclick: () => { if (!nt.value.trim()) return nt.focus(); news.push({ title: nt.value.trim(), text: nx.value.trim(), at: Math.floor(Date.now() / 1000) }); nt.value = ''; nx.value = ''; drawNews(); } }, icon('plus'), 'Tilføj nyhed');
  const edSeg = segmented(Object.entries({ java: 'Java', bedrock: 'Bedrock', both: 'Begge' }).map(([value, label]) => ({ value, label })), edition, (v) => { edition = v; javaRow.hidden = v === 'bedrock'; bedRow.hidden = v === 'java'; }, { label: 'Udgave' });
  const row = (label, hint, control) => h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('b', null, label), hint ? h('div', { class: 'faint' }, hint) : null), h('div', { class: 'set-control' }, control));
  const javaRow = row('Java-adresse', 'Det, spillerne skriver i Minecraft. Port kun hvis den ikke er 25565.', h('div', { class: 'row', style: { gap: '8px' } }, address, port));
  const bedRow = row('Bedrock-adresse', 'Tom = samme adresse som Java.', h('div', { class: 'row', style: { gap: '8px' } }, baddr, bport));
  javaRow.hidden = edition === 'bedrock'; bedRow.hidden = edition === 'java';
  const save = h('button', { class: 'btn btn-primary' }, icon('check'), 'Gem');
  save.addEventListener('click', busy(save, async () => {
    const body = {
      name: name.value, edition, address: address.value, port: Number(port.value) || 0, bedrockAddress: baddr.value, bedrockPort: Number(bport.value) || 19132,
      version: version.value, description: desc.value, howTo: howTo.value, showStatus,
      rules: rules.value.split('\n').map(x => x.trim()).filter(Boolean),
      links: links.value.split('\n').map(l => { const [a, ...b] = l.split('|'); const url = (b.length ? b.join('|') : a).trim(); return { label: b.length ? a.trim() : url, url }; }).filter(l => l.url),
      news,
    };
    try { const r = await api.put('/api/mc', body); toast('Gemt – alle kan se de nye oplysninger', { type: 'ok' }); onDone(r.server); }
    catch (e) { errorToast(e); }
  }));
  h(clear(root), null,
    appHero(app, { eyebrow: 'Rediger', title: s.name, compact: true }),
    h('section', { class: 'glass panel mc-edit' },
      h('h2', { class: 'panel-title' }, 'Oplysninger'),
      row('Navn', null, name),
      row('Udgave', 'Java på PC/Mac, Bedrock på telefon, konsol og Windows', edSeg),
      javaRow, bedRow,
      row('Version', 'Den Minecraft-version, serveren kører', version),
      row('Beskrivelse', null, desc),
      row('Sådan kommer du ind', 'Ét trin pr. linje', howTo),
      row('Regler', 'Én regel pr. linje', rules),
      row('Links', 'Én pr. linje: Navn | https://…', links),
      row('Vis status', 'Online, spillere og version hentes direkte fra serveren', switchControl({ checked: showStatus, label: 'Vis status', onChange: (v) => { showStatus = v; } })),
      h('h2', { class: 'panel-title', style: { marginTop: '18px' } }, 'Nyheder'),
      newsBox, h('div', { class: 'set-stack' }, nt, nx, h('div', null, addNews)),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '18px', flexWrap: 'wrap' } }, save,
        h('button', { class: 'btn btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Kassér ændringerne?', text: 'Det, du har skrevet, bliver ikke gemt.', confirmLabel: 'Kassér' })) onDone(null); } }, 'Annullér'))));
}

export default {
  title: 'Minecraft-server',
  destroy() { clearInterval(timer); },
  async render() {
    const root = h('div', { class: 'page mc-page' });
    let r;
    try { r = await api.get('/api/mc'); }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Kunne ikke hentes', text: e.message })); }
    let s = r.server;
    const show = () => view(root, s, r.canEdit, () => editor(root, s, (saved) => { if (saved) s = saved; show(); }));
    show();
    return root;
  },
};
