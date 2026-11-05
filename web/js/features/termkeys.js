/** Keys for the Linux terminal's extra key row (like Termux): what each one sends to the machine. Pure – tested in tests/apps.test.mjs. */

export const EXTRA_KEYS = [
  ['esc', 'ESC'], ['tab', 'TAB'], ['ctrl', 'CTRL'], ['alt', 'ALT'], ['-', '-'], ['/', '/'], ['|', '|'], ['~', '~'],
  ['home', 'HOME'], ['up', '↑'], ['end', 'END'], ['left', '←'], ['down', '↓'], ['right', '→'],
];

const SEQ = { esc: '\x1b', tab: '\t', up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', home: '\x1b[H', end: '\x1b[F', enter: '\r', backspace: '\x7f' };

/** Ctrl+<char>: a–z and a few symbols become control codes (Ctrl+C = \x03). */
export function ctrl(ch) {
  const c = String(ch || '').toLowerCase();
  if (c >= 'a' && c <= 'z') return String.fromCharCode(c.charCodeAt(0) - 96);
  return { '@': '\x00', '[': '\x1b', '\\': '\x1c', ']': '\x1d', '^': '\x1e', '_': '\x1f', ' ': '\x00' }[c] ?? c;
}

/** What a key sends, with the sticky CTRL/ALT from the key row applied. */
export function keySeq(key, { ctrl: c = false, alt = false } = {}) {
  let s = SEQ[key] ?? key;
  if (c && s.length === 1) s = ctrl(s);
  if (alt) s = '\x1b' + s;
  return s;
}

/** Commands worth trying, with a Danish line on what they show. */
export const TRY = [
  ['ls -la', 'Vis alle filer – også de skjulte'],
  ['uname -a', 'Hvilken Linux-kerne kører maskinen?'],
  ['cat /etc/os-release', 'Hvilken Linux-udgave er det?'],
  ['top', 'Se processerne live (q for at stoppe)'],
  ['mkdir projekt && cd projekt', 'Lav en mappe og gå ind i den'],
  ['echo "Hej fra Linux" > hej.txt && cat hej.txt', 'Skriv til en fil og læs den igen'],
  ['vi noter.txt', 'Teksteditoren vi (i = skriv, Esc og :wq = gem og luk)'],
  ['lua -e "print(2^10)"', 'Kør et lille program i Lua'],
  ['ps', 'Hvilke programmer kører?'],
  ['df -h && free -m', 'Disk og hukommelse'],
  ['tree /etc | head -30', 'Mappetræet under /etc'],
  ['history', 'De kommandoer, du har skrevet'],
];
