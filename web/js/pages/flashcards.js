/** Huskekort — flashcards with spaced repetition (SM-2 light), decks, study sessions, import/export and Kodeskolen quiz import. */
import { h, clear, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { logActivity, refreshSummary } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, modal, confirmDialog, stateBlock, progressBar } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { saveBlob } from '../core/files.js';
import { navigate } from '../core/router.js';
import { schedule, nextLabel, isDue, isNew, GRADES, DAY, startOfDay, parseCards } from '../features/srs.js';

export const XP_REVIEW = 2;
const NEW_PER_SESSION = 20;
const COLORS = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
let st = null, onKey = null;

const SAMPLE = () => {
  const decks = [
    { id: uid(), name: 'Elektronik – grundbegreber', color: '#fbbf24', cards: [
      ['Ohms lov', 'U = R · I\n(spænding = modstand · strøm)'], ['Enheden for modstand', 'Ohm (Ω)'], ['Effekt i et kredsløb', 'P = U · I  (watt)'],
      ['Formodstand til LED', 'R = (U_forsyning − U_LED) / I_LED'], ['To modstande i serie', 'R = R1 + R2'], ['To modstande parallelt', 'R = (R1 · R2) / (R1 + R2)'],
      ['Farvekode brun–sort–rød', '1 kΩ (1, 0, ×100)'], ['Hvad gør en diode?', 'Leder strøm i én retning'], ['Enheden for kapacitet', 'Farad (F) – typisk µF, nF, pF']] },
    { id: uid(), name: 'Netværk – porte og begreber', color: '#60a5fa', cards: [
      ['SSH – port', '22 (TCP)'], ['HTTPS – port', '443 (TCP)'], ['DNS – port', '53 (UDP/TCP)'], ['RDP (Fjernskrivebord) – port', '3389'],
      ['/24 som subnetmaske', '255.255.255.0 – 254 brugbare adresser'], ['Private IPv4-områder', '10.0.0.0/8\n172.16.0.0/12\n192.168.0.0/16'],
      ['Hvad gør DHCP?', 'Giver enheder IP-adresse, gateway og DNS automatisk'], ['Hvilken protokol bruger ping?', 'ICMP']] },
  ];
  const now = Date.now();
  return {
    decks: decks.map(({ cards, ...d }) => ({ ...d, created: now })),
    cards: decks.flatMap(d => d.cards.map(([front, back]) => ({ id: uid(), deck: d.id, front, back, created: now, due: 0, reps: 0, ivl: 0, ease: 2.5, lapses: 0 }))),
    log: {}, reviews: 0,
  };
};

const persist = () => saveState('flashcards', st, { onError: () => toast('Huskekort kunne ikke gemmes', { type: 'bad' }) });
const deckCards = (id) => st.cards.filter(c => id === 'all' || c.deck === id);
const dueCount = (id) => deckCards(id).filter(c => isDue(c) && !isNew(c)).length;
const newCount = (id) => deckCards(id).filter(isNew).length;
const studyCount = (id) => dueCount(id) + Math.min(NEW_PER_SESSION, newCount(id));
function streak() {
  let n = 0; const d = new Date();
  if (!st.log[today()]) d.setDate(d.getDate() - 1);                 // today not done yet doesn't break the streak
  for (;;) { const p = (x) => String(x).padStart(2, '0'); const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; if (!st.log[k]) break; n++; d.setDate(d.getDate() - 1); }
  return n;
}

const csvCell = (s) => /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

async function importFromCodeschool() {
  const [{ CODE_COURSES }, cs] = await Promise.all([import('../data/code-courses.js'), getState('codeschool').catch(() => null)]);
  let deck = st.decks.find(d => d.source === 'codeschool');
  if (!deck) { deck = { id: uid(), name: 'Kodeskolen – quizzer', color: '#818cf8', created: Date.now(), source: 'codeschool' }; st.decks.push(deck); }
  const have = new Set(st.cards.filter(c => c.deck === deck.id).map(c => c.key));
  const onlyDone = cs?.done && Object.keys(cs.done).length > 0;
  let n = 0;
  for (const course of CODE_COURSES) for (const l of course.lessons) {
    if (onlyDone && !cs.done[l.id]) continue;
    (l.quiz || []).forEach(([q, opts, right, why], qi) => {
      const key = `cs:${l.id}:${qi}`;
      if (have.has(key)) return;
      st.cards.push({ id: uid(), deck: deck.id, key, front: `${course.title}: ${q}`, back: `${opts[right]}\n\n${why}`, created: Date.now(), due: 0, reps: 0, ivl: 0, ease: 2.5, lapses: 0 });
      n++;
    });
  }
  persist();
  toast(n ? `${n} nye kort fra Kodeskolen` : 'Ingen nye quizspørgsmål at hente', { type: n ? 'ok' : undefined, text: onlyDone ? 'Fra de lektioner, du har gennemført' : '' });
  return deck;
}

function cardDialog({ title, card = {}, onSave }) {
  const front = h('textarea', { class: 'textarea', rows: 3, 'aria-label': 'Forside', placeholder: 'Spørgsmål eller begreb' }); front.value = card.front || '';
  const back = h('textarea', { class: 'textarea', rows: 4, 'aria-label': 'Bagside', placeholder: 'Svar' }); back.value = card.back || '';
  let m;
  const save = () => { if (!front.value.trim() || !back.value.trim()) { toast('Udfyld både forside og bagside', { type: 'warn' }); return; } onSave(front.value.trim(), back.value.trim()); m.close(); };
  m = modal({ title, size: 560,
    body: h('div', { class: 'fc-form' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Forside'), front), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bagside'), back)),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: save }, 'Gem')] });
  m.el.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); } });
}

function deckDialog(deck, after) {
  const name = h('input', { class: 'input', 'aria-label': 'Navn på sættet', placeholder: 'Fx Engelske gloser', value: deck?.name || '' });
  let color = deck?.color || COLORS[st.decks.length % COLORS.length];
  const sw = h('div', { class: 'fc-swatches', role: 'radiogroup', 'aria-label': 'Farve' });
  const paint = () => h(clear(sw), null, COLORS.map(c => h('button', { type: 'button', class: ['fc-swatch', c === color && 'is-on'], role: 'radio', 'aria-checked': String(c === color), 'aria-label': `Farve ${c}`, style: { background: c }, onclick: () => { color = c; paint(); } })));
  paint();
  let m;
  const save = () => {
    const n = name.value.trim(); if (!n) { name.focus(); return; }
    if (deck) Object.assign(deck, { name: n, color });
    else { deck = { id: uid(), name: n, color, created: Date.now() }; st.decks.push(deck); }
    persist(); m.close(); after?.(deck);
  };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  m = modal({ title: deck ? 'Redigér sæt' : 'Nyt sæt', size: 460,
    body: h('div', { class: 'fc-form' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Farve'), sw)),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: save }, deck ? 'Gem' : 'Opret')] });
}

// ── overview ──
function overview(app) {
  const due = studyCount('all');
  const reviewedToday = st.log[today()] || 0;
  const grid = h('div', { class: 'fc-decks' });
  const forecast = () => {
    const base = startOfDay();
    const days = Array.from({ length: 7 }, (_, i) => st.cards.filter(c => !isNew(c) && (i === 0 ? c.due <= base + DAY - 1 : c.due >= base + i * DAY && c.due < base + (i + 1) * DAY)).length);
    const max = Math.max(1, ...days);
    const names = ['I dag', 'I morgen', ...Array.from({ length: 5 }, (_, i) => new Date(base + (i + 2) * DAY).toLocaleDateString('da-DK', { weekday: 'short' }))];
    return h('section', { class: 'glass panel fc-forecast', 'aria-label': 'Kort der forfalder de næste 7 dage' },
      h('h3', null, 'De næste 7 dage'),
      h('div', { class: 'fc-bars' }, days.map((n, i) => h('div', { class: 'fc-bar', title: `${names[i]}: ${n} kort` }, h('span', { class: 'fc-bar-n' }, String(n)), h('span', { class: 'fc-bar-fill', style: { height: `${Math.round(n / max * 100)}%` } }), h('span', { class: 'fc-bar-l' }, names[i])))));
  };
  const draw = () => {
    h(clear(grid), null, st.decks.length ? st.decks.map(d => {
      const n = deckCards(d.id).length, s = studyCount(d.id), nw = newCount(d.id);
      const learned = deckCards(d.id).filter(c => c.ivl >= 21).length;
      return h('article', { class: 'fc-deck glass', style: { '--c': d.color } },
        h('a', { class: 'fc-deck-main', href: `#/learn/flashcards/deck/${d.id}` },
          h('span', { class: 'fc-deck-stack', 'aria-hidden': 'true' }, h('span'), h('span'), h('span', null, icon('layers'))),
          h('h3', null, d.name),
          h('div', { class: 'fc-deck-meta' }, h('span', null, `${n} kort`), nw ? h('span', null, `${nw} nye`) : null, learned ? h('span', null, `${learned} lært`) : null)),
        progressBar(n ? Math.round(learned / n * 100) : 0, { app: d.color, label: `${d.name}: ${learned} af ${n} kort lært` }),
        h('div', { class: 'fc-deck-actions' },
          s ? h('a', { class: 'btn btn-sm app-solid', href: `#/learn/flashcards/study/${d.id}`, style: { '--app': d.color } }, icon('play'), `Gennemgå ${s}`) : h('span', { class: 'chip chip-ok' }, icon('check'), 'Færdig for i dag'),
          h('a', { class: 'btn btn-sm btn-ghost', href: `#/learn/flashcards/deck/${d.id}` }, 'Åbn')));
    }) : stateBlock({ icon: 'layers', title: 'Ingen sæt endnu', text: 'Lav dit første sæt huskekort – eller hent spørgsmålene fra Kodeskolen.' }));
  };
  draw();
  return h('div', { class: 'page flashcards-page', style: { '--app': app.hue } },
    appHero(app, {
      eyebrow: 'Læring', title: 'Huskekort', lead: 'Lær hvad som helst udenad med gentagelser på de rigtige tidspunkter: kort du kan, kommer sjældnere – kort du glemmer, kommer hurtigt igen.',
      actions: [due ? heroBtn(`Gennemgå ${due} kort`, 'play', { href: '#/learn/flashcards/study/all' }) : null, heroGhost('Nyt sæt', 'plus', { onclick: () => deckDialog(null, (d) => { location.hash = `#/learn/flashcards/deck/${d.id}`; }) })].filter(Boolean),
      stats: [
        { icon: 'clock', label: 'Klar i dag', value: String(due) },
        { icon: 'layers', label: 'Kort i alt', value: String(st.cards.length) },
        { icon: 'checkCircle', label: 'Gennemgået i dag', value: String(reviewedToday) },
        { icon: 'flame', label: 'Dage i træk', value: String(streak()) }],
    }),
    h('div', { class: 'fc-top' }, forecast(),
      h('section', { class: 'glass panel fc-import' }, h('h3', null, 'Fra Kodeskolen'), h('p', { class: 'muted' }, 'Lav huskekort af quizspørgsmålene fra de lektioner, du har gennemført.'),
        h('button', { class: 'btn', onclick: async () => { const d = await importFromCodeschool(); location.hash = `#/learn/flashcards/deck/${d.id}`; } }, icon('graduation'), 'Hent quizspørgsmål'))),
    grid);
}

// ── one deck ──
function deckPage(app, deck) {
  let q = '';
  const list = h('div', { class: 'fc-cards' });
  const count = h('span', { class: 'faint' });
  const front = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Forside – spørgsmål eller begreb', 'aria-label': 'Forside på nyt kort' });
  const back = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Bagside – svar', 'aria-label': 'Bagside på nyt kort' });
  const add = () => {
    if (!front.value.trim() || !back.value.trim()) { (front.value.trim() ? back : front).focus(); return; }
    st.cards.push({ id: uid(), deck: deck.id, front: front.value.trim(), back: back.value.trim(), created: Date.now(), due: 0, reps: 0, ivl: 0, ease: 2.5, lapses: 0 });
    front.value = ''; back.value = ''; front.focus(); persist(); draw();
  };
  [front, back].forEach(t => t.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); add(); } }));
  const when = (c) => isNew(c) ? 'Ny' : isDue(c) ? 'Klar i dag' : `Om ${Math.max(1, Math.round((c.due - startOfDay()) / DAY))} d`;
  const draw = () => {
    const all = deckCards(deck.id), cs = all.filter(c => !q || (c.front + ' ' + c.back).toLowerCase().includes(q));
    count.textContent = `${all.length} kort`;
    h(clear(list), null, cs.length ? cs.map(c => h('article', { class: 'fc-card glass' },
      h('div', { class: 'fc-card-side' }, h('span', { class: 'fc-side-l' }, 'Forside'), h('div', { class: 'fc-text' }, c.front)),
      h('div', { class: 'fc-card-side' }, h('span', { class: 'fc-side-l' }, 'Bagside'), h('div', { class: 'fc-text' }, c.back)),
      h('div', { class: 'fc-card-foot' },
        h('span', { class: ['chip', isNew(c) ? '' : isDue(c) ? 'chip-app' : ''] }, when(c)),
        c.lapses ? h('span', { class: 'faint', title: 'Antal gange glemt' }, `Glemt ${c.lapses}×`) : null,
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'icon-btn', 'aria-label': 'Redigér kort', onclick: () => cardDialog({ title: 'Redigér kort', card: c, onSave: (f, b) => { c.front = f; c.back = b; persist(); draw(); } }) }, icon('edit')),
        h('button', { class: 'icon-btn', 'aria-label': 'Slet kort', onclick: () => { const i = st.cards.indexOf(c); st.cards.splice(i, 1); persist(); draw(); toast('Kort slettet', { action: { label: 'Fortryd', onClick: () => { st.cards.splice(i, 0, c); persist(); draw(); } } }); } }, icon('trash'))))) :
      stateBlock({ icon: 'layers', title: q ? 'Ingen kort matcher' : 'Ingen kort i sættet', text: q ? '' : 'Skriv forside og bagside ovenfor – eller importér en liste.' }));
  };
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i kortene…', 'aria-label': 'Søg i kortene' });
  search.addEventListener('input', debounce(() => { q = search.value.trim().toLowerCase(); draw(); }, 100));
  const importDlg = () => {
    const ta = h('textarea', { class: 'textarea', rows: 8, placeholder: 'Ohms lov;U = R · I\nEnhed for modstand;Ohm (Ω)', 'aria-label': 'Kort der skal importeres' });
    const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,text/plain,text/csv', class: 'sr-only', id: 'fc-file' });
    file.addEventListener('change', async () => { const f = file.files[0]; if (f) ta.value = await f.text(); });
    let m;
    m = modal({ title: 'Importér kort', size: 560,
      body: h('div', { class: 'fc-form' }, h('p', { class: 'muted' }, 'Én linje pr. kort: forside og bagside adskilt af semikolon (;) eller tabulator – fx kopieret fra Excel. Tekst med linjeskift skal stå i anførselstegn.'), ta,
        h('label', { class: 'btn btn-sm', for: 'fc-file' }, icon('upload'), 'Vælg fil (.csv / .txt)'), file),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'), h('button', { class: 'btn btn-primary', onclick: () => {
        const rows = parseCards(ta.value);
        if (!rows.length) { toast('Fandt ingen kort', { type: 'warn', text: 'Brug ; eller tabulator mellem forside og bagside.' }); return; }
        const now = Date.now();
        rows.forEach(([f, b]) => st.cards.push({ id: uid(), deck: deck.id, front: f, back: b, created: now, due: 0, reps: 0, ivl: 0, ease: 2.5, lapses: 0 }));
        persist(); draw(); m.close(); toast(`${rows.length} kort importeret`, { type: 'ok' });
      } }, 'Importér')] });
  };
  const exportCsv = () => {
    const txt = '﻿' + deckCards(deck.id).map(c => `${csvCell(c.front)};${csvCell(c.back)}`).join('\r\n');
    saveBlob(`${deck.name.replace(/[\\/:*?"<>|]/g, '')}.csv`, new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  };
  const del = async () => {
    if (!(await confirmDialog({ title: `Slet “${deck.name}”?`, text: `Sættet og dets ${deckCards(deck.id).length} kort slettes.`, confirmLabel: 'Slet sæt', danger: true }))) return;
    st.cards = st.cards.filter(c => c.deck !== deck.id); st.decks = st.decks.filter(d => d !== deck); persist(); location.hash = '#/learn/flashcards';
  };
  const s = studyCount(deck.id);
  draw();
  return h('div', { class: 'page flashcards-page', style: { '--app': deck.color } },
    appHero({ ...app, hue: deck.color }, {
      eyebrow: 'Huskekort · sæt', title: deck.name, compact: true, back: { href: '#/learn/flashcards', label: 'Tilbage til Huskekort' },
      actions: [s ? heroBtn(`Gennemgå ${s}`, 'play', { href: `#/learn/flashcards/study/${deck.id}` }) : null, deckCards(deck.id).length ? heroGhost('Øv alle', 'refresh', { href: `#/learn/flashcards/cram/${deck.id}`, title: 'Gennemgå alle kort uden at ændre planen' }) : null].filter(Boolean),
      stats: [{ icon: 'layers', label: 'Kort', value: String(deckCards(deck.id).length) }, { icon: 'clock', label: 'Klar i dag', value: String(s) }, { icon: 'sparkles', label: 'Nye', value: String(newCount(deck.id)) }],
    }),
    h('section', { class: 'glass panel fc-add' },
      h('h3', null, 'Nyt kort'),
      h('div', { class: 'fc-add-grid' }, front, back),
      h('div', { class: 'fc-add-foot' }, h('button', { class: 'btn app-solid', onclick: add }, icon('plus'), 'Tilføj kort'), h('span', { class: 'faint' }, 'Ctrl+Enter'),
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: importDlg }, icon('upload'), 'Importér'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: exportCsv }, icon('download'), 'CSV'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => deckDialog(deck, () => navigate(location.hash, { replace: true })) }, icon('edit'), 'Omdøb'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: del }, icon('trash'), 'Slet sæt'))),
    h('div', { class: 'fc-list-head' }, search, count),
    list);
}

// ── study session ──
function studyPage(app, deckId, cram) {
  const deck = deckId === 'all' ? null : st.decks.find(d => d.id === deckId);
  const color = deck?.color || app.hue;
  const pool = deckCards(deckId);
  const queue = cram ? [...pool].sort(() => Math.random() - 0.5)
    : [...pool.filter(c => !isNew(c) && isDue(c)).sort((a, b) => a.due - b.due), ...pool.filter(isNew).sort((a, b) => a.created - b.created).slice(0, NEW_PER_SESSION)];
  const total = queue.length;
  let done = 0, again = 0, shown = false, cur = null, reviewed = 0;
  const stage = h('div', { class: 'fc-stage' });
  const bar = h('div');
  const counter = h('span', { class: 'mono faint' });
  const back = deck ? `#/learn/flashcards/deck/${deck.id}` : '#/learn/flashcards';

  const finish = () => {
    removeEventListener('keydown', onKey);
    const pct = reviewed ? Math.round((reviewed - again) / reviewed * 100) : 0;
    h(clear(stage), null, h('div', { class: 'fc-done glass panel' },
      h('div', { class: 'fc-done-icon' }, icon('trophy')),
      h('h2', null, total ? 'Færdig for nu!' : 'Ingen kort er klar'),
      h('p', { class: 'muted' }, total ? `${reviewed} gennemgange · ${pct} % husket i første forsøg${cram ? '' : ` · +${reviewed * XP_REVIEW} XP`}` : 'Kom tilbage i morgen – eller brug “Øv alle” for at øve uden at ændre planen.'),
      h('div', { class: 'fc-done-actions' }, h('a', { class: 'btn btn-primary', href: back }, 'Tilbage'), deck && !cram ? h('a', { class: 'btn', href: `#/learn/flashcards/cram/${deck.id}` }, 'Øv alle kort') : null)));
    if (reviewed && !cram) { logActivity('flashcards', 'review', deck ? deck.name : 'Huskekort', `${reviewed} kort gennemgået · +${reviewed * XP_REVIEW} XP`); refreshSummary?.(); }
    flushState('flashcards');
  };
  const next = () => {
    h(clear(bar), null, progressBar(total ? Math.round(done / total * 100) : 100, { app: color, label: `${done} af ${total} kort` }));
    counter.textContent = `${done}/${total}`;
    cur = queue.shift();
    if (!cur) { finish(); return; }
    shown = false;
    drawCard();
  };
  const grade = (g) => {
    if (!shown || !cur) return;
    reviewed++;
    if (!cram) {
      Object.assign(cur, schedule(cur, g));
      st.log[today()] = (st.log[today()] || 0) + 1;
      st.reviews = (st.reviews || 0) + 1;
      persist();
    }
    if (g === 1) { again++; queue.push(cur); } else done++;
    next();
  };
  const flip = () => { if (!shown) { shown = true; drawCard(); } };
  function drawCard() {
    const deckName = st.decks.find(d => d.id === cur.deck)?.name;
    h(clear(stage), null,
      h('div', { class: ['fc-flash', 'glass', shown && 'is-shown'], 'aria-live': 'polite' },
        deckId === 'all' && deckName ? h('div', { class: 'fc-flash-deck' }, deckName) : null,
        h('div', { class: 'fc-flash-front' }, cur.front),
        shown ? h('div', { class: 'fc-flash-back' }, cur.back) : null),
      shown
        ? h('div', { class: 'fc-grades', role: 'group', 'aria-label': 'Hvor godt huskede du det?' }, GRADES.map(gr => h('button', { class: ['fc-grade', gr.cls], onclick: () => grade(gr.g) },
          h('b', null, gr.label), h('span', null, cram ? `tast ${gr.key}` : `${nextLabel(cur, gr.g)} · ${gr.key}`))))
        : h('div', { class: 'fc-grades' }, h('button', { class: 'btn btn-primary fc-show', onclick: flip, autofocus: true }, 'Vis svar', h('span', { class: 'kbd' }, 'Mellemrum'))));
    stage.querySelector('.fc-show, .fc-grade.is-good')?.focus({ preventScroll: true });
  }
  removeEventListener('keydown', onKey);
  onKey = (e) => {
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === ' ' || e.key === 'Enter') && !shown) { e.preventDefault(); flip(); }
    else if (shown && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(Number(e.key)); }
  };
  addEventListener('keydown', onKey);
  next();
  return h('div', { class: 'page flashcards-page fc-study', style: { '--app': color } },
    h('div', { class: 'fc-study-head on-world' },
      h('a', { class: 'icon-btn', href: back, 'aria-label': 'Afslut gennemgang' }, icon('x')),
      h('div', { class: 'fc-study-title' }, h('b', null, deck ? deck.name : 'Alle sæt'), h('span', null, cram ? 'Øv alle – planen ændres ikke' : 'Gennemgang')),
      counter),
    bar, stage,
    h('p', { class: 'faint on-world fc-keys' }, 'Mellemrum = vis svar · 1 Igen · 2 Svært · 3 Godt · 4 Let'));
}

export default {
  title: 'Huskekort',
  destroy() { flushState('flashcards'); removeEventListener('keydown', onKey); },
  async render(ctx) {
    const app = appById('flashcards');
    try { st = (await getState('flashcards', { force: true })) || null; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Huskekort kunne ikke hentes', text: e.message })); }
    if (!st || !Array.isArray(st.decks)) { st = SAMPLE(); persist(); }
    st.cards ||= []; st.log ||= {};
    const { sub, id } = ctx.params || {};
    if (sub === 'study' || sub === 'cram') {
      if (id !== 'all' && !st.decks.some(d => d.id === id)) return h('div', { class: 'page' }, stateBlock({ icon: 'alert', title: 'Sættet findes ikke', actions: [h('a', { class: 'btn', href: '#/learn/flashcards' }, 'Til Huskekort')] }));
      return studyPage(app, id, sub === 'cram');
    }
    if (sub === 'deck') {
      const d = st.decks.find(x => x.id === id);
      if (!d) return h('div', { class: 'page' }, stateBlock({ icon: 'alert', title: 'Sættet findes ikke', actions: [h('a', { class: 'btn', href: '#/learn/flashcards' }, 'Til Huskekort')] }));
      return deckPage(app, d);
    }
    return overview(app);
  },
};
