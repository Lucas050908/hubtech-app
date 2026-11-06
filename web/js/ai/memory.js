/**
 * Gnist remembers you: "Husk at jeg arbejder med lasere" is saved on your account and given to her with every question,
 * so the answers fit you. "Hvad husker du?", "Glem at …" and "Glem alt" work too. Handled by HUBTECH itself – instant,
 * no model needed. Pure (tested in tests/apps.test.mjs).
 */
export const MAX_MEMORY = 20;
const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').slice(0, 200);

/** What the user asked HUBTECH to do with the memory – or null for an ordinary question. */
export function parseMemoryCommand(q) {
  const t = String(q || '').trim();
  if (/^(hvad|hvilke ting) (husker|ved) du( egentlig)? om mig\??$|^hvad husker du\??$/i.test(t)) return { type: 'list' };
  if (/^glem (alt|alt hvad du ved|alt om mig|alt du husker)( om mig)?[.!]?$/i.test(t)) return { type: 'forgetAll' };
  let m = t.match(/^glem(?: at| det med| om)?\s+(.{3,})$/i);
  if (m) return { type: 'forget', text: clean(m[1]) };
  m = t.match(/^(?:husk(?: lige)?(?: at| på| det)?|kan du huske at|du skal huske at|bemærk at|notér at|noter at)[:,]?\s+(.{3,})$/i);
  if (m) return { type: 'remember', text: clean(m[1]).replace(/^(at|på)\s+/i, '') };
  return null;
}

const words = (s) => String(s).toLowerCase().match(/[a-zæøå0-9]{3,}/g) || [];
/** Do what the command says. Returns { list, reply } (list is a new array). */
export function applyMemory(list = [], cmd) {
  let l = [...list];
  if (cmd.type === 'list') return { list: l, reply: l.length ? `Det husker jeg om dig:\n${l.map(x => `- ${x.text}`).join('\n')}\n\nSkriv «Glem at …» eller «Glem alt», hvis noget skal væk.` : 'Jeg husker ikke noget om dig endnu. Skriv fx «Husk at jeg arbejder med lasere», så tager jeg det med i mine svar.' };
  if (cmd.type === 'forgetAll') return { list: [], reply: l.length ? `Glemt – jeg har slettet alle ${l.length} ting, jeg huskede om dig.` : 'Der var ikke noget at glemme.' };
  if (cmd.type === 'forget') {
    const q = new Set(words(cmd.text));
    const hit = l.filter(x => { const w = words(x.text); return w.length && w.filter(y => q.has(y)).length >= Math.min(2, q.size); });
    if (!hit.length) return { list: l, reply: `Jeg kunne ikke finde noget om «${cmd.text}» i det, jeg husker. Skriv «Hvad husker du?» for at se listen.` };
    l = l.filter(x => !hit.includes(x));
    return { list: l, reply: `Glemt: ${hit.map(x => `«${x.text}»`).join(', ')}.` };
  }
  if (cmd.type === 'remember') {
    const text = cmd.text.charAt(0).toUpperCase() + cmd.text.slice(1);
    if (l.some(x => x.text.toLowerCase() === text.toLowerCase())) return { list: l, reply: `Det husker jeg allerede: «${text}».` };
    l.push({ text, at: Date.now() });
    if (l.length > MAX_MEMORY) l = l.slice(-MAX_MEMORY);
    return { list: l, reply: `Det husker jeg nu: «${text}». Jeg tager det med i mine svar fremover. (Skriv «Hvad husker du?» for at se alt.)` };
  }
  return { list: l, reply: '' };
}

/** The part of the system prompt with what the user has told Gnist to remember. */
export function memoryBlock(list = []) {
  if (!list.length) return '';
  let out = '', n = 0;
  for (const x of list.slice(-12)) { const line = `- ${x.text}\n`; if (out.length + line.length > 700) break; out += line; n++; }
  return n ? `Det har brugeren selv bedt dig huske (brug det, når det passer – nævn det ikke hver gang):\n${out.trim()}` : '';
}
