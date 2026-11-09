/** Afstemninger – ask your friends, a class or everyone on HUBTECH, and watch the results come in live. */
import { h, clear, ava } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState, commentBox } from '../features/shared.js';
import { tally } from '../features/sharedlogic.js';

const PAGE = 'polls';

function bars(doc, entries, { onVote, mineChoices = [] } = {}) {
  const opts = doc.data.options || [], t = tally(entries, opts.length);
  const showWho = !doc.data.anonymous;
  return h('div', { class: 'pl-opts' }, opts.map((o, i) => h('div', { class: ['pl-opt', t.top.includes(i) && t.voters && 'is-top', mineChoices.includes(i) && 'is-mine'] },
    h('div', { class: 'pl-fill', style: { width: `${t.pct[i]}%` } }),
    h('div', { class: 'pl-row' },
      onVote ? h('button', { class: 'pl-pick', 'aria-pressed': String(mineChoices.includes(i)), 'aria-label': `Stem på ${o}`, onclick: () => onVote(i) }, icon(mineChoices.includes(i) ? 'checkCircle' : doc.data.multi ? 'plus' : 'chevronRight')) : null,
      h('span', { class: 'pl-label' }, o),
      h('b', null, `${t.pct[i]} %`), h('span', { class: 'faint' }, `${t.counts[i]}`)),
    showWho && t.who[i].length ? h('div', { class: 'pl-who' }, t.who[i].slice(0, 12).map(u => h('span', { class: 'avatar avatar-sm pl-av', title: u.name }, ava(u.avatar)))) : null)),
  h('p', { class: 'faint', style: { margin: '6px 0 0' } }, `${t.voters} ${t.voters === 1 ? 'har' : 'har'} stemt${doc.data.closed ? ' · afstemningen er lukket' : ''}${doc.data.anonymous ? ' · hemmelig afstemning' : ''}`));
}

export async function publicView(data, token) {
  const { doc, entries } = data;
  return h('div', { class: 'pub-card' }, h('h1', null, doc.title), doc.data.desc ? h('p', { class: 'muted' }, doc.data.desc) : null,
    bars(doc, entries),
    h('div', { class: 'row-actions' }, h('a', { class: 'btn btn-primary', href: `#/login?next=${encodeURIComponent(`/p/${token}`)}` }, icon('user'), 'Log ind for at stemme')));
}

export default {
  title: 'Afstemninger',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('polls');
    const root = h('div');
    const self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';
    let view = 'all';

    async function list() {
      self._off?.(); self._off = onShared('poll', () => { if (document.body.contains(root) && !ctx.params?.id) list(); });
      let docs;
      try { docs = await sh.list('poll'); } catch (e) { h(clear(root), null, loadError('Afstemninger', e)); return; }
      const shown = docs.filter(d => view === 'mine' ? d.role === 'owner' : true);
      const card = (d) => {
        const voted = d.mine.vote?.length, n = d.counts.vote || 0;
        return h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
          h('div', { class: 'sh-card-h' }, h('b', null, d.title), d.data.closed ? h('span', { class: 'chip' }, 'Lukket') : voted ? h('span', { class: 'chip chip-ok' }, icon('check'), 'Du har stemt') : h('span', { class: 'chip chip-info' }, 'Stem nu')),
          h('div', { class: 'sh-meta' }, person(d.owner), h('span', null, icon('users'), ` ${n} ${n === 1 ? 'stemme' : 'stemmer'}`), h('span', null, ago(d.updated)), visChip(d)));
      };
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('div', { class: 'cmd-filters' }, ['all', 'mine'].map(v => h('button', { class: ['btn btn-sm', view === v && 'btn-primary'], onclick: () => { view = v; list(); } }, v === 'all' ? 'Til mig' : 'Mine'))),
          h('button', { class: 'btn btn-primary', style: { marginLeft: 'auto' }, onclick: editor }, icon('plus'), 'Ny afstemning')),
        shown.length ? h('div', { class: 'sh-list' }, shown.map(card)) : emptyState('chart', 'Ingen afstemninger endnu', 'Spørg dine venner om noget – pizza eller burger, hvornår I skal ses, eller hvad klassen skal på tur.', h('button', { class: 'btn btn-primary', onclick: editor }, icon('plus'), 'Lav den første')));
    }

    function editor() {
      const opts = ['', ''];
      const q = h('input', { class: 'input', maxlength: 160, placeholder: 'Fx Hvor skal vi spise fredag?', 'aria-label': 'Spørgsmål' });
      const desc = h('textarea', { class: 'textarea', rows: 2, maxlength: 600, placeholder: 'Mere forklaring (valgfrit)', 'aria-label': 'Beskrivelse' });
      const box = h('div', { class: 'stack', style: { gap: '6px' } });
      const multi = h('input', { type: 'checkbox' }), anon = h('input', { type: 'checkbox' });
      const err = h('div', { class: 'field-error' });
      const draw = () => h(clear(box), null, opts.map((o, i) => {
        const inp = h('input', { class: 'input', value: o, maxlength: 80, placeholder: `Mulighed ${i + 1}`, 'aria-label': `Mulighed ${i + 1}` });
        inp.addEventListener('input', () => { opts[i] = inp.value; });
        return h('div', { class: 'row', style: { gap: '6px' } }, inp, opts.length > 2 ? h('button', { class: 'icon-btn', 'aria-label': 'Fjern', onclick: () => { opts.splice(i, 1); draw(); } }, icon('x')) : null);
      }), opts.length < 12 ? h('button', { class: 'btn btn-sm', onclick: () => { opts.push(''); draw(); } }, icon('plus'), 'Tilføj mulighed') : null);
      draw();
      h(clear(root), null, panel('Ny afstemning', 'chart',
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Spørgsmål'), q), desc,
        h('span', { class: 'field-label' }, 'Svarmuligheder'), box,
        h('label', { class: 'cal-pcheck' }, multi, h('span', null, 'Man må vælge flere')),
        h('label', { class: 'cal-pcheck' }, anon, h('span', null, 'Hemmelig – ingen kan se, hvem der stemte hvad')),
        err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: list }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: async () => {
            const options = opts.map(o => o.trim()).filter(Boolean);
            if (!q.value.trim()) { err.textContent = 'Skriv et spørgsmål.'; return; }
            if (options.length < 2) { err.textContent = 'Der skal være mindst to muligheder.'; return; }
            try {
              const d = await sh.create('poll', { title: q.value.trim(), data: { options, desc: desc.value.trim(), multi: multi.checked, anonymous: anon.checked }, visibility: 'friends' });
              location.hash = `#/apps/${PAGE}/d/${d.id}?share=1`;
            } catch (e) { err.textContent = e.message; }
          } }, icon('check'), 'Opret og del'))));
      q.focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token && e.status === 404) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Afstemningen findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle afstemninger'))); return; }
      }
      const { doc, entries } = res;
      self._off?.(); self._off = onShared('poll', (ev) => { if (ev.what === 'gone') { toast('Afstemningen er slettet', { type: 'info' }); location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root)) detail(id); }, id);
      if (askShare && doc.role === 'owner') { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: 'Hvem skal stemme?', publicOk: true, publicText: 'Alle med linket kan se resultatet (men skal logge ind for at stemme).' })) detail(id); }, 50); }
      const myVote = entries.find(e => e.kind === 'vote' && e.mine);
      const mine = myVote?.data.choices || [];
      const owner = doc.role === 'owner';
      const vote = async (i) => {
        if (doc.data.closed) return toast('Afstemningen er lukket', { type: 'warn' });
        let ch = doc.data.multi ? (mine.includes(i) ? mine.filter(x => x !== i) : [...mine, i]) : [i];
        try { await sh.add(doc.id, 'vote', ch.length ? { choices: ch } : { remove: true }); detail(id); } catch (e) { toast('Kunne ikke stemme', { type: 'bad', text: e.message }); }
      };
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title), visChip(doc),
          owner ? [h('button', { class: 'btn btn-sm', onclick: async () => { const s = await shareDialog(doc, { title: 'Del afstemningen', publicOk: true, publicText: 'Alle med linket kan se resultatet (men skal logge ind for at stemme).' }); if (s) detail(id); } }, icon('share'), 'Del'),
            h('button', { class: 'btn btn-sm', onclick: async () => { await sh.update(doc.id, { data: { ...doc.data, closed: !doc.data.closed } }); detail(id); } }, icon(doc.data.closed ? 'unlock' : 'lock'), doc.data.closed ? 'Åbn igen' : 'Luk'),
            h('button', { class: 'icon-btn', 'aria-label': 'Slet', onclick: async () => { if (await confirmDialog({ title: 'Slet afstemningen?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash'))] : null),
        h('div', { class: 'sh-meta', style: { marginBottom: '12px' } }, person(doc.owner), h('span', null, ago(doc.created)), doc.data.multi ? h('span', null, 'Vælg gerne flere') : h('span', null, 'Vælg én')),
        doc.data.desc ? h('p', { class: 'muted' }, doc.data.desc) : null,
        panel(null, null, bars(doc, entries, { onVote: doc.data.closed ? null : vote, mineChoices: mine }),
          !doc.data.closed ? h('p', { class: 'faint', style: { margin: '6px 0 0' } }, mine.length ? 'Tryk igen for at ændre din stemme.' : 'Tryk på en mulighed for at stemme.') : null),
        panel('Snak om det', 'chat', commentBox(doc, entries, { onChange: () => detail(id) })));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id);
    else if (ctx?.params?.sub === 'new') editor();
    else list();
    return h('div', { class: 'page pl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Afstemninger', lead: 'Spørg dine venner, klassen eller alle på HUBTECH – og se svarene komme ind live.', compact: true }), root);
  },
};
