/** Pure calculations for the IT & network tools in Værktøjskassen (unit-tested in tests/ittools.test.mjs). */

export const ipToInt = (ip) => {
  const p = String(ip).trim().split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((a, x) => a * 256 + Number(x), 0);
};
export const intToIp = (n) => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');
const maskFromPrefix = (p) => p === 0 ? 0 : (2 ** 32 - 2 ** (32 - p));
export function prefixFromMask(mask) {
  const n = ipToInt(mask);
  if (n === null) return null;
  const bits = n.toString(2).padStart(32, '0');
  return /^1*0*$/.test(bits) ? bits.indexOf('0') === -1 ? 32 : bits.indexOf('0') : null;
}

/** "192.168.1.10/24", "192.168.1.10 255.255.255.0" or just an IP (→ /24). */
export function subnet(input) {
  const s = String(input || '').trim();
  const m = s.match(/^(\d+\.\d+\.\d+\.\d+)\s*(?:\/\s*(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))?$/);
  if (!m) return { error: 'Skriv en IP-adresse med prefiks, fx 192.168.1.10/24.' };
  const ip = ipToInt(m[1]);
  if (ip === null) return { error: 'IP-adressen er ugyldig – hvert tal skal være 0–255.' };
  let prefix = m[2] !== undefined ? Number(m[2]) : m[3] ? prefixFromMask(m[3]) : 24;
  if (prefix === null || prefix > 32) return { error: 'Ugyldig subnetmaske/prefiks (0–32).' };
  const mask = maskFromPrefix(prefix);
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ip / size) * size;
  const broadcast = network + size - 1;
  const hosts = prefix >= 31 ? size : size - 2;
  const first = prefix >= 31 ? network : network + 1, last = prefix >= 31 ? broadcast : broadcast - 1;
  const a = Math.floor(ip / 2 ** 24), b = Math.floor(ip / 2 ** 16) % 256;
  const kind = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ? 'Privat (RFC 1918)'
    : a === 127 ? 'Loopback' : a === 169 && b === 254 ? 'Link-local (APIPA – ingen DHCP?)' : a === 100 && b >= 64 && b <= 127 ? 'CGNAT / Tailscale'
    : a >= 224 && a <= 239 ? 'Multicast' : a >= 240 ? 'Reserveret' : 'Offentlig';
  return {
    ip: intToIp(ip), prefix, mask: intToIp(mask), wildcard: intToIp(2 ** 32 - 1 - mask),
    network: intToIp(network), broadcast: intToIp(broadcast), first: intToIp(first), last: intToIp(last), hosts, kind,
    binary: [24, 16, 8, 0].map(s => (Math.floor(mask / 2 ** s) % 256).toString(2).padStart(8, '0')).join('.'),
  };
}

/** Parse a number written as 0x1F, 0b1010, 0o17 or with an explicit base; returns BigInt or null. */
export function parseBase(str, base = 10) {
  let s = String(str || '').trim().replace(/[\s_]/g, '').toLowerCase();
  if (!s) return null;
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const pre = { '0x': 16, '0b': 2, '0o': 8 }[s.slice(0, 2)];
  if (pre && s.length > 2) { base = pre; s = s.slice(2); }
  const digits = '0123456789abcdef'.slice(0, base);
  if (!s || [...s].some(ch => !digits.includes(ch))) return null;
  let v = 0n;
  for (const ch of s) v = v * BigInt(base) + BigInt(digits.indexOf(ch));
  return neg ? -v : v;
}
export function toBases(v) {
  const neg = v < 0n, a = neg ? -v : v, sg = neg ? '-' : '';
  const group = (s, n) => s.replace(new RegExp(`\\B(?=(.{${n}})+$)`, 'g'), ' ');
  return { dec: sg + a.toString(10), hex: sg + a.toString(16).toUpperCase(), bin: sg + group(a.toString(2), 4), oct: sg + a.toString(8),
    ascii: !neg && a >= 32n && a < 127n ? String.fromCharCode(Number(a)) : '' };
}

/** Transfer time for `bytes` at `mbit` Mbit/s, as seconds. */
export const transferSeconds = (bytes, mbit) => (bytes * 8) / (mbit * 1e6);
export function fmtDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '–';
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  const d = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), mm = Math.floor(sec % 3600 / 60), ss = Math.round(sec % 60);
  return [d && `${d} d`, hh && `${hh} t`, mm && `${mm} min`, (ss || (!d && !hh && !mm)) && !d && `${ss} s`].filter(Boolean).join(' ');
}

/** Voltage drop in a two-wire cable: ΔU = 2 · L · I · ρ / A (copper ρ = 0.0175 Ω·mm²/m, aluminium 0.028). */
export function voltageDrop({ length, current, area, voltage = 230, rho = 0.0175, threePhase = false }) {
  const du = (threePhase ? Math.sqrt(3) : 2) * length * current * rho / area;
  return { du, pct: du / voltage * 100, loss: (threePhase ? 3 : 2) * length * rho / area * current * current };
}

/** Battery life in hours with a derating factor for real-world conditions. */
export const batteryHours = (mAh, mA, derate = 0.8) => (mAh * derate) / mA;
