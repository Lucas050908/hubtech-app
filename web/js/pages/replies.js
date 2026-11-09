/**
 * Svarskabeloner – ready-made replies for IT-support and customers: fill in the fields and copy or e-mail.
 * Fields are written as {navn} in the text. Your own templates are saved on the account.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, copy, appState, loadError, uid } from '../features/appkit.js';

export const REPLY_TEMPLATES = [
  { id: 'received', title: 'Vi har modtaget din henvendelse', icon: 'mail', subject: 'Vi har modtaget din henvendelse (sag {sagsnummer})',
    text: 'Hej {kundens navn}\n\nTak for din henvendelse. Vi har oprettet sagen med nummeret {sagsnummer} og vender tilbage senest {hvornår}.\n\nHar du flere oplysninger – fx billeder af fejlen – så svar bare på denne mail.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'need-info', title: 'Vi mangler oplysninger', icon: 'help', subject: 'Vi mangler et par oplysninger',
    text: 'Hej {kundens navn}\n\nFor at kunne hjælpe dig har vi brug for lidt flere oplysninger:\n\n• Hvilken model drejer det sig om?\n• Hvornår startede problemet?\n• Står der en fejlmeddelelse? (send gerne et billede)\n\nVenlig hilsen\n{dit navn}' },
  { id: 'solved', title: 'Sagen er løst', icon: 'checkCircle', subject: 'Din sag er løst',
    text: 'Hej {kundens navn}\n\nGode nyheder: {hvad der var galt} er nu løst. Vi har {hvad vi gjorde}.\n\nOplever du problemet igen, så svar på denne mail, så åbner vi sagen igen.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'visit', title: 'Bekræft besøg', icon: 'calendar', subject: 'Bekræftelse af besøg {dato}',
    text: 'Hej {kundens navn}\n\nHermed bekræftet: vi kommer {dato} ca. kl. {tidspunkt} på adressen {adresse}.\n\nSørg gerne for, at computeren er tændt, og at du har dine adgangskoder klar.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'ready', title: 'Udstyret er klar til afhentning', icon: 'box', subject: 'Din {enhed} er klar',
    text: 'Hej {kundens navn}\n\nDin {enhed} er færdig og klar til afhentning. Prisen er {pris} kr.\n\nVi har åbent {åbningstider}. Husk sagsnummer {sagsnummer}.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'quote', title: 'Tilbud på reparation', icon: 'tag', subject: 'Tilbud på reparation af {enhed}',
    text: 'Hej {kundens navn}\n\nVi har undersøgt din {enhed}. Fejlen er: {fejl}.\n\nReparationen koster {pris} kr. inkl. moms og tager ca. {tid}. Svar blot “ja”, hvis vi skal gå i gang.\n\nVælger du ikke at reparere, koster fejlfindingen {fejlfindingspris} kr.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'password', title: 'Ny adgangskode udleveret', icon: 'key', subject: 'Din konto er klar',
    text: 'Hej {kundens navn}\n\nDin konto er nulstillet. Du får den midlertidige adgangskode på SMS.\n\nNår du logger ind, bliver du bedt om at vælge en ny. Brug gerne en kodesætning på mindst fire ord.\n\nVi spørger aldrig om din adgangskode på mail eller telefon.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'phishing', title: 'Advarsel om phishing', icon: 'shield', subject: 'Advarsel: falske e-mails i omløb',
    text: 'Hej alle\n\nVi ser lige nu falske e-mails, der ligner {hvad de ligner}. De beder dig klikke på et link og logge ind.\n\nKlik ikke på linket. Slet mailen, eller videresend den til {it-mail}.\n\nHar du allerede klikket og skrevet din kode, så ring til os med det samme på {telefon}.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'downtime', title: 'Planlagt nedetid', icon: 'server', subject: 'Planlagt vedligeholdelse {dato}',
    text: 'Hej alle\n\n{system} er lukket {dato} fra kl. {fra} til {til} på grund af vedligeholdelse.\n\nGem dit arbejde inden, og log ud. Vi giver besked, når alt kører igen.\n\nVenlig hilsen\n{dit navn}' },
  { id: 'followup', title: 'Opfølgning efter en uge', icon: 'refresh', subject: 'Kører det, som det skal?',
    text: 'Hej {kundens navn}\n\nFor en uge siden hjalp vi dig med {hvad vi hjalp med}. Vi ville bare høre, om alt stadig kører, som det skal?\n\nEllers er du altid velkommen til at kontakte os.\n\nVenlig hilsen\n{dit navn}' },
];
const fieldsOf = (t) => [...new Set([...`${t.subject || ''}\n${t.text}`.matchAll(/\{([^{}\n]{1,40})\}/g)].map(m => m[1]))];
const fill = (s, v) => String(s || '').replace(/\{([^{}\n]{1,40})\}/g, (m, k) => (v[k]?.trim() ? v[k].trim() : m));

export default {
  title: 'Svarskabeloner',
  async render() {
    const app = appById('replies');
    let store;
    try { store = await appState('replies', { own: [], values: {} }); } catch (e) { return loadError('Svarskabeloner', e); }
    const st = store.data;
    let cur = REPLY_TEMPLATES[0];
    const listEl = h('div', { class: 'pd-problems' });
    const editor = h('div', { class: 'stack' });
    const all = () => [...st.own.map(t => ({ ...t, own: true })), ...REPLY_TEMPLATES];

    function drawList() {
      clear(listEl);
      all().forEach(t => listEl.append(h('button', { class: ['pd-problem', t.id === cur.id && 'is-on'], onclick: () => { cur = t; drawList(); drawEditor(); } },
        h('span', { class: 'row-icon' }, icon(t.icon || 'note')), h('span', null, h('b', null, t.title), t.own ? h('small', null, 'Din egen skabelon') : null), icon('chevronRight'))));
    }
    function drawEditor() {
      clear(editor);
      const vals = st.values;   // name, phone etc. are remembered between templates
      const out = h('pre', { class: 'rp-out' }), subj = h('div', { class: 'rp-subj' });
      const render = () => { subj.textContent = fill(cur.subject, vals); out.textContent = fill(cur.text, vals); };
      let saveT;
      const fields = fieldsOf(cur).map(f => {
        const inp = h('input', { class: 'input', placeholder: f, 'aria-label': f, value: vals[f] || '' });
        inp.addEventListener('input', () => { vals[f] = inp.value; render(); clearTimeout(saveT); saveT = setTimeout(() => store.save(), 800); });
        return h('label', { class: 'field rp-field' }, h('span', { class: 'field-label' }, f[0].toUpperCase() + f.slice(1)), inp);
      });
      render();
      const mail = () => { location.href = `mailto:?subject=${encodeURIComponent(subj.textContent)}&body=${encodeURIComponent(out.textContent)}`; };
      const missing = () => fieldsOf(cur).filter(f => !vals[f]?.trim());
      const doCopy = () => { const m = missing(); copy(`${out.textContent}`, m.length ? `Kopieret – men ${m.length} felt${m.length === 1 ? '' : 'er'} er ikke udfyldt` : 'Svaret er kopieret'); };
      editor.append(panel(cur.title, cur.icon || 'note',
        fields.length ? h('div', { class: 'rp-fields' }, fields) : h('p', { class: 'faint' }, 'Ingen felter at udfylde.'),
        h('div', { class: 'rp-preview' }, cur.subject ? h('div', { class: 'faint', style: { fontSize: '12.5px' } }, 'Emne') : null, cur.subject ? subj : null, out),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-primary', onclick: doCopy }, icon('copy'), 'Kopiér svar'),
          cur.subject ? h('button', { class: 'btn', onclick: () => copy(subj.textContent, 'Emnet er kopieret') }, icon('copy'), 'Kopiér emne') : null,
          h('button', { class: 'btn', onclick: mail }, icon('mail'), 'Åbn i mail'),
          h('button', { class: 'btn btn-ghost', onclick: () => editTemplate(cur.own ? cur : { ...cur, id: null, title: `${cur.title} (min)` }) }, icon('edit'), cur.own ? 'Redigér' : 'Lav min egen udgave'),
          cur.own ? h('button', { class: 'btn btn-ghost', onclick: () => remove(cur) }, icon('trash'), 'Slet') : null)));
    }
    function editTemplate(t) {
      const title = h('input', { class: 'input', value: t.title || '', maxlength: 60, 'aria-label': 'Titel' });
      const subject = h('input', { class: 'input', value: t.subject || '', maxlength: 120, 'aria-label': 'Emne' });
      const text = h('textarea', { class: 'input', rows: 12, 'aria-label': 'Tekst' }); text.value = t.text || 'Hej {kundens navn}\n\n\n\nVenlig hilsen\n{dit navn}';
      const save = () => {
        if (!title.value.trim() || !text.value.trim()) return toast('Skriv en titel og en tekst', { type: 'warn' });
        const item = { id: t.own ? t.id : uid(), title: title.value.trim(), subject: subject.value.trim(), text: text.value, icon: t.icon || 'note' };
        st.own = [item, ...st.own.filter(x => x.id !== item.id)];
        store.save(); cur = { ...item, own: true }; drawList(); drawEditor(); toast('Skabelonen er gemt', { type: 'ok' });
      };
      clear(editor).append(panel(t.own ? 'Redigér skabelon' : 'Ny skabelon', 'edit',
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), title),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Emne'), subject),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tekst', h('span', { class: 'field-hint' }, 'Skriv felter i krøllede parenteser, fx {kundens navn}')), text),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: save }, icon('check'), 'Gem skabelon'), h('button', { class: 'btn btn-ghost', onclick: drawEditor }, 'Annuller'))));
      title.focus();
    }
    async function remove(t) {
      if (!await confirmDialog({ title: 'Slet skabelonen?', text: `“${t.title}” slettes.`, confirmLabel: 'Slet', danger: true })) return;
      st.own = st.own.filter(x => x.id !== t.id); store.save(); cur = REPLY_TEMPLATES[0]; drawList(); drawEditor();
    }
    drawList(); drawEditor();
    return h('div', { class: 'page rp-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'IT-support', title: 'Svarskabeloner', lead: 'Færdige svar til kunder og kolleger. Udfyld felterne, og kopiér – navnet og telefonnummeret huskes til næste gang.', compact: true }),
      h('div', { class: 'rp-layout' },
        h('div', { class: 'stack' }, panel('Skabeloner', 'list', listEl, h('button', { class: 'btn btn-sm', style: { marginTop: '10px' }, onclick: () => editTemplate({}) }, icon('plus'), 'Ny skabelon'))),
        editor));
  },
};
