/** Gnist as her own app: the assistant full screen, with the same conversation as the little window. */
import { h } from '../core/dom.js';
import { gnist } from '../core/icons.js';

export default {
  title: 'Gnist',
  async render() {
    const host = h('div', { class: 'gn-host' });
    const page = h('div', { class: 'page gn-page' },
      h('header', { class: 'gn-head' }, h('span', { class: 'gn-mark' }, gnist(44, { mood: 'wave' })),
        h('div', null, h('h1', { class: 'gn-title' }, 'Gnist'), h('p', { class: 'muted gn-sub' }, 'HUBTECHs AI – kører på din egen enhed. Ctrl+J virker overalt, og samtalen følger med.'))),
      host);
    const m = await import('../ai/panel.js');
    requestAnimationFrame(() => m.mountAssistantPage(host));
    this._stop = () => m.unmountAssistantPage();
    return page;
  },
  destroy() { this._stop?.(); },
};
