/**
 * QR-koder – make a QR code for a link, the Wi-Fi (guests scan and are online), a contact card, an e-mail, SMS or phone number.
 * Download as PNG/SVG, or print a card to hang on the wall. Saved codes are kept on the account.
 */
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, segmented, confirmDialog } from '../core/ui.js';
import { appById } from '../core/registry.js';
import { appHero } from '../features/apphero.js';
import { panel, copy, appState, loadError, uid } from '../features/appkit.js';
import { qrSvg } from '../features/qr.js';

const wifiEsc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
const vEsc = (s) => String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

/** kind → fields [key, label, type, placeholder] + how the QR text is built + a title for lists and print */
export const KINDS = {
  link: { label: 'Link', icon: 'link', fields: [['url', 'Adresse', 'url', 'https://eksempel.dk']],
    text: (d) => (/^[a-z]+:/i.test(d.url) ? d.url : `https://${d.url}`), title: (d) => d.url, ok: (d) => !!d.url.trim() },
  wifi: { label: 'Wi-Fi', icon: 'globe', fields: [['ssid', 'Netværksnavn (SSID)', 'text', 'Gæstenet'], ['pass', 'Adgangskode', 'text', ''], ['sec', 'Sikkerhed', 'select', [['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP (gammel)'], ['nopass', 'Ingen kode']]], ['hidden', 'Skjult netværk', 'checkbox']],
    text: (d) => `WIFI:T:${d.sec || 'WPA'};S:${wifiEsc(d.ssid)};${d.sec === 'nopass' ? '' : `P:${wifiEsc(d.pass)};`}${d.hidden ? 'H:true;' : ''};`,
    title: (d) => `Wi-Fi: ${d.ssid}`, ok: (d) => !!d.ssid.trim() && (d.sec === 'nopass' || d.pass.length >= (d.sec === 'WEP' ? 5 : 8)) },
  contact: { label: 'Kontakt', icon: 'user', fields: [['name', 'Navn', 'text', 'Anne Jensen'], ['org', 'Firma', 'text', ''], ['tel', 'Telefon', 'tel', '+45 12 34 56 78'], ['email', 'E-mail', 'email', ''], ['web', 'Hjemmeside', 'url', '']],
    text: (d) => ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vEsc(d.name)}`, `N:${vEsc(d.name.split(' ').slice(-1)[0] || '')};${vEsc(d.name.split(' ').slice(0, -1).join(' '))};;;`,
      d.org && `ORG:${vEsc(d.org)}`, d.tel && `TEL;TYPE=CELL:${d.tel.replace(/\s/g, '')}`, d.email && `EMAIL:${d.email}`, d.web && `URL:${d.web}`, 'END:VCARD'].filter(Boolean).join('\n'),
    title: (d) => d.name, ok: (d) => !!d.name.trim() },
  email: { label: 'E-mail', icon: 'mail', fields: [['to', 'Til', 'email', 'support@firma.dk'], ['subject', 'Emne', 'text', ''], ['body', 'Tekst', 'textarea', '']],
    text: (d) => `mailto:${d.to}${d.subject || d.body ? `?${[d.subject && `subject=${encodeURIComponent(d.subject)}`, d.body && `body=${encodeURIComponent(d.body)}`].filter(Boolean).join('&')}` : ''}`,
    title: (d) => `E-mail til ${d.to}`, ok: (d) => /.+@.+/.test(d.to) },
  sms: { label: 'SMS', icon: 'chat', fields: [['tel', 'Nummer', 'tel', '+45 12 34 56 78'], ['body', 'Besked', 'textarea', '']],
    text: (d) => `SMSTO:${d.tel.replace(/\s/g, '')}:${d.body}`, title: (d) => `SMS til ${d.tel}`, ok: (d) => d.tel.replace(/\D/g, '').length >= 3 },
  tel: { label: 'Telefon', icon: 'phone', fields: [['tel', 'Nummer', 'tel', '+45 12 34 56 78']],
    text: (d) => `tel:${d.tel.replace(/\s/g, '')}`, title: (d) => `Ring til ${d.tel}`, ok: (d) => d.tel.replace(/\D/g, '').length >= 3 },
  text: { label: 'Tekst', icon: 'note', fields: [['text', 'Tekst', 'textarea', 'Skriv det, der skal stå, når koden scannes']],
    text: (d) => d.text, title: (d) => d.text.slice(0, 40), ok: (d) => !!d.text.trim() },
};
const blank = (kind) => Object.fromEntries(KINDS[kind].fields.map(([k, , t]) => [k, t === 'checkbox' ? false : t === 'select' ? 'WPA' : '']));

export default {
  title: 'QR-koder',
  async render() {
    const app = appById('qrtool');
    let store;
    try { store = await appState('qrtool', { saved: [] }); } catch (e) { return loadError('QR-koder', e); }
    const st = store.data;
    let kind = 'wifi', data = blank(kind), editing = null, seq = 0;
    const form = h('div', { class: 'qr-form' });
    const preview = h('div', { class: 'qr-preview' });
    const meta = h('p', { class: 'faint qr-meta' });
    const savedEl = h('div', { class: 'list' });
    const caption = h('input', { class: 'input', placeholder: 'Overskrift på udskriften – fx “Gratis Wi-Fi”', maxlength: 60, 'aria-label': 'Overskrift' });

    function drawForm() {
      clear(form);
      for (const [k, label, type, ph] of KINDS[kind].fields) {
        let el;
        if (type === 'select') { el = h('select', { class: 'select' }, ph.map(([v, l]) => h('option', { value: v, selected: data[k] === v }, l))); el.addEventListener('change', () => { data[k] = el.value; drawForm(); update(); }); }
        else if (type === 'checkbox') { el = h('input', { type: 'checkbox', checked: !!data[k] }); el.addEventListener('change', () => { data[k] = el.checked; update(); }); form.append(h('label', { class: 'pw-check' }, el, h('span', null, label))); continue; }
        else if (type === 'textarea') { el = h('textarea', { class: 'input', rows: 3, placeholder: ph || '' }); el.value = data[k]; el.addEventListener('input', () => { data[k] = el.value; update(); }); }
        else { el = h('input', { class: 'input', type: type === 'url' ? 'text' : type, inputmode: type === 'url' ? 'url' : undefined, placeholder: ph || '', autocomplete: 'off', spellcheck: false }); el.value = data[k]; el.addEventListener('input', () => { data[k] = el.value; update(); }); }
        if (kind === 'wifi' && k === 'pass' && data.sec === 'nopass') continue;
        el.setAttribute('aria-label', label);
        form.append(h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el));
      }
    }
    async function update() {
      const my = ++seq, K = KINDS[kind];
      if (!K.ok(data)) {
        clear(preview).append(h('div', { class: 'qr-empty' }, icon(K.icon), h('span', null, kind === 'wifi' && data.ssid && data.sec !== 'nopass' ? 'Adgangskoden skal være mindst 8 tegn' : 'Udfyld felterne')));
        meta.textContent = ''; return;
      }
      const text = K.text(data);
      if (text.length > 1200) { clear(preview).append(h('div', { class: 'qr-empty' }, icon('alert'), h('span', null, 'For meget tekst til én QR-kode'))); return; }
      try {
        const svg = await qrSvg(text, 260);
        if (my !== seq) return;
        clear(preview).append(svg);
        meta.textContent = kind === 'wifi' ? 'Scan med telefonens kamera – så kommer man på nettet uden at skrive koden.' : `${text.length} tegn`;
      } catch (e) { clear(preview).append(h('div', { class: 'qr-empty' }, icon('alert'), h('span', null, 'QR-koden kunne ikke laves'))); }
    }
    const currentSvg = () => preview.querySelector('svg');
    const fileName = () => `qr-${(KINDS[kind].title(data) || 'kode').toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'kode'}`;
    const dl = (href, name) => { const a = h('a', { href, download: name }); document.body.append(a); a.click(); a.remove(); };
    function downloadSvg() { const s = currentSvg(); if (!s) return; const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s)], { type: 'image/svg+xml' })); dl(url, `${fileName()}.svg`); setTimeout(() => URL.revokeObjectURL(url), 4000); }
    function downloadPng() {
      const s = currentSvg(); if (!s) return;
      const img = new Image(), url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s)], { type: 'image/svg+xml' }));
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 1024, 1024); dl(c.toDataURL('image/png'), `${fileName()}.png`); URL.revokeObjectURL(url); };
      img.src = url;
    }
    async function print() {
      const s = currentSvg(); if (!s) return toast('Udfyld felterne først', { type: 'warn' });
      const { printDocument, esc } = await import('../features/printing.js');
      const head = caption.value.trim() || { wifi: 'Gratis Wi-Fi', link: 'Scan mig', contact: 'Gem kontakten', email: 'Skriv til os', sms: 'Send en SMS', tel: 'Ring til os', text: 'Scan mig' }[kind];
      const lines = kind === 'wifi' ? [`Netværk: <b>${esc(data.ssid)}</b>`, data.sec !== 'nopass' ? `Kode: <b>${esc(data.pass)}</b>` : 'Ingen kode'] : [esc(KINDS[kind].title(data))];
      const svg = new XMLSerializer().serializeToString(s).replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');
      await printDocument({ title: head, accent: '#0ea5e9', css: '.qr-card{display:grid;justify-items:center;text-align:center;gap:8mm;padding-top:25mm}.qr-card h1{font-size:40pt}.qr-card .q{width:120mm;height:120mm}.qr-card p{font-size:18pt;margin:0}.qr-card small{font-size:12pt;color:#6b7a8f}',
        body: `<div class="qr-card"><h1>${esc(head)}</h1><div class="q">${svg}</div>${lines.map(l => `<p>${l}</p>`).join('')}<small>Åbn kameraet på telefonen, og peg det på koden.</small></div>` });
    }
    function save() {
      if (!KINDS[kind].ok(data)) return toast('Udfyld felterne først', { type: 'warn' });
      const item = { id: editing || uid(), kind, data: { ...data }, caption: caption.value.trim(), at: Date.now() };
      st.saved = [item, ...st.saved.filter(x => x.id !== item.id)].slice(0, 100);
      editing = item.id; store.save(); drawSaved(); toast('QR-koden er gemt', { type: 'ok' });
    }
    function load(item) { kind = item.kind; data = { ...blank(kind), ...item.data }; editing = item.id; caption.value = item.caption || ''; seg.setValue(kind); drawForm(); update(); scrollTo({ top: 0, behavior: 'smooth' }); }
    function drawSaved() {
      clear(savedEl);
      if (!st.saved.length) { savedEl.append(h('p', { class: 'faint', style: { margin: 0 } }, 'Ingen gemte QR-koder endnu.')); return; }
      st.saved.forEach(it => {
        const K = KINDS[it.kind]; if (!K) return;
        const del = h('button', { class: 'icon-btn btn-sm', 'aria-label': 'Slet' }, icon('trash'));
        del.addEventListener('click', async (e) => { e.stopPropagation(); if (await confirmDialog({ title: 'Slet QR-koden?', confirmLabel: 'Slet', danger: true })) { st.saved = st.saved.filter(x => x.id !== it.id); if (editing === it.id) editing = null; store.save(); drawSaved(); } });
        savedEl.append(h('div', { class: 'row', role: 'button', tabindex: 0, onclick: () => load(it), onkeydown: (e) => { if (e.key === 'Enter') load(it); } },
          h('span', { class: 'row-icon' }, icon(K.icon)), h('span', { class: 'row-main' }, h('div', { class: 'row-title' }, it.caption || K.title(it.data)), h('div', { class: 'row-sub' }, `${K.label} · ${new Date(it.at).toLocaleDateString('da-DK')}`)), del));
      });
    }
    const seg = segmented(Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label, icon: k.icon })), kind, (v) => { kind = v; data = blank(v); editing = null; drawForm(); update(); }, { label: 'Type' });
    drawForm(); update(); drawSaved();
    return h('div', { class: 'page qr-page', style: { '--app': app.hue } },
      appHero(app, { eyebrow: 'IT-support', title: 'QR-koder', lead: 'Lav en QR-kode til Wi-Fi, et link, et visitkort, en e-mail eller et telefonnummer – og print et skilt til væggen.', compact: true }),
      h('div', { class: 'cmd-filters' }, seg),
      h('div', { class: 'qr-layout' },
        panel('Indhold', 'edit', form, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Overskrift (til udskrift)'), caption)),
        panel('QR-kode', 'grid', preview, meta,
          h('div', { class: 'row-actions qr-acts' },
            h('button', { class: 'btn btn-primary', onclick: print }, icon('printer'), 'Print skilt'),
            h('button', { class: 'btn', onclick: downloadPng }, icon('download'), 'PNG'),
            h('button', { class: 'btn', onclick: downloadSvg }, icon('download'), 'SVG'),
            h('button', { class: 'btn', onclick: () => KINDS[kind].ok(data) && copy(KINDS[kind].text(data), 'Indholdet er kopieret') }, icon('copy'), 'Kopiér tekst'),
            h('button', { class: 'btn', onclick: save }, icon('check'), 'Gem')))),
      panel('Gemte QR-koder', 'list', savedEl));
  },
};
