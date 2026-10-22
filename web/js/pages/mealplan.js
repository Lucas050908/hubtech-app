/**
 * Madplan – plan the week's dinners, keep your recipes, and get the shopping list made for you
 * (amounts added up and scaled to the number of people, sorted by where things are in the shop).
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy } from '../features/appkit.js';
import { printDocument, esc } from '../features/printing.js';
import * as M from '../features/mealplan.js';
import { STARTER_RECIPES } from '../data/recipes.js';

const AISLE_ORDER = ['Frugt og grønt', 'Kød og fisk', 'Mejeri og æg', 'Brød og kolonial', 'Andet'];

export default {
  title: 'Madplan',
  async render(ctx) {
    const app = appById('mealplan');
    let store;
    try { store = await appState('mealplan', { recipes: null, plan: {}, extras: {}, checked: {}, people: 4 }); } catch (e) { return loadError('Madplan', e); }
    const st = store.data;
    if (!Array.isArray(st.recipes)) { st.recipes = structuredClone(STARTER_RECIPES); store.save(); }      // start with a few everyday dishes
    st.plan = st.plan || {}; st.extras = st.extras || {}; st.checked = st.checked || {};
    let tab = ['week', 'shop', 'recipes'].includes(ctx?.params?.sub) ? ctx.params.sub : 'week';
    let week = M.weekStart();
    const body = h('div', { class: 'stack' });
    const plan = () => st.plan[week] || (st.plan[week] = {});
    const recipe = (id) => st.recipes.find(r => r.id === id);
    const dateLabel = (i) => new Date(...(([y, m, d]) => [y, m - 1, d])(M.addDays(week, i).split('-').map(Number))).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
    const weekNav = () => h('div', { class: 'mp-weeknav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Forrige uge', onclick: () => { week = M.addDays(week, -7); open(tab); } }, icon('chevronLeft')),
      h('div', null, h('b', null, `Uge ${M.weekNo(week)}`), h('span', { class: 'faint' }, `${dateLabel(0)} – ${dateLabel(6)}`)),
      h('button', { class: 'icon-btn', 'aria-label': 'Næste uge', onclick: () => { week = M.addDays(week, 7); open(tab); } }, icon('chevronRight')),
      week !== M.weekStart() ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { week = M.weekStart(); open(tab); } }, 'Denne uge') : null);

    // ── the week ──
    function weekTab() {
      const p = plan(), today = M.weekStart() === week ? (new Date().getDay() + 6) % 7 : -1;
      const sorted = [...st.recipes].sort((a, b) => a.name.localeCompare(b.name, 'da'));
      const days = M.DAYS.map((d, i) => {
        const cur = p[i], r = cur && recipe(cur.id);
        const sel = h('select', { class: 'select', 'aria-label': `Ret til ${d.toLowerCase()}` },
          h('option', { value: '' }, '– Intet planlagt –'), sorted.map(x => h('option', { value: x.id, selected: x.id === cur?.id }, x.name)));
        sel.addEventListener('change', () => { if (sel.value) p[i] = { id: sel.value, servings: cur?.servings || st.people || 4 }; else delete p[i]; store.save(); open('week'); });
        const people = cur ? h('div', { class: 'mp-people' },
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Færre personer', disabled: cur.servings <= 1, onclick: () => { cur.servings--; store.save(); open('week'); } }, icon('minus')),
          h('span', null, `${cur.servings} pers.`),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Flere personer', disabled: cur.servings >= 30, onclick: () => { cur.servings++; store.save(); open('week'); } }, icon('plus'))) : null;
        return h('div', { class: ['mp-day', i === today && 'is-today', !r && 'is-empty'] },
          h('div', { class: 'mp-day-h' }, h('b', null, d), h('span', { class: 'faint' }, i === today ? 'I dag' : dateLabel(i))),
          sel,
          r ? h('button', { class: 'mp-dish', onclick: () => showRecipe(r, cur.servings) }, h('span', null, r.name), h('span', { class: 'faint' }, `${r.minutes ? `${r.minutes} min. · ` : ''}se opskrift`)) : null,
          h('div', { class: 'mp-day-f' }, people,
            h('button', { class: 'btn btn-sm btn-ghost', title: 'Vælg en tilfældig ret', 'aria-label': `Tilfældig ret ${d.toLowerCase()}`, onclick: () => {
              const pool = st.recipes.filter(x => x.id !== cur?.id); if (!pool.length) return;
              p[i] = { id: pool[Math.floor(Math.random() * pool.length)].id, servings: cur?.servings || st.people || 4 }; store.save(); open('week');
            } }, icon('refresh'))));
      });
      const filled = Object.keys(p).length;
      return [weekNav(),
        h('div', { class: 'row-actions', style: { marginTop: 0 } },
          h('button', { class: 'btn btn-primary', disabled: filled >= 7 || !st.recipes.length, onclick: () => { st.plan[week] = M.fillWeek(st.recipes, p, Math.random, st.people || 4); store.save(); open('week'); } }, icon('sparkles'), 'Fyld de tomme dage'),
          filled ? h('button', { class: 'btn', onclick: () => open('shop') }, icon('list'), 'Indkøbsliste') : null,
          filled ? h('button', { class: 'btn btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Ryd ugen?', text: 'Alle retter i ugen fjernes fra planen.', confirmLabel: 'Ryd' })) { st.plan[week] = {}; store.save(); open('week'); } } }, icon('trash'), 'Ryd ugen') : null,
          h('label', { class: 'mp-default' }, h('span', { class: 'faint' }, 'Normalt'), (() => {
            const s = h('select', { class: 'select', 'aria-label': 'Antal personer som udgangspunkt' }, [1, 2, 3, 4, 5, 6, 8].map(n => h('option', { value: n, selected: n === (st.people || 4) }, `${n} pers.`)));
            s.addEventListener('change', () => { st.people = Number(s.value); store.save(); }); return s;
          })())),
        h('div', { class: 'mp-week' }, days)];
    }

    // ── the shopping list ──
    function shopTab() {
      const items = M.shoppingList(st.recipes, plan());
      const checked = st.checked[week] || (st.checked[week] = {});
      const extras = st.extras[week] || (st.extras[week] = []);
      const toggle = (key) => { checked[key] = !checked[key]; if (!checked[key]) delete checked[key]; store.save(); open('shop'); };
      const line = (key, text, extra) => h('label', { class: ['mp-item', checked[key] && 'is-done'] },
        h('input', { type: 'checkbox', checked: !!checked[key], onchange: () => toggle(key) }), h('span', null, text), extra || null);
      const groups = AISLE_ORDER.map(a => [a, items.filter(x => x.aisle === a && !x.pantry)]).filter(([, l]) => l.length);
      const pantry = items.filter(x => x.pantry);
      const add = h('input', { class: 'input', placeholder: 'Tilføj noget, fx kaffe eller toiletpapir', 'aria-label': 'Tilføj vare', maxlength: 80 });
      const addIt = () => { const v = add.value.trim(); if (!v) return; extras.push(v); store.save(); open('shop'); };
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter') addIt(); });
      const left = items.filter(x => !x.pantry && !checked[x.key]).length + extras.filter((_, i) => !checked[`x${i}|${extras[i]}`]).length;
      const asText = () => [`Indkøb uge ${M.weekNo(week)}`, ...groups.flatMap(([a, l]) => [``, a.toUpperCase(), ...l.filter(x => !checked[x.key]).map(x => `- ${x.text}`)]),
        ...(extras.length ? ['', 'ANDET', ...extras.filter((x, i) => !checked[`x${i}|${x}`]).map(x => `- ${x}`)] : [])].join('\n');
      const print = () => printDocument({ title: `Indkøbsliste uge ${M.weekNo(week)}`, accent: '#be185d',
        css: '.cols{columns:2;column-gap:10mm}.grp{break-inside:avoid;margin-bottom:5mm}.grp h2{font-size:11pt;margin-bottom:2mm;color:#be185d}.it{display:flex;gap:3mm;padding:1.2mm 0;border-bottom:.5pt solid #e5e7eb}.box{width:3.5mm;height:3.5mm;border:1pt solid #6b7280;border-radius:.8mm;flex:none;margin-top:.6mm}.from{color:#6b7280;font-size:8pt}',
        body: `<div class="p-head"><div><h1>Indkøbsliste</h1><div class="p-sub">Uge ${M.weekNo(week)} · ${esc(dateLabel(0))} – ${esc(dateLabel(6))}</div></div><div class="p-brand">Madplan<b>HUBTECH</b></div></div><div class="cols">${
          groups.map(([a, l]) => `<div class="grp"><h2>${esc(a)}</h2>${l.filter(x => !checked[x.key]).map(x => `<div class="it"><span class="box"></span><span>${esc(x.text)}</span></div>`).join('')}</div>`).join('')
        }${extras.length ? `<div class="grp"><h2>Andet</h2>${extras.map(x => `<div class="it"><span class="box"></span><span>${esc(x)}</span></div>`).join('')}</div>` : ''}</div>` });
      return [weekNav(),
        items.length || extras.length ? h('div', { class: 'row-actions', style: { marginTop: 0 } },
          h('span', { class: 'chip' }, `${left} ting mangler`),
          h('button', { class: 'btn btn-sm', onclick: () => copy(asText(), 'Listen er kopieret') }, icon('copy'), 'Kopiér'),
          h('button', { class: 'btn btn-sm', onclick: print }, icon('printer'), 'Udskriv'),
          Object.keys(checked).length ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { st.checked[week] = {}; store.save(); open('shop'); } }, icon('refresh'), 'Fjern flueben') : null) : null,
        items.length ? h('div', { class: 'mp-shop' }, groups.map(([a, l]) => panel(a, null, h('div', { class: 'mp-items' }, l.map(x => line(x.key, x.text, h('small', { class: 'faint' }, x.from.join(', ')))))))) :
          h('p', { class: 'faint' }, 'Der er ingen retter i ugens plan endnu. Vælg dem under Ugeplan, så laver listen sig selv.'),
        pantry.length ? panel('Har du det i skabet?', 'box', h('div', { class: 'mp-items' }, pantry.map(x => line(x.key, x.text)))) : null,
        panel('Andet', 'plus', h('div', { class: 'mp-items' }, extras.map((x, i) => line(`x${i}|${x}`, x, h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${x}`, onclick: (e) => { e.preventDefault(); extras.splice(i, 1); store.save(); open('shop'); } }, icon('x'))))),
          h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, add, h('button', { class: 'btn', onclick: addIt }, icon('plus'), 'Tilføj')))];
    }

    // ── recipes ──
    function recipesTab() {
      let q = '';
      const list = h('div', { class: 'mp-recipes' });
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i opskrifter', 'aria-label': 'Søg i opskrifter' });
      const draw = () => {
        const t = q.toLowerCase();
        const shown = st.recipes.filter(r => !t || r.name.toLowerCase().includes(t) || (r.tags || []).some(x => x.toLowerCase().includes(t)) || r.ingredients.some(x => x.toLowerCase().includes(t)))
          .sort((a, b) => a.name.localeCompare(b.name, 'da'));
        h(clear(list), null, shown.length ? shown.map(r => h('button', { class: 'mp-recipe', onclick: () => showRecipe(r) },
          h('b', null, r.name), h('span', { class: 'faint' }, [`${r.servings} pers.`, r.minutes ? `${r.minutes} min.` : null, `${r.ingredients.length} ingredienser`].filter(Boolean).join(' · ')),
          (r.tags || []).length ? h('span', { class: 'mp-tags' }, r.tags.map(x => h('span', { class: 'chip' }, x))) : null)) : h('p', { class: 'faint' }, 'Ingen opskrifter fundet.'));
      };
      search.addEventListener('input', () => { q = search.value.trim(); draw(); });
      draw();
      return [h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, search, h('button', { class: 'btn btn-primary', onclick: () => editRecipe(null) }, icon('plus'), 'Ny opskrift')), list];
    }
    function showRecipe(r, servings = r.servings) {
      let n = servings;
      const ings = h('ul', { class: 'mp-ings' });
      const count = h('span');
      const drawIngs = () => { count.textContent = `${n} pers.`; h(clear(ings), null, r.ingredients.map(l => { const p = M.parseIngredient(l); return h('li', null, p ? M.formatIngredient(p, n / (r.servings || 4)) : l); })); };
      drawIngs();
      h(clear(body), null,
        h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => open(tab) }, icon('arrowLeft'), 'Tilbage'),
          h('button', { class: 'btn btn-sm', onclick: () => editRecipe(r) }, icon('edit'), 'Ret'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: `Slet “${r.name}”?`, text: 'Opskriften fjernes også fra madplanerne.', confirmLabel: 'Slet', danger: true })) { st.recipes = st.recipes.filter(x => x !== r); for (const w of Object.values(st.plan)) for (const k of Object.keys(w)) if (w[k]?.id === r.id) delete w[k]; store.save(); open('recipes'); } } }, icon('trash'), 'Slet')),
        h('div', { class: 'mp-view' },
          panel(r.name, 'book', h('div', { class: 'mp-people', style: { marginBottom: '10px' } },
            h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Færre personer', onclick: () => { if (n > 1) { n--; drawIngs(); } } }, icon('minus')), count,
            h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Flere personer', onclick: () => { if (n < 30) { n++; drawIngs(); } } }, icon('plus')),
            r.minutes ? h('span', { class: 'faint', style: { marginLeft: '10px' } }, icon('clock'), ` ${r.minutes} min.`) : null), ings),
          panel('Sådan gør du', 'list', r.steps?.length ? h('ol', { class: 'mp-steps' }, r.steps.map(s => h('li', null, s))) : h('p', { class: 'faint' }, 'Ingen fremgangsmåde skrevet.'))));
    }
    function editRecipe(r0) {
      const r = r0 ? structuredClone(r0) : { id: `r-${Date.now().toString(36)}`, name: '', servings: 4, minutes: 30, tags: [], ingredients: [], steps: [] };
      const name = h('input', { class: 'input', value: r.name, maxlength: 60, placeholder: 'Fx Lasagne', 'aria-label': 'Navn' });
      const serv = h('input', { class: 'input', type: 'number', min: 1, max: 30, value: r.servings, 'aria-label': 'Antal personer', style: { width: '90px' } });
      const mins = h('input', { class: 'input', type: 'number', min: 0, max: 600, value: r.minutes || '', 'aria-label': 'Minutter', style: { width: '90px' } });
      const tags = h('input', { class: 'input', value: (r.tags || []).join(', '), placeholder: 'fx vegetar, hurtig', 'aria-label': 'Mærker' });
      const ings = h('textarea', { class: 'textarea', rows: 8, placeholder: '500 g hakket oksekød\n1 løg\n2 fed hvidløg\n1 dåse hakkede tomater', 'aria-label': 'Ingredienser' }); ings.value = r.ingredients.join('\n');
      const steps = h('textarea', { class: 'textarea', rows: 6, placeholder: 'Ét trin pr. linje', 'aria-label': 'Fremgangsmåde' }); steps.value = (r.steps || []).join('\n');
      const err = h('div', { class: 'field-error' });
      const field = (label, el, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el, hint ? h('span', { class: 'faint', style: { fontSize: '12px' } }, hint) : null);
      h(clear(body), null, panel(r0 ? `Ret ${r0.name}` : 'Ny opskrift', 'edit',
        field('Navn', name),
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, field('Personer', serv), field('Tid (min.)', mins), h('div', { style: { flex: 1, minWidth: '200px' } }, field('Mærker', tags))),
        field('Ingredienser – én pr. linje', ings, 'Skriv mængde, enhed og vare, fx “2 dl fløde”. Så kan mængderne regnes om og lægges sammen på indkøbslisten.'),
        field('Fremgangsmåde – ét trin pr. linje', steps),
        err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (r0 ? showRecipe(r0) : open('recipes')) }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: () => {
            r.name = name.value.trim(); r.servings = Math.max(1, Math.min(30, Number(serv.value) || 4)); r.minutes = Number(mins.value) || 0;
            r.tags = tags.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 8);
            r.ingredients = ings.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 60);
            r.steps = steps.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 40);
            if (!r.name) { err.textContent = 'Giv opskriften et navn.'; return; }
            if (!r.ingredients.length) { err.textContent = 'Skriv mindst én ingrediens.'; return; }
            const i = st.recipes.findIndex(x => x.id === r.id);
            if (i >= 0) st.recipes[i] = r; else st.recipes.push(r);
            store.save(); toast('Opskriften er gemt', { type: 'ok' }); showRecipe(r);
          } }, icon('check'), 'Gem opskriften'))));
      name.focus();
    }

    const TABS = { week: weekTab, shop: shopTab, recipes: recipesTab };
    function open(id) {
      tab = id;
      seg.setValue(id);
      history.replaceState(null, '', `#/apps/mealplan${id === 'week' ? '' : `/${id}`}`);
      h(clear(body), null, TABS[id]());
    }
    const seg = segmented([{ value: 'week', label: 'Ugeplan', icon: 'calendar' }, { value: 'shop', label: 'Indkøbsliste', icon: 'list' }, { value: 'recipes', label: 'Opskrifter', icon: 'book' }], tab, (v) => open(v), { label: 'Vælg' });
    open(tab);
    return h('div', { class: 'page mp-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Planlæg', title: 'Madplan', lead: 'Planlæg ugens aftensmad, gem jeres opskrifter, og få indkøbslisten lavet automatisk – mængderne lægges sammen.', compact: true }),
      h('div', { class: 'cmd-filters' }, seg), body);
  },
};
