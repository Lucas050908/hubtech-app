/**
 * Tjeklister – ready-made lists for typical IT and service jobs, ticked off as you go.
 * Start one from a template (or your own), tick items, add notes; finished lists are kept as history.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, copy, appState, loadError, uid } from '../features/appkit.js';

export const TEMPLATES = [
  { id: 'new-pc', title: 'Ny computer til en kunde', icon: 'monitor', items: [
    'Pak ud, og tjek for transportskader', 'Tænd, og gennemfør Windows-opsætningen med kundens konto', 'Kør Windows Update, til der ikke er flere opdateringer',
    'Installér producentens drivere og opdateringsværktøj', 'Fjern unødvendige prøveprogrammer', 'Installér browser, Office og kundens programmer',
    'Slå BitLocker / enhedskryptering til, og gem gendannelsesnøglen sikkert', 'Opsæt backup (OneDrive eller ekstern disk)', 'Flyt data fra den gamle computer',
    'Tilføj printere', 'Test lyd, kamera, Wi-Fi og opladning', 'Gennemgå det vigtigste med kunden'] },
  { id: 'printer', title: 'Installér en netværksprinter', icon: 'printer', items: [
    'Notér model og serienummer', 'Sæt printeren på netværket (kabel eller Wi-Fi)', 'Udskriv en konfigurationsside, og notér IP-adressen',
    'Lav en DHCP-reservation i routeren', 'Opdater printerens firmware', 'Tilføj printeren på hver computer (via IP)',
    'Vælg de rigtige standardindstillinger (sort/hvid, dupleks)', 'Opsæt scan til e-mail eller mappe', 'Testudskrift og testscanning fra hver computer', 'Vis kunden, hvor toner bestilles'] },
  { id: 'visit', title: 'Kundebesøg', icon: 'tool', items: [
    'Læs sagen og kundens tidligere sager', 'Tag værktøj, kabler og reservedele med', 'Hils, og få fejlen forklaret med kundens egne ord',
    'Spørg: Hvornår startede det? Er der ændret noget?', 'Tag billeder af fejl og fejlkoder', 'Løs fejlen, eller find årsagen',
    'Test sammen med kunden', 'Forklar kort, hvad der var galt', 'Skriv sagen: fejl, årsag, løsning, dele og tid', 'Aftal opfølgning, hvis det er nødvendigt'] },
  { id: 'backup', title: 'Backup-tjek', icon: 'database', items: [
    'Kører backuppen automatisk?', 'Hvornår var seneste vellykkede backup?', 'Er der plads nok på backupdisken / i skyen?',
    'Prøv at gendanne én fil', 'Ligger der en kopi uden for huset (sky eller anden adresse)?', 'Er backupdisken frakoblet, når den ikke bruges (beskytter mod ransomware)?'] },
  { id: 'wifi', title: 'Wi-Fi-problemer', icon: 'globe', items: [
    'Gælder det alle enheder eller kun én?', 'Genstart routeren', 'Test hastigheden tæt på routeren og langt fra', 'Tjek kanal og frekvens (2,4 / 5 GHz)',
    'Opdater routerens firmware', 'Overvej mesh eller et ekstra adgangspunkt ved huller i dækningen', 'Tjek at gæstenetværket er adskilt fra resten'] },
  { id: 'employee', title: 'Ny medarbejder (IT)', icon: 'userPlus', items: [
    'Opret konto og e-mail', 'Tildel licenser (fx Office)', 'Klargør computer og telefon', 'Giv adgang til fællesmapper og systemer',
    'Opsæt totrinsbekræftelse', 'Tilføj printere', 'Gennemgå IT-regler og phishing', 'Notér udleveret udstyr'] },
  { id: 'leaver', title: 'Medarbejder stopper (IT)', icon: 'logout', items: [
    'Spær kontoen på sidste dag', 'Videresend e-mail, eller lav et automatisk svar', 'Flyt filer til en kollega eller fællesmappe',
    'Fjern licenser', 'Indsaml computer, telefon og nøglekort', 'Nulstil udstyret, før det genbruges'] },
];

export default {
  title: 'Tjeklister',
  async render() {
    const app = appById('checklists');
    let store;
    try { store = await appState('checklists', { lists: [], own: [] }); } catch (e) { return loadError('Tjeklister', e); }
    const st = store.data;
    let openId = st.lists.find(l => !l.doneAt)?.id || null;
    const left = h('div', { class: 'stack' }), right = h('div', { class: 'stack' });
    const stats = { open: h('span'), done: h('span') };
    const drawStats = () => { stats.open.textContent = String(st.lists.filter(l => !l.doneAt).length); stats.done.textContent = String(st.lists.filter(l => l.doneAt).length); };

    function startFrom(t) {
      const l = { id: uid(), title: t.title, icon: t.icon || 'list', items: t.items.map(x => ({ t: x, done: false })), note: '', created: Date.now(), doneAt: null };
      st.lists.unshift(l); openId = l.id; store.save(); drawAll();
    }

    function drawList() {
      const l = st.lists.find(x => x.id === openId);
      if (!l) {
        h(clear(right), null, panel('Vælg en tjekliste', 'list', h('p', { class: 'muted', style: { margin: 0 } }, 'Start en tjekliste fra skabelonerne til venstre. Den gemmes på din konto, så du kan fortsætte på telefonen ude hos kunden.')));
        return;
      }
      const doneN = l.items.filter(i => i.done).length;
      const bar = h('div', { class: 'cl-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': l.items.length, 'aria-valuenow': doneN }, h('i', { style: { width: `${l.items.length ? doneN / l.items.length * 100 : 0}%` } }));
      const items = h('ul', { class: 'cl-items' }, l.items.map((it, i) => {
        const cb = h('input', { type: 'checkbox', checked: it.done, disabled: !!l.doneAt });
        cb.addEventListener('change', () => { it.done = cb.checked; store.save(); drawList(); drawSide(); });
        const del = l.doneAt ? null : h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern “${it.t}”`, onclick: () => { l.items.splice(i, 1); store.save(); drawList(); } }, icon('x'));
        return h('li', { class: ['cl-item', it.done && 'is-done'] }, h('label', null, cb, h('span', null, it.t)), del);
      }));
      const add = h('input', { class: 'input', placeholder: 'Tilføj et punkt …', 'aria-label': 'Nyt punkt', maxlength: 160 });
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { l.items.push({ t: add.value.trim(), done: false }); store.save(); drawList(); right.querySelector('input[aria-label="Nyt punkt"]')?.focus(); } });
      const note = h('textarea', { class: 'input cl-note', placeholder: 'Noter (fx IP-adresser, serienumre, hvad kunden sagde)', 'aria-label': 'Noter', rows: 3, disabled: !!l.doneAt });
      note.value = l.note || '';
      note.addEventListener('input', () => { l.note = note.value; store.save(); });
      const text = () => [l.title, ...l.items.map(i => `${i.done ? '☑' : '☐'} ${i.t}`), l.note ? `\nNoter:\n${l.note}` : ''].join('\n');
      const finish = h('button', { class: 'btn btn-primary' }, icon('checkCircle'), 'Afslut tjeklisten');
      finish.addEventListener('click', async () => {
        if (doneN < l.items.length && !await confirmDialog({ title: 'Afslut med åbne punkter?', text: `${l.items.length - doneN} punkt(er) er ikke krydset af.`, confirmLabel: 'Afslut alligevel' })) return;
        l.doneAt = Date.now(); store.save(); toast('Tjeklisten er afsluttet', { type: 'ok' }); drawAll();
      });
      const remove = h('button', { class: 'btn btn-ghost' }, icon('trash'), 'Slet');
      remove.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'Slet tjeklisten?', text: `“${l.title}” slettes.`, confirmLabel: 'Slet', danger: true })) return;
        st.lists = st.lists.filter(x => x.id !== l.id); openId = null; store.save(); drawAll();
      });
      const saveTpl = h('button', { class: 'btn btn-ghost' }, icon('star'), 'Gem som skabelon');
      saveTpl.addEventListener('click', () => { st.own = [{ id: uid(), title: l.title, icon: l.icon, items: l.items.map(i => i.t) }, ...st.own].slice(0, 30); store.save(); toast('Gemt som din skabelon', { type: 'ok' }); drawSide(); });
      h(clear(right), null, panel(l.title, l.icon || 'list',
        h('div', { class: 'cl-progress' }, bar, h('span', { class: 'faint' }, `${doneN} af ${l.items.length}${l.doneAt ? ` · afsluttet ${new Date(l.doneAt).toLocaleDateString('da-DK')}` : ''}`)),
        items, l.doneAt ? null : add, note,
        h('div', { class: 'pd-actions' }, l.doneAt ? null : finish, h('button', { class: 'btn', onclick: () => copy(text(), 'Tjeklisten er kopieret') }, icon('copy'), 'Kopiér'), saveTpl, remove)));
    }

    function drawSide() {
      const tplBtn = (t, own) => h('button', { class: 'pd-problem', type: 'button', onclick: () => startFrom(t) },
        h('span', { class: 'row-icon' }, icon(t.icon || 'list')), h('span', null, h('b', null, t.title), h('small', null, `${t.items.length} punkter${own ? ' · din egen' : ''}`)), icon('plus'));
      const mine = st.lists.slice(0, 12).map(l => {
        const d = l.items.filter(i => i.done).length;
        return h('button', { class: ['row', 'pd-hist', l.id === openId && 'is-active'], type: 'button', onclick: () => { openId = l.id; drawAll(); } },
          h('span', { class: ['row-icon', l.doneAt ? 'solid' : ''] }, icon(l.doneAt ? 'checkCircle' : l.icon || 'list')),
          h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, l.title), h('div', { class: 'row-sub' }, `${d}/${l.items.length} · ${new Date(l.created).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}${l.doneAt ? ' · afsluttet' : ''}`)));
      });
      h(clear(left), null,
        panel('Mine tjeklister', 'list', mine.length ? h('div', { class: 'list' }, mine) : h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen endnu.')),
        panel('Skabeloner', 'layers', h('div', { class: 'pd-problems' }, [...st.own.map(t => tplBtn(t, true)), ...TEMPLATES.map(t => tplBtn(t))]),
          h('button', { class: 'btn btn-sm', style: { marginTop: '10px' }, onclick: () => startFrom({ title: 'Ny tjekliste', icon: 'list', items: [] }) }, icon('plus'), 'Tom tjekliste')));
    }
    function drawAll() { drawStats(); drawSide(); drawList(); }
    drawAll();
    return h('div', { class: 'page cl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Support', title: 'Tjeklister', lead: 'Glem ingenting: færdige lister til ny computer, printerinstallation, kundebesøg, backup og meget mere. Kryds af på computeren eller telefonen.',
        stats: [{ icon: 'list', label: 'I gang', value: stats.open }, { icon: 'checkCircle', label: 'Afsluttet', value: stats.done }, { icon: 'layers', label: 'Skabeloner', value: String(TEMPLATES.length) }] }),
      h('div', { class: 'pd-layout' }, left, right));
  },
};
