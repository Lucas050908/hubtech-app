/** Triktrak, 10.000, Sorteper, Del regningen, Navnemaskine, Skriveværksted, Cykelprøven og Kims leg (one module, several pages). */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { segmented, toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, copy } from '../features/appkit.js';
import { hostedGame } from '../features/hostedgame.js';
import * as B from '../features/batch10.js';

const page = (id, eyebrow, title, lead, ...body) => h('div', { class: `page t2-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow, title, lead, compact: true }), ...body);
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n, cls = '') => h('span', { class: `ld-die ${cls}` }, Array.from({ length: 9 }, (_, i) => h('i', { class: n && PIPS[n].includes(i) ? 'on' : '' })));
const gamePage = (id, title, lead, g) => h('div', { class: `page dm-page ${id}-page`, style: { '--app': appById(id).hue } }, appHero(appById(id), { eyebrow: 'Brætspil og kort', title, lead, compact: true }), g.el);

// ── Triktrak ──
export const triktrak = {
  title: 'Triktrak',
  destroy() { this._g?.destroy(); },
  async render() {
    let store;
    try { store = await appState('triktrak', { game: null, setup: null, wins: 0, played: 0 }); } catch (e) { return loadError('Triktrak', e); }
    const st = store.data;
    let sel = null;
    const g = this._g = hostedGame({
      page: 'triktrak', game: 'triktrak', title: 'Triktrak', store, minPlayers: 2, maxPlayers: 2,
      newGame: (seats) => B.newTriktrak(seats), apply: (s, seat, n, a) => B.applyTriktrak(s, seat, n, a), aiMove: B.aiTriktrak, aiDelay: (s, seat, mv) => (mv.name === 'roll' ? 700 : 550),
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (!s.players[s.winner].ai && s.players.some(p => p.ai)) st.wins++; } },
      rules: () => panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Slå med to terninger og flyt dine brikker det antal felter – hvid mod højre hjørne forneden, sort den anden vej rundt. Slår du dobbelt, får du fire træk.'),
        h('li', null, 'Du må ikke lande på et felt med to eller flere af modstanderens brikker. Står der kun én, slår du den ud på baren.'),
        h('li', null, 'Har du en brik på baren, skal den ind først. Når alle dine brikker er i dit hjem, må du bære dem af.'),
        h('li', null, 'Den første, der har båret alle 15 brikker af, vinder. Du skal bruge begge terninger, hvis du kan.'))),
      render(ctl) {
        const s = ctl.s, my = ctl.canAct(s.turn) && s.phase !== 'over', me = s.turn;
        const legal = my && s.phase === 'move' ? B.legalMoves(s, me) : [];
        const targets = sel != null ? legal.filter(m => m.from === sel) : [];
        const fromSet = new Set(legal.map(m => String(m.from)));
        const click = (where) => {
          if (!my || s.phase !== 'move') return;
          const t = targets.find(m => m.to === where);
          if (t) { sel = null; ctl.act('move', [t.from, t.to, t.die]); return; }
          sel = fromSet.has(String(where)) ? where : null; g.redraw();
        };
        const stack = (v) => { const n = Math.abs(v), c = v > 0 ? 'w' : 'b'; return Array.from({ length: Math.min(n, 5) }, (_, k) => h('span', { class: `tt-ck ${c}` }, k === 4 && n > 5 ? String(n) : '')); };
        const point = (i, top) => h('button', { class: ['tt-pt', top ? 'top' : 'bot', i % 2 ? 'odd' : 'even', sel === i && 'is-sel', targets.some(m => m.to === i) && 'is-target', fromSet.has(String(i)) && 'can'], 'aria-label': `Felt ${s.turn === 1 ? 24 - i : i + 1}: ${Math.abs(s.points[i])} ${s.points[i] > 0 ? 'hvide' : s.points[i] < 0 ? 'sorte' : ''}`, onclick: () => click(i) }, h('span', { class: 'tt-tri' }), h('span', { class: 'tt-stack' }, stack(s.points[i])));
        const topRow = [12, 13, 14, 15, 16, 17, 'bar', 18, 19, 20, 21, 22, 23], botRow = [11, 10, 9, 8, 7, 6, 'bar', 5, 4, 3, 2, 1, 0];
        const bar = (top) => h('button', { class: ['tt-bar', sel === 'bar' && 'is-sel', fromSet.has('bar') && 'can'], 'aria-label': 'Baren', onclick: () => click('bar') }, top ? stack(-s.bar[1]) : stack(s.bar[0]));
        const offBox = (seat) => h('button', { class: ['tt-off', targets.some(m => m.to === 'off') && seat === me && 'is-target'], 'aria-label': `${s.players[seat].name} har båret ${s.off[seat]} af`, onclick: () => click('off') }, h('span', { class: `tt-ck ${seat ? 'b' : 'w'}` }), h('b', null, String(s.off[seat])));
        const status = s.phase === 'over' ? `${s.players[s.winner].name} vandt! 🎉` : my ? (s.phase === 'roll' ? 'Din tur – slå med terningerne' : sel != null ? 'Vælg hvor brikken skal hen' : 'Vælg en brik at flytte') : `${s.players[s.turn].name} ${s.phase === 'roll' ? 'slår …' : 'flytter …'}`;
        return h('div', { class: 'tt-wrap' },
          h('div', { class: 'tt-board' },
            h('div', { class: 'tt-row' }, topRow.map(i => (i === 'bar' ? bar(true) : point(i, true)))), h('div', { class: 'tt-mid' }, s.dice.length ? h('div', { class: 'tt-dice' }, s.dice.map((d, k) => die(d, s.left.includes(d) || (s.dice[0] === s.dice[1] && s.left.length > k) ? '' : 'used'))) : null),
            h('div', { class: 'tt-row' }, botRow.map(i => (i === 'bar' ? bar(false) : point(i, false))))),
          h('div', { class: 'tt-side' },
            h('div', { class: 'dm-side' }, s.players.map((p, i) => h('div', { class: ['dm-player', s.turn === i && s.phase !== 'over' && 'is-turn'] }, h('span', { class: `tt-ck ${i ? 'b' : 'w'}`, style: { width: '16px', height: '16px' } }), h('b', null, p.name), h('span', { class: 'faint' }, `${B.pips(s, i)} øjne tilbage`)))),
            h('div', { class: 'row', style: { gap: '8px' } }, offBox(0), offBox(1)),
            h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', my && 'is-mine'] }, status),
            my && s.phase === 'roll' ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => ctl.act('roll') }, icon('cube'), 'Slå') : null,
            h('div', { class: 'row-actions' }, g.controls()),
            s.log.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 5).map(l => h('li', null, l))) : null));
      },
    });
    return gamePage('triktrak', 'Triktrak', 'Det ældgamle brætspil med terninger og strategi (også kendt som backgammon). Mod computeren, ved samme skærm eller online.', g);
  },
};

// ── 10.000 ──
export const tenk = {
  title: '10.000',
  destroy() { this._g?.destroy(); },
  async render() {
    let store;
    try { store = await appState('tenk', { game: null, setup: null, wins: 0, played: 0 }); } catch (e) { return loadError('10.000', e); }
    const st = store.data;
    let pick = new Set();
    const g = this._g = hostedGame({
      page: 'tenk', game: 'tenk', title: '10.000', store, minPlayers: 1, maxPlayers: 6,
      onlineText: 'Invitér op til 5 af dem, der har HUBTECH – alle slår på skift.',
      newGame: (seats) => B.newTenk(seats), apply: (s, seat, n, a) => B.applyTenk(s, seat, n, a), aiMove: B.aiTenk, aiDelay: (s, seat, mv) => (mv.name === 'roll' ? 700 : mv.name === 'next' ? 1400 : 1100),
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (!s.players[s.winner].ai) st.wins++; } },
      rules: () => panel('Point', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Slå med terningerne og læg mindst én pointgivende terning til side. Slå videre med resten – eller stop og gem pointene.'),
        h('li', null, 'Slår du uden en eneste pointgivende terning, mister du turens point.'),
        h('li', null, '1’er = 100, 5’er = 50, tre ens = 100 × øjnene (tre 1’ere = 1.000), fire ens = det dobbelte, fem ens = fire gange, seks ens = otte gange.'),
        h('li', null, '1-2-3-4-5-6 = 1.500 og tre par = 750. Bruger du alle seks terninger, må du slå med alle seks igen. Den første til 10.000 vinder.'))),
      render(ctl) {
        const s = ctl.s, my = ctl.canAct(s.turn) && s.phase !== 'over';
        if (s.phase !== 'keep' || !my) pick = new Set();
        const chosen = [...pick], pts = chosen.length ? B.scoreDice(chosen.map(i => s.dice[i])) : 0;
        return h('div', { class: 'tku-wrap' },
          h('div', { class: 'tku-scores' }, s.players.map((p, i) => h('div', { class: ['dm-player', s.turn === i && s.phase !== 'over' && 'is-turn'] }, h('b', null, p.name), h('span', { class: 'tku-pts' }, s.scores[i].toLocaleString('da-DK')), h('span', { class: 'tku-bar' }, h('i', { style: { width: `${Math.min(100, s.scores[i] / B.GOAL * 100)}%` } }))))),
          h('div', { class: 'tku-table' },
            s.kept.length ? h('div', { class: 'tku-kept' }, h('small', null, 'Lagt til side'), h('div', { class: 'row', style: { gap: '6px' } }, s.kept.map(d => die(d, 'tku-small')))) : null,
            h('div', { class: 'tku-dice' }, s.dice.length ? s.dice.map((d, i) => h('button', { class: ['tku-die', pick.has(i) && 'is-picked'], disabled: !(my && s.phase === 'keep'), 'aria-label': `Terning ${d}`, 'aria-pressed': String(pick.has(i)), onclick: () => { pick.has(i) ? pick.delete(i) : pick.add(i); g.redraw(); } }, die(d))) : h('span', { class: 'faint' }, s.phase === 'over' ? '' : `${s.free} terninger klar`)),
            h('div', { class: 'tku-turn' }, `Turens point: `, h('b', null, (s.turnPts + pts).toLocaleString('da-DK')))),
          h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', my && 'is-mine', s.phase === 'bust' && 'is-bad'] },
            s.phase === 'over' ? `${s.players[s.winner].name} vandt med ${s.scores[s.winner].toLocaleString('da-DK')} point! 🎉` : s.phase === 'bust' ? `Ingen point – ${s.players[s.turn].name}s tur er slut` : my ? (s.phase === 'roll' ? (s.turnPts ? `Slå med ${s.free} terninger – eller stop` : 'Din tur – slå') : chosen.length ? (pts ? `${pts} point i de valgte` : 'De valgte giver ikke point') : 'Vælg de terninger, du vil gemme') : `${s.players[s.turn].name} slår …`),
          my ? h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
            s.phase === 'roll' ? h('button', { class: 'btn btn-primary btn-lg', onclick: () => ctl.act('roll') }, icon('cube'), `Slå ${s.free}`) : null,
            s.phase === 'keep' ? [h('button', { class: 'btn btn-primary', disabled: !pts, onclick: () => { const a = [...pick]; pick = new Set(); ctl.act('keep', [a]); } }, 'Gem og slå videre'), h('button', { class: 'btn', disabled: !pts, onclick: () => { const a = [...pick]; pick = new Set(); ctl.act('bank', [a]); } }, icon('check'), `Stop med ${(s.turnPts + pts).toLocaleString('da-DK')}`)] : null,
            s.phase === 'bust' ? h('button', { class: 'btn btn-primary', onclick: () => ctl.act('next') }, 'Videre') : null) : null,
          h('div', { class: 'row-actions' }, g.controls()),
          s.log.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 5).map(l => h('li', null, l))) : null);
      },
    });
    return gamePage('tenk', '10.000', 'Det populære terningespil: gem de terninger, der giver point, og slå videre – men slår du forkert, mister du det hele. Først til 10.000.', g);
  },
};

// ── Sorteper ──
const card = (c, opts = {}) => (c ? h('span', { class: ['ot-card', 'om2-card', 'HD'.includes(c[0]) && 'red', c === B.OLD && 'is-old'] }, h('span', { class: 'ot-tl' }, B.RANKS[Number(c.slice(1))], h('br'), B.SUITS[c[0]]), h('span', { class: 'ot-mid' }, c === B.OLD ? '🎩' : B.SUITS[c[0]])) : h('span', { class: 'ot-card om2-card om2-back', ...opts }));
export const oldmaid = {
  title: 'Sorteper',
  destroy() { this._g?.destroy(); },
  async render() {
    let store;
    try { store = await appState('oldmaid', { game: null, setup: { players: [{ name: 'Dig', ai: false }, { name: 'Computer 1', ai: true }, { name: 'Computer 2', ai: true }] }, wins: 0, played: 0 }); } catch (e) { return loadError('Sorteper', e); }
    const st = store.data;
    const g = this._g = hostedGame({
      page: 'oldmaid', game: 'oldmaid', title: 'Sorteper', store, minPlayers: 2, maxPlayers: 6,
      onlineText: 'Invitér op til 5 af dem, der har HUBTECH.',
      newGame: (seats) => B.newOldmaid(seats), apply: (s, seat, n, a) => B.applyOldmaid(s, seat, n, a), aiMove: B.aiOldmaid, aiDelay: () => 1000,
      onOver: (s, ctl) => { if (!ctl.online) { st.played++; if (s.players[s.loser]?.ai) st.wins++; } },
      rules: () => panel('Sådan spiller du', 'help', h('ul', { class: 'dm-rules' },
        h('li', null, 'Alle par lægges ud med det samme. Klør knægt er taget ud af spillet, så spar knægt – Sorteper – aldrig får en makker.'),
        h('li', null, 'Træk på skift et kort fra den næste spillers hånd uden at se det. Får du et par, lægges det ud.'),
        h('li', null, 'Den, der sidder tilbage med Sorteper, har tabt.'))),
      render(ctl) {
        const s = ctl.s, me = ctl.online ? Math.max(0, ctl.mySeat) : s.players.findIndex(p => !p.ai), my = ctl.canAct(s.turn) && s.phase === 'play';
        const from = B.drawFrom(s), drawer = my ? s.turn : null;
        const seats = s.players.map((p, i) => h('div', { class: ['om2-seat', s.turn === i && s.phase === 'play' && 'is-turn', !s.hands[i].length && 'is-out', i === from && my && 'is-from'] },
          h('b', null, p.name), h('span', { class: 'faint' }, s.hands[i].length ? `${s.hands[i].length} kort` : 'ude ✓'),
          i !== me && s.hands[i].length ? h('div', { class: 'om2-fan' }, s.hands[i].map((_, k) => (i === from && my ? h('button', { class: 'ot-card om2-card om2-back can', 'aria-label': `Træk kort ${k + 1}`, onclick: () => ctl.act('draw', [k]) }) : card(null)))) : null));
        const mine = s.hands[me] || [];
        const status = s.phase === 'over' ? (s.loser === me ? 'Du sidder med Sorteper! 🎩' : `${s.players[s.loser]?.name || ''} sidder med Sorteper – du slap! 🎉`) : my ? `Træk et kort fra ${s.players[from].name}` : `${s.players[s.turn].name} trækker …`;
        return h('div', { class: 'om2-wrap' },
          h('div', { class: 'om2-seats' }, seats),
          s.last?.pair && Date.now() - s.last.at < 2500 ? h('div', { class: 'om2-pair' }, `${s.players[s.last.seat].name} fik et par`, card(s.last.card)) : null,
          h('div', { class: ['dm-status', s.phase === 'over' && 'is-over', my && 'is-mine'] }, status),
          h('div', { class: 'om2-mine' }, h('small', { class: 'faint' }, 'Dine kort'), h('div', { class: 'ot-hand om2-hand' }, mine.length ? mine.map(c => card(c)) : h('span', { class: 'faint' }, 'Ingen kort – du er ude!'))),
          h('div', { class: 'row-actions' }, g.controls()),
          s.log.length ? h('ul', { class: 'dm-log' }, s.log.slice(0, 4).map(l => h('li', null, l))) : null);
      },
    });
    return gamePage('oldmaid', 'Sorteper', 'Det klassiske kortspil: træk kort fra hinanden, læg parrene ud – og håb, at det ikke er dig, der sidder tilbage med Sorteper.', g);
  },
};

// ── Del regningen ──
export const splitbill = {
  title: 'Del regningen',
  async render() {
    let store;
    try { store = await appState('splitbill', { total: 600, people: 4, tip: 0, round: 1, mode: 'even', paid: [['Anna', 300], ['Bo', 150], ['Carl', 0]] }); } catch (e) { return loadError('Del regningen', e); }
    const st = store.data, root = h('div');
    const kr = (n) => `${n.toLocaleString('da-DK', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr.`;
    function draw() {
      let body;
      if (st.mode === 'even') {
        const out = h('div');
        const calc = () => { const r = B.splitBill(Number(st.total) || 0, Number(st.people) || 1, Number(st.tip) || 0, Number(st.round) || 1); h(clear(out), null, h('div', { class: 'os-big' }, h('span', { class: 'faint' }, 'Hver betaler'), h('b', null, kr(st.round > 1 ? r.rounded : Math.round(r.each * 100) / 100)), h('span', null, `I alt ${kr(Math.round(r.withTip * 100) / 100)}${st.round > 1 && r.extra > 0.004 ? ` · ${kr(Math.round(r.extra * 100) / 100)} til overs` : ''}`), h('button', { class: 'btn btn-sm', onclick: () => copy(String(st.round > 1 ? r.rounded : Math.round(r.each * 100) / 100)) }, icon('copy'), 'Kopiér beløbet'))); };
        const f = (k, label, attrs) => { const el = h('input', { class: 'input', type: 'number', value: st[k], 'aria-label': label, ...attrs }); el.addEventListener('input', () => { st[k] = Number(el.value); store.save(); calc(); }); return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el); };
        body = h('div', { class: 'os-wrap' }, h('div', { class: 'l3-card', style: { justifyItems: 'stretch', alignContent: 'start' } }, f('total', 'Regningen (kr.)', { min: 0, step: 'any' }), f('people', 'Antal personer', { min: 1, max: 100 }),
          h('span', { class: 'field-label' }, 'Drikkepenge'), segmented([0, 5, 10, 15].map(v => ({ value: String(v), label: `${v} %` })), String(st.tip), (v) => { st.tip = Number(v); store.save(); calc(); }, { label: 'Drikkepenge' }),
          h('span', { class: 'field-label' }, 'Rund op til'), segmented([1, 5, 10, 50].map(v => ({ value: String(v), label: v === 1 ? 'Øre' : `${v} kr.` })), String(st.round), (v) => { st.round = Number(v); store.save(); calc(); }, { label: 'Rund op' })),
          h('div', { class: 'l3-card' }, out));
        calc();
      } else {
        const rows = h('div', { class: 'stack', style: { gap: '6px' } }), out = h('div');
        const calc = () => { const paid = Object.fromEntries(st.paid.filter(p => p[0].trim()).map(p => [p[0].trim(), Number(p[1]) || 0])); const r = B.settleUp(paid);
          h(clear(out), null, h('p', { class: 'faint', style: { margin: '0 0 8px' } }, `Hver skulle betale ${kr(Math.round(r.share * 100) / 100)}`), r.out.length ? h('ul', { class: 'su-list' }, r.out.map(x => h('li', { class: 'su-slot' }, h('div', { class: 'su-b' }, h('b', null, `${x.from} → ${x.to}`)), h('b', { class: 'ok' }, kr(x.amount))))) : h('p', { class: 'ok' }, 'Alle har betalt lige meget ✓')); };
        const drawRows = () => h(clear(rows), null, st.paid.map((p, i) => { const n = h('input', { class: 'input', value: p[0], placeholder: 'Navn', 'aria-label': `Navn ${i + 1}` }), a = h('input', { class: 'input', type: 'number', value: p[1], placeholder: 'Betalt', 'aria-label': `Betalt af ${i + 1}`, style: { width: '120px' } });
          n.addEventListener('input', () => { p[0] = n.value; store.save(); calc(); }); a.addEventListener('input', () => { p[1] = Number(a.value); store.save(); calc(); });
          return h('div', { class: 'row', style: { gap: '6px' } }, n, a, st.paid.length > 2 ? h('button', { class: 'icon-btn', 'aria-label': 'Fjern', onclick: () => { st.paid.splice(i, 1); store.save(); drawRows(); calc(); } }, icon('x')) : null); }),
          h('button', { class: 'btn btn-sm', onclick: () => { st.paid.push(['', 0]); store.save(); drawRows(); } }, icon('plus'), 'Tilføj person'));
        drawRows(); calc();
        body = h('div', { class: 'os-wrap' }, h('div', { class: 'l3-card', style: { justifyItems: 'stretch', alignContent: 'start' } }, h('span', { class: 'field-label' }, 'Hvem har lagt ud?'), rows), h('div', { class: 'l3-card', style: { justifyItems: 'stretch' } }, h('b', null, 'Sådan går det lige op'), out));
      }
      h(clear(root), null, h('div', { class: 'l3-bar' }, segmented([{ value: 'even', label: 'Del ligeligt' }, { value: 'settle', label: 'Hvem skylder hvem?' }], st.mode, (v) => { st.mode = v; store.save(); draw(); }, { label: 'Visning' })), body);
    }
    draw();
    return page('splitbill', 'Værktøjer', 'Del regningen', 'Del regningen på restauranten eller turen: ligeligt med drikkepenge og oprunding – eller regn ud, hvem der skylder hvem, når I har lagt forskelligt ud.', root);
  },
};

// ── Navnemaskine ──
export const namegen = {
  title: 'Navnemaskine',
  async render() {
    let store;
    try { store = await appState('namegen', { kind: 'hold', saved: [] }); } catch (e) { return loadError('Navnemaskine', e); }
    const st = store.data, root = h('div');
    const KINDS = { hold: 'Holdnavne', rum: 'Rumskibe og planeter', fantasy: 'Fantasy-figurer', kæledyr: 'Kæledyr', wifi: 'Wi-Fi-navne' };
    let names = [];
    const roll = () => { const set = new Set(); let k = 0; while (set.size < 8 && k++ < 80) set.add(B.makeName(st.kind)); names = [...set]; draw(); };
    function draw() {
      h(clear(root), null,
        h('div', { class: 'l3-bar' }, segmented(Object.entries(KINDS).map(([value, label]) => ({ value, label })), st.kind, (v) => { st.kind = v; store.save(); roll(); }, { label: 'Slags navne' })),
        h('div', { class: 'l3-card' }, h('div', { class: 'ng2-names' }, names.map(n => h('div', { class: 'ng2-name' }, h('b', null, n),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': `Gem ${n}`, onclick: () => { if (!st.saved.includes(n)) { st.saved.unshift(n); st.saved = st.saved.slice(0, 40); store.save(); toast(`${n} er gemt`, { type: 'ok', ms: 1000 }); draw(); } } }, icon('star')),
          h('button', { class: 'icon-btn btn-sm', 'aria-label': `Kopiér ${n}`, onclick: () => copy(n) }, icon('copy'))))),
          h('button', { class: 'btn btn-primary btn-lg', onclick: roll }, icon('sparkles'), 'Nye navne')),
        st.saved.length ? panel('Gemte navne', 'star', h('div', { class: 'wl-tags' }, st.saved.map(n => h('span', { class: 'chip' }, n, h('button', { class: 'su-x', 'aria-label': `Fjern ${n}`, onclick: () => { st.saved = st.saved.filter(x => x !== n); store.save(); draw(); } }, '×'))))) : null);
    }
    roll();
    return page('namegen', 'Kreativ', 'Navnemaskine', 'Mangler I et holdnavn, et navn til rumskibet i historien, en fantasy-figur eller det nye kæledyr? Tryk, og få otte bud ad gangen.', root);
  },
};

// ── Skriveværksted ──
export const writing = {
  title: 'Skriveværksted',
  destroy() { clearInterval(this._iv); },
  async render() {
    let store;
    try { store = await appState('writing', { prompt: null, text: '', goal: 200, minutes: 10, stories: [] }); } catch (e) { return loadError('Skriveværksted', e); }
    const st = store.data, self = this, root = h('div');
    let ends = null;
    if (!st.prompt) st.prompt = B.PROMPTS[Math.floor(Math.random() * B.PROMPTS.length)];
    function draw() {
      const ta = h('textarea', { class: 'textarea wr-text', rows: 14, placeholder: 'Skriv løs – stavefejl er ligegyldige lige nu. Bare skriv!', 'aria-label': 'Din historie' }, st.text);
      const stats = h('div', { class: 'wr-stats' }), timer = h('b', { class: 'wr-timer' });
      const upd = () => { const c = B.textCount(ta.value), pct = Math.min(100, Math.round(c.words / (st.goal || 1) * 100)); h(clear(stats), null, h('span', null, h('b', null, String(c.words)), ` af ${st.goal} ord`), h('div', { class: 'ch-prog', style: { flex: 1 } }, h('i', { style: { width: `${pct}%` } })), h('span', { class: 'faint' }, `${c.sentences} sætninger · ${c.chars} tegn`)); };
      let saveT; ta.addEventListener('input', () => { st.text = ta.value; upd(); const sb = root.querySelector('.wr-save'); if (sb) sb.disabled = !ta.value.trim(); clearTimeout(saveT); saveT = setTimeout(() => store.save(), 600); });
      const tick = () => { if (!ends) { timer.textContent = `${st.minutes}:00`; return; } const left = Math.max(0, ends - Date.now()); timer.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; if (!left) { clearInterval(self._iv); ends = null; toast('Tiden er gået – godt skrevet! ✍️', { type: 'xp' }); } };
      h(clear(root), null,
        h('div', { class: 'wr-prompt' }, h('small', null, 'Skrivestarter'), h('p', null, st.prompt), h('button', { class: 'btn btn-sm', onclick: () => { let p; do { p = B.PROMPTS[Math.floor(Math.random() * B.PROMPTS.length)]; } while (p === st.prompt); st.prompt = p; store.save(); draw(); } }, icon('refresh'), 'En anden')),
        h('div', { class: 'l3-bar' }, h('label', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, h('span', { class: 'faint' }, 'Mål'), segmented([100, 200, 500].map(v => ({ value: String(v), label: `${v} ord` })), String(st.goal), (v) => { st.goal = Number(v); store.save(); upd(); }, { label: 'Ordmål' })),
          h('label', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, h('span', { class: 'faint' }, 'Tid'), segmented([5, 10, 20].map(v => ({ value: String(v), label: `${v} min.` })), String(st.minutes), (v) => { st.minutes = Number(v); store.save(); tick(); }, { label: 'Tid' })),
          timer, h('button', { class: 'btn btn-sm btn-primary', onclick: () => { ends = Date.now() + st.minutes * 60000; clearInterval(self._iv); self._iv = setInterval(() => { if (!document.body.contains(root)) return clearInterval(self._iv); tick(); }, 500); ta.focus(); } }, icon('play'), 'Start tiden')),
        ta, stats,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => copy(ta.value, 'Historien er kopieret') }, icon('copy'), 'Kopiér'),
          h('button', { class: 'btn btn-primary wr-save', disabled: !st.text.trim(), onclick: () => { st.stories.unshift({ at: Date.now(), prompt: st.prompt, text: st.text }); st.stories = st.stories.slice(0, 30); st.text = ''; store.save(); toast('Historien er gemt', { type: 'ok' }); draw(); } }, icon('check'), 'Gem historien')),
        st.stories.length ? panel('Mine historier', 'book', h('div', { class: 'stack', style: { gap: '8px' } }, st.stories.map(s => h('details', { class: 'wr-story' }, h('summary', null, h('b', null, s.text.split(/\s+/).slice(0, 8).join(' '), ' …'), h('span', { class: 'faint' }, ` · ${B.textCount(s.text).words} ord · ${new Date(s.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`)),
          h('p', { class: 'faint', style: { fontStyle: 'italic' } }, s.prompt), h('p', { style: { whiteSpace: 'pre-wrap' } }, s.text),
          h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn btn-sm', onclick: () => copy(s.text) }, icon('copy'), 'Kopiér'), h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Slet historien?', confirmLabel: 'Slet', danger: true })) { st.stories = st.stories.filter(x => x !== s); store.save(); draw(); } } }, icon('trash'), 'Slet')))))) : null);
      upd(); tick();
    }
    draw();
    return page('writing', 'Kreativ', 'Skriveværksted', 'Få en skrivestarter, sæt et ordmål og en tid – og skriv løs. Dine historier gemmes, så du kan læse dem igen.', root);
  },
};

// ── Cykelprøven ──
export const bikequiz = {
  title: 'Cykelprøven',
  async render() {
    let store;
    try { store = await appState('bikequiz', { best: 0, passed: 0 }); } catch (e) { return loadError('Cykelprøven', e); }
    const st = store.data, root = h('div');
    let order, idx, right, answered, opts;
    const start = () => { order = B.BIKE.map((_, i) => i).sort(() => Math.random() - 0.5); idx = 0; right = 0; answered = null; shuffle(); draw(); };
    const shuffle = () => { const q = B.BIKE[order[idx]]; opts = q[1].map((t, i) => ({ t, ok: i === q[2] })).sort(() => Math.random() - 0.5); };
    function draw() {
      if (idx >= order.length) {
        const pct = Math.round(right / order.length * 100), ok = pct >= 80; if (right > st.best) st.best = right; if (ok) st.passed++; store.save();
        h(clear(root), null, h('div', { class: 'l3-card' }, h('span', { class: 'qz-big' }, ok ? '🚲🏅' : '🚲'), h('p', { class: 'l3-ask' }, ok ? 'Bestået!' : 'Næsten – øv dig lidt mere', h('b', null, `${right} af ${order.length} rigtige`)), h('span', { class: 'faint' }, 'Man skal have mindst 80 % rigtige for at bestå her.'), h('button', { class: 'btn btn-primary btn-lg', onclick: start }, icon('refresh'), 'Prøv igen')));
        return;
      }
      const q = B.BIKE[order[idx]];
      h(clear(root), null, h('div', { class: 'l3-card' },
        h('div', { class: 'l3-score' }, h('span', null, `Spørgsmål ${idx + 1} af ${order.length}`), h('span', null, h('b', null, String(right)), ' rigtige'), h('span', { class: 'faint' }, `bedste ${st.best}`)),
        h('div', { class: 'ch-prog', style: { width: '100%' } }, h('i', { style: { width: `${idx / order.length * 100}%` } })),
        h('p', { class: 'l3-ask bq-q' }, h('b', null, q[0])),
        h('div', { class: 'l3-opts', style: { gridTemplateColumns: '1fr' } }, opts.map(o => h('button', { class: ['l3-opt', answered && o.ok && 'ok', answered && answered === o && !o.ok && 'bad'], disabled: !!answered, onclick: () => { answered = o; if (o.ok) right++; draw(); } }, o.t))),
        answered ? h('div', { class: ['l3-fb', answered.ok ? 'ok' : 'bad'] }, answered.ok ? 'Rigtigt! ' : 'Forkert. ', q[3]) : null,
        answered ? h('button', { class: 'btn btn-primary btn-lg l3-next', onclick: () => { idx++; answered = null; if (idx < order.length) shuffle(); draw(); } }, idx + 1 < order.length ? 'Næste' : 'Se resultatet', icon('play')) : null));
    }
    start();
    return page('bikequiz', 'Lær', 'Cykelprøven', 'Øv dig til cykelprøven: vigepligt, tegngivning, venstresving, lys og cyklen. Svar på alle spørgsmålene – med 80 % rigtige har du bestået.', root);
  },
};

// ── Kims leg ──
export const kim = {
  title: 'Kims leg',
  destroy() { clearTimeout(this._t); },
  async render() {
    let store;
    try { store = await appState('kim', { best: 0 }); } catch (e) { return loadError('Kims leg', e); }
    const st = store.data, self = this, root = h('div');
    let level = 0, round, phase = 'start', left = 0;
    const count = () => 4 + level;
    const show = () => { round = B.kimRound(count()); phase = 'look'; left = Math.max(3, 8 - Math.floor(level / 2)); draw(); const tick = () => { left--; if (left <= 0) { phase = 'hide'; draw(); self._t = setTimeout(() => { phase = 'guess'; draw(); }, 900); } else { draw(); self._t = setTimeout(tick, 1000); } }; clearTimeout(self._t); self._t = setTimeout(tick, 1000); };
    function draw() {
      let body;
      if (phase === 'start') body = [h('span', { class: 'qz-big' }, '👀'), h('p', { class: 'l3-ask' }, 'Kig godt på tingene – så forsvinder én af dem.', h('b', null, 'Kan du huske hvilken?')), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { level = 0; show(); } }, icon('play'), 'Start'), st.best ? h('span', { class: 'faint' }, `Din rekord er ${st.best} ting`) : null];
      else if (phase === 'look') body = [h('p', { class: 'l3-ask' }, `Husk de ${count()} ting!`, h('b', null, String(left))), h('div', { class: 'km-grid' }, round.shown.map(x => h('span', { class: 'km-item' }, x)))];
      else if (phase === 'hide') body = [h('p', { class: 'l3-ask' }, 'Luk øjnene …', h('b', null, '🙈')), h('div', { class: 'km-grid' }, round.shown.map(() => h('span', { class: 'km-item is-hidden' }, '❔')))];
      else if (phase === 'guess') body = [h('p', { class: 'l3-ask' }, 'Én ting er væk.', h('b', null, 'Hvilken?')), h('div', { class: 'km-grid' }, round.shown.map(x => h('span', { class: 'km-item' }, x === round.gone ? '❔' : x))),
        h('div', { class: 'km-opts' }, round.options.map(o => h('button', { class: 'km-opt', 'aria-label': `Svar ${o}`, onclick: () => { if (o === round.gone) { level++; if (count() - 1 > st.best) { st.best = count() - 1; store.save(); } toast(`Rigtigt! Nu ${count()} ting`, { type: 'ok', ms: 1100 }); show(); } else { phase = 'over'; draw(); } } }, o)))];
      else body = [h('span', { class: 'qz-big' }, '🙃'), h('p', { class: 'l3-ask' }, `Det var ${round.gone}`, h('b', null, `Du huskede op til ${count() - 1} ting`)), h('button', { class: 'btn btn-primary btn-lg', onclick: () => { level = 0; show(); } }, icon('refresh'), 'Igen')];
      h(clear(root), null, h('div', { class: 'l3-card km-card' }, body));
    }
    draw();
    return page('kim', 'Spilhal', 'Kims leg', 'Den gamle huskeleg: kig på tingene, luk øjnene – og find ud af, hvad der er forsvundet. For hver runde kommer der én ting mere.', root);
  },
};
