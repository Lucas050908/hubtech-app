/**
 * Fart-tast – speed typing with a leaderboard for everyone on this HUBTECH.
 *  Alene:   the server hands out a text and measures the time itself, so the list can't be cheated.
 *  Løb:     race others live – everyone sees each other's progress bar, with a 3-2-1 countdown.
 *  Topliste: the lists for Fart-tast and the other games.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { toast, segmented } from '../core/ui.js';
import { serverNow } from '../core/live.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel } from '../features/appkit.js';
import { lobbyPanel, roomApi, watchRoom, person, me, boardTable, isWatcher } from '../features/gameroom.js';

/** A typing box: the text with right/wrong letters, a hidden input, and live speed. */
function typingBox(text, { onFirst, onChange, onDone, startAt = null }) {
  const textEl = h('div', { class: 'ty-text', 'aria-hidden': 'true' });
  const input = h('textarea', { class: 'ty-input', rows: 2, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Skriv teksten her' });
  const wpmEl = h('b', null, '0'), errEl = h('b', null, '0'), timeEl = h('b', null, '0,0');
  let t0 = startAt, errors = 0, prev = '', done = false, iv = 0;
  const chars = [...text].map(ch => h('span', null, ch));
  textEl.append(...chars);
  const paint = (v) => {
    chars.forEach((s, i) => { s.className = i < v.length ? (v[i] === text[i] ? 'ok' : 'bad') : i === v.length ? 'cur' : ''; });
  };
  const tick = () => {
    if (!t0) return;
    const secs = Math.max(0.1, (Date.now() - t0) / 1000);
    let right = 0; while (right < input.value.length && input.value[right] === text[right]) right++;
    wpmEl.textContent = String(Math.round(right / 5 / (secs / 60)));
    timeEl.textContent = secs.toFixed(1).replace('.', ',');
  };
  input.addEventListener('input', () => {
    if (done) return;
    const v = input.value.replace(/\n/g, ' ');
    if (v !== input.value) input.value = v;
    if (!t0) { t0 = Date.now(); onFirst?.(); }
    if (!iv) iv = setInterval(() => { if (!document.body.contains(input)) return clearInterval(iv); tick(); }, 200);
    if (v.length > prev.length && v[v.length - 1] !== text[v.length - 1]) { errors++; errEl.textContent = String(errors); }
    prev = v; paint(v); tick();
    onChange?.(v, errors);
    if (v === text) { done = true; clearInterval(iv); input.disabled = true; onDone?.(v, errors, (Date.now() - t0) / 1000); }
  });
  input.addEventListener('paste', (e) => { e.preventDefault(); toast('Det er snyd at indsætte tekst 😉', { type: 'warn' }); });
  input.addEventListener('drop', (e) => e.preventDefault());
  paint('');
  const box = h('div', { class: 'ty-box', onclick: () => input.focus() }, textEl, input);
  return { el: h('div', null, box, h('div', { class: 'ty-live' }, h('span', null, wpmEl, ' ord/min'), h('span', null, errEl, ' fejl'), h('span', null, timeEl, ' sek.'))),
    input, focus: () => input.focus(), lock: (on) => { input.disabled = on; }, setStart: (t) => { t0 = t; } };
}

/** Dagens ord: guesses × 1000 + seconds */
const ordFmt = (v) => { const s = v % 1000; return `${Math.floor(v / 1000)} gæt · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export default {
  title: 'Fart-tast',
  destroy() { this._off?.(); clearInterval(this._cd); this._unwatch?.(); },
  async render(ctx) {
    const app = appById('typerace');
    const self = this;
    const body = h('div', { class: 'stack' });
    const first = ['solo', 'online', 'top'].includes(ctx?.params?.sub) ? ctx.params.sub : 'solo';

    // ── alone ──
    async function solo() {
      const wrap = h('div', { class: 'stack' });
      const boardBox = h('div');
      const loadBoard = () => api.get('/api/games/boards/typing').then(b => h(clear(boardBox), null, boardTable(b, { unit: 'ord/min' }))).catch(() => {});
      async function round() {
        clear(wrap).append(h('p', { class: 'faint' }, 'Henter en tekst …'));
        let run;
        try { run = await api.post('/api/games/typing', {}); } catch (e) { clear(wrap).append(h('p', { class: 'faint' }, e.message)); return; }
        const result = h('div');
        const tb = typingBox(run.text, {
          onFirst: () => api.post(`/api/games/typing/${run.token}/go`, {}).catch(() => {}),
          onDone: async (typed, errors) => {
            try {
              const r = await api.post(`/api/games/typing/${run.token}/finish`, { typed, errors });
              const mine = r.board.rows.find(x => x.me);
              h(clear(result), null, h('div', { class: ['ty-result', r.counted && 'is-ok'] },
                h('div', null, h('b', null, String(r.wpm)), h('span', null, 'ord pr. minut')),
                h('div', null, h('b', null, `${r.accuracy} %`), h('span', null, 'rigtige tryk')),
                h('div', null, h('b', null, `${String(r.secs).replace('.', ',')} s`), h('span', null, 'tid')),
                h('div', null, h('b', null, mine ? `#${mine.place}` : '–'), h('span', null, r.counted ? (r.record ? 'Ny personlig rekord!' : `Din rekord: ${r.best}`) : (r.why || 'Tæller ikke'))),
                h('button', { class: 'btn btn-primary', onclick: round }, icon('refresh'), 'En gang til')));
              if (r.record && r.counted) toast('Ny rekord!', { type: 'xp', text: `${r.wpm} ord i minuttet` });
              h(clear(boardBox), null, boardTable(r.board, { unit: 'ord/min' }));
            } catch (e) { toast('Resultatet kunne ikke gemmes', { type: 'bad', text: e.message }); }
          },
        });
        h(clear(wrap), null, panel('Skriv teksten så hurtigt du kan', 'timer', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Uret starter ved første tast. Fejl skal rettes, før du kan komme videre – teksten skal være helt rigtig.'), tb.el, result));
        setTimeout(() => tb.focus(), 50);
      }
      round(); loadBoard();
      return [wrap, panel('Topliste – Fart-tast', 'trophy', boardBox)];
    }

    // ── race ──
    function online() {
      const box = h('div', { class: 'stack' });
      let room = null, tb = null, sendT = 0, lastSent = '', barsEl = null;
      const openRoom = (r) => {
        self._off?.(); clearInterval(self._cd); room = r; tb = null;
        self._unwatch?.(); self._unwatch = null;
        if (r && isWatcher(r)) { const id = r.id; self._unwatch = () => roomApi.unwatch(id); }
        if (!r) { history.replaceState(null, '', '#/apps/typerace/online'); return draw(); }
        history.replaceState(null, '', `#/apps/typerace/online/${r.id}`);
        self._off = watchRoom(r.id, (nr) => { if (!nr) { toast('Løbet er lukket', { type: 'info' }); room = null; self._off?.(); draw(); return; } const restart = room?.state?.text !== nr.state.text;
          const same = !restart && barsEl && document.body.contains(barsEl) && nr.state.start && nr.state.start === room?.state?.start && nr.status === room?.status
            && !!nr.state.progress[String(me())]?.done === !!room.state.progress[String(me())]?.done;
          room = nr;
          if (same) { const b = bars(); barsEl.replaceWith(b); barsEl = b; return; }   // only the bars change – keep the typing box (and focus) as it is
          if (restart) tb = null; draw(); });
        draw();
      };
      const send = (typed, errors, now) => {
        if (!room || (!now && Date.now() - sendT < 350) || typed === lastSent) return;
        sendT = Date.now(); lastSent = typed;
        roomApi.progress(room.id, typed, errors).catch(() => {});
      };
      function bars() {
        const S = room.state, len = S.text.length;
        return h('div', { class: 'tr-bars' }, room.players.map(p => {
          const pr = S.progress[String(p.id)] || { pos: 0, wpm: 0 };
          return h('div', { class: ['tr-bar', p.id === me() && 'is-me', pr.done && 'is-done'] },
            person(p), h('div', { class: 'tr-track' }, h('i', { style: { width: `${Math.round(pr.pos / len * 100)}%` } }, h('span', { class: 'tr-car' }, pr.done ? '🏁' : '🏎️'))),
            h('b', null, pr.done ? `#${pr.place} · ${pr.wpm}` : `${pr.wpm}`), h('small', { class: 'faint' }, 'ord/min'));
        }));
      }
      function draw() {
        clear(box);
        if (!room) { box.append(lobbyPanel({ game: 'typing', multi: true, title: 'Løb mod andre', text: 'Invitér en eller flere (op til 7). Når de er med, trykker du Start – så får alle den samme tekst med nedtælling, og I kan se hinandens fart live.', onOpen: openRoom })); return; }
        const S = room.state, host = room.host === me();
        const watcher = isWatcher(room);
        const head = h('div', { class: 'row-actions', style: { marginTop: 0 } }, h('button', { class: 'btn btn-sm', onclick: () => openRoom(null) }, icon('arrowLeft'), 'Alle løb'),
          watcher ? h('span', { class: 'chip' }, icon('eye'), 'Du ser med')
            : h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await roomApi.leave(room.id).catch(() => {}); openRoom(null); } }, icon('x'), 'Forlad'));
        if (!S.start) {
          const waiting = room.invited.length ? `Venter på: ${room.invited.map(p => p.name).join(', ')}` : '';
          box.append(panel('Klar til start', 'users', head, h('div', { class: 'tr-lobby' }, room.players.map(p => person(p, h('span', { class: 'chip chip-ok' }, 'Klar'))), room.invited.map(p => person(p, h('span', { class: 'chip' }, 'Inviteret')))),
            waiting ? h('p', { class: 'faint' }, waiting) : null,
            watcher ? h('p', { class: 'muted' }, 'Du ser med. Løbet starter, når værten trykker Start.') : host ? h('button', { class: 'btn btn-primary btn-lg', disabled: room.players.length < 2, onclick: async () => { try { room = await roomApi.start(room.id); draw(); } catch (e) { toast(e.message, { type: 'warn' }); } } }, icon('play'), room.players.length < 2 ? 'Venter på, at nogen er med' : 'Start løbet')
              : h('p', { class: 'muted' }, `${room.players.find(p => p.id === room.host)?.name || 'Værten'} starter løbet, når alle er klar.`)));
          return;
        }
        const left = () => Math.ceil((S.start - serverNow()) / 1000);
        const cd = h('div', { class: 'tr-countdown', 'aria-live': 'assertive' });
        if (!tb) {
          tb = typingBox(S.text, { startAt: null, onChange: (v, e) => send(v, e), onDone: (v, e) => send(v, e, true) });
          tb.lock(true);
        }
        const mineP = S.progress[String(me())];
        const isIn = room.players.some(p => p.id === me());
        const results = room.status === 'done' ? h('div', { class: 'row-actions' },
          host ? h('button', { class: 'btn btn-primary', onclick: async () => { try { await roomApi.rematch(room.id); } catch (e) { toast(e.message, { type: 'warn' }); } } }, icon('refresh'), 'Nyt løb') : h('span', { class: 'faint' }, 'Værten kan starte et nyt løb.')) : null;
        barsEl = bars();
        box.append(panel(room.status === 'done' ? 'Løbet er slut' : 'Løbet', 'timer', head, barsEl, cd, isIn && !mineP?.done ? tb.el : null,
          mineP?.done ? h('p', { class: 'tr-me' }, icon('trophy'), `Du kom ind som nr. ${mineP.place} med ${mineP.wpm} ord i minuttet.`) : null, results));
        clearInterval(self._cd);
        const step = () => {
          const l = left();
          if (l > 0) { cd.textContent = String(l); cd.hidden = false; tb.lock(true); }
          else { cd.hidden = true; clearInterval(self._cd); if (!mineP?.done && room.status === 'playing') { tb.lock(false); tb.setStart(Date.now() - (serverNow() - S.start)); if (document.activeElement !== tb.input) tb.focus(); } }
        };
        step(); self._cd = setInterval(step, 200);
      }
      if (ctx?.params?.id) roomApi.get(ctx.params.id).then(async r => openRoom(r.players.some(p => p.id === me()) ? r : await roomApi.join(r.id).catch(() => r)))
        .catch(() => roomApi.watch(ctx.params.id).then(openRoom).catch(() => openRoom(null)));
      else draw();
      return [box];
    }

    // ── all leaderboards ──
    async function top() {
      const out = h('div', { class: 'lb-grid' });
      try {
        const { boards } = await api.get('/api/games/boards');
        const fmt = (b) => (b.game.startsWith('daily-ord-') ? ordFmt : b.higher ? (v) => v.toLocaleString('da-DK') : (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`);
        const unit = (b) => (b.game === 'typing' ? 'ord/min' : b.game === 'snake' || b.game === 'game2048' ? 'point' : '');
        for (const b of boards) out.append(panel(b.label, b.game === 'typing' ? 'timer' : 'trophy', h('p', { class: 'faint', style: { marginTop: 0 } }, `${b.players} ${b.players === 1 ? 'spiller' : 'spillere'} · ${b.game.startsWith('daily-ord-') ? 'færrest gæt' : b.higher ? 'højest' : 'hurtigst'} vinder`), boardTable(b, { unit: unit(b), fmt: fmt(b) })));
      } catch (e) { out.append(h('p', { class: 'faint' }, e.message)); }
      return [h('p', { class: 'muted', style: { margin: 0 } }, 'Alle på denne HUBTECH er med. Dit bedste resultat i hvert spil tæller.'), out];
    }

    const TABS = { solo, online, top };
    const open = async (id) => {
      self._off?.(); clearInterval(self._cd);
      history.replaceState(null, '', `#/apps/typerace${id === 'solo' ? '' : `/${id}`}`);
      const parts = await TABS[id]();
      h(clear(body), null, parts);
    };
    const seg = segmented([{ value: 'solo', label: 'Alene', icon: 'timer' }, { value: 'online', label: 'Løb mod andre', icon: 'users' }, { value: 'top', label: 'Topliste', icon: 'trophy' }], first, open, { label: 'Vælg' });
    if (first === 'online' && ctx?.params?.id) h(clear(body), null, online()); else open(first);
    return h('div', { class: 'page gm-page tr-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'Spilhal', title: 'Fart-tast', lead: 'Hvor hurtigt kan du skrive? Kør alene mod uret, eller løb mod de andre på HUBTECH – og kom på toplisten.', compact: true }),
      h('div', { class: 'cmd-filters', style: { margin: '16px 0' } }, seg), body);
  },
};
