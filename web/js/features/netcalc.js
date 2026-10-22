/** Netværksberegner – pure functions (unit-tested in tests/apps.test.mjs): IPv4 subnets, download times and units. */

/** "192.168.1.10" → number (or null) */
export function ipToInt(ip) {
  const p = String(ip || '').trim().split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((n, x) => n * 256 + Number(x), 0);
}
export const intToIp = (n) => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');
export const prefixToMask = (p) => (p === 0 ? 0 : (2 ** 32 - 2 ** (32 - p)));
export function maskToPrefix(mask) {
  const n = typeof mask === 'number' ? mask : ipToInt(mask);
  if (n == null) return null;
  const bits = n.toString(2).padStart(32, '0');
  return /^1*0*$/.test(bits) ? bits.split('1').length - 1 : null;
}
export const toBinary = (n) => [24, 16, 8, 0].map(s => (Math.floor(n / 2 ** s) % 256).toString(2).padStart(8, '0')).join('.');

/** "10.0.0.5/8", "10.0.0.5 255.0.0.0" or "10.0.0.5" + prefix → the subnet, or { error } */
export function parseCidr(text, fallbackPrefix = 24) {
  const t = String(text || '').trim();
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\s*(?:\/\s*(\d{1,2})|\s+(\d{1,3}(?:\.\d{1,3}){3}))?$/.exec(t);
  if (!m) return { error: 'Skriv en IPv4-adresse, fx 192.168.1.10/24 eller 192.168.1.10 255.255.255.0.' };
  const ip = ipToInt(m[1]);
  if (ip == null) return { error: 'Hvert tal i adressen skal være mellem 0 og 255.' };
  let prefix = fallbackPrefix;
  if (m[2] != null) prefix = Number(m[2]);
  else if (m[3]) { prefix = maskToPrefix(m[3]); if (prefix == null) return { error: 'Netmasken er ikke gyldig (den skal være 1-taller efterfulgt af 0-taller, fx 255.255.255.0).' }; }
  if (!(prefix >= 0 && prefix <= 32)) return { error: 'Præfikset skal være mellem /0 og /32.' };
  return subnet(ip, prefix);
}
export function subnet(ip, prefix) {
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ip / size) * size, broadcast = network + size - 1;
  const hosts = prefix >= 31 ? size : size - 2;
  return {
    ip, prefix, size, network, broadcast, hosts,
    first: prefix >= 31 ? network : network + 1, last: prefix >= 31 ? broadcast : broadcast - 1,
    mask: prefixToMask(prefix), wildcard: size - 1,
    kind: kindOf(ip), cls: classOf(ip),
  };
}
const inRange = (ip, cidr) => { const [a, p] = cidr.split('/'); const s = 2 ** (32 - Number(p)); return Math.floor(ip / s) * s === ipToInt(a); };
export function kindOf(ip) {
  if (['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].some(c => inRange(ip, c))) return 'Privat (bruges kun på lokalnet)';
  if (inRange(ip, '127.0.0.0/8')) return 'Loopback (computeren selv)';
  if (inRange(ip, '169.254.0.0/16')) return 'Link-local (fik ingen adresse fra DHCP)';
  if (inRange(ip, '100.64.0.0/10')) return 'CGNAT / delt adresse (fx Tailscale)';
  if (inRange(ip, '224.0.0.0/4')) return 'Multicast';
  if (inRange(ip, '240.0.0.0/4')) return 'Reserveret';
  if (ip === 0) return 'Ukendt adresse (0.0.0.0)';
  return 'Offentlig (kan ses på internettet)';
}
export function classOf(ip) {
  const a = Math.floor(ip / 2 ** 24);
  return a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D' : 'E';
}
export const sameSubnet = (a, b, prefix) => { const s = 2 ** (32 - prefix); return Math.floor(a / s) === Math.floor(b / s); };

/** Split a network into `count` equal subnets (rounded up to a power of two). */
export function split(net, count) {
  const extra = Math.ceil(Math.log2(Math.max(1, count)));
  const prefix = net.prefix + extra;
  if (prefix > 32) return { error: 'Netværket er for lille til så mange delnet.' };
  const size = 2 ** (32 - prefix), n = 2 ** extra;
  return { prefix, list: Array.from({ length: Math.min(n, 256) }, (_, i) => subnet(net.network + i * size, prefix)), total: n };
}
/** The smallest prefix that has room for `hosts` devices. */
export function prefixFor(hosts) {
  for (let p = 30; p >= 0; p--) if (2 ** (32 - p) - 2 >= hosts) return p;
  return 0;
}

// ── speed and size ──
export const UNITS = {
  bit: 1 / 8, B: 1,
  kB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12,
  KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4,
  kbit: 1e3 / 8, Mbit: 1e6 / 8, Gbit: 1e9 / 8,
};
export const convert = (value, from, to) => (value * UNITS[from]) / UNITS[to];
/** seconds to move `size` (in unit) at `speed` Mbit/s */
export const downloadSecs = (size, unit, mbit) => (mbit > 0 ? (size * UNITS[unit] * 8) / (mbit * 1e6) : Infinity);
export function fmtDuration(s) {
  if (!isFinite(s)) return '–';
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  if (s < 60) return `${s < 10 ? s.toFixed(1).replace('.', ',') : Math.round(s)} sek.`;
  const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = Math.round(s % 60);
  if (d) return `${d} d. ${hh} t.`;
  if (hh) return `${hh} t. ${mm} min.`;
  return `${mm} min. ${ss} sek.`;
}
export function fmtNum(n, max = 3) {
  if (!isFinite(n)) return '–';
  if (n !== 0 && Math.abs(n) < 0.001) return n.toExponential(2).replace('.', ',');
  return n.toLocaleString('da-DK', { maximumFractionDigits: max });
}
