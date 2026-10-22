/** Kodeord – make strong passwords and passphrases, and check how strong a password is. Everything happens on the device; nothing is saved or sent. */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, copy } from '../features/appkit.js';
import { makePassword, makePassphrase, strength, crackText, WORDS, SETS, GUESSES_PER_SEC } from '../features/pwtools.js';

const TIPS = [
  ['Lang slår kompliceret', 'Fem tilfældige ord er både stærkere og nemmere at huske end “P@ssw0rd!”. Længden betyder mest.'],
  ['Én kode pr. sted', 'Bliver én side hacket, prøver angriberne koden alle andre steder. Brug aldrig den samme kode to steder.'],
  ['Brug en adgangskodemanager', 'Bitwarden, 1Password, Apple Keychain eller den i browseren husker koderne for dig. Så skal du kun huske én stærk hovedkode.'],
  ['Slå totrinsbekræftelse til', 'En kode fra en app (fx Microsoft Authenticator) eller MitID betyder, at en stjålet kode ikke er nok. Start med e-mail og bank.'],
  ['Giv aldrig koden videre', 'IT-support, banken og Microsoft spørger aldrig om din kode – hverken i telefonen, på SMS eller i en e-mail.'],
  ['Skift koden, når der er grund til det', 'Skift den med det samme, hvis den kan være lækket. Ellers er det bedre at have én stærk kode end at skifte tit til svage.'],
];

export default {
  title: 'Kodeord',
  async render(ctx) {
    const app = appById('passwords');
    const first = ['make', 'check', 'tips'].includes(ctx?.params?.sub) ? ctx.params.sub : 'make';
    const body = h('div', { class: 'stack' });

    function meter(res, extra) {
      return h('div', { class: ['pw-meter', `s${res.score}`] },
        h('div', { class: 'pw-bars', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4].map(i => h('i', { class: i <= res.score ? 'on' : '' }))),
        h('div', { class: 'pw-verdict' }, h('b', null, res.label), h('span', { class: 'faint' }, extra || `ca. ${res.bits} bit · kan gættes på ${crackText(res.crack)}`)));
    }

    function makeTab() {
      let kind = 'phrase';
      const opts = { length: 18, lower: true, upper: true, digits: true, symbols: true, words: 5, sep: '-', capital: true, number: true };
      const out = h('output', { class: 'pw-out', 'aria-live': 'polite' });
      const meterBox = h('div');
      const optBox = h('div', { class: 'pw-opts' });
      const gen = () => {
        const v = kind === 'phrase' ? makePassphrase(opts) : makePassword(opts);
        out.textContent = v;
        if (kind === 'phrase') {
          const bits = Math.round(opts.words * Math.log2(WORDS.length) + (opts.number ? Math.log2(90) : 0) + (opts.capital ? Math.log2(opts.words) : 0));
          const crack = 2 ** bits / GUESSES_PER_SEC / 2;
          const score = bits < 40 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4;
          clear(meterBox).append(meter({ bits, crack, score, label: ['Meget svag', 'Svag', 'Middel', 'Stærk', 'Meget stærk'][score] }, `${bits} bit – selv hvis angriberen kender ordlisten · ${crackText(crack)} at gætte`));
        } else clear(meterBox).append(meter(strength(v)));
      };
      const check = (key, label) => { const c = h('input', { type: 'checkbox', checked: opts[key] }); c.addEventListener('change', () => { opts[key] = c.checked; gen(); }); return h('label', { class: 'pw-check' }, c, h('span', null, label)); };
      const range = (key, min, max, label) => {
        const val = h('b', null, String(opts[key]));
        const r = h('input', { type: 'range', class: 'range', min, max, value: opts[key], 'aria-label': label });
        r.addEventListener('input', () => { opts[key] = Number(r.value); val.textContent = r.value; gen(); });
        return h('label', { class: 'pw-range' }, h('span', null, label, ' ', val), r);
      };
      const drawOpts = () => {
        clear(optBox);
        if (kind === 'phrase') {
          const sep = h('select', { class: 'select', 'aria-label': 'Skilletegn' }, [['-', 'Bindestreg (-)'], ['.', 'Punktum (.)'], [' ', 'Mellemrum'], ['_', 'Understreg (_)'], ['', 'Ingen']].map(([v, l]) => h('option', { value: v, selected: v === opts.sep }, l)));
          sep.addEventListener('change', () => { opts.sep = sep.value; gen(); });
          optBox.append(range('words', 3, 10, 'Antal ord'), h('label', { class: 'pw-range' }, h('span', null, 'Skilletegn'), sep), check('capital', 'Ét ord med stort'), check('number', 'Tal til sidst'));
        } else optBox.append(range('length', 8, 64, 'Længde'), check('lower', 'Små bogstaver'), check('upper', 'Store bogstaver'), check('digits', 'Tal'), check('symbols', `Tegn (${SETS.symbols})`));
      };
      const seg = segmented([{ value: 'phrase', label: 'Kodesætning (ord)' }, { value: 'random', label: 'Tilfældige tegn' }], kind, (v) => { kind = v; drawOpts(); gen(); }, { label: 'Type' });
      drawOpts(); gen();
      return [panel('Lav en stærk kode', 'key', seg,
        h('div', { class: 'pw-result' }, out,
          h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-primary', onclick: () => copy(out.textContent, 'Koden er kopieret') }, icon('copy'), 'Kopiér'),
            h('button', { class: 'btn', onclick: gen }, icon('refresh'), 'Ny kode'))),
        meterBox, optBox,
        h('p', { class: 'faint', style: { marginBottom: 0 } }, 'Koden laves på din enhed med browserens kryptografiske tilfældighedsgenerator. Den gemmes ikke og sendes ingen steder hen.'))];
    }

    function checkTab() {
      const inp = h('input', { class: 'input pw-input', type: 'password', autocomplete: 'off', spellcheck: false, placeholder: 'Skriv en kode for at teste den', 'aria-label': 'Kode der skal tjekkes' });
      const show = h('button', { class: 'icon-btn', 'aria-label': 'Vis koden', title: 'Vis koden' }, icon('eye'));
      show.addEventListener('click', () => { const on = inp.type === 'password'; inp.type = on ? 'text' : 'password'; show.replaceChildren(icon(on ? 'eyeOff' : 'eye')); show.setAttribute('aria-label', on ? 'Skjul koden' : 'Vis koden'); });
      const res = h('div', { class: 'stack' });
      const draw = () => {
        clear(res);
        if (!inp.value) { res.append(h('p', { class: 'faint', style: { margin: 0 } }, 'Resultatet vises, mens du skriver.')); return; }
        const r = strength(inp.value);
        res.append(meter(r), h('div', { class: 'pw-facts' },
          h('span', { class: 'chip' }, `${inp.value.length} tegn`),
          /[a-zæøå]/.test(inp.value) && h('span', { class: 'chip' }, 'små'), /[A-ZÆØÅ]/.test(inp.value) && h('span', { class: 'chip' }, 'store'),
          /\d/.test(inp.value) && h('span', { class: 'chip' }, 'tal'), /[^a-zA-ZæøåÆØÅ0-9]/.test(inp.value) && h('span', { class: 'chip' }, 'tegn')));
        if (r.warnings.length) res.append(h('ul', { class: 'pw-warn' }, r.warnings.map(w => h('li', null, icon('alert'), w))));
        else if (r.score >= 3) res.append(h('p', { class: 'pw-good' }, icon('checkCircle'), 'Ingen kendte svagheder fundet.'));
      };
      inp.addEventListener('input', draw); draw();
      return [panel('Hvor stærk er koden?', 'shield', h('div', { class: 'pw-checkrow' }, inp, show), res,
        h('p', { class: 'faint', style: { marginBottom: 0 } }, 'Tjekket sker kun på din enhed – koden gemmes ikke og sendes ingen steder hen. Tiden er et groft skøn for et angreb med ',
          '10 milliarder gæt i sekundet. Skriv helst ikke din rigtige kode – test en, der ligner.'))];
    }

    function tipsTab() {
      return [panel('Gode råd om koder', 'help', h('div', { class: 'pw-tips' }, TIPS.map(([t, d], i) => h('div', { class: 'pw-tip' }, h('span', { class: 'pw-n' }, String(i + 1)), h('div', null, h('b', null, t), h('p', null, d)))))),
        panel('Sådan hjælper du en kunde', 'users', h('ol', { class: 'pw-steps' },
          h('li', null, 'Installér en adgangskodemanager, og lav en stærk hovedkode sammen med kunden (en kodesætning er nem at huske).'),
          h('li', null, 'Slå totrinsbekræftelse til på e-mailen først – den bruges til at nulstille alle andre koder.'),
          h('li', null, 'Skift koden de steder, hvor den samme kode er brugt flere gange.'),
          h('li', null, 'Skriv gendannelseskoder ned på papir, og læg dem et sikkert sted.')))];
    }
    const TABS = { make: makeTab, check: checkTab, tips: tipsTab };
    const open = (id) => h(clear(body), null, TABS[id]());
    const seg = segmented([{ value: 'make', label: 'Lav en kode', icon: 'key' }, { value: 'check', label: 'Tjek en kode', icon: 'shield' }, { value: 'tips', label: 'Gode råd', icon: 'help' }], first, open, { label: 'Vælg' });
    open(first);
    return h('div', { class: 'page pw-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'IT-support', title: 'Kodeord', lead: 'Lav stærke koder, du kan huske, og se hvor lang tid det tager at gætte en kode. Intet gemmes eller sendes.', compact: true }),
      h('div', { class: 'cmd-filters' }, seg), body);
  },
};
