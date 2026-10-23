/**
 * Banko – the Danish bingo. Print plates (3 rows × 9 columns, 5 numbers per row, 1–90) and let HUBTECH call the numbers –
 * with a voice, the board of called numbers, and a check if someone shouts "banko!".
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { plate, fullRows } from '../features/arcade2.js';

const SAY = (n) => { try { const u = new SpeechSynthesisUtterance(String(n)); u.lang = 'da-DK'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* */ } };

export default {
  title: 'Banko',
  destroy() { clearInterval(this._iv); try { speechSynthesis.cancel(); } catch { /* */ } },
  async render() {
    const app = appById('banko');
    let store;
    try { store = await appState('banko', { called: [], voice: true, auto: 0, plates: [] }); } catch (e) { return loadError('Banko', e); }
    const st = store.data, self = this, root = h('div');
    let mode = 'call';
    const call = () => {
      const left = []; for (let n = 1; n <= 90; n++) if (!st.called.includes(n)) left.push(n);
      if (!left.length) { toast('Alle tal er trukket', { type: 'info' }); return; }
      const n = left[Math.floor(Math.random() * left.length)]; st.called.push(n); store.save(); if (st.voice) SAY(n); draw();
    };
    const setAuto = (secs) => { st.auto = secs; store.save(); clearInterval(self._iv); if (secs) self._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); if (mode === 'call') call(); }, secs * 1000); draw(); };
    function caller() {
      const set = new Set(st.called), last = st.called.at(-1);
      const checkIn = h('input', { class: 'input', placeholder: 'Plade-nr. eller tal adskilt af mellemrum', 'aria-label': 'Tjek en plade' });
      const checkOut = h('div');
      const check = () => {
        const v = checkIn.value.trim(), idx = /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= st.plates.length ? Number(v) - 1 : null;
        if (idx != null) { const rows = fullRows(st.plates[idx], set); h(clear(checkOut), null, h('p', { class: rows ? 'ok' : '' }, rows ? `Plade ${idx + 1} har ${rows} fulde ${rows === 1 ? 'række' : 'rækker'}! ✓` : `Plade ${idx + 1} har ingen fulde rækker endnu.`)); return; }
        const nums = v.split(/[\s,]+/).map(Number).filter(n => n >= 1 && n <= 90), miss = nums.filter(n => !set.has(n));
        h(clear(checkOut), null, h('p', null, nums.length ? (miss.length ? `Ikke trukket: ${miss.join(', ')}` : 'Alle de tal er trukket ✓') : 'Skriv tallene eller et plade-nummer.'));
      };
      checkIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      return h('div', { class: 'ev-wrap' },
        h('div', { class: 'stack' },
          h('div', { class: 'bk3-ball' }, last ? h('b', null, String(last)) : h('span', null, '?'), h('small', null, `${st.called.length} af 90 trukket`)),
          h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, h('button', { class: 'btn btn-primary btn-lg', onclick: call }, icon('play'), 'Træk et tal'),
            h('button', { class: 'btn', onclick: () => last && SAY(last) }, 'Sig igen'),
            h('button', { class: 'btn btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Start forfra?', text: 'Alle trukne tal nulstilles.', confirmLabel: 'Start forfra' })) { st.called = []; store.save(); setAuto(0); } } }, icon('refresh'), 'Forfra')),
          h('div', { class: 'row', style: { gap: '10px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' } },
            h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: st.voice, onchange: (e) => { st.voice = e.target.checked; store.save(); } }), h('span', null, 'Læs tallene op')),
            segmented([{ value: '0', label: 'Manuelt' }, { value: '8', label: 'Auto 8 s' }, { value: '15', label: 'Auto 15 s' }], String(st.auto), (v) => setAuto(Number(v)), { label: 'Tempo' })),
          panel('Tjek en plade', 'check', h('div', { class: 'row', style: { gap: '6px' } }, checkIn, h('button', { class: 'btn', onclick: check }, 'Tjek')), checkOut)),
        panel('Trukne tal', 'grid', h('div', { class: 'bk3-board' }, Array.from({ length: 90 }, (_, i) => h('span', { class: ['bk3-n', set.has(i + 1) && 'on', last === i + 1 && 'last'] }, String(i + 1)))),
          st.called.length ? h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Seneste: ', st.called.slice(-8).reverse().join(' · ')) : null));
    }
    function plates() {
      const count = h('input', { class: 'input', type: 'number', min: 1, max: 60, value: Math.max(6, st.plates.length || 6), 'aria-label': 'Antal plader', style: { width: '90px' } });
      return h('div', { class: 'stack' },
        h('div', { class: 'row', style: { gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, h('span', null, 'Antal plader'), count, h('button', { class: 'btn btn-primary', onclick: () => { st.plates = Array.from({ length: Math.max(1, Math.min(60, Number(count.value) || 6)) }, () => plate()); store.save(); draw(); } }, icon('refresh'), 'Lav nye plader'),
          st.plates.length ? h('button', { class: 'btn', onclick: () => window.print() }, icon('printer'), 'Udskriv') : null),
        st.plates.length ? h('div', { class: 'bk3-plates' }, st.plates.map((p, i) => h('div', { class: 'bk3-plate' }, h('small', null, `Plade ${i + 1}`), h('div', { class: 'bk3-grid' }, p.flat().map(v => h('span', { class: v == null ? 'blank' : '' }, v == null ? '' : String(v)))))))
          : h('p', { class: 'faint' }, 'Lav plader og udskriv dem – eller vis dem på telefonen. Hver plade har et nummer, så du kan tjekke den.'));
    }
    function draw() {
      h(clear(root), null, h('div', { class: 'cmd-filters', style: { marginBottom: '12px' } }, segmented([{ value: 'call', label: 'Opråber', icon: 'play' }, { value: 'plates', label: 'Plader', icon: 'grid' }], mode, (v) => { mode = v; draw(); }, { label: 'Visning' })),
        mode === 'call' ? caller() : plates());
    }
    draw(); if (st.auto) setAuto(st.auto);
    return h('div', { class: 'page bk3-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spil sammen', title: 'Banko', lead: 'Det klassiske danske banko til familien, klassen eller foreningen: lav og udskriv plader, og lad HUBTECH råbe tallene op.', compact: true }), root);
  },
};
