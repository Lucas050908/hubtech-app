/** Kommandoer – search the commands an IT supporter uses, see what they do, copy them. Favourites are kept on the account. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, codeBlock, appState, loadError } from '../features/appkit.js';
import { CMD_GROUPS, COMMANDS, OS_LABEL } from '../data/commands.js';

const keyOf = (c) => c.os + ':' + c.cmd;

export default {
  title: 'Kommandoer',
  async render() {
    const app = appById('commands');
    let store;
    try { store = await appState('commands', { fav: [], os: 'all' }); } catch (e) { return loadError('Kommandoer', e); }
    const st = store.data;
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Søg – fx “dns”, “printer”, “serienummer”', 'aria-label': 'Søg i kommandoer' });
    let group = 'all';
    const list = h('div', { class: 'cmd-list' });
    const osSeg = segmented([{ value: 'all', label: 'Alle' }, { value: 'win', label: 'Windows' }, { value: 'mac', label: 'Mac' }, { value: 'linux', label: 'Linux' }], st.os || 'all', (v) => { st.os = v; store.save(); draw(); }, { label: 'Styresystem' });
    const groupSeg = segmented([{ value: 'all', label: 'Alle' }, { value: 'fav', label: '★ Favoritter' }, ...CMD_GROUPS.map(g => ({ value: g.id, label: g.label }))], 'all', (v) => { group = v; draw(); }, { label: 'Emne' });
    const osOk = (c) => st.os === 'all' || c.os === st.os || c.os === 'any' || (c.os === 'unix' && (st.os === 'mac' || st.os === 'linux'));

    function draw() {
      const s = q.value.trim().toLowerCase();
      const items = COMMANDS.filter(c => osOk(c) && (group === 'all' || (group === 'fav' ? st.fav.includes(keyOf(c)) : c.g === group)) && (!s || (c.cmd + ' ' + c.d).toLowerCase().includes(s)));
      clear(list);
      if (!items.length) { list.append(h('p', { class: 'faint' }, group === 'fav' ? 'Ingen favoritter endnu – tryk på stjernen ved en kommando.' : 'Ingen kommandoer matcher.')); return; }
      for (const c of items) {
        const fav = st.fav.includes(keyOf(c));
        const star = h('button', { class: ['icon-btn', 'cmd-star', fav && 'is-on'], 'aria-label': fav ? 'Fjern fra favoritter' : 'Føj til favoritter', 'aria-pressed': String(fav), title: 'Favorit' }, icon(fav ? 'starFill' : 'star'));
        star.addEventListener('click', () => { st.fav = fav ? st.fav.filter(k => k !== keyOf(c)) : [...st.fav, keyOf(c)]; store.save(); draw(); });
        list.append(h('article', { class: 'cmd glass' },
          h('div', { class: 'cmd-top' },
            h('span', { class: ['chip', `cmd-os-${c.os}`] }, OS_LABEL[c.os]),
            c.admin ? h('span', { class: 'chip chip-warn', title: 'Kør som administrator / med sudo' }, icon('shield'), 'Administrator') : null,
            h('span', { class: 'faint cmd-group' }, CMD_GROUPS.find(g => g.id === c.g)?.label),
            star),
          codeBlock(c.cmd),
          h('p', { class: 'cmd-desc' }, c.d)));
      }
    }
    q.addEventListener('input', draw);
    draw();
    return h('div', { class: 'page cmd-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Support', title: 'Kommandoer', lead: 'De kommandoer en IT-supporter bruger mest – med en forklaring på almindeligt dansk. Tryk på kopiér, og sæt ind i kommandoprompten eller Terminal.',
        stats: [{ icon: 'terminal', label: 'Kommandoer', value: String(COMMANDS.length) }, { icon: 'layers', label: 'Emner', value: String(CMD_GROUPS.length) }, { icon: 'starFill', label: 'Favoritter', value: String(st.fav.length) }] }),
      panel(null, null, h('div', { class: 'cmd-filters' }, q, osSeg, groupSeg),
        h('p', { class: 'faint small', style: { margin: '8px 0 0' } }, 'Windows: åbn kommandoprompten med Start → skriv “cmd”. “Administrator” = højreklik → Kør som administrator. PowerShell-kommandoer køres i PowerShell.')),
      list);
  },
};
