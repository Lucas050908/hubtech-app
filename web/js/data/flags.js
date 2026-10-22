/**
 * Flags for "Gæt flaget", drawn as SVG from a small description (no image files, no emoji – emoji flags don't show on Windows).
 * Only flags that are correct without a coat of arms are included. All flags are drawn 3:2 (300 × 200) – a few are
 * really a little wider or narrower, which is fine for recognising them.
 *   h / v : stripes (top→bottom / left→right), w = relative widths
 *   n     : Nordic cross [background, cross, inner cross]
 *   o     : shapes on top – disc, star, rect, poly, ring, crescent, saltire
 */
const C = { red: '#d52b1e', white: '#ffffff', blue: '#0033a0', navy: '#012169', yellow: '#fcd116', gold: '#ffce00', green: '#009a44', black: '#000000', orange: '#ff8200', sky: '#74acdf' };

export const FLAGS = [
  // Europa
  { id: 'dk', name: 'Danmark', r: 'eu', n: ['#c8102e', C.white] },
  { id: 'se', name: 'Sverige', r: 'eu', n: ['#006aa7', '#fecc02'] },
  { id: 'no', name: 'Norge', r: 'eu', n: ['#ba0c2f', C.white, '#00205b'] },
  { id: 'fi', name: 'Finland', r: 'eu', n: [C.white, '#002f6c'] },
  { id: 'is', name: 'Island', r: 'eu', n: ['#02529c', C.white, '#dc1e35'] },
  { id: 'fo', name: 'Færøerne', r: 'eu', n: [C.white, '#0065bd', '#ef3340'] },
  { id: 'gl', name: 'Grønland', r: 'eu', h: [C.white, '#c8102e'], o: [{ halfdisc: [110, 100, 60, '#c8102e', C.white] }] },
  { id: 'de', name: 'Tyskland', r: 'eu', h: [C.black, '#dd0000', C.gold] },
  { id: 'fr', name: 'Frankrig', r: 'eu', v: ['#002395', C.white, '#ed2939'] },
  { id: 'it', name: 'Italien', r: 'eu', v: ['#009246', C.white, '#ce2b37'] },
  { id: 'ie', name: 'Irland', r: 'eu', v: ['#169b62', C.white, '#ff883e'] },
  { id: 'be', name: 'Belgien', r: 'eu', v: [C.black, '#fdda24', '#ef3340'] },
  { id: 'nl', name: 'Holland', r: 'eu', h: ['#ae1c28', C.white, '#21468b'] },
  { id: 'lu', name: 'Luxembourg', r: 'eu', h: ['#ef3340', C.white, '#00a3e0'] },
  { id: 'at', name: 'Østrig', r: 'eu', h: ['#ed2939', C.white, '#ed2939'] },
  { id: 'pl', name: 'Polen', r: 'eu', h: [C.white, '#dc143c'] },
  { id: 'ua', name: 'Ukraine', r: 'eu', h: ['#0057b7', '#ffd700'] },
  { id: 'ru', name: 'Rusland', r: 'eu', h: [C.white, '#0039a6', '#d52b1e'] },
  { id: 'ee', name: 'Estland', r: 'eu', h: ['#0072ce', C.black, C.white] },
  { id: 'lv', name: 'Letland', r: 'eu', h: ['#9e3039', C.white, '#9e3039'], w: [2, 1, 2] },
  { id: 'lt', name: 'Litauen', r: 'eu', h: ['#fdb913', '#006a44', '#c1272d'] },
  { id: 'hu', name: 'Ungarn', r: 'eu', h: ['#cd2a3e', C.white, '#436f4d'] },
  { id: 'bg', name: 'Bulgarien', r: 'eu', h: [C.white, '#00966e', '#d62612'] },
  { id: 'ro', name: 'Rumænien', r: 'eu', v: ['#002b7f', '#fcd116', '#ce1126'] },
  { id: 'am', name: 'Armenien', r: 'eu', h: ['#d90012', '#0033a0', '#f2a800'] },
  { id: 'cz', name: 'Tjekkiet', r: 'eu', h: [C.white, '#d7141a'], o: [{ poly: ['0,0 150,100 0,200', '#11457e'] }] },
  { id: 'ch', name: 'Schweiz', r: 'eu', h: ['#da291c'], o: [{ rect: [125, 40, 50, 120, C.white] }, { rect: [90, 75, 120, 50, C.white] }] },
  { id: 'en', name: 'England', r: 'eu', h: [C.white], o: [{ rect: [125, 0, 50, 200, '#ce1124'] }, { rect: [0, 75, 300, 50, '#ce1124'] }] },
  { id: 'sc', name: 'Skotland', r: 'eu', h: ['#005eb8'], o: [{ saltire: [C.white, 30] }] },
  { id: 'gr', name: 'Grækenland', r: 'eu', h: ['#0d5eaf', C.white, '#0d5eaf', C.white, '#0d5eaf', C.white, '#0d5eaf', C.white, '#0d5eaf'],
    o: [{ rect: [0, 0, 111, 111, '#0d5eaf'] }, { rect: [44.4, 0, 22.2, 111, C.white] }, { rect: [0, 44.4, 111, 22.2, C.white] }] },
  // Verden
  { id: 'jp', name: 'Japan', r: 'w', h: [C.white], o: [{ disc: [150, 100, 60, '#bc002d'] }] },
  { id: 'bd', name: 'Bangladesh', r: 'w', h: ['#006a4e'], o: [{ disc: [135, 100, 60, '#f42a41'] }] },
  { id: 'pw', name: 'Palau', r: 'w', h: ['#4aadd6'], o: [{ disc: [130, 100, 55, '#ffde00'] }] },
  { id: 'la', name: 'Laos', r: 'w', h: ['#ce1126', '#002868', '#ce1126'], w: [1, 2, 1], o: [{ disc: [150, 100, 40, C.white] }] },
  { id: 'ng', name: 'Nigeria', r: 'w', v: ['#008751', C.white, '#008751'] },
  { id: 'ci', name: 'Elfenbenskysten', r: 'w', v: ['#f77f00', C.white, '#009e60'] },
  { id: 'ml', name: 'Mali', r: 'w', v: ['#14b53a', '#fcd116', '#ce1126'] },
  { id: 'gn', name: 'Guinea', r: 'w', v: ['#ce1126', '#fcd116', '#009460'] },
  { id: 'pe', name: 'Peru', r: 'w', v: ['#d91023', C.white, '#d91023'] },
  { id: 'co', name: 'Colombia', r: 'w', h: ['#fcd116', '#003893', '#ce1126'], w: [2, 1, 1] },
  { id: 'id', name: 'Indonesien', r: 'w', h: ['#ce1126', C.white] },
  { id: 'th', name: 'Thailand', r: 'w', h: ['#a51931', '#f4f5f8', '#2d2a4a', '#f4f5f8', '#a51931'], w: [1, 1, 2, 1, 1] },
  { id: 'ga', name: 'Gabon', r: 'w', h: ['#009e60', '#fcd116', '#3a75c4'] },
  { id: 'sl', name: 'Sierra Leone', r: 'w', h: ['#1eb53a', C.white, '#0072c6'] },
  { id: 'bw', name: 'Botswana', r: 'w', h: ['#75aadb', C.white, C.black, C.white, '#75aadb'], w: [9, 1, 4, 1, 9] },
  { id: 'ye', name: 'Yemen', r: 'w', h: ['#ce1126', C.white, C.black] },
  { id: 'mu', name: 'Mauritius', r: 'w', h: ['#ea2839', '#1a206d', '#ffd500', '#00a551'] },
  { id: 'ar', name: 'Argentina', r: 'w', h: [C.sky, C.white, C.sky], o: [{ disc: [150, 100, 18, '#f6b40e'] }] },
  { id: 'vn', name: 'Vietnam', r: 'w', h: ['#da251d'], o: [{ star: [150, 100, 52, '#ffff00'] }] },
  { id: 'so', name: 'Somalia', r: 'w', h: ['#4189dd'], o: [{ star: [150, 100, 48, C.white] }] },
  { id: 'cn', name: 'Kina', r: 'w', h: ['#ee1c25'], o: [{ star: [50, 50, 30, '#ffff00'] }, { star: [100, 20, 10, '#ffff00'] }, { star: [120, 40, 10, '#ffff00'] }, { star: [120, 70, 10, '#ffff00'] }, { star: [100, 90, 10, '#ffff00'] }] },
  { id: 'tr', name: 'Tyrkiet', r: 'w', h: ['#e30a17'], o: [{ crescent: [112, 100, 50, 40, 125, '#e30a17', C.white] }, { star: [178, 100, 22, C.white, -18] }] },
  { id: 'gh', name: 'Ghana', r: 'w', h: ['#ce1126', '#fcd116', '#006b3f'], o: [{ star: [150, 100, 30, C.black] }] },
  { id: 'cm', name: 'Cameroun', r: 'w', v: ['#007a5e', '#ce1126', '#fcd116'], o: [{ star: [150, 100, 26, '#fcd116'] }] },
  { id: 'sn', name: 'Senegal', r: 'w', v: ['#00853f', '#fdef42', '#e31b23'], o: [{ star: [150, 100, 28, '#00853f'] }] },
  { id: 'sy', name: 'Syrien', r: 'w', h: ['#ce1126', C.white, C.black], o: [{ star: [110, 100, 20, '#007a3d'] }, { star: [190, 100, 20, '#007a3d'] }] },
  { id: 'in', name: 'Indien', r: 'w', h: ['#ff9933', C.white, '#138808'], o: [{ ring: [150, 100, 25, '#000080', 4] }, { disc: [150, 100, 5, '#000080'] }] },
  { id: 'il', name: 'Israel', r: 'w', h: [C.white], o: [{ rect: [0, 20, 300, 25, '#0038b8'] }, { rect: [0, 155, 300, 25, '#0038b8'] }, { poly: ['150,60 185,120 115,120', 'none', '#0038b8', 7] }, { poly: ['150,140 185,80 115,80', 'none', '#0038b8', 7] }] },
  { id: 'ae', name: 'Forenede Arabiske Emirater', r: 'w', h: ['#00732f', C.white, C.black], o: [{ rect: [0, 0, 75, 200, '#ff0000'] }] },
  { id: 'mg', name: 'Madagaskar', r: 'w', h: ['#fc3d32', '#007e3a'], o: [{ rect: [0, 0, 100, 200, C.white] }] },
  { id: 'bj', name: 'Benin', r: 'w', h: ['#fcd116', '#e8112d'], o: [{ rect: [0, 0, 120, 200, '#008751'] }] },
  { id: 'cl', name: 'Chile', r: 'w', h: [C.white, '#d52b1e'], o: [{ rect: [0, 0, 100, 100, '#0039a6'] }, { star: [50, 50, 22, C.white] }] },
  { id: 'cu', name: 'Cuba', r: 'w', h: ['#002a8f', C.white, '#002a8f', C.white, '#002a8f'], o: [{ poly: ['0,0 173,100 0,200', '#cf142b'] }, { star: [58, 100, 24, C.white] }] },
  { id: 'jm', name: 'Jamaica', r: 'w', h: ['#009b3a'], o: [{ poly: ['0,0 150,100 0,200', C.black] }, { poly: ['300,0 150,100 300,200', C.black] }, { saltire: ['#fed100', 26] }] },
  { id: 'us', name: 'USA', r: 'w', h: Array.from({ length: 13 }, (_, i) => (i % 2 ? C.white : '#b22234')), o: [{ rect: [0, 0, 120, 107.7, '#3c3b6e'] }, { dots: [C.white] }] },
];

const starPts = (cx, cy, r, rot = -90) => Array.from({ length: 10 }, (_, i) => {
  const a = (rot + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.382 : r;
  return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
}).join(' ');

/** SVG markup for a flag (trusted, built only from the table above). */
export function flagSvg(f) {
  const W = 300, H = 200;
  let out = '';
  const stripes = (cols, w = cols.map(() => 1), vertical) => {
    const tot = w.reduce((a, b) => a + b, 0); let pos = 0;
    cols.forEach((c, i) => { const size = (vertical ? W : H) * w[i] / tot; out += vertical ? `<rect x="${pos}" y="0" width="${size + 0.5}" height="${H}" fill="${c}"/>` : `<rect x="0" y="${pos}" width="${W}" height="${size + 0.5}" fill="${c}"/>`; pos += size; });
  };
  if (f.h) stripes(f.h, f.w, false);
  if (f.v) stripes(f.v, f.w, true);
  if (f.n) {
    const [bg, cross, inner] = f.n;
    out += `<rect width="${W}" height="${H}" fill="${bg}"/><rect x="83" y="0" width="${inner ? 50 : 36}" height="${H}" fill="${cross}" transform="translate(${inner ? -7 : 0},0)"/><rect x="0" y="${inner ? 75 : 82}" width="${W}" height="${inner ? 50 : 36}" fill="${cross}"/>`;
    if (inner) out += `<rect x="88" y="0" width="26" height="${H}" fill="${inner}"/><rect x="0" y="87" width="${W}" height="26" fill="${inner}"/>`;
  }
  for (const o of f.o || []) {
    if (o.rect) { const [x, y, w, hh, c] = o.rect; out += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${c}"/>`; }
    if (o.disc) { const [x, y, r, c] = o.disc; out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`; }
    if (o.ring) { const [x, y, r, c, sw] = o.ring; out += `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}"/>`; }
    if (o.star) { const [x, y, r, c, rot] = o.star; out += `<polygon points="${starPts(x, y, r, rot ?? -90)}" fill="${c}"/>`; }
    if (o.poly) { const [pts, fill, stroke, sw] = o.poly; out += `<polygon points="${pts}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`; }
    if (o.saltire) { const [c, sw] = o.saltire; out += `<path d="M0,0 L300,200 M300,0 L0,200" stroke="${c}" stroke-width="${sw}"/>`; }
    if (o.crescent) { const [x, y, r1, r2, x2, bg, c] = o.crescent; out += `<circle cx="${x}" cy="${y}" r="${r1}" fill="${c}"/><circle cx="${x2}" cy="${y}" r="${r2}" fill="${bg}"/>`; }
    if (o.halfdisc) { const [x, y, r, top, bottom] = o.halfdisc; out += `<path d="M${x - r},${y} A${r},${r} 0 0 1 ${x + r},${y} Z" fill="${top}"/><path d="M${x - r},${y} A${r},${r} 0 0 0 ${x + r},${y} Z" fill="${bottom}"/>`; }
    if (o.dots) { for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) out += `<circle cx="${(r % 2 ? 20 : 10) + c * 20}" cy="${7 + r * 11.6}" r="3.2" fill="${o.dots[0]}"/>`; }
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flag">${out}</svg>`;
}
