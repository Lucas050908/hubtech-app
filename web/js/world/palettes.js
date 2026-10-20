/**
 * Colour science for the world: seasons × time of day.
 * The terrain is identical in every season (same seed) — only light, colour and life change,
 * so a season switch feels like the same valley turning, not a slideshow.
 */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_LABEL = { spring: 'Forår', summer: 'Sommer', autumn: 'Efterår', winter: 'Vinter' };
export const SEASON_ICON = { spring: 'flower', summer: 'sun', autumn: 'leaf', winter: 'snow' };
export const TIMES = ['dawn', 'day', 'dusk', 'night'];
export const TIME_LABEL = { dawn: 'Daggry', day: 'Dag', dusk: 'Gylden time', night: 'Nat' };
export const WEATHER_LABEL = { auto: 'Automatisk', clear: 'Klart', drizzle: 'Let regn', rain: 'Regn', snow: 'Sne', fog: 'Tåge' };

// ── colour helpers ──────────────────────────────────────────────────────
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function mul(a, k) { return Array.isArray(k) ? [a[0] * k[0] / 255, a[1] * k[1] / 255, a[2] * k[2] / 255] : [a[0] * k, a[1] * k, a[2] * k]; }
export function css(c, a = 1) {
  const r = Math.max(0, Math.min(255, Math.round(c[0])));
  const g = Math.max(0, Math.min(255, Math.round(c[1])));
  const b = Math.max(0, Math.min(255, Math.round(c[2])));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
const H = rgb;

// ── sky per time of day ─────────────────────────────────────────────────
const SKY = {
  dawn:  { top: H('#2f4f8a'), mid: H('#d98aa0'), low: H('#ffc999'), sun: H('#ffe1b8'), sunPos: [0.43, 0.575], sunR: 0.032, light: H('#ffd2b0'), ambient: 0.78, stars: 0.12 },
  day:   { top: H('#2f6fc7'), mid: H('#78aee6'), low: H('#d9ecf6'), sun: H('#fff8e6'), sunPos: [0.66, 0.15], sunR: 0.028, light: H('#fff6e2'), ambient: 1.0, stars: 0 },
  dusk:  { top: H('#1f4c86'), mid: H('#e98a57'), low: H('#ffd58a'), sun: H('#fff4c8'), sunPos: [0.56, 0.4], sunR: 0.034, light: H('#ffb469'), ambient: 0.9, stars: 0.03 },
  night: { top: H('#040a1a'), mid: H('#0c1b38'), low: H('#1e365e'), sun: H('#e6eeff'), sunPos: [0.63, 0.19], sunR: 0.022, light: H('#9fb6e8'), ambient: 0.3, stars: 1, moon: true },
};

// season tint applied to sky (amount, colour)
const SKY_TINT = {
  spring: [0.08, H('#cfe8d6')],
  summer: [0.0, H('#ffffff')],
  autumn: [0.12, H('#e8b48a')],
  winter: [0.22, H('#c4d4e6')],
};

const LAND = {
  spring: {
    ridges: [H('#7d93b4'), H('#647f98'), H('#4d6c6a')],
    rock: H('#5d6f72'),
    snowline: 0.74, snow: H('#f4f8ff'),
    hill: [H('#5f9e45'), H('#86c057')], hillDark: H('#2f5a2c'),
    fore: [H('#3f7a33'), H('#1f3f22')],
    conifer: H('#24502f'), decid: [H('#8fd06b'), H('#f2b7cf'), H('#b9e38c'), H('#f7d6e4'), H('#6fb954')], decidShare: 0.55,
    lake: H('#3e6e8a'), ice: 0,
    particles: 'petals', weather: 'clear', grass: H('#7cbf52'),
  },
  summer: {
    ridges: [H('#6e8fb7'), H('#4f7487'), H('#3b6447')],
    rock: H('#556a6c'),
    snowline: 0.88, snow: H('#f0f6ff'),
    hill: [H('#2f7a38'), H('#4f9c3f')], hillDark: H('#173f22'),
    fore: [H('#245f2c'), H('#0f2a17')],
    conifer: H('#1a4a2b'), decid: [H('#2f8a3d'), H('#3f9b46'), H('#25713a'), H('#4fa84a'), H('#c8702e'), H('#d9a23a')], decidShare: 0.5,
    lake: H('#2f6a86'), ice: 0,
    particles: 'motes', weather: 'clear', grass: H('#4a9a3c'),
  },
  autumn: {
    ridges: [H('#8b8fb0'), H('#7a6e7c'), H('#7a5a3c')],
    rock: H('#6b5f5a'),
    snowline: 0.8, snow: H('#f2f4fa'),
    hill: [H('#a8702a'), H('#c89838')], hillDark: H('#4f2f16'),
    fore: [H('#7a4a1f'), H('#2c1a0d')],
    conifer: H('#2b4a33'), decid: [H('#e2832b'), H('#c9472a'), H('#eab23a'), H('#a8521e'), H('#f0c24a')], decidShare: 0.7,
    lake: H('#4b5f78'), ice: 0,
    particles: 'leaves', weather: 'clear', grass: H('#b8893a'),
  },
  winter: {
    ridges: [H('#bccae0'), H('#93a8c3'), H('#7489a6')],
    rock: H('#6f7f95'),
    snowline: 0.32, snow: H('#f7fbff'),
    hill: [H('#dfe9f3'), H('#f2f7fb')], hillDark: H('#8aa0bb'),
    fore: [H('#c9d8e6'), H('#5a6f8a')],
    conifer: H('#26473f'), decid: [H('#6e6258')], decidShare: 0.35, bare: true,
    lake: H('#9fb8cf'), ice: 0.75,
    particles: 'snow', weather: 'snow', grass: H('#c6d6e4'),
  },
};

export function seasonForDate(date = new Date(), lat = null) {
  const m = date.getMonth(); // 0..11
  // meteorological seasons (Northern hemisphere)
  let s = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  if (lat !== null && lat < 0) s = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[s];
  return s;
}

/** Time of day by local clock. With a latitude we stretch day length by season (rough, offline). */
export function timeForDate(date = new Date(), lat = null, season = null) {
  const h = date.getHours() + date.getMinutes() / 60;
  let rise = 6.5, set = 19;
  const s = season || seasonForDate(date, lat);
  const span = lat == null ? 1 : Math.min(1.6, Math.abs(lat) / 40);
  const adj = { winter: 2.2, autumn: 0.8, spring: 0.4, summer: -1.6 }[s] * span;
  rise += adj * 0.6; set -= adj;
  if (h >= rise - 0.6 && h < rise + 1.4) return 'dawn';
  if (h >= rise + 1.4 && h < set - 1.6) return 'day';
  if (h >= set - 1.6 && h < set + 0.8) return 'dusk';
  return 'night';
}

export function resolvePalette(season, time) {
  const sky0 = SKY[time] || SKY.dusk;
  const land = LAND[season] || LAND.summer;
  const [ta, tc] = SKY_TINT[season];
  const sky = {
    ...sky0,
    top: mix(sky0.top, tc, ta * (time === 'night' ? 0.25 : 1)),
    mid: mix(sky0.mid, tc, ta * (time === 'night' ? 0.25 : 1)),
    low: mix(sky0.low, tc, ta * (time === 'night' ? 0.25 : 0.8)),
  };
  // terrain light: ambient × light colour (night = deep blue, dusk = warm)
  const lightK = mix([255, 255, 255], sky.light, time === 'day' ? 0.25 : 0.55);
  const amb = sky.ambient;
  const shade = (c) => mul(mul(c, lightK), amb);
  return { season, time, sky, land, shade, haze: sky.low };
}
