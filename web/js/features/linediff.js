/**
 * Line diff for Projektrum's changes (pure – tested). diffLines gives every line as kept (' '), added ('+') or
 * removed ('-'); hunks() groups the changes with a few lines around them, like a review on GitHub.
 */
export function diffLines(oldText, newText) {
  const lines = (t) => (t == null || t === '' ? [] : String(t).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));   // a last newline is not a line of its own
  const a = lines(oldText), b = lines(newText);
  // common start and end first – most changes are small
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea), B = b.slice(s, eb);
  const mid = [];
  if (A.length * B.length > 4_000_000) {             // very big: show it as removed and added
    A.forEach(x => mid.push({ t: '-', s: x })); B.forEach(x => mid.push({ t: '+', s: x }));
  } else {
    const n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { mid.push({ t: ' ', s: A[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) mid.push({ t: '-', s: A[i++] });
      else mid.push({ t: '+', s: B[j++] });
    }
    while (i < n) mid.push({ t: '-', s: A[i++] });
    while (j < m) mid.push({ t: '+', s: B[j++] });
  }
  const out = [...a.slice(0, s).map(x => ({ t: ' ', s: x })), ...mid, ...a.slice(ea).map(x => ({ t: ' ', s: x }))];
  let ln = 0, rn = 0;
  for (const d of out) { if (d.t !== '+') d.a = ++ln; if (d.t !== '-') d.b = ++rn; }
  return out;
}

export function countChanges(lines) {
  let add = 0, del = 0;
  for (const d of lines) { if (d.t === '+') add++; else if (d.t === '-') del++; }
  return { add, del };
}

/** Changed parts with `ctx` lines around them: [{ from, lines }] */
export function hunks(lines, ctx = 3) {
  const out = [];
  let cur = null, lastChange = -Infinity;
  lines.forEach((d, i) => {
    if (d.t !== ' ') {
      if (!cur || i - lastChange > ctx * 2) {
        if (cur) for (let k = lastChange + 1; k < lastChange + 1 + ctx; k++) cur.lines.push(lines[k]);
        cur = { from: Math.max(0, i - ctx), lines: [] };
        out.push(cur);
        for (let k = cur.from; k < i; k++) cur.lines.push(lines[k]);
      } else {
        for (let k = lastChange + 1; k < i; k++) cur.lines.push(lines[k]);
      }
      cur.lines.push(d);
      lastChange = i;
    }
  });
  if (cur) for (let k = lastChange + 1; k < Math.min(lines.length, lastChange + 1 + ctx); k++) cur.lines.push(lines[k]);
  return out;
}

/** A unified diff as text (for an AI review). */
export function unified(path, oldText, newText, ctx = 3) {
  const hs = hunks(diffLines(oldText, newText), ctx);
  if (!hs.length) return '';
  return [`--- ${path}`, `+++ ${path}`, ...hs.flatMap(hk => [`@@ linje ${hk.lines.find(d => d.b)?.b ?? hk.lines[0].a ?? 1} @@`, ...hk.lines.map(d => `${d.t}${d.s}`)])].join('\n');
}
