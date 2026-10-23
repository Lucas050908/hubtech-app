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

// ── Karakterer ──
export const grades = {
  title: 'Karakterer',
  async render() {
    let store;
    try { store = await appState('grades', { sets: [{ id: uid(), name: 'Mine karakterer', rows: [{ subject: 'Dansk', grade: 7, weight: 1 }, { subject: 'Matematik', grade: 10, weight: 1 }] }], cur: 0, target: 7 }); } catch (e) { return loadError('Karakterer', e); }
    const st = store.data, root = h('div');
    function draw() {
      const set = st.sets[st.cur] || st.sets[0], avg = T.average(set.rows);
      const need = T.needed(set.rows, Number(st.target) || 7, 1);
      const rows = h('div', { class: 'gr-rows' }, set.rows.map((r, i) => {
        const sub = h('input', { class: 'input', value: r.subject, maxlength: 40, placeholder: 'Fag', 'aria-label': `Fag ${i + 1}` });
        sub.addEventListener('input', () => { r.subject = sub.value; store.save(); });
        const grade = h('select', { class: 'select', 'aria-label': `Karakter ${i + 1}` }, T.SCALE.map(g => h('option', { value: g, selected: g === Number(r.grade) }, `${g}`)));
        grade.addEventListener('change', () => { r.grade = Number(grade.value); store.save(); draw(); });
        const w = h('input', { class: 'input', type: 'number', min: 0.1, max: 30, step: 0.1, value: r.weight, 'aria-label': `Vægt ${i + 1}`, style: { width: '80px' } });
        w.addEventListener('change', () => { r.weight = Number(w.value) || 1; store.save(); draw(); });
        return h('div', { class: 'gr-row' }, sub, grade, w, h('span', { class: 'faint gr-ects' }, T.ECTS[r.grade]), h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fjern fag', onclick: () => { set.rows.splice(i, 1); store.save(); draw(); } }, icon('x')));
      }));
      const tIn = h('select', { class: 'select', 'aria-label': 'Mål', style: { width: 'auto' } }, [4, 5, 6, 7, 8, 9, 10, 11, 12].map(v => h('option', { value: v, selected: v === Number(st.target) }, `${v}`)));
      tIn.addEventListener('change', () => { st.target = Number(tIn.value); store.save(); draw(); });
      h(clear(root), null, h('div', { class: 'ev-wrap' },
        panel(null, null,
          h('div', { class: 'row', style: { gap: '8px', marginBottom: '10px', flexWrap: 'wrap' } },
            h('select', { class: 'select', 'aria-label': 'Karaktersæt', style: { width: 'auto' }, onchange: (e) => { st.cur = Number(e.target.value); store.save(); draw(); } }, st.sets.map((s, i) => h('option', { value: i, selected: i === st.cur }, s.name))),
            h('button', { class: 'btn btn-sm', onclick: () => { st.sets.push({ id: uid(), name: `Sæt ${st.sets.length + 1}`, rows: [] }); st.cur = st.sets.length - 1; store.save(); draw(); } }, icon('plus'), 'Nyt sæt'),
            (() => { const n = h('input', { class: 'input', value: set.name, maxlength: 40, 'aria-label': 'Navn på sættet', style: { flex: 1 } }); n.addEventListener('change', () => { set.name = n.value || 'Karakterer'; store.save(); draw(); }); return n; })()),
          h('div', { class: 'gr-row gr-head' }, h('span', null, 'Fag'), h('span', null, 'Karakter'), h('span', null, 'Vægt'), h('span'), h('span')),
          rows, h('button', { class: 'btn btn-sm', style: { marginTop: '8px' }, onclick: () => { set.rows.push({ subject: '', grade: 7, weight: 1 }); store.save(); draw(); root.querySelectorAll('.gr-row input')[set.rows.length * 2 - 2]?.focus(); } }, icon('plus'), 'Tilføj fag')),
        h('div', { class: 'stack' },
          h('div', { class: 'gr-avg' }, h('small', null, 'Gennemsnit'), h('b', null, avg == null ? '–' : fmt(avg)), avg != null ? h('span', { class: 'faint' }, T.GRADE_TEXT[T.SCALE.reduce((a, g) => (Math.abs(g - avg) < Math.abs(a - avg) ? g : a), 12)]) : null),
          panel('Hvad skal jeg have?', 'target', h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', null, 'For at få'), tIn, h('span', null, 'i snit skal næste fag (vægt 1) være mindst')),
            h('p', { class: 'gr-need' }, need == null ? 'Det kan desværre ikke nås med ét fag mere.' : h('b', null, `${need}`))),
          panel('7-trinsskalaen', 'list', h('dl', { class: 'gr-scale' }, T.SCALE.map(g => [h('dt', null, `${g} (${T.ECTS[g]})`), h('dd', null, T.GRADE_TEXT[g])]))))));
    }
    draw();
    return page('grades', 'Skole', 'Karakterer', 'Regn dit gennemsnit på 7-trinsskalaen med vægte – og se hvad du skal have i næste fag for at nå dit mål.', root);
  },
};

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

// ── Lykkehjul og hold ──
export const wheel = {
  title: 'Lykkehjul',
  destroy() { cancelAnimationFrame(this._raf); },
  async render() {
    let store;
    try { store = await appState('wheel', { lists: [{ name: 'Klassen', items: ['Anna', 'Bo', 'Carl', 'Dina', 'Emil', 'Freja'] }], cur: 0, removeWinner: false }); } catch (e) { return loadError('Lykkehjul', e); }
    const st = store.data, self = this, root = h('div');
    const COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6'];
    let angle = 0, spinning = false, result = null, mode = 'wheel';
    const canvas = h('canvas', { class: 'wh-canvas', width: 520, height: 520, 'aria-label': 'Lykkehjul' });
    const list = () => st.lists[st.cur] || st.lists[0];
    function paint() {
      const items = list().items.filter(Boolean), ctx = canvas.getContext('2d'), R = 250, cx = 260, cy = 260, n = Math.max(1, items.length);
      ctx.clearRect(0, 0, 520, 520);
      items.forEach((it, i) => {
        const a0 = angle + (i / n) * Math.PI * 2, a1 = angle + ((i + 1) / n) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill(); ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((a0 + a1) / 2); ctx.textAlign = 'right'; ctx.fillStyle = '#111827'; ctx.font = `700 ${n > 16 ? 14 : 20}px system-ui`; ctx.fillText(it.slice(0, 18), R - 18, 7); ctx.restore();
      });
      ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fillStyle = '#0b1020'; ctx.fill();
    }
    function spin() {
      const items = list().items.filter(Boolean); if (items.length < 2 || spinning) return;
      spinning = true; result = null; drawResult();
      const start = angle, total = Math.PI * 2 * (5 + Math.random() * 3) + Math.random() * Math.PI * 2, dur = 4200, t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - (1 - p) ** 3; angle = start + total * e; paint();
        if (p < 1) { self._raf = requestAnimationFrame(step); return; }
        spinning = false;
        const n = items.length, a = ((-Math.PI / 2 - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);   // the pointer is at the top
        result = items[Math.floor(a / (Math.PI * 2) * n) % n]; drawResult();
        if (st.removeWinner) { const L = list(); L.items = L.items.filter(x => x !== result); store.save(); setTimeout(() => { drawEditor(); paint(); }, 1500); }
      };
      self._raf = requestAnimationFrame(step);
    }
    const resultBox = h('div', { class: 'wh-result' });
    const drawResult = () => h(clear(resultBox), null, result ? [h('small', null, 'Hjulet valgte'), h('b', null, result)] : spinning ? h('span', { class: 'faint' }, 'Hjulet drejer …') : null);
    const editor = h('div');
    function drawEditor() {
      const L = list(), ta = h('textarea', { class: 'textarea', rows: 10, 'aria-label': 'Navne – ét pr. linje' }); ta.value = L.items.join('\n');
      ta.addEventListener('input', () => { L.items = ta.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 100); store.save(); paint(); });
      h(clear(editor), null, h('div', { class: 'row', style: { gap: '6px', marginBottom: '8px', flexWrap: 'wrap' } },
        h('select', { class: 'select', 'aria-label': 'Liste', style: { width: 'auto' }, onchange: (e) => { st.cur = Number(e.target.value); store.save(); drawEditor(); paint(); } }, st.lists.map((l, i) => h('option', { value: i, selected: i === st.cur }, l.name))),
        h('button', { class: 'btn btn-sm', onclick: () => { st.lists.push({ name: `Liste ${st.lists.length + 1}`, items: [] }); st.cur = st.lists.length - 1; store.save(); drawEditor(); paint(); } }, icon('plus'), 'Ny liste'),
        (() => { const n = h('input', { class: 'input', value: L.name, maxlength: 30, 'aria-label': 'Navn på listen', style: { flex: 1, minWidth: '100px' } }); n.addEventListener('change', () => { L.name = n.value || 'Liste'; store.save(); drawEditor(); }); return n; })()),
        h('span', { class: 'field-label' }, 'Én pr. linje'), ta,
        h('label', { class: 'cal-pcheck' }, h('input', { type: 'checkbox', checked: st.removeWinner, onchange: (e) => { st.removeWinner = e.target.checked; store.save(); } }), h('span', null, 'Fjern den valgte bagefter')));
    }
    function teamsView() {
      let n = 2, bySize = false, out = [];
      const box = h('div');
      const draw = () => h(clear(box), null,
        h('div', { class: 'row', style: { gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, segmented([{ value: 'n', label: 'Antal hold' }, { value: 's', label: 'Personer pr. hold' }], bySize ? 's' : 'n', (v) => { bySize = v === 's'; draw(); }, { label: 'Del op efter' }),
          (() => { const i = h('input', { class: 'input', type: 'number', min: 1, max: 30, value: n, 'aria-label': bySize ? 'Personer pr. hold' : 'Antal hold', style: { width: '80px' } }); i.addEventListener('change', () => { n = Math.max(1, Number(i.value) || 2); }); return i; })(),
          h('button', { class: 'btn btn-primary', onclick: () => { const items = list().items.filter(Boolean); if (items.length < 2) return toast('Skriv mindst to navne', { type: 'warn' }); out = bySize ? T.teamsOfSize(items, n) : T.teams(items, n); draw(); } }, icon('users'), 'Lav hold')),
        out.length ? h('div', { class: 'wh-teams' }, out.map((t, i) => h('div', { class: 'wh-team', style: { '--c': COLORS[i % COLORS.length] } }, h('b', null, `Hold ${i + 1}`), h('ul', null, t.map(x => h('li', null, x)))))) : null,
        out.length ? h('button', { class: 'btn btn-sm', onclick: () => copy(out.map((t, i) => `Hold ${i + 1}: ${t.join(', ')}`).join('\n'), 'Holdene er kopieret') }, icon('copy'), 'Kopiér holdene') : null);
      draw(); return box;
    }
    function draw() {
      h(clear(root), null, h('div', { class: 'cmd-filters', style: { marginBottom: '12px' } }, segmented([{ value: 'wheel', label: 'Lykkehjul', icon: 'refresh' }, { value: 'teams', label: 'Del i hold', icon: 'users' }], mode, (v) => { mode = v; draw(); }, { label: 'Visning' })),
        h('div', { class: 'ev-wrap' },
          mode === 'wheel' ? panel(null, null, h('div', { class: 'wh-stage' }, h('div', { class: 'wh-pointer' }), canvas), h('div', { class: 'row', style: { justifyContent: 'center', gap: '10px', marginTop: '10px' } }, h('button', { class: 'btn btn-primary btn-lg', onclick: spin }, icon('refresh'), 'Drej hjulet')), resultBox) : panel('Hold', 'users', teamsView()),
          panel('Navne', 'list', editor)));
      drawEditor(); paint(); drawResult();
    }
    canvas.addEventListener('click', spin);
    draw();
    return page('wheel', 'Værktøj', 'Lykkehjul', 'Lad hjulet vælge: hvem starter, hvem skal læse op, hvad skal vi spise? Eller del klassen i retfærdige hold med ét tryk.', root);
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
