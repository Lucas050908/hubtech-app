/**
 * Kodeudfordringer – learn JavaScript by solving small tasks. Your code runs against tests in a sealed sandbox;
 * solved tasks give points, and the points go on a leaderboard with everyone else on HUBTECH.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';
import { mdInline } from '../features/sharedlogic.js';
import { CHALLENGES, LEVELS, TOTAL_POINTS } from '../data/codechallenges.js';

const inline = (t) => mdInline(t).map(p => p.t === 'b' ? h('strong', null, p.v) : p.t === 'i' ? h('em', null, p.v) : p.t === 'code' ? h('code', null, p.v) : p.v);

/** one sandbox iframe for the page; run(code, fn, tests) → { res, logs } or { error } */
function sandbox() {
  let frame = null, ready = null, n = 0;
  const waiting = new Map();
  const onMsg = (e) => {
    if (!frame || e.source !== frame.contentWindow || !e.data?.__code) return;
    if (e.data.ready) { ready?.resolve(); return; }
    const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data); }
  };
  window.addEventListener('message', onMsg);
  const boot = () => {
    frame?.remove();
    let ok; const p = new Promise(r => { ok = r; }); ready = { promise: p, resolve: ok };
    frame = h('iframe', { src: '/api/code/runner', sandbox: 'allow-scripts', title: 'Kørsel af kode', hidden: true });
    document.body.append(frame);
  };
  return {
    async run(code, fn, tests) {
      if (!frame || !document.body.contains(frame)) boot();
      await Promise.race([ready.promise, new Promise(r => setTimeout(r, 4000))]);
      const id = ++n;
      return new Promise((resolve) => {
        const t = setTimeout(() => { waiting.delete(id); boot(); resolve({ error: 'Koden tog for lang tid.' }); }, 5000);
        waiting.set(id, (d) => { clearTimeout(t); resolve(d); });
        frame.contentWindow.postMessage({ __code: 1, id, code, fn, tests }, '*');
      });
    },
    destroy() { window.removeEventListener('message', onMsg); frame?.remove(); },
  };
}

export default {
  title: 'Kodeudfordringer',
  destroy() { this._box?.destroy(); },
  async render(ctx) {
    const app = appById('codelab');
    let store;
    try { store = await appState('codelab', { solved: {}, drafts: {}, tries: {} }); } catch (e) { return loadError('Kodeudfordringer', e); }
    const st = store.data, self = this;
    this._box?.destroy(); const box = this._box = sandbox();
    const root = h('div');
    let level = 0;
    const points = () => CHALLENGES.filter(c => st.solved[c.id]).reduce((s, c) => s + c.points, 0);

    function list() {
      const solvedN = Object.keys(st.solved).filter(id => CHALLENGES.some(c => c.id === id)).length;
      const shown = CHALLENGES.filter(c => !level || c.level === level);
      const next = CHALLENGES.find(c => !st.solved[c.id]);
      const lb = h('div', null, h('p', { class: 'faint' }, 'Henter …'));
      api.get('/api/games/boards/code').then(r => h(clear(lb), null, boardTable(r.board || r, { unit: 'point' }))).catch(() => h(clear(lb), null, h('p', { class: 'faint' }, 'Toplisten kunne ikke hentes.')));
      h(clear(root), null,
        h('div', { class: 'cl-top' },
          h('div', { class: 'cl-score' }, h('b', null, String(points())), h('span', { class: 'faint' }, `af ${TOTAL_POINTS} point`)),
          h('div', { class: 'cl-score' }, h('b', null, `${solvedN}/${CHALLENGES.length}`), h('span', { class: 'faint' }, 'løst')),
          h('div', { class: 'cl-bar' }, h('i', { style: { width: `${Math.round(solvedN / CHALLENGES.length * 100)}%` } })),
          next ? h('a', { class: 'btn btn-primary', href: `#/apps/codelab/c/${next.id}` }, icon('play'), solvedN ? 'Fortsæt' : 'Start med den første') : h('span', { class: 'chip chip-ok' }, icon('award'), 'Alle løst!')),
        h('div', { class: 'ev-wrap' },
          h('div', { class: 'stack' },
            segmented([{ value: 0, label: 'Alle' }, ...Object.entries(LEVELS).map(([v, l]) => ({ value: Number(v), label: l }))], level, (v) => { level = v; list(); }, { label: 'Sværhedsgrad' }),
            h('div', { class: 'cl-list' }, shown.map((c) => h('a', { class: ['cl-item', st.solved[c.id] && 'is-solved'], href: `#/apps/codelab/c/${c.id}` },
              h('span', { class: 'cl-check' }, st.solved[c.id] ? icon('check') : String(CHALLENGES.indexOf(c) + 1)),
              h('div', { class: 'cl-item-b' }, h('b', null, c.title), h('span', { class: 'faint' }, `${c.topic} · ${LEVELS[c.level]}`)),
              h('span', { class: ['cl-pts', `lv${c.level}`] }, `${c.points} p`))))),
          panel('Topliste', 'award', lb, h('p', { class: 'faint', style: { margin: '8px 0 0', fontSize: '13px' } }, 'Løs opgaver for at få point. Koden køres i en lukket sandkasse i din browser.'))));
    }

    function task(id) {
      const c = CHALLENGES.find(x => x.id === id);
      if (!c) { location.hash = '#/apps/codelab'; return; }
      const idx = CHALLENGES.indexOf(c), next = CHALLENGES[idx + 1], prev = CHALLENGES[idx - 1];
      const ed = h('textarea', { class: 'cl-code', spellcheck: false, autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Din kode' });
      ed.value = st.drafts[c.id] ?? st.solved[c.id]?.code ?? c.start;
      const gutter = h('div', { class: 'cl-gutter', 'aria-hidden': 'true' });
      const drawGutter = () => { const n = ed.value.split('\n').length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); };
      ed.addEventListener('scroll', () => { gutter.scrollTop = ed.scrollTop; });
      let t = null;
      ed.addEventListener('input', () => { drawGutter(); clearTimeout(t); t = setTimeout(() => { st.drafts[c.id] = ed.value; store.save(); }, 600); });
      ed.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); ed.setRangeText('  ', ed.selectionStart, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input')); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runBtn.click(); }
        else if (e.key === 'Enter') { const before = ed.value.slice(0, ed.selectionStart), line = before.split('\n').pop(), ind = line.match(/^\s*/)[0] + (/[{[(]\s*$/.test(line) ? '  ' : ''); e.preventDefault(); ed.setRangeText(`\n${ind}`, ed.selectionStart, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input')); }
      });
      drawGutter();
      const out = h('div', { class: 'cl-out' }, h('p', { class: 'faint', style: { margin: 0 } }, 'Tryk “Kør tests” (eller Ctrl + Enter) for at prøve din kode.'));
      const hintBox = h('div');
      const runBtn = h('button', { class: 'btn btn-primary', onclick: async () => {
        runBtn.disabled = true; h(clear(out), null, h('p', { class: 'faint', style: { margin: 0 } }, 'Kører …'));
        const r = await box.run(ed.value, c.fn, c.tests);
        runBtn.disabled = false;
        st.tries[c.id] = (st.tries[c.id] || 0) + 1;
        const logs = r.logs?.length ? h('details', { class: 'cl-logs', open: true }, h('summary', null, `console.log (${r.logs.length})`), h('pre', null, r.logs.join('\n'))) : null;
        if (r.error) { h(clear(out), null, h('div', { class: 'cl-err' }, icon('alert'), h('span', null, r.error)), logs); store.save(); return; }
        const ok = r.res.filter(x => x.ok).length, all = ok === r.res.length;
        h(clear(out), null,
          h('div', { class: ['cl-result', all ? 'is-ok' : 'is-bad'] }, icon(all ? 'checkCircle' : 'alert'), h('b', null, all ? 'Alle tests bestået!' : `${ok} af ${r.res.length} tests bestået`)),
          h('ol', { class: 'cl-tests' }, r.res.map((x, i) => h('li', { class: x.ok ? 'is-ok' : 'is-bad' }, icon(x.ok ? 'check' : 'x'),
            h('code', null, `${c.fn}(${c.tests[i].args.map(a => JSON.stringify(a)).join(', ')})`),
            x.ok ? h('span', { class: 'faint' }, `→ ${JSON.stringify(c.tests[i].expect)}`) : h('span', null, ' gav ', h('code', null, x.error ? `fejl: ${x.error}` : x.got ?? 'undefined'), ', skulle give ', h('code', null, JSON.stringify(c.tests[i].expect)))))),
          logs);
        if (all) {
          const first = !st.solved[c.id];
          st.solved[c.id] = { at: Date.now(), code: ed.value }; delete st.drafts[c.id]; store.save(); store.flush();
          if (first) { toast(`+${c.points} point!`, { type: 'xp', text: c.title }); submitScore('code', points()); }
          if (next) out.append(h('div', { class: 'row-actions' }, h('a', { class: 'btn btn-primary', href: `#/apps/codelab/c/${next.id}` }, 'Næste opgave', icon('arrowRight'))));
        } else store.save();
        drawHint();
      } }, icon('play'), 'Kør tests');
      const drawHint = () => h(clear(hintBox), null,
        h('details', { class: 'cl-hint' }, h('summary', null, icon('help'), ' Vis et tip'), h('p', null, inline(c.hint))),
        (st.tries[c.id] || 0) >= 3 || st.solved[c.id] ? h('details', { class: 'cl-hint' }, h('summary', null, icon('eye'), ' Se et løsningsforslag'), h('pre', null, c.solution),
          !st.solved[c.id] ? h('p', { class: 'faint', style: { margin: '6px 0 0', fontSize: '13px' } }, 'Prøv selv at skrive den – det er sådan, man lærer det.') : null) : null);
      drawHint();
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: '#/apps/codelab' }, icon('arrowLeft'), 'Alle opgaver'), h('h2', null, `${idx + 1}. ${c.title}`),
          h('span', { class: ['cl-pts', `lv${c.level}`] }, `${LEVELS[c.level]} · ${c.points} p`), st.solved[c.id] ? h('span', { class: 'chip chip-ok' }, icon('check'), 'Løst') : null,
          prev ? h('a', { class: 'icon-btn', href: `#/apps/codelab/c/${prev.id}`, 'aria-label': 'Forrige opgave' }, icon('chevronLeft')) : null,
          next ? h('a', { class: 'icon-btn', href: `#/apps/codelab/c/${next.id}`, 'aria-label': 'Næste opgave' }, icon('chevronRight')) : null),
        h('div', { class: 'cl-wrap' },
          h('div', { class: 'stack' }, panel('Opgaven', 'file', h('p', { class: 'cl-text' }, inline(c.text)),
            h('span', { class: 'field-label' }, 'Eksempler'), h('ul', { class: 'cl-examples' }, c.tests.slice(0, 3).map(t => h('li', null, h('code', null, `${c.fn}(${t.args.map(a => JSON.stringify(a)).join(', ')})`), ' → ', h('code', null, JSON.stringify(t.expect)))))), hintBox),
          h('div', { class: 'stack' },
            h('div', { class: 'cl-editor' }, gutter, ed),
            h('div', { class: 'row', style: { gap: '8px' } }, runBtn, h('button', { class: 'btn btn-ghost', onclick: () => { ed.value = c.start; ed.dispatchEvent(new Event('input')); } }, icon('undo'), 'Start forfra'), h('span', { style: { flex: 1 } }), h('span', { class: 'faint', style: { fontSize: '12px' } }, 'Ctrl + Enter kører')),
            out)));
      ed.focus();
    }

    const p = ctx?.params || {};
    if (p.sub === 'c' && p.id) task(p.id); else list();
    return h('div', { class: 'page cl-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Skole', title: 'Kodeudfordringer', lead: 'Lær JavaScript ved at løse små opgaver. Din kode testes med det samme – og point giver plads på toplisten.', compact: true }), root);
  },
};
