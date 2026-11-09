/**
 * The AI assistant pop-up window. Runs a small language model on this device (see engine.js), reads your own data
 * when it helps (knowledge.js), proposes actions you confirm, and turns into a teacher in Kodeskolen.
 */
import { quickFacts } from './tools.js';
import { pageSuggestions, isLooping, tidyAnswer } from './quality.js';
import { parseChart, chartFromText, chartFromCsv, chartSvg } from './charts.js';
let attached = null;   // a file the user attached to the next question: { name, text }
let pendingFile = null;   // the file going with the question being answered now
import { parseMemoryCommand, applyMemory, memoryBlock } from './memory.js';
let memory = null;   // what the user has asked Gnist to remember (on the account, state 'gnist')
import { h, clear, rect, uiZoom, viewW, viewH, raw } from '../core/dom.js';
import { icon, gnist } from '../core/icons.js';
import { toast, modal } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { store } from '../core/store.js';
import { fmtBody } from '../community/chat.js';
import { getAiContext, onAiContext } from './context.js';
import { MODELS, CTX_STEPS, ramFor, pickFor, gb, mb, deviceRam } from './models.js';
import { SOURCES, collect, retrieve, isCalendarQuestion, asksAboutPage, systemPrompt, questionBlock, exerciseFacts, studioFacts, parseActions, describe, runAction, guardCode } from './knowledge.js';
import { extractFiles, answerBlocks } from './actions.js';
import { getState, saveState, flushState } from '../core/services.js';

const KEY = 'hubtech.ai';
const HIST = 'hubtech.ai.chat';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

function defaults() {
  const dev = deviceRam();
  return { ram: Math.round(dev.suggest / 268435456) * 268435456 || 1073741824, model: 'auto', ctx: 'auto', url: '', gpu: true, temp: 0.4, style: 'points', use: { chats: true, guides: true, notes: true, tasks: true, calendar: true, snippets: true, customers: true } };
}
let cfg = { ...defaults(), ...read(KEY, {}) };
cfg.use = { ...defaults().use, ...(cfg.use || {}) };
const saveCfg = () => write(KEY, cfg);

/** Model + context the settings resolve to. */
export function resolved() {
  if (String(cfg.model).startsWith('ext:')) { const name = cfg.model.slice(4); const cl = (extInfo?.cloud || []).find(m => m.id === name); return { model: { id: cfg.model, name: cl ? cl.name : name.replace(/^cloud:[a-z]+\//, ''), size: 0, external: true, cloud: name.startsWith('cloud:') }, ctx: name.startsWith('cloud:') ? 100000 : 16384, ram: null, external: name }; }
  const auto = pickFor(cfg.ram);
  const model = cfg.model === 'auto' ? auto.model : MODELS.find(m => m.id === cfg.model) || null;
  let ctx = cfg.ctx === 'auto' ? (cfg.model === 'auto' ? auto.ctx : model ? (CTX_STEPS.filter(c => ramFor(model, c) <= cfg.ram).pop() || 1024) : 2048) : Number(cfg.ctx);
  return { model, ctx, ram: model ? ramFor(model, ctx) : null, tooSmall: cfg.model === 'auto' && auto.tooSmall };
}

let panel = null, engine = null, localFile = null, unsubCtx = null;
let messages = read(HIST, []).filter(m => m && m.role && typeof m.content === 'string').slice(-30);
messages._id = read(HIST + '.id', null) || undefined;
const chatListeners = new Set();
const chatsChanged = () => { for (const f of chatListeners) { try { f(); } catch { /* */ } } };
let busy = false, abort = null;
const persistChat = () => { write(HIST, messages.slice(-30)); write(HIST + '.id', messages._id || null); };

async function eng() { engine ||= await import('./engine.js'); return engine; }

let pageHost = null;   // when Gnist is open as her own app (full screen), the window lives inside that page

/** Gnist as an app: the same conversation, full screen inside the page. */
export function mountAssistantPage(host) {
  if (!panel) build();
  pageHost = host;
  host.appendChild(panel);
  panel.hidden = false; panel.classList.add('is-page');
  panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = '';
  document.body.classList.remove('ai-open'); document.body.classList.add('ai-page');
  drawAll(); autoStart();
  setTimeout(() => els.input?.focus(), 80);
}
export function unmountAssistantPage() {
  if (!panel || !pageHost) return;
  pageHost = null;
  panel.classList.remove('is-page'); panel.hidden = true;
  document.body.appendChild(panel);
  document.body.classList.remove('ai-page');
}

/** Read an answer aloud with the device's own voices (a Danish one when there is one). Click again to stop. */
function speak(text) {
  const S = window.speechSynthesis;
  if (S.speaking) { S.cancel(); return; }
  const plain = String(text).replace(/```[\s\S]*?(```|$)/g, ' ').replace(/[*#>`_]/g, '').replace(/\[(.+?)\]\(.+?\)/g, '$1').replace(/\s+/g, ' ').trim();
  const u = new SpeechSynthesisUtterance(plain.slice(0, 4000));
  const v = S.getVoices().find(x => /^da/i.test(x.lang)) || null;
  if (v) u.voice = v;
  u.lang = v?.lang || 'da-DK'; u.rate = 1.02;
  S.speak(u);
}
/** The chat as a text file (Markdown) the user can keep. */
function saveChatFile() {
  const lines = [`# Chat med Gnist – ${new Date().toLocaleString('da-DK')}`, ''];
  for (const m of messages) { if (m.error) continue; lines.push(m.role === 'user' ? `**Dig:** ${m.content}` : `**Gnist:** ${parseActions(m.content).text}`, ''); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
  a.download = `gnist-chat-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
/** Attach a text file to the next question (read here in the browser – it isn't uploaded anywhere). */
async function attachFile(file) {
  if (!file) return;
  if (file.size > 400 * 1024) { toast('Filen er for stor', { type: 'warn', text: 'Gnist kan læse tekstfiler op til 400 KB.' }); return; }
  try { attached = { name: file.name, text: await file.text() }; } catch { toast('Filen kunne ikke læses', { type: 'warn' }); return; }
  drawAttach(); els.input.focus();
}
function drawAttach() {
  h(clear(els.attachBox), null, attached ? h('span', { class: 'chip ai-attached' }, icon('paperclip'), h('span', null, attached.name),
    h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Fjern ${attached.name}`, onclick: () => { attached = null; drawAttach(); } }, icon('x'))) : null);
  els.attachBox.hidden = !attached;
}

/** Start a new chat – the one you were in is saved first. */
export async function newChat() {
  if (busy) return false;
  const old = messages;   // cleared at once (you can type right away); the old chat is saved in the background
  messages = []; messages._id = undefined; persistChat(); if (panel) drawMsgs();
  setTimeout(() => els?.input?.focus(), 30);
  await archiveChat(old); chatsChanged();
  return true;
}
/** Your saved chats (newest first) and the id of the one that is open. */
export async function chatList() { let chats = []; try { chats = ((await getState('gnist')) || {}).chats || []; } catch { /* */ } return { chats, current: messages._id || null }; }
export async function openChat(id) {
  if (busy) return false;
  const c = (await chatList()).chats.find(x => x.id === id);
  if (!c) return false;
  const old = messages;
  messages = c.messages.map(m => ({ ...m })); messages._id = c.id; persistChat(); if (panel) drawMsgs();
  if (old._id !== c.id) await archiveChat(old);
  chatsChanged();
  return true;
}
export async function deleteChat(id) {
  const st = (await getState('gnist', { force: true })) || {}; st.chats = (st.chats || []).filter(c => c.id !== id); saveState('gnist', st); flushState('gnist');
  if (messages._id === id) { messages = []; messages._id = undefined; persistChat(); if (panel) drawMsgs(); }
  chatsChanged();
}
export function onChatsChanged(fn) { chatListeners.add(fn); return () => chatListeners.delete(fn); }

export function toggleAssistant(open) {
  if (!panel) build();
  if (pageHost) { els.input?.focus(); return; }   // already full screen: just go to the question field
  const show = open ?? panel.hidden;
  panel.hidden = !show;
  document.body.classList.toggle('ai-open', show);
  if (show) { drawAll(); setTimeout(() => panel.querySelector('.ai-input')?.focus(), 60); autoStart(); }
}

/** Opening the assistant starts the model by itself when it is already downloaded – no extra click. */
let autoTried = false;
async function autoStart() {
  if (autoTried || cfg.model === 'file') return;
  autoTried = true;
  try {
    const e = await eng();
    if (e.isReady() || e.state.status === 'loading' || e.supported()) return;
    const r = resolved();
    if (r.external) { start(); return; }
    const want = cfg.model === 'url' ? cfg.url : r.model ? r.model.file : '';
    if (!want) return;
    const have = await e.downloaded();
    if (have.some(m => String(m.url).includes(want.split('/').pop()))) start();
  } catch { /* the start button still works */ }
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
  const fab = h('button', { class: 'ai-fab', dataset: { tour: 'gnist' }, 'aria-label': 'Spørg Gnist – din AI-assistent (Ctrl+J)', title: 'Gnist – din AI-assistent (Ctrl+J)', onclick: () => toggleAssistant() }, gnist(30));
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
  const histBox = h('div', { class: 'ai-history', hidden: true });
  const attachBox = h('div', { class: 'ai-attach-row', hidden: true });
  const head = h('header', { class: 'ai-head' },
    h('span', { class: 'ai-logo', 'aria-hidden': 'true' }, gnist(34)),
    h('div', { class: 'ai-title' }, h('b', null, 'Gnist'), status), mode,
    h('button', { class: 'btn btn-sm ai-new', 'aria-label': 'Ny samtale', title: 'Start en ny chat (den gamle gemmes)', onclick: () => newChat() }, icon('plus'), h('span', null, 'Ny chat')),
    h('button', { class: 'icon-btn ai-hist-btn', 'aria-label': 'Tidligere samtaler', title: 'Tidligere samtaler', 'aria-expanded': 'false', onclick: (e) => { histBox.hidden = !histBox.hidden; e.currentTarget.setAttribute('aria-expanded', String(!histBox.hidden)); drawHistory(); } }, icon('clock')),
    h('button', { class: 'icon-btn', 'aria-label': 'Indstillinger for assistenten', title: 'Indstillinger', 'aria-expanded': 'false', onclick: (e) => { settingsBox.hidden = !settingsBox.hidden; e.currentTarget.setAttribute('aria-expanded', String(!settingsBox.hidden)); drawSettings(); } }, icon('settings')),
    h('a', { class: 'icon-btn ai-expand', href: '#/apps/gnist', 'aria-label': 'Åbn Gnist på fuld skærm', title: 'Fuld skærm', onclick: () => toggleAssistant(false) }, icon('maximize')),
    h('button', { class: 'icon-btn ai-close', 'aria-label': 'Luk assistenten', title: 'Luk (Esc)', onclick: () => toggleAssistant(false) }, icon('x')));
  panel = h('section', { class: 'ai-panel glass', role: 'dialog', 'aria-label': 'Gnist – AI-assistent', hidden: true },
    head, settingsBox, histBox, list,
    attachBox,
    h('div', { class: 'ai-compose' }, h('label', { class: 'icon-btn ai-attach', title: 'Vedhæft en fil (tekst, noter, kode eller CSV)', 'aria-label': 'Vedhæft en fil' }, icon('paperclip'),
      h('input', { type: 'file', accept: '.txt,.md,.csv,.tsv,.json,.log,.html,.css,.js,.py,.ino,.c,.cpp,.xml,.yaml,.yml,.ini,.cfg', hidden: true, onchange: (e) => { attachFile(e.target.files?.[0]); e.target.value = ''; } })), input, send),
    String(cfg.model).startsWith('ext:cloud:') ? h('p', { class: 'ai-foot is-cloud' }, icon('globe'), `Bruger ${resolved().model?.name || 'en AI i skyen'} – det, du skriver, sendes til tjenesten.`)
      : h('p', { class: 'ai-foot' }, icon('lock'), 'Kører på din enhed – dine data sendes ikke nogen steder hen.'));
  document.body.appendChild(panel);
  els = { status, mode, list, input, send, settingsBox, histBox, head, attachBox };

  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); ask(); }
    else if (e.key === 'ArrowUp' && !input.value) { const last = [...messages].reverse().find(m => m.role === 'user'); if (last) { e.preventDefault(); input.value = last.content; autosize(); } }
  });
  send.addEventListener('click', () => (busy ? stop() : ask()));
  // drag the window by its title bar (desktop)
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a') || pageHost || matchMedia('(max-width: 700px)').matches) return;
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

// ── earlier conversations: saved on the profile, can be opened again – and Gnist can look in them (knowledge.js) ──
const chatTitle = (msgs) => (msgs.find(m => m.role === 'user')?.content || 'Samtale').replace(/\s+/g, ' ').slice(0, 70);
async function archiveChat(msgs = messages) {
  const real = msgs.filter(m => !m.error && !m.streaming && m.content);
  if (!real.some(m => m.role === 'user')) return;
  try {
    const st = (await getState('gnist', { force: true })) || {}; st.chats ||= [];
    const keep = real.slice(-40).map(m => ({ role: m.role, content: String(m.content).slice(0, 4000), sources: m.sources }));
    const id = msgs._id ||= Date.now().toString(36);
    if (msgs === messages) write(HIST + '.id', id);
    st.chats = [{ id, title: chatTitle(keep), at: Date.now(), model: engine?.state?.model?.name || '', messages: keep }, ...st.chats.filter(c => c.id !== id)].slice(0, 40);
    saveState('gnist', st); flushState('gnist'); chatsChanged();
  } catch { /* the conversation is still in this browser */ }
}
async function drawHistory() {
  const box = els.histBox;
  if (box.hidden) return;
  h(clear(box), null, h('p', { class: 'faint' }, 'Henter …'));
  let chats = [];
  try { chats = ((await getState('gnist', { force: true })) || {}).chats || []; } catch { /* */ }
  const del = async (id) => { const st = (await getState('gnist', { force: true })) || {}; st.chats = (st.chats || []).filter(c => c.id !== id); saveState('gnist', st); flushState('gnist'); drawHistory(); };
  h(clear(box), null,
    h('div', { class: 'ai-hist-h' }, h('b', null, 'Tidligere samtaler'), h('span', { class: 'faint' }, 'Gnist kan også slå op i dem, når du spørger')),
    chats.length ? h('ul', { class: 'ai-hist-list' }, chats.map(c => h('li', null,
      h('button', { type: 'button', class: 'ai-hist-item', onclick: async () => {
        if (busy) return;
        await archiveChat();
        messages = c.messages.map(m => ({ ...m })); messages._id = c.id; persistChat();
        box.hidden = true; els.head.querySelector('.ai-hist-btn')?.setAttribute('aria-expanded', 'false'); drawMsgs();
      } }, h('span', { class: 'ai-hist-t' }, c.title), h('span', { class: 'faint' }, `${new Date(c.at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })} · ${c.messages.length} beskeder${c.model ? ' · ' + c.model : ''}`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Slet samtalen "${c.title}"`, onclick: () => del(c.id) }, icon('trash'))))) : h('p', { class: 'faint' }, 'Ingen gemte samtaler endnu. Når du starter en ny samtale, gemmes den gamle her.'));
}
function drawStatus() {
  const st = engine?.state || { status: 'idle' };
  const r = resolved();
  const name = localFile ? localFile.name : cfg.model === 'url' ? 'Egen model' : r.model?.name || '';
  els.status.textContent = st.status === 'loading' ? `Henter ${name} … ${Math.round((st.progress || 0) * 100)} %`
    : st.status === 'thinking' ? `${name} · tænker …` : st.status === 'ready' ? `${name} · klar` : st.status === 'error' ? 'Fejl' : 'Ikke startet';
  els.mode.hidden = !tutor() && !builder();
  if (!els.mode.hidden) h(clear(els.mode), null, icon(tutor() ? 'graduation' : 'code'), tutor() ? 'Lærer' : 'App-bygger');
  els.mode.classList.toggle('is-builder', builder());
  panel?.classList.toggle('is-thinking', st.status === 'thinking' || st.status === 'loading');
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
    : pageSuggestions(location.hash);   // the page you are on first
  return h('div', { class: 'ai-sugg' }, list.map(t => h('button', { class: 'chip', onclick: () => { els.input.value = t; ask(); } }, t)));
}

function startCard() {
  const unsupported = engine?.supported?.() ?? null;
  const r = resolved();
  const st = engine?.state || {};
  if (st.status === 'loading') return h('div', { class: 'ai-card ai-load' }, h('b', null, 'Gnist vågner … (henter og starter modellen)'), h('div', { class: 'ai-bar' }, h('i', { style: { width: `${Math.round((st.progress || 0) * 100)}%` } })),
    h('p', { class: 'faint' }, st.noCache ? 'Der er ikke plads til at gemme modellen i browseren, så den hentes direkte ind i hukommelsen – og hentes igen næste gang. Frigør plads på disken for at undgå det.'
      : 'Første gang hentes modellen fra Hugging Face og gemmes i browseren. Næste gang starter den uden download.'));
  const dev = deviceRam();
  return h('div', { class: 'ai-card' },
    h('div', { class: 'ai-hello' }, h('span', { class: 'ai-hello-mark' }, gnist(52, { mood: 'wave' })), h('div', null, h('b', null, tutor() ? 'Gnist – din programmeringslærer' : builder() ? 'Gnist – din app-bygger' : `Hej${store.get('user')?.displayName ? ' ' + store.get('user').displayName.split(' ')[0] : ''}! Jeg hedder Gnist`),
      h('p', null, builder() ? 'Jeg kan se appens filer og fejlene i konsollen. Beskriv, hvad appen skal kunne, så skriver jeg koden – og du vælger selv, hvilke filer der skal bruges. Vælg gerne 4096 tokens hukommelse eller mere.'
        : tutor() ? 'Jeg kan se opgaven og din kode, og jeg hjælper dig videre med hints – men jeg giver dig ikke løsningen. Du lærer mest ved selv at skrive den.'
        : 'Jeg er HUBTECHs egen AI – en lille gnist fra værkstedet. Jeg kender alle guides og kurser, kan læse dine noter, opgaver og aftaler, og hjælper gerne med at planlægge, forklare og fejlfinde. Jeg kører på din egen enhed, så alt bliver hos dig.'))),
    st.status === 'error' ? h('p', { class: 'field-error' }, st.error) : null,
    unsupported ? h('p', { class: 'field-error' }, unsupported) : null,
    h('div', { class: 'ai-pick' }, icon('chip'), h('span', null, localFile ? `Fil: ${localFile.name} (${mb(localFile.size)})` : cfg.model === 'file' ? 'Vælg din .gguf-fil (den skal vælges igen, når siden er genindlæst)' : cfg.model === 'url' ? 'Egen model fra URL' : r.external ? `Stor model: ${r.external} (Ollama/LM Studio på computeren)` : r.model ? `${r.model.name} · ${mb(r.model.size)} download · ca. ${gb(r.ram)} RAM` : 'Vælg en model'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { els.settingsBox.hidden = false; drawSettings(); } }, 'Skift')),
    r.tooSmall ? h('p', { class: 'faint' }, 'RAM-grænsen er meget lav – den mindste model bruges med kort hukommelse.') : null,
    dev.mobile ? h('p', { class: 'faint' }, 'På telefonen: brug Wi-Fi første gang, og hold appen åben, mens modellen hentes.') : null,
    h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-primary', disabled: !!unsupported, onclick: () => start(st.status === 'error') }, icon(st.status === 'error' ? 'refresh' : 'play'), st.status === 'error' ? 'Prøv igen' : 'Væk Gnist'),
      st.status === 'error' ? h('button', { class: 'btn btn-ghost', onclick: () => diagnose() }, icon('info'), 'Tjek min enhed') : null));
}

/** What the device can do – shown when something goes wrong, and from the assistant's settings. */
async function diagnose() {
  const e = await eng();
  const rows = [];
  const ok = (label, good, text) => rows.push(h('li', { class: good ? 'is-ok' : 'is-bad' }, icon(good ? 'check' : 'alert'), h('span', null, h('b', null, label), ' – ', text)));
  const bad = e.supported();
  ok('WebAssembly', !bad, bad || 'virker');
  const cores = navigator.hardwareConcurrency || 1, iso = !!globalThis.crossOriginIsolated;
  ok('Flere processorkerner', iso, iso ? `ja – ${e.state.threads > 1 ? `${e.state.threads} kerner i brug` : `op til ${Math.max(1, Math.floor(cores / 2))} af ${cores} kerner`}` : 'nej – siden er ikke isoleret, så assistenten bruger kun én kerne (det sker, når et ByteForge-panel fra en anden adresse er sat op)');
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
  const m = modal({ title: 'Tjek af Gnist (den lokale AI)', label: 'Gnist', size: 520, body: h('ul', { class: 'ai-diag' }, rows), actions: [close] });
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
    if (k % 3 === 0) return p.trim() ? h('div', { class: 'ai-md' }, richText(p.trim())) : null;
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
    !m.streaming && m.sources?.length ? h('div', { class: 'ai-sources' }, h('span', { class: 'faint' }, 'Kilder:'),
      m.sources.map(s => s.href ? h('a', { class: 'chip ai-source', href: s.href, title: `${s.label}: ${s.title}`, onclick: () => { if (matchMedia('(max-width: 700px)').matches) toggleAssistant(false); } }, icon(s.kind === 'lesson' || s.kind === 'guide' ? 'book' : 'file'), h('span', null, s.title))
        : h('span', { class: 'chip ai-source' }, s.title))) : null,
    !m.streaming && m.content && i === messages.length - 1 ? h('div', { class: 'ai-msg-tools' },
      m.error || !('speechSynthesis' in window) ? null : h('button', { class: 'icon-btn ai-speak', 'aria-label': 'Læs svaret op', title: 'Læs op', onclick: () => speak(m.content) }, icon('volume')),
      h('button', { class: 'icon-btn', 'aria-label': 'Gem chatten som fil', title: 'Gem chatten', onclick: () => saveChatFile() }, icon('download')),
      m.error ? null : h('button', { class: 'icon-btn', 'aria-label': 'Kopiér svaret', title: 'Kopiér', onclick: () => navigator.clipboard?.writeText(parseActions(m.content).text).then(() => toast('Kopieret', { type: 'ok' })).catch(() => {}) }, icon('copy')),
      messages[i - 1]?.role === 'user' && !m.local ? h('button', { class: 'icon-btn', 'aria-label': 'Prøv igen med et nyt svar', title: 'Prøv igen', onclick: () => retry() }, icon('refresh')) : null) : null,
    !m.streaming && !m.error && !m.local && m.content && i === messages.length - 1 && messages[i - 1]?.role === 'user' && !tutor() && !builder()
      ? h('div', { class: 'ai-follow', role: 'group', 'aria-label': 'Spørg videre' }, FOLLOW.map(([label, ask2]) => h('button', { type: 'button', class: 'chip ai-follow-chip', onclick: () => { if (busy) return; els.input.value = ask2; ask(); } }, label))) : null);
}

/** An answer as headings, lists and paragraphs (code blocks are kept whole). */
/** A chart drawn by HUBTECH (charts.js escapes every text, so the SVG is safe to insert) – with "Gem som billede". */
function chartFigure(c) {
  const svg = chartSvg(c);
  return h('figure', { class: 'ai-chart' }, raw(svg),
    h('div', { class: 'ai-chart-actions' }, h('a', { class: 'btn btn-sm btn-ghost', download: `${(c.title || 'graf').replace(/[^\wæøåÆØÅ -]/g, '').trim() || 'graf'}.svg`, href: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) }, icon('download'), 'Gem som billede')));
}
const chartBlock = (c) => '```graf\n' + [`type: ${{ bar: 'søjle', line: 'linje', pie: 'cirkel' }[c.type]}`, c.title ? `titel: ${c.title}` : '', ...c.data.map(d => `${d.label}: ${d.value}`)].filter(Boolean).join('\n') + '\n```';
function richText(text) {
  return text.split(/(```[\s\S]*?(?:```|$))/).map((part) => {
    const gm = part.startsWith('```') && part.match(/^```\s*(?:graf|chart|diagram)\b[^\n]*\n([\s\S]*?)(?:```|$)/i);
    const chart = gm && parseChart(gm[1]);
    if (chart) return chartFigure(chart);
    if (part.startsWith('```')) return h('div', null, fmtBody(part));
    return answerBlocks(part).map(b => b.type === 'h' ? h('h4', { class: 'ai-h' }, fmtBody(b.text))
      : b.type === 'ul' ? h('ul', { class: 'ai-ul' }, b.items.map(x => h('li', null, fmtBody(x))))
        : b.type === 'ol' ? h('ol', { class: 'ai-ol' }, b.items.map(x => h('li', null, fmtBody(x))))
          : b.items.map(x => h('p', { class: 'ai-p' }, fmtBody(x))));
  });
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
/** "Det husker Gnist om dig" in the settings: each thing with a delete button. */
function memBox() {
  const box = h('div', { class: 'field ai-memory' }, h('span', { class: 'field-label' }, 'Det husker Gnist om dig'), h('p', { class: 'faint' }, 'Henter …'));
  getState('gnist').then(st => {
    const list = (st || {}).memory || [];
    const save = async (l) => { const s2 = (await getState('gnist', { force: true })) || {}; s2.memory = l; memory = l; saveState('gnist', s2); flushState('gnist'); h(clear(box), null, ...memBox().childNodes); };
    h(clear(box), null, h('span', { class: 'field-label' }, 'Det husker Gnist om dig'),
      list.length ? h('ul', { class: 'ai-mem-list' }, list.map((x, i) => h('li', null, h('span', null, x.text),
        h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Glem: ${x.text}`, onclick: () => save(list.filter((_, k) => k !== i)) }, icon('x'))))) : h('p', { class: 'faint' }, 'Ingenting endnu. Skriv fx «Husk at jeg arbejder med lasere».'),
      list.length ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => save([]) }, icon('trash'), 'Glem alt') : null);
  }).catch(() => h(clear(box), null, h('span', { class: 'field-label' }, 'Det husker Gnist om dig'), h('p', { class: 'faint' }, 'Kunne ikke hentes.')));
  return box;
}

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
    extInfo?.ok && extInfo.models.length ? h('optgroup', { label: 'Store modeller (Ollama/LM Studio på computeren)' }, extInfo.models.map(m => h('option', { value: 'ext:' + m.id, selected: cfg.model === 'ext:' + m.id }, `${m.id}${m.size ? ' – ' + gb(m.size) : ''}`))) : null,
    (extInfo?.cloud || []).length ? h('optgroup', { label: 'Claude og andre AI’er (i skyen)' }, extInfo.cloud.map(m => h('option', { value: 'ext:' + m.id, selected: cfg.model === 'ext:' + m.id }, `${m.name} – ${m.provider}`))) : null,
    String(cfg.model).startsWith('ext:') && !extInfo?.models?.some(m => 'ext:' + m.id === cfg.model) && !(extInfo?.cloud || []).some(m => 'ext:' + m.id === cfg.model) ? h('option', { value: cfg.model, selected: true }, cfg.model.slice(4).replace(/^cloud:[a-z]+\//, '') + ' (ikke tilgængelig)') : null,
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
  const style = h('select', { class: 'select', 'aria-label': 'Svarform' }, [['points', 'Korte punkter'], ['text', 'Almindelig tekst']].map(([v, l]) => h('option', { value: v, selected: (cfg.style || 'points') === v }, l)));
  style.addEventListener('change', () => { cfg.style = style.value; saveCfg(); });
  const temp = h('select', { class: 'select', 'aria-label': 'Stil' }, [[0.2, 'Præcis'], [0.4, 'Balanceret'], [0.8, 'Kreativ']].map(([v, l]) => h('option', { value: v, selected: Number(cfg.temp) === v }, l)));
  temp.addEventListener('change', () => { cfg.temp = Number(temp.value); saveCfg(); });
  const srcs = h('div', { class: 'ai-srcs' }, Object.entries(SOURCES).map(([k, l]) => {
    const cb = h('input', { type: 'checkbox', checked: cfg.use[k] !== false, onchange: (e) => { cfg.use[k] = e.target.checked; saveCfg(); } });
    return h('label', { class: 'cal-pcheck' }, cb, h('span', null, l));
  }));
  const st = engine?.state?.status;
  const extBox = h('div', { class: 'ai-ext' });
  drawExternal(extBox);
  h(clear(box), null,
    h('div', { class: 'ai-set-row' }, h('span', { class: 'field-label' }, 'Maks. RAM'), ramOut),
    ramIn,
    h('div', { class: 'ai-set-hint' }, pickOut, dev.gb ? h('span', { class: 'faint' }, ` · enheden har ca. ${dev.gb} GB`) : null),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Model'), modelSel), urlIn, fileBtn, fileIn,
    MODELS.find(m => m.id === (cfg.model === 'auto' ? r.model?.id : cfg.model)) ? h('p', { class: 'faint ai-note' }, MODELS.find(m => m.id === (cfg.model === 'auto' ? r.model?.id : cfg.model)).note) : null,
    extBox,
    h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hukommelse'), ctxSel), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Stil'), temp)),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Svarform'), style),
    h('label', { class: 'cal-pcheck' }, gpu, h('span', null, 'Brug grafikkortet (WebGPU), når det findes')),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Må læse'), srcs),
    memBox(),
    h('div', { class: 'ai-set-btns' },
      st === 'ready' ? h('button', { class: 'btn btn-sm', onclick: async () => { await (await eng()).unload(); drawAll(); toast('Gnist sover nu', { text: 'Hukommelsen er frigivet.' }); } }, icon('power'), 'Stop og frigiv RAM') : null,
      h('button', { class: 'btn btn-sm', onclick: () => start(true) }, icon('refresh'), st === 'ready' ? 'Genstart med valget' : 'Start med valget'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => diagnose() }, icon('info'), 'Tjek min enhed'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { try { const e = await eng(); await e.unload(); await e.clearDownloads(); toast('Hentede modeller er slettet', { type: 'ok', text: 'Pladsen i browseren er frigivet.' }); drawAll(); } catch (x) { toast('Kunne ikke slette', { type: 'bad', text: x.message }); } } }, icon('trash'), 'Slet hentede modeller')),
    h('p', { class: 'faint ai-note' }, 'Modellerne er open source (Qwen 2.5 og Qwen 3: Apache 2.0, Llama 3.2: Llama Community License) og hentes fra Hugging Face første gang.'));
}

// ── big models: Ollama or LM Studio on this computer (4, 8, 16, 32 GB …) ──
let extInfo = null;
async function drawExternal(box) {
  const first = !extInfo;
  if (first) h(clear(box), null, h('p', { class: 'faint' }, 'Leder efter Ollama/LM Studio …'));
  try {
    const res = await fetch('/api/ai/external', { headers: { 'X-Requested-With': 'hubtech' } });
    extInfo = res.ok ? await res.json() : { ok: false, models: [], tiers: [] };
  } catch { extInfo = { ok: false, models: [], tiers: [] }; }
  if (first && ((extInfo.ok && extInfo.models.length) || (extInfo.cloud || []).length)) drawSettings();   // the model list now includes the big models and the cloud
  const have = new Set((extInfo.models || []).map(m => m.id));
  const use = (id) => { cfg.model = 'ext:' + id; saveCfg(); drawSettings(); start(true); };
  const pull = async (id, btn, bar) => {
    btn.disabled = true; bar.hidden = false;
    try {
      const res = await fetch('/api/ai/external/pull', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hubtech' }, body: JSON.stringify({ model: id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fejl ${res.status}`);
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let k; while ((k = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, k); buf = buf.slice(k + 1); try { const j = JSON.parse(line); if (j.error) throw new Error(j.error); if (j.total) bar.querySelector('i').style.width = `${Math.round(j.completed / j.total * 100)}%`; btn.textContent = j.total ? `${Math.round(j.completed / j.total * 100)} %` : (j.status || '…'); } catch (x) { if (x.message && !/JSON/.test(x.message)) throw x; } }
      }
      toast(`${id} er hentet`, { type: 'ok', text: 'Gnist kan nu bruge den store model.' });
      use(id);
    } catch (x) { toast('Kunne ikke hente modellen', { type: 'bad', text: x.message }); btn.disabled = false; btn.textContent = 'Prøv igen'; }
  };
  const urlIn = h('input', { class: 'input', value: extInfo.url || '', 'aria-label': 'Adresse til Ollama eller LM Studio', placeholder: 'http://127.0.0.1:11434' });
  h(clear(box), null,
    h('div', { class: 'ai-ext-h' }, h('b', null, 'Store modeller (4–32 GB)'),
      h('span', { class: ['chip', extInfo.ok ? 'chip-ok' : ''] }, extInfo.ok ? `${extInfo.kind === 'ollama' ? 'Ollama' : 'Server'} fundet · ${extInfo.models.length} modeller` : 'Ikke fundet')),
    h('p', { class: 'faint ai-note' }, extInfo.ok ? 'Store modeller kører i Ollama eller LM Studio på computeren med grafikkortet – meget klogere end modellerne i browseren. Samtalen følger med, når du skifter.'
      : 'Store modeller kræver det gratis program Ollama (ollama.com) eller LM Studio på den computer, HUBTECH kører på. Installér det, start det, og åbn indstillingerne igen.'),
    !extInfo.ok ? h('ol', { class: 'ai-ext-steps faint' },
      h('li', null, 'Hent det gratis program Ollama fra ollama.com på den computer, HUBTECH kører på.'),
      h('li', null, 'Start Ollama (det ligger ved uret i Windows).'),
      h('li', null, 'Tryk «Søg igen» – så kan du hente og bruge modellerne herunder.')) : null,
    !extInfo.ok ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { extInfo = null; drawExternal(box); } }, icon('refresh'), 'Søg igen') : null,
    (extInfo.tiers || []).length ? h('ul', { class: 'ai-tiers' }, (extInfo.tiers || []).map(t => {
      const btn = h('button', { type: 'button', class: ['btn', 'btn-sm', have.has(t.model) ? 'btn-primary' : ''] }, have.has(t.model) ? (cfg.model === 'ext:' + t.model ? 'I brug' : 'Brug') : `Hent (${String(t.size).replace('.', ',')} GB)`);
      if (!extInfo.ok) { btn.disabled = true; btn.textContent = 'Kræver Ollama'; }
      const bar = h('div', { class: 'ai-bar', hidden: true }, h('i'));
      btn.onclick = () => (have.has(t.model) ? use(t.model) : pull(t.model, btn, bar));
      if (!have.has(t.model) && !extInfo.canEdit) btn.disabled = true;
      if (!extInfo.ok) btn.onclick = null;
      return h('li', { class: 'ai-tier' }, h('span', { class: 'ai-tier-ram' }, `${t.ram} GB`), h('span', { class: 'ai-tier-t' }, h('b', null, t.model), h('small', { class: 'faint' }, t.note)), btn, bar);
    })) : null,
    extInfo.canEdit ? h('div', { class: 'ai-ext-url' }, urlIn, h('button', { class: 'btn btn-sm', onclick: async () => {
      try { await fetch('/api/ai/external', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hubtech' }, body: JSON.stringify({ url: urlIn.value }) }); extInfo = null; drawExternal(box); } catch { /* */ }
    } }, 'Gem adresse')) : null,
    cloudBox(box));
}

// ── Claude and other AI services: the owner adds an API key once, everyone on this HUBTECH can then choose them ──
function cloudBox(box) {
  const provs = extInfo.providers || [];
  const use = (id) => { cfg.model = 'ext:' + id; saveCfg(); drawSettings(); start(true); };
  const models = extInfo.cloud || [];
  return h('div', { class: 'ai-cloud' },
    h('div', { class: 'ai-ext-h' }, h('b', null, 'Claude og andre AI’er'), h('span', { class: ['chip', models.length ? 'chip-ok' : ''] }, models.length ? `${provs.filter(p => p.set).length} tjeneste${provs.filter(p => p.set).length === 1 ? '' : 'r'} klar` : 'Ikke sat op')),
    h('p', { class: 'faint ai-note' }, 'De klogeste modeller kører hos tjenesten på internettet. Ejeren sætter en API-nøgle ind én gang – nøglen bliver på HUBTECH og vises aldrig i browseren. Bemærk: det, du skriver til dem, sendes til tjenesten.'),
    models.length ? h('ul', { class: 'ai-tiers' }, models.map(m => h('li', { class: 'ai-tier' }, h('span', { class: 'ai-tier-t' }, h('b', null, m.name), h('small', { class: 'faint' }, m.provider)),
      h('button', { type: 'button', class: ['btn', 'btn-sm', cfg.model === 'ext:' + m.id ? 'btn-primary' : ''], onclick: () => use(m.id) }, cfg.model === 'ext:' + m.id ? 'I brug' : 'Brug')))) : null,
    extInfo.canEdit ? h('div', { class: 'ai-keys' }, provs.map(p => {
      const key = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: p.set ? 'Nøgle gemt – skriv en ny for at skifte' : 'Indsæt API-nøgle', 'aria-label': `API-nøgle til ${p.name}` });
      const save = async (val) => {
        try {
          const res = await fetch(`/api/ai/cloud/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hubtech' }, body: JSON.stringify({ key: val }) });
          const j = await res.json(); if (!res.ok) throw new Error(j.error || `Fejl ${res.status}`);
          toast(val ? `${p.name} er klar` : `${p.name} er fjernet`, { type: 'ok', text: val ? `${j.models.length} modeller kan nu vælges i Gnist.` : '' });
          extInfo = null; drawExternal(box); drawSettings();
        } catch (x) { toast('Nøglen virkede ikke', { type: 'bad', text: x.message }); }
      };
      return h('details', { class: 'ai-key', open: false }, h('summary', null, h('b', null, p.name), h('span', { class: ['chip', p.set ? 'chip-ok' : ''] }, p.set ? 'Nøgle gemt' : 'Ingen nøgle')),
        h('p', { class: 'faint ai-note' }, p.help),
        h('div', { class: 'ai-ext-url' }, key, h('button', { class: 'btn btn-sm btn-primary', onclick: () => key.value.trim() && save(key.value.trim()) }, 'Gem nøgle'),
          p.set ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => save('') }, 'Fjern') : null));
    })) : (!models.length ? h('p', { class: 'faint ai-note' }, 'Bed ejeren af HUBTECH om at sætte en nøgle ind, hvis I vil bruge Claude eller en anden AI-tjeneste.') : null));
}

// ── running ──
let starting = null;
/** Start the chosen model. Two clicks in a row share one start; a new choice (force) replaces the one on its way. */
function start(force) {
  if (starting && !force) return starting;
  const mine = (starting = startNow(force).finally(() => { if (starting === mine) starting = null; }));
  return mine;
}
async function startNow(force) {
  const e = await eng();
  const r = resolved();
  const bad = r.external ? null : e.supported();
  if (bad) { toast('Den lokale AI kan ikke køre her', { type: 'bad', text: bad }); return false; }
  const opts = { ctx: r.ctx || 2048, gpu: cfg.gpu };
  if (cfg.model === 'file') { if (!localFile) { els.settingsBox.hidden = false; drawSettings(); toast('Vælg en .gguf-fil først', { type: 'warn' }); return false; } opts.file = localFile; }
  else if (cfg.model === 'url') { if (!/^https:\/\/.+\.gguf(\?.*)?$/i.test(cfg.url || '')) { els.settingsBox.hidden = false; drawSettings(); toast('Skriv en https-adresse til en .gguf-fil', { type: 'warn' }); return false; } opts.url = cfg.url; }
  else if (r.external) {
    if (force) await e.unload();
    drawMsgs();
    try { await e.loadExternal(r.external); els.settingsBox.hidden = true; drawMsgs(); return true; }
    catch (x) { drawMsgs(); if (x?.code !== 'superseded') toast('Den store model er ikke klar', { type: 'bad', text: x.message }); return false; }
  }
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
  } catch (x) { drawMsgs(); if (x?.code !== 'superseded') toast('Gnist kunne ikke starte', { type: 'bad', text: x.message }); return false; }
}

function stop() { abort?.abort(); }

// quick follow-ups under the last answer – one click asks Gnist to rework what she just said
const FOLLOW = [
  ['Forklar enklere', 'Forklar dit sidste svar enklere, som til en nybegynder.'],
  ['Kortere', 'Gør dit sidste svar kortere – kun det vigtigste.'],
  ['Lav en tjekliste', 'Lav dit sidste svar om til en tjekliste med nummererede trin.'],
  ['Giv et eksempel', 'Giv et konkret eksempel på det, du lige forklarede.'],
];

/** Ask the last question again (a fresh answer). */
function retry() {
  if (busy) return;
  const last = messages[messages.length - 1], q = messages[messages.length - 2];
  if (last?.role !== 'assistant' || q?.role !== 'user') return;
  messages.splice(-2, 2);
  els.input.value = q.content;
  ask();
}

async function ask() {
  let q = els.input.value.trim();
  if (busy || (!q && !attached)) return;
  const file = attached; attached = null; drawAttach();
  if (file && !q) q = `Hvad står der i filen ${file.name}? Giv et kort overblik.`;
  const csvChart = file && /\.(csv|tsv)$/i.test(file.name) && (/graf|diagram|tegn|vis/i.test(q) || /overblik/.test(q)) ? chartFromCsv(file.text, file.name) : null;
  if (csvChart) {
    els.input.value = '';
    messages.push({ role: 'user', content: `${q}\n📎 ${file.name}` }, { role: 'assistant', content: `Her er en graf over ${file.name} (${csvChart.data.length} rækker):\n\n${chartBlock(csvChart)}`, local: true });
    persistChat(); drawMsgs(); archiveChat(); return;
  }
  pendingFile = file;
  const quickChart = !tutor() && !builder() ? chartFromText(q) : null;
  if (quickChart) {   // "lav en graf over jan 5, feb 8 og mar 3": drawn at once by HUBTECH
    els.input.value = ''; els.input.style.height = 'auto';
    messages.push({ role: 'user', content: q }, { role: 'assistant', content: `Her er din graf:\n\n${chartBlock(quickChart)}\n\n${quickChart.type === 'pie' ? 'Skriv fx «lav det som søjlediagram»' : 'Skriv fx «lav et cirkeldiagram»'} med tallene, hvis den skal se anderledes ud.`, local: true });
    persistChat(); drawMsgs(); archiveChat(); return;
  }
  const mem = parseMemoryCommand(q);
  if (mem) {   // "Husk at …" / "Hvad husker du?" / "Glem …": HUBTECH does it at once – no model needed
    els.input.value = ''; els.input.style.height = 'auto';
    let reply;
    try {
      const st = (await getState('gnist', { force: true })) || {};
      const r = applyMemory(st.memory || [], mem); reply = r.reply;
      st.memory = r.list; memory = r.list; saveState('gnist', st); flushState('gnist');
    } catch { reply = 'Jeg kunne ikke gemme det lige nu – prøv igen om lidt.'; }
    messages.push({ role: 'user', content: q }, { role: 'assistant', content: reply, local: true });
    persistChat(); drawMsgs(); archiveChat(); return;
  }
  const e = await eng();
  if (!e.isReady()) { if (!await start()) return; }
  els.input.value = ''; els.input.style.height = 'auto';
  const isTutor = tutor(), isBuilder = builder();
  const fileNow = pendingFile; pendingFile = null;
  messages.push({ role: 'user', content: fileNow ? `${q}\n📎 ${fileNow.name}` : q });
  const bot = { role: 'assistant', content: '', streaming: true, tutor: isTutor, builder: isBuilder };
  messages.push(bot);
  busy = true; abort = new AbortController();
  drawMsgs();
  const build = async (factor) => {
    const ctxTokens = e.state.ctx || 2048;
    const big = !!engine?.state?.model?.external;
    const maxTokens = Math.floor((isBuilder ? Math.min(big ? 4000 : 2000, Math.floor(ctxTokens * 0.45)) : Math.min(big ? 1400 : 700, Math.floor(ctxTokens * 0.3))) * (factor < 1 ? 0.75 : 1));
    const budgetChars = Math.floor((ctxTokens - maxTokens) * 2.4 * factor);
    let sys, lastUser = null;
    if (isBuilder) sys = systemPrompt({ mode: 'builder', context: getAiContext(), facts: [], userName: store.get('user')?.displayName }) + '\n\n' + studioFacts(getAiContext(), Math.floor(budgetChars * 0.6));
    else if (isTutor) sys = systemPrompt({ mode: 'tutor', context: getAiContext(), facts: [], userName: store.get('user')?.displayName }) + '\n\n' + exerciseFacts(getAiContext());
    else {
      const items = await collect(cfg.use);
      const facts = retrieve(items, q + ' ' + messages.slice(-4, -2).map(m => m.content).join(' '), Math.floor(budgetChars * 0.45), { calendarish: isCalendarQuestion(q), page: location.hash });
      bot.sources = (facts.sources || []).slice(0, 4);
      if (asksAboutPage(q) && !pageHost) {   // "forklar det her": Gnist reads the page you are on (what you can see, not hidden parts)
        const pg = document.querySelector('.content .page, .page');
        const seen = pg ? pg.innerText.replace(/\n{2,}/g, '\n').trim().slice(0, Math.max(600, Math.floor(budgetChars * 0.35))) : '';
        if (seen) facts.unshift(`- [Siden brugeren står på] ${document.title.replace(/\s*·\s*HUBTECH$/, '')}:\n${seen}`);
      }
      if (fileNow) facts.unshift(`- [Fil fra brugeren] ${fileNow.name}:\n${fileNow.text.slice(0, Math.max(800, Math.floor(budgetChars * 0.5)))}${fileNow.text.length > budgetChars * 0.5 ? '\n…(resten af filen er skåret fra)' : ''}`);
      // a small model (or a retry because it didn't fit): the short prompt without the example answer
      if (memory == null) { try { memory = ((await getState('gnist')) || {}).memory || []; } catch { memory = []; } }
      sys = systemPrompt({ mode: 'normal', facts: null, userName: store.get('user')?.displayName, style: cfg.style, memory: memoryBlock(memory), compact: factor < 1 || ctxTokens < 3000 });
      lastUser = questionBlock(q, facts, { page: document.title.replace(/\s*·\s*HUBTECH$/, ''), computed: quickFacts(q) });
    }
    // history that fits next to the system prompt
    const hist = [];
    let used = sys.length + (lastUser ? lastUser.length : 0);
    const keep = factor <= 0.25 ? 1 : 12;   // last try: only the question itself
    for (let i = messages.length - 2; i >= 0 && hist.length < keep; i--) {
      const m = messages[i];
      if (m.error) continue;
      const c = m.role === 'assistant' ? parseActions(m.content).text : m.content;
      if (used + c.length > budgetChars && hist.length) break;
      used += c.length; hist.unshift({ role: m.role, content: c });
    }
    if (lastUser && hist.length && hist[hist.length - 1].role === 'user') hist[hist.length - 1] = { role: 'user', content: lastUser };
    return { msgs: [{ role: 'system', content: sys }, ...hist], maxTokens };
  };
  try {
    let shown = 0;
    let looped = false;
    const onToken = (t) => {
      bot.content = t;
      if (!looped && isLooping(t)) { looped = true; abort?.abort(); }   // a small model stuck repeating itself: stop it
      if (t.length - shown > 12 || /\n/.test(t.slice(shown))) { shown = t.length; drawMsgs(); }
    };
    const run = async () => {
      for (const factor of [1, 0.5, 0.25]) {
        const { msgs, maxTokens } = await build(factor);
        try { await e.chat(msgs, { maxTokens, temperature: cfg.temp, signal: abort.signal, onToken }); break; }
        catch (x) { if (x.code !== 'context' || factor === 0.25) throw x; }   // too long: try again with less data
      }
    };
    try { await run(); }
    catch (x) {
      // the model was too big for this device and the engine crashed: Gnist moves to the next smaller model and answers
      const was = MODELS.find(m => m.id === engine?.state?.model?.id) || (x.code === 'crash' ? resolved().model : null);
      const alt = x.code === 'crash' && was ? MODELS.filter(m => m.size < was.size).pop() : null;
      if (!alt) throw x;
      cfg.model = alt.id; saveCfg();
      toast(`${was.name} var for stor til enheden`, { type: 'warn', text: `Gnist skifter til ${alt.name} og svarer igen.` });
      bot.content = ''; looped = false; shown = 0; drawMsgs();
      if (!await start(true)) throw x;
      await run();
    }
    bot.content = tidyAnswer(bot.content);   // repeated lines out
    if (!bot.content.trim()) bot.content = abort.signal.aborted ? '(stoppet)' : 'Jeg har ikke noget svar på det. Prøv at spørge på en anden måde.';
  } catch (x) {
    bot.content = x.message || String(x); bot.error = true;
  } finally {
    bot.streaming = false; busy = false; abort = null;
    persistChat(); drawMsgs();
    archiveChat();   // saved as you go – it shows up in the chat list at once
  }
}
