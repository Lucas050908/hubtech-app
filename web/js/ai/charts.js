/**
 * Gnist draws charts: she writes a small ```graf block (type, titel, one "navn: tal" per line) and HUBTECH draws it as
 * an SVG – bars, a line or a pie. If the model forgets, numbers in the question itself ("jan 5, feb 8, mar 3") are drawn.
 * Pure (tested in tests/apps.test.mjs): the result is an SVG string.
 */
const COLORS = ['#f97316', '#fbbf24', '#38bdf8', '#a3e635', '#f472b6', '#a78bfa', '#fb7185', '#2dd4bf', '#facc15', '#c2410c'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const numOf = (s) => {
  let t = String(s).trim().replace(/[^\d,.\-]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const fmt = (n) => Number(n.toFixed(2)).toLocaleString('da-DK');
const kindOf = (s) => (/cirkel|lagkage|pie|tærte|fordeling/i.test(s) ? 'pie' : /linje|kurve|udvikling|line|over tid/i.test(s) ? 'line' : 'bar');

/** A ```graf block → { type, title, data: [{ label, value }] } – or null when there are fewer than two numbers. */
export function parseChart(src) {
  let type = 'bar', title = '';
  const data = [];
  for (const raw of String(src || '').split('\n')) {
    const line = raw.replace(/^\s*[-*•]\s*/, '').trim();
    if (!line) continue;
    let m = line.match(/^(type|slags|diagram)\s*[:=]\s*(.+)$/i);
    if (m) { type = kindOf(m[2]); continue; }
    m = line.match(/^(titel|title|overskrift)\s*[:=]\s*(.+)$/i);
    if (m) { title = m[2].trim(); continue; }
    m = line.match(/^(.{1,40}?)\s*[:=|]\s*(-?[\d.,]+)\s*[%a-zæøå.]*\s*$/i);
    if (m) { const v = numOf(m[2]); if (Number.isFinite(v)) data.push({ label: m[1].replace(/\*\*/g, '').trim(), value: v }); }
  }
  return data.length >= 2 ? { type, title, data: data.slice(0, 24) } : null;
}

const FILLER = new Set(['lav', 'laver', 'en', 'et', 'graf', 'grafen', 'over', 'med', 'af', 'for', 'diagram', 'vis', 'tegn', 'og', 'cirkeldiagram', 'søjlediagram', 'kurve', 'lagkage', 'lagkagediagram', 'kan', 'du', 'mig', 'til', 'der', 'viser', '']);
/** Numbers in an ordinary sentence: "lav en graf over jan 5, feb 8 og mar 3" → a chart (or null). */
export function chartFromText(q) {
  const s = String(q || '');
  if (!/graf|diagram|søjle|cirkeldiagram|lagkage|kurve/i.test(s)) return null;
  const data = [];
  for (const m of s.matchAll(/([A-Za-zÆØÅæøå][\wÆØÅæøå .-]{0,20}?)\s*[:=]?\s+(-?\d[\d.,]*)(?=\s*(?:%|kr\.?|t|timer)?\s*(?:,|;|\bog\b|$|\n))/g)) {
    const ws = m[1].trim().split(/\s+/);
    while (ws.length && FILLER.has(ws[0].toLowerCase().replace(/[:,]/g, ''))) ws.shift();
    const label = ws.slice(-3).join(' ').replace(/[:,]$/, '');
    const v = numOf(m[2]);
    if (label && Number.isFinite(v) && !/^(graf|diagram|over|med)$/i.test(label)) data.push({ label, value: v });
  }
  return data.length >= 2 ? { type: kindOf(s), title: '', data: data.slice(0, 24) } : null;
}

/** The chart as an SVG string (it follows the text colour, so it works in dark and light themes). */
export function chartSvg(c) {
  const W = 520, H = c.type === 'pie' ? 260 : 280, title = c.title ? `<text x="${W / 2}" y="18" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${esc(c.title)}</text>` : '';
  const top = c.title ? 34 : 12;
  const label = (x, y, t, a = 'middle', extra = '') => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="11" fill="currentColor" ${extra}>${esc(t)}</text>`;
  let body = '';
  if (c.type === 'pie') {
    const vals = c.data.map(d => Math.max(0, d.value)), sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = 130, cy = top + (H - top) / 2, r = Math.min(105, (H - top) / 2 - 6);
    let a0 = -Math.PI / 2;
    c.data.forEach((d, i) => {
      const a1 = a0 + (vals[i] / sum) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
      body += vals[i] >= sum ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS[i % COLORS.length]}"/>` : `<path d="M${cx},${cy} L${p(a0)} A${r},${r} 0 ${large} 1 ${p(a1)} Z" fill="${COLORS[i % COLORS.length]}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>`;
      const ly = top + 8 + i * 20;
      if (ly < H - 6) body += `<rect x="262" y="${ly}" width="12" height="12" rx="3" fill="${COLORS[i % COLORS.length]}"/>` + label(282, ly + 10, `${d.label}: ${fmt(d.value)} (${Math.round(vals[i] / sum * 100)} %)`, 'start');
      a0 = a1;
    });
  } else {
    const left = 46, right = W - 12, bottom = H - 34, min0 = Math.min(0, ...c.data.map(d => d.value)), max0 = Math.max(0, ...c.data.map(d => d.value));
    const nice = (x) => { const p = 10 ** Math.floor(Math.log10(x || 1)), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
    const tick = nice((max0 - min0 || 1) / 4), min = Math.floor(min0 / tick) * tick, max = Math.max(min + tick, Math.ceil(max0 / tick) * tick);   // round grid values
    const span = max - min, y = (v) => bottom - ((v - min) / span) * (bottom - top);
    for (let v = min; v <= max + tick / 2; v += tick) {   // grid lines with values
      const yy = y(v).toFixed(1);
      body += `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="currentColor" stroke-opacity=".15"/>` + label(left - 6, Number(yy) + 4, fmt(v), 'end', 'fill-opacity=".7"');
    }
    const n = c.data.length, step = (right - left) / n, thin = n > 8;
    if (c.type === 'line') {
      const pts = c.data.map((d, i) => [left + step * (i + 0.5), y(d.value)]);
      body += `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${COLORS[0]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach(([px, py], i) => { body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${COLORS[1]}"/>` + label(px, py - 9, fmt(c.data[i].value)); });
    } else {
      c.data.forEach((d, i) => {
        const bw = Math.min(56, step * 0.7), x = left + step * i + (step - bw) / 2, y0 = y(Math.max(0, d.value)), h0 = Math.abs(y(d.value) - y(0));
        body += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h0).toFixed(1)}" rx="4" fill="${COLORS[i % COLORS.length]}"/>` + label(x + bw / 2, y0 - 5, fmt(d.value));
      });
    }
    c.data.forEach((d, i) => { const x = left + step * (i + 0.5), t = d.label.length > (thin ? 6 : 12) ? d.label.slice(0, thin ? 5 : 11) + '…' : d.label; body += label(x, bottom + 16, t); });
    body += `<line x1="${left}" x2="${right}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="currentColor" stroke-opacity=".5"/>`;
  }
  return `<svg class="ai-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title || 'Graf')}: ${esc(c.data.map(d => `${d.label} ${fmt(d.value)}`).join(', '))}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">${title}${body}</svg>`;
}

/** A CSV/semicolon/tab table with a name column and a number column → a chart (or null). */
export function chartFromCsv(text, name = '') {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 60);
  if (lines.length < 3) return null;
  const sep = [';', '\t', ','].find(s => lines.slice(0, 5).every(l => l.split(s).length >= 2)) || null;
  if (!sep) return null;
  const rows = lines.map(l => l.split(sep).map(x => x.trim().replace(/^"|"$/g, '')));
  const head = rows[0], body = rows.slice(1);
  let col = -1;
  for (let k = 1; k < head.length && col < 0; k++) if (body.filter(r => Number.isFinite(numOf(r[k] ?? ''))).length >= Math.max(2, body.length * 0.8)) col = k;
  if (col < 0) return null;
  const data = body.filter(r => r[0] && Number.isFinite(numOf(r[col] ?? ''))).map(r => ({ label: r[0].slice(0, 30), value: numOf(r[col]) })).slice(0, 24);
  if (data.length < 2) return null;
  const firstIsTime = /dato|date|måned|maaned|år|uge|dag|tid|time|month|year/i.test(head[0]);
  return { type: firstIsTime ? 'line' : 'bar', title: `${head[col]}${name ? ` (${name})` : ''}`, data };
}
