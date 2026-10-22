/** Vaner – small daily habits: tick today, see the last 4 weeks and your streak. Kept on the account. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid, todayKey } from '../features/appkit.js';

const SUGGEST = ['Drik 2 liter vand', 'Gå en tur', 'Læs 20 minutter', 'Øv tastatur i 10 minutter', 'Ingen skærm efter kl. 22', 'Træn', 'Lær ét nyt IT-ord'];
const EMOJI = ['💧', '🚶', '📚', '⌨️', '🌙', '💪', '🧠', '🥗', '🎸', '🧘', '✍️', '⭐'];
const dayKeyBack = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d.getTime()); };

function streak(h_) {
  let s = 0;
  for (let i = h_.days.includes(todayKey()) ? 0 : 1; ; i++) { if (h_.days.includes(dayKeyBack(i))) s++; else break; }
  return s;
}

export default {
  title: 'Vaner',
  async render() {
    const app = appById('habits');
    let store;
    try { store = await appState('habits', { habits: [] }); } catch (e) { return loadError('Vaner', e); }
    const st = store.data;
    const list = h('div', { class: 'hb-list' });
    const todayEl = h('span'), bestEl = h('span');

    function draw() {
      clear(list);
      const tk = todayKey();
      todayEl.textContent = st.habits.length ? `${st.habits.filter(x => x.days.includes(tk)).length}/${st.habits.length}` : '–';
      bestEl.textContent = String(Math.max(0, ...st.habits.map(streak)));
      if (!st.habits.length) { list.append(h('p', { class: 'faint' }, 'Ingen vaner endnu. Tilføj en herunder – start småt.')); return; }
      for (const x of st.habits) {
        const done = x.days.includes(tk);
        const check = h('button', { class: ['hb-check', done && 'is-on'], 'aria-pressed': String(done), 'aria-label': done ? `Fjern flueben for i dag: ${x.name}` : `Sæt flueben for i dag: ${x.name}` }, icon('check'));
        check.addEventListener('click', () => {
          x.days = done ? x.days.filter(d => d !== tk) : [...x.days, tk].slice(-400);
          store.save(); draw();
          if (!done) { const s = streak(x); if (s > 1 && s % 7 === 0) toast(`${s} dage i træk!`, { type: 'xp', text: x.name }); }
        });
        const weeks = h('div', { class: 'hb-days', 'aria-label': 'De sidste 28 dage' },
          Array.from({ length: 28 }, (_, i) => { const k = dayKeyBack(27 - i); return h('i', { class: [x.days.includes(k) && 'is-on', i === 27 && 'is-today'], title: k }); }));
        const del = h('button', { class: 'icon-btn btn-sm', 'aria-label': `Slet ${x.name}` }, icon('trash'));
        del.addEventListener('click', async () => { if (await confirmDialog({ title: 'Slet vanen?', text: `“${x.name}” og dens historik slettes.`, confirmLabel: 'Slet', danger: true })) { st.habits = st.habits.filter(y => y.id !== x.id); store.save(); draw(); } });
        list.append(h('article', { class: ['hb-item glass', done && 'is-done'] },
          check, h('span', { class: 'hb-emoji', 'aria-hidden': 'true' }, x.emoji || '⭐'),
          h('div', { class: 'hb-main' }, h('b', null, x.name), h('span', { class: 'faint' }, `${streak(x)} dage i træk · ${x.days.filter(d => d >= dayKeyBack(29)).length} af de sidste 30 dage`), weeks),
          del));
      }
    }
    let emoji = EMOJI[0];
    const emojiRow = h('div', { class: 'hb-emojis', role: 'radiogroup', 'aria-label': 'Ikon' }, EMOJI.map(e => {
      const b = h('button', { class: ['hb-e', e === emoji && 'is-on'], role: 'radio', 'aria-checked': String(e === emoji), 'aria-label': e }, e);
      b.addEventListener('click', () => { emoji = e; emojiRow.querySelectorAll('.hb-e').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', String(x === b)); }); });
      return b;
    }));
    const name = h('input', { class: 'input', placeholder: 'Ny vane – fx “Gå en tur”', maxlength: 60, list: 'hb-sugg', 'aria-label': 'Ny vane' });
    const add = () => { const n = name.value.trim(); if (!n) return; st.habits.push({ id: uid(), name: n, emoji, days: [], created: Date.now() }); name.value = ''; store.save(); draw(); };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    draw();
    return h('div', { class: 'page hb-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Arbejdsrum', title: 'Vaner', lead: 'Små vaner hver dag bliver til store resultater. Sæt flueben, og se din stime vokse.',
        stats: [{ icon: 'checkCircle', label: 'I dag', value: todayEl }, { icon: 'flame', label: 'Længste stime nu', value: bestEl }] }),
      panel('Dine vaner', 'flame', list),
      panel('Tilføj en vane', 'plus', h('div', { class: 'hb-add' }, name, h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj')), emojiRow,
        h('datalist', { id: 'hb-sugg' }, SUGGEST.map(s => h('option', { value: s })))));
  },
};
