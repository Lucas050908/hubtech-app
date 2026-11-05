/** Vaner – small habits: tick today (or a day you forgot), daily or a few times a week, see the last 4 weeks and your streak. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, modal } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid, todayKey } from '../features/appkit.js';
import { streak, weekCount, mondayKey } from '../features/habitlogic.js';
import { celebrate } from '../features/celebrate.js';

const SUGGEST = [['Drik 2 liter vand', '💧', 7], ['Gå en tur', '🚶', 7], ['Læs 20 minutter', '📚', 5], ['Træn', '💪', 3], ['Ingen skærm efter kl. 22', '🌙', 7], ['Lær ét nyt IT-ord', '🧠', 5]];
const EMOJI = ['💧', '🚶', '📚', '⌨️', '🌙', '💪', '🧠', '🥗', '🎸', '🧘', '✍️', '⭐'];
const DAYNAME = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const dayKeyBack = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d.getTime()); };
const goalText = (g) => (!g || g >= 7 ? 'Hver dag' : `${g} ${g === 1 ? 'gang' : 'gange'} om ugen`);

export default {
  title: 'Vaner',
  async render() {
    const app = appById('habits');
    let store;
    try { store = await appState('habits', { habits: [] }); } catch (e) { return loadError('Vaner', e); }
    const st = store.data;
    const list = h('div', { class: 'hb-list' });
    const todayEl = h('span'), bestEl = h('span'), weekEl = h('span');

    const setDay = (x, k, on) => {
      x.days = on ? [...new Set([...x.days, k])].sort().slice(-400) : x.days.filter(d => d !== k);
      store.save();
    };
    function celebrate(x, k) {
      const s = streak(x.days, x.goal, todayKey());
      if (k === todayKey()) {
        if ((!x.goal || x.goal >= 7) && s > 1 && s % 7 === 0) toast(`${s} dage i træk!`, { type: 'xp', text: x.name });
        else if (x.goal && x.goal < 7 && weekCount(x.days, todayKey()) === x.goal) toast('Ugens mål er nået! 🎯', { type: 'xp', text: `${x.name} – ${goalText(x.goal).toLowerCase()}` });
        if (st.habits.length > 1 && st.habits.every(y => y.days.includes(k))) { toast('Alle vaner klaret i dag! 🎉', { type: 'ok', text: 'Godt gået.' }); celebrate(null, { count: 40, spread: 1.6 }); }
      }
    }
    function editHabit(x) {
      const name = h('input', { class: 'input', value: x.name, maxlength: 60, 'aria-label': 'Navn' });
      let emoji = x.emoji || '⭐', goal = x.goal || 7;
      const er = h('div', { class: 'hb-emojis', role: 'radiogroup', 'aria-label': 'Ikon' });
      const drawE = () => h(clear(er), null, EMOJI.map(e => h('button', { type: 'button', class: ['hb-e', e === emoji && 'is-on'], role: 'radio', 'aria-checked': String(e === emoji), 'aria-label': e, onclick: () => { emoji = e; drawE(); } }, e)));
      drawE();
      const gs = h('select', { class: 'select', 'aria-label': 'Mål' }, [7, 6, 5, 4, 3, 2, 1].map(g => h('option', { value: g, selected: g === goal }, goalText(g))));
      const m = modal({ title: 'Redigér vane', label: 'Vaner', size: 460,
        body: h('div', { class: 'stack', style: { gap: '12px' } }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Navn'), name), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Mål'), gs), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ikon'), er)),
        actions: [
          h('button', { class: 'btn btn-ghost', style: { marginRight: 'auto', color: 'var(--bad)' }, onclick: () => { m.close(); remove(x); } }, icon('trash'), 'Slet'),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Annuller'),
          h('button', { class: 'btn btn-primary', onclick: () => { if (!name.value.trim()) { name.focus(); return; } Object.assign(x, { name: name.value.trim(), emoji, goal: Number(gs.value) }); store.save(); m.close(); draw(); } }, 'Gem')] });
    }
    function remove(x) {
      const i = st.habits.indexOf(x);
      st.habits.splice(i, 1); store.save(); draw();
      toast('Vanen er slettet', { text: x.name, action: { label: 'Fortryd', onClick: () => { st.habits.splice(i, 0, x); store.save(); draw(); } } });
    }
    function move(x, dir) {
      const i = st.habits.indexOf(x), j = i + dir;
      if (j < 0 || j >= st.habits.length) return;
      [st.habits[i], st.habits[j]] = [st.habits[j], st.habits[i]]; store.save(); draw();
      list.querySelectorAll('.hb-item')[j]?.querySelector('.hb-check')?.focus();
    }

    function draw() {
      clear(list);
      const tk = todayKey();
      todayEl.textContent = st.habits.length ? `${st.habits.filter(x => x.days.includes(tk)).length}/${st.habits.length}` : '–';
      bestEl.textContent = String(Math.max(0, ...st.habits.map(x => streak(x.days, x.goal, tk))));
      const weekly = st.habits.filter(x => x.goal && x.goal < 7);
      weekEl.textContent = weekly.length ? `${weekly.filter(x => weekCount(x.days, tk) >= x.goal).length}/${weekly.length}` : '–';
      if (!st.habits.length) {
        list.append(h('div', { class: 'hb-empty' }, h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen vaner endnu. Start småt – vælg en herunder, eller skriv din egen.'),
          h('div', { class: 'hb-sugg' }, SUGGEST.map(([n, e, g]) => h('button', { type: 'button', class: 'chip', onclick: () => { st.habits.push({ id: uid(), name: n, emoji: e, goal: g, days: [], created: Date.now() }); store.save(); draw(); } }, `${e} ${n}`)))));
        return;
      }
      st.habits.forEach((x, idx) => {
        const done = x.days.includes(tk);
        const s = streak(x.days, x.goal, tk), weekly = x.goal && x.goal < 7;
        const check = h('button', { class: ['hb-check', done && 'is-on'], 'aria-pressed': String(done), 'aria-label': done ? `Fjern flueben for i dag: ${x.name}` : `Sæt flueben for i dag: ${x.name}`, title: 'I dag · Alt+↑↓ flytter' }, icon('check'));
        check.addEventListener('click', () => { setDay(x, tk, !done); draw(); if (!done) celebrate(x, tk); list.querySelectorAll('.hb-check')[idx]?.focus(); });
        check.addEventListener('keydown', (e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(x, e.key === 'ArrowUp' ? -1 : 1); } });
        const days = h('div', { class: 'hb-days', role: 'group', 'aria-label': 'De sidste 28 dage – tryk for at rette en dag' },
          Array.from({ length: 28 }, (_, i) => {
            const k = dayKeyBack(27 - i), on = x.days.includes(k), d = new Date(k + 'T12:00:00');
            return h('button', { type: 'button', class: ['hb-day', on && 'is-on', i === 27 && 'is-today', k >= mondayKey(tk) && 'is-week'], 'aria-pressed': String(on), 'aria-label': `${DAYNAME[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}${on ? ', klaret' : ''}`, title: `${DAYNAME[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`,
              onclick: () => { setDay(x, k, !on); draw(); if (!on) celebrate(x, k); } });
          }));
        const sub = weekly ? `${goalText(x.goal)} · denne uge ${weekCount(x.days, tk)}/${x.goal}${s ? ` · ${s} ${s === 1 ? 'uge' : 'uger'} i træk` : ''}` : `${s} ${s === 1 ? 'dag' : 'dage'} i træk · ${x.days.filter(d => d >= dayKeyBack(29)).length} af de sidste 30 dage`;
        list.append(h('article', { class: ['hb-item glass', done && 'is-done'] },
          check, h('span', { class: 'hb-emoji', 'aria-hidden': 'true' }, x.emoji || '⭐'),
          h('div', { class: 'hb-main' }, h('b', null, x.name), h('span', { class: 'faint' }, sub), days),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': `Redigér ${x.name}`, title: 'Redigér', onclick: () => editHabit(x) }, icon('edit'))));
      });
    }
    let emoji = EMOJI[0], goal = 7;
    const emojiRow = h('div', { class: 'hb-emojis', role: 'radiogroup', 'aria-label': 'Ikon' }, EMOJI.map(e => {
      const b = h('button', { class: ['hb-e', e === emoji && 'is-on'], role: 'radio', 'aria-checked': String(e === emoji), 'aria-label': e }, e);
      b.addEventListener('click', () => { emoji = e; emojiRow.querySelectorAll('.hb-e').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', String(x === b)); }); });
      return b;
    }));
    const name = h('input', { class: 'input', placeholder: 'Ny vane – fx “Gå en tur”', maxlength: 60, list: 'hb-sugg', 'aria-label': 'Ny vane' });
    const goalSel = h('select', { class: 'select', 'aria-label': 'Hvor tit', onchange: (e) => { goal = Number(e.target.value); } }, [7, 6, 5, 4, 3, 2, 1].map(g => h('option', { value: g }, goalText(g))));
    const add = () => { const n = name.value.trim(); if (!n) { name.focus(); return; } st.habits.push({ id: uid(), name: n, emoji, goal, days: [], created: Date.now() }); name.value = ''; store.save(); draw(); };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    draw();
    return h('div', { class: 'page hb-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Arbejdsrum', title: 'Vaner', lead: 'Små vaner hver dag bliver til store resultater. Sæt flueben – glemte du en dag, så tryk på den i rækken.',
        stats: [{ icon: 'checkCircle', label: 'I dag', value: todayEl }, { icon: 'flame', label: 'Længste stime nu', value: bestEl }, { icon: 'calendar', label: 'Ugemål nået', value: weekEl }] }),
      panel('Dine vaner', 'flame', list),
      panel('Tilføj en vane', 'plus', h('div', { class: 'hb-add' }, name, goalSel, h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Tilføj')), emojiRow,
        h('datalist', { id: 'hb-sugg' }, SUGGEST.map(([s]) => h('option', { value: s })))));
  },
};
