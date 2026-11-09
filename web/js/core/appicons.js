/**
 * App icons (design D): a drawn sign for each of the apps you use most – the same 24×24 line style as the rest of
 * HUBTECH, so they also work in the menu on the left. Apps without one of their own use their normal icon.
 * Shown on a soft tile in the app's colour (.ab-ico) in Alle apps, on Hjem, in Lær og øv and in the top bar.
 */
import { raw } from './dom.js';
import { icon } from './icons.js';

export const APP_GLYPHS = {
  projects: '<path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v9a1.5 1.5 0 0 1-1.5 1.5h-9.5l-4.5 3.4v-3.4H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z"/><path d="m9.5 9.3-2.2 2.2 2.2 2.2M14.5 9.3l2.2 2.2-2.2 2.2"/>',
  hubtech: '<path d="M8.5 3h7.8l3.2 3.2v10.3a1.5 1.5 0 0 1-1.5 1.5H8.5A1.5 1.5 0 0 1 7 16.5v-12A1.5 1.5 0 0 1 8.5 3z"/><path d="M16.3 3v3.2h3.2M10 10h6M10 13h6"/><path d="M7 7H5.5A1.5 1.5 0 0 0 4 8.5v11A1.5 1.5 0 0 0 5.5 21h8a1.5 1.5 0 0 0 1.5-1.5V18"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><rect x="13" y="13" width="3.6" height="3.6" rx=".9" fill="currentColor" stroke="none"/>',
  tasks: '<path d="m3.5 6.5 1.8 1.8 3.3-3.3M3.5 13.5l1.8 1.8 3.3-3.3"/><path d="M11.5 7h9M11.5 14h9M3.5 19.5h17"/>',
  codepad: '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M2.5 8h19"/><path d="m9.5 11.3-2.5 2.6 2.5 2.6M14.5 11.3l2.5 2.6-2.5 2.6"/>',
  notes: '<rect x="6" y="3" width="13.5" height="18" rx="2"/><path d="M3.8 7.2h4.4M3.8 12h4.4M3.8 16.8h4.4"/><path d="M10.5 8h5.5M10.5 11.5h5.5M10.5 15h3"/>',
  economy: '<ellipse cx="9" cy="6.5" rx="5.5" ry="2.5"/><path d="M3.5 6.5v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4"/><path d="M3.5 10.5v4c0 1.4 2.5 2.5 5.5 2.5.9 0 1.7-.1 2.5-.3"/><path d="m14 19.5 3-3.2 2 2 3-3.6M19.5 14.7H22v2.5"/>',
  gnist: '<path d="M12 3c.9 4.4 2.6 6.1 7 7-4.4.9-6.1 2.6-7 7-.9-4.4-2.6-6.1-7-7 4.4-.9 6.1-2.6 7-7z"/><path d="M19 16.5v3.5M17.25 18.25h3.5"/>',
  chess: '<path d="M6.5 20.5h11"/><path d="M8.3 20.5c.2-2.6 1.6-4.3 3.7-6l-3.7.2-2.1-1.6c.8-2.9 2.7-5.7 5.5-7.2L11.3 3.7l2.3 1.4c3.4.8 5.3 3.9 5.3 8.1v7.3"/><circle cx="12.6" cy="9" r=".7" fill="currentColor" stroke="none"/>',
  community: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.5"/><path d="M15.7 14.7c2.6-.4 4.5 1.3 4.9 4.3"/>',
  customers: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><circle cx="8.5" cy="11" r="2.3"/><path d="M5 16.5c.5-1.8 1.9-2.8 3.5-2.8s3 1 3.5 2.8M14.5 9.5h4.5M14.5 12.5h4.5"/>',
  inventory: '<path d="m3.5 7.5 8.5-4 8.5 4v9l-8.5 4-8.5-4z"/><path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9M7.8 5.5l8.5 4"/>',
  timesheet: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M18.4 6.6l1.6-1.6"/>',
  studio: '<rect x="3" y="4" width="13.5" height="11" rx="2"/><path d="M3 7.5h13.5"/><path d="m12.5 20.5 7.5-7.5"/><path d="M19.5 7v3M18 8.5h3"/>',
  learning: '<path d="M12 6.5c-2-1.6-4.8-2-8.5-1.5v13c3.7-.5 6.5-.1 8.5 1.5 2-1.6 4.8-2 8.5-1.5V5c-3.7-.5-6.5-.1-8.5 1.5z"/><path d="M12 6.5v13"/>',
  linux: '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="m6.5 9.5 3 2.5-3 2.5M11.5 15.5h5"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.5"/><circle cx="12" cy="16.9" r=".5" fill="currentColor" stroke="none"/>',
  flashcards: '<rect x="4" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12.5"/><path d="M7.5 11h5M7.5 14h3.5"/>',
  printerdoctor: '<path d="M7 8.5v-5h10v5"/><rect x="3" y="8.5" width="18" height="8.5" rx="2"/><path d="M7 14.5h10v6H7z"/><path d="M17.5 11.5h.01"/>',
  focus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  budget: '<path d="M11 4a8.5 8.5 0 1 0 9 9h-9z"/><path d="M14 2.8a8.5 8.5 0 0 1 7.2 7.2H14z"/>',
  savings: '<path d="M3.5 20.5h17"/><path d="M6.5 20.5V17M11 20.5V14M15.5 20.5V11"/><path d="m4.5 11.5 4.5-4 3 2.5 6.5-6"/><path d="M15 4h3.5v3.5"/>',
  piggy: '<path d="M4.5 12.2c0-3.4 3.2-6 7.3-6 1.3 0 2.5.3 3.5.7l2.7-1.4v3.3c.8.7 1.3 1.6 1.6 2.6h1.9v3.4h-2.1c-.4.8-1 1.5-1.8 2.1v2.6h-2.8v-1.4c-.9.2-1.9.3-3 .3s-2.1-.1-3-.3v1.4H6v-2.7c-.9-1-1.5-2.3-1.5-3.6z"/><path d="M9.8 8.9h3.4"/><circle cx="16" cy="11.4" r=".7" fill="currentColor" stroke="none"/><path d="M4.5 12c-1.2-.2-1.8-1-1.8-2"/>',
  expenses: '<circle cx="8" cy="7.5" r="3"/><path d="M2.5 19c.5-3.2 2.7-5 5.5-5 1 0 1.9.2 2.7.7"/><circle cx="16.5" cy="15.5" r="5"/><path d="M16.5 13.2v4.6"/>',
  splitbill: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6"/><path d="M8.5 12H11M13 12h2.5M8.5 15.5H11M13 15.5h2.5"/>',
  loans: '<path d="M4 8.5h13.5"/><path d="m14 5 3.5 3.5L14 12"/><path d="M20 15.5H6.5"/><path d="m10 12-3.5 3.5L10 19"/>',
  notebook: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="M9 3v15"/><path d="M12.5 8H16M12.5 11.5H16"/>',
  codeschool: '<path d="m2.5 8.5 9.5-4.5 9.5 4.5-9.5 4.5z"/><path d="M6.5 10.5v3.2M8.5 16l-2 2 2 2M15.5 16l2 2-2 2"/>',
  snippets: '<path d="M8 5.5 4.5 9 8 12.5M16 5.5 19.5 9 16 12.5"/><path d="M5 17h14M5 20.5h9"/>',
  labs: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.3a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2l-5.5-9.6V3.5"/><path d="M7.4 14.5h9.2"/>',
  typing: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  glossary: '<path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11.5"/><path d="m9 12.5 2-5 2 5M9.7 11h2.6"/>',
  electro: '<path d="M13 2.5 5.5 13h6l-1 8.5 8-11h-6z"/>',
  toolkit: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M3 13h18M10.5 13v2h3v-2"/>',
  bits: '<rect x="3.5" y="6" width="7" height="12" rx="3.5"/><path d="M15.5 8 18 6v12"/>',
  wiki: '<path d="M4 5.5c2.7-.8 5.4-.6 8 1 2.6-1.6 5.3-1.8 8-1v13c-2.7-.8-5.4-.6-8 1-2.6-1.6-5.3-1.8-8-1z"/><path d="m7 10 1.2 4 1.3-3 1.3 3L12 10"/>',
  phishing: '<path d="M12 3.5 4.5 6.5v5c0 4.5 3.1 7.9 7.5 9 4.4-1.1 7.5-4.5 7.5-9v-5z"/><path d="M12 8.5v4M12 15.5h.01"/>',
};

const SVG = (body) => `<svg class="app-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** The app's sign: its own drawing when it has one, otherwise its normal icon. Takes an app (or an id and an icon). */
export function appGlyph(app, fallback) {
  const id = typeof app === 'string' ? app : app?.id;
  const g = APP_GLYPHS[id];
  return g ? raw(SVG(g)) : icon(fallback || app?.icon || 'apps');
}
