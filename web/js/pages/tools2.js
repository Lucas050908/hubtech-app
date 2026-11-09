/** Small tools: Karakterer, Tekstværktøjer, Lykkehjul og hold, Farver og Sparegris (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy, uid } from '../features/appkit.js';
import * as T from '../features/tools2.js';

const page = (id, eyebrow, title, lead, body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), body);
const fmt = (n) => n.toLocaleString('da-DK', { maximumFractionDigits: 2 });

// ── Tekstværktøjer ──
export const textTools = {
  title: 'Tekstværktøjer',
  async render() {
    let store;
    try { store = await appState('texttools', { text: '' }); } catch { store = { data: { text: '' }, save() {} }; }
    const st = store.data;
    const ta = h('textarea', { class: 'textarea tx-in', rows: 14, maxlength: 200000, placeholder: 'Indsæt eller skriv din tekst her …', 'aria-label': 'Din tekst' }); ta.value = st.text || '';
    const stats = h('div', { class: 'tx-stats' }), words = h('div');
    let t = null;
    const draw = () => {
      const s = T.textStats(ta.value);
      h(clear(stats), null, [['Ord', s.words], ['Tegn', s.chars], ['Uden mellemrum', s.charsNoSpace], ['Sætninger', s.sentences], ['Afsnit', s.paragraphs], ['Læsetid', `${s.readMin} min.`]].map(([l, v]) => h('div', null, h('b', null, typeof v === 'number' ? fmt(v) : v), h('small', null, l))));
      h(clear(words), null, s.words ? [h('div', { class: 'tx-lix' }, h('b', null, `LIX ${s.lix}`), h('span', null, T.lixText(s.lix))), h('p', { class: 'faint', style: { fontSize: '13px' } }, `${s.long} lange ord (over 6 bogstaver). LIX = ord pr. sætning + procent lange ord.`),
        h('span', { class: 'field-label' }, 'Mest brugte ord'), h('div', { class: 'wl-tags' }, T.topWords(ta.value).map(([w, n]) => h('span', { class: 'sh-tag' }, w, h('small', { class: 'faint' }, ` ${n}`))))] : h('p', { class: 'faint' }, 'Skriv noget, så kommer tallene her.'));
    };
    ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.text = ta.value.slice(0, 50000); store.save(); draw(); }, 200); });
    const apply = (fn, label) => { ta.value = fn(ta.value); st.text = ta.value; store.save(); draw(); toast(label, { type: 'ok', ms: 1200 }); };
    const tools = [['STORE BOGSTAVER', (x) => x.toUpperCase()], ['små bogstaver', (x) => x.toLowerCase()], ['Stort Forbogstav', T.titleCase], ['Som sætninger', T.sentenceCase], ['Sortér linjer', T.sortLines], ['Fjern dubletter', T.uniqueLines], ['Fjern tomme linjer', (x) => x.split('\n').filter(l => l.trim()).join('\n')], ['Fjern dobbelte mellemrum', (x) => x.replace(/[ \t]+/g, ' ')]];
    draw();
    return page('texttools', 'Værktøj', 'Tekstværktøjer', 'Tæl ord og tegn, find LIX-tallet for din tekst, se de mest brugte ord – og ret store/små bogstaver, sortér og ryd op.',
      h('div', { class: 'ev-wrap' }, panel(null, null, ta, h('div', { class: 'tx-tools' }, tools.map(([l, fn]) => h('button', { class: 'btn btn-sm', onclick: () => apply(fn, 'Ændret') }, l)),
        h('button', { class: 'btn btn-sm', onclick: () => copy(ta.value, 'Teksten er kopieret') }, icon('copy'), 'Kopiér'), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { ta.value = ''; st.text = ''; store.save(); draw(); } }, 'Ryd'))),
        h('div', { class: 'stack' }, stats, panel('Hvor svær er teksten?', 'book', words))));
  },
};

// ── Farver ──
export const colors = {
  title: 'Farver',
  async render() {
    let store;
    try { store = await appState('colors', { color: '#3b82f6', fg: '#ffffff', saved: [] }); } catch { store = { data: { color: '#3b82f6', fg: '#ffffff', saved: [] }, save() {} }; }
    const st = store.data, root = h('div');
    let kind = 'shades';
    function draw() {
      const rgb = T.hexToRgb(st.color) || [59, 130, 246], hsl = T.rgbToHsl(...rgb), ratio = T.contrast(st.fg, st.color), w = T.wcag(ratio);
      const pick = h('input', { type: 'color', value: st.color, 'aria-label': 'Vælg farve', class: 'co-pick' });
      pick.addEventListener('input', () => { st.color = pick.value; store.save(); draw(); });
      const hexIn = h('input', { class: 'input', value: st.color, maxlength: 7, 'aria-label': 'Hex-kode', style: { width: '110px' } });
      hexIn.addEventListener('change', () => { if (T.hexToRgb(hexIn.value)) { st.color = T.rgbToHex(...T.hexToRgb(hexIn.value)); store.save(); draw(); } else toast('Ugyldig farvekode', { type: 'warn' }); });
      const sw = (c) => h('button', { class: 'co-sw', style: { background: c }, 'aria-label': `Brug ${c}`, title: `${c} – tryk for at kopiere`, onclick: () => copy(c, `${c} er kopieret`) }, h('span', null, c));
      const fgPick = h('input', { type: 'color', value: st.fg, 'aria-label': 'Tekstfarve' });
      fgPick.addEventListener('input', () => { st.fg = fgPick.value; store.save(); draw(); });
      h(clear(root), null, h('div', { class: 'ev-wrap' },
        h('div', { class: 'stack' },
          panel('Farve', 'paint', h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, pick, hexIn, h('button', { class: 'btn btn-sm', onclick: () => { if (!st.saved.includes(st.color)) { st.saved.unshift(st.color); st.saved = st.saved.slice(0, 24); store.save(); draw(); } } }, icon('plus'), 'Gem')),
            h('div', { class: 'co-codes' }, [['HEX', st.color], ['RGB', `rgb(${rgb.join(', ')})`], ['HSL', `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`]].map(([l, v]) => h('button', { class: 'co-code', onclick: () => copy(v, `${v} er kopieret`) }, h('small', null, l), h('code', null, v), icon('copy'))))),
          panel('Farveskemaer', 'grid', segmented([['shades', 'Nuancer'], ['complement', 'Modsat'], ['analog', 'Naboer'], ['triad', 'Trekant'], ['split', 'Delt modsat']].map(([v, l]) => ({ value: v, label: l })), kind, (v) => { kind = v; draw(); }, { label: 'Skema' }),
            h('div', { class: 'co-pal' }, T.palette(st.color, kind).map(sw))),
          st.saved.length ? panel('Gemte farver', 'heart', h('div', { class: 'co-pal small' }, st.saved.map(sw)), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { st.saved = []; store.save(); draw(); } }, 'Ryd')) : null),
        panel('Kan teksten læses?', 'eye', h('div', { class: 'co-preview', style: { background: st.color, color: st.fg } }, h('b', null, 'Overskrift'), h('p', null, 'Sådan ser almindelig tekst ud på baggrunden.')),
          h('div', { class: 'row', style: { gap: '8px', alignItems: 'center', margin: '10px 0' } }, h('span', null, 'Tekstfarve'), fgPick, h('button', { class: 'btn btn-sm', onclick: () => { st.fg = T.contrast('#000000', st.color) > T.contrast('#ffffff', st.color) ? '#000000' : '#ffffff'; store.save(); draw(); } }, 'Vælg bedste')),
          h('div', { class: 'co-ratio' }, h('b', null, `${fmt(ratio)} : 1`), h('div', { class: 'co-checks' }, [['AA (normal tekst)', w.aa], ['AA (stor tekst)', w.aaLarge], ['AAA', w.aaa]].map(([l, ok]) => h('span', { class: ['chip', ok ? 'chip-ok' : 'chip-bad'] }, ok ? '✓ ' : '✗ ', l)))),
          h('p', { class: 'faint', style: { fontSize: '13px' } }, 'Kontrast på mindst 4,5 : 1 gør tekst læsbar for de fleste – også folk med nedsat syn.'))));
    }
    draw();
    return page('colors', 'Værktøj', 'Farver', 'Vælg farver, få farvekoder, lav farveskemaer – og tjek om din tekst kan læses på baggrunden.', root);
  },
};

// ── Sparegris ──
export const piggy = {
  title: 'Sparegris',
  async render() {
    let store;
    try { store = await appState('piggy', { goals: [] }); } catch (e) { return loadError('Sparegris', e); }
    const st = store.data, root = h('div');
    const kr = (n) => `${fmt(n)} kr.`;
    function draw() {
      const name = h('input', { class: 'input', maxlength: 40, placeholder: 'Hvad sparer du op til?', 'aria-label': 'Sparemål' });
      const goal = h('input', { class: 'input', type: 'number', min: 1, placeholder: 'Beløb', 'aria-label': 'Beløb i kr.', style: { width: '120px' } });
      const weekly = h('input', { class: 'input', type: 'number', min: 0, placeholder: 'Pr. uge', 'aria-label': 'Sparer pr. uge', style: { width: '110px' } });
      h(clear(root), null,
        panel('Nyt sparemål', 'plus', h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, name, goal, weekly, h('button', { class: 'btn btn-primary', onclick: () => {
          if (!name.value.trim() || !(Number(goal.value) > 0)) return toast('Skriv hvad og hvor meget', { type: 'warn' });
          st.goals.unshift({ id: uid(), name: name.value.trim(), goal: Number(goal.value), weekly: Number(weekly.value) || 0, saved: 0, log: [] }); store.save(); draw();
        } }, icon('plus'), 'Tilføj'))),
        st.goals.length ? h('div', { class: 'pg2-list' }, st.goals.map(g => {
          const pct = Math.min(100, Math.round(g.saved / g.goal * 100)), wk = T.weeksToGoal(g.saved, g.goal, g.weekly);
          const amt = h('input', { class: 'input', type: 'number', placeholder: 'kr.', 'aria-label': `Beløb til ${g.name}`, style: { width: '100px' } });
          const add = (sign) => { const v = Number(amt.value); if (!(v > 0)) return amt.focus(); g.saved = Math.max(0, g.saved + sign * v); g.log.unshift({ at: Date.now(), v: sign * v }); g.log = g.log.slice(0, 30); store.save(); if (sign > 0 && g.saved >= g.goal) toast(`Du har nået målet: ${g.name}! 🎉`, { type: 'xp' }); draw(); };
          return h('div', { class: ['pg2-goal', pct >= 100 && 'is-done'] },
            h('div', { class: 'pg2-pig', style: { '--p': pct } }, h('span', null, pct >= 100 ? '🎉' : '🐷'), h('b', null, `${pct}%`)),
            h('div', { class: 'pg2-b' }, h('div', { class: 'row', style: { justifyContent: 'space-between', gap: '8px' } }, h('b', null, g.name), h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${g.name}`, onclick: async () => { if (await confirmDialog({ title: `Slet “${g.name}”?`, confirmLabel: 'Slet', danger: true })) { st.goals = st.goals.filter(x => x !== g); store.save(); draw(); } } }, icon('trash'))),
              h('div', { class: 'ch-prog' }, h('i', { style: { width: `${pct}%` } })),
              h('span', { class: 'faint' }, `${kr(g.saved)} af ${kr(g.goal)}`, wk === 0 ? ' · nået!' : wk ? ` · ca. ${wk} ${wk === 1 ? 'uge' : 'uger'} mere med ${kr(g.weekly)} om ugen` : ''),
              h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } }, amt, h('button', { class: 'btn btn-sm btn-primary', onclick: () => add(1) }, icon('plus'), 'Sæt ind'), h('button', { class: 'btn btn-sm', onclick: () => add(-1) }, 'Tag ud'))));
        })) : h('div', { class: 'sh-empty' }, h('span', { class: 'qz-big' }, '🐷'), h('b', null, 'Ingen sparemål endnu'), h('span', { class: 'faint' }, 'En ny cykel, et spil, en tur? Skriv det, hvad det koster, og hvor meget du kan spare om ugen.')));
    }
    draw();
    return page('piggy', 'For dig', 'Sparegris', 'Sæt sparemål, sæt penge ind og se hvor længe der er til – grisen bliver fyldt op, efterhånden som du sparer.', root);
  },
};
