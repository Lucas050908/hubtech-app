/**
 * Central app registry. Adding an app = adding one entry here (+ its page module).
 * Navigation, launcher, search, favorites, onboarding and permissions all read from this list.
 *
 *  id           unique id (also used for per-user state: /api/state/<id>)
 *  name         display name
 *  tagline      one-line purpose
 *  description  longer text for the launcher
 *  icon         icon name from core/icons.js
 *  hue          CSS colour – the app's identity inside the shared design system
 *  route        hash route the app lives at
 *  category     'workspace' | 'learning' | 'system'
 *  status       'available' | 'beta' | 'coming'
 *  requires     { role?: 'owner', owner?: true (hidden for everyone else), admin?: true (owner + those the owner gave access – hidden for everyone else), integration?: 'cursor' | 'byteforge' }
 *  art          landscape thumbnail settings for its card
 *  page         lazy loader for the page module (export default { render(ctx) })
 *  keywords     extra words for search
 */
export const APPS = [
  {
    id: 'hubtech', name: 'HUBTECH Office', tagline: 'Dokumenter, regneark og præsentationer.',
    description: 'Dit kontorprogram: tekstbehandling, regneark med formler og præsentationer med præsentationstilstand. Åbn Word- og Excel-filer, og gem som Word, Excel, PowerPoint og PDF. De klassiske HUBTECH-sider (Pingochat, GameHub …) ligger der stadig.',
    icon: 'hubtech', hue: 'var(--hue-hubtech)', route: '#/apps/hubtech', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.55, tint: '#2f6bff' }, page: () => import('../pages/hubtech.js'),
    keywords: ['office', 'word', 'excel', 'powerpoint', 'dokument', 'regneark', 'præsentation', 'slides', 'tekst', 'community', 'discord', 'minecraft'],
  },
  {
    id: 'byteforge', name: 'ByteForge', tagline: 'Guides, værktøjer og læring.',
    description: 'Dit selvhostede homelab: ByteForge-serveren følger med og startes sammen med HUBTECH, og panelet kører direkte her. Inkluderer hele ByteForge-guiden.',
    icon: 'anvil', hue: 'var(--hue-byteforge)', route: '#/apps/byteforge', category: 'workspace', status: 'available',
    requires: { integration: 'byteforge' },
    art: { season: 'spring', time: 'night', focusX: 0.35, tint: '#9b3dff' }, page: () => import('../pages/byteforge.js'),
    keywords: ['homelab', 'server', 'docker', 'nas', 'raid', 'minecraft', 'guide'],
  },
  {
    id: 'circuitpilot', name: 'CircuitPilot', tagline: 'Elektronik, simuleringer og kurser.',
    description: 'Lær elektronik med slides, skill tree, quiz, flashcards, eksamen, kredsløbs-sandbox, fejlfinding og reparationsopgaver. Din XP tæller med i din samlede profil.',
    icon: 'circuit', hue: 'var(--hue-circuitpilot)', route: '#/learn/circuitpilot', category: 'learning', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.62, tint: '#00b894' }, page: () => import('../pages/circuitpilot.js'),
    keywords: ['elektronik', 'ohm', 'quiz', 'flashcards', 'kredsløb', 'lab', 'eksamen'],
  },
  {
    id: 'codeschool', name: 'Kodeskolen', tagline: 'Lær at programmere – trin for trin.',
    description: 'Korte lektioner i Python, JavaScript, HTML/CSS, Git og Arduino med kode du kører direkte i browseren, opgaver der rettes automatisk, quizzer og XP.',
    icon: 'graduation', hue: 'var(--hue-codeschool)', route: '#/learn/codeschool', category: 'learning', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#6366f1' }, page: () => import('../pages/codeschool.js'),
    keywords: ['programmering', 'kode', 'python', 'javascript', 'html', 'css', 'git', 'arduino', 'kursus', 'lær'],
  },
  {
    id: 'customers', name: 'Kunder', tagline: 'Alt om hver kunde – og fakturaer.',
    description: 'Én side pr. kunde med timer, aftaler, servicerapporter og opgaver fra dine andre apps. Lav fakturaudkast af ufakturerede timer og dele fra lageret, og hent dem som PDF.',
    icon: 'users', hue: 'var(--hue-customers)', route: '#/apps/customers', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.45, tint: '#fb923c' }, page: () => import('../pages/customers.js'),
    keywords: ['kunder', 'kunde', 'faktura', 'fakturering', 'crm', 'kontakt', 'cvr', 'regning'],
  },
  {
    id: 'flashcards', name: 'Huskekort', tagline: 'Lær udenad med smarte gentagelser.',
    description: 'Lav sæt med huskekort og gennemgå dem med spaced repetition: kort du kan, kommer sjældnere, og kort du glemmer, kommer hurtigt igen. Import fra Excel/CSV og fra Kodeskolens quizzer.',
    icon: 'layers', hue: 'var(--hue-flashcards)', route: '#/learn/flashcards', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'night', focusX: 0.55, tint: '#f472b6' }, page: () => import('../pages/flashcards.js'),
    keywords: ['huskekort', 'flashcards', 'gloser', 'lær udenad', 'spaced repetition', 'anki', 'quiz'],
  },
  {
    id: 'cursor', name: 'Cursor Projekter', tagline: 'Dine Cursor-projekter og udvikling.',
    description: 'Læser dine seneste Cursor-projekter og projektmapper direkte fra din maskine, viser git-status og åbner projekter i Cursor med ét klik.',
    icon: 'cube', hue: 'var(--hue-cursor)', route: '#/projects', category: 'workspace', status: 'available',
    requires: { role: 'owner', integration: 'cursor' },
    art: { season: 'winter', time: 'dusk', focusX: 0.6, mono: true }, page: () => import('../pages/projects.js'),
    keywords: ['projekter', 'kode', 'git', 'repo', 'cursor', 'ide'],
  },
  {
    id: 'archive-01', name: 'ARCHIVE-01', tagline: 'Portable cyberdeck-projektet.',
    description: 'Projektsiden for ARCHIVE-01 – en bærbar cyberdeck med Raspberry Pi CM5, 8,8" IPS-skærm og 3D-printet kabinet. Kører uændret inde i HUBTECH.',
    icon: 'terminal', hue: 'var(--hue-archive)', route: '#/apps/archive-01', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#ff2bd6' }, page: () => import('../pages/archive.js'),
    keywords: ['cyberdeck', 'raspberry', 'pi', '3d-print', 'archive'],
  },
  {
    id: 'servicehelp', name: 'Servicehjælp', tagline: 'Rapporter, kalender og kunder.',
    description: 'Din arbejdsdag som servicetekniker: servicerapporter som PDF, kalender, kunder, log, fejlsøgning, vidensbank, udgifter, kørebog og garantier. Alt gemmes på din HUBTECH-konto.',
    icon: 'tool', hue: 'var(--hue-service)', route: '#/apps/servicehelp', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#ff7a1a' }, page: () => import('../pages/servicehelp.js'),
    keywords: ['service', 'rapport', 'servicerapport', 'kunde', 'kørebog', 'udgift', 'garanti', 'fejlsøgning', 'tekniker', 'pdf'],
  },
  {
    id: 'tasks', name: 'Opgaver', tagline: 'Dit board: at gøre, i gang, færdig.',
    description: 'Et kanban-board til dine opgaver med prioritet, deadline og kobling til dine Cursor-projekter. Træk kort mellem kolonnerne. Gemmes på din konto.',
    icon: 'kanban', hue: 'var(--hue-tasks)', route: '#/apps/tasks', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.4, tint: '#ff2f7a' }, page: () => import('../pages/tasks.js'),
    keywords: ['todo', 'to-do', 'kanban', 'opgave', 'deadline', 'board', 'plan'],
  },
  {
    id: 'notes', name: 'Noter', tagline: 'Hurtige noter, gemt på din konto.',
    description: 'Skriv idéer, mødenoter og huskelister. Søg, fastgør og farv dem – alt gemmes automatisk på serveren, så de følger dig på alle enheder.',
    icon: 'note', hue: 'var(--hue-notes)', route: '#/apps/notes', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.4, tint: '#ff9500' }, page: () => import('../pages/notes.js'),
    keywords: ['noter', 'note', 'notat', 'idé', 'huskeliste', 'skriv'],
  },
  {
    id: 'focus', name: 'Fokus', tagline: 'Pomodoro-timer med statistik.',
    description: 'Arbejd i fokusblokke med pauser imellem. Knyt en session til en opgave, og se hvor meget du har nået i dag og denne uge. Timeren kører videre, mens du bruger resten af HUBTECH.',
    icon: 'timer', hue: 'var(--hue-focus)', route: '#/apps/focus', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.55, tint: '#5b5bff' }, page: () => import('../pages/focus.js'),
    keywords: ['pomodoro', 'timer', 'fokus', 'pause', 'koncentration', 'tid'],
  },
  {
    id: 'toolkit', name: 'Værktøjskasse', tagline: 'Beregnere til elektronik, el og netværk.',
    description: 'Ohms lov, modstandens farvekode, spændingsdeler, formodstand til LED, serie/parallel og kondensator-koder. Passer til CircuitPilot og servicetekniker-kurset.',
    icon: 'calculator', hue: 'var(--hue-toolkit)', route: '#/learn/toolkit', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'dawn', focusX: 0.5, tint: '#00b8d9' }, page: () => import('../pages/toolkit.js'),
    keywords: ['ohm', 'modstand', 'farvekode', 'led', 'spændingsdeler', 'beregner', 'elektronik', 'kondensator'],
  },
  {
    id: 'community', name: 'Fællesskab', tagline: 'Chat, servere, snaps og musik sammen.',
    description: 'Dit eget sted at snakke: servere med kanaler, roller og regler, private beskeder mellem venner, snaps der forsvinder, stories i 24 timer og musikrum, hvor alle lytter samtidig. Del noter, aftaler og kodestumper direkte fra dine andre apps.',
    icon: 'chat', hue: 'var(--hue-community)', route: '#/apps/community', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.4, tint: '#6d7cff' }, page: () => import('../pages/community.js'),
    keywords: ['chat', 'discord', 'snap', 'snapchat', 'besked', 'server', 'kanal', 'venner', 'story', 'musik', 'fællesskab', 'dm'],
  },
  {
    id: 'calendar', name: 'Kalender', tagline: 'Aftaler, deadlines og påmindelser.',
    description: 'Måneds- og ugeoversigt over dine aftaler med påmindelser. Deadlines fra Opgaver vises automatisk, og kalenderen kan hentes som .ics til telefonen eller Outlook.',
    icon: 'calendar', hue: 'var(--hue-calendar)', route: '#/apps/calendar', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.45, tint: '#38bdf8' }, page: () => import('../pages/calendar.js'),
    keywords: ['kalender', 'aftale', 'møde', 'dato', 'påmindelse', 'ics', 'uge', 'måned'],
  },
  {
    id: 'inventory', name: 'Lager', tagline: 'Komponenter, beholdning og indkøb.',
    description: 'Hold styr på dine komponenter og reservedele: antal, placering, leverandør og pris. Se hvad der er ved at slippe op, og få en indkøbsliste med ét klik.',
    icon: 'box', hue: 'var(--hue-inventory)', route: '#/apps/inventory', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.6, tint: '#f59e0b' }, page: () => import('../pages/inventory.js'),
    keywords: ['lager', 'komponent', 'reservedel', 'beholdning', 'indkøb', 'modstand', 'kondensator', 'skuffe'],
  },
  {
    id: 'timesheet', name: 'Tidsregistrering', tagline: 'Start/stop-ur og timesedler.',
    description: 'Registrér tid på kunder og projekter med ét klik. Se dag, uge og måned, beregn beløb ud fra din timepris, og hent timesedlen som CSV eller Excel.',
    icon: 'stopwatch', hue: 'var(--hue-timesheet)', route: '#/apps/timesheet', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.5, tint: '#34d399' }, page: () => import('../pages/timesheet.js'),
    keywords: ['tid', 'timer', 'timeseddel', 'faktura', 'kunde', 'registrering', 'stempel'],
  },
  {
    id: 'studio', name: 'App-værksted', tagline: 'Byg dine egne apps – med AI-hjælp.',
    description: 'En kode-editor til HTML, CSS og JavaScript med live forhåndsvisning og konsol. Din lokale AI-assistent kan skrive og rette koden for dig. Appene kører sikkert inde i HUBTECH, gemmer deres data på din konto og kan deles med andre brugere.',
    icon: 'code', hue: 'var(--hue-studio)', route: '#/apps/studio', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.6, tint: '#fbbf24' }, page: () => import('../pages/studio.js'),
    keywords: ['kode', 'editor', 'app', 'html', 'css', 'javascript', 'ai', 'byg', 'program', 'web', 'værksted', 'ide'],
  },
  {
    id: 'snippets', name: 'Kodestumper', tagline: 'Dit bibliotek af kode og kommandoer.',
    description: 'Gem kodestykker, terminal-kommandoer og konfigurationer med sprog og tags. Søg, kopiér med ét klik, og hav dem med på alle dine enheder.',
    icon: 'code', hue: 'var(--hue-snippets)', route: '#/learn/snippets', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.4, tint: '#c084fc' }, page: () => import('../pages/snippets.js'),
    keywords: ['kode', 'snippet', 'kommando', 'terminal', 'python', 'javascript', 'bash', 'config'],
  },
  {
    id: 'minecraft', name: 'Minecraft-server', tagline: 'HUBTECH’s Minecraft-server – adresse, status og regler.',
    description: 'Alt om HUBTECH’s Minecraft-server: adressen med en kopiér-knap, om serveren er online, hvor mange der spiller, hvordan du kommer ind, regler, links og nyheder. Ejeren og administratorerne kan ændre oplysningerne.',
    icon: 'gamepad', hue: 'var(--hue-minecraft)', route: '#/apps/minecraft', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#4ade80' }, page: () => import('../pages/minecraft.js'),
    keywords: ['minecraft', 'server', 'ip', 'adresse', 'spil', 'java', 'bedrock', 'mc'],
  },
  {
    id: 'admin', name: 'Admin', tagline: 'Styr platformen – kun for dem, du giver adgang.',
    description: 'Overblik over brugere og aktivitet, anmeldelser fra Fællesskab, beskeder til alle og en log over, hvad administratorerne gør. Kun ejeren og dem, ejeren giver adgang, kan se og åbne appen.',
    icon: 'shield', hue: 'var(--hue-admin)', route: '#/apps/admin', category: 'system', status: 'available', requires: { admin: true },
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#ef4444' }, page: () => import('../pages/admin.js'),
    keywords: ['admin', 'administrator', 'brugere', 'moderation', 'anmeldelser', 'besked', 'adgang', 'kontrol'],
  },
  {
    id: 'owner', name: 'Ejer', tagline: 'Alt, kun du som ejer bestemmer over.',
    description: 'Brugere og adgangskoder, hvem der kan oprette en konto, venner på andre netværk, server og sikkerhedskopier – og siden, dine venner henter HUBTECH fra. Kun platformens ejer kan se appen.',
    icon: 'crown', hue: 'var(--hue-owner)', route: '#/apps/owner', category: 'system', status: 'available', requires: { owner: true },
    art: { season: 'autumn', time: 'dusk', focusX: 0.5, tint: '#f5b14c' }, page: () => import('../pages/owner.js'),
    keywords: ['ejer', 'owner', 'brugere', 'adgangskode', 'tilmelding', 'venner', 'download', 'hent', 'server', 'backup'],
  },
  {
    id: 'learning', name: 'Guides & Læring', tagline: 'Kurser, guides og hjælp',
    description: 'Opstartskurset for servicetekniker, platformsguides og søgbar hjælp. Fremdrift gemmes på din konto.',
    icon: 'book', hue: 'var(--hue-learn)', route: '#/learn', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.45 }, page: () => import('../pages/learn.js'),
    keywords: ['kursus', 'guide', 'hjælp', 'servicetekniker', 'lektion'],
  },
  {
    id: 'settings', name: 'Indstillinger', tagline: 'Profil, verden og integrationer',
    description: 'Din profil, sikkerhed, udseende, årstider og vejr, integrationer og brugere.',
    icon: 'settings', hue: 'var(--hue-settings)', route: '#/settings', category: 'system', status: 'available',
    art: { season: 'winter', time: 'dawn', focusX: 0.5 }, page: () => import('../pages/settings.js'),
    keywords: ['profil', 'adgangskode', 'tema', 'årstid', 'baggrund'],
  },
  {
    id: 'next', name: 'Næste modul', tagline: 'Plads til din næste idé',
    description: 'Nye apps tilføjes med én registrering i app-registret. Se guiden “Tilføj en ny app”.',
    icon: 'rocket', hue: 'var(--accent)', route: '#/learn/guide/add-app', category: 'system', status: 'coming',
    art: { season: 'spring', time: 'dawn', focusX: 0.3 },
    keywords: ['ny app', 'udvid', 'modul'],
  },
];

export const appById = (id) => APPS.find(a => a.id === id);
/** Learning apps live inside Guides & Læring (#/learn/<id>) instead of the app launcher and sidebar. */
export const isLearnApp = (a) => !!a && a.category === 'learning' && a.id !== 'learning';
const LEARN_ORDER = ['codeschool', 'snippets', 'flashcards', 'circuitpilot', 'toolkit'];
export const LEARN_APPS = APPS.filter(isLearnApp).sort((a, b) => (LEARN_ORDER.indexOf(a.id) + 1 || 99) - (LEARN_ORDER.indexOf(b.id) + 1 || 99));

/** Is the app usable by this user? Returns { ok, reason } */
export function access(app, user) {
  if (app.status === 'coming') return { ok: false, reason: 'Kommer snart', kind: 'coming' };
  if (app.requires?.role === 'owner' && user?.role !== 'owner') return { ok: false, reason: 'Kun for platformens ejer', kind: 'locked' };
  if (app.requires?.admin && !user?.admin) return { ok: false, reason: 'Kun for dem, ejeren har givet adgang', kind: 'hidden' };
  if (app.requires?.owner && user?.role !== 'owner') return { ok: false, reason: 'Kun for platformens ejer', kind: 'hidden' };
  return { ok: true };
}

/** Apps the user may see at all (Admin is invisible to people without access). */
export const visible = (app, user) => access(app, user).kind !== 'hidden';

/**
 * App groups: apps that belong together share one entry in the menu and the app overview, with tabs on top
 * (like Guides & Læring). The first member is where the group opens. Old links to every app still work.
 */
export const SUITES = [
  { id: 'office', name: 'HUBTECH Office', tagline: 'Dokumenter, regneark, præsentationer og noter.', members: ['hubtech', 'notes'] },
  { id: 'plan', name: 'Planlæg', tagline: 'Kalender, opgaver og fokus-timer.', icon: 'calendar', hue: 'var(--hue-calendar)', members: ['calendar', 'tasks', 'focus'] },
  { id: 'service', name: 'Service', tagline: 'Servicehjælp, kunder, lager og timer.', icon: 'tool', hue: 'var(--hue-service)', members: ['servicehelp', 'customers', 'inventory', 'timesheet'] },
];
export const suiteOf = (id) => SUITES.find(s => s.members.includes(id)) || null;
/** The app as it is shown in menus: a group's first member carries the group's name; the others are hidden there. */
export function entryApp(app) {
  if (!app) return null;
  const s = suiteOf(app.id);
  if (!s) return app;
  const lead = appById(s.members[0]);
  return { ...lead, name: s.name, tagline: s.tagline || lead.tagline, icon: s.icon || lead.icon, hue: s.hue || lead.hue, suite: s.id,
    description: `${s.tagline} Samlet i én app med faner: ${s.members.map(id => appById(id)?.name).join(', ')}.`,
    keywords: s.members.flatMap(id => [appById(id)?.name.toLowerCase(), ...(appById(id)?.keywords || [])]) };
}
/** Unique menu entries for a list of app ids (pinned apps). */
export const entryApps = (ids) => [...new Map(ids.map(appById).filter(Boolean).map(entryApp).map(a => [a.id, a])).values()];
