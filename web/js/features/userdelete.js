/** Delete another person's account (owner/admin). The username must be typed – it cannot be undone. */
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { modal, toast } from '../core/ui.js';

export function deleteUserDialog(u, onDone) {
  const inp = h('input', { class: 'input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: u.username, 'aria-label': 'Skriv brugernavnet for at bekræfte' });
  const err = h('p', { class: 'field-error', style: { margin: 0 }, 'aria-live': 'polite' });
  const go = h('button', { class: 'btn btn-danger', disabled: true }, icon('trash'), 'Slet kontoen');
  inp.addEventListener('input', () => { go.disabled = inp.value.trim().replace(/^@/, '').toLowerCase() !== u.username.toLowerCase(); err.textContent = ''; });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !go.disabled) go.click(); });
  go.addEventListener('click', async () => {
    go.disabled = true; go.classList.add('is-loading');
    try {
      await api.del(`/api/admin/users/${u.id}`, { confirm: inp.value.trim() });
      m.close();
      toast(`${u.name}s konto er slettet`, { type: 'ok' });
      onDone?.();
    } catch (e) { err.textContent = e.message; go.disabled = false; } finally { go.classList.remove('is-loading'); }
  });
  const m = modal({
    title: `Slet ${u.name}s konto?`, label: 'Kan ikke fortrydes', size: 460,
    body: h('div', { class: 'stack', style: { display: 'grid', gap: '10px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, `Kontoen @${u.username} slettes permanent sammen med alt, der hører til den: beskeder, filer, profilbillede, indstillinger, fremdrift og Office-dokumenter. ${u.name} bliver logget ud med det samme.`),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, h('span', null, 'Skriv '), h('b', { class: 'mono' }, u.username), h('span', null, ' for at bekræfte')), inp),
      err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annullér'), go],
  });
  setTimeout(() => inp.focus(), 60);
}
