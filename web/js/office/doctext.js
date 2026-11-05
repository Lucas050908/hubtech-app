/** Document editor helpers without DOM (tested in node). */
/** Typing one of these at the start of a paragraph, then a space, turns it into … */
export function shortcutFor(prefix) {
  return ({ '#': ['block', 'h1'], '##': ['block', 'h2'], '###': ['block', 'h3'], '>': ['block', 'blockquote'], '-': ['ul'], '*': ['ul'], '1.': ['ol'], '1)': ['ol'], '[]': ['check'], '[ ]': ['check'] })[prefix] || null;
}
/** Where `q` occurs in `text` (case-insensitive unless `exact`): [start, …] */
export function findAll(text, q, exact = false) {
  if (!q) return [];
  const a = exact ? text : text.toLocaleLowerCase('da-DK'), b = exact ? q : q.toLocaleLowerCase('da-DK');
  const out = [];
  for (let i = a.indexOf(b); i >= 0; i = a.indexOf(b, i + b.length)) out.push(i);
  return out;
}


/** Keep the case of what is replaced: "Æbler" → "Pærer", "ÆBLER" → "PÆRER" (only when not matching exactly). */
export function keepCase(found, repl) {
  if (!repl || !found) return repl;
  if (found.length > 1 && found === found.toLocaleUpperCase('da-DK') && found !== found.toLocaleLowerCase('da-DK')) return repl.toLocaleUpperCase('da-DK');
  if (found[0] !== found[0].toLocaleLowerCase('da-DK')) return repl[0].toLocaleUpperCase('da-DK') + repl.slice(1);
  return repl;
}
