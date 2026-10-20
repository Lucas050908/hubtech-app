/** Lager — components and spare parts: quantity, location, supplier, price, low-stock alerts, shopping list, CSV import/export. */
import { h, clear, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, modal, confirmDialog, stateBlock, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { saveBlob } from '../core/files.js';

const CATS = ['Modstande', 'Kondensatorer', 'Halvledere', 'IC’er', 'Stik & kabler', 'Mekanik', 'Værktøj', 'Reservedele', 'Andet'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const kr = (n) => (Number(n) || 0).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });
const num = (s) => { const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(v) ? v : 0; };
const low = (it) => (it.min || 0) > 0 && (it.qty || 0) <= it.min;

/** Starter content, so the app shows what it can do the first time. */
const SAMPLE = () => [
  { name: 'Modstand 4,7 kΩ ¼ W', cat: 'Modstande', qty: 85, min: 20, loc: 'Skuffe A1', supplier: 'Elfa', price: 0.15, sku: '' },
  { name: 'Elektrolyt 100 µF 25 V', cat: 'Kondensatorer', qty: 6, min: 10, loc: 'Skuffe B2', supplier: 'Reichelt', price: 0.9, sku: '' },
  { name: 'LED rød 5 mm', cat: 'Halvledere', qty: 40, min: 15, loc: 'Skuffe C1', supplier: 'Elfa', price: 0.8, sku: '' },
  { name: 'ESP32-WROOM-32', cat: 'IC’er', qty: 2, min: 3, loc: 'Æske 4', supplier: 'Mouser', price: 42, sku: '' },
].map(x => ({ id: uid(), notes: '', updated: Date.now(), ...x }));

let st = null;

export default {
  title: 'Lager',
  destroy() { flushState('inventory'); },
  async render() {
    const app = appById('inventory');
    try { st = (await getState('inventory', { force: true })) || null; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Lageret kunne ikke hentes', text: e.message })); }
    const fresh = !st;
    if (!st || !Array.isArray(st.items)) st = { items: [] };
    const persist = () => { saveState('inventory', st, { onError: () => toast('Lageret kunne ikke gemmes', { type: 'bad' }) }); stats(); };

    const v = { n: h('span'), low: h('span'), value: h('span'), locs: h('span') };
    function stats() {
      v.n.textContent = String(st.items.length);
      const l = st.items.filter(low).length;
      v.low.replaceChildren(h('span', { class: ['status-dot', l ? 'warn' : 'ok'] }), String(l));
      v.value.textContent = kr(st.items.reduce((a, it) => a + (it.qty || 0) * (it.price || 0), 0));
      v.locs.textContent = String(new Set(st.items.map(it => it.loc).filter(Boolean)).size);
    }

    const f = { q: '', cat: '', view: 'all' };
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg navn, placering, leverandør, varenr.…', 'aria-label': 'Søg i lageret' });
    search.addEventListener('input', debounce(() => { f.q = search.value.trim().toLowerCase(); draw(); }, 100));
    // scan a barcode / QR code: find the part by its number – or create one with that number
    const scanBtn = h('button', { class: 'icon-btn inv-scan', type: 'button', 'aria-label': 'Scan stregkode', title: 'Scan stregkode eller QR-kode', onclick: async () => {
      const { scan } = await import('../features/scanner.js');
      const code = await scan({ title: 'Scan en del', hint: 'Stregkoden eller QR-koden på æsken/posen – varenummeret bruges til at finde delen.' });
      if (!code) return;
      const lc = code.toLowerCase();
      const hits = st.items.filter(it => (it.sku || '').toLowerCase() === lc);
      if (hits.length === 1) { edit(hits[0]); return; }
      search.value = code; f.q = lc; draw();
      if (!hits.length && !st.items.some(it => [it.name, it.sku, it.notes].join(' ').toLowerCase().includes(lc))) {
        toast(`Ingen del med ${code}`, { text: 'Vil du oprette den?', ms: 8000, action: { label: 'Ny del', onClick: () => edit(null, { sku: code }) } });
      }
    } }, icon('target'));
    const catSel = h('select', { class: 'select', 'aria-label': 'Kategori' }, h('option', { value: '' }, 'Alle kategorier'), CATS.map(c => h('option', { value: c }, c)));
    catSel.addEventListener('change', () => { f.cat = catSel.value; draw(); });
    const viewSel = segmented([{ value: 'all', label: 'Alle' }, { value: 'low', label: 'Lav beholdning' }], 'all', (x) => { f.view = x; draw(); }, { label: 'Filter' });
    const body = h('tbody');
    const table = h('table', { class: 'inv-table' },
      h('thead', null, h('tr', null, h('th', null, 'Komponent'), h('th', null, 'Kategori'), h('th', null, 'Placering'), h('th', { class: 'num' }, 'Antal'), h('th', { class: 'num hide-sm' }, 'Pris'), h('th', { class: 'num hide-sm' }, 'Værdi'), h('th', null, h('span', { class: 'sr-only' }, 'Handlinger')))),
      body);
    const empty = h('div');

    const match = (it) => (!f.cat || it.cat === f.cat) && (f.view !== 'low' || low(it))
      && (!f.q || [it.name, it.loc, it.supplier, it.sku, it.notes, it.cat].join(' ').toLowerCase().includes(f.q));

    function adjust(it, d) {
      it.qty = Math.max(0, (it.qty || 0) + d); it.updated = Date.now();
      persist(); draw();
      if (d < 0 && low(it)) toast('Lav beholdning', { type: 'warn', text: `${it.name}: ${it.qty} tilbage (minimum ${it.min}).`, ms: 2500 });
    }

    function draw() {
      clear(body); clear(empty);
      const items = st.items.filter(match).sort((a, b) => (low(b) ? 1 : 0) - (low(a) ? 1 : 0) || a.name.localeCompare(b.name, 'da'));
      table.hidden = !items.length;
      if (!items.length) {
        empty.appendChild(stateBlock({ app: app.hue, icon: 'box', title: st.items.length ? 'Ingen varer matcher' : 'Lageret er tomt', text: st.items.length ? 'Prøv et andet søgeord eller en anden kategori.' : 'Tilføj dine komponenter og reservedele – eller importér en CSV-fil fra et regneark.', actions: st.items.length ? [] : [h('button', { class: 'btn app-solid', onclick: () => edit() }, icon('plus'), 'Tilføj vare')] }));
        return;
      }
      for (const it of items) {
        const qty = h('span', { class: 'inv-qty' }, String(it.qty || 0));
        body.appendChild(h('tr', { class: low(it) ? 'is-low' : null },
          h('td', null, h('button', { type: 'button', class: 'inv-name', onclick: () => edit(it) }, it.name), it.sku || it.supplier ? h('div', { class: 'faint inv-sub' }, [it.sku, it.supplier].filter(Boolean).join(' · ')) : null),
          h('td', null, h('span', { class: 'chip' }, it.cat || 'Andet')),
          h('td', null, it.loc || h('span', { class: 'faint' }, '—')),
          h('td', { class: 'num' }, h('div', { class: 'inv-stepper' },
            h('button', { class: 'icon-btn btn-sm', 'aria-label': `Træk 1 fra ${it.name}`, onclick: () => adjust(it, -1) }, icon('minus')),
            qty,
            h('button', { class: 'icon-btn btn-sm', 'aria-label': `Læg 1 til ${it.name}`, onclick: () => adjust(it, 1) }, icon('plus'))),
            low(it) ? h('div', { class: 'inv-min' }, `min. ${it.min}`) : null),
          h('td', { class: 'num hide-sm' }, it.price ? kr(it.price) : '—'),
          h('td', { class: 'num hide-sm' }, it.price ? kr((it.qty || 0) * it.price) : '—'),
          h('td', { class: 'num' }, h('button', { class: 'icon-btn btn-sm', 'aria-label': `Redigér ${it.name}`, onclick: () => edit(it) }, icon('edit')))));
      }
    }

    function edit(it, preset = {}) {
      const isNew = !it;
      const e = it ? { ...it } : { id: uid(), name: '', cat: f.cat || CATS[0], qty: 1, min: 0, loc: '', supplier: '', price: 0, sku: '', notes: '', ...preset };
      const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
      const na = h('input', { class: 'input', value: e.name, maxlength: 160, placeholder: 'Fx Modstand 10 kΩ', 'aria-label': 'Navn' });
      const ca = h('select', { class: 'select', 'aria-label': 'Kategori' }, CATS.map(c => h('option', { value: c, selected: e.cat === c }, c)));
      const qt = h('input', { class: 'input', type: 'number', min: 0, step: 1, value: e.qty, 'aria-label': 'Antal' });
      const mi = h('input', { class: 'input', type: 'number', min: 0, step: 1, value: e.min || 0, 'aria-label': 'Minimum' });
      const lo = h('input', { class: 'input', value: e.loc, maxlength: 80, placeholder: 'Skuffe A1', 'aria-label': 'Placering', list: 'inv-locs' });
      const locs = h('datalist', { id: 'inv-locs' }, [...new Set(st.items.map(x => x.loc).filter(Boolean))].map(l => h('option', { value: l })));
      const su = h('input', { class: 'input', value: e.supplier, maxlength: 80, placeholder: 'Elfa, Mouser, Reichelt …', 'aria-label': 'Leverandør' });
      const pr = h('input', { class: 'input', inputmode: 'decimal', value: e.price ? String(e.price).replace('.', ',') : '', placeholder: '0,00', 'aria-label': 'Pris pr. stk.' });
      const sk = h('input', { class: 'input', value: e.sku, maxlength: 60, placeholder: 'Varenummer', 'aria-label': 'Varenummer' });
      const no = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Noter, datablad-link …', 'aria-label': 'Noter' }); no.value = e.notes || '';
      const err = h('div', { class: 'field-error' });
      let m;
      const save = () => {
        if (!na.value.trim()) { err.textContent = 'Skriv et navn.'; na.focus(); return; }
        Object.assign(e, { name: na.value.trim(), cat: ca.value, qty: Math.max(0, Math.round(num(qt.value))), min: Math.max(0, Math.round(num(mi.value))), loc: lo.value.trim(), supplier: su.value.trim(), price: Math.max(0, num(pr.value)), sku: sk.value.trim(), notes: no.value.trim(), updated: Date.now() });
        if (isNew) { st.items.push(e); logActivity('inventory', 'new', e.name, 'Vare tilføjet'); } else Object.assign(st.items.find(x => x.id === e.id), e);
        persist(); m.close(); draw();
      };
      const actions = [];
      if (!isNew) actions.push(h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: async () => {
        if (!await confirmDialog({ title: 'Slet vare?', text: `“${e.name}” slettes fra lageret.`, confirmLabel: 'Slet', danger: true })) return;
        st.items = st.items.filter(x => x.id !== e.id); persist(); m.close(); draw();
      } }, icon('trash'), 'Slet'));
      actions.push(h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: save }, isNew ? 'Tilføj' : 'Gem'));
      m = modal({
        title: isNew ? 'Ny vare' : 'Redigér vare', label: 'Lager', size: 600,
        body: h('div', { class: 'stack', style: { gap: '12px' } }, field('Navn', na),
          h('div', { class: 'grid-2' }, field('Kategori', ca), field('Placering', lo)), locs,
          h('div', { class: 'grid-2' }, field('Antal på lager', qt), field('Minimum (advarsel ved)', mi)),
          h('div', { class: 'grid-2' }, field('Leverandør', su), field('Pris pr. stk. (kr.)', pr)),
          field('Varenummer', sk), field('Noter', no), err),
        actions,
      });
      na.addEventListener('keydown', (k) => { if (k.key === 'Enter') save(); });
      setTimeout(() => na.focus(), 50);
    }

    // ── shopping list, CSV ──
    function shoppingList() {
      const items = st.items.filter(low);
      if (!items.length) { toast('Intet mangler', { type: 'ok', text: 'Ingen varer er under minimum.' }); return; }
      const bySup = new Map();
      for (const it of items) { const k = it.supplier || 'Uden leverandør'; if (!bySup.has(k)) bySup.set(k, []); bySup.get(k).push(it); }
      const need = (it) => Math.max(it.min * 2 - it.qty, it.min - it.qty + 1);
      const text = [...bySup].map(([s, list]) => `${s}\n${list.map(it => `  ${need(it)} × ${it.name}${it.sku ? ` (${it.sku})` : ''}`).join('\n')}`).join('\n\n');
      const total = items.reduce((a, it) => a + need(it) * (it.price || 0), 0);
      let m;
      m = modal({
        title: 'Indkøbsliste', label: 'Lager', size: 560,
        body: h('div', { class: 'stack', style: { gap: '10px' } },
          h('p', { class: 'muted' }, `${items.length} varer under minimum. Forslaget fylder op til det dobbelte af minimum.`),
          h('pre', { class: 'inv-shop' }, text),
          total ? h('p', null, h('b', null, `Anslået pris: ${kr(total)}`)) : null),
        actions: [
          h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Kopieret', { type: 'ok', ms: 1200 }); } catch { toast('Kunne ikke kopiere', { type: 'bad' }); } } }, icon('copy'), 'Kopiér'),
          h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Luk')],
      });
    }
    const csvCell = (x) => { const s = String(x ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    function exportCsv() {
      const rows = [['Navn', 'Kategori', 'Antal', 'Minimum', 'Placering', 'Leverandør', 'Varenummer', 'Pris', 'Noter']]
        .concat(st.items.map(it => [it.name, it.cat, it.qty, it.min, it.loc, it.supplier, it.sku, String(it.price || 0).replace('.', ','), it.notes]));
      saveBlob('HUBTECH-lager.csv', new Blob(['﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    }
    function importCsv() {
      const inp = h('input', { type: 'file', accept: '.csv,text/csv', style: { display: 'none' } });
      inp.addEventListener('change', async () => {
        const file = inp.files[0]; inp.remove(); if (!file) return;
        const text = (await file.text()).replace(/^﻿/, '');
        const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
        const rows = [];
        let row = [], cell = '', q = false;
        for (let i = 0; i < text.length; i++) {
          const c = text[i];
          if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
          else if (c === '"') q = true;
          else if (c === sep) { row.push(cell); cell = ''; }
          else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
          else cell += c;
        }
        if (cell || row.length) { row.push(cell); rows.push(row); }
        const head = (rows.shift() || []).map(x => x.trim().toLowerCase());
        const col = (...names) => head.findIndex(x => names.some(n => x.startsWith(n)));
        const ix = { name: col('navn', 'name', 'komponent', 'beskrivelse'), cat: col('kategori', 'category'), qty: col('antal', 'qty', 'quantity', 'mængde'), min: col('minimum', 'min'), loc: col('placering', 'location', 'lokation'), supplier: col('leverandør', 'supplier'), sku: col('varenummer', 'sku', 'varenr'), price: col('pris', 'price'), notes: col('noter', 'note') };
        if (ix.name < 0) { toast('Kunne ikke læse filen', { type: 'bad', text: 'Første række skal have en kolonne “Navn”.' }); return; }
        let added = 0, updated = 0;
        for (const r of rows) {
          const name = (r[ix.name] || '').trim(); if (!name) continue;
          const g = (k) => (ix[k] >= 0 ? (r[ix[k]] || '').trim() : '');
          const data = { name, cat: CATS.includes(g('cat')) ? g('cat') : (g('cat') ? 'Andet' : 'Andet'), qty: Math.round(num(g('qty'))), min: Math.round(num(g('min'))), loc: g('loc'), supplier: g('supplier'), sku: g('sku'), price: num(g('price')), notes: g('notes'), updated: Date.now() };
          const ex = st.items.find(x => x.name.toLowerCase() === name.toLowerCase() && (x.sku || '') === data.sku);
          if (ex) { Object.assign(ex, data); updated++; } else { st.items.push({ id: uid(), ...data }); added++; }
        }
        persist(); draw();
        toast('Lager importeret', { type: 'ok', text: `${added} nye, ${updated} opdateret.` });
      });
      document.body.appendChild(inp); inp.click();
    }

    if (fresh) {   // first visit: offer examples instead of an empty page
      st.items = SAMPLE();
      persist();
      setTimeout(() => toast('Eksempler lagt ind', { text: 'Fire eksempler viser, hvordan Lager virker. Slet eller ret dem, som du vil.', action: { label: 'Fjern eksemplerne', onClick: () => { st.items = []; persist(); draw(); } } }), 400);
    }
    stats(); draw();
    return h('div', { class: 'page inventory-page', style: { '--app': app.hue } },
      appHero(app, {
        eyebrow: 'Værksted', title: 'Lager', lead: 'Hvor ligger den, og har du nok? Hold styr på komponenter og reservedele – og se med det samme, hvad der skal købes.',
        actions: [heroBtn('Ny vare', 'plus', { onclick: () => edit() }), heroGhost('Indkøbsliste', 'list', { onclick: shoppingList })],
        stats: [
          { icon: 'box', label: 'Varer', value: v.n },
          { icon: 'alert', label: 'Lav beholdning', value: v.low },
          { icon: 'chart', label: 'Lagerværdi', value: v.value },
          { icon: 'mapPin', label: 'Placeringer', value: v.locs }],
      }),
      h('div', { class: 'inv-bar' }, h('div', { class: 'pt-search' }, icon('search'), search), scanBtn, catSel, viewSel,
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'btn btn-sm', onclick: importCsv }, icon('upload'), 'Importér CSV'),
        h('button', { class: 'btn btn-sm', onclick: exportCsv }, icon('download'), 'Hent CSV')),
      h('section', { class: 'glass panel inv-panel' }, table, empty));
  },
};
