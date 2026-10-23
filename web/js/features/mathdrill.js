/** Regnemester: generate arithmetic tasks and track which ones you struggle with. */
export const OPS = { add: '+', sub: '−', mul: '·', div: ':' };
/** a task: { a, b, op, answer, key } – key identifies "the same task" for statistics */
export function task(op, level, rnd = Math.random, tables = null) {
  const R = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const max = [10, 20, 100, 1000][Math.max(0, Math.min(3, level))];
  let a, b, answer;
  if (op === 'add') { a = R(0, max); b = R(0, max - a); answer = a + b; }
  else if (op === 'sub') { a = R(0, max); b = R(0, a); answer = a - b; }
  else if (op === 'mul') { const t = tables?.length ? tables[R(0, tables.length - 1)] : R(1, level < 2 ? 10 : 12); a = t; b = R(1, 10); if (rnd() < 0.5) [a, b] = [b, a]; answer = a * b; }
  else { const t = tables?.length ? tables[R(0, tables.length - 1)] : R(1, level < 2 ? 10 : 12); b = t; answer = R(1, 10); a = b * answer; }
  return { a, b, op, answer, key: op === 'mul' ? `mul:${Math.min(a, b)}x${Math.max(a, b)}` : `${op}:${a}:${b}` };
}
/** pick a task, preferring ones you got wrong before (weights from stats { key: { right, wrong } }) */
export function nextTask(op, level, stats = {}, rnd = Math.random, tables = null) {
  const hard = Object.entries(stats).filter(([k, v]) => k.startsWith(op === 'mul' ? 'mul:' : `${op}:`) && v.wrong > v.right);
  if (hard.length && rnd() < 0.3) {
    const [k] = hard[Math.floor(rnd() * hard.length)];
    if (op === 'mul') { const [x, y] = k.slice(4).split('x').map(Number); return { a: x, b: y, op, answer: x * y, key: k }; }
    const [, x, y] = k.split(':').map(Number); return { a: x, b: y, op, answer: op === 'add' ? x + y : op === 'sub' ? x - y : x / y, key: k };
  }
  return task(op, level, rnd, tables);
}
export function record(stats, t, ok) { const s = stats[t.key] ||= { right: 0, wrong: 0 }; ok ? s.right++ : s.wrong++; return stats; }
/** for the multiplication grid: how well each table cell is known: null (never), 0..1 */
export function mastery(stats, x, y) { const s = stats[`mul:${Math.min(x, y)}x${Math.max(x, y)}`]; return s ? s.right / (s.right + s.wrong) : null; }
