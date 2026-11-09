/**
 * Phishing-træner – look at an e-mail or SMS, decide whether it is fake or real, and learn the warning signs.
 * Links show where they really go (like hovering the mouse in a mail program). Results are kept on the account.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError } from '../features/appkit.js';
import { SCENARIOS } from '../data/phishing.js';

const RULES = [
  ['Tjek afsenderens adresse', 'Navnet kan være hvad som helst. Se på domænet efter @ – er det firmaets eget?'],
  ['Hold musen over linket', 'Se hvor det går hen, før du klikker. Det sidste ord før første “/” er det rigtige domæne.'],
  ['Pas på tidspres og trusler', '“Inden 24 timer”, “lukkes permanent”, “afgift” – svindlere vil have dig til at handle, før du tænker.'],
  ['Ingen logger ind via et link', 'Bank, IT og det offentlige beder dig aldrig om kode, kortnummer eller MitID via en mail eller SMS.'],
  ['Ring og tjek', 'Er du i tvivl, så kontakt afsenderen på et nummer, du selv finder – ikke det i beskeden.'],
];
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

export default {
  title: 'Phishing-træner',
  async render() {
    const app = appById('phishing');
    let store;
    try { store = await appState('phishing', { seen: {}, rounds: 0, best: 0 }); } catch (e) { return loadError('Phishing-træner', e); }
    const st = store.data;
    let order = [], pos = 0, score = 0, answered = null;
    const stage = h('div', { class: 'ph-stage' });
    const progress = h('div', { class: 'ph-progress' });

    function start() { order = shuffle(SCENARIOS).slice(0, 8); pos = 0; score = 0; answered = null; draw(); }
    function answer(isPhish) {
      if (answered !== null) return;
      const s = order[pos];
      answered = isPhish === s.phish;
      if (answered) score++;
      st.seen[s.id] = { ok: answered, at: Date.now() };
      store.save(); draw();
    }
    function next() {
      pos++; answered = null;
      if (pos >= order.length) {
        st.rounds++; const rec = score > (st.best || 0); if (rec) st.best = score; store.save();
        if (score === order.length) toast('Alle rigtige!', { type: 'xp', text: 'Du er svær at snyde.' });
      }
      draw();
    }
    function message(s, reveal) {
      const link = s.link && h('a', { class: ['ph-link', reveal && (s.phish ? 'is-bad' : 'is-ok')], href: '#', title: s.link.url, 'aria-label': `${s.link.text} – går til ${s.link.url}`,
        onclick: (e) => { e.preventDefault(); toast('Godt du ikke klikkede rigtigt', { type: 'info', text: `Linket går til: ${s.link.url}` }); } }, s.link.text);
      const hover = s.link && h('div', { class: 'ph-hover' }, icon('link'), h('span', null, 'Linket går til: '), h('code', null, s.link.url));
      if (s.kind === 'sms') {
        return h('div', { class: 'ph-phone' }, h('div', { class: 'ph-sms-head' }, icon('user'), h('b', null, s.from)),
          h('div', { class: 'ph-bubble' }, s.body.map(p => (s.link && p.includes(s.link.text) ? [p.split(s.link.text)[0], link, p.split(s.link.text)[1]] : p))), hover);
      }
      return h('article', { class: 'ph-mail' },
        h('header', null, h('div', { class: 'ph-subject' }, s.subject),
          h('div', { class: 'ph-from' }, h('span', { class: 'ph-avatar' }, s.from[0]), h('div', null, h('b', null, s.from), h('span', { class: ['ph-addr', reveal && s.phish && 'is-bad'] }, `<${s.addr}>`)))),
        h('div', { class: 'ph-body' }, s.body.map(p => h('p', null, p)), link && h('p', null, link)), hover);
    }
    function draw() {
      clear(stage); clear(progress);
      if (pos >= order.length) {
        const pct = Math.round(score / order.length * 100);
        stage.append(h('div', { class: 'ph-done glass' },
          h('div', { class: 'gl-score' }, `${score} / ${order.length}`),
          h('p', null, pct === 100 ? 'Perfekt! Du fanger alle svindelforsøg.' : pct >= 75 ? 'Rigtig godt – de fleste falder for flere.' : 'Øvelse gør mester. Læs reglerne herunder, og prøv igen.'),
          h('button', { class: 'btn btn-primary', onclick: start }, icon('refresh'), 'Ny runde')));
        return;
      }
      order.forEach((_, i) => progress.append(h('i', { class: [i < pos && 'done', i === pos && 'now'] })));
      const s = order[pos], reveal = answered !== null;
      stage.append(h('div', { class: ['ph-card', reveal && 'is-revealed'] }, h('div', { class: 'ph-kind faint' }, icon(s.kind === 'sms' ? 'chat' : 'mail'), s.kind === 'sms' ? 'SMS' : 'E-mail', ` · ${pos + 1} af ${order.length}`), message(s, reveal)));
      if (!reveal) {
        stage.append(h('div', { class: 'ph-ask' }, h('b', null, 'Er det svindel?'),
          h('div', { class: 'ph-btns' },
            h('button', { class: 'btn btn-lg ph-no', onclick: () => answer(true) }, icon('alert'), 'Phishing / svindel'),
            h('button', { class: 'btn btn-lg ph-yes', onclick: () => answer(false) }, icon('checkCircle'), 'Ægte'))));
      } else {
        stage.append(h('div', { class: ['ph-answer glass', answered ? 'is-ok' : 'is-bad'] },
          h('b', null, answered ? 'Rigtigt! ' : 'Forkert. ', s.phish ? 'Det er svindel.' : 'Den er ægte.'),
          h('ul', null, s.flags.map(f => h('li', null, icon(s.phish ? 'flag' : 'check'), f))),
          h('p', { class: 'ph-tip' }, icon('info'), s.tip),
          h('button', { class: 'btn btn-primary', onclick: next }, pos + 1 < order.length ? 'Næste' : 'Se resultat', icon('arrowRight'))));
      }
    }
    const seenN = () => Object.keys(st.seen).length, okN = () => Object.values(st.seen).filter(x => x.ok).length;
    start();
    return h('div', { class: 'page ph-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Læring', title: 'Phishing-træner', lead: 'Svindlere prøver at narre dig til at klikke, logge ind eller betale. Se på hver besked, og afgør: svindel eller ægte?',
        stats: [{ icon: 'mail', label: 'Beskeder set', value: `${seenN()} / ${SCENARIOS.length}` }, { icon: 'trophy', label: 'Bedste runde', value: st.best ? `${st.best} / 8` : '–' }] }),
      panel(null, null, progress, stage),
      panel('5 regler, der stopper de fleste svindelforsøg', 'shield', h('div', { class: 'pw-tips' }, RULES.map(([t, d], i) => h('div', { class: 'pw-tip' }, h('span', { class: 'pw-n' }, String(i + 1)), h('div', null, h('b', null, t), h('p', null, d)))))),
      h('p', { class: 'faint', style: { textAlign: 'center' } }, `Alle firmaer og adresser i træneren er opdigtede. Du har svaret rigtigt på ${okN()} af ${seenN()} forskellige beskeder.`));
  },
};
