/** Gnist as her own app: the assistant full screen, with your chats on the left – the same conversation as the little window. */
import { h, clear } from '../core/dom.js';
import { gnist, icon } from '../core/icons.js';

export default {
  title: 'Gnist',
  async render() {
    const host = h('div', { class: 'gn-host' });
    const side = h('aside', { class: 'gn-side glass', 'aria-label': 'Dine chats' });
    const m = await import('../ai/panel.js');
    const when = (at) => { const d = new Date(at), t = new Date(); return d.toDateString() === t.toDateString() ? d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }); };
    const drawSide = async () => {
      const { chats, current } = await m.chatList();
      h(clear(side), null,
        h('div', { class: 'gn-brand' }, h('span', { class: 'gn-mark' }, gnist(30, { mood: 'wave' })), h('div', null, h('b', null, 'Gnist'), h('small', { class: 'faint' }, m.runsWhere().short))),
        h('button', { type: 'button', class: 'btn btn-primary gn-newchat', onclick: () => m.newChat() }, icon('plus'), 'Ny chat'),
        h('div', { class: 'gn-side-h faint' }, 'Dine chats'),
        chats.length ? h('ul', { class: 'gn-chats' }, chats.map(c => h('li', { class: c.id === current ? 'is-on' : null },
          h('button', { type: 'button', class: 'gn-chat', 'aria-current': c.id === current ? 'true' : null, onclick: () => m.openChat(c.id) }, h('span', { class: 'gn-chat-t' }, c.title), h('span', { class: 'faint' }, when(c.at))),
          h('button', { type: 'button', class: 'icon-btn btn-sm', 'aria-label': `Slet chatten "${c.title}"`, onclick: () => m.deleteChat(c.id) }, icon('trash')))))
          : h('p', { class: 'faint gn-side-empty' }, 'Dine chats gemmes her, mens du skriver. Gnist kan også slå op i dem senere.'));
    };
    const page = h('div', { class: 'page gn-page' },
      h('h1', { class: 'sr-only' }, 'Gnist – HUBTECHs AI'),
      h('div', { class: 'gn-layout' }, side, host));
    requestAnimationFrame(() => m.mountAssistantPage(host));
    drawSide();
    const off = m.onChatsChanged(drawSide);
    this._stop = () => { off(); m.unmountAssistantPage(); };
    return page;
  },
  destroy() { this._stop?.(); },
};
