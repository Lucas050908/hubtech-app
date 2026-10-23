/**
 * Quizshow – a live quiz for the class, the family or a party. The host shows the questions on a big screen;
 * everyone answers on their phone with a PIN – no account needed. Fast right answers give the most points.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { api } from '../core/api.js';
import { store as appStore } from '../core/store.js';
import { appHero } from '../features/apphero.js';
import { panel, appState, loadError, uid, copy } from '../features/appkit.js';
import { SAMPLE_QUIZZES } from '../data/quizshow-quizzes.js';

const SHAPES = ['▲', '◆', '●', '■'];
const joinUrl = (pin) => `${location.origin}/#/q/${pin}`;
const qs = {
  create: (quiz) => api.post('/api/qs', { quiz }),
  get: (pin, p) => api.get(`/api/qs/${pin}${p ? `?p=${encodeURIComponent(p)}` : ''}`),
  join: (pin, name, p) => api.post(`/api/qs/${pin}/join`, { name, p }),
  answer: (pin, p, choice) => api.post(`/api/qs/${pin}/answer`, { p, choice }),
  host: (pin, action, extra = {}) => api.post(`/api/qs/${pin}/host`, { action, ...extra }),
};
/** poll the room about once a second; fn(state). Returns stop() */
function poll(pin, p, fn, onGone) {
  let stop = false, last = -1, t = null, fails = 0;
  const tick = async () => {
    if (stop) return;
    try { const s = await qs.get(pin, p); fails = 0; if (s.ver !== last || s.phase === 'question') { last = s.ver; fn(s); } }
    catch (e) { if (e.status === 404) { onGone?.(); return; } if (++fails > 20) { onGone?.(); return; } }
    t = setTimeout(tick, document.hidden ? 3000 : 900);
  };
  tick();
  return () => { stop = true; clearTimeout(t); };
}
const secsLeft = (s) => Math.max(0, Math.ceil(s.deadline - s.now - (performance.now() - (s._t || performance.now())) / 1000));

// ── the player's view (also used on the public #/q link) ──
export function playerView(initialPin = '') {
  const root = h('div', { class: 'qz-player' });
  const KEY = 'hubtech.quizshow.player';
  let me = null, stopPoll = null, timer = null;
  try { me = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch { /* */ } };
  const cleanup = () => { stopPoll?.(); clearInterval(timer); };
  root._cleanup = cleanup;

  function joinForm(err = '') {
    cleanup();
    const pin = h('input', { class: 'input qz-pin-in', inputmode: 'numeric', maxlength: 6, placeholder: 'PIN', value: initialPin || '', 'aria-label': 'PIN-kode' });
    const name = h('input', { class: 'input', maxlength: 24, placeholder: 'Dit navn', value: me?.name || appStore.get('user')?.displayName?.split(' ')[0] || '', 'aria-label': 'Dit navn' });
    const e = h('div', { class: 'field-error' }, err);
    const go = async () => {
      const p = pin.value.replace(/\D/g, ''), n = name.value.trim();
      if (p.length !== 6) { e.textContent = 'PIN-koden har 6 cifre.'; pin.focus(); return; }
      if (!n) { e.textContent = 'Skriv dit navn.'; name.focus(); return; }
      btn.disabled = true;
      try { const s = await qs.join(p, n, me?.pin === p ? me.p : null); me = { pin: p, p: s.p, name: n }; save(); play(s); }
      catch (x) { e.textContent = x.message; btn.disabled = false; }
    };
    const btn = h('button', { class: 'btn btn-primary btn-lg', onclick: go }, 'Deltag');
    [pin, name].forEach(i => i.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); }));
    h(clear(root), null, h('div', { class: 'qz-join' }, h('div', { class: 'qz-logo' }, icon('sparkles'), h('b', null, 'Quizshow')),
      pin, name, e, btn, h('p', { class: 'faint', style: { margin: 0, fontSize: '13px' } }, 'Du behøver ikke en konto – bare et navn.')));
    (initialPin ? name : pin).focus();
  }

  function play(first) {
    cleanup();
    let s = first, sentQ = -1;
    const draw = () => {
      const m = s.me || {};
      if (s.phase === 'lobby') return h(clear(root), null, h('div', { class: 'qz-wait' }, h('div', { class: 'qz-big' }, '👋'), h('h2', null, `Du er med, ${m.name || me.name}!`), h('p', { class: 'muted' }, 'Kig op på skærmen – quizzen starter snart.'), h('span', { class: 'faint' }, `${s.players} er med`)));
      if (s.phase === 'question') {
        if (m.answered) return h(clear(root), null, h('div', { class: 'qz-wait' }, h('div', { class: 'qz-big qz-spin' }, '⏳'), h('h2', null, 'Svaret er sendt'), h('p', { class: 'muted' }, 'Venter på de andre …')));
        if (sentQ === s.qi && root.querySelector('.qz-answers')) return;
        sentQ = s.qi;
        return h(clear(root), null, h('div', { class: 'qz-qhead' }, h('span', null, `${s.qi + 1}/${s.qn}`), h('b', { class: 'qz-timer' }, String(secsLeft(s)))),
          h('p', { class: 'qz-qtext' }, s.question.q),
          h('div', { class: ['qz-answers', `n${s.question.options.length}`] }, s.question.options.map((o, i) => h('button', { class: `qz-ans c${i}`, 'aria-label': o, onclick: async (e) => {
            root.querySelectorAll('.qz-ans').forEach(b => { b.disabled = true; }); e.currentTarget.classList.add('is-picked');
            try { s = await qs.answer(me.pin, me.p, i); s._t = performance.now(); draw(); } catch (x) { toast(x.message, { type: 'warn' }); }
          } }, h('span', { class: 'qz-shape' }, SHAPES[i]), h('span', null, o)))));
      }
      if (s.phase === 'reveal') {
        const ok = m.ok, answered = m.choice != null;
        return h(clear(root), null, h('div', { class: ['qz-feedback', ok ? 'is-ok' : 'is-bad'] },
          h('div', { class: 'qz-big' }, ok ? '✓' : answered ? '✗' : '⌛'), h('h2', null, ok ? 'Rigtigt!' : answered ? 'Forkert' : 'Tiden løb ud'),
          ok ? h('b', { class: 'qz-got' }, `+${m.got}`) : null, m.streak >= 2 ? h('span', null, `🔥 ${m.streak} i træk`) : null,
          h('p', null, `Du er nr. ${m.rank} med ${m.score} point`)));
      }
      if (s.phase === 'board') return h(clear(root), null, h('div', { class: 'qz-wait' }, h('div', { class: 'qz-big' }, m.rank <= 3 ? ['🥇', '🥈', '🥉'][m.rank - 1] : '📊'), h('h2', null, `Du er nr. ${m.rank}`), h('p', { class: 'muted' }, `${m.score} point`)));
      if (s.phase === 'end') {
        cleanup();
        return h(clear(root), null, h('div', { class: 'qz-wait' }, h('div', { class: 'qz-big' }, m.rank <= 3 ? ['🥇', '🥈', '🥉'][m.rank - 1] : '🎉'), h('h2', null, 'Quizzen er slut!'), h('p', null, `Du blev nr. ${m.rank} af ${s.players} med ${m.score} point.`),
          h('button', { class: 'btn', onclick: () => { me = null; save(); joinForm(); } }, 'Deltag i en ny quiz')));
      }
    };
    s._t = performance.now(); draw();
    stopPoll = poll(me.pin, me.p, (ns) => { ns._t = performance.now(); s = ns; draw(); }, () => joinForm('Quizzen findes ikke længere.'));
    timer = setInterval(() => { const t = root.querySelector('.qz-timer'); if (t && s.phase === 'question') t.textContent = String(secsLeft(s)); }, 250);
  }

  if (me?.pin && (!initialPin || initialPin === me.pin)) qs.get(me.pin, me.p).then(s => (s.me ? play(s) : joinForm())).catch(() => joinForm());
  else joinForm();
  return root;
}

/** the public page: #/q and #/q/<pin> */
export function renderJoin(pin) {
  const v = playerView(pin || '');
  return h('div', { class: 'qz-public' }, v);
}

export default {
  title: 'Quizshow',
  destroy() { this._stop?.(); this._pl?._cleanup?.(); clearInterval(this._timer); },
  async render(ctx) {
    const app = appById('quizshow');
    let store;
    try { store = await appState('quizshow', { quizzes: [] }); } catch (e) { return loadError('Quizshow', e); }
    const st = store.data, self = this;
    const root = h('div');
    const all = () => [...st.quizzes, ...SAMPLE_QUIZZES.map(q => ({ ...q, sample: true }))];

    function home() {
      const pin = h('input', { class: 'input qz-pin-in', inputmode: 'numeric', maxlength: 6, placeholder: 'PIN', 'aria-label': 'PIN-kode til en quiz' });
      const go = () => { const p = pin.value.replace(/\D/g, ''); if (p.length === 6) location.hash = `#/apps/quizshow/play/${p}`; else toast('PIN-koden har 6 cifre', { type: 'warn' }); };
      pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      const card = (q) => h('div', { class: 'qz-card' },
        h('div', { class: 'qz-card-b' }, h('b', null, q.title), h('span', { class: 'faint' }, `${q.questions.length} spørgsmål${q.sample ? ' · færdig quiz' : ''}`)),
        h('div', { class: 'row', style: { gap: '4px' } },
          !q.sample ? h('a', { class: 'btn btn-sm btn-ghost', href: `#/apps/quizshow/edit/${q.id}` }, icon('edit'), 'Ret') : h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { const c = { ...structuredClone(q), id: uid(), title: `${q.title} (kopi)` }; delete c.sample; st.quizzes.unshift(c); store.save(); location.hash = `#/apps/quizshow/edit/${c.id}`; } }, icon('copy'), 'Kopiér og ret'),
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => start(q) }, icon('play'), 'Start')));
      h(clear(root), null,
        h('div', { class: 'qz-home' },
          panel('Deltag i en quiz', 'users', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Skriv PIN-koden fra skærmen.'), h('div', { class: 'row', style: { gap: '8px' } }, pin, h('button', { class: 'btn btn-primary', onclick: go }, 'Deltag'))),
          panel('Vær vært', 'sparkles', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Vis quizzen på en stor skærm. Alle svarer på deres egen telefon – uden konto.'),
            h('button', { class: 'btn btn-primary', onclick: () => { const q = { id: uid(), title: 'Min quiz', questions: [{ q: '', options: ['', '', '', ''], correct: [0], time: 20 }] }; st.quizzes.unshift(q); store.save(); location.hash = `#/apps/quizshow/edit/${q.id}`; } }, icon('plus'), 'Lav en ny quiz'))),
        h('h3', { class: 'gr-h', style: { marginTop: '18px' } }, 'Quizzer'),
        h('div', { class: 'qz-cards' }, all().map(card)));
      pin.focus();
    }

    function edit(id) {
      const q = st.quizzes.find(x => x.id === id);
      if (!q) { location.hash = '#/apps/quizshow'; return; }
      const box = h('div', { class: 'fm-builder' });
      let t = null;
      const save = () => { clearTimeout(t); t = setTimeout(() => store.save(), 500); };
      const title = h('input', { class: 'input fm-title-in', value: q.title, maxlength: 100, 'aria-label': 'Navn på quizzen' });
      title.addEventListener('input', () => { q.title = title.value; save(); });
      const draw = () => h(clear(box), null, q.questions.map((x, i) => {
        x.correct = Array.isArray(x.correct) ? x.correct : [x.correct];
        const text = h('input', { class: 'input', value: x.q, maxlength: 200, placeholder: 'Skriv spørgsmålet', 'aria-label': `Spørgsmål ${i + 1}` });
        text.addEventListener('input', () => { x.q = text.value; save(); });
        const time = h('select', { class: 'select', 'aria-label': 'Tid', style: { width: 'auto' } }, [10, 20, 30, 60].map(s => h('option', { value: s, selected: s === x.time }, `${s} sek.`)));
        time.addEventListener('change', () => { x.time = Number(time.value); save(); });
        return h('div', { class: 'fm-bfield' },
          h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'fm-n' }, String(i + 1)), text, time),
          h('div', { class: 'qz-opts' }, [0, 1, 2, 3].map(k => {
            const o = h('input', { class: 'input', value: x.options[k] || '', maxlength: 80, placeholder: k < 2 ? `Svar ${k + 1}` : `Svar ${k + 1} (valgfrit)`, 'aria-label': `Spørgsmål ${i + 1}, svar ${k + 1}` });
            o.addEventListener('input', () => { x.options[k] = o.value; save(); });
            const right = x.correct.includes(k);
            return h('div', { class: `qz-opt c${k}` }, h('span', { class: 'qz-shape' }, SHAPES[k]), o,
              h('button', { class: ['qz-right', right && 'is-on'], 'aria-pressed': String(right), 'aria-label': `Svar ${k + 1} er rigtigt`, title: 'Rigtigt svar', onclick: () => { x.correct = right ? x.correct.filter(c => c !== k) : [...x.correct, k]; if (!x.correct.length) x.correct = [k]; save(); draw(); } }, icon('check')));
          })),
          h('div', { class: 'row', style: { gap: '2px', justifyContent: 'flex-end' } },
            h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Flyt op', disabled: !i, onclick: () => { [q.questions[i - 1], q.questions[i]] = [q.questions[i], q.questions[i - 1]]; save(); draw(); } }, icon('chevronUp')),
            h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Kopiér spørgsmål', onclick: () => { q.questions.splice(i + 1, 0, structuredClone(x)); save(); draw(); } }, icon('copy')),
            h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet spørgsmål', disabled: q.questions.length < 2, onclick: () => { q.questions.splice(i, 1); save(); draw(); } }, icon('trash'))));
      }), h('button', { class: 'btn', onclick: () => { q.questions.push({ q: '', options: ['', '', '', ''], correct: [0], time: 20 }); save(); draw(); box.querySelectorAll('.fm-bfield')[q.questions.length - 1]?.querySelector('input')?.focus(); } }, icon('plus'), 'Tilføj spørgsmål'));
      draw();
      h(clear(root), null,
        h('div', { class: 'sh-detail-h' }, h('a', { class: 'btn btn-sm', href: '#/apps/quizshow', onclick: () => store.flush() }, icon('arrowLeft'), 'Tilbage'), title,
          h('button', { class: 'icon-btn', 'aria-label': 'Slet quizzen', onclick: async () => { if (await confirmDialog({ title: 'Slet quizzen?', confirmLabel: 'Slet', danger: true })) { st.quizzes = st.quizzes.filter(x => x !== q); store.save(); location.hash = '#/apps/quizshow'; } } }, icon('trash')),
          h('button', { class: 'btn btn-primary', onclick: () => { store.flush(); start(q); } }, icon('play'), 'Start quizzen')),
        h('p', { class: 'faint' }, 'Tryk på ✓ ved det rigtige svar (der kan godt være flere). Spørgsmål uden tekst eller med under to svar springes over.'),
        box);
    }

    async function start(q) {
      try { const s = await qs.create(q); location.hash = `#/apps/quizshow/host/${s.pin}`; }
      catch (e) { toast('Kunne ikke starte', { type: 'bad', text: e.message }); }
    }

    function host(pin) {
      let s = null;
      const stage = h('div', { class: 'qz-stage' });
      const act = async (a, extra) => { try { s = await qs.host(pin, a, extra); s._t = performance.now(); draw(); } catch (e) { toast(e.message, { type: 'bad' }); } };
      const qrBox = h('span', { class: 'qz-qr' });
      import('../features/qr.js').then(m => m.qrSvg(joinUrl(pin), 170)).then(svg => qrBox.append(svg)).catch(() => {});
      const draw = () => {
        if (!s) return;
        if (s.phase === 'lobby') return h(clear(stage), null,
          h('div', { class: 'qz-lobby' }, h('div', { class: 'qz-joinbox' }, h('span', null, 'Gå til'), h('b', { class: 'qz-url' }, joinUrl('').replace(/^https?:\/\//, '').replace(/\/$/, '')), h('span', null, 'og skriv PIN-koden'), h('div', { class: 'qz-pin' }, `${pin.slice(0, 3)} ${pin.slice(3)}`),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => copy(joinUrl(pin), 'Linket er kopieret') }, icon('copy'), 'Kopiér link')), qrBox),
          h('div', { class: 'qz-names' }, s.names?.length ? s.names.map(n => h('button', { class: 'qz-name', title: 'Tryk for at fjerne', onclick: () => act('kick', { name: n }) }, n)) : h('p', { class: 'muted' }, 'Venter på deltagere …')),
          h('div', { class: 'qz-hostbar' }, h('span', null, h('b', null, String(s.players)), ' med'), h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary btn-lg', disabled: !s.players, onclick: () => act('next') }, icon('play'), 'Start')));
        if (s.phase === 'question' || s.phase === 'reveal') {
          const rev = s.phase === 'reveal', max = Math.max(1, ...(s.counts || [1]));
          return h(clear(stage), null,
            h('div', { class: 'qz-hostq' }, h('span', { class: 'faint' }, `Spørgsmål ${s.qi + 1} af ${s.qn}`), h('h2', null, s.question.q)),
            h('div', { class: 'qz-mid' }, !rev ? h('div', { class: 'qz-bigtimer' }, h('b', { class: 'qz-timer' }, String(secsLeft(s))), h('small', null, 'sek.')) : null,
              !rev ? h('div', { class: 'qz-count' }, h('b', null, String(s.answered)), h('small', null, `af ${s.players} har svaret`))
                : h('div', { class: 'qz-bars' }, s.question.options.map((o, i) => h('div', { class: ['qz-barcol', `c${i}`, s.correct.includes(i) && 'is-right'] }, h('b', null, String(s.counts[i] || 0)), h('i', { style: { height: `${Math.round((s.counts[i] || 0) / max * 100)}%` } }), h('span', null, SHAPES[i]))))),
            h('div', { class: ['qz-answers', 'qz-host-ans', `n${s.question.options.length}`] }, s.question.options.map((o, i) => h('div', { class: ['qz-ans', `c${i}`, rev && !s.correct.includes(i) && 'is-dim', rev && s.correct.includes(i) && 'is-right'] }, h('span', { class: 'qz-shape' }, SHAPES[i]), h('span', null, o), rev && s.correct.includes(i) ? icon('check') : null))),
            h('div', { class: 'qz-hostbar' }, h('span', { class: 'faint' }, `PIN ${pin}`), h('span', { style: { flex: 1 } }),
              h('button', { class: 'btn btn-primary btn-lg', onclick: () => act('next') }, rev ? (s.qi + 1 < s.qn ? 'Stillingen' : 'Se vinderne') : 'Stop tiden', icon('arrowRight'))));
        }
        if (s.phase === 'board') return h(clear(stage), null, h('div', { class: 'qz-hostq' }, h('h2', null, 'Stillingen')),
          h('ol', { class: 'qz-board' }, (s.board || []).map((p, i) => h('li', null, h('span', null, String(i + 1)), h('b', null, p.name), p.streak >= 2 ? h('small', null, `🔥 ${p.streak}`) : h('small'), h('strong', null, String(p.score))))),
          h('div', { class: 'qz-hostbar' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn btn-primary btn-lg', onclick: () => act('next') }, 'Næste spørgsmål', icon('arrowRight'))));
        if (s.phase === 'end') {
          const b = s.board || [];
          return h(clear(stage), null, h('div', { class: 'qz-hostq' }, h('h2', null, `${s.title} – vinderne!`)),
            h('div', { class: 'qz-podium' }, [1, 0, 2].map(i => b[i] ? h('div', { class: `qz-pod p${i + 1}` }, h('b', null, b[i].name), h('span', null, `${b[i].score} point`), h('div', { class: 'qz-step' }, ['🥇', '🥈', '🥉'][i])) : h('div'))),
            b.length > 3 ? h('ol', { class: 'qz-board', start: 4 }, b.slice(3).map((p, i) => h('li', null, h('span', null, String(i + 4)), h('b', null, p.name), h('small'), h('strong', null, String(p.score))))) : null,
            h('div', { class: 'qz-hostbar' }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn', onclick: async () => { await qs.host(pin, 'close').catch(() => {}); location.hash = '#/apps/quizshow'; } }, 'Afslut')));
        }
      };
      h(clear(root), null, stage);
      self._stop?.(); self._stop = poll(pin, null, (ns) => { ns._t = performance.now(); s = ns; draw(); }, () => { toast('Quizzen er lukket', { type: 'info' }); location.hash = '#/apps/quizshow'; });
      clearInterval(self._timer); self._timer = setInterval(() => { const t = stage.querySelector('.qz-timer'); if (t && s?.phase === 'question') t.textContent = String(secsLeft(s)); }, 250);
    }

    const p = ctx?.params || {};
    if (p.sub === 'edit' && p.id) edit(p.id);
    else if (p.sub === 'host' && p.id) { host(p.id); return h('div', { class: 'page qz-page qz-hosting', style: { '--app': app.hue } }, root); }
    else if (p.sub === 'play') { this._pl?._cleanup?.(); this._pl = playerView(p.id || ''); return h('div', { class: 'page qz-page', style: { '--app': app.hue } }, this._pl); }
    else home();
    return h('div', { class: 'page qz-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Skole og fest', title: 'Quizshow', lead: 'En live quiz på storskærm. Alle svarer på deres telefon med en PIN-kode – uden konto. Hurtige rigtige svar giver flest point.', compact: true }), root);
  },
};
