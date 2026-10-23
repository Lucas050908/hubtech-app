/**
 * Spørg og svar – ask about homework, IT or anything else; everyone on HUBTECH can answer.
 * Votes push the best answers up, and the one who asked marks the answer that solved it.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError, copy } from '../features/appkit.js';
import { sh, onShared, ago, person, emptyState, pickImages, lightbox, richText } from '../features/shared.js';
import { textParts, scores, sortAnswers } from '../features/sharedlogic.js';

const PAGE = 'qa';
export const SUBJECTS = ['Matematik', 'Dansk', 'Engelsk', 'Tysk', 'Fysik/kemi', 'Biologi', 'Historie', 'Samfundsfag', 'IT og computere', 'Programmering', 'Spil', 'Andet'];

function voter(doc, target, s, mine, onDone) {
  const my = mine[target] || 0;
  const vote = async (v) => {
    try { await sh.add(doc.id, 'vote', my === v ? { target, remove: true } : { target, v }); onDone(); }
    catch (e) { toast('Kunne ikke stemme', { type: 'bad', text: e.message }); }
  };
  return h('div', { class: 'qa-vote' },
    h('button', { class: ['icon-btn btn-sm', my === 1 && 'is-on'], 'aria-label': 'Godt svar', 'aria-pressed': String(my === 1), onclick: () => vote(1) }, icon('chevronUp')),
    h('b', { 'aria-label': 'Point' }, String(s[target] || 0)),
    h('button', { class: ['icon-btn btn-sm', my === -1 && 'is-on'], 'aria-label': 'Dårligt svar', 'aria-pressed': String(my === -1), onclick: () => vote(-1) }, icon('chevronDown')));
}

export default {
  title: 'Spørg og svar',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('qa');
    const root = h('div'), self = this;
    let view = 'new', subject = null, query = '';

    async function list() {
      self._off?.(); self._off = onShared('question', () => { if (document.body.contains(root) && !root.querySelector('.qa-ask')) list(); });
      let docs;
      try { docs = await sh.list('question'); } catch (e) { h(clear(root), null, loadError('Spørg og svar', e)); return; }
      const q = query.toLowerCase();
      let shown = docs.filter(d => (!subject || d.data.subject === subject) && (!q || d.title.toLowerCase().includes(q) || (d.data.body || '').toLowerCase().includes(q)));
      if (view === 'open') shown = shown.filter(d => !d.data.accepted);
      if (view === 'mine') shown = shown.filter(d => d.role === 'owner' || d.mine.answer?.length);
      shown.sort(view === 'top' ? (a, b) => (b.counts.vote || 0) + (b.counts.answer || 0) * 2 - (a.counts.vote || 0) - (a.counts.answer || 0) * 2 : (a, b) => b.created - a.created);
      const card = (d) => {
        const n = d.counts.answer || 0;
        return h('a', { class: 'qa-card', href: `#/apps/${PAGE}/d/${d.id}` },
          h('div', { class: ['qa-n', n && 'has', d.data.accepted && 'solved'] }, d.data.accepted ? icon('check') : null, h('b', null, String(n)), h('small', null, n === 1 ? 'svar' : 'svar')),
          h('div', { class: 'qa-card-b' }, h('b', null, d.title),
            d.data.body ? h('p', { class: 'faint qa-snip' }, d.data.body.slice(0, 160)) : null,
            h('div', { class: 'sh-meta' }, d.data.subject ? h('span', { class: 'chip' }, d.data.subject) : null, person(d.owner), h('span', null, ago(d.created)))));
      };
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i spørgsmål', value: query, 'aria-label': 'Søg i spørgsmål' });
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { query = search.value; list(); } });
      search.addEventListener('search', () => { query = search.value; list(); });
      h(clear(root), null,
        h('div', { class: 'sh-top' }, search, h('button', { class: 'btn btn-primary', onclick: ask }, icon('plus'), 'Stil et spørgsmål')),
        h('div', { class: 'cmd-filters', style: { marginBottom: '10px' } }, [['new', 'Nyeste'], ['open', 'Ubesvarede'], ['top', 'Mest aktive'], ['mine', 'Mine']].map(([v, l]) => h('button', { class: ['btn btn-sm', view === v && 'btn-primary'], onclick: () => { view = v; list(); } }, l))),
        h('div', { class: 'qa-subjects' }, h('button', { class: ['sh-tag', !subject && 'is-on'], onclick: () => { subject = null; list(); } }, 'Alle fag'), SUBJECTS.map(s => h('button', { class: ['sh-tag', subject === s && 'is-on'], onclick: () => { subject = subject === s ? null : s; list(); } }, s))),
        shown.length ? h('div', { class: 'sh-list' }, shown.map(card)) : emptyState('help', docs.length ? 'Ingen spørgsmål her' : 'Ingen spørgsmål endnu', docs.length ? 'Prøv et andet filter – eller stil spørgsmålet selv.' : 'Sidder du fast i en lektie eller med computeren? Spørg – alle på HUBTECH kan svare.', h('button', { class: 'btn btn-primary', onclick: ask }, icon('plus'), 'Stil et spørgsmål')));
    }

    function ask() {
      const title = h('input', { class: 'input', maxlength: 160, placeholder: 'Fx Hvordan løser man en andengradsligning?', 'aria-label': 'Dit spørgsmål' });
      const body = h('textarea', { class: 'textarea', rows: 6, maxlength: 6000, placeholder: 'Forklar mere: hvad har du prøvet, hvor går det galt?', 'aria-label': 'Forklaring' });
      const subj = h('select', { class: 'select', 'aria-label': 'Fag' }, SUBJECTS.map(s => h('option', { value: s }, s)));
      subj.value = subject || 'Andet';
      const imgs = [], imgBox = h('div', { class: 'wl-pics' });
      const drawImgs = () => h(clear(imgBox), null, imgs.map((u, i) => h('div', { class: 'wl-pic' }, h('img', { src: u, alt: '' }), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern billedet', onclick: () => { imgs.splice(i, 1); drawImgs(); } }, icon('x')))));
      const err = h('div', { class: 'field-error' });
      h(clear(root), null, panel('Stil et spørgsmål', 'help', h('div', { class: 'qa-ask stack' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Spørgsmål'), title),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fag'), subj),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Forklaring'), body),
        imgBox, h('div', null, h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { imgs.push(...await pickImages({ max: 3 - imgs.length })); drawImgs(); } }, icon('image'), 'Tilføj billede (fx af opgaven)')),
        h('p', { class: 'faint', style: { margin: 0 } }, 'Alle på HUBTECH kan se spørgsmålet. Skriv ikke personlige oplysninger.'),
        err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: list }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: async () => {
            if (title.value.trim().length < 8) { err.textContent = 'Skriv spørgsmålet lidt mere udførligt.'; return; }
            try { const d = await sh.create('question', { title: title.value.trim(), data: { body: body.value.trim(), subject: subj.value, images: imgs }, visibility: 'all' }); location.hash = `#/apps/${PAGE}/d/${d.id}`; }
            catch (e) { err.textContent = e.message; }
          } }, icon('send'), 'Stil spørgsmålet')))));
      title.focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id); } catch { h(clear(root), null, emptyState('alert', 'Spørgsmålet findes ikke', 'Det er måske slettet.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle spørgsmål'))); return; }
      const { doc, entries } = res, d = doc.data, owner = doc.role === 'owner';
      self._off?.(); self._off = onShared('question', (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root) && !document.activeElement?.closest?.('.qa-write, .qa-edit')) detail(id); }, id);
      const { s, mine } = scores(entries);
      const answers = sortAnswers(entries, d.accepted);
      const again = () => detail(id);
      const images = (list) => list?.length ? h('div', { class: `wl-imgs n${Math.min(list.length, 4)}` }, list.map((u, i) => h('button', { class: 'wl-img', 'aria-label': `Vis billede ${i + 1}`, onclick: () => lightbox(list.map(url => ({ url })), i) }, h('img', { src: u, alt: '', loading: 'lazy' })))) : null;
      const answerBox = (a) => {
        const acc = d.accepted === a.id;
        return h('div', { class: ['qa-answer', acc && 'is-accepted'], dataset: { id: a.id } },
          voter(doc, a.id, s, mine, again),
          h('div', { class: 'qa-answer-b' },
            acc ? h('span', { class: 'chip chip-ok qa-acc' }, icon('checkCircle'), 'Løste problemet') : null,
            h('div', { class: 'qa-text' }, richText(textParts(a.data.text))),
            images(a.data.images),
            h('div', { class: 'sh-meta' }, person(a.user), h('span', null, ago(a.at)), a.edited ? h('span', null, '(rettet)') : null, h('span', { style: { flex: 1 } }),
              owner && !acc ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await sh.update(doc.id, { data: { ...d, accepted: a.id } }); toast('Markeret som løsningen', { type: 'ok' }); again(); } }, icon('check'), 'Det løste det') : null,
              owner && acc ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await sh.update(doc.id, { data: { ...d, accepted: null } }); again(); } }, 'Fjern markering') : null,
              a.mine ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Ret svar', onclick: (e) => {
                const ta = h('textarea', { class: 'textarea', rows: 4, maxlength: 6000, 'aria-label': 'Ret dit svar' }); ta.value = a.data.text;
                e.currentTarget.closest('.qa-answer-b').querySelector('.qa-text').replaceWith(h('div', { class: 'qa-edit stack' }, ta, h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', onclick: again }, 'Annuller'), h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { await sh.edit(a.id, { ...a.data, text: ta.value.trim() }); again(); } }, 'Gem'))));
                ta.focus();
              } }, icon('edit')) : null,
              a.mine || owner ? h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet svar', onclick: async () => { if (await confirmDialog({ title: 'Slet svaret?', confirmLabel: 'Slet', danger: true })) { await sh.remove(a.id); again(); } } }, icon('trash')) : null)));
      };
      const ta = h('textarea', { class: 'textarea', rows: 5, maxlength: 6000, placeholder: 'Forklar, så det er til at forstå. Giv gerne et eksempel.', 'aria-label': 'Dit svar' });
      const aimgs = [], aimgBox = h('div', { class: 'wl-pics' });
      const drawA = () => h(clear(aimgBox), null, aimgs.map((u) => h('div', { class: 'wl-pic' }, h('img', { src: u, alt: '' }))));
      const send = h('button', { class: 'btn btn-primary', onclick: async () => {
        if (ta.value.trim().length < 2) return ta.focus();
        send.disabled = true;
        try { await sh.add(doc.id, 'answer', { text: ta.value.trim(), images: aimgs }); ta.value = ''; again(); } catch (e) { toast('Kunne ikke sende', { type: 'bad', text: e.message }); send.disabled = false; }
      } }, icon('send'), 'Send svar');
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle spørgsmål'), h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn btn-sm', onclick: () => copy(`${location.origin}/#/apps/${PAGE}/d/${id}`, 'Linket er kopieret') }, icon('link'), 'Kopiér link'),
          owner ? h('button', { class: 'icon-btn', 'aria-label': 'Slet spørgsmålet', onclick: async () => { if (await confirmDialog({ title: 'Slet spørgsmålet og alle svar?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null),
        h('section', { class: 'qa-q' }, voter(doc, 'q', s, mine, again),
          h('div', { class: 'qa-answer-b' }, h('h2', null, doc.title),
            h('div', { class: 'sh-meta' }, d.subject ? h('span', { class: 'chip' }, d.subject) : null, person(doc.owner), h('span', null, ago(doc.created)), d.accepted ? h('span', { class: 'chip chip-ok' }, icon('check'), 'Løst') : null),
            d.body ? h('div', { class: 'qa-text' }, richText(textParts(d.body))) : null, images(d.images))),
        h('h3', { class: 'gr-h qa-count' }, answers.length ? `${answers.length} ${answers.length === 1 ? 'svar' : 'svar'}` : 'Ingen svar endnu – vær den første!'),
        h('div', { class: 'qa-answers' }, answers.map(answerBox)),
        owner && answers.length && !d.accepted ? h('p', { class: 'faint' }, 'Tryk “Det løste det” ved det svar, der hjalp dig – så kan andre også se det.') : null,
        panel(owner ? 'Tilføj mere eller svar selv' : 'Dit svar', 'chat', h('div', { class: 'qa-write stack' }, ta, aimgBox,
          h('div', { class: 'row', style: { gap: '8px', justifyContent: 'space-between' } }, h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { aimgs.push(...await pickImages({ max: 3 })); drawA(); } }, icon('image'), 'Billede'), send))));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page qa-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Spørg og svar', lead: 'Sidder du fast? Spørg om lektier, computere eller hvad som helst – alle på HUBTECH kan svare, og de bedste svar kommer øverst.', compact: true }), root);
  },
};
