/**
 * Formularer – sign-ups, questionnaires and feedback. Build the form, share a link (works without an account),
 * and see the answers as charts or one by one – or take them to Excel.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError, copy } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, emptyState, pubUrl } from '../features/shared.js';
import { FIELD_TYPES, formStats, toCSV, checkAnswers } from '../features/sharedlogic.js';

const PAGE = 'forms';
const fid = () => Math.random().toString(36).slice(2, 8);
const TEMPLATES = {
  blank: { name: 'Tom formular', title: '', fields: [{ id: fid(), type: 'text', label: 'Navn', required: true }] },
  signup: { name: 'Tilmelding', title: 'Tilmelding', fields: [{ id: 'n', type: 'text', label: 'Navn', required: true }, { id: 'e', type: 'email', label: 'E-mail', required: true }, { id: 'c', type: 'number', label: 'Hvor mange kommer I?', required: true }, { id: 'f', type: 'long', label: 'Allergier eller andet, vi skal vide' }] },
  feedback: { name: 'Feedback', title: 'Hvad synes du?', fields: [{ id: 's', type: 'scale', label: 'Hvor tilfreds er du alt i alt?', required: true }, { id: 'g', type: 'long', label: 'Hvad var godt?' }, { id: 'b', type: 'long', label: 'Hvad kan blive bedre?' }, { id: 'r', type: 'yesno', label: 'Vil du anbefale det til andre?' }] },
  vote: { name: 'Klassens valg', title: 'Hvad skal vi?', fields: [{ id: 'v', type: 'choice', label: 'Vælg én', options: ['Tur i skoven', 'Biograf', 'Bowling'], required: true }, { id: 'h', type: 'long', label: 'Andre forslag?' }] },
};

/** the form itself – used in the app and on the public link */
function fillForm(doc, { onSubmit, preview = false }) {
  const answers = {}, err = h('div', { class: 'field-error' });
  const fields = doc.data.fields || [];
  const nameIn = h('input', { class: 'input', maxlength: 60, placeholder: 'Dit navn', 'aria-label': 'Dit navn' });
  const field = (f) => {
    const lbl = h('span', { class: 'field-label' }, f.label, f.required ? h('span', { class: 'fm-req', title: 'Skal udfyldes' }, ' *') : null);
    const set = (v) => { answers[f.id] = v; };
    let input;
    if (f.type === 'info') return h('div', { class: 'fm-info' }, h('b', null, f.label), f.help ? h('p', { class: 'muted' }, f.help) : null);
    if (f.type === 'long') { input = h('textarea', { class: 'textarea', rows: 3, maxlength: 4000, 'aria-label': f.label }); input.addEventListener('input', () => set(input.value)); }
    else if (f.type === 'choice' || f.type === 'yesno') {
      const opts = f.type === 'yesno' ? ['Ja', 'Nej'] : f.options || [];
      input = h('div', { class: 'fm-choices', role: 'radiogroup', 'aria-label': f.label }, opts.map(o => h('label', { class: 'fm-choice' }, h('input', { type: 'radio', name: `f-${f.id}`, value: o, onchange: () => set(o) }), h('span', null, o))));
    } else if (f.type === 'multi') {
      const chosen = new Set();
      input = h('div', { class: 'fm-choices', 'aria-label': f.label }, (f.options || []).map(o => h('label', { class: 'fm-choice' }, h('input', { type: 'checkbox', value: o, onchange: (e) => { e.target.checked ? chosen.add(o) : chosen.delete(o); set([...chosen]); } }), h('span', null, o))));
    } else if (f.type === 'scale') {
      input = h('div', { class: 'fm-scale', role: 'radiogroup', 'aria-label': f.label }, [1, 2, 3, 4, 5].map(n => h('label', { class: 'fm-scale-n' }, h('input', { type: 'radio', name: `f-${f.id}`, value: n, onchange: () => set(n) }), h('span', null, String(n)))),
        h('span', { class: 'faint fm-scale-l' }, '1 = slet ikke · 5 = helt vildt'));
    } else {
      input = h('input', { class: 'input', type: { number: 'number', date: 'date', email: 'email' }[f.type] || 'text', maxlength: 400, 'aria-label': f.label });
      input.addEventListener('input', () => set(f.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value));
    }
    return h('div', { class: 'fm-field', dataset: { f: f.id } }, lbl, f.help ? h('span', { class: 'faint fm-help' }, f.help) : null, input);
  };
  const btn = h('button', { class: 'btn btn-primary btn-lg', disabled: preview, onclick: async () => {
    const bad = checkAnswers(fields, answers);
    if (bad) { err.textContent = bad.error; root.querySelector(`[data-f="${bad.field}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    btn.disabled = true;
    try { await onSubmit(answers, nameIn.value.trim()); } catch (e) { err.textContent = e.message; btn.disabled = false; }
  } }, icon('send'), preview ? 'Send (forhåndsvisning)' : 'Send');
  const root = h('div', { class: 'fm-fill' }, doc.data.desc ? h('p', { class: 'muted fm-desc' }, doc.data.desc) : null,
    doc.data.askName ? h('div', { class: 'fm-field' }, h('span', { class: 'field-label' }, 'Dit navn'), nameIn) : null,
    fields.map(field), err, h('div', { class: 'row-actions' }, btn));
  return root;
}
const thanks = (doc) => h('div', { class: 'pub-done' }, icon('checkCircle'), h('h2', null, 'Tak for dit svar!'), doc.data.thanks ? h('p', { class: 'muted' }, doc.data.thanks) : null);

export async function publicView(data, token) {
  const { doc } = data;
  if (doc.data.closed) return h('div', { class: 'pub-card pub-missing' }, icon('lock'), h('h1', null, doc.title), h('p', { class: 'muted' }, 'Der er lukket for svar.'));
  const card = h('div', { class: 'pub-card fm-pub' }, h('h1', null, doc.title));
  card.append(fillForm(doc, { onSubmit: async (answers, name) => { await sh.pubAdd(token, 'response', { answers, name }); h(clear(card), null, thanks(doc)); } }));
  return card;
}

export default {
  title: 'Formularer',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('forms');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    let askShare = qs.get('share') === '1';

    async function list() {
      self._off?.();
      let docs;
      try { docs = await sh.list('form'); } catch (e) { h(clear(root), null, loadError('Formularer', e)); return; }
      const mine = docs.filter(d => d.role === 'owner'), others = docs.filter(d => d.role !== 'owner');
      const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'sh-card-h' }, h('b', null, d.title), d.data.closed ? h('span', { class: 'chip' }, 'Lukket') : d.public ? h('span', { class: 'chip chip-ok' }, icon('link'), 'Åben') : null),
        h('div', { class: 'sh-meta' }, h('span', null, icon('list'), ` ${(d.data.fields || []).length} spørgsmål`), d.role === 'owner' ? h('span', null, icon('mail'), ` ${d.counts.response || 0} svar`) : person(d.owner), h('span', null, ago(d.updated))));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('b', { style: { flex: 1 } }, 'Lav en ny'), ...Object.entries(TEMPLATES).map(([k, t]) => h('button', { class: ['btn', k === 'blank' && 'btn-primary'], onclick: () => create(k) }, icon(k === 'blank' ? 'plus' : 'file'), t.name))),
        mine.length ? h('div', { class: 'sh-list' }, mine.map(card)) : emptyState('list', 'Ingen formularer endnu', 'Lav en tilmelding til en fest, et spørgeskema til klassen eller en feedback-formular til dine kunder. Del linket – man behøver ikke en konto for at svare.'),
        others.length ? [h('h3', { class: 'gr-h', style: { marginTop: '18px' } }, 'Delt med dig'), h('div', { class: 'sh-list' }, others.map(card))] : null);
    }
    async function create(tpl) {
      const t = TEMPLATES[tpl];
      try { const d = await sh.create('form', { title: t.title || 'Ny formular', data: { fields: t.fields.map(f => ({ ...f, id: f.id || fid() })), desc: '', thanks: 'Vi har modtaget dit svar.' }, visibility: 'private', public: true }); location.hash = `#/apps/${PAGE}/d/${d.id}?edit=1`; }
      catch (e) { toast('Kunne ikke oprette', { type: 'bad', text: e.message }); }
    }

    // ── the builder ──
    function builder(doc) {
      const d = structuredClone(doc.data);
      d.fields = d.fields || [];
      let title = doc.title;
      const fieldsBox = h('div', { class: 'fm-builder' });
      const prev = h('div', { class: 'fm-preview' });
      const titleIn = h('input', { class: 'input fm-title-in', value: title, maxlength: 160, 'aria-label': 'Titel' });
      titleIn.addEventListener('input', () => { title = titleIn.value; drawPreview(); });
      const descIn = h('textarea', { class: 'textarea', rows: 2, maxlength: 2000, placeholder: 'Forklar, hvad formularen er til (valgfrit)', 'aria-label': 'Beskrivelse' }); descIn.value = d.desc || '';
      descIn.addEventListener('input', () => { d.desc = descIn.value; drawPreview(); });
      const thanksIn = h('input', { class: 'input', value: d.thanks || '', maxlength: 300, 'aria-label': 'Tak-besked' });
      thanksIn.addEventListener('input', () => { d.thanks = thanksIn.value; });
      const askName = h('input', { type: 'checkbox', checked: !!d.askName, onchange: (e) => { d.askName = e.target.checked; drawPreview(); } });
      function drawPreview() { h(clear(prev), null, h('h2', null, title || 'Uden titel'), fillForm({ data: d }, { preview: true, onSubmit: () => {} })); }
      function drawFields() {
        h(clear(fieldsBox), null, d.fields.map((f, i) => {
          const label = h('input', { class: 'input', value: f.label, maxlength: 200, placeholder: 'Spørgsmål', 'aria-label': `Spørgsmål ${i + 1}` });
          label.addEventListener('input', () => { f.label = label.value; drawPreview(); });
          const type = h('select', { class: 'select', 'aria-label': 'Type' }, Object.entries(FIELD_TYPES).map(([v, l]) => h('option', { value: v, selected: v === f.type }, l)));
          type.addEventListener('change', () => { f.type = type.value; if (['choice', 'multi'].includes(f.type) && !f.options?.length) f.options = ['Mulighed 1', 'Mulighed 2']; drawFields(); drawPreview(); });
          const opts = ['choice', 'multi'].includes(f.type) ? h('textarea', { class: 'textarea', rows: 3, 'aria-label': 'Muligheder – én pr. linje' }) : null;
          if (opts) { opts.value = (f.options || []).join('\n'); opts.addEventListener('input', () => { f.options = opts.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 30); drawPreview(); }); }
          const req = h('input', { type: 'checkbox', checked: !!f.required, onchange: (e) => { f.required = e.target.checked; drawPreview(); } });
          return h('div', { class: 'fm-bfield' },
            h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'fm-n' }, String(i + 1)), label, type),
            opts ? h('label', { class: 'field' }, h('span', { class: 'faint', style: { fontSize: '12px' } }, 'Muligheder – én pr. linje'), opts) : null,
            h('div', { class: 'row', style: { gap: '6px', justifyContent: 'space-between' } },
              f.type !== 'info' ? h('label', { class: 'cal-pcheck' }, req, h('span', null, 'Skal udfyldes')) : h('span'),
              h('div', { class: 'row', style: { gap: '2px' } },
                h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Flyt op', disabled: i === 0, onclick: () => { [d.fields[i - 1], d.fields[i]] = [d.fields[i], d.fields[i - 1]]; drawFields(); drawPreview(); } }, icon('chevronLeft')),
                h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Flyt ned', disabled: i === d.fields.length - 1, onclick: () => { [d.fields[i + 1], d.fields[i]] = [d.fields[i], d.fields[i + 1]]; drawFields(); drawPreview(); } }, icon('chevronRight')),
                h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Kopiér spørgsmål', onclick: () => { d.fields.splice(i + 1, 0, { ...structuredClone(f), id: fid() }); drawFields(); drawPreview(); } }, icon('copy')),
                h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet spørgsmål', onclick: () => { d.fields.splice(i, 1); drawFields(); drawPreview(); } }, icon('trash')))));
        }), h('div', { class: 'fm-add' }, h('span', { class: 'faint' }, 'Tilføj:'), Object.entries(FIELD_TYPES).map(([v, l]) => h('button', { class: 'btn btn-sm', onclick: () => { d.fields.push({ id: fid(), type: v, label: v === 'info' ? 'Overskrift' : '', required: false, options: ['choice', 'multi'].includes(v) ? ['Mulighed 1', 'Mulighed 2'] : undefined }); drawFields(); drawPreview(); fieldsBox.querySelectorAll('.fm-bfield .input')[d.fields.length - 1]?.focus(); } }, l))));
      }
      drawFields(); drawPreview();
      const save = async (andShare = false) => {
        if (!title.trim()) return toast('Giv formularen en titel', { type: 'warn' });
        if (!d.fields.filter(f => f.type !== 'info').length) return toast('Tilføj mindst ét spørgsmål', { type: 'warn' });
        if (d.fields.some(f => f.type !== 'info' && !f.label.trim())) return toast('Alle spørgsmål skal have en tekst', { type: 'warn' });
        try { await sh.update(doc.id, { title: title.trim(), data: d }); toast('Formularen er gemt', { type: 'ok' }); location.hash = `#/apps/${PAGE}/d/${doc.id}${andShare ? '?share=1' : ''}`; }
        catch (e) { toast('Kunne ikke gemme', { type: 'bad', text: e.message }); }
      };
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}/d/${doc.id}` }, icon('arrowLeft'), 'Tilbage'), h('h2', null, 'Byg formularen'),
          h('button', { class: 'btn', onclick: () => save(false) }, icon('check'), 'Gem'), h('button', { class: 'btn btn-primary', onclick: () => save(true) }, icon('share'), 'Gem og del')),
        h('div', { class: 'fm-wrap' },
          h('div', { class: 'stack' }, panel('Om formularen', 'edit', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), titleIn), descIn,
            h('label', { class: 'cal-pcheck' }, askName, h('span', null, 'Spørg efter navn (også på dem uden konto)')),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Besked efter man har svaret'), thanksIn)),
          panel('Spørgsmål', 'list', fieldsBox)),
          panel('Sådan ser den ud', 'eye', prev)));
    }

    // ── answers ──
    async function detail(id) {
      let res;
      try { res = await sh.get(id); } catch (e) { h(clear(root), null, emptyState('alert', 'Formularen findes ikke', 'Den er måske slettet.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle formularer'))); return; }
      const { doc, entries } = res, owner = ['owner', 'editor'].includes(doc.role);
      self._off?.(); self._off = onShared('form', () => { if (document.body.contains(root) && tab === 'answers') detail(id); }, id);
      if (!owner) {      // shared with me: fill it in
        const mineDone = entries.some(e => e.mine);
        const box = h('div');
        h(clear(root), null, h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title)),
          panel(null, null, box));
        if (doc.data.closed) h(box, null, h('p', { class: 'muted' }, 'Der er lukket for svar.'));
        else if (mineDone && doc.data.once) h(box, null, h('p', { class: 'muted' }, 'Du har allerede svaret.'));
        else box.append(fillForm(doc, { onSubmit: async (answers) => { await sh.add(doc.id, 'response', { answers }); h(clear(box), null, thanks(doc)); } }));
        return;
      }
      if (askShare) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: 'Del formularen', publicOk: true, publicText: 'Alle med linket kan svare – også uden en konto.', editorsOk: true })) detail(id); }, 50); }
      const responses = entries.filter(e => e.kind === 'response').reverse();
      const stats = formStats(doc.data.fields || [], responses);
      const body = h('div');
      const statsView = () => h('div', { class: 'stack' }, stats.map(s => panel(s.field.label, null, h('p', { class: 'faint', style: { marginTop: 0 } }, `${s.n} svar`),
        s.counts ? h('div', { class: 'pl-opts' }, s.opts.map((o, i) => { const p = s.n ? Math.round(s.counts[i] / s.n * 100) : 0; return h('div', { class: 'pl-opt' }, h('div', { class: 'pl-fill', style: { width: `${p}%` } }), h('div', { class: 'pl-row' }, h('span', { class: 'pl-label' }, o), h('b', null, `${p} %`), h('span', { class: 'faint' }, String(s.counts[i])))); }))
          : s.avg != null || s.dist ? h('div', null, h('div', { class: 'fm-avg' }, h('b', null, s.avg != null ? s.avg.toLocaleString('da-DK') : '–'), h('span', { class: 'faint' }, s.dist ? 'i snit (1–5)' : `i snit · laveste ${s.min ?? '–'} · højeste ${s.max ?? '–'}`)),
            s.dist ? h('div', { class: 'wo-bars', style: { height: '90px' } }, s.dist.map((n, i) => h('div', { class: 'wo-bar' }, h('i', { style: { height: `${(n / Math.max(1, ...s.dist)) * 100}%` } }, n ? String(n) : ''), h('span', { class: 'faint' }, String(i + 1))))) : null)
          : h('ul', { class: 'fm-texts' }, s.texts.slice(0, 50).map(t => h('li', null, t)), s.texts.length > 50 ? h('li', { class: 'faint' }, `… og ${s.texts.length - 50} mere`) : null))));
      const oneView = () => h('div', { class: 'stack' }, responses.map(r => panel(null, null,
        h('div', { class: 'sh-meta', style: { marginBottom: '8px' } }, r.user ? person(r.user) : h('b', null, r.guest || 'Gæst'), h('span', null, ago(r.at)),
          h('button', { class: 'icon-btn btn-sm', style: { marginLeft: 'auto' }, 'aria-label': 'Slet svar', onclick: async () => { if (await confirmDialog({ title: 'Slet svaret?', confirmLabel: 'Slet', danger: true })) { await sh.remove(r.id); detail(id); } } }, icon('trash'))),
        h('dl', { class: 'fm-answer' }, (doc.data.fields || []).filter(f => f.type !== 'info').map(f => [h('dt', null, f.label), h('dd', null, (() => { const v = r.data.answers?.[f.id]; return Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '–' : String(v); })())])))));
      let tab = 'answers', sub = 'stats';
      const draw = () => h(clear(body), null, !responses.length ? emptyState('mail', 'Ingen svar endnu', 'Del linket, så kommer svarene her – live.', h('button', { class: 'btn btn-primary', onclick: () => copy(pubUrl(doc), 'Linket er kopieret') }, icon('copy'), 'Kopiér linket')) : sub === 'stats' ? statsView() : oneView());
      const subSeg = segmented([{ value: 'stats', label: 'Overblik', icon: 'chart' }, { value: 'one', label: 'Hvert svar', icon: 'list' }], sub, (v) => { sub = v; draw(); }, { label: 'Vis' });
      draw();
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title),
          h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}/d/${id}?edit=1` }, icon('edit'), 'Ret'),
          h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: 'Del formularen', publicOk: true, publicText: 'Alle med linket kan svare – også uden en konto.', editorsOk: true })) detail(id); } }, icon('share'), 'Del'),
          h('button', { class: 'btn btn-sm', onclick: async () => { await sh.update(doc.id, { data: { ...doc.data, closed: !doc.data.closed } }); detail(id); } }, icon(doc.data.closed ? 'unlock' : 'lock'), doc.data.closed ? 'Åbn for svar' : 'Luk for svar'),
          doc.role === 'owner' ? h('button', { class: 'icon-btn', 'aria-label': 'Slet formularen', onclick: async () => { if (await confirmDialog({ title: 'Slet formularen og alle svar?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null),
        h('div', { class: 'fm-sumbar' }, h('div', null, h('b', null, String(responses.length)), h('span', { class: 'faint' }, 'svar')),
          doc.public ? h('div', { class: 'fm-linkbox' }, icon('link'), h('span', { class: 'fm-url' }, pubUrl(doc)), h('button', { class: 'btn btn-sm', onclick: () => copy(pubUrl(doc), 'Linket er kopieret') }, icon('copy'), 'Kopiér'), h('a', { class: 'btn btn-sm btn-ghost', href: pubUrl(doc), target: '_blank', rel: 'noopener' }, icon('external'), 'Åbn')) : h('span', { class: 'faint' }, 'Linket er slået fra – tryk Del for at åbne det.'),
          responses.length ? h('button', { class: 'btn btn-sm', onclick: () => { const blob = new Blob([toCSV(doc.data.fields || [], responses)], { type: 'text/csv' }); const a = h('a', { href: URL.createObjectURL(blob), download: `${doc.title.replace(/[^\wæøåÆØÅ -]+/g, '') || 'svar'}.csv` }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); } }, icon('download'), 'Hent til Excel') : null),
        h('div', { class: 'cmd-filters', style: { margin: '10px 0' } }, subSeg), body);
    }

    const p = ctx?.params || {};
    if (p.sub === 'd' && p.id) {
      if (qs.get('edit') === '1') sh.get(p.id).then(r => builder(r.doc)).catch(() => list());
      else detail(p.id);
    } else list();
    return h('div', { class: 'page fm-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Del ud', title: 'Formularer', lead: 'Tilmeldinger, spørgeskemaer og feedback. Del et link – man behøver ikke en konto for at svare – og se svarene som grafer.', compact: true }), root);
  },
};
