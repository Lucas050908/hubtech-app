/**
 * Small shared building blocks for the apps (Printer-doktor, Kommandoer, Tjeklister, the games …):
 * the same panels, code boxes and saving as the rest of HUBTECH.
 */
import { h } from '../core/dom.js';
import { icon, svg } from '../core/icons.js';
import { toast, stateBlock } from '../core/ui.js';
import { getState, saveState, flushState } from '../core/services.js';

export function panel(title, ic, ...children) {
  return h('section', { class: 'glass panel' },
    title ? h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, ic ? icon(ic) : null, title)) : null,
    ...children);
}

export async function copy(text, what = 'Kopieret') {
  try { await navigator.clipboard.writeText(text); toast(what, { type: 'ok', ms: 1400 }); }
  catch { toast('Kunne ikke kopiere', { type: 'bad', text: 'Markér teksten, og kopiér den selv.' }); }
}

export function codeBlock(code) {
  const btn = h('button', { class: 'icon-btn btn-sm code-copy', 'aria-label': 'Kopiér', title: 'Kopiér', html: svg('copy') });
  btn.addEventListener('click', () => copy(code));
  return h('div', { class: 'code-wrap' }, h('pre', { class: 'code' }, code), btn);
}

/** The app's saved data on the account (synced like everything else). Returns a store with save(). */
export async function appState(id, defaults = {}) {
  let data;
  try { data = (await getState(id, { force: true })) || {}; }
  catch (e) { throw Object.assign(new Error(e.message || 'Kunne ikke hentes'), { status: e.status }); }
  const s = { ...structuredClone(defaults), ...data };
  return { data: s, save: () => saveState(id, s), flush: () => flushState(id) };
}

export const loadError = (name, e) => h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: `${name} kunne ikke hentes`, text: e.message }));

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const todayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
