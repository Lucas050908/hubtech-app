/**
 * Turneringer – a knockout bracket or a league for anything: football in the break, a gaming night, a chess club.
 * The organiser (and helpers) type in the results; everyone can follow live – also via a link without an account.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState, commentBox } from '../features/shared.js';
import * as T from '../features/tournament.js';

const PAGE = 'tournaments';
const SHARE = { title: 'Del turneringen', publicOk: true, publicText: 'Alle med linket kan følge turneringen – også uden en konto.', editorsOk: true };

/** bracket or league; onScore(match, sa, sb) when the viewer may type results */
function view(doc, onScore) {
  const t = doc.data.t, names = doc.data.names;
  const nm = (i) => (i === -1 ? 'Fri' : i == null ? '…' : names[i]);
  const champ = T.champion(t);
  const scoreIn = (m, side) => {
    const inp = h('input', { class: 'tn-score-in', inputmode: 'numeric', maxlength: 3, value: m[side] ?? '', 'aria-label': `Mål til ${nm(side === 'sa' ? m.a : m.b)}` });
    inp.addEventListener('change', () => {
      const other = inp.closest('.tn-match').querySelectorAll('.tn-score-in');
      const a = other[0].value.trim(), b = other[1].value.trim();
      if (a === '' || b === '') { if (a === '' && b === '') onScore(m, null, null); return; }
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return toast('Skriv et tal', { type: 'warn' });
      if (t.format === 'knockout' && a === b) return toast('Der skal være en vinder i knockout', { type: 'warn', text: 'Brug fx straffespark til at finde den.' });
      onScore(m, Number(a), Number(b));
    });
    return inp;
  };
  const match = (m) => {
    const w = T.winner(m), editable = onScore && m.a != null && m.b != null && m.a !== -1 && m.b !== -1;
    const row = (side, idx) => h('div', { class: ['tn-team', w != null && w === idx && 'is-win', idx === -1 && 'is-bye'] }, h('span', null, nm(idx)),
      editable ? scoreIn(m, side) : h('b', null, m[side] ?? (idx === -1 ? '' : '')));
    return h('div', { class: 'tn-match' }, row('sa', m.a), row('sb', m.b));
  };
  const champBox = champ != null ? h('div', { class: 'tn-champ' }, h('span', { class: 'qz-big' }, '🏆'), h('div', null, h('small', null, 'Vinder'), h('b', null, names[champ]))) : null;
  if (t.format === 'knockout') {
    return h('div', null, champBox, h('div', { class: 'tn-bracket' }, Array.from({ length: t.rounds }, (_, r) => h('div', { class: 'tn-round' }, h('h4', null, T.roundName(t, r)),
      h('div', { class: 'tn-col' }, t.matches.filter(m => m.round === r).sort((a, b) => a.slot - b.slot).map(match))))));
  }
  const tbl = T.standings(t, names.length);
  return h('div', null, champBox,
    h('div', { class: 'tn-league' },
      h('table', { class: 'tn-table' }, h('thead', null, h('tr', null, ['#', 'Navn', 'K', 'V', 'U', 'T', 'Mål', 'P'].map(x => h('th', null, x)))),
        h('tbody', null, tbl.map((r, k) => h('tr', { class: k === 0 && r.p ? 'is-top' : '' }, h('td', null, String(k + 1)), h('td', null, names[r.i]), h('td', null, String(r.p)), h('td', null, String(r.w)), h('td', null, String(r.d)), h('td', null, String(r.l)), h('td', null, `${r.gf}–${r.ga}`), h('td', null, h('b', null, String(r.pts))))))),
      h('div', { class: 'tn-rounds' }, Array.from({ length: t.rounds }, (_, r) => { const ms = t.matches.filter(m => m.round === r); return ms.length ? h('div', { class: 'tn-round' }, h('h4', null, T.roundName(t, r)), h('div', { class: 'tn-col' }, ms.map(match))) : null; }))));
}

export async function publicView(data) {
  const { doc } = data;
  return h('div', { class: 'pub-card tn-pub' }, h('h1', null, doc.title), doc.data.game ? h('p', { class: 'muted' }, doc.data.game) : null, view(doc, null));
}

export default {
  title: 'Turneringer',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('tournaments');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';

    async function list() {
      self._off?.(); self._off = onShared('tournament', () => { if (document.body.contains(root) && !root.querySelector('.tn-new')) list(); });
      let docs;
      try { docs = await sh.list('tournament'); } catch (e) { h(clear(root), null, loadError('Turneringer', e)); return; }
      const card = (d) => {
        const ch = d.data.t ? T.champion(d.data.t) : null;
        return h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
          h('div', { class: 'sh-card-h' }, h('b', null, d.title), ch != null ? h('span', { class: 'chip chip-ok' }, '🏆 ', d.data.names[ch]) : h('span', { class: 'chip chip-info' }, 'I gang')),
          h('div', { class: 'sh-meta' }, h('span', null, d.data.format === 'league' ? 'Liga' : 'Knockout'), h('span', null, icon('users'), ` ${d.data.names?.length || 0} deltagere`), d.data.game ? h('span', null, d.data.game) : null, d.role === 'owner' ? null : person(d.owner), h('span', null, ago(d.updated))));
      };
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Ny turnering')),
        docs.length ? h('div', { class: 'sh-list' }, docs.map(card)) : emptyState('award', 'Ingen turneringer endnu', 'Lav en turnering til fodbold i frikvarteret, en spilaften eller skakklubben. Skriv resultaterne ind – alle kan følge med live.', h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Lav den første')));
    }

    function create() {
      let format = 'knockout';
      const title = h('input', { class: 'input', maxlength: 100, placeholder: 'Fx Frikvartersfodbold', 'aria-label': 'Navn på turneringen' });
      const game = h('input', { class: 'input', maxlength: 60, placeholder: 'Fx Fodbold, Skak, Bordtennis', 'aria-label': 'Hvad spiller I?' });
      const names = h('textarea', { class: 'textarea', rows: 8, placeholder: 'Ét navn eller hold pr. linje', 'aria-label': 'Deltagere' });
      const shuffleBox = h('input', { type: 'checkbox', checked: true });
      const err = h('div', { class: 'field-error' });
      const people = h('div', { class: 'wl-tags' });
      sh.people().then(ps => h(clear(people), null, ps.slice(0, 40).map(p => h('button', { class: 'sh-tag', onclick: () => { names.value = `${names.value.trim()}\n${p.name}`.trim(); } }, '+ ', p.name)))).catch(() => {});
      h(clear(root), null, panel('Ny turnering', 'award', h('div', { class: 'tn-new stack' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), title), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Spil eller sport'), game),
        h('span', { class: 'field-label' }, 'Format'),
        segmented([{ value: 'knockout', label: 'Knockout' }, { value: 'league', label: 'Liga (alle mod alle)' }], format, (v) => { format = v; }, { label: 'Format' }),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Deltagere (2–64)'), names), people,
        h('label', { class: 'cal-pcheck' }, shuffleBox, h('span', null, 'Bland rækkefølgen (lodtrækning)')), err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: list }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: async () => {
          let list2 = [...new Set(names.value.split('\n').map(x => x.trim()).filter(Boolean))].slice(0, 64);
          if (!title.value.trim()) { err.textContent = 'Giv turneringen et navn.'; return; }
          if (list2.length < 2) { err.textContent = 'Der skal være mindst to deltagere.'; return; }
          if (format === 'league' && list2.length > 20) { err.textContent = 'En liga kan højst have 20 deltagere.'; return; }
          if (shuffleBox.checked) for (let i = list2.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list2[i], list2[j]] = [list2[j], list2[i]]; }
          const t = format === 'league' ? T.league(list2.length) : T.knockout(list2.length);
          try { const d = await sh.create('tournament', { title: title.value.trim(), data: { game: game.value.trim(), format, names: list2, t }, visibility: 'friends' }); location.hash = `#/apps/${PAGE}/d/${d.id}?share=1`; }
          catch (e) { err.textContent = e.message; }
        } }, icon('check'), 'Lav turneringen')))));
      title.focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Turneringen findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle turneringer'))); return; }
      }
      const { doc, entries } = res, editor = ['owner', 'editor'].includes(doc.role);
      self._off?.(); self._off = onShared('tournament', (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root) && !root.contains(document.activeElement?.closest?.('.tn-match, .sh-comment-new'))) detail(id); }, id);
      if (askShare && doc.role === 'owner') { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, SHARE)) detail(id); }, 50); }
      let saving = Promise.resolve();
      const onScore = editor ? (m, sa, sb) => {
        const t = doc.data.t, mm = t.matches.find(x => x.id === m.id), before = T.champion(t);
        mm.sa = sa; mm.sb = sb; T.advance(t);
        saving = saving.then(() => sh.update(doc.id, { data: doc.data })).then(() => { const ch = T.champion(t); if (ch != null && ch !== before) toast(`🏆 ${doc.data.names[ch]} har vundet!`, { type: 'xp' }); detail(id); }).catch(e => toast('Kunne ikke gemme', { type: 'bad', text: e.message }));
      } : null;
      const done = doc.data.t.matches.filter(m => m.sa != null).length, total = doc.data.t.matches.filter(m => m.a !== -1 && m.b !== -1).length;
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title), visChip(doc),
          editor ? h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, SHARE)) detail(id); } }, icon('share'), 'Del') : null,
          doc.role === 'owner' ? h('button', { class: 'icon-btn', 'aria-label': 'Slet turneringen', onclick: async () => { if (await confirmDialog({ title: 'Slet turneringen?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null),
        h('div', { class: 'sh-meta', style: { marginBottom: '12px' } }, doc.data.game ? h('b', null, doc.data.game) : null, h('span', null, doc.data.format === 'league' ? 'Liga' : 'Knockout'), h('span', null, `${doc.data.names.length} deltagere`), h('span', null, `${done}/${total} kampe spillet`), person(doc.owner)),
        editor ? h('p', { class: 'faint', style: { marginTop: 0 } }, 'Skriv resultatet i felterne – vinderen går automatisk videre.') : null,
        panel(null, null, h('div', { class: 'tn-scroll' }, view(doc, onScore))),
        panel('Snak om det', 'chat', commentBox(doc, entries, { onChange: () => detail(id) })));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page tn-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Turneringer', lead: 'Knockout eller liga til fodbold, spil eller skak. Skriv resultaterne ind – alle kan følge med live, også via et link.', compact: true }), root);
  },
};
