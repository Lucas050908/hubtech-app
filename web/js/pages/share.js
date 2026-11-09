/** "Del til HUBTECH": text, links and pictures shared from other apps on the phone land here. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { getState, saveState, flushState } from '../core/services.js';
import { query, navigate } from '../core/router.js';
import { toast, stateBlock } from '../core/ui.js';
import { logActivity } from '../core/store.js';
import { esc } from '../features/printing.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Pure: a title and a body from shared text (first line, or the page title for links). */
export function splitShared(text = '', title = '') {
  const t = String(text || '').trim(), given = String(title || '').trim();
  const first = t.split('\n')[0].trim();
  const isLink = /^https?:\/\/\S+$/.test(first);
  if (given) return { title: given.slice(0, 160), body: t };
  if (isLink) { try { const u = new URL(first); return { title: u.hostname.replace(/^www\./, ''), body: t }; } catch { /* */ } }
  if (first.length <= 80 && t.includes('\n')) return { title: first, body: t.slice(t.indexOf('\n') + 1).trim() };
  return { title: first.slice(0, 80) + (first.length > 80 ? '…' : ''), body: t };
}

export default {
  title: 'Del til HUBTECH',
  destroy() { flushState('notes'); flushState('tasks'); },
  render() {
    const q = query();
    const text = q.get('text') || '', image = q.get('image') || '', err = q.get('error');
    if (err) {
      return h('div', { class: 'page' }, stateBlock({ kind: 'error', icon: 'alert', title: err === 'login' ? 'Log ind først' : 'Billedet kunne ikke gemmes',
        text: err === 'login' ? 'Log ind i HUBTECH, og del billedet igen.' : 'Prøv igen – billeder over 15 MB kan ikke deles.', actions: [h('a', { class: 'btn', href: '#/' }, 'Til Hjem')] }));
    }
    if (!text && !image) return h('div', { class: 'page' }, stateBlock({ icon: 'info', title: 'Intet at gemme', text: 'Del tekst, et link eller et billede fra en anden app til HUBTECH.', actions: [h('a', { class: 'btn', href: '#/' }, 'Til Hjem')] }));
    const parts = splitShared(text, q.get('title'));
    const titleIn = h('input', { class: 'input', value: parts.title || (image ? 'Billede' : ''), 'aria-label': 'Titel' });
    const bodyIn = h('textarea', { class: 'textarea', rows: 6, 'aria-label': 'Tekst' }); bodyIn.value = parts.body;
    const done = (msg, path) => { toast(msg, { type: 'ok' }); navigate(path); };
    const asNote = async () => {
      const st = (await getState('notes', { force: true })) || {};
      st.notes ||= [];
      const now = Date.now();
      st.notes.unshift({ id: uid(), title: titleIn.value.trim(), body: bodyIn.value + (image ? `${bodyIn.value ? '\n\n' : ''}Billede: ${location.origin}${image}` : ''), pinned: false, color: '', created: now, updated: now });
      saveState('notes', st); flushState('notes');
      logActivity('notes', 'create', titleIn.value.trim() || 'Note', 'Delt fra en anden app');
      done('Gemt som note', '/apps/notes');
    };
    const asTask = async () => {
      const st = (await getState('tasks', { force: true })) || {};
      st.tasks ||= [];
      const now = Date.now();
      st.tasks.unshift({ id: uid(), title: titleIn.value.trim() || 'Ny opgave', notes: bodyIn.value, status: 'todo', prio: 'med', due: null, project: null, remind: 'none', created: now, updated: now });
      saveState('tasks', st); flushState('tasks');
      done('Opgave oprettet', '/apps/tasks');
    };
    const asDoc = async () => {
      const { createDoc } = await import('../office/store.js');
      const html = `${image ? `<p><img src="${esc(image)}" alt=""></p>` : ''}${bodyIn.value.split('\n').map(l => `<p>${esc(l) || '<br>'}</p>`).join('')}`;
      const d = await createDoc('doc', titleIn.value.trim() || 'Delt fra telefonen', { html }, bodyIn.value.slice(0, 200));
      done('Dokument oprettet', `/apps/hubtech/doc/${d.id}`);
    };
    const btn = (label, ic, fn, primary) => { const b = h('button', { class: ['btn', primary && 'btn-primary'] }, icon(ic), label); b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (e) { toast('Det mislykkedes', { type: 'bad', text: e.message }); b.disabled = false; } }); return b; };
    return h('div', { class: 'page share-page' },
      h('div', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Delt fra en anden app'), h('h1', null, 'Gem i HUBTECH'), h('p', null, 'Vælg, hvor det skal hen. Du kan rette titel og tekst først.'))),
      h('section', { class: 'glass panel share-box' },
        image ? h('img', { class: 'share-img', src: image, alt: 'Det delte billede' }) : null,
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Titel'), titleIn),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tekst'), bodyIn),
        h('div', { class: 'share-actions' },
          btn('Gem som note', 'note', asNote, true),
          btn('Lav en opgave', 'kanban', asTask),
          btn(image ? 'Lav et dokument med billedet' : 'Lav et dokument', 'file', asDoc))));
  },
};
