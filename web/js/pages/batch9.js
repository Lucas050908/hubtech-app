/** Fem på stribe, Tændstikker, Støjmåler, Ordklasser, Talsystemer, Genveje, Klaver og Morgenrutine (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, todayKey } from '../features/appkit.js';
import * as B from '../features/batch9.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const score = (st) => h('div', { class: 'l3-score' }, h('span', null, h('b', null, String(st.right)), ' rigtige'), h('span', null, h('b', null, String(st.streak)), ' i træk'), h('span', { class: 'faint' }, `rekord ${st.best}`));
const mark = (st, ok, store) => { if (ok) { st.right++; st.streak++; st.best = Math.max(st.best, st.streak); } else { st.streak = 0; } store.save(); };

// ── Talsystemer ──
export const numsys = {
  title: 'Talsystemer',
  async render() {
    let store;
    try { store = await appState('numsys', { mode: 'conv', level: 1, right: 0, streak: 0, best: 0, n: 42 }); } catch (e) { return loadError('Talsystemer', e); }
    const st = store.data, root = h('div');
    let task = null, answered = null;
    function converter() {
      const fields = {};
      const set = (n, except) => { st.n = n; store.save(); for (const b of [2, 8, 10, 16]) if (b !== except) fields[b].value = n == null ? '' : B.toBase(n, b); drawBits(); };
      const bits = h('div', { class: 'ns-bits' });
      const drawBits = () => { const bin = st.n == null ? '' : B.toBase(st.n, 2).padStart(8, '0'); h(clear(bits), null, [...bin].map((c, i, a) => h('button', { class: ['ns-bit', c === '1' && 'on'], 'aria-label': `Bit med værdi ${2 ** (a.length - 1 - i)}`, onclick: () => set((st.n || 0) ^ (2 ** (a.length - 1 - i))) }, h('b', null, c), h('small', null, String(2 ** (a.length - 1 - i)))))); };
      const row = (b) => { const el = fields[b] = h('input', { class: 'input ns-in', value: st.n == null ? '' : B.toBase(st.n, b), 'aria-label': B.BASES[b], spellcheck: false, autocomplete: 'off' }); el.addEventListener('input', () => { const n = B.fromBase(el.value, b); el.classList.toggle('bad', el.value !== '' && n == null); if (n != null && n <= 0xffffffff) set(n, b); }); return h('label', { class: 'ns-row' }, h('span', null, B.BASES[b], h('small', { class: 'faint' }, ` (${b})`)), el); };
      const out = h('div', { class: 'stack' }, [10, 2, 16, 8].map(row), h('span', { class: 'field-label' }, 'Klik på bittene'), bits);
      drawBits();
      return h('div', { class: 'l3-card', style: { justifyItems: 'stretch' } }, out, h('p', { class: 'faint', style: { fontSize: '13px', margin: 0 } }, 'Computere regner med binære tal – kun 0 og 1. Hver plads er dobbelt så meget værd som den til højre. Hex bruges til farver og adresser, fordi ét hex-ciffer er præcis fire bit.'));
    }
    function quiz() {
      if (!task) task = B.numTask(st.level);
      const input = h('input', { class: 'input l3-typed', 'aria-label': 'Dit svar', autocomplete: 'off', spellcheck: false, disabled: !!answered });
      const check = () => { if (!input.value.trim()) return; const ok = B.fromBase(input.value, task.to) === task.n; answered = { ok }; mark(st, ok, store); draw(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (answered) { task = null; answered = null; draw(); } else check(); } });
      if (!answered) setTimeout(() => input.isConnected && input.focus(), 0);
      return h('div', { class: 'l3-card' }, score(st),
        h('div', { class: 'l3-bar', style: { justifyContent: 'center' } }, segmented([{ value: '1', label: 'Op til 15' }, { value: '2', label: 'Op til 63' }, { value: '3', label: 'Op til 255' }, { value: '4', label: 'Op til 4095' }], String(st.level), (v) => { st.level = Number(v); store.save(); task = null; answered = null; draw(); }, { label: 'Niveau' })),
        h('p', { class: 'l3-ask' }, `Skriv ${B.BASES[task.from].toLowerCase()} ${task.from === 10 ? 'tallet' : ''} som ${B.BASES[task.to].toLowerCase()}`, h('b', { class: 'ns-mono' }, task.ask)),
        h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, answered ? null : h('button', { class: 'btn btn-primary', onclick: check }, 'Tjek')),
        answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Ikke helt. ', h('span', { class: 'ns-mono' }, `${task.ask} (${task.from}) = ${task.answer} (${task.to})`), task.to === 2 || task.from === 2 ? h('span', { class: 'faint' }, ` · ${B.bitValues(B.toBase(task.n, 2)).filter(Boolean).join(' + ')} = ${task.n}`) : null) : null,
        answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: () => { task = null; answered = null; draw(); } }, 'Næste', icon('play')) : null);
    }
    function draw() { h(clear(root), null, h('div', { class: 'l3-bar' }, segmented([{ value: 'conv', label: 'Omregner' }, { value: 'quiz', label: 'Øv dig' }], st.mode, (v) => { st.mode = v; store.save(); draw(); }, { label: 'Visning' })), st.mode === 'conv' ? converter() : quiz()); }
    draw();
    return page('numsys', 'Lær', 'Talsystemer', 'Forstå binære tal og hex, som computere bruger: omregn mellem talsystemer, klik bittene til og fra, og øv dig.', root);
  },
};

// ── Genveje ──
export const shortcuts = {
  title: 'Genveje',
  destroy() { document.removeEventListener('keydown', this._k, true); },
  async render() {
    let store;
    try { store = await appState('shortcuts', { mac: /Mac|iPhone|iPad/.test(navigator.platform || ''), right: 0, streak: 0, best: 0, known: {} }); } catch (e) { return loadError('Genveje', e); }
    const st = store.data, self = this, root = h('div');
    let q = null, answered = null, mode = 'list';
    const keyOf = (x) => (st.mac ? x[2] : x[1]);
    const next = () => { const pool = B.SHORTCUTS.filter(x => !st.known[x[0]]); const src = pool.length ? pool : B.SHORTCUTS; q = src[Math.floor(Math.random() * src.length)]; answered = null; draw(); };
    const pressedOk = (c) => c && c.replace(/\s/g, '').toLowerCase() === keyOf(q).replace(/\s/g, '').toLowerCase();
    function draw() {
      const kbd = (s) => h('span', { class: 'gv-keys' }, s.split('+').map(k => h('kbd', null, k || '+')));
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented([{ value: 'list', label: 'Oversigt' }, { value: 'quiz', label: 'Øv dig' }], mode, (v) => { mode = v; if (v === 'quiz') next(); else draw(); }, { label: 'Visning' }),
          segmented([{ value: 'win', label: 'Windows' }, { value: 'mac', label: 'Mac' }], st.mac ? 'mac' : 'win', (v) => { st.mac = v === 'mac'; store.save(); draw(); }, { label: 'System' })),
        mode === 'list' ? h('div', { class: 'gv-list' }, B.SHORTCUTS.map(x => h('div', { class: ['gv-row', st.known[x[0]] && 'is-known'] }, h('span', null, x[0]), kbd(keyOf(x)))))
          : h('div', { class: 'l3-card' }, score(st),
            h('p', { class: 'l3-ask' }, 'Hvilken genvej er', h('b', null, `${q[0]}?`)),
            h('p', { class: 'faint', style: { margin: 0, fontSize: '13px' } }, answered ? '' : 'Tryk tasterne (de fleste virker her) – eller vis svaret.'),
            answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Det er ', kbd(keyOf(q))) : h('button', { class: 'btn', onclick: () => { answered = { ok: false }; mark(st, false, store); draw(); } }, icon('eye'), 'Vis svaret'),
            answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: next }, 'Næste', icon('play')) : null));
    }
    document.removeEventListener('keydown', this._k, true);
    this._k = (e) => {
      if (mode !== 'quiz' || answered || !q || !document.body.contains(root)) return;
      const c = B.combo(e, st.mac); if (!c) return;
      if (!(e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key))) return;
      e.preventDefault(); e.stopPropagation();
      const ok = pressedOk(c); answered = { ok }; mark(st, ok, store); if (ok) st.known[q[0]] = true; store.save(); draw();
    };
    document.addEventListener('keydown', this._k, true);
    draw();
    return page('shortcuts', 'Lær', 'Genveje', 'Bliv hurtigere ved computeren: de vigtigste tastaturgenveje til Windows og Mac – og en øvelse, hvor du trykker dem selv.', root);
  },
};
