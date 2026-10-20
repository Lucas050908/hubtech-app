/** Kodeskolen — programming courses with runnable code, auto-checked exercises, quizzes and XP. */
import { h, clear, debounce } from '../core/dom.js';
import { setAiContext } from '../ai/context.js';
import { icon } from '../core/icons.js';
import { logActivity, refreshSummary } from '../core/store.js';
import { getState, saveState, flushState } from '../core/services.js';
import { toast, stateBlock, progressBar, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero, heroBtn, heroGhost } from '../features/apphero.js';
import { codeEditor } from '../features/codeeditor.js';
import { highlight } from '../features/highlight.js';
import { runPython, runJs, runSql, compareTables, warmPython, renderHtml, checkHtml, explainError } from '../features/coderun.js';
import { CODE_COURSES, courseById, XP_LESSON, XP_QUIZ } from '../data/code-courses.js';

const LANG = { python: 'Python', javascript: 'JavaScript', html: 'HTML & CSS', sql: 'SQL', git: 'Terminal', cpp: 'Arduino C++' };
const RUNNABLE = new Set(['python', 'javascript', 'html', 'sql']);
let st = null, onKey = null;

const isDone = (id) => !!st.done?.[id];
const quizCorrect = () => Object.values(st.quiz || {}).reduce((a, q) => a + Object.values(q).filter(Boolean).length, 0);
export const xpOf = (s) => Object.keys(s?.done || {}).length * XP_LESSON + Object.values(s?.quiz || {}).reduce((a, q) => a + Object.values(q).filter(Boolean).length, 0) * XP_QUIZ;
const courseDone = (c) => c.lessons.filter(l => isDone(l.id)).length;
const nextLesson = () => {
  for (const c of CODE_COURSES) { const l = c.lessons.find(x => !isDone(x.id)); if (l && courseDone(c)) return { c, l }; }
  for (const c of CODE_COURSES) { const l = c.lessons.find(x => !isDone(x.id)); if (l) return { c, l }; }
  return null;
};
const persist = () => saveState('codeschool', st, { onError: () => toast('Fremskridt kunne ikke gemmes', { type: 'bad' }) });

/** Code editor: a textarea over a highlighted layer (same technique as Kodestumper). */
/** Render SQL results as real tables (or the error) into `box`. */
function sqlResult(box, res) {
  clear(box);
  box.classList.toggle('is-error', !!res.error);
  if (res.error) {
    box.append(h('div', { class: 'cs-sql-err' }, res.error));
    const why = explainError(res.error);
    if (why) box.append(h('div', { class: 'cs-why' }, '💡 ', why));
    return;
  }
  if (!res.tables?.length) { box.append(h('div', { class: 'cs-sql-msg' }, res.changed ? `OK – ${res.changed} række${res.changed === 1 ? '' : 'r'} ændret.` : 'OK – ingen rækker at vise.')); return; }
  for (const t of res.tables) {
    box.append(h('div', { class: 'cs-sql-wrap' }, h('table', { class: 'cs-sql' },
      h('thead', null, h('tr', null, t.columns.map(col => h('th', { scope: 'col' }, col)))),
      h('tbody', null, t.values.map(r => h('tr', null, r.map(v => h('td', { class: typeof v === 'number' ? 'is-num' : v === null ? 'is-null' : '' }, v === null ? 'NULL' : String(v)))))))),
      h('div', { class: 'cs-sql-msg' }, `${t.total} række${t.total === 1 ? '' : 'r'}${t.total > t.values.length ? ` (viser ${t.values.length})` : ''}`));
  }
}

// ── overview ──
function overview(app) {
  const done = Object.keys(st.done || {}).length, total = CODE_COURSES.reduce((a, c) => a + c.lessons.length, 0);
  const nx = nextLesson();
  const cards = CODE_COURSES.map(c => {
    const d = courseDone(c), pct = Math.round(d / c.lessons.length * 100);
    const first = c.lessons.find(l => !isDone(l.id)) || c.lessons[0];
    return h('a', { class: 'cs-course glass', href: `#/learn/codeschool/${c.id}`, style: { '--c': c.hue } },
      h('div', { class: 'cs-course-top' }, h('span', { class: 'cs-course-icon' }, icon(c.icon)), h('span', { class: 'chip' }, c.level)),
      h('h3', null, c.title),
      h('p', { class: 'muted' }, c.intro),
      h('div', { class: 'cs-course-meta' }, h('span', null, `${c.lessons.length} lektioner · ${c.lessons.reduce((a, l) => a + l.minutes, 0)} min`), h('b', null, d ? `${d}/${c.lessons.length}` : '')),
      progressBar(pct, { app: c.hue, label: `${c.title}: ${pct} % fuldført` }),
      h('span', { class: 'cs-course-go' }, d === c.lessons.length ? 'Gennemført ✓' : d ? `Fortsæt: ${first.title}` : 'Start kurset', icon('arrowRight')));
  });
  return h('div', { class: 'page codeschool-page', style: { '--app': app.hue } },
    appHero(app, {
      eyebrow: 'Læring', title: 'Kodeskolen', lead: 'Lær at programmere med korte lektioner, kode du kan køre med det samme, og opgaver der rettes automatisk. Python, JavaScript, HTML/CSS, SQL, Git og Arduino.',
      actions: [nx ? heroBtn(done ? 'Fortsæt' : 'Start første lektion', 'play', { href: `#/learn/codeschool/${nx.c.id}/${nx.l.id}` }) : null, heroGhost('Frit værksted', 'code', { href: '#/learn/codeschool/play' })].filter(Boolean),
      stats: [
        { icon: 'checkCircle', label: 'Lektioner gennemført', value: `${done}/${total}` },
        { icon: 'sparkles', label: 'XP fra Kodeskolen', value: String(xpOf(st)) },
        { icon: 'help', label: 'Rigtige quizsvar', value: String(quizCorrect()) },
        { icon: 'book', label: 'Kurser', value: String(CODE_COURSES.length) }],
    }),
    h('div', { class: 'cs-courses' }, cards),
    h('p', { class: 'faint on-world cs-note' }, 'Python kører med Pyodide direkte i browseren (første gang hentes ca. 13 MB, derefter går det hurtigt). Din kode køres isoleret og kan ikke ændre noget i HUBTECH.'));
}

// ── one course ──
function coursePage(app, c) {
  return h('div', { class: 'page codeschool-page', style: { '--app': c.hue } },
    appHero({ ...app, hue: c.hue, icon: c.icon }, {
      eyebrow: `Kodeskolen · ${LANG[c.lang]}`, title: c.title, lead: c.intro, compact: true, back: { href: '#/learn/codeschool', label: 'Tilbage til Kodeskolen' },
      stats: [{ icon: 'checkCircle', label: 'Gennemført', value: `${courseDone(c)}/${c.lessons.length}` }, { icon: 'clock', label: 'Samlet tid', value: `${c.lessons.reduce((a, l) => a + l.minutes, 0)} min` }],
    }),
    h('ol', { class: 'cs-lessons glass panel' }, c.lessons.map((l, i) => h('li', null,
      h('a', { class: ['cs-lesson-row', isDone(l.id) && 'is-done'], href: `#/learn/codeschool/${c.id}/${l.id}` },
        h('span', { class: 'cs-num' }, isDone(l.id) ? icon('check') : String(i + 1)),
        h('span', { class: 'cs-lesson-title' }, h('b', null, l.title), h('span', { class: 'faint' }, `${l.minutes} min${l.task ? ' · opgave' : ''}${l.quiz ? ` · ${l.quiz.length} quizspørgsmål` : ''}`)),
        icon('arrowRight'))))));
}

// ── the lesson ──
function lessonPage(app, c, l) {
  const idx = c.lessons.indexOf(l), prev = c.lessons[idx - 1], next = c.lessons[idx + 1];
  const runnable = RUNNABLE.has(c.lang);
  const t = l.task;
  st.code ||= {};
  const saveCode = debounce((v) => { st.code[l.id] = v; persist(); }, 600);
  const out = h(c.lang === 'sql' ? 'div' : 'pre', { class: ['cs-out', c.lang === 'sql' && 'cs-sqlout'], 'aria-live': 'polite', role: 'region', tabindex: '0', 'aria-label': 'Output' });
  const result = h('div', { class: 'cs-result', 'aria-live': 'polite' });
  const preview = c.lang === 'html' ? h('iframe', { class: 'cs-preview', title: 'Forhåndsvisning', sandbox: 'allow-same-origin' }) : null;
  const stdin = h('textarea', { class: 'textarea cs-stdin', rows: 2, spellcheck: 'false', placeholder: 'Én linje pr. input()', 'aria-label': 'Input til programmet' });
  stdin.value = t?.stdin ?? l.stdin ?? '';
  const needsStdin = c.lang === 'python' && /input\(/.test((t?.starter || '') + (l.example || '') + (t?.solution || ''));
  let editor = null, answer = null;
  const startCode = st.code[l.id] ?? (t ? t.starter : l.example) ?? '';
  if (runnable) editor = codeEditor(c.lang, startCode, saveCode, { rows: c.lang === 'html' ? 12 : 13 });
  else answer = h('input', { class: 'input cs-answer', spellcheck: 'false', autocapitalize: 'off', placeholder: 'Skriv dit svar her', 'aria-label': 'Dit svar', value: st.code[l.id] || '' });
  answer?.addEventListener('input', () => saveCode(answer.value));
  const plain = (x) => String(x || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // the AI assistant becomes a teacher here: it may see the task, your code and the output – and never hands over the solution
  setAiContext({ kind: 'exercise', course: c.title, lang: c.lang, lesson: l.title, task: plain(t?.text || ''), theory: plain(l.body).slice(0, 1500),
    getCode: () => editor?.get() ?? answer?.value ?? '', getOutput: () => out.textContent || '' });
  answer?.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });

  const setResult = (kind, title, text) => h(clear(result), null, kind ? h('div', { class: ['cs-banner', `is-${kind}`] }, icon(kind === 'ok' ? 'checkCircle' : kind === 'bad' ? 'alert' : 'info'), h('div', null, h('b', null, title), text ? h('div', null, text) : null)) : null);
  const showOut = (res) => {
    const txt = [res.out, res.error].filter(Boolean).join(res.out && res.error ? '\n' : '');
    out.textContent = txt || '(ingen output)';
    out.classList.toggle('is-error', !!res.error);
    const why = res.error && explainError(res.error);
    if (why) out.appendChild(h('div', { class: 'cs-why' }, '💡 ', why));
  };
  let running = false;
  async function run(code = editor?.get(), opts = {}) {
    if (running || !runnable) return null;
    running = true; runBtn.disabled = true; checkBtn && (checkBtn.disabled = true);
    try {
      if (c.lang === 'html') { await renderHtml(preview, code); out.textContent = ''; return { ok: true, out: '' }; }
      if (c.lang === 'sql') { const res = await runSql(code, { setup: c.setup, ...opts }); sqlResult(out, res); return res; }
      if (c.lang === 'python' && !workerReady) { out.textContent = 'Starter Python … (første gang tager det et øjeblik)'; }
      const res = c.lang === 'python' ? await runPython(code, { stdin: stdin.value, ...opts }) : await runJs(code, opts);
      workerReady = true;
      showOut(res);
      return res;
    } finally { running = false; runBtn.disabled = false; checkBtn && (checkBtn.disabled = false); }
  }
  let workerReady = false;
  const norm = (s) => String(s || '').replace(/\r/g, '').split('\n').map(x => x.trimEnd()).join('\n').trim();
  function pass() {
    const first = !isDone(l.id);
    st.done ||= {}; st.done[l.id] = { at: Date.now() };
    persist(); flushState('codeschool');
    setResult('ok', first ? `Rigtigt! +${XP_LESSON} XP` : 'Rigtigt!', next ? 'Godt gået – klar til næste lektion?' : 'Du har gennemført hele kurset! 🎉');
    if (first) { logActivity('codeschool', 'lesson', l.title, `Lektion gennemført · +${XP_LESSON} XP`); refreshSummary?.(); toast(`+${XP_LESSON} XP`, { type: 'xp', text: l.title, ms: 2200 }); }
    doneMark.hidden = false;
  }
  async function check() {
    if (!t) return;
    const ch = t.check || {};
    if (!runnable) {
      const v = answer.value.trim();
      if (!v) { setResult('info', 'Skriv dit svar først'); return; }
      if ((ch.re || []).every(r => new RegExp(r).test(v))) pass();
      else setResult('bad', 'Ikke helt', 'Tjek stavning og mellemrum – eller se hintet.');
      return;
    }
    if (c.lang === 'html') {
      await renderHtml(preview, editor.get());
      const msg = checkHtml(preview, ch);
      if (msg) setResult('bad', 'Ikke helt endnu', msg); else pass();
      return;
    }
    if (c.lang === 'sql') {
      if (!editor.get().trim() || /^(\s*--[^\n]*\n?)*\s*$/.test(editor.get())) { setResult('info', 'Skriv din SQL først'); return; }
      const res = await run(editor.get(), { reference: t.solution, test: ch.test || '' });
      if (!res) return;
      if (res.error) { setResult('bad', 'SQL-fejl', 'Se fejlen under Output.'); return; }
      const msg = ch.test ? compareTables(res.after, res.ref, { ordered: true }) : compareTables(res.tables, res.ref, { ordered: !!ch.ordered });
      if (msg) setResult('bad', 'Ikke helt endnu', ch.test ? `Tabellen ser ikke rigtig ud bagefter: ${msg}` : msg); else pass();
      return;
    }
    const res = await run(editor.get(), { test: ch.test || '', stdin: t.stdin ?? stdin.value });
    if (!res) return;
    if (res.error) { setResult('bad', 'Koden giver en fejl', 'Ret fejlen i output-feltet, og prøv igen.'); return; }
    if (res.testError) { setResult('bad', 'Ikke helt endnu', res.testError); return; }
    if (ch.out !== undefined && norm(res.out) !== norm(ch.out)) { setResult('bad', 'Output passer ikke', `Forventet:\n${ch.out}`); return; }
    if (ch.has && !ch.has.every(x => res.out.includes(x))) { setResult('bad', 'Output mangler noget', `Det skal indeholde: ${ch.has.join(', ')}`); return; }
    pass();
  }
  const runBtn = h('button', { class: 'btn', onclick: () => run(), title: 'Kør (Ctrl+Enter)' }, icon('play'), c.lang === 'html' ? 'Vis' : 'Kør');
  const checkBtn = t ? h('button', { class: 'btn app-solid', onclick: check }, icon('checkCircle'), 'Tjek opgaven') : null;
  const hintBox = h('div', { class: 'cs-hint', hidden: true });
  const tools = h('div', { class: 'cs-tools' },
    runnable ? runBtn : null, checkBtn,
    t?.hint ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { hintBox.hidden = false; h(clear(hintBox), null, h('b', null, 'Hint: '), t.hint); } }, icon('help'), 'Hint') : null,
    t?.solution ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { hintBox.hidden = false; h(clear(hintBox), null, h('b', null, 'Løsning:'), h('pre', { class: 'cs-solution', tabindex: '0', role: 'region', 'aria-label': 'Løsning' }, t.solution), editor ? h('button', { class: 'btn btn-sm', onclick: () => editor.set(t.solution) }, 'Indsæt løsningen') : null); } }, icon('eye'), 'Løsning') : null,
    editor && t ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { editor.set(t.starter || ''); setResult(); out.textContent = ''; } }, icon('restore'), 'Nulstil') : null);
  const doneMark = h('span', { class: 'chip chip-ok', hidden: !isDone(l.id) }, icon('check'), 'Gennemført');

  // quiz
  st.quiz ||= {};
  const quiz = l.quiz?.length ? h('section', { class: 'cs-quiz glass panel' }, h('h3', null, 'Tjek dig selv'), l.quiz.map(([q, opts, right, why], qi) => {
    const box = h('div', { class: 'cs-q' });
    const answered = st.quiz[l.id]?.[qi];
    const draw = (chosen) => {
      h(clear(box), null, h('p', { class: 'cs-q-text' }, h('b', null, `${qi + 1}. `), q),
        h('div', { class: 'cs-q-opts', role: 'group', 'aria-label': q }, opts.map((o, oi) => h('button', {
          type: 'button', class: ['cs-opt', chosen !== undefined && oi === right && 'is-right', chosen === oi && oi !== right && 'is-wrong'], disabled: chosen !== undefined,
          onclick: () => {
            if (st.quiz[l.id]?.[qi] === undefined) { (st.quiz[l.id] ||= {})[qi] = oi === right; persist(); if (oi === right) toast(`+${XP_QUIZ} XP`, { type: 'xp', ms: 1200 }); }
            draw(oi);
          },
        }, o))),
        chosen !== undefined ? h('p', { class: ['cs-why-q', chosen === right ? 'is-right' : 'is-wrong'] }, chosen === right ? 'Rigtigt! ' : 'Ikke helt. ', why) : null);
    };
    draw(answered === undefined ? undefined : (answered ? right : -1));
    return box;
  })) : null;

  const theory = h('article', { class: 'cs-theory glass panel' },
    h('div', { class: 'cs-body', html: l.body }),
    l.example ? h('div', { class: 'cs-example' },
      h('div', { class: 'cs-example-head' }, h('b', null, 'Eksempel'), runnable ? h('button', { class: 'btn btn-sm', onclick: () => { editor.set(l.example); if (l.stdin) stdin.value = l.stdin; run(); } }, icon('play'), 'Prøv det') : null),
      h('pre', { class: 'cs-code', tabindex: '0', role: 'region', 'aria-label': 'Eksempelkode', html: highlight(l.example, c.lang) })) : null);

  const work = h('section', { class: 'cs-work glass panel' },
    h('div', { class: 'cs-task-head' }, h('h3', null, t ? 'Opgave' : 'Prøv selv'), doneMark),
    t ? h('p', { class: 'cs-task', html: t.text }) : h('p', { class: 'muted' }, 'Ændr i koden og kør den.'),
    editor ? editor.el : answer,
    needsStdin ? h('label', { class: 'field cs-stdin-wrap' }, h('span', { class: 'field-label' }, 'Input (til input())'), stdin) : null,
    tools, hintBox, result,
    runnable && c.lang !== 'html' ? h('div', { class: 'cs-out-wrap' }, h('div', { class: 'cs-out-label' }, c.lang === 'sql' ? 'Resultat' : 'Output'), out) : null,
    preview ? h('div', { class: 'cs-out-wrap' }, h('div', { class: 'cs-out-label' }, 'Forhåndsvisning'), preview) : null);

  removeEventListener('keydown', onKey);
  onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && editor && document.activeElement === editor.ta) { e.preventDefault(); run(); } };
  addEventListener('keydown', onKey);
  if (c.lang === 'python') warmPython().then(() => { workerReady = true; });
  if (c.lang === 'html') setTimeout(() => run(), 50);

  return h('div', { class: 'page codeschool-page cs-lesson-page', style: { '--app': c.hue } },
    h('nav', { class: 'cs-crumbs on-world', 'aria-label': 'Brødkrummer' }, h('a', { href: '#/learn/codeschool' }, 'Kodeskolen'), ' › ', h('a', { href: `#/learn/codeschool/${c.id}` }, c.title), ' › ', h('span', null, `Lektion ${idx + 1} af ${c.lessons.length}`)),
    h('h1', { class: 'cs-title on-world' }, l.title),
    h('div', { class: 'cs-layout' }, h('div', { class: 'cs-left' }, theory, quiz), work),
    h('div', { class: 'cs-nav on-world' },
      prev ? h('a', { class: 'btn', href: `#/learn/codeschool/${c.id}/${prev.id}` }, icon('arrowLeft'), prev.title) : h('span'),
      next ? h('a', { class: 'btn btn-primary', href: `#/learn/codeschool/${c.id}/${next.id}` }, next.title, icon('arrowRight')) : h('a', { class: 'btn btn-primary', href: '#/learn/codeschool' }, 'Tilbage til Kodeskolen', icon('arrowRight'))));
}

// ── free playground ──
function playground(app) {
  st.play ||= { lang: 'python', code: { python: 'for i in range(3):\n    print("Hej", i)\n', javascript: 'const navne = ["Ada", "Linus", "Grace"];\nconsole.log(navne.map(n => n.toUpperCase()));\n', html: '<h1>Min side</h1>\n<p>Skriv HTML her.</p>\n' } };
  st.play.code.sql ??= "-- Øvedatabasen: kunder, opgaver, dele\nSELECT * FROM opgaver WHERE status <> 'færdig';\n";
  const holder = h('div');
  const out = h('pre', { class: 'cs-out', 'aria-live': 'polite', role: 'region', tabindex: '0', 'aria-label': 'Resultat' });
  const sqlOut = h('div', { class: 'cs-out cs-sqlout', 'aria-live': 'polite', role: 'region', tabindex: '0', 'aria-label': 'Resultat', hidden: true });
  const stdin = h('textarea', { class: 'textarea cs-stdin', rows: 2, placeholder: 'Input-linjer til input()', 'aria-label': 'Input' });
  const preview = h('iframe', { class: 'cs-preview', title: 'Forhåndsvisning', sandbox: 'allow-same-origin' });
  let ed;
  const draw = () => {
    const lang = st.play.lang;
    ed = codeEditor(lang, st.play.code[lang] || '', debounce((v) => { st.play.code[lang] = v; persist(); }, 600), { rows: 18 });
    h(clear(holder), null, ed.el, lang === 'python' ? h('label', { class: 'field cs-stdin-wrap' }, h('span', { class: 'field-label' }, 'Input'), stdin) : null);
    preview.hidden = lang !== 'html'; out.hidden = lang === 'html' || lang === 'sql'; sqlOut.hidden = lang !== 'sql';
    if (lang === 'python') warmPython();
    if (lang === 'html') renderHtml(preview, ed.get());
  };
  const run = async () => {
    const lang = st.play.lang;
    if (lang === 'html') { await renderHtml(preview, ed.get()); return; }
    if (lang === 'sql') { sqlResult(sqlOut, await runSql(ed.get(), { setup: courseById('sql').setup })); return; }
    out.textContent = lang === 'python' ? 'Kører …' : '';
    const res = lang === 'python' ? await runPython(ed.get(), { stdin: stdin.value }) : await runJs(ed.get());
    out.textContent = [res.out, res.error].filter(Boolean).join('\n') || '(ingen output)';
    out.classList.toggle('is-error', !!res.error);
    const why = res.error && explainError(res.error);
    if (why) out.appendChild(h('div', { class: 'cs-why' }, '💡 ', why));
  };
  removeEventListener('keydown', onKey);
  onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && ed && document.activeElement === ed.ta) { e.preventDefault(); run(); } };
  addEventListener('keydown', onKey);
  const langSel = segmented([{ value: 'python', label: 'Python' }, { value: 'javascript', label: 'JavaScript' }, { value: 'html', label: 'HTML/CSS' }, { value: 'sql', label: 'SQL' }], st.play.lang, (v) => { st.play.lang = v; persist(); draw(); }, { label: 'Sprog' });
  draw();
  return h('div', { class: 'page codeschool-page', style: { '--app': app.hue } },
    appHero(app, { eyebrow: 'Kodeskolen', title: 'Frit værksted', lead: 'Skriv og kør din egen kode – uden opgaver. Gemmes automatisk.', compact: true, back: { href: '#/learn/codeschool', label: 'Tilbage til Kodeskolen' } }),
    h('section', { class: 'cs-work glass panel' },
      h('div', { class: 'cs-tools' }, langSel, h('span', { style: { flex: 1 } }), h('button', { class: 'btn app-solid', onclick: run, title: 'Kør (Ctrl+Enter)' }, icon('play'), 'Kør')),
      holder, h('div', { class: 'cs-out-wrap' }, h('div', { class: 'cs-out-label' }, 'Resultat'), out, sqlOut, preview)));
}

export default {
  title: 'Kodeskolen',
  destroy() { flushState('codeschool'); removeEventListener('keydown', onKey); setAiContext(null); },
  async render(ctx) {
    const app = appById('codeschool');
    try { st = (await getState('codeschool', { force: true })) || {}; }
    catch (e) { return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: 'Kodeskolen kunne ikke hentes', text: e.message })); }
    st.done ||= {}; st.quiz ||= {};
    const { sub, id } = ctx.params || {};
    if (sub === 'play') return playground(app);
    const c = sub && courseById(sub);
    if (sub && !c) return h('div', { class: 'page' }, stateBlock({ icon: 'alert', title: 'Kurset findes ikke', actions: [h('a', { class: 'btn', href: '#/learn/codeschool' }, 'Til Kodeskolen')] }));
    if (c && id) {
      const l = c.lessons.find(x => x.id === id);
      if (!l) return h('div', { class: 'page' }, stateBlock({ icon: 'alert', title: 'Lektionen findes ikke', actions: [h('a', { class: 'btn', href: `#/learn/codeschool/${c.id}` }, c.title)] }));
      st.last = { course: c.id, lesson: l.id }; persist();
      return lessonPage(app, c, l);
    }
    if (c) return coursePage(app, c);
    return overview(app);
  },
};
