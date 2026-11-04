/** Noter without DOM: #tags, checklists and "keep the list going" when you press Enter. */
export const tagsOf = (text) => [...new Set((String(text || '').match(/(^|\s)#([\p{L}\p{N}_-]{2,30})/gu) || []).map(t => t.trim().slice(1).toLowerCase()))];

/** Lines that are checklist items: [{ line, done, text }] */
export function checklist(body) {
  const out = [];
  String(body || '').split('\n').forEach((l, i) => { const m = /^(\s*)(?:[-*]\s+)?\[( |x|X)\]\s?(.*)$/.exec(l); if (m) out.push({ line: i, done: m[2] !== ' ', text: m[3] }); });
  return out;
}

/** Toggle the checkbox on line i. */
export function toggleLine(body, i) {
  const lines = String(body || '').split('\n');
  lines[i] = lines[i].replace(/\[( |x|X)\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

/**
 * Enter at the end of a list line: what to insert. Returns null (normal Enter), { insert } for the next bullet,
 * or { clear: [start, end] } when the line was an empty bullet (Enter twice ends the list).
 */
export function continueList(value, caret) {
  const start = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(start, caret);
  const m = /^(\s*)([-*•]|\d+[.)])?(\s*)(\[[ xX]\]\s?)?/.exec(line);
  if (!m || (!m[2] && !m[4])) return null;
  const rest = line.slice(m[0].length);
  if (!rest.trim()) return { clear: [start, caret] };
  let bullet = m[2] || '';
  if (/^\d+/.test(bullet)) bullet = `${Number(bullet.match(/\d+/)[0]) + 1}${bullet.slice(-1)}`;
  return { insert: `\n${m[1]}${bullet}${bullet ? (m[3] || ' ') : ''}${m[4] ? '[ ] ' : ''}` };
}
