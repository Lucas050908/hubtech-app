/**
 * Printer-doktor – troubleshooting for office and network printers, one question at a time.
 * Each case is remembered (what was tried, what helped) and can become a service note.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { getState, saveState } from '../core/services.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, codeBlock, copy, appState, loadError, uid } from '../features/appkit.js';
import { PROBLEMS, NODES } from '../data/printer-tree.js';
import { guideById } from '../data/guides.js';

const nodeOf = (ref) => (typeof ref === 'string' ? { id: ref, ...NODES[ref] } : ref ? { id: 'end', ...ref } : null);

export default {
  title: 'Printer-doktor',
  async render() {
    const app = appById('printerdoctor');
    let store;
    try { store = await appState('printerdoctor', { cases: [] }); } catch (e) { return loadError('Printer-doktor', e); }
    const st = store.data;
    let cur = null;          // { id, problem, model, customer, log: [{q|fix, a}], node, done, solved }

    const left = h('div', { class: 'stack' });
    const right = h('div', { class: 'stack' });
    const stats = { total: h('span'), solved: h('span') };
    const drawStats = () => {
      stats.total.textContent = String(st.cases.length);
      const s = st.cases.filter(c => c.solved).length;
      stats.solved.textContent = st.cases.length ? `${Math.round(s / st.cases.length * 100)} %` : '–';
    };

    function start(p) {
      const model = h('input', { class: 'input', placeholder: 'Model (valgfri) – fx HP LaserJet M404', 'aria-label': 'Printermodel', maxlength: 80 });
      const cust = h('input', { class: 'input', placeholder: 'Kunde / sted (valgfri)', 'aria-label': 'Kunde', maxlength: 80 });
      const go = h('button', { class: 'btn btn-primary' }, icon('arrowRight'), 'Start fejlfinding');
      go.addEventListener('click', () => {
        cur = { id: uid(), at: Date.now(), problem: p.id, title: p.title, model: model.value.trim(), customer: cust.value.trim(), log: [], node: nodeOf(p.start), done: false, solved: false };
        drawCase();
      });
      h(clear(right), null, panel(p.title, p.icon, h('p', { class: 'muted', style: { margin: '0 0 12px' } }, p.sub + '. Svar på spørgsmålene, så finder vi årsagen trin for trin.'),
        h('div', { class: 'pd-meta' }, model, cust), h('div', { class: 'pd-actions' }, go)));
      model.focus();
    }

    function finish(solved) {
      cur.done = true; cur.solved = solved;
      st.cases = [{ id: cur.id, at: cur.at, problem: cur.problem, title: cur.title, model: cur.model, customer: cur.customer, log: cur.log, solved }, ...st.cases].slice(0, 200);
      store.save(); drawStats(); drawHistory(); drawCase();
    }

    const noteText = (c) => [
      `Printer: ${c.title}${c.model ? ` – ${c.model}` : ''}${c.customer ? ` (${c.customer})` : ''}`,
      new Date(c.at).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' }),
      '',
      ...c.log.map(l => (l.q ? `• ${l.q} → ${l.a}` : `• Prøvet: ${l.fix} → ${l.a}`)),
      '',
      c.solved ? 'Resultat: Løst.' : 'Resultat: Ikke løst – sendt videre.',
    ].join('\n');

    async function saveAsNote(c) {
      try {
        const notes = (await getState('notes', { force: true })) || {};
        const list = Array.isArray(notes.notes) ? notes.notes : [];
        const now = Date.now();
        list.unshift({ id: uid(), title: `Servicenote: ${c.title}${c.model ? ` – ${c.model}` : ''}`, body: noteText(c), pinned: false, color: '', created: now, updated: now });
        saveState('notes', { ...notes, notes: list });
        toast('Gemt i Noter', { type: 'ok', action: { label: 'Åbn Noter', onClick: () => { location.hash = '#/apps/notes'; } } });
      } catch (e) { toast('Kunne ikke gemme noten', { type: 'bad', text: e.message }); }
    }

    function drawCase() {
      if (!cur) return;
      const n = cur.node;
      const trail = cur.log.length ? h('ol', { class: 'pd-trail' }, cur.log.map(l => h('li', null, l.q ? h('span', null, l.q, ' ', h('b', null, l.a)) : h('span', null, 'Prøvet: ', l.fix, ' ', h('b', null, l.a))))) : null;
      let body;
      if (cur.done) {
        body = h('div', { class: ['pd-done', cur.solved ? 'is-ok' : 'is-esc'] }, icon(cur.solved ? 'checkCircle' : 'info'),
          h('div', null, h('b', null, cur.solved ? 'Løst – godt klaret!' : 'Ikke løst endnu'), h('p', { class: 'muted', style: { margin: '4px 0 0' } }, cur.solved ? 'Sagen er gemt. Lav en servicenote, så kunden og kollegerne kan se, hvad der blev gjort.' : 'Sagen er gemt med alt, du har prøvet. Send den videre til producenten eller en tekniker.')),
          h('div', { class: 'pd-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => saveAsNote(cur) }, icon('note'), 'Gem som servicenote'),
            h('button', { class: 'btn', onclick: () => copy(noteText(cur), 'Sagen er kopieret') }, icon('copy'), 'Kopiér'),
            h('button', { class: 'btn btn-ghost', onclick: () => { cur = null; drawIntro(); } }, icon('plus'), 'Ny sag')));
      } else if (n.q) {
        const ans = (a, to) => () => { cur.log.push({ q: n.q, a }); cur.node = nodeOf(to); drawCase(); };
        body = h('div', { class: 'pd-q' },
          h('span', { class: 'pd-step' }, `Trin ${cur.log.length + 1}`),
          h('h3', null, n.q), n.hint ? h('p', { class: 'muted' }, n.hint) : null, n.code ? codeBlock(n.code) : null,
          h('div', { class: 'pd-actions' },
            h('button', { class: 'btn btn-primary', onclick: ans('Ja', n.yes) }, icon('check'), 'Ja'),
            h('button', { class: 'btn', onclick: ans('Nej', n.no) }, icon('x'), 'Nej')));
      } else {
        const g = n.guide && guideById(n.guide);
        body = h('div', { class: 'pd-fix' },
          h('span', { class: 'pd-step is-fix' }, n.id === 'end' ? 'Sidste udvej' : 'Prøv dette'),
          h('h3', null, n.fix),
          h('ol', { class: 'pd-steps' }, n.steps.map(s => h('li', null, s))),
          n.code ? codeBlock(n.code) : null,
          g ? h('a', { class: 'pd-guide', href: `#/learn/guide/${g.id}` }, icon('book'), `Læs guiden: ${g.title}`) : null,
          h('div', { class: 'pd-actions' },
            n.id === 'end'
              ? h('button', { class: 'btn btn-primary', onclick: () => { cur.log.push({ fix: n.fix, a: 'sendt videre' }); finish(false); } }, icon('arrowRight'), 'Afslut og send videre')
              : [h('button', { class: 'btn btn-primary', onclick: () => { cur.log.push({ fix: n.fix, a: 'virkede' }); finish(true); } }, icon('checkCircle'), 'Det virkede'),
                h('button', { class: 'btn', onclick: () => { cur.log.push({ fix: n.fix, a: 'hjalp ikke' }); cur.node = nodeOf(n.next); if (!cur.node) finish(false); else drawCase(); } }, icon('refresh'), 'Det hjalp ikke')]));
      }
      h(clear(right), null, panel(`${cur.title}${cur.model ? ` · ${cur.model}` : ''}`, PROBLEMS.find(p => p.id === cur.problem)?.icon || 'printer',
        trail, body, cur.done ? null : h('button', { class: 'btn btn-sm btn-ghost pd-cancel', onclick: () => { cur = null; drawIntro(); } }, 'Afbryd')));
    }

    function drawIntro() {
      h(clear(right), null, panel('Hvad er der galt?', 'printer',
        h('p', { class: 'muted', style: { margin: '0 0 12px' } }, 'Vælg problemet til venstre. Printer-doktor stiller spørgsmål et ad gangen og fører dig til løsningen – med de kommandoer, du skal bruge, og en guide, hvis du vil vide mere.'),
        h('div', { class: 'pd-tips' }, ['Skriv model og serienummer ned først.', 'Tag et billede af skærmen, hvis der står en fejlkode.', 'Spørg kunden: Hvornår startede det, og er der ændret noget?'].map(t => h('div', { class: 'pd-tip' }, icon('info'), h('span', null, t))))));
    }

    const historyBox = h('div', { class: 'list' });
    function drawHistory() {
      clear(historyBox);
      if (!st.cases.length) { historyBox.append(h('p', { class: 'faint' }, 'Ingen sager endnu.')); return; }
      st.cases.slice(0, 8).forEach(c => historyBox.append(h('button', { class: 'row pd-hist', type: 'button', onclick: () => { cur = { ...c, done: true }; drawCase(); } },
        h('span', { class: ['row-icon', c.solved ? 'solid' : ''] }, icon(c.solved ? 'checkCircle' : 'alert')),
        h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, c.title + (c.model ? ` · ${c.model}` : '')),
          h('div', { class: 'row-sub' }, `${new Date(c.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })} · ${c.solved ? 'løst' : 'sendt videre'} · ${c.log.length} trin`)))));
    }

    left.append(
      panel('Problemer', 'alert', h('div', { class: 'pd-problems' }, PROBLEMS.map(p => h('button', { class: 'pd-problem', type: 'button', onclick: () => start(p) },
        h('span', { class: 'row-icon' }, icon(p.icon)), h('span', null, h('b', null, p.title), h('small', null, p.sub)), icon('chevronRight'))))),
      panel('Seneste sager', 'clock', historyBox));
    drawStats(); drawHistory(); drawIntro();
    return h('div', { class: 'page pd-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Support', title: 'Printer-doktor', lead: 'Fejlfinding på kontor- og netværksprintere, et spørgsmål ad gangen – med kommandoer, guides og en servicenote til sidst.',
        stats: [{ icon: 'printer', label: 'Sager', value: stats.total }, { icon: 'checkCircle', label: 'Løst', value: stats.solved }, { icon: 'book', label: 'Guides', value: String(10) }] }),
      h('div', { class: 'pd-layout' }, left, right));
  },
};
