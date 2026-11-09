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
    description: 'Dit kontorprogram: tekstbehandling, regneark med formler og præsentationer med præsentationstilstand. Åbn Word- og Excel-filer, og gem som Word, Excel, PowerPoint og PDF.',
    icon: 'hubtech', hue: 'var(--hue-hubtech)', route: '#/apps/hubtech', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.55, tint: '#2f6bff' }, page: () => import('../pages/hubtech.js'),
    keywords: ['office', 'word', 'excel', 'powerpoint', 'dokument', 'regneark', 'præsentation', 'slides', 'tekst', 'community', 'discord', 'minecraft'],
  },
  {
    id: 'byteforge', name: 'ByteForge', tagline: 'Guides, værktøjer og læring.',
    description: 'Et selvhostet homelab, der følger med HUBTECH og kører på samme server. Panelet åbnes direkte her, og hele ByteForge-guiden er med.',
    icon: 'anvil', hue: 'var(--hue-byteforge)', route: '#/apps/byteforge', category: 'workspace', status: 'available',
    requires: { integration: 'byteforge' },
    art: { season: 'spring', time: 'night', focusX: 0.35, tint: '#9b3dff' }, page: () => import('../pages/byteforge.js'),
    keywords: ['homelab', 'server', 'docker', 'nas', 'raid', 'minecraft', 'guide'],
  },
  {
    id: 'electro', name: 'Elværkstedet', tagline: 'Byg, regn og fejlfind på kredsløb.',
    description: 'HUBTECHs eget elektronikværksted på dansk: kredsløbssimulator med diagram, regneopgaver med nye tal hver gang, fejlfinding med voltmeter, komponenter, XP, levels og badges.',
    icon: 'circuit', hue: 'var(--hue-circuitpilot)', route: '#/learn/electro', category: 'learning', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.62, tint: '#00b894' }, page: () => import('../pages/electro.js'),
    keywords: ['elektronik', 'ohm', 'kredsløb', 'simulator', 'modstand', 'led', 'fejlfinding', 'voltmeter', 'multimeter', 'circuitpilot'],
  },
  {
    id: 'gnist', name: 'Gnist', tagline: 'HUBTECHs AI – på fuld skærm.',
    description: 'Gnist er HUBTECHs maskot og AI-assistent. Hun kender alle guides og kurser, kan læse dine noter, opgaver og aftaler, planlægge din dag og hjælpe med at fejlfinde – og hun kører på din egen enhed, så intet forlader computeren.',
    icon: 'spark', hue: '#f97316', route: '#/apps/gnist', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.5, tint: '#f97316' }, page: () => import('../pages/gnist.js'),
    keywords: ['ai', 'assistent', 'chat', 'gnist', 'hjælp', 'spørg', 'chatbot', 'sprogmodel', 'llm', 'qwen'],
  },
  {
    id: 'linux', name: 'Linux-terminal', tagline: 'En rigtig Linux at lege i – lige som Termux.',
    description: 'En ægte Linux (Buildroot · Linux 6.8 · BusyBox) der kører i en lukket maskine på din enhed: shell, vi, less, top, Lua og 200 andre kommandoer, ekstra tastrække som i Termux, og maskinen gemmes, så dine filer er der næste gang. Ingen adgang til din computer eller internettet.',
    icon: 'terminal', hue: '#f97316', route: '#/learn/linux', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.4, tint: '#f97316' }, page: () => import('../pages/linux.js'),
    keywords: ['linux', 'terminal', 'termux', 'shell', 'bash', 'kommandolinje', 'konsol', 'busybox', 'vi', 'ubuntu', 'kommandoer'],
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
    id: 'cursor', name: 'Cursor Projekter', tagline: 'Cursor-projekter og udvikling (kun ejeren).',
    description: 'Viser de seneste Cursor-projekter og projektmapper på den computer, HUBTECH kører på, med git-status, og åbner dem i Cursor med ét klik. Kun platformens ejer kan bruge appen.',
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
    description: 'Ohms lov, modstandens farvekode, spændingsdeler, formodstand til LED, serie/parallel og kondensator-koder. Passer til Elværkstedet og servicetekniker-kurset.',
    icon: 'calculator', hue: 'var(--hue-toolkit)', route: '#/learn/toolkit', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'dawn', focusX: 0.5, tint: '#00b8d9' }, page: () => import('../pages/toolkit.js'),
    keywords: ['ohm', 'modstand', 'farvekode', 'led', 'spændingsdeler', 'beregner', 'elektronik', 'kondensator'],
  },
  {
    id: 'projects', name: 'Projekter', tagline: 'Samtale, opkald, opgaver og kode – sammen om et projekt.',
    description: 'Et rum for hvert projekt: beskeder, opkald med hele holdet (også fra jeres andre pc’er og telefoner), opgaver, noter og en fælles mappe, hvor hver ændring får en beskrivelse – som på GitHub. En AI kan gennemgå ændringen først, hvis du vil, og mappen kan blive til en hjemmeside.',
    icon: 'chat', hue: '#e8763a', route: '#/apps/projects', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.5, tint: '#e8763a' }, page: () => import('../pages/teamprojects.js'),
    keywords: ['projekt', 'projekter', 'teams', 'team', 'chat', 'besked', 'opkald', 'ring', 'møde', 'kode', 'commit', 'github', 'ændring', 'hjemmeside', 'samarbejde'],
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
    description: 'En kode-editor til HTML, CSS og JavaScript med live forhåndsvisning og konsol. Gnist, din lokale AI-assistent, kan skrive og rette koden for dig. Appene kører sikkert inde i HUBTECH, gemmer deres data på din konto og kan deles med andre brugere.',
    icon: 'code', hue: 'var(--hue-studio)', route: '#/apps/studio', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.6, tint: '#fbbf24' }, page: () => import('../pages/studio.js'),
    keywords: ['kode', 'editor', 'app', 'html', 'css', 'javascript', 'ai', 'byg', 'program', 'web', 'værksted', 'ide'],
  },
  {
    id: 'codepad', name: 'Kode-editor', tagline: 'En rigtig kode-editor med Gnist som lærer.',
    description: 'Filer og faner, linjenumre, farver til 25 sprog, autofuldførelse, søg og erstat, flere markører og foldning. Kør Python, JavaScript, HTML/CSS og SQL direkte – fejl vises på linjen. Markér kode og bed Gnist forklare, finde fejlen eller skrive test.',
    icon: 'code', hue: 'var(--hue-codeschool, #8b5cf6)', route: '#/learn/codepad', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#8b5cf6' }, page: () => import('../pages/codepad.js'),
    keywords: ['kode', 'editor', 'programmering', 'python', 'javascript', 'html', 'css', 'sql', 'bash', 'lær', 'kør kode', 'ide', 'fejl'],
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
    id: 'admin', name: 'Admin', tagline: 'Styring af platformen – for ejeren og administratorerne.',
    description: 'Overblik over brugere og aktivitet, anmeldelser fra Fællesskab, beskeder til alle og en log over, hvad administratorerne gør. Kun ejeren og dem, ejeren giver adgang, kan se og åbne appen.',
    icon: 'shield', hue: 'var(--hue-admin)', route: '#/apps/admin', category: 'system', status: 'available', requires: { admin: true },
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#ef4444' }, page: () => import('../pages/admin.js'),
    keywords: ['admin', 'administrator', 'brugere', 'moderation', 'anmeldelser', 'besked', 'adgang', 'kontrol'],
  },
  {
    id: 'glossary', name: 'IT-ordbog', tagline: 'IT-ord forklaret på almindeligt dansk.',
    description: 'Over 100 ord om hardware, netværk, printere, sikkerhed og drift – med søgning, en lille quiz og ét klik til huskekort.',
    icon: 'book', hue: 'var(--hue-glossary)', route: '#/learn/glossary', category: 'learning', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.45, tint: '#fda4af' }, page: () => import('../pages/glossary.js'),
    keywords: ['ordbog', 'begreber', 'ord', 'forklaring', 'leksikon', 'glossary', 'dns', 'dhcp', 'toner'],
  },
  {
    id: 'quiz', name: 'Quiz', tagline: 'Test din IT-viden.',
    description: 'Quizzer om printere, netværk, hardware, sikkerhed og Windows med en forklaring efter hvert svar. Slå din egen rekord.',
    icon: 'help', hue: 'var(--hue-quiz)', route: '#/learn/quiz', category: 'learning', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#fb923c' }, page: () => import('../pages/quiz.js'),
    keywords: ['quiz', 'test', 'spørgsmål', 'eksamen', 'viden', 'printer', 'netværk', 'sikkerhed'],
  },
  {
    id: 'typing', name: 'Tastaturtræner', tagline: 'Skriv hurtigt med ti fingre.',
    description: 'Lektioner fra hjemrækken til rigtige sætninger med æ, ø og å. Måler hastighed og præcision og husker dine rekorder.',
    icon: 'edit', hue: 'var(--hue-typing)', route: '#/learn/typing', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#facc15' }, page: () => import('../pages/typing.js'),
    keywords: ['tastatur', 'skrive', 'touch', 'ti fingre', 'hastighed', 'wpm', 'typing'],
  },
  {
    id: 'labs', name: 'Øvelseslab', tagline: 'Simulatorer og fejlfinding.',
    description: 'Lasersimulator med materialetest, netværkslab med terminal, rigtige servicesager og et 3D-print-lab – øv dig uden at ødelægge noget.',
    icon: 'target', hue: '#f59e0b', route: '#/learn/labs', category: 'learning', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.55, tint: '#f59e0b' }, page: () => import('../pages/labs.js'),
    keywords: ['simulator', 'lab', 'laboratorium', 'laser', 'netværk', 'ping', 'fejlfinding', 'service', '3d-print', 'øvelse', 'test'],
  },
  {
    id: 'bits', name: 'Bit-spil', tagline: 'Lær det binære talsystem.',
    description: 'Tænd de rigtige bits, til tallet passer – på tid. Tre niveauer: 4 bit, 8 bit og hex.',
    icon: 'chip', hue: 'var(--hue-bits)', route: '#/learn/bits', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#67e8f9' }, page: () => import('../pages/bits.js'),
    keywords: ['binær', 'bits', 'bytes', 'hex', 'talsystem', 'spil', 'nuller og ettaller'],
  },
  {
    id: 'printerdoctor', name: 'Printer-doktor', tagline: 'Fejlfinding på printere, trin for trin.',
    description: 'Vælg problemet – offline, papirstop, dårlig kvalitet, scanning – og svar på spørgsmålene. Printer-doktor fører dig til løsningen med kommandoer og guides og laver en servicenote til sidst.',
    icon: 'printer', hue: 'var(--hue-printer)', route: '#/apps/printerdoctor', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.4, tint: '#60a5fa' }, page: () => import('../pages/printerdoctor.js'),
    keywords: ['printer', 'print', 'udskrift', 'offline', 'papirstop', 'toner', 'blæk', 'scanner', 'spooler', 'fejlfinding', 'support'],
  },
  {
    id: 'commands', name: 'Kommandoer', tagline: 'Kommandoer til Windows, Mac og Linux.',
    description: 'Søg i de kommandoer en IT-supporter bruger mest – netværk, printer, reparation, systeminfo og diske – med en forklaring på dansk og en kopiér-knap.',
    icon: 'terminal', hue: 'var(--hue-commands)', route: '#/apps/commands', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'night', focusX: 0.6, tint: '#a3e635' }, page: () => import('../pages/commands.js'),
    keywords: ['kommando', 'cmd', 'powershell', 'terminal', 'ipconfig', 'ping', 'sfc', 'dism', 'netværk', 'support'],
  },
  {
    id: 'checklists', name: 'Tjeklister', tagline: 'Glem ingenting ude hos kunden.',
    description: 'Færdige tjeklister til ny computer, printerinstallation, kundebesøg, backup, Wi-Fi og nye medarbejdere. Kryds af, skriv noter, og gem dine egne skabeloner.',
    icon: 'list', hue: 'var(--hue-checklists)', route: '#/apps/checklists', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#2dd4bf' }, page: () => import('../pages/checklists.js'),
    keywords: ['tjekliste', 'checkliste', 'kundebesøg', 'ny computer', 'opsætning', 'backup', 'skabelon'],
  },
  {
    id: 'budget', name: 'Budget', tagline: 'Styr på pengene.',
    description: 'Indtægter og udgifter pr. måned, hvad pengene går til, og hvad der er tilbage. Faste poster kopieres til næste måned med ét klik.',
    icon: 'chart', hue: 'var(--hue-budget)', route: '#/apps/budget', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.45, tint: '#10b981' }, page: () => import('../pages/budget.js'),
    keywords: ['budget', 'penge', 'økonomi', 'udgifter', 'indtægter', 'løn', 'opsparing'],
  },
  {
    id: 'qa', name: 'Spørg og svar', tagline: 'Få hjælp til lektier og IT.',
    description: 'Stil et spørgsmål om lektier, computere eller hvad som helst – alle på HUBTECH kan svare. Stem de bedste svar op, og marker det svar, der løste det.',
    icon: 'help', hue: 'var(--hue-qa)', route: '#/apps/qa', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.5, tint: '#34d399' }, page: () => import('../pages/qa.js'),
    keywords: ['spørgsmål', 'svar', 'lektier', 'lektiehjælp', 'hjælp', 'matematik', 'spørg', 'forum', 'it-hjælp'],
  },
  {
    id: 'polls', name: 'Afstemninger', tagline: 'Spørg alle – se svarene live.',
    description: 'Lav en afstemning på få sekunder. Del den med venner, klassen eller alle på HUBTECH, og se resultatet komme ind live. Kan være hemmelig, og man kan vælge flere.',
    icon: 'chart', hue: 'var(--hue-polls)', route: '#/apps/polls', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#38bdf8' }, page: () => import('../pages/polls.js'),
    keywords: ['afstemning', 'stemme', 'poll', 'valg', 'spørgsmål', 'hvad synes du', 'afstem'],
  },
  {
    id: 'forms', name: 'Formularer', tagline: 'Tilmeldinger og spørgeskemaer.',
    description: 'Byg en formular med tekst, valg, skala, tal og datoer. Del linket – man behøver ikke en konto for at svare – og se svarene som grafer eller hent dem til Excel.',
    icon: 'list', hue: 'var(--hue-forms)', route: '#/apps/forms', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#a78bfa' }, page: () => import('../pages/forms.js'),
    keywords: ['formular', 'spørgeskema', 'tilmelding', 'survey', 'feedback', 'undersøgelse', 'excel', 'svar'],
  },
  {
    id: 'expenses', name: 'Fællesudgifter', tagline: 'Hvem skylder hvem?',
    description: 'Skriv hvem der betalte hvad på turen, i bofællesskabet eller til festen. HUBTECH regner ud, hvem der skal betale hvem – med færrest mulige overførsler.',
    icon: 'wallet', hue: 'var(--hue-expenses)', route: '#/apps/expenses', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#4ade80' }, page: () => import('../pages/expenses.js'),
    keywords: ['udgifter', 'fællesudgifter', 'dele regningen', 'skylder', 'penge', 'tur', 'bofællesskab', 'regnskab', 'afregning'],
  },
  {
    id: 'wiki', name: 'Wiki', tagline: 'En fælles notesbog.',
    description: 'Sider der linker til hinanden, som alle inviterede kan skrive i: klassens noter, klubbens regler eller guides til jeres spil. Hver side husker sine seneste ti versioner.',
    icon: 'book', hue: 'var(--hue-wiki)', route: '#/apps/wiki', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.5, tint: '#60a5fa' }, page: () => import('../pages/wiki.js'),
    keywords: ['wiki', 'noter', 'notesbog', 'sider', 'vidensbase', 'guide', 'regler', 'fælles noter', 'opslagsværk'],
  },
  {
    id: 'booking', name: 'Booking', tagline: 'Lad andre booke en tid hos dig.',
    description: 'Lav en bookingside til lektiehjælp, frisør, computerhjælp eller samtaler. Du vælger dage og tider – andre vælger en ledig tid via et link uden at skulle have en konto.',
    icon: 'calendar', hue: 'var(--hue-booking)', route: '#/apps/booking', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#2dd4bf' }, page: () => import('../pages/booking.js'),
    keywords: ['booking', 'book en tid', 'tidsbestilling', 'aftaler', 'kalender', 'lektiehjælp', 'frisør', 'reservation'],
  },
  {
    id: 'pages', name: 'Sidebygger', tagline: 'Din egen lille hjemmeside.',
    description: 'Byg en side med billede, tekst, links, galleri og gæstebog – med færdige temaer. Del den med et link, som alle kan åbne.',
    icon: 'globe', hue: 'var(--hue-pages)', route: '#/apps/pages', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.5, tint: '#c084fc' }, page: () => import('../pages/pages-builder.js'),
    keywords: ['hjemmeside', 'side', 'profil', 'links', 'link i bio', 'gæstebog', 'website', 'portfolio'],
  },
  {
    id: 'board', name: 'Tavlen', tagline: 'Gule sedler – sammen og live.',
    description: 'En fælles tavle med sedler til brainstorm, evaluering, fordele og ulemper eller ugeplan. Alle kan skrive, flytte og stemme på samme tid.',
    icon: 'grid', hue: 'var(--hue-board)', route: '#/apps/board', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#facc15' }, page: () => import('../pages/board.js'),
    keywords: ['tavle', 'whiteboard', 'sedler', 'post-it', 'brainstorm', 'evaluering', 'gruppearbejde', 'retro', 'idéer'],
  },
  {
    id: 'codelab', name: 'Kodeudfordringer', tagline: 'Lær at kode med små opgaver.',
    description: '31 JavaScript-opgaver fra let til svær. Din kode testes med det samme i en lukket sandkasse, og point giver plads på toplisten.',
    icon: 'code', hue: 'var(--hue-codelab)', route: '#/apps/codelab', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#4ade80' }, page: () => import('../pages/codelab.js'),
    keywords: ['kode', 'programmering', 'javascript', 'opgaver', 'lære at kode', 'udfordring', 'algoritme', 'topliste'],
  },
  {
    id: 'journal', name: 'Dagbog', tagline: 'Et par linjer og dit humør.',
    description: 'Skriv et par linjer om dagen, vælg dit humør og tre gode ting. Kalender i humørfarver, stime og søgning. Kun du kan se den.',
    icon: 'book', hue: 'var(--hue-journal)', route: '#/apps/journal', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#a78bfa' }, page: () => import('../pages/journal.js'),
    keywords: ['dagbog', 'journal', 'humør', 'skrive', 'taknemmelighed', 'tanker', 'privat'],
  },
  {
    id: 'timers', name: 'Stopur', tagline: 'Stopur og flere æggeure.',
    description: 'Stopur med omgange og så mange nedtællinger du vil på én gang – æg, pasta, pauser eller lektier. De ringer, også når du er på en anden side i HUBTECH.',
    icon: 'clock', hue: 'var(--hue-timers)', route: '#/apps/timers', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#fbbf24' }, page: () => import('../pages/timers.js'),
    keywords: ['stopur', 'æggeur', 'timer', 'nedtælling', 'tid', 'køkkenur', 'omgang'],
  },
  {
    id: 'ciphers', name: 'Hemmelige koder', tagline: 'Cæsar, morse, binær og flere.',
    description: 'Skriv og afkod hemmelige beskeder med Cæsar, morse, binær, tal, Atbash og baglæns. Knæk Cæsar-koder automatisk, hør morse som bip og løs kodeopgaver.',
    icon: 'lock', hue: 'var(--hue-ciphers)', route: '#/apps/ciphers', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.5, tint: '#10b981' }, page: () => import('../pages/ciphers.js'),
    keywords: ['koder', 'hemmelige beskeder', 'morse', 'cæsar', 'kryptering', 'binær', 'gåder'],
  },
  {
    id: 'loans', name: 'Udlån', tagline: 'Hvem har din bog?',
    description: 'Hold styr på hvad du har lånt ud, og hvad du selv har lånt – med afleveringsdato og besked, når noget er for sent.',
    icon: 'share', hue: 'var(--hue-loans)', route: '#/apps/loans', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#38bdf8' }, page: () => import('../pages/home2.js').then(m => ({ default: m.loans })),
    keywords: ['udlån', 'lån', 'låne', 'bøger', 'værktøj', 'aflevering', 'huske'],
  },
  {
    id: 'units', name: 'Omregner', tagline: 'Omregn alle slags enheder.',
    description: 'Omregn længde, vægt, rumfang, areal, fart, tid, data og temperatur – også tommer, pund, spiseskefulde og tønder land.',
    icon: 'refresh', hue: 'var(--hue-units)', route: '#/apps/units', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.5, tint: '#06b6d4' }, page: () => import('../pages/learn3.js').then(m => ({ default: m.units })),
    keywords: ['omregner', 'enheder', 'omregning', 'meter', 'kilo', 'temperatur', 'konverter'],
  },
  {
    id: 'datepoll', name: 'Find en dato', tagline: 'Hvornår kan flest?',
    description: 'Foreslå nogle datoer, og lad alle krydse af, hvornår de kan – også uden konto via et link. Den bedste dato lyser op.',
    icon: 'calendar', hue: 'var(--hue-datepoll)', route: '#/apps/datepoll', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#6366f1' }, page: () => import('../pages/together2.js').then(m => ({ default: m.datepoll })),
    keywords: ['find en dato', 'dato', 'mødeplanlægning', 'afstemning', 'hvornår', 'aftale', 'fest'],
  },
  {
    id: 'savings', name: 'Opsparing', tagline: 'Renters rente på en opsparing.',
    description: 'Se hvad der sker, når man sparer op hver måned – og hvordan renter på renter får pengene til at vokse over tid.',
    icon: 'wallet', hue: 'var(--hue-savings)', route: '#/apps/savings', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#10b981' }, page: () => import('../pages/batch8.js').then(m => ({ default: m.savings })),
    keywords: ['opsparing', 'renter', 'renters rente', 'penge', 'spare op', 'økonomi'],
  },
  {
    id: 'numsys', name: 'Talsystemer', tagline: 'Binære tal og hex.',
    description: 'Forstå de binære tal og hex, som computere bruger: omregn, klik bittene til og fra, og øv dig.',
    icon: 'chip', hue: 'var(--hue-numsys)', route: '#/apps/numsys', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.5, tint: '#14b8a6' }, page: () => import('../pages/batch9.js').then(m => ({ default: m.numsys })),
    keywords: ['talsystemer', 'binær', 'binære tal', 'hex', 'bits', 'it', 'lær'],
  },
  {
    id: 'shortcuts', name: 'Genveje', tagline: 'Tastaturgenveje til Windows og Mac.',
    description: 'De vigtigste tastaturgenveje til Windows og Mac – med en øvelse, hvor du trykker dem selv.',
    icon: 'terminal', hue: 'var(--hue-shortcuts)', route: '#/apps/shortcuts', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#64748b' }, page: () => import('../pages/batch9.js').then(m => ({ default: m.shortcuts })),
    keywords: ['genveje', 'tastaturgenveje', 'ctrl', 'windows', 'mac', 'it', 'lær'],
  },
  {
    id: 'splitbill', name: 'Del regningen', tagline: 'Hvem skal betale hvad?',
    description: 'Del regningen ligeligt med drikkepenge og oprunding – eller regn ud, hvem der skylder hvem, når I har lagt forskelligt ud.',
    icon: 'wallet', hue: 'var(--hue-splitbill)', route: '#/apps/splitbill', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#16a34a' }, page: () => import('../pages/batch10.js').then(m => ({ default: m.splitbill })),
    keywords: ['del regningen', 'regning', 'drikkepenge', 'skylder', 'penge', 'restaurant'],
  },
  {
    id: 'writing', name: 'Skriveværksted', tagline: 'Skrivestartere, ordmål og tid.',
    description: 'Få en skrivestarter, sæt et ordmål og en tid, og skriv løs. Dine historier gemmes.',
    icon: 'edit', hue: 'var(--hue-writing)', route: '#/apps/writing', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#0ea5e9' }, page: () => import('../pages/batch10.js').then(m => ({ default: m.writing })),
    keywords: ['skrive', 'historie', 'stil', 'skrivestarter', 'dansk', 'kreativ'],
  },
  {
    id: 'dayplan', name: 'Dagens plan', tagline: 'Dagsskema med billeder.',
    description: 'Et dagsskema med billeder, så alle kan se, hvad der sker nu, og hvad der kommer bagefter.',
    icon: 'calendar', hue: 'var(--hue-dayplan)', route: '#/apps/dayplan', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.5, tint: '#0ea5e9' }, page: () => import('../pages/batch11.js').then(m => ({ default: m.dayplan })),
    keywords: ['dagens plan', 'skema', 'piktogrammer', 'børn', 'struktur', 'overblik'],
  },
  {
    id: 'texttools', name: 'Tekstværktøjer', tagline: 'Ordtælling og LIX.',
    description: 'Tæl ord, tegn og sætninger, find LIX-tallet (hvor svær teksten er), se de mest brugte ord – og ret store/små bogstaver, sortér linjer og ryd op.',
    icon: 'file', hue: 'var(--hue-texttools)', route: '#/apps/texttools', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#94a3b8' }, page: () => import('../pages/tools2.js').then(m => ({ default: m.textTools })),
    keywords: ['ordtælling', 'tegn', 'lix', 'tekst', 'store bogstaver', 'sorter', 'stil', 'opgave'],
  },
  {
    id: 'colors', name: 'Farver', tagline: 'Farvekoder, skemaer og kontrast.',
    description: 'Vælg farver og få HEX, RGB og HSL. Lav farveskemaer, gem dine farver og tjek om tekst kan læses på baggrunden (WCAG-kontrast).',
    icon: 'paint', hue: 'var(--hue-colors)', route: '#/apps/colors', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#c084fc' }, page: () => import('../pages/tools2.js').then(m => ({ default: m.colors })),
    keywords: ['farver', 'farvekode', 'hex', 'rgb', 'palette', 'kontrast', 'design', 'wcag'],
  },
  {
    id: 'piggy', name: 'Sparegris', tagline: 'Spar op til dine mål.',
    description: 'Sæt sparemål, sæt penge ind og se hvor mange uger der er til, du har råd. Grisen fyldes op, efterhånden som du sparer.',
    icon: 'wallet', hue: 'var(--hue-piggy)', route: '#/apps/piggy', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#f9a8d4' }, page: () => import('../pages/tools2.js').then(m => ({ default: m.piggy })),
    keywords: ['sparegris', 'spare', 'opsparing', 'lommepenge', 'sparemål', 'penge', 'budget'],
  },
  {
    id: 'worldclock', name: 'Verdensur', tagline: 'Klokken i hele verden.',
    description: 'Se klokken i byer over hele verden, og find et tidspunkt der passer alle – med en skyder, der viser hvem der sover.',
    icon: 'globe', hue: 'var(--hue-worldclock)', route: '#/apps/worldclock', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.5, tint: '#38bdf8' }, page: () => import('../pages/media2.js').then(m => ({ default: m.worldclock })),
    keywords: ['verdensur', 'tidszone', 'klokken', 'tid', 'ur', 'udlandet', 'mødetid'],
  },
  {
    id: 'tts', name: 'Læs op', tagline: 'Få tekst læst højt.',
    description: 'Få en tekst læst højt med en dansk stemme i dit eget tempo, med ordet der læses fremhævet. Godt til lektier, lange tekster og ordblinde.',
    icon: 'book', hue: 'var(--hue-tts)', route: '#/apps/tts', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#34d399' }, page: () => import('../pages/media2.js').then(m => ({ default: m.tts })),
    keywords: ['læs op', 'oplæsning', 'tale', 'stemme', 'ordblind', 'dysleksi', 'tekst til tale'],
  },
  {
    id: 'recorder', name: 'Optager', tagline: 'Optag lyd og stemme.',
    description: 'Optag stemme, musik eller noter fra timen med mikrofonen. Optagelserne gemmes på din enhed, og kan hentes som lydfil.',
    icon: 'music', hue: 'var(--hue-recorder)', route: '#/apps/recorder', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#f87171' }, page: () => import('../pages/media2.js').then(m => ({ default: m.recorder })),
    keywords: ['optager', 'optag', 'lyd', 'mikrofon', 'stemme', 'diktafon', 'podcast'],
  },
  {
    id: 'charts', name: 'Diagrammer', tagline: 'Søjler, linjer og lagkager.',
    description: 'Lav søjle-, linje- og lagkagediagrammer til opgaver og fremlæggelser. Skriv tallene eller indsæt fra et regneark, og hent diagrammet som billede.',
    icon: 'chart', hue: 'var(--hue-charts)', route: '#/apps/charts', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#22d3ee' }, page: () => import('../pages/media2.js').then(m => ({ default: m.charts })),
    keywords: ['diagram', 'graf', 'søjlediagram', 'lagkagediagram', 'statistik', 'opgave', 'fremlæggelse'],
  },

  {
    id: 'hwtest', name: 'Hardwaretest', tagline: 'Test tastatur, skærm, lyd og kamera.',
    description: 'Tjek alle taster, døde pixels, højttalere venstre/højre, mikrofon, kamera, mus og touch – og få en rapport, du kan kopiere eller gemme som servicenote.',
    icon: 'chip', hue: 'var(--hue-hwtest)', route: '#/apps/hwtest', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dawn', focusX: 0.5, tint: '#38bdf8' }, page: () => import('../pages/hwtest.js'),
    keywords: ['hardware', 'test', 'tastatur', 'skærm', 'døde pixels', 'højttaler', 'mikrofon', 'kamera', 'mus', 'touch', 'brugt computer'],
  },
  {
    id: 'calculator', name: 'Regnemaskine', tagline: 'Lommeregner, omregner, moms og lån.',
    description: 'Lommeregner med historik og videnskabelige funktioner, omregning af længde, vægt, rumfang, temperatur og mere, moms og procent, og hvad et lån eller en opsparing koster og giver.',
    icon: 'calculator', hue: 'var(--hue-calculator)', route: '#/apps/calculator', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.4, tint: '#38bdf8' }, page: () => import('../pages/calculator.js'),
    keywords: ['lommeregner', 'regne', 'beregner', 'omregner', 'enheder', 'moms', 'procent', 'rabat', 'lån', 'rente', 'opsparing', 'temperatur'],
  },
  {
    id: 'netcalc', name: 'Netværksberegner', tagline: 'Subnet, downloadtid og bytes.',
    description: 'Regn subnet ud (netværk, maske, første og sidste adresse, broadcast), tjek om to enheder er på samme net, del et net op, og se hvor lang tid en download tager.',
    icon: 'globe', hue: 'var(--hue-netcalc)', route: '#/apps/netcalc', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'night', focusX: 0.45, tint: '#34d399' }, page: () => import('../pages/netcalc.js'),
    keywords: ['ip', 'subnet', 'netmaske', 'cidr', 'netværk', 'router', 'download', 'mbit', 'byte', 'gigabyte', 'beregner'],
  },
  {
    id: 'passwords', name: 'Kodeord', tagline: 'Stærke koder, du kan huske.',
    description: 'Lav kodesætninger og tilfældige koder, se hvor længe en kode holder, og få gode råd til kunderne. Intet gemmes eller sendes.',
    icon: 'key', hue: 'var(--hue-passwords)', route: '#/apps/passwords', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#facc15' }, page: () => import('../pages/passwords.js'),
    keywords: ['kodeord', 'adgangskode', 'password', 'generator', 'sikkerhed', 'kodesætning', 'styrke'],
  },
  {
    id: 'qrtool', name: 'QR-koder', tagline: 'Wi-Fi, links og visitkort som QR.',
    description: 'Lav en QR-kode til Wi-Fi, et link, en kontakt, en e-mail, SMS eller et telefonnummer. Hent som billede, eller print et skilt.',
    icon: 'grid', hue: 'var(--hue-qrtool)', route: '#/apps/qrtool', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.5, tint: '#0ea5e9' }, page: () => import('../pages/qrtool.js'),
    keywords: ['qr', 'qr-kode', 'wifi', 'wi-fi', 'gæstenet', 'visitkort', 'link', 'skilt', 'print'],
  },
  {
    id: 'replies', name: 'Svarskabeloner', tagline: 'Færdige svar til kunder.',
    description: 'Skabeloner til modtaget sag, tilbud, løst sag, besøg, phishing-advarsel og meget mere. Udfyld felterne, og kopiér – eller lav dine egne.',
    icon: 'reply', hue: 'var(--hue-replies)', route: '#/apps/replies', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#f472b6' }, page: () => import('../pages/replies.js'),
    keywords: ['skabelon', 'svar', 'mail', 'kunde', 'tilbud', 'kundeservice', 'tekst'],
  },
  {
    id: 'phishing', name: 'Phishing-træner', tagline: 'Spot svindel i mails og SMS.',
    description: 'Se på e-mails og SMS’er, og afgør om de er falske eller ægte. Lær advarselstegnene – og lær kunderne dem.',
    icon: 'shield', hue: 'var(--hue-phishing)', route: '#/learn/phishing', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'night', focusX: 0.5, tint: '#f87171' }, page: () => import('../pages/phishing.js'),
    keywords: ['phishing', 'svindel', 'sikkerhed', 'mail', 'sms', 'falsk', 'træning'],
  },
  {
    id: 'owner', name: 'Ejer', tagline: 'Det, kun ejeren bestemmer over.',
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
    id: 'settings', name: 'Indstillinger', tagline: 'Profil, udseende og notifikationer',
    description: 'Din profil, sikkerhed, udseende, årstider og vejr samt notifikationer. Ejeren finder også integrationer og brugere her.',
    icon: 'settings', hue: 'var(--hue-settings)', route: '#/settings', category: 'system', status: 'available',
    art: { season: 'winter', time: 'dawn', focusX: 0.5 }, page: () => import('../pages/settings.js'),
    keywords: ['profil', 'adgangskode', 'tema', 'årstid', 'baggrund'],
  },
  {
    id: 'next', name: 'Næste modul', tagline: 'Plads til din næste idé',
    description: 'Nye apps tilføjes med én registrering i app-registret. Se guiden “Tilføj en ny app”.',
    icon: 'rocket', hue: 'var(--accent)', route: '#/learn/guide/add-app', category: 'system', status: 'coming', requires: { owner: true },
    art: { season: 'spring', time: 'dawn', focusX: 0.3 },
    keywords: ['ny app', 'udvid', 'modul'],
  },
  {
    id: 'chess', name: 'Skak', tagline: 'Mod computeren eller en ven.',
    description: 'Skak med alle regler: rokade, en passant, bondeforvandling, pat og remis. Lær skak med Gnist, spil mod 16 bots fra helt ny begynder til stormester, få din egen rating og rang, spil to på samme skærm eller online – og se andres partier.',
    icon: 'crown', hue: 'var(--hue-chess)', route: '#/apps/chess', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.55, tint: '#a3a3a3' }, page: () => import('../pages/chess.js'),
    keywords: ['spil', 'skak', 'chess', 'brætspil', 'konge', 'dronning', 'online', 'computer', 'bot', 'rating', 'elo', 'rang', 'rangliste', 'sværhedsgrad'],
  },
  {
    id: 'checkers', name: 'Dam', tagline: 'Klassisk dam på 8×8.',
    description: 'Tvunget slag, flere hop i træk og flyvende damer. Spil mod computeren i tre niveauer, mod en ven ved samme skærm eller online.',
    icon: 'grid', hue: 'var(--hue-checkers)', route: '#/apps/checkers', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#a16207' }, page: () => import('../pages/checkers.js'),
    keywords: ['dam', 'damspil', 'brætspil', 'checkers', 'strategi', 'spil', 'online'],
  },
  {
    id: 'connect4', name: 'Fire på stribe', tagline: 'Få fire i træk.',
    description: 'Spil mod computeren i tre sværhedsgrader, mod en ven på samme skærm – eller online mod de andre, der har HUBTECH.',
    icon: 'apps', hue: 'var(--hue-boards)', route: '#/apps/connect4', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/connect4.js'),
    keywords: ['spil', 'fire på stribe', 'connect four', 'to spillere', 'sjov'],
  },
  {
    id: 'reversi', name: 'Vend', tagline: 'Omring og vend brikkerne.',
    description: 'Læg dine brikker, så de omringer modstanderens – så vender de. Flest brikker til sidst vinder. Mod en klog computer, ved samme skærm eller online.',
    icon: 'refresh', hue: 'var(--hue-reversi)', route: '#/apps/reversi', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#22c55e' }, page: () => import('../pages/reversi.js'),
    keywords: ['vend', 'reversi', 'othello', 'brikker', 'brætspil', 'strategi', 'online'],
  },
  {
    id: 'kalaha', name: 'Kalaha', tagline: 'Så sten og fyld din kalaha.',
    description: 'Det gamle stenspil med seks huller hver: så stenene rundt, fang modstanderens og få en tur mere i din kalaha. Mod computeren, ved samme skærm eller online.',
    icon: 'cube', hue: 'var(--hue-kalaha)', route: '#/apps/kalaha', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#f59e0b' }, page: () => import('../pages/kalaha.js'),
    keywords: ['kalaha', 'mancala', 'sten', 'brætspil', 'spil', 'online'],
  },
  {
    id: 'mill', name: 'Mølle', tagline: 'Tre på stribe tager en brik.',
    description: 'Placér ni brikker, flyt dem langs stregerne og lav møller. Hver mølle tager en af modstanderens brikker. Mod computeren, ved samme skærm eller online.',
    icon: 'target', hue: 'var(--hue-mill)', route: '#/apps/mill', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#a8a29e' }, page: () => import('../pages/mill.js'),
    keywords: ['mølle', 'møllespil', 'nine mens morris', 'brætspil', 'strategi', 'online'],
  },
  {
    id: 'sudoku', name: 'Sudoku', tagline: 'Tal fra 1 til 9.',
    description: 'Klassisk sudoku i tre sværhedsgrader med noter, hint og tjek. Spillet gemmes, så du kan fortsætte på telefonen.',
    icon: 'hash', hue: 'var(--hue-games)', route: '#/apps/sudoku', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'dusk', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/sudoku.js'),
    keywords: ['spil', 'sudoku', 'tal', 'logik', 'puslespil', 'sjov'],
  },
];

export const appById = (id) => APPS.find(a => a.id === id);
/** Learning apps live inside Guides & Læring (#/learn/<id>) instead of the app launcher and sidebar. */
export const isLearnApp = (a) => !!a && a.category === 'learning' && a.id !== 'learning';
const LEARN_ORDER = ['labs', 'linux', 'codepad', 'codeschool', 'snippets', 'flashcards', 'quiz', 'phishing', 'glossary', 'typing', 'bits', 'electro', 'toolkit'];
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
  { id: 'service', name: 'Kunder og drift', tagline: 'Kunder, fakturaer, lager og tidsregistrering.', icon: 'tool', hue: 'var(--hue-service)', members: ['customers', 'inventory', 'timesheet'] },
  { id: 'support', name: 'IT-support', tagline: 'Printer-doktor, netværk, hardwaretest, kommandoer, kodeord, genveje og svar.', icon: 'printer', hue: 'var(--hue-printer)', members: ['printerdoctor', 'netcalc', 'hwtest', 'commands', 'checklists', 'passwords', 'qrtool', 'replies', 'shortcuts', 'numsys', 'ciphers'] },
  { id: 'money', name: 'Økonomi', tagline: 'Budget, opsparing, sparegris, fællesudgifter, del regningen og udlån.', icon: 'wallet', hue: 'var(--hue-budget, #16a34a)', members: ['budget', 'savings', 'piggy', 'expenses', 'splitbill', 'loans'] },
  { id: 'plan', name: 'Planlæg', tagline: 'Kalender, opgaver, dagens plan, booking, find en dato, fokus og ure.', icon: 'calendar', hue: 'var(--hue-calendar)', members: ['calendar', 'tasks', 'dayplan', 'booking', 'datepoll', 'focus', 'timers', 'worldclock'] },
  { id: 'office', name: 'HUBTECH Office', icon: 'hubtech', hue: 'var(--hue-hubtech)', tagline: 'Dokumenter, regneark, præsentationer, noter, wiki, logbog, diagrammer og formularer.', members: ['hubtech', 'notes', 'wiki', 'journal', 'writing', 'texttools', 'charts', 'forms', 'pages'] },
  { id: 'team', name: 'Team', tagline: 'Afstemninger, spørg og svar og tavlen – når I er flere om et projekt.', icon: 'users', hue: 'var(--hue-wall)', members: ['projects', 'polls', 'qa', 'board'] },
  { id: 'dev', name: 'Udvikling', tagline: 'App-værksted, kodeudfordringer, Cursor-projekter, ByteForge, Minecraft-server og ARCHIVE-01.', icon: 'code', hue: 'var(--hue-studio)', members: ['studio', 'codelab', 'cursor', 'byteforge', 'minecraft', 'archive-01'] },
  { id: 'pause', name: 'Pauserum', tagline: 'Skak, dam, fire på stribe og sudoku – en pause, hvor hjernen stadig arbejder. Spil mod computeren eller en kollega.', icon: 'crown', hue: 'var(--hue-chess)', members: ['chess', 'checkers', 'connect4', 'reversi', 'kalaha', 'mill', 'sudoku'] },
  { id: 'tools2', name: 'Værktøjer', tagline: 'Regnemaskine, omregner, farver, tekst, læs op og optager.', icon: 'tool', hue: 'var(--hue-texttools)', members: ['calculator', 'units', 'colors', 'tts', 'recorder'] },
];
export const suiteOf = (id) => SUITES.find(s => s.members.includes(id)) || null;
/** The app as it is shown in menus: a group's first member carries the group's name; the others are hidden there. */
export function entryApp(app) {
  if (!app) return null;
  const s = suiteOf(app.id);
  if (!s) return app;
  const lead = appById(s.members[0]);
  return { ...lead, name: s.name, tagline: s.tagline || lead.tagline, icon: s.icon || lead.icon, hue: s.hue || lead.hue, suite: s.id,
    description: `${s.tagline} Find dem alle under Alle apps → Emner: ${s.members.map(id => appById(id)?.name).join(', ')}.`,
    keywords: s.members.flatMap(id => [appById(id)?.name.toLowerCase(), ...(appById(id)?.keywords || [])]) };
}
/** Unique menu entries for a list of app ids (pinned apps). */
export const entryApps = (ids) => [...new Map(ids.map(appById).filter(Boolean).map(entryApp).map(a => [a.id, a])).values()];
