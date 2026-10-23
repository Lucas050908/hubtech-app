/**
 * Udfordringer – 30 days of reading, 10.000 steps, no sugar, a drawing a day … together.
 * Join, tick off each day, keep your streak and see the leaderboard. Open challenges can be found by everyone.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, visChip, emptyState, commentBox, me } from '../features/shared.js';
import { challengeStats, challengeDay, todayIso, addDays, streak } from '../features/sharedlogic.js';

const PAGE = 'challenges';
const IDEAS = [
  { title: 'Læs hver dag', unit: 'sider', days: 30, emoji: '📚', desc: 'Læs lidt hver dag – skriv hvor mange sider.' },
  { title: '10.000 skridt', unit: 'skridt', days: 14, emoji: '👟', desc: 'Gå mindst 10.000 skridt om dagen.' },
  { title: 'En tegning om dagen', unit: '', days: 30, emoji: '🎨', desc: 'Tegn noget – stort eller lille – hver dag.' },
  { title: 'Ingen sodavand', unit: '', days: 21, emoji: '🥤', desc: 'Drop sodavand og energidrik i tre uger.' },
  { title: 'Kod hver dag', unit: 'minutter', days: 30, emoji: '💻', desc: 'Kod mindst 20 minutter hver dag.' },
  { title: 'Træn hver dag', unit: 'minutter', days: 30, emoji: '💪', desc: 'Rør dig – løb, cykel, styrke eller dans.' },
];

export default {
  title: 'Udfordringer',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('challenges');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1', view = 'mine';

    async function list() {
      self._off?.(); self._off = onShared('challenge', () => { if (document.body.contains(root) && !root.querySelector('.ch-new')) list(); });
      let docs;
      try { docs = await sh.list('challenge'); } catch (e) { h(clear(root), null, loadError('Udfordringer', e)); return; }
      const joined = (d) => d.role === 'owner' || d.mine.join?.length;
      const shown = docs.filter(d => view === 'mine' ? joined(d) : view === 'open' ? !joined(d) && !challengeDay(d.data).done : challengeDay(d.data).done);
      const card = (d) => {
        const cd = challengeDay(d.data), doneToday = d.mine.checkin?.some(c => c.date === todayIso());
        return h('a', { class: 'sh-card ch-card', href: `#/apps/${PAGE}/d/${d.id}` },
          h('span', { class: 'ch-emoji', 'aria-hidden': 'true' }, d.data.emoji || '🏁'),
          h('div', { class: 'ev-card-b' },
            h('div', { class: 'sh-card-h' }, h('b', null, d.title),
              joined(d) && cd.started && !cd.done ? h('span', { class: ['chip', doneToday ? 'chip-ok' : 'chip-info'] }, doneToday ? 'Klaret i dag' : 'Mangler i dag') : !cd.started ? h('span', { class: 'chip' }, `Starter ${new Date(`${d.data.start}T12:00`).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`) : cd.done ? h('span', { class: 'chip' }, 'Slut') : null),
            h('div', { class: 'ch-prog' }, h('i', { style: { width: `${Math.round(cd.day / d.data.days * 100)}%` } })),
            h('div', { class: 'sh-meta' }, h('span', null, cd.started ? `Dag ${cd.day} af ${d.data.days}` : `${d.data.days} dage`), h('span', null, icon('users'), ` ${d.counts.join || 0} med`), person(d.owner))));
      };
      h(clear(root), null,
        h('div', { class: 'sh-top' }, segmented([{ value: 'mine', label: 'Mine' }, { value: 'open', label: 'Find en' }, { value: 'done', label: 'Afsluttede' }], view, (v) => { view = v; list(); }, { label: 'Vis' }),
          h('button', { class: 'btn btn-primary', style: { marginLeft: 'auto' }, onclick: () => editor() }, icon('plus'), 'Ny udfordring')),
        shown.length ? h('div', { class: 'sh-list' }, shown.map(card)) : view === 'mine'
          ? h('div', null, emptyState('flag', 'Du er ikke med i nogen udfordringer', 'Start en selv – eller find en, andre har lavet. Det er sjovere sammen.'),
            h('h3', { class: 'gr-h', style: { marginTop: '18px' } }, 'Idéer til at komme i gang'),
            h('div', { class: 'ch-ideas' }, IDEAS.map(i => h('button', { class: 'ch-idea', onclick: () => editor(i) }, h('span', { class: 'ch-emoji' }, i.emoji), h('b', null, i.title), h('span', { class: 'faint' }, `${i.days} dage`)))))
          : emptyState('flag', view === 'open' ? 'Ingen åbne udfordringer lige nu' : 'Ingen afsluttede endnu', view === 'open' ? 'Lav en, og vælg “Alle på HUBTECH”, så andre kan finde den.' : ''));
    }

    function editor(idea = {}) {
      const title = h('input', { class: 'input', maxlength: 100, value: idea.title || '', placeholder: 'Fx Læs hver dag', 'aria-label': 'Navn på udfordringen' });
      const desc = h('textarea', { class: 'textarea', rows: 2, maxlength: 600, placeholder: 'Hvad går den ud på?', 'aria-label': 'Beskrivelse' }); desc.value = idea.desc || '';
      const emoji = h('input', { class: 'input ch-emoji-in', maxlength: 4, value: idea.emoji || '🏁', 'aria-label': 'Emoji' });
      const days = h('input', { class: 'input', type: 'number', min: 3, max: 365, value: idea.days || 30, 'aria-label': 'Antal dage', style: { width: '110px' } });
      const start = h('input', { class: 'input', type: 'date', value: todayIso(), 'aria-label': 'Startdato' });
      const unit = h('input', { class: 'input', maxlength: 20, value: idea.unit || '', placeholder: 'Fx sider, km, minutter (valgfrit)', 'aria-label': 'Hvad tæller man' });
      let vis = 'friends';
      const err = h('div', { class: 'field-error' });
      const f = (l, el) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, l), el);
      h(clear(root), null, panel('Ny udfordring', 'flag', h('div', { class: 'ch-new stack' },
        h('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-end' } }, f('Emoji', emoji), h('div', { style: { flex: 1 } }, f('Navn', title))), desc,
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, f('Antal dage', days), f('Starter', start), h('div', { style: { flex: 1, minWidth: '200px' } }, f('Hvad tæller man? (valgfrit)', unit))),
        h('span', { class: 'field-label' }, 'Hvem kan være med?'),
        segmented([{ value: 'private', label: 'Kun inviterede', icon: 'lock' }, { value: 'friends', label: 'Venner', icon: 'users' }, { value: 'all', label: 'Alle på HUBTECH', icon: 'globe' }], vis, (v) => { vis = v; }, { label: 'Hvem kan være med' }),
        err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: list }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: async () => {
          const n = Math.round(Number(days.value));
          if (!title.value.trim()) { err.textContent = 'Giv udfordringen et navn.'; return; }
          if (!(n >= 3 && n <= 365)) { err.textContent = 'Vælg mellem 3 og 365 dage.'; return; }
          try {
            const d = await sh.create('challenge', { title: title.value.trim(), data: { desc: desc.value.trim(), emoji: emoji.value.trim() || '🏁', days: n, start: start.value || todayIso(), unit: unit.value.trim() }, visibility: vis });
            await sh.add(d.id, 'join', {});
            location.hash = `#/apps/${PAGE}/d/${d.id}${vis === 'private' ? '?share=1' : ''}`;
          } catch (e) { err.textContent = e.message; }
        } }, icon('check'), 'Start udfordringen')))));
      title.focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Udfordringen findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle udfordringer'))); return; }
      }
      const { doc, entries } = res, d = doc.data, owner = doc.role === 'owner';
      self._off?.(); self._off = onShared('challenge', (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root) && !document.activeElement?.closest?.('.ch-check, .sh-comment-new')) detail(id); }, id);
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: 'Invitér' })) detail(id); }, 50); }
      const again = () => detail(id);
      const today = todayIso(), cd = challengeDay(d, today);
      const stats = challengeStats(entries, d, today);
      const meId = me(), joined = entries.some(e => e.kind === 'join' && e.mine);
      const myChecks = entries.filter(e => e.kind === 'checkin' && e.mine);
      const myDates = new Set(myChecks.map(e => e.data.date));
      const myStreak = streak([...myDates], today);
      const doneToday = myDates.has(today);
      const checkin = async (date, amount, note) => {
        try { await sh.add(doc.id, 'checkin', { date, amount: amount === '' || amount == null ? null : Number(String(amount).replace(',', '.')), note }); if (date === today) toast(myStreak + 1 > 1 ? `${myStreak + 1} dage i træk! 🔥` : 'Godt gået! ✓', { type: 'ok' }); again(); }
        catch (e) { toast('Det gik ikke', { type: 'bad', text: e.message }); }
      };
      const amountIn = d.unit ? h('input', { class: 'input', inputmode: 'decimal', placeholder: `Antal ${d.unit}`, 'aria-label': `Antal ${d.unit}`, style: { width: '140px' } }) : null;
      const noteIn = h('input', { class: 'input', maxlength: 200, placeholder: 'Hvordan gik det? (valgfrit)', 'aria-label': 'Note' });
      // the calendar of my days
      const cal = h('div', { class: 'ch-cal', 'aria-label': 'Mine dage' }, Array.from({ length: d.days }, (_, i) => {
        const date = addDays(d.start, i), done = myDates.has(date), future = date > today, isToday = date === today;
        return h('button', { class: ['ch-day', done && 'is-done', future && 'is-future', isToday && 'is-today'], disabled: future || !joined, title: `${new Date(`${date}T12:00`).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })}${done ? ' – klaret' : ''}`,
          'aria-label': `Dag ${i + 1}${done ? ', klaret' : ''}`, onclick: async () => {
            if (done) { if (await confirmDialog({ title: 'Fjern afkrydsningen?', confirmLabel: 'Fjern' })) { await sh.add(doc.id, 'checkin', { date, remove: true }); again(); } }
            else checkin(date, null, 'Krydset af bagefter');
          } }, String(i + 1));
      }));
      const feed = entries.filter(e => e.kind === 'checkin' && (e.data.note || e.data.amount)).slice(-30).reverse();
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, `${d.emoji || ''} ${doc.title}`), visChip(doc),
          owner ? h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: 'Invitér' })) again(); } }, icon('share'), 'Invitér') : null,
          joined && !owner ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Forlad udfordringen?', confirmLabel: 'Forlad' })) { await sh.add(doc.id, 'join', { remove: true }); location.hash = `#/apps/${PAGE}`; } } }, 'Forlad') : null,
          owner ? h('button', { class: 'icon-btn', 'aria-label': 'Slet udfordringen', onclick: async () => { if (await confirmDialog({ title: 'Slet udfordringen for alle?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash')) : null),
        d.desc ? h('p', { class: 'muted' }, d.desc) : null,
        h('div', { class: 'ch-hero' },
          h('div', { class: 'ch-ring', style: { '--p': `${Math.round(cd.day / d.days * 100)}` } }, h('b', null, cd.started ? String(cd.day) : '0'), h('small', null, `af ${d.days} dage`)),
          h('div', { class: 'ch-hero-b' },
            !joined ? h('div', { class: 'stack' }, h('p', { style: { margin: 0 } }, `${stats.filter(s => s.joined).length} er med. Vil du også?`), h('button', { class: 'btn btn-primary btn-lg', onclick: async () => { await sh.add(doc.id, 'join', {}); toast('Du er med! 🎉', { type: 'ok' }); again(); } }, icon('flag'), 'Vær med'))
              : cd.done ? h('div', null, h('b', null, 'Udfordringen er slut!'), h('p', { class: 'faint', style: { margin: '4px 0 0' } }, `Du klarede ${myDates.size} af ${d.days} dage.`))
                : !cd.started ? h('p', { style: { margin: 0 } }, `Starter ${new Date(`${d.start}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })}. Gør dig klar!`)
                  : doneToday ? h('div', { class: 'ch-done' }, icon('checkCircle'), h('div', null, h('b', null, 'Klaret i dag!'), h('span', { class: 'faint' }, ` ${myStreak} ${myStreak === 1 ? 'dag' : 'dage'} i træk 🔥`)))
                    : h('div', { class: 'ch-check stack' }, h('b', null, 'Har du klaret dagen?'), h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, amountIn, noteIn),
                      h('button', { class: 'btn btn-primary btn-lg', onclick: () => checkin(today, amountIn?.value ?? null, noteIn.value.trim()) }, icon('check'), 'Klaret i dag'),
                      myStreak ? h('span', { class: 'faint' }, `Du har ${myStreak} ${myStreak === 1 ? 'dag' : 'dage'} i træk – hold den!`) : null))),
        h('div', { class: 'ev-wrap' },
          h('div', { class: 'stack' },
            joined ? panel('Mine dage', 'calendar', cal, h('p', { class: 'faint', style: { margin: '8px 0 0' } }, 'Glemte du en dag? Tryk på den for at krydse den af.')) : null,
            panel('Hvordan går det', 'chat', feed.length ? h('div', { class: 'ch-feed' }, feed.map(e => h('div', { class: 'sh-comment' }, person(e.user), h('span', { class: 'faint sh-when' }, ago(e.at)),
              h('p', null, e.data.amount != null && d.unit ? h('b', null, `${e.data.amount.toLocaleString('da-DK')} ${d.unit} `) : null, e.data.note || '')))) : h('p', { class: 'faint', style: { margin: '0 0 10px' } }, 'Når folk krydser af med en note, kommer det her.'),
              commentBox(doc, entries, { onChange: again, placeholder: 'Hep på de andre …' }))),
          panel('Stillingen', 'award', stats.length ? h('ol', { class: 'ch-board' }, stats.map((s, i) => h('li', { class: ['ch-row', s.id === meId && 'is-me'] },
            h('span', { class: 'ch-place' }, i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1)), person(s.user),
            h('span', { class: 'ch-stat', title: 'Dage klaret' }, h('b', null, String(s.days)), h('small', null, 'dage')),
            s.streak > 1 ? h('span', { class: 'ch-stat', title: 'I træk' }, h('b', null, `${s.streak}🔥`)) : h('span'),
            d.unit ? h('span', { class: 'ch-stat' }, h('b', null, s.total.toLocaleString('da-DK')), h('small', null, d.unit)) : null))) : h('p', { class: 'faint' }, 'Ingen er med endnu.'))));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page ch-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Udfordringer', lead: '30 dages læsning, 10.000 skridt eller en tegning om dagen – sammen. Kryds af hver dag, hold din stime og se stillingen.', compact: true }), root);
  },
};
