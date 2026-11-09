/** Hjem — the personal start screen (logged in). */
import { h, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { icon, tileIcon } from '../core/icons.js';
import { store, refreshSummary } from '../core/store.js';
import { appById, isLearnApp, entryApps, access, visible } from '../core/registry.js';
import { todayPanel, buildToday } from '../features/today.js';
import { getState } from '../core/services.js';
import { buildStats, greeting, gnistTip, gnistBrief } from '../features/widgetlogic.js';
import { gnist } from '../core/icons.js';
import { appGlyph } from '../core/appicons.js';
import { widgetPrefs, openCustomize, onWeather } from '../features/topwidgets.js';
import { appCard, profileCard, activityPanel, shortcutsPanel, worldQuickPanel, seasonStrip, projectsPreview, learningPreview, panel } from '../features/widgets.js';

let unsub = [];

export default {
  title: 'Hjem',
  focus: 0,
  destroy() { unsub.forEach(f => f()); unsub = []; },
  render() {
    const u = store.get('user');
    const first = u.displayName.split(' ')[0];
    const pinned = entryApps([...new Set([...(store.get('prefs').pinnedApps || []), 'learning'])]).filter(a => !isLearnApp(a)).slice(0, 4);
    const profileSlot = h('div');
    const renderProfile = (s) => profileSlot.replaceChildren(profileCard(s));
    renderProfile(store.get('summary'));
    unsub.push(store.on('summary', renderProfile));
    refreshSummary();

    // ── the desert design's overview: a big clock with the weather and a greeting, four numbers, I dag and "Fortsæt" ──
    const clock = h('div', { class: 'home-clock', 'aria-hidden': 'true' });
    const tick = () => { clock.textContent = new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }).replace('.', ':'); };
    tick();
    const clockTimer = setInterval(() => { if (!clock.isConnected) { clearInterval(clockTimer); return; } tick(); }, 15000);
    unsub.push(() => clearInterval(clockTimer));
    const wx = h('div', { class: 'home-wx' });
    unsub.push(onWeather((x) => {
      if (!x) { clear(wx); return; }
      h(clear(wx), null, h('span', { class: 'home-wx-ic' }, icon(x.icon)), h('span', null, h('b', null, `${x.temp} °C`), h('small', null, x.text)));
      wx.title = x.city; wx.setAttribute('aria-label', `Vejret i ${x.city}: ${x.temp} grader, ${x.text.toLowerCase()}`);
    }));
    // "God aften, Lucas." in big letters – what the day holds goes in the line under it
    const greet = h('h1', { id: 'hero-title', class: 'home-title home-greet' });
    const dayLine = h('p', { class: 'home-dayline' });
    const setGreeting = (agenda) => {
      const [hello, rest = ''] = greeting(first, agenda).split(' – ');
      const at = hello.lastIndexOf(first);
      h(clear(greet), null, at > -1 ? [hello.slice(0, at), h('em', null, first), hello.slice(at + first.length)] : hello, '.');
      dayLine.textContent = rest ? `${rest[0].toUpperCase()}${rest.slice(1)}.` : '';
    };
    setGreeting([]);
    const tip = h('button', { type: 'button', class: 'home-tip', title: 'Spørg Gnist', onclick: () => import('../ai/panel.js').then(m => m.toggleAssistant(true)) },
      h('span', { class: 'home-tip-mark' }, gnist(30)), h('span', null, h('b', null, 'Tip fra Gnist: '), gnistTip()));
    const date = h('span', { class: 'home-date' }, new Date().toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }));
    const hero = h('section', { class: 'home-hero home-clockrow', 'aria-labelledby': 'hero-title', dataset: { tour: 'clock' } },
      h('div', { class: 'home-clockline' }, date, h('span', { class: 'home-dot', 'aria-hidden': 'true' }), clock, wx), greet, h('div', { class: 'home-under' }, dayLine, tip));

    const stat = (cls) => h('a', { class: ['glass', 'home-stat', cls] }, h('span', { class: 'home-stat-label' }), h('b', { class: 'home-stat-value' }, '–'), h('span', { class: 'home-stat-sub' }));
    const st = { cases: stat('is-cases'), appt: stat('is-appt'), hours: stat('is-hours'), level: stat('is-level') };
    const LABEL = { cases: 'Åbne opgaver', appt: 'Næste aftale', hours: 'Timer denne uge' };
    const drawStats = (x) => {
      for (const k of ['cases', 'appt', 'hours', 'level']) {
        const el = st[k], v = x[k];
        el.href = v.href;
        el.querySelector('.home-stat-label').textContent = k === 'level' ? v.label : LABEL[k];
        el.querySelector('.home-stat-value').textContent = v.value;
        const sub = el.querySelector('.home-stat-sub');
        if (k === 'level') h(clear(sub), null, h('span', { class: 'home-stat-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v.pct), 'aria-label': v.sub }, h('i', { style: { width: `${v.pct}%` } })), h('span', { class: 'home-stat-next' }, v.sub));
        else sub.textContent = v.sub;
        el.classList.toggle('is-warn', !!v.warn); el.classList.toggle('is-hot', !!v.hot);
      }
    };
    const stats = h('section', { class: 'home-stats', 'aria-label': 'Nøgletal', dataset: { tour: 'stats' } }, st.cases, st.appt, st.hours, st.level);
    let states = {};
    const refreshStats = () => drawStats(buildStats({ ...states, summary: store.get('summary') }));
    Promise.all(['calendar', 'tasks', 'timesheet', 'flashcards'].map(k => getState(k).catch(() => null))).then(([calendar, tasks, timesheet, flashcards]) => {
      states = { calendar, tasks, timesheet };
      refreshStats();
      const agenda = buildToday({ calendar, tasks, flashcards }).agenda;
      setGreeting(agenda);
      // Gnist's brief for today replaces the tip when there is something today – a click asks her for the whole plan
      const brief = gnistBrief(agenda);
      if (brief) {
        h(clear(tip), null, h('span', { class: 'home-tip-mark' }, gnist(30, { mood: 'wave' })), h('span', null, h('b', null, 'Gnist i dag: '), brief));
        tip.classList.add('is-brief'); tip.title = 'Spørg Gnist om dagens plan';
        tip.onclick = () => import('../ai/panel.js').then(m => m.askAssistant('Hvad skal jeg nå i dag? Lav en kort plan.'));
      }
    });
    unsub.push(store.on('summary', refreshStats));
    refreshStats();

    // "Fortsæt hvor du slap": the apps you opened last (or a few good places to start)
    let recentApps = [];
    try { recentApps = JSON.parse(localStorage.getItem('hubtech.recentApps') || '[]').map(appById).filter(a => a && a.page && visible(a, u) && access(a, u).ok).slice(0, 4); } catch { /* */ }
    const starters = ['hubtech', 'learning', 'tasks'].map(appById).filter(a => a && access(a, u).ok);
    const resumeList = recentApps.length ? recentApps : starters;
    const resume = panel('Fortsæt hvor du slap', { icon: 'clock' },
      h('div', { class: 'home-resume' }, resumeList.map(a => h('a', { class: 'home-resume-item', href: a.route, style: { '--app': a.hue } },
        h('span', { class: 'ab-ico' }, appGlyph(a)), h('span', null, h('b', null, a.name), h('small', null, recentApps.length ? (a.tagline || 'Senest brugt') : a.tagline)), icon('arrowRight')))));

    const welcome = h('section', { class: 'home-welcome' },
      h('p', { class: 'home-lead' }, 'Dit digitale univers – samlet ét sted.'),
      h('p', { class: 'home-sub' }, 'Her finder du dine projekter, apps, læringsforløb og alt det, der hjælper dig med at udvikle dine idéer og færdigheder.'),
      h('div', { class: 'home-cta' },
        h('a', { class: 'btn btn-primary btn-glow', href: '#/dashboard' }, 'Gå til dashboard', icon('arrowRight')),
        h('button', { type: 'button', class: 'btn btn-ghost home-customize', onclick: () => openCustomize() }, icon('sliders'), 'Tilpas forsiden')));

    const apps = panel('Dine apps', { link: { href: '#/apps', label: 'Se alle apps' }, tour: 'home-apps' },
      h('div', { class: 'app-grid' }, pinned.map(a => appCard(a))));

    // the apps you opened last – one click back to them
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('hubtech.recentApps') || '[]').map(appById).filter(a => a && a.page && visible(a, u) && access(a, u).ok).slice(0, 6); } catch { /* */ }
    const recentRow = recent.length ? h('div', { class: 'home-recent' }, h('span', { class: 'faint' }, icon('clock'), ' Senest brugt'),
      h('div', { class: 'home-recent-row' }, recent.map(a => h('a', { class: 'home-recent-app', href: a.route, style: { '--app': a.hue } }, h('span', { class: 'lx-ico' }, tileIcon(a.icon)), h('span', null, a.name))))) : null;
    if (recentRow) apps.append(recentRow);

    // together with others: visit connected HUBTECHs, invite friends
    const together = h('div');
    api.get('/api/hublink').then((hi) => {
      const go = (l) => import('./hubs.js').then(m => m.visit(l));
      const body = u.guestOf ? [h('p', { class: 'muted', style: { margin: 0 } }, `Du er på besøg fra ${u.guestOf.name}.`), h('button', { class: 'btn btn-primary', onclick: () => go({ id: u.guestOf.id, name: u.guestOf.name }) }, icon('home'), 'Tilbage til min HUBTECH')]
        : [hi.links.length ? h('div', { class: 'home-hubs' }, hi.links.slice(0, 4).map(l => h('button', { class: 'home-hub', onclick: () => go(l) }, h('span', { class: 'hl-logo' }, '🏠'), h('span', null, h('b', null, l.name), h('small', { class: 'faint' }, 'Besøg med din egen konto')), icon('arrowRight')))) : null,
          u.role === 'owner' ? h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, h('a', { class: 'btn btn-sm', href: '#/hubs' }, icon('user'), 'Invitér en ven'), h('a', { class: 'btn btn-sm', href: '#/hubs' }, icon('link'), hi.links.length ? `Alle forbindelser (${hi.links.length})` : 'Forbindelser'))
            : null,
          !hi.links.length ? h('p', { class: 'faint', style: { margin: 0 } }, 'Andre HUBTECH’er dukker op her af sig selv, når de bliver fundet. Indtil da: alle på denne HUBTECH er jeres team – chat, opkald og fælles projekter findes under Fællesskab og Team.') : null];
      h(together, null, panel('Sammen med andre', { link: { href: '#/hubs', label: 'Forbindelser' } }, h('div', { class: 'stack', style: { gap: '10px' } }, body)));
    }).catch(() => {});

    // every card can be switched off under "Tilpas" (prefs.widgets.home)
    const cards = {
      clock: hero, stats, today: todayPanel(), resume, hero: welcome, apps, together, previews: h('div', { class: 'home-row' }, projectsPreview(), learningPreview()), seasons: seasonStrip(),
      profile: profileSlot, activity: activityPanel({ limit: 4 }), shortcuts: shortcutsPanel(), world: worldQuickPanel(),
    };
    const hiddenNote = h('p', { class: 'faint home-empty on-world', hidden: true }, 'Alle kort er slået fra. ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openCustomize() }, icon('sliders'), 'Vælg kort'));
    const rail = h('aside', { class: 'rail', 'aria-label': 'Overblik' }, cards.profile, cards.activity, cards.shortcuts, cards.world);
    const applyCards = () => {
      const show = widgetPrefs().home;
      for (const [k, el] of Object.entries(cards)) el.hidden = !show[k];
      rail.hidden = !['profile', 'activity', 'shortcuts', 'world'].some(k => show[k]);
      layout.classList.toggle('no-rail', rail.hidden);
      hiddenNote.hidden = Object.keys(cards).some(k => show[k]);
    };
    const layout = h('div', { class: 'with-rail' },
      h('div', { class: 'stack' }, cards.hero, cards.apps, cards.together, cards.previews, cards.seasons),
      rail);
    const more = ['hero', 'apps', 'together', 'previews', 'seasons'];
    const applyMore = () => { const show = widgetPrefs().home; layout.hidden = !more.concat(['profile', 'activity', 'shortcuts', 'world']).some(k => show[k]); };
    unsub.push(store.on('prefs', applyCards), store.on('prefs', applyMore));
    applyCards(); applyMore();
    const customize = h('button', { type: 'button', class: 'btn btn-ghost btn-sm home-customize-top', onclick: () => openCustomize() }, icon('sliders'), 'Tilpas forsiden');
    // design D: a big greeting, then the day on the left and the numbers in one quiet list on the right
    return h('div', { class: 'page home home-d' }, hiddenNote,
      h('div', { class: 'home-top' }, cards.clock, customize),
      h('div', { class: 'home-grid' },
        h('div', { class: 'home-main' }, cards.today, cards.resume, layout),
        h('aside', { class: 'home-side', 'aria-label': 'Overblik' }, cards.stats)));
  },
};
