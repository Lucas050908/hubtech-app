/**
 * Fællesudgifter – who paid what on the trip, in the shared flat or for the class party,
 * and the fewest payments that make everyone even. Amounts are counted in øre, so it always adds up.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog, modal } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, loadError } from '../features/appkit.js';
import { sh, onShared, shareDialog, ago, person, emptyState, me } from '../features/shared.js';
import { toOre, kr, balances, settleUp, byCategory, splitAmount } from '../features/sharedlogic.js';

const PAGE = 'expenses';
const CATS = ['Mad', 'Indkøb', 'Transport', 'Overnatning', 'Oplevelser', 'Husleje', 'Regninger', 'Gaver', 'Andet'];
const CAT_ICON = { Mad: 'coffee', Indkøb: 'cart', Transport: 'car', Overnatning: 'home', Oplevelser: 'star', Husleje: 'home', Regninger: 'file', Gaver: 'gift', Andet: 'tag' };
const today = () => new Date().toISOString().slice(0, 10);

/** everyone in the group: the owner, the members and the guests (people without an account) */
function people(doc) {
  const out = [];
  if (doc.owner) out.push({ key: `u:${doc.ownerId}`, name: doc.owner.name, avatar: doc.owner.avatar, id: doc.ownerId });
  for (const m of doc.members || []) out.push({ key: `u:${m.id}`, name: m.name, avatar: m.avatar, id: m.id });
  for (const g of doc.data.guests || []) out.push({ key: `g:${g}`, name: g, guest: true });
  return out;
}

export default {
  title: 'Fællesudgifter',
  destroy() { this._off?.(); },
  async render(ctx) {
    const app = appById('expenses');
    const root = h('div'), self = this;
    const qs = new URLSearchParams(location.hash.split('?')[1] || ''), token = qs.get('t');
    let askShare = qs.get('share') === '1';

    async function list() {
      self._off?.(); self._off = onShared('expense', () => { if (document.body.contains(root)) list(); });
      let docs;
      try { docs = await sh.list('expense'); } catch (e) { h(clear(root), null, loadError('Fællesudgifter', e)); return; }
      const card = (d) => h('a', { class: 'sh-card', href: `#/apps/${PAGE}/d/${d.id}` },
        h('div', { class: 'sh-card-h' }, h('b', null, d.title), d.data.done ? h('span', { class: 'chip chip-ok' }, icon('check'), 'Gjort op') : null),
        h('div', { class: 'sh-meta' }, h('span', null, icon('wallet'), ` ${d.counts.expense || 0} udgifter`), d.role === 'owner' ? null : person(d.owner), h('span', null, ago(d.updated))));
      h(clear(root), null,
        h('div', { class: 'sh-top' }, h('b', { style: { flex: 1 } }, ''), h('button', { class: 'btn btn-primary', onclick: () => editor(null) }, icon('plus'), 'Ny gruppe')),
        docs.length ? h('div', { class: 'sh-list' }, docs.map(card)) : emptyState('wallet', 'Ingen grupper endnu', 'Lav en gruppe til en tur, et bofællesskab eller en fest. Skriv hvem der betalte hvad – så regner HUBTECH ud, hvem der skylder hvem.', h('button', { class: 'btn btn-primary', onclick: () => editor(null) }, icon('plus'), 'Lav den første')));
    }

    function editor(doc) {
      const title = h('input', { class: 'input', maxlength: 100, value: doc?.title || '', placeholder: 'Fx Sommerhus i Blokhus', 'aria-label': 'Navn på gruppen' });
      const guests = [...(doc?.data.guests || [])];
      const gBox = h('div', { class: 'wl-tags' });
      const gIn = h('input', { class: 'input', maxlength: 40, placeholder: 'Navn', 'aria-label': 'Gæst uden konto' });
      const drawG = () => h(clear(gBox), null, guests.map((g, i) => h('span', { class: 'chip' }, g, h('button', { class: 'icon-btn btn-sm', 'aria-label': `Fjern ${g}`, onclick: () => { guests.splice(i, 1); drawG(); } }, icon('x')))));
      const addG = () => { const v = gIn.value.trim(); if (v && !guests.includes(v)) guests.push(v); gIn.value = ''; drawG(); gIn.focus(); };
      gIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addG(); } });
      drawG();
      const err = h('div', { class: 'field-error' });
      h(clear(root), null, panel(doc ? 'Ret gruppe' : 'Ny gruppe', 'wallet',
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), title),
        h('span', { class: 'field-label' }, 'Med uden en konto (valgfrit)'), h('p', { class: 'faint', style: { margin: 0 } }, 'Folk på HUBTECH inviterer du bagefter. Her kan du skrive navne på dem, der ikke er med på HUBTECH.'),
        h('div', { class: 'row', style: { gap: '6px' } }, gIn, h('button', { class: 'btn', onclick: addG }, icon('plus'), 'Tilføj')), gBox, err,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (doc ? detail(doc.id) : list()) }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: async () => {
            if (!title.value.trim()) { err.textContent = 'Giv gruppen et navn.'; return; }
            try {
              if (doc) { await sh.update(doc.id, { title: title.value.trim(), data: { ...doc.data, guests } }); detail(doc.id); }
              else { const d = await sh.create('expense', { title: title.value.trim(), data: { guests }, visibility: 'private' }); location.hash = `#/apps/${PAGE}/d/${d.id}?share=1`; }
            } catch (e) { err.textContent = e.message; }
          } }, icon('check'), doc ? 'Gem' : 'Opret og invitér'))));
      title.focus();
    }

    function expenseDialog(doc, ppl, old, onDone) {
      const d = old?.data || {};
      const desc = h('input', { class: 'input', maxlength: 120, value: d.desc || '', placeholder: 'Fx Indkøb i Netto', 'aria-label': 'Hvad' });
      const amount = h('input', { class: 'input', inputmode: 'decimal', value: d.amount ? String(d.amount).replace('.', ',') : '', placeholder: '0,00', 'aria-label': 'Beløb i kr.' });
      const paid = h('select', { class: 'select', 'aria-label': 'Betalt af' }, ppl.map(p => h('option', { value: p.key }, p.name)));
      paid.value = d.paidBy || `u:${me()}`;
      const date = h('input', { class: 'input', type: 'date', value: d.date || today(), 'aria-label': 'Dato' });
      const cat = h('select', { class: 'select', 'aria-label': 'Kategori' }, CATS.map(c => h('option', { value: c }, c))); cat.value = d.category || 'Mad';
      const split = new Set(d.split || ppl.map(p => p.key));
      let uneven = !!d.custom;
      const custom = Object.fromEntries(Object.entries(d.custom || {}).map(([k, v]) => [k, (v / 100).toString().replace('.', ',')]));
      const splitBox = h('div', { class: 'ex-split' }), info = h('div', { class: 'faint ex-info' }), err = h('div', { class: 'field-error' });
      const drawSplit = () => {
        const total = toOre(amount.value) || 0;
        const keys = ppl.filter(p => split.has(p.key)).map(p => p.key);
        const even = keys.length ? splitAmount(total, keys) : {};
        h(clear(splitBox), null, ppl.map(p => {
          const on = split.has(p.key);
          const inp = uneven && on ? h('input', { class: 'input ex-share', inputmode: 'decimal', value: custom[p.key] || '', placeholder: '0,00', 'aria-label': `${p.name}s andel` }) : null;
          inp?.addEventListener('input', () => { custom[p.key] = inp.value; sumInfo(); });
          return h('label', { class: ['ex-person', on && 'is-on'] }, h('input', { type: 'checkbox', checked: on, onchange: (e) => { e.target.checked ? split.add(p.key) : split.delete(p.key); drawSplit(); } }),
            h('span', { class: 'ex-pname' }, p.name), inp || h('span', { class: 'faint' }, on && total ? kr(even[p.key]) : ''));
        }));
        sumInfo();
      };
      const sumInfo = () => {
        if (!uneven) { info.textContent = split.size ? `Deles ligeligt mellem ${split.size}` : 'Vælg mindst én'; return; }
        const total = toOre(amount.value) || 0, sum = [...split].reduce((a, k) => a + (toOre(custom[k] || 0) || 0), 0);
        info.textContent = sum === total ? 'Det passer ✓' : `${kr(Math.abs(total - sum))} ${sum < total ? 'mangler' : 'for meget'}`;
      };
      amount.addEventListener('input', drawSplit);
      const unevenBox = h('input', { type: 'checkbox', checked: uneven, onchange: (e) => { uneven = e.target.checked; drawSplit(); } });
      drawSplit();
      const m = modal({ title: old ? 'Ret udgift' : 'Ny udgift', label: doc.title, size: 520,
        body: h('div', { class: 'stack', style: { gap: '10px' } },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hvad'), desc),
          h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, h('label', { class: 'field', style: { flex: 1 } }, h('span', { class: 'field-label' }, 'Beløb (kr.)'), amount), h('label', { class: 'field', style: { flex: 1 } }, h('span', { class: 'field-label' }, 'Betalt af'), paid)),
          h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, h('label', { class: 'field', style: { flex: 1 } }, h('span', { class: 'field-label' }, 'Dato'), date), h('label', { class: 'field', style: { flex: 1 } }, h('span', { class: 'field-label' }, 'Kategori'), cat)),
          h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('span', { class: 'field-label' }, 'Deles mellem'), h('label', { class: 'cal-pcheck' }, unevenBox, h('span', null, 'Ulige fordeling'))),
          splitBox, info, err),
        actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: async () => {
          const total = toOre(amount.value);
          if (!desc.value.trim()) { err.textContent = 'Skriv hvad det var.'; return; }
          if (!(total > 0)) { err.textContent = 'Skriv et beløb.'; return; }
          if (!split.size) { err.textContent = 'Vælg hvem det deles mellem.'; return; }
          const keys = ppl.filter(p => split.has(p.key)).map(p => p.key);
          let cust = null;
          if (uneven) { cust = Object.fromEntries(keys.map(k => [k, toOre(custom[k] || 0) || 0])); if (Object.values(cust).reduce((a, b) => a + b, 0) !== total) { err.textContent = 'Andelene skal give hele beløbet.'; return; } }
          const data = { desc: desc.value.trim(), amount: total / 100, paidBy: paid.value, date: date.value || today(), category: cat.value, split: keys, ...(cust ? { custom: cust } : {}) };
          try { if (old) await sh.edit(old.id, data); else await sh.add(doc.id, 'expense', data); m.close(); onDone(); }
          catch (e) { err.textContent = e.message; }
        } }, icon('check'), old ? 'Gem' : 'Tilføj')] });
      (old ? amount : desc).focus();
    }

    async function detail(id) {
      let res;
      try { res = await sh.get(id, token); } catch (e) {
        if (token) { try { await sh.join(id, token); res = await sh.get(id); } catch { /* */ } }
        if (!res) { h(clear(root), null, emptyState('alert', 'Gruppen findes ikke', 'Den er måske slettet, eller du har ikke adgang.', h('a', { class: 'btn', href: `#/apps/${PAGE}` }, 'Alle grupper'))); return; }
      }
      const { doc, entries } = res, owner = doc.role === 'owner';
      self._off?.(); self._off = onShared('expense', (ev) => { if (ev.what === 'gone') { location.hash = `#/apps/${PAGE}`; return; } if (document.body.contains(root) && !document.querySelector('.modal')) detail(id); }, id);
      if (askShare && owner) { askShare = false; history.replaceState(null, '', `#/apps/${PAGE}/d/${id}`); setTimeout(async () => { if (await shareDialog(doc, { title: 'Hvem er med?' })) detail(id); }, 50); }
      const ppl = people(doc), byKey = Object.fromEntries(ppl.map(p => [p.key, p]));
      const name = (k) => byKey[k]?.name || (k.startsWith('g:') ? k.slice(2) : 'Tidligere medlem');
      const again = () => detail(id);
      const bal = balances(entries), pay = settleUp(bal);
      const expenses = entries.filter(e => e.kind === 'expense').sort((a, b) => (b.data.date || '').localeCompare(a.data.date || '') || b.at - a.at);
      const settles = entries.filter(e => e.kind === 'settle');
      const total = expenses.reduce((a, e) => a + toOre(e.data.amount), 0);
      const mineKey = `u:${me()}`, myBal = bal[mineKey] || 0;
      const cats = byCategory(entries);
      const add = () => expenseDialog(doc, ppl, null, again);
      // grouped by date
      const groups = [];
      for (const e of expenses) { const g = groups.at(-1); if (g && g.date === e.data.date) g.items.push(e); else groups.push({ date: e.data.date, items: [e] }); }
      const dayLabel = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
      const exportCsv = () => {
        const rows = [['Dato', 'Hvad', 'Kategori', 'Beløb', 'Betalt af', 'Deles mellem'], ...expenses.map(e => [e.data.date, e.data.desc, e.data.category, (toOre(e.data.amount) / 100).toFixed(2).replace('.', ','), name(e.data.paidBy), e.data.split.map(name).join(', ')])];
        const csv = '﻿' + rows.map(r => r.map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
        const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `${doc.title}.csv` }); document.body.append(a); a.click(); setTimeout(() => a.remove(), 1000);
      };
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: `#/apps/${PAGE}` }, icon('arrowLeft'), 'Alle'), h('h2', null, doc.title),
          owner ? [h('button', { class: 'btn btn-sm', onclick: async () => { if (await shareDialog(doc, { title: 'Hvem er med?' })) again(); } }, icon('users'), 'Inviter'),
            h('button', { class: 'btn btn-sm', onclick: () => editor(doc) }, icon('edit'), 'Ret'),
            h('button', { class: 'icon-btn', 'aria-label': 'Slet gruppen', onclick: async () => { if (await confirmDialog({ title: 'Slet gruppen og alle udgifter?', confirmLabel: 'Slet', danger: true })) { await sh.del(doc.id); location.hash = `#/apps/${PAGE}`; } } }, icon('trash'))] : null),
        h('div', { class: 'ex-summary' },
          h('div', { class: 'ex-big' }, h('span', { class: 'faint' }, 'Brugt i alt'), h('b', null, kr(total))),
          h('div', { class: ['ex-big', myBal > 0 && 'is-plus', myBal < 0 && 'is-minus'] }, h('span', { class: 'faint' }, myBal > 0 ? 'Du skal have' : myBal < 0 ? 'Du skylder' : 'Din status'), h('b', null, myBal ? kr(Math.abs(myBal)) : 'Du er kvit')),
          h('button', { class: 'btn btn-primary btn-lg ex-add', onclick: add }, icon('plus'), 'Tilføj udgift')),
        h('div', { class: 'ex-wrap' },
          h('div', { class: 'stack' },
            expenses.length ? panel('Udgifter', 'list', groups.map(g => h('div', { class: 'ex-day' }, h('span', { class: 'field-label' }, dayLabel(g.date)),
              g.items.map(e => h('div', { class: 'ex-row' },
                h('span', { class: 'ex-cat', title: e.data.category }, icon(CAT_ICON[e.data.category] || 'tag')),
                h('div', { class: 'ex-row-b' }, h('b', null, e.data.desc), h('span', { class: 'faint' }, `${name(e.data.paidBy)} betalte · deles mellem ${e.data.split.length === ppl.length ? 'alle' : e.data.split.map(name).join(', ')}`)),
                h('div', { class: 'ex-amt' }, h('b', null, kr(toOre(e.data.amount))),
                  e.data.split.includes(mineKey) || e.data.paidBy === mineKey ? h('small', { class: e.data.paidBy === mineKey ? 'ex-plus' : 'ex-minus' }, (() => { const mine = splitAmount(toOre(e.data.amount), e.data.split, e.data.custom || null)[mineKey] || 0; const net = (e.data.paidBy === mineKey ? toOre(e.data.amount) : 0) - mine; return net > 0 ? `du får ${kr(net)}` : net < 0 ? `din del ${kr(-net)}` : ''; })()) : null),
                h('div', { class: 'ex-row-acts' }, h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Ret udgift', onclick: () => expenseDialog(doc, ppl, e, again) }, icon('edit')),
                  h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet udgift', onclick: async () => { if (await confirmDialog({ title: `Slet “${e.data.desc}”?`, confirmLabel: 'Slet', danger: true })) { await sh.remove(e.id); again(); } } }, icon('trash'))))))),
              h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm btn-ghost', onclick: exportCsv }, icon('download'), 'Hent til Excel')))
              : emptyState('wallet', 'Ingen udgifter endnu', 'Tryk “Tilføj udgift”, når nogen har betalt noget for fællesskabet.'),
            settles.length ? panel('Betalinger', 'check', settles.slice().reverse().map(s => h('div', { class: 'ex-row' }, h('span', { class: 'ex-cat' }, icon('check')),
              h('div', { class: 'ex-row-b' }, h('b', null, `${name(s.data.from)} betalte ${name(s.data.to)}`), h('span', { class: 'faint' }, ago(s.at))), h('div', { class: 'ex-amt' }, h('b', null, kr(toOre(s.data.amount)))),
              h('div', { class: 'ex-row-acts' }, h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Fortryd betaling', onclick: async () => { await sh.remove(s.id); again(); } }, icon('undo')))))) : null),
          h('div', { class: 'stack' },
            panel('Hvem skylder hvem', 'users',
              pay.length ? h('div', { class: 'ex-pay' }, pay.map(p => h('div', { class: 'ex-payrow' },
                h('div', null, h('b', null, name(p.from)), h('span', { class: 'faint' }, ' → '), h('b', null, name(p.to))), h('b', { class: 'ex-payamt' }, kr(p.amount)),
                h('button', { class: 'btn btn-sm', onclick: async () => { if (await confirmDialog({ title: 'Er det betalt?', text: `${name(p.from)} har betalt ${kr(p.amount)} til ${name(p.to)}.`, confirmLabel: 'Ja, betalt' })) { await sh.add(doc.id, 'settle', { from: p.from, to: p.to, amount: p.amount / 100 }); toast('Betalingen er noteret', { type: 'ok' }); again(); } } }, icon('check'), 'Betalt'))))
                : h('p', { class: 'muted', style: { margin: 0 } }, expenses.length ? 'Alle er kvit 🎉' : 'Her kommer det, når der er udgifter.'),
              h('div', { class: 'ex-bals' }, ppl.map(p => { const v = bal[p.key] || 0; return h('div', { class: 'ex-bal' }, h('span', null, p.name, p.guest ? h('small', { class: 'faint' }, ' (gæst)') : null), h('b', { class: v > 0 ? 'ex-plus' : v < 0 ? 'ex-minus' : 'faint' }, v ? `${v > 0 ? '+' : '−'}${kr(Math.abs(v))}` : '0')); }))),
            cats.length ? panel('Hvad gik pengene til', 'chart', h('div', { class: 'ex-cats' }, cats.map(([c, v]) => h('div', { class: 'ex-catrow' }, h('span', null, c), h('div', { class: 'ex-catbar' }, h('i', { style: { width: `${Math.round(v / cats[0][1] * 100)}%` } })), h('b', null, kr(v)))))) : null)));
    }

    if (ctx?.params?.sub === 'd' && ctx.params.id) detail(ctx.params.id); else list();
    return h('div', { class: 'page ex-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Sammen', title: 'Fællesudgifter', lead: 'Hvem betalte hvad på turen, i bofællesskabet eller til festen? Skriv det ind – så regner HUBTECH ud, hvem der skal betale hvem.', compact: true }), root);
  },
};
