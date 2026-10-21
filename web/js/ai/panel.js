/**
 * The AI assistant pop-up window. Runs a small language model on this device (see engine.js), reads your own data
 * when it helps (knowledge.js), proposes actions you confirm, and turns into a teacher in Kodeskolen.
 */
import { h, clear, rect, uiZoom, viewW, viewH } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, modal } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { store } from '../core/store.js';
import { fmtBody } from '../community/chat.js';
import { getAiContext, onAiContext } from './context.js';
import { MODELS, CTX_STEPS, ramFor, pickFor, gb, mb, deviceRam } from './models.js';
import { SOURCES, collect, retrieve, isCalendarQuestion, systemPrompt, exerciseFacts, studioFacts, parseActions, describe, runAction, guardCode } from './knowledge.js';
import { extractFiles } from './actions.js';

const KEY = 'hubtech.ai';
const HIST = 'hubtech.ai.chat';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

function defaults() {
  const dev = deviceRam();
  return { ram: Math.round(dev.suggest / 268435456) * 268435456 || 1073741824, model: 'auto', ctx: 'auto', url: '', gpu: true, temp: 0.4, use: { notes: true, tasks: true, calendar: true, snippets: true, customers: true } };
}
let cfg = { ...defaults(), ...read(KEY, {}) };
cfg.use = { ...defaults().use, ...(cfg.use || {}) };
const saveCfg = () => write(KEY, cfg);

/** Model + context the settings resolve to. */
export function resolved() {
  const auto = pickFor(cfg.ram);
  const model = cfg.model === 'auto' ? auto.model : MODELS.find(m => m.id === cfg.model) || null;
  let ctx = cfg.ctx === 'auto' ? (cfg.model === 'auto' ? auto.ctx : model ? (CTX_STEPS.filter(c => ramFor(model, c) <= cfg.ram).pop() || 1024) : 2048) : Number(cfg.ctx);
  return { model, ctx, ram: model ? ramFor(model, ctx) : null, tooSmall: cfg.model === 'auto' && auto.tooSmall };
}

let panel = null, engine = null, localFile = null, unsubCtx = null;
let messages = read(HIST, []).filter(m => m && m.role && typeof m.content === 'string').slice(-30);
let busy = false, abort = null;
const persistChat = () => write(HIST, messages.slice(-30));

async function eng() { engine ||= await import('./engine.js'); return engine; }

export function toggleAssistant(open) {
  if (!panel) build();
  const show = open ?? panel.hidden;
  panel.hidden = !show;
  document.body.classList.toggle('ai-open', show);
  if (show) { drawAll(); setTimeout(() => panel.querySelector('.ai-input')?.focus(), 60); }
}

/** Open the assistant and send a question (used by App-værkstedet's "Ret med AI" and new apps). */
export async function askAssistant(text) {
  toggleAssistant(true);
  if (busy) return;
  els.input.value = text;
  await ask();
}

/** Open the assistant with its settings showing (Indstillinger → Apps og opkald). */
export function openAssistantSettings() { toggleAssistant(true); els.settingsBox.hidden = false; drawSettings(); }

/** Forget the conversation (Indstillinger → Apps og opkald). */
export function clearAssistantChat() { if (busy) return false; messages = []; persistChat(); if (panel) drawMsgs(); return true; }

export function initAssistant() {
  if (document.querySelector('.ai-fab')) return;
  const fab = h('button', { class: 'ai-fab', 'aria-label': 'Åbn AI-assistenten (Ctrl+J)', title: 'AI-assistent (Ctrl+J)', onclick: () => toggleAssistant() }, icon('sparkles'));
  document.body.appendChild(fab);
  document.body.classList.add('has-ai-fab');
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') { e.preventDefault(); e.stopPropagation(); toggleAssistant(); }
    else if (e.key === 'Escape' && panel && !panel.hidden && !document.querySelector('.modal-backdrop, .sv')) { e.stopPropagation(); if (!els.settingsBox.hidden) els.settingsBox.hidden = true; else toggleAssistant(false); }
  }, true);
  store.on('user', (u) => { fab.hidden = !u; if (!u && panel) { toggleAssistant(false); messages = []; persistChat(); eng().then(e => e.unload()).catch(() => {}); } });
}

// ── building the window ──
let els = {};
function build() {
  const status = h('span', { class: 'ai-status' });
  const mode = h('span', { class: 'ai-mode', hidden: true });
  const list = h('div', { class: 'ai-msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Samtale med assistenten', tabindex: '0' });
  const input = h('textarea', { class: 'ai-input', rows: 1, maxlength: 4000, placeholder: 'Spørg om noget …', 'aria-label': 'Besked til assistenten', enterkeyhint: 'send' });
  const send = h('button', { class: 'ai-send', 'aria-label': 'Send', title: 'Send (Enter)' }, icon('send'));
  const settingsBox = h('div', { class: 'ai-settings', hidden: true });
  const head = h('header', { class: 'ai-head' },
    h('span', { class: 'ai-logo', 'aria-hidden': 'true' }, icon('sparkles')),
    h('div', { class: 'ai-title' }, h('b', null, 'Assistent'), status), mode,
    h('button', { class: 'icon-btn', 'aria-label': 'Ny samtale', title: 'Ny samtale', onclick: () => { if (busy) return; messages = []; persistChat(); drawMsgs(); } }, icon('plus')),
    h('button', { class: 'icon-btn', 'aria-label': 'Indstillinger for assistenten', title: 'Indstillinger', 'aria-expanded': 'false', onclick: (e) => { settingsBox.hidden = !settingsBox.hidden; e.currentTarget.setAttribute('aria-expanded', String(!settingsBox.hidden)); drawSettings(); } }, icon('settings')),
    h('button', { class: 'icon-btn', 'aria-label': 'Luk assistenten', title: 'Luk (Esc)', onclick: () => toggleAssistant(false) }, icon('x')));
  panel = h('section', { class: 'ai-panel glass', role: 'dialog', 'aria-label': 'AI-assistent', hidden: true },
    head, settingsBox, list,
    h('div', { class: 'ai-compose' }, input, send),
    h('p', { class: 'ai-foot' }, icon('lock'), 'Kører på din enhed – dine data sendes ikke nogen steder hen.'));
  document.body.appendChild(panel);
  els = { status, mode, list, input, send, settingsBox, head };

  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); ask(); } });
  send.addEventListener('click', () => (busy ? stop() : ask()));
  // drag the window by its title bar (desktop)
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || matchMedia('(max-width: 700px)').matches) return;
    const r = rect(panel), z = uiZoom();
    drag = { dx: e.clientX / z - r.left, dy: e.clientY / z - r.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const z = uiZoom();
    const x = Math.max(8, Math.min(viewW() - panel.offsetWidth - 8, e.clientX / z - drag.dx)), y = Math.max(8, Math.min(viewH() - 120, e.clientY / z - drag.dy));
    Object.assign(panel.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
  });
  head.addEventListener('pointerup', () => { drag = null; });
  unsubCtx = onAiContext(() => { if (!panel.hidden) drawAll(); });
  eng().then(e => e.onEngine(() => drawStatus())).catch(() => {});
  void unsubCtx;
}

const tutor = () => getAiContext()?.kind === 'exercise';
const builder = () => getAiContext()?.kind === 'studio';

function drawAll() { drawStatus(); drawMsgs(); }
function drawStatus() {
  const st = engine?.state || { status: 'idle' };
  const r = resolved();
  const name = localFile ? localFile.name : cfg.model === 'url' ? 'Egen model' : r.model?.name || '';
  els.status.textContent = st.status === 'loading' ? `Henter ${name} … ${Math.round((st.progress || 0) * 100)} %`
    : st.status === 'thinking' ? `${name} · tænker …` : st.status === 'ready' ? `${name} · klar` : st.status === 'error' ? 'Fejl' : 'Ikke startet';
  els.mode.hidden = !tutor() && !builder();
  if (!els.mode.hidden) h(clear(els.mode), null, icon(tutor() ? 'graduation' : 'code'), tutor() ? 'Lærer' : 'App-bygger');
  els.mode.classList.toggle('is-builder', builder());
  els.input.placeholder = tutor() ? 'Spørg læreren om et hint …' : builder() ? 'Beskriv, hvad appen skal kunne …' : 'Spørg om noget …';
  h(clear(els.send), null, icon(busy ? 'x' : 'send'));
  els.send.setAttribute('aria-label', busy ? 'Stop' : 'Send');
  els.send.classList.toggle('is-stop', busy);
  const load = els.list.querySelector('.ai-load');
  if (load && st.status === 'loading') { const bar = load.querySelector('.ai-bar i'); if (bar) bar.style.width = `${Math.round((st.progress || 0) * 100)}%`; }
}

function suggestions() {
  const list = builder() ? ['Ret fejlen i konsollen', 'Gør designet pænere og mere moderne', 'Tilføj en knap der nulstiller alt', 'Forklar hvordan koden virker']
    : tutor() ? ['Giv mig et lille hint', 'Hvorfor virker min kode ikke?', 'Forklar opgaven med andre ord', 'Hvad betyder fejlbeskeden?']
    : ['Hvad skal jeg nå i dag?', 'Hjælp mig med at planlægge min uge', 'Find min prompt i noterne', 'Lav en aftale i morgen kl. 10 med tandlægen'];
  return h('div', { class: 'ai-sugg' }, list.map(t => h('button', { class: 'chip', onclick: () => { els.input.value = t; ask(); } }, t)));
}

function startCard() {
  const unsupported = engine?.supported?.() ?? null;
  const r = resolved();
  const st = engine?.state || {};
  if (st.status === 'loading') return h('div', { class: 'ai-card ai-load' }, h('b', null, 'Henter og starter modellen …'), h('div', { class: 'ai-bar' }, h('i', { style: { width: `${Math.round((st.progress || 0) * 100)}%` } })),
    h('p', { class: 'faint' }, st.noCache ? 'Der er ikke plads til at gemme modellen i browseren, så den hentes direkte ind i hukommelsen – og hentes igen næste gang. Frigør plads på disken for at undgå det.'
      : 'Første gang hentes modellen fra Hugging Face og gemmes i browseren. Næste gang starter den uden download.'));
  const dev = deviceRam();
  return h('div', { class: 'ai-card' },
    h('div', { class: 'ai-hello' }, icon('bot'), h('div', null, h('b', null, tutor() ? 'Din programmeringslærer' : builder() ? 'Din app-bygger' : 'Hej! Jeg er din lokale assistent'),
      h('p', null, builder() ? 'Jeg kan se appens filer og fejlene i konsollen. Beskriv, hvad appen skal kunne, så skriver jeg koden – og du vælger selv, hvilke filer der skal bruges. Vælg gerne 4096 tokens hukommelse eller mere.'
        : tutor() ? 'Jeg kan se opgaven og din kode, og jeg hjælper dig videre med hints – men jeg giver dig ikke løsningen. Du lærer mest ved selv at skrive den.'
        : 'Jeg kan læse dine noter, opgaver, aftaler, kodestumper og kunder og hjælpe med fx at planlægge kalenderen. Alt kører på din enhed.'))),
    st.status === 'error' ? h('p', { class: 'field-error' }, st.error) : null,
    unsupported ? h('p', { class: 'field-error' }, unsupported) : null,
    h('div', { class: 'ai-pick' }, icon('chip'), h('span', null, localFile ? `Fil: ${localFile.name} (${mb(localFile.size)})` : cfg.model === 'file' ? 'Vælg din .gguf-fil (den skal vælges igen, når siden er genindlæst)' : cfg.model === 'url' ? 'Egen model fra URL' : r.model ? `${r.model.name} · ${mb(r.model.size)} download · ca. ${gb(r.ram)} RAM` : 'Vælg en model'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { els.settingsBox.hidden = false; drawSettings(); } }, 'Skift')),
    r.tooSmall ? h('p', { class: 'faint' }, 'RAM-grænsen er meget lav – den mindste model bruges med kort hukommelse.') : null,
    dev.mobile ? h('p', { class: 'faint' }, 'På telefonen: brug Wi-Fi første gang, og hold appen åben, mens modellen hentes.') : null,
    h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-primary', disabled: !!unsupported, onclick: () => start(st.status === 'error') }, icon(st.status === 'error' ? 'refresh' : 'play'), st.status === 'error' ? 'Prøv igen' : 'Start assistenten'),
      st.status === 'error' ? h('button', { class: 'btn btn-ghost', onclick: () => diagnose() }, icon('info'), 'Tjek min enhed') : null));
}

/** What the device can do – shown when something goes wrong, and from the assistant's settings. */
async function diagnose() {
  const e = await eng();
  const rows = [];
  const ok = (label, good, text) => rows.push(h('li', { class: good ? 'is-ok' : 'is-bad' }, icon(good ? 'check' : 'alert'), h('span', null, h('b', null, label), ' – ', text)));
  const bad = e.supported();
  ok('WebAssembly', !bad, bad || 'virker');
  ok('Hurtig motor (JSPI)', !!WebAssembly.Suspending, WebAssembly.Suspending ? 'tilgængelig' : 'ikke tilgængelig – den langsommere kompatible motor bruges (virker stadig)');
  let free = null;
  try { const est = await navigator.storage?.estimate?.(); if (est?.quota) free = est.quota - (est.usage || 0); } catch { /* */ }
  const need = resolved().model?.size || 0;
  ok('Plads i browseren', free == null || free > need * 1.08, free == null ? 'ukendt' : `${mb(free)} ledig${need ? ` – modellen fylder ${mb(need)}` : ''}${free < need * 1.08 ? ' (modellen hentes i stedet direkte ind i hukommelsen)' : ''}`);
  const dm = navigator.deviceMemory;
  ok('Hukommelse', !dm || dm >= 4, dm ? `ca. ${dm} GB eller mere` : 'ukendt (browseren oplyser det ikke)');
  let net = false;
  try { await fetch('https://huggingface.co/api/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF', { mode: 'no-cors', cache: 'no-store' }); net = true; } catch { net = false; }
  ok('Forbindelse til Hugging Face', net, net ? 'virker' : 'blokeret eller offline – tjek internet, firewall og annonceblokering');
  const have = await e.downloaded();
  ok('Hentede modeller', true, have.length ? have.map(m => `${m.url.split('/').pop()} (${mb(m.size)})`).join(', ') : 'ingen endnu');
  const close = h('button', { class: 'btn btn-primary' }, 'Luk');
  const m = modal({ title: 'Tjek af den lokale AI', label: 'AI-assistent', size: 520, body: h('ul', { class: 'ai-diag' }, rows), actions: [close] });
  close.addEventListener('click', () => m.close());
}

function render(m, i) {
  if (m.role === 'user') return h('div', { class: 'ai-msg is-user' }, h('p', null, m.content));
  const parsed = parseActions(m.content);
  let text = parsed.text, hidden = [], files = [];
  if (m.tutor) ({ text, hidden } = guardCode(text));
  if (m.builder) ({ text, files } = extractFiles(text));
  const fileCard = (f, k) => {
    const used = m.used?.[k];
    const ctx = getAiContext();
    const pre = h('pre', { class: 'cm-code ai-file-code', tabindex: '0', hidden: true }, h('code', null, f.code));
    return h('div', { class: ['ai-file', used && 'is-used'] },
      h('div', { class: 'ai-file-h' }, icon('file'), h('b', null, f.name), h('span', { class: 'faint' }, `${f.code.split('\n').length} linjer`),
        h('button', { class: 'btn btn-sm btn-ghost', 'aria-expanded': 'false', onclick: (e) => { pre.hidden = !pre.hidden; e.currentTarget.setAttribute('aria-expanded', String(!pre.hidden)); e.currentTarget.textContent = pre.hidden ? 'Vis' : 'Skjul'; } }, 'Vis'),
        m.streaming ? null : used ? h('span', { class: 'chip' }, icon('check'), 'Brugt')
          : h('button', { class: 'btn btn-sm btn-primary', disabled: ctx?.kind !== 'studio', title: ctx?.kind !== 'studio' ? 'Åbn appen i App-værkstedet først' : '', onclick: () => {
            if (getAiContext()?.applyFile?.(f.name, f.code)) { m.used = { ...(m.used || {}), [k]: true }; persistChat(); drawMsgs(); }
          } }, 'Brug i appen')),
      pre);
  };
  const parts = text.split(/\[\[(skjult-kode|fil)-(\d+)\]\]/);
  const body = h('div', { class: 'ai-text' }, parts.map((p, k) => {
    if (k % 3 === 0) return p.trim() ? h('div', null, fmtBody(p.trim())) : null;
    if (k % 3 === 1) return null;
    if (parts[k - 1] === 'fil') return fileCard(files[Number(p)], Number(p));
    const x = hidden[Number(p)];
    const box = h('div', { class: 'ai-hidden' }, icon('lock'), h('span', null, 'Læreren skrev en længere kodeblok. Prøv selv først – det er sådan, du lærer det.'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => box.replaceWith(h('pre', { class: 'cm-code', tabindex: '0' }, h('code', null, x.code))) }, 'Vis alligevel'));
    return box;
  }));
  const acts = (m.done || {});
  return h('div', { class: ['ai-msg is-bot', m.error && 'is-error'] }, body,
    !m.streaming && files.length > 1 && getAiContext()?.kind === 'studio' && files.some((f, k) => !m.used?.[k]) ? h('button', { class: 'btn btn-sm', onclick: () => {
      const ctx = getAiContext(); let n = 0;
      files.forEach((f, k) => { if (!m.used?.[k] && ctx?.applyFile?.(f.name, f.code, { quiet: true })) { m.used = { ...(m.used || {}), [k]: true }; n++; } });
      if (n) toast(`${n} filer brugt i appen`, { type: 'ok', text: 'Fortryd med Ctrl+Z i editoren eller knappen Fortryd.' });
      persistChat(); drawMsgs();
    } }, icon('check'), 'Brug alle filer') : null,
    m.streaming && !text ? h('div', { class: 'ai-dots', 'aria-label': 'Tænker' }, h('i'), h('i'), h('i')) : null,
    !m.streaming ? parsed.actions.map((a, k) => {
      const d = describe(a), state = acts[k];
      return h('div', { class: ['ai-action', state && `is-${state}`] }, h('span', { class: 'ai-action-ic' }, icon(d.icon)), h('div', { class: 'ai-action-t' }, h('b', null, d.title), d.text ? h('span', { class: 'faint' }, d.text) : null),
        state === 'ok' ? h('span', { class: 'chip' }, icon('check'), 'Udført') : state === 'no' ? h('span', { class: 'chip' }, 'Afvist')
          : h('div', { class: 'ai-action-b' },
            h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
              try { const path = await runAction(a); m.done = { ...(m.done || {}), [k]: 'ok' }; persistChat(); drawMsgs(); if (a.type === 'open') { navigate(path); if (matchMedia('(max-width: 700px)').matches) toggleAssistant(false); } else toast(d.label.replace(/^\w/, c => c.toUpperCase()) + ' – klaret', { type: 'ok', text: a.title, action: { label: 'Vis', onClick: () => navigate(path) } }); }
              catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); }
            } }, d.label),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { m.done = { ...(m.done || {}), [k]: 'no' }; persistChat(); drawMsgs(); } }, 'Nej tak')));
    }) : null,
    m.error ? null : !m.streaming && m.content && i === messages.length - 1 ? h('div', { class: 'ai-msg-tools' },
      h('button', { class: 'icon-btn', 'aria-label': 'Kopiér svaret', title: 'Kopiér', onclick: () => navigator.clipboard?.writeText(parseActions(m.content).text).then(() => toast('Kopieret', { type: 'ok' })).catch(() => {}) }, icon('copy'))) : null);
}

function drawMsgs() {
  const st = engine?.state?.status;
  const ready = st === 'ready' || st === 'thinking';
  h(clear(els.list), null,
    !ready ? startCard() : null,
    messages.map(render),
    ready && !messages.length ? suggestions() : null);
  els.list.scrollTop = els.list.scrollHeight;
  drawStatus();
}

// ── settings ──
function drawSettings() {
  const box = els.settingsBox;
  if (box.hidden) return;
  const r = resolved(), dev = deviceRam();
  const ramIn = h('input', { type: 'range', min: 0.5, max: 4, step: 0.25, value: cfg.ram / 1073741824, 'aria-label': 'Maks. RAM til assistenten' });
  const ramOut = h('b', null, gb(cfg.ram));
  ramIn.addEventListener('input', () => { cfg.ram = Number(ramIn.value) * 1073741824; ramOut.textContent = gb(cfg.ram); saveCfg(); pickOut.textContent = pickText(); });
  ramIn.addEventListener('change', () => drawSettings());
  const pickText = () => { const x = resolved(); return x.model ? `→ ${x.model.name}, ${x.ctx.toLocaleString('da-DK')} tokens hukommelse (ca. ${gb(x.ram)})` : ''; };
  const pickOut = h('span', { class: 'faint' }, pickText());
  const modelSel = h('select', { class: 'select', 'aria-label': 'Model' },
    h('option', { value: 'auto', selected: cfg.model === 'auto' }, 'Automatisk ud fra RAM-grænsen'),
    MODELS.map(m => h('option', { value: m.id, selected: cfg.model === m.id }, `${m.name} – ${mb(m.size)}${ramFor(m, 2048) > cfg.ram ? ' (over grænsen)' : ''}`)),
    h('option', { value: 'url', selected: cfg.model === 'url' }, 'Egen .gguf fra en URL'),
    h('option', { value: 'file', selected: cfg.model === 'file' }, 'Fil fra denne enhed (.gguf)'));
  const urlIn = h('input', { class: 'input', type: 'url', value: cfg.url || '', placeholder: 'https://huggingface.co/…/resolve/main/model.gguf', 'aria-label': 'Model-URL', hidden: cfg.model !== 'url' });
  const fileIn = h('input', { type: 'file', accept: '.gguf', hidden: true });
  const fileBtn = h('button', { class: 'btn btn-sm', hidden: cfg.model !== 'file', onclick: () => fileIn.click() }, icon('upload'), localFile ? localFile.name : 'Vælg .gguf-fil');
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; if (f) { localFile = f; drawSettings(); drawMsgs(); } });
  modelSel.addEventListener('change', () => { cfg.model = modelSel.value; if (cfg.model !== 'file') localFile = null; saveCfg(); drawSettings(); drawMsgs(); });
  urlIn.addEventListener('change', () => { cfg.url = urlIn.value.trim(); saveCfg(); });
  const ctxSel = h('select', { class: 'select', 'aria-label': 'Hukommelse (kontekst)' }, h('option', { value: 'auto', selected: cfg.ctx === 'auto' }, 'Automatisk'),
    CTX_STEPS.map(c => h('option', { value: c, selected: String(cfg.ctx) === String(c) }, `${c.toLocaleString('da-DK')} tokens`)));
  ctxSel.addEventListener('change', () => { cfg.ctx = ctxSel.value; saveCfg(); drawSettings(); });
  const gpu = h('input', { type: 'checkbox', checked: cfg.gpu });
  gpu.addEventListener('change', () => { cfg.gpu = gpu.checked; saveCfg(); });
  const temp = h('select', { class: 'select', 'aria-label': 'Stil' }, [[0.2, 'Præcis'], [0.4, 'Balanceret'], [0.8, 'Kreativ']].map(([v, l]) => h('option', { value: v, selected: Number(cfg.temp) === v }, l)));
  temp.addEventListener('change', () => { cfg.temp = Number(temp.value); saveCfg(); });
  const srcs = h('div', { class: 'ai-srcs' }, Object.entries(SOURCES).map(([k, l]) => {
    const cb = h('input', { type: 'checkbox', checked: cfg.use[k] !== false, onchange: (e) => { cfg.use[k] = e.target.checked; saveCfg(); } });
    return h('label', { class: 'cal-pcheck' }, cb, h('span', null, l));
  }));
  const st = engine?.state?.status;
  h(clear(box), null,
    h('div', { class: 'ai-set-row' }, h('span', { class: 'field-label' }, 'Maks. RAM'), ramOut),
    ramIn,
    h('div', { class: 'ai-set-hint' }, pickOut, dev.gb ? h('span', { class: 'faint' }, ` · enheden har ca. ${dev.gb} GB`) : null),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Model'), modelSel), urlIn, fileBtn, fileIn,
    MODELS.find(m => m.id === (cfg.model === 'auto' ? r.model?.id : cfg.model)) ? h('p', { class: 'faint ai-note' }, MODELS.find(m => m.id === (cfg.model === 'auto' ? r.model?.id : cfg.model)).note) : null,
    h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hukommelse'), ctxSel), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Stil'), temp)),
    h('label', { class: 'cal-pcheck' }, gpu, h('span', null, 'Brug grafikkortet (WebGPU), når det findes')),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Må læse'), srcs),
    h('div', { class: 'ai-set-btns' },
      st === 'ready' ? h('button', { class: 'btn btn-sm', onclick: async () => { await (await eng()).unload(); drawAll(); toast('Assistenten er stoppet', { text: 'Hukommelsen er frigivet.' }); } }, icon('power'), 'Stop og frigiv RAM') : null,
      h('button', { class: 'btn btn-sm', onclick: () => start(true) }, icon('refresh'), st === 'ready' ? 'Genstart med valget' : 'Start med valget'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => diagnose() }, icon('info'), 'Tjek min enhed'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { try { const e = await eng(); await e.unload(); await e.clearDownloads(); toast('Hentede modeller er slettet', { type: 'ok', text: 'Pladsen i browseren er frigivet.' }); drawAll(); } catch (x) { toast('Kunne ikke slette', { type: 'bad', text: x.message }); } } }, icon('trash'), 'Slet hentede modeller')),
    h('p', { class: 'faint ai-note' }, 'Modellerne er open source (Qwen 2.5: Apache 2.0, Llama 3.2: Llama Community License) og hentes fra Hugging Face første gang.'));
}

// ── running ──
async function start(force) {
  const e = await eng();
  const bad = e.supported();
  if (bad) { toast('Den lokale AI kan ikke køre her', { type: 'bad', text: bad }); return false; }
  const r = resolved();
  const opts = { ctx: r.ctx || 2048, gpu: cfg.gpu };
  if (cfg.model === 'file') { if (!localFile) { els.settingsBox.hidden = false; drawSettings(); toast('Vælg en .gguf-fil først', { type: 'warn' }); return false; } opts.file = localFile; }
  else if (cfg.model === 'url') { if (!/^https:\/\/.+\.gguf(\?.*)?$/i.test(cfg.url || '')) { els.settingsBox.hidden = false; drawSettings(); toast('Skriv en https-adresse til en .gguf-fil', { type: 'warn' }); return false; } opts.url = cfg.url; }
  else opts.model = r.model;
  if (force) await e.unload();
  const un = e.onEngine(() => { drawStatus(); if (e.state.status !== 'loading') un(); });
  drawMsgs();
  try {
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    await e.load(opts);
    els.settingsBox.hidden = true;
    drawMsgs();
    return true;
  } catch (x) { drawMsgs(); toast('Assistenten kunne ikke starte', { type: 'bad', text: x.message }); return false; }
}

function stop() { abort?.abort(); }

async function ask() {
  const q = els.input.value.trim();
  if (!q || busy) return;
  const e = await eng();
  if (!e.isReady()) { if (!await start()) return; }
  els.input.value = ''; els.input.style.height = 'auto';
  const isTutor = tutor(), isBuilder = builder();
  messages.push({ role: 'user', content: q });
  const bot = { role: 'assistant', content: '', streaming: true, tutor: isTutor, builder: isBuilder };
  messages.push(bot);
  busy = true; abort = new AbortController();
  drawMsgs();
  const build = async (factor) => {
    const ctxTokens = e.state.ctx || 2048;
    const maxTokens = isBuilder ? Math.min(2000, Math.floor(ctxTokens * 0.45)) : Math.min(700, Math.floor(ctxTokens * 0.3));
    const budgetChars = Math.floor((ctxTokens - maxTokens) * 2.4 * factor);
    let sys;
    if (isBuilder) sys = systemPrompt({ mode: 'builder', context: getAiContext(), facts: [], userName: store.get('user')?.displayName }) + '\n\n' + studioFacts(getAiContext(), Math.floor(budgetChars * 0.6));
    else if (isTutor) sys = systemPrompt({ mode: 'tutor', context: getAiContext(), facts: [], userName: store.get('user')?.displayName }) + '\n\n' + exerciseFacts(getAiContext());
    else {
      const items = await collect(cfg.use);
      const facts = retrieve(items, q + ' ' + messages.slice(-4, -2).map(m => m.content).join(' '), Math.floor(budgetChars * 0.4), { calendarish: isCalendarQuestion(q) });
      sys = systemPrompt({ mode: 'normal', facts, userName: store.get('user')?.displayName });
    }
    // history that fits next to the system prompt
    const hist = [];
    let used = sys.length;
    for (let i = messages.length - 2; i >= 0 && hist.length < 12; i--) {
      const m = messages[i];
      if (m.error) continue;
      const c = m.role === 'assistant' ? parseActions(m.content).text : m.content;
      if (used + c.length > budgetChars && hist.length) break;
      used += c.length; hist.unshift({ role: m.role, content: c });
    }
    return { msgs: [{ role: 'system', content: sys }, ...hist], maxTokens };
  };
  try {
    let shown = 0;
    const onToken = (t) => { bot.content = t; if (t.length - shown > 12 || /\n/.test(t.slice(shown))) { shown = t.length; drawMsgs(); } };
    for (const factor of [1, 0.5, 0.25]) {
      const { msgs, maxTokens } = await build(factor);
      try { await e.chat(msgs, { maxTokens, temperature: cfg.temp, signal: abort.signal, onToken }); break; }
      catch (x) { if (x.code !== 'context' || factor === 0.25) throw x; }   // too long: try again with less data
    }
    if (!bot.content.trim()) bot.content = abort.signal.aborted ? '(stoppet)' : 'Jeg har ikke noget svar på det. Prøv at spørge på en anden måde.';
  } catch (x) {
    bot.content = x.message || String(x); bot.error = true;
  } finally {
    bot.streaming = false; busy = false; abort = null;
    persistChat(); drawMsgs();
  }
}
