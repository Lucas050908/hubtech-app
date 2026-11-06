/**
 * Small things that make Gnist's answers better: suggestions that fit the page you are on, stopping a small model that
 * starts repeating itself, and tidying repeated lines out of an answer. Pure (tested in tests/apps.test.mjs).
 */
const BY_PAGE = [
  [/^#\/apps\/chess/, ['Hvordan går springeren i skak?', 'Hvad er en god åbning for en begynder?', 'Hvad betyder en passant?']],
  [/^#\/apps\/(tasks|calendar|dayplan|booking)/, ['Hvad skal jeg nå i dag?', 'Hjælp mig med at planlægge min uge', 'Lav en aftale i morgen kl. 10 med tandlægen']],
  [/^#\/apps\/notes/, ['Lav et kort resumé af mine noter', 'Find mine noter om printere', 'Lav en tjekliste ud fra min seneste note']],
  [/^#\/apps\/(budget|expenses|savings|piggy|loans|splitbill)/, ['Lav et cirkeldiagram: husleje 6000, mad 3000, transport 1200', 'Hvad er 1000 kr med moms?', 'Hvad er 15 % af 2.400?']],
  [/^#\/apps\/printerdoctor/, ['Min printer er offline – hvad gør jeg?', 'Printeren laver striber på papiret', 'Hvordan installerer jeg en netværksprinter?']],
  [/^#\/learn\/linux|^#\/apps\/linux/, ['Hvad gør kommandoen ls -la?', 'Hvordan laver jeg en mappe i Linux?', 'Hvad er forskellen på cp og mv?']],
  [/^#\/learn\/labs|^#\/apps\/(laser|printer3d)/, ['Hvorfor skærer laseren ikke igennem?', 'Hvilken temperatur skal PLA have?', 'Hvordan finder jeg fokus på en CO2-laser?']],
  [/^#\/learn\/codeschool/, ['Forklar lektionen med andre ord', 'Giv mig et lille eksempel', 'Hvad betyder fejlbeskeden?']],
  [/^#\/learn/, ['Forklar det her enklere', 'Giv mig tre øvelsesspørgsmål', 'Hvad er det vigtigste at huske?']],
];
const DEFAULT = ['Hvad skal jeg nå i dag?', 'Min printer er offline – hvad gør jeg?', 'Lav en graf over jan 5, feb 8 og mar 3', 'Hvor mange dage er der til jul?', 'Husk at jeg arbejder med lasere'];

/** Up to five suggestions for an empty chat: the page's own first, then general ones. */
export function pageSuggestions(hash = '') {
  const hit = BY_PAGE.find(([re]) => re.test(hash)), own = hit ? hit[1] : [];   // the first rule that fits
  return [...new Set([...own, ...DEFAULT])].slice(0, 5);
}

/** True when the text ends in the same piece repeated three times or more – a small model stuck in a loop. */
export function isLooping(text) {
  const t = String(text || '');
  if (t.length < 90) return false;
  for (let L = 12; L <= 160 && L * 3 <= t.length; L++) {
    const tail = t.slice(-L);
    if (tail.trim().length < 8) continue;
    if (t.endsWith(tail + tail + tail)) return true;
  }
  // the same line three times in a row
  const lines = t.split('\n').map(x => x.trim()).filter(Boolean);
  const n = lines.length;
  return n >= 3 && lines[n - 1].length > 10 && lines[n - 1] === lines[n - 2] && lines[n - 2] === lines[n - 3];
}

/** Remove what a small model repeats: the same line again and again, and a sentence said three times. */
export function tidyAnswer(text) {
  const src = String(text || '');
  const parts = src.split(/(```[\s\S]*?(?:```|$))/);   // code and charts are left as they are
  const seen = new Map();
  const out = parts.map(part => {
    if (part.startsWith('```')) return part;
    const lines = part.split('\n');
    const keep = [];
    for (const line of lines) {
      const k = line.trim().toLowerCase();
      if (k && keep.length && keep[keep.length - 1].trim().toLowerCase() === k) continue;   // the same line twice in a row
      if (k.length > 15) { const c = (seen.get(k) || 0) + 1; seen.set(k, c); if (c > 1) continue; }   // a long line again later
      keep.push(line);
    }
    // a sentence said three times or more inside a line: keep the first
    return keep.map(l => {
      const ss = l.split(/(?<=[.!?])\s+/); const s2 = new Map();
      return ss.filter(x => { const k = x.trim().toLowerCase(); if (k.length < 20) return true; const c = (s2.get(k) || 0) + 1; s2.set(k, c); return c === 1; }).join(' ');
    }).join('\n');
  }).join('');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
