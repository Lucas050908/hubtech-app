/** Toplister (Kodeudfordringer): report a result and show the list. */
import { h, ava } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast } from '../core/ui.js';

const person = (p) => h('span', { class: 'gr-person' }, h('span', { class: 'avatar avatar-sm' }, ava(p?.avatar)), h('span', null, p?.name || 'Ukendt'));

/** A small leaderboard table. */
export function boardTable(b, { unit = '', fmt = (v) => String(v) } = {}) {
  if (!b?.rows?.length) return h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen resultater endnu – bliv den første på listen!');
  return h('ol', { class: 'lb-list' }, b.rows.map(r => h('li', { class: ['lb-row', r.me && 'is-me', r.place <= 3 && `top${r.place}`] },
    h('span', { class: 'lb-place' }, r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : String(r.place)),
    person(r.user), h('b', { class: 'lb-score' }, `${fmt(r.score)}${unit ? ` ${unit}` : ''}`))));
}

/** Report a result to a leaderboard. Quiet if it fails. */
export async function submitScore(game, score) {
  try {
    const r = await api.post(`/api/games/boards/${game}`, { score: Math.round(score) });
    const mine = r.board.rows.find(x => x.me);
    if (r.record && mine && mine.place <= 3 && r.board.players > 1) toast(`Du er nr. ${mine.place} på toplisten!`, { type: 'xp', action: { label: 'Se listen', onClick: () => { location.hash = '#/apps/codelab'; } } });
    return r;
  } catch { return null; }
}
