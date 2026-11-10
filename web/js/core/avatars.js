/**
 * HUBTECHs egne figurer – skakmodstandernes avatarer og dem, man kan vælge til sin profil.
 * Samme opbygning som Gnist-mærket: 64×64, afrundet firkant, rolig baggrund og en figur af få flader,
 * så de også kan læses ved 26 px. Filen importerer med vilje ingenting, så core/dom.js kan bruge den.
 * Statisk, betroet markup – som ikon-sættet.
 */
/** Tegnede avatarer til skakmodstanderne – samme opbygning som Gnist-mærket:
 *  64×64, afrundet firkant, rolig baggrund og en figur bygget af få flader. */
const BG = {
  mini: ['#2a1f0a', '#facc15'], bo: ['#2a1f0a', '#fbbf24'], nora: ['#0f241a', '#4ade80'],
  lise: ['#2a1407', '#fb923c'], emil: ['#1a1630', '#a78bfa'], karl: ['#0c1f2e', '#38bdf8'],
  sofie: ['#102a24', '#2dd4bf'], tanja: ['#2d1a05', '#fbbf24'], viktor: ['#2d0f06', '#f97316'],
  holger: ['#1b1b20', '#d9c2a3'], freja: ['#2a0d12', '#f87171'], astrid: ['#2a2008', '#fcd34d'],
  grete: ['#2b1407', '#fb923c'], pind: ['#1f1a12', '#d6bd92'], storm: ['#121a26', '#94a3b8'],
};
const eyes = (cx1, cx2, cy, r = 2.4, c = '#1b1206') =>
  `<g fill="${c}"><ellipse cx="${cx1}" cy="${cy}" rx="${r}" ry="${r * 1.3}"/><ellipse cx="${cx2}" cy="${cy}" rx="${r}" ry="${r * 1.3}"/></g>`;

const FIG = {
  // kylling: rund krop, lille næb, en fjer på toppen
  mini: (c) => `<path d="M32 13c1.5 0 2 3 1 5" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="36" r="16" fill="${c}"/>${eyes(27, 37, 33)}
    <path d="M29.5 40h5l-2.5 3.5z" fill="#ea8c1a"/>`,
  // kylling der klækker: æggeskal om kroppen
  bo: (c) => `<circle cx="32" cy="33" r="13.5" fill="${c}"/>${eyes(27.5, 36.5, 30)}
    <path d="M29.5 36h5L32 39.5z" fill="#ea8c1a"/>
    <path d="M17 46c0-6 6.5-10 15-10s15 4 15 10z" fill="#f8f3e6"/>
    <path d="M17 46h30l-3.5-4-3.5 3-3.5-4-3.5 3.5-3.5-3.5-3.5 4-3.5-3z" fill="#e4dcc8"/>`,
  // skildpadde: skjold bagved, hoved frem, små ben
  nora: (c) => `<path d="M13 41c0-9 8.5-15 19-15s19 6 19 15z" fill="#166534"/>
    <path d="M24 41a8 8 0 0 1 16 0zM16 41a6 6 0 0 1 6-6M48 41a6 6 0 0 0-6-6" stroke="#0b3d24" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="16" y="41" width="7" height="6" rx="3" fill="${c}"/><rect x="41" y="41" width="7" height="6" rx="3" fill="${c}"/>
    <ellipse cx="32" cy="24" rx="9" ry="8" fill="${c}"/>${eyes(29, 35, 23, 1.9)}
    <path d="M29 28c1.8 1.4 4.2 1.4 6 0" stroke="#0b3d24" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  // venligt ansigt
  lise: (c) => `<circle cx="32" cy="32" r="16" fill="${c}"/>${eyes(26.5, 37.5, 29)}
    <path d="M25.5 37.5c2 2.8 4 4 6.5 4s4.5-1.2 6.5-4" stroke="#1b1206" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  // puslespil: hoved med en brik-tap
  emil: (c) => `<path d="M18 20h12a4 4 0 0 1 8 0h8a2 2 0 0 1 2 2v10a4 4 0 0 1 0 8v4a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V22a2 2 0 0 1 2-2z" fill="${c}"/>
    ${eyes(26, 36, 30)}<path d="M26 38h12" stroke="#1b1206" stroke-width="2.4" stroke-linecap="round"/>`,
  // kasket
  karl: (c) => `<circle cx="32" cy="35" r="14.5" fill="${c}"/>${eyes(27, 37, 34)}
    <path d="M17 27a15 15 0 0 1 30 0z" fill="#0b4a6b"/><path d="M47 27h7a2 2 0 0 1 0 4H46z" fill="#0b4a6b"/>
    <circle cx="32" cy="18.5" r="2" fill="#0b4a6b"/>`,
  // skjold
  sofie: (c) => `<path d="M32 12 50 18v14c0 10-7.5 16.5-18 20-10.5-3.5-18-10-18-20V18z" fill="${c}"/>
    ${eyes(26.5, 37.5, 30)}<path d="M32 39c2.5 0 4.5-1 6-2.5" stroke="#0b3b35" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  // taktikeren: ansigt med lyn som pandehår
  tanja: (c) => `<circle cx="32" cy="36" r="14" fill="${c}"/>${eyes(27, 37, 35)}
    <path d="M26 42c1.8 2 3.8 3 6 3s4.2-1 6-3" stroke="#6b4a08" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M38 8 22 26h8l-2 10 14-20h-8z" fill="#fde68a"/>`,
  // vovehalsen: ansigt med flamme som hår
  viktor: (c) => `<path d="M32 5c2 8 11 10 11 18H21c0-5 4-7 5.5-12 1.2 2.6 2.4 3.8 3.5 4.3.4-3.8 1.2-7 2-10.3z" fill="#fbbf24"/>
    <path d="M32 13c1.5 4.5 5 6 5 10H27c0-4 3.5-5.5 5-10z" fill="#fde68a"/>
    <circle cx="32" cy="36" r="14" fill="${c}"/>${eyes(27, 37, 35)}
    <path d="M26 41c1.8 2.4 3.8 3.6 6 3.6s4.2-1.2 6-3.6" stroke="#7c2d12" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  // strateg med høj hat
  holger: (c) => `<circle cx="32" cy="38" r="13.5" fill="${c}"/>${eyes(27, 37, 38)}
    <path d="M27 44h10" stroke="#2b2b33" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="23" y="10" width="18" height="13" rx="2" fill="#23232c"/>
    <rect x="23" y="18" width="18" height="4" fill="#8b5e34"/>
    <rect x="15" y="22" width="34" height="4.5" rx="2.2" fill="#23232c"/>`,
  // den fokuserede: ansigt bag en sigtering
  freja: (c) => `<circle cx="32" cy="34" r="14" fill="${c}"/>${eyes(27, 37, 33)}
    <path d="M27 40h10" stroke="#7f1d1d" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="32" cy="34" r="19" fill="none" stroke="#fca5a5" stroke-width="2.4" opacity=".9"/>
    <path d="M32 11v6M32 51v6M11 34h6M47 34h6" stroke="#fca5a5" stroke-width="2.4" stroke-linecap="round"/>`,
  // dronning: kronen sidder over hovedet
  astrid: (c) => `<circle cx="32" cy="38" r="14" fill="${c}"/>${eyes(27, 37, 37)}
    <path d="M26 44c1.8 2 3.8 3 6 3s4.2-1 6-3" stroke="#6b4a08" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M18 14l5.5 6L32 9l8.5 11L46 14l-2.5 10h-23z" fill="#f0b429"/>
    <path d="M20 24h24" stroke="#d99a12" stroke-width="3" stroke-linecap="round"/>`,
  // ræv: spidse ører og snude
  grete: (c) => `<path d="M16 18l6 10-6-2z" fill="${c}"/><path d="M48 18l-6 10 6-2z" fill="${c}"/>
    <path d="M32 20c9 0 15 6 15 13 0 8-6.5 14-15 17-8.5-3-15-9-15-17 0-7 6-13 15-13z" fill="${c}"/>
    <path d="M32 36c4 0 7 3 7 7 0 4-3 7-7 7s-7-3-7-7c0-4 3-7 7-7z" fill="#f8f3e6"/>
    ${eyes(26, 38, 32, 2.2)}<ellipse cx="32" cy="42" rx="2.6" ry="2" fill="#1b1206"/>`,
  // ugle: store øjenringe og dusker
  pind: (c) => `<path d="M20 16l5 7-7-1z" fill="${c}"/><path d="M44 16l-5 7 7-1z" fill="${c}"/>
    <ellipse cx="32" cy="35" rx="16" ry="17" fill="${c}"/>
    <circle cx="26" cy="32" r="6.5" fill="#f8f3e6"/><circle cx="38" cy="32" r="6.5" fill="#f8f3e6"/>
    ${eyes(26, 38, 32, 2.6)}<path d="M29 40l3 4 3-4z" fill="#ea8c1a"/>
    <path d="M22 47h20" stroke="#8a7557" stroke-width="2.4" stroke-linecap="round"/>`,
  // stormesteren: ansigt under en tordensky
  storm: (c) => `<circle cx="32" cy="40" r="13" fill="${c}"/>${eyes(27, 37, 39)}
    <path d="M27 45h10" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M20 26a7 7 0 0 1 .8-14 10 10 0 0 1 18.4 1.8A6.6 6.6 0 0 1 41 26z" fill="#64748b"/>
    <path d="M30 26 25 36h4l-1.5 6 7-10h-4z" fill="#fbbf24"/>`,
};

// seks figurer mere, så alle de gamle emoji-valg har en tegnet afløser
const EXTRA_BG = {
  ulv: ['#171d26', '#94a3b8'], bjorn: ['#241a12', '#b98a5e'], raket: ['#1a1526', '#c4b5fd'],
  vaerktoj: ['#201a10', '#f5c26b'], trae: ['#10211a', '#6ee7a8'], boelge: ['#0c1f2b', '#60c8f0'],
};
const EXTRA = {
  // ulv: spidse ører, smal snude
  ulv: (c) => `<path d="M17 17l6 9-6-1z" fill="${c}"/><path d="M47 17l-6 9 6-1z" fill="${c}"/>
    <path d="M32 20c9 0 15 6 15 13 0 8-6.5 14-15 17-8.5-3-15-9-15-17 0-7 6-13 15-13z" fill="${c}"/>
    <path d="M32 35c3.5 0 6 2.6 6 6.5S35.5 49 32 49s-6-2.6-6-7 2.5-7 6-7z" fill="#e2e8f0"/>
    ${eyes(26, 38, 31, 2.2)}<ellipse cx="32" cy="41" rx="2.4" ry="1.9" fill="#1b1206"/>`,
  // bjørn: runde ører
  bjorn: (c) => `<circle cx="20" cy="21" r="6.5" fill="${c}"/><circle cx="44" cy="21" r="6.5" fill="${c}"/>
    <circle cx="32" cy="35" r="16" fill="${c}"/>
    <ellipse cx="32" cy="40" rx="9" ry="7" fill="#f0dcc2"/>
    ${eyes(26.5, 37.5, 32, 2.2)}<ellipse cx="32" cy="38" rx="2.8" ry="2.2" fill="#1b1206"/>
    <path d="M29 43c1.8 1.4 4.2 1.4 6 0" stroke="#5b3b22" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  // raket
  raket: (c) => `<path d="M32 8c7 6 10 14 10 22v8H22v-8c0-8 3-16 10-22z" fill="${c}"/>
    <circle cx="32" cy="26" r="5" fill="#2d1f4a"/>
    <path d="M22 32 14 44h8zM42 32l8 12h-8z" fill="#a78bfa"/>
    <path d="M27 40h10l-5 14z" fill="#fbbf24"/>`,
  // skruenøgle
  vaerktoj: (c) => `<path d="M41 13a11 11 0 0 0-10.6 14L14 43.4a4 4 0 0 0 5.6 5.6L36 32.6A11 11 0 0 0 50 22c0-1.6-.3-3.1-.9-4.5l-6.7 6.7-5.6-5.6 6.7-6.7A11 11 0 0 0 41 13z" fill="${c}"/>
    <circle cx="18" cy="45" r="2.3" fill="#2a2008"/>`,
  // træ
  trae: (c) => `<path d="M32 9 44 27H20zM32 19l14 20H18z" fill="${c}"/>
    <path d="M32 30l16 21H16z" fill="#34d399"/>
    <rect x="29" y="47" width="6" height="9" rx="2" fill="#8a5a33"/>`,
  // bølge
  boelge: (c) => `<path d="M8 38c6 0 6-6 12-6s6 6 12 6 6-6 12-6 6 6 12 6v10H8z" fill="${c}"/>
    <path d="M8 28c6 0 6-5 12-5s6 5 12 5 6-5 12-5 6 5 12 5" stroke="#bae6fd" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".7"/>`,
};

Object.assign(BG, EXTRA_BG);
Object.assign(FIG, EXTRA);

/** Figurerne man kan vælge som sin egen avatar. Gemmes som "a:<id>". */
export const PICKABLE = ['lise', 'grete', 'ulv', 'bjorn', 'pind', 'nora', 'mini', 'viktor', 'tanja',
  'sofie', 'astrid', 'freja', 'emil', 'karl', 'holger', 'storm', 'raket', 'vaerktoj', 'trae', 'boelge', 'bo'];

/** Gamle emoji-avatarer → den nærmeste tegning, så ingen mister sin. */
const FROM_EMOJI = {
  '⚡': 'tanja', '🦊': 'grete', '🐺': 'ulv', '🦁': 'grete', '🐯': 'grete', '🐻': 'bjorn', '🦅': 'pind',
  '🐉': 'viktor', '🔧': 'vaerktoj', '💡': 'mini', '🛸': 'raket', '🔬': 'emil', '🎯': 'freja', '🚀': 'raket',
  '🏆': 'astrid', '🌊': 'boelge', '🤖': 'emil', '🔌': 'vaerktoj', '🧠': 'pind', '🌲': 'trae', '🏔️': 'storm',
  '🍂': 'grete', '❄️': 'storm', '🌸': 'nora', '☀️': 'mini',
};

/** "a:grete" eller en gammel emoji → figurens id. Tom, hvis vi ikke har en tegning. */
export function avatarId(v) {
  const s = String(v || '');
  const id = s.startsWith('a:') ? s.slice(2) : FROM_EMOJI[s] || '';
  return FIG[id] ? id : '';
}

/** Figuren som SVG-tekst. size = 0 lader CSS bestemme størrelsen. */
export function botAvatarSvg(id, size = 44) {
  const [bg, c] = BG[id] || ['#241a10', '#fb923c'];
  const fig = FIG[id];
  const wh = size ? ` width="${size}" height="${size}"` : '';
  if (!fig) return `<svg class="bot-ava"${wh} viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#241a10"/><circle cx="32" cy="27" r="10" fill="#fb923c"/><path d="M15 52c2.5-8 9-12 17-12s14.5 4 17 12z" fill="#fb923c"/></svg>`;
  return `<svg class="bot-ava"${wh} viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="18" fill="${bg}"/>${fig(c)}</svg>`;
}

/** Figuren som element. */
export function botAvatar(id, size = 44) {
  const t = document.createElement('template');
  t.innerHTML = botAvatarSvg(id, size);
  return t.content.firstElementChild;
}
