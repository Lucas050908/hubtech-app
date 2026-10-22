/**
 * Hardwaretest – what a servicetekniker checks on a computer or phone: keyboard, screen (dead pixels),
 * speakers left/right, microphone, camera, mouse and touch, plus basic system info. Ends with a report to copy.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, copy } from '../features/appkit.js';

// Danish ISO keyboard by KeyboardEvent.code: [code, label, width]
const K = (code, label, w = 1) => [code, label, w];
const ROWS = [
  [K('Escape', 'Esc', 1.25), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => K(`F${n}`, `F${n}`)), K('Delete', 'Del', 1.25)],
  [K('Backquote', '½'), ...'1234567890'.split('').map(d => K(`Digit${d}`, d)), K('Minus', '+'), K('Equal', '´'), K('Backspace', '⌫', 2)],
  [K('Tab', 'Tab', 1.5), ...'QWERTYUIOP'.split('').map(l => K(`Key${l}`, l)), K('BracketLeft', 'Å'), K('BracketRight', '¨'), K('Enter', 'Enter', 1.5)],
  [K('CapsLock', 'Caps', 1.75), ...'ASDFGHJKL'.split('').map(l => K(`Key${l}`, l)), K('Semicolon', 'Æ'), K('Quote', 'Ø'), K('Backslash', "'"), K('Enter', '', 1.25)],
  [K('ShiftLeft', 'Shift', 1.25), K('IntlBackslash', '<'), ...'ZXCVBNM'.split('').map(l => K(`Key${l}`, l)), K('Comma', ','), K('Period', '.'), K('Slash', '-'), K('ShiftRight', 'Shift', 2.75)],
  [K('ControlLeft', 'Ctrl', 1.5), K('MetaLeft', 'Win', 1.25), K('AltLeft', 'Alt', 1.25), K('Space', '', 6), K('AltRight', 'Alt Gr', 1.25), K('ContextMenu', '☰'), K('ControlRight', 'Ctrl', 1.25),
    K('ArrowLeft', '←'), K('ArrowUp', '↑'), K('ArrowDown', '↓'), K('ArrowRight', '→')],
];
const ALL_KEYS = new Set(ROWS.flat().map(k => k[0])).size;
const SCREEN_COLORS = [['#000000', 'Sort – lyse prikker er “stuck” pixels'], ['#ffffff', 'Hvid – mørke prikker er døde pixels'], ['#ff0000', 'Rød'], ['#00ff00', 'Grøn'], ['#0000ff', 'Blå'],
  ['linear-gradient(90deg,#000,#fff)', 'Gradient – striber betyder dårlig farvegengivelse'], ['repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/8px 8px', 'Skakternet – flimmer eller moiré']];

export default {
  title: 'Hardwaretest',
  destroy() { this._stop?.(); removeEventListener('keydown', this._k, true); removeEventListener('keyup', this._ku, true); },
  async render() {
    const app = appById('hwtest');
    const self = this;
    const results = {};   // test → 'ok' | 'bad'
    let streams = [], audio = null, raf = 0;
    const stopMedia = () => { streams.forEach(s => s.getTracks().forEach(t => t.stop())); streams = []; cancelAnimationFrame(raf); try { audio?.close(); } catch {} audio = null; };
    this._stop = stopMedia;
    const body = h('div', { class: 'hw-body' });
    const report = h('div', { class: 'hw-report' });

    const verdict = (id, label) => {
      const wrap = h('div', { class: 'hw-verdict' }, h('span', { class: 'faint' }, label || 'Virker det?'));
      const set = (v) => { results[id] = v; wrap.querySelectorAll('button').forEach(b => b.classList.toggle('btn-primary', b.dataset.v === v)); drawReport(); };
      wrap.append(h('button', { class: ['btn btn-sm', results[id] === 'ok' && 'btn-primary'], dataset: { v: 'ok' }, onclick: () => set('ok') }, icon('check'), 'Ja'),
        h('button', { class: ['btn btn-sm', results[id] === 'bad' && 'btn-primary'], dataset: { v: 'bad' }, onclick: () => set('bad') }, icon('x'), 'Nej, fejl'));
      return wrap;
    };

    // ── info ──
    async function info() {
      const rows = [
        ['Skærm', `${screen.width} × ${screen.height} (skalering ${Math.round(devicePixelRatio * 100)} %)`],
        ['Vindue', `${innerWidth} × ${innerHeight}`],
        ['Processorkerner', navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : 'Ukendt'],
        ['Hukommelse', navigator.deviceMemory ? `Mindst ${navigator.deviceMemory} GB` : 'Vises ikke i denne browser'],
        ['Touchskærm', navigator.maxTouchPoints > 0 ? `Ja (${navigator.maxTouchPoints} punkter)` : 'Nej'],
        ['Sprog', navigator.language || '–'],
        ['Netværk', navigator.onLine ? (navigator.connection?.effectiveType ? `Online (${navigator.connection.effectiveType}${navigator.connection.downlink ? `, ca. ${navigator.connection.downlink} Mbit/s` : ''})` : 'Online') : 'Offline'],
        ['Browser', navigator.userAgent],
      ];
      try {
        const b = await navigator.getBattery?.();
        if (b) rows.splice(5, 0, ['Batteri', `${Math.round(b.level * 100)} %${b.charging ? ' – oplader' : ''}`]);
      } catch {}
      results.info = rows;
      return panel('Systeminfo', 'info', h('div', { class: 'hw-info' }, rows.map(([k, v]) => h('div', { class: 'hw-kv' }, h('span', { class: 'faint' }, k), h('b', null, v)))),
        h('p', { class: 'faint', style: { marginBottom: 0 } }, 'Browseren viser ikke alt (fx serienummer og disk). Brug kommandoen “systeminfo” eller “wmic bios get serialnumber” i Kommandoer.'));
    }

    // ── keyboard ──
    function keyboard() {
      const seen = new Set();
      const kb = h('div', { class: 'hw-kb' }, ROWS.map(r => h('div', { class: 'hw-kb-row' }, r.map(([code, label, w]) => h('span', { class: 'hw-key', dataset: { code }, style: { flex: `${w} 1 0` } }, label)))));
      const count = h('b', null, `0 / ${ALL_KEYS}`), last = h('code', { class: 'hw-last' }, 'Tryk på en tast …');
      self._k = (e) => {
        if (!document.body.contains(kb)) return;
        if (!(e.ctrlKey && ['KeyR', 'KeyW', 'Tab'].includes(e.code)) && e.code !== 'F5' && e.code !== 'F12') e.preventDefault();
        const code = e.code === 'NumpadEnter' ? 'Enter' : e.code;
        kb.querySelectorAll(`[data-code="${CSS.escape(code)}"]`).forEach(k => k.classList.add('is-down', 'is-ok'));
        seen.add(code); count.textContent = `${[...seen].filter(c => ROWS.flat().some(k => k[0] === c)).length} / ${ALL_KEYS}`;
        last.textContent = `${e.key === ' ' ? 'Mellemrum' : e.key}  ·  ${e.code}`;
      };
      self._ku = (e) => { const code = e.code === 'NumpadEnter' ? 'Enter' : e.code; kb.querySelectorAll(`[data-code="${CSS.escape(code)}"]`).forEach(k => k.classList.remove('is-down')); };
      addEventListener('keydown', self._k, true); addEventListener('keyup', self._ku, true);
      return panel('Tastatur', 'grid', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Tryk på alle tasterne én ad gangen. De bliver grønne, når computeren har modtaget dem. En tast, der ikke bliver grøn, virker ikke (eller har en anden kode på dette tastatur).'),
        h('div', { class: 'hw-kb-scroll' }, kb), h('div', { class: 'hw-row' }, h('span', null, 'Testet ', count), last,
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { seen.clear(); kb.querySelectorAll('.hw-key').forEach(k => k.classList.remove('is-ok', 'is-down')); count.textContent = `0 / ${ALL_KEYS}`; } }, icon('refresh'), 'Nulstil')),
        verdict('keyboard', 'Virker alle taster?'));
    }

    // ── screen ──
    function screenTest() {
      const start = (i0 = 0) => {
        let i = i0;
        const label = h('span', { class: 'hw-fs-label' });
        const fs = h('div', { class: 'hw-fs', tabindex: 0, role: 'dialog', 'aria-label': 'Skærmtest i fuld skærm' }, label);
        const show = () => { fs.style.background = SCREEN_COLORS[i][0]; label.textContent = `${SCREEN_COLORS[i][1]} · klik for næste · Esc for at stoppe`; label.classList.remove('is-hidden'); clearTimeout(fs._t); fs._t = setTimeout(() => label.classList.add('is-hidden'), 2200); };
        const close = () => { fs.remove(); document.exitFullscreen?.().catch(() => {}); removeEventListener('keydown', key, true); };
        const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); i = (i + 1) % SCREEN_COLORS.length; show(); } else if (e.key === 'ArrowLeft') { i = (i + SCREEN_COLORS.length - 1) % SCREEN_COLORS.length; show(); } };
        fs.addEventListener('click', () => { i++; if (i >= SCREEN_COLORS.length) close(); else show(); });
        addEventListener('keydown', key, true);
        document.body.append(fs); fs.focus(); show();
        fs.requestFullscreen?.().catch(() => {});
      };
      return panel('Skærm', 'monitor', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Skærmen fyldes med én farve ad gangen. Kig efter prikker, der har en anden farve, lyse kanter (lysudslip) eller striber. Klik eller tryk for næste farve.'),
        h('div', { class: 'hw-swatches' }, SCREEN_COLORS.map(([c, l], i) => h('button', { class: 'hw-swatch', style: { background: c }, title: l, 'aria-label': `Start med ${l.split(' –')[0]}`, onclick: () => start(i) }))),
        h('button', { class: 'btn btn-primary', onclick: () => start(0) }, icon('screen'), 'Start skærmtest'),
        verdict('screen', 'Er skærmen fejlfri?'));
    }

    // ── sound ──
    function sound() {
      const ctx = () => (audio ||= new (window.AudioContext || window.webkitAudioContext)());
      const tone = (pan, freq = 440, secs = 0.9) => {
        const a = ctx(), o = a.createOscillator(), g = a.createGain(), p = a.createStereoPanner ? a.createStereoPanner() : null;
        o.frequency.value = freq; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + secs);
        if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(a.destination); } else o.connect(g).connect(a.destination);
        o.start(); o.stop(a.currentTime + secs + 0.05);
      };
      const sweep = () => { const a = ctx(), o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(80, a.currentTime); o.frequency.exponentialRampToValueAtTime(12000, a.currentTime + 6); g.gain.value = 0.12; o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 6); };
      return panel('Højttalere og hovedtelefoner', 'volume', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Lyden skal komme fra den side, der står på knappen. Er venstre og højre byttet om, eller kommer der intet fra den ene side, er der fejl på højttaler, kabel eller stik.'),
        h('div', { class: 'hw-btns' },
          h('button', { class: 'btn', onclick: () => tone(-1) }, icon('arrowLeft'), 'Venstre'),
          h('button', { class: 'btn', onclick: () => tone(0) }, icon('volume'), 'Begge'),
          h('button', { class: 'btn', onclick: () => tone(1) }, 'Højre', icon('arrowRight')),
          h('button', { class: 'btn btn-ghost', onclick: sweep }, icon('music'), 'Frekvens-sweep (6 sek.)')),
        h('p', { class: 'faint' }, 'Sweepet går fra dyb bas til høj diskant. Skrattende lyd undervejs tyder på en defekt højttaler.'),
        verdict('sound', 'Kommer lyden rigtigt ud?'));
    }

    // ── microphone ──
    function mic() {
      const bar = h('i'), peak = h('b', null, '–'), out = h('div', { class: 'hw-media' });
      const meter = h('div', { class: 'hw-meter', role: 'meter', 'aria-label': 'Lydniveau', 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar);
      const btn = h('button', { class: 'btn btn-primary' }, icon('mic'), 'Start mikrofonen');
      btn.addEventListener('click', async () => {
        stopMedia();
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true }); streams.push(s);
          const a = (audio = new (window.AudioContext || window.webkitAudioContext)()), an = a.createAnalyser(); an.fftSize = 1024;
          a.createMediaStreamSource(s).connect(an);
          const buf = new Uint8Array(an.fftSize); let max = 0;
          const tick = () => {
            if (!document.body.contains(meter)) return stopMedia();
            an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
            const lvl = Math.min(100, Math.round(Math.sqrt(sum / buf.length) * 300)); max = Math.max(max, lvl);
            bar.style.width = `${lvl}%`; meter.setAttribute('aria-valuenow', lvl); peak.textContent = `${max} %`;
            raf = requestAnimationFrame(tick);
          };
          tick();
          btn.replaceChildren(icon('refresh'), 'Start igen');
          clear(out).append(h('span', { class: 'faint' }, `Bruger: ${s.getAudioTracks()[0]?.label || 'standardmikrofonen'}`));
        } catch (e) {
          clear(out).append(h('p', { class: 'hw-err' }, icon('alert'), e.name === 'NotFoundError' ? 'Der er ingen mikrofon på denne enhed.' : 'Mikrofonen er ikke tilladt.'));
          if (e.name === 'NotAllowedError' || e.name === 'SecurityError') import('../features/mediahelp.js').then(m => m.showMediaHelp('mic')).catch(() => {});
        }
      });
      return panel('Mikrofon', 'mic', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Sig noget, eller klap. Bjælken skal hoppe, når du taler, og stå næsten stille, når der er stille.'),
        btn, meter, h('div', { class: 'hw-row' }, h('span', null, 'Højeste niveau ', peak), out), verdict('mic', 'Reagerer mikrofonen?'));
    }

    // ── camera ──
    function camera() {
      const video = h('video', { class: 'hw-video', autoplay: true, muted: true, playsinline: true });
      const sel = h('select', { class: 'select', 'aria-label': 'Kamera', hidden: true });
      const out = h('div', { class: 'hw-media' });
      const startCam = async (deviceId) => {
        stopMedia();
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 1920 } } }); streams.push(s);
          video.srcObject = s;
          const t = s.getVideoTracks()[0], set = t.getSettings?.() || {};
          clear(out).append(h('span', { class: 'faint' }, `${t.label || 'Kamera'} · ${set.width || '?'} × ${set.height || '?'}${set.frameRate ? ` · ${Math.round(set.frameRate)} billeder/sek.` : ''}`));
          const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
          if (cams.length > 1) { clear(sel); cams.forEach((c, i) => sel.append(h('option', { value: c.deviceId, selected: c.deviceId === set.deviceId }, c.label || `Kamera ${i + 1}`))); sel.hidden = false; }
        } catch (e) {
          clear(out).append(h('p', { class: 'hw-err' }, icon('alert'), e.name === 'NotFoundError' ? 'Der er intet kamera på denne enhed.' : 'Kameraet er ikke tilladt.'));
          if (e.name === 'NotAllowedError' || e.name === 'SecurityError') import('../features/mediahelp.js').then(m => m.showMediaHelp('cam')).catch(() => {});
        }
      };
      sel.addEventListener('change', () => startCam(sel.value));
      return panel('Kamera', 'camera', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Billedet skal være skarpt og uden striber. Tjek også, at lampen ved kameraet lyser.'),
        h('div', { class: 'hw-btns' }, h('button', { class: 'btn btn-primary', onclick: () => startCam() }, icon('camera'), 'Start kameraet'), sel,
          h('button', { class: 'btn btn-ghost', onclick: () => { stopMedia(); video.srcObject = null; } }, icon('x'), 'Stop')),
        video, out, verdict('camera', 'Virker kameraet?'));
    }

    // ── mouse & touch ──
    function pointer() {
      const btns = { 0: h('span', { class: 'hw-mb' }, 'Venstre'), 1: h('span', { class: 'hw-mb' }, 'Midt / hjul'), 2: h('span', { class: 'hw-mb' }, 'Højre'), 3: h('span', { class: 'hw-mb' }, 'Tilbage'), 4: h('span', { class: 'hw-mb' }, 'Frem') };
      const scroll = h('b', null, '0'), dbl = h('b', null, '0'), touches = h('b', null, '0');
      let sc = 0, db = 0, maxT = 0;
      const pad = h('div', { class: 'hw-pad', tabindex: 0, 'aria-label': 'Testfelt til mus og touch' }, h('span', { class: 'faint' }, 'Klik, rul og tryk her'));
      const dots = new Map();
      pad.addEventListener('contextmenu', e => e.preventDefault());
      pad.addEventListener('mousedown', (e) => { e.preventDefault(); btns[e.button]?.classList.add('is-down', 'is-ok'); });
      pad.addEventListener('mouseup', (e) => btns[e.button]?.classList.remove('is-down'));
      pad.addEventListener('auxclick', e => e.preventDefault());
      pad.addEventListener('dblclick', () => { dbl.textContent = String(++db); });
      pad.addEventListener('wheel', (e) => { e.preventDefault(); sc += Math.sign(e.deltaY); scroll.textContent = `${sc > 0 ? '↓' : sc < 0 ? '↑' : ''} ${Math.abs(sc)}`; }, { passive: false });
      pad.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; const d = h('i', { class: 'hw-dot' }); pad.append(d); dots.set(e.pointerId, d); maxT = Math.max(maxT, dots.size); touches.textContent = String(maxT); move(e); });
      const move = (e) => { const d = dots.get(e.pointerId); if (!d) return; const r = pad.getBoundingClientRect(); d.style.left = `${e.clientX - r.left}px`; d.style.top = `${e.clientY - r.top}px`; };
      pad.addEventListener('pointermove', move);
      const end = (e) => { dots.get(e.pointerId)?.remove(); dots.delete(e.pointerId); };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      return panel('Mus, touchpad og touchskærm', 'target', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Klik med alle knapper, rul med hjulet og dobbeltklik i feltet. På en touchskærm: sæt flere fingre på samtidig.'),
        h('div', { class: 'hw-mbs' }, Object.values(btns)), pad,
        h('div', { class: 'hw-row' }, h('span', null, 'Rul ', scroll), h('span', null, 'Dobbeltklik ', dbl), h('span', null, 'Flest fingre ', touches)),
        verdict('pointer', 'Virker mus / touch?'));
    }

    const TESTS = { info: ['Info', 'info', info], keyboard: ['Tastatur', 'grid', keyboard], screen: ['Skærm', 'monitor', screenTest], sound: ['Lyd', 'volume', sound], mic: ['Mikrofon', 'mic', mic], camera: ['Kamera', 'camera', camera], pointer: ['Mus og touch', 'target', pointer] };
    const NAMES = { keyboard: 'Tastatur', screen: 'Skærm', sound: 'Lyd', mic: 'Mikrofon', camera: 'Kamera', pointer: 'Mus / touch' };
    async function open(id) {
      stopMedia(); removeEventListener('keydown', self._k, true); removeEventListener('keyup', self._ku, true);
      clear(body).append(await TESTS[id][2]());
    }
    function reportText() {
      const d = new Date().toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
      const lines = [`Hardwaretest ${d}`, ''];
      for (const [k, n] of Object.entries(NAMES)) lines.push(`${n}: ${results[k] === 'ok' ? 'OK' : results[k] === 'bad' ? 'FEJL' : 'ikke testet'}`);
      if (Array.isArray(results.info)) { lines.push(''); results.info.filter(([k]) => k !== 'Browser').forEach(([k, v]) => lines.push(`${k}: ${v}`)); }
      return lines.join('\n');
    }
    function drawReport() {
      clear(report).append(h('div', { class: 'hw-chips' }, Object.entries(NAMES).map(([k, n]) => h('span', { class: ['chip', results[k] === 'ok' && 'chip-ok', results[k] === 'bad' && 'chip-bad'] }, icon(results[k] === 'ok' ? 'check' : results[k] === 'bad' ? 'x' : 'clock'), n))),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', onclick: () => copy(reportText(), 'Rapporten er kopieret') }, icon('copy'), 'Kopiér rapport'),
          h('button', { class: 'btn btn-sm', onclick: saveNote }, icon('note'), 'Gem som servicenote')));
    }
    async function saveNote() {
      try {
        const { getState, saveState, flushState } = await import('../core/services.js');
        const s = (await getState('notes', { force: true })) || {};
        const notes = Array.isArray(s.notes) ? s.notes : [];
        const now = Date.now();
        notes.unshift({ id: Math.random().toString(36).slice(2, 10), title: `Hardwaretest ${new Date().toLocaleDateString('da-DK')}`, body: reportText(), pinned: false, color: '', created: now, updated: now });
        await saveState('notes', { ...s, notes }); await flushState('notes');
        toast('Gemt i Noter', { type: 'ok', action: { label: 'Åbn Noter', onClick: () => { location.hash = '#/apps/notes'; } } });
      } catch (e) { toast('Kunne ikke gemme noten', { type: 'bad', text: e.message }); }
    }
    const seg = segmented(Object.entries(TESTS).map(([value, [label, ic]]) => ({ value, label, icon: ic })), 'info', open, { label: 'Test' });
    drawReport(); open('info');
    return h('div', { class: 'page hw-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'IT-support', title: 'Hardwaretest', lead: 'Test tastatur, skærm, lyd, mikrofon, kamera og mus – fx når du køber en brugt computer eller afleverer en reparation.', compact: true }),
      h('div', { class: 'cmd-filters' }, seg), body, panel('Rapport', 'list', report));
  },
};
