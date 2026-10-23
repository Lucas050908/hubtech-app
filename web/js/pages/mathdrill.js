/**
 * Regnemester – practise plus, minus, the times tables and division. A 60-second sprint for the leaderboard,
 * calm practice where the tasks you get wrong come back, and a times-table map that shows what you know.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { submitScore, boardTable } from '../features/gameroom.js';
import { OPS, nextTask, record, mastery } from '../features/mathdrill.js';

const OP_NAMES = { add: 'Plus', sub: 'Minus', mul: 'Gange', div: 'Division' };
const LEVELS = ['Til 10', 'Til 20', 'Til 100', 'Til 1000'];

export default {
  title: 'Regnemester',
  destroy() { clearInterval(this._iv); },
  async render() {
    const app = appById('mathdrill');
    let store;
    try { store = await appState('mathdrill', { op: 'mul', level: 1, tables: [], stats: {}, best: 0, solved: 0 }); } catch (e) { return loadError('Regnemester', e); }
    const st = store.data, self = this;
    const root = h('div');
    let mode = 'practice';

    function setup() {
      clearInterval(self._iv);
      const tables = new Set(st.tables || []);
      const lb = h('div', null, h('p', { class: 'faint' }, 'Henter …'));
      api.get('/api/games/boards/math').then(r => h(clear(lb), null, boardTable(r.board || r, { unit: 'rigtige' }))).catch(() => h(clear(lb), null, h('p', { class: 'faint' }, 'Toplisten kunne ikke hentes.')));
      const tableBox = h('div', { class: 'md-tables' });
      const drawTables = () => h(clear(tableBox), null, Array.from({ length: 12 }, (_, i) => i + 1).map(n => h('button', { class: ['sh-tag', tables.has(n) && 'is-on'], 'aria-pressed': String(tables.has(n)), onclick: () => { tables.has(n) ? tables.delete(n) : tables.add(n); st.tables = [...tables]; store.save(); drawTables(); } }, `${n}-tabellen`)));
      drawTables();
      const grid = h('div', { class: 'md-grid' }, h('span'), Array.from({ length: 10 }, (_, i) => h('b', null, String(i + 1))),
        Array.from({ length: 10 }, (_, y) => [h('b', null, String(y + 1)), Array.from({ length: 10 }, (_, x) => { const m = mastery(st.stats, x + 1, y + 1); return h('span', { class: 'md-gcell', title: `${y + 1} · ${x + 1} = ${(x + 1) * (y + 1)}`, style: { background: m == null ? 'var(--glass)' : `hsl(${Math.round(m * 120)}, 70%, 45%)` } }, String((x + 1) * (y + 1))); })]));
      h(clear(root), null, h('div', { class: 'ev-wrap' },
        h('div', { class: 'stack' },
          panel('Hvad vil du øve?', 'calculator',
            segmented(Object.entries(OP_NAMES).map(([v, l]) => ({ value: v, label: `${OPS[v]} ${l}` })), st.op, (v) => { st.op = v; store.save(); setup(); }, { label: 'Regneart' }),
            ['mul', 'div'].includes(st.op) ? [h('span', { class: 'field-label', style: { marginTop: '10px', display: 'block' } }, 'Tabeller (vælg ingen for alle)'), tableBox]
              : [h('span', { class: 'field-label', style: { marginTop: '10px', display: 'block' } }, 'Sværhed'), segmented(LEVELS.map((l, i) => ({ value: String(i), label: l })), String(st.level), (v) => { st.level = Number(v); store.save(); }, { label: 'Sværhed' })],
            h('div', { class: 'row', style: { gap: '8px', marginTop: '14px', flexWrap: 'wrap' } },
              h('button', { class: 'btn btn-primary btn-lg', onclick: () => { mode = 'practice'; play(); } }, icon('play'), 'Øv i ro og mag'),
              h('button', { class: 'btn btn-lg', onclick: () => { mode = 'sprint'; play(); } }, icon('clock'), '60 sekunders sprint'))),
          panel('Gangetabellerne – hvad kan du?', 'grid', grid, h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Grøn = sidder fast, rød = øv mere, grå = ikke prøvet endnu.'))),
        h('div', { class: 'stack' },
          h('div', { class: 'jr-stats' }, h('div', null, h('b', null, String(st.best || 0)), h('span', { class: 'faint' }, 'bedste sprint')), h('div', null, h('b', null, String(st.solved || 0)), h('span', { class: 'faint' }, 'rigtige i alt')), h('div', null, h('b', null, String(Object.values(st.stats).filter(s => s.wrong > s.right).length)), h('span', { class: 'faint' }, 'at øve'))),
          panel('Topliste – 60 sekunder', 'award', lb))));
    }

    function play() {
      clearInterval(self._iv);
      let t = null, right = 0, wrong = 0, streak = 0, end = mode === 'sprint' ? Date.now() + 60000 : null, feedback = null;
      const ans = h('input', { class: 'input md-in', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Dit svar' });
      const q = h('div', { class: 'md-q' }), fb = h('div', { class: 'md-fb' }), info = h('div', { class: 'md-info' });
      const pad = h('div', { class: 'md-pad' }, ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'].map(k => h('button', { class: ['md-key', k === '✓' && 'ok'], onclick: () => { if (k === '⌫') ans.value = ans.value.slice(0, -1); else if (k === '✓') check(); else ans.value += k; ans.focus(); } }, k)));
      const next = () => { t = nextTask(st.op, st.level, st.stats, Math.random, ['mul', 'div'].includes(st.op) ? st.tables : null); q.textContent = `${t.a} ${OPS[t.op]} ${t.b} =`; ans.value = ''; ans.focus(); };
      const drawInfo = () => h(clear(info), null, h('span', null, '✓ ', h('b', null, String(right))), h('span', null, '✗ ', h('b', null, String(wrong))), streak > 2 ? h('span', null, `🔥 ${streak}`) : null,
        end ? h('span', { class: 'md-time' }, `${Math.max(0, Math.ceil((end - Date.now()) / 1000))} s`) : null);
      function check() {
        if (ans.value.trim() === '') return;
        const ok = Number(ans.value) === t.answer;
        record(st.stats, t, ok);
        if (ok) { right++; streak++; st.solved = (st.solved || 0) + 1; fb.textContent = ['Rigtigt!', 'Flot!', 'Sejt!', 'Godt regnet!'][right % 4]; fb.className = 'md-fb ok'; }
        else { wrong++; streak = 0; fb.textContent = `${t.a} ${OPS[t.op]} ${t.b} = ${t.answer}`; fb.className = 'md-fb bad'; }
        clearTimeout(feedback); feedback = setTimeout(() => { fb.textContent = ''; fb.className = 'md-fb'; }, ok ? 700 : 2200);
        store.save(); drawInfo(); next();
      }
      ans.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      const finish = () => {
        clearInterval(self._iv);
        const best = right > (st.best || 0);
        if (mode === 'sprint') { if (best) st.best = right; store.save(); store.flush(); if (right > 0) submitScore('math', right); }
        h(clear(root), null, panel(null, null, h('div', { class: 'pub-done' }, h('div', { class: 'qz-big' }, best && mode === 'sprint' ? '🏆' : '🧮'),
          h('h2', null, mode === 'sprint' ? `${right} rigtige på 60 sekunder` : `${right} rigtige`), best && mode === 'sprint' ? h('p', null, 'Ny personlig rekord!') : null,
          h('p', { class: 'muted' }, wrong ? `${wrong} forkerte – de kommer igen, når du øver.` : 'Ingen fejl!'),
          h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn btn-primary', onclick: play }, icon('refresh'), 'Igen'), h('button', { class: 'btn', onclick: setup }, 'Tilbage')))));
      };
      h(clear(root), null, h('div', { class: 'md-play' }, info, q, ans, fb, pad,
        h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, mode === 'practice' ? h('button', { class: 'btn', onclick: finish }, 'Færdig') : null, h('button', { class: 'btn btn-ghost', onclick: setup }, icon('x'), 'Stop'))));
      next(); drawInfo();
      if (end) self._iv = setInterval(() => { if (!document.body.contains(q)) return clearInterval(self._iv); drawInfo(); if (Date.now() >= end) finish(); }, 250);
    }

    setup();
    return h('div', { class: 'page md-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Skole', title: 'Regnemester', lead: 'Øv plus, minus, gangetabeller og division. De opgaver, du har svært ved, kommer oftere igen – og 60 sekunders sprint giver plads på toplisten.', compact: true }), root);
  },
};
