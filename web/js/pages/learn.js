/** Guides & Læring hub: the course, every learning app (Kodeskolen, Huskekort, CircuitPilot, Værktøjskasse) and the guide library. */
import { h, clear, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { appById, LEARN_APPS } from '../core/registry.js';
import { isDue } from '../features/srs.js';
const csXp = (s) => Object.keys(s?.done || {}).length * 20 + Object.values(s?.quiz || {}).reduce((a, q) => a + Object.values(q).filter(v => v === true).length, 0) * 5;
import { getState, courseProgress } from '../core/services.js';
import { GUIDES, GUIDE_CATEGORIES } from '../data/guides.js';
import { COURSE } from '../data/course-servicetekniker.js';
import { paintStill } from '../world/controller.js';
import { progressBar, stateBlock } from '../core/ui.js';

export function guideCard(g) {
  const app = appById(g.app);
  const saved = (store.get('prefs').savedGuides || []).includes(g.id);
  return h('a', { class: 'guide-card glass', href: `#/learn/guide/${g.id}`, style: { '--app': app?.hue || 'var(--accent)' } },
    h('span', { class: 'row-icon' }, icon(g.icon)),
    h('div', { class: 'gc-main' },
      h('h3', null, g.title),
      h('p', { class: 'muted' }, g.summary),
      h('div', { class: 'gc-meta' }, h('span', { class: 'chip' }, icon('clock'), `${g.minutes} min`), app ? h('span', { class: 'chip chip-app' }, app.name) : null, saved ? h('span', { class: 'chip chip-warn' }, icon('starFill'), 'Gemt') : null)),
    icon('arrowRight'));
}

export default {
  title: 'Guides & Læring',
  render() {
    const courseSlot = h('div', { class: 'skel', style: { height: '200px', borderRadius: 'var(--r-lg)' } });
    const appsSlot = h('div', { class: 'learn-apps' }, LEARN_APPS.map(() => h('div', { class: 'skel', style: { height: '230px', borderRadius: 'var(--r-lg)' } })));
    Promise.all([getState(COURSE.stateId), getState('circuitpilot'), getState('codeschool'), getState('flashcards')].map(p => p.catch(() => null))).then(([cs, cp, code, fc]) => {
      const pr = courseProgress(cs);
      const art1 = h('canvas', { 'aria-hidden': 'true' });
      requestAnimationFrame(() => paintStill(art1, { season: 'autumn', time: 'day', focusX: 0.3 }));
      const nextDay = Math.min(COURSE.days.length, pr.lastDay + 1);
      courseSlot.replaceWith(h('article', { class: 'course-hero course-hero-wide glass', style: { '--app': 'var(--hue-course)' } },
        h('div', { class: 'ch-art' }, art1, h('span', { class: 'chip chip-app ch-badge' }, 'Kursus · 12 dage')),
        h('div', { class: 'ch-body' },
          h('h2', null, COURSE.title),
          h('p', { class: 'muted' }, COURSE.intro),
          h('div', { class: 'ch-progress' }, h('div', { class: 'ch-row' }, h('b', null, `${pr.daysDone} af ${pr.totalDays} dage`), h('span', { class: 'mono faint' }, `${pr.pct} %`)), progressBar(pr.pct, { app: 'var(--hue-course)', label: `Kursus: ${pr.pct} % fuldført` })),
          h('div', { class: 'ch-actions' },
            h('a', { class: 'btn btn-primary', href: `#/learn/course/${COURSE.id}/day/${nextDay}` }, icon(pr.started ? 'play' : 'arrowRight'), pr.started ? `Fortsæt · dag ${nextDay}` : 'Start dag 1'),
            h('a', { class: 'btn', href: `#/learn/course/${COURSE.id}` }, 'Oversigt')))));
      const codeDone = Object.keys(code?.done || {}).length;
      const cards = Array.isArray(fc?.cards) ? fc.cards : [];
      const fcDue = cards.filter(c => (c.reps || c.lapses) && isDue(c)).length + Math.min(20, cards.filter(c => !c.reps && !c.lapses).length);
      const info = {
        codeschool: { stats: [[`${codeDone}`, 'Lektioner'], [String(csXp(code)), 'XP']], action: codeDone ? 'Fortsæt' : 'Start', art: { season: 'summer', time: 'night', focusX: 0.45 } },
        flashcards: { stats: [[String(fcDue), 'Klar i dag'], [String(cards.length), 'Kort']], action: fcDue ? `Gennemgå ${fcDue}` : 'Åbn', href: fcDue ? '#/learn/flashcards/study/all' : null, art: { season: 'autumn', time: 'night', focusX: 0.55 } },
        circuitpilot: { stats: [[String(cp?.xp || 0), 'XP'], [String(cp?.achievements?.length || 0), 'Badges']], action: cp ? 'Fortsæt' : 'Start', art: { season: 'spring', time: 'day', focusX: 0.62 } },
        toolkit: { stats: [['11', 'Beregnere'], ['El + IT', 'Område']], action: 'Åbn', art: { season: 'winter', time: 'day', focusX: 0.4 } },
      };
      appsSlot.replaceChildren(...LEARN_APPS.map(a => {
        const i = info[a.id] || { stats: [], action: 'Åbn' };
        const cv = h('canvas', { 'aria-hidden': 'true' });
        requestAnimationFrame(() => paintStill(cv, { ...(i.art || a.art), landscape: 'valley' }));
        return h('article', { class: 'learn-app glass', style: { '--app': a.hue } },
          h('a', { class: 'learn-app-top', href: a.route, tabindex: '-1', 'aria-hidden': 'true' }, cv, h('span', { class: 'learn-app-icon' }, icon(a.icon))),
          h('div', { class: 'learn-app-body' },
            h('h3', null, h('a', { href: a.route }, a.name)),
            h('p', { class: 'muted' }, a.tagline),
            h('div', { class: 'learn-app-stats' }, i.stats.map(([v, l]) => h('div', null, h('b', null, v), h('span', null, l)))),
            h('a', { class: 'btn btn-sm app-solid', href: i.href || a.route }, icon('play'), i.action)));
      }));
    });

    let q = '', cat = 'all';
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Søg i guides…', 'aria-label': 'Søg i guides' });
    const catBar = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Kategori' });
    const drawCats = () => {
      clear(catBar);
      [{ id: 'all', label: 'Alle' }, ...GUIDE_CATEGORIES].forEach(c => {
        const b = h('button', { class: 'chip', 'aria-pressed': String(cat === c.id) }, c.icon ? icon(c.icon) : null, c.label);
        b.addEventListener('click', () => { cat = c.id; drawCats(); drawGuides(); });
        catBar.appendChild(b);
      });
    };
    const guideList = h('div', { class: 'guide-sections' });
    const drawGuides = () => {
      clear(guideList);
      const nq = q.trim().toLowerCase();
      const saved = store.get('prefs').savedGuides || [];
      const match = (g) => (cat === 'all' || g.category === cat) && (!nq || [g.title, g.summary, ...(g.sections || []).map(s => [s.h, s.p, ...(s.list || []), ...(s.steps || []).map(x => x.t + ' ' + x.d)].join(' ')), ...(g.faq || []).flat()].join(' ').toLowerCase().includes(nq));
      const savedGuides = GUIDES.filter(g => saved.includes(g.id) && match(g));
      if (savedGuides.length && !nq) guideList.appendChild(h('section', null, h('h2', { class: 'guide-cat' }, icon('starFill'), 'Gemte guides'), h('div', { class: 'guide-grid' }, savedGuides.map(guideCard))));
      let any = false;
      for (const c of GUIDE_CATEGORIES) {
        const gs = GUIDES.filter(g => g.category === c.id && match(g));
        if (!gs.length) continue;
        any = true;
        guideList.appendChild(h('section', null, h('h2', { class: 'guide-cat' }, icon(c.icon), c.label), h('div', { class: 'guide-grid' }, gs.map(guideCard))));
      }
      if (!any) guideList.appendChild(stateBlock({ icon: 'search', title: 'Ingen guides fundet', text: `Intet matcher “${q}”. Prøv fx “cursor”, “quiz” eller “docker”.`, actions: [h('button', { class: 'btn', onclick: () => { q = ''; search.value = ''; cat = 'all'; drawCats(); drawGuides(); } }, 'Ryd søgning')] }));
    };
    search.addEventListener('input', debounce(() => { q = search.value; drawGuides(); }, 120));
    drawCats(); drawGuides();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Guides & Læring'), h('h1', null, 'Lær, øv og find hjælp'), h('p', null, 'Al din læring samlet ét sted: kurset, Kodeskolen, Huskekort, CircuitPilot og Værktøjskassen – og en søgbar guide til alt på platformen.'))),
      courseSlot,
      h('h2', { class: 'guide-cat learn-apps-head' }, icon('sparkles'), 'Læringsapps'),
      appsSlot,
      h('div', { class: 'guide-head' }, h('h2', null, 'Guides'), h('div', { class: 'pt-search' }, icon('search'), search)),
      catBar,
      guideList);
  },
};
