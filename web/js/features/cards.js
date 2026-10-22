/** Playing cards for Kabale and Kasino: deck, values and how a card looks. */
import { h } from '../core/dom.js';

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RANK_DA = { A: 'es', J: 'knægt', Q: 'dame', K: 'konge' };
export const SUIT_DA = { '♠': 'spar', '♥': 'hjerter', '♦': 'ruder', '♣': 'klør' };
export const isRed = (c) => c.s === '♥' || c.s === '♦';
export const rankNo = (c) => RANKS.indexOf(c.r) + 1;

export function deck(n = 1) {
  const d = [];
  for (let k = 0; k < n; k++) for (const s of SUITS) for (const r of RANKS) d.push({ s, r, id: `${k}${s}${r}` });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

export const cardName = (c) => `${SUIT_DA[c.s]} ${RANK_DA[c.r] || c.r}`;

/** A card element. up=false shows the back. */
export function cardEl(c, { up = true, cls: cls0, ...props } = {}) {
  const cls = [cls0].flat(3).filter(Boolean);
  if (!up) return h('div', { class: ['pc', 'is-back', ...cls], 'aria-label': 'Skjult kort', ...props });
  return h('div', { class: ['pc', isRed(c) ? 'is-red' : 'is-black', ...cls], 'aria-label': cardName(c), ...props },
    h('span', { class: 'pc-c tl' }, h('b', null, c.r), h('i', null, c.s)),
    h('span', { class: 'pc-mid' }, c.s),
    h('span', { class: 'pc-c br' }, h('b', null, c.r), h('i', null, c.s)));
}

/** Blackjack value: { total, soft } */
export function bjValue(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { if (c.r === 'A') { aces++; t += 11; } else t += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r); }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
